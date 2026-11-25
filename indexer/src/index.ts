import { ponder } from "ponder:registry";
import {
  allocation,
  allocationEpoch,
  deposit,
  depositor,
  epoch,
  manager,
  managerEpoch,
  protocolStats,
  rebalance,
  statusChange,
  swap,
  vault,
  vaultEpoch,
  withdrawal,
} from "ponder:schema";

const ts = (e: { block: { timestamp: bigint } }) => Number(e.block.timestamp);
const GLOBAL = "global";
const Q96 = 2 ** 96;
const POOL_FEE = 0.003;

async function bumpStats(
  db: any,
  patch: (s: typeof protocolStats.$inferSelect) => Partial<typeof protocolStats.$inferInsert>,
) {
  const zero = { id: GLOBAL, swapCount: 0, volumeUsd: 0, feesUsd: 0, managers: 0, vaults: 0, epochsSettled: 0, lastPrice: 0 };
  const row = (await db.find(protocolStats, { id: GLOBAL })) ?? zero;
  await db.insert(protocolStats).values({ ...row, ...patch(row) }).onConflictDoUpdate(() => patch(row));
}

// ---------------------------------------------------------------- Manager registry
ponder.on("ManagerRegistry:Registered", async ({ event, context }) => {
  const m = event.args.manager;
  const existing = await context.db.find(manager, { address: m });
  await context.db
    .insert(manager)
    .values({
      address: m,
      metadataURI: event.args.metadataURI,
      status: 1,
      stake: 0n,
      pendingStake: event.args.stake,
      allocated: 0n,
      tickLower: event.args.tickLower,
      tickUpper: event.args.tickUpper,
      registeredAt: ts(event),
      epochsSettled: 0,
      rebalances: 0,
      lossesAbsorbed: 0n,
      lossesPassed: 0n,
      feesGenerated: 0n,
      cumulativeReturn: 0,
      maxDrawdown: 0,
      equityPeak: 1,
      coverage: 0,
    })
    .onConflictDoUpdate((row) => ({
      // re-registration after Paused keeps the history
      metadataURI: event.args.metadataURI,
      status: 1,
      pendingStake: row.pendingStake + event.args.stake,
      tickLower: event.args.tickLower,
      tickUpper: event.args.tickUpper,
    }));
  if (!existing) await bumpStats(context.db, (s) => ({ managers: s.managers + 1 }));
});

ponder.on("ManagerRegistry:StakeToppedUp", async ({ event, context }) => {
  await context.db
    .update(manager, { address: event.args.manager })
    .set((row) => ({ pendingStake: row.pendingStake + event.args.amount }));
});

ponder.on("ManagerRegistry:StakeSet", async ({ event, context }) => {
  // emitted by the settler mid-settlement; pending stake has been folded into the book by then
  await context.db.update(manager, { address: event.args.manager }).set({ stake: event.args.stake, pendingStake: 0n });
});

ponder.on("ManagerRegistry:StatusChanged", async ({ event, context }) => {
  await context.db.update(manager, { address: event.args.manager }).set({ status: Number(event.args.status) });
  await context.db.insert(statusChange).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    manager: event.args.manager,
    status: Number(event.args.status),
    timestamp: ts(event),
    txHash: event.transaction.hash,
  });
});

ponder.on("ManagerRegistry:AllocationSet", async ({ event, context }) => {
  const { manager: m, vault: v, amount } = event.args;
  const prev = await context.db.find(allocation, { vault: v, manager: m });
  await context.db
    .insert(allocation)
    .values({ vault: v, manager: m, amount, target: 0n, listed: false, cumulativePnl: 0n })
    .onConflictDoUpdate({ amount });
  const delta = amount - (prev?.amount ?? 0n);
  await context.db.update(manager, { address: m }).set((row) => {
    const allocated = row.allocated + delta;
    return { allocated, coverage: allocated > 0n ? Number(row.stake) / Number(allocated) : 0 };
  });
});

ponder.on("ManagerRegistry:RangeSet", async ({ event, context }) => {
  await context.db.update(manager, { address: event.args.manager }).set((row) => ({
    tickLower: event.args.tickLower,
    tickUpper: event.args.tickUpper,
    rebalances: row.rebalances + 1,
  }));
  await context.db
    .insert(rebalance)
    .values({
      id: event.transaction.hash,
      manager: event.args.manager,
      epoch: Number(event.args.epoch),
      countInEpoch: Number(event.args.count),
      tickLower: event.args.tickLower,
      tickUpper: event.args.tickUpper,
      timestamp: ts(event),
      txHash: event.transaction.hash,
    })
    .onConflictDoNothing();
});

