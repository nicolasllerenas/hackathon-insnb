"""Teleinterconsulta entre la posta y el hematólogo del INSNSB.

Por qué esta figura y no "una videollamada"
-------------------------------------------
La **teleinterconsulta** ya existe en la ley peruana: Ley 30421 (Ley Marco de
Telesalud), fortalecida por el DL 1490. Está definida como el acto en que un
profesional de salud consulta a un especialista sobre un paciente **que está
bajo su atención**, con o sin el paciente presente.

Eso es exactamente lo que hace falta: el técnico de enfermería de la posta, con
el niño delante, consultando al hematólogo del INSNSB. No hay que inventar una
figura ni justificarla como novedad -- hay que usar una que está regulada y
poco aprovechada.

Distinción que importa: **no es teleconsulta.** En la teleconsulta el
especialista atiende directamente al paciente y asume la responsabilidad
clínica. En la teleinterconsulta el responsable sigue siendo el profesional de
la posta, y el especialista asesora. La segunda es mucho más fácil de sostener
en un establecimiento de primer nivel y no exige que el hematólogo esté
disponible en tiempo real.

Diferida por defecto, y a propósito
-----------------------------------
Una videollamada exige que coincidan tres cosas: el hematólogo libre, el niño
en la posta y el ancho de banda. En Amazonas o Loreto eso falla más veces de
las que funciona, y cada fallo es un viaje o una espera.

Por eso el formato por defecto es **diferido** (*store-and-forward*): la posta
arma un paquete con el tamizaje, las constantes y las fotos, lo sincroniza
cuando hay señal, y el hematólogo responde cuando puede. La videollamada queda
reservada a los casos urgentes, donde sí vale la pena forzar la coincidencia.

Y hay una razón de fondo: **una teleinterconsulta sin dato objetivo es una
conversación a ciegas.** El hematólogo sólo puede preguntar cómo se ve el niño.
El tamizaje óptico es lo que convierte esa conversación en una decisión: aporta
un recuento estimado, con su incertidumbre, medido ahí mismo.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any

from .pipeline import ScreeningResult
from .triage import RiskLevel, TriageDecision


class Modalidad(str, Enum):
    DIFERIDA = "diferida"
    TIEMPO_REAL = "tiempo_real"


class Prioridad(str, Enum):
    RUTINA = "rutina"
    PREFERENTE = "preferente"
    URGENTE = "urgente"
    EMERGENCIA = "emergencia"


PLAZOS = {
    Prioridad.RUTINA: timedelta(hours=72),
    Prioridad.PREFERENTE: timedelta(hours=24),
    Prioridad.URGENTE: timedelta(hours=2),
    Prioridad.EMERGENCIA: timedelta(minutes=15),
}


@dataclass
class Establecimiento:
    """Establecimiento solicitante. El código RENIPRESS es el identificador
    oficial y es lo que permite que esto entre a los sistemas del MINSA."""

    nombre: str
    renipress: str
    nivel: str = "I-3"
    departamento: str = ""
    horas_al_insnsb: float | None = None


@dataclass
class Solicitante:
    """Quien pide la teleinterconsulta. En una posta rural rara vez es médico,
    y el diseño lo asume en vez de fingir lo contrario."""

    nombre: str
    profesion: str
    colegiatura: str | None = None


@dataclass
class Teleinterconsulta:
    """Paquete de teleinterconsulta, listo para sincronizar."""

    id: str
    paciente_id: str
    establecimiento: Establecimiento
    solicitante: Solicitante
    modalidad: Modalidad
    prioridad: Prioridad
    creada: datetime
    motivo: str
    resumen_tamizaje: dict[str, Any]
    signos_vitales: dict[str, Any] = field(default_factory=dict)
    pregunta_concreta: str = ""
    adjuntos: list[str] = field(default_factory=list)
    respuesta: dict[str, Any] | None = None

    @property
    def vence(self) -> datetime:
        return self.creada + PLAZOS[self.prioridad]

    @property
    def vencida(self) -> bool:
        return self.respuesta is None and datetime.now() > self.vence

    def a_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "paciente_id": self.paciente_id,
            "tipo": "teleinterconsulta",
            "marco_legal": "Ley 30421 (Ley Marco de Telesalud), DL 1490",
            "modalidad": self.modalidad.value,
            "prioridad": self.prioridad.value,
            "creada": self.creada.isoformat(timespec="minutes"),
            "vence": self.vence.isoformat(timespec="minutes"),
            "establecimiento": {
                "nombre": self.establecimiento.nombre,
                "renipress": self.establecimiento.renipress,
                "nivel": self.establecimiento.nivel,
                "departamento": self.establecimiento.departamento,
                "horas_al_insnsb": self.establecimiento.horas_al_insnsb,
            },
            "solicitante": {
                "nombre": self.solicitante.nombre,
                "profesion": self.solicitante.profesion,
                "colegiatura": self.solicitante.colegiatura,
            },
            "motivo": self.motivo,
            "pregunta_concreta": self.pregunta_concreta,
            "tamizaje": self.resumen_tamizaje,
            "signos_vitales": self.signos_vitales,
            "adjuntos": self.adjuntos,
            "respuesta": self.respuesta,
            "responsabilidad_clinica": (
                "El profesional solicitante mantiene la responsabilidad sobre "
                "el paciente. El especialista actúa en calidad de asesor."
            ),
        }


def _prioridad_desde_triaje(decision: TriageDecision) -> Prioridad:
    return {
        RiskLevel.PRIORIZABLE: Prioridad.EMERGENCIA,
        RiskLevel.GRAVE: Prioridad.URGENTE,
        RiskLevel.INDETERMINADO: Prioridad.PREFERENTE,
        RiskLevel.ESTABLE: Prioridad.RUTINA,
    }.get(decision.level, Prioridad.RUTINA)


def _pregunta_sugerida(decision: TriageDecision, resultado: ScreeningResult) -> str:
    """La pregunta concreta que hay que responder.

    Una teleinterconsulta que dice "el niño no se ve bien" desperdicia el
    tiempo del especialista. Una que pregunta algo respondible con los datos
    adjuntos se contesta en dos minutos.
    """
    if decision.level is RiskLevel.PRIORIZABLE:
        return ("Se inició antibiótico de amplio espectro por sospecha de "
                "neutropenia febril. ¿Confirma la conducta y autoriza el "
                "ingreso por emergencia, o indica manejo en el establecimiento "
                "de referencia más cercano mientras se coordina?")
    if decision.level is RiskLevel.GRAVE:
        return ("Tamizaje compatible con neutropenia grave sin fiebre. "
                "¿Indica traslado para hemograma confirmatorio, o precauciones "
                "domiciliarias con repetición del tamizaje en 48 h?")
    if not resultado.conclusive:
        return ("Tamizaje no concluyente. ¿Repetimos la captura o derivamos "
                "para hemograma convencional?")
    return "Control de rutina. ¿Alguna indicación antes del próximo tamizaje?"


def crear(resultado: ScreeningResult, decision: TriageDecision,
          paciente_id: str, establecimiento: Establecimiento,
          solicitante: Solicitante,
          signos_vitales: dict[str, Any] | None = None,
          modalidad: Modalidad | None = None,
          momento: datetime | None = None) -> Teleinterconsulta:
    """Arma la teleinterconsulta a partir del tamizaje y el triaje.

    La modalidad se elige sola: sólo se fuerza tiempo real cuando el triaje es
    emergencia. Para todo lo demás, diferida — porque exigir coincidencia de
    agenda y ancho de banda en una posta rural es exigir que falle.
    """
    prioridad = _prioridad_desde_triaje(decision)
    if modalidad is None:
        modalidad = (Modalidad.TIEMPO_REAL if prioridad is Prioridad.EMERGENCIA
                     else Modalidad.DIFERIDA)

    tamizaje: dict[str, Any] = {
        "concluyente": resultado.conclusive,
        "banda": resultado.band,
        "capilares_analizados": resultado.n_capillaries_used,
        "gaps_detectados": resultado.total_events,
        "volumen_interrogado_nl": round(resultado.sampled_volume_nl, 3),
        "nivel_triaje": decision.level.value,
        "metodo": ("Capilaroscopia óptica no invasiva. Cuenta leucocitos "
                   "totales como proxy; NO es un hemograma y no mide "
                   "plaquetas ni fórmula diferencial."),
    }
    if resultado.conclusive:
        tamizaje["anc_estimado"] = round(resultado.anc_estimate)
        tamizaje["intervalo_95"] = [round(resultado.anc_ci_low),
                                    round(resultado.anc_ci_high)]

    return Teleinterconsulta(
        id=f"TIC-{uuid.uuid4().hex[:10].upper()}",
        paciente_id=paciente_id,
        establecimiento=establecimiento,
        solicitante=solicitante,
        modalidad=modalidad,
        prioridad=prioridad,
        creada=momento or datetime.now(),
        motivo=decision.title,
        resumen_tamizaje=tamizaje,
        signos_vitales=signos_vitales or {},
        pregunta_concreta=_pregunta_sugerida(decision, resultado),
    )


def responder(consulta: Teleinterconsulta, especialista: str, cmp: str,
              indicacion: str, requiere_traslado: bool,
              momento: datetime | None = None) -> Teleinterconsulta:
    """Registra la respuesta del especialista.

    Queda si respondió dentro del plazo comprometido: sin esa métrica, el
    compromiso de respuesta es una declaración de intenciones.
    """
    ahora = momento or datetime.now()
    consulta.respuesta = {
        "especialista": especialista,
        "cmp": cmp,
        "respondida": ahora.isoformat(timespec="minutes"),
        "dentro_de_plazo": ahora <= consulta.vence,
        "horas_de_respuesta": round(
            (ahora - consulta.creada).total_seconds() / 3600, 1),
        "indicacion": indicacion,
        "requiere_traslado": requiere_traslado,
    }
    return consulta


def indicadores(consultas: list[Teleinterconsulta]) -> dict[str, Any]:
    """Indicadores del servicio, para el panel del INSNSB.

    ``traslados_evitados`` es el número que justifica el programa: cuántas
    teleinterconsultas se resolvieron sin exigir que la familia viajara.
    """
    if not consultas:
        return {"total": 0}

    respondidas = [c for c in consultas if c.respuesta]
    sin_traslado = [c for c in respondidas if not c.respuesta["requiere_traslado"]]
    en_plazo = [c for c in respondidas if c.respuesta["dentro_de_plazo"]]

    horas_ahorradas = sum(
        (c.establecimiento.horas_al_insnsb or 0) * 2 for c in sin_traslado)

    return {
        "total": len(consultas),
        "respondidas": len(respondidas),
        "vencidas_sin_respuesta": sum(1 for c in consultas if c.vencida),
        "cumplimiento_de_plazo": (round(len(en_plazo) / len(respondidas), 3)
                                  if respondidas else None),
        "horas_mediana_respuesta": (
            round(sorted(c.respuesta["horas_de_respuesta"]
                         for c in respondidas)[len(respondidas) // 2], 1)
            if respondidas else None),
        "traslados_evitados": len(sin_traslado),
        "horas_de_viaje_ahorradas": round(horas_ahorradas, 0),
        "por_prioridad": {
            p.value: sum(1 for c in consultas if c.prioridad is p)
            for p in Prioridad
        },
    }
