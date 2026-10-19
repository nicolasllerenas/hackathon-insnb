import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { EstadoPaciente } from "@compartido/dominio/estados";
import { FORMA_ESTADO } from "./Insignia";

export interface PuntoTrayectoria {
  momento: string;
  anc: number;
  inferior: number | null;
  superior: number | null;
  estado: EstadoPaciente;
}

export interface PuntoHemograma {
  momento: string;
  anc: number;
}

const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short" });
const FORMATO_FECHA_HORA = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const NUM = new Intl.NumberFormat("es-PE");

export function Chispa({ valores, ancho = 240, alto = 46, etiqueta }: { valores: number[]; ancho?: number; alto?: number; etiqueta: string }) {
  if (valores.length < 2) {
    return <div className="chispa-vacia">Aún sin trayectoria</div>;
  }
  const maximo = Math.max(2000, ...valores);
  const x = (i: number) => 4 + (i / (valores.length - 1)) * (ancho - 8);
  const y = (v: number) => alto - 4 - (Math.min(maximo, v) / maximo) * (alto - 8);
  const ruta = valores.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ultimo = valores[valores.length - 1] as number;
  return (
    <svg className="chispa" viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" role="img" aria-label={etiqueta}>
      <rect x="0" y={y(1500)} width={ancho} height={y(500) - y(1500)} className="banda-ventana" />
      <path d={ruta} className="linea-chispa" />
      <circle cx={x(valores.length - 1)} cy={y(ultimo)} r="4" className={`punto-final ${ultimo < 500 ? "bajo" : ultimo > 1500 ? "alto" : "dentro"}`} />
    </svg>
  );
}

interface PropsTrayectoria {
  puntos: PuntoTrayectoria[];
  hemogramas?: PuntoHemograma[];
  titulo: string;
}

