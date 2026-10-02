import { randomUUID } from "node:crypto";
import {
  ROUND_COUNT,
  STARTING_CAPITAL_CENTS,
  STARTUP_IDS,
  LEGACY_STARTUP_IDS,
  type PlayerReport,
  type Language,
  type RoundNumber,
  type SessionResponse,
  type SessionRoundResult,
  type SessionStatus,
  type StartupId,
} from "@startup-game/shared";
import type Database from "better-sqlite3";
import { ApiError, eventFinalized, invalidState, sessionNotFound, validationError } from "../api-errors.js";
import { normalizeParticipantName, ParticipantNameError } from "../participants/name.js";
import { projectDecisionMarket, projectRoundReveal } from "../scenarios/projections.js";
import type { ScenarioId } from "@startup-game/shared";

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

interface SessionRow {
  id: string;
  event_id: string;
  event_status: "OPEN" | "FINALIZED";
  scenario_id: ScenarioId;
  model_version: number;
  name: string;
  language: Language;
  status: "IN_PROGRESS" | "COMPLETED";
  current_round: number;
  current_capital_cents: number;
  current_cash_cents: number;
  finished_at: string | null;
  final_capital_cents: number | null;
}

interface PortfolioRow {
  round_no: number;
  novamind_cents: number;
  medflow_cents: number;
  voltx_cents: number;
  greenbox_cents: number;
  agropulse_cents: number;
  orbitlink_cents: number;
  cash_cents: number;
  confirmed: number;
}

interface RoundResultRow {
  round_no: number;
  capital_before_cents: number;
  capital_after_cents: number;
  profit_cents: number;
  novamind_return_bps: number;
  medflow_return_bps: number;
  voltx_return_bps: number;
  greenbox_return_bps: number;
  agropulse_return_bps: number;
  orbitlink_return_bps: number;
}

