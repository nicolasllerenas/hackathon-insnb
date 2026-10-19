import "../estilos/landing.css";
import { Link } from "react-router";
import { maullido } from "../sonido/sintetizador";

export function Landing() {
  return (
    <div className="portada">
      <div className="cielo" aria-hidden="true" />
      <main className="contenedor-portada">
        <header className="encabezado-portada">
          <button type="button" className="gato-portada" onClick={() => maullido({ tono: 560 + Math.random() * 80 })} aria-label="Tocar al michi">
            <svg viewBox="0 0 192 192" aria-hidden="true">
              <path d="M52 66 L44 22 L84 46 Z" fill="#A79FC0" />
              <path d="M140 66 L148 22 L108 46 Z" fill="#A79FC0" />
              <path d="M58 60 L54 34 L76 48 Z" fill="#FF9EC7" opacity=".8" />
              <path d="M134 60 L138 34 L116 48 Z" fill="#FF9EC7" opacity=".8" />
              <ellipse cx="96" cy="104" rx="62" ry="54" fill="#DCD6E8" />
              <rect x="54" y="82" width="84" height="38" rx="19" fill="#1B1030" />
              <g className="ojos">
                <ellipse cx="76" cy="101" rx="12" ry="13" fill="#22D3EE" />
                <ellipse cx="116" cy="101" rx="12" ry="13" fill="#22D3EE" />
                <ellipse cx="76" cy="101" rx="5" ry="10" fill="#0B0518" />
                <ellipse cx="116" cy="101" rx="5" ry="10" fill="#0B0518" />
              </g>
              <path d="M87 128 L105 128 L96 140 Z" fill="#A855F7" />
              <circle className="brillo" cx="96" cy="132" r="22" fill="#22D3EE" opacity=".18" />
            </svg>
          </button>
          <h1>MichiCheck</h1>
          <p className="lema">Un gato de juguete que vive en casa del paciente y avisa al hospital cuando algo cambia.</p>
          <span className="sello">Hackatón Niño San Borja 2026 · Desafío 3 · Ruta Hematológica</span>
        </header>

        <div className="tarjetas-portada">
          <a className="tarjeta-portada nino" href="/michi/">
            <span className="emoji" aria-hidden="true">
              🐱
            </span>
            <span className="quien">Lo usa el niño</span>
            <h2>Mi michi</h2>
            <p>Maúlla cuando toca control. Si el niño le pone el dedo en la nariz, mide sus defensas en un minuto.</p>
            <span className="ir">
              Abrir la app <span aria-hidden="true">→</span>
            </span>
          </a>
          <Link className="tarjeta-portada equipo" to="/insn">
            <span className="emoji" aria-hidden="true">
              🏥
            </span>
            <span className="quien">Lo usa el equipo del INSN</span>
            <h2>Consola clínica</h2>
            <p>Los pacientes ordenados por urgencia, con la trayectoria de cada uno, el estado del juguete, la base de datos y la salida al sistema del hospital.</p>
            <span className="ir">
              Abrir la consola <span aria-hidden="true">→</span>
            </span>
          </Link>
        </div>

        <div className="acciones-portada">
          <a className="boton" href="/michi/?demo=1">
            ▶ Demo de la app
          </a>
          <Link className="boton fantasma" to="/insn?demo=1">
            ▶ Demo de la consola
          </Link>
        </div>

        <p className="nota-portada">
          Las dos se recorren solas si pulsas DEMO, y se pueden pausar en cualquier momento. Conviene subir el volumen: el maullido está sintetizado dentro de la página y no
          es un archivo de audio. Si aceptas el permiso de notificaciones verás además las alertas tal como llegan al celular.
        </p>

        <dl className="cifras">
          <div className="cifra menta">
            <dt>Centros oncológicos pediátricos en el país</dt>
            <dd>10</dd>
          </div>
          <div className="cifra coral">
            <dt>Departamentos que no tienen ninguno</dt>
            <dd>21</dd>
          </div>
          <div className="cifra cian">
            <dt>Sin señal del juguete y el caso se abre</dt>
            <dd>72 h</dd>
          </div>
        </dl>

        <section className="arquitectura-portada" aria-label="Cómo está construido">
          <span className="rotulo-portada">Cómo está construido</span>
          <ul>
            <li>Servicio clínico</li>
            <li>Servicio de dispositivos</li>
            <li>Interoperabilidad HL7 · FHIR</li>
            <li>Investigación</li>
            <li>Análisis óptico</li>
          </ul>
        </section>

        <footer className="pie-portada">
          Esto es un tamizaje: orienta y prioriza. No diagnostica ni reemplaza el hemograma.
          <br />
          Los pacientes que aparecen son ficticios · Apache-2.0
        </footer>
      </main>
    </div>
  );
}
