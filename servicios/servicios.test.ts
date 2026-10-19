import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AlmacenMemoria } from "../compartido/almacen/memoria.js";
import { AlmacenSql, migrar, type Conexion } from "../compartido/almacen/sql.js";
import type { Almacen } from "../compartido/almacen/tipos.js";
import { ClienteClinica, ClienteDispositivos, ClienteInteroperabilidad, ClienteInvestigacion } from "../compartido/clientes/servicios.js";
import type { EntradaTamizaje, Paciente } from "../compartido/contratos/clinica.js";
import { ErrorMichi } from "../compartido/errores.js";
import { CODIGO_DEMO, generarDemostracion } from "../compartido/semilla.js";
import { crearManejador } from "./plataforma/http.js";
import { conexionPglite } from "./plataforma/conexionPglite.js";
import { ESQUEMA_CLINICA, MIGRACIONES_CLINICA, RUTAS_CLINICA } from "./clinica/rutas.js";
import { ServicioClinica } from "./clinica/servicio.js";
import { ESQUEMA_DISPOSITIVOS, MIGRACIONES_DISPOSITIVOS, RUTAS_DISPOSITIVOS } from "./dispositivos/rutas.js";
import { ServicioDispositivos } from "./dispositivos/servicio.js";
import { ESQUEMA_INTEROP, MIGRACIONES_INTEROP, RUTAS_INTEROP } from "./interoperabilidad/rutas.js";
import { ServicioInteroperabilidad } from "./interoperabilidad/servicio.js";
import { ESQUEMA_INVESTIGACION, MIGRACIONES_INVESTIGACION, RUTAS_INVESTIGACION } from "./investigacion/rutas.js";
import { ServicioInvestigacion } from "./investigacion/servicio.js";

const TOKEN = "token-clinico-de-prueba-1234567890";

type Manejador = (r: Request) => Promise<Response>;

function fetchHacia(manejador: Manejador): typeof fetch {
  return (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    return manejador(new Request(url, init));
  }) as typeof fetch;
}

function clientes(manejadores: Record<string, Manejador>, token: string | null = TOKEN) {
  const op = (nombre: string) => ({ base: `http://michi.test/api/v1/${nombre}`, token: () => token, fetch: fetchHacia(manejadores[nombre]!) });
  return {
    clinica: new ClienteClinica(op("clinica")),
    dispositivos: new ClienteDispositivos(op("dispositivos")),
    interop: new ClienteInteroperabilidad(op("interop")),
    investigacion: new ClienteInvestigacion(op("investigacion")),
  };
}

function montar(almacenes: Record<string, Almacen>, token: string | null = TOKEN): Record<string, Manejador> {
  const entorno = <S>(crear: () => S) => ({ servicio: async () => crear(), token: () => token ?? undefined });
  return {
    clinica: crearManejador({ nombre: "clinica", rutas: RUTAS_CLINICA, entorno: entorno(() => new ServicioClinica(almacenes.clinica!)) }),
    dispositivos: crearManejador({
      nombre: "dispositivos",
      rutas: RUTAS_DISPOSITIVOS,
      entorno: entorno(() => new ServicioDispositivos(almacenes.dispositivos!)),
    }),
    interop: crearManejador({ nombre: "interop", rutas: RUTAS_INTEROP, entorno: entorno(() => new ServicioInteroperabilidad(almacenes.interop!)) }),
    investigacion: crearManejador({
      nombre: "investigacion",
      rutas: RUTAS_INVESTIGACION,
      entorno: entorno(() => new ServicioInvestigacion(almacenes.investigacion!)),
    }),
  };
}

async function esperarError(promesa: Promise<unknown>): Promise<ErrorMichi> {
  try {
    await promesa;
  } catch (e) {
    if (e instanceof ErrorMichi) return e;
    throw e;
  }
  throw new Error("Se esperaba un error");
}

