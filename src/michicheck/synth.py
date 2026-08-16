"""Simulador fisico de videocapilaroscopia ungueal.

Por que existe
--------------
Las bases de la hackaton prohiben expresamente el uso de datos personales
reales o la intervencion directa con pacientes. Al mismo tiempo, un tamizaje
clinico no se puede sustentar en "confien en nosotros". Este modulo resuelve
las dos cosas: genera video capilaroscopico *etiquetado por construccion*, con
ANC conocido, a partir de primeros principios opticos. Con el se entrena, se
valida y se estresa el pipeline completo antes de tocar un solo paciente.

Cuando el INSNSB autorice la captura de video real, el mismo pipeline se
reajusta con datos reales; el sintetico pasa entonces a ser el banco de pruebas
de regresion (casos raros, movimiento extremo, capilares malos).

Modelo de formacion de imagen
-----------------------------
1. **Contenido del lumen.** Los eritrocitos circulan en fila india. Se modela
   una "cinta" 1D de ocupacion eritrocitaria en coordenada material, con
   celulas de ~8 um separadas por plasma. Los leucocitos se insertan como
   *huecos* (ocupacion 0) de longitud lognormal (mediana ~30 um), en posiciones
   de un proceso de Poisson cuya tasa sale directamente de
   :func:`michicheck.optics.event_rate_from_wbc`.
2. **Transporte.** En el instante ``t`` el punto de arco ``s`` contiene el
   material que estaba en ``s - D(t)``, con ``D(t) = int v(tau) dtau``. La
   velocidad es pulsatil: ``v(t) = v0 (1 + a sin(2 pi f_card t))``, con
   frecuencia cardiaca propia de la edad.
3. **Absorcion (Beer-Lambert).** El capilar es un cilindro de diametro ``d``.
   Un rayo que entra a distancia radial ``r`` del eje recorre una cuerda
   ``L(r) = 2 sqrt(R^2 - r^2)``. La transmitancia es ``exp(-mu * occ * L(r))``.
   De ahi salen solos el centro mas oscuro del capilar y los bordes difusos.
   El valor de ``mu`` **no es una constante**: lo fija la longitud de onda, la
   geometria de iluminacion y el fototipo de piel del paciente, y se calcula en
   :mod:`michicheck.illumination`. Cambiar de 420 nm directo a 530 nm oblicuo altera
   el contraste en un factor grande, asi que fijarlo seria invalidar cualquier
   conclusion sobre el prototipo real.
4. **Camara.** Desenfoque gaussiano (difraccion + foco), vineteado, deriva
   lenta de iluminacion, temblor de mano como proceso de Ornstein-Uhlenbeck,
   ruido de fotones (Poisson) y ruido de lectura (gaussiano).

Todos los parametros son de dominio publico y estan documentados; nada aqui
depende de datos institucionales.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

import numpy as np
from scipy.ndimage import gaussian_filter1d

from .optics import (
    REFERENCE_DIAMETER_UM,
    REFERENCE_VELOCITY_UM_S,
    anc_from_wbc,
    capillary_flow_um3_s,
    neutrophil_fraction_for_age,
)


MU_BLOOD_420NM_PER_UM = 0.1

RBC_LENGTH_UM = 8.0
RBC_GAP_UM = 2.0


@dataclass(frozen=True)
class OpticalSetup:
    """Parametros del sistema de captura."""

    um_per_px: float = 1.0625
    fps: float = 60.0
    duration_s: float = 30.0
    blur_um: float = 2.6
    read_noise: float = 2.5
    photon_scale: float = 900.0
    tremor_um: float = 3.0
    tremor_tau_s: float = 0.35
    vignetting: float = 0.25
    illumination_drift: float = 0.04

    wavelength_nm: float = 530.0
    oblique: bool = True
    phototype: str = "IV"
    oblique_gain: float = 4.0

    @property
    def n_frames(self) -> int:
        return int(round(self.duration_s * self.fps))

    @property
    def mu_effective_per_um(self) -> float:
        """Absorcion efectiva que produce el contraste del gap.

        Se deriva del contraste esperable para la longitud de onda y la
        geometria, no de una constante fija: cambiar de 420 nm directo a 530 nm
        oblicuo altera el contraste en un factor grande, y el simulador tiene
        que reflejarlo o las conclusiones no valen para el prototipo real.
        """
        from .illumination import illumination_budget

        budget = illumination_budget(self.wavelength_nm, self.phototype,
                                     capillary_diameter_um=15.0,
                                     oblique=self.oblique,
                                     oblique_gain=self.oblique_gain)
        contrast = float(np.clip(budget.lumen_contrast, 1e-4, 0.95))
        return float(-np.log(1.0 - contrast) / 15.0)

    @property
    def effective_photon_scale(self) -> float:
        """Fotones utiles tras la atenuacion de la epidermis.

        La melanina no reduce el contraste relativo pero si el numero de
        fotones, y por tanto empeora el ruido. Modelarlo por separado del
        contraste es lo que permite ver el efecto real sobre la deteccion.
        """
        from .illumination import epidermal_transmission

        t = epidermal_transmission(self.wavelength_nm, self.phototype)
        return float(self.photon_scale * t)


@dataclass(frozen=True)
class CapillaryState:
    """Morfologia y hemodinamica de un capilar concreto."""

    diameter_um: float = REFERENCE_DIAMETER_UM
    velocity_um_s: float = REFERENCE_VELOCITY_UM_S
    visible_length_um: float = 180.0
    curvature: float = 0.15
    orientation_deg: float = 12.0
    pulsatility: float = 0.25


@dataclass(frozen=True)
class PatientState:
    """Estado del paciente que determina la verdad-terreno."""

    age_years: float = 6.0
    anc_per_ul: float = 1800.0
    neutrophil_fraction: float | None = None
    heart_rate_bpm: float | None = None

    @property
    def effective_neutrophil_fraction(self) -> float:
        if self.neutrophil_fraction is not None:
            return float(self.neutrophil_fraction)
        return neutrophil_fraction_for_age(self.age_years)

    @property
    def wbc_per_ul(self) -> float:
        """Leucocitos totales: lo que el metodo optico realmente cuenta."""
        return self.anc_per_ul / max(self.effective_neutrophil_fraction, 1e-6)

    @property
    def effective_heart_rate_bpm(self) -> float:
        if self.heart_rate_bpm is not None:
            return float(self.heart_rate_bpm)
        return float(np.interp(self.age_years, [0, 1, 3, 6, 10, 14, 18],
                               [130, 120, 105, 95, 85, 78, 72]))


@dataclass
class SyntheticCapture:
    """Una captura sintetica con su verdad-terreno."""

    video: np.ndarray | None
    kymograph: np.ndarray | None
    patient: PatientState
    capillary: CapillaryState
    setup: OpticalSetup
    event_material_pos_um: np.ndarray
    event_gap_len_um: np.ndarray
    displacement_um: np.ndarray
    pattern_offset_um: float
    tremor_px: np.ndarray
    seed: int


    @property
    def n_events_visible(self) -> int:
        """Leucocitos que efectivamente cruzaron el segmento visible."""
        return int(self.visible_event_frames().shape[0])

    def visible_event_frames(self) -> np.ndarray:
        """Frame en que cada leucocito entra al campo visible.

        Un punto del patron en ``p`` esta, en el instante ``t``, en la posicion
        de laboratorio ``s = p - offset + D(t)``. Es visible mientras
        ``0 <= s <= L``. Solo se cuentan los eventos que llegan a verse.
        """
        L = self.capillary.visible_length_um
        out = []
        for p in self.event_material_pos_um:
            s = p - self.pattern_offset_um + self.displacement_um
            inside = np.flatnonzero((s >= 0) & (s <= L))
            if inside.size:
                out.append(int(inside[0]))
        return np.array(sorted(out), dtype=int)

    def event_time_position(self) -> list[tuple[float, float]]:
        """Trayectoria de verdad-terreno: ``(t_segundos, s_um)`` de cada evento
        en el momento en que entra al campo. Sirve para evaluar el detector."""
        L = self.capillary.visible_length_um
        out: list[tuple[float, float]] = []
        for p in self.event_material_pos_um:
            s = p - self.pattern_offset_um + self.displacement_um
            inside = np.flatnonzero((s >= 0) & (s <= L))
            if inside.size:
                f = int(inside[0])
                out.append((f / self.setup.fps, float(s[f])))
        return sorted(out)

    @property
    def true_event_rate_per_min(self) -> float:
        """Tasa observada de eventos por capilar y por minuto."""
        return self.n_events_visible * 60.0 / self.setup.duration_s

    @property
    def true_anc(self) -> float:
        return self.patient.anc_per_ul

    @property
    def is_severe_neutropenia(self) -> bool:
        return self.patient.anc_per_ul < 500.0


def _build_lumen_pattern(
    total_length_um: float,
    wbc_per_ul: float,
    diameter_um: float,
    rng: np.random.Generator,
    ds_um: float = 0.5,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Cinta 1D de ocupacion eritrocitaria en coordenada material.

    Devuelve ``(ocupacion, posiciones_evento_um, longitudes_gap_um)``.
    """
    n = int(np.ceil(total_length_um / ds_um)) + 1
    occ = np.zeros(n, dtype=np.float32)

    pos = 0.0
    period = RBC_LENGTH_UM + RBC_GAP_UM
    while pos < total_length_um:
        length = max(4.0, rng.normal(RBC_LENGTH_UM, 0.8))
        i0 = int(pos / ds_um)
        i1 = int(min(pos + length, total_length_um) / ds_um)
        occ[i0:i1] = 1.0
        pos += max(2.0, rng.normal(period, 1.2))

    corr_len_um = 110.0
    smooth_sigma = corr_len_um / ds_um / 2.355
    density_wave = gaussian_filter1d(
        rng.normal(0.0, 1.0, size=n).astype(np.float32), sigma=smooth_sigma,
        mode="wrap",
    )
    density_wave /= max(float(np.std(density_wave)), 1e-6)
    occ *= np.clip(1.0 + 0.25 * density_wave, 0.35, 1.0)

    area_um2 = np.pi * (diameter_um / 2.0) ** 2
    rate_per_um = wbc_per_ul * area_um2 * 1e-9
    expected = rate_per_um * total_length_um
    n_events = rng.poisson(max(expected, 0.0))

    event_pos = np.sort(rng.uniform(0, total_length_um, size=n_events))
    gap_len = rng.lognormal(mean=np.log(30.0), sigma=0.35, size=n_events)
    gap_len = np.clip(gap_len, 12.0, 90.0)

    for p, g in zip(event_pos, gap_len):
        i0 = int(p / ds_um)
        i1 = int(min(p + g, total_length_um) / ds_um)
        occ[i0:i1] = 0.0

    return occ, event_pos, gap_len


