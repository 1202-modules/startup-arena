import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import Database from "better-sqlite3";
import { STARTUP_IDS } from "@startup-game/shared";
import { openDatabase } from "../dist/db/database.js";
import { applyMigrations } from "../dist/db/migrations.js";
import {
  createNextEvent,
  ensureCurrentEvent,
  EventCreationError,
  getPublicEvent,
} from "../dist/events/event-store.js";
import { createSession } from "../dist/sessions/session-store.js";

const stamp = "2026-09-29T10:00:00.000Z";

function insertParticipant(database, eventId, {
  name = "Тестовый игрок",
  status = "COMPLETED",
  capital = 100_000,
  finishedAt = stamp,
} = {}) {
  const participantId = randomUUID();
  const nameKey = name.normalize("NFKC").toLocaleLowerCase("ru-RU");
  database.prepare(`
    INSERT INTO participants (
      id, event_id, name, name_key, language, status, current_round,
      current_capital_cents, current_cash_cents, started_at, finished_at, final_capital_cents
    ) VALUES (?, ?, ?, ?, 'ru', ?, 3, ?, 0, ?, ?, ?)
  `).run(
    participantId,
    eventId,
    name,
    nameKey,
    status,
    capital,
    stamp,
    status === "COMPLETED" ? finishedAt : null,
    status === "COMPLETED" ? capital : null,
  );
  return participantId;
}

function setEventFinalized(database, eventId) {
  database.prepare("UPDATE events SET status = 'FINALIZED', finalized_at = ? WHERE id = ?").run(stamp, eventId);
}

test("migration is idempotent and enforces foreign keys and domain constraints", () => {
  const database = openDatabase(":memory:");
  try {
    assert.equal(database.pragma("user_version", { simple: true }), 4);
    assert.equal(database.pragma("foreign_keys", { simple: true }), 1);
    applyMigrations(database);
    assert.deepEqual(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name),
      ["events", "participants", "portfolios", "round_results"],
    );

    const event = ensureCurrentEvent(database);
    assert.match(event.scenario_id, /^scenario-0[1-6]$/);
    assert.throws(() => database.prepare(`
      INSERT INTO events (id, status, legacy_scenario_id, scenario_id, created_at, finalized_at)
      VALUES ('invalid-scenario', 'OPEN', 'scenario-01', 'scenario-99', ?, NULL)
    `).run(stamp));
    assert.throws(() => database.prepare(`
      INSERT INTO events (id, status, legacy_scenario_id, scenario_id, created_at, finalized_at)
      VALUES ('second-open', 'OPEN', 'scenario-01', 'scenario-01', ?, NULL)
    `).run(stamp));
    assert.throws(() => database.prepare(`
      INSERT INTO participants (
        id, event_id, name, language, status, current_round,
        current_capital_cents, current_cash_cents, started_at
      ) VALUES ('bad-fk', 'missing-event', 'Игрок', 'ru', 'IN_PROGRESS', 1, 100000, 100000, ?)
    `).run(stamp));

    const participantId = insertParticipant(database, event.id);
    insertParticipant(database, event.id, { name: "Первый активный", status: "IN_PROGRESS", capital: 100_000 });
    insertParticipant(database, event.id, {
      name: "Второй активный", status: "IN_PROGRESS", capital: 100_000,
    });
    assert.throws(() => insertParticipant(database, event.id, {
      name: "ТЕСТОВЫЙ ИГРОК", status: "IN_PROGRESS", capital: 100_000,
    }));
    const insertPortfolio = database.prepare(`
      INSERT INTO portfolios (
        id, participant_id, round_no, novamind_cents, medflow_cents,
        voltx_cents, greenbox_cents, cash_cents, confirmed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 1, ?, ?)
    `);
    insertPortfolio.run(randomUUID(), participantId, 1, 100_000, stamp, stamp);
    assert.throws(() => insertPortfolio.run(randomUUID(), participantId, 1, 100_000, stamp, stamp));
    assert.throws(() => insertPortfolio.run(randomUUID(), participantId, 2, -1, stamp, stamp));
    assert.throws(() => insertPortfolio.run(randomUUID(), participantId, 4, 100_000, stamp, stamp));

    const insertResult = database.prepare(`
      INSERT INTO round_results (
        id, participant_id, round_no, capital_before_cents, capital_after_cents,
        profit_cents, novamind_return_bps, medflow_return_bps, voltx_return_bps,
        greenbox_return_bps, created_at
      ) VALUES (?, ?, ?, 100000, 100000, 0, ?, 0, 0, 0, ?)
    `);
    insertResult.run(randomUUID(), participantId, 1, -10_000, stamp);
    assert.throws(() => insertResult.run(randomUUID(), participantId, 2, -10_001, stamp));

    assert.equal(database.pragma("user_version", { simple: true }), 4);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM events").get().count, 1);
  } finally {
    if (database.open) database.close();
  }
});

