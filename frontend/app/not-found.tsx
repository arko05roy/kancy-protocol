import Link from "next/link";
import { Nav } from "@/components/chrome";

export default function NotFound() {
  return (
    <>
    <Nav />
    <main id="main" className="page">
      <div className="empty">
        <img src="/art/torii.png" alt="" />
        <p className="eyebrow">404</p>
        <h1 className="page-title">Nothing in this orbit</h1>
        <p>That page or address does not exist.</p>
        <Link href="/" className="btn">Back to the start <span className="arrow">→</span></Link>
      </div>
    </main>
    </>
  );
}
