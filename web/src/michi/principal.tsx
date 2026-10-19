import "@fontsource-variable/baloo-2";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/jetbrains-mono";
import "../estilos/base.css";
import "../estilos/michi.css";
import { StrictMode, useEffect, useState } from "react";
import { ProveedorAvisos } from "../componentes/Avisos";
import { ProveedorDatos, useDatos } from "../datos/contexto";
import { prepararDemostracionLocal } from "../datos/plataforma";
import { Cargando } from "../componentes/Estados";
import { montar } from "../montar";
import { AppMichi, fijarRegistroSW } from "./AppMichi";

function Arranque() {
  const { plataforma } = useDatos();
  const [listo, setListo] = useState(false);
  useEffect(() => {
    let vivo = true;
    prepararDemostracionLocal(plataforma)
      .catch(() => false)
      .finally(() => {
        if (vivo) setListo(true);
      });
    return () => {
      vivo = false;
    };
  }, [plataforma]);
  return listo ? <AppMichi /> : <Cargando texto="Despertando al michi…" />;
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker
    .register("/michi/sw.js", { scope: "/michi/" })
    .then((r) => fijarRegistroSW(r))
    .catch(() => fijarRegistroSW(null));
}

montar(
  <StrictMode>
    <ProveedorDatos>
      <ProveedorAvisos>
        <Arranque />
      </ProveedorAvisos>
    </ProveedorDatos>
  </StrictMode>,
);
