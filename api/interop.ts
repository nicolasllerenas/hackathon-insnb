import { crearManejadorInterop } from "../servicios/interoperabilidad/rutas.js";

const manejar = crearManejadorInterop();

export default {
  fetch(peticion: Request): Promise<Response> {
    return manejar(peticion);
  },
};
