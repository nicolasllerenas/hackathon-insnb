import { useCallback, useEffect, useRef, useState } from "react";

export interface PasoTour {
  texto: string;
  ms: number;
  accion?: () => void | Promise<void>;
  foco?: string;
  retrasoFoco?: number;
}

interface Props {
  pasos: readonly PasoTour[];
  alTerminar: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function medir(selector: string | undefined): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 };
}

export function Tour({ pasos, alTerminar }: Props) {
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [foco, setFoco] = useState<{ indice: number; selector: string | undefined } | null>(null);
  const terminar = useRef(alTerminar);

  useEffect(() => {
    terminar.current = alTerminar;
  });

  const paso = pasos[indice];
  const focoActivo = foco?.indice === indice ? foco.selector : undefined;

  useEffect(() => {
    if (!paso) return;
    let vivo = true;
    Promise.resolve()
      .then(() => paso.accion?.())
      .catch(() => undefined);
    const t = window.setTimeout(() => {
      if (vivo) setFoco({ indice, selector: paso.foco });
    }, paso.retrasoFoco ?? 350);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [paso, indice]);

  useEffect(() => {
    if (!paso || pausado) return;
    const t = window.setTimeout(() => {
      if (indice < pasos.length - 1) setIndice((i) => i + 1);
      else terminar.current();
    }, paso.ms);
    return () => window.clearTimeout(t);
  }, [paso, pausado, indice, pasos.length]);

  useEffect(() => {
    const actualizar = () => setRect(medir(focoActivo));
    actualizar();
    const t = window.setInterval(actualizar, 300);
    window.addEventListener("resize", actualizar);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("resize", actualizar);
    };
  }, [focoActivo]);

  const ir = useCallback(
    (delta: number) => {
      const destino = indice + delta;
      if (destino < 0) return;
      if (destino >= pasos.length) terminar.current();
      else setIndice(destino);
    },
    [indice, pasos.length],
  );

  if (!paso) return null;
  return (
    <>
      {rect ? <div className="foco-tour" style={rect} aria-hidden="true" /> : null}
      <div className="tour" role="region" aria-label="Recorrido guiado">
        <div className="cabeza">
          <span className="paso">
            {indice + 1} / {pasos.length}
          </span>
          <span className="pista" aria-hidden="true">
            <i style={{ width: `${((indice + 1) / pasos.length) * 100}%` }} />
          </span>
        </div>
        <div className="texto" aria-live="polite" dangerouslySetInnerHTML={{ __html: paso.texto }} />
        <div className="controles">
          <button type="button" className="boton fantasma chico" onClick={() => ir(-1)} disabled={indice === 0}>
            ◀ Atrás
          </button>
          <button type="button" className="boton chico" onClick={() => setPausado((p) => !p)}>
            {pausado ? "▶ Seguir" : "⏸ Pausa"}
          </button>
          <button type="button" className="boton fantasma chico" onClick={() => ir(1)}>
            Siguiente ▶
          </button>
          <button type="button" className="boton fantasma chico" onClick={() => terminar.current()} aria-label="Salir del recorrido">
            ✕ Salir
          </button>
        </div>
      </div>
    </>
  );
}
