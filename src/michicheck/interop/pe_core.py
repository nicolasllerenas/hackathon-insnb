"""Alineacion con HL7 FHIR PE Core, el perfil nacional peruano.

Que es esto
-----------
El MINSA publica una guia de implementacion FHIR propia,
``HL7.FHIR.PE.COREPE``, que es el estandar al que deben ajustarse los sistemas
que quieran interoperar con **RENHICE** (Registro Nacional de Historias
Clinicas Electronicas, creado por la Ley 30024).

    Guia:      https://dyaku.minsa.gob.pe/guides/
    Canonico:  https://www.gob.pe/minsa/RENHICE/fhir/
    Version:   FHIR 4.0.1, guia 0.1 (ci-build, **en desarrollo**)

Emitir FHIR generico no basta: si los identificadores y los perfiles no son los
del pais, el mensaje no entra a RENHICE y la integracion hay que rehacerla.

El hueco que nos afecta, y conviene decirlo
-------------------------------------------
La guia nacional cubre hoy el conjunto minimo del *International Patient
Summary*: paciente, profesional, organizacion, alergias, condiciones,
medicacion, composicion, bundle y consentimiento.

**No define perfiles de Observation, DiagnosticReport ni ServiceRequest.**

Es decir: un resultado de laboratorio -- que es exactamente lo que produce este
tamizaje -- todavia no tiene perfil nacional. Por tanto:

* Paciente, organizacion y profesional **si** se emiten conforme a PE Core.
* El ANC estimado y el informe se emiten en **FHIR R4 base**, declarandolo de
  forma explicita en vez de fingir una conformidad que no existe.

Esto no es un defecto de la propuesta sino del estado del ecosistema, y es una
contribucion concreta que el equipo puede ofrecer: un perfil de Observation
para resultados de tamizaje, que hoy le falta al pais.
"""

from __future__ import annotations

from typing import Any

PE_CORE_BASE = "https://www.gob.pe/minsa/RENHICE/fhir"

PROFILE_PACIENTE = f"{PE_CORE_BASE}/StructureDefinition/PacientePe"
PROFILE_PRACTITIONER = f"{PE_CORE_BASE}/StructureDefinition/PractitionerPe"
PROFILE_ORGANIZACION = f"{PE_CORE_BASE}/StructureDefinition/OrganizacionPe"
PROFILE_COMPOSITION = f"{PE_CORE_BASE}/StructureDefinition/CompositionPe"
PROFILE_BUNDLE = f"{PE_CORE_BASE}/StructureDefinition/BundlePe"
PROFILE_CONSENT = f"{PE_CORE_BASE}/StructureDefinition/ConsentimientoRENHICE"

CS_IDS_PERSONA = f"{PE_CORE_BASE}/CodeSystem/IdspersonaPeru"
CS_IPRESS = f"{PE_CORE_BASE}/CodeSystem/IPRESSCS"
CS_COLEGIOS = f"{PE_CORE_BASE}/CodeSystem/ColegiosProfesionalesSaludCS"
CS_PAISES = f"{PE_CORE_BASE}/CodeSystem/PaisesCS"

EXT_UBIGEO = f"{PE_CORE_BASE}/StructureDefinition/pe-ubigeo"
EXT_PAIS = f"{PE_CORE_BASE}/StructureDefinition/pe-pais"

INSNSB_RENIPRESS = "00006213"

SIN_PERFIL_NACIONAL = ("Observation", "DiagnosticReport", "ServiceRequest", "Flag")


def patient_resource(patient_id: str, documento: str | None = None,
                     tipo_documento: str = "DNI") -> dict[str, Any]:
    """``Patient`` conforme a PacientePe.

    El perfil exige al menos un identificador **con tipo declarado**. Por
    diseno del proyecto no se envia el DNI salvo que la integracion lo exija:
    el identificador por defecto es el codigo de historia clinica del
    establecimiento, que basta para el seguimiento y no expone al paciente.
    """
    identificadores: list[dict[str, Any]] = [{
        "type": {
            "coding": [{"system": CS_IDS_PERSONA, "code": "HC",
                        "display": "Historia clinica"}],
            "text": "Codigo de historia clinica institucional",
        },
        "system": f"{PE_CORE_BASE}/NamingSystem/historia-clinica",
        "value": patient_id,
    }]
    if documento:
        identificadores.insert(0, {
            "type": {"coding": [{"system": CS_IDS_PERSONA,
                                 "code": tipo_documento}]},
            "value": documento,
        })

    return {
        "resourceType": "Patient",
        "meta": {"profile": [PROFILE_PACIENTE]},
        "identifier": identificadores,
    }


def organization_resource(renipress: str = INSNSB_RENIPRESS,
                          nombre: str = "Instituto Nacional de Salud del Nino "
                                        "- San Borja") -> dict[str, Any]:
    """``Organization`` conforme a OrganizacionPe, identificada por RENIPRESS."""
    return {
        "resourceType": "Organization",
        "meta": {"profile": [PROFILE_ORGANIZACION]},
        "identifier": [{
            "system": CS_IPRESS,
            "value": renipress,
        }],
        "name": nombre,
    }


def device_resource(device_id: str, serial: str | None = None) -> dict[str, Any]:
    """``Device`` del equipo de captura. Sin perfil nacional; R4 base.

    Va en el bundle porque un resultado de tamizaje sin saber **con que
    aparato** se obtuvo no es auditable, y porque la trazabilidad del
    dispositivo es lo que permite retirar resultados si una unidad se
    descalibra.
    """
    recurso: dict[str, Any] = {
        "resourceType": "Device",
        "identifier": [{"system": f"{PE_CORE_BASE}/NamingSystem/dispositivo",
                        "value": device_id}],
        "deviceName": [{"name": "MichiCheck", "type": "model-name"}],
        "type": {"text": "Capilaroscopio optico no invasivo (investigacion)"},
        "status": "active",
        "note": [{"text": "Prototipo de investigacion. No es un dispositivo "
                          "medico registrado ante DIGEMID."}],
    }
    if serial:
        recurso["serialNumber"] = serial
    return recurso


def conformance_note() -> dict[str, Any]:
    """Declaracion explicita de a que se ajusta el mensaje y a que no.

    Va dentro del propio bundle. Un receptor que lo procese dentro de seis
    meses tiene que poder saber, sin preguntarle a nadie, que partes eran
    conformes al perfil nacional y cuales no lo eran porque el perfil aun no
    existia.
    """
    return {
        "guia_nacional": PE_CORE_BASE,
        "version_guia": "0.1 (ci-build, en desarrollo a la fecha de emision)",
        "conforme_pe_core": ["Patient", "Organization"],
        "fhir_r4_base_sin_perfil_nacional": list(SIN_PERFIL_NACIONAL),
        "motivo": ("La guia HL7.FHIR.PE.COREPE cubre el conjunto minimo IPS "
                   "(alergias, condiciones, medicacion) y todavia no define "
                   "perfiles para resultados de laboratorio o tamizaje."),
        "advertencia": ("Resultado de TAMIZAJE, preliminar. No sustituye al "
                        "hemograma ni puede descartar neutropenia."),
    }
