import type { Metadata } from "next";
import { Deck } from "./deck";

export const metadata: Metadata = { title: "Deck", description: "Why Kancy exists, how it works and what it costs, in fifteen slides." };
export default function Page() {
  return <Deck />;
}
