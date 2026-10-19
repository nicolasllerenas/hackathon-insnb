import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EntradaTamizaje, ResumenFamilia, Tamizaje } from "@compartido/contratos/clinica";
import { NOMBRE_TIPO_CITA } from "@compartido/contratos/clinica";
import { textoVentana } from "@compartido/dominio/alertas";
import type { EstadoPaciente } from "@compartido/dominio/estados";
import { diasEntre, edadEnAnios, fechaLocalISO, mesCorto } from "@compartido/dominio/fechas";
import { normalizarCodigo } from "@compartido/dominio/identificadores";
import { PERFILES, tamizajePendiente } from "@compartido/dominio/tratamiento";
import { esErrorMichi, mensajeDeError } from "@compartido/errores";
import { CODIGO_DEMO } from "@compartido/semilla";
import { useAvisos } from "../componentes/Avisos";
import { FORMA_ESTADO } from "../componentes/Insignia";
import { Tour, type PasoTour } from "../componentes/Tour";
import { useDatos } from "../datos/contexto";
import { notificarEnSistema, pedirPermisoDeNotificaciones } from "../notificaciones";
import { robot } from "../robot/conexion";
import { aEntradaLatido, DESCRIPCION_ORDEN, ORDENES } from "../robot/protocolo";
import { useAlLatido, useRobot } from "../robot/useRobot";
import { campanita, maullido, ronroneo, tono, vibrar } from "../sonido/sintetizador";
import { Confeti } from "./Confeti";
import { FRASES_AL_TOCAR, LECCIONES, LOGROS, PRENDAS, SENALES_DE_ALARMA } from "./contenido";
import { Gato } from "./Gato";
import {
  alimentar,
  aprenderLeccion,
  cargarJuego,
  comprarOPonerPrenda,
  desgastar,
  dormir,
  expresionBase,
  jugar,
  LLAVE_JUEGO,
  logrosPendientes,
  mimar,
  otorgarLogros,
  postergar,
  registrarTamizajeEnJuego,
  type Cara,
  type EstadoJuego,
  type ResultadoAccion,
} from "./juego";
import { FlujoTamizaje, type Fase } from "./Tamizaje";

type Vista = "michi" | "agenda" | "aprender" | "premios";

type ModalMichi =
  | { tipo: "bienvenida" }
  | { tipo: "leccion"; id: string; paso: number }
  | { tipo: "tamizaje"; automatico: boolean; forzar: EstadoPaciente | null; segundos: number; capturado: boolean; clave: number };

interface Aviso {
  titulo: string;
  cuerpo: string;
  icono: string;
  hora: string;
}

interface Corazon {
  id: number;
  emoji: string;
  left: number;
  top: number;
  delay: number;
}

let registroSW: ServiceWorkerRegistration | null = null;
export function fijarRegistroSW(r: ServiceWorkerRegistration | null): void {
  registroSW = r;
}

const ACCIONES = { alimentar, jugar, mimar, dormir } as const;

