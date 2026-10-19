import { describe, expect, it } from "vitest";
import { COLECCIONES_CLINICA } from "@compartido/contratos/clinica";
import { COLECCIONES_DISPOSITIVOS } from "@compartido/contratos/dispositivos";
import { ErrorMichi } from "@compartido/errores";
import { CODIGO_DEMO, generarDemostracion } from "@compartido/semilla";
import { ServicioClinica } from "@servicios/clinica/servicio";
import { ServicioDispositivos } from "@servicios/dispositivos/servicio";
import { AlmacenIndexedDB } from "./almacenIndexedDB";

let n = 0;
const nuevaBase = (nombre: string, colecciones: Parameters<typeof AlmacenIndexedDB.prototype.listar>[0][]) => new AlmacenIndexedDB(`prueba-${nombre}-${++n}`, colecciones);

describe("almacén IndexedDB", () => {
  it("se comporta igual que Postgres en unicidad, filtros, orden y cascada", async () => {
    const almacen = nuevaBase("clinica", Object.values(COLECCIONES_CLINICA));
    const clinica = new ServicioClinica(almacen);
    const demo = await generarDemostracion(new Date());
    const conteo = await clinica.importar(demo.clinica);
    expect(conteo.pacientes).toBe(6);

    const tamizajes = await clinica.listarRegistros("tamizajes", "pac-mateo");
    expect(tamizajes).toHaveLength(9);
    expect(tamizajes.map((t) => t.momento)).toEqual([...tamizajes.map((t) => t.momento)].sort());
    expect(tamizajes.at(-1)?.estado).toBe("priorizable");

    const ana = await clinica.obtenerPaciente("pac-ana");
    await expect(clinica.guardarPaciente({ ...ana, id: "otro", codigoVinculacion: null, serieMichi: null })).rejects.toBeInstanceOf(ErrorMichi);

    const resumen = await clinica.resumenFamilia(CODIGO_DEMO);
    expect(resumen.nombres).toBe("Ana Lucía");

    await clinica.eliminarPaciente("pac-ana");
    expect(await clinica.listarRegistros("tamizajes", "pac-ana")).toHaveLength(0);
    await expect(clinica.resumenFamilia(CODIGO_DEMO)).rejects.toMatchObject({ codigo: "no_encontrado" });
  });

  it("registra latidos con código y calcula el parque", async () => {
    const almacen = nuevaBase("dispositivos", Object.values(COLECCIONES_DISPOSITIVOS));
    const d = new ServicioDispositivos(almacen);
    const demo = await generarDemostracion(new Date());
    await d.importar(demo.dispositivos);
    await expect(d.registrarLatido("MC-51AC90DD", "0000-0000-0000", { origen: "app", bateriaPct: 50 })).rejects.toMatchObject({ codigo: "no_autorizado" });
    await d.registrarLatido("MC-51AC90DD", "51AC-90DD-0C0C", { origen: "app", bateriaPct: 50 });
    const parque = await d.parque();
    expect(parque.find((e) => e.michi.serie === "MC-51AC90DD")?.salud.enlace).toBe("en_linea");
    expect((await d.listarLatidos("MC-51AC90DD", 3)).length).toBe(3);
  });
});
