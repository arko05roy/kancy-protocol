import assert from "node:assert/strict";
import { test } from "node:test";
import { planSwap, rangeFromPrices, tickToUsd, usdToTick, waterfall } from "./math.ts";

test("stake absorbs the whole loss while it lasts", () => {
  const w = waterfall(2000, 10_000, 0.1);
  assert.equal(w.fromStake, 1200);
  assert.equal(w.fromBackers, 0);
  assert.equal(w.backersAfter, 10_000);
});

test("backers only lose what the stake cannot cover", () => {
  const w = waterfall(2000, 10_000, 0.25);
  assert.equal(w.fromStake, 2000);
  assert.equal(w.fromBackers, 1000);
  assert.equal(w.stakeAfter, 0);
});

test("ticks round-trip to prices and stay on the spacing", () => {
  assert.ok(Math.abs(tickToUsd(usdToTick(1700)) - 1700) < 0.2);
  const [lo, hi] = rangeFromPrices(1666, 1734, 60);
  assert.equal(Math.abs(lo % 60), 0);
  assert.equal(Math.abs(hi % 60), 0);
  assert.ok(tickToUsd(lo) <= 1666 && tickToUsd(hi) >= 1734);
});

test("a USDC-only book buys WETH to fill an in-range position", () => {
  const price = 1700;
  const sqrt = BigInt(Math.floor(Math.sqrt(price * 1e-12) * 2 ** 96));
  const [lo, hi] = rangeFromPrices(1666, 1734, 60);
  const plan = planSwap({ liquidity: 0n, tickLower: lo, tickUpper: hi, weth: 0n, usdc: 2_000_000_000n }, sqrt, lo, hi);
  assert.equal(plan.sellWeth, false);
  assert.ok(plan.amountIn > 600_000_000n && plan.amountIn < 1_400_000_000n);
});
