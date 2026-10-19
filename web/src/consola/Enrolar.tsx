import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { validar } from "@compartido/contratos/comunes";
import { CANALES, FOTOTIPOS, Paciente, PARENTESCOS, type Cita } from "@compartido/contratos/clinica";
import { textoVentana } from "@compartido/dominio/alertas";
import { fechaLarga, fechaLocalISO } from "@compartido/dominio/fechas";
import { nuevaSerieMichi, nuevoCodigoVinculacion } from "@compartido/dominio/identificadores";
import { DEPARTAMENTOS, proponerReferencia, type Departamento } from "@compartido/dominio/referencias";
import { ETAPAS, PERFILES, planificarEtapa, type Etapa } from "@compartido/dominio/tratamiento";
import { ErrorMichi } from "@compartido/errores";
import { useAvisos } from "../componentes/Avisos";
import { Campo } from "../componentes/Campo";
import { Cargando } from "../componentes/Estados";
import { Modal } from "../componentes/Modal";
import { useAccion, usePaciente } from "../datos/consultas";

interface Formulario {
  nombres: string;
  apellidos: string;
  historiaClinica: string;
  fechaNacimiento: string;
  sexo: "F" | "M";
  diagnostico: string;
  fototipo: Paciente["fototipo"];
  etapa: Etapa;
  inicioEtapa: string;
  medicoAsignado: string;
  cmpMedico: string;
  cateterCentral: boolean;
  nombreMichi: string;
  apoderado: string;
  parentesco: Paciente["apoderado"]["parentesco"];
  celular: string;
  canal: Paciente["apoderado"]["canalPreferido"];
  finJornada: string;
  sinHorarioFijo: boolean;
  segundoContacto: string;
  correo: string;
  departamento: Departamento;
  provincia: string;
  distrito: string;
  horasAlInsn: string;
  puedeViajarALima: boolean;
  motivoImpedimento: string;
}

const VACIO: Formulario = {
  nombres: "",
  apellidos: "",
  historiaClinica: "",
  fechaNacimiento: "",
  sexo: "F",
  diagnostico: "Leucemia linfoblástica aguda",
  fototipo: "IV",
  etapa: "mantenimiento",
  inicioEtapa: fechaLocalISO(),
  medicoAsignado: "Dra. Hematología Pediátrica",
  cmpMedico: "",
  cateterCentral: false,
  nombreMichi: "Michi",
  apoderado: "",
  parentesco: "madre",
  celular: "",
  canal: "whatsapp",
  finJornada: "18:30",
  sinHorarioFijo: false,
  segundoContacto: "",
  correo: "",
  departamento: "Amazonas",
  provincia: "",
  distrito: "",
  horasAlInsn: "",
  puedeViajarALima: true,
  motivoImpedimento: "",
};

const EJEMPLO: Formulario = {
  ...VACIO,
  nombres: "Rosa Elena",
  apellidos: "Tuesta Ramírez",
  historiaClinica: `2026-${String(Math.floor(10000 + Math.random() * 89999))}`,
  fechaNacimiento: "2018-11-02",
  nombreMichi: "Chispa",
  apoderado: "Elena Ramírez",
  celular: "987001234",
  finJornada: "18:30",
  departamento: "Amazonas",
  provincia: "Bagua",
  horasAlInsn: "9",
  puedeViajarALima: false,
  motivoImpedimento: "Costo del pasaje y trabajo del apoderado",
};

function desdePaciente(p: Paciente): Formulario {
  return {
    nombres: p.nombres,
    apellidos: p.apellidos,
    historiaClinica: p.historiaClinica,
    fechaNacimiento: p.fechaNacimiento,
    sexo: p.sexo,
    diagnostico: p.diagnostico,
    fototipo: p.fototipo,
    etapa: p.etapa,
    inicioEtapa: p.inicioEtapa,
    medicoAsignado: p.medicoAsignado,
    cmpMedico: p.cmpMedico,
    cateterCentral: p.cateterCentral,
    nombreMichi: p.nombreMichi,
    apoderado: p.apoderado.nombre,
    parentesco: p.apoderado.parentesco,
    celular: p.apoderado.celular,
    canal: p.apoderado.canalPreferido,
    finJornada: p.apoderado.finJornada,
    sinHorarioFijo: p.apoderado.sinHorarioFijo,
    segundoContacto: p.apoderado.segundoContacto,
    correo: p.apoderado.correo,
    departamento: p.domicilio.departamento,
    provincia: p.domicilio.provincia,
    distrito: p.domicilio.distrito,
    horasAlInsn: String(p.domicilio.horasAlInsn),
    puedeViajarALima: p.domicilio.puedeViajarALima,
    motivoImpedimento: p.domicilio.motivoImpedimento,
  };
}

