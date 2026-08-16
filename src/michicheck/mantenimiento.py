"""Ventana terapéutica de mantenimiento: el uso clínico que da sentido a todo.

El giro que reordena el proyecto
---------------------------------
Veníamos construyendo un detector de peligro: ¿el ANC bajó de 500? Eso es
correcto, pero es la mitad de la historia y ni siquiera la más frecuente.

En el **mantenimiento** de la LLA —la fase larga, unos dos años, con
quimioterapia oral en casa— el ANC objetivo **es 500-1500/uL**. No es un
efecto adverso tolerado: es la meta. Los protocolos suben la dosis de
6-mercaptopurina y metotrexato *hasta lograr* esa mielosupresión, porque la
supresión medular es la prueba de que el fármaco está actuando.

De ahí se sigue algo que cambia el valor del dispositivo:

    ANC < 500   -> toxicidad: suspender dosis          (lo que ya deteccion)
    ANC 500-1500 -> ventana terapéutica: el tratamiento está funcionando
    ANC > 1500   -> **el tratamiento NO está actuando**

Y ese último caso es el interesante. Un niño en mantenimiento con recuento
persistentemente normal no está sano: está infradosificado o **no está tomando
la medicación**.

Por qué esto importa tanto
--------------------------
La falta de adherencia al 6-MP no es un detalle. En la cohorte del Children's
Oncology Group:

* el **44%** de los niños tiene adherencia por debajo del 95%;
* una adherencia <95% se asocia a un riesgo de recaída **2.7 veces mayor**.

Es decir: la primera causa evitable de recaída en mantenimiento es que el niño
no toma la pastilla, y hoy sólo se detecta con hemogramas espaciados o midiendo
metabolitos en sangre.

El Comité de Abandono y la aplicación IMPACTO no ven esto: registran si el niño
**vino a la cita**, no si **tomó el tratamiento**. Un niño puede asistir
puntualmente a todos sus controles y no estar tomando nada.

Lo que aporta un tamizaje frecuente
------------------------------------
Una medición aislada de este método es imprecisa: el intervalo honesto es de
0.39-2.56x (ver :mod:`michicheck.optics`). Con esa incertidumbre no se titula una
dosis, y decir lo contrario sería mentir.

Pero la incertidumbre mecanística es **sistemática, no aleatoria**: afecta
igual a todas las mediciones del mismo paciente con el mismo equipo. Se cancela
en gran parte al mirar la **trayectoria** en lugar del punto.

Diez mediciones en casa a lo largo de un mes dicen algo que un hemograma
mensual no puede decir: si el niño está *dentro* de la ventana, si viene
subiendo o bajando, y si lleva semanas por encima cuando debería estar dentro.

**El valor del equipo es la trayectoria, no el número.**
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from enum import Enum

from . import optics

VENTANA_MANTENIMIENTO = (500.0, 1500.0)

ADHERENCIA_CRITICA = 0.95
RIESGO_RELATIVO_RECAIDA = 2.7
PREVALENCIA_NO_ADHERENCIA = 0.44

SEMANAS_PARA_SOSPECHA = 3


class PosicionVentana(str, Enum):
    TOXICIDAD = "toxicidad"
    EN_VENTANA = "en_ventana"
    SOBRE_VENTANA = "sobre_ventana"
    INDETERMINADA = "indeterminada"


@dataclass
class Medicion:
    """Un tamizaje con su fecha e incertidumbre."""

    fecha: date
    anc_estimado: float
    anc_ci_low: float
    anc_ci_high: float
    concluyente: bool = True

    @property
    def posicion(self) -> PosicionVentana:
        """Dónde cae la medición, **considerando su intervalo**.

        Si el intervalo abarca dos zonas, la respuesta honesta es
        ``INDETERMINADA``. Forzar una clasificación con un intervalo que no la
        soporta es exactamente el error que este proyecto no debe cometer.
        """
        if not self.concluyente:
            return PosicionVentana.INDETERMINADA
        bajo, alto = VENTANA_MANTENIMIENTO
        if self.anc_ci_high < bajo:
            return PosicionVentana.TOXICIDAD
        if self.anc_ci_low > alto:
            return PosicionVentana.SOBRE_VENTANA
        if self.anc_ci_low >= bajo and self.anc_ci_high <= alto:
            return PosicionVentana.EN_VENTANA
        return PosicionVentana.INDETERMINADA

    @property
    def posicion_puntual(self) -> PosicionVentana:
        """Dónde cae la **estimación puntual**, ignorando el intervalo.

        Existe por una razón estadística concreta. El intervalo de una medición
        aislada es ancho —0.39-2.56x— porque incluye la incertidumbre
        mecanística del método, y con esa anchura casi cualquier medición sale
        "indeterminada". Eso es honesto para un dato suelto.

        Pero esa incertidumbre es **sistemática**: afecta igual a todas las
        mediciones del mismo paciente con el mismo equipo. Si cinco tomas
        consecutivas caen del mismo lado, la explicación de que el valor real
        esté al otro lado exige que el sesgo apunte siempre en la misma
        dirección y con la misma magnitud. Es posible, pero cada vez menos
        probable.

        Por eso la clasificación por intervalo se usa para etiquetar cada
        medición, y la puntual para leer la **consistencia de la serie**.
        """
        if not self.concluyente:
            return PosicionVentana.INDETERMINADA
        bajo, alto = VENTANA_MANTENIMIENTO
        if self.anc_estimado < bajo:
            return PosicionVentana.TOXICIDAD
        if self.anc_estimado > alto:
            return PosicionVentana.SOBRE_VENTANA
        return PosicionVentana.EN_VENTANA


@dataclass
class Trayectoria:
    """Lectura de una serie de mediciones. Aquí está el valor del método."""

    mediciones: list[Medicion]
    posicion_actual: PosicionVentana
    fraccion_en_ventana: float
    tendencia_por_semana: float
    semanas_sobre_ventana: float
    sospecha_no_adherencia: bool
    mensajes: list[str] = field(default_factory=list)

    @property
    def n(self) -> int:
        return len(self.mediciones)


def _pendiente_log(mediciones: list[Medicion]) -> float:
    """Tendencia en escala logarítmica, por semana.

    Se trabaja en log porque el sesgo del método es multiplicativo: se cancela
    al derivar, de modo que la *pendiente* es mucho más fiable que cualquiera
    de los valores absolutos que la componen.
    """
    validas = [m for m in mediciones if m.concluyente and m.anc_estimado > 0]
    if len(validas) < 3:
        return 0.0

    t0 = validas[0].fecha
    xs = [(m.fecha - t0).days / 7.0 for m in validas]
    ys = [math.log(m.anc_estimado) for m in validas]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    denom = sum((x - mx) ** 2 for x in xs)
    if denom <= 0:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / denom


def analizar_trayectoria(mediciones: list[Medicion],
                         hoy: date | None = None) -> Trayectoria:
    """Lee la serie de tamizajes de un paciente en mantenimiento."""
    hoy = hoy or date.today()
    ordenadas = sorted(mediciones, key=lambda m: m.fecha)
    mensajes: list[str] = []

    if not ordenadas:
        return Trayectoria([], PosicionVentana.INDETERMINADA, 0.0, 0.0, 0.0,
                           False, ["Sin mediciones registradas."])

    puntuales = [m.posicion_puntual for m in ordenadas
                 if m.posicion_puntual is not PosicionVentana.INDETERMINADA]
    en_ventana = sum(1 for p in puntuales if p is PosicionVentana.EN_VENTANA)
    fraccion = en_ventana / len(puntuales) if puntuales else 0.0

    consecutivas_arriba = 0
    for m in reversed(ordenadas):
        if m.posicion_puntual is PosicionVentana.SOBRE_VENTANA:
            consecutivas_arriba += 1
        else:
            break

    semanas_arriba = 0.0
    if consecutivas_arriba >= 1:
        semanas_arriba = (hoy - ordenadas[-consecutivas_arriba].fecha).days / 7.0

    pendiente = _pendiente_log(ordenadas)
    sospecha = consecutivas_arriba >= 3 and semanas_arriba >= SEMANAS_PARA_SOSPECHA

    actual = ordenadas[-1].posicion
    if actual is PosicionVentana.INDETERMINADA and consecutivas_arriba >= 3:
        actual = PosicionVentana.SOBRE_VENTANA
        mensajes.append(
            f"Ninguna medición aislada es concluyente por sí sola, pero "
            f"{consecutivas_arriba} consecutivas caen por encima de la ventana. "
            f"La incertidumbre del método es sistemática, así que una serie "
            f"consistente pesa más que cualquiera de sus puntos.")
    if actual is PosicionVentana.TOXICIDAD:
        mensajes.append(
            "Recuento por debajo de la ventana: corresponde suspender la dosis "
            "según protocolo y consultar con el equipo tratante.")
    elif actual is PosicionVentana.EN_VENTANA:
        mensajes.append(
            "Recuento dentro de la ventana terapéutica (500-1500/µL): el "
            "tratamiento está haciendo su efecto.")
    elif actual is PosicionVentana.SOBRE_VENTANA:
        mensajes.append(
            "Recuento por encima de la ventana. En mantenimiento eso **no es "
            "una buena noticia**: sugiere que el tratamiento no está logrando "
            "la mielosupresión buscada.")

    if sospecha:
        mensajes.append(
            f"Lleva {semanas_arriba:.0f} semanas por encima de la ventana en "
            f"{consecutivas_arriba} mediciones consecutivas. Las causas "
            f"posibles son infradosificación, interacción farmacológica, "
            f"diferencias de metabolismo (TPMT/NUDT15) o que la medicación no "
            f"se esté tomando. Requiere revisión, no ajuste automático.")

    if abs(pendiente) > 0.15 and len(ordenadas) >= 3:
        direccion = "ascendente" if pendiente > 0 else "descendente"
        mensajes.append(
            f"Tendencia {direccion}: {abs(math.expm1(pendiente))*100:.0f}% por "
            f"semana. La pendiente es más fiable que cualquier medición "
            f"aislada, porque el sesgo del método se cancela al derivar.")

    return Trayectoria(
        mediciones=ordenadas, posicion_actual=actual,
        fraccion_en_ventana=fraccion, tendencia_por_semana=pendiente,
        semanas_sobre_ventana=semanas_arriba,
        sospecha_no_adherencia=sospecha, mensajes=mensajes,
    )


def riesgo_de_recaida_relativo(fraccion_en_ventana: float) -> float:
    """Riesgo relativo de recaída aproximado, a partir del tiempo en ventana.

    Es una **interpolación**, no un modelo validado, y así debe presentarse.
    El anclaje son los dos extremos publicados por el Children's Oncology
    Group: adherencia >=95% como referencia (RR 1.0) y <95% con RR 2.7.

    Se usa el tiempo en ventana terapéutica como proxy de exposición efectiva
    al fármaco. Sirve para comunicar magnitud a una familia, no para pronosticar
    a un paciente concreto.
    """
    f = max(0.0, min(1.0, fraccion_en_ventana))
    return float(1.0 + (RIESGO_RELATIVO_RECAIDA - 1.0) * (1.0 - f))


def mensaje_para_familia(trayectoria: Trayectoria) -> dict[str, str]:
    """Explicación en lenguaje llano, para la app de la familia.

    Es el único punto del sistema que habla directamente con el cuidador, y
    tiene que hacer dos cosas a la vez: ser comprensible y no culpabilizar. La
    no adherencia rara vez es negligencia -- suele ser efectos adversos, olvido,
    o no haber entendido que la pastilla importa aunque el niño se sienta bien.
    """
    if trayectoria.sospecha_no_adherencia:
        return {
            "titulo": "Conviene revisar el tratamiento con el equipo",
            "texto": (
                "Las últimas mediciones salen más altas de lo esperado. En esta "
                "fase, un resultado alto no significa que el tratamiento vaya "
                "bien: la quimioterapia oral debe bajar un poco las defensas, y "
                "eso es lo que indica que está actuando.\n\n"
                "Puede deberse a muchas cosas: la dosis, el horario, que le "
                "caiga mal al estómago, o que se hayan saltado tomas sin "
                "querer. Nada de esto es un reproche. Lo importante es "
                "conversarlo con el equipo para ajustarlo a tiempo."),
            "accion": "Coordinar teleinterconsulta con hematología",
        }
    if trayectoria.posicion_actual is PosicionVentana.TOXICIDAD:
        return {
            "titulo": "Las defensas están bajas",
            "texto": ("El recuento está por debajo de lo indicado. Corresponde "
                      "consultar con el equipo antes de la siguiente dosis, y "
                      "extremar cuidados: evitar aglomeraciones y tomar la "
                      "temperatura. Ante cualquier fiebre, acudir de inmediato."),
            "accion": "Contactar al equipo tratante hoy",
        }
    if trayectoria.fraccion_en_ventana >= 0.6 and trayectoria.n >= 3:
        return {
            "titulo": "Todo va como debe ir",
            "texto": (
                f"De las últimas {trayectoria.n} mediciones, "
                f"{trayectoria.fraccion_en_ventana*100:.0f}% caen en el rango "
                "que busca el tratamiento. Eso es exactamente lo que se espera: "
                "la quimioterapia baja un poco las defensas, y esa bajada es la "
                "señal de que está actuando.\n\n"
                "Siga con las dosis tal como están indicadas."),
            "accion": "Continuar según indicación",
        }
    if trayectoria.posicion_actual is PosicionVentana.EN_VENTANA:
        return {
            "titulo": "Medición dentro del rango esperado",
            "texto": ("El recuento está en el rango que busca el tratamiento. "
                      "Siga con las dosis indicadas y con los controles "
                      "programados."),
            "accion": "Continuar según indicación",
        }
    if trayectoria.n < 3:
        return {
            "titulo": "Seguimos midiendo",
            "texto": (
                "Con pocas mediciones todavía no se puede leer una tendencia. "
                "Este equipo no da su mejor información en una toma suelta, "
                "sino en la serie: por eso el control es semanal y corto, en "
                "vez de mensual y lejos."),
            "accion": "Continuar con el tamizaje semanal",
        }
    return {
        "titulo": "Conviene repetir la medición",
        "texto": ("Las últimas tomas no fueron concluyentes. Repítala siguiendo "
                  "la guía de captura; si vuelve a salir así, coordine con el "
                  "establecimiento."),
        "accion": "Repetir el tamizaje",
    }


def calendario_sugerido(inicio: date, semanas: int = 8,
                        cada_dias: int = 7) -> list[tuple[date, str]]:
    """Calendario de tamizaje en mantenimiento.

    Semanal, y no es capricho: con una medición mensual la trayectoria no
    existe -- se tienen puntos sueltos, cada uno con su incertidumbre, sin forma
    de distinguir una tendencia de una fluctuación. La frecuencia es
    precisamente lo que un tamizaje no invasivo puede dar y un hemograma no.
    """
    plan = []
    for i in range(semanas):
        fecha = inicio + timedelta(days=i * cada_dias)
        motivo = ("Control basal de la serie" if i == 0
                  else "Seguimiento semanal de la ventana terapéutica")
        plan.append((fecha, motivo))
    return plan
