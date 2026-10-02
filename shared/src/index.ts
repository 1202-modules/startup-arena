export const ROUND_COUNT = 3 as const;
export const STARTING_CAPITAL_CENTS = 100_000 as const;

export const LEGACY_STARTUP_IDS = ["NovaMind", "MedFlow", "VoltX", "GreenBox"] as const;
export const STARTUP_IDS = [...LEGACY_STARTUP_IDS, "AgroPulse", "OrbitLink"] as const;

export type StartupId = (typeof STARTUP_IDS)[number];
export type Language = "ru" | "en";
export type RoundNumber = 1 | 2 | 3;
export type ScenarioId = "scenario-01" | "scenario-02" | "scenario-03" | "scenario-04" | "scenario-05" | "scenario-06";
export type AmountCents = number;

export type EventStatus = "OPEN" | "FINALIZED";

export type SessionStatus =
  | "ROUND_1_DECISION"
  | "ROUND_1_RESULT"
  | "ROUND_2_DECISION"
  | "ROUND_2_RESULT"
  | "ROUND_3_DECISION"
  | "ROUND_3_RESULT"
  | "COMPLETED";

export interface HealthResponse {
  status: "ok";
}

export interface LeaderboardEntry {
  place: number;
  name: string;
  finalCapitalCents: AmountCents;
}

export interface PublicEventResponse {
  eventKey: string;
  title: string;
  startupIds: StartupId[];
  status: EventStatus;
  completedCount: number;
  leaderboard: LeaderboardEntry[];
}

export function awardPlaces(leaderboard: readonly LeaderboardEntry[]): number[] {
  return [3, 2, 1].filter((place) => leaderboard.some((entry) => entry.place === place));
}

export function skipAwardAnimation(places: readonly number[], prefersReducedMotion: boolean): boolean {
  return places.length === 0 || prefersReducedMotion;
}

export interface SessionPortfolio {
  startupAmountsCents: Record<StartupId, AmountCents>;
  cashCents: AmountCents;
}

export interface LocalizedText {
  ru: string;
  en: string;
}

export interface MarketMetrics {
  revenueThousandsUsd: number;
  revenueChangeBps: number | null;
  customers: number;
  customersChangeBps: number | null;
  expensesThousandsUsd: number;
  expensesChangeBps: number | null;
  cashReserveThousandsUsd: number;
  cashReserveChangeBps: number | null;
}

export interface MarketObservation {
  startupId: StartupId;
  metrics: MarketMetrics;
  signal: LocalizedText;
  analysis: LocalizedText[];
  news: MarketNews[];
  financialHistory: BusinessHistoryPoint[];
  marginBps: number;
  operatingCashFlowCents: number;
  debtCents: number;
}

export interface MarketNews {
  source: "company" | "industry" | "partner";
  certainty: "fact" | "plan";
  text: LocalizedText;
}

export interface BusinessHistoryPoint {
  period: number;
  revenueCents: number;
  expensesCents: number;
  cashCents: number;
  customers: number;
  relativeValueBps: number;
}

export interface MarketHistoryPoint {
  roundNo: RoundNumber;
  returnBps: number;
  relativeValueBps: number;
}

export interface DecisionMarketResponse {
  roundNo: RoundNumber;
  companies: MarketObservation[];
  history: Record<StartupId, MarketHistoryPoint[]>;
}

export interface MarketRevealCompany {
  startupId: StartupId;
  returnBps: number;
  event: LocalizedText;
  explanation?: LocalizedText;
}

export interface RoundRevealResponse {
  roundNo: RoundNumber;
  companies: MarketRevealCompany[];
}

export interface SessionRoundCompanyResult {
  startupId: StartupId;
  amountCents: AmountCents;
  returnBps: number;
  resultingCents: AmountCents;
  event: LocalizedText;
  explanation?: LocalizedText;
}

export interface SessionRoundResult {
  roundNo: RoundNumber;
  capitalBeforeCents: AmountCents;
  capitalAfterCents: AmountCents;
  profitCents: number;
  cashCents: AmountCents;
  companies: SessionRoundCompanyResult[];
}

export interface SessionCapitalPoint {
  roundNo: RoundNumber;
  capitalCents: AmountCents;
}

export interface SessionResponse {
  id: string;
  name: string;
  language: Language;
  status: SessionStatus;
  currentRound: RoundNumber;
  capitalCents: AmountCents;
  cashCents: AmountCents;
  portfolio: SessionPortfolio;
  decisionMarket: DecisionMarketResponse | null;
  result: SessionRoundResult | null;
  revealedRounds: RoundRevealResponse[];
  capitalHistory: SessionCapitalPoint[];
  finalCapitalCents: AmountCents | null;
  place: number | null;
  eventKey: string;
  startupIds: StartupId[];
  roundHistory: SessionRoundResult[];
  report: PlayerReport | null;
}

export interface PlayerReport {
  bestRound: RoundNumber;
  bestRoundProfitCents: number;
  contributors: { startupId: StartupId; profitCents: number }[];
  averageCashBps: number;
  maximumConcentrationBps: number;
  observations: LocalizedText[];
}

export interface OrganizerOverview {
  event: PublicEventResponse;
  activePlayers: number;
  modelVersion: number;
}

/** Hamilton allocation: exact cents; stable input order resolves tied remainders. */
export function allocateByWeights(capitalCents: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(capitalCents) || capitalCents < 0 || weights.some((w) => !Number.isSafeInteger(w) || w < 0)) throw new RangeError("Invalid allocation inputs.");
  const total = weights.reduce((sum, w) => sum + BigInt(w), 0n);
  if (total === 0n) return weights.map(() => 0);
  const values = weights.map((w) => Number(BigInt(capitalCents) * BigInt(w) / total));
  const remainder = capitalCents - values.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => ({ i, remainder: BigInt(capitalCents) * BigInt(w) % total })).sort((a, b) => a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < remainder; i++) values[order[i]!.i]! += 1;
  return values;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
