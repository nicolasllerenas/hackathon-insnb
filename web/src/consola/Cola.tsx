import { useEffect, useState } from "react";
import { Link } from "react-router";
import { hace } from "@compartido/dominio/fechas";
import { PERFILES } from "@compartido/dominio/tratamiento";
import { Cargando, PanelError } from "../componentes/Estados";
import { InsigniaEstado } from "../componentes/Insignia";
import { nombreCompleto, usePanel, type FilaPaciente } from "./panel";

const PLAZO_MS = { grave: 6 * 3_600_000, priorizable: 15 * 60_000 } as const;

function duracion(ms: number): string {
  const minutos = Math.round(Math.abs(ms) / 60_000);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 48) return `${horas} h ${minutos % 60} min`;
  return `${Math.floor(horas / 24)} días`;
}

function vencimiento(f: FilaPaciente, ahora: number): { texto: string; vencido: boolean } {
  const estado = f.evaluacion.estado;
  if (f.evaluacion.escaladoPorSilencio && f.ultimo?.estado !== "grave" && f.ultimo?.estado !== "priorizable") {
    return { texto: "Llamar hoy", vencido: false };
  }
  if (estado === "estable" || !f.ultimo) return { texto: "—", vencido: false };
  const limite = Date.parse(f.ultimo.momento) + PLAZO_MS[estado];
  const resta = limite - ahora;
  return resta >= 0 ? { texto: `vence en ${duracion(resta)}`, vencido: false } : { texto: `vencido hace ${duracion(resta)}`, vencido: true };
}

function origen(f: FilaPaciente): string {
  const partes: string[] = [];
  if (f.ultimo && f.ultimo.estado !== "estable") {
    partes.push(f.ultimo.temperaturaC !== null && f.ultimo.escaladoPorFiebre ? `Tamizaje + fiebre ${f.ultimo.temperaturaC.toFixed(1)} °C` : "Tamizaje");
  }
  if (f.michi?.salud.enlace === "sin_contacto") partes.push("Michi sin comunicación");
  if ((f.michi?.michi.ultimoLatido?.silenciamientos ?? 0) >= 3) partes.push("Silenciamientos repetidos");
  if (f.teleconsultas.some((t) => t.estado === "abierta")) partes.push("Teleconsulta abierta");
  return partes.join(" · ") || "Seguimiento";
}

export function Cola() {
  const panel = usePanel();
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  if (panel.cargando) return <Cargando />;
  if (panel.error) return <PanelError error={panel.error} />;

  const cola = panel.filas.filter(
    (f) =>
      f.evaluacion.estado !== "estable" ||
      f.michi?.salud.urgente ||
      f.teleconsultas.some((t) => t.estado === "abierta"),
  );

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <div>
          <h1>Cola de atención</h1>
          <p>Lo clínico y lo del juguete en la misma cola. El plazo corre desde el tamizaje: 15 minutos si es priorizable, 6 horas si es grave.</p>
        </div>
      </div>
      <div className="panel">
        <div className="tabla-envoltura">
          <table className="tabla" id="tablaCola">
            <thead>
              <tr>
                <th scope="col">Paciente</th>
                <th scope="col">Estado</th>
                <th scope="col">Origen</th>
                <th scope="col">Conducta</th>
                <th scope="col">Plazo</th>
                <th scope="col">
                  <span className="visualmente-oculto">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cola.length ? (
                cola.map((f) => {
                  const v = vencimiento(f, ahora);
                  return (
                    <tr key={f.paciente.id}>
                      <td>
                        <b>{nombreCompleto(f.paciente)}</b>
                        <div className="meta">
                          {f.paciente.domicilio.provincia}, {f.paciente.domicilio.departamento} · {PERFILES[f.paciente.etapa].nombre}
                        </div>
                      </td>
                      <td>
                        <InsigniaEstado estado={f.evaluacion.estado} />
                      </td>
                      <td className="meta-celda">
                        {origen(f)}
                        {f.ultimo ? <div className="meta">tamizaje {hace(f.ultimo.momento)}</div> : null}
                      </td>
                      <td className="conducta-celda">{f.evaluacion.paraElEquipo}</td>
                      <td className={`num ${v.vencido ? "vencido" : ""}`}>{v.texto}</td>
                      <td>
                        <Link className="boton chico" to={`/insn/pacientes/${encodeURIComponent(f.paciente.id)}`}>
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="vacio">
                    Nada pendiente. Todos los niños en seguimiento están estables y sus michis se comunican.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="nota">
          <b>Por qué el estado del juguete está en la misma cola.</b> Un michi que lleva tres días sin comunicarse es la señal de abandono más temprana que
          existe: llega antes que la cita perdida. Hoy el sistema se entera cuando el niño ya faltó; aquí se entera cuando el juguete se calló.
        </div>
      </div>
    </div>
  );
}
