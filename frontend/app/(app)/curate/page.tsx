import type { Metadata } from "next";
import { Curate } from "./curate";

export const metadata: Metadata = { title: "Curate" };
export default function Page() {
  return <Curate />;
}
