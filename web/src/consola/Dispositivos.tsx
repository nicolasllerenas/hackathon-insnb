import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Michi } from "@compartido/contratos/dispositivos";
import { hace } from "@compartido/dominio/fechas";
import { useAvisos } from "../componentes/Avisos";
import { Campo } from "../componentes/Campo";
import { Cargando, PanelError } from "../componentes/Estados";
import { InsigniaEnlace } from "../componentes/Insignia";
import { useAccion, useParque } from "../datos/consultas";
import { robot } from "../robot/conexion";
import { aEntradaLatido, DESCRIPCION_ORDEN, ORDENES, type Orden } from "../robot/protocolo";
import { useAlLatido, useRobot } from "../robot/useRobot";
import { nombreCompleto, usePanel } from "./panel";

function LineaDeLatido({ enlace }: { enlace: "en_linea" | "intermitente" | "sin_contacto" }) {
  const camino =
    enlace === "sin_contacto"
      ? "M0 14 H120"
      : enlace === "intermitente"
        ? "M0 14 H30 L34 8 L38 20 L42 14 H120"
        : "M0 14 H18 L22 4 L27 24 L31 14 H58 L62 4 L67 24 L71 14 H98 L102 4 L107 24 L111 14 H120";
  return (
    <svg className={`linea-latido ${enlace}`} viewBox="0 0 120 28" aria-hidden="true">
      <path d={camino} />
    </svg>
  );
}

