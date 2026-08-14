"""Mensajeria HL7 v2.5 para integrarse con el HIS/Galenus del INSNSB.

Se emite un **ORU^R01** (Observation Result Unsolicited), que es el mensaje con
el que un equipo de laboratorio o de punto de atencion notifica un resultado.
Es lo que un HIS hospitalario espera recibir de un dispositivo, y encaja sin
desarrollo a medida del lado del INSNSB.

Dos decisiones importantes para que esto no haga dano
-----------------------------------------------------
1. **El resultado va marcado como tamizaje, no como hemograma.** El ANC optico
   viaja con un codigo LOINC propio de metodo y con ``OBX-11 = P`` (resultado
   preliminar). Si entrara al HIS como un ANC de laboratorio, un clinico podria
   verlo en la historia junto a los hemogramas reales y tomarlo por uno. La
   trazabilidad del metodo no es burocracia: es lo que impide una decision
   equivocada dentro de seis meses.
2. **Los avisos de calidad viajan con el resultado**, no aparte. Un "cero
   eventos" sin el dato de que la presion de contacto fue excesiva es
   ininterpretable, y lo peor que puede hacer un sistema es entregar un numero
   limpio que esconde una medicion invalida.
"""

from __future__ import annotations

from datetime import datetime

from ..pipeline import ScreeningResult
from ..triage import RiskLevel, TriageDecision

HL7_VERSION = "2.5"
FIELD, COMPONENT, REPEAT, ESCAPE, SUB = "|", "^", "~", "\\", "&"

#: LOINC 751-8 = "Neutrophils [#/volume] in Blood by Automated count".
#: Se conserva como referencia semantica, pero el metodo se declara distinto
#: en OBX-17 para que nadie confunda esto con un hemograma.
LOINC_ANC = "751-8"
LOINC_ANC_TEXT = "Neutrofilos absolutos"
METHOD_CODE = "YAWAR-CAP-OPT"
METHOD_TEXT = "Capilaroscopia optica no invasiva (tamizaje)"


def _escape(value: str) -> str:
    """Escapa los separadores HL7 dentro de un campo."""
    # Ojo: una cadena raw no puede terminar en backslash, y todas estas
    # secuencias de escape HL7 lo hacen. Van con doble backslash normal.
    out = str(value).replace(ESCAPE, "\\E\\")
    return (out.replace(FIELD, "\\F\\").replace(COMPONENT, "\\S\\")
            .replace(REPEAT, "\\R\\").replace(SUB, "\\T\\"))


def _ts(moment: datetime) -> str:
    return moment.strftime("%Y%m%d%H%M%S")


def _abnormal_flag(level: RiskLevel) -> str:
    """OBX-8. ``LL`` = criticamente bajo, ``L`` = bajo, ``N`` = normal."""
    return {
        RiskLevel.NEGRO: "LL",
        RiskLevel.ROJO: "LL",
        RiskLevel.AMARILLO: "L",
        RiskLevel.VERDE: "N",
        RiskLevel.INDETERMINADO: "N",
    }.get(level, "N")


def build_oru_r01(result: ScreeningResult, decision: TriageDecision,
                  patient_id: str, patient_name: str = "",
                  facility: str = "POSTA", sending_app: str = "YAWARNAN",
                  receiving_app: str = "GALENUS",
                  receiving_facility: str = "INSNSB",
                  moment: datetime | None = None,
                  message_control_id: str | None = None) -> str:
    """Construye el mensaje ORU^R01 completo."""
    now = moment or datetime.now()
    ctrl = message_control_id or f"YN{_ts(now)}"
    segments: list[str] = []

    # MSH - cabecera
    segments.append(FIELD.join([
        "MSH", f"{COMPONENT}{REPEAT}{ESCAPE}{SUB}",
        _escape(sending_app), _escape(facility),
        _escape(receiving_app), _escape(receiving_facility),
        _ts(now), "", f"ORU{COMPONENT}R01", ctrl, "P", HL7_VERSION,
    ]))

    # PID - paciente. Solo el identificador institucional; el nombre es
    # opcional y por defecto no se envia.
    segments.append(FIELD.join([
        "PID", "1", "", _escape(patient_id), "", _escape(patient_name), "", "",
    ]))

    # OBR - peticion/estudio
    segments.append(FIELD.join([
        "OBR", "1", "", ctrl,
        f"{METHOD_CODE}{COMPONENT}{_escape(METHOD_TEXT)}{COMPONENT}L",
        "", "", _ts(now), "", "", "", "", "", "", "", "", "", "", "", "", "",
        "F",
    ]))

    idx = 0

    def obx(value_type: str, code: str, text: str, value: str,
            units: str = "", flag: str = "", status: str = "P") -> None:
        nonlocal idx
        idx += 1
        segments.append(FIELD.join([
            "OBX", str(idx), value_type,
            f"{code}{COMPONENT}{_escape(text)}{COMPONENT}LN",
            "", _escape(value), _escape(units), "", flag, "", "", status,
            "", "", _ts(now), "",
            f"{METHOD_CODE}{COMPONENT}{_escape(METHOD_TEXT)}",
        ]))

    # Resultado principal
    if result.conclusive:
        obx("NM", LOINC_ANC, LOINC_ANC_TEXT, f"{result.anc_estimate:.0f}",
            "/uL", _abnormal_flag(decision.level))
        obx("ST", f"{LOINC_ANC}-CI", "Intervalo de confianza 95%",
            f"{result.anc_ci_low:.0f}-{result.anc_ci_high:.0f}", "/uL")
    else:
        obx("ST", LOINC_ANC, LOINC_ANC_TEXT, "NO CONCLUYENTE", "", "", "X")

    # Contexto de la medicion: sin esto el numero no es interpretable.
    obx("NM", f"{METHOD_CODE}-CAP", "Capilares analizados",
        str(result.n_capillaries_used))
    obx("NM", f"{METHOD_CODE}-EVT", "Gaps opticos detectados",
        str(result.total_events))
    obx("NM", f"{METHOD_CODE}-VOL", "Volumen sanguineo interrogado",
        f"{result.sampled_volume_nl:.3f}", "nL")
    obx("ST", f"{METHOD_CODE}-TRI", "Nivel de triaje",
        decision.level.value.upper(), "", _abnormal_flag(decision.level), "F")
    obx("ST", f"{METHOD_CODE}-ACT", "Conducta indicada",
        f"{decision.title}: {decision.action}", "", "", "F")

    for reason in result.reasons:
        obx("ST", f"{METHOD_CODE}-QC", "Aviso de calidad", reason)
    for m in result.measurements:
        for w in m.warnings:
            obx("ST", f"{METHOD_CODE}-QC", "Aviso de calidad", w)

    # NTE - nota obligatoria de interpretacion.
    segments.append(FIELD.join([
        "NTE", "1", "L",
        _escape("Resultado de TAMIZAJE optico no invasivo. NO sustituye a un "
                "hemograma. No debe utilizarse para descartar neutropenia ni "
                "para suspender o modificar quimioterapia."),
    ]))

    return "\r".join(segments)


def parse_ack(message: str) -> tuple[bool, str]:
    """Interpreta un ACK. Devuelve ``(aceptado, texto)``."""
    for segment in message.replace("\n", "\r").split("\r"):
        if segment.startswith("MSA"):
            parts = segment.split(FIELD)
            code = parts[1] if len(parts) > 1 else ""
            text = parts[3] if len(parts) > 3 else ""
            return code == "AA", text or code
    return False, "Sin segmento MSA"
