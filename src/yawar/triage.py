"""Motor de triaje: del numero a la conducta.

Un ANC estimado no sirve de nada por si solo. Lo que cambia el desenlace de un
nino con LLA es qué se hace en las dos horas siguientes, y eso depende de tres
cosas a la vez: el recuento, la fiebre y la distancia al hospital.

Reglas clinicas implementadas
-----------------------------
* **Neutropenia febril** = fiebre (una toma >= 38.3 degC, o >= 38.0 degC
  sostenida una hora) junto a ANC < 500/uL, o ANC < 1000/uL con caida
  esperable. Es una **emergencia oncologica**: antibiotico de amplio espectro
  dentro de la primera hora. No admite "control en 24 horas".
* Sin fiebre, ANC < 500/uL implica riesgo alto de infeccion: precauciones,
  contacto con el equipo tratante y repeticion del tamizaje.
* ANC 500-1000/uL es zona de vigilancia.
* ANC >= 1500/uL permite seguir el calendario habitual.

Dos decisiones de diseno que no son obvias
------------------------------------------
1. **La fiebre manda sobre el numero.** Si hay fiebre y el tamizaje no es
   concluyente, el resultado es rojo igual. Un tamizaje optico dudoso nunca
   puede rebajar la conducta que ya indica la clinica; solo puede subirla. El
   equipo es una herramienta para *detectar* riesgo, jamas para *descartarlo*.
2. **Se decide sobre el limite inferior del intervalo, no sobre la
   estimacion.** Con pocos eventos el intervalo de Poisson es ancho, y usar el
   valor central en esas condiciones equivale a fingir una precision que no se
   tiene. Decidir sobre el extremo pesimista es lo que convierte la
   incertidumbre estadistica en seguridad clinica.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum

from . import optics
from .pipeline import ScreeningResult

#: Fiebre en paciente oncologico pediatrico (criterio habitual de consenso).
FEVER_SINGLE_C = 38.3
FEVER_SUSTAINED_C = 38.0


class RiskLevel(str, Enum):
    """Semaforo. El orden importa: se usa para escalar, nunca para rebajar."""

    VERDE = "verde"
    AMARILLO = "amarillo"
    ROJO = "rojo"
    NEGRO = "negro"          # neutropenia febril: emergencia oncologica
    INDETERMINADO = "indeterminado"


_SEVERITY = {
    RiskLevel.VERDE: 0,
    RiskLevel.INDETERMINADO: 1,
    RiskLevel.AMARILLO: 2,
    RiskLevel.ROJO: 3,
    RiskLevel.NEGRO: 4,
}


@dataclass
class ClinicalContext:
    """Lo que el personal de la posta introduce ademas del video."""

    age_years: float
    temperature_c: float | None = None
    fever_sustained_1h: bool = False
    days_since_chemo: int | None = None
    last_cbc_anc: float | None = None
    last_cbc_days_ago: int | None = None
    hours_to_reference_center: float | None = None
    has_central_line: bool = False
    symptoms: list[str] = field(default_factory=list)

    @property
    def has_fever(self) -> bool:
        if self.temperature_c is None:
            return False
        if self.temperature_c >= FEVER_SINGLE_C:
            return True
        return self.fever_sustained_1h and self.temperature_c >= FEVER_SUSTAINED_C


@dataclass
class TriageDecision:
    level: RiskLevel
    title: str
    action: str
    timeframe: str
    rationale: list[str]
    anc_used: float
    anc_lower_bound: float
    escalated_by_fever: bool = False
    next_screening_days: int | None = None

    @property
    def is_emergency(self) -> bool:
        return self.level in (RiskLevel.NEGRO, RiskLevel.ROJO)


def triage(result: ScreeningResult, context: ClinicalContext,
           probability_severe: float | None = None) -> TriageDecision:
    """Convierte un resultado de tamizaje y el contexto clinico en conducta."""
    rationale: list[str] = []

    # --- 1. Valor sobre el que se decide --------------------------------
    anc = result.anc_estimate
    anc_low = result.anc_ci_low
    if anc_low != anc_low:            # NaN
        anc_low = anc

    if result.conclusive:
        rationale.append(
            f"ANC estimado {anc:.0f}/µL (IC95 {result.anc_ci_low:.0f}-"
            f"{result.anc_ci_high:.0f}) sobre {result.n_capillaries_used} "
            f"capilares y {result.total_events} eventos."
        )
    else:
        rationale.append(
            "Tamizaje NO concluyente: " + ", ".join(result.reasons) + "."
        )

    # --- 2. Nivel base por recuento --------------------------------------
    # Se usa el limite inferior del intervalo: con pocos eventos la estimacion
    # puntual es fragil y redondear a favor del paciente es lo correcto.
    if not result.conclusive:
        level = RiskLevel.INDETERMINADO
    elif anc_low < optics.SEVERE_NEUTROPENIA_ANC:
        level = RiskLevel.ROJO
        rationale.append(
            f"El límite inferior del intervalo ({anc_low:.0f}/µL) está por "
            f"debajo de 500/µL: no se puede descartar neutropenia grave."
        )
    elif anc_low < optics.WATCH_ANC:
        level = RiskLevel.AMARILLO
        rationale.append("Recuento en zona de vigilancia (500-1000/µL).")
    elif anc < 1500:
        level = RiskLevel.AMARILLO
        rationale.append("Neutropenia leve (1000-1500/µL).")
    else:
        level = RiskLevel.VERDE

    # --- 3. La fiebre escala, nunca rebaja -------------------------------
    escalated = False
    if context.has_fever:
        # Neutropenia febril: fiebre + ANC bajo, o fiebre + tamizaje dudoso.
        # Ante la duda con fiebre, se trata como emergencia.
        if level in (RiskLevel.ROJO, RiskLevel.INDETERMINADO) or anc_low < optics.WATCH_ANC:
            level = RiskLevel.NEGRO
            rationale.append(
                f"FIEBRE ({context.temperature_c:.1f} °C) con neutropenia o "
                "tamizaje no concluyente: se maneja como neutropenia febril."
            )
        else:
            level = _escalate(level, RiskLevel.AMARILLO)
            rationale.append(
                f"Fiebre ({context.temperature_c:.1f} °C) sin neutropenia "
                "detectada: requiere evaluación aunque el recuento sea normal."
            )
        escalated = True

    if context.has_central_line and level != RiskLevel.VERDE:
        rationale.append("Porta catéter venoso central: mayor riesgo de "
                         "bacteriemia, umbral de derivación más bajo.")
        level = _escalate(level, RiskLevel.ROJO)

    # --- 4. Coherencia con el ultimo hemograma ---------------------------
    if context.last_cbc_anc is not None and result.conclusive:
        drop = context.last_cbc_anc - anc
        if drop > 800 and (context.last_cbc_days_ago or 99) <= 7:
            rationale.append(
                f"Caída de {drop:.0f}/µL respecto del hemograma de hace "
                f"{context.last_cbc_days_ago} días: trayectoria descendente."
            )
            level = _escalate(level, RiskLevel.AMARILLO)

    # --- 5. Nadir esperado -----------------------------------------------
    if context.days_since_chemo is not None and 7 <= context.days_since_chemo <= 14:
        rationale.append(
            f"Día {context.days_since_chemo} post-quimioterapia: ventana de "
            "nadir esperado, el recuento aún puede seguir bajando."
        )

    action, timeframe, title, next_days = _action_for(level, context)
    return TriageDecision(
        level=level, title=title, action=action, timeframe=timeframe,
        rationale=rationale, anc_used=anc, anc_lower_bound=anc_low,
        escalated_by_fever=escalated, next_screening_days=next_days,
    )


def _escalate(current: RiskLevel, floor: RiskLevel) -> RiskLevel:
    """Sube al nivel mas alto de los dos. Nunca baja."""
    return current if _SEVERITY[current] >= _SEVERITY[floor] else floor


def _action_for(level: RiskLevel, ctx: ClinicalContext
                ) -> tuple[str, str, str, int | None]:
    """Conducta concreta, con el tiempo de viaje ya incorporado."""
    travel = ctx.hours_to_reference_center

    if level is RiskLevel.NEGRO:
        extra = ""
        if travel is not None and travel > 4:
            extra = (f" Como el centro de referencia está a {travel:.0f} h, "
                     "iniciar el antibiótico ANTES del traslado, no al llegar.")
        return (
            "Emergencia oncológica. Iniciar antibiótico de amplio espectro "
            "dentro de la primera hora, tomar hemocultivos si es posible sin "
            "demorar el antibiótico, y activar la referencia al INSN San "
            "Borja." + extra,
            "INMEDIATO (< 1 hora)",
            "Sospecha de neutropenia febril",
            None,
        )
    if level is RiskLevel.ROJO:
        return (
            "Contactar hoy mismo con el equipo de hematología del INSNSB por "
            "teleconsulta. Indicar precauciones: evitar aglomeraciones, "
            "control de temperatura cada 8 h, y acudir de inmediato ante "
            "cualquier fiebre. Confirmar con hemograma.",
            "Mismo dia (< 6 horas)",
            "Posible neutropenia grave",
            2,
        )
    if level is RiskLevel.AMARILLO:
        return (
            "Repetir el tamizaje en 48-72 h y coordinar teleconsulta de "
            "control. Reforzar signos de alarma con la familia.",
            "48-72 horas",
            "Vigilancia",
            3,
        )
    if level is RiskLevel.INDETERMINADO:
        return (
            "Repetir la captura siguiendo la guía de calidad. Si vuelve a "
            "salir no concluyente, derivar para hemograma convencional: el "
            "tamizaje no puede descartar nada por sí mismo.",
            "Repetir ahora; si persiste, hemograma en 24 h",
            "Tamizaje no concluyente",
            0,
        )
    return (
        "Continuar con el calendario de controles previsto. Mantener la "
        "vigilancia de signos de alarma en casa.",
        "Según calendario",
        "Sin hallazgos de alarma",
        7,
    )


# --------------------------------------------------------------------------
# Calendario de tamizaje segun el ciclo de quimioterapia
# --------------------------------------------------------------------------


def screening_schedule(chemo_date: datetime, cycle_days: int = 21
                       ) -> list[tuple[datetime, str]]:
    """Fechas sugeridas de tamizaje dentro de un ciclo.

    La neutropenia post-quimioterapia no es constante: baja hasta un nadir
    entre los dias 7 y 14 y se recupera hacia el 21. Un calendario uniforme
    gasta la mitad de las tomas en dias donde no hay nada que encontrar. Se
    concentran los controles alrededor del nadir, que es donde el resultado
    puede cambiar una conducta.
    """
    plan = [
        (3, "Control temprano: linea de base tras el ciclo"),
        (7, "Inicio de la ventana de nadir"),
        (10, "Nadir esperado: control mas importante del ciclo"),
        (14, "Fin de la ventana de nadir"),
        (18, "Verificacion de recuperacion"),
    ]
    return [(chemo_date + timedelta(days=d), label)
            for d, label in plan if d <= cycle_days]
