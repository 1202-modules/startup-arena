import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { STARTUP_IDS, LEGACY_STARTUP_IDS } from "@startup-game/shared";
import { getScenarioDefinition, listScenarioIds } from "../dist/scenarios/catalog.js";
import { projectDecisionMarket, projectRoundReveal } from "../dist/scenarios/projections.js";
import { simulateScenario, simulateAllScenarios } from "../dist/scenarios/simulations.js";
import { validateScenario } from "../dist/scenarios/validation.js";

const EXPECTED_RETURNS = {
  "scenario-01": [
    [1400, 700, -800, 500],
    [2100, 600, 2400, 700],
    [-3900, 800, -1500, 1100],
  ],
  "scenario-02": [
    [1100, 600, -500, 400],
    [1700, 700, 1900, 600],
    [1400, 800, -4700, 1700],
  ],
  "scenario-03": [
    [1300, 500, -700, 600],
    [1800, 700, 2000, 900],
    [700, 2100, -1200, -3300],
  ],
};

test("legacy markets preserve their original documented returns", () => {
  for (const scenarioId of Object.keys(EXPECTED_RETURNS)) {
    const scenario = getScenarioDefinition(scenarioId, 1);
    scenario.rounds.forEach((round, index) => assert.deepEqual(LEGACY_STARTUP_IDS.map(id => round.companies[id].outcome.returnBps), EXPECTED_RETURNS[scenarioId][index]));
  }
});

test("six generated markets contain 108 localized, formula-derived company outcomes", () => {
  assert.equal(listScenarioIds().length, 6);
  for (const scenarioId of listScenarioIds()) {
    const scenario = getScenarioDefinition(scenarioId);
    validateScenario(scenario);
    assert.equal(scenario.rounds.length, 3);
    assert.ok(scenario.definition);
    for (const round of scenario.rounds) {
      assert.deepEqual(Object.keys(round.companies).sort(), [...STARTUP_IDS].sort());
      for (const company of Object.values(round.companies)) {
        for (const locale of ["ru", "en"]) {
          assert.ok(company.signal[locale].trim());
          assert.ok(company.outcome.event[locale].trim());
          assert.ok(company.outcome.explanation[locale].trim());
        }
      }
    }
  }
});

test("validation rejects missing companies, incomplete localization, and returns below total loss", () => {
  const missingCompany = structuredClone(getScenarioDefinition("scenario-01"));
  delete missingCompany.rounds[0].companies.VoltX;
  assert.throws(() => validateScenario(missingCompany), /each fixed startup exactly once/);

  const missingEnglish = structuredClone(getScenarioDefinition("scenario-02"));
  missingEnglish.rounds[1].companies.MedFlow.signal.en = "  ";
  assert.throws(() => validateScenario(missingEnglish), /signal.en must be a non-empty string/);

  const invalidReturn = structuredClone(getScenarioDefinition("scenario-03"));
  invalidReturn.rounds[2].companies.GreenBox.outcome.returnBps = -10_001;
  assert.throws(() => validateScenario(invalidReturn), /greater than or equal to -10000/);
});

test("public projections exclude future state, shocks and outcomes at every step", () => {
  for (const scenarioId of listScenarioIds()) {
    const scenario = getScenarioDefinition(scenarioId);
    for (let roundNo = 1; roundNo <= 3; roundNo++) {
      const decision = projectDecisionMarket(scenarioId, roundNo);
      assert.equal(decision.companies.length, 6);
      const encoded = JSON.stringify(decision);
      assert.doesNotMatch(encoded, /scenario-0|customerGrowthBps|multipleBps|definition|arpuCents|capexCents/);
      for (const company of decision.companies) {
        assert.equal(company.financialHistory.length, 4 + roundNo);
        assert.ok(company.financialHistory.every(p => p.period <= roundNo - 1));
        assert.ok(!Object.hasOwn(company, "outcome") && !Object.hasOwn(company, "state"));
        assert.equal(decision.history[company.startupId].length, roundNo - 1);
        for (let future = roundNo - 1; future < 3; future++) {
          assert.equal(encoded.includes(scenario.rounds[future].companies[company.startupId].outcome.event.en), false);
        }
      }
      const reveal = projectRoundReveal(scenarioId, roundNo);
      assert.equal(reveal.companies.length, 6);
      for (const company of reveal.companies) {
        assert.equal(company.returnBps, scenario.rounds[roundNo - 1].companies[company.startupId].outcome.returnBps);
        assert.ok(!Object.hasOwn(company, "metrics") && !Object.hasOwn(company, "state"));
      }
    }
  }
  assert.throws(() => projectRoundReveal("scenario-02", 4), /Round number/);
});

test("integer-cent balance simulations are deterministic and no fixed company wins every market", () => {
  const scenarioIds = listScenarioIds();
  const simulations = simulateAllScenarios(scenarioIds);
  const simpleStrategies = [
    "allInNovaMind",
    "allInMedFlow",
    "allInVoltX",
    "allInGreenBox",
    "allInAgroPulse",
    "allInOrbitLink",
    "equalSplit",
    "cashOnly",
    "previousRoundWinner",
    "conservativeMedFlow",
  ];
  const simpleWinners = new Set();

  for (const scenarioId of scenarioIds) {
    const results = simulations[scenarioId];
    assert.deepEqual(results, simulateScenario(scenarioId));
    assert.ok(Object.values(results).every((capital) => Number.isSafeInteger(capital) && capital >= 0));
    assert.ok(results.perfectInformation >= Math.max(...Object.values(results)));
    const winner = simpleStrategies.reduce((best, strategy) => results[strategy] > results[best] ? strategy : best, simpleStrategies[0]);
    simpleWinners.add(winner);
  }

  assert.ok(simpleWinners.size >= 2, "the top simple strategy should differ across scenarios");
});

test("client production assets contain no server scenario data", { skip: !existsSync(fileURLToPath(new URL("../../client/dist/assets", import.meta.url))) }, () => {
  const assetDirectory = fileURLToPath(new URL("../../client/dist/assets", import.meta.url));
  const bundle = readdirSync(assetDirectory)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(resolve(assetDirectory, name), "utf8"))
    .join("\n");

  // DTO field names such as returnBps may appear in client code; the guarded data are scenario IDs and private server text.
  for (const secretMarker of [
    "scenario-01",
    "scenario-02",
    "scenario-03", "scenario-04", "scenario-05", "scenario-06",
    "customerGrowthBps", "maintenanceCapexBps", "The cost of reaching orbit",
    "NovaMind overheats",
    "The VoltX setback",
    "GreenBox under pressure",
    "A key component fails a repeat quality check.",
  ]) {
    assert.equal(bundle.includes(secretMarker), false, `client bundle contains private marker: ${secretMarker}`);
  }
});
