import { config } from "./config.js";
import { log, publicClient, sleep, walletFor } from "./chain.js";
import { keeperStep } from "./keeper.js";
import { trafficSetup, trafficStep } from "./traffic.js";
import { balances, fmtUsd, readPrices } from "./pool.js";
import { settlerAbi, erc20Abi } from "./abi.js";

const cmd = process.argv[2] ?? "run";

async function status() {
  const { settler, usdc } = config.addr;
  const [px, epoch, endsAt, block, bounty, settlerUsdc] = await Promise.all([
    readPrices(),
    publicClient.readContract({ address: settler, abi: settlerAbi, functionName: "currentEpoch" }),
    publicClient.readContract({ address: settler, abi: settlerAbi, functionName: "epochEndsAt" }),
    publicClient.getBlock(),
    publicClient.readContract({ address: settler, abi: settlerAbi, functionName: "keeperBounty" }),
    publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [settler] }),
  ]);
  const left = Number(endsAt) - Number(block.timestamp);
  console.log(`oracle ${fmtUsd(px.oraclePrice)} | pool ${fmtUsd(px.poolPrice)} | gap ${px.gapBps} bps`);
  console.log(`epoch ${epoch} | ${left > 0 ? `ends in ${left}s` : `OVERDUE by ${-left}s (settleable)`}`);
  console.log(`keeper bounty ${fmtUsd(bounty)} mUSDC | settler holds ${fmtUsd(settlerUsdc)} mUSDC`);
  if (process.env.PRIVATE_KEY) {
    const s = walletFor(config.trafficKey());
    const b = await balances(s.account.address);
    const eth = await publicClient.getBalance({ address: s.account.address });
    console.log(`bot ${s.account.address} | ${Number(eth) / 1e18} ETH | ${fmtUsd(b.usdc)} mUSDC | ${Number(b.weth) / 1e18} mWETH`);
  }
}

async function loop(name: string, step: () => Promise<unknown>) {
  for (;;) {
    try { await step(); } catch (e) { log(name, `error: ${(e as Error).message.split("\n")[0]}`); }
    await sleep(config.loopIntervalSec * 1000);
  }
}

async function main() {
  if (cmd === "status") return status();
  const t = walletFor(config.trafficKey());
  const k = walletFor(config.keeperKey());
  log("boot", `cmd=${cmd} traffic=${t.account.address} keeper=${k.account.address}`);

  if (cmd === "traffic") {
    await trafficSetup(t);
    return loop("traffic", () => trafficStep(t));
  }
  if (cmd === "keeper") {
    await trafficSetup(k); // keeper may need to arb before settling
    return loop("keeper", () => keeperStep(k));
  }
  if (cmd === "run") {
    // single sequential loop avoids nonce clashes when both use the same key
    await trafficSetup(t);
    if (k.account.address !== t.account.address) await trafficSetup(k);
    return loop("run", async () => {
      await keeperStep(k, k.account.address === t.account.address ? t : k);
      await trafficStep(t);
    });
  }
  console.error("usage: tsx src/index.ts [run|traffic|keeper|status]");
  process.exit(1);
}
main();