def _displacement(setup: OpticalSetup, cap: CapillaryState,
                  patient: PatientState) -> np.ndarray:
    """D(t): desplazamiento acumulado del material, con pulso cardiaco."""
    t = np.arange(setup.n_frames) / setup.fps
    f_card = patient.effective_heart_rate_bpm / 60.0
    v = cap.velocity_um_s * (1.0 + cap.pulsatility * np.sin(2 * np.pi * f_card * t))
    v = np.maximum(v, 0.05 * cap.velocity_um_s)
    return np.cumsum(v) / setup.fps


def _centerline(cap: CapillaryState, setup: OpticalSetup,
                shape: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    """Puntos de la linea media en pixeles y su coordenada de arco en um."""
    h, w = shape
    n = max(64, int(cap.visible_length_um / setup.um_per_px))
    s = np.linspace(0.0, cap.visible_length_um, n)

    u = s / max(cap.visible_length_um, 1e-6)
    lateral = cap.curvature * cap.visible_length_um * (u - 0.5) ** 2
    lateral = lateral - lateral.mean()

    theta = np.deg2rad(cap.orientation_deg)
    x_um = s * np.cos(theta) - lateral * np.sin(theta)
    y_um = s * np.sin(theta) + lateral * np.cos(theta)

    x_px = x_um / setup.um_per_px
    y_px = y_um / setup.um_per_px
    x_px = x_px - x_px.mean() + w / 2.0
    y_px = y_px - y_px.mean() + h / 2.0
    return np.stack([x_px, y_px], axis=1), s


def _geometry_maps(centerline_px: np.ndarray, arclen_um: np.ndarray,
                   shape: tuple[int, int], um_per_px: float
                   ) -> tuple[np.ndarray, np.ndarray]:
    """Mapea cada pixel a (arco s en um, distancia radial r en um)."""
    from scipy.spatial import cKDTree

    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w]
    pts = np.stack([xx.ravel(), yy.ravel()], axis=1).astype(np.float64)

    tree = cKDTree(centerline_px)
    dist_px, idx = tree.query(pts, k=1)

    s_map = arclen_um[idx].reshape(h, w).astype(np.float32)
    r_map = (dist_px * um_per_px).reshape(h, w).astype(np.float32)
    return s_map, r_map


