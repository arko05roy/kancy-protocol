/** Pure maths shared by the UI. Mirrors EpochSettler (waterfall) and the manager bot (swap sizing, ticks). */

export type Waterfall = {
  capital: number;
  loss: number;
  fromStake: number;
  fromBackers: number;
  stakeAfter: number;
  backersAfter: number;
};

/** PRD §6.4: the stake absorbs the loss on the whole book first; backers only lose what is left over. */
export function waterfall(stake: number, allocated: number, lossFraction: number): Waterfall {
  const capital = stake + allocated;
  const loss = capital * Math.min(Math.max(lossFraction, 0), 1);
  const fromStake = Math.min(loss, stake);
  const fromBackers = loss - fromStake;
  return { capital, loss, fromStake, fromBackers, stakeAfter: stake - fromStake, backersAfter: allocated - fromBackers };
}

const LN = Math.log(1.0001);
const Q96 = 2 ** 96;

/** Pool is mWETH (18d, currency0) / mUSDC (6d, currency1). */
export const tickToUsd = (tick: number) => Math.pow(1.0001, tick) * 1e12;
export const usdToTick = (usd: number) => Math.floor(Math.log(usd * 1e-12) / LN);
export const tickDown = (t: number, spacing: number) => Math.floor(t / spacing) * spacing;
export const tickUp = (t: number, spacing: number) => Math.ceil(t / spacing) * spacing;

export function rangeFromPrices(low: number, high: number, spacing: number): [number, number] {
  const lo = tickDown(usdToTick(low), spacing);
  let hi = tickUp(usdToTick(high), spacing);
  if (hi <= lo) hi = lo + spacing;
  return [lo, hi];
}

const sqrtAtTick = (t: number) => Math.pow(1.0001, t / 2);

export function amountsForLiquidity(L: number, s: number, sa: number, sb: number) {
  if (s <= sa) return { x: L * (1 / sa - 1 / sb), y: 0 };
  if (s >= sb) return { x: 0, y: L * (sb - sa) };
  return { x: L * (1 / s - 1 / sb), y: L * (s - sa) };
}

export type Book = { liquidity: bigint; tickLower: number; tickUpper: number; weth: bigint; usdc: bigint };

/** Raw token inventory if the position were removed now: idle balances plus the position's underlying. */
export function inventory(book: Book, sqrtPriceX96: bigint) {
  const s = Number(sqrtPriceX96) / Q96;
  const pos = amountsForLiquidity(Number(book.liquidity), s, sqrtAtTick(book.tickLower), sqrtAtTick(book.tickUpper));
  return { weth: Number(book.weth) + pos.x, usdc: Number(book.usdc) + pos.y };
}

/** Swap needed so that all inventory can be deployed into [lo, hi] at the current pool price (PRD D22). */
export function planSwap(book: Book, sqrtPriceX96: bigint, lo: number, hi: number) {
  const s = Number(sqrtPriceX96) / Q96;
  const { weth: w, usdc: u } = inventory(book, sqrtPriceX96);
  const { x, y } = amountsForLiquidity(1, s, sqrtAtTick(lo), sqrtAtTick(hi));
  const p = s * s;
  const total = w * p + u;
  const vW = x * p;
  const f = vW + y === 0 ? 0 : vW / (vW + y);
  const diff = w - (f * total) / p;
  return diff > 0
    ? { sellWeth: true, amountIn: BigInt(Math.floor(Math.min(diff, w) * 0.9999)) }
    : { sellWeth: false, amountIn: BigInt(Math.floor(Math.min(-diff * p, u) * 0.9999)) };
}
