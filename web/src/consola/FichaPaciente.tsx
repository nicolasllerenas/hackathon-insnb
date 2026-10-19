import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { NOMBRE_TIPO_CITA, type Cita, type Teleconsulta } from "@compartido/contratos/clinica";
import { planificarAlertas, textoVentana } from "@compartido/dominio/alertas";
import { CONDUCTAS } from "@compartido/dominio/estados";
import { fechaLarga, hace } from "@compartido/dominio/fechas";
import { enmascararCelular } from "@compartido/dominio/identificadores";
import { NOMBRE_MOTIVO } from "@compartido/dominio/referencias";
import { PERFILES } from "@compartido/dominio/tratamiento";
import { useAvisos } from "../componentes/Avisos";
import { Cargando, PanelError } from "../componentes/Estados";
import { Trayectoria } from "../componentes/Graficos";
import { InsigniaEnlace, InsigniaEstado, FORMA_ESTADO } from "../componentes/Insignia";
import { useAccion, useLatidos } from "../datos/consultas";
import { ModalCita, ModalConfirmar, ModalHemograma, ModalReferencia, ModalResponder, ModalTamizajeManual, ModalTeleconsulta } from "./modales";
import { nombreCompleto, usePanel } from "./panel";

type Pestana = "tamizajes" | "hemogramas" | "citas" | "teleconsultas" | "michi";
type ModalFicha = "teleconsulta" | "referencia" | "hemograma" | "cita" | "tamizaje" | "eliminar" | null;

function esFutura(a: { programada: Date }): boolean {
  return a.programada.getTime() >= new Date().getTime();
}

const FECHA_HORA = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const NUM = new Intl.NumberFormat("es-PE");

