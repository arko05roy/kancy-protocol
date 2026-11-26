import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page">
      <div className="empty">
        <img src="/art/torii.png" alt="" />
        <h1 className="dither">Nothing in this orbit</h1>
        <p>That page or address does not exist.</p>
        <Link href="/" className="btn">Back to the start <span className="arrow">→</span></Link>
      </div>
    </div>
  );
}
