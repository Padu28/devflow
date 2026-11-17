import { useEffect, useRef } from 'react';
import { useReducedMotionPref } from '@/lib/hooks';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export function FlowFieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotionPref();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    if (reduced) {
      // Static subtle flow arcs for reduced motion
      ctx.strokeStyle = 'rgba(198, 244, 50, 0.14)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        const y = (height / 14) * i + 20;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(width * 0.35, y - 35, width * 0.65, y + 35, width, y - 10);
        ctx.stroke();
      }
      return;
    }

    const particles: Particle[] = Array.from({ length: 42 }, (_, i) => ({
      x: ((i * 97) % Math.max(1, width)) || 100,
      y: ((i * 53) % Math.max(1, height)) || 100,
      vx: 0.7 + (i % 5) * 0.18,
      vy: Math.sin(i) * 0.25,
      life: (i * 11) % 180,
      maxLife: 180 + (i % 4) * 30,
    }));

    let rafId = 0;
    let visible = true;

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
      },
      { threshold: 0.05 },
    );
    io.observe(canvas);

    const onVisibility = () => {
      if (document.hidden) visible = false;
      else visible = true;
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', resize);

    let tick = 0;
    const draw = () => {
      rafId = requestAnimationFrame(draw);
      if (!visible || width === 0) return;

      tick += 0.008;
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        const angle = Math.sin(p.x * 0.004 + tick) * 0.55 + Math.cos(p.y * 0.004 - tick) * 0.35;
        p.vx = Math.cos(angle) * 1.15;
        p.vy = Math.sin(angle) * 0.65;
        const prevX = p.x;
        const prevY = p.y;
        p.x += p.vx * 1.6;
        p.y += p.vy * 1.6;
        p.life += 1;

        if (p.x > width + 20 || p.y < -20 || p.y > height + 20 || p.life > p.maxLife) {
          p.x = -10;
          p.y = Math.random() * height;
          p.life = 0;
          continue;
        }

        const alpha = Math.sin((p.life / p.maxLife) * Math.PI) * 0.28;
        ctx.strokeStyle = `rgba(198, 244, 50, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(p.x + p.vx * 18, p.y + p.vy * 18);
        ctx.stroke();
      }
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
    };
  }, [reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

