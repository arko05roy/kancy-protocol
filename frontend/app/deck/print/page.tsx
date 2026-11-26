import type { Metadata } from "next";
import { Deck } from "../deck";

export const metadata: Metadata = { title: "Deck (print)", robots: { index: false } };
export default function Page() {
  return <Deck print />;
}