interface Resultado {
  paciente: Paciente;
  codigo: string;
  serie: string;
  controles: string[];
}

const CAMPOS_DE_ERROR: Record<string, keyof Formulario> = {
  "apoderado.nombre": "apoderado",
  "apoderado.celular": "celular",
  "apoderado.correo": "correo",
  "apoderado.finJornada": "finJornada",
  "apoderado.segundoContacto": "segundoContacto",
  "domicilio.provincia": "provincia",
  "domicilio.distrito": "distrito",
  "domicilio.horasAlInsn": "horasAlInsn",
  "domicilio.motivoImpedimento": "motivoImpedimento",
};

export function Enrolar() {
  const { id } = useParams();
  const existente = usePaciente(id);
  if (id && existente.isLoading) return <Cargando />;
  if (id && (existente.isError || !existente.data)) {
    return (
      <div className="pagina">
        <div className="vacio">
          No se encontró al paciente. <Link to="/insn">Volver</Link>
        </div>
      </div>
    );
  }
  return <FormularioEnrolar key={existente.data?.id ?? "nuevo"} base={id ? existente.data : undefined} />;
}

function FormularioEnrolar({ base }: { base: Paciente | undefined }) {
  const editando = Boolean(base);
  const id = base?.id;
  const navegar = useNavigate();
  const { avisar, avisarError } = useAvisos();
  const [f, setF] = useState<Formulario>(() => (base ? desdePaciente(base) : VACIO));
  const [errores, setErrores] = useState<Partial<Record<keyof Formulario, string>>>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [consentimiento, setConsentimiento] = useState(false);

  const guardar = useAccion(["clinica", "dispositivos"], async (p, datos: { paciente: Paciente; codigo: string | null; citas: Cita[] }) => {
    const guardado = await p.clinica.guardarPaciente(datos.paciente);
    if (datos.codigo && datos.paciente.serieMichi && datos.paciente.entregadoEn) {
      await p.dispositivos.registrarMichi({
        serie: datos.paciente.serieMichi,
        pacienteId: datos.paciente.id,
        codigo: datos.codigo,
        nombre: datos.paciente.nombreMichi,
        firmware: "0.3.0",
        entregadoEn: datos.paciente.entregadoEn,
      });
    }
    for (const c of datos.citas) await p.clinica.guardarRegistro("citas", c);
    return guardado;
  });

  const cambiar = <K extends keyof Formulario>(clave: K, valor: Formulario[K]) => {
    setF((x) => ({ ...x, [clave]: valor }));
    setErrores((e) => ({ ...e, [clave]: undefined }));
  };

  const ventana = useMemo(() => {
    try {
      return textoVentana({ finJornada: f.finJornada || "18:00", sinHorarioFijo: f.sinHorarioFijo });
    } catch {
      return "19:00 – 21:00";
    }
  }, [f.finJornada, f.sinHorarioFijo]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const ahora = new Date().toISOString();
    const serie = base?.serieMichi ?? nuevaSerieMichi();
    const codigo = base?.codigoVinculacion ?? nuevoCodigoVinculacion();
    const horas = f.horasAlInsn.trim() === "" ? Number.NaN : Number(f.horasAlInsn.replace(",", "."));
    const candidato = {
      id: base?.id ?? `pac-${globalThis.crypto.randomUUID()}`,
      historiaClinica: f.historiaClinica,
      nombres: f.nombres,
      apellidos: f.apellidos,
      fechaNacimiento: f.fechaNacimiento,
      sexo: f.sexo,
      diagnostico: f.diagnostico,
      fototipo: f.fototipo,
      etapa: f.etapa,
      inicioEtapa: f.inicioEtapa,
      medicoAsignado: f.medicoAsignado,
      cmpMedico: f.cmpMedico,
      cateterCentral: f.cateterCentral,
      fraccionNeutrofilos: base?.fraccionNeutrofilos ?? null,
      apoderado: {
        nombre: f.apoderado,
        parentesco: f.parentesco,
        celular: f.celular.replace(/\s+/g, ""),
        canalPreferido: f.canal,
        finJornada: f.finJornada,
        sinHorarioFijo: f.sinHorarioFijo,
        segundoContacto: f.segundoContacto,
        correo: f.correo.trim(),
      },
      domicilio: {
        departamento: f.departamento,
        provincia: f.provincia,
        distrito: f.distrito,
        horasAlInsn: horas,
        puedeViajarALima: f.puedeViajarALima,
        motivoImpedimento: f.puedeViajarALima ? "" : f.motivoImpedimento,
      },
      nombreMichi: f.nombreMichi,
      serieMichi: serie,
      codigoVinculacion: codigo,
      entregadoEn: base?.entregadoEn ?? ahora,
      seguimiento: base?.seguimiento ?? "activo",
      creado: base?.creado ?? ahora,
      actualizado: ahora,
    };
    try {
      const paciente = validar(Paciente, candidato, "Ficha del paciente");
      const etapaCambio = base && base.etapa !== paciente.etapa;
      const plan = planificarEtapa(paciente.etapa, paciente.inicioEtapa < fechaLocalISO() ? fechaLocalISO() : paciente.inicioEtapa, 120);
      const controles = plan.controles.slice(0, 3);
      const citas: Cita[] =
        !base || etapaCambio
          ? controles.map((fecha, i) => ({
              id: `cit-${globalThis.crypto.randomUUID()}`,
              pacienteId: paciente.id,
              fecha,
              hora: "09:00",
              tipo: i === 1 ? "hemograma" : "control",
              lugar: i === 1 ? "Laboratorio · INSN San Borja" : "Hematología · INSN San Borja",
              asistio: null,
            }))
          : [];
      setErrores({});
      await guardar.mutateAsync({ paciente, codigo: base ? null : codigo, citas });
      if (base) {
        avisar(etapaCambio ? "Ficha actualizada. El calendario se rehízo para la nueva etapa." : "Ficha actualizada.", "exito");
        navegar(`/insn/pacientes/${encodeURIComponent(paciente.id)}`);
      } else {
        setResultado({ paciente, codigo, serie, controles });
      }
    } catch (err) {
      if (err instanceof ErrorMichi) {
        const mapa: Partial<Record<keyof Formulario, string>> = {};
        for (const d of err.detalles) {
          const clave = (CAMPOS_DE_ERROR[d.campo] ?? d.campo) as keyof Formulario;
          if (clave in VACIO && !mapa[clave]) mapa[clave] = d.mensaje;
        }
        setErrores(mapa);
        if (err.codigo === "conflicto") setErrores((x) => ({ ...x, historiaClinica: "Ya existe un paciente con esta historia clínica" }));
      }
      avisarError(err);
    }
  };

  const perfil = PERFILES[f.etapa];
  const texto = (clave: keyof Formulario, etiqueta: string, extra: { tipo?: string; ayuda?: string; modo?: "numeric" | "decimal" | "tel"; max?: number } = {}) => (
    <Campo etiqueta={etiqueta} error={errores[clave]} ayuda={extra.ayuda}>
      {(idCampo, describe) => (
        <input
          id={idCampo}
          name={clave}
          type={extra.tipo ?? "text"}
          inputMode={extra.modo}
          maxLength={extra.max}
          aria-describedby={describe}
          aria-invalid={Boolean(errores[clave])}
          value={String(f[clave])}
          onChange={(e) => cambiar(clave, e.target.value as never)}
        />
      )}
    </Campo>
  );

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <div>
          <h1>{editando ? "Editar ficha" : "Entrega del michi en el primer control"}</h1>
          <p>
            {editando
              ? "Si cambia la etapa, el calendario de controles y alertas se rehace."
              : "Dos minutos al final de la consulta. Lo que se captura aquí decide si el sistema funciona los dos años siguientes."}
          </p>
        </div>
        {!editando ? (
          <button type="button" className="boton fantasma" id="btnEjemplo" onClick={() => setF({ ...EJEMPLO, historiaClinica: `2026-${String(Math.floor(10000 + Math.random() * 89999))}` })}>
            Rellenar con un ejemplo
          </button>
        ) : null}
      </div>

      <form className="panel formulario" onSubmit={enviar} noValidate>
        <h2>Paciente</h2>
        <div className="rejilla-campos">
          {texto("nombres", "Nombres")}
          {texto("apellidos", "Apellidos")}
          {texto("historiaClinica", "Historia clínica", { ayuda: "Llave del enlace con Galenus" })}
          {texto("fechaNacimiento", "Fecha de nacimiento", { tipo: "date" })}
          <Campo etiqueta="Sexo">
            {(i) => (
              <select id={i} value={f.sexo} onChange={(e) => cambiar("sexo", e.target.value as "F" | "M")}>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
              </select>
            )}
          </Campo>
          <Campo etiqueta="Fototipo (Fitzpatrick)" ayuda="Se registra para medir el sesgo por color de piel">
            {(i, d) => (
              <select id={i} aria-describedby={d} value={f.fototipo} onChange={(e) => cambiar("fototipo", e.target.value as Paciente["fototipo"])}>
                {FOTOTIPOS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            )}
          </Campo>
          {texto("diagnostico", "Diagnóstico")}
          <Campo etiqueta="Etapa del tratamiento">
            {(i) => (
              <select id={i} value={f.etapa} onChange={(e) => cambiar("etapa", e.target.value as Etapa)}>
                {ETAPAS.map((x) => (
                  <option key={x} value={x}>
                    {PERFILES[x].nombre}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          {texto("inicioEtapa", "Inicio de la etapa", { tipo: "date" })}
          {texto("medicoAsignado", "Médico asignado")}
          {texto("cmpMedico", "CMP", { max: 12 })}
          {texto("nombreMichi", "Nombre del michi", { max: 24 })}
        </div>
        <label className="casilla">
          <input type="checkbox" checked={f.cateterCentral} onChange={(e) => cambiar("cateterCentral", e.target.checked)} />
          <span>Porta catéter venoso central (baja el umbral de derivación)</span>
        </label>

        <h2>Apoderado y contacto</h2>
        <div className="rejilla-campos">
          {texto("apoderado", "Nombre del apoderado")}
          <Campo etiqueta="Parentesco">
            {(i) => (
              <select id={i} value={f.parentesco} onChange={(e) => cambiar("parentesco", e.target.value as Formulario["parentesco"])}>
                {PARENTESCOS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            )}
          </Campo>
          {texto("celular", "Celular", { modo: "tel", max: 12 })}
          <Campo etiqueta="Canal que sí contesta">
            {(i) => (
              <select id={i} value={f.canal} onChange={(e) => cambiar("canal", e.target.value as Formulario["canal"])}>
                {CANALES.map((x) => (
                  <option key={x} value={x}>
                    {x === "app" ? "App MichiCheck" : x}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Sale de trabajar a las" error={errores.finJornada}>
            {(i) => <input id={i} type="time" value={f.finJornada} disabled={f.sinHorarioFijo} onChange={(e) => cambiar("finJornada", e.target.value)} />}
          </Campo>
          {texto("segundoContacto", "Segundo contacto")}
          {texto("correo", "Correo (opcional)", { tipo: "email" })}
        </div>
        <label className="casilla">
          <input type="checkbox" checked={f.sinHorarioFijo} onChange={(e) => cambiar("sinHorarioFijo", e.target.checked)} />
          <span>Sin horario fijo (comercio, agricultura, jornal): las alertas van a la ventana de la noche</span>
        </label>
        <p className="meta" id="ventanaAlertas">
          Ventana del michi: <b>{ventana}</b>. Fuera de ella el recordatorio sale igual por los canales convencionales, pero el juguete calla.
        </p>

        <h2>Domicilio y accesibilidad</h2>
        <div className="rejilla-campos">
          <Campo etiqueta="Departamento">
            {(i) => (
              <select id={i} value={f.departamento} onChange={(e) => cambiar("departamento", e.target.value as Departamento)}>
                {DEPARTAMENTOS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            )}
          </Campo>
          {texto("provincia", "Provincia")}
          {texto("distrito", "Distrito")}
          {texto("horasAlInsn", "Horas de viaje al INSN", { modo: "decimal" })}
        </div>
        <label className="casilla" id="casillaNoLima">
          <input type="checkbox" checked={!f.puedeViajarALima} onChange={(e) => cambiar("puedeViajarALima", !e.target.checked)} />
          <span>
            La familia declara que <b>no puede viajar a Lima</b> para los controles
          </span>
        </label>
        {!f.puedeViajarALima ? <div className="rejilla-campos">{texto("motivoImpedimento", "Motivo del impedimento", { ayuda: "Costo del pasaje, trabajo, otros hijos a cargo…" })}</div> : null}

        <div className="franja info">
          <span className="e">📅</span>
          <span>
            {perfil.nombre}: control presencial cada {perfil.diasEntreControles} días, dedito en casa cada {perfil.diasEntreTamizajes} días. Riesgo de abandono{" "}
            {perfil.riesgoAbandono}.
          </span>
        </div>

        <div className="botonera">
          <button type="submit" className="boton" id="btnEnrolar" disabled={guardar.isPending}>
            {guardar.isPending ? "Guardando…" : editando ? "Guardar cambios" : "Generar ficha y vincular michi"}
          </button>
          <button type="button" className="boton fantasma" onClick={() => setConsentimiento(true)}>
            Ver texto de consentimiento
          </button>
          {editando ? (
            <Link className="boton fantasma" to={`/insn/pacientes/${encodeURIComponent(id ?? "")}`}>
              Cancelar
            </Link>
          ) : null}
        </div>
      </form>

      {consentimiento ? (
        <Modal titulo="Lo que se le lee a la familia" alCerrar={() => setConsentimiento(false)}>
          <p className="descripcion">
            En voz alta, antes de entregar el juguete. No es letra chica: si la familia no entiende que el michi transmite información al hospital, el sistema no tiene
            permiso para funcionar.
          </p>
          <ul className="consentimiento">
            <li>
              El michi le va a recordar a {f.nombres || "su niño o niña"} sus controles y le va a pedir que ponga el dedito en su nariz. Eso es un <b>tamizaje</b>, no
              un análisis de sangre: orienta, no reemplaza el hemograma.
            </li>
            <li>Lo que el michi mide llega al INSN San Borja, al equipo de {f.medicoAsignado || "su médico"}.</li>
            <li>Si el michi deja de comunicarse por más de tres días, el hospital los va a llamar. No es vigilancia: es la forma de darnos cuenta a tiempo.</li>
            <li>
              Las alertas van a sonar entre las <b>{ventana}</b>, cuando ya estén en casa.
            </li>
            <li>
              Pueden devolver el michi cuando quieran y seguir con sus controles igual. <b>No condiciona ninguna atención.</b>
            </li>
            <li>El michi no graba audio ni rastrea ubicación. Solo envía su propio estado y los tamizajes que el niño decide hacer.</li>
          </ul>
        </Modal>
      ) : null}

      {resultado ? (
        <Modal titulo="Michi vinculado" alCerrar={() => navegar(`/insn/pacientes/${encodeURIComponent(resultado.paciente.id)}`)}>
          <p className="descripcion">Entrégueselo al niño y pida al apoderado que abra la app y escriba este código. Es el único paso que hace la familia.</p>
          <div className="codigo-vinculacion num" id="codigoVinculacion">
            {resultado.codigo}
          </div>
          <dl className="ficha-datos">
            <div>
              <dt>Serie del dispositivo</dt>
              <dd className="num">{resultado.serie}</dd>
            </div>
            <div>
              <dt>Etapa</dt>
              <dd>
                {PERFILES[resultado.paciente.etapa].nombre} · riesgo de abandono {PERFILES[resultado.paciente.etapa].riesgoAbandono}
              </dd>
            </div>
            <div>
              <dt>Ventana de alertas</dt>
              <dd>{textoVentana({ finJornada: resultado.paciente.apoderado.finJornada, sinHorarioFijo: resultado.paciente.apoderado.sinHorarioFijo })}</dd>
            </div>
            <div>
              <dt>Canal de respaldo</dt>
              <dd>{resultado.paciente.apoderado.canalPreferido} + SMS + llamada</dd>
            </div>
          </dl>
          <h3>Próximos controles programados</h3>
          <ul className="motivos">
            {resultado.controles.map((c, i) => (
              <li key={c}>
                {fechaLarga(c)} — {i === 1 ? "hemograma" : "control"}. El michi avisa 3 días antes, 1 día antes y esa misma mañana.
              </li>
            ))}
          </ul>
          {!resultado.paciente.domicilio.puedeViajarALima ? (
            <div className="franja ambar">
              <span className="e">🚌</span>
              <span>
                La familia no puede viajar a Lima. Si el tamizaje escala, la teleconsulta generará referencia a{" "}
                <b>{proponerReferencia(resultado.paciente.domicilio, "hemograma_de_control").destino.nombre}</b> en lugar de citar en el INSN.
              </span>
            </div>
          ) : null}
          <div className="botonera">
            <a className="boton fantasma" href="/michi/" target="_blank" rel="noreferrer">
              Abrir la app del michi
            </a>
            <button type="button" className="boton menta" onClick={() => navegar(`/insn/pacientes/${encodeURIComponent(resultado.paciente.id)}`)}>
              Ver la ficha
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
