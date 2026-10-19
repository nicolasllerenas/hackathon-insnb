import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { mensajeDeError } from "@compartido/errores";

type TipoAviso = "info" | "exito" | "error";

interface Aviso {
  id: number;
  texto: string;
  tipo: TipoAviso;
}

interface ContextoAvisos {
  avisar: (texto: string, tipo?: TipoAviso) => void;
  avisarError: (e: unknown) => void;
}

const Contexto = createContext<ContextoAvisos>({ avisar: () => undefined, avisarError: () => undefined });

const ICONO: Record<TipoAviso, string> = { info: "ℹ️", exito: "✅", error: "⚠️" };

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguiente = useRef(1);

  const quitar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);

  const avisar = useCallback(
    (texto: string, tipo: TipoAviso = "info") => {
      const id = siguiente.current++;
      setAvisos((a) => [...a.slice(-3), { id, texto, tipo }]);
      window.setTimeout(() => quitar(id), tipo === "error" ? 9000 : 5000);
    },
    [quitar],
  );

  const avisarError = useCallback((e: unknown) => avisar(mensajeDeError(e), "error"), [avisar]);
  const valor = useMemo(() => ({ avisar, avisarError }), [avisar, avisarError]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso ${a.tipo}`}>
            <span aria-hidden="true">{ICONO[a.tipo]}</span>
            <span>{a.texto}</span>
            <button type="button" onClick={() => quitar(a.id)} aria-label="Descartar aviso">
              ×
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useAvisos(): ContextoAvisos {
  return useContext(Contexto);
}
