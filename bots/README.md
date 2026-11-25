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

## Manager bot (PRD §9.1)

```
# anyone: one manager, your own key
MANAGER_KEY=0x... MANAGER_STRATEGY=centered pnpm manager      # or: bad
# protocol demo managers (MANAGER_KEY_GOOD / MANAGER_KEY_BAD in .env)
pnpm managers
```

- `centered`: keeps a ±`CENTERED_RANGE_PCT`% range around the oracle price; rebalances once per epoch (right after settlement, to put new USDC to work) and whenever price leaves the inner band. It computes the swap so the inventory matches the new range's token ratio (D22).
- `bad`: churns the whole book between one-sided out-of-range positions. Pays swap fees, earns none, so its stake takes the loss.
- Registers with `MANAGER_STAKE_USD` (default 2000 mUSDC) if not yet registered. Respects `maxRebalancesPerEpoch`.

Live demo managers on Unichain Sepolia: good `0x9688cB16B6Ed1D4b34a3eF83e4C44796Fe0D70d8`, bad `0x50D6b008E5698eA9A76f5f9C3f17B56637D9C426`.
