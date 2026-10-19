import "../estilos/consola.css";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes, useNavigate, useSearchParams } from "react-router";
import { Cargando } from "../componentes/Estados";
import { Tour } from "../componentes/Tour";
import { useDatos } from "../datos/contexto";
import { prepararDemostracionLocal } from "../datos/plataforma";
import { pedirPermisoDeNotificaciones } from "../notificaciones";
import { Cola } from "./Cola";
import { Datos } from "./Datos";
import { Dispositivos } from "./Dispositivos";
import { Enrolar } from "./Enrolar";
import { FichaPaciente } from "./FichaPaciente";
import { Galenus } from "./Galenus";
import { Investigacion } from "./Investigacion";
import { usePanel } from "./panel";
import { RedNacional } from "./RedNacional";
import { Tablero } from "./Tablero";
import { crearPasosTour } from "./tour";

function Navegacion() {
  const { filas } = usePanel();
  const urgentes = filas.filter((f) => f.evaluacion.estado !== "estable").length;
  const enlaces: [string, string, string, number | null, boolean][] = [
    ["/insn", "Tablero", "▦", filas.length, false],
    ["/insn/alertas", "Cola de atención", "◆", urgentes, true],
    ["/insn/enrolar", "Entregar michi", "＋", null, false],
    ["/insn/dispositivos", "Dispositivos", "◎", null, false],
    ["/insn/investigacion", "Investigación", "∑", null, false],
    ["/insn/red", "Red nacional", "⌖", null, false],
    ["/insn/galenus", "Galenus · HL7", "⇄", null, false],
    ["/insn/datos", "Base de datos", "⛁", null, false],
  ];
  return (
    <nav className="navegacion" aria-label="Secciones de la consola">
      {enlaces.map(([ruta, texto, icono, cuenta, alerta]) => (
        <NavLink key={ruta} to={ruta} end={ruta === "/insn"} className={({ isActive }) => (isActive ? "activo" : "")}>
          <span className="icono" aria-hidden="true">
            {icono}
          </span>
          <span className="texto">{texto}</span>
          {cuenta !== null && cuenta > 0 ? <span className={`cuenta${alerta ? " alerta" : ""}`}>{cuenta}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
}

export default function Consola() {
  const { plataforma, avisarCambio } = useDatos();
  const navegar = useNavigate();
  const [parametros, setParametros] = useSearchParams();
  const [listo, setListo] = useState(false);
  const [tour, setTour] = useState(false);

  useEffect(() => {
    let vivo = true;
    prepararDemostracionLocal(plataforma)
      .then((sembrado) => {
        if (sembrado) avisarCambio(["clinica", "dispositivos", "interop", "investigacion"]);
      })
      .catch(() => undefined)
      .finally(() => {
        if (vivo) setListo(true);
      });
    return () => {
      vivo = false;
    };
  }, [plataforma, avisarCambio]);

  useEffect(() => {
    if (listo && parametros.has("demo")) {
      const t = window.setTimeout(() => setTour(true), 700);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [listo, parametros]);

  const pasos = useMemo(() => crearPasosTour(navegar, plataforma.modo), [navegar, plataforma.modo]);

  return (
    <div className="consola">
      <header className="cabecera">
        <a className="marca" href="/">
          <span className="logo" aria-hidden="true">
            🐱
          </span>
          <span>
            <b>MichiCheck</b>
            <small>Consola clínica · INSN San Borja</small>
          </span>
        </a>
        <span className="espacio" />
        <NavLink to="/insn/datos" className={`modo-datos ${plataforma.modo}`} title="Cambiar el origen de los datos">
          <span className="punto" aria-hidden="true" />
          {plataforma.modo === "local" ? "Datos locales" : "Servidor Postgres"}
        </NavLink>
        <span className="usuario">
          <span className="avatar" aria-hidden="true">
            HP
          </span>
          <span>
            <b>Hematología Pediátrica</b>
            <small>UAIE · INSN San Borja</small>
          </span>
        </span>
        {!tour ? (
          <button
            type="button"
            className="boton cian chico"
            onClick={() => {
              void pedirPermisoDeNotificaciones();
              setTour(true);
            }}
          >
            ▶ Demo guiada
          </button>
        ) : null}
      </header>
      <div className="marco">
        <Navegacion />
        <main className="contenido" id="contenido">
          {listo ? (
            <Routes>
              <Route index element={<Tablero />} />
              <Route path="alertas" element={<Cola />} />
              <Route path="enrolar" element={<Enrolar />} />
              <Route path="pacientes/:id" element={<FichaPaciente />} />
              <Route path="pacientes/:id/editar" element={<Enrolar />} />
              <Route path="dispositivos" element={<Dispositivos />} />
              <Route path="investigacion" element={<Investigacion />} />
              <Route path="red" element={<RedNacional />} />
              <Route path="galenus" element={<Galenus />} />
              <Route path="datos" element={<Datos />} />
              <Route path="*" element={<p className="vacio">Sección no encontrada.</p>} />
            </Routes>
          ) : (
            <Cargando texto="Preparando los datos…" />
          )}
          <footer className="pie-consola">
            MichiCheck · Hackatón Niño San Borja 2026 · Desafío 3: Ruta Hematológica. Tamizaje óptico no invasivo: orienta y prioriza, no diagnostica ni
            reemplaza el hemograma. Los pacientes de demostración son ficticios.
          </footer>
        </main>
      </div>
      {tour ? (
        <Tour
          pasos={pasos}
          alTerminar={() => {
            setTour(false);
            if (parametros.has("demo")) {
              parametros.delete("demo");
              setParametros(parametros, { replace: true });
            }
          }}
        />
      ) : null}
    </div>
  );
}
