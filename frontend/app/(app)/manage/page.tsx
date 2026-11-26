import type { Metadata } from "next";
import { Console } from "./console";

export const metadata: Metadata = { title: "Manage" };
export default function Page() {
  return <Console />;
}
