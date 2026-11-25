import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { type Address, type Hex, isHex } from "viem";

const here = dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (no dependency)
try {
  const raw = readFileSync(resolve(here, "../.env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trimStart().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {}

const dep = JSON.parse(
  readFileSync(resolve(here, "../../contracts/deployments/unichain-sepolia.json"), "utf8"),
) as Record<string, any>;

const num = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);

function key(name: string, fallback?: string): Hex {
  const v = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
  if (!v || !isHex(v) || v.length !== 66) throw new Error(`${name} missing or not a 32-byte hex key`);
  return v;
}

export const config = {
  chainId: dep.chainId as number,
  rpcUrl: process.env.RPC_URL ?? "https://sepolia.unichain.org",
  swapRouter: (process.env.SWAP_ROUTER ?? "0x9140a78c1a137c7ff1c151ec8231272af78a99a4") as Address,
  addr: {
    usdc: dep.mUSDC as Address,
    weth: dep.mWETH as Address,
    hook: dep.kancyHook as Address,
    oracle: dep.oracleAdapter as Address,
    book: dep.positionBook as Address,
    settler: dep.epochSettler as Address,
  },
  poolFee: dep.poolFee as number,
  tickSpacing: dep.tickSpacing as number,
  loopIntervalSec: num("LOOP_INTERVAL_SEC", 30),
  arbThresholdBps: num("ARB_THRESHOLD_BPS", 40),
  noiseProb: num("NOISE_PROB", 0.6),
  noiseMinUsd: num("NOISE_MIN_USD", 20),
  noiseMaxUsd: num("NOISE_MAX_USD", 300),
  keeperPreArbFraction: num("KEEPER_PREARB_FRACTION", 0.5),
  trafficKey: () => key("PRIVATE_KEY"),
  keeperKey: () => key("KEEPER_PRIVATE_KEY", "PRIVATE_KEY"),
};