export function FichaPaciente() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [parametros, setParametros] = useSearchParams();
  const panel = usePanel();
  const { avisar, avisarError } = useAvisos();
  const [pestana, setPestana] = useState<Pestana>("tamizajes");
  const [mostrarCelular, setMostrarCelular] = useState(false);
  const [mostrarCodigo, setMostrarCodigo] = useState(false);
  const [citaEditada, setCitaEditada] = useState<Cita | null>(null);
  const [respondiendo, setRespondiendo] = useState<Teleconsulta | null>(null);
  const fila = panel.filas.find((f) => f.paciente.id === id);
  const latidos = useLatidos(fila?.paciente.serieMichi, 12);
  const modal = (parametros.get("modal") as ModalFicha) ?? null;
  const abrir = (m: ModalFicha) => {
    const p = new URLSearchParams(parametros);
    if (m) p.set("modal", m);
    else p.delete("modal");
    setParametros(p, { replace: true });
  };

  const eliminarRegistro = useAccion(["clinica"], (p, a: { coleccion: "hemogramas" | "citas" | "referencias" | "teleconsultas"; id: string }) =>
    p.clinica.eliminarRegistro(a.coleccion, a.id),
  );
  const guardarCita = useAccion(["clinica"], (p, c: Cita) => p.clinica.guardarRegistro("citas", c));
  const eliminarPaciente = useAccion(["clinica", "dispositivos", "investigacion", "interop"], async (p, pacienteId: string) => {
    const serie = fila?.paciente.serieMichi;
    if (serie) await p.dispositivos.cambiarEstado(serie, "devuelto").catch(() => undefined);
    const participantes = await p.investigacion.listarParticipantes();
    for (const x of participantes.filter((x) => x.pacienteId === pacienteId)) await p.investigacion.eliminarParticipante(x.id);
    await p.clinica.eliminarPaciente(pacienteId);
  });

  const alertas = useMemo(() => {
    if (!fila) return [];
    const p = fila.paciente;
    return planificarAlertas(
      {
        nombreNino: p.nombres,
        nombreMichi: p.nombreMichi,
        etapa: p.etapa,
        inicioEtapa: p.inicioEtapa,
        jornada: { finJornada: p.apoderado.finJornada, sinHorarioFijo: p.apoderado.sinHorarioFijo },
        controles: fila.citas.filter((c) => c.tipo === "control" || c.tipo === "hemograma").map((c) => c.fecha),
      },
      undefined,
      7,
    ).filter(esFutura);
  }, [fila]);

  if (panel.cargando) return <Cargando />;
  if (panel.error) return <PanelError error={panel.error} />;
  if (!fila) {
    return (
      <div className="pagina">
        <div className="vacio">
          No se encontró al paciente. <Link to="/insn">Volver al tablero</Link>
        </div>
      </div>
    );
  }

  const { paciente: p, evaluacion: ev, michi, ultimo } = fila;
  const perfil = PERFILES[p.etapa];
  const silencio = michi?.salud.enlace === "sin_contacto";
  const puntos = fila.tamizajes
    .filter((t) => t.concluyente && t.ancEstimado !== null)
    .map((t) => ({ momento: t.momento, anc: t.ancEstimado as number, inferior: t.icInferior, superior: t.icSuperior, estado: t.estado }));
  const hemogramas = fila.hemogramas.map((h) => ({ momento: h.fecha, anc: h.anc }));

  return (
    <div className="pagina ficha">
      <div className="cabecera-ficha">
        <span className="avatar grande" aria-hidden="true">
          {p.sexo === "F" ? "👧" : "👦"}
        </span>
        <div className="identidad">
          <h1>{nombreCompleto(p)}</h1>
          <p className="meta">
            {fila.edad.toFixed(1)} años · HC {p.historiaClinica} · {p.domicilio.provincia}, {p.domicilio.departamento} · {p.domicilio.horasAlInsn} h al INSN · fototipo{" "}
            {p.fototipo}
          </p>
          <div className="insignias">
            <InsigniaEstado estado={ev.estado} texto={`${CONDUCTAS[ev.estado].nombre} · ${ev.titulo}`} />
            {michi ? <InsigniaEnlace enlace={michi.salud.enlace} /> : <span className="insignia neutra">Sin michi activo</span>}
            <span className="insignia neutra">
              {perfil.nombre} · riesgo de abandono {perfil.riesgoAbandono}
            </span>
            {p.cateterCentral ? <span className="insignia neutra">Catéter central</span> : null}
          </div>
        </div>
        <div className="acciones-ficha">
          {ev.estado !== "estable" ? (
            <button type="button" id="btnTeleconsulta" className={`boton ${ev.estado === "priorizable" ? "coral" : ""}`} onClick={() => abrir("teleconsulta")}>
              Abrir teleconsulta{ev.estado === "priorizable" ? " prioritaria" : ""}
            </button>
          ) : null}
          <button type="button" id="btnReferencia" className="boton menta" onClick={() => abrir("referencia")}>
            Generar referencia
          </button>
          <button type="button" className="boton fantasma" onClick={() => abrir("hemograma")}>
            Registrar hemograma
          </button>
          <button type="button" className="boton fantasma" onClick={() => abrir("tamizaje")}>
            Registrar tamizaje
          </button>
          <Link className="boton fantasma" to={`/insn/galenus?paciente=${encodeURIComponent(p.id)}`}>
            Salida a Galenus
          </Link>
          <Link className="boton fantasma" to={`/insn/pacientes/${encodeURIComponent(p.id)}/editar`}>
            Editar ficha
          </Link>
        </div>
      </div>

      {ev.escaladoPorFiebre ? (
        <div className="franja alerta" id="franjaFiebre">
          <span className="e">🌡️</span>
          <span>
            <b>Fiebre de {ultimo?.temperaturaC?.toFixed(1)} °C con tamizaje compatible con neutropenia.</b> Se maneja como neutropenia febril: antibiótico de amplio
            espectro en la primera hora. La fiebre escala el estado y nunca lo rebaja.
          </span>
        </div>
      ) : null}
      {silencio ? (
        <div className="franja alerta" id="franjaSilencio">
          <span className="e">📵</span>
          <span>
            <b>El michi lleva {Math.round((michi?.salud.horasDeSilencio ?? 0) / 24)} días sin comunicarse.</b> Es la señal de abandono más temprana del sistema:
            llega antes que la cita perdida. {michi?.salud.conducta}
          </span>
        </div>
      ) : null}
      {ev.referenciaSugerida ? (
        <div className="franja ambar">
          <span className="e">🚌</span>
          <span>
            La familia no puede viajar a Lima. Si hace falta atención presencial, el destino propuesto es <b>{ev.referenciaSugerida.destino.nombre}</b> (
            {ev.referenciaSugerida.destino.ciudad}), que evita {Math.round(ev.referenciaSugerida.horasDeViajeEvitadas)} h de viaje.
          </span>
        </div>
      ) : null}

      <div className="dos-columnas">
        <section className="panel" aria-labelledby="titulo-trayectoria">
          <h2 id="titulo-trayectoria">Trayectoria del recuento</h2>
          <div id="cajaGrafico">
            <Trayectoria puntos={puntos} hemogramas={hemogramas} titulo="ANC estimado por el michi" />
          </div>
          <div className="nota">
            Un hemograma mensual da un punto al mes. El michi da una línea. En el mantenimiento importa <b>hacia dónde va</b> el recuento: esta trayectoria permite
            ajustar la 6-MP sin que el niño viaje.
          </div>
        </section>
        <section className="panel" aria-labelledby="titulo-evaluacion">
          <h2 id="titulo-evaluacion">Evaluación actual</h2>
          <p className="conducta">{ev.paraElEquipo}</p>
          {ev.plazo ? <p className="meta">Plazo: {ev.plazo}</p> : null}
          <ul className="motivos">
            {ev.motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <dl className="ficha-datos">
            <div>
              <dt>Apoderado</dt>
              <dd>
                {p.apoderado.nombre} ({p.apoderado.parentesco})
                <br />
                <button type="button" className="enlace" onClick={() => setMostrarCelular((v) => !v)}>
                  {mostrarCelular ? p.apoderado.celular : enmascararCelular(p.apoderado.celular)}
                </button>{" "}
                · contesta por {p.apoderado.canalPreferido}
              </dd>
            </div>
            <div>
              <dt>Ventana del michi</dt>
              <dd>{textoVentana({ finJornada: p.apoderado.finJornada, sinHorarioFijo: p.apoderado.sinHorarioFijo })}</dd>
            </div>
            <div>
              <dt>Próxima cita</dt>
              <dd>{fila.proximaCita ? `${fechaLarga(fila.proximaCita.fecha)} · ${NOMBRE_TIPO_CITA[fila.proximaCita.tipo]}` : "Sin programar"}</dd>
            </div>
            <div>
              <dt>Adherencia al tamizaje (4 sem.)</dt>
              <dd className="num">{fila.adherencia === null ? "—" : `${Math.round(fila.adherencia * 100)}%`}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="panel">
        <div className="pestanas" role="tablist" aria-label="Registros del paciente">
          {(
            [
              ["tamizajes", `Tamizajes (${fila.tamizajes.length})`],
              ["hemogramas", `Hemogramas (${fila.hemogramas.length})`],
              ["citas", `Citas (${fila.citas.length})`],
              ["teleconsultas", `Teleconsultas y referencias (${fila.teleconsultas.length + fila.referencias.length})`],
              ["michi", "Michi y alertas"],
            ] as const
          ).map(([idP, texto]) => (
            <button key={idP} type="button" role="tab" aria-selected={pestana === idP} className={pestana === idP ? "activa" : ""} onClick={() => setPestana(idP)}>
              {texto}
            </button>
          ))}
        </div>

        {pestana === "tamizajes" ? (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Momento</th>
                  <th>ANC</th>
                  <th>IC95</th>
                  <th>Capilares · eventos</th>
                  <th>Temp.</th>
                  <th>Estado</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {[...fila.tamizajes].reverse().map((t) => (
                  <tr key={t.id}>
                    <td>{FECHA_HORA.format(new Date(t.momento))}</td>
                    <td className="num">{t.ancEstimado === null ? "—" : NUM.format(t.ancEstimado)}</td>
                    <td className="num">
                      {t.icInferior === null ? "—" : NUM.format(t.icInferior)}–{t.icSuperior === null ? "∞" : NUM.format(t.icSuperior)}
                    </td>
                    <td className="num">
                      {t.capilares} · {t.eventos}
                    </td>
                    <td className="num">{t.temperaturaC === null ? "—" : `${t.temperaturaC.toFixed(1)} °C`}</td>
                    <td>
                      <span className={`estado-texto ${t.estado}`}>
                        {FORMA_ESTADO[t.estado]} {t.estado}
                      </span>
                      {!t.concluyente ? <div className="meta">no concluyente</div> : null}
                    </td>
                    <td className="meta">
                      {t.origen}
                      {t.simulado ? " · simulado" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!fila.tamizajes.length ? <div className="vacio">Sin tamizajes todavía.</div> : null}
          </div>
        ) : null}

        {pestana === "hemogramas" ? (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>ANC</th>
                  <th>Leucocitos</th>
                  <th>Fracción N</th>
                  <th>Hb</th>
                  <th>Plaquetas</th>
                  <th>Laboratorio</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...fila.hemogramas].reverse().map((h) => (
                  <tr key={h.id}>
                    <td>{FECHA_HORA.format(new Date(h.fecha))}</td>
                    <td className="num">{NUM.format(h.anc)}</td>
                    <td className="num">{h.leucocitos === null ? "—" : NUM.format(h.leucocitos)}</td>
                    <td className="num">{h.fraccionNeutrofilos === null ? "—" : h.fraccionNeutrofilos.toFixed(2)}</td>
                    <td className="num">{h.hemoglobina ?? "—"}</td>
                    <td className="num">{h.plaquetas === null ? "—" : NUM.format(h.plaquetas)}</td>
                    <td className="meta">{h.laboratorio}</td>
                    <td>
                      <button
                        type="button"
                        className="boton peligro-texto chico"
                        onClick={() =>
                          eliminarRegistro
                            .mutateAsync({ coleccion: "hemogramas", id: h.id })
                            .then(() => avisar("Hemograma eliminado.", "exito"))
                            .catch(avisarError)
                        }
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!fila.hemogramas.length ? <div className="vacio">Sin hemogramas. Registre el del próximo control para calibrar al paciente.</div> : null}
            <div className="botonera">
              <button type="button" className="boton chico" onClick={() => abrir("hemograma")}>
                ＋ Registrar hemograma
              </button>
            </div>
          </div>
        ) : null}

        {pestana === "citas" ? (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Lugar</th>
                  <th>Asistencia</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fila.citas.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {fechaLarga(c.fecha)}
                      {c.hora ? ` · ${c.hora}` : ""}
                    </td>
                    <td>{NOMBRE_TIPO_CITA[c.tipo]}</td>
                    <td className="meta">{c.lugar}</td>
                    <td>
                      <select
                        aria-label="Asistencia"
                        value={c.asistio === null ? "pendiente" : c.asistio ? "si" : "no"}
                        onChange={(e) =>
                          guardarCita
                            .mutateAsync({ ...c, asistio: e.target.value === "pendiente" ? null : e.target.value === "si" })
                            .catch(avisarError)
                        }
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="si">Asistió</option>
                        <option value="no">No asistió</option>
                      </select>
                    </td>
                    <td className="acciones-celda">
                      <button
                        type="button"
                        className="boton fantasma chico"
                        onClick={() => {
                          setCitaEditada(c);
                          abrir("cita");
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="boton peligro-texto chico"
                        onClick={() => eliminarRegistro.mutateAsync({ coleccion: "citas", id: c.id }).catch(avisarError)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!fila.citas.length ? <div className="vacio">Sin citas.</div> : null}
            <div className="botonera">
              <button
                type="button"
                className="boton chico"
                onClick={() => {
                  setCitaEditada(null);
                  abrir("cita");
                }}
              >
                ＋ Programar cita
              </button>
            </div>
          </div>
        ) : null}

        {pestana === "teleconsultas" ? (
          <div className="lista-casos">
            {fila.teleconsultas.map((t) => (
              <article key={t.id} className={`caso ${t.estado}`}>
                <header>
                  <span className={`insignia ${t.prioridad === "tiempo_real" ? "priorizable" : "grave"}`}>{t.prioridad === "tiempo_real" ? "Tiempo real · 15 min" : "Diferida · 6 h"}</span>
                  <span className="insignia neutra">{t.estado}</span>
                  <span className="meta">
                    {FECHA_HORA.format(new Date(t.creada))} · desde {t.origen}
                  </span>
                </header>
                <p>{t.pregunta}</p>
                {t.respuesta ? <p className="respuesta">↳ {t.respuesta}</p> : null}
                <div className="botonera">
                  {t.estado !== "cerrada" ? (
                    <button type="button" className="boton chico" onClick={() => setRespondiendo(t)}>
                      Responder
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {fila.referencias.map((r) => (
              <article key={r.id} className="caso referencia">
                <header>
                  <span className="insignia cian">Referencia · {NOMBRE_MOTIVO[r.motivo]}</span>
                  <span className="insignia neutra">{r.estado}</span>
                  <span className="meta">{FECHA_HORA.format(new Date(r.creada))}</span>
                </header>
                <p>
                  <b>{r.destinoNombre}</b> — {r.destinoCiudad}, {r.destinoDepartamento}. {r.horasEvitadas > 0 ? `Evita ${Math.round(r.horasEvitadas)} h de viaje.` : ""}
                </p>
                <ul className="motivos">
                  {r.advertencias.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
                <div className="botonera">
                  {r.estado === "emitida" ? (
                    <button
                      type="button"
                      className="boton fantasma chico"
                      onClick={() =>
                        eliminarRegistro.mutateAsync({ coleccion: "referencias", id: r.id }).catch(avisarError)
                      }
                    >
                      Anular
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {!fila.teleconsultas.length && !fila.referencias.length ? <div className="vacio">Sin teleconsultas ni referencias.</div> : null}
          </div>
        ) : null}

        {pestana === "michi" ? (
          <div className="dos-columnas">
            <div>
              <h3>Dispositivo</h3>
              <dl className="ficha-datos">
                <div>
                  <dt>Serie</dt>
                  <dd className="num">{p.serieMichi ?? "—"}</dd>
                </div>
                <div>
                  <dt>Código de vinculación</dt>
                  <dd className="num">
                    {p.codigoVinculacion ? (
                      <button type="button" className="enlace" onClick={() => setMostrarCodigo((v) => !v)}>
                        {mostrarCodigo ? p.codigoVinculacion : "•••• – •••• – •••• (mostrar)"}
                      </button>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Entregado</dt>
                  <dd>{p.entregadoEn ? hace(p.entregadoEn) : "—"}</dd>
                </div>
                <div>
                  <dt>Estado del enlace</dt>
                  <dd>{michi ? `${michi.salud.titulo}. ${michi.salud.conducta}` : "Sin michi activo"}</dd>
                </div>
              </dl>
              <h3>Últimos latidos</h3>
              <ul className="latidos">
                {(latidos.data ?? []).map((l) => (
                  <li key={l.id}>
                    <span>{FECHA_HORA.format(new Date(l.momento))}</span>
                    <span className="num">{l.bateriaPct === null ? "—" : `${l.bateriaPct}%`}</span>
                    <span className="meta">
                      {l.origen} · {l.alertasAtendidas}/{l.alertasEmitidas} alertas · {l.silenciamientos} silenc.
                    </span>
                  </li>
                ))}
                {!latidos.data?.length ? <li className="meta">Sin latidos registrados.</li> : null}
              </ul>
            </div>
            <div>
              <h3>Alertas de los próximos 7 días</h3>
              <ul className="alertas-programadas">
                {alertas.slice(0, 14).map((a) => (
                  <li key={a.id}>
                    <span className="num">{FECHA_HORA.format(a.programada)}</span>
                    <span className={`canal ${a.canal}`}>{a.canal === "juguete" ? "🐱 juguete" : "📱 app"}</span>
                    <span>{a.titulo}</span>
                  </li>
                ))}
                {!alertas.length ? <li className="meta">Sin alertas en la semana.</li> : null}
              </ul>
              <div className="nota">Las alertas del juguete solo suenan en la ventana audible. Llamada, SMS y correo del hospital salen igual: el michi complementa, no reemplaza.</div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="zona-peligro">
        <div>
          <b>Eliminar paciente</b>
          <p className="meta">Borra la ficha y todos sus registros clínicos, retira al participante del estudio y da de baja su michi. No se puede deshacer.</p>
        </div>
        <button type="button" className="boton peligro-texto" onClick={() => abrir("eliminar")}>
          Eliminar paciente
        </button>
      </section>

      {modal === "teleconsulta" ? <ModalTeleconsulta paciente={p} tamizaje={ultimo} estado={ev.estado} alCerrar={() => abrir(null)} /> : null}
      {modal === "referencia" ? <ModalReferencia paciente={p} estado={ev.estado} tamizaje={ultimo} alCerrar={() => abrir(null)} /> : null}
      {modal === "hemograma" ? <ModalHemograma paciente={p} alCerrar={() => abrir(null)} /> : null}
      {modal === "cita" ? <ModalCita paciente={p} cita={citaEditada ?? undefined} alCerrar={() => abrir(null)} /> : null}
      {modal === "tamizaje" ? <ModalTamizajeManual paciente={p} alCerrar={() => abrir(null)} /> : null}
      {modal === "eliminar" ? (
        <ModalConfirmar
          titulo="Eliminar paciente"
          texto={`Se eliminará a ${nombreCompleto(p)} (HC ${p.historiaClinica}) con todos sus registros.`}
          accion="Eliminar definitivamente"
          palabra={p.historiaClinica}
          alCerrar={() => abrir(null)}
          alConfirmar={async () => {
            await eliminarPaciente.mutateAsync(p.id);
            avisar("Paciente eliminado.", "exito");
            navegar("/insn");
          }}
        />
      ) : null}
      {respondiendo ? <ModalResponder teleconsulta={respondiendo} alCerrar={() => setRespondiendo(null)} /> : null}
    </div>
  );
}
