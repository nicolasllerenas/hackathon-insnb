import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

let raiz: Root | null = null;

export function montar(contenido: ReactNode): void {
  const contenedor = document.getElementById("raiz");
  if (!contenedor) return;
  raiz ??= createRoot(contenedor);
  raiz.render(contenido);
}
