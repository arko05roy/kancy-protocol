import { index, onchainTable, primaryKey } from "ponder";

/** Status enum from ManagerRegistry: 0 None, 1 SelfOnly, 2 Active, 3 Grace, 4 Paused. */

// ---------------------------------------------------------------- epochs
export const epoch = onchainTable("epoch", (t) => ({
  epoch: t.integer().primaryKey(),
  price: t.bigint().notNull(), // USDC (6d) per WETH at settlement
  startedAt: t.integer().notNull(),
  settledAt: t.integer().notNull(),
  keeper: t.hex().notNull(),
  txHash: t.hex().notNull(),
}));

// ---------------------------------------------------------------- managers + Scoreboard (PRD §10)
export const manager = onchainTable("manager", (t) => ({
  address: t.hex().primaryKey(),
  metadataURI: t.text().notNull(),
  status: t.integer().notNull(),
  stake: t.bigint().notNull(),
  pendingStake: t.bigint().notNull(),
  allocated: t.bigint().notNull(), // A_m across vaults
  tickLower: t.integer().notNull(),
  tickUpper: t.integer().notNull(),
  registeredAt: t.integer().notNull(),
  epochsSettled: t.integer().notNull(),
  rebalances: t.integer().notNull(),
  lossesAbsorbed: t.bigint().notNull(), // Σ fromStake
  lossesPassed: t.bigint().notNull(), // Σ fromBackers (protection-failure metric)
  feesGenerated: t.bigint().notNull(), // Σ performance fee
  cumulativeReturn: t.real().notNull(), // compounded, 0.05 = +5%
  maxDrawdown: t.real().notNull(), // 0..1 over cumulative return
  equityPeak: t.real().notNull(),
  coverage: t.real().notNull(), // S_m / A_m (0 when nothing allocated)
}));

export const managerEpoch = onchainTable(
  "manager_epoch",
  (t) => ({
    id: t.text().primaryKey(), // manager-epoch
    manager: t.hex().notNull(),
    epoch: t.integer().notNull(),
    capitalStart: t.bigint().notNull(), // C_m
    valueEnd: t.bigint().notNull(), // V_m
    pnl: t.bigint().notNull(),
    returnPct: t.real().notNull(), // pnl / C_m
    performanceFee: t.bigint().notNull(),
    curatorFees: t.bigint().notNull(),
    fromStake: t.bigint().notNull(),
    fromBackers: t.bigint().notNull(),
    stakeAfter: t.bigint().notNull(),
    allocatedAfter: t.bigint().notNull(),
    coverage: t.real().notNull(),
    cumulativeReturn: t.real().notNull(),
    timestamp: t.integer().notNull(),
  }),
  (t) => ({ byManager: index().on(t.manager) }),
);

