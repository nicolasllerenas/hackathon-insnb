"""Red nacional de atención y generación de referencias desde la teleconsulta.

El problema que resuelve este módulo
------------------------------------
La respuesta habitual a un niño con leucemia que vive lejos es «que venga al
INSN San Borja». Para una familia de Bagua eso son 18 horas de viaje de ida y
vuelta y varios días de sueldo perdidos. Repetido cuarenta y cinco veces, no es
una molestia: es la causa del abandono.

Cuando la teleconsulta concluye que el niño necesita atención presencial, el
sistema no debe limitarse a decir «venga a Lima». Debe responder una pregunta
concreta: **¿cuál es el establecimiento más cercano que puede hacer lo que este
niño necesita ahora mismo?** A veces es el INSN. Muchas veces es un hospital
regional a dos horas.

Dos niveles, porque no todo requiere lo mismo
---------------------------------------------
* **Centros oncológicos pediátricos** (los diez que el MINSA reconoce como red
  de referencia para cáncer infantil): diagnóstico, quimioterapia de inducción,
  trasplante. Ahí se trata la enfermedad.
* **Establecimientos de continuidad**: hospitales regionales que sí pueden
  hacer un hemograma, transfundir, poner la primera dosis de antibiótico de
  amplio espectro y hospitalizar a un niño. No tratan la leucemia, pero
  resuelven la urgencia y sostienen el mantenimiento.

La mayoría de los eventos que hoy generan un viaje a Lima —un hemograma de
control, una fiebre que necesita antibiótico en la primera hora, una
transfusión— se resuelven en el segundo nivel. Eso es lo que este módulo
convierte en una decisión explícita y trazable.

Fuente de la red oncológica: MINSA, red de diez hospitales de referencia para
cáncer infantil (2025). Los códigos RENIPRESS deben completarse contra el
padrón oficial antes de cualquier uso asistencial.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class Capacidad(str, Enum):
    HEMOGRAMA = "hemograma"
    HEMOCULTIVO = "hemocultivo"
    ANTIBIOTICO_AMPLIO_ESPECTRO = "antibiotico_amplio_espectro"
    TRANSFUSION = "transfusion"
    HOSPITALIZACION_PEDIATRICA = "hospitalizacion_pediatrica"
    UCI_PEDIATRICA = "uci_pediatrica"
    QUIMIOTERAPIA_PEDIATRICA = "quimioterapia_pediatrica"
    HEMATOLOGIA_PEDIATRICA = "hematologia_pediatrica"
    TRASPLANTE_MEDULA = "trasplante_medula"


class Nivel(str, Enum):
    ONCOLOGICO = "centro_oncologico_pediatrico"
    CONTINUIDAD = "establecimiento_de_continuidad"


@dataclass(frozen=True)
class Centro:
    codigo: str
    nombre: str
    nivel: Nivel
    departamento: str
    ciudad: str
    capacidades: frozenset[Capacidad]
    horas_a_lima: float
    renipress: str | None = None

    def puede(self, requeridas: set[Capacidad]) -> bool:
        return requeridas.issubset(self.capacidades)

    def faltantes(self, requeridas: set[Capacidad]) -> set[Capacidad]:
        return requeridas - self.capacidades


_ONCO = frozenset({
    Capacidad.HEMOGRAMA, Capacidad.HEMOCULTIVO,
    Capacidad.ANTIBIOTICO_AMPLIO_ESPECTRO, Capacidad.TRANSFUSION,
    Capacidad.HOSPITALIZACION_PEDIATRICA, Capacidad.UCI_PEDIATRICA,
    Capacidad.QUIMIOTERAPIA_PEDIATRICA, Capacidad.HEMATOLOGIA_PEDIATRICA,
})

_CONTINUIDAD = frozenset({
    Capacidad.HEMOGRAMA, Capacidad.HEMOCULTIVO,
    Capacidad.ANTIBIOTICO_AMPLIO_ESPECTRO, Capacidad.TRANSFUSION,
    Capacidad.HOSPITALIZACION_PEDIATRICA,
})


RED: tuple[Centro, ...] = (
    Centro("INSNSB", "Instituto Nacional de Salud del Niño San Borja",
           Nivel.ONCOLOGICO, "Lima", "Lima",
           _ONCO | {Capacidad.TRASPLANTE_MEDULA}, 0.0, renipress="00006213"),
    Centro("INEN", "Instituto Nacional de Enfermedades Neoplásicas",
           Nivel.ONCOLOGICO, "Lima", "Lima",
           _ONCO | {Capacidad.TRASPLANTE_MEDULA}, 0.0),
    Centro("INSNB", "Instituto Nacional de Salud del Niño (Breña)",
           Nivel.ONCOLOGICO, "Lima", "Lima", _ONCO, 0.0),
    Centro("HNDM", "Hospital Nacional Dos de Mayo",
           Nivel.ONCOLOGICO, "Lima", "Lima", _ONCO, 0.0),
    Centro("HCH", "Hospital Cayetano Heredia",
           Nivel.ONCOLOGICO, "Lima", "Lima", _ONCO, 0.0),
    Centro("HBT", "Hospital Belén de Trujillo",
           Nivel.ONCOLOGICO, "La Libertad", "Trujillo", _ONCO, 9.0),
    Centro("IRENSUR", "Instituto Regional de Enfermedades Neoplásicas del Sur",
           Nivel.ONCOLOGICO, "Arequipa", "Arequipa", _ONCO, 16.0),
    Centro("HRHD", "Hospital Regional Honorio Delgado Espinoza",
           Nivel.ONCOLOGICO, "Arequipa", "Arequipa", _ONCO, 16.0),
    Centro("HAL", "Hospital Antonio Lorena del Cusco",
           Nivel.ONCOLOGICO, "Cusco", "Cusco", _ONCO, 21.0),
    Centro("HRC", "Hospital Regional del Cusco",
           Nivel.ONCOLOGICO, "Cusco", "Cusco", _ONCO, 21.0),

    Centro("HRDLM", "Hospital Regional Docente Las Mercedes",
           Nivel.CONTINUIDAD, "Lambayeque", "Chiclayo", _CONTINUIDAD, 11.0),
    Centro("HJCH", "Hospital José Cayetano Heredia",
           Nivel.CONTINUIDAD, "Piura", "Piura", _CONTINUIDAD, 14.0),
    Centro("HRVF", "Hospital Regional Virgen de Fátima",
           Nivel.CONTINUIDAD, "Amazonas", "Chachapoyas",
           frozenset({Capacidad.HEMOGRAMA, Capacidad.ANTIBIOTICO_AMPLIO_ESPECTRO,
                      Capacidad.HOSPITALIZACION_PEDIATRICA}), 20.0),
    Centro("HRC-CAJ", "Hospital Regional Docente de Cajamarca",
           Nivel.CONTINUIDAD, "Cajamarca", "Cajamarca", _CONTINUIDAD, 14.0),
    Centro("HII-2TAR", "Hospital II-2 Tarapoto",
           Nivel.CONTINUIDAD, "San Martín", "Tarapoto", _CONTINUIDAD, 24.0),
    Centro("HRL", "Hospital Regional de Loreto Felipe Santiago Arriola",
           Nivel.CONTINUIDAD, "Loreto", "Iquitos",
           _CONTINUIDAD | {Capacidad.UCI_PEDIATRICA}, 2.0),
    Centro("HRP", "Hospital Regional de Pucallpa",
           Nivel.CONTINUIDAD, "Ucayali", "Pucallpa", _CONTINUIDAD, 18.0),
    Centro("HRHV", "Hospital Regional Hermilio Valdizán",
           Nivel.CONTINUIDAD, "Huánuco", "Huánuco", _CONTINUIDAD, 8.0),
    Centro("HDAC-PAS", "Hospital Daniel Alcides Carrión de Pasco",
           Nivel.CONTINUIDAD, "Pasco", "Cerro de Pasco",
           frozenset({Capacidad.HEMOGRAMA, Capacidad.ANTIBIOTICO_AMPLIO_ESPECTRO,
                      Capacidad.HOSPITALIZACION_PEDIATRICA}), 8.0),
    Centro("HRDMI", "Hospital Regional Docente Materno Infantil El Carmen",
           Nivel.CONTINUIDAD, "Junín", "Huancayo", _CONTINUIDAD, 7.0),
    Centro("HRA", "Hospital Regional de Ayacucho Miguel Ángel Mariscal Llerena",
           Nivel.CONTINUIDAD, "Ayacucho", "Ayacucho", _CONTINUIDAD, 9.0),
    Centro("HRZCV", "Hospital Regional Zacarías Correa Valdivia",
           Nivel.CONTINUIDAD, "Huancavelica", "Huancavelica",
           frozenset({Capacidad.HEMOGRAMA, Capacidad.ANTIBIOTICO_AMPLIO_ESPECTRO,
                      Capacidad.HOSPITALIZACION_PEDIATRICA}), 11.0),
    Centro("HRICA", "Hospital Regional de Ica",
           Nivel.CONTINUIDAD, "Ica", "Ica", _CONTINUIDAD, 4.5),
    Centro("HRMNB", "Hospital Regional Manuel Núñez Butrón",
           Nivel.CONTINUIDAD, "Puno", "Puno", _CONTINUIDAD, 20.0),
    Centro("HHU-TAC", "Hospital Hipólito Unanue de Tacna",
           Nivel.CONTINUIDAD, "Tacna", "Tacna", _CONTINUIDAD, 19.0),
    Centro("HRM", "Hospital Regional de Moquegua",
           Nivel.CONTINUIDAD, "Moquegua", "Moquegua",
           frozenset({Capacidad.HEMOGRAMA, Capacidad.ANTIBIOTICO_AMPLIO_ESPECTRO,
                      Capacidad.HOSPITALIZACION_PEDIATRICA}), 18.0),
    Centro("HSRPM", "Hospital Santa Rosa de Puerto Maldonado",
           Nivel.CONTINUIDAD, "Madre de Dios", "Puerto Maldonado",
           frozenset({Capacidad.HEMOGRAMA, Capacidad.ANTIBIOTICO_AMPLIO_ESPECTRO,
                      Capacidad.HOSPITALIZACION_PEDIATRICA}), 3.0),
    Centro("HRDA", "Hospital Regional de Apurímac Guillermo Díaz de la Vega",
           Nivel.CONTINUIDAD, "Apurímac", "Abancay",
           frozenset({Capacidad.HEMOGRAMA, Capacidad.ANTIBIOTICO_AMPLIO_ESPECTRO,
                      Capacidad.HOSPITALIZACION_PEDIATRICA}), 16.0),
    Centro("HRDAV", "Hospital Regional Eleazar Guzmán Barrón",
           Nivel.CONTINUIDAD, "Áncash", "Chimbote", _CONTINUIDAD, 6.0),
    Centro("HRT-TUM", "Hospital Regional José Alfredo Mendoza Olavarría",
           Nivel.CONTINUIDAD, "Tumbes", "Tumbes",
           frozenset({Capacidad.HEMOGRAMA, Capacidad.ANTIBIOTICO_AMPLIO_ESPECTRO,
                      Capacidad.HOSPITALIZACION_PEDIATRICA}), 18.0),
)


_VECINDAD: dict[str, tuple[str, ...]] = {
    "Amazonas": ("Cajamarca", "San Martín", "Lambayeque", "La Libertad"),
    "Áncash": ("La Libertad", "Lima", "Huánuco"),
    "Apurímac": ("Cusco", "Ayacucho", "Arequipa"),
    "Arequipa": ("Moquegua", "Puno", "Cusco", "Ica"),
    "Ayacucho": ("Huancavelica", "Junín", "Apurímac", "Ica"),
    "Cajamarca": ("Lambayeque", "La Libertad", "Amazonas", "Piura"),
    "Callao": ("Lima",),
    "Cusco": ("Apurímac", "Puno", "Arequipa", "Madre de Dios"),
    "Huancavelica": ("Junín", "Ayacucho", "Ica", "Lima"),
    "Huánuco": ("Pasco", "Junín", "Áncash", "Ucayali", "San Martín"),
    "Ica": ("Lima", "Ayacucho", "Huancavelica", "Arequipa"),
    "Junín": ("Pasco", "Huancavelica", "Ayacucho", "Huánuco", "Lima"),
    "La Libertad": ("Lambayeque", "Cajamarca", "Áncash", "San Martín"),
    "Lambayeque": ("La Libertad", "Cajamarca", "Piura", "Amazonas"),
    "Lima": ("Ica", "Junín", "Áncash", "Huánuco", "Pasco"),
    "Loreto": ("San Martín", "Ucayali", "Amazonas"),
    "Madre de Dios": ("Cusco", "Puno", "Ucayali"),
    "Moquegua": ("Arequipa", "Tacna", "Puno"),
    "Pasco": ("Junín", "Huánuco", "Lima", "Ucayali"),
    "Piura": ("Lambayeque", "Tumbes", "Cajamarca"),
    "Puno": ("Cusco", "Arequipa", "Moquegua", "Madre de Dios"),
    "San Martín": ("Loreto", "Amazonas", "La Libertad", "Huánuco", "Ucayali"),
    "Tacna": ("Moquegua", "Puno"),
    "Tumbes": ("Piura",),
    "Ucayali": ("Huánuco", "Pasco", "Loreto", "Madre de Dios"),
}


CAPACIDADES_DESEABLES: dict[str, set[Capacidad]] = {
    "neutropenia_febril": {Capacidad.HEMOCULTIVO, Capacidad.HEMOGRAMA},
    "transfusion": {Capacidad.UCI_PEDIATRICA},
}

CAPACIDADES_POR_MOTIVO: dict[str, set[Capacidad]] = {
    "hemograma_de_control": {Capacidad.HEMOGRAMA},
    "neutropenia_febril": {
        Capacidad.ANTIBIOTICO_AMPLIO_ESPECTRO,
        Capacidad.HOSPITALIZACION_PEDIATRICA},
    "transfusion": {Capacidad.TRANSFUSION, Capacidad.HEMOGRAMA},
    "ajuste_de_quimioterapia": {Capacidad.HEMATOLOGIA_PEDIATRICA,
                                Capacidad.HEMOGRAMA},
    "quimioterapia": {Capacidad.QUIMIOTERAPIA_PEDIATRICA},
    "sospecha_de_recaida": {Capacidad.HEMATOLOGIA_PEDIATRICA,
                            Capacidad.QUIMIOTERAPIA_PEDIATRICA},
}


@dataclass
class Domicilio:
    departamento: str
    provincia: str = ""
    distrito: str = ""
    horas_al_insnsb: float | None = None
    puede_viajar_a_lima: bool = True
    motivo_impedimento: str = ""


@dataclass
class Referencia:
    """Referencia generada desde la teleconsulta, no desde una ventanilla."""

    id: str
    paciente_id: str
    creada: datetime
    motivo: str
    capacidades_requeridas: tuple[str, ...]
    destino: Centro
    alternativas: tuple[Centro, ...]
    horas_de_viaje_evitadas: float
    justificacion: str
    advertencias: tuple[str, ...] = ()
    contrarreferencia_a: str = "INSNSB"
    emitida_por: str = ""

    def a_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "paciente_id": self.paciente_id,
            "creada": self.creada.isoformat(timespec="minutes"),
            "motivo": self.motivo,
            "capacidades_requeridas": list(self.capacidades_requeridas),
            "destino": {
                "codigo": self.destino.codigo,
                "nombre": self.destino.nombre,
                "nivel": self.destino.nivel.value,
                "departamento": self.destino.departamento,
                "ciudad": self.destino.ciudad,
                "renipress": self.destino.renipress,
            },
            "alternativas": [
                {"codigo": c.codigo, "nombre": c.nombre, "ciudad": c.ciudad}
                for c in self.alternativas],
            "horas_de_viaje_evitadas": self.horas_de_viaje_evitadas,
            "justificacion": self.justificacion,
            "advertencias": list(self.advertencias),
            "contrarreferencia_a": self.contrarreferencia_a,
            "emitida_por": self.emitida_por,
            "marco": ("Norma Técnica del Sistema de Referencia y "
                      "Contrarreferencia, MINSA. Emitida en el acto de "
                      "teleconsulta conforme a la Ley 30421 y el DL 1490."),
        }


def centros_por_departamento(departamento: str) -> list[Centro]:
    return [c for c in RED if c.departamento == departamento]


def _distancia_administrativa(origen: str, destino: str) -> int:
    if origen == destino:
        return 0
    if destino in _VECINDAD.get(origen, ()):
        return 1
    for vecino in _VECINDAD.get(origen, ()):
        if destino in _VECINDAD.get(vecino, ()):
            return 2
    return 3


def _costo(centro: Centro, domicilio: Domicilio) -> tuple[int, float]:
    salto = _distancia_administrativa(domicilio.departamento, centro.departamento)
    return (salto, centro.horas_a_lima if salto else 0.0)


def candidatos(domicilio: Domicilio, requeridas: set[Capacidad]) -> list[Centro]:
    """Centros capaces, ordenados por cercanía administrativa al domicilio."""
    capaces = [c for c in RED if c.puede(requeridas)]
    if not domicilio.puede_viajar_a_lima:
        capaces = [c for c in capaces if c.departamento != "Lima"] or capaces
    return sorted(capaces, key=lambda c: _costo(c, domicilio))


def generar(paciente_id: str, domicilio: Domicilio, motivo: str,
            emitida_por: str = "", momento: datetime | None = None,
            capacidades: set[Capacidad] | None = None) -> Referencia:
    """Resuelve a dónde va el niño y por qué, y deja el rastro de la decisión.

    Si la familia no puede viajar a Lima, el sistema no responde «entonces no
    hay atención»: busca el centro capaz más cercano y declara explícitamente
    lo que ese centro **no** puede hacer, para que la teleconsulta se haga cargo
    de la diferencia.
    """
    requeridas = capacidades or CAPACIDADES_POR_MOTIVO.get(motivo, {Capacidad.HEMOGRAMA})
    orden = candidatos(domicilio, requeridas)
    if not orden:
        raise ValueError(
            f"Ningún establecimiento de la red cubre {sorted(c.value for c in requeridas)}")

    destino = orden[0]
    referencia_nacional = next(c for c in RED if c.codigo == "INSNSB")
    horas_ida_vuelta_lima = 2 * (domicilio.horas_al_insnsb or referencia_nacional.horas_a_lima)
    evitadas = horas_ida_vuelta_lima if destino.codigo != "INSNSB" else 0.0

    advertencias: list[str] = []
    if motivo == "neutropenia_febril":
        advertencias.append(
            "Iniciar el antibiótico de amplio espectro ANTES del traslado, no al "
            "llegar. La primera hora manda sobre la distancia.")
    faltan_deseables = CAPACIDADES_DESEABLES.get(motivo, set()) - destino.capacidades
    if faltan_deseables:
        advertencias.append(
            "El destino no dispone de " +
            ", ".join(sorted(c.value.replace("_", " ") for c in faltan_deseables)) +
            ". Tomarlos si es posible sin demorar el tratamiento; si no, coordinar "
            "el envío de la muestra.")
    if destino.nivel is Nivel.CONTINUIDAD:
        faltan = _ONCO - destino.capacidades
        if faltan:
            advertencias.append(
                "El destino resuelve la urgencia pero no sustituye al centro "
                "oncológico: no dispone de " +
                ", ".join(sorted(c.value.replace("_", " ") for c in faltan)) + ".")
        advertencias.append(
            "El hematólogo del INSNSB mantiene la conducción del caso por "
            "teleconsulta. La contrarreferencia es obligatoria.")
    if not domicilio.puede_viajar_a_lima and domicilio.motivo_impedimento:
        advertencias.append(
            f"Impedimento declarado por la familia: {domicilio.motivo_impedimento}.")

    justificacion = (
        f"El niño requiere {', '.join(sorted(c.value.replace('_', ' ') for c in requeridas))}. "
        f"{destino.nombre} ({destino.ciudad}, {destino.departamento}) es el "
        f"establecimiento capaz más cercano al domicilio declarado "
        f"({domicilio.provincia or domicilio.departamento}). ")
    if evitadas:
        justificacion += (
            f"Resolver aquí evita {evitadas:.0f} horas de viaje ida y vuelta a Lima.")
    else:
        justificacion += "No existe alternativa capaz fuera de Lima para este motivo."

    return Referencia(
        id=f"REF-{uuid.uuid4().hex[:10].upper()}",
        paciente_id=paciente_id,
        creada=momento or datetime.now(),
        motivo=motivo,
        capacidades_requeridas=tuple(sorted(c.value for c in requeridas)),
        destino=destino,
        alternativas=tuple(orden[1:4]),
        horas_de_viaje_evitadas=round(evitadas, 1),
        justificacion=justificacion,
        advertencias=tuple(advertencias),
        emitida_por=emitida_por,
    )


def cobertura() -> dict[str, Any]:
    """Resumen de la red, para el panel y para la diapositiva de escala."""
    departamentos = sorted({c.departamento for c in RED})
    sin_oncologico = sorted(
        d for d in _VECINDAD
        if not any(c.departamento == d and c.nivel is Nivel.ONCOLOGICO for c in RED))
    return {
        "centros": len(RED),
        "centros_oncologicos_pediatricos": sum(
            1 for c in RED if c.nivel is Nivel.ONCOLOGICO),
        "establecimientos_de_continuidad": sum(
            1 for c in RED if c.nivel is Nivel.CONTINUIDAD),
        "departamentos_con_centro": departamentos,
        "departamentos_sin_centro_oncologico": sin_oncologico,
        "nota": ("La red oncológica pediátrica del MINSA se concentra en Lima, "
                 "La Libertad, Arequipa y Cusco. Los demás departamentos "
                 "dependen de establecimientos de continuidad, y es ahí donde "
                 "la teleconsulta con el INSNSB deja de ser un lujo."),
    }
