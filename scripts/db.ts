import { AlmacenSql, migrar } from "../compartido/almacen/sql.js";
import { generarDemostracion } from "../compartido/semilla.js";
import { ESQUEMA_CLINICA, MIGRACIONES_CLINICA } from "../servicios/clinica/rutas.js";
import { ServicioClinica } from "../servicios/clinica/servicio.js";
import { ESQUEMA_DISPOSITIVOS, MIGRACIONES_DISPOSITIVOS } from "../servicios/dispositivos/rutas.js";
import { ServicioDispositivos } from "../servicios/dispositivos/servicio.js";
import { ESQUEMA_INTEROP, MIGRACIONES_INTEROP } from "../servicios/interoperabilidad/rutas.js";
import { ServicioInteroperabilidad } from "../servicios/interoperabilidad/servicio.js";
import { ESQUEMA_INVESTIGACION, MIGRACIONES_INVESTIGACION } from "../servicios/investigacion/rutas.js";
import { ServicioInvestigacion } from "../servicios/investigacion/servicio.js";
import { conexionPostgres, urlBaseDeDatos } from "../servicios/plataforma/conexion.js";

const ESQUEMAS = [
  [ESQUEMA_CLINICA, MIGRACIONES_CLINICA],
  [ESQUEMA_DISPOSITIVOS, MIGRACIONES_DISPOSITIVOS],
  [ESQUEMA_INTEROP, MIGRACIONES_INTEROP],
  [ESQUEMA_INVESTIGACION, MIGRACIONES_INVESTIGACION],
] as const;

async function principal(): Promise<void> {
  const orden = process.argv[2];
  if (orden === "sql") {
    for (const [esquema, migraciones] of ESQUEMAS) {
      console.log(`CREATE SCHEMA IF NOT EXISTS "${esquema}";\n`);
      for (const m of migraciones) for (const s of m.sentencias) console.log(`${s};\n`);
    }
    return;
  }
  const url = urlBaseDeDatos();
  if (!url) {
    console.error("Defina DATABASE_URL (por ejemplo en .env.local o en la terminal).");
    process.exitCode = 1;
    return;
  }
  const conexion = conexionPostgres(url);
  try {
    for (const [esquema, migraciones] of ESQUEMAS) {
      const nuevas = await migrar(conexion, esquema, migraciones);
      console.log(`${esquema}: ${nuevas.length ? `migraciones aplicadas ${nuevas.join(", ")}` : "al día"}`);
    }
    const clinica = new ServicioClinica(new AlmacenSql(ESQUEMA_CLINICA, conexion));
    const dispositivos = new ServicioDispositivos(new AlmacenSql(ESQUEMA_DISPOSITIVOS, conexion));
    const interop = new ServicioInteroperabilidad(new AlmacenSql(ESQUEMA_INTEROP, conexion));
    const investigacion = new ServicioInvestigacion(new AlmacenSql(ESQUEMA_INVESTIGACION, conexion));
    if (orden === "vaciar" || orden === "semilla") {
      await interop.vaciar();
      await investigacion.vaciar();
      await dispositivos.vaciar();
      await clinica.vaciar();
      console.log("Datos eliminados.");
    }
    if (orden === "semilla") {
      const demo = await generarDemostracion();
      console.log("clinica", await clinica.importar(demo.clinica));
      console.log("dispositivos", await dispositivos.importar(demo.dispositivos));
      console.log("investigacion", await investigacion.importar(demo.investigacion));
    }
  } finally {
    await conexion.cerrar();
  }
}

principal().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
