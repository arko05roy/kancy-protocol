"use client";

import { useEffect, useRef } from "react";

type Dot = { x: number; y: number; ox: number; oy: number; vx: number; vy: number; phase: number };

/** Headline drawn as individual square pixels, like the wordmark. The pointer scatters them; they spring back. */
export function PixelText({ lines, rows = 26, maxCell = 3.2, className = "", as: Tag = "h1" }: {
  lines: string[];
  rows?: number; // pixel height of one line
  maxCell?: number; // largest on-screen size of one pixel
  className?: string;
  as?: "h1" | "h2" | "p" | "span";
}) {
  const wrap = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = lines.join("\n");

  useEffect(() => {
    const el = wrap.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const family = getComputedStyle(el).fontFamily;
    let dots: Dot[] = [];
    let cols = 0, totalRows = 0, cell = 0, frame = 0, visible = true, disposed = false;
    const mouse = { x: -1e4, y: -1e4 };

    const raster = () => {
      const off = document.createElement("canvas");
      const o = off.getContext("2d", { willReadFrequently: true })!;
      const font = `700 ${rows}px ${family}`;
      const lineHeight = Math.round(rows * 1.06);
      o.font = font;
      cols = Math.ceil(Math.max(...key.split("\n").map((l) => o.measureText(l).width))) + 2;
      totalRows = lineHeight * key.split("\n").length + 2;
      off.width = cols;
      off.height = totalRows;
      o.font = font;
      o.textBaseline = "alphabetic";
      o.fillStyle = "#fff";
      key.split("\n").forEach((line, i) => o.fillText(line, 1, i * lineHeight + rows * 0.8 + 1));
      const data = o.getImageData(0, 0, cols, totalRows).data;
      dots = [];
      for (let y = 0; y < totalRows; y++) {
        for (let x = 0; x < cols; x++) {
          if (data[(y * cols + x) * 4 + 3] > 105) {
            const jitter = still ? 0 : 1;
            dots.push({
              x, y, vx: 0, vy: 0, phase: Math.random() * 6.28,
              ox: (Math.random() - 0.5) * 40 * jitter, oy: (Math.random() - 0.5) * 60 * jitter,
            });
          }
        }
      }
    };

    const size = () => {
      const width = el.parentElement!.clientWidth;
      cell = Math.min(maxCell, width / cols);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(cols * cell * dpr);
      cv.height = Math.round(totalRows * cell * dpr);
      cv.style.width = `${cols * cell}px`;
      cv.style.height = `${totalRows * cell}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(0);
    };

    const paint = (time: number) => {
      ctx.clearRect(0, 0, cols * cell, totalRows * cell);
      ctx.fillStyle = "#f4f4f2";
      const side = Math.max(1, cell - Math.min(0.6, cell * 0.16));
      const mx = mouse.x / cell, my = mouse.y / cell;
      for (const d of dots) {
        if (!still) {
          const dx = d.x + d.ox - mx, dy = d.y + d.oy - my;
          const dist = dx * dx + dy * dy;
          if (dist < 49) {
            const f = (1 - dist / 49) * 0.9;
            const inv = 1 / (Math.sqrt(dist) + 0.001);
            d.vx += dx * inv * f;
            d.vy += dy * inv * f;
          }
          d.vx = (d.vx - d.ox * 0.055) * 0.82;
          d.vy = (d.vy - d.oy * 0.055) * 0.82;
          d.ox += d.vx;
          d.oy += d.vy;
        }
        const wave = Math.sin(time * 0.0016 - d.x * 0.09 + d.y * 0.05);
        ctx.globalAlpha = still ? 1 : 0.8 + 0.2 * Math.max(wave, Math.sin(time * 0.003 + d.phase));
        ctx.fillRect((d.x + d.ox) * cell, (d.y + d.oy) * cell, side, side);
      }
      ctx.globalAlpha = 1;
    };

    const loop = (t: number) => {
      paint(t);
      if (visible) frame = requestAnimationFrame(loop);
    };
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };

    const ro = new ResizeObserver(() => dots.length && size());
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(frame);
      if (visible && !still && dots.length) frame = requestAnimationFrame(loop);
    });

    document.fonts.load(`700 ${rows}px ${family}`).finally(() => {
      if (disposed) return;
      raster();
      size();
      ro.observe(el.parentElement!);
      io.observe(el);
      if (!still) window.addEventListener("pointermove", onMove, { passive: true });
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, [key, rows, maxCell]);

  return (
    <Tag className={`pixel-text ${className}`}>
      <span className="sr-only">{lines.join(" ")}</span>
      <span ref={wrap} className="pixel-face" aria-hidden="true">
        <canvas ref={canvas} />
      </span>
    </Tag>
  );
}
