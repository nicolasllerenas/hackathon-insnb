import { useMemo, useState, type FormEvent } from "react";
import { validar } from "@compartido/contratos/comunes";
import { FOTOTIPOS, PARENTESCOS } from "@compartido/contratos/clinica";
import { Participante } from "@compartido/contratos/investigacion";
import { diasEntre, edadEnAnios, fechaLocalISO } from "@compartido/dominio/fechas";
import {
  aCsv,
  emparejar,
  metricasDiagnosticas,
  NIVELES_TRL,
  tamanoDeMuestra,
  type Par,
  type Proporcion,
} from "@compartido/dominio/investigacion";
import { ErrorMichi, mensajeDeError } from "@compartido/errores";
import { useAvisos } from "../componentes/Avisos";
import { Campo } from "../componentes/Campo";
import { Cargando, PanelError } from "../componentes/Estados";
import { DispersionValidacion } from "../componentes/Graficos";
import { Modal } from "../componentes/Modal";
import { guardarLocal, leerLocal } from "../datos/configuracion";
import { useAccion, useParticipantes } from "../datos/consultas";
import { useDatos } from "../datos/contexto";
import { nombreCompleto, usePanel } from "./panel";

const PASOS_RUTA = [
  { id: "reunion", texto: "Reunión inicial con el equipo de asistencia y seguimiento (Innolab Salud)" },
  { id: "asesor", texto: "Asignación de asesora o asesor del INSNSB" },
  { id: "pi", texto: "Redacción del Proyecto de Investigación según el Anexo 02" },
  { id: "consentimiento", texto: "Formato de consentimiento informado y asentimiento (≥ 8 años)" },
  { id: "jefe", texto: "Conformidad del jefe de servicio (Hematología / Oncología)" },
  { id: "etica", texto: "Curso de ética en investigación de todo el equipo" },
  { id: "autorizacion", texto: "Solicitud de autorización y envío al comité de ética" },
  { id: "presentacion", texto: "Presentación del PI con el investigador principal del instituto" },
  { id: "visita", texto: "Visita presencial al INSNSB para articulación" },
  { id: "aprobacion", texto: "Aprobación del PI y cronograma de ejecución" },
] as const;

const DICCIONARIO: { variable: string; tipo: string; definicion: string; unidad: string; fuente: string }[] = [
  { variable: "codigo_estudio", tipo: "Identificador", definicion: "Código seudonimizado del participante (MCK-E-###)", unidad: "—", fuente: "Registro del estudio" },
  { variable: "edad_anios", tipo: "Cuantitativa continua", definicion: "Edad al momento del tamizaje", unidad: "años", fuente: "Ficha clínica" },
  { variable: "sexo", tipo: "Cualitativa nominal", definicion: "Sexo registrado", unidad: "F / M", fuente: "Ficha clínica" },
  { variable: "fototipo", tipo: "Cualitativa ordinal", definicion: "Fototipo de Fitzpatrick verificado al incluir", unidad: "I–VI", fuente: "Registro del estudio" },
  { variable: "etapa", tipo: "Cualitativa ordinal", definicion: "Etapa del tratamiento de LLA", unidad: "—", fuente: "Ficha clínica" },
  { variable: "anc_tamizaje", tipo: "Cuantitativa continua (índice)", definicion: "Recuento absoluto de neutrófilos estimado por capilaroscopia óptica", unidad: "/µL", fuente: "Michi" },
  { variable: "ic95_inferior / ic95_superior", tipo: "Cuantitativa continua", definicion: "Intervalo de 95 % del tamizaje, incluye la incertidumbre del método", unidad: "/µL", fuente: "Michi" },
  { variable: "prueba_positiva", tipo: "Dicotómica (índice)", definicion: "Límite inferior del IC95 < 500/µL", unidad: "sí / no", fuente: "Regla de decisión" },
  { variable: "anc_hemograma", tipo: "Cuantitativa continua (referencia)", definicion: "ANC del hemograma automatizado pareado", unidad: "/µL", fuente: "Laboratorio INSNSB" },
  { variable: "neutropenia_grave", tipo: "Dicotómica (referencia)", definicion: "ANC del hemograma < 500/µL", unidad: "sí / no", fuente: "Laboratorio INSNSB" },
  { variable: "horas_entre_mediciones", tipo: "Cuantitativa continua", definicion: "Diferencia absoluta entre tamizaje y hemograma (máximo de la ventana)", unidad: "h", fuente: "Calculada" },
  { variable: "capilares / eventos", tipo: "Cuantitativa discreta", definicion: "Capilares válidos y huecos ópticos contados", unidad: "n", fuente: "Michi" },
  { variable: "temperatura", tipo: "Cuantitativa continua", definicion: "Temperatura axilar declarada al momento del tamizaje", unidad: "°C", fuente: "Familia / personal" },
];

