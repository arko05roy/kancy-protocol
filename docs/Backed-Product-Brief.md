# Backed: Product Brief

> **Anyone can manage other people's Uniswap liquidity, because they lose first.**

| | |
|---|---|
| **Document type** | Product brief (input for a future PRD) |
| **Version** | 0.1 (ideation output) |
| **Date** | 2026-11-17 |
| **Target** | Uniswap Hook Incubator, Cohort 11 (UHI11) Hookathon: theme **"Active Management & Curation"** |
| **Hookathon window** | Nov 16 to Dec 3, 2026 · Demo Day Dec 11, 2026 |
| **Working name** | Backed (alternatives in §17) |
| **Status** | Idea locked for PRD drafting. Mechanism parameters are open (see §14) |

---

## Table of contents
1. [One-line pitch and summary](#1-one-line-pitch-and-summary)
2. [Background: the problem in plain words](#2-background-the-problem-in-plain-words)
3. [Evidence: what the research found](#3-evidence-what-the-research-found)
4. [The secret: the non-consensus insight](#4-the-secret-the-non-consensus-insight)
5. [The product](#5-the-product)
6. [Roles and personas](#6-roles-and-personas)
7. [Core rules: what the hook guarantees](#7-core-rules-what-the-hook-guarantees)
8. [Economics: who pays whom](#8-economics-who-pays-whom)
9. [User journeys](#9-user-journeys)
10. [Product surfaces](#10-product-surfaces)
11. [Fit with the UHI11 theme and Atrium's prompts](#11-fit-with-the-uhi11-theme-and-atriums-prompts)
12. [Why Uniswap wants this](#12-why-uniswap-wants-this)
13. [Competitive landscape and prior art](#13-competitive-landscape-and-prior-art)
14. [Open product questions for the PRD](#14-open-product-questions-for-the-prd)
15. [Risks, beliefs and kill criteria](#15-risks-beliefs-and-kill-criteria)
16. [Success metrics](#16-success-metrics)
17. [Naming and pitch variants](#17-naming-and-pitch-variants)
18. [Glossary](#18-glossary)
19. [Sources and research files](#19-sources-and-research-files)

---

## 1. One-line pitch and summary

**One-liner:** Anyone can manage other people's Uniswap liquidity, because they lose first.

**Alternates:**
- "Copy-LP, except the leader eats the loss first."
- "Pick a curator, curators pick managers, managers fight the arbitrageurs."

**Summary.** Backed is a Uniswap v4 hook that runs an open marketplace for actively managed liquidity, with three permissionless roles:

- **Managers** actively run liquidity: they reprice, rebalance and adjust ranges. To manage other people's money they must put in their own money first. That stake is the **first-loss** layer.
- **Curators** run vaults that pick which managers get capital, and move capital between managers based on results.
- **Depositors** put in assets and choose a curator, or back a single manager directly.

The hook is the referee:
1. Deposited capital can **only be used inside the Uniswap pool**. Managers can trade with it but can never withdraw it.
2. It keeps an **honest scoreboard** of every manager's real results.
3. It enforces **losses-first**: depositors are only hit after the manager's own stake is gone.

**Why it's different.** Copy-LP and curator vaults ask depositors to trust the manager. Backed makes trust unnecessary. The manager can't take the money, can't fake a track record, and pays for losses first. That is why the marketplace can be open to anyone.

---

## 2. Background: the problem in plain words

### 2.1 Passive LPs lose money
A standard Uniswap pool prices tokens with a fixed formula (x·y=k for v2; v3 and v4 add concentrated ranges). The pool **never checks the real market price**. When ETH moves on Binance, the pool's price is stale until an arbitrageur trades against it and pockets the difference. That profit comes out of LPs' pockets. The academic name for this is **LVR (loss-versus-rebalancing)**.

Result: ordinary LPs lose money on average. Ethereum Uniswap v3 LPs ended about **$20.4M behind simply holding** over a 12-month window (Bitquery). Only about **1 in 6 Base concentrated-liquidity LPs break even** (arXiv 2604.22069).

### 2.2 Active management is the fix, but it's closed or broken
**Active management** means someone watches the market and moves the price or range in time. It works:

- **Prop AMMs** (proprietary AMMs) reprice every block. They now handle **more than half of SOL/USDC volume on Solana** and about **14% of Ethereum DEX volume** (Blockworks, Oct 2026).
- Their median fill lands at or inside the mid price. Public AMMs pay **1–2 bps more**.
- Their makers earn **+0.37 bps** two seconds after a fill, while public-AMM LPs lose **−0.22 bps** (arXiv 2609.38056).

The catch: **prop AMMs only trade their own firm's money.** Nobody else can put capital in.

### 2.3 Today's ways to delegate LP management are failing
- **Automated LP managers collapsed** year over year: Kamino Liquidity −77%, Meteora DLMM −78%, Steer −74%, ICHI −83%, Gamma −73%, Arrakis −44%, Beefy −62%.
- **Copy-LP has a trust problem.** If the person you follow is bad or dishonest, *you* eat the loss, not them. Copy-LP products are tiny: Krystal vaults under $1M, Revert Lend about $4.4M.
- **Managed-money blowups** taught everyone the same lesson:
  - **Stream Finance (Nov 2025):** about $285M exposure through curated vaults.
  - **Bunni (Sep 2025):** an $8.4M exploit, then shut down.
  - After Stream, the fix commentators named was **managers with real skin in the game**.

### 2.4 Curated money never touches Uniswap liquidity
About **$10B** sits in curated lending vaults (Morpho), run by professional curators such as Steakhouse, Sentora and Gauntlet. Morpho's own API attributes **$7.07B** directly to named curators.
- **None of that money is in AMM liquidity.**
- Where curated vaults and DEXs meet, **the roles are reversed**. Uniswap's DualPool parks DEX inventory *in* lending vaults. Wintermute's Armitage vault has depositors *lend to* the market maker.
- Curated money only trusts **credit with protection**, never raw LP exposure.

**The gap Backed fills:** active management works, but there is no open, trust-minimized way for ordinary capital to back skilled managers on Uniswap.

---

## 3. Evidence: what the research found

### 3.1 The market
| Signal | Number | Source / date |
|---|---|---|
| Curated lending (Morpho) TVL | $6.6B → $10B YoY | DefiLlama, Nov 2026 |
| Curator AUM, Steakhouse | $1.25B → $2.7B | DefiLlama |
| Curator AUM, Sentora | $0.58B → $2.7B | DefiLlama |
| Top-3 curator share | 46% → ~74% after Stream | Morpho API, DefiLlama |
| Total onchain curator revenue | ~$14M/yr | Morpho API analysis |
| V2 vaults over $1M charging 0% performance fee | 71 of 147 | Morpho API, Nov 16 2026 |
| LP-manager protocols' combined TVL | $183M vs $9.43B for curators | DefiLlama |
| Prop AMM share of Ethereum DEX volume | ~14% (Fermiswap ~60% of it) | Blockworks 0xResearch, Oct 21 2026 |
| Prop AMM share on Solana | >50% of SOL/USDC | multiple |
| Uniswap v4 TVL / volume share | ~$1.05B / ~46% of Uniswap 30-day volume | DefiLlama, Nov 16 2026 |
| Wintermute Armitage | ~$53M in days → $102.5M; Select tier = unsecured loan to Wintermute at 9.25% | Morpho API; Gogol, May 2026 |

### 3.2 Behavior we can point to
- **Institutions entering vaults:** Wintermute Armitage (May 2026), Galaxy (Jul 2026), Bitwise, Kraken, Coinbase, Uniswap Earn (Jul 2026), and RockawayX (over $100M). Market makers such as Wintermute and Keyrock now also act as curators.
- **Uniswap is already in curation:** Uniswap Earn uses DAO-owned Morpho vaults curated by Gauntlet. That curation is for lending, not liquidity.
- **Hyperliquid user vaults:** anyone can run a vault, followers deposit, and the leader must keep their own stake in. This is the closest consumer-scale precedent for "leaders with skin in the game." Current user counts are unverified.
- **Prop AMM trust issues:** 0x found final quote updates landing in the last 10% of the block 97.4% of the time, with fills 3–6 bps worse than quoted. Only 39% of Tessera trades got the quoted price.

### 3.3 What Atrium and Uniswap signal
- **UHI11 goal (Atrium, verbatim):** "empower curators and automated strategies to actively manage and rebalance liquidity positions directly through Hooks — pushing hook innovation toward curated, professionally managed liquidity that drives the next stage of on-chain capital allocation."
- **Uniswap Labs' URC-4, the "Active Liquidity Framework"** (Jun 2026): a standard interface so routers can quote actively managed hook liquidity.
- **Hayden Adams (Aug 18, 2026):** passive LPs suit correlated pairs, but professional liquidity is needed for "bridge" pairs like ETH/USDC.
- **Past on-theme UHI winners are permissionless:**
  - Mirror (copy trading)
  - Silicon Vision Fund (anyone launches an AI fund)
  - CoPool (LPs delegate management)
  - Arbiter (anyone bids to manage a pool)
  - UniBrain and Autonomous Liquidity Optimization (automate any LP)
  - CrossHedge (LPs hedge each other)
  - StableStream (anyone's idle USDC)
  - 1Tx (one-click retail yield)

  The one gated winner is ILAL (institutional compliance, UHI10).

---

## 4. The secret: the non-consensus insight

> **Everyone believes** that the bottleneck for curated, actively managed liquidity is *manager skill*: find good managers, build vaults, add performance fees.
>
> **In fact** the bottleneck is *trust*. Curated money (about $10B) refuses LP exposure entirely. Copy-LP and automated LP managers are collapsing. The industry's own post-mortem after Stream named the missing piece: managers with real skin in the game. Where curated money does meet market makers (Armitage), it only accepts a *credit* relationship.
>
> **So** an open marketplace becomes possible once a hook (a) locks capital inside the pool, (b) keeps an unfakeable scoreboard, and (c) makes managers lose first. At that point *anyone* can manage, curate or deposit without trusting anyone.

**Consensus ideas this is not** (all banned as consensus during ideation):
- Atrium's four UHI11 prompts in their plain form: vault and token-gated hooks, curated LP networks, auto-rebalancing, performance fees / backtesting / migration
- AI or agent rebalancers (about 20 at HackMoney 2026 alone)
- Copy-LP
- ERC-4626 curator vaults with a performance fee (already being built in UHI11: VaultCurator, Ranti)
- Leveraged active-tick LP (Hookr Leveraged Hooks, EulerSwap, ybAMM, a Morpho grant)

Backed **uses** the theme's shape (vaults, managers, curators, performance fees). It changes the trust model underneath: **first-loss plus capital locked in the pool plus an honest scoreboard.**

---

## 5. The product

### 5.1 The three roles

```
            ┌─────────────────────────────────────────────┐
            │                DEPOSITORS                    │
            │  put in USDC / ETH, pick a curator or manager │
            └───────────────┬─────────────────────────────┘
                            │ capital
            ┌───────────────▼─────────────────────────────┐
            │                 CURATORS                     │
            │  vaults that pick managers, set limits,       │
            │  move capital toward managers who perform     │
            └───────────────┬─────────────────────────────┘
                            │ capital, allocated per manager
            ┌───────────────▼─────────────────────────────┐
            │                 MANAGERS                     │
            │  actively manage liquidity (reprice,          │
            │  rebalance, set ranges) with OWN money first  │
            └───────────────┬─────────────────────────────┘
                            │ all capital stays inside
            ┌───────────────▼─────────────────────────────┐
            │       UNISWAP v4 POOL + BACKED HOOK (referee) │
            │  • money can't leave the pool                 │
            │  • honest scoreboard                          │
            │  • manager stake absorbs losses first         │
            └─────────────────────────────────────────────┘
```

### 5.2 What "active management" means inside Backed
A manager is any strategy that actively decides how its liquidity sits in the pool. Examples:
- **Range managers:** move concentrated ranges as price moves. These are classic LP managers, now with skin in the game.
- **Quoters:** set the price and spread frequently, prop-AMM style.
- **Agents and bots:** automated strategies, including AI agents. Backed is agnostic to how decisions are made.
- **Specialists:** managers focused on one asset type (stable pairs, LSTs, long-tail tokens, tokenized stocks).

### 5.3 What "curation" means inside Backed
A curator is a vault operator who:
- publishes a **manager list** (whitelist) and a description of their approach
- sets **limits per manager**: maximum capital, minimum first-loss ratio, allowed pools
- **reallocates** capital between managers based on the scoreboard (strategy migration without depositors acting)
- earns a **curator fee**

Curators are permissionless. Anyone can open a vault.

### 5.4 What depositors get
- One deposit and one choice of a curator (or a single manager).
- Protection: losses hit the manager's stake first.
- Transparency: every manager's real record is visible and can't be faked.
- No babysitting: no ranges, no rebalancing, no monitoring.

### 5.5 Deposit modes (product options)
| Mode | Description | Who it's for |
|---|---|---|
| **Curator vault** (default) | Deposit into a curator's vault, and the curator allocates across managers | Most depositors |
| **Direct backing** | Back one specific manager directly | Fans of a specific manager; power users |
| **Manager self-only** | A manager runs only their own stake to build a track record before accepting backers | New managers (bootstrap phase) |

---

## 6. Roles and personas

### 6.1 Manager personas
| Persona | Description | Motivation | Today they… |
|---|---|---|---|
| **Solo quant / skilled LP** | Individual who actively manages concentrated liquidity well | Scale beyond their own capital, earn fees on others' money | LP with their own money only, or join copy-LP with no protection for followers |
| **Bot / agent builder** | Builds automated LP or quoting strategies, including AI agents (the most crowded hackathon category) | Monetize the bot with real capital and a provable record | Demo agents with tiny wallets; no way to get trusted capital |
| **Small market-making firm** | Runs quoting strategies | Cheaper inventory than their own balance sheet | Use own capital, or take unsecured loans (Armitage-style for big firms only) |
| **Specialist** | Knows one asset class deeply (stables, LSTs, RWAs, long-tail) | Be the go-to manager for that market | No route to outside capital |

### 6.2 Curator personas
| Persona | Description | Motivation |
|---|---|---|
| **Professional curator** | Steakhouse, Sentora or Gauntlet style risk manager | A new, underwritable yield source; differentiation (curator fees are near zero today) |
| **Community curator** | DAO, research collective or influencer with a following | Monetize judgment and reputation |
| **Protocol / treasury curator** | A token project curating managers for its own pools | Deeper, better-managed liquidity for its token |
| **Distributor** | Wallet or fintech app (the curated lending boom is driven by distributors like Coinbase, Robinhood, PayPal and Uniswap Earn) | A yield product to offer users |

### 6.3 Depositor personas
| Persona | Description | Wants |
|---|---|---|
| **Retail LP who's been burned** | Tried LPing and lost to IL and LVR | Exposure to LP fees without managing ranges, and protection |
| **Passive holder** | Holds ETH or USDC and wants yield | Simple, protected yield |
| **Follower** | Follows a specific trader or community (copy-trading user) | Back a person they trust, with protection |
| **Treasury / DAO** | Idle treasury assets | Yield plus deeper liquidity for their ecosystem |

### 6.4 Indirect beneficiaries
- **Swappers and traders:** better prices from actively managed pools that don't leak to arbitrage.
- **Routers and aggregators:** active liquidity they can rely on. Optional alignment with URC-4.
- **Uniswap protocol and DAO:** more TVL and volume on v4, and professional liquidity kept on Uniswap.

---

## 7. Core rules: what the hook guarantees

These are the product's promises. The exact parameters are open questions (§14).

### Rule 1: Capital stays in the pool
- Deposited capital can only be used to provide liquidity in the designated Uniswap pool(s).
- Managers control *how* the liquidity is placed (ranges, prices), never *where* it goes.
- No manager or curator can withdraw depositors' funds to an outside address.

### Rule 2: Losses first hit the manager
- Every manager posts a **first-loss stake** before accepting outside capital.
- When a manager's results are negative, losses are absorbed by the manager's stake first. Depositors are only affected once the stake is exhausted.
- Curators can require a **minimum first-loss ratio** (e.g., the stake must be at least X% of capital managed).

### Rule 3: The scoreboard is honest
- Every manager's results are recorded by the hook itself, not self-reported.
- The scoreboard covers performance versus simply holding, fees earned, losses absorbed, capital managed, time active, and rule violations.
- Track records are portable: a manager builds reputation across curators.

### Rule 4: Curators control allocation, not funds
- Curators decide *which managers* get *how much* capital, within the limits they publish.
- Curators can move capital between managers ("migration") without depositors acting.
- Curators cannot take depositor funds either.

### Rule 5: Depositors can always see and leave
- Depositors can see their curator's manager list, allocations and the scoreboard at all times.
- Depositors can exit under published terms. Notice periods and queues are open questions.

### Rule 6: Limits scale with proof
- A new manager starts small, and capital capacity grows with a clean track record and a larger stake.
- This prevents a "pump a record, then dump" pattern and rewards consistency.

---

## 8. Economics: who pays whom

### 8.1 Value flows
```
Swappers ──trading fees──▶ Pool ──▶ Manager's managed liquidity
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
     Depositors' share          Manager performance fee      Curator fee
    (base return + upside)     (paid only above a bar)    (for allocation work)
              ▲
              │ losses absorbed first by ──▶ Manager first-loss stake
```

### 8.2 Fee and return model (options for the PRD)
| Element | Options | Notes |
|---|---|---|
| **Depositor return** | (a) Pure share of pool profits, or (b) a credit-style target return with upside sharing | (b) matches the finding that curated money trusts credit-like terms |
| **Manager compensation** | Performance fee only above a hurdle (e.g., versus holding) | Ties pay to beating the passive baseline |
| **Manager risk** | First-loss stake absorbs losses | The core mechanism |
| **Curator compensation** | Small management fee, performance fee, or a distributor-style fee | Curators earn about $14M/yr in total today, so even modest fees are meaningful |
| **High-water mark / clawback** | Performance fees only on new highs; clawback if later losses occur | Seen in the UHI11 repo Ranti; common in traditional funds |
| **Protocol fee** | Optional small fee to a treasury or the Uniswap DAO (e.g., via TJAR fee conversion) | Aligns with Uniswap's fee switch and burn direction |

### 8.3 Incentive logic
- **Managers** profit only by beating the passive baseline, and lose their own stake if they don't.
- **Curators** profit by choosing managers who perform, and lose depositors if they choose badly.
- **Depositors** get professional management with downside protection.
- **Swappers** get better prices, which brings more volume and more fees to the system.

---

## 9. User journeys

### 9.1 Manager: "Sam the solo quant"
1. Sam connects a wallet and opens **Become a manager**.
2. Picks a pool (e.g., ETH/USDC on Uniswap v4) and a strategy type (range manager, quoter, agent).
3. Posts a **first-loss stake** (e.g., 10,000 USDC).
4. Runs on own stake only for a while ("self-only" mode), building a public record on the scoreboard.
5. Applies to curators, or opens for **direct backing**.
6. Curators add Sam to their lists. Capital flows in up to the limits.
7. Sam earns performance fees above the hurdle. If Sam has a bad month, Sam's stake absorbs the loss first.
8. A consistent record raises Sam's capacity.

### 9.2 Curator: "Cora's research DAO"
1. Cora opens **Create a vault**, names it, writes a strategy description ("conservative ETH/USDC managers, min 15% first-loss").
2. Sets rules: an allowed pools list, a minimum first-loss ratio, a maximum allocation per manager, fees.
3. Browses the **manager directory** and scoreboard, and adds managers to the list.
4. Depositors join the vault.
5. Cora reviews the scoreboard weekly. She moves capital from underperformers to top performers and removes a manager who breaks a rule.
6. Earns the curator fee. Her vault's own record becomes her reputation.

### 9.3 Depositor: "Dev, burned retail LP"
1. Dev opens Backed and sees curator vaults with records, risk labels and first-loss coverage.
2. Picks Cora's vault and deposits 2,000 USDC.
3. Dashboard shows the current value, which managers the money is with, each manager's stake protecting Dev, and the history.
4. A manager has a bad week. Dev sees "loss absorbed by manager stake: 100%; your loss: 0".
5. Dev withdraws when needed under the vault's exit terms.

### 9.4 Follower: "Fiona backs a specific manager"
1. Fiona follows a manager on social media and wants to back them directly.
2. Opens the manager's profile: scoreboard, stake size, capital managed, rules.
3. Deposits directly. Fiona's money is protected by that manager's stake first.

### 9.5 Token project: "Treasury curator"
1. A token project wants deeper, better-managed liquidity for its token pair.
2. Creates a curator vault restricted to its token's pools and seeds it with treasury assets.
3. Invites specialist managers who post stakes.
4. Gets actively managed depth instead of paying an off-chain market maker on trust.

---

## 10. Product surfaces

### 10.1 Depositor app
- **Explore:** curator vaults and managers, with filters (asset, risk, record, first-loss coverage, fees).
- **Vault page:** strategy description, manager list, allocations, aggregate first-loss coverage, history, fees, exit terms.
- **Manager profile:** scoreboard, stake, capital managed, pools, record versus holding, rule history.
- **Portfolio:** positions, value over time, losses absorbed by manager stakes, fees paid.

### 10.2 Manager console
- **Onboarding:** pool selection, strategy type, stake posting.
- **Performance:** live scoreboard, capacity, backers, fees earned, stake health.
- **Capacity:** current limit and what unlocks more.
- **Curator relationships:** which curators back them, and at what allocation.

### 10.3 Curator console
- **Vault setup:** name, description, rules (allowed pools, minimum first-loss, per-manager caps, fees).
- **Manager directory:** scoreboard-based discovery and comparison.
- **Allocation board:** current allocations, one-click reallocation (migration), remove or add managers.
- **Depositor view:** TVL, flows, exit queue.

### 10.4 Public scoreboard (standalone value)
- A public leaderboard of Uniswap liquidity managers, built from hook-recorded results.
- Useful on its own to curators, researchers, routers and Uniswap. It is the "credit bureau" for liquidity managers.

### 10.5 Integrations (product-level)
| Integration | Why |
|---|---|
| Uniswap v4 pools | Where all liquidity lives |
| Uniswap API / interface | Distribution; swappers get better prices from managed pools |
| URC-4 (Active Liquidity Framework) | Lets routers quote Backed-managed liquidity. Aligns with Uniswap Labs' standard |
| URC-2 / URC-3 (hook swap events, hook stats) | Standard reporting of hook swaps and TVL |
| Oracles (Chainlink, Pyth) | Reference prices for the scoreboard (performance versus holding) |
| Partner tech for sponsor prizes | Reactive Network (automated reallocation), EigenLayer, Brevis (proof-based scoreboard: Brevis already lists "fee-weighted LP rewards"), Fhenix (private strategies; Fhenix lists "private portfolio rebalancing") |
| TJAR fee conversion | Optional protocol and curator fee conversion |

---

## 11. Fit with the UHI11 theme and Atrium's prompts

### 11.1 Theme statement mapping
| Theme text | Backed |
|---|---|
| "empower **curators** and **automated strategies**" | Curators (vaults) and managers (including bots and agents) are the two core roles |
| "to **actively manage and rebalance** liquidity positions" | Managers actively place, reprice and rebalance liquidity |
| "**directly through Hooks**" | The hook holds the rules, scoreboard and first-loss enforcement |
| "**curated, professionally managed** liquidity" | Curators select managers; managers are professional by proof, not by claim |
| "drives the **next stage of on-chain capital allocation**" | The curator layer is an open capital-allocation market for Uniswap liquidity |

### 11.2 Atrium's four UHI11 prompts
| # | Atrium prompt | How Backed covers it |
|---|---|---|
| 1 | **Vault & Token-Gated Hooks:** LPs opt into whitelisted strategies | Curator vaults with manager whitelists |
| 2 | **Curated LP Network Hooks:** depositors follow professional managers | Depositors follow curators or managers directly, with first-loss protection |
| 3 | **Auto-Rebalancing Hooks:** offchain signals or oracle triggers | Managers rebalance (any method, including agents); curators rebalance capital across managers |
| 4 | **Performance & Strategy Hooks:** performance fees, backtesting, migration | Performance fees above a hurdle, high-water mark, an honest scoreboard (live track record), and curator-driven migration |

### 11.3 Related Atrium and ecosystem requests
- **Unichain track, "tokenized strategies / yield-bearing tokens":** vault shares are a tokenized strategy.
- **Variant's Derek Walkush (community ideas on Atrium's page):** "automated liquidity provisioning" and "lending hooks". Backed's credit-style depositor terms touch both.
- **Uniswap ecosystem request, "smart borrow & leveraged liquidity":** an adjacent area, not core.

### 11.4 Why it matches Atrium's winning pattern
Past on-theme winners were **permissionless** and named a concrete LP pain. Backed:
- is open to anyone in all three roles
- names the pain: LPs lose to arbitrage, and copy-LP has no protection
- offers partner-prize hooks: Reactive, Brevis, Fhenix, EigenLayer, Chainlink

---

## 12. Why Uniswap wants this
1. **Professional liquidity stays on Uniswap.** Prop AMMs take about 14% of Ethereum DEX flow off Uniswap. Backed gives skilled managers a reason to operate on v4.
2. **Better prices for swappers.** Actively managed pools leak less to arbitrage, so execution is tighter.
3. **New capital into v4.** Depositors who would never LP themselves get a protected way in.
4. **Fits Uniswap's direction:**
   - Labs is shipping its own hooks for professional liquidity (DualPool, StablePair, VolatilePair).
   - Uniswap Earn shows Uniswap already embraces curation.
   - Hayden Adams says professional liquidity is needed for big pairs.
   - URC-4 exists to make active liquidity routable.
5. **Fee switch alignment.** More managed v4 volume means more protocol fees and burn.

---

## 13. Competitive landscape and prior art

### 13.1 Direct and adjacent products
| Product | What it does | How Backed differs |
|---|---|---|
| **Arrakis (Pro, HOT)** | Professional LP management; HOT has one trusted quoter on pooled funds | Backed is open to many managers, with first-loss and an honest scoreboard; Arrakis is one trusted operator |
| **Gamma, Steer, ICHI, Charm, Beefy CLM** | Automated LP vaults | No manager skin in the game; TVL collapsing |
| **Morpho / Euler curators** | Curate lending markets | Backed brings the curator model to Uniswap liquidity, which curators don't touch today |
| **Wintermute Armitage** | Morpho vault lending to Wintermute (unsecured) | Backed's managers can't take the money: it stays in the pool |
| **Hyperliquid user vaults** | Anyone runs a vault; leader keeps a stake | Closest precedent; Backed applies it to Uniswap liquidity with curators on top |
| **Prop AMMs (HumidiFi, Tessera, Fermiswap, Metric)** | Single firm, own capital, frequent repricing | Backed opens actively managed liquidity to outside capital |
| **Copy-LP (MetEngine, Krystal, Revert)** | Mirror a wallet's LP positions | The leader bears no loss; Backed's leader loses first |
| **Uniswap DualPool / Earn** | Labs' hook parking idle inventory in vaults; Earn's curated lending vaults | Different direction: vault money doesn't fund managed liquidity |

### 13.2 Hackathon prior art (Uniswap Hook Incubator and ETHGlobal)
| Project | Event | Overlap |
|---|---|---|
| VaultCurator, Ranti | UHI11 (now) | Curator vaults with performance fees, backtesting, migration. No first-loss or honest-scoreboard trust model |
| LPDAO "Hedge Fund in a Hook" | UHI2 | LPs elect one manager; no first-loss, no marketplace |
| CoPool | UHI3 (prize) | LP delegates management; no stake or scoreboard |
| Silicon Vision Fund | UHI3 (prize) | Launch AI-managed funds; no first-loss |
| Mirror | UHI2 (prize) | Copy trading; the leader bears no loss |
| Arbiter, Maestro, am-AMM variants | UHI1–UHI9 | One manager per pool chosen by auction; no curator layer |
| HyFi | UHI9 (prize) | Prop AMMs on EVM with MMs' own capital |
| CleanFlow Bonds | UHI8 | Bonds for executors, not managers |
| Unistrata, RiskShield | UHI | Tranches; no manager marketplace |
| CrossLiquid, ALMA, Zuno, Moai, Alps | ETHGlobal 2026 (prizes) | Agent LP managers; no first-loss or open marketplace |
| Koi | ETHGlobal | Agents compete to manage a shared vault (unplaced) |
| MetEngine | Colosseum Breakout (2nd) | Copy-LP on Solana |

**Novelty verdict:** each ingredient exists somewhere. The **combination is fresh**: an open three-role marketplace, manager first-loss, capital locked in the pool, a hook-recorded scoreboard, and curator allocation across managers. No project found combines them.

---

## 14. Open product questions for the PRD

### Roles and access
1. Is the manager role fully permissionless, or is there a lightweight entry (minimum stake, self-only period)?
2. Can one manager run multiple strategies or pools under one identity?
3. Can a curator also be a manager in their own vault (conflict of interest)? Should that be disclosed or blocked?

### First-loss design
4. Minimum first-loss ratio: a global default, or set per curator?
5. Is the stake in the same assets as the managed capital, or any approved asset?
6. What happens when a stake is exhausted: the manager is paused, capital is returned, or the manager must top up?
7. Can backers add to a manager's first-loss (a "co-investment" tier)?

### Scoreboard
8. Which metrics are canonical: return versus holding, fees, drawdown, consistency, rule violations?
9. Which reference price defines "versus holding" (which oracle, which time window)?
10. Is the scoreboard per pool, per manager, or both? Is it portable across curators?

### Capital allocation
11. How do capacity limits grow with track record (a formula versus curator discretion)?
12. How often can curators reallocate? Is there notice for depositors?
13. Can depositors choose "auto-follow the top managers" with no curator?

### Economics
14. Depositor return model: pure profit share, or credit-style target return plus upside?
15. Performance fee hurdle and high-water mark rules.
16. Curator fee model: management, performance, or distributor-paid?
17. Protocol fee: yes or no, how much, and where does it go?

### Exits and liquidity
18. Depositor exit terms: instant, queue, or notice period? What happens in stress?
19. What happens to depositors if a manager is removed mid-cycle?

### Scope for the hookathon version
20. Which pool(s) and pair(s) to feature first (e.g., ETH/USDC, a bridge pair per Hayden's essay)?
21. Which manager types to show (range manager, quoter, agent)?
22. Which partner integrations to target for sponsor prizes (Reactive, Brevis, Fhenix, EigenLayer, Chainlink)?
23. URC-4 alignment: in scope or a stretch goal?

---

## 15. Risks, beliefs and kill criteria

### 15.1 What you have to believe
1. Skilled managers will post their own money to manage larger capital. Precedent: Hyperliquid user vaults, prop-AMM firms' appetite for cheaper inventory, Wintermute borrowing via Armitage.
2. Depositors value first-loss protection enough to prefer Backed over copy-LP and plain vaults.
3. Curators (professional or community) want a new, differentiated product in a market where onchain curator fees are near zero.

### 15.2 Market and product risks (idea-level)
| Risk | Description | Response |
|---|---|---|
| **Not enough good managers** | The two-sided marketplace cold start | Self-only mode; the public scoreboard as a manager magnet; bots and agents (a huge builder pool) as early managers |
| **First-loss too small to matter** | A thin stake gives false comfort | Curator-set minimum ratios; coverage clearly displayed |
| **Curators don't come** | Professional curators stick to lending | Community, treasury and distributor curators first; professionals later |
| **Looks like copy-LP** | Judges see it as a crowded category | Lead with the trust model (first-loss plus locked capital plus honest record), not with "follow a trader" |
| **Looks like a vault plus a performance fee** | Overlap with VaultCurator and Ranti in UHI11 | Lead with the three-role open market and losses-first; position those as the narrow version |
| **Gated perception** | Institutional framing limits reach | Keep the pitch permissionless (the current version) |

### 15.3 Kill criteria (from public data, no interviews needed)
- If an existing product already combines manager first-loss, locked capital and a curator layer on a major DEX, the idea is not fresh. Re-check before final submission.
- If Hyperliquid-style "leader keeps a stake" vaults show no meaningful follower adoption, belief #2 weakens.

---

## 16. Success metrics

### 16.1 For the hookathon
- Clear theme fit across all four Atrium prompts.
- Judges can repeat the one-liner after one hearing.
- At least one sponsor-prize integration (Reactive, Brevis, Fhenix, EigenLayer or Chainlink).

### 16.2 For the product (post-hackathon)
| Metric | Why |
|---|---|
| Number of active managers with stakes | Supply side |
| Total first-loss stake versus capital managed | Depth of protection |
| Number of curator vaults | Curation layer health |
| TVL from depositors | Demand side |
| Managed pools' performance versus passive pools | Proof the model works |
| Share of losses absorbed by manager stakes | Proof the protection works |
| Swap price improvement in managed pools | Value to Uniswap swappers |
| Volume routed through Backed pools | Value to Uniswap |

---

## 17. Naming and pitch variants

**Name candidates:** Backed (working name) · Skin · FirstLoss · Stakeholder · Vouch · Underwrite · Curate · Bonded LP · Patron.

**Pitch variants:**
- "Anyone can manage other people's Uniswap liquidity, because they lose first."
- "Copy-LP, except the leader eats the loss first."
- "Pick a curator, curators pick managers, managers fight the arbitrageurs."
- "Morpho curators pick lending markets. Ours pick Uniswap liquidity managers."
- "The credit bureau and marketplace for Uniswap liquidity managers."

**Four-line pitch skeleton:**
1. **Problem:** LPs lose to arbitrage; active management fixes it but is closed or untrustworthy.
2. **Uniswap's push:** UHI11 asks for curated, professionally managed liquidity through hooks.
3. **One-liner:** anyone can manage other people's Uniswap liquidity, because they lose first.
4. **The stat:** about $10B sits in curated vaults and none of it is in DEX liquidity; LP managers are down 70–80% YoY.

---

## 18. Glossary
| Term | Meaning |
|---|---|
| **LP (liquidity provider)** | Someone who deposits tokens into a pool so others can trade against them |
| **x·y=k** | The basic Uniswap pricing formula: the product of the two token reserves stays constant |
| **Concentrated liquidity** | LPs choose a price range for their liquidity (Uniswap v3/v4) |
| **Hook** | Custom code attached to a Uniswap v4 pool that runs at key moments (swap, add or remove liquidity) |
| **IL / LVR** | Impermanent loss / loss-versus-rebalancing: what LPs lose to price moves and arbitrage |
| **Active management** | Adjusting price or range as the market moves, instead of leaving liquidity static |
| **Prop AMM** | A pool run by one trading firm that reprices it frequently with its own capital |
| **Curator** | A party that decides where pooled capital goes (on Morpho, which lending markets; on Backed, which managers) |
| **First-loss stake** | The manager's own money that absorbs losses before depositors are affected |
| **Scoreboard** | The hook-recorded, unfakeable record of each manager's results |
| **High-water mark** | Performance fees are only charged on new highs, not on recovering previous losses |
| **URC-4** | Uniswap's draft standard (Active Liquidity Framework) for routers to quote actively managed hook liquidity |
| **UHI** | Uniswap Hook Incubator, run by Atrium Academy and funded by the Uniswap Foundation |

---

## 19. Sources and research files

### Local research (full detail, links and dates)
- `~/ideation/uhi11-curated-liquidity.md`: the ideation log, rounds 1–9
- `~/ideation/research/00-summary.md`: dossier index
- `~/ideation/research/01-uniswap-labs-uf.md`: Uniswap Labs and Foundation launches and signals
- `~/ideation/research/02-atrium-uhi.md`: Atrium, the UHI11 program, analysis of all 759 past hooks
- `~/ideation/research/03-defi-landscape.md`: LP managers, curators, prop AMMs, failures
- `~/ideation/research/04-hackathon-landscape.md`: ETHGlobal and Colosseum projects on the theme
- `~/ideation/research/05-curators-vs-dex.md`: why curators don't run DEX liquidity
- `~/ideation/research/06-atrium-rfh.md`: Atrium's full Request for Hooks page, including UHI8–UHI11 prompts
- `~/scratch/uhi/repo/hook_directory.csv`: dataset of all UHI hook submissions

### Key public sources
- Atrium Request for Hooks: https://rfh.atrium.academy
- Atrium 2025 Wrapped (UHI themes): https://blog.atrium.academy/uniswap-hook-incubator-2025-wrapped
- Atrium sponsors / dates: https://atrium.academy/sponsors
- URC-4 Active Liquidity Framework: https://gov.uniswap.org/t/urc-4-active-liquidity-framework-hook-interface/26156
- Aggregator Hooks launch: https://blog.uniswap.org/aggregator-hooks-are-now-live
- DualPool: https://blog.uniswap.org/dualpool-hook-is-now-live
- PropAMMs, Ethereum vs Solana (Blockworks): https://blockworks.com/newsletter/0xresearch/issue/post_442afef3-ed36-4182-8847-1ebac0085abc
- PropAMM markouts paper (arXiv 2609.38056), via CryptoSlate: https://cryptoslate.com/propamms-lower-solana-trade-costs-and-public-pool-returns-crash/
- 0x "PropAMM shenanigans": https://0x.org/post/propamm-shenanigans
- Proprietary AMMs and Ethereum (ethresear.ch): https://ethresear.ch/t/proprietary-amms-and-ethereum/25543
- Bunni shutdown: https://www.theblock.co/post/375813/bunni-dex-shuts-down
- Stream Finance collapse: https://decrypt.co/347285
- Wintermute Armitage critique: https://gogol.substack.com/p/wintermute-enters-morpho-curation
- Steakhouse on vaults (Bankless, Jul 30 2026): https://www.bankless.com/podcast/whats-next-for-vaults-steakhouse-co-founder-adrian-cachinero
- Gauntlet $125M raise: https://gsr.io/insights/gauntlet-raises-125m-for-onchain-curation-gsr-weekly
- Hindsight hook (UHI10): https://github.com/OoJae/hindsight-hook
- UHI hook dataset: https://github.com/AtriumAcademy/UHI-Hook-Data

> Note: several figures come from single sources or search summaries; the research files mark them [unverified] where applicable. Re-verify key numbers before final submission.
