# Kancy Protocol Glossary

**Manager**: A party that decides how pooled liquidity is placed in one Uniswap pool, and has posted a First-loss Stake to do so.

**Curator**: A party that runs a Vault and decides which Managers receive its capital and how much.

**Vault**: A Curator's pool of Depositor capital, allocated across the Managers the Curator has approved.

**Depositor**: A party that puts USDC into a Vault (or directly behind one Manager) in return for a share of results.

**First-loss Stake**: USDC a Manager puts in themselves, which absorbs that Manager's Loss before any Depositor is affected.

**Epoch**: A fixed period at whose end each Manager's result is measured and settled.

**Loss**: A fall in the USDC value of a Manager's capital over an Epoch, valued with an oracle price. (Distinct from underperformance versus holding, which is shown on the Scoreboard but never charged.)

**Grace Period**: One Epoch after a Manager's First-loss Stake is exhausted, during which the Manager must top it up or be Paused. No new capital is allocated to them meanwhile.

**Paused**: A Manager state in which they can no longer act and their capital is returned to the Vault as idle USDC.

**Withdrawal Queue**: Depositor exit requests, which are settled only at the end of an Epoch.

**Self-only**: A Manager running only their own First-loss Stake. Every new Manager must finish one Self-only Epoch before a Curator can allocate to them.

**Allocation**: The amount of Vault capital a Curator assigns to a Manager. It can change only at an Epoch boundary, and is limited by the Curator's Max Allocation and Min First-loss Ratio.

**Min First-loss Ratio**: The smallest First-loss Stake, as a share of capital managed, that a Curator accepts from a Manager.

**Scoreboard**: The record of each Manager's results, written by the system itself and never self-reported.
