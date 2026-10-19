import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

process.env.TZ = "America/Lima";

const ruta = (relativa: string) => fileURLToPath(new URL(relativa, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@compartido": ruta("compartido"),
      "@servicios": ruta("servicios"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "nucleo",
          include: ["compartido/**/*.test.ts", "servicios/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "web",
          include: ["web/src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          testTimeout: 30_000,
          setupFiles: [ruta("web/src/pruebas/preparar.ts")],
        },
      },
    ],
  },
});
