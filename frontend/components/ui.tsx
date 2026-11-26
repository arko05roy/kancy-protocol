"use client";

import Link from "next/link";
import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { EXPLORER, STATUS } from "@/lib/contracts";
import { short } from "@/lib/format";
import { useTx } from "@/lib/tx";
import { Magnetic } from "./fx";
import { ConnectPrompt } from "./wallet";

export function Star({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`star ${className}`} aria-hidden="true">
      <path fill="currentColor" d="M12 0 13.6 10.4 24 12 13.6 13.6 12 24 10.4 13.6 0 12 10.4 10.4Z" />
    </svg>
  );
}

export function ButtonLink({ href, children, solid = false }: { href: string; children: ReactNode; solid?: boolean }) {
  return (
    <Magnetic>
      <Link href={href} className={`btn ${solid ? "btn-solid" : ""}`}>
        {children}
        <span className="arrow" aria-hidden="true">→</span>
      </Link>
    </Magnetic>
  );
}

export function Button({ solid, small, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { solid?: boolean; small?: boolean }) {
  return <button type="button" {...props} className={`btn ${solid ? "btn-solid" : ""} ${small ? "btn-small" : ""} ${className}`} />;
}

/** A write button: asks to connect first, and locks while any transaction is running. */
export function TxButton({ label, onClick, disabled, solid = true, small }: {
  label: string; onClick: () => void; disabled?: boolean; solid?: boolean; small?: boolean;
}) {
  const { isConnected } = useAccount();
  const { busy } = useTx();
  if (!isConnected) return <ConnectPrompt solid={solid} small={small} />;
  return (
    <Button solid={solid} small={small} disabled={disabled || busy !== null} aria-busy={busy === label} onClick={onClick}>
      {busy === label ? <span className="dots">Working</span> : label}
    </Button>
  );
}

export function Panel({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="panel-head">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {hint && <dd className="stat-hint">{hint}</dd>}
    </div>
  );
}

export function Field({ label, unit, hint, error, max, value, onChange, placeholder = "0.00", inputMode = "decimal" }: {
  label: string; unit?: string; hint?: ReactNode; error?: string; max?: () => void;
  value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: "decimal" | "text";
}) {
  const id = useId();
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="field-box">
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode}
          autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={`${id}-hint`} />
        {max && <button type="button" className="field-max" onClick={max}>Max</button>}
        {unit && <span className="field-unit">{unit}</span>}
      </div>
      <p id={`${id}-hint`} className="field-hint">{error ?? hint}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: number }) {
  return <span className={`badge badge-${status}`}><i aria-hidden="true" />{STATUS[status] ?? "Unknown"}</span>;
}

export function Address({ value, href }: { value: string; href?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="address">
      {href ? <Link href={href}>{short(value)}</Link> : (
        <a href={`${EXPLORER}/address/${value}`} target="_blank" rel="noreferrer">{short(value)}</a>
      )}
      <button type="button" aria-label="Copy address" onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}>{copied ? "Copied" : "Copy"}</button>
    </span>
  );
}

export function Empty({ title, children, art = "orbit" }: { title: string; children?: ReactNode; art?: string }) {
  return (
    <div className="empty">
      <img src={`/art/${art}.png`} alt="" />
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Loading({ label = "Reading the chain" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <div className="loading-bar" aria-hidden="true"><i /></div>
      <span className="dots">{label}</span>
    </div>
  );
}

export function ChainError() {
  return (
    <Empty title="Could not read Unichain Sepolia">
      <p>The RPC did not answer. This page retries on its own; if it keeps failing, set a private RPC in NEXT_PUBLIC_RPC_URL.</p>
    </Empty>
  );
}

export function IndexerNote() {
  return (
    <p className="note">
      History comes from the Kancy indexer, which is not reachable right now. Live balances on this page are read straight from the chain.
    </p>
  );
}

/** Horizontal share bar, e.g. stake vs backed capital. */
export function Split({ stake, backed }: { stake: number; backed: number }) {
  const total = stake + backed;
  const part = total > 0 ? (stake / total) * 100 : 0;
  return (
    <div className="split" role="img" aria-label={`Stake ${part.toFixed(0)}%, depositor capital ${(100 - part).toFixed(0)}%`}>
      <i className="split-stake" style={{ width: `${part}%` }} />
      <i className="split-backed" style={{ width: `${total > 0 ? 100 - part : 0}%` }} />
    </div>
  );
}

export function PageHead({ title, lead, eyebrow, art, children }: {
  title: ReactNode; lead: ReactNode; eyebrow?: ReactNode; art?: ReactNode; children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        <div className="lead">{lead}</div>
        {children}
      </div>
      {art}
    </header>
  );
}

/** Eyebrow, heading and lead used at the top of every landing section. */
export function SectionHead({ eyebrow, title, lead, center = false }: { eyebrow: string; title: ReactNode; lead?: ReactNode; center?: boolean }) {
  return (
    <header className={`section-head ${center ? "section-head-center" : ""}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="section-title">{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </header>
  );
}
