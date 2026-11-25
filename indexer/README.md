# Kancy indexer (Ponder)

Indexes `KancyHook`, `ManagerRegistry`, `PositionBook`, `EpochSettler`, `VaultFactory` and every `KancyVault` (via the factory) into tables served as GraphQL (PRD §9.4).

```
pnpm install
pnpm start                      # PGlite locally, GraphQL at http://localhost:42069/graphql
DATABASE_URL=postgres://... pnpm start   # Postgres (production)
```

Env: `PONDER_RPC_URL_1301` (use a private RPC: the public one rate-limits), `PONDER_MAX_RPS` (default 4), `START_BLOCK` (default 68,785,000, just before the first bot activity).

| Table | What |
|---|---|
| `manager` | Scoreboard row per Manager: status, stake, allocated, coverage, cumulative return, max drawdown, losses absorbed / passed to backers, rebalances |
| `manager_epoch` | Per-Epoch result: capital, value, pnl, return, fromStake, fromBackers, stake after, coverage |
| `status_change` | SelfOnly / Active / Grace / Paused history |
| `epoch` | Settled Epochs with oracle price |
| `vault`, `vault_epoch` | Vault config, last NAV / supply, share price per Epoch |
| `allocation`, `allocation_epoch` | Vault-to-Manager allocation, target, and each Vault's share of every Manager result |
| `deposit`, `depositor`, `withdrawal` | Depositor activity (withdrawal `kind`: requested / cancelled / claimed) |
| `rebalance` | Range changes with gas used |
| `swap`, `protocol_stats` | Pool swaps and global totals (volume, fees, last price) |

Not yet indexed: "vs Hold" (display-only metric, PRD §10).
