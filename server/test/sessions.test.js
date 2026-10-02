import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { STARTUP_IDS, STARTING_CAPITAL_CENTS } from "../../shared/dist/index.js";
import { ApiError } from "../dist/api-errors.js";
import { openDatabase } from "../dist/db/database.js";
import { getPublicEvent } from "../dist/events/event-store.js";
import {
  advanceSession,
  completeSession,
  confirmRound,
  createSession,
  getSession,
  updatePortfolio,
} from "../dist/sessions/session-store.js";
import { getScenarioDefinition, SCENARIO_IDS } from "../dist/scenarios/catalog.js";
import { pinScenarioInTemporaryDatabase } from "./helpers/scenario-fixture.js";

function withScenarioDatabase(scenarioId, callback) {
  return async () => {
    const directory = mkdtempSync(join(tmpdir(), "startup-session-api-"));
    const database = openDatabase(join(directory, "game.sqlite"));
    try {
      pinScenarioInTemporaryDatabase(database, scenarioId);
      await callback(database);
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

function expectApiError(action, expectedStatus, expectedCode) {
  assert.throws(action, (error) =>
    error instanceof ApiError && error.status === expectedStatus && error.code === expectedCode,
  );
}

function splitEvenly(capitalCents) {
  const base = Math.floor(capitalCents / STARTUP_IDS.length);
  const remainder = capitalCents - base * STARTUP_IDS.length;
  return Object.fromEntries(STARTUP_IDS.map((startupId, index) => [startupId, base + (index < remainder ? 1 : 0)]));
}

function expectedResult(amounts, cashCents, returns) {
  return STARTUP_IDS.map((startupId) => {
    const numerator = BigInt(amounts[startupId]) * (10_000n + BigInt(returns[startupId])) + 5_000n;
    return Number(numerator / 10_000n);
  }).reduce((total, amount) => total + amount, cashCents);
}

for (const scenarioId of SCENARIO_IDS) {
  test(`session store completes all three rounds without leaking future data for ${scenarioId}`, withScenarioDatabase(scenarioId, async (database) => {
    const scenario = getScenarioDefinition(scenarioId);
    let session = createSession(database, { name: `Player ${scenarioId.slice(-2)}`, language: "en" });
    assert.equal(session.status, "ROUND_1_DECISION");
    assert.equal(session.currentRound, 1);
    assert.equal(session.capitalCents, STARTING_CAPITAL_CENTS);
    assert.equal(session.cashCents, STARTING_CAPITAL_CENTS);
    assert.deepEqual(session.portfolio.startupAmountsCents, { NovaMind: 0, MedFlow: 0, VoltX: 0, GreenBox: 0, AgroPulse: 0, OrbitLink: 0 });
    assert.deepEqual(session.revealedRounds, []);
    assert.deepEqual(session.capitalHistory, []);
    assert.equal(session.result, null);
    assert.equal(session.decisionMarket.companies.length, 6);
    const firstDecisionMarket = session.decisionMarket;

    const allPrivateEvents = scenario.rounds.flatMap((round) =>
      STARTUP_IDS.map((startupId) => round.companies[startupId].outcome.event.en),
    );
    let encoded = JSON.stringify(session);
    assert.equal(encoded.includes(scenarioId), false);
    for (const privateEvent of allPrivateEvents) assert.equal(encoded.includes(privateEvent), false);

    for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
      const roundNo = roundIndex + 1;
      const amounts = splitEvenly(session.capitalCents);
      const cashCents = session.capitalCents - STARTUP_IDS.reduce((total, startupId) => total + amounts[startupId], 0);
      const before = getSession(database, session.id);
      assert.equal(before.status, `ROUND_${roundNo}_DECISION`);
      encoded = JSON.stringify(before);
      for (let futureIndex = roundIndex; futureIndex < 3; futureIndex += 1) {
        for (const startupId of STARTUP_IDS) {
          assert.equal(encoded.includes(scenario.rounds[futureIndex].companies[startupId].outcome.event.en), false);
        }
      }

      const saved = updatePortfolio(database, session.id, { startupAmountsCents: amounts, cashCents });
      assert.deepEqual(saved.portfolio.startupAmountsCents, amounts);
      assert.equal(saved.portfolio.cashCents, cashCents);

      session = confirmRound(database, session.id, String(roundNo));
      assert.equal(session.status, `ROUND_${roundNo}_RESULT`);
      assert.equal(session.result.roundNo, roundNo);
      assert.deepEqual(session.capitalHistory.map((point) => point.roundNo), Array.from({ length: roundNo }, (_value, index) => index + 1));
      assert.deepEqual(session.capitalHistory.at(-1), { roundNo, capitalCents: session.capitalCents });
      assert.equal(session.result.capitalBeforeCents, saved.capitalCents);
      assert.equal(session.result.companies.length, 6);
      assert.equal(session.revealedRounds.length, roundIndex);
      const returns = Object.fromEntries(STARTUP_IDS.map((startupId) => [
        startupId,
        scenario.rounds[roundIndex].companies[startupId].outcome.returnBps,
      ]));
      assert.equal(session.result.capitalAfterCents, expectedResult(amounts, cashCents, returns));
      assert.equal(session.capitalCents, session.result.capitalAfterCents);
      assert.equal(session.result.profitCents, session.capitalCents - session.result.capitalBeforeCents);
      assert.deepEqual(
        Object.fromEntries(session.result.companies.map((company) => [company.startupId, company.returnBps])),
        returns,
      );
      encoded = JSON.stringify(session);
      for (let futureIndex = roundIndex + 1; futureIndex < 3; futureIndex += 1) {
        for (const startupId of STARTUP_IDS) {
          assert.equal(encoded.includes(scenario.rounds[futureIndex].companies[startupId].outcome.event.en), false);
        }
      }

      const repeated = confirmRound(database, session.id, String(roundNo));
      assert.equal(repeated.capitalCents, session.capitalCents);
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM round_results WHERE participant_id = ? AND round_no = ?")
        .get(session.id, roundNo).count, 1);

      if (roundNo < 3) {
        session = advanceSession(database, session.id);
        assert.equal(session.status, `ROUND_${roundNo + 1}_DECISION`);
        assert.deepEqual(
          session.portfolio.startupAmountsCents,
          Object.fromEntries(session.revealedRounds.at(-1).companies.map((company) => {
            const sourceAmount = amounts[company.startupId];
            const resulting = Number((BigInt(sourceAmount) * (10_000n + BigInt(company.returnBps)) + 5_000n) / 10_000n);
            return [company.startupId, resulting];
          })),
        );
      }
    }

    session = completeSession(database, session.id);
    assert.equal(session.status, "COMPLETED");
    assert.equal(session.finalCapitalCents, session.capitalCents);
    assert.equal(session.place, 1);
    assert.equal(session.roundHistory.length, 3);
    assert.equal(session.report.contributors.reduce((sum, p) => sum + p.profitCents, 0), session.finalCapitalCents - STARTING_CAPITAL_CENTS);
    assert.ok(session.report.maximumConcentrationBps >= 0 && session.report.maximumConcentrationBps <= 10000);
    assert.equal(session.report.observations.length, 2);
    const completedAgain = completeSession(database, session.id);
    assert.equal(completedAgain.finalCapitalCents, session.finalCapitalCents);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM participants WHERE event_id = ? AND status = 'COMPLETED'")
      .get(database.prepare("SELECT event_id FROM participants WHERE id = ?").get(session.id).event_id).count, 1);
    assert.equal(getPublicEvent(database).leaderboard[0].finalCapitalCents, session.finalCapitalCents);

    const secondPlayer = createSession(database, { name: `Next ${scenarioId.slice(-2)}`, language: "ru" });
    assert.equal(secondPlayer.capitalCents, STARTING_CAPITAL_CENTS);
    assert.deepEqual(secondPlayer.decisionMarket, firstDecisionMarket);
  }));
}

