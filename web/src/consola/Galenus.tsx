import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { Formato, Mensaje } from "@compartido/contratos/interoperabilidad";
import { mensajeDeError } from "@compartido/errores";
import { useAvisos } from "../componentes/Avisos";
import { Campo } from "../componentes/Campo";
import { Cargando, PanelError } from "../componentes/Estados";
import { useAccion, useMensajes } from "../datos/consultas";
import { useDatos } from "../datos/contexto";
import { nombreCompleto, usePanel } from "./panel";

const FECHA_HORA = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function descargar(nombre: string, contenido: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Galenus() {
  const { plataforma } = useDatos();
  const panel = usePanel();
  const { avisar, avisarError } = useAvisos();
  const [parametros, setParametros] = useSearchParams();
  const pacienteId = parametros.get("paciente") ?? "";
  const formato: Formato = parametros.get("formato") === "fhir" ? "fhir" : "hl7v2";
  const [tamizajeId, setTamizajeId] = useState("");
  const fijarParametro = (clave: string, valor: string) => {
    const p = new URLSearchParams(parametros);
    p.set(clave, valor);
    setParametros(p, { replace: true });
  };
  const [vista, setVista] = useState<Mensaje | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bandeja = useMensajes();

  const conTamizajes = panel.filas.filter((f) => f.tamizajes.length > 0);
  const fila = conTamizajes.find((f) => f.paciente.id === pacienteId) ?? conTamizajes[0];
  const tamizaje = fila?.tamizajes.find((t) => t.id === tamizajeId) ?? fila?.ultimo ?? null;

  const solicitud = useMemo(() => {
    if (!fila || !tamizaje) return null;
    return {
      formato,
      paciente: fila.paciente,
      tamizaje,
      michi: fila.michi
        ? { serie: fila.michi.michi.serie, firmware: fila.michi.michi.firmware || "0.3.0", enlace: fila.michi.salud.enlace, bateriaPct: fila.michi.salud.bateriaPct }
        : null,
    };
  }, [fila, tamizaje, formato]);

  useEffect(() => {
    if (!solicitud) return;
    let vivo = true;
    plataforma.interop
      .generarMensaje({ ...solicitud, guardar: false })
      .then((m) => {
        if (vivo) {
          setVista(m);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (vivo) setError(mensajeDeError(e));
      });
    return () => {
      vivo = false;
    };
  }, [plataforma, solicitud]);

  const encolar = useAccion(["interop"], (p, s: NonNullable<typeof solicitud>) => p.interop.generarMensaje({ ...s, guardar: true }));
  const borrar = useAccion(["interop"], (p, id: string) => p.interop.eliminarMensaje(id));

  if (panel.cargando) return <Cargando />;
  if (panel.error) return <PanelError error={panel.error} />;

  const contenido = vista ? (vista.formato === "hl7v2" ? vista.contenido.replace(/\r/g, "\n") : vista.contenido) : "";

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <div>
          <h1>Salida hacia Galenus</h1>
          <p>Cada tamizaje sale como HL7 v2 ORU^R01 y como FHIR R4 con los perfiles nacionales. No es un tablero aparte: entra al HIS que el instituto ya usa.</p>
        </div>
      </div>
      <div className="franja info">
        <span className="e">🔒</span>
        <span>
          El resultado viaja siempre <b>preliminar</b>, con el método explícito y la nota de que no es un hemograma. Los datos simulados se marcan como tales en el
          propio mensaje.
        </span>
      </div>
      <section className="panel">
        <div className="rejilla-campos">
          <Campo etiqueta="Paciente">
            {(id) => (
              <select
                id={id}
                value={fila?.paciente.id ?? ""}
                onChange={(e) => {
                  fijarParametro("paciente", e.target.value);
                  setTamizajeId("");
                }}
              >
                {conTamizajes.map((f) => (
                  <option key={f.paciente.id} value={f.paciente.id}>
                    {nombreCompleto(f.paciente)} — {f.evaluacion.estado}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Tamizaje">
            {(id) => (
              <select id={id} value={tamizaje?.id ?? ""} onChange={(e) => setTamizajeId(e.target.value)}>
                {[...(fila?.tamizajes ?? [])].reverse().map((t) => (
                  <option key={t.id} value={t.id}>
                    {FECHA_HORA.format(new Date(t.momento))} · {t.ancEstimado ?? "NC"}/µL · {t.estado}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Formato">
            {(id) => (
              <select id={id} value={formato} onChange={(e) => fijarParametro("formato", e.target.value)}>
                <option value="hl7v2">HL7 v2.5.1 · ORU^R01</option>
                <option value="fhir">FHIR R4 · Bundle PE Core</option>
              </select>
            )}
          </Campo>
        </div>
        {error ? <div className="franja alerta">{error}</div> : null}
        {!conTamizajes.length ? <div className="vacio">No hay tamizajes para exportar todavía.</div> : null}
        {vista ? (
          <pre className="mensaje-hl7" id="salidaMensaje" tabIndex={0}>
            {contenido}
          </pre>
        ) : null}
        <div className="botonera">
          <button
            type="button"
            className="boton"
            disabled={!solicitud || encolar.isPending}
            onClick={() =>
              solicitud &&
              encolar
                .mutateAsync(solicitud)
                .then(() => avisar("Mensaje en la bandeja de salida hacia Galenus.", "exito"))
                .catch(avisarError)
            }
          >
            Poner en la bandeja de salida
          </button>
          <button
            type="button"
            className="boton fantasma"
            disabled={!vista}
            onClick={() =>
              void navigator.clipboard
                ?.writeText(contenido)
                .then(() => avisar("Copiado al portapapeles.", "exito"))
                .catch(() => avisar("No se pudo copiar.", "error"))
            }
          >
            Copiar
          </button>
          <button
            type="button"
            className="boton fantasma"
            disabled={!vista}
            onClick={() => vista && descargar(`${fila?.paciente.historiaClinica ?? "mensaje"}.${vista.formato === "hl7v2" ? "hl7" : "json"}`, vista.formato === "hl7v2" ? vista.contenido : contenido, vista.formato === "hl7v2" ? "x-application/hl7-v2+er7" : "application/fhir+json")}
          >
            Descargar
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Bandeja de salida</h2>
        {bandeja.isLoading ? <Cargando /> : null}
        {bandeja.data?.length ? (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Creado</th>
                  <th>Paciente</th>
                  <th>Formato</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {bandeja.data.map((m) => {
                  const p = panel.pacientes.find((x) => x.id === m.pacienteId);
                  return (
                    <tr key={m.id}>
                      <td>{FECHA_HORA.format(new Date(m.creado))}</td>
                      <td>{p ? nombreCompleto(p) : m.pacienteId}</td>
                      <td className="num">{m.formato === "hl7v2" ? "ORU^R01" : "FHIR"}</td>
                      <td>
                        <span className="insignia grave">{m.estado}</span>
                      </td>
                      <td className="acciones-celda">
                        <button type="button" className="boton fantasma chico" onClick={() => setVista(m)}>
                          Ver
                        </button>
                        <button type="button" className="boton peligro-texto chico" onClick={() => borrar.mutateAsync(m.id).catch(avisarError)}>
                          Quitar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : !bandeja.isLoading ? (
          <div className="vacio">La bandeja está vacía.</div>
        ) : null}
        <div className="nota">
          <b>Estado real de la integración.</b> El INSN San Borja usa Galenus como HIS y el perfil nacional PE Core está publicado. Lo que falta no es desarrollo: es el
          acuerdo de interoperabilidad con la OGTI (endpoint, credenciales y ambiente de pruebas). Mientras tanto los mensajes quedan pendientes en esta bandeja.
        </div>
      </section>
    </div>
  );
}
