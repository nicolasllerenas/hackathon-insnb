import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";

const raiz = fileURLToPath(new URL(".", import.meta.url));
const ruta = (relativa: string) => fileURLToPath(new URL(relativa, import.meta.url));

type Manejador = (peticion: Request) => Promise<Response>;

const SERVICIOS: Record<string, { archivo: string; fabrica: string }> = {
  clinica: { archivo: "servicios/clinica/rutas.ts", fabrica: "crearManejadorClinica" },
  dispositivos: { archivo: "servicios/dispositivos/rutas.ts", fabrica: "crearManejadorDispositivos" },
  interop: { archivo: "servicios/interoperabilidad/rutas.ts", fabrica: "crearManejadorInterop" },
  investigacion: { archivo: "servicios/investigacion/rutas.ts", fabrica: "crearManejadorInvestigacion" },
};

const CABECERAS_SEGURIDAD: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=(), serial=(self), interest-cohort=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

async function aPeticion(req: IncomingMessage): Promise<Request> {
  const partes: Buffer[] = [];
  for await (const parte of req) partes.push(Buffer.isBuffer(parte) ? parte : Buffer.from(parte as string));
  const cabeceras = new Headers();
  for (const [clave, valor] of Object.entries(req.headers)) {
    if (Array.isArray(valor)) valor.forEach((v) => cabeceras.append(clave, v));
    else if (valor !== undefined) cabeceras.set(clave, valor);
  }
  const metodo = (req.method ?? "GET").toUpperCase();
  const cuerpo = metodo === "GET" || metodo === "HEAD" ? undefined : Buffer.concat(partes);
  return new Request(`http://localhost${req.url ?? "/"}`, { method: metodo, headers: cabeceras, body: cuerpo });
}

async function escribir(res: ServerResponse, respuesta: Response): Promise<void> {
  res.statusCode = respuesta.status;
  respuesta.headers.forEach((valor, clave) => res.setHeader(clave, valor));
  res.end(Buffer.from(await respuesta.arrayBuffer()));
}

function apiLocal(): Plugin {
  const manejadores = new Map<string, Manejador>();
  const obtener = async (server: ViteDevServer, nombre: string): Promise<Manejador> => {
    const existente = manejadores.get(nombre);
    if (existente) return existente;
    const definicion = SERVICIOS[nombre];
    if (!definicion) throw new Error(`Servicio desconocido: ${nombre}`);
    const modulo = (await server.ssrLoadModule(ruta(definicion.archivo))) as Record<string, () => Manejador>;
    const fabrica = modulo[definicion.fabrica];
    if (!fabrica) throw new Error(`No se encontró ${definicion.fabrica}`);
    const manejador = fabrica();
    manejadores.set(nombre, manejador);
    return manejador;
  };
  return {
    name: "michicheck-api-local",
    configureServer(server) {
      server.watcher.on("change", (archivo) => {
        if (archivo.includes("/servicios/") || archivo.includes("/compartido/")) manejadores.clear();
      });
      server.middlewares.use((req, res, next) => {
        const m = /^\/api\/v1\/([a-z]+)(?:[/?]|$)/.exec(req.url ?? "");
        if (!m || !SERVICIOS[m[1] as string]) {
          next();
          return;
        }
        Promise.all([obtener(server, m[1] as string), aPeticion(req)])
          .then(([manejador, peticion]) => manejador(peticion))
          .then((respuesta) => escribir(res, respuesta))
          .catch((e: unknown) => {
            server.config.logger.error(String(e));
            res.statusCode = 500;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: { codigo: "interno", mensaje: "Error en la API local", detalles: [] } }));
          });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const entorno = loadEnv(mode, raiz, "");
  for (const clave of ["DATABASE_URL", "POSTGRES_URL", "MICHICHECK_TOKEN"]) {
    const valor = entorno[clave];
    if (valor && !process.env[clave]) process.env[clave] = valor;
  }
  return {
    root: ruta("web"),
    publicDir: ruta("web/public"),
    envDir: raiz,
    plugins: [react(), apiLocal()],
    resolve: {
      alias: {
        "@compartido": ruta("compartido"),
        "@servicios": ruta("servicios"),
      },
    },
    server: { port: 5173, fs: { allow: [raiz] } },
    preview: { port: 4173, headers: CABECERAS_SEGURIDAD },
    build: {
      outDir: ruta("dist"),
      emptyOutDir: true,
      target: "es2022",
      sourcemap: false,
      assetsInlineLimit: (archivo: string) => (/\.(woff2?|ttf|otf)$/.test(archivo) ? false : undefined),
      rolldownOptions: {
        input: {
          principal: ruta("web/index.html"),
          michi: ruta("web/michi/index.html"),
        },
        output: {
          codeSplitting: {
            groups: [
              { name: "react", test: /node_modules[\\/](react|react-dom|react-router|scheduler|cookie|set-cookie-parser)[\\/]/, priority: 3 },
              { name: "datos", test: /node_modules[\\/](zod|dexie|@tanstack)[\\/]/, priority: 2 },
            ],
          },
        },
      },
    },
  };
});
