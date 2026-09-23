"use client";

/** Fire-and-forget confetti with gravity, drag, flutter and rotation, drawn on a temporary canvas. */
export function confetti(origin?: { x: number; y: number }, count = 140) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "9999" });
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement);
  const cols = ["--brand", "--lime", "--coral", "--sky", "--amber"].map((k) => cs.getPropertyValue(k).trim() || "#5b4cf0");
  const ox = origin?.x ?? W / 2;
  const oy = origin?.y ?? H / 2;
  const ps = Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const sp = 500 + Math.random() * 900;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 14,
      flip: Math.random() * Math.PI,
      vf: 6 + Math.random() * 8,
      c: cols[i % cols.length],
      round: Math.random() < 0.3,
    };
  });
  let last = performance.now();
  const start = last;
  const frame = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 1400 * dt;
      p.vx *= 1 - 1.6 * dt; // air drag
      p.vy *= 1 - 1.2 * dt;
      p.x += (p.vx + Math.sin(p.flip) * 40) * dt; // flutter
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.flip += p.vf * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.flip));
      ctx.fillStyle = p.c;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (now - start < 3200 && ps.some((p) => p.y < H + 40)) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
