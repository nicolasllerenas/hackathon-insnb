import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { EntradaTamizaje, Referencia, Tamizaje, Teleconsulta } from "@compartido/contratos/clinica";
import { sembrado, normal } from "@compartido/dominio/aleatorio";
import type { EstadoPaciente } from "@compartido/dominio/estados";
import { simularTamizaje } from "@compartido/dominio/simulacion";
import { mensajeDeError } from "@compartido/errores";
import { maullido, ronroneo, tono, vibrar, type Ronroneo } from "../sonido/sintetizador";
import { TEXTOS_RESULTADO } from "./contenido";

export interface EfectosGato {
  escanear: (activo: boolean) => void;
  cara: (c: "feliz" | "triste" | "amor", ms?: number) => void;
  decir: (texto: string, ms?: number) => void;
}

interface Props {
  nombreMichi: string;
  edadAnios: number;
  ultimoAnc: number | null;
  automatico: boolean;
  segundos: number;
  forzar: EstadoPaciente | null;
  capturado: boolean;
  origen: EntradaTamizaje["origen"];
  serie: string | null;
  pacienteId: string;
  efectos: EfectosGato;
  registrar: (entrada: EntradaTamizaje) => Promise<Tamizaje>;
  solicitarTeleconsulta: (tamizajeId: string, puedeViajar: boolean) => Promise<{ teleconsulta: Teleconsulta; referencia: Referencia | null }>;
  alPostergar: () => void;
  alTerminar: (t: Tamizaje | null) => void;
  avance?: (fase: Fase) => void;
}

export type Fase = "temperatura" | "dedito" | "analizando" | "resultado" | "teleconsulta" | "referencia";

const PASOS_ANALISIS = [
  "Estabilizando la imagen…",
  "Encontrando los capilares…",
  "Midiendo la velocidad del flujo…",
  "Contando huecos ópticos…",
  "Estimando defensas…",
];

const NUM = new Intl.NumberFormat("es-PE");

function ancParaSimular(forzar: EstadoPaciente | null, ultimo: number | null, semilla: number): number {
  if (forzar === "estable") return 1250;
  if (forzar === "grave") return 360;
  if (forzar === "priorizable") return 170;
  const base = ultimo ?? 1100;
  return Math.max(90, Math.round(base * Math.exp(normal(sembrado(semilla), 0, 0.28))));
}