const escenarios: [string, () => Promise<{ almacenes: Record<string, Almacen>; cerrar: () => Promise<void> }>][] = [
  [
    "memoria",
    async () => {
      const a = new AlmacenMemoria();
      return { almacenes: { clinica: a, dispositivos: a, interop: a, investigacion: a }, cerrar: async () => undefined };
    },
  ],
  [
    "postgres (PGlite)",
    async () => {
      const conexion: Conexion = await conexionPglite();
      await migrar(conexion, ESQUEMA_CLINICA, MIGRACIONES_CLINICA);
      await migrar(conexion, ESQUEMA_DISPOSITIVOS, MIGRACIONES_DISPOSITIVOS);
      await migrar(conexion, ESQUEMA_INTEROP, MIGRACIONES_INTEROP);
      await migrar(conexion, ESQUEMA_INVESTIGACION, MIGRACIONES_INVESTIGACION);
      return {
        almacenes: {
          clinica: new AlmacenSql(ESQUEMA_CLINICA, conexion),
          dispositivos: new AlmacenSql(ESQUEMA_DISPOSITIVOS, conexion),
          interop: new AlmacenSql(ESQUEMA_INTEROP, conexion),
          investigacion: new AlmacenSql(ESQUEMA_INVESTIGACION, conexion),
        },
        cerrar: () => conexion.cerrar(),
      };
    },
  ],
];

