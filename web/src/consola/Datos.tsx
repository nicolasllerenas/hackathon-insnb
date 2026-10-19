import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { ddlAuditoria, ddlTabla } from "@compartido/almacen/sql";
import type { Volcado } from "@compartido/contratos/comunes";
import { esErrorMichi, mensajeDeError } from "@compartido/errores";
import { ESQUEMA_CLINICA, TABLAS_CLINICA } from "@servicios/clinica/esquema";
import { ESQUEMA_DISPOSITIVOS, TABLAS_DISPOSITIVOS } from "@servicios/dispositivos/esquema";
import { ESQUEMA_INTEROP, TABLAS_INTEROP } from "@servicios/interoperabilidad/esquema";
import { ESQUEMA_INVESTIGACION, TABLAS_INVESTIGACION } from "@servicios/investigacion/esquema";
import { useAvisos } from "../componentes/Avisos";
import { Campo } from "../componentes/Campo";
import { Modal } from "../componentes/Modal";
import { useSalud } from "../datos/consultas";
import { useDatos } from "../datos/contexto";
import { crearPlataforma, NOMBRES_SERVICIO, type NombreServicio, type Plataforma } from "../datos/plataforma";
import { ModalConfirmar } from "./modales";

const SERVICIOS: NombreServicio[] = ["clinica", "dispositivos", "interop", "investigacion"];

const DDL = [
  [ESQUEMA_CLINICA, TABLAS_CLINICA],
  [ESQUEMA_DISPOSITIVOS, TABLAS_DISPOSITIVOS],
  [ESQUEMA_INTEROP, TABLAS_INTEROP],
  [ESQUEMA_INVESTIGACION, TABLAS_INVESTIGACION],
] as const;

type Respaldo = Record<NombreServicio, Volcado> & { formato: "michicheck-respaldo"; version: 1; generado: string };

async function exportarTodo(p: Plataforma): Promise<Respaldo> {
  return {
    formato: "michicheck-respaldo",
    version: 1,
    generado: new Date().toISOString(),
    clinica: await p.clinica.exportar(),
    dispositivos: await p.dispositivos.exportar(),
    interop: await p.interop.exportar(),
    investigacion: await p.investigacion.exportar(),
  };
}

async function importarTodo(p: Plataforma, r: Respaldo): Promise<string> {
  const partes: string[] = [];
  for (const s of SERVICIOS) {
    const conteo = await p[s].importar(r[s] ?? {});
    partes.push(`${NOMBRES_SERVICIO[s]}: ${Object.entries(conteo).map(([k, v]) => `${v} ${k}`).join(", ") || "sin cambios"}`);
  }
  return partes.join(" · ");
}

function esRespaldo(x: unknown): x is Respaldo {
  return Boolean(x && typeof x === "object" && (x as { formato?: string }).formato === "michicheck-respaldo");
}

function TarjetaServicio({ servicio }: { servicio: NombreServicio }) {
  const salud = useSalud(servicio);
  const error = salud.error;
  const noConfigurado = esErrorMichi(error) && error.codigo === "no_configurado";
  const noAutorizado = esErrorMichi(error) && error.codigo === "no_autorizado";
  return (
    <div className={`tarjeta-servicio${error ? " con-error" : ""}`}>
      <div className="cabeza-servicio">
        <b>{NOMBRES_SERVICIO[servicio]}</b>
        <span className={`insignia ${error ? "priorizable" : salud.data ? "estable" : "neutra"}`}>{error ? "sin conexión" : salud.data ? salud.data.almacen : "…"}</span>
      </div>
      {salud.data ? (
        <ul className="conteos">
          {Object.entries(salud.data.registros).map(([k, v]) => (
            <li key={k}>
              <span>{k}</span>
              <b className="num">{v}</b>
            </li>
          ))}
          {!Object.keys(salud.data.registros).length ? <li className="meta">Ingrese el token clínico para ver los conteos.</li> : null}
        </ul>
      ) : null}
      {error ? (
        <p className="meta">
          {noConfigurado
            ? "El servidor no tiene DATABASE_URL o MICHICHECK_TOKEN configurados."
            : noAutorizado
              ? "Token clínico inválido."
              : mensajeDeError(error)}
        </p>
      ) : null}
      <span className="meta num">
        /api/v1/{servicio} · v{salud.data?.version ?? "—"}
      </span>
    </div>
  );
}

