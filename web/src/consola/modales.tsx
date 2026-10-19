import { useState, type FormEvent } from "react";
import { validar } from "@compartido/contratos/comunes";
import { Cita, Hemograma, NOMBRE_TIPO_CITA, TIPOS_CITA, type EntradaTamizaje, type Paciente, type Referencia, type Tamizaje, type Teleconsulta } from "@compartido/contratos/clinica";
import { combinar, fechaLocalISO, horaLocal, sumarDias } from "@compartido/dominio/fechas";
import { motivoDeReferencia, type EstadoPaciente } from "@compartido/dominio/estados";
import { CAPACIDADES_POR_MOTIVO, MOTIVOS_REFERENCIA, NOMBRE_CAPACIDAD, NOMBRE_MOTIVO, proponerReferencia, type MotivoReferencia } from "@compartido/dominio/referencias";
import { ErrorMichi, mensajeDeError } from "@compartido/errores";
import { useAvisos } from "../componentes/Avisos";
import { Campo } from "../componentes/Campo";
import { Modal } from "../componentes/Modal";
import { useAccion } from "../datos/consultas";
import { nombreCompleto } from "./panel";

function erroresPorCampo(e: unknown): Record<string, string> {
  if (!(e instanceof ErrorMichi)) return {};
  const r: Record<string, string> = {};
  for (const d of e.detalles) if (!r[d.campo]) r[d.campo] = d.mensaje;
  return r;
}

