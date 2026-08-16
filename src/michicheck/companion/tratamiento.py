"""Etapas del tratamiento de la leucemia linfoblástica aguda pediátrica.

Por qué el sistema necesita saber en qué etapa está el niño
----------------------------------------------------------
Porque el abandono no se reparte parejo. Durante la **inducción** el niño está
hospitalizado o viene cada pocos días: nadie abandona ahí, la enfermedad se ve.
El abandono se concentra en el **mantenimiento**, que dura unos dos años, es
ambulatorio, la quimioterapia se toma en casa y el niño se ve sano. Es la fase
en la que el beneficio de cada viaje se vuelve invisible para la familia.

Un recordatorio que suena igual en inducción que en mantenimiento está mal
diseñado. En inducción sobra; en mantenimiento hace falta que insista.

Referencia: Guía de Práctica Clínica de Leucemia Linfoblástica Aguda (MINSA,
diciembre 2024) y protocolos de tipo BFM/COG usados en el INSN San Borja.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from enum import Enum


class Etapa(str, Enum):
    INDUCCION = "induccion"
    CONSOLIDACION = "consolidacion"
    INTENSIFICACION = "intensificacion"
    MANTENIMIENTO = "mantenimiento"
    VIGILANCIA = "vigilancia"


@dataclass(frozen=True)
class PerfilEtapa:
    """Cómo se comporta el sistema en una etapa concreta."""

    etapa: Etapa
    nombre: str
    duracion_semanas_tipica: tuple[int, int]
    ambito: str
    dias_entre_controles: int
    dias_entre_tamizajes: int
    riesgo_abandono: str
    quimioterapia_oral_en_casa: bool
    explicacion_para_la_familia: str
    por_que_importa_el_tamizaje: str


PERFILES: dict[Etapa, PerfilEtapa] = {
    Etapa.INDUCCION: PerfilEtapa(
        etapa=Etapa.INDUCCION,
        nombre="Inducción",
        duracion_semanas_tipica=(4, 6),
        ambito="hospitalario",
        dias_entre_controles=3,
        dias_entre_tamizajes=2,
        riesgo_abandono="bajo",
        quimioterapia_oral_en_casa=False,
        explicacion_para_la_familia=(
            "Es la fase en la que se busca la remisión: que la médula deje de "
            "producir células enfermas. Es la más intensa y la más vigilada. "
            "Aquí el michi acompaña, no reemplaza ningún control."
        ),
        por_que_importa_el_tamizaje=(
            "El nadir de neutrófilos es profundo y esperado. El tamizaje en "
            "casa detecta el momento en que cualquier fiebre se vuelve una "
            "emergencia."
        ),
    ),
    Etapa.CONSOLIDACION: PerfilEtapa(
        etapa=Etapa.CONSOLIDACION,
        nombre="Consolidación",
        duracion_semanas_tipica=(8, 12),
        ambito="mixto",
        dias_entre_controles=7,
        dias_entre_tamizajes=3,
        riesgo_abandono="moderado",
        quimioterapia_oral_en_casa=False,
        explicacion_para_la_familia=(
            "La remisión ya se logró; ahora hay que eliminar la enfermedad que "
            "no se ve. El niño empieza a estar más tiempo en casa, y ahí "
            "empieza a hacer falta que alguien vigile todos los días."
        ),
        por_que_importa_el_tamizaje=(
            "Primer periodo con días en casa durante el nadir. El tamizaje "
            "diario cubre justo esos días."
        ),
    ),
    Etapa.INTENSIFICACION: PerfilEtapa(
        etapa=Etapa.INTENSIFICACION,
        nombre="Intensificación",
        duracion_semanas_tipica=(6, 10),
        ambito="mixto",
        dias_entre_controles=7,
        dias_entre_tamizajes=2,
        riesgo_abandono="moderado",
        quimioterapia_oral_en_casa=True,
        explicacion_para_la_familia=(
            "Se vuelve a subir la intensidad para cerrar la puerta a la "
            "recaída. Los recuentos vuelven a bajar mucho, y el niño ya está "
            "en casa buena parte del tiempo."
        ),
        por_que_importa_el_tamizaje=(
            "Nadires profundos con el niño en domicilio: la combinación de "
            "mayor riesgo del tratamiento completo."
        ),
    ),
    Etapa.MANTENIMIENTO: PerfilEtapa(
        etapa=Etapa.MANTENIMIENTO,
        nombre="Mantenimiento",
        duracion_semanas_tipica=(96, 130),
        ambito="domiciliario",
        dias_entre_controles=30,
        dias_entre_tamizajes=7,
        riesgo_abandono="alto",
        quimioterapia_oral_en_casa=True,
        explicacion_para_la_familia=(
            "Dos años de quimioterapia en casa, en pastillas. El niño se ve "
            "bien, va al colegio, juega. Por eso es la fase más peligrosa: no "
            "porque la enfermedad sea peor, sino porque es fácil creer que ya "
            "pasó. Nueve de cada diez abandonos ocurren aquí."
        ),
        por_que_importa_el_tamizaje=(
            "El objetivo del mantenimiento es sostener el recuento dentro de "
            "una ventana: ni tan alto que la dosis sea insuficiente, ni tan "
            "bajo que sea tóxica. Hoy eso se comprueba con un hemograma "
            "mensual. El michi lo convierte en una trayectoria semanal."
        ),
    ),
    Etapa.VIGILANCIA: PerfilEtapa(
        etapa=Etapa.VIGILANCIA,
        nombre="Vigilancia post-tratamiento",
        duracion_semanas_tipica=(130, 400),
        ambito="domiciliario",
        dias_entre_controles=90,
        dias_entre_tamizajes=30,
        riesgo_abandono="moderado",
        quimioterapia_oral_en_casa=False,
        explicacion_para_la_familia=(
            "El tratamiento terminó. Ahora toca comprobar que no vuelva. Los "
            "controles se espacian, pero no desaparecen."
        ),
        por_que_importa_el_tamizaje=(
            "Una caída sostenida del recuento entre controles trimestrales es "
            "un dato que hoy nadie recoge."
        ),
    ),
}


VENTANA_MANTENIMIENTO_ANC = (500.0, 1500.0)


@dataclass
class PlanDeEtapa:
    """Calendario derivado de la etapa, listo para el planificador de alertas."""

    perfil: PerfilEtapa
    inicio: date
    fin_previsto: date
    controles: list[date]
    tamizajes: list[date]

    @property
    def dias_restantes(self) -> int:
        return (self.fin_previsto - date.today()).days

    def a_dict(self) -> dict:
        return {
            "etapa": self.perfil.etapa.value,
            "nombre": self.perfil.nombre,
            "ambito": self.perfil.ambito,
            "riesgo_abandono": self.perfil.riesgo_abandono,
            "quimioterapia_oral_en_casa": self.perfil.quimioterapia_oral_en_casa,
            "inicio": self.inicio.isoformat(),
            "fin_previsto": self.fin_previsto.isoformat(),
            "dias_restantes": self.dias_restantes,
            "controles_presenciales": [d.isoformat() for d in self.controles],
            "tamizajes_en_casa": [d.isoformat() for d in self.tamizajes],
            "explicacion": self.perfil.explicacion_para_la_familia,
            "por_que_el_tamizaje": self.perfil.por_que_importa_el_tamizaje,
        }


def planificar(etapa: Etapa, inicio: date, horizonte_dias: int = 90) -> PlanDeEtapa:
    """Deriva el calendario de controles y tamizajes de una etapa.

    El horizonte se acota porque nadie planifica dos años de alertas de golpe:
    el plan se regenera en cada control, cuando el médico confirma o corrige la
    etapa.
    """
    perfil = PERFILES[etapa]
    semanas_min, semanas_max = perfil.duracion_semanas_tipica
    fin = inicio + timedelta(weeks=semanas_max)
    limite = min(fin, inicio + timedelta(days=horizonte_dias))

    controles = _serie(inicio, limite, perfil.dias_entre_controles)
    tamizajes = _serie(inicio, limite, perfil.dias_entre_tamizajes)
    return PlanDeEtapa(perfil=perfil, inicio=inicio, fin_previsto=fin,
                       controles=controles, tamizajes=tamizajes)


def _serie(inicio: date, limite: date, paso_dias: int) -> list[date]:
    fechas: list[date] = []
    actual = inicio + timedelta(days=paso_dias)
    while actual <= limite:
        fechas.append(actual)
        actual = actual + timedelta(days=paso_dias)
    return fechas


def etapa_desde_texto(valor: str) -> Etapa:
    """Acepta lo que escriba el médico sin obligarlo a memorizar códigos."""
    limpio = valor.strip().lower()
    equivalencias = {
        "induccion": Etapa.INDUCCION,
        "inducción": Etapa.INDUCCION,
        "consolidacion": Etapa.CONSOLIDACION,
        "consolidación": Etapa.CONSOLIDACION,
        "intensificacion": Etapa.INTENSIFICACION,
        "intensificación": Etapa.INTENSIFICACION,
        "reinduccion": Etapa.INTENSIFICACION,
        "reinducción": Etapa.INTENSIFICACION,
        "mantenimiento": Etapa.MANTENIMIENTO,
        "vigilancia": Etapa.VIGILANCIA,
        "seguimiento": Etapa.VIGILANCIA,
    }
    if limpio not in equivalencias:
        raise ValueError(f"Etapa no reconocida: {valor!r}")
    return equivalencias[limpio]
