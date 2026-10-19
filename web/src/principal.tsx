import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/jetbrains-mono";
import "./estilos/base.css";
import { lazy, StrictMode, Suspense } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { ProveedorAvisos } from "./componentes/Avisos";
import { Cargando } from "./componentes/Estados";
import { ProveedorDatos } from "./datos/contexto";
import { Landing } from "./landing/Landing";
import { montar } from "./montar";

const Consola = lazy(() => import("./consola/Consola"));

function NoEncontrado() {
  return (
    <main className="no-encontrado">
      <h1>Esta página no existe</h1>
      <p>
        Vuelve al <Link to="/">inicio</Link>, a la <Link to="/insn">consola clínica</Link> o a la <a href="/michi/">app del michi</a>.
      </p>
    </main>
  );
}

montar(
  <StrictMode>
    <ProveedorDatos>
      <ProveedorAvisos>
        <BrowserRouter>
          <Suspense fallback={<Cargando texto="Abriendo la consola…" />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/insn/*" element={<Consola />} />
              <Route path="*" element={<NoEncontrado />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ProveedorAvisos>
    </ProveedorDatos>
  </StrictMode>,
);
