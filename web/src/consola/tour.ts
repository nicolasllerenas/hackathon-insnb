import type { NavigateFunction } from "react-router";
import type { PasoTour } from "../componentes/Tour";
import { notificarEnSistema } from "../notificaciones";

const clic = (selector: string) => document.querySelector<HTMLElement>(selector)?.click();

export function crearPasosTour(navegar: NavigateFunction, modo: "local" | "servidor"): PasoTour[] {
  return [
    {
      texto: "Esta es la consola del INSN San Borja. Un tablero por paciente, ordenado por <b>lo que no puede esperar</b>, no por fecha.",
      ms: 4600,
      foco: "#kpis",
      accion: () => navegar("/insn"),
    },
    {
      texto: "Cinco indicadores. Fíjense en el cuarto: <b>«michis sin contacto»</b>. Un juguete que dejó de comunicarse está en la misma línea que un paciente grave.",
      ms: 6000,
      foco: "#kpis",
    },
    {
      texto: "Cada tarjeta trae el estado clínico, el <b>estado del juguete</b> y la trayectoria del recuento. La banda verde es la ventana del mantenimiento: entre 500 y 1500.",
      ms: 6000,
      foco: "#rejillaPacientes .tarjeta-paciente",
    },
    {
      texto: "Mateo Ríos, 9 años, Iquitos. <b>Priorizable</b>: tamizaje bajo y fiebre de 38.6 °C.",
      ms: 4400,
      accion: () => navegar("/insn/pacientes/pac-mateo"),
      foco: ".cabecera-ficha",
    },
    {
      texto: "<b>La fiebre escala y nunca rebaja.</b> Un tamizaje dudoso no puede reducir la conducta que la clínica ya indica; solo puede aumentarla.",
      ms: 6600,
      foco: "#franjaFiebre",
    },
    {
      texto: "Un hemograma mensual da un punto al mes. <b>El michi da una línea</b>, con su intervalo de confianza honesto y los hemogramas como referencia.",
      ms: 6600,
      foco: "#cajaGrafico",
    },
    {
      texto: "Se abre la <b>teleconsulta prioritaria</b>: 15 minutos de compromiso y, en paralelo, ingreso por emergencia. Marco legal: Ley 30421 y DL 1490.",
      ms: 6200,
      accion: () => navegar("/insn/pacientes/pac-mateo?modal=teleconsulta"),
    },
    {
      texto: "Ahora Joaquín Ccahuana, en Quispicanchi, Cusco. Su tamizaje dice <b>estable</b>. Pero <b>su michi lleva cinco días callado</b>.",
      ms: 5200,
      accion: () => navegar("/insn/pacientes/pac-joaquin"),
      foco: ".cabecera-ficha",
    },
    {
      texto: "La señal que ningún otro sistema tiene: hoy el rescate se entera cuando el niño <b>falta a una cita</b>. Aquí se entera cuando <b>el juguete se calló</b>, semanas antes.",
      ms: 7600,
      foco: "#franjaSilencio",
      accion: () => {
        notificarEnSistema({
          titulo: "MichiCheck · alerta de seguimiento",
          cuerpo: "Joaquín Ccahuana (Quispicanchi, Cusco): el michi lleva 5 días sin comunicarse. 4 silenciamientos seguidos.",
          etiqueta: "insnsb",
        });
      },
    },
    {
      texto: "La familia declaró que <b>no puede viajar a Lima</b>. El sistema emite la referencia al establecimiento capaz más cercano y calcula las horas de viaje que evita.",
      ms: 7000,
      accion: () => navegar("/insn/pacientes/pac-joaquin?modal=referencia"),
      foco: "#destinoReferencia",
      retrasoFoco: 700,
    },
    {
      texto: "La cola de atención junta lo clínico y lo del dispositivo, con el plazo corriendo. <b>Un michi mudo entra como caso grave</b> y su conducta no es una teleconsulta: es una búsqueda.",
      ms: 6600,
      accion: () => navegar("/insn/alertas"),
      foco: "#tablaCola",
    },
    {
      texto: "Todo empieza en el primer control: se capturan <b>la hora a la que sale de trabajar el apoderado</b>, el canal que sí contesta y si pueden viajar a Lima.",
      ms: 6800,
      accion: () => {
        navegar("/insn/enrolar");
        window.setTimeout(() => clic("#btnEjemplo"), 900);
      },
      foco: "#ventanaAlertas",
      retrasoFoco: 1200,
    },
    {
      texto: "Se genera la ficha y se vincula el michi: sale el <b>código que la familia escribe una sola vez</b>, la ventana de alertas y el calendario de la etapa.",
      ms: 7200,
      accion: () => {
        if (modo === "local") clic("#btnEnrolar");
      },
      foco: "#codigoVinculacion",
      retrasoFoco: 1200,
    },
    {
      texto: "El parque de michis: cada línea es un latido. <b>La línea plana es el silencio.</b> Desde aquí también se conecta el robot gato por USB.",
      ms: 6600,
      accion: () => navegar("/insn/dispositivos"),
      foco: "#tablaParque",
    },
    {
      texto: "Para la validación clínica: participantes con consentimiento, <b>sensibilidad y especificidad con IC95</b>, tamaño de muestra y datos anonimizados para el comité de ética.",
      ms: 7000,
      accion: () => navegar("/insn/investigacion"),
      foco: "#panelDesempeno",
    },
    {
      texto: "La red nacional: <b>10 centros oncológicos pediátricos en solo 4 departamentos</b>. Veintiún departamentos dependen de la teleconsulta con el INSN.",
      ms: 6200,
      accion: () => navegar("/insn/red"),
      foco: "#kpisRed",
    },
    {
      texto: "Y la salida al HIS del instituto: <b>HL7 v2 ORU^R01</b> marcado como preliminar y con el método explícito, para que nadie lo confunda con un hemograma.",
      ms: 6400,
      accion: () => navegar("/insn/galenus?paciente=pac-diego&formato=hl7v2"),
      foco: "#salidaMensaje",
      retrasoFoco: 800,
    },
    {
      texto: "También como <b>FHIR R4 con perfiles nacionales PE Core</b>, con el dispositivo incluido. No es un tablero aparte: entra al sistema que el instituto ya usa.",
      ms: 6000,
      accion: () => navegar("/insn/galenus?paciente=pac-diego&formato=fhir"),
      foco: "#salidaMensaje",
    },
    {
      texto: "Eso es MichiCheck. <b>No mandamos otro recordatorio: mandamos un gato.</b>",
      ms: 5000,
      accion: () => navegar("/insn"),
    },
  ];
}
