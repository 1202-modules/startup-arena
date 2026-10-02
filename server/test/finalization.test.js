import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../dist/api-errors.js";
import { openDatabase } from "../dist/db/database.js";
import { ensureCurrentEvent, finalizeCurrentEvent, getPublicEvent } from "../dist/events/event-store.js";
import { advanceSession, completeSession, confirmRound, createSession, getSession, updatePortfolio } from "../dist/sessions/session-store.js";

test("finalization atomically closes an empty event and repeats without changing its timestamp", () => {
  const database = openDatabase(":memory:");
  try {
    const opened = ensureCurrentEvent(database);
    assert.equal(getPublicEvent(database).status, "OPEN");

    finalizeCurrentEvent(database);
    const finalized = database.prepare("SELECT status, finalized_at FROM events WHERE id = ?").get(opened.id);
    assert.equal(finalized.status, "FINALIZED");
    assert.ok(finalized.finalized_at);
    assert.deepEqual(getPublicEvent(database), { eventKey: opened.id, title: "Startup Arena", startupIds: ["NovaMind", "MedFlow", "VoltX", "GreenBox", "AgroPulse", "OrbitLink"], status: "FINALIZED", completedCount: 0, leaderboard: [] });

    finalizeCurrentEvent(database);
    assert.equal(database.prepare("SELECT finalized_at FROM events WHERE id = ?").get(opened.id).finalized_at, finalized.finalized_at);
    assert.throws(() => createSession(database, { name: "After Event", language: "en" }), (error) =>
      error instanceof ApiError && error.code === "EVENT_FINALIZED",
    );
  } finally {
    database.close();
  }
});

test("finalization refuses to discard an active player's work and leaves the event open", () => {
  const database = openDatabase(":memory:");
  try {
    const opened = ensureCurrentEvent(database);
    createSession(database, { name: "Active Player", language: "ru" });
    assert.throws(() => finalizeCurrentEvent(database), (error) =>
      error instanceof ApiError && error.code === "SESSION_ALREADY_ACTIVE",
    );
    const current = database.prepare("SELECT status, finalized_at FROM events WHERE id = ?").get(opened.id);
    assert.equal(current.status, "OPEN");
    assert.equal(current.finalized_at, null);
  } finally {
    database.close();
  }
});

test("all session write operations reject a finalized event while reads remain available", () => {
  const database = openDatabase(":memory:");
  try {
    ensureCurrentEvent(database);
    let session = createSession(database, { name: "Synthetic Finished", language: "en" });
    for (let round = 1; round <= 3; round++) {
      session = confirmRound(database, session.id, String(round));
      session = round === 3 ? completeSession(database, session.id) : advanceSession(database, session.id);
    }
    finalizeCurrentEvent(database);
    const before = getSession(database, session.id);
    const allCash = { startupAmountsCents: { NovaMind: 0, MedFlow: 0, VoltX: 0, GreenBox: 0, AgroPulse: 0, OrbitLink: 0 }, cashCents: before.capitalCents };
    for (const action of [
      () => updatePortfolio(database, session.id, allCash),
      () => confirmRound(database, session.id, "3"),
      () => advanceSession(database, session.id),
      () => completeSession(database, session.id),
    ]) {
      assert.throws(action, (error) => error instanceof ApiError && error.code === "EVENT_FINALIZED");
    }
    assert.deepEqual(getSession(database, session.id), before);
    assert.equal(getPublicEvent(database).completedCount, 1);
  } finally {
    database.close();
  }
});
