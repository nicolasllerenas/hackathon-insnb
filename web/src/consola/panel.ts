import { useMemo } from "react";
import { contextoDelPaciente, hemogramaPrevio } from "@compartido/aplicacion/tamizaje";
import type { Cita, Hemograma, Paciente, Referencia, Tamizaje, Teleconsulta } from "@compartido/contratos/clinica";
import type { EstadoMichi } from "@compartido/contratos/dispositivos";
import { evaluar, type Evaluacion } from "@compartido/dominio/estados";
import { edadEnAnios, fechaLocalISO } from "@compartido/dominio/fechas";
import { PERFILES } from "@compartido/dominio/tratamiento";
import { usePacientes, useParque, useRegistros } from "../datos/consultas";

export interface FilaPaciente {
  paciente: Paciente;
  edad: number;
  tamizajes: Tamizaje[];
  ultimo: Tamizaje | null;
  hemogramas: Hemograma[];
  citas: Cita[];
  teleconsultas: Teleconsulta[];
  referencias: Referencia[];
  michi: EstadoMichi | null;
  evaluacion: Evaluacion;
  proximaCita: Cita | null;
  adherencia: number | null;
  tamizajeVencido: boolean;
  urgencia: number;
}

function agrupar<T extends { pacienteId: string }>(lista: readonly T[] | undefined): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const x of lista ?? []) {
    const l = mapa.get(x.pacienteId);
    if (l) l.push(x);
    else mapa.set(x.pacienteId, [x]);
  }
  return mapa;
}

export function construirFila(
  paciente: Paciente,
  tamizajes: Tamizaje[],
  hemogramas: Hemograma[],
  citas: Cita[],
  teleconsultas: Teleconsulta[],
  referencias: Referencia[],
  michi: EstadoMichi | null,
  ahora: Date = new Date(),
): FilaPaciente {
  const ordenados = [...tamizajes].sort((a, b) => a.momento.localeCompare(b.momento));
  const ultimo = ordenados.at(-1) ?? null;
  const hem = hemogramaPrevio(hemogramas, paciente.id, ultimo?.momento ?? ahora.toISOString());
  const contexto = ultimo ? contextoDelPaciente(paciente, ultimo, hem) : { edadAnios: edadEnAnios(paciente.fechaNacimiento, ahora) };
  const evaluacion = evaluar(ultimo, contexto, { historiaClinica: paciente.historiaClinica, etapa: paciente.etapa, domicilio: paciente.domicilio }, michi?.salud ?? null);
  const perfil = PERFILES[paciente.etapa];
  const hace28 = ahora.getTime() - 28 * 86_400_000;
  const recientes = ordenados.filter((t) => Date.parse(t.momento) >= hace28).length;
  const esperados = Math.max(1, Math.floor(28 / perfil.diasEntreTamizajes));
  const hoy = fechaLocalISO(ahora);
  const proximaCita = [...citas].filter((c) => c.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0] ?? null;
  const tamizajeVencido = ultimo ? ahora.getTime() - Date.parse(ultimo.momento) > 2 * perfil.diasEntreTamizajes * 86_400_000 : true;
  const sinContacto = michi?.salud.enlace === "sin_contacto";
  const urgencia =
    (evaluacion.estado === "priorizable" ? 400 : evaluacion.estado === "grave" ? 300 : 100) +
    (sinContacto ? 50 : 0) +
    (michi?.salud.urgente ? 20 : 0) +
    (tamizajeVencido ? 5 : 0);
  return {
    paciente,
    edad: edadEnAnios(paciente.fechaNacimiento, ahora),
    tamizajes: ordenados,
    ultimo,
    hemogramas: [...hemogramas].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    citas: [...citas].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    teleconsultas: [...teleconsultas].sort((a, b) => b.creada.localeCompare(a.creada)),
    referencias: [...referencias].sort((a, b) => b.creada.localeCompare(a.creada)),
    michi,
    evaluacion,
    proximaCita,
    adherencia: Math.min(1, recientes / esperados),
    tamizajeVencido,
    urgencia,
  };
}

export function usePanel() {
  const pacientes = usePacientes();
  const tamizajes = useRegistros("tamizajes");
  const hemogramas = useRegistros("hemogramas");
  const citas = useRegistros("citas");
  const teleconsultas = useRegistros("teleconsultas");
  const referencias = useRegistros("referencias");
  const parque = useParque();

  const consultas = [pacientes, tamizajes, hemogramas, citas, teleconsultas, referencias, parque];
  const cargando = consultas.some((q) => q.isLoading);
  const error = consultas.find((q) => q.isError)?.error ?? null;

  const filas = useMemo(() => {
    if (!pacientes.data) return [];
    const t = agrupar(tamizajes.data);
    const h = agrupar(hemogramas.data);
    const c = agrupar(citas.data);
    const tc = agrupar(teleconsultas.data);
    const r = agrupar(referencias.data);
    const michis = new Map((parque.data ?? []).filter((e) => e.michi.estado === "activo").map((e) => [e.michi.pacienteId, e]));
    const ahora = new Date();
    return pacientes.data
      .filter((p) => p.seguimiento === "activo")
      .map((p) => construirFila(p, t.get(p.id) ?? [], h.get(p.id) ?? [], c.get(p.id) ?? [], tc.get(p.id) ?? [], r.get(p.id) ?? [], michis.get(p.id) ?? null, ahora))
      .sort((a, b) => b.urgencia - a.urgencia || a.paciente.apellidos.localeCompare(b.paciente.apellidos, "es"));
  }, [pacientes.data, tamizajes.data, hemogramas.data, citas.data, teleconsultas.data, referencias.data, parque.data]);

  return {
    filas,
    cargando,
    error,
    pacientes: pacientes.data ?? [],
    referencias: referencias.data ?? [],
    teleconsultas: teleconsultas.data ?? [],
    parque: parque.data ?? [],
    tamizajes: tamizajes.data ?? [],
    hemogramas: hemogramas.data ?? [],
    reintentar: () => consultas.forEach((q) => void q.refetch()),
  };
}

export function nombreCompleto(p: Pick<Paciente, "nombres" | "apellidos">): string {
  return `${p.nombres} ${p.apellidos}`;
}
