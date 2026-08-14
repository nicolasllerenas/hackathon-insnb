"""Verificacion del modelo fisico contra la literatura publicada.

Estos tests son la linea de defensa mas importante del proyecto. Si el modelo
optico se desvia, todo lo que viene despues -- deteccion, clasificador, triaje --
produce numeros coherentes entre si y equivocados frente a la realidad, que es
la clase de fallo mas dificil de notar.
"""

from __future__ import annotations

import numpy as np
import pytest

from yawar import optics


class TestModeloFisico:
    """Reproduccion de Bourquard et al., Sci Rep 2018 (PMC5871877)."""

    def test_reproduce_valor_basal_del_paper(self):
        # v = 800 um/s, d = 15 um: 32 eventos/min <-> 3773 celulas/uL
        assert optics.wbc_from_event_rate(32.0) == pytest.approx(3773, rel=0.01)

    def test_reproduce_valor_de_neutropenia_del_paper(self):
        # 2 eventos/min <-> 236 celulas/uL
        assert optics.wbc_from_event_rate(2.0) == pytest.approx(236, rel=0.01)

    def test_directo_e_inverso_son_consistentes(self):
        for wbc in (150.0, 800.0, 3000.0, 9000.0):
            rate = optics.event_rate_from_wbc(wbc, 650.0, 12.0)
            assert optics.wbc_from_event_rate(rate, 650.0, 12.0) == pytest.approx(wbc)

    def test_la_tasa_escala_con_el_area_no_con_el_diametro(self):
        """Duplicar el diametro cuadruplica la tasa: es un area, no una longitud.

        Este error -- tratar el diametro como si escalara linealmente -- daria
        un 100% de error en el recuento de un capilar el doble de ancho.
        """
        base = optics.event_rate_from_wbc(1000.0, 800.0, 10.0)
        doble = optics.event_rate_from_wbc(1000.0, 800.0, 20.0)
        assert doble == pytest.approx(4.0 * base)

    def test_el_umbral_del_paper_equivale_a_anc_500_en_adulto(self):
        """Cierre del razonamiento: 7 eventos/min <-> ANC ~500 en un adulto.

        Que este numero salga solo, sin ajustarlo, valida toda la cadena:
        geometria, conversion de unidades y fraccion de neutrofilos.
        """
        wbc = optics.wbc_from_event_rate(optics.BOURQUARD_EVENT_THRESHOLD)
        anc_adulto = optics.anc_from_wbc(wbc, age_years=21)
        assert anc_adulto == pytest.approx(500, abs=60)


class TestCorreccionPediatrica:
    def test_el_lactante_tiene_menos_fraccion_de_neutrofilos_que_el_adulto(self):
        assert optics.neutrophil_fraction_for_age(1.0) < 0.40
        assert optics.neutrophil_fraction_for_age(21.0) > 0.55

    def test_el_minimo_fisiologico_esta_alrededor_del_ano(self):
        edades = np.linspace(0.1, 21, 400)
        fracciones = [optics.neutrophil_fraction_for_age(e) for e in edades]
        assert 0.4 <= edades[int(np.argmin(fracciones))] <= 2.5

    def test_el_umbral_del_adulto_pierde_la_franja_critica_en_un_nino(self):
        """El hallazgo que justifica la adaptacion pediatrica.

        Con el umbral fijo de 7 eventos/min derivado de adultos, en un nino de
        2 anos la alerta solo se dispara cuando el ANC ya cayo muy por debajo
        de 500: se pierde entera la franja donde hay que actuar.
        """
        wbc = optics.wbc_from_event_rate(optics.BOURQUARD_EVENT_THRESHOLD)
        anc_en_nino = optics.anc_from_wbc(wbc, age_years=2)
        assert anc_en_nino < 350, (
            "Si esto deja de cumplirse, revisar la tabla de fracciones: el "
            "argumento central del proyecto depende de este numero."
        )

    def test_el_umbral_pediatrico_correcto_es_mucho_mas_alto(self):
        umbral_2a = optics.event_threshold_for_anc(500.0, age_years=2)
        assert umbral_2a > 1.5 * optics.BOURQUARD_EVENT_THRESHOLD

    def test_el_hemograma_del_paciente_manda_sobre_el_prior_de_edad(self):
        con_prior = optics.anc_from_wbc(2000.0, age_years=2)
        con_paciente = optics.anc_from_wbc(2000.0, age_years=2,
                                           patient_neutrophil_fraction=0.60)
        assert con_paciente > con_prior
        assert con_paciente == pytest.approx(1200.0)


