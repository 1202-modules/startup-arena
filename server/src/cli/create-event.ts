import { config } from "../config.js";
import { openDatabase } from "../db/database.js";
import { createNextEvent } from "../events/event-store.js";

const database = openDatabase(config.databasePath);
try {
  const event = createNextEvent(database);
  console.log(`[event] created next event ${event.id}`);
} catch (error) {
  const message = error instanceof Error ? error.message : "Could not create a new event.";
  console.error(`[event] ${message}`);
  process.exitCode = 1;
} finally {
  database.close();
}
