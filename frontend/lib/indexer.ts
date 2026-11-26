"use client";

import { useQuery } from "@tanstack/react-query";

export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:42069/graphql";

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`indexer ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

function useIndexer<T>(key: unknown[], query: string, variables?: Record<string, unknown>, enabled = true) {
  return useQuery({
    queryKey: ["indexer", ...key],
    queryFn: () => gql<T>(query, variables),
    refetchInterval: 20_000,
    retry: 1,
    enabled,
  });
}

type Page<T> = { items: T[] };

export type IManager = {
  address: string;
  epochsSettled: number;
  rebalances: number;
  lossesAbsorbed: string;
  lossesPassed: string;
  feesGenerated: string;
  cumulativeReturn: number;
  maxDrawdown: number;
};

export type IManagerEpoch = {
  manager: string;
  epoch: number;
  capitalStart: string;
  valueEnd: string;
  pnl: string;
  returnPct: number;
  fromStake: string;
  fromBackers: string;
  stakeAfter: string;
  allocatedAfter: string;
  cumulativeReturn: number;
  timestamp: number;
};

const MANAGER = "address epochsSettled rebalances lossesAbsorbed lossesPassed feesGenerated cumulativeReturn maxDrawdown";
const MANAGER_EPOCH =
  "manager epoch capitalStart valueEnd pnl returnPct fromStake fromBackers stakeAfter allocatedAfter cumulativeReturn timestamp";

export const useScoreboard = () =>
  useIndexer<{ managers: Page<IManager> }>(["scoreboard"], `{ managers(limit: 100) { items { ${MANAGER} } } }`);

export const useManagerHistory = (address: string) =>
  useIndexer<{
    managers: Page<IManager>;
    managerEpochs: Page<IManagerEpoch>;
    statusChanges: Page<{ id: string; status: number; timestamp: number; txHash: string }>;
    rebalances: Page<{ id: string; epoch: number; tickLower: number; tickUpper: number; gasUsed: string | null; timestamp: number; txHash: string }>;
  }>(
    ["manager", address],
    `query($a: String!) {
      managers(where: { address: $a }) { items { ${MANAGER} } }
      managerEpochs(where: { manager: $a }, orderBy: "epoch", orderDirection: "desc", limit: 100) { items { ${MANAGER_EPOCH} } }
      statusChanges(where: { manager: $a }, orderBy: "timestamp", orderDirection: "desc", limit: 20) { items { id status timestamp txHash } }
      rebalances(where: { manager: $a }, orderBy: "timestamp", orderDirection: "desc", limit: 12) { items { id epoch tickLower tickUpper gasUsed timestamp txHash } }
    }`,
    { a: address.toLowerCase() },
  );

/** Most recent settled Manager results across the protocol. */
export const useLatestResults = (limit = 6) =>
  useIndexer<{ managerEpochs: Page<IManagerEpoch> }>(
    ["latest", limit],
    `query($n: Int!) { managerEpochs(orderBy: "timestamp", orderDirection: "desc", limit: $n) { items { ${MANAGER_EPOCH} } } }`,
    { n: limit },
  );

export const useVaultHistory = (address: string) =>
  useIndexer<{
    vaultEpochs: Page<{ epoch: number; nav: string; sharePrice: number; timestamp: number }>;
    allocations: Page<{ manager: string; cumulativePnl: string }>;
  }>(
    ["vault", address],
    `query($a: String!) {
      vaultEpochs(where: { vault: $a }, orderBy: "epoch", orderDirection: "desc", limit: 100) { items { epoch nav sharePrice timestamp } }
      allocations(where: { vault: $a }) { items { manager cumulativePnl } }
    }`,
    { a: address.toLowerCase() },
  );

/** What a wallet put in and took out, plus how Manager stakes shielded the Vaults it is in. */
export const usePortfolioHistory = (user: string | undefined) =>
  useIndexer<{
    deposits: Page<{ vault: string; assets: string }>;
    withdrawals: Page<{ vault: string; kind: string; assets: string }>;
  }>(
    ["portfolio", user],
    `query($u: String!) {
      deposits(where: { user: $u }, limit: 1000) { items { vault assets } }
      withdrawals(where: { user: $u }, limit: 1000) { items { vault kind assets } }
    }`,
    { u: user?.toLowerCase() },
    !!user,
  );
