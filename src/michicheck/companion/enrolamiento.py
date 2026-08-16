"""Entrega del michi en el primer control: qué se registra y por qué.

El momento
----------
El médico termina la primera consulta, saca una caja y le dice al niño que se
lleva un gato. Ese acto —que dura dos minutos y no parece un procedimiento
clínico— es el que define si el sistema va a funcionar durante los dos años
siguientes.

Porque en esos dos minutos se captura lo único que el hospital hoy no tiene de
forma fiable: **cómo y cuándo se puede contactar a quien cuida al niño.**

Por qué el teléfono del apoderado no basta
------------------------------------------
El hospital ya tiene teléfonos. El problema es que llama en horario de oficina,
desde un número desconocido, y la mayoría de la gente no contesta números
desconocidos. Una llamada perdida se registra como «no contactado» y el sistema
concluye que la familia se desentendió.

Por eso el enrolamiento registra tres cosas que nadie registra hoy:

1. **La jornada laboral del apoderado.** No para respetarla por cortesía, sino
   porque una alerta que suena mientras el padre está trabajando no la escucha
   nadie. El michi maúlla cuando hay alguien en casa.
2. **El canal que la familia sí atiende.** En muchos hogares es WhatsApp, no la
   llamada. En otros no hay datos y sí hay SMS.
3. **Si pueden viajar a Lima, y si no, por qué.** Preguntarlo al inicio evita
   descubrirlo el día de la urgencia.

Nada de esto reemplaza los recordatorios convencionales: llamada, SMS y correo
siguen saliendo igual. El michi es la capa que suena en casa cuando las otras
tres ya fallaron.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time
from enum import Enum
from typing import Any

from . import tratamiento
from .referencias import Domicilio
from .tratamiento import Etapa, PlanDeEtapa


class Parentesco(str, Enum):
    MADRE = "madre"
    PADRE = "padre"
    ABUELA = "abuela"
    ABUELO = "abuelo"
    TUTOR = "tutor"
    OTRO = "otro"


class CanalPreferido(str, Enum):
    APP = "app"
    WHATSAPP = "whatsapp"
    SMS = "sms"
    LLAMADA = "llamada"
    CORREO = "correo"


@dataclass
class JornadaLaboral:
    """Cuándo el apoderado no está en casa.

    ``sin_horario_fijo`` cubre el caso más común en el Perú informal: comercio
    ambulante, agricultura, trabajo por jornal. Ahí no hay hora de salida, y el
    planificador usa la ventana de la noche.
    """

    inicio: time = time(8, 0)
    fin: time = time(18, 0)
    dias: tuple[int, ...] = (0, 1, 2, 3, 4, 5)
    sin_horario_fijo: bool = False

    def trabaja(self, momento: datetime) -> bool:
        if self.sin_horario_fijo:
            return False
        if momento.weekday() not in self.dias:
            return False
        return self.inicio <= momento.time() <= self.fin


@dataclass
class Apoderado:
    nombre: str
    parentesco: Parentesco
    celular: str
    jornada: JornadaLaboral = field(default_factory=JornadaLaboral)
    canal_preferido: CanalPreferido = CanalPreferido.APP
    correo: str | None = None
    dni: str | None = None
    acepta_alertas_nocturnas: bool = True
    segundo_contacto: str | None = None

    @property
    def celular_enmascarado(self) -> str:
        return f"{'*' * max(0, len(self.celular) - 3)}{self.celular[-3:]}"


@dataclass
class Paciente:
    nombre: str
    fecha_nacimiento: date
    historia_clinica: str
    diagnostico: str = "Leucemia linfoblástica aguda"
    fototipo: str = "IV"
    nombre_del_michi: str = "Michi"

    @property
    def edad_anos(self) -> float:
        hoy = date.today()
        return (hoy - self.fecha_nacimiento).days / 365.25


@dataclass
class Michi:
    """El juguete concreto que se llevó esta familia."""

    serie: str
    codigo_vinculacion: str
    entregado: date
    firmware: str = "0.3.0"

    @staticmethod
    def nuevo(historia_clinica: str, momento: date | None = None) -> "Michi":
        semilla = f"{historia_clinica}{uuid.uuid4().hex}".encode()
        digest = hashlib.sha256(semilla).hexdigest()
        return Michi(
            serie=f"MC-{digest[:8].upper()}",
            codigo_vinculacion="-".join(
                digest[8 + 4 * i: 12 + 4 * i].upper() for i in range(3)),
            entregado=momento or date.today(),
        )


@dataclass
class Ficha:
    """Todo lo que sale del primer control, en un solo objeto."""

    id: str
    paciente: Paciente
    apoderado: Apoderado
    domicilio: Domicilio
    michi: Michi
    etapa: Etapa
    inicio_de_etapa: date
    medico_asignado: str
    cmp_medico: str
    plan: PlanDeEtapa
    controles_confirmados: tuple[date, ...] = ()
    creada: datetime = field(default_factory=datetime.now)

    @property
    def controles(self) -> tuple[date, ...]:
        return self.controles_confirmados or tuple(self.plan.controles)

    def a_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "creada": self.creada.isoformat(timespec="minutes"),
            "paciente": {
                "nombre": self.paciente.nombre,
                "edad_anos": round(self.paciente.edad_anos, 1),
                "historia_clinica": self.paciente.historia_clinica,
                "diagnostico": self.paciente.diagnostico,
                "michi_se_llama": self.paciente.nombre_del_michi,
            },
            "apoderado": {
                "nombre": self.apoderado.nombre,
                "parentesco": self.apoderado.parentesco.value,
                "celular": self.apoderado.celular_enmascarado,
                "canal_preferido": self.apoderado.canal_preferido.value,
                "jornada": {
                    "sin_horario_fijo": self.apoderado.jornada.sin_horario_fijo,
                    "inicio": self.apoderado.jornada.inicio.strftime("%H:%M"),
                    "fin": self.apoderado.jornada.fin.strftime("%H:%M"),
                },
                "segundo_contacto": self.apoderado.segundo_contacto,
            },
            "domicilio": {
                "departamento": self.domicilio.departamento,
                "provincia": self.domicilio.provincia,
                "distrito": self.domicilio.distrito,
                "horas_al_insnsb": self.domicilio.horas_al_insnsb,
                "puede_viajar_a_lima": self.domicilio.puede_viajar_a_lima,
                "motivo_impedimento": self.domicilio.motivo_impedimento,
            },
            "michi": {
                "serie": self.michi.serie,
                "codigo_vinculacion": self.michi.codigo_vinculacion,
                "entregado": self.michi.entregado.isoformat(),
                "firmware": self.michi.firmware,
            },
            "medico_asignado": self.medico_asignado,
            "cmp": self.cmp_medico,
            "plan": self.plan.a_dict(),
            "controles": [d.isoformat() for d in self.controles],
        }

    def consentimiento(self) -> list[str]:
        """Lo que hay que decirle a la familia antes de entregar el juguete.

        Se lee en voz alta. No es letra chica: si la familia no entiende que el
        juguete transmite información al hospital, el sistema no tiene permiso
        para funcionar.
        """
        return [
            f"{self.paciente.nombre_del_michi} le va a recordar a "
            f"{self.paciente.nombre} los controles y le va a pedir que ponga "
            "el dedito en su nariz. Eso es un tamizaje, no un análisis de "
            "sangre: orienta, no reemplaza el hemograma.",
            f"Lo que {self.paciente.nombre_del_michi} mide llega al INSN San "
            f"Borja, al equipo del doctor {self.medico_asignado}.",
            "Si el michi deja de comunicarse por más de tres días, el hospital "
            "lo va a llamar. No es vigilancia: es la forma de darnos cuenta a "
            "tiempo de que algo pasó.",
            f"Las alertas van a sonar después de las "
            f"{self.apoderado.jornada.fin.strftime('%H:%M')}, cuando usted ya "
            "esté en casa.",
            "Usted puede devolver el michi cuando quiera y seguir con sus "
            "controles igual. No condiciona ninguna atención.",
        ]


def enrolar(paciente: Paciente, apoderado: Apoderado, domicilio: Domicilio,
            etapa: Etapa, medico_asignado: str, cmp_medico: str,
            inicio_de_etapa: date | None = None,
            controles_confirmados: tuple[date, ...] = (),
            horizonte_dias: int = 90) -> Ficha:
    """Crea la ficha y empareja un michi nuevo. Es todo el primer control."""
    inicio = inicio_de_etapa or date.today()
    plan = tratamiento.planificar(etapa, inicio, horizonte_dias=horizonte_dias)
    return Ficha(
        id=f"MCK-{paciente.historia_clinica}-{uuid.uuid4().hex[:6].upper()}",
        paciente=paciente,
        apoderado=apoderado,
        domicilio=domicilio,
        michi=Michi.nuevo(paciente.historia_clinica),
        etapa=etapa,
        inicio_de_etapa=inicio,
        medico_asignado=medico_asignado,
        cmp_medico=cmp_medico,
        plan=plan,
        controles_confirmados=controles_confirmados,
    )


def cambiar_de_etapa(ficha: Ficha, nueva: Etapa,
                     desde: date | None = None,
                     horizonte_dias: int = 90) -> Ficha:
    """El médico corrige la etapa en un control y el calendario se rehace.

    Se hace explícito porque el paso a mantenimiento es el evento que más
    cambia el comportamiento del sistema: bajan los controles presenciales y
    sube la insistencia del juguete.
    """
    inicio = desde or date.today()
    ficha.etapa = nueva
    ficha.inicio_de_etapa = inicio
    ficha.plan = tratamiento.planificar(nueva, inicio, horizonte_dias=horizonte_dias)
    ficha.controles_confirmados = ()
    return ficha