export const statusChange = onchainTable(
  "status_change",
  (t) => ({
    id: t.text().primaryKey(),
    manager: t.hex().notNull(),
    status: t.integer().notNull(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({ byManager: index().on(t.manager) }),
);

// ---------------------------------------------------------------- vaults
export const vault = onchainTable("vault", (t) => ({
  address: t.hex().primaryKey(),
  curator: t.hex().notNull(),
  name: t.text().notNull(),
  metadataURI: t.text().notNull(),
  curatorCutBps: t.integer().notNull(),
  minRatioBps: t.integer().notNull(),
  maxAllocation: t.bigint().notNull(),
  pendingConfig: t.text(), // JSON of a queued config change, with effectiveEpoch
  createdAt: t.integer().notNull(),
  nav: t.bigint().notNull(), // last settled NAV
  supply: t.bigint().notNull(), // last settled share supply
  lastSettledEpoch: t.integer().notNull(),
  totalDeposited: t.bigint().notNull(),
  depositors: t.integer().notNull(),
}));

export const vaultEpoch = onchainTable(
  "vault_epoch",
  (t) => ({
    id: t.text().primaryKey(), // vault-epoch
    vault: t.hex().notNull(),
    epoch: t.integer().notNull(),
    nav: t.bigint().notNull(),
    supply: t.bigint().notNull(),
    sharePrice: t.real().notNull(), // nav / supply
    withdrawShares: t.bigint().notNull(),
    withdrawAssets: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
  }),
  (t) => ({ byVault: index().on(t.vault) }),
);

/** Current Allocation of a Vault to a Manager (and the Curator's target). */
export const allocation = onchainTable(
  "allocation",
  (t) => ({
    vault: t.hex().notNull(),
    manager: t.hex().notNull(),
    amount: t.bigint().notNull(),
    target: t.bigint().notNull(),
    listed: t.boolean().notNull(),
    cumulativePnl: t.bigint().notNull(),
  }),
  (t) => ({ pk: primaryKey({ columns: [t.vault, t.manager] }), byManager: index().on(t.manager) }),
);

export const allocationEpoch = onchainTable(
  "allocation_epoch",
  (t) => ({
    id: t.text().primaryKey(), // vault-manager-epoch
    vault: t.hex().notNull(),
    manager: t.hex().notNull(),
    epoch: t.integer().notNull(),
    pnl: t.bigint().notNull(), // this Vault's share of the Manager result (negative = loss passed to backers)
    timestamp: t.integer().notNull(),
  }),
  (t) => ({ byVault: index().on(t.vault), byManager: index().on(t.manager) }),
);

export const deposit = onchainTable(
  "deposit",
  (t) => ({
    id: t.text().primaryKey(),
    vault: t.hex().notNull(),
    user: t.hex().notNull(),
    assets: t.bigint().notNull(),
    shares: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({ byUser: index().on(t.user), byVault: index().on(t.vault) }),
);

export const depositor = onchainTable(
  "depositor",
  (t) => ({ vault: t.hex().notNull(), user: t.hex().notNull(), firstDepositAt: t.integer().notNull() }),
  (t) => ({ pk: primaryKey({ columns: [t.vault, t.user] }) }),
);

/** kind: requested | cancelled | claimed */
export const withdrawal = onchainTable(
  "withdrawal",
  (t) => ({
    id: t.text().primaryKey(),
    vault: t.hex().notNull(),
    user: t.hex().notNull(),
    kind: t.text().notNull(),
    epoch: t.integer().notNull(),
    shares: t.bigint().notNull(),
    assets: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({ byUser: index().on(t.user), byVault: index().on(t.vault) }),
);

// ---------------------------------------------------------------- activity
export const rebalance = onchainTable(
  "rebalance",
  (t) => ({
    id: t.text().primaryKey(), // txHash
    manager: t.hex().notNull(),
    epoch: t.integer().notNull(),
    countInEpoch: t.integer().notNull(),
    tickLower: t.integer().notNull(),
    tickUpper: t.integer().notNull(),
    liquidity: t.bigint(),
    weth: t.bigint(),
    usdc: t.bigint(),
    gasUsed: t.bigint(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({ byManager: index().on(t.manager) }),
);

export const swap = onchainTable(
  "swap",
  (t) => ({
    id: t.text().primaryKey(),
    sender: t.hex().notNull(),
    amount0: t.bigint().notNull(), // mWETH, trader's view (negative = paid in)
    amount1: t.bigint().notNull(), // mUSDC
    price: t.real().notNull(), // pool price after swap, USDC per WETH
    tick: t.integer().notNull(),
    volumeUsd: t.real().notNull(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (t) => ({ byTime: index().on(t.timestamp) }),
);

/** Single-row protocol totals (id = "global"). */
export const protocolStats = onchainTable("protocol_stats", (t) => ({
  id: t.text().primaryKey(),
  swapCount: t.integer().notNull(),
  volumeUsd: t.real().notNull(),
  feesUsd: t.real().notNull(), // volume × 0.30%
  managers: t.integer().notNull(),
  vaults: t.integer().notNull(),
  epochsSettled: t.integer().notNull(),
  lastPrice: t.real().notNull(),
}));