// ---------------------------------------------------------------- PositionBook
ponder.on("PositionBook:Rebalanced", async ({ event, context }) => {
  await context.db.update(rebalance, { id: event.transaction.hash }).set({
    liquidity: event.args.liquidity,
    weth: event.args.weth,
    usdc: event.args.usdc,
    gasUsed: event.transactionReceipt.gasUsed,
  });
});

// ---------------------------------------------------------------- Hook swaps
ponder.on("KancyHook:KancySwap", async ({ event, context }) => {
  const a0 = BigInt(event.args.amount0);
  const a1 = BigInt(event.args.amount1);
  const s = Number(event.args.sqrtPriceX96) / Q96;
  const price = s * s * 1e12; // USDC per WETH (weth = currency0, 18d vs 6d)
  const volumeUsd = Math.abs(Number(a1)) / 1e6;
  await context.db.insert(swap).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    sender: event.args.sender,
    amount0: a0,
    amount1: a1,
    price,
    tick: event.args.tick,
    volumeUsd,
    timestamp: ts(event),
    txHash: event.transaction.hash,
  });
  await bumpStats(context.db, (st) => ({
    swapCount: st.swapCount + 1,
    volumeUsd: st.volumeUsd + volumeUsd,
    feesUsd: st.feesUsd + volumeUsd * POOL_FEE,
    lastPrice: price,
  }));
});

// ---------------------------------------------------------------- Settlement
ponder.on("EpochSettler:EpochSettled", async ({ event, context }) => {
  await context.db
    .insert(epoch)
    .values({
      epoch: Number(event.args.epoch),
      price: event.args.price,
      startedAt: Number(event.args.startedAt),
      settledAt: Number(event.args.settledAt),
      keeper: event.args.keeper,
      txHash: event.transaction.hash,
    })
    .onConflictDoNothing();
  await bumpStats(context.db, (s) => ({ epochsSettled: s.epochsSettled + 1 }));
});

ponder.on("EpochSettler:ManagerSettled", async ({ event, context }) => {
  const a = event.args;
  const m = a.manager;
  const row = await context.db.find(manager, { address: m });
  if (!row) return;

  const capital = Number(a.capitalStart);
  const hadCapital = capital > 0;
  const ret = hadCapital ? Number(a.pnl) / capital : 0;
  const cum = hadCapital ? (1 + row.cumulativeReturn) * (1 + ret) - 1 : row.cumulativeReturn;
  const equity = 1 + cum;
  const peak = Math.max(row.equityPeak, equity);
  const dd = peak > 0 ? (peak - equity) / peak : 0;
  const coverage = a.allocatedAfter > 0n ? Number(a.stakeAfter) / Number(a.allocatedAfter) : 0;

  await context.db.insert(managerEpoch).values({
    id: `${m}-${a.epoch}`,
    manager: m,
    epoch: Number(a.epoch),
    capitalStart: a.capitalStart,
    valueEnd: a.valueEnd,
    pnl: a.pnl,
    returnPct: ret,
    performanceFee: a.performanceFee,
    curatorFees: a.curatorFees,
    fromStake: a.fromStake,
    fromBackers: a.fromBackers,
    stakeAfter: a.stakeAfter,
    allocatedAfter: a.allocatedAfter,
    coverage,
    cumulativeReturn: cum,
    timestamp: ts(event),
  });

  await context.db.update(manager, { address: m }).set({
    stake: a.stakeAfter,
    pendingStake: 0n,
    allocated: a.allocatedAfter,
    coverage,
    epochsSettled: row.epochsSettled + (hadCapital ? 1 : 0),
    lossesAbsorbed: row.lossesAbsorbed + a.fromStake,
    lossesPassed: row.lossesPassed + a.fromBackers,
    feesGenerated: row.feesGenerated + a.performanceFee,
    cumulativeReturn: cum,
    equityPeak: peak,
    maxDrawdown: Math.max(row.maxDrawdown, dd),
  });
});

ponder.on("EpochSettler:VaultManagerPnl", async ({ event, context }) => {
  const { vault: v, manager: m, epoch: e, pnl } = event.args;
  await context.db.insert(allocationEpoch).values({
    id: `${v}-${m}-${e}`,
    vault: v,
    manager: m,
    epoch: Number(e),
    pnl,
    timestamp: ts(event),
  });
  await context.db
    .insert(allocation)
    .values({ vault: v, manager: m, amount: 0n, target: 0n, listed: false, cumulativePnl: pnl })
    .onConflictDoUpdate((row) => ({ cumulativePnl: row.cumulativePnl + pnl }));
});

