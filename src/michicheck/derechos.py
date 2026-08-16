"""Derechos vigentes de la familia, y por qué esto es una intervención real.

La tentación y el error
-----------------------
Ante "hay que apoyar a las familias para que no abandonen", lo natural es
proponer un subsidio, un fondo o un programa de ayuda. Es un error por dos
razones: un equipo de hackatón no puede crear un beneficio estatal, y **ya
existe uno**.

La **Ley 31041** (Ley de urgencia médica para la detección oportuna y atención
integral del cáncer del niño y del adolescente, 2020) y su reglamento
(DS 024-2021-SA) ya otorgan:

* **Cobertura universal y gratuita** del tratamiento oncológico para menores de
  18 años, incluso antes de confirmar el diagnóstico.
* **Subsidio económico de dos remuneraciones mínimas vitales** por familia
  durante el tratamiento hospitalario.
* **Licencia laboral de hasta un año** para el padre o madre trabajador: los
  primeros 21 días a cargo del empleador y el resto de EsSalud.
* Derecho a diagnóstico oportuno, cuidados paliativos y apoyo psicológico.

El problema no es que falte el derecho
--------------------------------------
Es que no llega. La **Defensoría del Pueblo** ha reclamado públicamente y de
forma reiterada que el MINSA no ha publicado el reglamento del subsidio
oncológico, y que varias disposiciones de la ley siguen sin implementarse.

O sea: hay familias que están decidiendo si pueden costear el próximo viaje a
Lima mientras tienen derecho a dos sueldos mínimos y a un año de licencia que
nadie les explicó.

**Ahí sí puede intervenir un software.** No creando un beneficio, sino haciendo
tres cosas concretas:

1. Decirle a cada familia, en lenguaje claro, **qué le corresponde**.
2. Generar el **expediente** con los documentos y las referencias legales, para
   que la gestión no dependa de saber redactar una solicitud.
3. **Registrar cuántas veces se solicita y cuántas se obtiene.** Ese dato hoy
   no existe, y es exactamente lo que la Defensoría necesita para exigir la
   implementación. Un tamizaje que además produce evidencia de una brecha de
   derechos vale más que uno que sólo mide neutrófilos.

Nota: los montos y requisitos cambian. Este módulo los centraliza en un solo
sitio, con su fuente, para que actualizarlos sea editar una constante y no
buscar por todo el código.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

RMV_SOLES = 1130.0

FUENTES = {
    "ley_31041": ("Ley N° 31041 — Ley de urgencia médica para la detección "
                  "oportuna y atención integral del cáncer del niño y del "
                  "adolescente (02/09/2020)"),
    "reglamento": "DS 024-2021-SA — Reglamento de la Ley 31041 (26/07/2021)",
    "ley_31336": "Ley N° 31336 — Ley Nacional del Cáncer",
    "telesalud": "Ley N° 30421 y DL 1490 — Marco de Telesalud",
    "defensoria": ("Defensoría del Pueblo — reclamos reiterados por la falta "
                   "de reglamentación del subsidio oncológico"),
}


class EstadoGestion(str, Enum):
    NO_INICIADA = "no_iniciada"
    EN_TRAMITE = "en_tramite"
    OTORGADO = "otorgado"
    DENEGADO = "denegado"
    SIN_RESPUESTA = "sin_respuesta"


@dataclass
class Derecho:
    codigo: str
    nombre: str
    descripcion: str
    base_legal: str
    monto_soles: float | None = None
    requisitos: list[str] = field(default_factory=list)
    donde_se_tramita: str = ""
    advertencia: str | None = None


CATALOGO: tuple[Derecho, ...] = (
    Derecho(
        codigo="cobertura",
        nombre="Cobertura oncológica gratuita",
        descripcion=(
            "El tratamiento oncológico de menores de 18 años es gratuito y de "
            "cobertura universal, incluso desde la sospecha diagnóstica y "
            "antes de la confirmación. No depende del tipo de seguro."),
        base_legal=FUENTES["ley_31041"],
        requisitos=["Menor de 18 años", "Diagnóstico presuntivo o confirmado"],
        donde_se_tramita="IAFAS (SIS / EsSalud / privada) y el propio establecimiento",
    ),
    Derecho(
        codigo="subsidio",
        nombre="Subsidio económico por hijo con cáncer",
        descripcion=(
            "Subsidio equivalente a dos remuneraciones mínimas vitales por "
            "familia, durante el tratamiento hospitalario, a partir del "
            "diagnóstico confirmado."),
        base_legal=FUENTES["ley_31041"] + " · " + FUENTES["reglamento"],
        monto_soles=2 * RMV_SOLES,
        requisitos=[
            "Diagnóstico oncológico confirmado en menor de 18 años",
            "Padre, madre o tutor en condición de trabajador",
            "Tratamiento hospitalario en curso",
        ],
        donde_se_tramita="IAFAS correspondiente (SIS o EsSalud)",
        advertencia=(
            "La Defensoría del Pueblo ha señalado reiteradamente que el "
            "reglamento específico del subsidio sigue sin publicarse, por lo "
            "que en la práctica muchas familias no logran cobrarlo. Solicitarlo "
            "igualmente y **dejar constancia de la respuesta** es lo que "
            "documenta la brecha."),
    ),
    Derecho(
        codigo="licencia",
        nombre="Licencia laboral por hijo con cáncer",
        descripcion=(
            "Licencia excepcional de hasta un año para el padre o madre "
            "trabajador. Los primeros 21 días los asume el empleador; el resto, "
            "EsSalud."),
        base_legal=FUENTES["ley_31041"],
        requisitos=[
            "Hijo menor de 18 años con diagnóstico oncológico confirmado",
            "Certificado médico del establecimiento tratante",
            "Solicitud formal al empleador",
        ],
        donde_se_tramita="Empleador y EsSalud",
    ),
    Derecho(
        codigo="apoyo_psicologico",
        nombre="Apoyo psicológico y cuidados paliativos",
        descripcion=(
            "El niño y su familia tienen derecho a apoyo psicológico y, cuando "
            "corresponda, a cuidados paliativos, como parte de la atención "
            "integral."),
        base_legal=FUENTES["ley_31041"] + " · " + FUENTES["ley_31336"],
        donde_se_tramita="Establecimiento tratante",
    ),
    Derecho(
        codigo="teleinterconsulta",
        nombre="Atención por telesalud sin traslado",
        descripcion=(
            "El seguimiento puede realizarse por teleinterconsulta entre el "
            "establecimiento cercano y el especialista, sin exigir el traslado "
            "de la familia."),
        base_legal=FUENTES["telesalud"],
        donde_se_tramita="Establecimiento de origen, coordinando con el INSNSB",
    ),
)


@dataclass
class SituacionFamiliar:
    """Lo mínimo para saber qué le corresponde a esta familia."""

    diagnostico_confirmado: bool
    hospitalizado_actualmente: bool = False
    cuidador_trabaja: bool = False
    cuidador_es_dependiente: bool = True
    edad_paciente: float = 8.0


def derechos_aplicables(situacion: SituacionFamiliar) -> list[Derecho]:
    """Filtra el catálogo según la situación concreta.

    Se prefiere pecar por exceso: mostrar un derecho que quizá no aplique tiene
    como costo una consulta; ocultarlo tiene como costo que la familia no lo
    cobre nunca.
    """
    aplicables = []
    for derecho in CATALOGO:
        if situacion.edad_paciente >= 18:
            continue
        if derecho.codigo == "subsidio":
            if not situacion.diagnostico_confirmado:
                continue
        if derecho.codigo == "licencia":
            if not (situacion.cuidador_trabaja and situacion.cuidador_es_dependiente):
                continue
        aplicables.append(derecho)
    return aplicables


def resumen_para_familia(situacion: SituacionFamiliar) -> dict[str, Any]:
    """Resumen en lenguaje claro, para mostrar en la app.

    Está escrito para leerse en un celular, en una sala de espera, por alguien
    que no es abogado ni personal de salud.
    """
    aplicables = derechos_aplicables(situacion)
    total = sum(d.monto_soles or 0 for d in aplicables)

    return {
        "titulo": "Lo que le corresponde a su familia por ley",
        "monto_estimado_soles": total if total else None,
        "derechos": [
            {
                "nombre": d.nombre,
                "que_es": d.descripcion,
                "monto": d.monto_soles,
                "donde": d.donde_se_tramita,
                "necesita": d.requisitos,
                "ojo": d.advertencia,
                "base_legal": d.base_legal,
            }
            for d in aplicables
        ],
        "aviso": ("Esta información es orientativa y se basa en normas "
                  "vigentes. No sustituye asesoría legal ni la evaluación de "
                  "la trabajadora social del establecimiento."),
    }


def expediente(paciente_id: str, codigo_derecho: str,
               situacion: SituacionFamiliar) -> dict[str, Any]:
    """Genera el expediente de solicitud de un derecho.

    Que la familia no tenga que saber redactar una solicitud ni averiguar la
    base legal es, en la práctica, la diferencia entre ejercer el derecho y no
    ejercerlo.
    """
    derecho = next((d for d in CATALOGO if d.codigo == codigo_derecho), None)
    if derecho is None:
        raise ValueError(f"Derecho desconocido: {codigo_derecho}")

    return {
        "paciente_id": paciente_id,
        "derecho": derecho.nombre,
        "base_legal": derecho.base_legal,
        "monto_solicitado_soles": derecho.monto_soles,
        "dirigido_a": derecho.donde_se_tramita,
        "documentos_requeridos": derecho.requisitos,
        "estado": EstadoGestion.NO_INICIADA.value,
        "texto_sugerido": (
            f"Solicito el otorgamiento de «{derecho.nombre}», al amparo de "
            f"{derecho.base_legal}, para el paciente con código {paciente_id}, "
            f"menor de edad con diagnóstico oncológico en tratamiento en el "
            f"Instituto Nacional de Salud del Niño - San Borja."),
        "nota_seguimiento": (
            "Registrar la respuesta recibida y su fecha, incluso si no hay "
            "respuesta. La ausencia de respuesta también es un dato, y hoy "
            "nadie la está midiendo."),
    }


def brecha_de_derechos(gestiones: list[dict[str, Any]]) -> dict[str, Any]:
    """Indicador agregado: cuánto de lo que la ley promete llega de verdad.

    Este es el dato que hoy no existe. La Defensoría del Pueblo denuncia que el
    subsidio no se implementa, pero no hay una serie que lo cuantifique caso a
    caso. Si el sistema registra cada solicitud y cada respuesta, produce esa
    evidencia como subproducto del trabajo asistencial normal.
    """
    if not gestiones:
        return {"total": 0}

    por_estado: dict[str, int] = {}
    for g in gestiones:
        estado = g.get("estado", EstadoGestion.NO_INICIADA.value)
        por_estado[estado] = por_estado.get(estado, 0) + 1

    solicitadas = sum(v for k, v in por_estado.items()
                      if k != EstadoGestion.NO_INICIADA.value)
    otorgadas = por_estado.get(EstadoGestion.OTORGADO.value, 0)

    return {
        "total": len(gestiones),
        "solicitadas": solicitadas,
        "otorgadas": otorgadas,
        "tasa_de_otorgamiento": (round(otorgadas / solicitadas, 3)
                                 if solicitadas else None),
        "sin_respuesta": por_estado.get(EstadoGestion.SIN_RESPUESTA.value, 0),
        "por_estado": por_estado,
        "monto_no_percibido_soles": round(
            sum(g.get("monto_solicitado_soles") or 0
                for g in gestiones
                if g.get("estado") != EstadoGestion.OTORGADO.value), 0),
    }
