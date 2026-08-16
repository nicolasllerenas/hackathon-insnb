"""Planificador de alertas: cuándo maúlla el michi y por qué a esa hora.

El problema con los recordatorios de hoy
----------------------------------------
El hospital llama. El número es desconocido, es media mañana y el apoderado
está trabajando. Nadie contesta. El sistema registra «no contactado» y concluye
que la familia se desentendió.

Ese no es un problema de voluntad de la familia: es un problema de diseño del
recordatorio. Se emite cuando es cómodo para el hospital, no cuando hay alguien
escuchando.

Dos canales que el hospital no tenía
------------------------------------
* **APP** — una notificación con un sonido reconocible, corto y propio: un
  maullido. Funciona como el sonido de Yape: no hace falta mirar la pantalla
  para saber qué pasó. Ahí van los recordatorios de citas y controles.
* **JUGUETE** — el michi maúlla en la sala. Es el canal que no se puede
  ignorar sin decidir ignorarlo, y esa es exactamente su función.

Ambos son **complemento**, no reemplazo. La llamada, el SMS y el correo del
hospital siguen saliendo igual. El michi es la capa que suena en casa cuando
las otras tres ya fallaron.

La ventana post-laboral
-----------------------
Las alertas se programan **después de la jornada del apoderado**, porque el
maullido tiene que sonar cuando hay un adulto en casa que lo oiga. Si el
apoderado no tiene horario fijo —comercio, agricultura, jornal— la ventana se
corre a la noche.

Por qué el michi insiste
------------------------
Un recordatorio que se apaga solo no cambia nada. El michi sube de intensidad
mientras no lo atiendan, y el único modo de callarlo es **hacer el tamizaje**.
Si tras tres intentos sigue sin atenderse, deja de insistirle a la familia y
pasa el aviso al INSN. La insistencia tiene un límite y ese límite es una
señal, no un fracaso.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from enum import Enum
from typing import Any

from .enrolamiento import Ficha
from .tratamiento import PERFILES


class Canal(str, Enum):
    APP = "app"
    JUGUETE = "juguete"
    SMS = "sms"
    LLAMADA = "llamada"
    CORREO = "correo"


class Tipo(str, Enum):
    RECORDATORIO_CITA = "recordatorio_cita"
    TAMIZAJE = "tamizaje"
    MEDICACION = "medicacion"
    RESULTADO = "resultado"
    TELECONSULTA = "teleconsulta"
    COMPANIA = "compania"


class Sonido(str, Enum):
    MIAU_CORTO = "miau_corto"
    MIAU_INSISTENTE = "miau_insistente"
    MAULLIDO_LARGO = "maullido_largo"
    RONRONEO = "ronroneo"
    CAMPANITA_MIAU = "campanita_miau"


class Estado(str, Enum):
    PROGRAMADA = "programada"
    EMITIDA = "emitida"
    ATENDIDA = "atendida"
    POSTERGADA = "postergada"
    ESCALADA = "escalada"


CANALES_CONVENCIONALES = (Canal.SMS, Canal.LLAMADA, Canal.CORREO)

HORA_MAS_TARDIA = time(21, 0)
HORA_SIN_HORARIO_FIJO = time(19, 0)
MARGEN_TRAS_JORNADA_MIN = 30
MAX_POSTERGACIONES = 3
MINUTOS_ENTRE_INSISTENCIAS = 25

DIAS_DE_AVISO_DE_CITA = (3, 1, 0)


@dataclass
class Alerta:
    id: str
    ficha_id: str
    tipo: Tipo
    canal: Canal
    sonido: Sonido
    programada: datetime
    titulo: str
    cuerpo: str
    exige_tamizaje: bool = False
    estado: Estado = Estado.PROGRAMADA
    intento: int = 1
    emitida: datetime | None = None
    atendida: datetime | None = None

    @property
    def vencida(self) -> bool:
        return self.estado is Estado.PROGRAMADA and datetime.now() > self.programada

    def a_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "ficha_id": self.ficha_id,
            "tipo": self.tipo.value,
            "canal": self.canal.value,
            "sonido": self.sonido.value,
            "programada": self.programada.isoformat(timespec="minutes"),
            "titulo": self.titulo,
            "cuerpo": self.cuerpo,
            "exige_tamizaje": self.exige_tamizaje,
            "estado": self.estado.value,
            "intento": self.intento,
        }


def ventana_audible(ficha: Ficha, dia: date) -> tuple[datetime, datetime]:
    """Franja del día en que un maullido tiene a quién despertar.

    No es una preferencia de comodidad: fuera de esta franja el recordatorio se
    emite igual por los canales convencionales, pero el michi calla. Un juguete
    que maúlla en una casa vacía gasta batería y credibilidad.
    """
    jornada = ficha.apoderado.jornada
    if jornada.sin_horario_fijo or dia.weekday() not in jornada.dias:
        inicio = datetime.combine(dia, HORA_SIN_HORARIO_FIJO)
    else:
        inicio = datetime.combine(dia, jornada.fin) + timedelta(
            minutes=MARGEN_TRAS_JORNADA_MIN)
    fin = datetime.combine(dia, HORA_MAS_TARDIA)
    if inicio >= fin:
        inicio = fin - timedelta(hours=1)
    return inicio, fin


def _dentro_de_ventana(ficha: Ficha, momento: datetime) -> datetime:
    inicio, fin = ventana_audible(ficha, momento.date())
    if momento < inicio:
        return inicio
    if momento > fin:
        siguiente = momento.date() + timedelta(days=1)
        return ventana_audible(ficha, siguiente)[0]
    return momento


def _nueva(ficha: Ficha, tipo: Tipo, canal: Canal, sonido: Sonido,
           cuando: datetime, titulo: str, cuerpo: str,
           exige_tamizaje: bool = False, intento: int = 1) -> Alerta:
    return Alerta(
        id=f"ALT-{uuid.uuid4().hex[:10].upper()}",
        ficha_id=ficha.id, tipo=tipo, canal=canal, sonido=sonido,
        programada=cuando, titulo=titulo, cuerpo=cuerpo,
        exige_tamizaje=exige_tamizaje, intento=intento,
    )


def planificar(ficha: Ficha, desde: date | None = None,
               dias: int = 14) -> list[Alerta]:
    """Genera el calendario de alertas de las próximas dos semanas.

    Se regenera en cada control. Nadie programa dos años de maullidos de golpe:
    la etapa cambia, el calendario cambia y la insistencia cambia con ella.
    """
    inicio = desde or date.today()
    limite = inicio + timedelta(days=dias)
    perfil = PERFILES[ficha.etapa]
    nombre = ficha.paciente.nombre_del_michi
    alertas: list[Alerta] = []

    for cita in ficha.controles:
        if not (inicio <= cita <= limite):
            continue
        for antelacion in DIAS_DE_AVISO_DE_CITA:
            dia = cita - timedelta(days=antelacion)
            if dia < inicio:
                continue
            cuando = _dentro_de_ventana(ficha, datetime.combine(dia, time(19, 0)))
            texto = {
                3: f"Falta poco: el control es el {cita.strftime('%d/%m')}.",
                1: f"Mañana es el control de {ficha.paciente.nombre}.",
                0: f"Hoy es el control de {ficha.paciente.nombre}.",
            }[antelacion]
            alertas.append(_nueva(
                ficha, Tipo.RECORDATORIO_CITA, Canal.APP, Sonido.CAMPANITA_MIAU,
                cuando, f"{nombre} te recuerda el control", texto))
            if antelacion <= 1:
                alertas.append(_nueva(
                    ficha, Tipo.RECORDATORIO_CITA, Canal.JUGUETE, Sonido.MIAU_CORTO,
                    cuando + timedelta(minutes=2),
                    f"{nombre} maúlla", texto))

    for tamizaje in ficha.plan.tamizajes:
        if not (inicio <= tamizaje <= limite):
            continue
        cuando = _dentro_de_ventana(ficha, datetime.combine(tamizaje, time(19, 30)))
        alertas.append(_nueva(
            ficha, Tipo.TAMIZAJE, Canal.JUGUETE, Sonido.MAULLIDO_LARGO, cuando,
            f"{nombre} pide su dedito",
            f"{nombre} quiere que {ficha.paciente.nombre} ponga el dedito en su "
            "nariz. Es un minuto y cuida sus defensas.",
            exige_tamizaje=True))

    if perfil.quimioterapia_oral_en_casa:
        dia = inicio
        while dia <= limite:
            cuando = datetime.combine(dia, time(21, 0))
            alertas.append(_nueva(
                ficha, Tipo.MEDICACION, Canal.APP, Sonido.MIAU_CORTO, cuando,
                "Hora de la 6-MP",
                "De noche, sin leche ni yogur una hora antes y una después, "
                "y siempre de la misma forma."))
            dia = dia + timedelta(days=1)

    return sorted(alertas, key=lambda a: a.programada)


def escalar(alerta: Alerta, ficha: Ficha,
            momento: datetime | None = None) -> Alerta | None:
    """Qué hace el michi cuando la alerta no se atendió.

    Sube de intensidad hasta el tercer intento. Después deja de insistirle a la
    familia: el aviso pasa al INSN, porque a partir de ahí el problema ya no es
    que no escucharon.
    """
    ahora = momento or datetime.now()
    alerta.estado = Estado.POSTERGADA

    if alerta.intento >= MAX_POSTERGACIONES:
        alerta.estado = Estado.ESCALADA
        return None

    sonidos = {1: Sonido.MIAU_INSISTENTE, 2: Sonido.MAULLIDO_LARGO}
    return _nueva(
        ficha, alerta.tipo, Canal.JUGUETE,
        sonidos.get(alerta.intento, Sonido.MAULLIDO_LARGO),
        ahora + timedelta(minutes=MINUTOS_ENTRE_INSISTENCIAS),
        alerta.titulo, alerta.cuerpo,
        exige_tamizaje=alerta.exige_tamizaje, intento=alerta.intento + 1)


def respaldo_convencional(ficha: Ficha, alerta: Alerta) -> list[dict[str, Any]]:
    """Los recordatorios de siempre, que salen igual y en paralelo.

    Existe para dejarlo explícito en el código y en la demostración: MichiCheck
    **no sustituye** la llamada, el SMS ni el correo del hospital. Si alguien
    apaga el michi, la familia no queda incomunicada.
    """
    return [
        {"canal": canal.value,
         "destino": ficha.apoderado.celular_enmascarado
                    if canal is not Canal.CORREO else (ficha.apoderado.correo or "—"),
         "mensaje": f"{alerta.titulo}: {alerta.cuerpo}",
         "emitido_por": "INSN San Borja",
         "nota": "Canal convencional. Se emite aunque el michi esté apagado."}
        for canal in CANALES_CONVENCIONALES
    ]


def resumen(alertas: list[Alerta]) -> dict[str, Any]:
    """Indicadores de adherencia a las alertas, para el panel del INSNSB."""
    if not alertas:
        return {"total": 0}
    atendidas = [a for a in alertas if a.estado is Estado.ATENDIDA]
    escaladas = [a for a in alertas if a.estado is Estado.ESCALADA]
    return {
        "total": len(alertas),
        "atendidas": len(atendidas),
        "escaladas_al_insnsb": len(escaladas),
        "tasa_de_atencion": round(len(atendidas) / len(alertas), 3),
        "por_canal": {c.value: sum(1 for a in alertas if a.canal is c) for c in Canal},
        "por_tipo": {t.value: sum(1 for a in alertas if a.tipo is t) for t in Tipo},
        "tamizajes_exigidos": sum(1 for a in alertas if a.exige_tamizaje),
    }