export function Trayectoria({ puntos, hemogramas = [], titulo }: PropsTrayectoria) {
  const ancho = 720;
  const alto = 260;
  const m = { izq: 52, der: 70, arr: 16, aba: 30 };
  const idTitulo = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState<number | null>(null);

  const escala = useMemo(() => {
    const tiempos = [...puntos.map((p) => Date.parse(p.momento)), ...hemogramas.map((h) => Date.parse(h.momento))];
    const t0 = Math.min(...tiempos);
    const t1 = Math.max(...tiempos);
    const maximo = Math.max(2000, ...puntos.map((p) => p.anc), ...hemogramas.map((h) => h.anc)) * 1.08;
    const tope = Math.ceil(maximo / 500) * 500;
    const x = (t: number) => m.izq + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (ancho - m.izq - m.der);
    const y = (v: number) => m.arr + (1 - Math.min(tope, Math.max(0, v)) / tope) * (alto - m.arr - m.aba);
    return { x, y, tope, t0, t1 };
  }, [puntos, hemogramas, m.izq, m.der, m.arr, m.aba]);

  if (!puntos.length) return <div className="vacio">Todavía no hay tamizajes concluyentes para dibujar la trayectoria.</div>;

  const { x, y, tope } = escala;
  const ticks = Array.from({ length: tope / 500 + 1 }, (_, i) => i * 500);
  const coords = puntos.map((p) => ({ ...p, cx: x(Date.parse(p.momento)), cy: y(p.anc) }));
  const linea = coords.map((c, i) => `${i ? "L" : "M"}${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(" ");
  const banda =
    coords.length > 1
      ? [
          ...coords.map((c, i) => `${i ? "L" : "M"}${c.cx.toFixed(1)},${y(c.superior ?? tope).toFixed(1)}`),
          ...[...coords].reverse().map((c) => `L${c.cx.toFixed(1)},${y(c.inferior ?? 0).toFixed(1)}`),
          "Z",
        ].join(" ")
      : "";
  const ultimo = coords[coords.length - 1] as (typeof coords)[number];
  const sel = activo !== null ? coords[activo] : null;

  const mover = (e: PointerEvent<SVGRectElement>) => {
    const caja = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - caja.left) / caja.width) * ancho;
    let mejor = 0;
    coords.forEach((c, i) => {
      if (Math.abs(c.cx - px) < Math.abs((coords[mejor] as typeof c).cx - px)) mejor = i;
    });
    setActivo(mejor);
  };

  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") setActivo((a) => Math.min(coords.length - 1, (a ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActivo((a) => Math.max(0, (a ?? coords.length) - 1));
    else if (e.key === "Escape") setActivo(null);
    else return;
    e.preventDefault();
  };

  const izquierdaTooltip = sel ? (sel.cx / ancho) * 100 : 0;

  return (
    <div className="trayectoria" ref={contenedor} tabIndex={0} onKeyDown={teclas} onBlur={() => setActivo(null)} aria-labelledby={idTitulo}>
      <div className="leyenda-grafico" id={idTitulo}>
        <span className="titulo-grafico">{titulo}</span>
        <span className="clave">
          <i className="clave-linea" aria-hidden="true" /> Tamizaje del michi (IC95 sombreado)
        </span>
        {hemogramas.length ? (
          <span className="clave">
            <i className="clave-rombo" aria-hidden="true" /> Hemograma de laboratorio
          </span>
        ) : null}
        <span className="clave">
          <i className="clave-banda" aria-hidden="true" /> Ventana del mantenimiento 500–1500/µL
        </span>
      </div>
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`${titulo}. Último valor ${NUM.format(ultimo.anc)} por microlitro.`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.izq} x2={ancho - m.der} y1={y(v)} y2={y(v)} className="rejilla" />
            <text x={m.izq - 8} y={y(v) + 4} className="eje" textAnchor="end">
              {v >= 1000 ? `${v / 1000}K` : v}
            </text>
          </g>
        ))}
        <rect x={m.izq} y={y(1500)} width={ancho - m.izq - m.der} height={y(500) - y(1500)} className="banda-ventana" />
        <line x1={m.izq} x2={ancho - m.der} y1={y(500)} y2={y(500)} className="umbral" />
        <text x={ancho - m.der + 6} y={y(500) + 4} className="eje">
          500 grave
        </text>
        <text x={ancho - m.der + 6} y={y(1500) + 4} className="eje">
          1500
        </text>
        {banda ? <path d={banda} className="banda-ic" /> : null}
        <path d={linea} className="linea-serie" />
        {hemogramas.map((h) => {
          const cx = x(Date.parse(h.momento));
          const cy = y(h.anc);
          return <path key={h.momento} d={`M${cx},${cy - 6} L${cx + 6},${cy} L${cx},${cy + 6} L${cx - 6},${cy} Z`} className="marca-hemograma" />;
        })}
        {coords.map((c, i) => (
          <circle key={c.momento} cx={c.cx} cy={c.cy} r={activo === i ? 6 : 4.5} className={`marca-serie ${c.estado}`} />
        ))}
        <text x={ultimo.cx + 9} y={ultimo.cy - 8} className="etiqueta-final">
          {NUM.format(ultimo.anc)}
        </text>
        {[coords[0], ultimo].map((c, i) =>
          c ? (
            <text key={i} x={c.cx} y={alto - 8} className="eje" textAnchor={i === 0 ? "start" : "end"}>
              {FORMATO_FECHA.format(new Date(c.momento))}
            </text>
          ) : null,
        )}
        {sel ? <line x1={sel.cx} x2={sel.cx} y1={m.arr} y2={alto - m.aba} className="cruz" /> : null}
        <rect
          x={m.izq}
          y={m.arr}
          width={ancho - m.izq - m.der}
          height={alto - m.arr - m.aba}
          fill="transparent"
          onPointerMove={mover}
          onPointerLeave={() => setActivo(null)}
        />
      </svg>
      {sel ? (
        <div className="tooltip-grafico" style={{ left: `${Math.min(78, Math.max(4, izquierdaTooltip))}%` }} role="status">
          <b>{FORMATO_FECHA_HORA.format(new Date(sel.momento))}</b>
          <span>
            <i className="clave-linea" aria-hidden="true" /> ANC {NUM.format(sel.anc)}/µL
          </span>
          <span className="tenue">
            IC95 {sel.inferior === null ? "—" : NUM.format(sel.inferior)}–{sel.superior === null ? "∞" : NUM.format(sel.superior)}
          </span>
          <span>
            {FORMA_ESTADO[sel.estado]} {sel.estado}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export interface PuntoDispersion {
  id: string;
  x: number;
  y: number;
  etiqueta: string;
}

export function DispersionValidacion({ puntos, umbral = 500 }: { puntos: PuntoDispersion[]; umbral?: number }) {
  const lado = 340;
  const m = 46;
  const [activo, setActivo] = useState<PuntoDispersion | null>(null);
  const minimo = 50;
  const maximo = Math.max(4000, ...puntos.flatMap((p) => [p.x, p.y]));
  const log = (v: number) => Math.log10(Math.max(minimo, v));
  const escala = (v: number) => m + ((log(v) - log(minimo)) / (log(maximo) - log(minimo))) * (lado - 2 * m);
  const ejeY = (v: number) => lado - escala(v);
  const marcas = [100, 200, 500, 1000, 2000].filter((v) => v <= maximo);
  if (!puntos.length) return <div className="vacio">Aún no hay pares tamizaje–hemograma.</div>;
  return (
    <div className="dispersion">
      <svg viewBox={`0 0 ${lado} ${lado}`} role="img" aria-label={`Concordancia entre tamizaje y hemograma en ${puntos.length} pares`}>
        {marcas.map((v) => (
          <g key={v}>
            <line x1={m} x2={lado - m} y1={ejeY(v)} y2={ejeY(v)} className="rejilla" />
            <line y1={m} y2={lado - m} x1={escala(v)} x2={escala(v)} className="rejilla" />
            <text x={m - 6} y={ejeY(v) + 4} className="eje" textAnchor="end">
              {v >= 1000 ? `${v / 1000}K` : v}
            </text>
            <text x={escala(v)} y={lado - m + 16} className="eje" textAnchor="middle">
              {v >= 1000 ? `${v / 1000}K` : v}
            </text>
          </g>
        ))}
        <rect x={m} y={ejeY(umbral)} width={escala(umbral) - m} height={lado - m - ejeY(umbral)} className="cuadrante-vp" />
        <line x1={escala(minimo)} y1={ejeY(minimo)} x2={escala(maximo)} y2={ejeY(maximo)} className="identidad" />
        <line x1={m} x2={lado - m} y1={ejeY(umbral)} y2={ejeY(umbral)} className="umbral" />
        <line y1={m} y2={lado - m} x1={escala(umbral)} x2={escala(umbral)} className="umbral" />
        {puntos.map((p) => (
          <g key={p.id} onPointerEnter={() => setActivo(p)} onPointerLeave={() => setActivo(null)}>
            <circle cx={escala(p.x)} cy={ejeY(p.y)} r="12" fill="transparent" />
            <circle cx={escala(p.x)} cy={ejeY(p.y)} r={activo?.id === p.id ? 6 : 4.5} className="marca-serie dispersion-punto" />
          </g>
        ))}
        <text x={lado / 2} y={lado - 6} className="eje" textAnchor="middle">
          Hemograma (ANC/µL, escala log)
        </text>
        <text x={12} y={lado / 2} className="eje" textAnchor="middle" transform={`rotate(-90 12 ${lado / 2})`}>
          Tamizaje (ANC/µL)
        </text>
      </svg>
      <div className="dispersion-pie" role="status">
        {activo ? activo.etiqueta : "Pase el cursor sobre un punto. Abajo a la izquierda: ambos por debajo de 500 (verdaderos positivos)."}
      </div>
    </div>
  );
}