test("schema v1 migrates in place and refuses ambiguous legacy duplicate names", () => {
  const database = new Database(":memory:");
  try {
    database.exec(`
      CREATE TABLE participants (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL
      );
      INSERT INTO participants (id, event_id, name, status)
      VALUES ('legacy-1', 'event-1', '  Ａlex  ', 'COMPLETED');
      CREATE TABLE events (scenario_id TEXT NOT NULL);
      CREATE TABLE portfolios (id TEXT PRIMARY KEY);
      CREATE TABLE round_results (id TEXT PRIMARY KEY);
      PRAGMA user_version = 1;
    `);
    applyMigrations(database);
    assert.equal(database.pragma("user_version", { simple: true }), 4);
    assert.deepEqual(
      database.prepare("SELECT id, name, name_key FROM participants").get(),
      { id: "legacy-1", name: "  Ａlex  ", name_key: "alex" },
    );
    assert.equal(
      database.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='participants_event_name_key_unique_idx'").get().name,
      "participants_event_name_key_unique_idx",
    );
  } finally {
    database.close();
  }

  const duplicates = new Database(":memory:");
  try {
    duplicates.exec(`
      CREATE TABLE participants (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL
      );
      INSERT INTO participants (id, event_id, name, status) VALUES
        ('legacy-1', 'event-1', 'Alex', 'COMPLETED'),
        ('legacy-2', 'event-1', 'Ａlex', 'COMPLETED');
      CREATE TABLE events (scenario_id TEXT NOT NULL);
      CREATE TABLE portfolios (id TEXT PRIMARY KEY);
      CREATE TABLE round_results (id TEXT PRIMARY KEY);
      PRAGMA user_version = 1;
    `);
    assert.throws(() => applyMigrations(duplicates), /duplicate normalized names/);
    assert.equal(duplicates.pragma("user_version", { simple: true }), 1);
    assert.equal(
      duplicates.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('participants') WHERE name = 'name_key'").get().count,
      0,
    );
  } finally {
    duplicates.close();
  }
});