// ---------------------------------------------------------------- Vaults
ponder.on("VaultFactory:VaultCreated", async ({ event, context }) => {
  const a = event.args;
  await context.db.insert(vault).values({
    address: a.vault,
    curator: a.curator,
    name: a.name,
    metadataURI: a.metadataURI,
    curatorCutBps: a.curatorCutBps,
    minRatioBps: a.minRatioBps,
    maxAllocation: a.maxAllocation,
    createdAt: ts(event),
    nav: 0n,
    supply: 0n,
    lastSettledEpoch: 0,
    totalDeposited: 0n,
    depositors: 0,
  });
  await bumpStats(context.db, (s) => ({ vaults: s.vaults + 1 }));
});

ponder.on("KancyVault:Deposit", async ({ event, context }) => {
  const v = event.log.address;
  const seen = await context.db.find(depositor, { vault: v, user: event.args.user });
  if (!seen) await context.db.insert(depositor).values({ vault: v, user: event.args.user, firstDepositAt: ts(event) });
  await context.db.insert(deposit).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    vault: v,
    user: event.args.user,
    assets: event.args.assets,
    shares: event.args.shares,
    timestamp: ts(event),
    txHash: event.transaction.hash,
  });
  await context.db.update(vault, { address: v }).set((row) => ({
    totalDeposited: row.totalDeposited + event.args.assets,
    depositors: row.depositors + (seen ? 0 : 1),
  }));
});

const withdrawalEvent =
  (kind: "requested" | "cancelled" | "claimed") =>
  async ({ event, context }: any) => {
    await context.db.insert(withdrawal).values({
      id: `${event.transaction.hash}-${event.log.logIndex}`,
      vault: event.log.address,
      user: event.args.user,
      kind,
      epoch: Number(event.args.epoch),
      shares: event.args.shares,
      assets: event.args.assets ?? 0n,
      timestamp: ts(event),
      txHash: event.transaction.hash,
    });
  };
ponder.on("KancyVault:WithdrawRequested", withdrawalEvent("requested"));
ponder.on("KancyVault:WithdrawCancelled", withdrawalEvent("cancelled"));
ponder.on("KancyVault:Claimed", withdrawalEvent("claimed"));

ponder.on("KancyVault:ManagerAdded", async ({ event, context }) => {
  await context.db
    .insert(allocation)
    .values({ vault: event.log.address, manager: event.args.manager, amount: 0n, target: 0n, listed: true, cumulativePnl: 0n })
    .onConflictDoUpdate({ listed: true });
});
ponder.on("KancyVault:ManagerRemoved", async ({ event, context }) => {
  await context.db
    .insert(allocation)
    .values({ vault: event.log.address, manager: event.args.manager, amount: 0n, target: 0n, listed: false, cumulativePnl: 0n })
    .onConflictDoUpdate({ listed: false, target: 0n });
});
ponder.on("KancyVault:TargetSet", async ({ event, context }) => {
  await context.db
    .insert(allocation)
    .values({ vault: event.log.address, manager: event.args.manager, amount: 0n, target: event.args.amount, listed: true, cumulativePnl: 0n })
    .onConflictDoUpdate({ target: event.args.amount });
});
ponder.on("KancyVault:ConfigQueued", async ({ event, context }) => {
  const a = event.args;
  await context.db.update(vault, { address: event.log.address }).set({
    pendingConfig: JSON.stringify({
      curatorCutBps: a.curatorCutBps,
      minRatioBps: a.minRatioBps,
      maxAllocation: a.maxAllocation.toString(),
      effectiveEpoch: Number(a.effectiveEpoch),
    }),
  });
});
ponder.on("KancyVault:VaultSettled", async ({ event, context }) => {
  const a = event.args;
  await context.db.update(vault, { address: event.log.address }).set({
    nav: a.nav,
    supply: a.supply,
    lastSettledEpoch: Number(a.epoch),
  });
  await context.db.insert(vaultEpoch).values({
    id: `${event.log.address}-${a.epoch}`,
    vault: event.log.address,
    epoch: Number(a.epoch),
    nav: a.nav,
    supply: a.supply,
    sharePrice: a.supply > 0n ? Number(a.nav) / Number(a.supply) : 1,
    withdrawShares: a.withdrawShares,
    withdrawAssets: a.withdrawAssets,
    timestamp: ts(event),
  });
});