test("session creation validates normalized names, language, and the single-active-session limit", withScenarioDatabase("scenario-01", async (database) => {
  for (const name of ["", " ", "A", "x".repeat(25)]) {
    expectApiError(() => createSession(database, { name, language: "ru" }), 400, "VALIDATION_ERROR");
  }
  expectApiError(() => createSession(database, { name: "Valid Name", language: "fr" }), 400, "VALIDATION_ERROR");

  const created = createSession(database, { name: "  Ａlex  ", language: "ru" });
  assert.equal(created.name, "Ａlex");
  expectApiError(() => createSession(database, { name: "Another Player", language: "ru" }), 409, "SESSION_ALREADY_ACTIVE");
  assert.equal(getSession(database, created.id).name, "Ａlex");

  for (let roundNo = 1; roundNo <= 3; roundNo += 1) {
    const current = getSession(database, created.id);
    updatePortfolio(database, created.id, {
      startupAmountsCents: { NovaMind: 0, MedFlow: 0, VoltX: 0, GreenBox: 0, AgroPulse: 0, OrbitLink: 0 },
      cashCents: current.capitalCents,
    });
    confirmRound(database, created.id, String(roundNo));
    if (roundNo < 3) advanceSession(database, created.id);
  }
  completeSession(database, created.id);
  expectApiError(() => createSession(database, { name: "alex", language: "en" }), 409, "DUPLICATE_NAME");
}));

