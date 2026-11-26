"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * The Kancy orbit in 3D, built from square pixels.
 * Outer rings = the Manager's First-loss Stake. Inner spiral = Depositor capital.
 * `stakeBurn` eats an arc out of the rings; `coreBurn` only matters once the rings are gone.
 */

const CORE = 0, STAKE = 1, DUST = 2, STAR = 3;

const vertex = /* glsl */ `
  attribute vec4 aOrbit;   // angle, radius, height, speed
  attribute vec3 aInfo;    // kind, random, size
  attribute vec3 aScatter;
  uniform float uTime, uIn, uStake, uCore, uScale, uAspect, uHover;
  uniform vec2 uMouse;
  uniform mat3 uTilt;
  varying float vAlpha;

  void main() {
    float kind = aInfo.x, rnd = aInfo.y;
    float angle = aOrbit.x + uTime * aOrbit.w;
    vec3 pos;
    float alpha = 1.0, size = aInfo.z;

    if (kind > 2.5) {                       // upright sparkles: position stored directly
      pos = aOrbit.xyz;
      alpha = 0.75 + 0.25 * sin(uTime * 2.2 + rnd * 6.28);
    } else {
      vec3 local = vec3(cos(angle) * aOrbit.y, aOrbit.z, sin(angle) * aOrbit.y);
      float burn = 0.0;
      if (kind > 0.5 && kind < 1.5) {       // stake ring burns as an arc
        float turn = fract(aOrbit.x / 6.2831853);
        burn = smoothstep(turn, turn + 0.05, uStake * 1.05);
      } else if (kind < 0.5) {              // depositor core erodes from random pixels
        burn = smoothstep(rnd, rnd + 0.08, uCore * 1.08);
      }
      float drift = fract(uTime * (0.12 + rnd * 0.2) + rnd);
      local += burn * vec3(cos(angle) * drift * 0.5, -drift * 1.0 - 0.1, sin(angle) * drift * 0.5);
      alpha = mix(1.0, (1.0 - drift) * 0.42, burn);
      size *= mix(1.0, 0.65, burn);
      pos = uTilt * local;
      if (kind > 1.5) alpha *= 0.35 + 0.35 * sin(uTime * 1.5 + rnd * 40.0);
    }

    // pixels assemble from a scattered cloud on load
    float t = clamp((uIn - rnd * 0.45) / 0.55, 0.0, 1.0);
    t = 1.0 - pow(1.0 - t, 3.0);
    pos = mix(aScatter, pos, t);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // the pointer pushes pixels away in screen space
    vec2 d = gl_Position.xy / gl_Position.w - uMouse;
    d.x *= uAspect;
    float len = length(d);
    float push = smoothstep(0.34, 0.0, len) * uHover;
    gl_Position.xy += normalize(d + 0.0001) * push * 0.11 * (0.4 + rnd) * gl_Position.w * vec2(1.0 / uAspect, 1.0);

    float depth = clamp(1.35 - (-mv.z - 5.0) * 0.14, 0.28, 1.0);
    vAlpha = alpha * (kind > 2.5 ? 1.0 : depth) * (0.2 + 0.8 * t) + push * 0.4;
    gl_PointSize = max(1.0, floor(size * uScale / -mv.z + 0.5));
  }
`;

const fragment = /* glsl */ `
  precision mediump float;
  varying float vAlpha;
  void main() {
    vec2 p = abs(gl_PointCoord - 0.5);
    if (max(p.x, p.y) > 0.43) discard;   // hard square pixel with a hairline gap
    gl_FragColor = vec4(0.957, 0.957, 0.949, vAlpha);
  }
`;

function buildGeometry(density: number) {
  const orbit: number[] = [], info: number[] = [], scatter: number[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  const add = (kind: number, a: number, b: number, c: number, d: number, size: number) => {
    orbit.push(a, b, c, d);
    info.push(kind, rand(), size);
    const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1), r = 4 + rand() * 5;
    scatter.push(r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph) * 0.4);
  };

  // stake: two dense bands and a thin outer thread
  const bands: [radius: number, width: number, count: number, size: number][] = [
    [2.62, 0.15, 2600, 1.15], [2.18, 0.09, 1500, 1.0], [3.12, 0.012, 420, 0.8],
  ];
  for (const [radius, width, count, size] of bands) {
    for (let i = 0; i < count * density; i++) {
      add(STAKE, rand() * Math.PI * 2, radius + gauss() * width, gauss() * 0.035, 0.07, size * (rand() < 0.08 ? 1.8 : 1));
    }
  }
  // depositor capital: two-arm spiral around the centre
  for (let i = 0; i < 1900 * density; i++) {
    const f = Math.pow(rand(), 0.8);
    const radius = 0.28 + f * 1.15;
    const arm = (i % 2) * Math.PI;
    add(CORE, arm + f * 4.2 + gauss() * 0.5, radius, gauss() * 0.11 * (1 - f), 0.16 - f * 0.07, rand() < 0.1 ? 1.7 : 0.95);
  }
  for (let i = 0; i < 700 * density; i++) {
    add(DUST, rand() * Math.PI * 2, 1.5 + rand() * 3.2, gauss() * 0.9, 0.015 + rand() * 0.02, 0.75);
  }
  // four-point sparkles: centre, above and below the ring (as in the logo)
  const sparkle = (x: number, y: number, z: number, reach: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const axis = i % 4;
      const t = Math.pow(rand(), 1.8);
      const long = axis < 2 ? reach : reach * 0.52;
      const sign = axis % 2 === 0 ? 1 : -1;
      const spread = gauss() * reach * 0.2 * Math.pow(1 - t, 3);
      const px = axis < 2 ? spread : sign * t * long;
      const py = axis < 2 ? sign * t * long : spread;
      add(STAR, x + px, y + py, z, 0, 1.05);
    }
  };
  sparkle(0, 0, 0.05, 0.85, 340);
  sparkle(0.1, 2.05, 0.3, 0.55, 150);
  sparkle(-0.15, -1.95, 0.3, 0.5, 130);
  sparkle(2.75, 0.55, -0.4, 0.22, 40);
  sparkle(-2.6, -0.7, -0.2, 0.18, 36);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(info.length), 3));
  g.setAttribute("aOrbit", new THREE.Float32BufferAttribute(orbit, 4));
  g.setAttribute("aInfo", new THREE.Float32BufferAttribute(info, 3));
  g.setAttribute("aScatter", new THREE.Float32BufferAttribute(scatter, 3));
  return g;
}

