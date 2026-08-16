"""Orquestacion de video crudo a resultado de tamizaje.

Dos niveles:

* :func:`analyze_clip` analiza **un capilar** y devuelve su medicion, con el
  control de calidad ya aplicado.
* :func:`analyze_patient` agrega varios capilares en **un resultado por
  paciente**, que es la unidad de decision clinica.

La distincion no es cosmetica. En la cohorte de referencia el AUC de un solo
capilar era 0.68 -- practicamente inservible -- y llegaba a 1.00 con cinco. Un
sistema que emita un diagnostico a partir de un capilar esta mintiendo por
diseno. Por eso :func:`analyze_patient` se niega a concluir por debajo de
:data:`michicheck.optics.MIN_CAPILLARIES_FOR_DECISION` capilares validos y pide mas
captura en su lugar.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import optics
from .vision import (
    detect_events,
    estimate_velocity,
    extract_kymograph,
    motion_rms_px,
    segment_capillary,
    stabilize,
)
from .vision.segment import fit_diameter_um


MIN_VELOCITY_CONFIDENCE = 0.03
MAX_RESIDUAL_MOTION_PX = 5.0
MIN_DIAMETER_FIT_R2 = 0.80
PLAUSIBLE_DIAMETER_UM = (6.0, 30.0)
PLAUSIBLE_VELOCITY_UM_S = (40.0, 2500.0)
MIN_SCANNED_LENGTH_UM = 4000.0
MIN_FPS_FOR_VELOCIMETRY = 55.0


@dataclass
class CapillaryMeasurement:
    """Resultado del analisis de un capilar."""

    n_events: int
    duration_s: float
    velocity_um_s: float
    velocity_confidence: float
    diameter_um: float
    diameter_fit_r2: float
    capillary_length_um: float
    scanned_length_um: float
    motion_rms_px: float
    residual_motion_px: float
    pulsatility: float
    used_velocity_prior: bool
    noise_sigma: float
    mean_gap_width_um: float
    quality_flags: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def usable(self) -> bool:
        """Las advertencias no descartan la medicion; los flags si."""
        return not self.quality_flags

    @property
    def events_per_min(self) -> float:
        if self.duration_s <= 0:
            return float("nan")
        return self.n_events * 60.0 / self.duration_s

    @property
    def calibration(self) -> optics.CapillaryCalibration:
        return optics.CapillaryCalibration(
            velocity_um_s=self.velocity_um_s,
            diameter_um=self.diameter_um,
            observed_seconds=self.duration_s,
            n_events=self.n_events,
        )

    @property
    def wbc_per_ul(self) -> float:
        return self.calibration.wbc_per_ul


@dataclass
class ScreeningResult:
    """Resultado por paciente, listo para el motor de triaje."""

    anc_estimate: float
    anc_ci_low: float
    anc_ci_high: float
    band: str
    wbc_estimate: float
    n_capillaries_used: int
    n_capillaries_attempted: int
    total_events: int
    sampled_volume_nl: float
    mean_velocity_um_s: float
    mean_diameter_um: float
    age_years: float
    neutrophil_fraction_used: float
    conclusive: bool
    reasons: list[str] = field(default_factory=list)
    measurements: list[CapillaryMeasurement] = field(default_factory=list)

    @property
    def probability_severe(self) -> float:
        """Probabilidad de ANC < 500 a partir del intervalo de Poisson.

        Estimacion puramente fisica, sin modelo entrenado: sirve de linea base
        y de respaldo si el clasificador no esta disponible. El modelo
        calibrado de :mod:`michicheck.model` la sustituye cuando existe.
        """
        if not np.isfinite(self.anc_estimate) or self.anc_estimate <= 0:
            return float("nan")
        if self.total_events <= 0:
            return 1.0
        sigma_log = 1.0 / np.sqrt(self.total_events)
        z = (np.log(optics.SEVERE_NEUTROPENIA_ANC) - np.log(self.anc_estimate)) / sigma_log
        from scipy.stats import norm
        return float(norm.cdf(z))


def analyze_clip(video: np.ndarray, um_per_px: float, fps: float,
                 n_sigma: float = 3.5,
                 prior_velocity_um_s: float | None = None
                 ) -> CapillaryMeasurement | None:
    """Analiza el clip de un capilar. ``None`` si no se pudo segmentar nada.

    ``prior_velocity_um_s`` es la velocidad basal del paciente, medida en un
    control previo con hemograma. Se usa solo si la velocimetria del video no
    alcanza confianza suficiente.
    """
    stabilized, shifts, residual = stabilize(video)
    motion = motion_rms_px(shifts)

    seg = segment_capillary(stabilized, um_per_px)
    if seg is None:
        return None

    diameter_um, diam_r2 = fit_diameter_um(stabilized, seg, um_per_px)
    if diam_r2 < MIN_DIAMETER_FIT_R2:
        diameter_um = seg.diameter_um

    kymo = extract_kymograph(stabilized, seg, um_per_px, fps)
    vel = estimate_velocity(kymo, prior_velocity_um_s=prior_velocity_um_s)
    if not np.isfinite(vel.velocity_um_s):
        return None

    det = detect_events(kymo, vel, n_sigma=n_sigma)

    flags: list[str] = []
    warnings: list[str] = []

    if fps < MIN_FPS_FOR_VELOCIMETRY and prior_velocity_um_s is None:
        flags.append("fps_insuficiente")
    if vel.used_prior:
        warnings.append("velocidad_tomada_de_basal")
    elif vel.confidence < MIN_VELOCITY_CONFIDENCE:
        if prior_velocity_um_s is None:
            flags.append("flujo_no_medible_sin_basal")
        else:
            warnings.append("flujo_de_baja_confianza")
    if residual > MAX_RESIDUAL_MOTION_PX:
        flags.append("movimiento_no_corregido")
    if not (PLAUSIBLE_DIAMETER_UM[0] <= diameter_um <= PLAUSIBLE_DIAMETER_UM[1]):
        flags.append("diametro_implausible")
    if not (PLAUSIBLE_VELOCITY_UM_S[0] <= vel.velocity_um_s <= PLAUSIBLE_VELOCITY_UM_S[1]):
        flags.append("velocidad_implausible")
    if det.projection.scanned_length_um < MIN_SCANNED_LENGTH_UM:
        flags.append("columna_insuficiente")

    return CapillaryMeasurement(
        n_events=det.n_events,
        duration_s=kymo.duration_s,
        velocity_um_s=float(vel.velocity_um_s),
        velocity_confidence=float(vel.confidence),
        diameter_um=float(diameter_um),
        diameter_fit_r2=float(diam_r2),
        capillary_length_um=float(seg.length_um),
        scanned_length_um=float(det.projection.scanned_length_um),
        motion_rms_px=float(motion),
        residual_motion_px=float(residual),
        pulsatility=float(vel.pulsatility),
        used_velocity_prior=bool(vel.used_prior),
        noise_sigma=float(det.noise_sigma),
        mean_gap_width_um=float(det.mean_gap_width_um),
        quality_flags=flags,
        warnings=warnings,
    )


def aggregate(measurements: list[CapillaryMeasurement], age_years: float,
              patient_neutrophil_fraction: float | None = None,
              min_capillaries: int = optics.MIN_CAPILLARIES_FOR_DECISION,
              ) -> ScreeningResult:
    """Combina las mediciones de varios capilares en un resultado de paciente."""
    usable = [m for m in measurements if m.usable]
    reasons: list[str] = []

    frac = (patient_neutrophil_fraction
            if patient_neutrophil_fraction is not None
            else optics.neutrophil_fraction_for_age(age_years))

    if not usable:
        reasons.append("ningun_capilar_valido")
        return ScreeningResult(
            anc_estimate=float("nan"), anc_ci_low=float("nan"),
            anc_ci_high=float("nan"), band="indeterminado",
            wbc_estimate=float("nan"), n_capillaries_used=0,
            n_capillaries_attempted=len(measurements), total_events=0,
            sampled_volume_nl=0.0, mean_velocity_um_s=float("nan"),
            mean_diameter_um=float("nan"), age_years=age_years,
            neutrophil_fraction_used=frac, conclusive=False,
            reasons=reasons, measurements=measurements,
        )

    calibrations = [m.calibration for m in usable]
    wbc, volume_nl = optics.pooled_wbc_estimate(calibrations)
    total_events = int(sum(m.n_events for m in usable))

    anc = optics.anc_from_wbc(wbc, age_years, patient_neutrophil_fraction)
    anclado = patient_neutrophil_fraction is not None
    lo_mult, hi_mult = optics.combined_relative_ci(
        total_events, anchored_to_patient_cbc=anclado)

    conclusive = True
    if len(usable) < min_capillaries:
        reasons.append(
            f"capilares_insuficientes ({len(usable)}/{min_capillaries})")
        conclusive = False
    if total_events == 0:
        reasons.append("cero_eventos_detectados")

    return ScreeningResult(
        anc_estimate=float(anc),
        anc_ci_low=float(anc * lo_mult),
        anc_ci_high=float(anc * hi_mult),
        band=optics.anc_band(anc),
        wbc_estimate=float(wbc),
        n_capillaries_used=len(usable),
        n_capillaries_attempted=len(measurements),
        total_events=total_events,
        sampled_volume_nl=float(volume_nl),
        mean_velocity_um_s=float(np.mean([m.velocity_um_s for m in usable])),
        mean_diameter_um=float(np.mean([m.diameter_um for m in usable])),
        age_years=float(age_years),
        neutrophil_fraction_used=float(frac),
        conclusive=conclusive,
        reasons=reasons,
        measurements=measurements,
    )


def analyze_patient(clips: list[np.ndarray], um_per_px: float, fps: float,
                    age_years: float,
                    patient_neutrophil_fraction: float | None = None,
                    prior_velocity_um_s: float | None = None,
                    ) -> ScreeningResult:
    """Pipeline completo: lista de clips de capilares -> resultado de paciente."""
    measurements = []
    for clip in clips:
        m = analyze_clip(clip, um_per_px, fps,
                         prior_velocity_um_s=prior_velocity_um_s)
        if m is not None:
            measurements.append(m)
    return aggregate(measurements, age_years, patient_neutrophil_fraction)
