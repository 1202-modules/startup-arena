import assert from 'node:assert/strict';
import test from 'node:test';
import { STARTUP_IDS } from '@startup-game/shared';
import { getScenarioDefinition, listScenarioIds } from '../dist/scenarios/catalog.js';
import { deltaBps, equityValue, maintenanceCapex, nextBusinessState, operatingStatement, returnFromEquity, roundDiv, ZERO_SHOCK } from '../dist/scenarios/model.js';

const state = { customers: 1000, arpuCents: 10000, unitCostCents: 8000, fixedCostsCents: 1000000, cashCents: 50000000, debtCents: 0, growthBps: 0, multipleBps: 15000 };
const parameters = { discountBps: 500, maintenanceCapexBps: 300 };

test('independent golden DCF: four 21k flows, 1.8m terminal, 500k cash', () => {
  assert.deepEqual(operatingStatement(state), { revenueCents: 10000000, expensesCents: 9000000, operatingCashFlowCents: 3000000, marginBps: 1000 });
  assert.equal(maintenanceCapex(10000000, parameters), 900000);
  // Hand calculation: sum(21000/1.05^q,q=1..4)+1800000/1.05^4+500000.
  assert.equal(equityValue(state, parameters), 205532941);
  const next = nextBusinessState(state, { ...ZERO_SHOCK, capexCents: 10000000 }, parameters);
  assert.equal(next.cashCents, 42100000);
  assert.equal(equityValue(next, parameters), 197632941);
  assert.equal(returnFromEquity(205532941, 197632941), -384);
});

test('integer rounding, undefined bases and invalid model inputs are explicit', () => {
  assert.equal(roundDiv(15n, 10n), 2n);
  assert.equal(roundDiv(-15n, 10n), -2n);
  assert.equal(returnFromEquity(100, 0), -10000);
  assert.throws(() => deltaBps(100, 0), RangeError);
  assert.throws(() => returnFromEquity(0, 100), RangeError);
  for (const invalid of [ {customers:-1}, {arpuCents:0.1}, {cashCents: Number.MAX_SAFE_INTEGER + 1}, {growthBps:-10001}, {debtCents:1} ]) {
    assert.throws(() => equityValue({...state,...invalid}, parameters), RangeError);
  }
  assert.throws(() => equityValue(state, {...parameters,discountBps:0}), RangeError);
  assert.throws(() => nextBusinessState(state, {...ZERO_SHOCK, capexCents:-1}, parameters), RangeError);
  assert.throws(() => nextBusinessState(state, {...ZERO_SHOCK, customerGrowthBps:-10001}, parameters), RangeError);
});

test('extra capital spending reduces equity cent for cent; funding deficits remain nonnegative', () => {
  const normal = nextBusinessState(state, ZERO_SHOCK, parameters);
  const spent = nextBusinessState(state, {...ZERO_SHOCK,capexCents:1234567}, parameters);
  assert.equal(equityValue(normal,parameters) - equityValue(spent,parameters),1234567);
  const deficit = nextBusinessState({...state,cashCents:0}, {...ZERO_SHOCK,capexCents:10000000},parameters);
  assert.equal(deficit.cashCents,0);
  assert.equal(deficit.debtCents,7900000);
  assert.ok(equityValue(state,{...parameters,discountBps:600}) < equityValue(state,parameters));
});

test('every authored outcome is recomputed from business states and shocks', () => {
  for (const id of listScenarioIds()) {
    const scenario = getScenarioDefinition(id);
    const {states,parameters,shocks} = structuredClone(scenario.definition);
    for (let round = 0; round < 3; round++) for (const company of STARTUP_IDS) {
      const current = states[company];
      const next = nextBusinessState(current,shocks[round][company],parameters[company]);
      const before = equityValue(current,parameters[company]);
      assert.ok(before > 0);
      assert.deepEqual(scenario.rounds[round].companies[company].state,current);
      assert.equal(scenario.rounds[round].companies[company].outcome.returnBps,returnFromEquity(before,equityValue(next,parameters[company])));
      states[company] = next;
    }
  }
});