def _chord_length(r_map: np.ndarray, diameter_um: float) -> np.ndarray:
    """Cuerda recorrida dentro del cilindro a distancia radial r."""
    R = diameter_um / 2.0
    inside = np.clip(R**2 - r_map**2, 0.0, None)
    return 2.0 * np.sqrt(inside)


def _tissue_background(shape: tuple[int, int], setup: OpticalSetup,
                       rng: np.random.Generator) -> np.ndarray:
    """Fondo dermico: brillante, con vineteado y textura multiescala.

    La textura no es decorativa. El estabilizador necesita anclarse a algo que
    se mueva solidariamente con el dedo, y dentro del campo lo unico que tiene
    contraste ademas del tejido es la sangre, que se mueve por su cuenta. Un
    fondo liso deja al registro sin referencia y hace que persiga al flujo.

    La piel del lecho ungueal real si tiene estructura en varias escalas: el
    plexo venoso subpapilar (cientos de um), los dermatoglifos (decenas) y el
    granulado de la superficie (unidades). Se reproducen las tres.
    """
    from scipy.ndimage import gaussian_filter

    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w]
    cy, cx = (h - 1) / 2.0, (w - 1) / 2.0
    rad = np.sqrt(((yy - cy) / max(cy, 1)) ** 2 + ((xx - cx) / max(cx, 1)) ** 2)
    vig = 1.0 - setup.vignetting * np.clip(rad, 0, 1.5) ** 2

    texture = np.zeros((h, w), dtype=np.float64)
    for sigma_px, amplitude in (
        (max(h, w) / 12.0, 0.10),
        (8.0, 0.06),
        (2.0, 0.035),
    ):
        layer = gaussian_filter(rng.normal(0, 1, size=(h, w)), sigma=sigma_px)
        layer /= max(float(np.abs(layer).max()), 1e-9)
        texture += amplitude * layer

    return (vig * (1.0 + texture)).astype(np.float32)