interface PortfolioInput {
  startupAmountsCents: Record<StartupId, number>;
  cashCents: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function querySession(database: Database.Database, id: string): SessionRow | undefined {
  return database.prepare(`
    SELECT p.id, p.event_id, e.status AS event_status, e.scenario_id, e.model_version,
      p.name, p.language, p.status, p.current_round,
      p.current_capital_cents, p.current_cash_cents, p.finished_at, p.final_capital_cents
    FROM participants p
    JOIN events e ON e.id = p.event_id
    WHERE p.id = ?
  `).get(id) as SessionRow | undefined;
}

function queryPortfolio(database: Database.Database, participantId: string, roundNo: number): PortfolioRow | undefined {
  return database.prepare(`
    SELECT round_no, novamind_cents, medflow_cents, voltx_cents, greenbox_cents, agropulse_cents, orbitlink_cents, cash_cents, confirmed
    FROM portfolios WHERE participant_id = ? AND round_no = ?
  `).get(participantId, roundNo) as PortfolioRow | undefined;
}

function queryRoundResult(database: Database.Database, participantId: string, roundNo: number): RoundResultRow | undefined {
  return database.prepare(`
    SELECT round_no, capital_before_cents, capital_after_cents, profit_cents,
      novamind_return_bps, medflow_return_bps, voltx_return_bps, greenbox_return_bps, agropulse_return_bps, orbitlink_return_bps
    FROM round_results WHERE participant_id = ? AND round_no = ?
  `).get(participantId, roundNo) as RoundResultRow | undefined;
}

function amountsFromPortfolio(portfolio: PortfolioRow): Record<StartupId, number> {
  return {
    NovaMind: portfolio.novamind_cents,
    MedFlow: portfolio.medflow_cents,
    VoltX: portfolio.voltx_cents,
    GreenBox: portfolio.greenbox_cents,
    AgroPulse: portfolio.agropulse_cents,
    OrbitLink: portfolio.orbitlink_cents,
  };
}

function returnsFromResult(result: RoundResultRow): Record<StartupId, number> {
  return {
    NovaMind: result.novamind_return_bps,
    MedFlow: result.medflow_return_bps,
    VoltX: result.voltx_return_bps,
    GreenBox: result.greenbox_return_bps,
    AgroPulse: result.agropulse_return_bps,
    OrbitLink: result.orbitlink_return_bps,
  };
}

function moneyFromBigInt(value: bigint): number {
  if (value < 0n || value > MAX_SAFE_BIGINT) throw new RangeError("Money result is outside the safe integer range.");
  return Number(value);
}

function applyReturn(amountCents: number, returnBps: number): number {
  const numerator = BigInt(amountCents) * (10_000n + BigInt(returnBps)) + 5_000n;
  return moneyFromBigInt(numerator / 10_000n);
}

function stateFor(roundNo: RoundNumber, resultExists: boolean, completed: boolean): SessionStatus {
  if (completed) return "COMPLETED";
  return `ROUND_${roundNo}_${resultExists ? "RESULT" : "DECISION"}` as SessionStatus;
}

function buildRoundResult(
  scenarioId: ScenarioId,
  portfolio: PortfolioRow,
  result: RoundResultRow,
  modelVersion: number,
): SessionRoundResult {
  const amounts = amountsFromPortfolio(portfolio);
  const returns = returnsFromResult(result);
  const reveal = projectRoundReveal(scenarioId, result.round_no as RoundNumber, modelVersion);
  const eventByStartup = new Map(reveal.companies.map((company) => [company.startupId, company.event]));

  return {
    roundNo: result.round_no as RoundNumber,
    capitalBeforeCents: result.capital_before_cents,
    capitalAfterCents: result.capital_after_cents,
    profitCents: result.profit_cents,
    cashCents: portfolio.cash_cents,
    companies: reveal.companies.map(({startupId, explanation}) => ({
      startupId,
      amountCents: amounts[startupId],
      returnBps: returns[startupId],
      resultingCents: applyReturn(amounts[startupId], returns[startupId]),
      event: eventByStartup.get(startupId)!,
      explanation,
    })),
  };
}

function getPlace(database: Database.Database, participantId: string, eventId: string): number | null {
  const participant = database.prepare(`
    SELECT final_capital_cents FROM participants
    WHERE id = ? AND event_id = ? AND status = 'COMPLETED'
  `).get(participantId, eventId) as { final_capital_cents: number } | undefined;
  if (!participant) return null;
  const ahead = database.prepare(`
    SELECT COUNT(*) AS count FROM participants
    WHERE event_id = ? AND status = 'COMPLETED' AND final_capital_cents > ?
  `).get(eventId, participant.final_capital_cents) as { count: number };
  return ahead.count + 1;
}

function sessionResponse(database: Database.Database, session: SessionRow): SessionResponse {
  const currentRound = session.current_round as RoundNumber;
  const portfolio = queryPortfolio(database, session.id, currentRound);
  if (!portfolio) throw new Error("Current portfolio draft is missing.");
  const currentResult = queryRoundResult(database, session.id, currentRound);
  const previousResults = database.prepare(`
    SELECT round_no, capital_before_cents, capital_after_cents, profit_cents,
      novamind_return_bps, medflow_return_bps, voltx_return_bps, greenbox_return_bps, agropulse_return_bps, orbitlink_return_bps
    FROM round_results WHERE participant_id = ? AND round_no < ? ORDER BY round_no
  `).all(session.id, currentRound) as RoundResultRow[];
  const capitalHistory = database.prepare(`
    SELECT round_no, capital_after_cents FROM round_results
    WHERE participant_id = ? AND round_no <= ? ORDER BY round_no
  `).all(session.id, currentRound) as Array<{ round_no: number; capital_after_cents: number }>;
  const history = previousResults.map((storedResult) => {
    const reveal = projectRoundReveal(session.scenario_id, storedResult.round_no as RoundNumber, session.model_version);
    const returns = returnsFromResult(storedResult);
    return {
      roundNo: storedResult.round_no as RoundNumber,
      companies: reveal.companies.map((company) => ({
        startupId: company.startupId,
        returnBps: returns[company.startupId],
        event: company.event,
      })),
    };
  });
  const status = stateFor(currentRound, currentResult !== undefined, session.status === "COMPLETED");
  const completedResult = currentResult ? buildRoundResult(session.scenario_id, portfolio, currentResult, session.model_version) : null;

  const roundHistory = [...previousResults, ...(currentResult ? [currentResult] : [])].map(r => buildRoundResult(session.scenario_id, queryPortfolio(database, session.id, r.round_no)!, r, session.model_version));
  return {
    id: session.id,
    name: session.name,
    language: session.language,
    status,
    currentRound,
    capitalCents: session.current_capital_cents,
    cashCents: portfolio.cash_cents,
    portfolio: {
      startupAmountsCents: amountsFromPortfolio(portfolio),
      cashCents: portfolio.cash_cents,
    },
    decisionMarket: currentResult ? null : projectDecisionMarket(session.scenario_id, currentRound, session.model_version),
    result: completedResult,
    revealedRounds: history,
    capitalHistory: capitalHistory.map((point) => ({
      roundNo: point.round_no as RoundNumber,
      capitalCents: point.capital_after_cents,
    })),
    finalCapitalCents: session.final_capital_cents,
    place: session.status === "COMPLETED" ? getPlace(database, session.id, session.event_id) : null,
    eventKey: session.event_id,
    startupIds: [...(session.model_version === 1 ? LEGACY_STARTUP_IDS : STARTUP_IDS)],
    roundHistory,
    report: session.status === "COMPLETED" ? buildPlayerReport(roundHistory) : null,
  };
}

function assertEventOpen(session: SessionRow): void {
  if (session.event_status !== "OPEN") throw eventFinalized();
}

function requireSession(database: Database.Database, id: string): SessionRow {
  const session = querySession(database, id);
  if (!session) throw sessionNotFound();
  return session;
}

function parsePortfolio(input: unknown, modelVersion: number): PortfolioInput {
  if (!isRecord(input)) throw validationError("Portfolio must be an object.");
  const startupAmounts = input.startupAmountsCents;
  if (!isRecord(startupAmounts)) throw validationError("Startup amounts must be an object.");
  const receivedKeys = Object.keys(startupAmounts).sort();
  const expectedKeys = [...(modelVersion === 1 && receivedKeys.length === 4 ? LEGACY_STARTUP_IDS : STARTUP_IDS)].sort();
  if (receivedKeys.length !== expectedKeys.length || receivedKeys.some((key, index) => key !== expectedKeys[index])) {
    throw validationError("Portfolio must contain exactly the supported startups.");
  }

  const result = {} as Record<StartupId, number>;
  for (const startupId of STARTUP_IDS) {
    const amount = modelVersion === 1 && !(startupId in startupAmounts) ? 0 : startupAmounts[startupId];
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
      throw validationError("Every portfolio amount must be a non-negative integer number of cents.");
    }
    if (modelVersion === 1 && !LEGACY_STARTUP_IDS.includes(startupId as typeof LEGACY_STARTUP_IDS[number]) && amount !== 0) throw validationError("Legacy events do not support this startup.");
    result[startupId] = amount;
  }

