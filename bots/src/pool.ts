import { type Address, maxUint256 } from "viem";
import { bookAbi, erc20Abi, oracleAbi, routerAbi } from "./abi.js";
import { publicClient, log, type Signer } from "./chain.js";
import { config } from "./config.js";

const { usdc, weth, hook, oracle, book } = config.addr;

// Pool tokens are sorted by address; the oracle adapter tells us which side WETH is.
const wethIs0 = weth.toLowerCase() < usdc.toLowerCase();
export const poolKey = {
  currency0: wethIs0 ? weth : usdc,
  currency1: wethIs0 ? usdc : weth,
  fee: config.poolFee,
  tickSpacing: config.tickSpacing,
  hooks: hook,
};

const MIN_SQRT = 4295128739n + 1n;
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n - 1n;

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}

/** sqrtPriceX96 for a price expressed as USDC (6d) per 1 WETH. */
export function sqrtPriceFor(p6: bigint): bigint {
  // raw token1/token0: weth is currency0 => usdcRaw/wethRaw = p6 / 1e18; else inverse
  const num = wethIs0 ? p6 : 10n ** 18n;
  const den = wethIs0 ? 10n ** 18n : p6;
  const s = isqrt((num << 192n) / den);
  return s < MIN_SQRT ? MIN_SQRT : s > MAX_SQRT ? MAX_SQRT : s;
}

export async function readPrices() {
  const [oraclePrice, sqrt] = await Promise.all([
    publicClient.readContract({ address: oracle, abi: oracleAbi, functionName: "price" }),
    publicClient.readContract({ address: book, abi: bookAbi, functionName: "poolSqrtPrice" }),
  ]);
  const poolPrice = await publicClient.readContract({
    address: oracle, abi: oracleAbi, functionName: "poolPrice", args: [sqrt],
  });
  const gapBps = Number(((poolPrice - oraclePrice) * 10_000n) / oraclePrice);
  return { oraclePrice, poolPrice, sqrt, gapBps };
}

export const fmtUsd = (p6: bigint) => (Number(p6) / 1e6).toFixed(2);

export async function balances(who: Address) {
  const [u, w] = await Promise.all([
    publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [who] }),
    publicClient.readContract({ address: weth, abi: erc20Abi, functionName: "balanceOf", args: [who] }),
  ]);
  return { usdc: u, weth: w };
}

export async function ensureApprovals(s: Signer) {
  for (const token of [usdc, weth]) {
    const a = await publicClient.readContract({
      address: token, abi: erc20Abi, functionName: "allowance", args: [s.account.address, config.swapRouter],
    });
    if (a < 2n ** 200n) {
      const h = await s.wallet.writeContract({
        address: token, abi: erc20Abi, functionName: "approve", args: [config.swapRouter, maxUint256],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      log("approve", `${token} -> router`);
    }
  }
}

/** Claim faucet if the signer is short and cooldown allows. */
export async function topUpFromFaucet(s: Signer) {
  for (const token of [usdc, weth]) {
    const last = await publicClient.readContract({
      address: token, abi: erc20Abi, functionName: "lastDrip", args: [s.account.address],
    });
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (last === 0n || now >= last + 86_400n) {
      try {
        const h = await s.wallet.writeContract({ address: token, abi: erc20Abi, functionName: "faucet" });
        await publicClient.waitForTransactionReceipt({ hash: h });
        log("faucet", `claimed ${token}`);
      } catch (e) {
        log("faucet", `skip ${token}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
  }
}

/** Exact-input swap that stops at `limitSqrt`. `sellWeth` = pay WETH, receive USDC. */
export async function swap(
  s: Signer, sellWeth: boolean, amountIn: bigint, limitSqrt: bigint,
) {
  const zeroForOne = sellWeth === wethIs0;
  const args = [
    poolKey,
    { zeroForOne, amountSpecified: -amountIn, sqrtPriceLimitX96: limitSqrt },
    { takeClaims: false, settleUsingBurn: false },
    "0x",
  ] as const;
  const { request } = await publicClient.simulateContract({
    account: s.account, address: config.swapRouter, abi: routerAbi, functionName: "swap", args,
  });
  const hash = await s.wallet.writeContract(request);
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`swap reverted ${hash}`);
  return hash;
}

/**
 * Move the pool price to the oracle price (arbitrage). Returns true if a swap was sent.
 * Pool above oracle -> sell WETH into the pool (price falls). Below -> sell USDC (price rises).
 */
export async function arbToOracle(s: Signer, thresholdBps: number): Promise<boolean> {
  const { oraclePrice, poolPrice, gapBps } = await readPrices();
  if (Math.abs(gapBps) < thresholdBps) return false;
  const target = sqrtPriceFor(oraclePrice);
  const sellWeth = poolPrice > oraclePrice;
  const bal = await balances(s.account.address);
  const amountIn = sellWeth ? bal.weth : bal.usdc;
  if (amountIn === 0n) {
    log("arb", `gap ${gapBps}bps but no ${sellWeth ? "mWETH" : "mUSDC"} to trade`);
    return false;
  }
  const hash = await swap(s, sellWeth, amountIn, target);
  const after = await readPrices();
  log("arb", `${sellWeth ? "sold mWETH" : "sold mUSDC"} | pool ${fmtUsd(poolPrice)} -> ${fmtUsd(after.poolPrice)} (oracle ${fmtUsd(oraclePrice)}) tx ${hash}`);
  return true;
}
