import { crearManejadorClinica } from "../servicios/clinica/rutas.js";

const manejar = crearManejadorClinica();

export default {
  fetch(peticion: Request): Promise<Response> {
    return manejar(peticion);
  },
};
