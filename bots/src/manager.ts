import { config } from "./config.js";
import { bookFullAbi, erc20Abi, registryAbi, settlerAbi } from "./abi.js";
import { log, publicClient, type Signer } from "./chain.js";
import { fmtUsd, readPrices, topUpFromFaucet } from "./pool.js";
import { maxUint256 } from "viem";

export type Strategy = "centered" | "bad";
const { registry, book, settler, usdc } = config.addr;
const SPACING = config.tickSpacing;
const LN = Math.log(1.0001);
const Q96 = 2 ** 96;

// ---- float helpers (weth = currency0, raw units). Good enough for sizing swaps; the contract does exact maths.
const sqrtOf = (sqrtX96: bigint) => Number(sqrtX96) / Q96;
const tickOfSqrt = (s: number) => Math.floor((2 * Math.log(s)) / LN);
const sqrtAtTick = (t: number) => Math.pow(1.0001, t / 2);
const tickOfUsd = (p: number) => Math.floor(Math.log(p * 1e-12) / LN);
const down = (t: number) => Math.floor(t / SPACING) * SPACING;
const up = (t: number) => Math.ceil(t / SPACING) * SPACING;

function amountsForLiquidity(L: number, s: number, sa: number, sb: number) {
  if (s <= sa) return { x: L * (1 / sa - 1 / sb), y: 0 };
  if (s >= sb) return { x: 0, y: L * (sb - sa) };
  return { x: L * (1 / s - 1 / sb), y: L * (s - sa) };
}

/** Swap needed so that all inventory can be deployed into [lo, hi] at the current price. */
function planSwap(w: number, u: number, s: number, lo: number, hi: number) {
  const { x, y } = amountsForLiquidity(1, s, sqrtAtTick(lo), sqrtAtTick(hi));
  const pRaw = s * s;
  const total = w * pRaw + u;
  const vW = x * pRaw;
  const f = vW + y === 0 ? 0 : vW / (vW + y);
  const targetW = (f * total) / pRaw;
  const diff = w - targetW;
  return diff > 0
    ? { sellWeth: true, amountIn: BigInt(Math.floor(Math.min(diff, w) * 0.9999)) }
    : { sellWeth: false, amountIn: BigInt(Math.floor(Math.min(-diff * pRaw, u) * 0.9999)) };
}

export async function managerSetup(s: Signer, label: string) {
  const me = s.account.address;
  const info = await publicClient.readContract({ address: registry, abi: registryAbi, functionName: "getManager", args: [me] });
  if (info.status !== 0 && !(info.status === 4 && info.stake === 0n)) return log(label, `already registered (status ${info.status})`);

  const bal = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [me] });
  if (bal < config.managerStake) await topUpFromFaucet(s);
  const allowance = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "allowance", args: [me, registry] });
  if (allowance < config.managerStake) {
    const h = await s.wallet.writeContract({ address: usdc, abi: erc20Abi, functionName: "approve", args: [registry, maxUint256] });
    await publicClient.waitForTransactionReceipt({ hash: h });
  }
  const { oraclePrice } = await readPrices();
  const c = tickOfUsd(Number(oraclePrice) / 1e6);
  const pct = config.centeredRangePct / 100;
  const lo = down(tickOfUsd((Number(oraclePrice) / 1e6) * (1 - pct)));
  const hi = up(tickOfUsd((Number(oraclePrice) / 1e6) * (1 + pct)));
  const meta = `kancy-manager-bot:${label}`;
  const h = await s.wallet.writeContract({
    address: registry, abi: registryAbi, functionName: "register", args: [meta, config.managerStake, lo, hi],
  });
  await publicClient.waitForTransactionReceipt({ hash: h });
  log(label, `registered with ${fmtUsd(config.managerStake)} mUSDC stake, range ${lo}..${hi} (tick ${c}) tx ${h}`);
}

export async function managerStep(s: Signer, strategy: Strategy, label: string) {
  const me = s.account.address;
  const [info, bk, epoch, maxRb, px] = await Promise.all([
    publicClient.readContract({ address: registry, abi: registryAbi, functionName: "getManager", args: [me] }),
    publicClient.readContract({ address: book, abi: bookFullAbi, functionName: "books", args: [me] }),
    publicClient.readContract({ address: settler, abi: settlerAbi, functionName: "currentEpoch" }),
    publicClient.readContract({ address: registry, abi: registryAbi, functionName: "maxRebalancesPerEpoch" }),
    readPrices(),
  ]);
  if (info.status === 0 || info.status === 4) return log(label, `status ${info.status}, nothing to do`);
  const [liquidity, bl, bu, idleW, idleU] = bk;
  if (liquidity === 0n && idleW === 0n && idleU === 0n) return log(label, "stake not deployed yet (waits for first settlement)");

  const used = info.rebalanceEpoch === epoch ? info.rebalanceCount : 0;
  const s0 = sqrtOf(px.sqrt);
  const tick = tickOfSqrt(s0);
  const done = info.rebalanceEpoch === epoch; // already rebalanced this epoch

  // total inventory after the contract removes our liquidity
  const pos = amountsForLiquidity(Number(liquidity), s0, sqrtAtTick(bl), sqrtAtTick(bu));
  const w = Number(idleW) + pos.x;
  const u = Number(idleU) + pos.y;

  let lo: number, hi: number, why: string;
  let target: { sellWeth: boolean; amountIn: bigint } | undefined;

  if (strategy === "centered") {
    if (used >= maxRb - 1) return;
    const pct = config.centeredRangePct / 100;
    const mid = Number(px.oraclePrice) / 1e6;
    const width = bu - bl;
    const inner = width * config.centeredInnerFraction;
    const outsideInner = tick < bl + inner || tick > bu - inner;
    const newEpoch = !done;
    if (!newEpoch && !outsideInner) return;
    lo = down(tickOfUsd(mid * (1 - pct)));
    hi = up(tickOfUsd(mid * (1 + pct)));
    why = newEpoch ? "new epoch" : "price left inner band";
  } else {
    // "bad": churn the whole book between one-sided, out-of-range positions: pays swap fees, earns none
    if (used >= maxRb - 2) return;
    if (done && Math.random() > config.badChance) return;
    const holdingWeth = tick < bl; // range above price => all WETH
    if (holdingWeth) { hi = down(tick) - SPACING; lo = hi - 10 * SPACING; why = "flip to all-USDC"; }
    else { lo = up(tick) + SPACING; hi = lo + 10 * SPACING; why = "flip to all-WETH"; }
    target = holdingWeth ? { sellWeth: true, amountIn: BigInt(Math.floor(w * 0.9999)) } : { sellWeth: false, amountIn: BigInt(Math.floor(u * 0.9999)) };
    if (liquidity === 0n && !holdingWeth && w === 0) { /* fresh USDC-only book: flip to WETH */ }
  }

  const plan = target ?? planSwap(w, u, s0, lo, hi);
  const h = await s.wallet.writeContract({
    address: book, abi: bookFullAbi, functionName: "rebalance", args: [lo, hi, plan.sellWeth, plan.amountIn],
  });
  const r = await publicClient.waitForTransactionReceipt({ hash: h });
  if (r.status !== "success") throw new Error(`rebalance reverted ${h}`);
  log(label, `[${strategy}] ${why}: range ${lo}..${hi}, swap ${plan.amountIn === 0n ? "none" : (plan.sellWeth ? "mWETH->mUSDC " : "mUSDC->mWETH ") + plan.amountIn} (#${used + 1}/${maxRb}) tx ${h}`);
}