class TestBandasYAgregacion:
    @pytest.mark.parametrize("anc,esperada", [
        (2000, "normal"), (1200, "leve"), (700, "moderada"),
        (300, "grave"), (100, "profunda"),
    ])
    def test_bandas_nci(self, anc, esperada):
        assert optics.anc_band(anc) == esperada

    def test_el_rango_de_referencia_depende_de_la_edad(self):
        assert optics.anc_reference_range(2.0)[0] < optics.anc_reference_range(12.0)[0]

    def test_agregar_capilares_suma_volumen_y_eventos(self):
        """La estimacion agrupada equivale a un solo capilar mas largo."""
        uno = optics.CapillaryCalibration(800.0, 15.0, 60.0, 10)
        agrupado, volumen = optics.pooled_wbc_estimate([uno] * 5)
        assert agrupado == pytest.approx(uno.wbc_per_ul, rel=1e-6)
        assert volumen == pytest.approx(5 * uno.sampled_volume_nl)

    def test_el_intervalo_de_poisson_se_estrecha_al_acumular_eventos(self):
        lo3, hi3 = optics.poisson_relative_ci(3)
        lo30, hi30 = optics.poisson_relative_ci(30)
        assert (hi3 - lo3) > (hi30 - lo30)
        assert lo3 < 1.0 < hi3

    def test_el_volumen_interrogado_es_del_orden_del_nanolitro(self):
        """Argumento del pitch: una gota virtual, sin aguja."""
        cal = optics.CapillaryCalibration(800.0, 15.0, 60.0, 30)
        assert 0.005 < cal.sampled_volume_nl < 50.0


class TestIluminacion:
    """La eleccion espectral del prototipo debe sostenerse numericamente."""

    def test_el_verde_absorbe_mucho_menos_que_el_azul(self):
        from yawar import illumination

        razon = (illumination.blood_absorption_per_um(420.0) /
                 illumination.blood_absorption_per_um(530.0))
        assert 8.0 < razon < 15.0, "Revisar los coeficientes de extincion"

    def test_la_melanina_castiga_mas_al_azul(self):
        """Argumento de equidad: el verde es mas parejo entre fototipos."""
        from yawar import illumination

        for fototipo in ("III", "IV", "V"):
            t420 = illumination.epidermal_transmission(420.0, fototipo)
            t530 = illumination.epidermal_transmission(530.0, fototipo)
            assert t530 > t420

        # Y la ventaja crece con el fototipo: es justo donde mas hace falta.
        ventaja_clara = (illumination.epidermal_transmission(530.0, "II") /
                         illumination.epidermal_transmission(420.0, "II"))
        ventaja_oscura = (illumination.epidermal_transmission(530.0, "V") /
                          illumination.epidermal_transmission(420.0, "V"))
        assert ventaja_oscura > ventaja_clara

    def test_el_verde_directo_no_alcanza_contraste_util(self):
        """Sin geometria oblicua, 530 nm no sirve. Es el riesgo de montaje #1."""
        from yawar import illumination

        directo = illumination.illumination_budget(530.0, "IV", oblique=False)
        assert directo.lumen_contrast < 0.20

    def test_el_verde_oblicuo_iguala_al_azul_directo(self):
        """Lo que valida el diseno del prototipo."""
        from yawar import illumination

        azul = illumination.illumination_budget(420.0, "IV", oblique=False)
        verde = illumination.illumination_budget(530.0, "IV", oblique=True)
        assert verde.effective_contrast > 0.7 * azul.effective_contrast
