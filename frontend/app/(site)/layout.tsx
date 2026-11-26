import type { ReactNode } from "react";
import { Footer, Nav } from "@/components/chrome";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
