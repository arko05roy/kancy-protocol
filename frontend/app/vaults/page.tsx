import type { Metadata } from "next";
import { VaultList } from "./list";

export const metadata: Metadata = { title: "Vaults" };
export default function Page() {
  return <VaultList />;
}
