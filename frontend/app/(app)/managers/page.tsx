import type { Metadata } from "next";
import { Scoreboard } from "./scoreboard";

export const metadata: Metadata = { title: "Scoreboard" };
export default function Page() {
  return <Scoreboard />;
}
