import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { esErrorMichi } from "@compartido/errores";
import { guardarConfiguracion, leerConfiguracion, type Configuracion } from "./configuracion";
import { crearPlataforma, type NombreServicio, type Plataforma } from "./plataforma";

interface ContextoDatos {
  plataforma: Plataforma;
  config: Configuracion;
  cambiarConfiguracion: (config: Configuracion) => void;
  avisarCambio: (servicios: NombreServicio[]) => void;
}

const Contexto = createContext<ContextoDatos | null>(null);
const cache = new Map<string, Plataforma>();
const CANAL = "michicheck-datos";

function plataformaPara(config: Configuracion): Plataforma {
  const llave = `${config.modo}:${config.modo === "servidor" ? config.token : ""}`;
  let p = cache.get(llave);
  if (!p) {
    p = crearPlataforma(config);
    cache.set(llave, p);
  }
  return p;
}

export function crearClienteConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 4_000,
        refetchOnWindowFocus: true,
        retry: (intentos, error) => !(esErrorMichi(error) && error.codigo !== "red" && error.codigo !== "interno") && intentos < 2,
      },
      mutations: { retry: false },
    },
  });
}

function Interno({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [config, setConfig] = useState<Configuracion>(leerConfiguracion);
  const plataforma = useMemo(() => plataformaPara(config), [config]);
  const [canal] = useState<BroadcastChannel | null>(() => (typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CANAL)));

  useEffect(() => {
    if (!canal) return;
    const alRecibir = (e: MessageEvent<{ modo: string; servicios: NombreServicio[] }>) => {
      for (const s of e.data?.servicios ?? []) void qc.invalidateQueries({ queryKey: [e.data.modo, s] });
    };
    canal.addEventListener("message", alRecibir);
    return () => canal.removeEventListener("message", alRecibir);
  }, [canal, qc]);

  const avisarCambio = useCallback(
    (servicios: NombreServicio[]) => {
      for (const s of servicios) void qc.invalidateQueries({ queryKey: [plataforma.modo, s] });
      canal?.postMessage({ modo: plataforma.modo, servicios });
    },
    [canal, plataforma.modo, qc],
  );

  const cambiarConfiguracion = useCallback(
    (nueva: Configuracion) => {
      guardarConfiguracion(nueva);
      setConfig(nueva);
      qc.clear();
    },
    [qc],
  );

  const valor = useMemo(() => ({ plataforma, config, cambiarConfiguracion, avisarCambio }), [plataforma, config, cambiarConfiguracion, avisarCambio]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function ProveedorDatos({ children, cliente }: { children: ReactNode; cliente?: QueryClient }) {
  const [qc] = useState(() => cliente ?? crearClienteConsultas());
  return (
    <QueryClientProvider client={qc}>
      <Interno>{children}</Interno>
    </QueryClientProvider>
  );
}

export function useDatos(): ContextoDatos {
  const c = useContext(Contexto);
  if (!c) throw new Error("useDatos debe usarse dentro de ProveedorDatos");
  return c;
}
