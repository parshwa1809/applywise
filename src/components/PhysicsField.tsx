"use client";

import { useEffect, useRef } from "react";

/**
 * A tiny custom 2D physics sandbox: gravity, circle–circle collisions with restitution,
 * wall friction, grab-and-fling, and a cursor "wake" that nudges bodies aside.
 * Real jobs are solid; ghost jobs are dashed and pop into particles when clicked.
 */

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  label: string;
  ghost: boolean;
  color: string;
  angle: number;
  spin: number;
  born: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

const REAL = ["Product Manager", "Data Analyst", "UX Designer", "Frontend Eng", "Growth PM", "ML Engineer", "Product Ops", "Backend Eng", "Designer", "PMM", "APM", "Analytics"];
const GHOST = ["Evergreen PM", "Talent Pool", "Reposted ×9", "180 days old", "No salary", "“Future roles”"];
const PALETTE = ["--brand", "--lime", "--sky", "--coral", "--amber"];

export default function PhysicsField({ onPop, className }: { onPop?: (total: number) => void; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onPopRef = useRef(onPop);
  useEffect(() => {
    onPopRef.current = onPop;
  }, [onPop]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0;
    let H = 0;
    let dpr = 1;
    const bodies: Body[] = [];
    const parts: Particle[] = [];
    let popped = 0;
    const colors: Record<string, string> = {};
    let ink = "#17151f";
    let card = "#fff";

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      for (const k of PALETTE) colors[k] = cs.getPropertyValue(k).trim() || "#5b4cf0";
      ink = cs.getPropertyValue("--ink").trim() || ink;
      card = cs.getPropertyValue("--card").trim() || card;
    };
    readColors();
    const mo = new MutationObserver(readColors);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const scale = () => Math.max(0.62, Math.min(1, W / 900));
    let spawnI = 0;
    let ghostI = 0;
    let realI = 0;
    const spawn = (ghost: boolean, x?: number) => {
      const s = scale();
      const label = ghost ? GHOST[ghostI++ % GHOST.length] : REAL[realI++ % REAL.length];
      spawnI++;
      const r = (ghost ? 50 : 54 + ((spawnI * 7) % 22)) * s;
      bodies.push({
        x: x ?? r + Math.random() * (W - 2 * r),
        y: reduce ? r + Math.random() * (H - 2 * r) : -r - Math.random() * 300,
        vx: (Math.random() - 0.5) * 200,
        vy: 0,
        r,
        label,
        ghost,
        color: PALETTE[spawnI % PALETTE.length],
        angle: (Math.random() - 0.5) * 0.4,
        spin: 0,
        born: performance.now(),
      });
    };
    const target = () => Math.round(Math.min(30, Math.max(12, (W * H) / 22000)));
    for (let i = 0; i < target(); i++) spawn(i % 3 === 2);

    // ── pointer ──
    let grab: Body | null = null;
    const ptr = { x: -999, y: -999, vx: 0, vy: 0, t: 0, down: false, downAt: 0, moved: 0 };
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hit = (x: number, y: number) => {
      for (let i = bodies.length - 1; i >= 0; i--) {
        const b = bodies[i];
        if ((b.x - x) ** 2 + (b.y - y) ** 2 < b.r * b.r) return b;
      }
      return null;
    };
    const down = (e: PointerEvent) => {
      const p = local(e);
      ptr.down = true;
      ptr.downAt = performance.now();
      ptr.moved = 0;
      grab = hit(p.x, p.y);
      if (grab) canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      const now = performance.now();
      const dt = Math.max(1, now - ptr.t) / 1000;
      const fresh = ptr.x < -900 || now - ptr.t > 120;
      ptr.vx = fresh ? 0 : (p.x - ptr.x) / dt;
      ptr.vy = fresh ? 0 : (p.y - ptr.y) / dt;
      if (ptr.down) ptr.moved += Math.hypot(p.x - ptr.x, p.y - ptr.y);
      ptr.x = p.x;
      ptr.y = p.y;
      ptr.t = now;
      canvas.style.cursor = grab ? "grabbing" : hit(p.x, p.y) ? "grab" : "default";
    };
    const burst = (b: Body) => {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 150 + Math.random() * 420;
        parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 1, color: i % 2 ? ink : colors["--coral"], size: 2 + Math.random() * 4 });
      }
    };
    const up = () => {
      const quick = performance.now() - ptr.downAt < 260 && ptr.moved < 8;
      if (grab && quick) {
        if (grab.ghost) {
          burst(grab);
          bodies.splice(bodies.indexOf(grab), 1);
          popped++;
          onPopRef.current?.(popped);
          setTimeout(() => spawn(Math.random() < 0.4), 900);
        } else {
          grab.vy = -700;
          grab.spin = (Math.random() - 0.5) * 8;
        }
      } else if (grab) {
        grab.vx = Math.max(-2600, Math.min(2600, ptr.vx));
        grab.vy = Math.max(-2600, Math.min(2600, ptr.vy));
        grab.spin = grab.vx / 400;
      }
      grab = null;
      ptr.down = false;
    };
    const leave = () => {
      ptr.x = -999;
      ptr.y = -999;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", leave);

    // ── simulation ──
    const G = 1900;
    const step = (dt: number) => {
      for (const b of bodies) {
        if (b === grab) {
          // critically-damped spring toward the pointer
          b.vx = (ptr.x - b.x) * 22;
          b.vy = (ptr.y - b.y) * 22;
        } else {
          b.vy += G * dt;
          // cursor wake: fast-moving pointer shoves nearby bodies
          const dx = b.x - ptr.x;
          const dy = b.y - ptr.y;
          const d2 = dx * dx + dy * dy;
          const speed = Math.hypot(ptr.vx, ptr.vy);
          if (!ptr.down && d2 < (b.r + 50) ** 2 && speed > 200) {
            const d = Math.sqrt(d2) || 1;
            const f = Math.min(speed, 2400) * 0.06;
            b.vx += (dx / d) * f;
            b.vy += (dy / d) * f;
          }
        }
        b.vx *= 0.999;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.angle += b.spin * dt;
        b.spin *= 0.985;
        // walls
        if (b.x < b.r) {
          b.x = b.r;
          b.vx = Math.abs(b.vx) * 0.5;
        }
        if (b.x > W - b.r) {
          b.x = W - b.r;
          b.vx = -Math.abs(b.vx) * 0.5;
        }
        if (b.y > H - b.r) {
          b.y = H - b.r;
          if (b.vy > 0) b.vy = -b.vy * 0.42;
          if (Math.abs(b.vy) < 40) b.vy = 0;
          b.vx *= 0.96;
          b.spin = b.spin * 0.9 + (b.vx / b.r) * 0.1;
        }
        if (b.y < -600) b.y = -600;
      }
      // pairwise collisions (n is small)
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const b = bodies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rr = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const ima = a === grab ? 0 : 1 / (a.r * a.r);
          const imb = b === grab ? 0 : 1 / (b.r * b.r);
          const sum = ima + imb || 1;
          const overlap = rr - d;
          a.x -= nx * overlap * (ima / sum);
          a.y -= ny * overlap * (ima / sum);
          b.x += nx * overlap * (imb / sum);
          b.y += ny * overlap * (imb / sum);
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) {
            const jImp = (-(1 + 0.5) * rv) / sum;
            a.vx -= jImp * ima * nx;
            a.vy -= jImp * ima * ny;
            b.vx += jImp * imb * nx;
            b.vy += jImp * imb * ny;
            const tx = -ny;
            const tv = (b.vx - a.vx) * tx + (b.vy - a.vy) * nx;
            a.spin += tv * 0.002;
            b.spin -= tv * 0.002;
          }
        }
      }
      for (const p of parts) {
        p.vy += G * 0.6 * dt;
        p.vx *= 0.99;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.3;
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
    };

    const pillPath = (b: Body) => {
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    };
    const draw = (now: number) => {
      ctx.clearRect(0, 0, W, H);
      for (const b of bodies) {
        ctx.save();
        ctx.translate(b.x, b.y);
        const wob = b.ghost ? Math.sin(now / 260 + b.born) * 0.06 : 0;
        // the body spins freely, but its label only sways so it stays readable
        ctx.rotate(Math.sin(b.angle) * 0.35 + wob);
        if (b.ghost) {
          ctx.globalAlpha = 0.85;
          pillPath(b);
          ctx.fillStyle = card;
          ctx.fill();
          ctx.setLineDash([6, 6]);
          ctx.lineDashOffset = -now / 40;
          ctx.lineWidth = 2;
          ctx.strokeStyle = ink;
          ctx.globalAlpha = 0.45;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.6;
        } else {
          ctx.shadowColor = "rgba(0,0,0,0.18)";
          ctx.shadowBlur = 18;
          ctx.shadowOffsetY = 8;
          pillPath(b);
          ctx.fillStyle = colors[b.color];
          ctx.fill();
          ctx.shadowColor = "transparent";
        }
        const fs = Math.max(10, b.r * 0.26);
        ctx.font = `700 ${fs}px "Bricolage Grotesque Variable", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = b.ghost ? ink : b.color === "--brand" ? "#fff" : "#17151f";
        const words = b.label.split(" ");
        if (words.length > 1 && ctx.measureText(b.label).width > b.r * 1.6) {
          ctx.fillText(words[0], 0, -fs * 0.55);
          ctx.fillText(words.slice(1).join(" "), 0, fs * 0.6);
        } else ctx.fillText(b.label, 0, 0);
        if (b.ghost) {
          ctx.font = `600 ${fs * 0.72}px Inter Variable, system-ui`;
          ctx.globalAlpha = 0.5;
          ctx.fillText("tap to pop", 0, b.r * 0.55);
        }
        ctx.restore();
      }
      for (const p of parts) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    let last = performance.now();
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;
      if (!reduce) {
        const sub = 4;
        for (let i = 0; i < sub; i++) step(dt / sub);
        ptr.vx *= 0.8;
        ptr.vy *= 0.8;
      }
      draw(now);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointerleave", leave);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} style={{ touchAction: "none" }} aria-label="Playful physics field of job bubbles. Drag and fling them; tap the dashed ghost jobs to pop them." />;
}
