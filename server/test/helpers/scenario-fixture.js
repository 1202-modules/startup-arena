import { resolve, sep } from "node:path";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { ensureCurrentEvent } from "../../dist/events/event-store.js";

export function pinScenarioInTemporaryDatabase(database, scenarioId) {
  const mainDatabase = database.pragma("database_list").find((entry) => entry.name === "main");
  const temporaryRoot = `${realpathSync(tmpdir())}${sep}`;
  const databasePath = mainDatabase?.file ? realpathSync(mainDatabase.file) : "";
  if (!databasePath.startsWith(temporaryRoot)) {
    throw new Error("Scenario fixtures may only modify file-backed databases inside the system temporary directory.");
  }

  const event = ensureCurrentEvent(database);
  if (event.status !== "OPEN") throw new Error("Scenario fixtures require an open event.");
  database.prepare("UPDATE events SET scenario_id = ? WHERE id = ? AND status = 'OPEN'").run(scenarioId, event.id);
  return event.id;
}
