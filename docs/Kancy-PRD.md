# Kancy Protocol: Product Requirements Document

> **Anyone can manage other people's Uniswap liquidity, because they lose first.**

| | |
|---|---|
| **Version** | 1.1 (contracts deployed) |
| **Date** | 2026-11-24 (updated after Phase 1 and 2 build) |
| **Target** | UHI11 Hookathon: "Active Management & Curation" (submit by Dec 3, 2026; Demo Day Dec 11) |
| **Network** | Unichain Sepolia (live testnet, public users) |
| **Inputs** | `Backed-Product-Brief.md` (product brief, formerly "Backed"), `GLOSSARY.md` |
| **Status** | Contracts: built, tested (34 tests) and live on Unichain Sepolia (§18). Bots and indexer: built (§16). Frontend visual design: waiting on brand assets (§15) |

---

## 1. Summary

Kancy Protocol is a Uniswap v4 hook plus a vault system. It lets anyone run, curate or fund actively managed ETH/USDC liquidity, without having to trust anyone.

- **Managers** post a USDC **First-loss Stake** and actively manage a concentrated-liquidity range.
- **Curators** run **Vaults**, approve Managers and set each Manager's **Allocation**.
- **Depositors** put USDC into a Vault.

The protocol makes three promises:
1. **Capital stays in the pool.** The Kancy vault owns every position. Managers can only rebalance it.
2. **Managers lose first.** At the end of each **Epoch**, a **Loss** valued by the oracle is taken out of the Manager's stake before any Depositor capital.
3. **The Scoreboard is honest.** Results are written by the contracts, never reported by the Manager.

## 2. Goals and non-goals

### 2.1 Goals (v1, hookathon)
- G1. A working end-to-end product on Unichain Sepolia that outside users can use: deposit, manage, curate, withdraw.
- G2. A live, visible demo of a Loss being absorbed by a Manager's stake, with the Depositor losing 0.
- G3. A public Scoreboard built only from onchain events.
- G4. An open-source Manager bot that anyone can run.

### 2.2 Non-goals (v1)
- Mainnet deployment, real funds, or an audit.
- More than one pool or pair.
- Direct backing of a single Manager without a Curator (deferred, §14).
- High-water marks, clawbacks, protocol fees.
- URC-4 `IALFHook` conformance (stretch goal, §13).
- Quoter or prop-AMM style managers (v1 Managers move ranges only).

## 3. Decisions log (from the grilling session)

| # | Decision | Choice |
|---|---|---|
| D1 | Scope | Full spine, usable end to end by the public |
| D2 | Who owns the liquidity | **The Kancy vault owns the v4 positions**; Managers can only call `rebalance` |
| D3 | Chain | Unichain Sepolia, live demo (no local fork demo) |
| D4 | Pair and unit | ETH/USDC; all deposits and stakes in USDC |
| D5 | Loss definition | Change in the USDC value of the Manager's capital over an Epoch, at the oracle price |
| D6 | Demo Manager | TypeScript range-manager bot |
| D7 | Epoch | A setting; 1 hour on testnet |
| D8 | Stake exhausted | Grace Period of 1 Epoch to top up, otherwise Paused |
| D9 | Depositor exit | Withdrawal Queue, settled at the end of the Epoch |
| D10 | Fees | Manager performance fee of 20% on positive Epochs; Curator takes a cut of that fee. No protocol fee or HWM |
| D11 | Stake P&L | The stake is deployed as LP capital, earns returns pro rata and absorbs losses first |
| D12 | Curator limits | Min First-loss Ratio and Max Allocation per Manager |
| D13 | Modes | Curator vault plus Self-only |
| D14 | Reallocation | Only at Epoch boundaries |
| D15 | Manager entry | Anyone can join; min stake 1,000 USDC; must complete 1 Self-only Epoch first |
| D16 | Indexing | Ponder → Postgres + GraphQL |
| D17 | Bots | Open-source bot; we host 2 demo Managers (one good, one bad) |
| D18 | Market on testnet | Our own mock WETH/USDC pool plus a swap-traffic (arbitrage) bot |
| D19 | Stack | Foundry · Next.js App Router · wagmi/viem · Ponder |

