import { crearManejadorDispositivos } from "../servicios/dispositivos/rutas.js";

const manejar = crearManejadorDispositivos();

export default {
  fetch(peticion: Request): Promise<Response> {
    return manejar(peticion);
  },
};