export function Dispositivos() {
  const parque = useParque();
  const panel = usePanel();
  const instante = useRobot();
  const { avisar, avisarError } = useAvisos();
  const [serie, setSerie] = useState("");
  const [registrados, setRegistrados] = useState(0);
  const serieRef = useRef(serie);
  const cambiarEstado = useAccion(["dispositivos"], (p, a: { serie: string; estado: Michi["estado"] }) => p.dispositivos.cambiarEstado(a.serie, a.estado));
  const registrarLatido = useAccion(["dispositivos"], (p, a: { serie: string; entrada: ReturnType<typeof aEntradaLatido> }) =>
    p.dispositivos.registrarLatidoClinico(a.serie, a.entrada),
  );

  useEffect(() => {
    serieRef.current = serie;
  }, [serie]);

  useAlLatido((latido) => {
    const destino = latido.serie ?? serieRef.current;
    if (!destino) return;
    registrarLatido
      .mutateAsync({ serie: destino, entrada: aEntradaLatido(latido, instante.simulado ? "simulador" : "robot") })
      .then(() => setRegistrados((n) => n + 1))
      .catch(avisarError);
  });

  if (parque.isLoading) return <Cargando />;
  if (parque.isError) return <PanelError error={parque.error} />;

  const michis = parque.data ?? [];
  const nombre = (pacienteId: string) => {
    const p = panel.pacientes.find((x) => x.id === pacienteId);
    return p ? nombreCompleto(p) : pacienteId;
  };
  const enviar = (o: Orden) => robot.enviar(o).catch((e: unknown) => avisarError(e));

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <div>
          <h1>Parque de michis</h1>
          <p>Cada michi manda un latido cada seis horas. Más de 72 horas de silencio es la señal de abandono más temprana del sistema: llega antes que la cita perdida.</p>
        </div>
      </div>

      <section className="panel" id="panelRobot">
        <h2>Conectar el robot gato</h2>
        <p className="descripcion">
          Conecte el michi (ESP32-CAM) por cable USB. El firmware envía su latido como una línea JSON a 115 200 baudios y acepta órdenes de una letra. Cada latido
          recibido se registra en el servicio de dispositivos para la serie elegida.
        </p>
        <div className="rejilla-campos">
          <Campo etiqueta="Registrar latidos para">
            {(id) => (
              <select id={id} value={serie} onChange={(e) => setSerie(e.target.value)}>
                <option value="">Elegir michi…</option>
                {michis
                  .filter((m) => m.michi.estado === "activo")
                  .map((m) => (
                    <option key={m.michi.serie} value={m.michi.serie}>
                      {m.michi.serie} · {nombre(m.michi.pacienteId)}
                    </option>
                  ))}
              </select>
            )}
          </Campo>
          <div className="estado-robot">
            <span className={`punto-robot ${instante.estado}`} aria-hidden="true" />
            <span>
              {instante.estado === "conectado"
                ? instante.simulado
                  ? "Simulador conectado"
                  : "Michi conectado por USB"
                : instante.estado === "conectando"
                  ? "Conectando…"
                  : instante.estado === "no_soportado"
                    ? "USB serial no disponible en este navegador"
                    : "Desconectado"}
            </span>
            <span className="meta">
              {instante.latidosRecibidos} latidos recibidos · {registrados} guardados
            </span>
          </div>
        </div>
        {instante.error ? <div className="franja alerta">{instante.error}</div> : null}
        {!serie && instante.estado === "conectado" ? (
          <div className="franja ambar">
            <span className="e">⚠️</span>
            <span>Elija la serie del michi conectado para que sus latidos se guarden.</span>
          </div>
        ) : null}
        <div className="botonera">
          {instante.estado === "conectado" ? (
            <>
              {(Object.values(ORDENES) as Orden[]).map((o) => (
                <button key={o} type="button" className="boton chico" title={DESCRIPCION_ORDEN[o]} onClick={() => void enviar(o)}>
                  {o === "T" ? "Pedir dedito (T)" : o === "C" ? "Recordar cita (C)" : o === "M" ? "Maullar (M)" : "Pedir latido (L)"}
                </button>
              ))}
              <button type="button" className="boton fantasma chico" onClick={() => void robot.desconectar()}>
                Desconectar
              </button>
            </>
          ) : (
            <>
              <button type="button" className="boton" disabled={instante.estado === "no_soportado" || instante.estado === "conectando"} onClick={() => void robot.conectar()}>
                Conectar por USB
              </button>
              <button
                type="button"
                className="boton fantasma"
                id="btnSimulador"
                onClick={() => {
                  robot.conectarSimulador();
                  avisar("Simulador conectado: emite un latido cada 8 segundos.", "info");
                }}
              >
                Usar simulador
              </button>
            </>
          )}
        </div>
        <div className="consola-serial" role="log" aria-label="Registro serial" aria-live="off">
          {instante.registro.length ? (
            instante.registro.slice(-14).map((l) => (
              <div key={l.id} className={`linea-serial ${l.tipo}`}>
                <span className="num">{new Date(l.momento).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>
                <span className="dir">{l.tipo === "entrada" ? "←" : l.tipo === "salida" ? "→" : "·"}</span>
                <span className="txt">{l.texto}</span>
              </div>
            ))
          ) : (
            <div className="linea-serial sistema">
              <span className="txt">Sin actividad. Requiere Chrome o Edge de escritorio para USB; el simulador funciona en cualquier navegador.</span>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Estado de cada michi</h2>
        <div className="tabla-envoltura">
          <table className="tabla" id="tablaParque">
            <thead>
              <tr>
                <th>Michi</th>
                <th>Paciente</th>
                <th>Enlace</th>
                <th>Último latido</th>
                <th>Batería</th>
                <th>Alertas</th>
                <th>Silenc.</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {michis.map(({ michi: m, salud }) => (
                <tr key={m.serie} className={salud.urgente ? "fila-urgente" : ""}>
                  <td>
                    <b>{m.nombre}</b>
                    <div className="meta num">
                      {m.serie} · fw {m.firmware || "—"}
                    </div>
                  </td>
                  <td>
                    <Link to={`/insn/pacientes/${encodeURIComponent(m.pacienteId)}`}>{nombre(m.pacienteId)}</Link>
                  </td>
                  <td>
                    <div className="celda-enlace">
                      <LineaDeLatido enlace={salud.enlace} />
                      <InsigniaEnlace enlace={salud.enlace} />
                    </div>
                  </td>
                  <td>{m.ultimoLatido ? hace(m.ultimoLatido.momento) : "nunca"}</td>
                  <td className={`num ${(salud.bateriaPct ?? 100) <= 25 ? "bajo" : ""}`}>{salud.bateriaPct === null ? "—" : `${Math.round(salud.bateriaPct)}%`}</td>
                  <td className="num">{salud.tasaDeAtencion === null ? "—" : `${Math.round(salud.tasaDeAtencion * 100)}%`}</td>
                  <td className="num">{m.ultimoLatido?.silenciamientos ?? 0}</td>
                  <td>
                    <select
                      aria-label={`Estado del michi ${m.serie}`}
                      value={m.estado}
                      onChange={(e) =>
                        cambiarEstado
                          .mutateAsync({ serie: m.serie, estado: e.target.value as Michi["estado"] })
                          .then(() => avisar(`Michi ${m.serie}: ${e.target.value}.`, "exito"))
                          .catch(avisarError)
                      }
                    >
                      <option value="activo">Activo</option>
                      <option value="devuelto">Devuelto</option>
                      <option value="extraviado">Extraviado</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!michis.length ? <div className="vacio">No hay michis registrados.</div> : null}
        <div className="nota">
          «Sin contacto» no es una falla técnica que reportar al fabricante: es un paciente que hay que llamar hoy. El michi no graba audio ni rastrea ubicación; solo
          transmite su propio estado y los tamizajes que el niño decide hacer.
        </div>
      </section>
    </div>
  );
}
