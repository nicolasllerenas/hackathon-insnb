import { useMutation, useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { InfoSalud } from "@compartido/contratos/comunes";
import type { ColeccionDePaciente, Paciente, RegistroClinico } from "@compartido/contratos/clinica";
import type { EstadoMichi, Latido } from "@compartido/contratos/dispositivos";
import type { Mensaje } from "@compartido/contratos/interoperabilidad";
import type { Participante } from "@compartido/contratos/investigacion";
import { useDatos } from "./contexto";
import type { NombreServicio, Plataforma } from "./plataforma";

export function usePacientes(): UseQueryResult<Paciente[]> {
  const { plataforma } = useDatos();
  return useQuery({ queryKey: [plataforma.modo, "clinica", "pacientes"], queryFn: () => plataforma.clinica.listarPacientes() });
}

export function usePaciente(id: string | undefined): UseQueryResult<Paciente> {
  const { plataforma } = useDatos();
  return useQuery({
    queryKey: [plataforma.modo, "clinica", "paciente", id],
    queryFn: () => plataforma.clinica.obtenerPaciente(id as string),
    enabled: Boolean(id),
  });
}

export function useRegistros<K extends ColeccionDePaciente>(coleccion: K, pacienteId?: string): UseQueryResult<RegistroClinico[K][]> {
  const { plataforma } = useDatos();
  return useQuery({
    queryKey: [plataforma.modo, "clinica", "registros", coleccion, pacienteId ?? "todos"],
    queryFn: () => plataforma.clinica.listarRegistros(coleccion, pacienteId),
  });
}

export function useParque(): UseQueryResult<EstadoMichi[]> {
  const { plataforma } = useDatos();
  return useQuery({
    queryKey: [plataforma.modo, "dispositivos", "parque"],
    queryFn: () => plataforma.dispositivos.parque(),
    refetchInterval: 30_000,
  });
}

export function useLatidos(serie: string | null | undefined, limite = 40): UseQueryResult<Latido[]> {
  const { plataforma } = useDatos();
  return useQuery({
    queryKey: [plataforma.modo, "dispositivos", "latidos", serie, limite],
    queryFn: () => plataforma.dispositivos.listarLatidos(serie as string, limite),
    enabled: Boolean(serie),
  });
}

export function useParticipantes(): UseQueryResult<Participante[]> {
  const { plataforma } = useDatos();
  return useQuery({ queryKey: [plataforma.modo, "investigacion", "participantes"], queryFn: () => plataforma.investigacion.listarParticipantes() });
}

export function useMensajes(pacienteId?: string): UseQueryResult<Mensaje[]> {
  const { plataforma } = useDatos();
  return useQuery({
    queryKey: [plataforma.modo, "interop", "mensajes", pacienteId ?? "todos"],
    queryFn: () => plataforma.interop.listarMensajes(pacienteId),
  });
}

export function useSalud(servicio: NombreServicio): UseQueryResult<InfoSalud> {
  const { plataforma } = useDatos();
  return useQuery({
    queryKey: [plataforma.modo, servicio, "salud"],
    queryFn: () => plataforma[servicio].salud(),
    retry: false,
  });
}

export function useAccion<A, R>(servicios: NombreServicio[], accion: (p: Plataforma, argumentos: A) => Promise<R>) {
  const { plataforma, avisarCambio } = useDatos();
  return useMutation({
    mutationFn: (argumentos: A) => accion(plataforma, argumentos),
    onSuccess: () => avisarCambio(servicios),
  });
}
