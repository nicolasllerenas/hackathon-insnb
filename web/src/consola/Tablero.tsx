import { useMemo, useState } from "react";
import { Link } from "react-router";
import { hace } from "@compartido/dominio/fechas";
import { PERFILES } from "@compartido/dominio/tratamiento";
import { Chispa } from "../componentes/Graficos";
import { Cargando, PanelError } from "../componentes/Estados";
import { InsigniaEnlace, InsigniaEstado } from "../componentes/Insignia";
import { nombreCompleto, usePanel, type FilaPaciente } from "./panel";

type Filtro = "todos" | "priorizable" | "grave" | "sin_contacto" | "no_viaja";

const NUM = new Intl.NumberFormat("es-PE");

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function Tablero() {
  const panel = usePanel();
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return panel.filas.filter((f) => {
      const p = f.paciente;
      const coincide = !q || normalizar(`${nombreCompleto(p)} ${p.historiaClinica} ${p.domicilio.departamento} ${p.domicilio.provincia} ${p.serieMichi ?? ""}`).includes(q);
      if (!coincide) return false;
      if (filtro === "todos") return true;
      if (filtro === "sin_contacto") return f.michi?.salud.enlace === "sin_contacto";
      if (filtro === "no_viaja") return !p.domicilio.puedeViajarALima;
      return f.evaluacion.estado === filtro;
    });
  }, [panel.filas, busqueda, filtro]);

  if (panel.cargando) return <Cargando />;
  if (panel.error) return <PanelError error={panel.error} accion={<button type="button" className="boton fantasma chico" onClick={panel.reintentar}>Reintentar</button>} />;

  const f = panel.filas;
  const priorizables = f.filter((x) => x.evaluacion.estado === "priorizable").length;
  const graves = f.filter((x) => x.evaluacion.estado === "grave").length;
  const mudos = f.filter((x) => x.michi?.salud.enlace === "sin_contacto").length;
  const fueraDeLima = f.filter((x) => x.paciente.domicilio.departamento !== "Lima").length;
  const horas = panel.referencias.reduce((a, r) => a + r.horasEvitadas, 0);

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <div>
          <h1>Tablero de seguimiento</h1>
          <p>Ordenado por lo que no puede esperar, no por fecha. El estado lo fija el tamizaje; la fiebre y el silencio del michi solo pueden subirlo.</p>
        </div>
        <Link to="/insn/enrolar" className="boton">
          ＋ Entregar michi
        </Link>
      </div>

      <section className="kpis" id="kpis" aria-label="Indicadores">
        <div className="kpi">
          <span className="k">En seguimiento</span>
          <span className="v">{f.length}</span>
          <span className="d">{fueraDeLima} fuera de Lima</span>
        </div>
        <div className="kpi priorizable">
          <span className="k">◆ Priorizables</span>
          <span className="v">{priorizables}</span>
          <span className="d">teleconsulta en 15 min + emergencia</span>
        </div>
        <div className="kpi grave">
          <span className="k">▲ Graves</span>
          <span className="v">{graves}</span>
          <span className="d">teleconsulta el mismo día</span>
        </div>
        <div className="kpi priorizable">
          <span className="k">Michis sin contacto</span>
          <span className="v">{mudos}</span>
          <span className="d">señal temprana de abandono</span>
        </div>
        <div className="kpi estable">
          <span className="k">Horas de viaje evitadas</span>
          <span className="v">{NUM.format(Math.round(horas))}</span>
          <span className="d">por referencias locales</span>
        </div>
      </section>

      <div className="buscador">
        <label className="visualmente-oculto" htmlFor="busqueda">
          Buscar paciente
        </label>
        <input id="busqueda" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, historia clínica, departamento o serie del michi…" />
        <div className="filtros" role="group" aria-label="Filtrar">
          {(
            [
              ["todos", "Todos"],
              ["priorizable", "◆ Priorizables"],
              ["grave", "▲ Graves"],
              ["sin_contacto", "Sin contacto"],
              ["no_viaja", "No viajan a Lima"],
            ] as const
          ).map(([id, texto]) => (
            <button key={id} type="button" className={`filtro${filtro === id ? " activo" : ""}`} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
              {texto}
            </button>
          ))}
        </div>
      </div>

      {visibles.length ? (
        <div className="rejilla-pacientes" id="rejillaPacientes">
          {visibles.map((fila) => (
            <TarjetaPaciente key={fila.paciente.id} fila={fila} />
          ))}
        </div>
      ) : (
        <div className="vacio">
          {f.length ? "Ningún paciente coincide con la búsqueda." : "Todavía no hay pacientes. Empiece entregando un michi en el primer control."}
        </div>
      )}
    </div>
  );
}

function TarjetaPaciente({ fila }: { fila: FilaPaciente }) {
  const { paciente: p, evaluacion: ev, michi, ultimo } = fila;
  const trayectoria = fila.tamizajes.filter((t) => t.concluyente && t.ancEstimado !== null).map((t) => t.ancEstimado as number);
  const atencion = michi?.salud.tasaDeAtencion ?? null;
  const anc = ultimo?.ancEstimado ?? null;
  return (
    <Link to={`/insn/pacientes/${encodeURIComponent(p.id)}`} className={`tarjeta-paciente ${ev.estado}`} data-paciente={p.id}>
      <div className="fila-tarjeta">
        <span className="avatar" aria-hidden="true">
          {p.sexo === "F" ? "👧" : "👦"}
        </span>
        <div className="identidad">
          <h3>{nombreCompleto(p)}</h3>
          <span className="meta">
            {fila.edad.toFixed(1)} años · HC {p.historiaClinica}
          </span>
          <span className="meta">
            {p.domicilio.provincia}, {p.domicilio.departamento}
            {!p.domicilio.puedeViajarALima ? " · no puede viajar a Lima" : ""}
          </span>
        </div>
        <InsigniaEstado estado={ev.estado} />
      </div>
      <div className="fila-tarjeta separada">
        {michi ? <InsigniaEnlace enlace={michi.salud.enlace} /> : <span className="insignia neutra">Sin michi</span>}
        <span className="meta">{michi?.michi.ultimoLatido ? `latido ${hace(michi.michi.ultimoLatido.momento)}` : "sin latidos"}</span>
        <span className="insignia neutra">{PERFILES[p.etapa].nombre}</span>
      </div>
      <dl className="mini">
        <div>
          <dt>ANC estimado</dt>
          <dd className={`num ${anc === null ? "" : anc < 500 ? "bajo" : anc > 1500 ? "alto" : "dentro"}`}>{anc === null ? "—" : NUM.format(anc)}</dd>
        </div>
        <div>
          <dt>Alertas atendidas</dt>
          <dd className="num">{atencion === null ? "—" : `${Math.round(atencion * 100)}%`}</dd>
        </div>
        <div>
          <dt>Batería</dt>
          <dd className={`num ${(michi?.salud.bateriaPct ?? 100) <= 25 ? "bajo" : ""}`}>{michi?.salud.bateriaPct === null || !michi ? "—" : `${Math.round(michi.salud.bateriaPct ?? 0)}%`}</dd>
        </div>
      </dl>
      <Chispa valores={trayectoria.slice(-12)} etiqueta={`Trayectoria del ANC de ${nombreCompleto(p)}`} />
      <span className="pie-tarjeta">
        {ultimo ? `Último tamizaje ${hace(ultimo.momento)}` : "Sin tamizajes"}
        {fila.tamizajeVencido && ultimo ? " · vencido" : ""}
      </span>
    </Link>
  );
}
