import { useEffect, useId, useRef, type ReactNode } from "react";

interface Props {
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
  angosto?: boolean;
  descripcion?: ReactNode;
}

const ENFOCABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ titulo, alCerrar, children, angosto = false, descripcion }: Props) {
  const idTitulo = useId();
  const caja = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef(alCerrar);

  useEffect(() => {
    cerrarRef.current = alCerrar;
  });

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const primero = caja.current?.querySelector<HTMLElement>(ENFOCABLES);
    primero?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrarRef.current();
        return;
      }
      if (e.key !== "Tab" || !caja.current) return;
      const elementos = Array.from(caja.current.querySelectorAll<HTMLElement>(ENFOCABLES));
      if (!elementos.length) return;
      const inicio = elementos[0] as HTMLElement;
      const fin = elementos[elementos.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === inicio) {
        e.preventDefault();
        fin.focus();
      } else if (!e.shiftKey && document.activeElement === fin) {
        e.preventDefault();
        inicio.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      previo?.focus?.();
    };
  }, []);

  return (
    <div
      className="velo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div ref={caja} className={`modal${angosto ? " angosto" : ""}`} role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
        <button type="button" className="cerrar" onClick={alCerrar} aria-label="Cerrar">
          ×
        </button>
        <h2 id={idTitulo}>{titulo}</h2>
        {descripcion ? <p className="descripcion-modal">{descripcion}</p> : null}
        {children}
      </div>
    </div>
  );
}
