import { type ScenarioId } from "@startup-game/shared";
import { scenario01 } from "./scenario-01.js";
import { scenario02 } from "./scenario-02.js";
import { scenario03 } from "./scenario-03.js";
import type { MarketScenario } from "./types.js";
import { validateScenario } from "./validation.js";
import { generateScenarios } from "./generated.js";

export const SCENARIO_IDS: readonly ScenarioId[] = ["scenario-01", "scenario-02", "scenario-03", "scenario-04", "scenario-05", "scenario-06"];

const legacyById = new Map<ScenarioId, MarketScenario>([scenario01, scenario02, scenario03].map((s) => [s.id, { ...s, modelVersion: 1 } as unknown as MarketScenario]));
const scenarios: readonly MarketScenario[] = generateScenarios();
const scenarioById = new Map<ScenarioId, MarketScenario>();

for (const scenario of scenarios) {
  validateScenario(scenario);
  if (scenarioById.has(scenario.id)) throw new Error(`Duplicate scenario ID: ${scenario.id}`);
  scenarioById.set(scenario.id, scenario);
}

if (scenarioById.size !== SCENARIO_IDS.length || SCENARIO_IDS.some((id) => !scenarioById.has(id))) {
  throw new Error("Scenario catalog does not match the supported scenario IDs.");
}

export function getScenarioDefinition(id: ScenarioId, modelVersion = 2): MarketScenario {
  const scenario = modelVersion === 1 ? legacyById.get(id) : scenarioById.get(id);
  if (!scenario) throw new Error(`Unknown scenario ID: ${id}`);
  return scenario;
}

export function listScenarioIds(): ScenarioId[] {
  return [...SCENARIO_IDS];
}
