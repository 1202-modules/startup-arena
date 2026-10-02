/** Integer educational valuation model. Assumptions are in MATHEMATICAL_MODEL.md. */
export interface BusinessState {
  customers: number;
  arpuCents: number;
  unitCostCents: number;
  fixedCostsCents: number;
  cashCents: number;
  debtCents: number;
  growthBps: number;
  multipleBps: number;
}
export interface BusinessParameters { discountBps: number; maintenanceCapexBps: number }
export interface BusinessShock {
  customerGrowthBps: number;
  arpuChangeBps: number;
  unitCostChangeBps: number;
  fixedCostChangeBps: number;
  capexCents: number;
  multipleChangeBps: number;
}
export const ZERO_SHOCK: BusinessShock = { customerGrowthBps: 0, arpuChangeBps: 0, unitCostChangeBps: 0, fixedCostChangeBps: 0, capexCents: 0, multipleChangeBps: 0 };

function nonnegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Nonnegative safe model integer required.");
}
function factor(value: number): void {
  if (!Number.isSafeInteger(value) || value < -10000 || !Number.isSafeInteger(10000 + value)) throw new RangeError("Invalid model factor.");
}
export function validateBusinessState(state: BusinessState): void {
  for (const key of ["customers", "arpuCents", "unitCostCents", "fixedCostsCents", "cashCents", "debtCents", "multipleBps"] as const) nonnegativeInteger(state[key]);
  factor(state.growthBps);
  if (state.cashCents > 0 && state.debtCents > 0) throw new RangeError("Cash and funding deficit must be netted.");
}
export function validateBusinessParameters(parameters: BusinessParameters): void {
  nonnegativeInteger(parameters.discountBps);
  nonnegativeInteger(parameters.maintenanceCapexBps);
  if (!parameters.discountBps || !Number.isSafeInteger(10000 + parameters.discountBps)) throw new RangeError("Positive safe discount required.");
}
export function validateBusinessShock(shock: BusinessShock): void {
  for (const key of ["customerGrowthBps", "arpuChangeBps", "unitCostChangeBps", "fixedCostChangeBps", "multipleChangeBps"] as const) factor(shock[key]);
  nonnegativeInteger(shock.capexCents);
}

export function safeInteger(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new RangeError("Model integer exceeds safe serialization range.");
  return Number(value);
}
export function roundDiv(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new RangeError("Positive divisor required.");
  return n < 0n ? -((-n + d / 2n) / d) : (n + d / 2n) / d;
}
export function changeByBps(value: number, bps: number): number {
  nonnegativeInteger(value); factor(bps);
  return safeInteger(roundDiv(BigInt(value) * BigInt(10000 + bps), 10000n));
}
export function deltaBps(current: number, previous: number): number {
  nonnegativeInteger(current); nonnegativeInteger(previous);
  if (!previous) throw new RangeError("Percentage change needs a positive base.");
  return safeInteger(roundDiv((BigInt(current) - BigInt(previous)) * 10000n, BigInt(previous)));
}
export function operatingStatement(s: BusinessState) {
  validateBusinessState(s);
  const revenueCents = safeInteger(BigInt(s.customers) * BigInt(s.arpuCents));
  const expensesCents = safeInteger(BigInt(s.customers) * BigInt(s.unitCostCents) + BigInt(s.fixedCostsCents));
  return { revenueCents, expensesCents, operatingCashFlowCents: safeInteger(3n * BigInt(revenueCents - expensesCents)), marginBps: revenueCents ? safeInteger(roundDiv(BigInt(revenueCents - expensesCents) * 10000n, BigInt(revenueCents))) : 0 };
}
export function maintenanceCapex(revenueCents: number, parameters: BusinessParameters): number {
  nonnegativeInteger(revenueCents); validateBusinessParameters(parameters);
  return safeInteger(roundDiv(3n * BigInt(revenueCents) * BigInt(parameters.maintenanceCapexBps), 10000n));
}
export function nextBusinessState(state: BusinessState, shock: BusinessShock, parameters: BusinessParameters): BusinessState {
  validateBusinessState(state); validateBusinessShock(shock); validateBusinessParameters(parameters);
  const next = {
    ...state,
    customers: changeByBps(state.customers, shock.customerGrowthBps),
    arpuCents: changeByBps(state.arpuCents, shock.arpuChangeBps),
    unitCostCents: changeByBps(state.unitCostCents, shock.unitCostChangeBps),
    fixedCostsCents: changeByBps(state.fixedCostsCents, shock.fixedCostChangeBps),
    growthBps: shock.customerGrowthBps,
    multipleBps: changeByBps(state.multipleBps, shock.multipleChangeBps),
  };
  const statement = operatingStatement(next);
  const net = safeInteger(BigInt(state.cashCents) - BigInt(state.debtCents) + BigInt(statement.operatingCashFlowCents) - BigInt(maintenanceCapex(statement.revenueCents, parameters)) - BigInt(shock.capexCents));
  next.cashCents = Math.max(0, net);
  next.debtCents = Math.max(0, -net);
  return next;
}
export function equityValue(state: BusinessState, parameters: BusinessParameters): number {
  validateBusinessState(state); validateBusinessParameters(parameters);
  const growth = Math.max(-2500, Math.min(3500, state.growthBps));
  let forecastCustomers = state.customers;
  let pv = 0n;
  let discountNumerator = 1n;
  let discountDenominator = 1n;
  let terminalRevenue = 0;
  for (let quarter = 1; quarter <= 4; quarter++) {
    forecastCustomers = changeByBps(forecastCustomers, growth);
    const statement = operatingStatement({ ...state, customers: forecastCustomers });
    terminalRevenue = statement.revenueCents;
    const capex = BigInt(maintenanceCapex(terminalRevenue, parameters));
    discountNumerator *= 10000n;
    discountDenominator *= BigInt(10000 + parameters.discountBps);
    pv += roundDiv((BigInt(statement.operatingCashFlowCents) - capex) * discountNumerator, discountDenominator);
  }
  const terminalValue = roundDiv(12n * BigInt(terminalRevenue) * BigInt(state.multipleBps), 10000n);
  pv += roundDiv(terminalValue * discountNumerator, discountDenominator);
  const equity = BigInt(state.cashCents) - BigInt(state.debtCents) + pv;
  return safeInteger(equity < 0n ? 0n : equity);
}
export function returnFromEquity(before: number, after: number): number {
  nonnegativeInteger(before); nonnegativeInteger(after);
  if (!before) throw new RangeError("Playable valuation must have a positive starting equity.");
  return deltaBps(after, before);
}