test("portfolio inputs are exact cents; invalid amounts do not mutate the draft and half cents round up", withScenarioDatabase("scenario-02", async (database) => {
  const created = createSession(database, { name: "<img src=x>", language: "en" });
  assert.equal(created.name, "<img src=x>");
  assert.equal(created.capitalCents, STARTING_CAPITAL_CENTS);

  const invalidInputs = [
    { startupAmountsCents: { NovaMind: 1, MedFlow: 1, VoltX: 1 }, cashCents: 99_997 },
    { startupAmountsCents: { NovaMind: 1, MedFlow: 1, VoltX: 1, GreenBox: 1, Other: 1 }, cashCents: 99_995 },
    { startupAmountsCents: { NovaMind: -1, MedFlow: 0, VoltX: 0, GreenBox: 0, AgroPulse: 0, OrbitLink: 0 }, cashCents: 100_001 },
    { startupAmountsCents: { NovaMind: 0.5, MedFlow: 0, VoltX: 0, GreenBox: 0, AgroPulse: 0, OrbitLink: 0 }, cashCents: 99_999.5 },
    { startupAmountsCents: { NovaMind: Number.MAX_SAFE_INTEGER + 1, MedFlow: 0, VoltX: 0, GreenBox: 0, AgroPulse: 0, OrbitLink: 0 }, cashCents: 0 },
    { startupAmountsCents: { NovaMind: 1, MedFlow: 0, VoltX: 0, GreenBox: 0, AgroPulse: 0, OrbitLink: 0 }, cashCents: 99_998 },
    { startupAmountsCents: { NovaMind: 0, MedFlow: 0, VoltX: 0, GreenBox: 0, AgroPulse: 0, OrbitLink: 0 }, cashCents: "100000" },
    null,
  ];
  for (const input of invalidInputs) {
    expectApiError(() => updatePortfolio(database, created.id, input), 400, "VALIDATION_ERROR");
    assert.deepEqual(getSession(database, created.id).portfolio, created.portfolio);
  }

  updatePortfolio(database, created.id, {
    startupAmountsCents: { NovaMind: 50, MedFlow: 0, VoltX: 0, GreenBox: 0, AgroPulse: 0, OrbitLink: 0 },
    cashCents: 99_950,
  });
  const result = confirmRound(database, created.id, "1");
  const expectedBps = getScenarioDefinition("scenario-02").rounds[0].companies.NovaMind.outcome.returnBps;
  assert.equal(result.result.companies[0].returnBps, expectedBps);
  const expectedCents = Number((50n * BigInt(10000 + expectedBps) + 5000n) / 10000n);
  assert.equal(result.result.companies[0].resultingCents, expectedCents);
  assert.equal(result.capitalCents, 99950 + expectedCents);
  expectApiError(() => updatePortfolio(database, created.id, {
    startupAmountsCents: { NovaMind: 0, MedFlow: 0, VoltX: 0, GreenBox: 0, AgroPulse: 0, OrbitLink: 0 },
    cashCents: result.capitalCents,
  }), 409, "INVALID_STATE");
}));

