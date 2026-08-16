from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from . import optics
from .pipeline import ScreeningResult

FEVER_SINGLE_C = 38.3
FEVER_SUSTAINED_C = 38.0

class RiskLevel(str, Enum):
    ESTABLE = "estable"
    GRAVE = "grave"
    PRIORIZABLE = "priorizable"
    INDETERMINADO = "indeterminado"

_SEVERITY = {
    RiskLevel.ESTABLE: 0,
    RiskLevel.INDETERMINADO: 1,
    RiskLevel.GRAVE: 2,
    RiskLevel.PRIORIZABLE: 3,
}

@dataclass
class ClinicalContext:
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
        return self.level == RiskLevel.PRIORIZABLE

def triage(result: ScreeningResult, context: ClinicalContext, probability_severe: float | None = None) -> TriageDecision:
    rationale: list[str] = []

    anc = result.anc_estimate
    anc_low = result.anc_ci_low
    if anc_low != anc_low:
        anc_low = anc

    if result.conclusive:
        rationale.append(f"ANC estimado {anc:.0f}/µL (IC95 {result.anc_ci_low:.0f}-{result.anc_ci_high:.0f}) sobre {result.n_capillaries_used} capilares y {result.total_events} eventos.")
    else:
        rationale.append("Tamizaje NO concluyente: " + ", ".join(result.reasons) + ".")

    if not result.conclusive:
        level = RiskLevel.INDETERMINADO
    elif anc_low < optics.SEVERE_NEUTROPENIA_ANC:
        level = RiskLevel.GRAVE
        rationale.append(f"El límite inferior del intervalo ({anc_low:.0f}/µL) está por debajo de 500/µL: no se puede descartar neutropenia grave.")
    elif anc_low < optics.WATCH_ANC:
        level = RiskLevel.ESTABLE
        rationale.append("Recuento en zona de vigilancia (500-1000/µL).")
    elif anc < 1500:
        level = RiskLevel.ESTABLE
        rationale.append("Neutropenia leve (1000-1500/µL).")
    else:
        level = RiskLevel.ESTABLE

    escalated = False
    if context.has_fever:
        if level in (RiskLevel.GRAVE, RiskLevel.INDETERMINADO) or anc_low < optics.WATCH_ANC:
            level = RiskLevel.PRIORIZABLE
            rationale.append(f"FIEBRE ({context.temperature_c:.1f} °C) con neutropenia o tamizaje no concluyente: se maneja como neutropenia febril.")
        else:
            level = _escalate(level, RiskLevel.GRAVE)
            rationale.append(f"Fiebre ({context.temperature_c:.1f} °C) sin neutropenia detectada: requiere evaluación aunque el recuento sea normal.")
        escalated = True

    if context.has_central_line and level != RiskLevel.ESTABLE:
        rationale.append("Porta catéter venoso central: mayor riesgo de bacteriemia, umbral de derivación más bajo.")
        level = _escalate(level, RiskLevel.GRAVE)

    if context.last_cbc_anc is not None and result.conclusive:
        drop = context.last_cbc_anc - anc
        if drop > 800 and (context.last_cbc_days_ago or 99) <= 7:
            rationale.append(f"Caída de {drop:.0f}/µL respecto del hemograma de hace {context.last_cbc_days_ago} días: trayectoria descendente.")
            level = _escalate(level, RiskLevel.GRAVE)

    if context.days_since_chemo is not None and 7 <= context.days_since_chemo <= 14:
        rationale.append(f"Día {context.days_since_chemo} post-quimioterapia: ventana de nadir esperado, el recuento aún puede seguir bajando.")

    action, timeframe, title, next_days = _action_for(level, context)
    return TriageDecision(
        level=level, title=title, action=action, timeframe=timeframe,
        rationale=rationale, anc_used=anc, anc_lower_bound=anc_low,
        escalated_by_fever=escalated, next_screening_days=next_days,
    )

def _escalate(current: RiskLevel, floor: RiskLevel) -> RiskLevel:
    return current if _SEVERITY[current] >= _SEVERITY[floor] else floor

def _action_for(level: RiskLevel, ctx: ClinicalContext) -> tuple[str, str, str, int | None]:
    travel = ctx.hours_to_reference_center

    if level is RiskLevel.PRIORIZABLE:
        extra = ""
        if travel is not None and travel > 4:
            extra = f" Como el centro de referencia está a {travel:.0f} h, iniciar el antibiótico ANTES del traslado, no al llegar."
        return (
            "Emergencia oncológica. Iniciar antibiótico de amplio espectro dentro de la primera hora, tomar hemocultivos si es posible sin demorar el antibiótico, y activar la referencia al INSN San Borja." + extra,
            "INMEDIATO (< 1 hora)",
            "Sospecha de neutropenia febril",
            None,
        )
    if level is RiskLevel.GRAVE:
        return (
            "Contactar hoy mismo con el equipo de hematología del INSNSB por teleconsulta. Indicar precauciones: evitar aglomeraciones, control de temperatura cada 8 h, y acudir de inmediato ante cualquier fiebre. Confirmar con hemograma.",
            "Mismo dia (< 6 horas)",
            "Posible neutropenia grave",
            2,
        )
    if level is RiskLevel.INDETERMINADO:
        return (
            "Repetir la captura siguiendo la guía de calidad. Si vuelve a salir no concluyente, derivar para hemograma convencional: el tamizaje no puede descartar nada por sí mismo.",
            "Repetir ahora; si persiste, hemograma en 24 h",
            "Tamizaje no concluyente",
            0,
        )
    return (
        "Continuar con el calendario de controles previsto. Mantener la vigilancia de signos de alarma en casa.",
        "Según calendario",
        "Sin hallazgos de alarma",
        7,
    )

def screening_schedule(chemo_date: datetime, cycle_days: int = 21) -> list[tuple[datetime, str]]:
    plan = [
        (3, "Control temprano: linea de base tras el ciclo"),
        (7, "Inicio de la ventana de nadir"),
        (10, "Nadir esperado: control mas importante del ciclo"),
        (14, "Fin de la ventana de nadir"),
        (18, "Verificacion de recuperacion"),
    ]
    return [(chemo_date + timedelta(days=d), label) for d, label in plan if d <= cycle_days]
