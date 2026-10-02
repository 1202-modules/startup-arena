import { STARTUP_IDS, type ScenarioId, type StartupId } from "@startup-game/shared";
import { getScenarioDefinition } from "./catalog.js";

export type StrategyId =
  | "allInNovaMind"
  | "allInMedFlow"
  | "allInVoltX"
  | "allInGreenBox"
  | "allInAgroPulse"
  | "allInOrbitLink"
  | "equalSplit"
  | "cashOnly"
  | "previousRoundWinner"
  | "conservativeMedFlow"
  | "perfectInformation";

export type StrategyResults = Record<StrategyId, number>;

const STARTING_CAPITAL_CENTS = 100_000;

function applyReturn(amountCents: number, returnBps: number): number {
  const numerator = BigInt(amountCents) * (10_000n + BigInt(returnBps)) + 5_000n;
  const result = Number(numerator / 10_000n);
  if (!Number.isSafeInteger(result)) throw new RangeError("Simulation result is outside the safe integer range.");
  return result;
}

function allocateEqual(capitalCents: number): number[] {
  const base = Math.floor(capitalCents / STARTUP_IDS.length);
  const remainder = capitalCents - base * STARTUP_IDS.length;
  return STARTUP_IDS.map((_startupId, index) => base + (index < remainder ? 1 : 0));
}

function applyPortfolio(capitalCents: number, returns: Record<StartupId, number>, amounts: number[]): number {
  return STARTUP_IDS.reduce(
    (nextCapital, startupId, index) => nextCapital + applyReturn(amounts[index]!, returns[startupId]),
    capitalCents - amounts.reduce((sum, amount) => sum + amount, 0),
  );
}

function runAllIn(scenarioId: ScenarioId, startupId: StartupId): number {
  const scenario = getScenarioDefinition(scenarioId);
  return scenario.rounds.reduce(
    (capital, round) => applyReturn(capital, round.companies[startupId].outcome.returnBps),
    STARTING_CAPITAL_CENTS,
  );
}

function runEqualSplit(scenarioId: ScenarioId): number {
  const scenario = getScenarioDefinition(scenarioId);
  let capital = STARTING_CAPITAL_CENTS;
  for (const round of scenario.rounds) {
    const returns = Object.fromEntries(
      STARTUP_IDS.map((startupId) => [startupId, round.companies[startupId].outcome.returnBps]),
    ) as Record<StartupId, number>;
    capital = applyPortfolio(capital, returns, allocateEqual(capital));
  }
  return capital;
}

function runCashOnly(): number {
  return STARTING_CAPITAL_CENTS;
}

function runPreviousRoundWinner(scenarioId: ScenarioId): number {
  const scenario = getScenarioDefinition(scenarioId);
  let capital = STARTING_CAPITAL_CENTS;
  let previousWinner: StartupId | undefined;

  for (const round of scenario.rounds) {
    if (previousWinner) {
      capital = applyReturn(capital, round.companies[previousWinner].outcome.returnBps);
    } else {
      const returns = Object.fromEntries(
        STARTUP_IDS.map((startupId) => [startupId, round.companies[startupId].outcome.returnBps]),
      ) as Record<StartupId, number>;
      capital = applyPortfolio(capital, returns, allocateEqual(capital));
    }

    previousWinner = STARTUP_IDS.reduce((best, startupId) =>
      round.companies[startupId].outcome.returnBps > round.companies[best].outcome.returnBps ? startupId : best,
    STARTUP_IDS[0]);
  }
  return capital;
}

function runConservative(scenarioId: ScenarioId): number {
  const scenario = getScenarioDefinition(scenarioId);
  let capital = STARTING_CAPITAL_CENTS;

  for (const round of scenario.rounds) {
    const medFlowAmount = Number((BigInt(capital) * 7_000n) / 10_000n);
    capital = applyReturn(medFlowAmount, round.companies.MedFlow.outcome.returnBps) + (capital - medFlowAmount);
  }
  return capital;
}

function runPerfectInformation(scenarioId: ScenarioId): number {
  const scenario = getScenarioDefinition(scenarioId);
  return scenario.rounds.reduce((capital, round) => {
    const bestStartup = STARTUP_IDS.reduce((best, startupId) =>
      round.companies[startupId].outcome.returnBps > round.companies[best].outcome.returnBps ? startupId : best,
    STARTUP_IDS[0]);
    return applyReturn(capital, Math.max(0, round.companies[bestStartup].outcome.returnBps));
  }, STARTING_CAPITAL_CENTS);
}

export function simulateScenario(scenarioId: ScenarioId): StrategyResults {
  return {
    allInNovaMind: runAllIn(scenarioId, "NovaMind"),
    allInMedFlow: runAllIn(scenarioId, "MedFlow"),
    allInVoltX: runAllIn(scenarioId, "VoltX"),
    allInGreenBox: runAllIn(scenarioId, "GreenBox"),
    allInAgroPulse: runAllIn(scenarioId, "AgroPulse"),
    allInOrbitLink: runAllIn(scenarioId, "OrbitLink"),
    equalSplit: runEqualSplit(scenarioId),
    cashOnly: runCashOnly(),
    previousRoundWinner: runPreviousRoundWinner(scenarioId),
    conservativeMedFlow: runConservative(scenarioId),
    perfectInformation: runPerfectInformation(scenarioId),
  };
}

export function simulateAllScenarios(scenarioIds: readonly ScenarioId[]): Record<ScenarioId, StrategyResults> {
  return Object.fromEntries(scenarioIds.map((scenarioId) => [scenarioId, simulateScenario(scenarioId)])) as Record<
    ScenarioId,
    StrategyResults
  >;
}
