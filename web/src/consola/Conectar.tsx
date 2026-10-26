import { useState, type FormEvent } from "react";
import { esErrorMichi, mensajeDeError } from "@compartido/errores";
import { Campo } from "../componentes/Campo";
import { useDatos } from "../datos/contexto";
import { crearPlataforma } from "../datos/plataforma";

export function ConectarServidor({ rechazado }: { rechazado: boolean }) {
  const { config, cambiarConfiguracion } = useDatos();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [comprobando, setComprobando] = useState(false);

  const conectar = async (e: FormEvent) => {
    e.preventDefault();
    const limpio = token.trim();
    if (limpio.length < 16) {
      setError("El token clínico tiene al menos 16 caracteres.");
      return;
    }
    setComprobando(true);
    setError(null);
    try {
      await crearPlataforma({ modo: "servidor", token: limpio }).clinica.listarPacientes();
      cambiarConfiguracion({ ...config, token: limpio });
    } catch (err) {
      setError(esErrorMichi(err) && err.codigo === "no_autorizado" ? "Ese token no es válido para este servidor." : mensajeDeError(err));
      setComprobando(false);
    }
  };

  return (
    <div className="pagina">
      <div className="titulo-pagina">
        <div>
          <h1>Conecte la consola al servidor</h1>
          <p>
            Los datos clínicos viven en el servidor del proyecto y solo los ve el equipo tratante. Ingrese el token clínico que le entregó el responsable del
            proyecto; se guarda únicamente en este navegador.
          </p>
        </div>
      </div>
      <section className="panel">
        {rechazado ? (
          <div className="franja ambar" role="status">
            <span className="e" aria-hidden="true">
              ⚠️
            </span>
            <span>El token guardado en este navegador ya no es válido. Ingrese el vigente.</span>
          </div>
        ) : null}
        <form className="fila-token" onSubmit={(e) => void conectar(e)} noValidate>
          <Campo etiqueta="Token clínico" error={error} ayuda="Las familias y el michi no lo necesitan: entran con su código de vinculación.">
            {(id, d) => (
              <input
                id={id}
                type="password"
                autoComplete="off"
                value={token}
                aria-describedby={d}
                aria-invalid={Boolean(error)}
                onChange={(e) => setToken(e.target.value)}
              />
            )}
          </Campo>
          <button type="submit" className="boton" disabled={comprobando}>
            {comprobando ? "Comprobando…" : "Conectar"}
          </button>
        </form>
        <div className="botonera">
          <button type="button" className="boton fantasma" onClick={() => cambiarConfiguracion({ ...config, modo: "local" })}>
            Usar datos locales de demostración
          </button>
        </div>
      </section>
    </div>
  );
}
