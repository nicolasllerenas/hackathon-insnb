"""Modelo fisico que conecta los *gaps* opticos del lecho ungueal con el
recuento leucocitario, y las correcciones pediatricas necesarias.

Fundamento
----------
Bajo iluminacion de ~420 nm (banda de Soret de la hemoglobina) los eritrocitos
absorben fuertemente y el lumen capilar se ve oscuro. Un leucocito, que carece
de hemoglobina, deja pasar la luz azul y ademas desplaza a los eritrocitos
inmediatamente aguas abajo: aparece un *gap optico* brillante que viaja por el
capilar. Contar esos eventos equivale a contar leucocitos que atraviesan el
capilar.

El modelo directo es puramente geometrico. Si un capilar de diametro ``d`` (um)
conduce sangre a velocidad ``v`` (um/s), el caudal es::

    Q = v * pi * (d/2)^2        [um^3 / s]

y el numero de leucocitos que lo atraviesan por minuto, para una concentracion
``C`` (celulas / uL), es::

    R = C * Q * 60 * 1e-9       [eventos / capilar / minuto]

(el factor 1e-9 convierte um^3 a uL).

Calibracion contra la literatura
--------------------------------
Bourquard et al. (Sci Rep 2018, PMC5871877) asumen v = 800 um/s y d = 15 um y
reportan: 32 eventos/min <-> 3773 celulas/uL, y 2 eventos/min <-> 236 celulas/uL.
``test_optics.py`` verifica que este modulo reproduce ambos puntos.

Aporte propio: auto-calibracion y correccion pediatrica
-------------------------------------------------------
El trabajo original *asume* v y d fijos. Nosotros los **medimos en el propio
video** (velocidad por la pendiente del kymograph, diametro por la segmentacion
del lumen), de modo que la constante de calibracion es especifica de cada
paciente y de cada capilar. Esto importa en pediatria: los capilares de ninos
pequenos son mas anchos y menos densos que los del adulto
(15.0 +/- 2.6 um y 6.9 +/- 0.9 capilares/mm frente a 8.6 +/- 1.6 en adultos),
por lo que la constante del adulto sesga la estimacion.

Ademas el metodo optico cuenta **leucocitos totales**, no neutrofilos. En
pediatria la fraccion de neutrofilos sobre el total varia muchisimo con la edad
(predominio linfocitario entre el mes y los ~4-5 anos, con el "cruce"
linfocito/neutrofilo alrededor de los 4-6 anos). Convertir WBC -> ANC con la
fraccion del adulto sobreestimaria el ANC de un nino de 2 anos en mas del doble.
`neutrophil_fraction_for_age` implementa esa correccion.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

# --------------------------------------------------------------------------
# Constantes de referencia (ver docstring para las fuentes)
# --------------------------------------------------------------------------

#: Velocidad de flujo asumida por Bourquard et al. 2018 (um/s).
REFERENCE_VELOCITY_UM_S = 800.0
#: Diametro capilar asumido por Bourquard et al. 2018 (um).
REFERENCE_DIAMETER_UM = 15.0
#: Umbral de eventos/capilar/minuto que separo basal de neutropenia severa
#: en la cohorte original (n=11, 53 pares de capilares).
BOURQUARD_EVENT_THRESHOLD = 7.0

#: Numero minimo de capilares a agregar por medicion. En el estudio original el
#: AUC crecio de 0.68 (1 capilar) a 0.88 (3) y 1.00 (5); por eso el protocolo de
#: captura exige al menos 5 capilares validos antes de emitir un resultado.
MIN_CAPILLARIES_FOR_DECISION = 5

#: um^3 por uL.
_UM3_PER_UL = 1e9


# --------------------------------------------------------------------------
# Modelo directo / inverso
# --------------------------------------------------------------------------


def capillary_flow_um3_s(velocity_um_s: float, diameter_um: float) -> float:
    """Caudal volumetrico de un capilar cilindrico, en um^3/s."""
    radius = diameter_um / 2.0
    return float(velocity_um_s) * np.pi * radius**2


def event_rate_from_wbc(
    wbc_per_ul: float,
    velocity_um_s: float = REFERENCE_VELOCITY_UM_S,
    diameter_um: float = REFERENCE_DIAMETER_UM,
) -> float:
    """Eventos (gaps) esperados por capilar y por minuto.

    Es el modelo *directo*: dada una concentracion leucocitaria, cuantos gaps
    deberiamos ver. Lo usa el generador sintetico.
    """
    q = capillary_flow_um3_s(velocity_um_s, diameter_um)
    return float(wbc_per_ul) * q * 60.0 / _UM3_PER_UL


def wbc_from_event_rate(
    events_per_min: float,
    velocity_um_s: float = REFERENCE_VELOCITY_UM_S,
    diameter_um: float = REFERENCE_DIAMETER_UM,
) -> float:
    """Concentracion leucocitaria (celulas/uL) a partir de la tasa de eventos.

    Es el modelo *inverso*: el nucleo de la estimacion auto-calibrada. Cuando
    ``velocity_um_s`` y ``diameter_um`` provienen de la medicion del video, el
    resultado no depende de supuestos del adulto.
    """
    q = capillary_flow_um3_s(velocity_um_s, diameter_um)
    if q <= 0:
        return float("nan")
    return float(events_per_min) * _UM3_PER_UL / (q * 60.0)


def calibration_constant(velocity_um_s: float, diameter_um: float) -> float:
    """Eventos/min por cada 1000 celulas/uL. Util para reportar la calibracion."""
    return event_rate_from_wbc(1000.0, velocity_um_s, diameter_um)


# --------------------------------------------------------------------------
# Correccion pediatrica: fraccion de neutrofilos segun edad
# --------------------------------------------------------------------------

#: Fraccion media de neutrofilos sobre leucocitos totales, por edad.
#: Tabla clasica de valores hematologicos pediatricos (Dallman/Nathan-Oski).
#: Edad en anos; el neonato se aproxima con 0.0.
_NEUTROPHIL_FRACTION_TABLE: tuple[tuple[float, float], ...] = (
    (0.0, 0.61),      # nacimiento
    (0.0027, 0.61),   # 1 dia
    (0.019, 0.45),    # 1 semana
    (0.038, 0.40),    # 2 semanas
    (0.083, 0.35),    # 1 mes
    (0.5, 0.32),      # 6 meses
    (1.0, 0.31),      # 1 ano  <- minimo fisiologico
    (2.0, 0.33),      # 2 anos
    (4.0, 0.42),      # 4 anos
    (6.0, 0.51),      # 6 anos  <- "cruce" linfocito/neutrofilo
    (8.0, 0.53),
    (10.0, 0.54),
    (16.0, 0.57),
    (21.0, 0.59),     # adulto
)


def neutrophil_fraction_for_age(age_years: float) -> float:
    """Fraccion esperada ANC/WBC para la edad (interpolacion lineal).

    En un lactante de 1 ano solo ~31% de los leucocitos son neutrofilos, frente
    a ~59% en el adulto. Ignorar esto casi duplica el ANC estimado.
    """
    ages = np.array([a for a, _ in _NEUTROPHIL_FRACTION_TABLE])
    fracs = np.array([f for _, f in _NEUTROPHIL_FRACTION_TABLE])
    return float(np.interp(np.clip(age_years, ages[0], ages[-1]), ages, fracs))


def anc_from_wbc(
    wbc_per_ul: float,
    age_years: float,
    patient_neutrophil_fraction: float | None = None,
) -> float:
    """Convierte leucocitos totales a ANC.

    Si el paciente tiene un hemograma reciente del INSNSB, su propia fraccion
    de neutrofilos (``patient_neutrophil_fraction``) ancla la conversion y
    sustituye al prior poblacional. Esta es la pieza que convierte al equipo en
    un *monitor de trayectoria* entre hemogramas, y no en un reemplazo de estos.
    """
    frac = (
        float(patient_neutrophil_fraction)
        if patient_neutrophil_fraction is not None
        else neutrophil_fraction_for_age(age_years)
    )
    frac = float(np.clip(frac, 0.02, 0.95))
    return float(wbc_per_ul) * frac


# --------------------------------------------------------------------------
# Bandas de riesgo ANC
# --------------------------------------------------------------------------

AncBand = Literal["normal", "leve", "moderada", "grave", "profunda"]

#: Limite inferior (celulas/uL) de cada banda, de mayor a menor.
#: Escala del National Cancer Institute, equivalente a los grados CTCAE:
#:   leve      1000-1500  -> CTCAE grado 2
#:   moderada   500-1000  -> CTCAE grado 3
#:   grave         < 500  -> CTCAE grado 4 ("potencialmente mortal o
#:                           incapacitante" en la nomenclatura del NCI)
#:   profunda      < 200  -> agranulocitosis; subdivision operativa nuestra,
#:                           porque el riesgo infeccioso no es el mismo a 450
#:                           que a 80 celulas/uL.
ANC_BANDS: tuple[tuple[AncBand, float], ...] = (
    ("normal", 1500.0),
    ("leve", 1000.0),
    ("moderada", 500.0),
    ("grave", 200.0),
    ("profunda", 0.0),
)

#: Umbral operativo del tamizaje: neutropenia grave (grado 4 CTCAE, <500/uL).
#: Es el umbral que define neutropenia febril junto con la fiebre, y el que
#: dispara la derivacion urgente.
SEVERE_NEUTROPENIA_ANC = 500.0

#: Umbral de vigilancia: por debajo de 1000/uL el paciente ya requiere
#: precauciones y control mas frecuente aunque no haya fiebre.
WATCH_ANC = 1000.0

#: Rango de referencia de ANC (celulas/uL) por edad, para poblacion sana.
#: Fuente: rangos de laboratorio clinico de uso corriente. Nota clinica: el
#: limite inferior de normalidad **no** es 1500 a toda edad, y ademas existe
#: la neutropenia etnica benigna (frecuente en poblacion afrodescendiente),
#: donde valores de 1000-1500 son normales sin riesgo infeccioso aumentado.
#: Por eso el sistema nunca clasifica solo por el numero: siempre lo contrasta
#: con el hemograma previo del propio paciente.
ANC_REFERENCE_RANGE: tuple[tuple[float, float, float], ...] = (
    # (edad_anos, limite_inferior, limite_superior)
    (1.0, 1500.0, 8500.0),
    (4.0, 1500.0, 8500.0),
    (6.0, 1500.0, 8000.0),
    (10.0, 1800.0, 8000.0),
    (18.0, 1800.0, 7700.0),
)


def anc_reference_range(age_years: float) -> tuple[float, float]:
    """Rango de referencia (inferior, superior) de ANC para la edad."""
    ages = np.array([a for a, _, _ in ANC_REFERENCE_RANGE])
    los = np.array([lo for _, lo, _ in ANC_REFERENCE_RANGE])
    his = np.array([hi for _, _, hi in ANC_REFERENCE_RANGE])
    a = float(np.clip(age_years, ages[0], ages[-1]))
    return float(np.interp(a, ages, los)), float(np.interp(a, ages, his))


def anc_band(anc_per_ul: float) -> AncBand:
    """Clasifica un ANC en la banda del NCI correspondiente."""
    for name, lower in ANC_BANDS:
        if anc_per_ul >= lower:
            return name
    return "profunda"


def event_threshold_for_anc(
    anc_threshold: float,
    age_years: float,
    velocity_um_s: float = REFERENCE_VELOCITY_UM_S,
    diameter_um: float = REFERENCE_DIAMETER_UM,
    patient_neutrophil_fraction: float | None = None,
) -> float:
    """Umbral de eventos/capilar/minuto equivalente a un ANC dado, para la edad.

    Es la funcion que hace pediatrico al metodo. El dispositivo comercial de
    referencia usa un umbral fijo de ~7 eventos/min, derivado de adultos
    (fraccion de neutrofilos ~0.59). Reaplicado sin correccion:

    >>> round(anc_from_wbc(wbc_from_event_rate(7.0), age_years=21), 0)
    487.0
    >>> round(anc_from_wbc(wbc_from_event_rate(7.0), age_years=2), 0)
    272.0

    es decir, en un nino de 2 anos ese mismo umbral solo se dispara cuando el
    ANC ya cayo a ~272/uL: se pierde por completo la franja 272-500, que es
    justamente donde debe activarse la alerta. El umbral correcto a esa edad es:

    >>> round(event_threshold_for_anc(500.0, age_years=2), 1)
    12.8
    """
    frac = (
        float(patient_neutrophil_fraction)
        if patient_neutrophil_fraction is not None
        else neutrophil_fraction_for_age(age_years)
    )
    frac = float(np.clip(frac, 0.02, 0.95))
    wbc_equivalent = float(anc_threshold) / frac
    return event_rate_from_wbc(wbc_equivalent, velocity_um_s, diameter_um)


@dataclass(frozen=True)
class CapillaryCalibration:
    """Calibracion medida en un capilar concreto."""

    velocity_um_s: float
    diameter_um: float
    observed_seconds: float
    n_events: int

    @property
    def events_per_min(self) -> float:
        if self.observed_seconds <= 0:
            return float("nan")
        return self.n_events * 60.0 / self.observed_seconds

    @property
    def wbc_per_ul(self) -> float:
        return wbc_from_event_rate(
            self.events_per_min, self.velocity_um_s, self.diameter_um
        )

    @property
    def sampled_volume_nl(self) -> float:
        """Volumen de sangre efectivamente "interrogado", en nanolitros.

        Argumento de pitch: una medicion de 60 s sobre 5 capilares interroga
        del orden de decimas de nanolitro. Es una gota virtual, sin aguja.
        """
        q = capillary_flow_um3_s(self.velocity_um_s, self.diameter_um)
        return q * self.observed_seconds * 1e-6  # um^3 -> nL


def pooled_wbc_estimate(
    calibrations: list[CapillaryCalibration],
) -> tuple[float, float]:
    """Estimacion agregada de WBC sobre varios capilares.

    Pondera cada capilar por el volumen de sangre que interroga (equivale a
    sumar eventos y sumar volumenes), que es el estimador de maxima
    verosimilitud para un proceso de Poisson. Devuelve ``(wbc, volumen_nL)``.
    """
    if not calibrations:
        return float("nan"), 0.0
    total_events = float(sum(c.n_events for c in calibrations))
    total_volume_nl = float(sum(c.sampled_volume_nl for c in calibrations))
    if total_volume_nl <= 0:
        return float("nan"), 0.0
    # celulas/uL = eventos / (nL * 1e-3 uL/nL)
    return total_events / (total_volume_nl * 1e-3), total_volume_nl


def poisson_relative_ci(n_events: int, confidence: float = 0.95) -> tuple[float, float]:
    """Intervalo de confianza *relativo* de un conteo de Poisson.

    Devuelve multiplicadores ``(lo, hi)`` a aplicar sobre la estimacion puntual.
    Con 3 eventos el intervalo es enorme; con 30 es estrecho. Esto es lo que
    permite a la app decirle al tecnico "sigue grabando" en vez de entregar un
    numero sin sustento.
    """
    from scipy.stats import chi2

    if n_events <= 0:
        return 0.0, float("inf")
    alpha = 1.0 - confidence
    lo = chi2.ppf(alpha / 2.0, 2 * n_events) / 2.0
    hi = chi2.ppf(1.0 - alpha / 2.0, 2 * (n_events + 1)) / 2.0
    return lo / n_events, hi / n_events