  const cashCents = input.cashCents;
  if (typeof cashCents !== "number" || !Number.isSafeInteger(cashCents) || cashCents < 0) {
    throw validationError("Cash must be a non-negative integer number of cents.");
  }
  return { startupAmountsCents: result, cashCents };
}

function validateRoundNumber(input: string): RoundNumber {
  if (!/^[1-3]$/.test(input)) throw validationError("Round number must be 1, 2, or 3.");
  return Number(input) as RoundNumber;
}

function assertCapitalMatches(portfolio: PortfolioInput, capitalCents: number): void {
  const allocated = STARTUP_IDS.reduce((total, startupId) => total + BigInt(portfolio.startupAmountsCents[startupId]), BigInt(portfolio.cashCents));
  if (allocated !== BigInt(capitalCents)) throw validationError("Portfolio amounts must add up to the current capital.");
}

export function getSession(database: Database.Database, id: string): SessionResponse {
  const session = requireSession(database, id);
  return sessionResponse(database, session);
}

export function createSession(database: Database.Database, input: unknown): SessionResponse {
  if (!isRecord(input)) throw validationError("Session details must be an object.");
  let normalizedName: ReturnType<typeof normalizeParticipantName>;
  try {
    normalizedName = normalizeParticipantName(input.name);
  } catch (error) {
    if (error instanceof ParticipantNameError) throw validationError("Name must contain 2 to 24 characters.");
    throw error;
  }
  if (input.language !== "ru" && input.language !== "en") throw validationError("Language must be ru or en.");
  const language = input.language as Language;
  const timestamp = nowIso();

  return database.transaction(() => {
    const event = database.prepare(`
      SELECT id, status FROM events ORDER BY rowid DESC LIMIT 1
    `).get() as { id: string; status: "OPEN" | "FINALIZED" } | undefined;
    if (!event || event.status !== "OPEN") throw eventFinalized();

    const active = database.prepare(`
      SELECT 1 FROM participants WHERE event_id = ? AND status = 'IN_PROGRESS' LIMIT 1
    `).get(event.id);
    if (active) throw new ApiError(409, "SESSION_ALREADY_ACTIVE", "Another session is still in progress.");

    const duplicate = database.prepare(`
      SELECT 1 FROM participants WHERE event_id = ? AND name_key = ? LIMIT 1
    `).get(event.id, normalizedName.nameKey);
    if (duplicate) throw new ApiError(409, "DUPLICATE_NAME", "This name has already been used in the event.");

    const id = randomUUID();
    database.prepare(`
      INSERT INTO participants (
        id, event_id, name, name_key, language, status, current_round,
        current_capital_cents, current_cash_cents, started_at, finished_at, final_capital_cents
      ) VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', 1, ?, ?, ?, NULL, NULL)
    `).run(id, event.id, normalizedName.name, normalizedName.nameKey, language, STARTING_CAPITAL_CENTS, STARTING_CAPITAL_CENTS, timestamp);
    database.prepare(`
      INSERT INTO portfolios (
        id, participant_id, round_no, novamind_cents, medflow_cents,
        voltx_cents, greenbox_cents, agropulse_cents, orbitlink_cents, cash_cents, confirmed, created_at, updated_at
      ) VALUES (?, ?, 1, 0, 0, 0, 0, 0, 0, ?, 0, ?, ?)
    `).run(randomUUID(), id, STARTING_CAPITAL_CENTS, timestamp, timestamp);
    return sessionResponse(database, requireSession(database, id));
  }).immediate();
}

