import { config } from "./config.js";
import { log, type Signer } from "./chain.js";
import { arbToOracle, balances, ensureApprovals, fmtUsd, readPrices, swap, sqrtPriceFor, topUpFromFaucet } from "./pool.js";

/** One pass: arbitrage back to the oracle, then maybe a random noise swap to create fee volume. */
export async function trafficStep(s: Signer) {
  const { oraclePrice } = await readPrices();
  await arbToOracle(s, config.arbThresholdBps);

  if (Math.random() > config.noiseProb) return;
  const usd = config.noiseMinUsd + Math.random() * (config.noiseMaxUsd - config.noiseMinUsd);
  const sellWeth = Math.random() < 0.5;
  const bal = await balances(s.account.address);

  // size in the input token, capped by what we hold
  let amountIn: bigint;
  if (sellWeth) {
    amountIn = BigInt(Math.floor((usd / (Number(oraclePrice) / 1e6)) * 1e18));
    if (amountIn > bal.weth) amountIn = bal.weth;
  } else {
    amountIn = BigInt(Math.floor(usd * 1e6));
    if (amountIn > bal.usdc) amountIn = bal.usdc;
  }
  if (amountIn === 0n) return log("noise", "out of inventory, skipping");

  // noise swap may not push the pool beyond 2x the arb threshold from oracle
  const band = config.arbThresholdBps * 2;
  const limit = sqrtPriceFor(
    sellWeth
      ? (oraclePrice * BigInt(10_000 - band)) / 10_000n
      : (oraclePrice * BigInt(10_000 + band)) / 10_000n,
  );
  // skip if the pool already sits past the band (price limit would be on the wrong side of the current price)
  const { sqrt } = await readPrices();
  if (sellWeth ? limit >= sqrt : limit <= sqrt) return log("noise", "pool outside noise band, leaving it to the arb");
  const hash = await swap(s, sellWeth, amountIn, limit);
  log("noise", `${sellWeth ? "sell mWETH" : "sell mUSDC"} ~$${usd.toFixed(0)} tx ${hash} (oracle ${fmtUsd(oraclePrice)})`);
}

export async function trafficSetup(s: Signer) {
  await topUpFromFaucet(s);
  await ensureApprovals(s);
}
