"use client";

import { AnimatePresence, motion } from "motion/react";
import { EXPLORER } from "@/lib/contracts";

export type Toast = { id: number; kind: "pending" | "done" | "error"; title: string; body: string; hash?: string };

const ICON = { pending: "✦", done: "✓", error: "✕" };

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} layout className={`toast toast-${t.kind}`} initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60 }}>
            <i aria-hidden="true">{ICON[t.kind]}</i>
            <div>
              <strong>{t.title}</strong>
              <p>{t.body}</p>
              {t.hash && <a href={`${EXPLORER}/tx/${t.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>✕</button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
