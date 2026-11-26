import type { Metadata } from "next";
import { Faucet } from "./faucet";

export const metadata: Metadata = { title: "Faucet" };
export default function Page() {
  return <Faucet />;
}