export function FlujoTamizaje(p: Props) {
  const [fase, setFase] = useState<Fase>(p.forzar ? "dedito" : "temperatura");
  const [fiebre, setFiebre] = useState<"no" | "si" | "nose">("no");
  const [temperatura, setTemperatura] = useState("38.5");
  const [avance, setAvance] = useState(0);
  const [midiendo, setMidiendo] = useState(false);
  const [pasoAnalisis, setPasoAnalisis] = useState(0);
  const [resultado, setResultado] = useState<Tamizaje | null>(null);
  const [respuesta, setRespuesta] = useState<{ teleconsulta: Teleconsulta; referencia: Referencia | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const inicio = useRef<number | null>(null);
  const acumulado = useRef(0);
  const cuadro = useRef<number | null>(null);
  const ron = useRef<Ronroneo | null>(null);
  const props = useRef(p);
  const registro = useRef<Promise<Tamizaje> | null>(null);

  useEffect(() => {
    props.current = p;
  });

  useEffect(() => {
    props.current.avance?.(fase);
  }, [fase]);

  const detener = (completo: boolean) => {
    if (cuadro.current !== null) cancelAnimationFrame(cuadro.current);
    cuadro.current = null;
    if (inicio.current !== null) acumulado.current += (performance.now() - inicio.current) / 1000;
    inicio.current = null;
    setMidiendo(false);
    ron.current?.detener();
    ron.current = null;
    props.current.efectos.escanear(false);
    if (!completo) {
      maullido({ tono: 430, dur: 0.6, tristeza: 0.5 });
      props.current.efectos.cara("triste", 1600);
    }
  };

  const arrancar = () => {
    if (fase !== "dedito" || midiendo) return;
    setMidiendo(true);
    props.current.efectos.escanear(true);
    props.current.efectos.cara("feliz");
    props.current.efectos.decir("No te muevas… te estoy mirando 💜", 3000);
    ron.current = ronroneo(props.current.segundos + 1);
    vibrar(25);
    inicio.current = performance.now();
    const tic = () => {
      const total = acumulado.current + (performance.now() - (inicio.current ?? performance.now())) / 1000;
      const a = Math.min(1, total / props.current.segundos);
      setAvance(a);
      if (a >= 1) {
        detener(true);
        setFase("analizando");
        return;
      }
      cuadro.current = requestAnimationFrame(tic);
    };
    cuadro.current = requestAnimationFrame(tic);
  };

  const soltar = () => {
    if (midiendo && avance < 1) detener(false);
  };

  const arrancarRef = useRef(arrancar);
  useEffect(() => {
    arrancarRef.current = arrancar;
  });

  useEffect(() => {
    if (!p.automatico || fase !== "dedito") return undefined;
    const t = window.setTimeout(() => arrancarRef.current(), 500);
    return () => window.clearTimeout(t);
  }, [p.automatico, fase]);

  useEffect(
    () => () => {
      if (cuadro.current !== null) cancelAnimationFrame(cuadro.current);
      ron.current?.detener();
      props.current.efectos.escanear(false);
    },
    [],
  );

  useEffect(() => {
    if (fase !== "analizando") return;
    let vivo = true;
    let i = 0;
    const reloj = window.setInterval(() => {
      i += 1;
      tono(520 + i * 90, 0.1, 0.07);
      if (i < PASOS_ANALISIS.length) setPasoAnalisis(i);
      else window.clearInterval(reloj);
    }, 560);
    const actual = props.current;
    const semilla = Date.now() % 2_147_483_647;
    const sim = simularTamizaje({
      ancReal: ancParaSimular(actual.forzar, actual.ultimoAnc, semilla),
      edadAnios: actual.edadAnios,
      rng: sembrado(semilla + 1),
      probabilidadDeFallo: actual.forzar ? 0 : 0.04,
    });
    const temp = fiebre === "si" ? Number(temperatura) : null;
    const entrada: EntradaTamizaje = {
      id: `tam-${globalThis.crypto.randomUUID()}`,
      pacienteId: actual.pacienteId,
      momento: new Date().toISOString(),
      origen: actual.origen,
      serie: actual.serie,
      concluyente: sim.concluyente,
      ancEstimado: sim.ancEstimado,
      icInferior: sim.icInferior,
      icSuperior: sim.icSuperior,
      capilares: sim.capilares,
      eventos: sim.eventos,
      volumenNl: sim.volumenNl,
      razones: [...sim.razones],
      temperaturaC: temp !== null && Number.isFinite(temp) ? Math.round(temp * 10) / 10 : null,
      fiebreSostenida: false,
      diasPostQuimio: null,
      simulado: true,
    };
    const espera = new Promise((r) => window.setTimeout(r, PASOS_ANALISIS.length * 560 + 200));
    if (!registro.current) registro.current = actual.registrar(entrada);
    Promise.all([registro.current, espera])
      .then(([t]) => {
        if (!vivo) return;
        setResultado(t);
        setFase("resultado");
        if (t.estado === "estable") maullido({ tono: 660, dur: 0.55 });
        else {
          maullido({ tono: 400, dur: 0.9, tristeza: 0.6 });
          props.current.efectos.cara("triste", 3000);
          vibrar([90, 70, 90, 70, 180]);
          window.setTimeout(() => maullido({ tono: 380, dur: 0.9, tristeza: 0.8 }), 1000);
        }
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setError(mensajeDeError(e));
        setFase("resultado");
      });
    return () => {
      vivo = false;
      window.clearInterval(reloj);
    };
  }, [fase, fiebre, temperatura]);

  const pedirTeleconsulta = async (puedeViajar: boolean) => {
    if (!resultado) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await p.solicitarTeleconsulta(resultado.id, puedeViajar);
      setRespuesta(r);
      setFase(puedeViajar || !r.referencia ? "teleconsulta" : "referencia");
      if (puedeViajar) p.efectos.decir("El doctor los va a llamar. Yo me quedo con ustedes 💜", 4200);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const teclado = (e: KeyboardEvent<HTMLButtonElement>, presion: boolean) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (presion && !e.repeat) arrancar();
    if (!presion) soltar();
  };

  if (fase === "temperatura") {
    return (
      <div className="flujo">
        <h2>Antes del dedito</h2>
        <p>¿Le tomaron la temperatura hoy? La fiebre cambia lo que hay que hacer, aunque el michi vea todo bien.</p>
        <div className="opciones-fiebre" role="radiogroup" aria-label="Temperatura">
          {(
            [
              ["no", "🙂", "No tiene fiebre"],
              ["si", "🌡️", "Sí, tiene fiebre"],
              ["nose", "🤷", "No tenemos termómetro"],
            ] as const
          ).map(([valor, emoji, texto]) => (
            <button key={valor} type="button" role="radio" aria-checked={fiebre === valor} className={`opcion${fiebre === valor ? " elegida" : ""}`} onClick={() => setFiebre(valor)}>
              <span aria-hidden="true">{emoji}</span>
              {texto}
            </button>
          ))}
        </div>
        {fiebre === "si" ? (
          <label className="campo-michi">
            <span>¿Cuántos grados?</span>
            <input type="number" inputMode="decimal" min={35} max={42.5} step={0.1} value={temperatura} onChange={(e) => setTemperatura(e.target.value)} />
          </label>
        ) : null}
        {fiebre === "si" && Number(temperatura) >= 38 ? (
          <div className="franja alerta">
            <span className="e">🚑</span>
            <span>
              Con 38 °C o más, <b>vayan a emergencias ya</b>, sin esperar el resultado. El michi igual va a avisar al INSN.
            </span>
          </div>
        ) : null}
        {fiebre === "nose" ? (
          <div className="franja info">
            <span className="e">ℹ️</span>
            <span>Si el niño se siente caliente, decaído o con escalofríos, trátenlo como fiebre y llamen al hospital.</span>
          </div>
        ) : null}
        <button
          type="button"
          className="btn"
          disabled={fiebre === "si" && !(Number(temperatura) >= 35 && Number(temperatura) <= 42.5)}
          onClick={() => setFase(p.capturado ? "analizando" : "dedito")}
        >
          Seguir
        </button>
        <button type="button" className="btn fantasma" onClick={p.alPostergar}>
          Ahora no
        </button>
      </div>
    );
  }

  if (fase === "dedito") {
    return (
      <div className="flujo">
        <h2>El dedito de {p.nombreMichi}</h2>
        <p>Pon el dedo índice sobre la nariz del michi y no lo muevas. Mira la sangre que pasa por tus capilares y cuenta las defensas.</p>
        <div className="sensor-zona">
          <svg className="sensor-anillo" viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <linearGradient id="degSensor" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#22D3EE" />
                <stop offset="1" stopColor="#A855F7" />
              </linearGradient>
            </defs>
            <circle className="fondo-c" cx="100" cy="100" r="88" />
            <circle className="prog" cx="100" cy="100" r="88" strokeDasharray="553" strokeDashoffset={553 * (1 - avance)} />
          </svg>
          <button
            type="button"
            id="huella"
            className={`huella${midiendo ? " activa" : ""}`}
            onPointerDown={(e) => {
              e.preventDefault();
              arrancar();
            }}
            onPointerUp={soltar}
            onPointerLeave={soltar}
            onPointerCancel={soltar}
            onKeyDown={(e) => teclado(e, true)}
            onKeyUp={(e) => teclado(e, false)}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Mantén presionado para medir"
          >
            🫆
          </button>
        </div>
        <div className="cuenta" aria-live="polite">
          {midiendo ? `Midiendo… ${Math.ceil(p.segundos * (1 - avance))} s` : avance > 0 ? "Se movió el dedito. Vuelve a apoyarlo." : "Mantén el dedo apoyado"}
        </div>
        <button
          type="button"
          className="btn fantasma"
          onClick={() => {
            if (midiendo) detener(false);
            p.alPostergar();
          }}
        >
          Ahora no
        </button>
      </div>
    );
  }

  if (fase === "analizando") {
    return (
      <div className="flujo">
        <h2>{p.nombreMichi} está pensando…</h2>
        <p>Estabiliza la imagen, mide la velocidad de la sangre y cuenta los huecos ópticos que dejan las células blancas al pasar.</p>
        <div className="sensor-zona">
          <div className="huella activa" aria-hidden="true" style={{ fontSize: 44 }}>
            🔬
          </div>
        </div>
        <div className="cuenta" aria-live="polite">
          {PASOS_ANALISIS[pasoAnalisis]}
        </div>
      </div>
    );
  }

  if (fase === "resultado") {
    if (!resultado) {
      return (
        <div className="flujo">
          <h2>No pude guardar el tamizaje</h2>
          <div className="franja alerta">
            <span className="e">⚠️</span>
            <span>{error ?? "Error desconocido"}</span>
          </div>
          <p>Si el niño tiene fiebre o se ve mal, no esperen: llamen al hospital o vayan a emergencias.</p>
          <button type="button" className="btn" onClick={() => p.alTerminar(null)}>
            Entendido
          </button>
        </div>
      );
    }
    const t = TEXTOS_RESULTADO[resultado.estado];
    const frase = !resultado.escaladoPorFiebre
      ? t.frase
      : resultado.estado === "priorizable"
        ? "Hay fiebre y el michi no puede descartar que las defensas estén bajas. El INSN ya fue avisado y va a llamar."
        : "Hay fiebre. Aunque las defensas se ven bien, el médico tiene que evaluarlo hoy.";
    return (
      <div className="flujo">
        <div className={`resultado ${resultado.estado}`}>
          <div className="emblema" aria-hidden="true">
            {t.emblema}
          </div>
          <div className="titulo">{t.titulo}</div>
          <p>{frase}</p>
        </div>
        <div className="datos">
          <div className="dato">
            <div className="k">Defensas estimadas</div>
            <div className="v">{resultado.ancEstimado === null ? "—" : `${NUM.format(resultado.ancEstimado)} /µL`}</div>
          </div>
          <div className="dato">
            <div className="k">Rango probable</div>
            <div className="v chico">
              {resultado.icInferior === null ? "—" : NUM.format(resultado.icInferior)}–{resultado.icSuperior === null ? "∞" : NUM.format(resultado.icSuperior)}
            </div>
          </div>
          <div className="dato">
            <div className="k">Capilares leídos</div>
            <div className="v">{resultado.capilares}</div>
          </div>
          <div className="dato">
            <div className="k">Huecos contados</div>
            <div className="v">{resultado.eventos}</div>
          </div>
        </div>
        {resultado.escaladoPorFiebre ? (
          <div className="franja alerta">
            <span className="e">🌡️</span>
            <span>Hubo fiebre: la fiebre sube la alerta y nunca la baja.</span>
          </div>
        ) : null}
        <div className={`franja ${resultado.estado === "estable" ? "ok" : "alerta"}`}>
          <span className="e">{resultado.estado === "estable" ? "✅" : "📞"}</span>
          <span>{t.conducta}</span>
        </div>
        <div className="nota">{t.nota}</div>
        {resultado.simulado ? <div className="etiqueta-simulado">Prototipo: el número es simulado; el triaje y la referencia son reales.</div> : null}
        {error ? <div className="franja alerta">{error}</div> : null}
        {resultado.estado !== "estable" ? (
          <button type="button" id="tele" className={`btn ${resultado.estado === "priorizable" ? "peligro" : ""}`} onClick={() => setFase("teleconsulta")}>
            Abrir teleconsulta ahora
          </button>
        ) : null}
        <button type="button" className={`btn ${resultado.estado === "estable" ? "" : "fantasma"}`} onClick={() => p.alTerminar(resultado)}>
          Entendido
        </button>
      </div>
    );
  }

  if (fase === "teleconsulta" && resultado) {
    const urgente = resultado.estado === "priorizable";
    if (respuesta) {
      return (
        <div className="flujo">
          <h2>Teleconsulta enviada</h2>
          <div className={`franja ${urgente ? "alerta" : "info"}`}>
            <span className="e">{urgente ? "🚑" : "👩‍⚕️"}</span>
            <span>{urgente ? "Prioridad alta: respuesta en menos de 15 minutos y el ingreso por emergencia ya está habilitado." : "El médico asignado responde hoy, en menos de 6 horas."}</span>
          </div>
          <div className="datos">
            <div className="dato">
              <div className="k">Solicitud</div>
              <div className="v chico">{respuesta.teleconsulta.id.slice(3, 11).toUpperCase()}</div>
            </div>
            <div className="dato">
              <div className="k">Responde</div>
              <div className="v chico">{respuesta.teleconsulta.responsable || "Hematología"}</div>
            </div>
          </div>
          <button type="button" className="btn menta" onClick={() => p.alTerminar(resultado)}>
            Entendido
          </button>
        </div>
      );
    }
    return (
      <div className="flujo">
        <h2>{urgente ? "Teleconsulta prioritaria" : "Teleconsulta"}</h2>
        <p>El resultado, la etapa del tratamiento y los datos de contacto viajan al INSN San Borja.</p>
        <div className={`franja ${urgente ? "alerta" : "info"}`}>
          <span className="e">{urgente ? "🚑" : "👩‍⚕️"}</span>
          <span>{urgente ? "Además de la teleconsulta se habilita el ingreso por emergencia." : "El médico asignado responde el mismo día."}</span>
        </div>
        <p className="pregunta">¿Pueden viajar a Lima si el médico lo indica?</p>
        {error ? <div className="franja alerta">{error}</div> : null}
        <button type="button" id="siLima" className="btn menta" disabled={ocupado} onClick={() => void pedirTeleconsulta(true)}>
          Sí, podemos ir
        </button>
        <button type="button" id="noLima" className="btn fantasma" disabled={ocupado} onClick={() => void pedirTeleconsulta(false)}>
          No podemos viajar a Lima
        </button>
      </div>
    );
  }

  if (fase === "referencia" && respuesta?.referencia) {
    const r = respuesta.referencia;
    return (
      <div className="flujo">
        <h2>Referencia generada</h2>
        <p>No hace falta viajar a Lima. La teleconsulta emitió una referencia al establecimiento capaz más cercano a su casa.</p>
        <div className="tarjeta destino">
          <h3>{r.destinoNombre}</h3>
          <p>
            {r.destinoCiudad}, {r.destinoDepartamento}
          </p>
        </div>
        {r.horasEvitadas > 0 ? (
          <div className="franja ok">
            <span className="e">🚌</span>
            <span>
              Se evitan unas <b>{Math.round(r.horasEvitadas)} horas</b> de viaje ida y vuelta a Lima.
            </span>
          </div>
        ) : null}
        {r.advertencias.map((a) => (
          <div key={a} className="nota">
            {a}
          </div>
        ))}
        <button
          type="button"
          id="okReferencia"
          className="btn menta"
          onClick={() => {
            p.efectos.decir("Ya está. No tienen que ir hasta Lima 💜", 4200);
            p.alTerminar(resultado);
          }}
        >
          Entendido
        </button>
      </div>
    );
  }

  return null;
}