type Props = { stakeBurn?: number; coreBurn?: number; className?: string; label?: string };

export default function OrbitScene({ stakeBurn = 0, coreBurn = 0, className = "", label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const burn = useRef({ stake: stakeBurn, core: coreBurn });
  const redraw = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    burn.current = { stake: stakeBurn, core: coreBurn };
    redraw.current();
  }, [stakeBurn, coreBurn]);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
    const geometry = buildGeometry(el.clientWidth < 520 ? 0.6 : 1);
    const uniforms = {
      uTime: { value: 0 }, uIn: { value: still ? 1 : 0 }, uStake: { value: burn.current.stake },
      uCore: { value: burn.current.core }, uScale: { value: 1 }, uAspect: { value: 1 },
      uHover: { value: 0 }, uMouse: { value: new THREE.Vector2(9, 9) }, uTilt: { value: new THREE.Matrix3() },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader: fragment, uniforms, transparent: true, depthWrite: false, depthTest: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);

    const pointer = { x: 0, y: 0, nx: 9, ny: 9, over: false };
    const drag = { active: false, x: 0, y: 0, yaw: 0, pitch: 0, vel: 0 };
    const tilt = { x: 0.52, z: 0.5 };
    const euler = new THREE.Euler();
    const m4 = new THREE.Matrix4();

    const draw = () => {
      euler.set(tilt.x + drag.pitch + pointer.y * 0.16, drag.yaw + pointer.x * 0.28, tilt.z, "ZXY");
      uniforms.uTilt.value.setFromMatrix4(m4.makeRotationFromEuler(euler));
      camera.position.x = pointer.x * 0.35;
      camera.position.y = -pointer.y * 0.25;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // keep the whole ring in frame on narrow containers
      camera.position.z = Math.max(8.2, 8.2 / Math.min(1, camera.aspect));
      camera.updateProjectionMatrix();
      uniforms.uAspect.value = camera.aspect;
      uniforms.uScale.value = Math.min(w, h * 1.15) * dpr * 0.0415;
      draw();
    };

    const target = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.x = (e.clientX / window.innerWidth - 0.5) * 2 * 0.5;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2 * 0.5;
      pointer.nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
      pointer.over = Math.abs(pointer.nx) <= 1 && Math.abs(pointer.ny) <= 1;
      if (drag.active) {
        drag.vel = (e.clientX - drag.x) * 0.006;
        drag.yaw += drag.vel;
        drag.pitch = Math.max(-0.8, Math.min(0.8, drag.pitch + (e.clientY - drag.y) * 0.004));
        drag.x = e.clientX;
        drag.y = e.clientY;
      }
    };
    const onDown = (e: PointerEvent) => {
      drag.active = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      el.dataset.dragging = "true";
    };
    const onUp = () => {
      drag.active = false;
      delete el.dataset.dragging;
    };

    let frame = 0;
    let visible = true;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      uniforms.uTime.value += dt;
      uniforms.uIn.value = Math.min(1, uniforms.uIn.value + dt / 2.2);
      const k = 1 - Math.pow(0.001, dt);
      uniforms.uStake.value += (burn.current.stake - uniforms.uStake.value) * k;
      uniforms.uCore.value += (burn.current.core - uniforms.uCore.value) * k;
      pointer.x += (target.x - pointer.x) * k * 0.6;
      pointer.y += (target.y - pointer.y) * k * 0.6;
      uniforms.uMouse.value.set(pointer.nx, pointer.ny);
      uniforms.uHover.value += ((pointer.over ? 1 : 0) - uniforms.uHover.value) * k;
      if (!drag.active) {
        drag.yaw += drag.vel;
        drag.vel *= 0.94;
        drag.pitch *= 0.985;
      }
      draw();
      if (visible) frame = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(frame);
      if (visible && !still) {
        last = performance.now();
        frame = requestAnimationFrame(loop);
      }
    });
    io.observe(el);
    if (still) {
      redraw.current = () => {
        uniforms.uStake.value = burn.current.stake;
        uniforms.uCore.value = burn.current.core;
        draw();
      };
    } else {
      window.addEventListener("pointermove", onMove, { passive: true });
      el.addEventListener("pointerdown", onDown);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    }
    resize();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      redraw.current = () => {};
    };
  }, []);

  return (
    <div ref={host} className={`orbit ${className}`} role="img" aria-label={label ?? "Kancy orbit"}>
      {failed && <img src="/art/logo.png" alt="" className="orbit-fallback" />}
    </div>
  );
}