### 3.1 Decisions made during the build (2026-11-24)

| # | Decision | Choice | Why |
|---|---|---|---|
| D20 | How PositionBook talks to v4 | **Directly to PoolManager** (unlock callback), **not** through PositionManager | The hook's `sender` is whoever called `modifyLiquidity`. Through PositionManager the guard would see PositionManager and let every PositionManager user in |
| D21 | Swap depth | Protocol-owned **base liquidity** position in PositionBook (testnet: 100 mWETH + 200k mUSDC, about ±45%) | Settlement pulls every Manager's liquidity, so without it there is nothing to sell WETH against. It counts as nobody's capital |
| D22 | Rebalance swap | `rebalance(tickLower, tickUpper, sellWeth, amountIn)`: the bot computes the swap; the contract caps the swap price at oracle ± `maxDeviation` | Keeps the hard ratio maths offchain and the contract simple |
| D23 | Self-only shortfall | A Self-only Manager below `requiredStake` after their first Epoch goes to **Grace**, not Paused | Swap costs on the first rebalance otherwise Paused anyone staking exactly `minStake`. Matches D8 |
| D24 | Gains above target | Allocation is reset to the Curator's target each settlement, so profit above it comes back to the Vault as idle cash | Target = allocation keeps the model simple. Curators raise targets to compound |
| D25 | Payout shortfall | If selling WETH can't cover a payout in full, the unpaid part stays as the Vault's (or Manager's) claim on the book | Swap costs never break settlement and never silently disappear |
| D26 | One pool per hook | `beforeInitialize` allows only the owner, only once, only 0.30% / tick spacing 60 | The hook guards exactly one pool |

## 4. Users and roles

| Role | Can | Cannot |
|---|---|---|
| **Depositor** | Deposit USDC into a Vault, request a withdrawal, claim, view everything | Touch positions or choose Managers inside a Vault |
| **Curator** | Create a Vault, set fees and limits, approve or remove Managers, set target Allocations (applied at the Epoch boundary) | Withdraw Depositor funds, change positions |
| **Manager** | Register, post or top up a stake, rebalance their own range, withdraw a stake that isn't needed (§7.6) | Withdraw backed capital, touch other Managers' positions, move capital out of the pool |
| **Keeper** (permissionless) | Call `settleEpoch()` once an Epoch has ended, for a small bounty | Anything else |
| **Owner** (deployer, testnet only) | Set global parameters, pause the protocol in an emergency | Move user funds |

## 5. System architecture

```
 Depositors ──USDC──▶ KancyVault (one per Curator, ERC-4626-style shares)
                         │ allocation (applied at epoch boundaries)
                         ▼
 Managers ──stake──▶ ManagerRegistry ──▶ PositionBook (owns all v4 positions + base liquidity)
   │ rebalance(tickLower, tickUpper, sellWeth, amountIn)   │ direct PoolManager calls (unlock callback)
   └────────────────────────────────────────────▼
                                    Uniswap v4 PoolManager
                                    pool: mWETH / mUSDC + KancyHook
                                          │ before/after hooks
                                          ▼
                     KancyHook: blocks outside liquidity changes, records fees and swaps
                     EpochSettler: oracle valuation → loss waterfall → fees → queue
                     Oracle: Chainlink ETH/USD (Unichain Sepolia) or fallback
```

### 5.1 Contracts

| Contract | Responsibility |
|---|---|
| `KancyHook` | v4 hook on the Kancy pool. `beforeInitialize`: owner only, one pool, 0.30% / 60 (D26). `beforeAddLiquidity` / `beforeRemoveLiquidity`: revert unless `sender == PositionBook`. `afterSwap`: update swap count and volume counters and emit `KancySwap`. `setPositionBook` can be called once. |
| `PositionBook` | Owns every v4 position directly (no NFTs): each Manager has one range keyed by `salt = manager address`, plus leftover token inventory. Calls PoolManager itself (D20). `rebalance()`: remove all liquidity → optional swap capped at oracle ± `maxDeviation` → add the most liquidity the inventory allows at the new ticks (D22). Also holds the protocol base liquidity (D21). Tokens leave only through `payout` / `sweep`, and only the EpochSettler can call them. |
| `ManagerRegistry` | Registration, stake balance, status (`SelfOnly`, `Active`, `Grace`, `Paused`), Epoch history. |
| `KancyVault` | One per Curator, created through `VaultFactory`. Holds idle USDC, mints shares, stores Curator config (fees, Min First-loss Ratio, Max Allocation, Manager list, target Allocations), and runs the Withdrawal Queue. |
| `VaultFactory` | Creates Vaults (anyone can call it). |
| `EpochSettler` | `settleEpoch()`: values every Manager's position, applies the loss waterfall and fees, applies new Allocations, processes the queue, pays the keeper. |
| `OracleAdapter` | Wraps the price feed and checks staleness and deviation (§8.4). Gives the swap price limits. The owner can switch to a fallback feed. |
| `MockToken` (mUSDC, mWETH) | Testnet tokens with a capped public faucet (once per address per day). The owner can mint to fund bots. |
| `MockAggregator` | Testnet-only Chainlink-shaped feed for the demo mode (§8.2, §19). |

### 5.2 Why the vault owns positions instead of using hook-owned liquidity
- If a Manager held their own NFT, they could withdraw the funds, which breaks Promise 1.
- Fully hook-owned liquidity (OZ `BaseCustomAccounting`) needs custom delta accounting. Trail of Bits (Jul 2026) names this as the main source of hook incidents.
- With the vault owning positions, PositionBook calls `PoolManager.modifyLiquidity` itself (standard unlock-callback pattern, no custom delta accounting), and the hook guard closes the side door. *Strong enough guarantee, lowest-risk code.* (ADR candidate.)
- **Not through PositionManager (D20).** The hook sees the direct caller of `modifyLiquidity` as `sender`. If PositionBook went through PositionManager, `sender` would be PositionManager for everyone, and anyone could add or remove liquidity in the pool.

## 6. Accounting model

### 6.1 Units
- Everything is counted in USDC (6 decimals). WETH is valued at the oracle price `P`.
- Manager *m*'s capital at the start of Epoch *e*: `C_m = S_m + A_m`, where `S_m` is the stake and `A_m` is the capital allocated across all Vaults.
- Vault *v*'s share of `A_m` is `a_{v,m}`, so `A_m = Σ_v a_{v,m}`.

### 6.2 Value at the end of an Epoch
`V_m = (amount0 · P + amount1) + uncollected fees valued at P`, where the amounts are the position's underlying tokens at the pool's current sqrtPrice. The value uses the **oracle price** for WETH, not the pool price, so a Manager can't inflate their own value by moving the pool.

`PnL_m = V_m − C_m`

### 6.3 Profit (`PnL_m > 0`)
1. `fee_m = 20% × PnL_m × (A_m / C_m)`. The performance fee is charged only on the backed share; the Manager keeps 100% of the return on their own stake.
2. The Curator's cut: `curatorFee_v = curatorCut_v × fee_m × (a_{v,m}/A_m)`. The default `curatorCut` is 10% of the Manager fee and can be set from 0 to 50%.
3. Return to the stake: `PnL_m × (S_m/C_m)` plus `fee_m − Σ curatorFee`, added to `S_m`.
4. Return to the Vaults: `PnL_m × (A_m/C_m) − fee_m`, split by `a_{v,m}/A_m` and added to each Vault's NAV.

### 6.4 Loss (`PnL_m < 0`): the waterfall
1. `L = |PnL_m|`.
2. `fromStake = min(L, S_m)`, and `S_m −= fromStake`.
3. `fromBackers = L − fromStake`, split across Vaults by `a_{v,m}/A_m`.
4. If `S_m` falls below the Manager's required stake, the Manager enters **Grace** (§7.4).

Because the stake is deployed capital (D11), the stake absorbs the full Loss on all of `C_m`, including the part that sits on the stake itself. That is the "lose first" promise.

### 6.5 Vault NAV and shares
- `NAV_v = idle USDC + Σ_m a_{v,m}` after settlement.
- Shares follow ERC-4626 math. Deposits mint at the last settled NAV and **sit idle until the next Epoch**, so they can't buy into an Epoch whose result is already known.
- Idle USDC earns nothing in v1.

### 6.6 Rounding
- Round toward the protocol, never toward the caller.
- As built: the new stake is `V − Σ new allocations − Curator fees paid`, so rounding dust lands on the **stake**. Backer losses are rounded **up**, so a Vault can never keep value the book doesn't have.
- Swap costs from settlement payouts (selling WETH for USDC) aren't counted in `V`. They show up in the Manager's next Epoch result.
- Invariant tests cover every path (§12).

## 7. Lifecycles

### 7.1 Epoch
- `epochLength` is a global setting (testnet: 3600 s).
- Epoch *e* runs from `start_e` to `start_e + epochLength`. Only `settleEpoch()` moves to *e+1*.
- **Settlement order** (one transaction; if it gets too heavy, it can be split into steps per Manager):
  1. Read the oracle and check it (§8.4). If the price is bad, revert and retry later.
  2. For each Manager: collect fees, value the position, compute PnL, apply §6.3 or §6.4.
  3. Update Manager status (Grace and Pause transitions).
  4. For each Vault: process the Withdrawal Queue against the updated NAV.
  5. For each Vault: apply target Allocations (§7.5) and move idle USDC into positions or back out.
  6. Write Epoch records, emit events, pay the keeper bounty.

### 7.2 Depositor
`deposit(usdc)` → shares are minted at the settled NAV, and the USDC stays idle until the next settlement allocates it. Then `requestWithdraw(shares)` → the request joins the Queue → at settlement the shares are burned at the new NAV and the USDC becomes claimable → `claim()`.
- A request can be cancelled before settlement.
- Queued shares still carry that Epoch's P&L.

### 7.3 Manager
1. `register(metadataURI, stake, tickLower, tickUpper)` with a stake of at least `minStake` (1,000 USDC). Status becomes `SelfOnly`. The stake waits in the registry until the next settlement.
2. At the next settlement the stake moves into PositionBook and the position opens. The Manager then runs at least one full **Self-only** Epoch.
3. After that, the status becomes `Active` (or `Grace` if the stake fell below `requiredStake`, D23) and Curators can allocate to them.
4. The Manager calls `rebalance(tickLower, tickUpper, sellWeth, amountIn)` as often as they like. Limits: `maxRebalancesPerEpoch` (testnet: 12), and every tick must be a multiple of the tick spacing.
5. **New capital (stake, Allocations) arrives as USDC.** A position made from only USDC holds almost no liquidity in range, so the Manager (bot) should rebalance with a swap after each settlement.
6. `topUpStake()` can be called at any time. It joins the stake at the next settlement and never changes the running Epoch's capital.

### 7.4 Grace and Pause
- When `S_m < requiredStake_m` after settlement, the status becomes `Grace`, the Manager gets no new Allocations, and they can still rebalance.
- `requiredStake_m = max(minStake, max over Vaults v of minRatio_v × a_{v,m})`.
- If the stake is topped up by the next settlement, the status goes back to `Active`. Otherwise it becomes `Paused`: the position is closed to USDC, every `a_{v,m}` goes back to its Vault as idle, and the remaining stake goes back to the Manager. The Manager must register again (or call `resume` with a full stake) to return.

### 7.5 Curator
- `createVault(name, metadataURI, curatorCut, minRatio, maxAllocation)` through the factory.
- `addManager(m)` (only `Active` Managers) and `removeManager(m)`. Removal takes effect at the next settlement, and the capital comes back as idle.
- `setTargets([(m, amount)])` sets target Allocations, applied at the next settlement. Each target is capped by `maxAllocation`, by the Manager's stake (`S_m / minRatio`), and by the Vault's available capital. If the targets add up to more than the available capital, they are all scaled down by the same proportion.
- The Allocation is reset to the target at every settlement, so profit above the target comes back to the Vault as idle cash (D24). Grace Managers can't go above their current Allocation; Self-only, Paused and removed Managers get 0.
- The Curator can change fees and limits; changes take effect **after 1 Epoch** so Depositors are warned in advance.

### 7.6 Stake withdrawal
A Manager can withdraw `S_m − requiredStake_m`, but only at settlement, queued like Depositor withdrawals.

## 8. Oracle

### 8.1 Primary source
Chainlink ETH/USD on Unichain Sepolia. **Verified onchain on 2026-11-24:**
- Proxy `0xd9c93081210dFc33326B2af4C2c11848095E6a9a`. `description()` returns "ETH / USD", 8 decimals.
- Heartbeat 24 h, deviation threshold 0.5% (both from Chainlink's feed directory).
- `latestRoundData` responded with ≈ $1,737.88.

The feed only updates on a 0.5% move or every 24 h, so `maxStaleness` must be at least 24 h plus a buffer (§11).

### 8.2 Fallbacks
In order: Chronicle, RedStone, eOracle. All are listed for Unichain Sepolia in Uniswap's docs. Last resort: a `MockAggregator` that our own bot updates from a public mainnet price. If we use it, it must be clearly labelled as testnet-only in the UI.

### 8.3 The pool price follows the oracle
The swap-traffic bot (§9.2) arbitrages the mock pool toward the oracle price. Managers therefore face realistic price movement and realistic LVR.

### 8.4 Checks
- Revert settlement if the price is stale (older than `maxStaleness`, 25 h, matching the feed's 24 h heartbeat).
- Revert if the price is ≤ 0.
- Revert if the pool price differs from the oracle by more than `maxDeviation` (testnet: 5%). This stops anyone moving the pool just before settlement.

## 9. Offchain components

### 9.1 Manager bot (open source, `kancy-manager-bot`)
- TypeScript with viem. Config: private key, RPC, strategy and parameters.
- Strategies:
  - `centered`: keep a ±X% range around the oracle price, rebalance when the price leaves the inner band.
  - `bad`: a deliberately wide or mistimed range, or one-sided. Used by the losing demo Manager.
- Respects `maxRebalancesPerEpoch` and shows logs and a status in the terminal.
- Computes the swap for each rebalance itself (`sellWeth`, `amountIn`) so the position ends up near the right token ratio (D22), and rebalances after every settlement to put newly arrived USDC to work (§7.3).

### 9.2 Swap-traffic bot (protocol-operated)
- Every N seconds: read the oracle price; if the pool price is off by more than the fee, arbitrage it back. Add random noise swaps to create fee volume.
- Funded from the mock token faucet.

### 9.3 Keeper
- A cron job that calls `settleEpoch()` at each boundary. The protocol runs one, but anyone can call it.

### 9.4 Indexer (Ponder)
- Indexes events from `KancyHook`, `PositionBook`, `ManagerRegistry`, `KancyVault`, `VaultFactory` and `EpochSettler`.
- Tables: `managers`, `manager_epochs`, `vaults`, `vault_epochs`, `allocations`, `deposits`, `withdrawals`, `rebalances`, `swaps`.
- Serves GraphQL to the frontend. Live balances are read directly with viem.

### 9.5 Hosting
- Indexer and bots on a single small VM or container host, with Postgres alongside.
- Frontend on Vercel.

## 10. Scoreboard

Stored per Manager and per Epoch, from onchain data only:

| Metric | Definition |
|---|---|
| Return | `PnL_m / C_m` per Epoch; cumulative, compounded |
| vs Hold | Return compared with holding the Epoch-start token mix at oracle prices (display only, never charged) |
| Fees earned | Swap fees collected, in USDC |
| Losses absorbed | Σ `fromStake` |
| Losses passed to backers | Σ `fromBackers` (the protection-failure metric) |
| Capital managed | `C_m`, `A_m` over time |
| Coverage | `S_m / A_m` |
| Rebalances | Count, and gas spent per rebalance |
| Status history | SelfOnly / Active / Grace / Paused transitions |
| Max drawdown | Over cumulative return |

Scoreboard records follow the Manager address across Vaults.

## 11. Parameters (testnet defaults)

| Parameter | Default | Who sets it |
|---|---|---|
| `epochLength` | 3600 s | Owner |
| `minStake` | 1,000 mUSDC | Owner |
| `performanceFee` | 20% | Owner (global in v1) |
| `curatorCut` | 10% (0–50%) | Curator |
| `minRatio` | 10% | Curator |
| `maxAllocation` | 50,000 mUSDC | Curator |
| `maxRebalancesPerEpoch` | 12 | Owner |
| `maxStaleness` | 90,000 s (heartbeat 86,400 s + buffer) | Owner |
| `maxDeviation` | 5% | Owner |
| `keeperBounty` | 1 mUSDC | Owner |
| Pool fee and tick spacing | 0.30% / 60 | Fixed at pool creation |
| Faucet | 10,000 mUSDC + 5 mWETH per address per day | Owner |

## 12. Security and testing

### 12.1 Threats and mitigations
| Threat | Mitigation |
|---|---|
| A Manager takes funds | No transfer paths to Managers except their own stake surplus. The hook blocks any liquidity change not made by PositionBook |
| A Manager moves the pool price to inflate their value | Valuation uses the oracle price, plus the deviation check |
| A Manager loses money on purpose by swapping badly | Allowed, but any loss falls on their stake first. Rebalance count is capped. Swaps inside rebalance have a slippage limit set against the oracle |
| A Depositor dodges a Loss | Deposits and withdrawals only take effect at settlement |
| A Curator runs off with funds | Curators have no transfer rights. Config changes have a 1-Epoch delay |
| Settlement runs out of gas | Caps in v1: 10 Managers per Vault, 20 Managers, 20 Vaults. Settlement can be split into steps |
| Settlement can't sell WETH (no depth) | Protocol base liquidity (D21). Payout shortfalls stay as claims instead of reverting (D25) |
| Outside LPs bypass the guard through PositionManager | PositionBook calls PoolManager directly, so the hook can check `sender == PositionBook` (D20) |
| Accounting mistakes | Foundry invariant tests: Σ claims = Σ assets; a backer only loses when the stake is 0; NAV never moves outside settlement; shares are conserved |
| Reentrancy and v4 lock issues | Use the v4 unlock-callback pattern, CEI, ReentrancyGuard |

### 12.2 Testing plan
- Unit tests for each contract. Fork tests against the real Unichain Sepolia PoolManager.
- Invariant and fuzz tests for the waterfall and share math.
- A scripted end-to-end scenario on testnet: good Manager, bad Manager, one Vault, three Depositors, five Epochs.
- Follow the Trail of Bits v4 hook checklist and run Slither.

## 13. Standards and integrations
- **URC-2 `HookSwap` event:** emit it if cheap. **URC-3 `IHookStats`:** implement `getReserves` / `getEffectiveLiquidity`; this is a stretch goal. **URC-4 `IALFHook`:** stretch goal; it's still under discussion.
- **Sponsor-prize candidates** (pick at most one in v1): Reactive Network (automated settlement and reallocation), Brevis (proof-based Scoreboard).

## 14. Out of scope (v2+)
Direct backing · multiple pools and pairs · quoter Managers · high-water mark and clawback · protocol fee and TJAR conversion · co-investment stake tiers · capacity formulas · Fhenix private strategies · mainnet and audit.

## 15. Frontend (Next.js) — waiting on brand assets
The visual design (palette, type, logo, components) **waits for the brand assets.** Until then, this section only fixes the functional scope.

- **Stack:** Next.js App Router, wagmi + viem, RainbowKit or ConnectKit (to decide), TanStack Query, the Ponder GraphQL client, a charting library (to decide).
- **Routes (functional):**
  - `/`: landing page with the one-liner and live protocol stats.
  - `/vaults` and `/vaults/[address]`: explore Vaults; deposit, withdraw-request and claim; Allocations and coverage.
  - `/managers` and `/managers/[address]`: Scoreboard and Manager profile.
  - `/manage`: Manager console (register, stake, rebalance, status, Grace warnings).
  - `/curate`: Curator console (create a Vault, limits, Manager list, targets).
  - `/portfolio`: the Depositor's positions, with a "loss absorbed by Manager stake" breakdown.
  - `/faucet`: mock tokens.
- **Key moment to design for:** the Epoch result card, which reads "Manager lost X — stake absorbed 100% — your loss: 0".
- *Full UI spec to be written after brand assets are received.*

## 16. Milestones (Nov 24 → Dec 3)

| Date | Deliverable | Status |
|---|---|---|
| Nov 24–25 | Confirm the oracle; scaffold the Foundry repo; mock tokens; pool plus a skeleton hook guard | ✅ Done Nov 24, deployed |
| Nov 26–27 | PositionBook rebalance, ManagerRegistry, Vault deposit/queue, EpochSettler math, plus invariants | ✅ Done Nov 24: 34 tests incl. waterfall fuzz |
| Nov 28 | Deploy to Unichain Sepolia; swap-traffic bot; keeper | ✅ Contracts deployed Nov 24. Bots: next |
| Nov 29 | Manager bot (centered + bad strategies); Ponder indexer | ✅ Done Nov 25: bots in `bots/` (swap-traffic, keeper, manager; 2 demo managers registered live), indexer in `indexer/` (Ponder, GraphQL). Manager-epoch handlers verified after first live settlement |
| Nov 30–Dec 2 | Frontend (after brand assets) | |
| Dec 2 | Live end-to-end run of 5+ Epochs; fix bugs | |
| Dec 3 | Submit: demo video, README, live link | |

## 17. Success criteria
- At least 3 outside wallets complete deposit → withdrawal on testnet.
- A Loss absorbed by the bad Manager's stake, with the Depositor loss = 0, shown on the live site.
- 0 failed settlements in the 24 h before submission.
- Judges can repeat the one-liner.

## 18. Verified addresses (Unichain Sepolia, chain 1301; checked onchain 2026-11-24)
| Contract | Address | Check |
|---|---|---|
| PoolManager | `0x00b036b58a818b1bc34d502d3fe730db729e62ac` | Code deployed; `PositionManager.poolManager()` returns it |
| PositionManager | `0xf969aee60879c54baaed9f3ed26147db216fd664` | Code deployed |
| StateView | `0xc199f1072a74d4e905aba1a84d9a45e2546b6222` | Code deployed |
| Quoter | `0x572B9cDBcd8c2b8F3Fe849B9d250F35284455d7f` | From the docs |
| Universal Router | `0xf70536b3bcc1bd1a972dc186a2cf84cc6da6be5d` | From the docs |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | From the docs |
| PoolSwapTest | `0x9140a78c1a137c7ff1c151ec8231272af78a99a4` | From the docs (useful for the swap-traffic bot) |
| Chainlink ETH/USD proxy | `0xd9c93081210dFc33326B2af4C2c11848095E6a9a` | "ETH / USD", 8 decimals, live answer |

RPC: `https://sepolia.unichain.org`

### 18.1 Kancy deployment (Unichain Sepolia, deployed 2026-11-24)
Machine-readable copy: `contracts/deployments/unichain-sepolia.json`.

| Contract | Address |
|---|---|
| mUSDC | `0xba38ACbD29e5122695CdB25A6014034Fd319D5Fe` |
| mWETH | `0x8916856F8a5FdB5d006725582145a57B36682BAe` |
| KancyHook | `0x00f29BD8aEe149bC0d1414970e778926FEcD2a40` |
| Pool ID (mWETH/mUSDC, 0.30%, 60) | `0x17ad3f96e53909e4f698e0439770294e45a47e0ab22be4c285902b4fb11e2ea5` |
| OracleAdapter | `0x8e33Fd0c463afb4D3b856c0B92017E46a53eF7A7` |
| ManagerRegistry | `0x6A1841F872414f40BDdEc4d1Fe026E0d34Ad7055` |
| PositionBook | `0x4c0DE140F5Dad5Edfd597B9fc33E1EEDF35591c2` |
| EpochSettler | `0x97438bA98839DaD52F5869e662481B72B41F4635` |
| VaultFactory | `0x9Fe33886698bbaDEe07e5e85b63DB88179bf4BD7` |

- The pool started at the Chainlink price of $1,678.72 (tick −202,063).
- `hook.positionBook()` is set to the PositionBook above. **It can't be changed:** a new PositionBook means a new hook and a new pool.
- Base liquidity: 100 mWETH + 200k mUSDC on ticks −206,520 to −197,460. The settler holds 5,000 mUSDC for keeper bounties.

## 19. Open items
1. ~~Oracle address~~ and ~~v4 addresses~~: verified (§18).
2. The feed updates rarely (0.5% deviation / 24 h heartbeat). The swap-traffic bot follows it, so pool prices move only in steps of 0.5% or more. That may be too quiet for a 1 h-Epoch demo; consider a demo-only `MockAggregator` mode as a switch (§8.2).
3. Choose the wallet-connect library and the charting library (with the frontend work).
4. Choose one sponsor-prize integration, or none.
5. Brand assets → §15.
6. ~~PositionManager vs the hook guard~~: resolved (D20).
7. The base liquidity's size (D21) sets how much a settlement can sell without slipping. Watch slippage as total capital grows, and top up the base if needed.
8. If the swap-traffic bot is slow, the pool drifts away from the oracle and `settleEpoch()` reverts on the 5% deviation check. The keeper should arbitrage before settling, or retry.

## 20. References
- Uniswap v4 custom accounting: https://docs.uniswap.org/contracts/v4/guides/custom-accounting
- v4 liquidity hooks: https://developers.uniswap.org/docs/protocols/v4/guides/hooks/liquidity-hooks
- v4 deployments: https://developers.uniswap.org/docs/protocols/v4/deployments
- OpenZeppelin Uniswap Hooks: https://docs.openzeppelin.com/uniswap-hooks/api/base
- Trail of Bits, Building secure v4 hooks: https://blog.trailofbits.com/2026/07/30/building-secure-uniswap-v4-hooks/
- URC-2 / URC-3 / URC-4: https://gov.uniswap.org/t/urc-2-custom-accounting-hook-swap-event/26154 · https://gov.uniswap.org/t/urc-3-hook-tvl-and-effective-liquidity-reporting/26155 · https://gov.uniswap.org/t/urc-4-active-liquidity-framework-hook-interface/26156
- Chainlink on Unichain Sepolia: https://dev.chain.link/changelog/data-feeds-on-unichain-sepolia
- Unichain oracles: https://developers.uniswap.org/docs/unichain/tools/oracles