export function Datos() {
  const { plataforma, config, cambiarConfiguracion, avisarCambio } = useDatos();
  const qc = useQueryClient();
  const { avisar, avisarError } = useAvisos();
  const [token, setToken] = useState(config.token);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<"vaciar" | "demo" | "migrar" | null>(null);
  const [explorar, setExplorar] = useState<NombreServicio>("clinica");
  const [volcado, setVolcado] = useState<Volcado | null>(null);
  const [registro, setRegistro] = useState<unknown>(null);
  const [verDdl, setVerDdl] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const sql = useMemo(
    () =>
      DDL.map(([esquema, tablas]) => [`CREATE SCHEMA IF NOT EXISTS "${esquema}";`, ...tablas.flatMap((t) => ddlTabla(esquema, t).map((s) => `${s};`)), `${ddlAuditoria(esquema)};`].join("\n\n")).join(
        "\n\n",
      ),
    [],
  );

  const ejecutar = async (etiqueta: string, trabajo: () => Promise<string | void>) => {
    setOcupado(etiqueta);
    try {
      const r = await trabajo();
      avisarCambio(SERVICIOS);
      await qc.invalidateQueries();
      if (r) avisar(r, "exito");
    } catch (e) {
      avisarError(e);
    } finally {
      setOcupado(null);
    }
  };

  const descargarRespaldo = () =>
    ejecutar("exportar", async () => {
      const r = await exportarTodo(plataforma);
      const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `michicheck_respaldo_${plataforma.modo}_${r.generado.slice(0, 10)}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return "Respaldo descargado. Contiene datos personales de salud: guárdelo cifrado.";
    });

  const importarArchivo = (f: File) =>
    ejecutar("importar", async () => {
      if (f.size > 4 * 1024 * 1024) throw new Error("El archivo supera 4 MB");
      let datos: unknown;
      try {
        datos = JSON.parse(await f.text());
      } catch {
        throw new Error("El archivo no es JSON válido");
      }
      if (!esRespaldo(datos)) throw new Error("No es un respaldo de MichiCheck");
      return `Importado. ${await importarTodo(plataforma, datos)}`;
    });

  const cargarExplorador = (s: NombreServicio) => {
    setExplorar(s);
    setVolcado(null);
    plataforma[s]
      .exportar()
      .then(setVolcado)
      .catch((e: unknown) => avisarError(e));
  };

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <div>
          <h1>Base de datos</h1>
          <p>
            Cuatro servicios, cada uno con su propio esquema. En modo local viven en este navegador (IndexedDB); en modo servidor, en PostgreSQL detrás de las funciones
            de Vercel.
          </p>
        </div>
      </div>

      <section className="panel">
        <h2>Origen de los datos</h2>
        <div className="selector-modo" role="radiogroup" aria-label="Modo de datos">
          <button
            type="button"
            role="radio"
            aria-checked={config.modo === "local"}
            className={`opcion-modo${config.modo === "local" ? " activa" : ""}`}
            onClick={() => cambiarConfiguracion({ ...config, modo: "local" })}
          >
            <b>Local</b>
            <span>IndexedDB en este navegador. Funciona sin red; ideal para demostraciones y pruebas.</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={config.modo === "servidor"}
            className={`opcion-modo${config.modo === "servidor" ? " activa" : ""}`}
            onClick={() => cambiarConfiguracion({ ...config, modo: "servidor", token })}
          >
            <b>Servidor</b>
            <span>PostgreSQL vía /api/v1. Compartido por todo el equipo y por las familias.</span>
          </button>
        </div>
        <form
          className="fila-token"
          onSubmit={(e) => {
            e.preventDefault();
            cambiarConfiguracion({ ...config, token: token.trim() });
            avisar("Token guardado en este navegador.", "exito");
          }}
        >
          <Campo etiqueta="Token clínico (MICHICHECK_TOKEN)" ayuda="Se guarda solo en este navegador. Las rutas de la familia y del michi usan el código de vinculación, no este token.">
            {(id, d) => <input id={id} type="password" autoComplete="off" value={token} aria-describedby={d} onChange={(e) => setToken(e.target.value)} />}
          </Campo>
          <button type="submit" className="boton fantasma">
            Guardar token
          </button>
        </form>
        <div className="servicios">
          {SERVICIOS.map((s) => (
            <TarjetaServicio key={`${plataforma.modo}-${s}`} servicio={s} />
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Respaldo y mantenimiento</h2>
        <div className="acciones-datos">
          <button type="button" className="boton" disabled={Boolean(ocupado)} onClick={() => void descargarRespaldo()}>
            {ocupado === "exportar" ? "Exportando…" : "Exportar respaldo (JSON)"}
          </button>
          <button type="button" className="boton fantasma" disabled={Boolean(ocupado)} onClick={() => archivo.current?.click()}>
            {ocupado === "importar" ? "Importando…" : "Importar respaldo"}
          </button>
          <input
            ref={archivo}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importarArchivo(f);
            }}
          />
          <button type="button" className="boton fantasma" disabled={Boolean(ocupado)} onClick={() => setConfirmar("demo")}>
            Cargar datos de demostración
          </button>
          {plataforma.modo === "servidor" ? (
            <button type="button" className="boton cian" disabled={Boolean(ocupado)} onClick={() => setConfirmar("migrar")}>
              Copiar datos locales al servidor
            </button>
          ) : null}
          <button type="button" className="boton peligro-texto" disabled={Boolean(ocupado)} onClick={() => setConfirmar("vaciar")}>
            Vaciar todos los servicios
          </button>
        </div>
        <div className="nota">
          Importar actualiza por identificador: los registros existentes se sobrescriben y los nuevos se agregan. Cada servicio valida su parte con los mismos
          contratos que la API; un respaldo con un registro inválido no se importa a medias en ese servicio.
        </div>
      </section>

      <section className="panel">
        <div className="titulo-seccion">
          <h2>Explorador de registros</h2>
          <div className="filtros" role="group" aria-label="Servicio">
            {SERVICIOS.map((s) => (
              <button key={s} type="button" className={`filtro${explorar === s && volcado ? " activo" : ""}`} onClick={() => cargarExplorador(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
        {volcado ? (
          Object.entries(volcado).map(([coleccion, docs]) => (
            <details key={coleccion} className="coleccion">
              <summary>
                <b>
                  {explorar}.{coleccion}
                </b>{" "}
                <span className="meta">{docs.length} registros</span>
              </summary>
              <div className="tabla-envoltura">
                <table className="tabla compacta">
                  <tbody>
                    {docs.slice(0, 200).map((d) => {
                      const doc = d as { id: string };
                      return (
                        <tr key={doc.id}>
                          <td className="num">{doc.id}</td>
                          <td className="meta resumen-json">{JSON.stringify(d).slice(0, 140)}…</td>
                          <td>
                            <button type="button" className="boton fantasma chico" onClick={() => setRegistro(d)}>
                              Ver
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          ))
        ) : (
          <p className="meta">Elija un servicio para ver sus colecciones.</p>
        )}
      </section>

      <section className="panel">
        <div className="titulo-seccion">
          <h2>Esquema SQL</h2>
          <button type="button" className="boton fantasma chico" onClick={() => setVerDdl((v) => !v)}>
            {verDdl ? "Ocultar" : "Ver DDL"}
          </button>
        </div>
        <p className="meta">
          Cada colección es una tabla con el documento validado en <code>datos jsonb</code>, columnas generadas para los índices, unicidad y claves foráneas en cascada.
          Las migraciones se aplican solas al primer uso con un bloqueo consultivo; también con <code>npm run db:migrar</code>.
        </p>
        {verDdl ? <pre className="mensaje-hl7">{sql}</pre> : null}
      </section>

      {registro ? (
        <Modal titulo="Registro" alCerrar={() => setRegistro(null)}>
          <pre className="mensaje-hl7">{JSON.stringify(registro, null, 2)}</pre>
        </Modal>
      ) : null}
      {confirmar === "vaciar" ? (
        <ModalConfirmar
          titulo="Vaciar todos los servicios"
          texto={`Se eliminarán todos los registros del modo ${plataforma.modo === "local" ? "local de este navegador" : "servidor (Postgres)"}. Exporte un respaldo antes.`}
          accion="Vaciar"
          palabra="VACIAR"
          alCerrar={() => setConfirmar(null)}
          alConfirmar={() => ejecutar("vaciar", async () => {
            await plataforma.vaciarTodo();
            return "Todos los servicios quedaron vacíos.";
          })}
        />
      ) : null}
      {confirmar === "demo" ? (
        <ModalConfirmar
          titulo="Cargar datos de demostración"
          texto="Reemplaza todo el contenido actual por los seis pacientes ficticios del pitch, con sus tamizajes, hemogramas, michis y participantes."
          accion="Cargar demostración"
          alCerrar={() => setConfirmar(null)}
          alConfirmar={() => ejecutar("demo", async () => {
            await plataforma.restablecerDemostracion();
            return "Datos de demostración cargados.";
          })}
        />
      ) : null}
      {confirmar === "migrar" ? (
        <ModalConfirmar
          titulo="Copiar datos locales al servidor"
          texto="Exporta todo lo guardado en este navegador y lo importa en Postgres a través de los servicios. Los registros con el mismo identificador se sobrescriben."
          accion="Copiar al servidor"
          alCerrar={() => setConfirmar(null)}
          alConfirmar={() => ejecutar("migrar", async () => {
            const local = crearPlataforma({ modo: "local", token: "" });
            const r = await exportarTodo(local);
            return `Copiado. ${await importarTodo(plataforma, r)}`;
          })}
        />
      ) : null}
    </div>
  );
}
