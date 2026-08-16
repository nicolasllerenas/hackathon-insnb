"""Carga de viajes y riesgo de abandono: lo que de verdad ataca el problema.

Lo primero, que es lo que casi nos hace equivocar el proyecto
-------------------------------------------------------------
**El INSN San Borja ya tiene un Comité de Abandono de Tratamiento y ya usa la
aplicacion IMPACTO**, con alertas por colores y escalamiento:

    verde    -> SMS a la familia; enfermeria contacta en 48 h
    amarilla -> psicologia asume el seguimiento; escala a los 7 dias
    roja     -> asistencia social; comite local a las 2 semanas

Y funciona: el abandono nacional bajo del **18.6% (2018) al 8.5% (2021)**.

Proponer "un sistema de seguimiento de citas con semaforo" seria reinventar
IMPACTO delante del comite que lo usa a diario. Este modulo **no hace eso**.

Que hueco queda entonces
------------------------
IMPACTO actua **despues** de que el nino falto a la cita. Es un mecanismo de
rescate, y como tal ya capturo la parte facil del problema: al que falta por
olvido, por confusion de fecha o por desanimo, una llamada lo recupera.

El 8.5% que queda es el dificil, y no falta por olvido. La escala RADAR
(Colombia, 5442 pacientes) identifica los predictores del abandono y **los tres
son estructurales**: aseguramiento publico, residencia rural y vivir fuera de
la capital. Ninguna llamada telefonica cambia ninguno de los tres.

Lo que este modulo aporta es lo que IMPACTO no puede ver:

1. **Cuantos viajes exige el tratamiento** y cuantos son evitables. El abandono
   no es una decision, es una acumulacion: cada viaje tiene un costo y llega un
   punto en que la familia no puede mas.
2. **Un aviso anticipado** basado en carga acumulada, no en una falta ya
   ocurrida, que se entrega al comite **en el vocabulario de IMPACTO** para que
   entre en su flujo en vez de competir con el.

La regla de diseno: este modulo **alimenta** al Comite de Abandono. No lo
sustituye, no duplica su semaforo y no le pide que cambie su proceso.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from enum import Enum


SEMANAS_PARA_ABANDONO = 4

ABANDONO_NACIONAL_2018 = 0.186
ABANDONO_NACIONAL_2021 = 0.085


class FaseTratamiento(str, Enum):
    """Fases del tratamiento de LLA, con cargas de viaje muy distintas."""

    INDUCCION = "induccion"
    CONSOLIDACION = "consolidacion"
    MANTENIMIENTO = "mantenimiento"
    SEGUIMIENTO = "seguimiento"


VISITAS_POR_MES: dict[FaseTratamiento, tuple[float, float]] = {
    FaseTratamiento.INDUCCION: (4.0, 0.0),
    FaseTratamiento.CONSOLIDACION: (2.0, 1.0),
    FaseTratamiento.MANTENIMIENTO: (1.0, 1.5),
    FaseTratamiento.SEGUIMIENTO: (0.33, 0.33),
}

FRACCION_ANALITICA_EVITABLE = 0.6


@dataclass
class ContextoFamiliar:
    """Lo que determina el costo real de sostener el tratamiento.

    Los factores estructurales replican los de la escala RADAR, validada sobre
    5442 pacientes, adaptados a la realidad peruana.
    """

    horas_viaje_ida: float
    costo_viaje_soles: float = 0.0
    aseguramiento_publico: bool = True
    zona_rural: bool = False
    fuera_de_lima: bool = True
    ingreso_mensual_soles: float | None = None
    cuidador_unico: bool = False
    hermanos_menores: int = 0
    lengua_originaria: bool = False
    tiene_alojamiento_en_lima: bool = False

    @property
    def costo_por_viaje(self) -> float:
        """Costo del viaje incluyendo alojamiento si no lo tiene resuelto."""
        alojamiento = 0.0 if self.tiene_alojamiento_en_lima else (
            80.0 if self.horas_viaje_ida > 6 else 0.0)
        return self.costo_viaje_soles + alojamiento


@dataclass
class CargaDeViajes:
    """Cuantos viajes exige el tratamiento y cuantos son evitables."""

    fase: FaseTratamiento
    meses_restantes: float
    viajes_con_procedimiento: float
    viajes_solo_analitica: float
    viajes_evitables: float
    horas_totales: float
    costo_total_soles: float
    costo_evitable_soles: float

    @property
    def viajes_totales(self) -> float:
        return self.viajes_con_procedimiento + self.viajes_solo_analitica

    @property
    def reduccion_relativa(self) -> float:
        if self.viajes_totales <= 0:
            return 0.0
        return self.viajes_evitables / self.viajes_totales

    @property
    def fraccion_ingreso(self) -> float | None:
        """Qué proporción del ingreso familiar se va en viajes. ``None`` si no
        se conoce el ingreso."""
        return None


def calcular_carga(contexto: ContextoFamiliar, fase: FaseTratamiento,
                   meses_restantes: float) -> CargaDeViajes:
    """Traduce el plan de tratamiento a viajes, horas y soles.

    Este es el numero que hay que poner sobre la mesa. "Reducimos el abandono"
    no se puede defender; "esta familia hara 43 viajes de 9 horas y podemos
    evitar 16" si, y es verificable.
    """
    con_proc, solo_lab = VISITAS_POR_MES[fase]
    viajes_proc = con_proc * meses_restantes
    viajes_lab = solo_lab * meses_restantes
    evitables = viajes_lab * FRACCION_ANALITICA_EVITABLE

    horas = (viajes_proc + viajes_lab) * contexto.horas_viaje_ida * 2
    costo = (viajes_proc + viajes_lab) * contexto.costo_por_viaje
    costo_evitable = evitables * contexto.costo_por_viaje

    return CargaDeViajes(
        fase=fase,
        meses_restantes=meses_restantes,
        viajes_con_procedimiento=viajes_proc,
        viajes_solo_analitica=viajes_lab,
        viajes_evitables=evitables,
        horas_totales=horas,
        costo_total_soles=costo,
        costo_evitable_soles=costo_evitable,
    )


@dataclass
class RiesgoAbandono:
    puntaje: float
    nivel: str
    factores: list[str] = field(default_factory=list)
    dias_desde_ultimo_contacto: int | None = None
    controles_perdidos: int = 0

    @property
    def cumple_definicion_abandono(self) -> bool:
        """Cuatro semanas o mas sin tratamiento: definicion SIOP-PODC."""
        if self.dias_desde_ultimo_contacto is None:
            return False
        return self.dias_desde_ultimo_contacto >= SEMANAS_PARA_ABANDONO * 7


def evaluar_riesgo(contexto: ContextoFamiliar, carga: CargaDeViajes,
                   controles_perdidos: int = 0,
                   dias_desde_ultimo_contacto: int | None = None
                   ) -> RiesgoAbandono:
    """Riesgo estructural de abandono, anticipado.

    Los pesos siguen el orden de la escala RADAR (aseguramiento publico es el
    factor de mayor peso, luego ruralidad, luego no vivir en la capital), con
    dos anadidos propios que RADAR no contempla y que en el contexto peruano
    pesan: la **carga acumulada de viajes** y la ausencia de un segundo
    cuidador.

    Es una escala **no validada**. Sirve para priorizar a quien mirar primero,
    no para decidir nada por si sola, y asi debe presentarse al comite.
    """
    puntaje = 0.0
    factores: list[str] = []

    if contexto.aseguramiento_publico:
        puntaje += 25
        factores.append("Aseguramiento público (SIS): factor de mayor peso en RADAR")
    if contexto.zona_rural:
        puntaje += 15
        factores.append("Residencia rural")
    if contexto.fuera_de_lima:
        puntaje += 10
        factores.append("Reside fuera de Lima/Callao")

    if contexto.horas_viaje_ida >= 8:
        puntaje += 15
        factores.append(f"{contexto.horas_viaje_ida:.0f} h de viaje por trayecto")
    elif contexto.horas_viaje_ida >= 4:
        puntaje += 8
        factores.append(f"{contexto.horas_viaje_ida:.0f} h de viaje por trayecto")

    if contexto.ingreso_mensual_soles:
        mensual = carga.costo_total_soles / max(carga.meses_restantes, 1)
        proporcion = mensual / contexto.ingreso_mensual_soles
        if proporcion > 0.25:
            puntaje += 20
            factores.append(
                f"Los viajes consumen el {proporcion*100:.0f}% del ingreso familiar")
        elif proporcion > 0.10:
            puntaje += 10
            factores.append(
                f"Los viajes consumen el {proporcion*100:.0f}% del ingreso familiar")

    if contexto.cuidador_unico:
        puntaje += 10
        factores.append("Cuidador único: cada viaje deja a los hermanos sin atención")
    if contexto.hermanos_menores >= 2:
        puntaje += 5
        factores.append(f"{contexto.hermanos_menores} hermanos menores en casa")
    if contexto.lengua_originaria:
        puntaje += 5
        factores.append("Lengua originaria: barrera de comunicación en el seguimiento")
    if not contexto.tiene_alojamiento_en_lima and contexto.horas_viaje_ida > 6:
        puntaje += 10
        factores.append("Sin alojamiento resuelto en Lima")

    if controles_perdidos:
        puntaje += min(controles_perdidos * 12, 30)
        factores.append(f"{controles_perdidos} control(es) perdido(s)")

    puntaje = min(puntaje, 100.0)
    nivel = "alto" if puntaje >= 55 else ("intermedio" if puntaje >= 30 else "bajo")

    return RiesgoAbandono(
        puntaje=puntaje, nivel=nivel, factores=factores,
        dias_desde_ultimo_contacto=dias_desde_ultimo_contacto,
        controles_perdidos=controles_perdidos,
    )


def ficha_para_comite(paciente_id: str, riesgo: RiesgoAbandono,
                      carga: CargaDeViajes, contexto: ContextoFamiliar,
                      fecha: date | None = None) -> dict:
    """Ficha para el Comité de Abandono, en el vocabulario que ya usa.

    Deliberadamente **no** define un semáforo propio: mapea al esquema de
    IMPACTO (verde / amarilla / roja) para que el caso entre en el flujo
    existente en vez de crear un segundo tablero que nadie va a mirar.

    La diferencia con IMPACTO no está en el color sino en el **motivo**: ellos
    se disparan cuando el niño ya faltó; esta ficha se dispara antes, por carga
    estructural acumulada.
    """
    hoy = fecha or date.today()

    if riesgo.cumple_definicion_abandono or riesgo.controles_perdidos >= 2:
        alerta, motivo = "roja", "Cumple criterio de abandono o faltas repetidas"
    elif riesgo.nivel == "alto":
        alerta, motivo = "amarilla", "Riesgo estructural alto (anticipado, sin falta previa)"
    else:
        alerta, motivo = "verde", "Seguimiento habitual"

    return {
        "paciente_id": paciente_id,
        "fecha": hoy.isoformat(),
        "alerta_impacto": alerta,
        "motivo": motivo,
        "origen": "MichiCheck — señal anticipada, complementaria a IMPACTO",
        "riesgo": {
            "puntaje": round(riesgo.puntaje, 1),
            "nivel": riesgo.nivel,
            "factores": riesgo.factores,
        },
        "carga_de_viajes": {
            "fase": carga.fase.value,
            "meses_restantes": round(carga.meses_restantes, 1),
            "viajes_previstos": round(carga.viajes_totales, 1),
            "viajes_evitables_con_tamizaje_local": round(carga.viajes_evitables, 1),
            "horas_de_viaje_previstas": round(carga.horas_totales, 0),
            "costo_previsto_soles": round(carga.costo_total_soles, 0),
            "ahorro_potencial_soles": round(carga.costo_evitable_soles, 0),
        },
        "acciones_sugeridas": _acciones(riesgo, carga, contexto),
        "nota": ("Escala no validada. Prioriza a quién revisar primero; no "
                 "sustituye la evaluación del comité ni las alertas de IMPACTO."),
    }


def _acciones(riesgo: RiesgoAbandono, carga: CargaDeViajes,
              contexto: ContextoFamiliar) -> list[str]:
    """Acciones concretas, ordenadas por impacto sobre el costo del tratamiento."""
    acciones: list[str] = []

    if carga.viajes_evitables >= 3:
        acciones.append(
            f"Habilitar tamizaje local: evita ~{carga.viajes_evitables:.0f} viajes "
            f"({carga.reduccion_relativa*100:.0f}% de los previstos) y "
            f"S/ {carga.costo_evitable_soles:.0f}.")

    if contexto.horas_viaje_ida >= 4:
        acciones.append(
            "Agrupar procedimientos en una sola visita: cuando el viaje es "
            "inevitable, que resuelva todo lo pendiente.")

    if not contexto.tiene_alojamiento_en_lima and contexto.horas_viaje_ida > 6:
        acciones.append(
            "Gestionar alojamiento con casa de acogida antes del próximo viaje.")

    acciones.append(
        "Verificar el subsidio de la Ley 31041 (2 RMV) y la licencia laboral: "
        "son derechos vigentes con baja tasa de ejercicio efectivo.")

    if contexto.lengua_originaria:
        acciones.append("Asignar comunicación en lengua originaria.")

    if riesgo.nivel == "alto":
        acciones.append(
            "Coordinar teleinterconsulta con el establecimiento de origen para "
            "sostener el seguimiento sin exigir traslado.")

    return acciones