const PCT = (p: Proporcion) => (p.valor === null ? "—" : `${(p.valor * 100).toFixed(1)} %`);
const IC = (p: Proporcion) => (p.inferior === null || p.superior === null ? "" : `IC95 ${(p.inferior * 100).toFixed(1)}–${(p.superior * 100).toFixed(1)} %`);

function descargar(nombre: string, texto: string): void {
  const url = URL.createObjectURL(new Blob([`\uFEFF${texto}`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Investigacion() {
  const panel = usePanel();
  const participantes = useParticipantes();
  const { plataforma } = useDatos();
  const { avisar, avisarError } = useAvisos();
  const [ruta, setRuta] = useState<Record<string, boolean>>(() => leerLocal("michicheck.ruta-insnsb", { reunion: true }));
  const [ventana, setVentana] = useState(24);
  const [soloConsentidos, setSoloConsentidos] = useState(true);
  const [muestra, setMuestra] = useState({ sens: "0.90", esp: "0.80", precision: "0.10", prevalencia: "0.30", perdidas: "0.10" });
  const [editando, setEditando] = useState<Participante | "nuevo" | null>(null);
  const eliminar = useAccion(["investigacion"], (p, id: string) => p.investigacion.eliminarParticipante(id));

  const marcar = (id: string, valor: boolean) => {
    const nuevo = { ...ruta, [id]: valor };
    setRuta(nuevo);
    guardarLocal("michicheck.ruta-insnsb", nuevo);
  };

  const lista = useMemo(() => participantes.data ?? [], [participantes.data]);
  const pares: Par[] = useMemo(() => {
    const activos = new Set(lista.filter((x) => x.estado !== "retirado").map((x) => x.pacienteId));
    const permitido = (pacienteId: string) => !soloConsentidos || activos.has(pacienteId);
    return emparejar(
      panel.tamizajes.filter((t) => permitido(t.pacienteId)),
      panel.hemogramas.filter((h) => permitido(h.pacienteId)),
      ventana,
    );
  }, [panel.tamizajes, panel.hemogramas, lista, soloConsentidos, ventana]);
  const m = useMemo(() => metricasDiagnosticas(pares), [pares]);

  const porFototipo = useMemo(() => {
    const grupos = new Map<string, Par[]>();
    for (const par of pares) {
      const p = panel.pacientes.find((x) => x.id === par.tamizaje.pacienteId);
      const fototipo = lista.find((x) => x.pacienteId === par.tamizaje.pacienteId)?.fototipoVerificado ?? p?.fototipo ?? "?";
      grupos.set(fototipo, [...(grupos.get(fototipo) ?? []), par]);
    }
    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([f, ps]) => ({ fototipo: f, m: metricasDiagnosticas(ps) }));
  }, [pares, panel.pacientes, lista]);

  const calculo = useMemo(() => {
    try {
      return tamanoDeMuestra({
        sensibilidadEsperada: Number(muestra.sens),
        especificidadEsperada: Number(muestra.esp),
        precision: Number(muestra.precision),
        prevalencia: Number(muestra.prevalencia),
        perdidas: Number(muestra.perdidas),
      });
    } catch (e) {
      return mensajeDeError(e);
    }
  }, [muestra]);

  if (panel.cargando || participantes.isLoading) return <Cargando />;
  if (panel.error) return <PanelError error={panel.error} />;
  if (participantes.isError) return <PanelError error={participantes.error} />;

  const exportarDatos = () => {
    const filas = pares.map((par) => {
      const p = panel.pacientes.find((x) => x.id === par.tamizaje.pacienteId);
      const part = lista.find((x) => x.pacienteId === par.tamizaje.pacienteId);
      const t = panel.tamizajes.find((x) => x.id === par.tamizaje.id);
      return {
        codigo_estudio: part?.codigoEstudio ?? "sin_consentimiento",
        edad_anios: p ? Math.round(edadEnAnios(p.fechaNacimiento, new Date(par.tamizaje.momento)) * 10) / 10 : null,
        sexo: p?.sexo ?? null,
        fototipo: part?.fototipoVerificado ?? p?.fototipo ?? null,
        etapa: p?.etapa ?? null,
        dias_desde_inclusion: part ? diasEntre(part.fechaInclusion, fechaLocalISO(new Date(par.tamizaje.momento))) : null,
        anc_tamizaje: par.tamizaje.ancEstimado,
        ic95_inferior: par.tamizaje.icInferior,
        ic95_superior: par.tamizaje.icSuperior,
        concluyente: par.tamizaje.concluyente,
        prueba_positiva: par.tamizaje.concluyente && par.tamizaje.ancEstimado !== null ? (par.tamizaje.icInferior ?? par.tamizaje.ancEstimado) < 500 : null,
        anc_hemograma: par.hemograma.anc,
        neutropenia_grave: par.hemograma.anc < 500,
        horas_entre_mediciones: par.horasDeDiferencia,
        capilares: t?.capilares ?? null,
        eventos: t?.eventos ?? null,
        temperatura: t?.temperaturaC ?? null,
        dato_simulado: t?.simulado ?? null,
      };
    });
    if (!filas.length) {
      avisar("No hay pares tamizaje–hemograma para exportar.", "info");
      return;
    }
    descargar(`michicheck_validacion_${fechaLocalISO()}.csv`, aCsv(filas));
    avisar(`Exportados ${filas.length} pares sin nombres, historias clínicas ni fechas de nacimiento.`, "exito");
  };

  const sinIncluir = panel.pacientes.filter((p) => !lista.some((x) => x.pacienteId === p.id));
  const completados = PASOS_RUTA.filter((p) => ruta[p.id]).length;

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <div>
          <h1>Investigación y validación</h1>
          <p>
            Lo que pide el Proyecto de Investigación del INSNSB (Anexo N.º 02) sale de aquí: participantes con consentimiento, pares tamizaje–hemograma, desempeño
            diagnóstico con intervalos, tamaño de muestra y el conjunto de datos anonimizado.
          </p>
        </div>
      </div>

      <div className="dos-columnas">
        <section className="panel">
          <h2>Ruta del proyecto en el INSNSB</h2>
          <p className="meta">
            {completados} de {PASOS_RUTA.length} pasos · plazo sugerido: 1 mes para registrar el proyecto desde el inicio de la mentoría. Esta lista se guarda solo en
            este navegador.
          </p>
          <div className="progreso" aria-hidden="true">
            <i style={{ width: `${(completados / PASOS_RUTA.length) * 100}%` }} />
          </div>
          <ul className="lista-ruta">
            {PASOS_RUTA.map((p) => (
              <li key={p.id}>
                <label className="casilla">
                  <input type="checkbox" checked={Boolean(ruta[p.id])} onChange={(e) => marcar(p.id, e.target.checked)} />
                  <span>{p.texto}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2>Nivel de madurez tecnológica</h2>
          <div className="trl" role="img" aria-label="TRL actual 4 de 9; meta 6 al terminar el piloto">
            {NIVELES_TRL.map((n) => (
              <div key={n.nivel} className={`trl-paso${n.nivel <= 4 ? " logrado" : n.nivel <= 6 ? " meta" : ""}`} title={n.nombre}>
                <b>{n.nivel}</b>
              </div>
            ))}
          </div>
          <p>
            <b>TRL 4 — validación en laboratorio.</b> Prototipo funcional del robot (ESP32-CAM, óptica a 70°, LED 530 nm, bocina), pipeline de visión validado con
            vídeos públicos y cohorte simulada, software clínico completo con tres estados, referencias e interoperabilidad.
          </p>
          <p>
            <b>Meta: TRL 6</b> al cerrar el estudio de validación con pacientes del INSNSB (vídeo + hemograma pareado).
          </p>
          <p className="meta">Tecnologías involucradas: Robótica · Inteligencia artificial · Impresión 3D.</p>
        </section>
      </div>

      <section className="panel">
        <div className="titulo-seccion">
          <h2>Participantes del estudio</h2>
          <button type="button" className="boton chico" disabled={!sinIncluir.length} onClick={() => setEditando("nuevo")}>
            ＋ Incluir participante
          </button>
        </div>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Paciente</th>
                <th>Inclusión</th>
                <th>Consentimiento</th>
                <th>Asentimiento</th>
                <th>Fototipo</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((x) => {
                const p = panel.pacientes.find((y) => y.id === x.pacienteId);
                return (
                  <tr key={x.id}>
                    <td className="num">{x.codigoEstudio}</td>
                    <td>{p ? nombreCompleto(p) : x.pacienteId}</td>
                    <td>{x.fechaInclusion}</td>
                    <td className="meta">
                      {x.consentimiento.fecha} · {x.consentimiento.version} · {x.consentimiento.otorgadoPor} ({x.consentimiento.parentesco})
                    </td>
                    <td>{x.asentimiento.aplica ? (x.asentimiento.otorgado ? `sí · ${x.asentimiento.fecha}` : "pendiente") : "no aplica"}</td>
                    <td>{x.fototipoVerificado}</td>
                    <td>
                      <span className={`insignia ${x.estado === "activo" ? "estable" : x.estado === "retirado" ? "priorizable" : "neutra"}`}>{x.estado}</span>
                    </td>
                    <td className="acciones-celda">
                      <button type="button" className="boton fantasma chico" onClick={() => setEditando(x)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="boton peligro-texto chico"
                        onClick={() =>
                          eliminar
                            .mutateAsync(x.id)
                            .then(() => avisar("Participante eliminado del registro del estudio.", "exito"))
                            .catch(avisarError)
                        }
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!lista.length ? <div className="vacio">Aún no hay participantes con consentimiento.</div> : null}
      </section>

      <section className="panel" id="panelDesempeno">
        <div className="titulo-seccion">
          <h2>Desempeño diagnóstico frente al hemograma</h2>
          <div className="controles-linea">
            <label className="casilla">
              <input type="checkbox" checked={soloConsentidos} onChange={(e) => setSoloConsentidos(e.target.checked)} />
              <span>Solo participantes con consentimiento</span>
            </label>
            <label className="campo-linea">
              <span>Ventana</span>
              <select value={ventana} onChange={(e) => setVentana(Number(e.target.value))}>
                <option value={6}>6 h</option>
                <option value={12}>12 h</option>
                <option value={24}>24 h</option>
                <option value={48}>48 h</option>
              </select>
            </label>
          </div>
        </div>
        <p className="meta">
          Prueba índice: límite inferior del IC95 del michi &lt; 500/µL. Referencia: ANC del hemograma &lt; 500/µL. {m.pares} pares
          {m.excluidosNoConcluyentes ? `, ${m.excluidosNoConcluyentes} no concluyentes excluidos y reportados aparte` : ""}.
        </p>
        <div className="dos-columnas">
          <div>
            <div className="kpis compactos">
              <div className="kpi">
                <span className="k">Sensibilidad</span>
                <span className="v">{PCT(m.sensibilidad)}</span>
                <span className="d">{IC(m.sensibilidad)}</span>
              </div>
              <div className="kpi">
                <span className="k">Especificidad</span>
                <span className="v">{PCT(m.especificidad)}</span>
                <span className="d">{IC(m.especificidad)}</span>
              </div>
              <div className="kpi">
                <span className="k">VPN</span>
                <span className="v">{PCT(m.vpn)}</span>
                <span className="d">{IC(m.vpn)}</span>
              </div>
              <div className="kpi">
                <span className="k">VPP</span>
                <span className="v">{PCT(m.vpp)}</span>
                <span className="d">{IC(m.vpp)}</span>
              </div>
              <div className="kpi">
                <span className="k">AUC · F1</span>
                <span className="v">{m.auc === null ? "—" : m.auc.toFixed(2)}</span>
                <span className="d">F1 {m.f1 === null ? "—" : m.f1.toFixed(2)}</span>
              </div>
              <div className="kpi">
                <span className="k">Sesgo (michi/hemograma)</span>
                <span className="v">{m.sesgoRelativo === null ? "—" : `×${m.sesgoRelativo.toFixed(2)}`}</span>
                <span className="d">{m.limitesDeAcuerdo ? `acuerdo ×${m.limitesDeAcuerdo[0].toFixed(2)}–×${m.limitesDeAcuerdo[1].toFixed(2)}` : ""}</span>
              </div>
            </div>
            <div className="tabla-envoltura">
            <table className="tabla matriz" aria-label="Matriz de confusión">
              <thead>
                <tr>
                  <th />
                  <th>Hemograma &lt; 500</th>
                  <th>Hemograma ≥ 500</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Michi positivo</th>
                  <td className="num">VP {m.vp}</td>
                  <td className="num">FP {m.fp}</td>
                </tr>
                <tr>
                  <th>Michi negativo</th>
                  <td className="num">FN {m.fn}</td>
                  <td className="num">VN {m.vn}</td>
                </tr>
              </tbody>
            </table>
            </div>
            <p className="meta">
              Cobertura del IC95 del michi: {PCT(m.coberturaDelIntervalo)} de los hemogramas caen dentro del intervalo declarado. Un falso negativo es el error que
              importa: por eso la fiebre escala aunque el michi diga «estable».
            </p>
          </div>
          <DispersionValidacion
            puntos={pares
              .filter((p) => p.tamizaje.ancEstimado !== null)
              .map((p) => ({
                id: p.tamizaje.id,
                x: p.hemograma.anc,
                y: p.tamizaje.ancEstimado as number,
                etiqueta: `Hemograma ${p.hemograma.anc}/µL · michi ${p.tamizaje.ancEstimado}/µL · ${p.horasDeDiferencia} h de diferencia`,
              }))}
          />
        </div>
        <h3>Por fototipo</h3>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fototipo</th>
                <th>Pares</th>
                <th>Sensibilidad</th>
                <th>Especificidad</th>
                <th>Sesgo</th>
              </tr>
            </thead>
            <tbody>
              {porFototipo.map(({ fototipo, m: x }) => (
                <tr key={fototipo}>
                  <td>{fototipo}</td>
                  <td className="num">{x.pares}</td>
                  <td className="num">{PCT(x.sensibilidad)}</td>
                  <td className="num">{PCT(x.especificidad)}</td>
                  <td className="num">{x.sesgoRelativo === null ? "—" : `×${x.sesgoRelativo.toFixed(2)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="nota">
          La melanina absorbe más a longitudes de onda cortas: el análisis por fototipo es obligatorio para no trasladar el sesgo a los niños de piel más oscura, que
          son también los que viven más lejos. Los datos de demostración son simulados: estas cifras ilustran el cálculo, no el desempeño real.
        </div>
      </section>

      <div className="dos-columnas">
        <section className="panel">
          <h2>Tamaño de muestra</h2>
          <p className="meta">Fórmula de Buderer para estimar sensibilidad y especificidad con la precisión deseada (IC95).</p>
          <div className="rejilla-campos">
            {(
              [
                ["sens", "Sensibilidad esperada"],
                ["esp", "Especificidad esperada"],
                ["precision", "Precisión (semiamplitud)"],
                ["prevalencia", "Prevalencia de ANC < 500"],
                ["perdidas", "Pérdidas esperadas"],
              ] as const
            ).map(([clave, etiqueta]) => (
              <Campo key={clave} etiqueta={etiqueta}>
                {(id) => <input id={id} inputMode="decimal" value={muestra[clave]} onChange={(e) => setMuestra({ ...muestra, [clave]: e.target.value })} />}
              </Campo>
            ))}
          </div>
          {typeof calculo === "string" ? (
            <div className="franja alerta">{calculo}</div>
          ) : (
            <div className="franja ok" id="resultadoMuestra">
              <span className="e">∑</span>
              <span>
                Se necesitan <b>{calculo.positivosNecesarios}</b> pares con neutropenia grave y <b>{calculo.negativosNecesarios}</b> sin ella: un total de{" "}
                <b>{calculo.total}</b> pares tamizaje–hemograma, o <b>{calculo.totalConPerdidas}</b> considerando pérdidas. Cada niño aporta varios pares a lo largo
                del mantenimiento; el análisis debe ajustar por medidas repetidas.
              </span>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>Conjunto de datos anonimizado</h2>
          <p className="descripcion">
            Un CSV por par tamizaje–hemograma, sin nombres, historias clínicas, celulares ni fechas de nacimiento. Los pacientes sin consentimiento aparecen como
            «sin_consentimiento» y quedan fuera si el filtro está activo.
          </p>
          <div className="botonera">
            <button type="button" className="boton" onClick={exportarDatos}>
              Exportar pares (CSV)
            </button>
            <button type="button" className="boton fantasma" onClick={() => descargar("michicheck_diccionario_variables.csv", aCsv(DICCIONARIO))}>
              Diccionario de variables
            </button>
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>Variables y definición operacional</h2>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Tipo</th>
                <th>Definición operacional</th>
                <th>Unidad</th>
                <th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {DICCIONARIO.map((d) => (
                <tr key={d.variable}>
                  <td className="num">{d.variable}</td>
                  <td>{d.tipo}</td>
                  <td>{d.definicion}</td>
                  <td>{d.unidad}</td>
                  <td className="meta">{d.fuente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editando ? (
        <ModalParticipante
          participante={editando === "nuevo" ? null : editando}
          candidatos={editando === "nuevo" ? sinIncluir : panel.pacientes}
          siguienteCodigo={() => plataforma.investigacion.siguienteCodigo()}
          alCerrar={() => setEditando(null)}
        />
      ) : null}
    </div>
  );
}

function ModalParticipante({
  participante,
  candidatos,
  siguienteCodigo,
  alCerrar,
}: {
  participante: Participante | null;
  candidatos: { id: string; nombres: string; apellidos: string; fototipo: Participante["fototipoVerificado"]; fechaNacimiento: string; apoderado: { nombre: string; parentesco: Participante["consentimiento"]["parentesco"] } }[];
  siguienteCodigo: () => Promise<string>;
  alCerrar: () => void;
}) {
  const { avisar, avisarError } = useAvisos();
  const hoy = fechaLocalISO();
  const primero = candidatos[0];
  const [f, setF] = useState({
    pacienteId: participante?.pacienteId ?? primero?.id ?? "",
    fechaInclusion: participante?.fechaInclusion ?? hoy,
    fechaConsentimiento: participante?.consentimiento.fecha ?? hoy,
    version: participante?.consentimiento.version ?? "v1.0",
    otorgadoPor: participante?.consentimiento.otorgadoPor ?? primero?.apoderado.nombre ?? "",
    parentesco: participante?.consentimiento.parentesco ?? primero?.apoderado.parentesco ?? "madre",
    asentimientoOtorgado: participante?.asentimiento.otorgado ?? true,
    fechaAsentimiento: participante?.asentimiento.fecha ?? hoy,
    fototipo: participante?.fototipoVerificado ?? primero?.fototipo ?? "IV",
    estado: participante?.estado ?? "activo",
    fechaRetiro: participante?.fechaRetiro ?? hoy,
    motivoRetiro: participante?.motivoRetiro ?? "",
    observaciones: participante?.observaciones ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const guardar = useAccion(["investigacion"], (p, x: Participante) => p.investigacion.guardarParticipante(x));
  const paciente = candidatos.find((c) => c.id === f.pacienteId);
  const aplicaAsentimiento = paciente ? edadEnAnios(paciente.fechaNacimiento) >= 8 : false;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const codigo = participante?.codigoEstudio ?? (await siguienteCodigo());
      const datos = validar(
        Participante,
        {
          id: participante?.id ?? `par-${globalThis.crypto.randomUUID()}`,
          codigoEstudio: codigo,
          pacienteId: f.pacienteId,
          fechaInclusion: f.fechaInclusion,
          consentimiento: { fecha: f.fechaConsentimiento, version: f.version, otorgadoPor: f.otorgadoPor, parentesco: f.parentesco },
          asentimiento: { aplica: aplicaAsentimiento, otorgado: aplicaAsentimiento && f.asentimientoOtorgado, fecha: aplicaAsentimiento && f.asentimientoOtorgado ? f.fechaAsentimiento : null },
          fototipoVerificado: f.fototipo,
          estado: f.estado,
          fechaRetiro: f.estado === "retirado" ? f.fechaRetiro : null,
          motivoRetiro: f.estado === "retirado" ? f.motivoRetiro : "",
          observaciones: f.observaciones,
        },
        "Participante",
      );
      await guardar.mutateAsync(datos);
      avisar(`Participante ${datos.codigoEstudio} guardado.`, "exito");
      alCerrar();
    } catch (err) {
      setError(err instanceof ErrorMichi ? mensajeDeError(err) : String(err));
      avisarError(err);
    }
  };

  return (
    <Modal titulo={participante ? `Participante ${participante.codigoEstudio}` : "Incluir participante"} alCerrar={alCerrar}>
      <form className="formulario" onSubmit={enviar}>
        <div className="rejilla-campos">
          <Campo etiqueta="Paciente">
            {(id) => (
              <select
                id={id}
                value={f.pacienteId}
                disabled={Boolean(participante)}
                onChange={(e) => {
                  const c = candidatos.find((x) => x.id === e.target.value);
                  setF({ ...f, pacienteId: e.target.value, otorgadoPor: c?.apoderado.nombre ?? f.otorgadoPor, parentesco: c?.apoderado.parentesco ?? f.parentesco, fototipo: c?.fototipo ?? f.fototipo });
                }}
              >
                {candidatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombres} {c.apellidos}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Fecha de inclusión">{(id) => <input id={id} type="date" value={f.fechaInclusion} onChange={(e) => setF({ ...f, fechaInclusion: e.target.value })} />}</Campo>
          <Campo etiqueta="Fecha del consentimiento">{(id) => <input id={id} type="date" value={f.fechaConsentimiento} onChange={(e) => setF({ ...f, fechaConsentimiento: e.target.value })} />}</Campo>
          <Campo etiqueta="Versión del formato">{(id) => <input id={id} value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} />}</Campo>
          <Campo etiqueta="Otorgado por">{(id) => <input id={id} value={f.otorgadoPor} onChange={(e) => setF({ ...f, otorgadoPor: e.target.value })} />}</Campo>
          <Campo etiqueta="Parentesco">
            {(id) => (
              <select id={id} value={f.parentesco} onChange={(e) => setF({ ...f, parentesco: e.target.value as typeof f.parentesco })}>
                {PARENTESCOS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Fototipo verificado">
            {(id) => (
              <select id={id} value={f.fototipo} onChange={(e) => setF({ ...f, fototipo: e.target.value as typeof f.fototipo })}>
                {FOTOTIPOS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Estado en el estudio">
            {(id) => (
              <select id={id} value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as typeof f.estado })}>
                <option value="activo">Activo</option>
                <option value="completado">Completado</option>
                <option value="retirado">Retirado</option>
              </select>
            )}
          </Campo>
        </div>
        {aplicaAsentimiento ? (
          <div className="rejilla-campos">
            <label className="casilla alineada">
              <input type="checkbox" checked={f.asentimientoOtorgado} onChange={(e) => setF({ ...f, asentimientoOtorgado: e.target.checked })} />
              <span>El niño o niña dio su asentimiento (8 años o más)</span>
            </label>
            {f.asentimientoOtorgado ? (
              <Campo etiqueta="Fecha del asentimiento">{(id) => <input id={id} type="date" value={f.fechaAsentimiento} onChange={(e) => setF({ ...f, fechaAsentimiento: e.target.value })} />}</Campo>
            ) : null}
          </div>
        ) : (
          <p className="meta">Menor de 8 años: el asentimiento no aplica, basta el consentimiento del apoderado.</p>
        )}
        {f.estado === "retirado" ? (
          <div className="rejilla-campos">
            <Campo etiqueta="Fecha de retiro">{(id) => <input id={id} type="date" value={f.fechaRetiro} onChange={(e) => setF({ ...f, fechaRetiro: e.target.value })} />}</Campo>
            <Campo etiqueta="Motivo del retiro">{(id) => <input id={id} value={f.motivoRetiro} onChange={(e) => setF({ ...f, motivoRetiro: e.target.value })} />}</Campo>
          </div>
        ) : null}
        <Campo etiqueta="Observaciones">{(id) => <textarea id={id} rows={2} value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} />}</Campo>
        {error ? <div className="franja alerta">{error}</div> : null}
        <div className="botonera">
          <button type="submit" className="boton" disabled={guardar.isPending || !f.pacienteId}>
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}
