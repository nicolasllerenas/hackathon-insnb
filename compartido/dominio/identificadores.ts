import { hexAleatorio } from "./aleatorio.js";

export function nuevaSerieMichi(): string {
  return `MC-${hexAleatorio(4)}`;
}

export function nuevoCodigoVinculacion(): string {
  const hex = hexAleatorio(6);
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

export function normalizarCodigo(codigo: string): string {
  const limpio = codigo.toUpperCase().replace(/[^0-9A-F]/g, "");
  if (limpio.length !== 12) return codigo.trim().toUpperCase();
  return `${limpio.slice(0, 4)}-${limpio.slice(4, 8)}-${limpio.slice(8, 12)}`;
}

export async function sha256Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function enmascararCelular(celular: string): string {
  return celular.length <= 3 ? celular : `${"•".repeat(celular.length - 3)}${celular.slice(-3)}`;
}

export function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}
