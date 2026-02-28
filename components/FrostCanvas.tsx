'use client';

import { useRef, useEffect, useCallback } from 'react';

// A single growing branch in the frost crystal
interface Branch {
  x: number;           // current tip x
  y: number;           // current tip y
  angle: number;       // current direction (radians, accumulated curl)
  curlRate: number;    // angle change per pixel (positive = curves left)
  remaining: number;   // pixels left to grow
  nextBranchIn: number;// pixels until next child spawn
  alpha: number;
  lineWidth: number;
  depth: number;       // levels of recursion left
}

const GROW_SPEED = 7;    // pixels per frame each branch grows
const SPAWN_DIST = 13;   // mouse pixels between new crystal seeds
const MAX_DEPTH = 4;
const BG = '#000b18';

// Spawn a new frost crystal centered at (x, y)
function seedCrystal(x: number, y: number): Branch[] {
  const numArms = 3 + Math.floor(Math.random() * 4); // 3–6 main arms
  const branches: Branch[] = [];

  for (let i = 0; i < numArms; i++) {
    const angle = (i / numArms) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const curlSign = Math.random() > 0.5 ? 1 : -1;
    const length = 55 + Math.random() * 70;

    branches.push({
      x, y,
      angle,
      curlRate: curlSign * (0.018 + Math.random() * 0.022),
      remaining: length,
      nextBranchIn: length * (0.22 + Math.random() * 0.2),
      alpha: 0.88,
      lineWidth: 1.5,
      depth: MAX_DEPTH,
    });
  }

  return branches;
}

// Advance one branch by `step` pixels, draw it, return any new child branches
function advance(b: Branch, step: number, ctx: CanvasRenderingContext2D): Branch[] {
  const s = Math.min(step, b.remaining);
  if (s <= 0) return [];

  // Smooth curl: use the midpoint angle for the line direction
  const newAngle = b.angle + b.curlRate * s;
  const midAngle = (b.angle + newAngle) / 2;
  const nx = b.x + Math.cos(midAngle) * s;
  const ny = b.y + Math.sin(midAngle) * s;

  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(nx, ny);
  ctx.strokeStyle = `rgba(210, 235, 255, ${b.alpha.toFixed(2)})`;
  ctx.lineWidth = b.lineWidth;
  ctx.stroke();

  const prevNext = b.nextBranchIn;

  // Update branch state
  b.remaining -= s;
  b.nextBranchIn -= s;
  b.x = nx;
  b.y = ny;
  b.angle = newAngle;

  // Spawn side branches when we pass the next branch point
  const children: Branch[] = [];
  if (prevNext > 0 && b.nextBranchIn <= 0 && b.depth > 1 && b.remaining > 6) {
    const bilateral = Math.random() > 0.25; // usually sprout both sides
    const sides = bilateral ? [-1, 1] : [Math.random() > 0.5 ? 1 : -1];

    for (const side of sides) {
      const spread = Math.PI / 3 + (Math.random() - 0.5) * 0.55;
      const childLen = b.remaining * (0.48 + Math.random() * 0.22);
      children.push({
        x: b.x,
        y: b.y,
        angle: b.angle + side * spread,
        curlRate: (Math.random() - 0.5) * 0.042,
        remaining: childLen,
        nextBranchIn: childLen * (0.28 + Math.random() * 0.32),
        alpha: b.alpha * 0.72,
        lineWidth: b.lineWidth * 0.62,
        depth: b.depth - 1,
      });
    }

    // Schedule another branch point later if still room
    b.nextBranchIn =
      b.remaining > 14
        ? b.remaining * (0.35 + Math.random() * 0.35)
        : Infinity;
  }

  return children;
}

export default function FrostCanvas() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const branches   = useRef<Branch[]>([]);
  const drawing    = useRef(false);
  const lastPos    = useRef<{ x: number; y: number } | null>(null);
  const distAcc    = useRef(0);
  const rafId      = useRef<number>(0);

  // ── Canvas setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const onResize = () => {
      // Preserve drawn content across resize
      const tmp = document.createElement('canvas');
      tmp.width  = canvas.width;
      tmp.height = canvas.height;
      tmp.getContext('2d')!.drawImage(canvas, 0, 0);
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      const c = canvas.getContext('2d')!;
      c.fillStyle = BG;
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.drawImage(tmp, 0, 0);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const tick = () => {
      if (branches.current.length > 0) {
        // Set frost drawing state once per frame
        ctx.lineCap    = 'round';
        ctx.shadowColor = 'rgba(130, 195, 255, 0.45)';
        ctx.shadowBlur  = 3.5;

        const keep: Branch[] = [];
        const spawned: Branch[] = [];

        for (const b of branches.current) {
          const children = advance(b, GROW_SPEED, ctx);
          spawned.push(...children);
          if (b.remaining > 0) keep.push(b);
        }

        branches.current = [...keep, ...spawned];
      }
      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  // ── Plant a crystal at (x, y) ─────────────────────────────────────────────
  const plant = useCallback((x: number, y: number) => {
    branches.current.push(...seedCrystal(x, y));
  }, []);

  // ── Pointer handlers ──────────────────────────────────────────────────────
  const handleDown = useCallback((x: number, y: number) => {
    drawing.current = true;
    lastPos.current = { x, y };
    distAcc.current = 0;
    plant(x, y);
  }, [plant]);

  const handleMove = useCallback((x: number, y: number) => {
    if (!drawing.current || !lastPos.current) return;
    const dx = x - lastPos.current.x;
    const dy = y - lastPos.current.y;
    distAcc.current += Math.hypot(dx, dy);
    if (distAcc.current >= SPAWN_DIST) {
      plant(x, y);
      distAcc.current = 0;
    }
    lastPos.current = { x, y };
  }, [plant]);

  const handleUp = useCallback(() => {
    drawing.current = false;
    lastPos.current = null;
  }, []);

  // ── Clear ─────────────────────────────────────────────────────────────────
  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    branches.current = [];
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle  = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }, []);

  return (
    <div className="relative w-full h-full select-none">
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair touch-none"
        onMouseDown={e  => handleDown(e.clientX, e.clientY)}
        onMouseMove={e  => handleMove(e.clientX, e.clientY)}
        onMouseUp={handleUp}
        onMouseLeave={handleUp}
        onTouchStart={e => { e.preventDefault(); const t = e.touches[0]; handleDown(t.clientX, t.clientY); }}
        onTouchMove={e  => { e.preventDefault(); const t = e.touches[0]; handleMove(t.clientX, t.clientY); }}
        onTouchEnd={handleUp}
      />

      {/* Hint */}
      <p className="absolute top-5 left-1/2 -translate-x-1/2 text-white/20 text-[11px] tracking-[0.35em] uppercase pointer-events-none font-light">
        draw to grow frost
      </p>

      {/* Clear button */}
      <button
        onClick={clear}
        className="absolute bottom-6 right-6 px-3 py-1.5 text-white/30 text-[11px] tracking-widest border border-white/10 rounded-sm hover:text-white/55 hover:border-white/25 transition-colors"
      >
        clear
      </button>
    </div>
  );
}
