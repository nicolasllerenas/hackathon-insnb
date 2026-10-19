import type { InfoSalud, Volcado } from "../../compartido/contratos/comunes.js";
import { ErrorMichi } from "../../compartido/errores.js";
import { exigirObjeto, type Ruta } from "./http.js";

interface ServicioConRespaldo {
  salud(): Promise<InfoSalud>;
  exportar(): Promise<Volcado>;
  importar(volcado: Volcado): Promise<Record<string, number>>;
  vaciar(): Promise<void>;
}

export function rutasComunes<S extends ServicioConRespaldo>(): Ruta<S>[] {
  return [
    {
      metodo: "GET",
      patron: "/salud",
      actor: "publico",
      ejecutar: async (s, ctx) => {
        const info = await s.salud();
        return ctx.clinicoAutorizado ? info : { ...info, registros: {} };
      },
    },
    { metodo: "GET", patron: "/_exportar", actor: "clinico", ejecutar: (s) => s.exportar() },
    {
      metodo: "POST",
      patron: "/_importar",
      actor: "clinico",
      ejecutar: (s, ctx) => s.importar(exigirObjeto(ctx.cuerpo, "El respaldo") as Volcado),
    },
    {
      metodo: "POST",
      patron: "/_vaciar",
      actor: "clinico",
      ejecutar: async (s, ctx) => {
        const cuerpo = exigirObjeto(ctx.cuerpo);
        if (cuerpo.confirmar !== "VACIAR") throw new ErrorMichi("validacion", "Para vaciar envíe { \"confirmar\": \"VACIAR\" }");
        await s.vaciar();
        return null;
      },
    },
  ];
}

export function idCoincide(params: Record<string, string>, cuerpo: Record<string, unknown>, campo = "id"): void {
  const enRuta = params[campo];
  if (enRuta !== undefined && cuerpo.id !== enRuta) {
    throw new ErrorMichi("validacion", "El identificador de la ruta no coincide con el del cuerpo");
  }
}
