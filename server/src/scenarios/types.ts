import type { BusinessHistoryPoint, LocalizedText, MarketNews, RoundNumber, ScenarioId, StartupId } from "@startup-game/shared";
import type { BusinessState, BusinessParameters, BusinessShock } from "./model.js";

export interface RawCompanyMetrics {
  revenueThousandsUsd: number;
  customers: number;
  expensesThousandsUsd: number;
  cashReserveThousandsUsd: number;
}

export interface ScenarioOutcome {
  returnBps: number;
  event: LocalizedText;
  explanation?: LocalizedText;
}

export interface ScenarioCompanyRound {
  metrics: RawCompanyMetrics;
  signal: LocalizedText;
  outcome: ScenarioOutcome;
  state?: BusinessState;
  financialHistory?: BusinessHistoryPoint[];
  news?: MarketNews[];
  analysis?: LocalizedText[];
  marginBps?: number;
  operatingCashFlowCents?: number;
}

export interface ScenarioRound {
  companies: Record<StartupId, ScenarioCompanyRound>;
}

export interface MarketScenario {
  id: ScenarioId;
  title: LocalizedText;
  rounds: [ScenarioRound, ScenarioRound, ScenarioRound];
  modelVersion?: number;
  definition?: { states: Record<StartupId, BusinessState>; parameters: Record<StartupId, BusinessParameters>; shocks: Record<StartupId, BusinessShock>[] };
}

export interface LegacyMarketScenario {
  id: ScenarioId;
  title: LocalizedText;
  rounds: { companies: Record<"NovaMind" | "MedFlow" | "VoltX" | "GreenBox", ScenarioCompanyRound> }[];
}

export const ROUND_NUMBERS: readonly RoundNumber[] = [1, 2, 3];
