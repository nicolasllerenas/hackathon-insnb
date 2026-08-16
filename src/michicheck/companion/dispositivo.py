"""Estado del juguete, y por qué su silencio es información clínica.

La señal que hoy no existe
--------------------------
El sistema de rescate del abandono se entera de que algo va mal cuando el niño
**falta a una cita**. En mantenimiento las citas son mensuales, así que entre
que la familia se descuelga y que el hospital se entera pueden pasar cuatro
semanas.

Un michi encendido en la sala emite un latido varias veces al día. Cuando ese
latido se corta, algo cambió en esa casa: se mudaron, se quedaron sin luz, el
niño se descompensó, o la familia decidió dejarlo. Cualquiera de esas cosas es
información, y llega **días antes** que la cita perdida.

Por eso el estado del dispositivo entra a la misma cola de atención que el
estado clínico. No es telemetría de mantenimiento: es el indicador más temprano
de abandono que el sistema produce.

Qué no es
---------
No es vigilancia. El michi transmite su propio estado y los tamizajes que el
niño decide hacer. No graba audio, no rastrea ubicación y la familia puede
devolverlo sin que eso condicione ninguna atención. Eso está escrito en el
consentimiento que se lee en el primer control, y está aquí para que el código
diga lo mismo que el papel.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any

HORAS_ENTRE_LATIDOS_ESPERADAS = 6.0
HORAS_PARA_INTERMITENTE = 24.0
HORAS_PARA_SIN_CONTACTO = 72.0
BATERIA_BAJA_PCT = 25.0
BATERIA_CRITICA_PCT = 10.0


class Enlace(str, Enum):
    EN_LINEA = "en_linea"
    INTERMITENTE = "intermitente"
    SIN_CONTACTO = "sin_contacto"


@dataclass
class Latido:
    """Lo que el michi manda cuando puede. Nada de esto identifica al niño."""

    momento: datetime
    bateria_pct: float
    rssi_dbm: int | None = None
    firmware: str = "0.3.0"
    tamizajes_en_cola: int = 0
    alertas_emitidas: int = 0
    alertas_atendidas: int = 0
    silenciamientos: int = 0


@dataclass
class Dispositivo:
    serie: str
    ficha_id: str
    latidos: list[Latido] = field(default_factory=list)

    @property
    def ultimo(self) -> Latido | None:
        return self.latidos[-1] if self.latidos else None

    def registrar(self, latido: Latido) -> "Dispositivo":
        self.latidos.append(latido)
        return self

    def horas_de_silencio(self, ahora: datetime | None = None) -> float:
        if not self.ultimo:
            return float("inf")
        momento = ahora or datetime.now()
        return (momento - self.ultimo.momento).total_seconds() / 3600

    def enlace(self, ahora: datetime | None = None) -> Enlace:
        horas = self.horas_de_silencio(ahora)
        if horas >= HORAS_PARA_SIN_CONTACTO:
            return Enlace.SIN_CONTACTO
        if horas >= HORAS_PARA_INTERMITENTE:
            return Enlace.INTERMITENTE
        return Enlace.EN_LINEA


@dataclass
class SaludDelEnlace:
    enlace: Enlace
    horas_de_silencio: float
    bateria_pct: float | None
    titulo: str
    conducta: str
    urgente: bool
    motivos: tuple[str, ...]
    tasa_de_atencion: float | None = None

    def a_dict(self) -> dict[str, Any]:
        return {
            "enlace": self.enlace.value,
            "horas_de_silencio": (round(self.horas_de_silencio, 1)
                                  if self.horas_de_silencio != float("inf") else None),
            "bateria_pct": self.bateria_pct,
            "titulo": self.titulo,
            "conducta": self.conducta,
            "urgente": self.urgente,
            "motivos": list(self.motivos),
            "tasa_de_atencion_de_alertas": self.tasa_de_atencion,
        }


def evaluar(dispositivo: Dispositivo, ahora: datetime | None = None) -> SaludDelEnlace:
    """Traduce la telemetría a una conducta concreta para el equipo del INSNSB."""
    enlace = dispositivo.enlace(ahora)
    horas = dispositivo.horas_de_silencio(ahora)
    ultimo = dispositivo.ultimo
    bateria = ultimo.bateria_pct if ultimo else None
    motivos: list[str] = []

    tasa = None
    if ultimo and ultimo.alertas_emitidas:
        tasa = round(ultimo.alertas_atendidas / ultimo.alertas_emitidas, 3)

    if enlace is Enlace.SIN_CONTACTO:
        motivos.append(
            f"Sin latido desde hace {horas:.0f} h. El umbral de alarma son "
            f"{HORAS_PARA_SIN_CONTACTO:.0f} h.")
        titulo = "El michi dejó de comunicarse"
        conducta = ("Contacto telefónico con el apoderado hoy. Si no responde, "
                    "activar el circuito de seguimiento del Comité de Abandono. "
                    "Esta señal llega antes que la cita perdida.")
        urgente = True
    elif enlace is Enlace.INTERMITENTE:
        motivos.append(f"Último latido hace {horas:.0f} h; lo esperado son "
                       f"{HORAS_ENTRE_LATIDOS_ESPERADAS:.0f} h.")
        titulo = "Comunicación intermitente"
        conducta = ("Enviar recordatorio por el canal declarado por la familia. "
                    "Verificar carga del dispositivo y cobertura.")
        urgente = False
    else:
        titulo = "Michi en línea"
        conducta = "Sin acción. Los recordatorios de audio bastan."
        urgente = False

    if bateria is not None:
        if bateria <= BATERIA_CRITICA_PCT:
            motivos.append(f"Batería crítica ({bateria:.0f}%). El michi va a "
                           "apagarse en horas.")
            urgente = True
        elif bateria <= BATERIA_BAJA_PCT:
            motivos.append(f"Batería baja ({bateria:.0f}%). Recordar la carga "
                           "inalámbrica en la alerta de la noche.")

    if ultimo and ultimo.silenciamientos >= 3:
        motivos.append(
            f"{ultimo.silenciamientos} silenciamientos seguidos sin tamizaje. "
            "La familia está apagando el michi en lugar de atenderlo.")
        urgente = True
        conducta = ("Llamada del equipo tratante. El patrón de silenciamiento "
                    "repetido precede al abandono con más antelación que la "
                    "inasistencia.")

    if ultimo and ultimo.tamizajes_en_cola:
        motivos.append(f"{ultimo.tamizajes_en_cola} tamizajes hechos pero sin "
                       "sincronizar: hay datos que aún no llegaron.")

    if tasa is not None and tasa < 0.6:
        motivos.append(f"Solo el {tasa:.0%} de las alertas se atendió. "
                       "Revisar si la ventana horaria declarada sigue siendo la buena.")

    return SaludDelEnlace(
        enlace=enlace, horas_de_silencio=horas, bateria_pct=bateria,
        titulo=titulo, conducta=conducta, urgente=urgente,
        motivos=tuple(motivos), tasa_de_atencion=tasa)


def cohorte(dispositivos: list[Dispositivo],
            ahora: datetime | None = None) -> dict[str, Any]:
    """Vista agregada del parque de michis, para el tablero del instituto."""
    if not dispositivos:
        return {"total": 0}
    salud = [evaluar(d, ahora) for d in dispositivos]
    return {
        "total": len(dispositivos),
        "en_linea": sum(1 for s in salud if s.enlace is Enlace.EN_LINEA),
        "intermitentes": sum(1 for s in salud if s.enlace is Enlace.INTERMITENTE),
        "sin_contacto": sum(1 for s in salud if s.enlace is Enlace.SIN_CONTACTO),
        "urgentes": sum(1 for s in salud if s.urgente),
        "bateria_baja": sum(1 for s in salud
                            if s.bateria_pct is not None
                            and s.bateria_pct <= BATERIA_BAJA_PCT),
        "nota": ("«Sin contacto» no es una falla técnica que reportar al "
                 "fabricante: es un paciente que hay que llamar hoy."),
    }
