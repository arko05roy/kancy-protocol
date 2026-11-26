import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { ManagerProfile } from "./profile";

export const metadata: Metadata = { title: "Manager" };

export default async function Page({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) notFound();
  return <ManagerProfile address={getAddress(address.toLowerCase())} />;
}