export function AppMichi() {
  const { plataforma, avisarCambio } = useDatos();
  const { avisar } = useAvisos();
  const [juego, setJuego] = useState<EstadoJuego>(() => cargarJuego(safeLeer()));
  const [vista, setVista] = useState<Vista>("michi");
  const [modal, setModal] = useState<ModalMichi | null>(null);
  const [globo, setGlobo] = useState<string | null>(null);
  const [caraTemporal, setCaraTemporal] = useState<Cara | null>(null);
  const [gesto, setGesto] = useState<"saltando" | "meneo" | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [corazones, setCorazones] = useState<Corazon[]>([]);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [premio, setPremio] = useState<{ icono: string; texto: string } | null>(null);
  const [confeti, setConfeti] = useState(0);
  const [tour, setTour] = useState(false);
  const [codigoEscrito, setCodigoEscrito] = useState("");
  const [nombreEscrito, setNombreEscrito] = useState("");
  const [errorVinculo, setErrorVinculo] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const instanteRobot = useRobot();
  const temporizadores = useRef<Record<string, number>>({});
  const toques = useRef(0);
  const idCorazon = useRef(1);
  const esperandoRobot = useRef(false);
  const atendidasRobot = useRef<number | null>(null);
  const juegoRef = useRef(juego);
  const segundosDemo = useRef(8);

  const fijar = useCallback((e: EstadoJuego) => {
    juegoRef.current = e;
    setJuego(e);
  }, []);

  useEffect(() => {
    juegoRef.current = juego;
    try {
      window.localStorage.setItem(LLAVE_JUEGO, JSON.stringify(juego));
    } catch {
      return;
    }
  }, [juego]);

  const vinculo = juego.vinculo;
  const resumen = useQuery({
    queryKey: [plataforma.modo, "clinica", "familia", vinculo?.codigo],
    queryFn: () => plataforma.clinica.resumenFamilia((vinculo as NonNullable<typeof vinculo>).codigo),
    enabled: Boolean(vinculo),
    refetchInterval: 60_000,
  });
  const datos: ResumenFamilia | undefined = resumen.data;
  const desvinculado = resumen.isError && esErrorMichi(resumen.error) && resumen.error.codigo === "no_encontrado";

  const temporizar = useCallback((clave: string, ms: number, fn: () => void) => {
    window.clearTimeout(temporizadores.current[clave]);
    temporizadores.current[clave] = window.setTimeout(fn, ms);
  }, []);

  useEffect(() => {
    const t = temporizadores.current;
    return () => Object.values(t).forEach((id) => window.clearTimeout(id));
  }, []);

  const decir = useCallback(
    (texto: string, ms = 3200) => {
      setGlobo(texto);
      temporizar("globo", ms, () => setGlobo(null));
    },
    [temporizar],
  );

  const ponerCara = useCallback(
    (c: Cara, ms = 1800) => {
      setCaraTemporal(c);
      temporizar("cara", ms, () => setCaraTemporal(null));
    },
    [temporizar],
  );

  const hacerGesto = useCallback(
    (g: "saltando" | "meneo", ms = 600) => {
      setGesto(g);
      temporizar("gesto", ms, () => setGesto(null));
    },
    [temporizar],
  );

  const lanzarCorazones = useCallback((emoji = "💜", cantidad = 5) => {
    const nuevos = Array.from({ length: cantidad }, (_, i) => ({
      id: idCorazon.current++,
      emoji,
      left: 35 + Math.random() * 30,
      top: 48 + Math.random() * 14,
      delay: i * 0.11,
    }));
    setCorazones((c) => [...c, ...nuevos]);
    window.setTimeout(() => setCorazones((c) => c.filter((x) => !nuevos.some((n) => n.id === x.id))), 1800);
  }, []);

  const celebrar = useCallback(
    (icono: string, texto: string) => {
      setPremio({ icono, texto });
      setConfeti((n) => n + 1);
      campanita();
      vibrar([25, 60, 25]);
      ponerCara("feliz", 2600);
      hacerGesto("saltando");
      temporizar("premio", 2000, () => setPremio(null));
    },
    [hacerGesto, ponerCara, temporizar],
  );

  const revisarLogros = useCallback(
    (estado: EstadoJuego, hechos: number) => {
      const nuevos = logrosPendientes(estado, hechos);
      if (!nuevos.length) return estado;
      const primero = LOGROS.find((l) => l.id === nuevos[0]);
      if (primero) window.setTimeout(() => celebrar(primero.medalla, primero.titulo), 900);
      return otorgarLogros(estado, nuevos);
    },
    [celebrar],
  );

  const notificar = useCallback(
    (titulo: string, cuerpo: string, icono = "🐱", exigeTamizaje = false) => {
      setAviso({ titulo, cuerpo, icono, hora: new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) });
      campanita();
      window.setTimeout(() => maullido({ tono: 580, dur: 0.55 }), 260);
      vibrar([40, 60, 40]);
      notificarEnSistema({ titulo, cuerpo, exigeTamizaje, registro: registroSW });
      temporizar("aviso", 7000, () => setAviso(null));
      if (exigeTamizaje) setJuego((j) => ({ ...j, alertasEmitidas: j.alertasEmitidas + 1 }));
    },
    [temporizar],
  );

  const enviarLatido = useCallback(() => {
    const j = juegoRef.current;
    if (!j.vinculo?.serie) return;
    const ultimo = robot.obtener().ultimoLatido;
    plataforma.dispositivos
      .registrarLatido(j.vinculo.serie, j.vinculo.codigo, {
        origen: "app",
        bateriaPct: ultimo?.bateriaPct ?? null,
        alertasEmitidas: j.alertasEmitidas,
        alertasAtendidas: j.alertasAtendidas,
        silenciamientos: j.postergaciones,
        escalado: j.postergaciones >= 3,
      })
      .then(() => avisarCambio(["dispositivos"]))
      .catch(() => undefined);
  }, [avisarCambio, plataforma]);

  useEffect(() => {
    if (!vinculo?.serie) return;
    enviarLatido();
    const t = window.setInterval(enviarLatido, 15 * 60_000);
    return () => window.clearInterval(t);
  }, [vinculo?.serie, enviarLatido]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setJuego((j) => desgastar(j));
      if (juegoRef.current.animo < 25 && Math.random() < 0.4) {
        maullido({ tono: 430, dur: 0.75, tristeza: 0.6 });
        decir("Me siento solito…", 3000);
        ponerCara("triste", 3000);
      }
    }, 26_000);
    return () => window.clearInterval(t);
  }, [decir, ponerCara]);

  const abrirTamizaje = useCallback(
    (opciones: Partial<Omit<Extract<ModalMichi, { tipo: "tamizaje" }>, "tipo" | "clave">> = {}) => {
      if (!juegoRef.current.vinculo) {
        setModal({ tipo: "bienvenida" });
        return;
      }
      setModal({
        tipo: "tamizaje",
        automatico: opciones.automatico ?? false,
        forzar: opciones.forzar ?? null,
        segundos: opciones.segundos ?? segundosDemo.current,
        capturado: opciones.capturado ?? false,
        clave: Date.now(),
      });
    },
    [],
  );

  useAlLatido((latido) => {
    const j = juegoRef.current;
    if (j.vinculo?.serie) {
      plataforma.dispositivos
        .registrarLatido(j.vinculo.serie, j.vinculo.codigo, aEntradaLatido(latido, "robot"))
        .then(() => avisarCambio(["dispositivos"]))
        .catch(() => undefined);
    }
    const previas = atendidasRobot.current;
    atendidasRobot.current = latido.alertasAtendidas;
    if (esperandoRobot.current && previas !== null && latido.alertasAtendidas > previas) {
      esperandoRobot.current = false;
      decir("¡Listo! Ya vi tu dedito 💜", 2600);
      abrirTamizaje({ capturado: true });
    }
  });

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const alMensaje = (e: MessageEvent<{ tipo?: string; accion?: string }>) => {
      if (e.data?.tipo !== "notificacion") return;
      if (e.data.accion === "abrir") abrirTamizaje();
      else if (e.data.accion === "despues") {
        setJuego((j) => postergar(j));
        maullido({ tono: 420, dur: 0.8, tristeza: 0.7 });
      }
    };
    navigator.serviceWorker.addEventListener("message", alMensaje);
    return () => navigator.serviceWorker.removeEventListener("message", alMensaje);
  }, [abrirTamizaje]);

  const vincular = useCallback(
    async (codigo: string, nombre: string) => {
      setVinculando(true);
      setErrorVinculo(null);
      try {
        const normalizado = normalizarCodigo(codigo);
        const r = await plataforma.clinica.resumenFamilia(normalizado);
        setJuego((j) => ({
          ...j,
          vinculo: { codigo: normalizado, pacienteId: r.pacienteId, serie: r.serieMichi },
          nombreMichi: nombre.trim() || r.nombreMichi || j.nombreMichi,
          visto: true,
        }));
        setModal(null);
        maullido({ tono: 620, dur: 0.6 });
        window.setTimeout(() => {
          setConfeti((n) => n + 1);
          decir(`¡Miau! Hola, ${r.nombres} 💜`, 3200);
          ponerCara("amor", 2600);
        }, 300);
      } catch (e) {
        setErrorVinculo(
          esErrorMichi(e) && e.codigo === "no_encontrado"
            ? "Ese código no corresponde a ningún michi. Revísalo con el médico."
            : mensajeDeError(e),
        );
      } finally {
        setVinculando(false);
      }
    },
    [decir, plataforma, ponerCara],
  );

  useEffect(() => {
    const demo = new URLSearchParams(window.location.search).has("demo");
    if (demo) {
      if (!juegoRef.current.vinculo) void vincular(CODIGO_DEMO, "Nube");
      const t = window.setTimeout(() => setTour(true), 1200);
      return () => window.clearTimeout(t);
    }
    if (!juegoRef.current.visto || !juegoRef.current.vinculo) {
      const t = window.setTimeout(() => setModal({ tipo: "bienvenida" }), 500);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      decir("¡Volviste! Te extrañé 💜", 3000);
      ponerCara("feliz", 2400);
    }, 700);
    return () => window.clearTimeout(t);
  }, [decir, ponerCara, vincular]);

  const pendiente = datos ? tamizajePendiente(datos.etapa, datos.tamizajes.at(-1)?.momento ?? null) : !vinculo;

  const pacienteVinculado = datos?.pacienteId ?? null;
  useEffect(() => {
    if (!pacienteVinculado || tour || !pendiente) return undefined;
    const t = window.setTimeout(
      () => notificar(`${juegoRef.current.nombreMichi} te está llamando`, "Toca ponerte el dedito. Es un minuto y cuida tus defensas.", "🫆", true),
      3500,
    );
    return () => window.clearTimeout(t);
  }, [pacienteVinculado, tour, pendiente, notificar]);

  const tamizajesHechos = datos?.tamizajes.length ?? 0;
  const accionCuidado = useCallback((nombre: keyof typeof ACCIONES) => {
    const r: ResultadoAccion = ACCIONES[nombre](juegoRef.current);
    if (r.mensaje) decir(r.mensaje, 2400);
    fijar(nombre === "mimar" && r.ok ? revisarLogros(r.estado, tamizajesHechos) : r.estado);
    if (!r.ok) {
      if (nombre === "jugar") ponerCara("dormido", 2000);
      return;
    }
    if (nombre === "alimentar") {
      lanzarCorazones("🐟", 4);
      maullido({ tono: 470, dur: 0.5 });
      ponerCara("feliz", 1800);
      vibrar(20);
    } else if (nombre === "jugar") {
      hacerGesto("saltando", 620);
      lanzarCorazones("⭐", 5);
      maullido({ tono: 640, dur: 0.48 });
      vibrar([15, 40, 15]);
    } else if (nombre === "mimar") {
      lanzarCorazones("💜", 6);
      ponerCara("amor", 2400);
      ronroneo(2.2);
      vibrar([12, 30, 12, 30, 12]);
    } else {
      ponerCara("dormido", 3000);
      ronroneo(3);
    }
  }, [decir, fijar, hacerGesto, lanzarCorazones, ponerCara, revisarLogros, tamizajesHechos]);

  const tocarGato = useCallback(() => {
    toques.current += 1;
    if (toques.current % 4 === 0) {
      hacerGesto("saltando", 600);
      maullido({ tono: 610 });
    } else {
      hacerGesto("meneo", 1500);
      maullido({ tono: 520 + Math.random() * 90, dur: 0.5 });
    }
    ponerCara("feliz", 1600);
    lanzarCorazones("💜", 3);
    vibrar(18);
    decir(FRASES_AL_TOCAR[toques.current % FRASES_AL_TOCAR.length] as string, 2400);
    setJuego((j) => ({ ...j, animo: Math.min(100, j.animo + 1) }));
  }, [decir, hacerGesto, lanzarCorazones, ponerCara]);

  const irA = useCallback((v: Vista) => {
    setVista(v);
    tono(700, 0.09, 0.06);
  }, []);

  const registrar = useCallback(
    async (entrada: EntradaTamizaje) => {
      const j = juegoRef.current;
      if (!j.vinculo) throw new Error("El michi no está vinculado");
      const t = await plataforma.clinica.registrarTamizajeFamilia(j.vinculo.codigo, entrada);
      avisarCambio(["clinica"]);
      return t;
    },
    [avisarCambio, plataforma],
  );

  const solicitarTeleconsulta = useCallback(
    async (tamizajeId: string, puedeViajar: boolean) => {
      const j = juegoRef.current;
      if (!j.vinculo) throw new Error("El michi no está vinculado");
      const r = await plataforma.clinica.solicitarTeleconsultaFamilia(j.vinculo.codigo, { tamizajeId, puedeViajarALima: puedeViajar });
      avisarCambio(["clinica"]);
      return r;
    },
    [avisarCambio, plataforma],
  );

  const terminarTamizaje = (t: Tamizaje | null) => {
    setModal(null);
    if (!t) return;
    const hechos = (datos?.tamizajes.length ?? 0) + 1;
    const tras = registrarTamizajeEnJuego(juegoRef.current, t.estado === "estable");
    const bono = t.estado === "estable" ? 25 : 15;
    fijar(revisarLogros({ ...tras, monedas: tras.monedas + bono }, hechos));
    celebrar("🐟", "¡Gracias por cuidarme!");
    window.setTimeout(enviarLatido, 300);
  };

  const postergarTamizaje = () => {
    setModal(null);
    const tras = postergar(juegoRef.current);
    fijar(tras);
    window.setTimeout(() => {
      maullido({ tono: 420, dur: 0.8, tristeza: 0.7 });
      ponerCara("triste", 3000);
      decir(tras.postergaciones >= 2 ? `Ya van ${tras.postergaciones} veces… voy a avisarle al hospital.` : "Bueno… pero no te olvides de mí.", 3600);
      if (tras.postergaciones >= 3) {
        window.setTimeout(() => notificar("El hospital fue avisado", "El michi no recibió tu dedito en 3 recordatorios. El INSN San Borja va a llamar.", "🏥"), 1400);
      }
    }, 500);
    window.setTimeout(enviarLatido, 300);
  };

  const comprar = (id: string) => {
    const r = comprarOPonerPrenda(juegoRef.current, id);
    if (!r.ok) {
      if (r.mensaje) decir(r.mensaje, 2600);
      tono(220, 0.2, 0.1, "square");
      irA("michi");
      return;
    }
    fijar(r.estado);
    if (r.mensaje) celebrar(PRENDAS.find((p) => p.id === id)?.emoji ?? "🎁", r.mensaje);
    else {
      tono(660, 0.16, 0.1);
      vibrar(15);
    }
  };

  const avanzarLeccion = () => {
    if (modal?.tipo !== "leccion") return;
    const l = LECCIONES.find((x) => x.id === modal.id);
    if (!l) return;
    if (modal.paso < l.cuerpo.length - 1) {
      tono(760, 0.1, 0.08);
      setModal({ ...modal, paso: modal.paso + 1 });
      return;
    }
    setModal(null);
    const r = aprenderLeccion(juegoRef.current, l.id);
    if (r.nuevo) {
      fijar(revisarLogros(r.estado, datos?.tamizajes.length ?? 0));
      celebrar("🎓", `¡Lección aprendida! +${r.premio} 🐟`);
    }
  };

  const acciones = useRef({ irA, tocarGato, accionCuidado, notificar, abrirTamizaje, decir, ponerCara, lanzarCorazones, setModal, setJuego });
  useEffect(() => {
    acciones.current = { irA, tocarGato, accionCuidado, notificar, abrirTamizaje, decir, ponerCara, lanzarCorazones, setModal, setJuego };
  }, [irA, tocarGato, accionCuidado, notificar, abrirTamizaje, decir, ponerCara, lanzarCorazones]);

  const pasosTour = useMemo<PasoTour[]>(() => {
    const a = () => acciones.current;
    const clic = (id: string) => document.getElementById(id)?.click();
    return [
      {
        texto: "Este es el <b>michi digital</b>: el mismo gato que el niño se lleva a casa, en su celular. Respira, parpadea y sigue lo que pasa en la pantalla.",
        ms: 4200,
        foco: "#gato",
        accion: () => {
          a().setModal(null);
          a().irA("michi");
          a().ponerCara("feliz", 3000);
          a().decir("¡Hola! Soy tu michi 💜", 3500);
        },
      },
      {
        texto: "El niño lo toca y el gato responde: <b>maúlla, salta y pide más</b>. Todo el audio se sintetiza dentro de la app, sin archivos ni internet.",
        ms: 3800,
        accion: () => {
          a().tocarGato();
          window.setTimeout(() => a().tocarGato(), 1200);
          window.setTimeout(() => a().tocarGato(), 2400);
        },
      },
      {
        texto: "Lo cuida como a un Pou: <b>comer, jugar, mimar y dormir</b>. El ronroneo es ruido modulado a 26 hercios, como el de un gato real.",
        ms: 5000,
        foco: ".acciones",
        accion: () => {
          a().accionCuidado("mimar");
          window.setTimeout(() => a().accionCuidado("alimentar"), 2400);
        },
      },
      {
        texto: "El <b>rol educativo</b>: seis lecciones que hoy nadie le explica a la familia.",
        ms: 3400,
        foco: "[data-leccion='mp6']",
        accion: () => a().irA("aprender"),
      },
      {
        texto: "<b>Las tres reglas de la 6-MP</b>: de noche, sin leche, siempre igual. Tomar menos del 95 % de las dosis multiplica por 2.7 el riesgo de recaída.",
        ms: 6500,
        accion: () => {
          a().setModal({ tipo: "leccion", id: "mp6", paso: 0 });
          window.setTimeout(() => clic("siguienteLeccion"), 2000);
          window.setTimeout(() => clic("siguienteLeccion"), 4000);
        },
      },
      {
        texto: "La familia gana pescaditos, rachas, ropita y logros. Para el niño es un juego. <b>Para el sistema es adherencia.</b>",
        ms: 5000,
        foco: ".tienda",
        accion: () => {
          a().setModal(null);
          a().setJuego((j) => ({ ...j, monedas: Math.max(j.monedas, 220) }));
          a().irA("premios");
          window.setTimeout(() => document.querySelector<HTMLButtonElement>("[data-prenda='lazo']")?.click(), 1200);
          window.setTimeout(() => document.querySelector<HTMLButtonElement>("[data-prenda='corona']")?.click(), 3000);
        },
      },
      {
        texto: "<b>Primera alerta: la de la app.</b> Suena como el «yape»: campanita más un miau. Trae el recordatorio de la cita como notificación push del sistema.",
        ms: 5600,
        accion: () => {
          a().irA("michi");
          a().notificar("Recordatorio de control", "Pasado mañana 9:00 a. m. — Control con Hematología, INSN San Borja.", "📅");
        },
      },
      {
        texto: "La de la <b>medicación</b> sale a las 9 de la noche, todos los días del mantenimiento.",
        ms: 4600,
        accion: () => a().notificar("Hora de la 6-MP", "De noche, sin leche, y siempre de la misma forma.", "💊"),
      },
      {
        texto: "<b>Segunda alerta: la del juguete.</b> El gato maúlla pidiendo el dedito <b>después del horario de trabajo del papá</b>, no a media mañana.",
        ms: 5400,
        accion: () => {
          a().notificar("Michi te está llamando", "Toca ponerte el dedito. Es un minuto y cuida tus defensas.", "🫆", true);
          window.setTimeout(() => {
            maullido({ tono: 500, dur: 0.9 });
            a().ponerCara("triste", 2000);
            a().decir("Miaaau… ponme el dedito 🥺", 3600);
          }, 1600);
        },
      },
      {
        texto: "El niño apoya el dedo en la nariz del gato. <b>El gato ronronea mientras mide</b> para que no lo retire. En el aparato real son 60 segundos.",
        ms: 6400,
        accion: () => {
          segundosDemo.current = 4;
          a().abrirTamizaje({ automatico: true, forzar: "grave", segundos: 4 });
        },
      },
      {
        texto: "Resultado: <b>grave</b>. El límite inferior del intervalo quedó bajo 500/µL. No es emergencia todavía, pero no espera a mañana: se abre teleconsulta.",
        ms: 6000,
        foco: ".resultado",
        accion: () => {
          segundosDemo.current = 8;
        },
      },
      {
        texto: "La pieza que cambia el abandono: <b>«no podemos viajar a Lima»</b> tiene respuesta.",
        ms: 4000,
        foco: "#noLima",
        retrasoFoco: 700,
        accion: () => clic("tele"),
      },
      {
        texto: "El sistema <b>no dice «venga a Lima»</b>: emite la referencia al establecimiento capaz más cercano y calcula las horas de viaje que evita.",
        ms: 6500,
        accion: () => clic("noLima"),
      },
      {
        texto: "En la agenda queda todo: las citas, la <b>etapa del tratamiento</b> y los tamizajes. El mantenimiento dura dos años y ahí ocurre casi todo el abandono.",
        ms: 5600,
        accion: () => {
          clic("okReferencia");
          a().setModal(null);
          a().irA("agenda");
        },
      },
      {
        texto: "Eso es el michi. <b>No mandamos otro recordatorio: mandamos un gato.</b>",
        ms: 5000,
        accion: () => {
          a().irA("michi");
          a().ponerCara("amor", 4000);
          a().lanzarCorazones("💜", 8);
          a().decir("¡Gracias por cuidarme! 💜", 4000);
          ronroneo(3);
        },
      },
    ];
  }, []);

  const cara: Cara = caraTemporal ?? expresionBase(juego);
  const perfilEtapa = datos ? PERFILES[datos.etapa] : null;
  const hoy = fechaLocalISO();
  const edad = datos ? edadEnAnios(datos.fechaNacimiento) : 7;
  const ultimoAnc = datos?.tamizajes.filter((t) => t.concluyente && t.ancEstimado !== null).at(-1)?.ancEstimado ?? null;

  return (
    <div className="app-michi">
      <div className="estrellas" aria-hidden="true" />
      <header className="cabecera-michi">
        <div className="marca">
          <span className="logo" aria-hidden="true">
            🐱
          </span>
          <div>
            <b>MichiCheck</b>
            <small>{datos ? `Michi de ${datos.nombres}` : "Mi michi"}</small>
          </div>
        </div>
        <span className="chip moneda" aria-label={`${juego.monedas} pescaditos`}>
          🐟 <span className="n">{juego.monedas}</span>
        </span>
        <span className="chip racha" aria-label={`Racha de ${juego.racha} días`}>
          🔥 <span className="n">{juego.racha}</span>
        </span>
        {!tour ? (
          <button
            type="button"
            className="boton-demo"
            onClick={() => {
              void pedirPermisoDeNotificaciones();
              setTour(true);
            }}
          >
            ▶ DEMO
          </button>
        ) : null}
      </header>

      <div className="barras">
        {(
          [
            ["energia", "Energía"],
            ["animo", "Ánimo"],
            ["salud", "Salud"],
          ] as const
        ).map(([clave, nombre]) => (
          <div className="barra" key={clave}>
            <div className="et">
              <span>{nombre}</span>
              <span>{Math.round(juego[clave])}</span>
            </div>
            <div className="pista" role="meter" aria-label={nombre} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(juego[clave])}>
              <div className={`relleno ${clave}`} style={{ width: `${juego[clave]}%` }} />
            </div>
          </div>
        ))}
      </div>

      <main className="principal-michi">
        {vista === "michi" ? (
          <section className="vista" aria-label="Mi michi">
            <div className="escena">
              <div className="suelo" />
              <div className="corazones" aria-hidden="true">
                {corazones.map((c) => (
                  <span key={c.id} style={{ left: `${c.left}%`, top: `${c.top}%`, animationDelay: `${c.delay}s` }}>
                    {c.emoji}
                  </span>
                ))}
              </div>
              <div className={`globo${globo ? " on" : ""}`} aria-live="polite">
                {globo}
              </div>
              <Gato cara={cara} gesto={gesto} escaneando={escaneando} accesorio={juego.prenda} nombre={juego.nombreMichi} alTocar={tocarGato} />
            </div>
            <div className="acciones">
              {(
                [
                  ["alimentar", "🐟", "Comer"],
                  ["jugar", "🧶", "Jugar"],
                  ["mimar", "🤲", "Mimar"],
                  ["dormir", "🌙", "Dormir"],
                ] as const
              ).map(([id, icono, texto]) => (
                <button key={id} type="button" className="acc" onClick={() => accionCuidado(id)}>
                  <span className="ic" aria-hidden="true">
                    {icono}
                  </span>
                  <span className="tx">{texto}</span>
                </button>
              ))}
              <button type="button" className={`acc destacada${pendiente ? " urgente" : ""}`} onClick={() => abrirTamizaje()}>
                <span className="ic" aria-hidden="true">
                  🫆
                </span>
                <span className="tx">Dedito</span>
              </button>
            </div>
          </section>
        ) : null}

        {vista === "agenda" ? (
          <section className="vista hoja" aria-label="Agenda">
            {datos ? (
              <>
                <div className="franja info">
                  <span className="e">⏰</span>
                  <span>
                    El michi maúlla entre las <b>{textoVentana({ finJornada: datos.finJornada, sinHorarioFijo: datos.sinHorarioFijo })}</b>, cuando ya están en casa.
                  </span>
                </div>
                <div className="rotulo">Lo que viene</div>
                {datos.citas.length ? null : <p className="tenue">No hay citas registradas.</p>}
                {datos.citas.map((c) => {
                  const dias = diasEntre(hoy, c.fecha);
                  const fecha = new Date(`${c.fecha}T12:00:00`);
                  const hecha = c.asistio === true;
                  const cuando = hecha ? "Asistido" : dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : dias > 0 ? `En ${dias} días` : `Hace ${-dias} días`;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`cita${hecha ? " hecha" : dias >= 0 && dias <= 3 ? " proxima" : ""}`}
                      onClick={() => {
                        if (!vinculo) return;
                        plataforma.clinica
                          .marcarCitaFamilia(vinculo.codigo, c.id, !hecha)
                          .then(() => {
                            avisarCambio(["clinica"]);
                            void resumen.refetch();
                            if (!hecha) {
                              setJuego((j) => ({ ...j, monedas: j.monedas + 20 }));
                              celebrar("✅", "¡Control cumplido! +20 🐟");
                            }
                          })
                          .catch((e: unknown) => avisar(mensajeDeError(e), "error"));
                      }}
                      aria-pressed={hecha}
                    >
                      <div className="fecha">
                        <div className="d">{fecha.getDate()}</div>
                        <div className="m">{mesCorto(fecha.getMonth())}</div>
                      </div>
                      <div className="info">
                        <b>{NOMBRE_TIPO_CITA[c.tipo]}</b>
                        <span>
                          {c.lugar}
                          {c.hora ? ` · ${c.hora}` : ""} · {cuando}
                        </span>
                      </div>
                      <div className="marca-ok" aria-hidden="true">
                        {hecha ? "✅" : "⏳"}
                      </div>
                    </button>
                  );
                })}
                {perfilEtapa ? (
                  <>
                    <div className="rotulo">Etapa del tratamiento</div>
                    <div className="tarjeta">
                      <h3>{perfilEtapa.nombre}</h3>
                      <p>{perfilEtapa.paraLaFamilia}</p>
                      <div className="datos">
                        <div className="dato">
                          <div className="k">Ámbito</div>
                          <div className="v chico">{perfilEtapa.ambito}</div>
                        </div>
                        <div className="dato">
                          <div className="k">Día de etapa</div>
                          <div className="v">{Math.max(0, diasEntre(datos.inicioEtapa, hoy))}</div>
                        </div>
                        <div className="dato">
                          <div className="k">Control cada</div>
                          <div className="v">{perfilEtapa.diasEntreControles} d</div>
                        </div>
                        <div className="dato">
                          <div className="k">Dedito cada</div>
                          <div className="v">{perfilEtapa.diasEntreTamizajes} d</div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
                <div className="rotulo">Últimos tamizajes</div>
                <div className="tarjeta">
                  {datos.tamizajes.length ? (
                    <ul className="lista-tamizajes">
                      {datos.tamizajes
                        .slice(-7)
                        .reverse()
                        .map((t) => (
                          <li key={t.id}>
                            <span>{new Date(t.momento).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}</span>
                            <span className={`estado-texto ${t.estado}`}>
                              {FORMA_ESTADO[t.estado]} {t.estado}
                            </span>
                            <span className="num">{t.ancEstimado === null ? "—" : `${t.ancEstimado}/µL`}</span>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p>Todavía ninguno. Toca el dedito y el michi hace el primero.</p>
                  )}
                </div>
              </>
            ) : (
              <EstadoVinculo cargando={resumen.isLoading} error={resumen.error} desvinculado={desvinculado} alVincular={() => setModal({ tipo: "bienvenida" })} />
            )}
          </section>
        ) : null}

        {vista === "aprender" ? (
          <section className="vista hoja" aria-label="Aprender">
            <div className="franja ok">
              <span className="e">🎓</span>
              <span>Cada lección da 🐟 y le sube el ánimo a tu michi.</span>
            </div>
            <div className="rotulo">Lecciones</div>
            {LECCIONES.map((l) => {
              const ok = Boolean(juego.lecciones[l.id]);
              return (
                <button key={l.id} type="button" data-leccion={l.id} className={`leccion${ok ? " completa" : ""}`} onClick={() => setModal({ tipo: "leccion", id: l.id, paso: 0 })}>
                  <div className="emo" aria-hidden="true">
                    {l.emo}
                  </div>
                  <div className="cont">
                    <b>{l.titulo}</b>
                    <span>{l.resumen}</span>
                  </div>
                  <div className="estado">{ok ? "✅" : <span className="premio-leccion">+{l.premio}🐟</span>}</div>
                </button>
              );
            })}
            <div className="rotulo">Señales para llamar al hospital hoy mismo</div>
            <div className="tarjeta">
              <ul className="senales">
                {SENALES_DE_ALARMA.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {vista === "premios" ? (
          <section className="vista hoja" aria-label="Premios">
            <div className="rotulo">Ropita del michi</div>
            <div className="rejilla tienda">
              {PRENDAS.map((p) => {
                const tiene = juego.prendas.includes(p.id);
                const puesta = juego.prenda === p.id;
                return (
                  <button key={p.id} type="button" data-prenda={p.id} className={`prenda${puesta ? " puesta" : ""}${tiene ? "" : " bloqueada"}`} onClick={() => comprar(p.id)}>
                    <span className="em" aria-hidden="true">
                      {p.emoji}
                    </span>
                    <span className="nm">{p.nombre}</span>
                    <span className="pr">{tiene ? (puesta ? "puesto" : "tocar") : `${p.precio} 🐟`}</span>
                  </button>
                );
              })}
            </div>
            <div className="rotulo">Logros</div>
            {LOGROS.map((l) => (
              <div key={l.id} className={`logro${juego.logros[l.id] ? " on" : ""}`}>
                <div className="med" aria-hidden="true">
                  {juego.logros[l.id] ? l.medalla : "🔒"}
                </div>
                <div>
                  <b>{l.titulo}</b>
                  <span>{l.texto}</span>
                </div>
              </div>
            ))}
            <div className="rotulo">Mi michi de juguete</div>
            <div className="tarjeta robot-michi">
              <h3>
                {juego.nombreMichi} {vinculo?.serie ? <span className="num tenue">· {vinculo.serie}</span> : null}
              </h3>
              <p>
                {instanteRobot.estado === "conectado"
                  ? instanteRobot.simulado
                    ? "Conectado al simulador del michi."
                    : "Conectado por USB al michi de verdad."
                  : instanteRobot.estado === "no_soportado"
                    ? "Para conectar el gato por cable usa Chrome o Edge en una computadora. Mientras, puedes probar el simulador."
                    : "Conecta el gato de juguete por cable USB para que sus latidos lleguen al hospital."}
              </p>
              {instanteRobot.ultimoLatido ? (
                <div className="datos">
                  <div className="dato">
                    <div className="k">Batería</div>
                    <div className="v">{instanteRobot.ultimoLatido.bateriaPct ?? "—"}%</div>
                  </div>
                  <div className="dato">
                    <div className="k">Alertas atendidas</div>
                    <div className="v">
                      {instanteRobot.ultimoLatido.alertasAtendidas}/{instanteRobot.ultimoLatido.alertasEmitidas}
                    </div>
                  </div>
                </div>
              ) : null}
              {instanteRobot.error ? <div className="franja alerta">{instanteRobot.error}</div> : null}
              <div className="botones-robot">
                {instanteRobot.estado === "conectado" ? (
                  <>
                    <button
                      type="button"
                      className="btn"
                      title={DESCRIPCION_ORDEN.T}
                      onClick={() => {
                        esperandoRobot.current = true;
                        atendidasRobot.current = robot.obtener().ultimoLatido?.alertasAtendidas ?? 0;
                        robot.enviar(ORDENES.pedirTamizaje).catch((e: unknown) => avisar(mensajeDeError(e), "error"));
                        decir("Ahora pon el dedito en mi nariz de verdad 🫆", 3600);
                      }}
                    >
                      Pedirle el dedito al michi
                    </button>
                    <button type="button" className="btn fantasma" onClick={() => robot.enviar(ORDENES.maullar).catch(() => undefined)}>
                      Que maúlle
                    </button>
                    <button type="button" className="btn fantasma" onClick={() => void robot.desconectar()}>
                      Desconectar
                    </button>
                  </>
                ) : (
                  <>
                    {instanteRobot.estado !== "no_soportado" ? (
                      <button type="button" className="btn" disabled={instanteRobot.estado === "conectando"} onClick={() => void robot.conectar()}>
                        {instanteRobot.estado === "conectando" ? "Conectando…" : "Conectar por USB"}
                      </button>
                    ) : null}
                    <button type="button" className="btn fantasma" onClick={() => robot.conectarSimulador()}>
                      Usar el simulador
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="rotulo">Vínculo con el hospital</div>
            <div className="tarjeta">
              {vinculo ? (
                <>
                  <p>
                    Vinculado al INSN San Borja{datos ? ` · ${datos.nombres}` : ""}. Tamizajes: <b>{datos?.tamizajes.length ?? 0}</b> · Lecciones:{" "}
                    <b>
                      {Object.keys(juego.lecciones).length}/{LECCIONES.length}
                    </b>
                  </p>
                  <div className="nota">
                    Cada tamizaje sale del michi al INSN. Si el michi deja de comunicarse tres días, el hospital lo nota y llama. El silencio también es una señal.
                  </div>
                  <button
                    type="button"
                    className="btn fantasma"
                    onClick={() => {
                      setJuego((j) => ({ ...j, vinculo: null }));
                      setModal({ tipo: "bienvenida" });
                    }}
                  >
                    Cambiar de código
                  </button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => setModal({ tipo: "bienvenida" })}>
                  Vincular con el código del hospital
                </button>
              )}
            </div>
            <div className="pie">
              MichiCheck no es un análisis de sangre. Orienta y avisa;
              <br />
              el hemograma y la decisión clínica siguen siendo del hospital.
            </div>
          </section>
        ) : null}
      </main>

      <nav className="nav-michi" aria-label="Secciones">
        {(
          [
            ["michi", "🐱", "Michi"],
            ["agenda", "📅", "Agenda"],
            ["aprender", "🎓", "Aprender"],
            ["premios", "🏆", "Premios"],
          ] as const
        ).map(([id, icono, texto]) => (
          <button key={id} type="button" className={vista === id ? "on" : ""} aria-current={vista === id ? "page" : undefined} onClick={() => irA(id)}>
            <span className="ic" aria-hidden="true">
              {icono}
            </span>
            {texto}
            {id === "agenda" && pendiente ? <span className="punto-aviso" aria-label="Tamizaje pendiente" /> : null}
          </button>
        ))}
      </nav>

      <div
        className={`aviso-yape${aviso ? " on" : ""}`}
        role="alert"
        onClick={() => {
          setAviso(null);
          irA("agenda");
        }}
      >
        <div className="ico" aria-hidden="true">
          {aviso?.icono ?? "🐱"}
        </div>
        <div className="txt">
          <b>{aviso?.titulo}</b>
          <span>{aviso?.cuerpo}</span>
        </div>
        <div className="hora">{aviso?.hora}</div>
      </div>

      {premio ? (
        <div className="premio" aria-live="polite">
          <div className="caja">
            <div className="grande" aria-hidden="true">
              {premio.icono}
            </div>
            <div className="msj">{premio.texto}</div>
          </div>
        </div>
      ) : null}

      {modal ? (
        <div
          className="velo-michi"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && modal.tipo === "leccion") setModal(null);
          }}
        >
          <div className="hoja-modal" role="dialog" aria-modal="true" aria-label="Ventana del michi">
            <div className="asa" />
            {modal.tipo === "bienvenida" ? (
              <form
                className="flujo"
                onSubmit={(e) => {
                  e.preventDefault();
                  void vincular(codigoEscrito, nombreEscrito);
                }}
              >
                <div className="emoji-grande" aria-hidden="true">
                  🐱
                </div>
                <h2 className="centrado">Hola, soy tu michi</h2>
                <p className="centrado">Te voy a acompañar durante todo el tratamiento. Te recuerdo tus controles, te enseño cosas y cuido tus defensas.</p>
                <label className="campo-michi">
                  <span>¿Cómo me quieres llamar?</span>
                  <input value={nombreEscrito} maxLength={24} placeholder={juego.nombreMichi} onChange={(e) => setNombreEscrito(e.target.value)} />
                </label>
                <label className="campo-michi">
                  <span>Código que te dio el médico</span>
                  <input
                    value={codigoEscrito}
                    placeholder="XXXX-XXXX-XXXX"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setCodigoEscrito(e.target.value.toUpperCase())}
                  />
                </label>
                {errorVinculo ? <div className="franja alerta">{errorVinculo}</div> : null}
                <button type="submit" className="btn" disabled={vinculando || normalizarCodigo(codigoEscrito).length !== 14}>
                  {vinculando ? "Buscando…" : "¡Vamos!"}
                </button>
                <button type="button" className="btn fantasma" disabled={vinculando} onClick={() => void vincular(CODIGO_DEMO, nombreEscrito || "Nube")}>
                  Probar con el michi de demostración
                </button>
              </form>
            ) : null}
            {modal.tipo === "leccion" ? <VistaLeccion id={modal.id} paso={modal.paso} aprendida={Boolean(juego.lecciones[modal.id])} alAvanzar={avanzarLeccion} alRetroceder={() => setModal({ ...modal, paso: Math.max(0, modal.paso - 1) })} /> : null}
            {modal.tipo === "tamizaje" && vinculo ? (
              <FlujoTamizaje
                key={modal.clave}
                nombreMichi={juego.nombreMichi}
                edadAnios={edad}
                ultimoAnc={ultimoAnc}
                automatico={modal.automatico}
                segundos={modal.segundos}
                forzar={modal.forzar}
                capturado={modal.capturado}
                origen={instanteRobot.estado === "conectado" && !instanteRobot.simulado ? "michi" : "app"}
                serie={vinculo.serie}
                pacienteId={vinculo.pacienteId}
                efectos={{ escanear: setEscaneando, cara: ponerCara, decir }}
                registrar={registrar}
                solicitarTeleconsulta={solicitarTeleconsulta}
                alPostergar={postergarTamizaje}
                alTerminar={terminarTamizaje}
                avance={(fase: Fase) => {
                  if (fase === "resultado") void resumen.refetch();
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <Confeti disparo={confeti} />
      {tour ? (
        <Tour
          pasos={pasosTour}
          alTerminar={() => {
            setTour(false);
            setModal(null);
            setConfeti((n) => n + 1);
            campanita();
          }}
        />
      ) : null}
    </div>
  );
}

function safeLeer(): string | null {
  try {
    return window.localStorage.getItem(LLAVE_JUEGO);
  } catch {
    return null;
  }
}

function VistaLeccion({ id, paso, aprendida, alAvanzar, alRetroceder }: { id: string; paso: number; aprendida: boolean; alAvanzar: () => void; alRetroceder: () => void }) {
  const l = LECCIONES.find((x) => x.id === id);
  if (!l) return null;
  const ultimo = paso >= l.cuerpo.length - 1;
  return (
    <div className="flujo">
      <div className="emoji-grande" aria-hidden="true">
        {l.emo}
      </div>
      <h2 className="centrado">{l.titulo}</h2>
      <div className="puntos-leccion" aria-hidden="true">
        {l.cuerpo.map((_, i) => (
          <span key={i} className={i === paso ? "actual" : i < paso ? "visto" : ""} />
        ))}
      </div>
      <p className="texto-leccion" dangerouslySetInnerHTML={{ __html: l.cuerpo[paso] ?? "" }} />
      <button type="button" id="siguienteLeccion" className="btn" onClick={alAvanzar}>
        {!ultimo ? "Siguiente" : aprendida ? "Cerrar" : `¡Aprendido! +${l.premio} 🐟`}
      </button>
      {paso > 0 ? (
        <button type="button" className="btn fantasma" onClick={alRetroceder}>
          Atrás
        </button>
      ) : null}
    </div>
  );
}

function EstadoVinculo({ cargando, error, desvinculado, alVincular }: { cargando: boolean; error: unknown; desvinculado: boolean; alVincular: () => void }) {
  if (cargando) return <p className="tenue">Buscando tu agenda…</p>;
  return (
    <div className="tarjeta">
      <h3>{desvinculado ? "Tu michi perdió el vínculo" : "Todavía no hay agenda"}</h3>
      <p>
        {error && !desvinculado
          ? `No pude hablar con el hospital: ${mensajeDeError(error)}`
          : "Escribe el código que te dio el médico en el primer control y aquí aparecerán tus citas y tus tamizajes."}
      </p>
      <button type="button" className="btn" onClick={alVincular}>
        Vincular michi
      </button>
    </div>
  );
}