export function updatePortfolio(database: Database.Database, id: string, input: unknown): SessionResponse {
  return database.transaction(() => {
    const session = requireSession(database, id);
    const portfolio = parsePortfolio(input, session.model_version);
    assertEventOpen(session);
    if (session.status !== "IN_PROGRESS") throw invalidState();
    const roundNo = session.current_round as RoundNumber;
    const roundResult = queryRoundResult(database, id, roundNo);
    const currentPortfolio = queryPortfolio(database, id, roundNo);
    if (roundResult || !currentPortfolio || currentPortfolio.confirmed) throw invalidState();
    assertCapitalMatches(portfolio, session.current_capital_cents);

    database.prepare(`
      UPDATE portfolios SET novamind_cents = ?, medflow_cents = ?, voltx_cents = ?,
        greenbox_cents = ?, agropulse_cents = ?, orbitlink_cents = ?, cash_cents = ?, updated_at = ?
      WHERE participant_id = ? AND round_no = ? AND confirmed = 0
    `).run(
      portfolio.startupAmountsCents.NovaMind,
      portfolio.startupAmountsCents.MedFlow,
      portfolio.startupAmountsCents.VoltX,
      portfolio.startupAmountsCents.GreenBox,
      portfolio.startupAmountsCents.AgroPulse,
      portfolio.startupAmountsCents.OrbitLink,
      portfolio.cashCents,
      nowIso(),
      id,
      roundNo,
    );
    return sessionResponse(database, requireSession(database, id));
  }).immediate();
}