describe.each(escenarios)("servicios sobre %s", (_nombre, preparar) => {
  let almacenes: Record<string, Almacen>;
  let cerrar: () => Promise<void>;
  let api: ReturnType<typeof clientes>;
  let manejadores: Record<string, Manejador>;

  beforeAll(async () => {
    ({ almacenes, cerrar } = await preparar());
    manejadores = montar(almacenes);
    api = clientes(manejadores);
    const demo = await generarDemostracion(new Date());
    await api.clinica.importar(demo.clinica);
    await api.dispositivos.importar(demo.dispositivos);
    await api.investigacion.importar(demo.investigacion);
  }, 60_000);

  afterAll(async () => {
    await cerrar();
  });

  it("importa la demostración completa", async () => {
    const salud = await api.clinica.salud();
    expect(salud.registros.pacientes).toBe(6);
    expect(salud.registros.tamizajes).toBe(54);
    expect((await api.dispositivos.parque()).length).toBe(6);
    expect((await api.investigacion.listarParticipantes()).length).toBe(4);
  });

  it("ordena y filtra por paciente", async () => {
    const pacientes = await api.clinica.listarPacientes();
    expect(pacientes.map((p) => p.apellidos)).toEqual([...pacientes.map((p) => p.apellidos)].sort((a, b) => a.localeCompare(b, "es")));
    const tamizajes = await api.clinica.listarRegistros("tamizajes", "pac-diego");
    expect(tamizajes).toHaveLength(9);
    expect(tamizajes.at(-1)?.estado).toBe("grave");
  });

  it("el parque de michis marca a Joaquín sin contacto y a Valentina intermitente", async () => {
    const parque = await api.dispositivos.parque();
    const porPaciente = Object.fromEntries(parque.map((e) => [e.michi.pacienteId, e.salud.enlace]));
    expect(porPaciente["pac-joaquin"]).toBe("sin_contacto");
    expect(porPaciente["pac-valentina"]).toBe("intermitente");
    expect(porPaciente["pac-ana"]).toBe("en_linea");
  });

  it("la familia ve solo lo suyo y su tamizaje con fiebre se vuelve priorizable", async () => {
    const resumen = await api.clinica.resumenFamilia(CODIGO_DEMO.toLowerCase());
    expect(resumen.pacienteId).toBe("pac-ana");
    expect(JSON.stringify(resumen)).not.toContain("987654321");
    const entrada: EntradaTamizaje = {
      id: `tam-prueba-${Math.random().toString(36).slice(2)}`,
      pacienteId: "otro-cualquiera",
      momento: new Date().toISOString(),
      origen: "app",
      serie: null,
      concluyente: true,
      ancEstimado: 320,
      icInferior: 150,
      icSuperior: 700,
      capilares: 6,
      eventos: 18,
      volumenNl: 0.3,
      razones: [],
      temperaturaC: 38.7,
      fiebreSostenida: false,
      diasPostQuimio: null,
      simulado: true,
    };
    const t = await api.clinica.registrarTamizajeFamilia(CODIGO_DEMO, entrada);
    expect(t.pacienteId).toBe("pac-ana");
    expect(t.estado).toBe("priorizable");
    expect(t.serie).toBe("MC-3F7A21C0");
    const r = await api.clinica.solicitarTeleconsultaFamilia(CODIGO_DEMO, { tamizajeId: t.id, puedeViajarALima: false });
    expect(r.teleconsulta.prioridad).toBe("tiempo_real");
    expect(r.referencia?.destinoDepartamento).toBe("Amazonas");
    expect(r.referencia?.advertencias.join(" ")).toContain("ANTES del traslado");
  });

  it("un código inexistente no revela nada", async () => {
    const e = await esperarError(api.clinica.resumenFamilia("FFFF-FFFF-FFFF"));
    expect(e.codigo).toBe("no_encontrado");
    expect((await esperarError(api.clinica.resumenFamilia("hola"))).codigo).toBe("validacion");
  });

  it("las rutas clínicas exigen el token y se cierran si el servidor no lo tiene", async () => {
    const sinToken = clientes(manejadores, null);
    expect((await esperarError(sinToken.clinica.listarPacientes())).codigo).toBe("no_autorizado");
    expect((await esperarError(clientes(manejadores, "otro-token-cualquiera-xxxxxxxx").clinica.listarPacientes())).codigo).toBe("no_autorizado");
    const cerrado = clientes(montar(almacenes, null));
    expect((await esperarError(cerrado.clinica.listarPacientes())).codigo).toBe("no_configurado");
    const salud = await sinToken.clinica.salud();
    expect(salud.registros).toEqual({});
  });

  it("valida los datos y devuelve el detalle por campo", async () => {
    const p = await api.clinica.obtenerPaciente("pac-ana");
    const e = await esperarError(api.clinica.guardarPaciente({ ...p, apoderado: { ...p.apoderado, celular: "12345" } }));
    expect(e.codigo).toBe("validacion");
    expect(e.detalles.some((d) => d.campo === "apoderado.celular")).toBe(true);
  });

  it("la historia clínica es única", async () => {
    const p = await api.clinica.obtenerPaciente("pac-ana");
    const duplicado: Paciente = { ...p, id: "pac-duplicado", codigoVinculacion: null, serieMichi: null };
    expect((await esperarError(api.clinica.guardarPaciente(duplicado))).codigo).toBe("conflicto");
  });

  it("guarda, edita y borra en cascada", async () => {
    const p = await api.clinica.obtenerPaciente("pac-camila");
    const nuevo: Paciente = { ...p, id: "pac-nuevo", historiaClinica: "2026-99999", codigoVinculacion: null, serieMichi: null, nombres: "Prueba" };
    await api.clinica.guardarPaciente(nuevo);
    await api.clinica.guardarRegistro("citas", {
      id: "cit-nueva",
      pacienteId: "pac-nuevo",
      fecha: "2026-12-01",
      hora: "10:00",
      tipo: "control",
      lugar: "INSN San Borja",
      asistio: null,
    });
    expect(await api.clinica.listarRegistros("citas", "pac-nuevo")).toHaveLength(1);
    await api.clinica.eliminarPaciente("pac-nuevo");
    expect(await api.clinica.listarRegistros("citas", "pac-nuevo")).toHaveLength(0);
    expect((await esperarError(api.clinica.obtenerPaciente("pac-nuevo"))).codigo).toBe("no_encontrado");
  });

  it("no acepta registros de un paciente inexistente", async () => {
    const e = await esperarError(
      api.clinica.guardarRegistro("citas", { id: "cit-x", pacienteId: "nadie", fecha: "2026-12-01", hora: null, tipo: "control", lugar: "INSN", asistio: null }),
    );
    expect(e.codigo).toBe("no_encontrado");
  });

  it("el michi solo acepta latidos con su código", async () => {
    const malo = await esperarError(api.dispositivos.registrarLatido("MC-51AC90DD", "0000-0000-0000", { origen: "robot", bateriaPct: 50 }));
    expect(malo.codigo).toBe("no_autorizado");
    const l = await api.dispositivos.registrarLatido("MC-51AC90DD", "51ac-90dd-0c0c", { origen: "robot", bateriaPct: 50, silenciamientos: 0 });
    expect(l.serie).toBe("MC-51AC90DD");
    const parque = await api.dispositivos.parque();
    expect(parque.find((e) => e.michi.serie === "MC-51AC90DD")?.salud.enlace).toBe("en_linea");
  });

  it("un michi no se reasigna en caliente a otro paciente", async () => {
    const e = await esperarError(
      api.dispositivos.registrarMichi({
        serie: "MC-3F7A21C0",
        pacienteId: "pac-diego",
        codigo: "AAAA-BBBB-CCCC",
        nombre: "Otro",
        firmware: "0.3.0",
        entregadoEn: new Date().toISOString(),
      }),
    );
    expect(e.codigo).toBe("conflicto");
  });

  it("genera HL7 y FHIR y los deja en la bandeja de salida", async () => {
    const paciente = await api.clinica.obtenerPaciente("pac-diego");
    const tamizaje = (await api.clinica.listarRegistros("tamizajes", "pac-diego")).at(-1)!;
    const hl7 = await api.interop.generarMensaje({ formato: "hl7v2", paciente, tamizaje, michi: null, guardar: true });
    expect(hl7.contenido.startsWith("MSH|^~\\&|MICHICHECK")).toBe(true);
    const fhir = await api.interop.generarMensaje({ formato: "fhir", paciente, tamizaje, michi: null, guardar: false });
    expect(JSON.parse(fhir.contenido).resourceType).toBe("Bundle");
    expect(await api.interop.listarMensajes("pac-diego")).toHaveLength(1);
  });

  it("asigna el siguiente código del estudio y valida el asentimiento", async () => {
    expect(await api.investigacion.siguienteCodigo()).toBe("MCK-E-005");
    const [p] = await api.investigacion.listarParticipantes();
    const e = await esperarError(api.investigacion.guardarParticipante({ ...p!, asentimiento: { aplica: true, otorgado: false, fecha: null } }));
    expect(e.codigo).toBe("validacion");
  });

  it("rechaza respaldos con colecciones desconocidas o mal formados", async () => {
    expect((await esperarError(api.clinica.importar({ pacientes: [{ id: "x" }] }))).codigo).toBe("validacion");
    expect((await esperarError(api.clinica.importar({ basura: [] }))).codigo).toBe("validacion");
  });

  it("respeta la ruta reescrita por Vercel y responde 404 y 405", async () => {
    const r = await manejadores.clinica!(new Request("http://michi.test/api/clinica?__ruta=salud"));
    expect(r.status).toBe(200);
    expect((await manejadores.clinica!(new Request("http://michi.test/api/v1/clinica/nada"))).status).toBe(404);
    expect((await manejadores.clinica!(new Request("http://michi.test/api/v1/clinica/salud", { method: "DELETE" }))).status).toBe(405);
    const malo = await manejadores.clinica!(
      new Request("http://michi.test/api/v1/clinica/tamizajes", {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: "{no es json",
      }),
    );
    expect(malo.status).toBe(400);
  });

  it("exporta y vacía con confirmación", async () => {
    const volcado = await api.investigacion.exportar();
    expect(Array.isArray(volcado.participantes)).toBe(true);
    await api.interop.vaciar();
    expect((await api.interop.salud()).registros.mensajes).toBe(0);
  });
});

describe("migraciones", () => {
  it("son idempotentes y crean claves foráneas en cascada", async () => {
    const conexion = await conexionPglite();
    expect(await migrar(conexion, ESQUEMA_CLINICA, MIGRACIONES_CLINICA)).toEqual([1]);
    expect(await migrar(conexion, ESQUEMA_CLINICA, MIGRACIONES_CLINICA)).toEqual([]);
    const { rows } = await conexion.consultar(
      "SELECT count(*)::int AS n FROM information_schema.table_constraints WHERE table_schema = 'clinica' AND constraint_type = 'FOREIGN KEY'",
    );
    expect(rows[0]?.n).toBe(5);
    await conexion.cerrar();
  });
});
