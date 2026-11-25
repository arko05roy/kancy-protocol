# Kancy bots

Protocol-operated bots (PRD §9.2, §9.3). They read addresses from `../contracts/deployments/unichain-sepolia.json`.

- **traffic**: arbitrages the pool back to the Chainlink price when the gap exceeds `ARB_THRESHOLD_BPS`, plus random noise swaps for fee volume.
- **keeper**: when the epoch is over, arbitrages first if the gap is large (settlement reverts past `maxDeviation`), then calls `settleEpoch()` and collects the bounty.

```
cp .env.example .env   # set PRIVATE_KEY (needs Unichain Sepolia ETH; mock tokens come from the faucet)
pnpm install
pnpm status            # oracle vs pool price, epoch timer, bot balances
pnpm start             # keeper + traffic in one sequential loop (no nonce clashes)
pnpm traffic           # swap bot only
pnpm keeper            # keeper only
```
