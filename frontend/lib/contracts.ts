import type { Address } from "viem";
import { unichainSepolia } from "viem/chains";
import dep from "./deployment.json";
import {
  epochSettlerAbi,
  kancyVaultAbi,
  managerRegistryAbi,
  mockTokenAbi,
  oracleAdapterAbi,
  positionBookAbi,
  vaultFactoryAbi,
} from "./abi";

export const chain = unichainSepolia;
export const EXPLORER = unichainSepolia.blockExplorers.default.url;
export const FAUCET_ETH = "https://faucet.quicknode.com/unichain/sepolia";

export const usdc = { address: dep.mUSDC as Address, abi: mockTokenAbi } as const;
export const weth = { address: dep.mWETH as Address, abi: mockTokenAbi } as const;
export const registry = { address: dep.managerRegistry as Address, abi: managerRegistryAbi } as const;
export const settler = { address: dep.epochSettler as Address, abi: epochSettlerAbi } as const;
export const factory = { address: dep.vaultFactory as Address, abi: vaultFactoryAbi } as const;
export const book = { address: dep.positionBook as Address, abi: positionBookAbi } as const;
export const oracle = { address: dep.oracleAdapter as Address, abi: oracleAdapterAbi } as const;
export const vaultAt = (address: Address) => ({ address, abi: kancyVaultAbi }) as const;

export const TICK_SPACING = dep.tickSpacing;
export const EPOCH_LENGTH = dep.epochLength;
export const PERFORMANCE_FEE = 0.2;

export const DEPLOYMENT: [label: string, address: string][] = [
  ["KancyHook", dep.kancyHook],
  ["PositionBook", dep.positionBook],
  ["ManagerRegistry", dep.managerRegistry],
  ["VaultFactory", dep.vaultFactory],
  ["EpochSettler", dep.epochSettler],
  ["OracleAdapter", dep.oracleAdapter],
  ["mUSDC", dep.mUSDC],
  ["mWETH", dep.mWETH],
];

/** ManagerStatus enum from ManagerRegistry. */
export const STATUS = ["Not registered", "Self-only", "Active", "Grace", "Paused"] as const;
export const Status = { None: 0, SelfOnly: 1, Active: 2, Grace: 3, Paused: 4 } as const;
