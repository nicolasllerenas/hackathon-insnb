"""Yawar Nan - Ruta hematologica pediatrica con tamizaje optico no invasivo.

Yawar Nan significa "camino de la sangre" en quechua.

Desafio 3 de la Hackaton Nino San Borja 2026.
Licencia: Apache-2.0
"""

__version__ = "0.1.0"

from . import (illumination, interop, model, optics, pipeline, synth,
               triage, vision)

__all__ = ["illumination", "interop", "model", "optics", "pipeline",
           "synth", "triage", "vision", "__version__"]
