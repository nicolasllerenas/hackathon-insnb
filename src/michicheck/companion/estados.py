"""Los tres estados del paciente, y qué hace el sistema en cada uno.

Por qué tres y no cinco
-----------------------
Un semáforo de cinco colores es preciso para el clínico e inútil para la
familia. Los tres estados que sí cambian algo son:

============  ==========================================================
Estable       El recordatorio de audio basta. Se sigue el calendario.
Grave         Teleconsulta con el médico asignado, el mismo día.
Priorizable   Teleconsulta **más** opción de ingreso por emergencia.
============  ==========================================================

Cada estado corresponde a una acción distinta de una persona distinta. Si dos
estados llevan a la misma conducta, sobra uno.

La regla que hace seguro al sistema
-----------------------------------
**La fiebre escala y nunca rebaja.** Un tamizaje óptico dudoso no puede reducir
la conducta que la clínica ya indica; sólo puede aumentarla. Eso hace imposible
el único modo de fallo que mataría a un niño —decir «todo bien» a una familia
con un niño en neutropenia febril— y por eso la clase de seguridad del software
baja de C a B en la IEC 62304.

Lo que aporta el juguete al estado
----------------------------------
El estado clínico sale del tamizaje. Pero un michi que lleva tres días callado
también cambia la conducta, aunque el último tamizaje haya sido normal: no
sabemos cómo está ese niño y llevamos días sin saberlo. Ese caso entra a la
cola como **grave por pérdida de seguimiento**, que es una categoría distinta
de «grave por recuento bajo» y se resuelve de otra manera: con una llamada, no
con una teleconsulta.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

from ..pipeline import ScreeningResult
from ..triage import ClinicalContext, RiskLevel, TriageDecision, triage
from . import referencias
from .dispositivo import Enlace, SaludDelEnlace
from .enrolamiento import Ficha
from .tratamiento import PERFILES


class EstadoPaciente(str, Enum):
    ESTABLE = "estable"
    GRAVE = "grave"
    PRIORIZABLE = "priorizable"


ORDEN = {EstadoPaciente.ESTABLE: 0, EstadoPaciente.GRAVE: 1,
         EstadoPaciente.PRIORIZABLE: 2}

_DESDE_TRIAJE = {
    RiskLevel.ESTABLE: EstadoPaciente.ESTABLE,
    RiskLevel.INDETERMINADO: EstadoPaciente.GRAVE,
    RiskLevel.GRAVE: EstadoPaciente.GRAVE,
    RiskLevel.PRIORIZABLE: EstadoPaciente.PRIORIZABLE,
}

CONDUCTAS = {
    EstadoPaciente.ESTABLE: {
        "titulo": "Todo en orden",
        "para_la_familia": ("El michi no encontró nada raro. Sigan con el "
                            "calendario de siempre."),
        "para_el_equipo": ("Basta el recordatorio de audio. Ninguna acción del "
                           "equipo tratante."),
        "plazo": None,
        "teleconsulta": False,
        "emergencia": False,
    },
    EstadoPaciente.GRAVE: {
        "titulo": "Hay que avisar hoy",
        "para_la_familia": ("El michi vio menos defensas de las esperadas. Se "
                            "abrió una teleconsulta con el médico asignado. No "
                            "espera a mañana."),
        "para_el_equipo": ("Teleconsulta con el médico asignado dentro de las "
                           "6 horas. Confirmar con hemograma."),
        "plazo": "6 h",
        "teleconsulta": True,
        "emergencia": False,
    },
    EstadoPaciente.PRIORIZABLE: {
        "titulo": "Atención prioritaria",
        "para_la_familia": ("El michi vio muy pocas defensas. El INSN ya fue "
                            "avisado. Si además hay fiebre de 38 °C o más, vayan "
                            "a emergencias ahora mismo sin esperar la llamada."),
        "para_el_equipo": ("Teleconsulta prioritaria en 15 minutos con opción de "
                           "ingreso por emergencia. Si hay fiebre, antibiótico de "
                           "amplio espectro en la primera hora."),
        "plazo": "15 min",
        "teleconsulta": True,
        "emergencia": True,
    },
}


@dataclass
class Evaluacion:
    estado: EstadoPaciente
    titulo: str
    para_la_familia: str
    para_el_equipo: str
    plazo: str | None
    requiere_teleconsulta: bool
    habilita_emergencia: bool
    motivos: tuple[str, ...]
    escalado_por_fiebre: bool = False
    escalado_por_silencio: bool = False
    referencia_sugerida: referencias.Referencia | None = None
    triaje: TriageDecision | None = None

    def a_dict(self) -> dict[str, Any]:
        return {
            "estado": self.estado.value,
            "titulo": self.titulo,
            "para_la_familia": self.para_la_familia,
            "para_el_equipo": self.para_el_equipo,
            "plazo": self.plazo,
            "requiere_teleconsulta": self.requiere_teleconsulta,
            "habilita_emergencia": self.habilita_emergencia,
            "escalado_por_fiebre": self.escalado_por_fiebre,
            "escalado_por_silencio": self.escalado_por_silencio,
            "motivos": list(self.motivos),
            "referencia": (self.referencia_sugerida.a_dict()
                           if self.referencia_sugerida else None),
        }


def _elevar(actual: EstadoPaciente, piso: EstadoPaciente) -> EstadoPaciente:
    return actual if ORDEN[actual] >= ORDEN[piso] else piso


def _motivo_de_referencia(estado: EstadoPaciente, contexto: ClinicalContext) -> str:
    if contexto.has_fever and estado is EstadoPaciente.PRIORIZABLE:
        return "neutropenia_febril"
    if estado is EstadoPaciente.PRIORIZABLE:
        return "transfusion"
    return "hemograma_de_control"


def evaluar(resultado: ScreeningResult, contexto: ClinicalContext,
            ficha: Ficha | None = None,
            salud_del_enlace: SaludDelEnlace | None = None,
            momento: datetime | None = None) -> Evaluacion:
    """Estado del paciente a partir del tamizaje, la clínica y el juguete.

    Cuando la familia declaró que no puede viajar a Lima y el estado exige
    atención presencial, la evaluación trae ya resuelta la referencia al
    establecimiento capaz más cercano. No deja esa pregunta abierta para
    después: si se deja abierta, la respuesta por defecto vuelve a ser «venga a
    Lima» y volvemos al problema del principio.
    """
    decision = triage(resultado, contexto)
    estado = _DESDE_TRIAJE[decision.level]
    motivos = list(decision.rationale)

    escalado_silencio = False
    if salud_del_enlace is not None:
        if salud_del_enlace.enlace is Enlace.SIN_CONTACTO:
            estado = _elevar(estado, EstadoPaciente.GRAVE)
            escalado_silencio = True
            motivos.append(
                f"El michi lleva {salud_del_enlace.horas_de_silencio:.0f} h sin "
                "comunicarse: no sabemos cómo está este niño y llevamos días sin "
                "saberlo. Se maneja como pérdida de seguimiento.")
        motivos.extend(salud_del_enlace.motivos)

    if ficha is not None:
        perfil = PERFILES[ficha.etapa]
        motivos.append(
            f"Etapa {perfil.nombre.lower()}: riesgo de abandono {perfil.riesgo_abandono}, "
            f"control presencial cada {perfil.dias_entre_controles} días.")

    plantilla = CONDUCTAS[estado]
    para_el_equipo = plantilla["para_el_equipo"]
    if escalado_silencio and estado is EstadoPaciente.GRAVE:
        para_el_equipo = ("Contacto telefónico con el apoderado hoy y, si no "
                          "responde, activación del circuito del Comité de "
                          "Abandono. No es una teleconsulta: es una búsqueda.")

    referencia = None
    if (ficha is not None and estado is not EstadoPaciente.ESTABLE
            and not ficha.domicilio.puede_viajar_a_lima):
        referencia = referencias.generar(
            paciente_id=ficha.paciente.historia_clinica,
            domicilio=ficha.domicilio,
            motivo=_motivo_de_referencia(estado, contexto),
            emitida_por=ficha.medico_asignado,
            momento=momento)
        motivos.append(
            f"La familia declaró que no puede viajar a Lima. Referencia generada a "
            f"{referencia.destino.nombre} ({referencia.destino.ciudad}), "
            f"que evita {referencia.horas_de_viaje_evitadas:.0f} h de viaje.")

    return Evaluacion(
        estado=estado,
        titulo=plantilla["titulo"],
        para_la_familia=plantilla["para_la_familia"],
        para_el_equipo=para_el_equipo,
        plazo=plantilla["plazo"],
        requiere_teleconsulta=plantilla["teleconsulta"],
        habilita_emergencia=plantilla["emergencia"],
        motivos=tuple(motivos),
        escalado_por_fiebre=decision.escalated_by_fever,
        escalado_por_silencio=escalado_silencio,
        referencia_sugerida=referencia,
        triaje=decision,
    )


def cola_de_atencion(evaluaciones: list[tuple[str, Evaluacion]]) -> list[dict[str, Any]]:
    """Ordena por lo que no puede esperar. Es lo que ve el equipo al entrar."""
    ordenadas = sorted(evaluaciones, key=lambda par: -ORDEN[par[1].estado])
    return [
        {"paciente": nombre, "estado": ev.estado.value, "titulo": ev.titulo,
         "conducta": ev.para_el_equipo, "plazo": ev.plazo,
         "referencia": (ev.referencia_sugerida.destino.nombre
                        if ev.referencia_sugerida else None)}
        for nombre, ev in ordenadas
    ]
