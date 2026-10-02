import assert from "node:assert/strict";
import test from "node:test";
import { ROUND_COUNT, STARTING_CAPITAL_CENTS, STARTUP_IDS, awardPlaces, skipAwardAnimation, allocateByWeights } from "../dist/index.js";

test("shared contract preserves the fixed game setup", () => {
  assert.equal(ROUND_COUNT, 3);
  assert.equal(STARTING_CAPITAL_CENTS, 100_000);
  assert.deepEqual(STARTUP_IDS, ["NovaMind", "MedFlow", "VoltX", "GreenBox", "AgroPulse", "OrbitLink"]);
});

test("award places preserve server ranks, including empty, short, and tied leaderboards", () => {
  const entry = (place) => ({ place, name: `Synthetic ${place}`, finalCapitalCents: 100_000 });
  assert.deepEqual(awardPlaces([]), []);
  assert.deepEqual(awardPlaces([entry(1)]), [1]);
  assert.deepEqual(awardPlaces([entry(1), entry(2)]), [2, 1]);
  assert.deepEqual(awardPlaces([entry(1), entry(2), entry(3)]), [3, 2, 1]);
  assert.deepEqual(awardPlaces([entry(1), entry(1), entry(3)]), [3, 1]);
  assert.equal(skipAwardAnimation([], false), true);
  assert.equal(skipAwardAnimation([1], true), true);
  assert.equal(skipAwardAnimation([3, 2, 1], false), false);
});

test("Hamilton allocation preserves every cent and stable remainder order", () => {
  assert.deepEqual(allocateByWeights(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(allocateByWeights(100001, [7, 0, 13]), [35000, 0, 65001]);
  assert.deepEqual(allocateByWeights(0, [1, 2]), [0, 0]);
  assert.throws(() => allocateByWeights(100, [1, -1]), RangeError);
  for (let cents = 1; cents < 103; cents++) {
    const allocation = allocateByWeights(cents, [19, 7, 31, 43, 1, 8, 12]);
    assert.equal(allocation.reduce((a, b) => a + b, 0), cents);
  }
});
