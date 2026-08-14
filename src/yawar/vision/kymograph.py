"""Construccion del kymograph (mapa espacio-temporal) del capilar.

El kymograph ``K(t, s)`` es el promedio de intensidad de la seccion transversal
del capilar en cada punto de arco ``s`` y en cada instante ``t``. Colapsa el
video a una sola imagen 2D en la que:

* los eritrocitos en fila india dibujan **estrias diagonales** cuya pendiente
  es la velocidad de flujo;
* cada leucocito dibuja una **estria brillante** mas ancha y mas marcada.

Es la misma representacion (los "ST maps") que usa el estudio de referencia,
pero aqui se construye de forma automatica sobre la linea media segmentada, sin
que nadie tenga que trazar ROIs a mano.

La normalizacion por la mediana temporal de cada columna es importante: elimina
el vineteado y las diferencias de iluminacion entre puntos del capilar, de modo
que un valor de 1.0 significa "lumen en su estado habitual" y los gaps quedan
por encima de 1.0 en cualquier punto del campo.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .segment import CapillarySegmentation


@dataclass
class Kymograph:
    data: np.ndarray          # (T, S) float32, normalizado (1.0 = lumen tipico)
    raw: np.ndarray           # (T, S) float32 sin normalizar
    arclength_um: np.ndarray  # (S,)
    fps: float
    ds_um: float

    @property
    def duration_s(self) -> float:
        return self.data.shape[0] / self.fps

    @property
    def length_um(self) -> float:
        return float(self.arclength_um[-1] - self.arclength_um[0])


def _frame_coords(seg: CapillarySegmentation, um_per_px: float,
                  n_offsets: int, sample_fraction: float
                  ) -> tuple[np.ndarray, np.ndarray]:
    """Coordenadas de muestreo perpendiculares a la linea media."""
    pts = seg.centerline_px
    tangents = np.gradient(pts, axis=0)
    norms = np.linalg.norm(tangents, axis=1, keepdims=True)
    tangents = tangents / np.maximum(norms, 1e-9)
    normals = np.stack([-tangents[:, 1], tangents[:, 0]], axis=1)

    half_px = (seg.diameter_um * sample_fraction / 2.0) / um_per_px
    offsets = np.linspace(-half_px, half_px, n_offsets)

    xs = pts[:, 0][:, None] + normals[:, 0][:, None] * offsets[None, :]
    ys = pts[:, 1][:, None] + normals[:, 1][:, None] * offsets[None, :]
    return xs.astype(np.float32), ys.astype(np.float32)


def extract_kymograph(video: np.ndarray, seg: CapillarySegmentation,
                      um_per_px: float, fps: float,
                      n_offsets: int = 7,
                      sample_fraction: float = 0.7) -> Kymograph:
    """Extrae el kymograph a lo largo de la linea media segmentada.

    ``sample_fraction`` restringe el muestreo al 70% central del lumen: los
    bordes tienen poca profundidad optica (la cuerda tiende a cero) y solo
    aportan ruido y contaminacion del tejido vecino.
    """
    xs, ys = _frame_coords(seg, um_per_px, n_offsets, sample_fraction)

    n_pts = xs.shape[0]
    raw = np.empty((video.shape[0], n_pts), dtype=np.float32)
    for t, frame in enumerate(video):
        sampled = cv2.remap(frame.astype(np.float32), xs, ys,
                            interpolation=cv2.INTER_LINEAR,
                            borderMode=cv2.BORDER_REPLICATE)
        raw[t] = sampled.mean(axis=1)

    baseline = np.median(raw, axis=0)
    baseline = np.maximum(baseline, 1e-3)
    data = (raw / baseline[None, :]).astype(np.float32)

    ds = float(np.median(np.diff(seg.arclength_um))) if seg.arclength_um.size > 1 else 1.0
    return Kymograph(data=data, raw=raw, arclength_um=seg.arclength_um,
                     fps=fps, ds_um=ds)
