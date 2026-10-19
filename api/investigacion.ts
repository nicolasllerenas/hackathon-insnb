import { crearManejadorInvestigacion } from "../servicios/investigacion/rutas.js";

const manejar = crearManejadorInvestigacion();

export default {
  fetch(peticion: Request): Promise<Response> {
    return manejar(peticion);
  },
};
