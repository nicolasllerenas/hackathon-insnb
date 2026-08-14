"""Pipeline de vision por computador de Yawar Nan.

Flujo completo, de video crudo a conteo de leucocitos:

    video -> estabilizar -> segmentar lumen -> kymograph
          -> medir velocidad -> reproyectar al marco material -> contar gaps

Cada paso esta en su propio modulo y se puede usar por separado; ``analyze_clip``
los encadena.
"""

from .events import (
    EventDetection,
    MaterialProjection,
    detect_events,
    project_to_material_frame,
)
from .kymograph import Kymograph, extract_kymograph
from .segment import CapillarySegmentation, flow_score, segment_capillary
from .stabilize import motion_rms_px, stabilize
from .velocity import VelocityEstimate, estimate_velocity

__all__ = [
    "CapillarySegmentation",
    "EventDetection",
    "Kymograph",
    "MaterialProjection",
    "VelocityEstimate",
    "detect_events",
    "estimate_velocity",
    "extract_kymograph",
    "flow_score",
    "motion_rms_px",
    "project_to_material_frame",
    "segment_capillary",
    "stabilize",
]