def render_capture(
    patient: PatientState,
    capillary: CapillaryState | None = None,
    setup: OpticalSetup | None = None,
    shape: tuple[int, int] = (72, 200),
    seed: int = 0,
    with_video: bool = True,
) -> SyntheticCapture:
    """Genera una captura sintetica completa de un capilar.

    ``shape`` es el ROI en pixeles (alto, ancho), como los ROI rectangulares
    que el estudio de referencia define alrededor de cada capilar.
    """
    from scipy.ndimage import gaussian_filter1d

    rng = np.random.default_rng(seed)
    capillary = capillary or CapillaryState()
    setup = setup or OpticalSetup()

    mu_eff = setup.mu_effective_per_um
    photon_scale = setup.effective_photon_scale

    disp = _displacement(setup, capillary, patient)
    margin_um = 150.0
    pattern_offset_um = float(disp[-1] + margin_um)
    total_material_um = float(
        pattern_offset_um + capillary.visible_length_um + margin_um
    )

    ds_um = 0.5
    occ, ev_pos, ev_gap = _build_lumen_pattern(
        total_material_um, patient.wbc_per_ul, capillary.diameter_um, rng, ds_um
    )

    pad = int(np.ceil(4.0 * setup.tremor_um / setup.um_per_px)) + 4
    padded_shape = (shape[0] + 2 * pad, shape[1] + 2 * pad)

    centerline, arclen = _centerline(capillary, setup, padded_shape)
    s_map, r_map = _geometry_maps(centerline, arclen, padded_shape, setup.um_per_px)
    chord = _chord_length(r_map, capillary.diameter_um)
    lumen_mask = chord > 0
    background = _tissue_background(padded_shape, setup, rng)

    alpha = float(np.exp(-1.0 / (setup.tremor_tau_s * setup.fps)))
    noise_scale = setup.tremor_um * np.sqrt(1 - alpha**2)
    tremor = np.zeros((setup.n_frames, 2))
    for i in range(1, setup.n_frames):
        tremor[i] = alpha * tremor[i - 1] + rng.normal(0, noise_scale, 2)
    tremor_px = tremor / setup.um_per_px

    drift = 1.0 + setup.illumination_drift * gaussian_filter1d(
        rng.normal(0, 1, setup.n_frames), sigma=setup.fps * 2.0
    )

    sigma_px = setup.blur_um / setup.um_per_px / 2.355

    video = np.zeros((setup.n_frames, *shape), dtype=np.uint8) if with_video else None
    kymo = np.zeros((setup.n_frames, arclen.size), dtype=np.float32)

    r_grid = np.linspace(-capillary.diameter_um / 2, capillary.diameter_um / 2, 9)
    chord_grid = _chord_length(np.abs(r_grid), capillary.diameter_um)

    from scipy.ndimage import gaussian_filter, shift as ndshift

    occ_n = occ.size
    for t in range(setup.n_frames):
        idx_map = ((s_map - disp[t] + pattern_offset_um) / ds_um)
        idx_line = ((arclen - disp[t] + pattern_offset_um) / ds_um)

        occ_line = _sample_pattern(occ, idx_line, occ_n)

        trans = np.exp(-mu_eff * occ_line[:, None] * chord_grid[None, :])
        kymo[t] = trans.mean(axis=1) * drift[t]

        if not with_video:
            continue

        occ_img = _sample_pattern(occ, idx_map.ravel(), occ_n).reshape(padded_shape)
        transmit = np.exp(-mu_eff * occ_img * chord)
        frame = background * drift[t] * np.where(lumen_mask, transmit, 1.0)

        frame = gaussian_filter(frame, sigma=sigma_px, mode="nearest")
        frame = ndshift(frame, shift=(tremor_px[t, 1], tremor_px[t, 0]),
                        order=1, mode="nearest")
        frame = frame[pad:pad + shape[0], pad:pad + shape[1]]

        level = np.clip(frame, 0, None) * 0.78 * 255.0
        photons = np.clip(level / 255.0 * photon_scale, 0, None)
        noisy = rng.poisson(photons) / photon_scale * 255.0
        noisy = noisy + rng.normal(0, setup.read_noise, size=shape)
        video[t] = np.clip(noisy, 0, 255).astype(np.uint8)

    kymo = kymo + rng.normal(0, 0.012, size=kymo.shape).astype(np.float32)
    kymo = np.clip(kymo, 0.0, 1.5)

    return SyntheticCapture(
        video=video,
        kymograph=kymo,
        patient=patient,
        capillary=capillary,
        setup=setup,
        event_material_pos_um=ev_pos,
        event_gap_len_um=ev_gap,
        displacement_um=disp,
        pattern_offset_um=pattern_offset_um,
        tremor_px=tremor_px,
        seed=seed,
    )


