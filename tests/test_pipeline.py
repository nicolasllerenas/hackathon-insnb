"""Tests del pipeline de vision y del triaje sobre video sintetico.

Se usan clips cortos para que la suite corra en menos de un minuto; las
verificaciones de exactitud fina viven en el notebook, que trabaja con la
cohorte completa.
"""

from __future__ import annotations

import numpy as np
import pytest

from michicheck.pipeline import aggregate, analyze_clip
from michicheck.synth import (
    CapillaryState,
    OpticalSetup,
    PatientState,
    render_capture,
)
from michicheck.triage import ClinicalContext, RiskLevel, triage
from michicheck.vision import segment_capillary, stabilize
from michicheck.vision.segment import fit_diameter_um


@pytest.fixture(scope="module")
def setup():
    return OpticalSetup(duration_s=8.0, fps=60.0)


class TestSimulador:
    def test_la_tasa_simulada_sigue_al_modelo_fisico(self):
        """El simulador no puede contradecir a la fisica que dice implementar."""
        from michicheck.optics import event_rate_from_wbc

        st = OpticalSetup(duration_s=60.0)
        cap = CapillaryState()
        paciente = PatientState(age_years=8, anc_per_ul=2000)
        esperada = event_rate_from_wbc(paciente.wbc_per_ul,
                                       cap.velocity_um_s, cap.diameter_um)
        tasas = [render_capture(paciente, cap, st, seed=s, with_video=False)
                 .true_event_rate_per_min for s in range(25)]
        assert np.mean(tasas) == pytest.approx(esperada, rel=0.15)

    def test_menos_neutrofilos_producen_menos_gaps(self, setup):
        alto = render_capture(PatientState(8, 4000), CapillaryState(), setup,
                              seed=1, with_video=False)
        bajo = render_capture(PatientState(8, 200), CapillaryState(), setup,
                              seed=1, with_video=False)
        assert alto.n_events_visible > bajo.n_events_visible

    def test_a_igual_anc_el_nino_pequeno_tiene_mas_leucocitos(self):
        """Consecuencia del predominio linfocitario: mismo ANC, mas gaps."""
        joven = PatientState(age_years=2, anc_per_ul=500)
        mayor = PatientState(age_years=16, anc_per_ul=500)
        assert joven.wbc_per_ul > mayor.wbc_per_ul * 1.5


class TestVision:
    def test_la_estabilizacion_reduce_el_movimiento(self):
        st = OpticalSetup(duration_s=5.0, tremor_um=6.0)
        cap = render_capture(PatientState(8, 2000), CapillaryState(), st,
                             seed=2, with_video=True)
        _, shifts, residual = stabilize(cap.video)
        bruto = np.sqrt((( shifts - shifts.mean(0)) ** 2).sum(1).mean())
        assert residual < bruto

    def test_el_ajuste_del_perfil_corrige_el_sesgo_del_umbral(self, setup):
        """El umbral subestima el diametro ~15%; el ajuste no.

        Importa porque el diametro entra al cuadrado: un 15% de sesgo son
        ~25% de error en el recuento leucocitario.
        """
        sesgos_umbral, sesgos_ajuste = [], []
        for d in (10.0, 15.0, 20.0):
            cap = render_capture(PatientState(8, 2000),
                                 CapillaryState(diameter_um=d), setup,
                                 seed=3, with_video=True)
            video, _, _ = stabilize(cap.video)
            seg = segment_capillary(video, setup.um_per_px)
            assert seg is not None
            ajustado, r2 = fit_diameter_um(video, seg, setup.um_per_px)
            sesgos_umbral.append(seg.diameter_um / d)
            sesgos_ajuste.append(ajustado / d)
            assert r2 > 0.85

        assert np.mean(sesgos_umbral) < 0.95
        assert abs(np.mean(sesgos_ajuste) - 1.0) < 0.10


class TestDeteccion:
    def test_sin_leucocitos_no_debe_haber_falsos_positivos(self, setup):
        """El test mas importante del detector.

        Un piso de falsos positivos con ANC cero impide distinguir la
        neutropenia profunda de la grave, y ademas empuja el error hacia el
        lado peligroso: hace parecer sano a quien no lo esta.
        """
        total = 0
        for s in range(4):
            cap = render_capture(PatientState(8, 0.1), CapillaryState(),
                                 setup, seed=s, with_video=True)
            m = analyze_clip(cap.video, setup.um_per_px, setup.fps,
                             prior_velocity_um_s=800.0)
            if m is not None:
                total += m.n_events
        assert total <= 1, f"{total} eventos detectados sin leucocitos"

    def test_el_recuento_ordena_correctamente_a_los_pacientes(self, setup):
        estimaciones = []
        for anc in (3000.0, 800.0, 200.0):
            mediciones = []
            for k in range(3):
                cap = render_capture(PatientState(7, anc),
                                     CapillaryState(), setup,
                                     seed=50 + k, with_video=True)
                m = analyze_clip(cap.video, setup.um_per_px, setup.fps,
                                 prior_velocity_um_s=800.0)
                if m is not None:
                    mediciones.append(m)
            estimaciones.append(aggregate(mediciones, 7.0).anc_estimate)
        assert estimaciones[0] > estimaciones[1] > estimaciones[2]


