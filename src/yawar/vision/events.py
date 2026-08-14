"""Deteccion de gaps opticos por reproyeccion al marco material.

La idea
-------
En el kymograph un leucocito es una estria brillante *diagonal*: se mueve.
Detectar objetos moviles debiles en ruido es dificil. Pero si se conoce la
velocidad, se puede cambiar de sistema de referencia y mirar la sangre desde la
sangre: en el **marco material** (coordenada ``xi = s - D(t)``, que viaja con
el flujo) el leucocito esta quieto, y su estria diagonal se convierte en una
linea vertical.

Eso convierte el problema en promediar y buscar picos en 1D. La ganancia es
real: si un gap es visible durante ``n`` frames, promediar en el marco material
mejora la relacion senal-ruido por un factor ``sqrt(n)``. Para un capilar de
180 um con flujo de 800 um/s a 60 fps son ~13 frames, es decir ~3.7x. Ese
margen es exactamente lo que permite bajar de una camara cientifica a la camara
de un celular de posta.

Ademas el marco material da algo que el conteo por frames no da: cada gap se
cuenta **una sola vez**, por construccion. No hay doble conteo del mismo
leucocito visto en frames consecutivos, que es la fuente de error mas comun al
contar sobre el video crudo.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import uniform_filter1d
from scipy.signal import find_peaks

from .kymograph import Kymograph
from .velocity import VelocityEstimate

#: Anchura admisible de un gap leucocitario, en um. El leucocito mide 7-12 um y
#: arrastra una estela de deplecion eritrocitaria; la longitud optica total
#: sigue una lognormal de mediana ~30 um. Fuera de este rango, lo detectado es
#: otra cosa (ruido por debajo, onda de densidad por encima).
GAP_WIDTH_RANGE_UM = (12.0, 70.0)


@dataclass
class MaterialProjection:
    """Perfil del contenido del capilar en el marco que viaja con la sangre."""

    profile: np.ndarray       # intensidad media por bin material
    coverage: np.ndarray      # cuantas muestras cayeron en cada bin
    xi_um: np.ndarray         # coordenada material de cada bin
    bin_um: float
    valid: np.ndarray         # bins con cobertura suficiente

    @property
    def scanned_length_um(self) -> float:
        """Longitud de columna sanguinea efectivamente inspeccionada."""
        return float(self.valid.sum()) * self.bin_um


@dataclass
class EventDetection:
    n_events: int
    positions_um: np.ndarray      # posicion material de cada gap
    widths_um: np.ndarray         # anchura del gap
    prominences: np.ndarray       # altura sobre la linea de base local
    projection: MaterialProjection
    noise_sigma: float
    threshold: float

    @property
    def mean_gap_width_um(self) -> float:
        return float(np.mean(self.widths_um)) if self.widths_um.size else float("nan")


def _estimate_kymo_noise(data: np.ndarray) -> float:
    """Ruido por muestra del kymograph, estimado de su contenido temporal fino.

    Se usa la diferencia entre frames consecutivos: la senal fisica esta
    correlacionada en el tiempo, el ruido del sensor no. El estimador MAD la
    hace inmune a los propios gaps.
    """
    diff = np.diff(data.astype(np.float64), axis=0)
    mad = np.median(np.abs(diff - np.median(diff)))
    # var(a - b) = 2*var  para ruido independiente entre frames
    return float(mad * 1.4826 / np.sqrt(2.0))


def project_to_material_frame(kymo: Kymograph, vel: VelocityEstimate,
                              bin_um: float = 2.0,
                              min_coverage: int = 3) -> MaterialProjection:
    """Reproyecta el kymograph al marco que viaja con la sangre."""
    data = kymo.data
    n_frames, n_pos = data.shape
    s = kymo.arclength_um - kymo.arclength_um[0]
    disp = vel.displacement_um

    # xi = s - D(t), desplazado para que el minimo quede en cero.
    xi = s[None, :] - disp[:, None]
    xi_min = float(xi.min())
    idx = np.floor((xi - xi_min) / bin_um).astype(np.int64)
    n_bins = int(idx.max()) + 1

    flat_idx = idx.ravel()
    flat_val = data.ravel().astype(np.float64)

    total = np.bincount(flat_idx, weights=flat_val, minlength=n_bins)
    count = np.bincount(flat_idx, minlength=n_bins)

    with np.errstate(invalid="ignore", divide="ignore"):
        profile = np.where(count > 0, total / np.maximum(count, 1), np.nan)

    valid = count >= min_coverage
    xi_axis = xi_min + (np.arange(n_bins) + 0.5) * bin_um

    return MaterialProjection(profile=profile, coverage=count, xi_um=xi_axis,
                              bin_um=bin_um, valid=valid)


def detect_events(kymo: Kymograph, vel: VelocityEstimate,
                  bin_um: float = 2.0,
                  expected_gap_um: float = 30.0,
                  n_sigma: float | None = None,
                  expected_false_positives: float = 0.1,
                  min_coverage: int = 3) -> EventDetection:
    """Cuenta los gaps opticos del capilar.

    El umbral se expresa en unidades del ruido local estimado de forma robusta
    (MAD), no en unidades absolutas, para que el detector se adapte solo a
    videos mas o menos ruidosos.

    Ahora bien, **cuantos** sigmas es la decision critica, y un valor fijo esta
    mal por una razon de fondo: no se examina un dato sino varios miles de bins
    materiales, asi que la pregunta correcta no es "cual es la probabilidad de
    que este bin supere el umbral por azar" sino "cual es la probabilidad de
    que *alguno* de los 5000 lo haga". Con 3.5 sigma y 5400 bins se esperan
    ~1.2 falsos positivos por capilar, es decir ~6 por paciente. En un nino con
    ANC de 150 los eventos reales son ~3: el ruido duplicaba el recuento y el
    sistema lo declaraba sano. Era el fallo mas peligroso posible, porque
    empujaba el error hacia el lado del falso negativo clinico.

    Fijando en cambio el numero **esperado** de falsos positivos por capilar
    (``expected_false_positives``), el umbral en sigmas se deduce del numero de
    bins examinados y el detector deja de depender de la duracion del video.
    """
    proj = project_to_material_frame(kymo, vel, bin_um, min_coverage)

    prof = proj.profile.copy()
    valid = proj.valid & np.isfinite(prof)
    if valid.sum() < 20:
        return EventDetection(0, np.array([]), np.array([]), np.array([]),
                              proj, float("nan"), float("nan"))

    # Interpola los huecos para poder filtrar de forma continua.
    idx = np.arange(prof.size)
    prof[~valid] = np.interp(idx[~valid], idx[valid], prof[valid])

    # Filtro adaptado: promedia sobre la anchura esperada del gap (realza la
    # senal) y resta una linea de base mucho mas ancha (quita la deriva).
    w_sig = max(int(round(expected_gap_um / bin_um)), 1)
    w_base = max(w_sig * 8, 25)
    matched = uniform_filter1d(prof, size=w_sig, mode="nearest")
    baseline = uniform_filter1d(prof, size=w_base, mode="nearest")
    residual = matched - baseline

    # Ruido *por bin*, no global. Cada bin del perfil material es el promedio
    # de tantas muestras como veces paso sangre por ahi, asi que su ruido cae
    # como 1/sqrt(cobertura). La cobertura no es uniforme: en los extremos del
    # recorrido -- el trozo de sangre que entra al final, el que ya estaba al
    # principio -- solo contribuyen unos pocos frames, y esos bins son mucho
    # mas ruidosos que los del centro. Un sigma global los da por buenos y
    # produce picos fantasma justo ahi. Medido sobre video sintetico con ANC=0,
    # ese efecto solo generaba ~7 eventos falsos por paciente: un suelo de
    # recuento que hacia imposible distinguir la neutropenia profunda.
    # Hay dos fuentes de fluctuacion y se comportan al reves una de otra:
    #
    #   * el **ruido del sensor** es independiente entre muestras, asi que
    #     promediar lo reduce: su varianza cae como 1/cobertura;
    #   * la **textura biologica** (ondas de densidad eritrocitaria, hematocrito
    #     local) es senal real y coherente: promediar no la reduce, su varianza
    #     no depende de la cobertura.
    #
    # Modelarlas juntas con un solo sigma falla en los dos extremos. Se separan:
    # el termino del sensor se mide de la diferencia entre frames consecutivos,
    # y el biologico es lo que le sobra a la varianza empirica del residual.
    sigma_sample = _estimate_kymo_noise(kymo.data)
    cov = np.maximum(proj.coverage.astype(np.float64), 1.0)
    median_cov = float(np.median(cov[valid])) if valid.any() else 1.0

    mad_res = np.median(np.abs(residual[valid] - np.median(residual[valid])))
    var_residual = float(mad_res * 1.4826) ** 2 if mad_res > 0 else float(np.var(residual[valid]))
    var_sensor_typical = sigma_sample**2 / max(median_cov, 1.0) / max(w_sig, 1)
    var_bio = max(var_residual - var_sensor_typical, 0.0)

    var_bin = var_bio + (sigma_sample**2) / cov / max(w_sig, 1)
    sigma_bin = np.sqrt(np.maximum(var_bin, 1e-18))

    z = np.zeros_like(residual)
    np.divide(residual, sigma_bin, out=z, where=sigma_bin > 0)

    if n_sigma is None:
        # Numero de pruebas independientes: los bins cubiertos, divididos por
        # la anchura del filtro adaptado (bins vecinos no son independientes).
        n_independent = max(float(valid.sum()) * bin_um / max(expected_gap_um, 1e-6), 1.0)
        from scipy.stats import norm
        n_sigma = float(norm.isf(min(expected_false_positives / n_independent, 0.25)))

    # Ademas se descartan los bins con cobertura muy por debajo de la tipica:
    # aunque la normalizacion los trata bien en promedio, su estadistica es
    # pobre y no aportan sensibilidad.
    cov_floor = 0.35 * float(np.median(cov[valid]))
    valid = valid & (proj.coverage >= max(cov_floor, min_coverage))

    z_masked = np.where(valid, z, -np.inf)
    peaks, props = find_peaks(
        z_masked,
        height=n_sigma,
        distance=max(int(round(expected_gap_um * 0.6 / bin_um)), 1),
        prominence=n_sigma * 0.6,
        width=1,
    )

    widths_all = props["widths"] * bin_um

    # Filtro de forma. El confundidor dominante de este metodo no es el ruido
    # del sensor sino la propia sangre: las ondas de densidad eritrocitaria
    # producen zonas mas claras que imitan a un gap. No es un defecto de la
    # implementacion -- en el estudio de referencia solo el 62% de los eventos
    # candidatos alcanzaba consenso entre tres evaluadores humanos en basal, y
    # apenas el 22% durante la neutropenia -- pero si es lo que fija el limite
    # de deteccion, y sin filtrarlo aparecian ~6 eventos falsos por paciente
    # incluso con ANC cero.
    #
    # Lo que los separa es la escala. Un leucocito con su estela deja un hueco
    # corto y de bordes marcados (12-70 um, la distribucion medida en la
    # literatura); una onda de densidad es suave y larga (longitud de
    # correlacion ~110 um). Exigir que la anchura caiga en el rango del
    # leucocito descarta el confundidor sin tocar la senal.
    shape_ok = (widths_all >= GAP_WIDTH_RANGE_UM[0]) & (widths_all <= GAP_WIDTH_RANGE_UM[1])

    keep = valid[peaks] & shape_ok
    peaks = peaks[keep]
    widths = widths_all[keep]
    proms = props["prominences"][keep]
    sigma = float(np.median(sigma_bin[valid])) if valid.any() else float("nan")
    threshold = n_sigma * sigma

    return EventDetection(
        n_events=int(peaks.size),
        positions_um=proj.xi_um[peaks],
        widths_um=widths,
        prominences=proms,
        projection=proj,
        noise_sigma=sigma,
        threshold=threshold,
    )