test("invalid state transitions leave portfolio and result records untouched", withScenarioDatabase("scenario-01", async (database) => {
  const created = createSession(database, { name: "State Tester", language: "ru" });
  expectApiError(() => getSession(database, "missing-id"), 404, "SESSION_NOT_FOUND");
  expectApiError(() => confirmRound(database, created.id, "2"), 409, "INVALID_STATE");
  expectApiError(() => confirmRound(database, created.id, "4"), 400, "VALIDATION_ERROR");
  expectApiError(() => advanceSession(database, created.id), 409, "INVALID_STATE");
  expectApiError(() => completeSession(database, created.id), 409, "INVALID_STATE");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM round_results WHERE participant_id = ?").get(created.id).count, 0);
  assert.equal(database.prepare("SELECT confirmed FROM portfolios WHERE participant_id = ? AND round_no = 1").get(created.id).confirmed, 0);
}));

test("completed players with identical cents receive the same competition rank", withScenarioDatabase("scenario-02", async (database) => {
  function finishAllCash(name) {
    let session = createSession(database, { name, language: "ru" });
    for (let roundNo = 1; roundNo <= 3; roundNo += 1) {
      updatePortfolio(database, session.id, {
        startupAmountsCents: { NovaMind: 0, MedFlow: 0, VoltX: 0, GreenBox: 0, AgroPulse: 0, OrbitLink: 0 },
        cashCents: session.capitalCents,
      });
      session = confirmRound(database, session.id, String(roundNo));
      if (roundNo < 3) session = advanceSession(database, session.id);
    }
    return completeSession(database, session.id);
  }

  const first = finishAllCash("Player One");
  const second = finishAllCash("Player Two");
  assert.equal(first.finalCapitalCents, STARTING_CAPITAL_CENTS);
  assert.equal(second.finalCapitalCents, STARTING_CAPITAL_CENTS);
  assert.equal(first.place, 1);
  assert.equal(second.place, 1);
  assert.deepEqual(getPublicEvent(database).leaderboard.map((entry) => entry.place), [1, 1]);
}));

test("finalized event rejects session creation and every session write", withScenarioDatabase("scenario-03", async (database) => {
  const created = createSession(database, { name: "Closing Soon", language: "ru" });
  const eventId = database.prepare("SELECT event_id FROM participants WHERE id = ?").get(created.id).event_id;
  database.prepare("UPDATE events SET status = 'FINALIZED', finalized_at = ? WHERE id = ?")
    .run(new Date().toISOString(), eventId);

  const allCash = {
    startupAmountsCents: { NovaMind: 0, MedFlow: 0, VoltX: 0, GreenBox: 0, AgroPulse: 0, OrbitLink: 0 },
    cashCents: STARTING_CAPITAL_CENTS,
  };
  expectApiError(() => createSession(database, { name: "After Close", language: "en" }), 409, "EVENT_FINALIZED");
  expectApiError(() => updatePortfolio(database, created.id, allCash), 409, "EVENT_FINALIZED");
  expectApiError(() => confirmRound(database, created.id, "1"), 409, "EVENT_FINALIZED");
  expectApiError(() => advanceSession(database, created.id), 409, "EVENT_FINALIZED");
  expectApiError(() => completeSession(database, created.id), 409, "EVENT_FINALIZED");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM round_results WHERE participant_id = ?").get(created.id).count, 0);
  assert.equal(database.prepare("SELECT confirmed FROM portfolios WHERE participant_id = ? AND round_no = 1").get(created.id).confirmed, 0);
}));
