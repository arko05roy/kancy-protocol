import type { Metadata } from "next";
import { Portfolio } from "./portfolio";

export const metadata: Metadata = { title: "Portfolio" };
export default function Page() {
  return <Portfolio />;
}