class TestAgregacionYTriaje:
    def test_no_concluye_con_pocos_capilares(self):
        """Con un capilar el AUC de referencia era 0.68: no basta para decidir."""
        from michicheck.pipeline import CapillaryMeasurement

        una = CapillaryMeasurement(
            n_events=5, duration_s=60.0, velocity_um_s=800.0,
            velocity_confidence=0.5, diameter_um=15.0, diameter_fit_r2=0.95,
            capillary_length_um=180.0, scanned_length_um=48000.0,
            motion_rms_px=1.0, residual_motion_px=0.5, pulsatility=0.2,
            used_velocity_prior=False, noise_sigma=0.01, mean_gap_width_um=30.0,
        )
        resultado = aggregate([una], age_years=7.0)
        assert not resultado.conclusive
        assert any("capilares_insuficientes" in r for r in resultado.reasons)

    def test_la_fiebre_escala_pero_nunca_rebaja(self):
        from michicheck.pipeline import ScreeningResult

        def resultado(anc, lo, hi, concluyente=True, razones=None):
            return ScreeningResult(anc, lo, hi, "x", anc / 0.5, 5, 5, 20, 0.35,
                                   800.0, 14.0, 6.0, 0.5, concluyente,
                                   razones or [], [])

        sin_fiebre = triage(resultado(420, 280, 640), ClinicalContext(6))
        con_fiebre = triage(resultado(420, 280, 640),
                            ClinicalContext(6, temperature_c=38.6))
        assert sin_fiebre.level is RiskLevel.GRAVE
        assert con_fiebre.level is RiskLevel.PRIORIZABLE

    def test_un_tamizaje_dudoso_con_fiebre_es_emergencia(self):
        """Regla de seguridad: el equipo detecta riesgo, nunca lo descarta."""
        from michicheck.pipeline import ScreeningResult

        dudoso = ScreeningResult(900, 400, 2000, "x", 1800, 2, 5, 6, 0.1,
                                 800.0, 14.0, 6.0, 0.5, False,
                                 ["capilares_insuficientes (2/5)"], [])
        decision = triage(dudoso, ClinicalContext(6, temperature_c=38.5))
        assert decision.level is RiskLevel.PRIORIZABLE
        assert decision.is_emergency

    def test_se_decide_sobre_el_limite_inferior_del_intervalo(self):
        """Estimacion puntual de 700 pero intervalo que baja de 500 -> rojo."""
        from michicheck.pipeline import ScreeningResult

        ancho = ScreeningResult(700, 320, 1500, "x", 1400, 5, 5, 8, 0.2,
                                800.0, 14.0, 6.0, 0.5, True, [], [])
        assert triage(ancho, ClinicalContext(6)).level is RiskLevel.GRAVE


class TestInteroperabilidad:
    """El mensaje debe ser honesto sobre lo que es y sobre a que se ajusta."""

    def _caso(self):
        from michicheck.pipeline import ScreeningResult

        resultado = ScreeningResult(420, 280, 640, "grave", 840, 5, 5, 20, 0.35,
                                    800.0, 14.0, 6.0, 0.5, True, [], [])
        return resultado, triage(resultado, ClinicalContext(6, temperature_c=38.6))

    def test_el_bundle_usa_los_perfiles_nacionales_donde_existen(self):
        from michicheck.interop import build_bundle, pe_core

        resultado, decision = self._caso()
        bundle = build_bundle(resultado, decision, "INSNSB-001", device_id="yn-01")
        por_tipo = {e["resource"]["resourceType"]: e["resource"]
                    for e in bundle["entry"]}

        assert pe_core.PROFILE_PACIENTE in por_tipo["Patient"]["meta"]["profile"]
        assert pe_core.PROFILE_ORGANIZACION in por_tipo["Organization"]["meta"]["profile"]
        assert por_tipo["Organization"]["identifier"][0]["system"] == pe_core.CS_IPRESS

    def test_declara_donde_no_hay_perfil_nacional(self):
        """No fingir conformidad es parte del diseno, no un detalle."""
        from michicheck.interop import build_bundle

        resultado, decision = self._caso()
        conformidad = build_bundle(resultado, decision, "INSNSB-001")["_conformidad"]
        assert "Observation" in conformidad["fhir_r4_base_sin_perfil_nacional"]
        assert "Patient" in conformidad["conforme_pe_core"]

    def test_el_resultado_viaja_siempre_como_preliminar(self):
        """Un tamizaje nunca puede entrar a la historia como un hemograma."""
        from michicheck.interop import build_bundle, build_oru_r01

        resultado, decision = self._caso()
        bundle = build_bundle(resultado, decision, "INSNSB-001")
        observaciones = [e["resource"] for e in bundle["entry"]
                         if e["resource"]["resourceType"] == "Observation"]
        anc = next(o for o in observaciones if "valueQuantity" in o)
        assert anc["status"] == "preliminary"
        assert "method" in anc

        mensaje = build_oru_r01(resultado, decision, "INSNSB-001")
        assert "NTE|" in mensaje
        assert "TAMIZAJE" in mensaje.upper()

    def test_la_derivacion_urgente_sale_como_stat(self):
        from michicheck.interop import build_bundle

        resultado, decision = self._caso()
        bundle = build_bundle(resultado, decision, "INSNSB-001")
        peticiones = [e["resource"] for e in bundle["entry"]
                      if e["resource"]["resourceType"] == "ServiceRequest"]
        assert peticiones and peticiones[0]["priority"] == "stat"
