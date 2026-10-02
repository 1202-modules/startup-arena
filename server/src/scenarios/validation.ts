import { STARTUP_IDS, type LocalizedText, type ScenarioId } from "@startup-game/shared";
import type { MarketScenario } from "./types.js";

const VALID_SCENARIO_IDS: readonly ScenarioId[] = ["scenario-01", "scenario-02", "scenario-03", "scenario-04", "scenario-05", "scenario-06"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertLocalizedText(value: unknown, path: string): asserts value is LocalizedText {
  if (!isRecord(value)) throw new Error(`${path} must contain localized RU and EN strings.`);
  for (const language of ["ru", "en"] as const) {
    if (typeof value[language] !== "string" || value[language].trim().length === 0) {
      throw new Error(`${path}.${language} must be a non-empty string.`);
    }
  }
}

function assertPositiveInteger(value: unknown, path: string, minimum = 1): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${path} must be a positive safe integer.`);
  }
}

export function validateScenario(value: unknown): asserts value is MarketScenario {
  if (!isRecord(value)) throw new Error("Scenario must be an object.");
  if (typeof value.id !== "string" || !VALID_SCENARIO_IDS.includes(value.id as ScenarioId)) {
    throw new Error("Scenario ID is not in the supported catalog.");
  }
  const scenarioId = value.id;
  assertLocalizedText(value.title, `${scenarioId}.title`);

  if (!Array.isArray(value.rounds) || value.rounds.length !== 3) {
    throw new Error(`${scenarioId} must define exactly 3 rounds.`);
  }

  value.rounds.forEach((round, roundIndex) => {
    const roundPath = `${scenarioId}.rounds[${roundIndex + 1}]`;
    if (!isRecord(round) || !isRecord(round.companies)) {
      throw new Error(`${roundPath}.companies must be a company record.`);
    }

    const keys = Object.keys(round.companies).sort();
    const expectedKeys = [...STARTUP_IDS].sort();
    if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
      throw new Error(`${roundPath} must contain each fixed startup exactly once.`);
    }

    for (const startupId of STARTUP_IDS) {
      const companyPath = `${roundPath}.companies.${startupId}`;
      const company = round.companies[startupId];
      if (!isRecord(company) || !isRecord(company.metrics) || !isRecord(company.outcome)) {
        throw new Error(`${companyPath} must contain metrics, signal, and outcome.`);
      }

      assertPositiveInteger(company.metrics.revenueThousandsUsd, `${companyPath}.metrics.revenueThousandsUsd`);
      assertPositiveInteger(company.metrics.customers, `${companyPath}.metrics.customers`);
      assertPositiveInteger(company.metrics.expensesThousandsUsd, `${companyPath}.metrics.expensesThousandsUsd`);
      assertPositiveInteger(company.metrics.cashReserveThousandsUsd, `${companyPath}.metrics.cashReserveThousandsUsd`, 0);
      assertLocalizedText(company.signal, `${companyPath}.signal`);

      if (
        typeof company.outcome.returnBps !== "number" ||
        !Number.isSafeInteger(company.outcome.returnBps) ||
        company.outcome.returnBps < -10_000
      ) {
        throw new Error(`${companyPath}.outcome.returnBps must be an integer greater than or equal to -10000.`);
      }
      assertLocalizedText(company.outcome.event, `${companyPath}.outcome.event`);
    }
  });
}
