"use client";

import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Full-page starfield with depth parallax, shooting stars, and a pixel trail behind the pointer. */
export function Sky() {
  const back = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const bg = back.current!, fg = front.current!;
    const b = bg.getContext("2d")!, f = fg.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    let w = 0, h = 0, frame = 0;
    type Star = { x: number; y: number; z: number; p: number; big: boolean };
    let stars: Star[] = [];
    const trail: { x: number; y: number; vx: number; vy: number; life: number; s: number }[] = [];
    const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    let shot: { x: number; y: number; life: number } | null = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      for (const [cv, ctx] of [[bg, b], [fg, f]] as const) {
        cv.width = w * dpr;
        cv.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      stars = Array.from({ length: Math.round((w * h) / 14000) }, () => ({
        x: Math.random() * w, y: Math.random() * h, z: 0.2 + Math.random() * 0.8,
        p: Math.random() * 6.28, big: Math.random() < 0.02,
      }));
      draw(0);
    };

    const sparkle = (x: number, y: number, r: number) => {
      b.fillRect(x - r, y, r * 2 + 1.5, 1.5);
      b.fillRect(x, y - r * 1.5, 1.5, r * 3 + 1.5);
      b.fillRect(x - 1.5, y - 1.5, 4.5, 4.5);
    };

    const draw = (t: number) => {
      mouse.sx += (mouse.x - mouse.sx) * 0.05;
      mouse.sy += (mouse.y - mouse.sy) * 0.05;
      b.clearRect(0, 0, w, h);
      b.fillStyle = "#f4f4f2";
      const scroll = window.scrollY;
      for (const s of stars) {
        const x = (((s.x - mouse.sx * s.z * 28) % w) + w) % w;
        const y = (((s.y - scroll * s.z * 0.18 - mouse.sy * s.z * 28) % h) + h) % h;
        const tw = still ? 0.7 : 0.55 + 0.45 * Math.sin(t * 0.0012 * (0.5 + s.z) + s.p);
        b.globalAlpha = tw * (0.15 + s.z * 0.35);
        if (s.big) sparkle(x, y, 2 + s.z * 3.5);
        else b.fillRect(x, y, s.z > 0.75 ? 2 : 1, s.z > 0.75 ? 2 : 1);
      }
      if (!still) {
        if (!shot && Math.random() < 0.0008) shot = { x: Math.random() * w * 0.8 + w * 0.2, y: Math.random() * h * 0.4, life: 1 };
        if (shot) {
          for (let i = 0; i < 18; i++) {
            b.globalAlpha = shot.life * (1 - i / 18) * 0.8;
            b.fillRect(shot.x + i * 7, shot.y - i * 3.4, 3, 2);
          }
          shot.x -= 9;
          shot.y += 4.4;
          shot.life -= 0.018;
          if (shot.life <= 0) shot = null;
        }
      }
      b.globalAlpha = 1;

      f.clearRect(0, 0, w, h);
      f.fillStyle = "#f4f4f2";
      for (let i = trail.length - 1; i >= 0; i--) {
        const p = trail[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.028;
        if (p.life <= 0) { trail.splice(i, 1); continue; }
        f.globalAlpha = p.life * 0.75;
        const s = p.s * (0.4 + p.life * 0.6);
        f.fillRect(Math.round(p.x / 3) * 3, Math.round(p.y / 3) * 3, s, s);
      }
      f.globalAlpha = 1;
    };

    const loop = (t: number) => {
      draw(t);
      frame = requestAnimationFrame(loop);
    };
    let px = 0, py = 0;
    const trailOn = false;
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX / w - 0.5;
      mouse.y = e.clientY / h - 0.5;
      if (fine && trailOn && Math.hypot(e.clientX - px, e.clientY - py) > 9) {
        px = e.clientX;
        py = e.clientY;
        trail.push({
          x: px + (Math.random() - 0.5) * 10, y: py + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 0.5, vy: Math.random() * 0.5, life: 1, s: Math.random() < 0.2 ? 4 : 2.5,
        });
        if (trail.length > 70) trail.shift();
      }
    };
    const onClick = (e: PointerEvent) => {
      if (!fine) return;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2, v = 1.2 + (i % 3);
        trail.push({ x: e.clientX, y: e.clientY, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.9, s: 3 });
      }
    };

    resize();
    window.addEventListener("resize", resize);
    if (!still) {
      window.addEventListener("pointermove", onMove, { passive: true });
      frame = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onClick);
    };
  }, []);

  return (
    <>
      <canvas ref={back} className="sky sky-back" aria-hidden="true" />
      <canvas ref={front} className="sky sky-front" aria-hidden="true" hidden />
    </>
  );
}

/** 3D tilt toward the pointer, with a dithered spotlight that follows it. */
export function Tilt({ children, className = "", max = 0 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const rx = useSpring(useMotionValue(0), { stiffness: 180, damping: 18 });
  const ry = useSpring(useMotionValue(0), { stiffness: 180, damping: 18 });
  return (
    <div className="tilt-stage">
      <motion.div
        className={`tilt ${className}`}
        style={{ rotateX: rx, rotateY: ry }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
          e.currentTarget.style.setProperty("--mx", `${x * 100}%`);
          e.currentTarget.style.setProperty("--my", `${y * 100}%`);
          if (!reduce && e.pointerType === "mouse") {
            rx.set((0.5 - y) * max);
            ry.set((x - 0.5) * max);
          }
        }}
        onPointerLeave={() => {
          rx.set(0);
          ry.set(0);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Pulls its child slightly toward the pointer. */
export function Magnetic({ children }: { children: ReactNode; strength?: number }) {
  return <span className="magnetic">{children}</span>;
}

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function CountUp({ value, digits = 0, prefix = "" }: { value: number | undefined; digits?: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  const from = useRef(0);
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (value === undefined || !seen) return;
    const controls = animate(from.current, value, {
      duration: reduce ? 0 : 1.2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, seen, reduce]);
  return (
    <span ref={ref}>
      {value === undefined ? "—" : prefix + shown.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}
    </span>
  );
}

/** Pixel artwork on a parallax layer. A brighter copy shows through a lantern that follows the pointer. */
export function Art({ name, className = "", depth = 14 }: { name: string; className?: string; depth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current!;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > window.innerHeight + 100) return;
      el.style.setProperty("--lx", `${e.clientX - r.left}px`);
      el.style.setProperty("--ly", `${e.clientY - r.top}px`);
      el.style.setProperty("--px", `${(e.clientX / window.innerWidth - 0.5) * -depth}px`);
      el.style.setProperty("--py", `${(e.clientY / window.innerHeight - 0.5) * -depth * 0.5}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [depth]);
  return (
    <div ref={ref} className={`art ${className}`} aria-hidden="true">
      <img src={`/art/${name}.png`} alt="" className="art-dim" />
      <img src={`/art/${name}.png`} alt="" className="art-lit" />
    </div>
  );
}
