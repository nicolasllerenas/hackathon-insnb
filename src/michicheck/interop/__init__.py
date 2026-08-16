"""Interoperabilidad: HL7 v2 para el HIS actual, FHIR R4 + PE Core para RENHICE."""

from . import pe_core
from .fhir import build_bundle
from .hl7v2 import build_oru_r01, parse_ack

__all__ = ["build_bundle", "build_oru_r01", "parse_ack", "pe_core"]
