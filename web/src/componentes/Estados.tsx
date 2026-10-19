import type { ReactNode } from "react";
import { mensajeDeError } from "@compartido/errores";

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="cargando" role="status">
      <svg className="latido" viewBox="0 0 120 30" aria-hidden="true">
        <path d="M0 15 H38 L45 4 L52 26 L58 10 L63 15 H120" />
      </svg>
      <span>{texto}</span>
    </div>
  );
}

export function PanelError({ error, accion }: { error: unknown; accion?: ReactNode }) {
  return (
    <div className="franja alerta" role="alert">
      <span className="e" aria-hidden="true">
        ⚠️
      </span>
      <div>
        <b>No se pudo cargar la información.</b> {mensajeDeError(error)}
        {accion ? <div style={{ marginTop: 10 }}>{accion}</div> : null}
      </div>
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="vacio">{children}</div>;
}
