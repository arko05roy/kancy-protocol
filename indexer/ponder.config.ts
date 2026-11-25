import { createConfig, factory } from "ponder";
import { parseAbiItem } from "viem";
import dep from "./deployments.json" with { type: "json" };

import { KancyHookAbi } from "./abis/KancyHookAbi";
import { ManagerRegistryAbi } from "./abis/ManagerRegistryAbi";
import { PositionBookAbi } from "./abis/PositionBookAbi";
import { EpochSettlerAbi } from "./abis/EpochSettlerAbi";
import { VaultFactoryAbi } from "./abis/VaultFactoryAbi";
import { KancyVaultAbi } from "./abis/KancyVaultAbi";

// First block with Kancy activity (bots started ~68,785,049). Contracts deployed at 68,159,297 emitted nothing we index.
// Override with START_BLOCK to backfill from deployment.
const startBlock = Number(process.env.START_BLOCK ?? 68785000);
const chain = "unichainSepolia" as const;

export default createConfig({
  // PGlite locally; set DATABASE_URL for Postgres (PRD §9.5)
  ...(process.env.DATABASE_URL
    ? { database: { kind: "postgres" as const, connectionString: process.env.DATABASE_URL } }
    : {}),
  chains: {
    unichainSepolia: {
      id: dep.chainId,
      maxRequestsPerSecond: Number(process.env.PONDER_MAX_RPS ?? 4),
      rpc: process.env.PONDER_RPC_URL_1301 ?? "https://sepolia.unichain.org",
    },
  },
  contracts: {
    KancyHook: { abi: KancyHookAbi, chain, address: dep.kancyHook as `0x${string}`, startBlock },
    ManagerRegistry: { abi: ManagerRegistryAbi, chain, address: dep.managerRegistry as `0x${string}`, startBlock },
    PositionBook: { abi: PositionBookAbi, chain, address: dep.positionBook as `0x${string}`, startBlock, includeTransactionReceipts: true },
    EpochSettler: { abi: EpochSettlerAbi, chain, address: dep.epochSettler as `0x${string}`, startBlock },
    VaultFactory: { abi: VaultFactoryAbi, chain, address: dep.vaultFactory as `0x${string}`, startBlock },
    KancyVault: {
      abi: KancyVaultAbi,
      chain,
      address: factory({
        address: dep.vaultFactory as `0x${string}`,
        event: parseAbiItem(
          "event VaultCreated(address indexed vault, address indexed curator, string name, string metadataURI, uint16 curatorCutBps, uint16 minRatioBps, uint256 maxAllocation)",
        ),
        parameter: "vault",
      }),
      startBlock,
    },
  },
});
