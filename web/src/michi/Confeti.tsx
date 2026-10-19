import { useEffect, useRef } from "react";

const COLORES = ["#A855F7", "#22D3EE", "#FF6BB5", "#FBBF24", "#34D399", "#C4B5FD"];

interface Pieza {
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  vx: number;
  r: number;
  vr: number;
  c: string;
}

export function Confeti({ disparo }: { disparo: number }) {
  const lienzo = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!disparo) return;
    const cv = lienzo.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    cv.style.display = "block";
    let piezas: Pieza[] = Array.from({ length: 90 }, () => ({
      x: Math.random() * cv.width,
      y: -20 - Math.random() * cv.height * 0.4,
      w: 5 + Math.random() * 7,
      h: 8 + Math.random() * 10,
      vy: 2.4 + Math.random() * 3.4,
      vx: (Math.random() - 0.5) * 2.4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.26,
      c: COLORES[Math.floor(Math.random() * COLORES.length)] as string,
    }));
    let cuadro = 0;
    const paso = () => {
      g.clearRect(0, 0, cv.width, cv.height);
      piezas = piezas.filter((p) => p.y < cv.height + 40);
      for (const p of piezas) {
        p.y += p.vy;
        p.x += p.vx;
        p.r += p.vr;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.r);
        g.fillStyle = p.c;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      }
      if (piezas.length) cuadro = requestAnimationFrame(paso);
      else cv.style.display = "none";
    };
    cuadro = requestAnimationFrame(paso);
    return () => {
      cancelAnimationFrame(cuadro);
      g.clearRect(0, 0, cv.width, cv.height);
      cv.style.display = "none";
    };
  }, [disparo]);

  return <canvas ref={lienzo} className="confeti" aria-hidden="true" />;
}
