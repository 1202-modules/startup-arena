import { randomInt, randomUUID } from "node:crypto";
import type { EventStatus, LeaderboardEntry, PublicEventResponse, ScenarioId } from "@startup-game/shared";
import type Database from "better-sqlite3";
import { ApiError } from "../api-errors.js";
import { SCENARIO_IDS } from "../scenarios/catalog.js";
import { LEGACY_STARTUP_IDS, STARTUP_IDS } from "@startup-game/shared";

interface EventRow {
  id: string;
  status: EventStatus;
  scenario_id: ScenarioId;
  created_at: string;
  finalized_at: string | null;
  model_version: number;
  title: string;
}

interface ParticipantRow {
  id: string;
  name: string;
  final_capital_cents: number;
  finished_at: string;
}


function nowIso(): string {
  return new Date().toISOString();
}

function chooseScenario(): ScenarioId {
  return SCENARIO_IDS[randomInt(SCENARIO_IDS.length)]!;
}

function findLatestEvent(database: Database.Database): EventRow | undefined {
  return database
    .prepare("SELECT id, status, scenario_id, model_version, title, created_at, finalized_at FROM events ORDER BY rowid DESC LIMIT 1")
    .get() as EventRow | undefined;
}

function insertEvent(database: Database.Database): EventRow {
  const event: EventRow = {
    id: randomUUID(),
    status: "OPEN",
    scenario_id: chooseScenario(),
    created_at: nowIso(),
    finalized_at: null,
    model_version: 2,
    title: "Startup Arena",
  };
  database
    .prepare("INSERT INTO events (id, status, legacy_scenario_id, scenario_id, model_version, title, created_at, finalized_at) VALUES (?, ?, 'scenario-01', ?, 2, ?, ?, NULL)")
    .run(event.id, event.status, event.scenario_id, event.title, event.created_at);
  return event;
}

export function ensureCurrentEvent(database: Database.Database): EventRow {
  return database.transaction(() => findLatestEvent(database) ?? insertEvent(database)).immediate();
}

export class EventCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventCreationError";
  }
}

export function createNextEvent(database: Database.Database): EventRow {
  return database.transaction(() => {
    const previous = findLatestEvent(database);
    if (!previous) {
      throw new EventCreationError("No event exists yet. Start the server to initialize the first event.");
    }
    if (previous.status !== "FINALIZED") {
      throw new EventCreationError("The current event is still open. Finalize it before creating another event.");
    }

    const unfinished = database
      .prepare("SELECT COUNT(*) AS count FROM participants WHERE event_id = ? AND status != 'COMPLETED'")
      .get(previous.id) as { count: number };
    if (unfinished.count > 0) {
      throw new EventCreationError("The finalized event has unfinished participants; no new event was created.");
    }

    return insertEvent(database);
  }).immediate();
}

export function finalizeCurrentEvent(database: Database.Database): void {
  database.transaction(() => {
    const event = findLatestEvent(database);
    if (!event) throw new ApiError(409, "INVALID_STATE", "No event is available to finalize.");
    if (event.status === "FINALIZED") return;

    const active = database.prepare(`
      SELECT COUNT(*) AS count FROM participants
      WHERE event_id = ? AND status = 'IN_PROGRESS'
    `).get(event.id) as { count: number };
    if (active.count > 0) {
      throw new ApiError(409, "SESSION_ALREADY_ACTIVE", "Finish all active games before finalizing the event.");
    }

    database.prepare(`
      UPDATE events SET status = 'FINALIZED', finalized_at = ?
      WHERE id = ? AND status = 'OPEN'
    `).run(nowIso(), event.id);
  }).immediate();
}

export function getPublicEvent(database: Database.Database): PublicEventResponse {
  const event = findLatestEvent(database);
  if (!event) {
    throw new Error("No event exists. Initialize the event store before serving requests.");
  }

  const participants = database
    .prepare(`
      SELECT id, name, final_capital_cents, finished_at
      FROM participants
      WHERE event_id = ? AND status = 'COMPLETED'
      ORDER BY final_capital_cents DESC, finished_at ASC, id ASC
    `)
    .all(event.id) as ParticipantRow[];

  let priorCapital: number | undefined;
  let priorPlace = 0;
  const leaderboard = participants.map((participant, index): LeaderboardEntry => {
    const place = participant.final_capital_cents === priorCapital ? priorPlace : index + 1;
    priorCapital = participant.final_capital_cents;
    priorPlace = place;
    return {
      place,
      name: participant.name,
      finalCapitalCents: participant.final_capital_cents,
    };
  });

  const result: PublicEventResponse = {
    eventKey: event.id,
    title: event.title,
    startupIds: [...(event.model_version === 1 ? LEGACY_STARTUP_IDS : STARTUP_IDS)],
    status: event.status,
    completedCount: leaderboard.length,
    leaderboard,
  };
  return result;
}

export function getOrganizerOverview(database: Database.Database) {
  const event = findLatestEvent(database)!;
  const { count } = database.prepare("SELECT COUNT(*) AS count FROM participants WHERE event_id = ? AND status = 'IN_PROGRESS'").get(event.id) as { count: number };
  return { event: getPublicEvent(database), activePlayers: count, modelVersion: event.model_version };
}

export function renameCurrentEvent(database: Database.Database, input: unknown): void {
  if (typeof input !== "string" || [...input.trim()].length < 2 || [...input.trim()].length > 60 || /[\u0000-\u001f\u007f]/.test(input)) throw new ApiError(400, "VALIDATION_ERROR", "Event title must contain 2 to 60 characters.");
  const event = findLatestEvent(database)!;
  if (event.status !== "OPEN") throw new ApiError(409, "EVENT_FINALIZED", "The event is closed.");
  database.prepare("UPDATE events SET title = ? WHERE id = ?").run(input.trim().normalize("NFC"), event.id);
}
