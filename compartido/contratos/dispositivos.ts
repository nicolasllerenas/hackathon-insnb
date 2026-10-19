import { z } from "zod";
import type { SaludDelEnlace } from "../dominio/enlace.js";
import { coleccion, Id, Momento, SerieMichi, texto, TextoOpcional, type InfoSalud, type Volcado } from "./comunes.js";

export const ORIGENES_LATIDO = ["robot", "app", "simulador", "consola"] as const;

export const ResumenLatido = z.object({
  momento: Momento,
  bateriaPct: z.number().min(0).max(100).nullable(),
  tamizajesEnCola: z.number().int().min(0).max(10000),
  alertasEmitidas: z.number().int().min(0).max(1000000),
  alertasAtendidas: z.number().int().min(0).max(1000000),
  silenciamientos: z.number().int().min(0).max(10000),
});

export const Latido = ResumenLatido.extend({
  id: Id,
  serie: SerieMichi,
  origen: z.enum(ORIGENES_LATIDO),
  rssiDbm: z.number().int().min(-130).max(0).nullable(),
  firmware: TextoOpcional(20),
  escalado: z.boolean(),
});
export type Latido = z.infer<typeof Latido>;

export const Michi = z.object({
  id: SerieMichi,
  serie: SerieMichi,
  pacienteId: Id,
  codigoHash: z.string().regex(/^[0-9a-f]{64}$/),
  nombre: texto(1, 24),
  firmware: TextoOpcional(20),
  entregadoEn: Momento,
  estado: z.enum(["activo", "devuelto", "extraviado"]),
  ultimoLatido: ResumenLatido.nullable(),
});
export type Michi = z.infer<typeof Michi>;

export const RegistroMichi = z.object({
  serie: SerieMichi,
  pacienteId: Id,
  codigo: z.string().regex(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/, "Código inválido"),
  nombre: texto(1, 24),
  firmware: TextoOpcional(20),
  entregadoEn: Momento,
});
export type RegistroMichi = z.infer<typeof RegistroMichi>;

export const EntradaLatido = Latido.omit({ id: true, serie: true }).partial({
  momento: true,
  rssiDbm: true,
  firmware: true,
  escalado: true,
  tamizajesEnCola: true,
  alertasEmitidas: true,
  alertasAtendidas: true,
  silenciamientos: true,
});
export type EntradaLatido = z.input<typeof EntradaLatido>;

export const COLECCIONES_DISPOSITIVOS = {
  michis: coleccion("michis", Michi, { indices: ["pacienteId", "estado"], orden: "serie" }),
  latidos: coleccion("latidos", Latido, { indices: ["serie", "momento"], orden: "momento" }),
} as const;
export type ColeccionDispositivos = keyof typeof COLECCIONES_DISPOSITIVOS;

export interface EstadoMichi {
  michi: Michi;
  salud: SaludDelEnlace;
}

export interface ApiDispositivos {
  salud(): Promise<InfoSalud>;
  listarMichis(): Promise<Michi[]>;
  obtenerMichi(serie: string): Promise<Michi>;
  registrarMichi(registro: RegistroMichi): Promise<Michi>;
  cambiarEstado(serie: string, estado: Michi["estado"]): Promise<Michi>;
  eliminarMichi(serie: string): Promise<void>;
  registrarLatido(serie: string, codigo: string, entrada: EntradaLatido): Promise<Latido>;
  registrarLatidoClinico(serie: string, entrada: EntradaLatido): Promise<Latido>;
  listarLatidos(serie: string, limite?: number): Promise<Latido[]>;
  parque(): Promise<EstadoMichi[]>;
  exportar(): Promise<Volcado>;
  importar(volcado: Volcado): Promise<Record<string, number>>;
  vaciar(): Promise<void>;
}