function numeroONulo(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

export function ModalTeleconsulta({ paciente, tamizaje, estado, alCerrar }: { paciente: Paciente; tamizaje: Tamizaje | null; estado: EstadoPaciente; alCerrar: () => void }) {
  const { avisar, avisarError } = useAvisos();
  const urgente = estado === "priorizable";
  const fiebre = tamizaje?.temperaturaC != null && tamizaje.escaladoPorFiebre ? ` con fiebre de ${tamizaje.temperaturaC.toFixed(1)} °C` : "";
  const [pregunta, setPregunta] = useState(
    urgente
      ? `Tamizaje compatible con neutropenia grave${fiebre}. ¿Confirma inicio de antibiótico de amplio espectro y autoriza ingreso por emergencia, o indica manejo en el establecimiento de referencia más cercano?`
      : "Tamizaje por debajo de la ventana terapéutica sin fiebre. ¿Ajusta la dosis de 6-MP y repetimos el tamizaje en 48 h, o indica hemograma confirmatorio?",
  );
  const crear = useAccion(["clinica"], (p, t: Teleconsulta) => p.clinica.guardarRegistro("teleconsultas", t));
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await crear.mutateAsync({
        id: `tc-${globalThis.crypto.randomUUID()}`,
        pacienteId: paciente.id,
        tamizajeId: tamizaje?.id ?? null,
        creada: new Date().toISOString(),
        prioridad: urgente ? "tiempo_real" : "diferida",
        estado: "abierta",
        origen: "consola",
        pregunta,
        respuesta: "",
        respondidaEn: null,
        responsable: paciente.medicoAsignado,
        puedeViajarALima: paciente.domicilio.puedeViajarALima,
      });
      avisar("Teleconsulta registrada y notificada al michi de la familia.", "exito");
      alCerrar();
    } catch (err) {
      avisarError(err);
    }
  };
  return (
    <Modal titulo={urgente ? "Teleconsulta prioritaria" : "Teleconsulta"} alCerrar={alCerrar}>
      <form onSubmit={enviar} className="formulario">
        <p className="descripcion">
          {nombreCompleto(paciente)} · {paciente.domicilio.provincia}, {paciente.domicilio.departamento}
        </p>
        <div className={`franja ${urgente ? "alerta" : "info"}`}>
          <span className="e">{urgente ? "🚑" : "👩‍⚕️"}</span>
          <span>
            {urgente
              ? "Modalidad en tiempo real. Compromiso de respuesta: 15 minutos, con ingreso por emergencia habilitado en paralelo."
              : "Modalidad diferida (store-and-forward). Compromiso de respuesta: 6 horas."}{" "}
            Marco legal: Ley 30421 y DL 1490.
          </span>
        </div>
        {tamizaje ? (
          <div className="resumen-datos">
            <span>
              ANC estimado <b className="num">{tamizaje.ancEstimado ?? "—"}/µL</b>
            </span>
            <span>
              IC95{" "}
              <b className="num">
                {tamizaje.icInferior ?? "—"}–{tamizaje.icSuperior ?? "∞"}
              </b>
            </span>
            <span>Estado {tamizaje.estado}</span>
          </div>
        ) : null}
        <Campo etiqueta="Pregunta concreta al especialista">{(id) => <textarea id={id} rows={4} value={pregunta} onChange={(e) => setPregunta(e.target.value)} required minLength={5} />}</Campo>
        <div className="nota">
          La responsabilidad clínica permanece en el INSN San Borja. El paquete viaja con el tamizaje, la trayectoria, la etapa y la adherencia a las alertas: con la
          trayectoria, la teleconsulta es una decisión y no una conversación a ciegas.
        </div>
        <div className="botonera">
          <button type="submit" className="boton menta" disabled={crear.isPending}>
            {crear.isPending ? "Enviando…" : "Enviar y notificar al michi"}
          </button>
          <button type="button" className="boton fantasma" onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ModalResponder({ teleconsulta, alCerrar }: { teleconsulta: Teleconsulta; alCerrar: () => void }) {
  const { avisar, avisarError } = useAvisos();
  const [respuesta, setRespuesta] = useState(teleconsulta.respuesta);
  const [cerrar, setCerrar] = useState(false);
  const guardar = useAccion(["clinica"], (p, t: Teleconsulta) => p.clinica.guardarRegistro("teleconsultas", t));
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await guardar.mutateAsync({ ...teleconsulta, respuesta, estado: cerrar ? "cerrada" : "respondida", respondidaEn: new Date().toISOString() });
      avisar("Respuesta registrada.", "exito");
      alCerrar();
    } catch (err) {
      avisarError(err);
    }
  };
  return (
    <Modal titulo="Responder teleconsulta" alCerrar={alCerrar} angosto>
      <form onSubmit={enviar} className="formulario">
        <div className="nota">{teleconsulta.pregunta}</div>
        <Campo etiqueta="Indicación del especialista">{(id) => <textarea id={id} rows={5} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} required minLength={3} />}</Campo>
        <label className="casilla">
          <input type="checkbox" checked={cerrar} onChange={(e) => setCerrar(e.target.checked)} />
          <span>Cerrar el caso con esta respuesta</span>
        </label>
        <div className="botonera">
          <button type="submit" className="boton" disabled={guardar.isPending}>
            Guardar respuesta
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ModalReferencia({ paciente, estado, tamizaje, alCerrar }: { paciente: Paciente; estado: EstadoPaciente; tamizaje: Tamizaje | null; alCerrar: () => void }) {
  const { avisar, avisarError } = useAvisos();
  const sugerido = motivoDeReferencia(estado, { edadAnios: 0, temperaturaC: tamizaje?.temperaturaC ?? null, fiebreSostenida1h: tamizaje?.fiebreSostenida ?? false });
  const [motivo, setMotivo] = useState<MotivoReferencia>(sugerido);
  const [excluirLima, setExcluirLima] = useState(!paciente.domicilio.puedeViajarALima);
  const propuesta = (() => {
    try {
      return proponerReferencia({ ...paciente.domicilio, puedeViajarALima: !excluirLima }, motivo);
    } catch (e) {
      return mensajeDeError(e);
    }
  })();
  const emitir = useAccion(["clinica"], (p, r: Referencia) => p.clinica.guardarRegistro("referencias", r));
  const enviar = async () => {
    if (typeof propuesta === "string") return;
    try {
      await emitir.mutateAsync({
        id: `ref-${globalThis.crypto.randomUUID()}`,
        pacienteId: paciente.id,
        creada: new Date().toISOString(),
        motivo: propuesta.motivo,
        capacidadesRequeridas: propuesta.capacidadesRequeridas,
        destinoCodigo: propuesta.destino.codigo,
        destinoNombre: propuesta.destino.nombre,
        destinoCiudad: propuesta.destino.ciudad,
        destinoDepartamento: propuesta.destino.departamento,
        alternativas: propuesta.alternativas.map((c) => `${c.nombre} (${c.ciudad})`),
        horasEvitadas: propuesta.horasDeViajeEvitadas,
        justificacion: propuesta.justificacion,
        advertencias: propuesta.advertencias,
        emitidaPor: paciente.medicoAsignado,
        estado: "emitida",
      });
      avisar(`Referencia emitida a ${propuesta.destino.nombre}.`, "exito");
      alCerrar();
    } catch (err) {
      avisarError(err);
    }
  };
  return (
    <Modal titulo="Referencia al establecimiento capaz más cercano" alCerrar={alCerrar}>
      <p className="descripcion">
        {nombreCompleto(paciente)} · {paciente.domicilio.provincia}, {paciente.domicilio.departamento}
        {paciente.domicilio.puedeViajarALima ? "" : ` · la familia no puede viajar a Lima: ${paciente.domicilio.motivoImpedimento.toLowerCase()}`}
      </p>
      <div className="rejilla-campos">
        <Campo etiqueta="Motivo">
          {(id) => (
            <select id={id} value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoReferencia)}>
              {MOTIVOS_REFERENCIA.map((m) => (
                <option key={m} value={m}>
                  {NOMBRE_MOTIVO[m]}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <label className="casilla alineada">
          <input type="checkbox" checked={excluirLima} onChange={(e) => setExcluirLima(e.target.checked)} />
          <span>Buscar fuera de Lima</span>
        </label>
      </div>
      <p className="meta">Requiere: {CAPACIDADES_POR_MOTIVO[motivo].map((c) => NOMBRE_CAPACIDAD[c]).join(", ")}</p>
      {typeof propuesta === "string" ? (
        <div className="franja alerta">{propuesta}</div>
      ) : (
        <>
          <div className="franja ok" id="destinoReferencia">
            <span className="e">🏥</span>
            <span>
              <b>{propuesta.destino.nombre}</b> — {propuesta.destino.ciudad}, {propuesta.destino.departamento}.{" "}
              {propuesta.horasDeViajeEvitadas > 0 ? `Evita ${Math.round(propuesta.horasDeViajeEvitadas)} h de viaje ida y vuelta a Lima.` : ""}
            </span>
          </div>
          <p className="descripcion">{propuesta.justificacion}</p>
          {propuesta.advertencias.map((a) => (
            <div key={a} className="franja ambar">
              <span className="e">⚠️</span>
              <span>{a}</span>
            </div>
          ))}
          {propuesta.alternativas.length ? <p className="meta">Alternativas: {propuesta.alternativas.map((c) => `${c.nombre} (${c.ciudad})`).join(" · ")}</p> : null}
        </>
      )}
      <div className="nota">
        Esto cambia la ecuación del abandono: la respuesta por defecto hoy es «venga a Lima». Repetido cuarenta y cinco veces durante el mantenimiento, el viaje deja de
        ser una molestia y se convierte en la causa del abandono.
      </div>
      <div className="botonera">
        <button type="button" className="boton menta" disabled={typeof propuesta === "string" || emitir.isPending} onClick={() => void enviar()}>
          Emitir referencia
        </button>
        <button type="button" className="boton fantasma" onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}

export function ModalHemograma({ paciente, alCerrar }: { paciente: Paciente; alCerrar: () => void }) {
  const { avisar, avisarError } = useAvisos();
  const ahora = new Date();
  const [f, setF] = useState({ fecha: fechaLocalISO(ahora), hora: horaLocal(ahora), anc: "", leucocitos: "", hemoglobina: "", plaquetas: "", laboratorio: "Laboratorio central · INSN San Borja", observaciones: "", usarFraccion: true });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const guardar = useAccion(["clinica"], async (p, datos: { hemograma: Hemograma; fraccion: number | null }) => {
    const h = await p.clinica.guardarRegistro("hemogramas", datos.hemograma);
    if (datos.fraccion !== null) await p.clinica.guardarPaciente({ ...paciente, fraccionNeutrofilos: datos.fraccion });
    return h;
  });
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const anc = numeroONulo(f.anc);
    const leucocitos = numeroONulo(f.leucocitos);
    const fraccion = anc !== null && leucocitos !== null && leucocitos > 0 && Number.isFinite(anc) ? Math.round((anc / leucocitos) * 1000) / 1000 : null;
    try {
      const fecha = combinar(f.fecha, f.hora);
      if (fecha.getTime() > Date.now() + 60_000) throw new ErrorMichi("validacion", "Hemograma inválido", [{ campo: "fecha", mensaje: "No puede estar en el futuro" }]);
      const hemograma = validar(
        Hemograma,
        {
          id: `hem-${globalThis.crypto.randomUUID()}`,
          pacienteId: paciente.id,
          fecha: fecha.toISOString(),
          anc,
          leucocitos,
          fraccionNeutrofilos: fraccion !== null && fraccion > 0 && fraccion < 1 ? fraccion : null,
          hemoglobina: numeroONulo(f.hemoglobina),
          plaquetas: numeroONulo(f.plaquetas),
          laboratorio: f.laboratorio,
          observaciones: f.observaciones,
        },
        "Hemograma",
      );
      setErrores({});
      await guardar.mutateAsync({ hemograma, fraccion: f.usarFraccion ? hemograma.fraccionNeutrofilos : null });
      avisar("Hemograma registrado. Queda pareado con el tamizaje más cercano para el estudio de validación.", "exito");
      alCerrar();
    } catch (err) {
      setErrores(erroresPorCampo(err));
      avisarError(err);
    }
  };
  const cambiar = (clave: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [clave]: e.target.value });
  return (
    <Modal titulo="Registrar hemograma" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={enviar} noValidate>
        <p className="descripcion">El hemograma es el patrón de referencia: ancla la conversión del michi al propio niño y alimenta el estudio de validación.</p>
        <div className="rejilla-campos">
          <Campo etiqueta="Fecha" error={errores.fecha}>{(id) => <input id={id} type="date" value={f.fecha} onChange={cambiar("fecha")} required />}</Campo>
          <Campo etiqueta="Hora">{(id) => <input id={id} type="time" value={f.hora} onChange={cambiar("hora")} required />}</Campo>
          <Campo etiqueta="ANC (/µL)" error={errores.anc}>{(id) => <input id={id} inputMode="numeric" value={f.anc} onChange={cambiar("anc")} required />}</Campo>
          <Campo etiqueta="Leucocitos (/µL)" error={errores.leucocitos}>{(id) => <input id={id} inputMode="numeric" value={f.leucocitos} onChange={cambiar("leucocitos")} />}</Campo>
          <Campo etiqueta="Hemoglobina (g/dL)" error={errores.hemoglobina}>{(id) => <input id={id} inputMode="decimal" value={f.hemoglobina} onChange={cambiar("hemoglobina")} />}</Campo>
          <Campo etiqueta="Plaquetas (/µL)" error={errores.plaquetas}>{(id) => <input id={id} inputMode="numeric" value={f.plaquetas} onChange={cambiar("plaquetas")} />}</Campo>
          <Campo etiqueta="Laboratorio" error={errores.laboratorio}>{(id) => <input id={id} value={f.laboratorio} onChange={cambiar("laboratorio")} />}</Campo>
          <Campo etiqueta="Observaciones" error={errores.observaciones}>{(id) => <input id={id} value={f.observaciones} onChange={cambiar("observaciones")} />}</Campo>
        </div>
        <label className="casilla">
          <input type="checkbox" checked={f.usarFraccion} onChange={(e) => setF({ ...f, usarFraccion: e.target.checked })} />
          <span>Usar la fracción de neutrófilos de este hemograma para calibrar al paciente (estrecha el intervalo del michi)</span>
        </label>
        <div className="botonera">
          <button type="submit" className="boton" disabled={guardar.isPending}>
            Guardar hemograma
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ModalCita({ paciente, cita, alCerrar }: { paciente: Paciente; cita?: Cita; alCerrar: () => void }) {
  const { avisar, avisarError } = useAvisos();
  const [f, setF] = useState({
    fecha: cita?.fecha ?? sumarDias(fechaLocalISO(), 7),
    hora: cita?.hora ?? "09:00",
    tipo: cita?.tipo ?? ("control" as Cita["tipo"]),
    lugar: cita?.lugar ?? "Hematología · INSN San Borja",
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const guardar = useAccion(["clinica"], (p, c: Cita) => p.clinica.guardarRegistro("citas", c));
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const nueva = validar(Cita, { id: cita?.id ?? `cit-${globalThis.crypto.randomUUID()}`, pacienteId: paciente.id, fecha: f.fecha, hora: f.hora || null, tipo: f.tipo, lugar: f.lugar, asistio: cita?.asistio ?? null }, "Cita");
      setErrores({});
      await guardar.mutateAsync(nueva);
      avisar("Cita guardada. El michi la recordará 3 días antes, 1 día antes y el mismo día.", "exito");
      alCerrar();
    } catch (err) {
      setErrores(erroresPorCampo(err));
      avisarError(err);
    }
  };
  return (
    <Modal titulo={cita ? "Editar cita" : "Programar cita"} alCerrar={alCerrar} angosto>
      <form className="formulario" onSubmit={enviar} noValidate>
        <div className="rejilla-campos">
          <Campo etiqueta="Fecha" error={errores.fecha}>{(id) => <input id={id} type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} required />}</Campo>
          <Campo etiqueta="Hora" error={errores.hora}>{(id) => <input id={id} type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} />}</Campo>
          <Campo etiqueta="Tipo">
            {(id) => (
              <select id={id} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as Cita["tipo"] })}>
                {TIPOS_CITA.map((t) => (
                  <option key={t} value={t}>
                    {NOMBRE_TIPO_CITA[t]}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Lugar" error={errores.lugar}>{(id) => <input id={id} value={f.lugar} onChange={(e) => setF({ ...f, lugar: e.target.value })} />}</Campo>
        </div>
        <div className="botonera">
          <button type="submit" className="boton" disabled={guardar.isPending}>
            Guardar cita
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ModalTamizajeManual({ paciente, alCerrar }: { paciente: Paciente; alCerrar: () => void }) {
  const { avisar, avisarError } = useAvisos();
  const [f, setF] = useState({ anc: "", inferior: "", superior: "", capilares: "5", eventos: "", temperatura: "", sostenida: false, concluyente: true });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const registrar = useAccion(["clinica"], (p, e: EntradaTamizaje) => p.clinica.registrarTamizaje(e));
  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    try {
      const entrada: EntradaTamizaje = {
        id: `tam-${globalThis.crypto.randomUUID()}`,
        pacienteId: paciente.id,
        momento: new Date().toISOString(),
        origen: "consola",
        serie: paciente.serieMichi,
        concluyente: f.concluyente,
        ancEstimado: numeroONulo(f.anc),
        icInferior: numeroONulo(f.inferior),
        icSuperior: numeroONulo(f.superior),
        capilares: Number(f.capilares) || 0,
        eventos: Number(f.eventos) || 0,
        volumenNl: null,
        razones: f.concluyente ? [] : ["registrado como no concluyente en consola"],
        temperaturaC: numeroONulo(f.temperatura),
        fiebreSostenida: f.sostenida,
        diasPostQuimio: null,
        simulado: false,
      };
      if (entrada.ancEstimado !== null && entrada.icInferior !== null && entrada.icInferior > entrada.ancEstimado) {
        throw new ErrorMichi("validacion", "Tamizaje inválido", [{ campo: "icInferior", mensaje: "El límite inferior no puede superar la estimación" }]);
      }
      const t = await registrar.mutateAsync(entrada);
      setErrores({});
      avisar(`Tamizaje registrado: ${t.estado}.`, t.estado === "estable" ? "exito" : "info");
      alCerrar();
    } catch (err) {
      setErrores(erroresPorCampo(err));
      avisarError(err);
    }
  };
  return (
    <Modal titulo="Registrar tamizaje" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={enviar} noValidate>
        <p className="descripcion">Para capturas hechas en el establecimiento o salidas del servicio de análisis óptico. El triaje lo recalcula el servicio clínico.</p>
        <label className="casilla">
          <input type="checkbox" checked={f.concluyente} onChange={(e) => setF({ ...f, concluyente: e.target.checked })} />
          <span>Tamizaje concluyente (5 capilares válidos o más)</span>
        </label>
        <div className="rejilla-campos">
          <Campo etiqueta="ANC estimado (/µL)" error={errores.ancEstimado}>{(id) => <input id={id} inputMode="numeric" value={f.anc} onChange={(e) => setF({ ...f, anc: e.target.value })} />}</Campo>
          <Campo etiqueta="IC95 inferior" error={errores.icInferior}>{(id) => <input id={id} inputMode="numeric" value={f.inferior} onChange={(e) => setF({ ...f, inferior: e.target.value })} />}</Campo>
          <Campo etiqueta="IC95 superior" error={errores.icSuperior}>{(id) => <input id={id} inputMode="numeric" value={f.superior} onChange={(e) => setF({ ...f, superior: e.target.value })} />}</Campo>
          <Campo etiqueta="Capilares" error={errores.capilares}>{(id) => <input id={id} inputMode="numeric" value={f.capilares} onChange={(e) => setF({ ...f, capilares: e.target.value })} />}</Campo>
          <Campo etiqueta="Eventos (huecos)" error={errores.eventos}>{(id) => <input id={id} inputMode="numeric" value={f.eventos} onChange={(e) => setF({ ...f, eventos: e.target.value })} />}</Campo>
          <Campo etiqueta="Temperatura (°C)" error={errores.temperaturaC}>{(id) => <input id={id} inputMode="decimal" value={f.temperatura} onChange={(e) => setF({ ...f, temperatura: e.target.value })} />}</Campo>
        </div>
        <label className="casilla">
          <input type="checkbox" checked={f.sostenida} onChange={(e) => setF({ ...f, sostenida: e.target.checked })} />
          <span>Fiebre sostenida durante una hora (cuenta como fiebre desde 38.0 °C)</span>
        </label>
        <div className="botonera">
          <button type="submit" className="boton" disabled={registrar.isPending}>
            Registrar y triar
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ModalConfirmar({ titulo, texto, accion, alConfirmar, alCerrar, palabra }: { titulo: string; texto: string; accion: string; alConfirmar: () => Promise<void>; alCerrar: () => void; palabra?: string }) {
  const [escrito, setEscrito] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal titulo={titulo} alCerrar={alCerrar} angosto>
      <p className="descripcion">{texto}</p>
      {palabra ? <Campo etiqueta={`Escriba ${palabra} para confirmar`}>{(id) => <input id={id} value={escrito} onChange={(e) => setEscrito(e.target.value)} autoComplete="off" />}</Campo> : null}
      {error ? <div className="franja alerta">{error}</div> : null}
      <div className="botonera">
        <button
          type="button"
          className="boton coral"
          disabled={ocupado || (palabra !== undefined && escrito.trim() !== palabra)}
          onClick={() => {
            setOcupado(true);
            setError(null);
            alConfirmar()
              .then(alCerrar)
              .catch((e: unknown) => setError(mensajeDeError(e)))
              .finally(() => setOcupado(false));
          }}
        >
          {ocupado ? "Procesando…" : accion}
        </button>
        <button type="button" className="boton fantasma" onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
