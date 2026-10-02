import type Database from "better-sqlite3";
import { normalizeParticipantName } from "../participants/name.js";

const CURRENT_SCHEMA_VERSION = 4;

const INITIAL_SCHEMA = `
  CREATE TABLE events (
    id TEXT PRIMARY KEY NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'FINALIZED')),
    scenario_id TEXT NOT NULL CHECK (scenario_id IN ('scenario-01', 'scenario-02', 'scenario-03')),
    created_at TEXT NOT NULL,
    finalized_at TEXT,
    CHECK (
      (status = 'OPEN' AND finalized_at IS NULL)
      OR (status = 'FINALIZED' AND finalized_at IS NOT NULL)
    )
  ) STRICT;

  CREATE UNIQUE INDEX events_single_open_idx ON events(status) WHERE status = 'OPEN';
  CREATE INDEX events_created_at_idx ON events(created_at DESC, id DESC);

  CREATE TABLE participants (
    id TEXT PRIMARY KEY NOT NULL,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 24),
    language TEXT NOT NULL CHECK (language IN ('ru', 'en')),
    status TEXT NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    current_round INTEGER NOT NULL CHECK (current_round BETWEEN 1 AND 3),
    current_capital_cents INTEGER NOT NULL CHECK (current_capital_cents >= 0),
    current_cash_cents INTEGER NOT NULL CHECK (
      current_cash_cents >= 0 AND current_cash_cents <= current_capital_cents
    ),
    started_at TEXT NOT NULL,
    finished_at TEXT,
    final_capital_cents INTEGER CHECK (final_capital_cents >= 0),
    CHECK (
      (status = 'IN_PROGRESS' AND finished_at IS NULL AND final_capital_cents IS NULL)
      OR (status = 'COMPLETED' AND finished_at IS NOT NULL
        AND final_capital_cents IS NOT NULL
        AND final_capital_cents = current_capital_cents)
    )
  ) STRICT;

  CREATE INDEX participants_leaderboard_idx
    ON participants(event_id, status, final_capital_cents DESC, finished_at, id);

  CREATE TABLE portfolios (
    id TEXT PRIMARY KEY NOT NULL,
    participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
    round_no INTEGER NOT NULL CHECK (round_no BETWEEN 1 AND 3),
    novamind_cents INTEGER NOT NULL CHECK (novamind_cents >= 0),
    medflow_cents INTEGER NOT NULL CHECK (medflow_cents >= 0),
    voltx_cents INTEGER NOT NULL CHECK (voltx_cents >= 0),
    greenbox_cents INTEGER NOT NULL CHECK (greenbox_cents >= 0),
    cash_cents INTEGER NOT NULL CHECK (cash_cents >= 0),
    confirmed INTEGER NOT NULL CHECK (confirmed IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (participant_id, round_no)
  ) STRICT;

  CREATE TABLE round_results (
    id TEXT PRIMARY KEY NOT NULL,
    participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
    round_no INTEGER NOT NULL CHECK (round_no BETWEEN 1 AND 3),
    capital_before_cents INTEGER NOT NULL CHECK (capital_before_cents >= 0),
    capital_after_cents INTEGER NOT NULL CHECK (capital_after_cents >= 0),
    profit_cents INTEGER NOT NULL CHECK (profit_cents = capital_after_cents - capital_before_cents),
    novamind_return_bps INTEGER NOT NULL CHECK (novamind_return_bps >= -10000),
    medflow_return_bps INTEGER NOT NULL CHECK (medflow_return_bps >= -10000),
    voltx_return_bps INTEGER NOT NULL CHECK (voltx_return_bps >= -10000),
    greenbox_return_bps INTEGER NOT NULL CHECK (greenbox_return_bps >= -10000),
    created_at TEXT NOT NULL,
    UNIQUE (participant_id, round_no)
  ) STRICT;
`;

export function applyMigrations(database: Database.Database): void {
  const currentVersion = database.pragma("user_version", { simple: true }) as number;

  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}.`,
    );
  }

  if (currentVersion === CURRENT_SCHEMA_VERSION) return;

  database.transaction(() => {
    const latestVersion = database.pragma("user_version", { simple: true }) as number;
    if (latestVersion === 0) {
      database.exec(INITIAL_SCHEMA);
      database.pragma("user_version = 1");
    }

    const afterInitial = database.pragma("user_version", { simple: true }) as number;
    if (afterInitial === 1) {
      migrateVersionOneToTwo(database);
      database.pragma("user_version = 2");
    }
    if (database.pragma("user_version", { simple: true }) === 2) {
      database.exec(`
        ALTER TABLE events RENAME COLUMN scenario_id TO legacy_scenario_id;
        ALTER TABLE events ADD COLUMN scenario_id TEXT NOT NULL DEFAULT 'scenario-01'
          CHECK (scenario_id IN ('scenario-01','scenario-02','scenario-03','scenario-04','scenario-05','scenario-06'));
        UPDATE events SET scenario_id = legacy_scenario_id;
        ALTER TABLE events ADD COLUMN model_version INTEGER NOT NULL DEFAULT 1 CHECK (model_version IN (1,2));
        ALTER TABLE events ADD COLUMN title TEXT NOT NULL DEFAULT 'Startup Arena';
        ALTER TABLE portfolios ADD COLUMN agropulse_cents INTEGER NOT NULL DEFAULT 0 CHECK (agropulse_cents >= 0);
        ALTER TABLE portfolios ADD COLUMN orbitlink_cents INTEGER NOT NULL DEFAULT 0 CHECK (orbitlink_cents >= 0);
        ALTER TABLE round_results ADD COLUMN agropulse_return_bps INTEGER NOT NULL DEFAULT 0 CHECK (agropulse_return_bps >= -10000);
        ALTER TABLE round_results ADD COLUMN orbitlink_return_bps INTEGER NOT NULL DEFAULT 0 CHECK (orbitlink_return_bps >= -10000);
      `);
      database.pragma("user_version = 3");
    }
    if (database.pragma("user_version", { simple: true }) === 3) {
      database.exec("DROP INDEX IF EXISTS participants_one_in_progress_idx");
      database.pragma("user_version = 4");
    }
    if (database.pragma("user_version", { simple: true }) !== CURRENT_SCHEMA_VERSION) {
      throw new Error(`No migration path from database schema version ${afterInitial}.`);
    }
  }).immediate();
}

function migrateVersionOneToTwo(database: Database.Database): void {
  database.exec("ALTER TABLE participants ADD COLUMN name_key TEXT NOT NULL DEFAULT ''");
  const participants = database
    .prepare("SELECT id, event_id, name FROM participants ORDER BY id")
    .all() as Array<{ id: string; event_id: string; name: string }>;
  const updateNameKey = database.prepare("UPDATE participants SET name_key = ? WHERE id = ?");

  for (const participant of participants) {
    updateNameKey.run(normalizeParticipantName(participant.name).nameKey, participant.id);
  }

  const duplicate = database.prepare(`
    SELECT 1
    FROM participants
    GROUP BY event_id, name_key
    HAVING COUNT(*) > 1
    LIMIT 1
  `).get();
  if (duplicate) {
    throw new Error("Cannot migrate participant names: duplicate normalized names exist in an event.");
  }

  database.exec(`
    CREATE UNIQUE INDEX participants_event_name_key_unique_idx
      ON participants(event_id, name_key);
    CREATE UNIQUE INDEX participants_one_in_progress_idx
      ON participants(event_id) WHERE status = 'IN_PROGRESS';
  `);
}
