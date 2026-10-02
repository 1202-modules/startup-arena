import {
  STARTUP_IDS,
  type DecisionMarketResponse,
  type BusinessHistoryPoint,
  type MarketHistoryPoint,
  type MarketMetrics,
  type RoundNumber,
  type RoundRevealResponse,
  type ScenarioId,
} from "@startup-game/shared";
import { getScenarioDefinition } from "./catalog.js";
import type { RawCompanyMetrics } from "./types.js";

const START_VALUE_BPS = 10_000;

function assertRoundNumber(roundNo: number): asserts roundNo is RoundNumber {
  if (roundNo !== 1 && roundNo !== 2 && roundNo !== 3) {
    throw new RangeError("Round number must be 1, 2, or 3.");
  }
}

function changeBps(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;

  const difference = BigInt(current) - BigInt(previous);
  const denominator = BigInt(previous);
  const absoluteDifference = difference < 0n ? -difference : difference;
  const rounded = (absoluteDifference * 10_000n + denominator / 2n) / denominator;
  const signed = difference < 0n ? -rounded : rounded;
  const result = Number(signed);
  if (!Number.isSafeInteger(result)) throw new RangeError("Derived metric change is outside the safe integer range.");
  return result;
}

function projectMetrics(current: RawCompanyMetrics, previous: RawCompanyMetrics | undefined, financialHistory?: BusinessHistoryPoint[]): MarketMetrics {
  const latest = financialHistory?.at(-1); const preceding = financialHistory?.at(-2);
  return {
    revenueThousandsUsd: current.revenueThousandsUsd,
    revenueChangeBps: changeBps(latest?.revenueCents ?? current.revenueThousandsUsd, preceding?.revenueCents ?? previous?.revenueThousandsUsd),
    customers: current.customers,
    customersChangeBps: changeBps(current.customers, preceding?.customers ?? previous?.customers),
    expensesThousandsUsd: current.expensesThousandsUsd,
    expensesChangeBps: changeBps(latest?.expensesCents ?? current.expensesThousandsUsd, preceding?.expensesCents ?? previous?.expensesThousandsUsd),
    cashReserveThousandsUsd: current.cashReserveThousandsUsd,
    cashReserveChangeBps: changeBps(latest?.cashCents ?? current.cashReserveThousandsUsd, preceding?.cashCents ?? previous?.cashReserveThousandsUsd),
  };
}

function applyReturnToRelativeValue(relativeValueBps: number, returnBps: number): number {
  const numerator = BigInt(relativeValueBps) * (10_000n + BigInt(returnBps)) + 5_000n;
  const result = Number(numerator / 10_000n);
  if (!Number.isSafeInteger(result)) throw new RangeError("Derived history is outside the safe integer range.");
  return result;
}

function historyFor(scenarioId: ScenarioId, currentRound: RoundNumber, modelVersion: number): DecisionMarketResponse["history"] {
  const scenario = getScenarioDefinition(scenarioId, modelVersion);
  const history = Object.fromEntries(STARTUP_IDS.map(id => [id, []])) as unknown as DecisionMarketResponse["history"];

  for (const startupId of STARTUP_IDS) {
    if (!scenario.rounds[0].companies[startupId]) continue;
    let relativeValueBps = START_VALUE_BPS;
    for (let index = 0; index < currentRound - 1; index += 1) {
      const round = scenario.rounds[index]!;
      const returnBps = round.companies[startupId].outcome.returnBps;
      relativeValueBps = applyReturnToRelativeValue(relativeValueBps, returnBps);
      history[startupId].push({
        roundNo: (index + 1) as RoundNumber,
        returnBps,
        relativeValueBps,
      });
    }
  }

  return history;
}

export function projectDecisionMarket(scenarioId: ScenarioId, roundNo: RoundNumber, modelVersion = 2): DecisionMarketResponse {
  assertRoundNumber(roundNo);
  const scenario = getScenarioDefinition(scenarioId, modelVersion);
  const current = scenario.rounds[roundNo - 1]!;
  const previous = roundNo === 1 ? undefined : scenario.rounds[roundNo - 2]!;

  return {
    roundNo,
    companies: STARTUP_IDS.filter(id => current.companies[id]).map((startupId) => ({
      startupId,
      metrics: projectMetrics(
        current.companies[startupId].metrics,
        previous?.companies[startupId].metrics,
        current.companies[startupId].financialHistory,
      ),
      signal: current.companies[startupId].signal,
      analysis: current.companies[startupId].analysis ?? [],
      news: current.companies[startupId].news ?? [{ source: "company" as const, certainty: "plan" as const, text: current.companies[startupId].signal }],
      financialHistory: current.companies[startupId].financialHistory ?? [],
      marginBps: current.companies[startupId].marginBps ?? Math.round((current.companies[startupId].metrics.revenueThousandsUsd - current.companies[startupId].metrics.expensesThousandsUsd) * 10000 / current.companies[startupId].metrics.revenueThousandsUsd),
      operatingCashFlowCents: current.companies[startupId].operatingCashFlowCents ?? (current.companies[startupId].metrics.revenueThousandsUsd - current.companies[startupId].metrics.expensesThousandsUsd) * 300000,
      debtCents: current.companies[startupId].state?.debtCents ?? 0,
    })),
    history: historyFor(scenarioId, roundNo, modelVersion),
  };
}

export function projectRoundReveal(scenarioId: ScenarioId, roundNo: RoundNumber, modelVersion = 2): RoundRevealResponse {
  assertRoundNumber(roundNo);
  const round = getScenarioDefinition(scenarioId, modelVersion).rounds[roundNo - 1]!;
  return {
    roundNo,
    companies: STARTUP_IDS.filter(id => round.companies[id]).map((startupId) => ({
      startupId,
      returnBps: round.companies[startupId].outcome.returnBps,
      event: round.companies[startupId].outcome.event,
      explanation: round.companies[startupId].outcome.explanation,
    })),
  };
}