def _sample_pattern(pattern: np.ndarray, idx: np.ndarray, n: int) -> np.ndarray:
    """Muestreo lineal del patron material con recorte en los bordes."""
    idx = np.clip(idx, 0, n - 2)
    i0 = idx.astype(np.int64)
    frac = (idx - i0).astype(np.float32)
    return pattern[i0] * (1 - frac) + pattern[i0 + 1] * frac


@dataclass
class CohortSpec:
    """Especificacion de una cohorte sintetica con aleatorizacion de dominio.

    Los rangos cubren deliberadamente condiciones de posta rural: capilares
    finos y anchos, flujo lento y rapido, mas o menos temblor, y toda la escala
    de ANC relevante en LLA pediatrica.
    """

    n_samples: int = 400
    age_range: tuple[float, float] = (1.0, 17.0)
    log_anc_range: tuple[float, float] = (np.log(60.0), np.log(6000.0))
    diameter_range: tuple[float, float] = (9.0, 21.0)
    velocity_range: tuple[float, float] = (350.0, 1400.0)
    visible_length_range: tuple[float, float] = (120.0, 260.0)
    duration_s: float = 30.0
    tremor_range: tuple[float, float] = (1.5, 8.0)
    photon_scale_range: tuple[float, float] = (350.0, 1500.0)
    blur_range: tuple[float, float] = (2.0, 6.0)
    capillaries_per_patient: int = 5
    seed: int = 20260812