export function confirmRound(database: Database.Database, id: string, roundPath: string): SessionResponse {
  const requestedRound = validateRoundNumber(roundPath);
  return database.transaction(() => {
    const session = requireSession(database, id);
    assertEventOpen(session);
    const roundResult = queryRoundResult(database, id, requestedRound);
    if (session.current_round === requestedRound && roundResult) {
      return sessionResponse(database, session);
    }
    if (session.status !== "IN_PROGRESS" || session.current_round !== requestedRound) throw invalidState();

    const portfolio = queryPortfolio(database, id, requestedRound);
    if (!portfolio || portfolio.confirmed) throw invalidState();
    const amounts = amountsFromPortfolio(portfolio);
    const event = database.prepare("SELECT scenario_id FROM events WHERE id = ?").get(session.event_id) as { scenario_id: ScenarioId };
    const reveal = projectRoundReveal(event.scenario_id, requestedRound, session.model_version);
    const returns = Object.fromEntries(STARTUP_IDS.map(id => [id, reveal.companies.find(c => c.startupId === id)?.returnBps ?? 0])) as Record<StartupId, number>;
    const resulting = {} as Record<StartupId, number>;
    for (const startupId of STARTUP_IDS) resulting[startupId] = applyReturn(amounts[startupId], returns[startupId]);

    const capitalAfter = moneyFromBigInt(
      STARTUP_IDS.reduce((total, startupId) => total + BigInt(resulting[startupId]), BigInt(portfolio.cash_cents)),
    );
    const profit = capitalAfter - session.current_capital_cents;
    const timestamp = nowIso();
    database.prepare("UPDATE portfolios SET confirmed = 1, updated_at = ? WHERE participant_id = ? AND round_no = ? AND confirmed = 0")
      .run(timestamp, id, requestedRound);
    database.prepare(`
      INSERT INTO round_results (
        id, participant_id, round_no, capital_before_cents, capital_after_cents, profit_cents,
        novamind_return_bps, medflow_return_bps, voltx_return_bps, greenbox_return_bps, agropulse_return_bps, orbitlink_return_bps, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), id, requestedRound, session.current_capital_cents, capitalAfter, profit,
      returns.NovaMind, returns.MedFlow, returns.VoltX, returns.GreenBox, returns.AgroPulse, returns.OrbitLink, timestamp,
    );
    database.prepare("UPDATE participants SET current_capital_cents = ?, current_cash_cents = ? WHERE id = ?")
      .run(capitalAfter, portfolio.cash_cents, id);
    return sessionResponse(database, requireSession(database, id));
  }).immediate();
}

export function advanceSession(database: Database.Database, id: string): SessionResponse {
  return database.transaction(() => {
    const session = requireSession(database, id);
    assertEventOpen(session);
    if (session.status !== "IN_PROGRESS" || session.current_round >= ROUND_COUNT) throw invalidState();
    const currentRound = session.current_round as RoundNumber;
    const storedResult = queryRoundResult(database, id, currentRound);
    const currentPortfolio = queryPortfolio(database, id, currentRound);
    if (!storedResult || !currentPortfolio?.confirmed) throw invalidState();

    const amounts = amountsFromPortfolio(currentPortfolio);
    const returns = returnsFromResult(storedResult);
    const nextAmounts = Object.fromEntries(
      STARTUP_IDS.map((startupId) => [startupId, applyReturn(amounts[startupId], returns[startupId])]),
    ) as Record<StartupId, number>;
    const nextRound = currentRound + 1;
    const timestamp = nowIso();
    database.prepare(`
      INSERT INTO portfolios (
        id, participant_id, round_no, novamind_cents, medflow_cents,
        voltx_cents, greenbox_cents, agropulse_cents, orbitlink_cents, cash_cents, confirmed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      randomUUID(), id, nextRound,
      nextAmounts.NovaMind, nextAmounts.MedFlow, nextAmounts.VoltX, nextAmounts.GreenBox, nextAmounts.AgroPulse, nextAmounts.OrbitLink,
      currentPortfolio.cash_cents, timestamp, timestamp,
    );
    database.prepare("UPDATE participants SET current_round = ? WHERE id = ?").run(nextRound, id);
    return sessionResponse(database, requireSession(database, id));
  }).immediate();
}

export function completeSession(database: Database.Database, id: string): SessionResponse {
  return database.transaction(() => {
    const session = requireSession(database, id);
    assertEventOpen(session);
    if (session.status === "COMPLETED") return sessionResponse(database, session);
    const thirdResult = queryRoundResult(database, id, ROUND_COUNT);
    const thirdPortfolio = queryPortfolio(database, id, ROUND_COUNT);
    if (session.status !== "IN_PROGRESS" || session.current_round !== ROUND_COUNT || !thirdResult || !thirdPortfolio?.confirmed) {
      throw invalidState();
    }

    database.prepare(`
      UPDATE participants SET status = 'COMPLETED', finished_at = ?,
        final_capital_cents = current_capital_cents
      WHERE id = ? AND status = 'IN_PROGRESS'
    `).run(nowIso(), id);
    return sessionResponse(database, requireSession(database, id));
  }).immediate();
}

function buildPlayerReport(rounds: SessionRoundResult[]): PlayerReport {
  const best = rounds.reduce((a, b) => b.profitCents > a.profitCents ? b : a);
  const ids = rounds[0]!.companies.map(c => c.startupId);
  const contributors = ids.map(startupId => ({ startupId, profitCents: rounds.reduce((sum, r) => { const c = r.companies.find(c => c.startupId === startupId)!; return sum + c.resultingCents - c.amountCents; }, 0) }));
  const percent = (n: number, d: number) => d === 0 ? 0 : Number((BigInt(n) * 10000n + BigInt(d) / 2n) / BigInt(d));
  const averageCashBps = Math.round(rounds.reduce((sum, r) => sum + percent(r.cashCents, r.capitalBeforeCents), 0) / rounds.length);
  const maximumConcentrationBps = Math.max(...rounds.flatMap(r => r.companies.map(c => percent(c.amountCents, r.capitalBeforeCents))));
  const observations = [maximumConcentrationBps >= 6000
    ? { ru: "В одном из раундов большая часть капитала зависела от одной компании.", en: "In one round, most of your capital depended on a single company." }
    : { ru: "Ни одна компания не занимала большую часть капитала.", en: "No company held most of the capital." },
    averageCashBps >= 3000
    ? { ru: "Вы оставляли заметную часть капитала свободной: она не участвовала в росте или падении рынка.", en: "You kept a substantial share of capital in cash: it did not participate in market gains or losses." }
    : { ru: "Большая часть капитала участвовала в изменениях стоимости компаний.", en: "Most of your capital participated in changes in company value." }];
  return { bestRound: best.roundNo, bestRoundProfitCents: best.profitCents, contributors, averageCashBps, maximumConcentrationBps, observations };
}
