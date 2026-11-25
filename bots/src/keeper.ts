import { config } from "./config.js";
import { log, publicClient, type Signer } from "./chain.js";
import { settlerAbi, oracleAbi } from "./abi.js";
import { arbToOracle, fmtUsd, readPrices } from "./pool.js";

/**
 * One pass: if the epoch is over, arbitrage the pool toward the oracle when the gap is large (settlement reverts
 * past maxDeviation, PRD §19.8), then call settleEpoch(). Returns true when an epoch was settled.
 */
export async function keeperStep(s: Signer, arbSigner: Signer = s): Promise<boolean> {
  const { settler, oracle } = config.addr;
  const [endsAt, block] = await Promise.all([
    publicClient.readContract({ address: settler, abi: settlerAbi, functionName: "epochEndsAt" }),
    publicClient.getBlock(),
  ]);
  if (block.timestamp < endsAt) return false;

  const [maxDev, px] = await Promise.all([
    publicClient.readContract({ address: oracle, abi: oracleAbi, functionName: "maxDeviationBps" }),
    readPrices(),
  ]);
  const gate = Math.floor(Number(maxDev) * config.keeperPreArbFraction);
  if (Math.abs(px.gapBps) > gate) {
    log("keeper", `gap ${px.gapBps}bps > ${gate}bps, arbitraging before settle`);
    await arbToOracle(arbSigner, 1);
  }

  try {
    const { request } = await publicClient.simulateContract({
      account: s.account, address: settler, abi: settlerAbi, functionName: "settleEpoch",
    });
    const hash = await s.wallet.writeContract(request);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error("settleEpoch reverted onchain");
    const epoch = await publicClient.readContract({ address: settler, abi: settlerAbi, functionName: "currentEpoch", blockNumber: r.blockNumber });
    log("keeper", `settled -> now epoch ${epoch} | gas ${r.gasUsed} | oracle ${fmtUsd(px.oraclePrice)} tx ${hash}`);
    return true;
  } catch (e) {
    log("keeper", `settle failed (will retry): ${(e as Error).message.split("\n")[0]}`);
    return false;
  }
}