test("saved v3 database keeps an active player and accepts a second after migration", () => {
  const directory = mkdtempSync(join(tmpdir(), "startup-v3-migration-"));
  const path = join(directory, "game.sqlite");
  try {
    const before = openDatabase(path);
    const event = ensureCurrentEvent(before);
    const first = createSession(before, { name: "First Synthetic", language: "ru" });
    before.exec("CREATE UNIQUE INDEX participants_one_in_progress_idx ON participants(event_id) WHERE status = 'IN_PROGRESS'; PRAGMA user_version = 3");
    before.close();

    const after = openDatabase(path);
    try {
      assert.equal(after.pragma("user_version", { simple: true }), 4);
      const second = createSession(after, { name: "Second Synthetic", language: "en" });
      assert.notEqual(second.id, first.id);
      assert.equal(second.eventKey, event.id);
      assert.equal(after.prepare("SELECT COUNT(*) AS count FROM participants WHERE event_id = ? AND status = 'IN_PROGRESS'").get(event.id).count, 2);
    } finally {
      after.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("event initialization is stable and event creation requires a closed, finished event", () => {
  const database = openDatabase(":memory:");
  try {
    const first = ensureCurrentEvent(database);
    const repeated = ensureCurrentEvent(database);
    assert.equal(repeated.id, first.id);
    assert.equal(repeated.scenario_id, first.scenario_id);
    assert.throws(() => createNextEvent(database), EventCreationError);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM events").get().count, 1);

    insertParticipant(database, first.id, { name: "В процессе", status: "IN_PROGRESS" });
    setEventFinalized(database, first.id);
    assert.equal(ensureCurrentEvent(database).id, first.id);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM events").get().count, 1);
    assert.throws(() => createNextEvent(database), /unfinished participants/);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM events").get().count, 1);
    database.prepare(`
      UPDATE participants
      SET status = 'COMPLETED', finished_at = ?, final_capital_cents = current_capital_cents
      WHERE event_id = ?
    `).run(stamp, first.id);

    const second = createNextEvent(database);
    assert.notEqual(second.id, first.id);
    assert.equal(second.status, "OPEN");
    assert.match(second.scenario_id, /^scenario-0[1-6]$/);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM events").get().count, 2);
    database.prepare("UPDATE events SET created_at = ? WHERE id = ?").run(first.created_at, second.id);
    assert.equal(ensureCurrentEvent(database).id, second.id);
    const newSession = createSession(database, { name: "Next Event", language: "en" });
    assert.equal(database.prepare("SELECT event_id FROM participants WHERE id = ?").get(newSession.id).event_id, second.id);
  } finally {
    database.close();
  }
});

test("public leaderboard sorts by exact cents, ranks ties together, and hides private event data", () => {
  const database = openDatabase(":memory:");
  try {
    const event = ensureCurrentEvent(database);
    insertParticipant(database, event.id, { name: "Ниже", capital: 100_001, finishedAt: "2026-09-29T10:02:00.000Z" });
    insertParticipant(database, event.id, { name: "Первый", capital: 125_437, finishedAt: "2026-09-29T10:01:00.000Z" });
    insertParticipant(database, event.id, { name: "Второй", capital: 125_437, finishedAt: "2026-09-29T10:00:00.000Z" });
    insertParticipant(database, event.id, { name: "Активный", status: "IN_PROGRESS", capital: 500_000 });

    const publicEvent = getPublicEvent(database);
    assert.deepEqual(publicEvent, {
      eventKey: event.id, title: "Startup Arena", startupIds: [...STARTUP_IDS],
      status: "OPEN",
      completedCount: 3,
      leaderboard: [
        { place: 1, name: "Второй", finalCapitalCents: 125_437 },
        { place: 1, name: "Первый", finalCapitalCents: 125_437 },
        { place: 3, name: "Ниже", finalCapitalCents: 100_001 },
      ],
    });
    assert.equal("scenario_id" in publicEvent, false);
    assert.equal("id" in publicEvent, false);
    assert.equal(JSON.stringify(publicEvent).includes("Активный"), false);
    assert.equal(JSON.stringify(publicEvent).includes("portfolio"), false);
  } finally {
    database.close();
  }
});

test("file-backed database persists event, scenario choice, and leaderboard across connections", () => {
  const directory = mkdtempSync(join(tmpdir(), "startup-invest-game-"));
  const path = join(directory, "nested", "event.sqlite");
  let database;
  let secondConnection;
  try {
    database = openDatabase(path);
    const event = ensureCurrentEvent(database);
    insertParticipant(database, event.id, { name: "Сохранённый игрок", capital: 109_876 });
    secondConnection = openDatabase(path);

    assert.equal(ensureCurrentEvent(secondConnection).id, event.id);
    assert.equal(ensureCurrentEvent(secondConnection).scenario_id, event.scenario_id);
    assert.equal(getPublicEvent(secondConnection).leaderboard[0].finalCapitalCents, 109_876);
    assert.equal(getPublicEvent(secondConnection).status, "OPEN");

    secondConnection.close();
    secondConnection = undefined;
    database.close();
    database = undefined;
    database = openDatabase(path);
    assert.equal(ensureCurrentEvent(database).id, event.id);
    assert.equal(ensureCurrentEvent(database).scenario_id, event.scenario_id);
    assert.equal(getPublicEvent(database).leaderboard[0].name, "Сохранённый игрок");
  } finally {
    secondConnection?.close();
    database?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
