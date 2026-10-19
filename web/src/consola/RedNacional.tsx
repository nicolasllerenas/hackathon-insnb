import { useMemo, useState } from "react";
import {
  cobertura,
  DEPARTAMENTOS,
  MOTIVOS_REFERENCIA,
  NOMBRE_CAPACIDAD,
  NOMBRE_MOTIVO,
  proponerReferencia,
  RED,
  type Departamento,
  type MotivoReferencia,
  type NivelCentro,
} from "@compartido/dominio/referencias";
import { mensajeDeError } from "@compartido/errores";
import { Campo } from "../componentes/Campo";

export function RedNacional() {
  const c = cobertura();
  const [busqueda, setBusqueda] = useState("");
  const [nivel, setNivel] = useState<NivelCentro | "todos">("todos");
  const [origen, setOrigen] = useState<Departamento>("Amazonas");
  const [motivo, setMotivo] = useState<MotivoReferencia>("neutropenia_febril");
  const [horas, setHoras] = useState("9");
  const [puedeViajar, setPuedeViajar] = useState(false);

  const centros = useMemo(() => {
    const q = busqueda.toLowerCase();
    return RED.filter((x) => nivel === "todos" || x.nivel === nivel)
      .filter((x) => !q || `${x.nombre} ${x.ciudad} ${x.departamento}`.toLowerCase().includes(q))
      .sort((a, b) => a.departamento.localeCompare(b.departamento, "es") || a.nombre.localeCompare(b.nombre, "es"));
  }, [busqueda, nivel]);

  const simulacion = useMemo(() => {
    try {
      const h = Number(horas.replace(",", "."));
      return proponerReferencia(
        { departamento: origen, provincia: "", horasAlInsn: Number.isFinite(h) ? h : 0, puedeViajarALima: puedeViajar, motivoImpedimento: "" },
        motivo,
      );
    } catch (e) {
      return mensajeDeError(e);
    }
  }, [origen, motivo, horas, puedeViajar]);

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <div>
          <h1>Red nacional de atención</h1>
          <p>Cuando la teleconsulta concluye que hace falta atención presencial, el sistema no responde «venga a Lima»: responde cuál es el establecimiento capaz más cercano.</p>
        </div>
      </div>
      <section className="kpis" id="kpisRed">
        <div className="kpi">
          <span className="k">Establecimientos</span>
          <span className="v">{c.centros}</span>
          <span className="d">en {c.departamentosConCentro} departamentos</span>
        </div>
        <div className="kpi estable">
          <span className="k">Oncológicos pediátricos</span>
          <span className="v">{c.oncologicos}</span>
          <span className="d">solo en {c.departamentosConOncologico.length} departamentos</span>
        </div>
        <div className="kpi grave">
          <span className="k">De continuidad</span>
          <span className="v">{c.continuidad}</span>
          <span className="d">resuelven la urgencia, no la enfermedad</span>
        </div>
        <div className="kpi priorizable">
          <span className="k">Departamentos sin oncológico</span>
          <span className="v">{c.departamentosSinOncologico.length}</span>
          <span className="d">dependen de la teleconsulta</span>
        </div>
      </section>

      <section className="panel">
        <h2>Simulador de referencia</h2>
        <p className="descripcion">Pruebe la regla con cualquier domicilio. Es la misma función que usa la teleconsulta y la app de la familia.</p>
        <div className="rejilla-campos">
          <Campo etiqueta="Domicilio">
            {(id) => (
              <select id={id} value={origen} onChange={(e) => setOrigen(e.target.value as Departamento)}>
                {DEPARTAMENTOS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Motivo">
            {(id) => (
              <select id={id} value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoReferencia)}>
                {MOTIVOS_REFERENCIA.map((m) => (
                  <option key={m} value={m}>
                    {NOMBRE_MOTIVO[m]}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Horas al INSN">{(id) => <input id={id} inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} />}</Campo>
          <label className="casilla alineada">
            <input type="checkbox" checked={puedeViajar} onChange={(e) => setPuedeViajar(e.target.checked)} />
            <span>Pueden viajar a Lima</span>
          </label>
        </div>
        {typeof simulacion === "string" ? (
          <div className="franja alerta">{simulacion}</div>
        ) : (
          <>
            <div className="franja ok">
              <span className="e">🏥</span>
              <span>
                <b>{simulacion.destino.nombre}</b> — {simulacion.destino.ciudad}, {simulacion.destino.departamento}.{" "}
                {simulacion.horasDeViajeEvitadas > 0 ? `Evita ${Math.round(simulacion.horasDeViajeEvitadas)} h de viaje ida y vuelta.` : ""}
              </span>
            </div>
            {simulacion.advertencias.map((a) => (
              <div key={a} className="franja ambar">
                <span className="e">⚠️</span>
                <span>{a}</span>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="panel">
        <div className="buscador">
          <label className="visualmente-oculto" htmlFor="buscaRed">
            Buscar establecimiento
          </label>
          <input id="buscaRed" type="search" placeholder="Buscar centro, ciudad o departamento…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <div className="filtros" role="group" aria-label="Nivel">
            {(
              [
                ["todos", "Todos"],
                ["oncologico", "Oncológicos"],
                ["continuidad", "Continuidad"],
              ] as const
            ).map(([id, texto]) => (
              <button key={id} type="button" className={`filtro${nivel === id ? " activo" : ""}`} aria-pressed={nivel === id} onClick={() => setNivel(id)}>
                {texto}
              </button>
            ))}
          </div>
        </div>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Establecimiento</th>
                <th>Ciudad</th>
                <th>Departamento</th>
                <th>Nivel</th>
                <th>Resuelve</th>
                <th>RENIPRESS</th>
              </tr>
            </thead>
            <tbody>
              {centros.map((x) => (
                <tr key={x.codigo}>
                  <td>
                    <b>{x.nombre}</b>
                  </td>
                  <td>{x.ciudad}</td>
                  <td>{x.departamento}</td>
                  <td>
                    <span className={`insignia ${x.nivel === "oncologico" ? "estable" : "neutra"}`}>{x.nivel === "oncologico" ? "Oncológico" : "Continuidad"}</span>
                  </td>
                  <td className="meta">{x.capacidades.map((k) => NOMBRE_CAPACIDAD[k]).join(", ")}</td>
                  <td className="num">{x.renipress ?? "por confirmar"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="nota">
          Fuente: red MINSA de diez hospitales de referencia para cáncer infantil, más hospitales regionales con capacidad de hemograma, hemocultivo, antibiótico,
          transfusión y hospitalización pediátrica. <b>Los códigos RENIPRESS deben confirmarse contra el padrón oficial antes de cualquier uso asistencial.</b>
        </div>
      </section>
    </div>
  );
}
