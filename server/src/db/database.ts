import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "./migrations.js";

export function openDatabase(path: string): Database.Database {
  const databasePath = path === ":memory:" ? path : resolve(path);
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

  const database = new Database(databasePath, { timeout: 5_000 });
  try {
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    if (databasePath !== ":memory:") database.pragma("journal_mode = WAL");
    applyMigrations(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
