import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabase } from "../dist/db/database.js";
import { getScenarioDefinition, listScenarioIds } from "../dist/scenarios/catalog.js";
import { pinScenarioInTemporaryDatabase } from "./helpers/scenario-fixture.js";

test("test-only scenario fixture pins each market only in an isolated temporary file", () => {
  const directory = mkdtempSync(join(tmpdir(), "startup-invest-game-scenarios-"));
  try {
    for (const scenarioId of listScenarioIds()) {
      const database = openDatabase(join(directory, `${scenarioId}.sqlite`));
      try {
        const eventId = pinScenarioInTemporaryDatabase(database, scenarioId);
        const event = database.prepare("SELECT id, scenario_id FROM events").get();
        assert.equal(event.id, eventId);
        assert.equal(event.scenario_id, scenarioId);
        assert.equal(getScenarioDefinition(scenarioId).id, scenarioId);
      } finally {
        database.close();
      }
    }

    const memoryDatabase = openDatabase(":memory:");
    try {
      assert.throws(
        () => pinScenarioInTemporaryDatabase(memoryDatabase, "scenario-01"),
        /only modify file-backed databases inside the system temporary directory/,
      );
    } finally {
      memoryDatabase.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
