import { parseAbi } from "viem";

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function faucet()",
  "function lastDrip(address) view returns (uint256)",
]);

export const oracleAbi = parseAbi([
  "function price() view returns (uint256)",
  "function poolPrice(uint160) view returns (uint256)",
  "function maxDeviationBps() view returns (uint256)",
  "function wethIsCurrency0() view returns (bool)",
]);

export const bookAbi = parseAbi(["function poolSqrtPrice() view returns (uint160)"]);

export const settlerAbi = parseAbi([
  "function currentEpoch() view returns (uint64)",
  "function epochEndsAt() view returns (uint256)",
  "function keeperBounty() view returns (uint256)",
  "function settleEpoch()",
]);

export const routerAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }",
  "struct TestSettings { bool takeClaims; bool settleUsingBurn; }",
  "function swap(PoolKey key, SwapParams params, TestSettings testSettings, bytes hookData) payable returns (int256 delta)",
]);

export const registryAbi = parseAbi([
  "struct Manager { uint8 status; int24 tickLower; int24 tickUpper; uint32 rebalanceCount; uint64 rebalanceEpoch; uint256 stake; uint256 pendingStake; uint256 stakeWithdrawRequest; string metadataURI; }",
  "function getManager(address) view returns (Manager)",
  "function maxRebalancesPerEpoch() view returns (uint32)",
  "function minStake() view returns (uint256)",
  "function register(string metadataURI, uint256 stakeAmount, int24 tickLower, int24 tickUpper)",
  "function topUpStake(uint256 amount)",
]);

export const bookFullAbi = parseAbi([
  "function books(address) view returns (uint128 liquidity, int24 tickLower, int24 tickUpper, uint256 weth, uint256 usdc)",
  "function value(address, uint256) view returns (uint256)",
  "function rebalance(int24 tickLower, int24 tickUpper, bool sellWeth, uint256 amountIn)",
]);
