"use client";

import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { useReadContracts } from "wagmi";
import { book, factory, oracle, registry, settler, usdc, vaultAt } from "./contracts";
import { managerName } from "./names";

const REFRESH = 20_000;
const live = { refetchInterval: REFRESH, staleTime: 10_000 } as const;

/** Seconds since epoch, ticking once per second. 0 during server render. */
export function useNow() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function useProtocol() {
  const q = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...settler, functionName: "currentEpoch" },
      { ...settler, functionName: "epochEndsAt" },
      { ...oracle, functionName: "price" },
      { ...registry, functionName: "minStake" },
      { ...registry, functionName: "maxRebalancesPerEpoch" },
      { ...book, functionName: "poolSqrtPrice" },
    ],
    query: live,
  });
  const [epoch, endsAt, price, minStake, maxRebalances, sqrtPrice] = q.data ?? [];
  return {
    epoch: epoch?.result,
    endsAt: endsAt?.result === undefined ? undefined : Number(endsAt.result),
    price: price?.result,
    minStake: minStake?.result,
    maxRebalances: maxRebalances?.result,
    sqrtPrice: sqrtPrice?.result,
    isLoading: q.isLoading,
    isError: q.isError || (q.data !== undefined && epoch?.status === "failure"),
  };
}

export type ManagerRow = {
  address: Address;
  name: string;
  status: number;
  stake: bigint;
  pendingStake: bigint;
  allocated: bigint;
  tickLower: number;
  tickUpper: number;
  rebalanceCount: number;
  rebalanceEpoch: bigint;
  stakeWithdrawRequest: bigint;
  metadataURI: string;
};

/** Live state for a set of Manager addresses. */
export function useManagerRows(addresses: readonly Address[] | undefined) {
  const q = useReadContracts({
    allowFailure: false,
    contracts: (addresses ?? []).flatMap((a) => [
      { ...registry, functionName: "getManager", args: [a] } as const,
      { ...registry, functionName: "totalAllocation", args: [a] } as const,
    ]),
    query: { ...live, enabled: !!addresses?.length },
  });
  const rows = useMemo<ManagerRow[] | undefined>(() => {
    if (addresses && addresses.length === 0) return [];
    if (!addresses || !q.data) return undefined;
    const data = q.data as unknown[];
    return addresses.map((address, i) => {
      const m = data[i * 2] as Omit<ManagerRow, "address" | "name" | "allocated">;
      return { ...m, address, allocated: data[i * 2 + 1] as bigint, name: managerName(address, m.metadataURI) };
    });
  }, [addresses, q.data]);
  return { rows, isError: q.isError, refetch: q.refetch };
}

export function useManagers() {
  const list = useReadContracts({ contracts: [{ ...registry, functionName: "managers" }], query: live });
  const addresses = list.data?.[0]?.result;
  const detail = useManagerRows(addresses);
  return { managers: detail.rows, isError: detail.isError || list.data?.[0]?.status === "failure" };
}

export type VaultRow = {
  address: Address;
  name: string;
  curator: Address;
  nav: bigint;
  idle: bigint;
  allocated: bigint;
  supply: bigint;
  curatorCutBps: bigint;
  minRatioBps: bigint;
  maxAllocation: bigint;
  managers: readonly Address[];
};

const VAULT_FIELDS = [
  "name", "curator", "nav", "idle", "allocated", "totalSupply", "curatorCutBps", "minRatioBps", "maxAllocation", "managers",
] as const;

export function useVaultRows(addresses: readonly Address[] | undefined) {
  const q = useReadContracts({
    allowFailure: false,
    contracts: (addresses ?? []).flatMap((a) => VAULT_FIELDS.map((functionName) => ({ ...vaultAt(a), functionName }))),
    query: { ...live, enabled: !!addresses?.length },
  });
  const rows = useMemo<VaultRow[] | undefined>(() => {
    if (addresses && addresses.length === 0) return [];
    if (!addresses || !q.data) return undefined;
    const data = q.data as unknown[];
    return addresses.map((address, i) => {
      const [name, curator, nav, idle, allocated, supply, cut, ratio, max, managers] = data.slice(
        i * VAULT_FIELDS.length,
        (i + 1) * VAULT_FIELDS.length,
      ) as [string, Address, bigint, bigint, bigint, bigint, bigint, bigint, bigint, readonly Address[]];
      return { address, name, curator, nav, idle, allocated, supply, curatorCutBps: cut, minRatioBps: ratio, maxAllocation: max, managers };
    });
  }, [addresses, q.data]);
  return { rows, isError: q.isError };
}

export function useVaults() {
  const list = useReadContracts({ contracts: [{ ...factory, functionName: "allVaults" }], query: live });
  const addresses = list.data?.[0]?.result;
  const detail = useVaultRows(addresses);
  return { vaults: detail.rows, isError: detail.isError || list.data?.[0]?.status === "failure" };
}

/** Wallet balance and allowance of mUSDC toward `spender`. */
export function useUsdc(user: Address | undefined, spender?: Address) {
  const q = useReadContracts({
    contracts: [
      { ...usdc, functionName: "balanceOf", args: [user!] },
      { ...usdc, functionName: "allowance", args: [user!, spender ?? user!] },
    ],
    query: { ...live, enabled: !!user },
  });
  return { balance: q.data?.[0]?.result, allowance: q.data?.[1]?.result };
}
