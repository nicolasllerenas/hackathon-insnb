"""Recursos FHIR R4 para el tamizaje optico.

HL7 v2 (:mod:`michicheck.interop.hl7v2`) es lo que hoy entiende un HIS hospitalario
como Galenus. FHIR es hacia donde va la interoperabilidad en salud publica, y
es lo que permite que una posta, un hospital regional y el INSNSB compartan el
seguimiento de un mismo nino sin integraciones a medida. Se emiten los dos.

Se genera un ``Bundle`` de tipo ``transaction`` con:

* ``Observation`` del ANC estimado, con su intervalo de confianza;
* ``Observation`` de las variables de calidad (capilares, eventos, volumen);
* ``DiagnosticReport`` que agrupa el estudio y lleva la conclusion;
* ``ServiceRequest`` de derivacion, **solo si el triaje lo indica**;
* ``Flag`` de riesgo cuando hay sospecha de neutropenia febril.

La nota de la version HL7 v2 vale igual aqui: el resultado va marcado como
tamizaje y como preliminar. El campo ``method`` no es decorativo; es lo que
impide que dentro de seis meses alguien lea este valor como si fuera un
hemograma.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from ..pipeline import ScreeningResult
from ..triage import RiskLevel, TriageDecision

SYSTEM_LOINC = "http://loinc.org"
SYSTEM_SNOMED = "http://snomed.info/sct"
SYSTEM_MICHI = "https://github.com/michicheck/codes"

LOINC_ANC = "751-8"
SNOMED_NEUTROPENIA = "165517008"
SNOMED_FEBRILE_NEUTROPENIA = "409089005"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _uuid() -> str:
    return f"urn:uuid:{uuid.uuid4()}"


def _interpretation(decision: TriageDecision) -> dict[str, Any]:
    """La interpretacion describe el valor, no la conducta.

    Un paciente ESTABLE puede tener el recuento en zona de vigilancia; quien lee
    el recurso en Galenus necesita distinguir eso de un recuento normal.
    """
    if decision.level in (RiskLevel.PRIORIZABLE, RiskLevel.GRAVE):
        code, display = "LL", "Critical low"
    elif decision.level is RiskLevel.INDETERMINADO:
        code, display = "IND", "Indeterminate"
    elif decision.anc_used < 1500:
        code, display = "L", "Low"
    else:
        code, display = "N", "Normal"
    return {
        "coding": [{
            "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
            "code": code, "display": display,
        }]
    }


def _method() -> dict[str, Any]:
    return {
        "coding": [{
            "system": SYSTEM_MICHI,
            "code": "capilaroscopia-optica",
            "display": "Capilaroscopia optica no invasiva del lecho ungueal",
        }],
        "text": ("Tamizaje optico no invasivo. NO es un hemograma y no debe "
                 "usarse para descartar neutropenia."),
    }


def anc_observation(result: ScreeningResult, decision: TriageDecision,
                    patient_ref: str, device_ref: str | None = None,
                    effective: str | None = None) -> dict[str, Any]:
    """``Observation`` con el ANC estimado y su incertidumbre."""
    obs: dict[str, Any] = {
        "resourceType": "Observation",
        "status": "preliminary",
        "category": [{
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                "code": "laboratory", "display": "Laboratory",
            }]
        }],
        "code": {
            "coding": [{"system": SYSTEM_LOINC, "code": LOINC_ANC,
                        "display": "Neutrophils [#/volume] in Blood"}],
            "text": "Recuento absoluto de neutrofilos (estimado por tamizaje optico)",
        },
        "subject": {"reference": patient_ref},
        "effectiveDateTime": effective or _now_iso(),
        "method": _method(),
        "note": [{"text": (
            "Resultado de tamizaje optico no invasivo. No sustituye al "
            "hemograma. No debe utilizarse para descartar neutropenia ni para "
            "modificar o suspender quimioterapia."
        )}],
    }
    if device_ref:
        obs["device"] = {"reference": device_ref}

    if result.conclusive:
        obs["valueQuantity"] = {
            "value": round(float(result.anc_estimate), 0),
            "unit": "10*3/uL" if False else "/uL",
            "system": "http://unitsofmeasure.org", "code": "/uL",
        }
        obs["interpretation"] = [_interpretation(decision)]
        obs["component"] = [
            _quantity_component("ic95-inferior", "Limite inferior IC95",
                                result.anc_ci_low, "/uL"),
            _quantity_component("ic95-superior", "Limite superior IC95",
                                result.anc_ci_high, "/uL"),
        ]
    else:
        obs["dataAbsentReason"] = {
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/data-absent-reason",
                "code": "error", "display": "Error",
            }],
            "text": "; ".join(result.reasons) or "Tamizaje no concluyente",
        }
    return obs


def _quantity_component(code: str, display: str, value: float,
                        unit: str) -> dict[str, Any]:
    return {
        "code": {"coding": [{"system": SYSTEM_MICHI, "code": code,
                             "display": display}]},
        "valueQuantity": {"value": round(float(value), 3), "unit": unit},
    }


def quality_observation(result: ScreeningResult, patient_ref: str
                        ) -> dict[str, Any]:
    """``Observation`` con las variables que hacen interpretable el resultado."""
    components = [
        _quantity_component("capilares-analizados", "Capilares analizados",
                            result.n_capillaries_used, "{capilares}"),
        _quantity_component("gaps-detectados", "Gaps opticos detectados",
                            result.total_events, "{eventos}"),
        _quantity_component("volumen-interrogado", "Volumen sanguineo interrogado",
                            result.sampled_volume_nl, "nL"),
        _quantity_component("velocidad-flujo", "Velocidad de flujo capilar",
                            result.mean_velocity_um_s, "um/s"),
        _quantity_component("diametro-capilar", "Diametro capilar medio",
                            result.mean_diameter_um, "um"),
    ]
    warnings = list(result.reasons)
    for m in result.measurements:
        warnings.extend(m.warnings)

    obs: dict[str, Any] = {
        "resourceType": "Observation",
        "status": "final",
        "code": {"coding": [{"system": SYSTEM_MICHI, "code": "calidad-captura",
                             "display": "Calidad de la captura"}]},
        "subject": {"reference": patient_ref},
        "effectiveDateTime": _now_iso(),
        "component": components,
    }
    if warnings:
        obs["note"] = [{"text": w} for w in dict.fromkeys(warnings)]
    return obs


def referral_request(decision: TriageDecision, patient_ref: str,
                     performer_display: str = "Servicio de Hematologia "
                                              "INSN San Borja") -> dict[str, Any]:
    """``ServiceRequest`` de derivacion. Solo se emite si el triaje lo indica."""
    urgency = "stat" if decision.level is RiskLevel.PRIORIZABLE else "urgent"
    reason_code = (SNOMED_FEBRILE_NEUTROPENIA
                   if decision.level is RiskLevel.PRIORIZABLE else SNOMED_NEUTROPENIA)
    return {
        "resourceType": "ServiceRequest",
        "status": "active",
        "intent": "order",
        "priority": urgency,
        "code": {"coding": [{"system": SYSTEM_SNOMED, "code": "306253008",
                             "display": "Referral to hematology service"}],
                 "text": decision.title},
        "subject": {"reference": patient_ref},
        "authoredOn": _now_iso(),
        "performer": [{"display": performer_display}],
        "reasonCode": [{"coding": [{"system": SYSTEM_SNOMED,
                                    "code": reason_code}],
                        "text": decision.title}],
        "note": [{"text": decision.action},
                 {"text": f"Plazo indicado: {decision.timeframe}"}],
    }


def risk_flag(decision: TriageDecision, patient_ref: str) -> dict[str, Any]:
    """``Flag`` visible en la historia mientras el riesgo siga activo."""
    return {
        "resourceType": "Flag",
        "status": "active",
        "category": [{"coding": [{
            "system": "http://terminology.hl7.org/CodeSystem/flag-category",
            "code": "clinical", "display": "Clinical"}]}],
        "code": {"coding": [{"system": SYSTEM_SNOMED,
                             "code": SNOMED_FEBRILE_NEUTROPENIA}],
                 "text": decision.title},
        "subject": {"reference": patient_ref},
        "period": {"start": _now_iso()},
    }


def build_bundle(result: ScreeningResult, decision: TriageDecision,
                 patient_id: str, device_id: str | None = None,
                 renipress: str | None = None,
                 incluir_pe_core: bool = True) -> dict[str, Any]:
    """Bundle ``transaction`` listo para POST a un servidor FHIR.

    Con ``incluir_pe_core`` (por defecto) el bundle incorpora los recursos
    ``Patient`` y ``Organization`` conforme a los perfiles nacionales
    (:mod:`michicheck.interop.pe_core`) y una nota de conformidad que declara
    explicitamente que partes se ajustan al perfil peruano y cuales van en R4
    base por no existir aun perfil nacional para resultados de laboratorio.
    """
    from . import pe_core

    patient_ref = f"Patient/{patient_id}"
    device_ref = f"Device/{device_id}" if device_id else None

    anc_obs = anc_observation(result, decision, patient_ref, device_ref)
    qual_obs = quality_observation(result, patient_ref)
    anc_url, qual_url = _uuid(), _uuid()

    entries: list[dict[str, Any]] = []

    if incluir_pe_core:
        entries.append({
            "fullUrl": _uuid(),
            "resource": pe_core.patient_resource(patient_id),
            "request": {"method": "POST", "url": "Patient"},
        })
        entries.append({
            "fullUrl": _uuid(),
            "resource": pe_core.organization_resource(
                renipress or pe_core.INSNSB_RENIPRESS),
            "request": {"method": "POST", "url": "Organization"},
        })
        if device_id:
            entries.append({
                "fullUrl": _uuid(),
                "resource": pe_core.device_resource(device_id),
                "request": {"method": "POST", "url": "Device"},
            })

    entries += [
        {"fullUrl": anc_url, "resource": anc_obs,
         "request": {"method": "POST", "url": "Observation"}},
        {"fullUrl": qual_url, "resource": qual_obs,
         "request": {"method": "POST", "url": "Observation"}},
    ]

    report = {
        "resourceType": "DiagnosticReport",
        "status": "preliminary",
        "code": {"coding": [{"system": SYSTEM_MICHI,
                             "code": "tamizaje-neutropenia",
                             "display": "Tamizaje optico de neutropenia"}],
                 "text": "Tamizaje optico no invasivo de neutropenia"},
        "subject": {"reference": patient_ref},
        "effectiveDateTime": _now_iso(),
        "issued": _now_iso(),
        "result": [{"reference": anc_url}, {"reference": qual_url}],
        "conclusion": f"{decision.title}. {decision.action}",
        "conclusionCode": [{
            "coding": [{"system": SYSTEM_MICHI,
                        "code": f"triaje-{decision.level.value}",
                        "display": decision.level.value.upper()}]
        }],
    }
    entries.append({"fullUrl": _uuid(), "resource": report,
                    "request": {"method": "POST", "url": "DiagnosticReport"}})

    if decision.is_emergency:
        entries.append({"fullUrl": _uuid(),
                        "resource": referral_request(decision, patient_ref),
                        "request": {"method": "POST", "url": "ServiceRequest"}})
    if decision.level is RiskLevel.PRIORIZABLE:
        entries.append({"fullUrl": _uuid(),
                        "resource": risk_flag(decision, patient_ref),
                        "request": {"method": "POST", "url": "Flag"}})

    bundle: dict[str, Any] = {
        "resourceType": "Bundle",
        "type": "transaction",
        "timestamp": _now_iso(),
        "entry": entries,
    }
    if incluir_pe_core:
        bundle["meta"] = {
            "profile": [pe_core.PROFILE_BUNDLE],
            "tag": [{
                "system": SYSTEM_MICHI,
                "code": "tamizaje-preliminar",
                "display": "Tamizaje optico, resultado preliminar",
            }],
        }
        bundle["_conformidad"] = pe_core.conformance_note()
    return bundle