def iter_cohort(spec: CohortSpec, with_video: bool = False
                ) -> Iterator[list[SyntheticCapture]]:
    """Genera pacientes; cada uno aporta ``capillaries_per_patient`` capturas.

    Agrupar por paciente es esencial: el estudio de referencia mostro que el
    AUC sube de 0.68 con un capilar a 1.00 con cinco. La unidad de decision es
    el paciente, no el capilar, y la validacion debe respetar esa agrupacion.
    """
    rng = np.random.default_rng(spec.seed)
    for i in range(spec.n_samples):
        age = float(rng.uniform(*spec.age_range))
        anc = float(np.exp(rng.uniform(*spec.log_anc_range)))
        patient = PatientState(age_years=age, anc_per_ul=anc)

        setup = OpticalSetup(
            duration_s=spec.duration_s,
            tremor_um=float(rng.uniform(*spec.tremor_range)),
            photon_scale=float(rng.uniform(*spec.photon_scale_range)),
            blur_um=float(rng.uniform(*spec.blur_range)),
        )
        d0 = float(rng.uniform(*spec.diameter_range))
        v0 = float(rng.uniform(*spec.velocity_range))

        captures = []
        for k in range(spec.capillaries_per_patient):
            cap = CapillaryState(
                diameter_um=float(np.clip(rng.normal(d0, 1.2), 7.0, 25.0)),
                velocity_um_s=float(np.clip(rng.normal(v0, v0 * 0.15), 150.0, 2000.0)),
                visible_length_um=float(rng.uniform(*spec.visible_length_range)),
                curvature=float(rng.uniform(0.0, 0.35)),
                orientation_deg=float(rng.uniform(-25, 25)),
            )
            captures.append(
                render_capture(patient, cap, setup,
                               seed=int(rng.integers(0, 2**31 - 1)),
                               with_video=with_video)
            )
        yield captures
