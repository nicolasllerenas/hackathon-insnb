import type { EstadoPaciente } from "@compartido/dominio/estados";
import { CONDUCTAS } from "@compartido/dominio/estados";
import type { EstadoEnlace } from "@compartido/dominio/enlace";
import { NOMBRE_ENLACE } from "@compartido/dominio/enlace";

export const FORMA_ESTADO: Record<EstadoPaciente, string> = { estable: "●", grave: "▲", priorizable: "◆" };

export function InsigniaEstado({ estado, texto }: { estado: EstadoPaciente; texto?: string }) {
  return (
    <span className={`insignia ${estado}`}>
      <span className="forma" aria-hidden="true">
        {FORMA_ESTADO[estado]}
      </span>
      {texto ?? CONDUCTAS[estado].nombre}
    </span>
  );
}

const CLASE_ENLACE: Record<EstadoEnlace, string> = { en_linea: "estable", intermitente: "grave", sin_contacto: "priorizable" };

export function InsigniaEnlace({ enlace }: { enlace: EstadoEnlace }) {
  return (
    <span className={`insignia ${CLASE_ENLACE[enlace]}`}>
      <span className={`pulso-enlace ${enlace}`} aria-hidden="true" />
      {NOMBRE_ENLACE[enlace]}
    </span>
  );
}
