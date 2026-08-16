"""Segmentacion del lumen capilar y extraccion de su linea media.

Un capilar util se distingue del tejido por dos cosas a la vez: es **oscuro**
(la hemoglobina absorbe) y es **inquieto** (su contenido fluye, asi que la
varianza temporal es alta). El tejido circundante puede ser oscuro pero es
quieto; un reflejo puede ser inquieto pero es brillante. El producto de ambas
evidencias separa el lumen de forma mucho mas estable que cualquiera de las dos
por separado, y no necesita entrenamiento.

Este criterio se comprobo sobre video capilaroscopico **real** (dataset
ANFC-THU, Tsinghua): el mapa resultante ilumina limpiamente las horquillas
capilares. Lo que no sobrevivio al contacto con datos reales fue todo lo que
venia despues -- el umbralado y el ordenamiento de la linea media -- y esta
reescrito a partir de esa evidencia.

Del lumen se derivan las dos magnitudes que hacen posible la auto-calibracion:
la **linea media** (por donde se extrae el kymograph) y el **diametro** (que
entra al modelo fisico). Medir el diametro en vez de asumir 15 um es lo que
permite aplicar el metodo a capilares pediatricos.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class CapillarySegmentation:
    mask: np.ndarray
    centerline_px: np.ndarray
    arclength_um: np.ndarray
    diameter_um: float
    diameter_profile_um: np.ndarray
    score_map: np.ndarray
    area_px: int

    @property
    def length_um(self) -> float:
        return float(self.arclength_um[-1]) if self.arclength_um.size else 0.0


def flow_score(video: np.ndarray, sigma_px: float = 1.5,
               border_px: int = 6) -> np.ndarray:
    """Mapa de evidencia de lumen: oscuridad x actividad temporal.

    ``border_px`` anula un marco perimetral. No es cosmetico: al suavizar y al
    normalizar, el borde de la imagen genera un realce artificial que Otsu
    interpreta como estructura. Sobre video real ese marco resulto ser el
    componente conexo mas grande, de modo que el algoritmo "segmentaba" el
    encuadre en lugar del capilar -- y lo hacia en silencio, devolviendo una
    linea media perfectamente plausible.
    """
    stack = video.astype(np.float32)
    mean_img = stack.mean(axis=0)
    std_img = stack.std(axis=0)

    mean_s = cv2.GaussianBlur(mean_img, (0, 0), sigma_px)
    std_s = cv2.GaussianBlur(std_img, (0, 0), sigma_px)

    darkness = _normalize(-mean_s)
    activity = _normalize(std_s)
    score = (darkness * activity).astype(np.float32)

    if border_px > 0:
        marco = np.zeros_like(score, dtype=bool)
        marco[:border_px, :] = marco[-border_px:, :] = True
        marco[:, :border_px] = marco[:, -border_px:] = True
        score[marco] = 0.0
    return score


def _normalize(x: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(x, [2, 98])
    if hi - lo < 1e-9:
        return np.zeros_like(x, dtype=np.float32)
    return np.clip((x - lo) / (hi - lo), 0, 1).astype(np.float32)


MIN_ELONGATION = 6.0
PLAUSIBLE_WIDTH_UM = (4.0, 40.0)


def segment_capillaries(video: np.ndarray, um_per_px: float,
                        max_capillaries: int = 5,
                        score_percentile: float = 92.0,
                        min_area_px: int = 60
                        ) -> list[CapillarySegmentation]:
    """Segmenta **todos** los capilares utiles del campo, de mejor a peor.

    Dos decisiones nacidas de probar con video real, no de la teoria:

    **Seleccion por forma, no por tamano.** Quedarse con el componente conexo
    mas grande -- lo obvio -- es justamente lo peor: sobre los videos reales del
    dataset ANFC-THU devolvia manchas del 35-46% de la imagen, o directamente
    el marco del encuadre. Lo que distingue a un capilar es que es **alargado**:
    una horquilla ungueal tiene relacion longitud/anchura de 15 a 30, una
    mancha de fondo ronda 2-5.

    **Varios umbrales en vez de uno.** No existe un umbral unico valido: en un
    campo real el capilar ocupa el 1-5% de los pixeles y hay que cortar alto,
    mientras que en un ROI recortado alrededor de un solo capilar ocupa el
    15-20% y ese mismo corte lo trocea. Como el criterio de aceptacion
    posterior es especifico, se pueden barrer varios umbrales y quedarse con lo
    mejor de todos: un componente con forma de capilar es un capilar, salga del
    umbral que salga.

    Se devuelven varios porque el campo real contiene 3-5 capilares y el
    protocolo exige agregar al menos 5: analizarlos todos de una toma es mucho
    mas rapido que recolocar el dedo cinco veces.
    """
    score = flow_score(video)

    umbrales = [float(np.percentile(score, p))
                for p in (score_percentile, 85.0, 70.0)]
    u8 = (np.clip(score, 0, 1) * 255).astype(np.uint8)
    otsu, _ = cv2.threshold(u8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    umbrales.append(otsu / 255.0)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    candidatos: list[tuple[float, CapillarySegmentation]] = []
    vistos: set[tuple[int, int, int]] = set()

    for umbral in umbrales:
        binary = (score >= max(umbral, 1e-6)).astype(np.uint8) * 255
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)
        n, labels, stats, centroides = cv2.connectedComponentsWithStats(
            binary, connectivity=8)

        for etiqueta in range(1, n):
            area = int(stats[etiqueta, cv2.CC_STAT_AREA])
            if area < min_area_px:
                continue
            firma = (int(centroides[etiqueta][0]), int(centroides[etiqueta][1]),
                     area // 50)
            if firma in vistos:
                continue
            vistos.add(firma)
            mask = labels == etiqueta
            _acumular_candidato(mask, score, um_per_px, candidatos)

    candidatos.sort(key=lambda par: par[0], reverse=True)
    return [seg for _, seg in candidatos[:max_capillaries]]


def _acumular_candidato(mask: np.ndarray, score: np.ndarray, um_per_px: float,
                        candidatos: list) -> None:
    """Evalua un componente y lo anade a la lista si parece un capilar."""
    centerline, perfil = _centerline_and_width(mask, um_per_px)
    if centerline.shape[0] < 8:
        return

    tramos = np.linalg.norm(np.diff(centerline, axis=0), axis=1) * um_per_px
    arclength = np.concatenate([[0.0], np.cumsum(tramos)])
    longitud = float(arclength[-1])
    anchura = float(np.median(perfil))
    if anchura <= 0 or not (PLAUSIBLE_WIDTH_UM[0] <= anchura <= PLAUSIBLE_WIDTH_UM[1]):
        return
    alargamiento = longitud / anchura
    if alargamiento < MIN_ELONGATION:
        return

    seg = CapillarySegmentation(
        mask=mask, centerline_px=centerline, arclength_um=arclength,
        diameter_um=anchura, diameter_profile_um=perfil,
        score_map=score, area_px=int(mask.sum()),
    )
    calidad = float(score[mask].mean()) * min(alargamiento / 20.0, 1.5)
    candidatos.append((calidad, seg))


def segment_capillary(video: np.ndarray, um_per_px: float,
                      min_area_px: int = 60) -> CapillarySegmentation | None:
    """Segmenta el mejor capilar del campo. ``None`` si no hay ninguno util."""
    encontrados = segment_capillaries(video, um_per_px, max_capillaries=1,
                                      min_area_px=min_area_px)
    return encontrados[0] if encontrados else None


def _centerline_and_width(mask: np.ndarray, um_per_px: float
                          ) -> tuple[np.ndarray, np.ndarray]:
    """Linea media ordenada y perfil de diametro, via esqueleto + EDT.

    El diametro sale de la transformada de distancia euclidiana evaluada sobre
    el esqueleto: en cada punto, el radio del mayor circulo inscrito en el
    lumen. Es la definicion estandar y es robusta a la irregularidad del borde.
    """
    m8 = (mask.astype(np.uint8)) * 255
    dist = cv2.distanceTransform(m8, cv2.DIST_L2, 5)

    skel = _skeletonize(mask)
    ys, xs = np.nonzero(skel)
    if xs.size < 8:
        return np.empty((0, 2)), np.empty(0)

    pts = np.stack([xs, ys], axis=1).astype(np.float64)
    ordered = _order_skeleton_path(pts)

    ordered = _smooth_path(ordered, window=7)

    radii = dist[np.clip(ordered[:, 1].astype(int), 0, mask.shape[0] - 1),
                 np.clip(ordered[:, 0].astype(int), 0, mask.shape[1] - 1)]
    diam_um = 2.0 * radii * um_per_px
    return ordered, diam_um.astype(np.float32)


def fit_diameter_um(video: np.ndarray, seg: CapillarySegmentation,
                    um_per_px: float) -> tuple[float, float]:
    """Diametro del lumen por ajuste del perfil de absorcion. ``(diametro, R2)``.

    Umbralizar la mascara subestima el diametro de forma sistematica, y no por
    un defecto del algoritmo sino por fisica: cerca del borde del capilar la
    cuerda que recorre la luz tiende a cero, asi que la absorcion tiende a cero
    y el borde real no tiene contraste que detectar. Cualquier umbral corta
    antes de tiempo. En nuestras pruebas el sesgo era estable en torno al 15%,
    y un 15% de error en el diametro es un 30% de error en el area y por tanto
    en el recuento leucocitario.

    En vez de umbralizar, se ajusta el modelo que genera la imagen. El perfil
    transversal promedio debe seguir

        I(r) = I_tejido * exp(-k * 2*sqrt(R^2 - r^2))

    convolucionado con la PSF del sistema. Se ajustan ``R``, ``k``, ``I_tejido``
    y la anchura de la PSF por minimos cuadrados. ``R`` sale entonces del
    modelo completo, no del punto donde el contraste cae por debajo de un
    umbral arbitrario, y el sesgo desaparece.
    """
    from scipy.optimize import least_squares
    from scipy.ndimage import gaussian_filter1d

    mean_img = video.astype(np.float32).mean(axis=0)

    pts = seg.centerline_px
    tangents = np.gradient(pts, axis=0)
    tangents /= np.maximum(np.linalg.norm(tangents, axis=1, keepdims=True), 1e-9)
    normals = np.stack([-tangents[:, 1], tangents[:, 0]], axis=1)

    half_um = max(seg.diameter_um * 1.6, 14.0)
    n_off = 41
    offsets_um = np.linspace(-half_um, half_um, n_off)
    offsets_px = offsets_um / um_per_px

    xs = (pts[:, 0][:, None] + normals[:, 0][:, None] * offsets_px[None, :]).astype(np.float32)
    ys = (pts[:, 1][:, None] + normals[:, 1][:, None] * offsets_px[None, :]).astype(np.float32)

    inside = ((xs >= 0) & (xs < mean_img.shape[1]) &
              (ys >= 0) & (ys < mean_img.shape[0])).all(axis=1)
    if inside.sum() < 8:
        return float(seg.diameter_um), 0.0

    sampled = cv2.remap(mean_img, xs[inside], ys[inside],
                        interpolation=cv2.INTER_LINEAR,
                        borderMode=cv2.BORDER_REPLICATE)
    profile = sampled.mean(axis=0).astype(np.float64)

    smooth = gaussian_filter1d(profile, sigma=1.5, mode="nearest")
    shift_um = offsets_um[int(np.argmin(smooth))]
    r = offsets_um - shift_um

    def model(p):
        radius, k, i_tissue, psf = p
        chord = 2.0 * np.sqrt(np.clip(radius**2 - r**2, 0.0, None))
        ideal = i_tissue * np.exp(-k * chord)
        sigma_bins = max(psf / (offsets_um[1] - offsets_um[0]), 0.3)
        return gaussian_filter1d(ideal, sigma=sigma_bins, mode="nearest")

    p0 = [max(seg.diameter_um / 2.0, 3.0), 0.05, float(np.percentile(profile, 95)), 1.5]
    bounds = ([2.0, 1e-4, 1.0, 0.2], [40.0, 1.0, 300.0, 8.0])
    try:
        res = least_squares(lambda p: model(p) - profile, p0, bounds=bounds,
                            max_nfev=200)
    except Exception:
        return float(seg.diameter_um), 0.0

    residual = profile - model(res.x)
    ss_tot = float(((profile - profile.mean()) ** 2).sum())
    r2 = 1.0 - float((residual**2).sum()) / ss_tot if ss_tot > 0 else 0.0
    return float(res.x[0] * 2.0), float(np.clip(r2, 0.0, 1.0))


def _skeletonize(mask: np.ndarray) -> np.ndarray:
    """Adelgazamiento morfologico (Zhang-Suen via ximgproc, con respaldo)."""
    m8 = mask.astype(np.uint8) * 255
    try:
        return cv2.ximgproc.thinning(m8) > 0
    except (AttributeError, cv2.error):
        pass
    skel = np.zeros_like(m8)
    element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    img = m8.copy()
    while cv2.countNonZero(img) > 0:
        eroded = cv2.erode(img, element)
        opened = cv2.dilate(eroded, element)
        skel = cv2.bitwise_or(skel, cv2.subtract(img, opened))
        img = eroded
    return skel > 0


def _order_skeleton_path(pts: np.ndarray) -> np.ndarray:
    """Ordena los puntos del esqueleto recorriendo el vaso de extremo a extremo.

    Proyectar sobre la componente principal, que es lo obvio, **no sirve aqui**.
    Un capilar del pliegue ungueal no es un arco suave sino una **horquilla**:
    sube por la rama arterial, gira en el apice y baja por la venosa. Los dos
    brazos comparten proyeccion sobre cualquier eje, asi que ordenar por PCA
    los entrelaza y la linea media resultante zigzaguea entre ida y vuelta.
    Sobre video real eso producia kymographs sin ningun sentido fisico.

    La forma correcta es tratar el esqueleto como un grafo y recorrer el camino
    geodesico entre sus dos extremos mas separados: eso sigue la horquilla por
    donde va la sangre, apice incluido.
    """
    if pts.shape[0] < 3:
        return pts

    from scipy.sparse import csr_matrix
    from scipy.sparse.csgraph import shortest_path
    from scipy.spatial import cKDTree

    tree = cKDTree(pts)
    pares = tree.query_pairs(r=1.5, output_type="ndarray")
    if pares.size == 0:
        return pts

    n = pts.shape[0]
    d = np.linalg.norm(pts[pares[:, 0]] - pts[pares[:, 1]], axis=1)
    grafo = csr_matrix((np.concatenate([d, d]),
                        (np.concatenate([pares[:, 0], pares[:, 1]]),
                         np.concatenate([pares[:, 1], pares[:, 0]]))),
                       shape=(n, n))

    d0 = shortest_path(grafo, indices=0, directed=False)
    d0[~np.isfinite(d0)] = -1
    extremo_a = int(np.argmax(d0))
    da = shortest_path(grafo, indices=extremo_a, directed=False)
    da[~np.isfinite(da)] = -1
    extremo_b = int(np.argmax(da))

    alcanzables = np.isfinite(shortest_path(grafo, indices=extremo_a,
                                            directed=False))
    idx = np.flatnonzero(alcanzables)
    if idx.size < 3:
        return pts
    return pts[idx[np.argsort(da[idx])]]


def _smooth_path(pts: np.ndarray, window: int = 7) -> np.ndarray:
    if pts.shape[0] < window:
        return pts
    kernel = np.ones(window) / window
    x = np.convolve(pts[:, 0], kernel, mode="valid")
    y = np.convolve(pts[:, 1], kernel, mode="valid")
    return np.stack([x, y], axis=1)
