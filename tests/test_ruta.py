"""Tests de la ruta asistencial: carga de viajes, derechos y teleinterconsulta."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from michicheck.adherencia import (
    ContextoFamiliar,
    FaseTratamiento,
    calcular_carga,
    evaluar_riesgo,
    ficha_para_comite,
)
from michicheck.derechos import (
    SituacionFamiliar,
    brecha_de_derechos,
    derechos_aplicables,
    expediente,
    resumen_para_familia,
)
from michicheck.pipeline import ScreeningResult
from michicheck.telesalud import (
    Establecimiento,
    Modalidad,
    Prioridad,
    Solicitante,
    crear,
    indicadores,
    responder,
)
from michicheck.triage import ClinicalContext, triage


def _bagua() -> ContextoFamiliar:
    return ContextoFamiliar(horas_viaje_ida=9.0, costo_viaje_soles=180.0,
                            zona_rural=True, ingreso_mensual_soles=1200.0,
                            cuidador_unico=True, hermanos_menores=2)


class TestCargaDeViajes:
    def test_el_mantenimiento_concentra_los_viajes_evitables(self):
        """Es la fase larga y la de mayor margen: hay que saber por qué."""
        ctx = _bagua()
        mantenimiento = calcular_carga(ctx, FaseTratamiento.MANTENIMIENTO, 18)
        consolidacion = calcular_carga(ctx, FaseTratamiento.CONSOLIDACION, 18)
        assert mantenimiento.reduccion_relativa > consolidacion.reduccion_relativa

    def test_no_promete_evitar_todos_los_viajes(self):
        """El protocolo exige hemograma completo y química; eso no lo damos.

        Prometer el 100% sería el tipo de exageración que un hematólogo detecta
        en la primera pregunta.
        """
        carga = calcular_carga(_bagua(), FaseTratamiento.MANTENIMIENTO, 18)
        assert carga.viajes_evitables < carga.viajes_solo_analitica
        assert carga.reduccion_relativa < 0.5

    def test_el_costo_escala_con_la_distancia(self):
        cerca = ContextoFamiliar(horas_viaje_ida=1.0, costo_viaje_soles=20.0)
        lejos = ContextoFamiliar(horas_viaje_ida=12.0, costo_viaje_soles=250.0)
        c1 = calcular_carga(cerca, FaseTratamiento.MANTENIMIENTO, 18)
        c2 = calcular_carga(lejos, FaseTratamiento.MANTENIMIENTO, 18)
        assert c2.costo_total_soles > 5 * c1.costo_total_soles
        assert c2.horas_totales > 10 * c1.horas_totales


class TestRiesgoAbandono:
    def test_los_predictores_estructurales_pesan(self):
        """RADAR: aseguramiento público, ruralidad y no-capital."""
        carga = calcular_carga(_bagua(), FaseTratamiento.MANTENIMIENTO, 18)
        alto = evaluar_riesgo(_bagua(), carga)
        bajo = evaluar_riesgo(
            ContextoFamiliar(horas_viaje_ida=0.5, costo_viaje_soles=10.0,
                             aseguramiento_publico=False, fuera_de_lima=False,
                             ingreso_mensual_soles=5000.0),
            carga)
        assert alto.puntaje > bajo.puntaje
        assert alto.nivel == "alto" and bajo.nivel == "bajo"

    def test_cuatro_semanas_sin_contacto_es_abandono(self):
        """Definición SIOP-PODC, la que usa el programa peruano."""
        carga = calcular_carga(_bagua(), FaseTratamiento.MANTENIMIENTO, 18)
        r = evaluar_riesgo(_bagua(), carga, dias_desde_ultimo_contacto=30)
        assert r.cumple_definicion_abandono
        r2 = evaluar_riesgo(_bagua(), carga, dias_desde_ultimo_contacto=10)
        assert not r2.cumple_definicion_abandono


class TestFichaParaComite:
    def test_habla_el_vocabulario_de_impacto(self):
        """No inventamos un semáforo propio: IMPACTO ya tiene el suyo.

        Un segundo tablero con colores distintos es un tablero que nadie mira.
        """
        ctx = _bagua()
        carga = calcular_carga(ctx, FaseTratamiento.MANTENIMIENTO, 18)
        ficha = ficha_para_comite("X", evaluar_riesgo(ctx, carga), carga, ctx)
        assert ficha["alerta_impacto"] in {"verde", "amarilla", "roja"}
        assert "complementaria a IMPACTO" in ficha["origen"]

    def test_una_falta_consumada_escala_a_roja(self):
        ctx = _bagua()
        carga = calcular_carga(ctx, FaseTratamiento.MANTENIMIENTO, 18)
        r = evaluar_riesgo(ctx, carga, controles_perdidos=2)
        assert ficha_para_comite("X", r, carga, ctx)["alerta_impacto"] == "roja"

    def test_declara_que_la_escala_no_esta_validada(self):
        ctx = _bagua()
        carga = calcular_carga(ctx, FaseTratamiento.MANTENIMIENTO, 18)
        ficha = ficha_para_comite("X", evaluar_riesgo(ctx, carga), carga, ctx)
        assert "no validada" in ficha["nota"]


class TestDerechos:
    def test_el_subsidio_son_dos_remuneraciones_minimas(self):
        res = resumen_para_familia(
            SituacionFamiliar(diagnostico_confirmado=True, cuidador_trabaja=True))
        subsidio = next(d for d in res["derechos"] if "Subsidio" in d["nombre"])
        assert subsidio["monto"] == pytest.approx(2260.0)

    def test_sin_diagnostico_confirmado_no_se_ofrece_el_subsidio(self):
        aplicables = derechos_aplicables(
            SituacionFamiliar(diagnostico_confirmado=False))
        assert not any(d.codigo == "subsidio" for d in aplicables)

    def test_advierte_que_el_subsidio_no_se_esta_entregando(self):
        """La Defensoría lo denuncia; ocultarlo generaría falsas expectativas."""
        res = resumen_para_familia(
            SituacionFamiliar(diagnostico_confirmado=True, cuidador_trabaja=True))
        subsidio = next(d for d in res["derechos"] if "Subsidio" in d["nombre"])
        assert subsidio["ojo"] and "Defensoría" in subsidio["ojo"]

    def test_la_brecha_cuenta_lo_no_percibido(self):
        """Es el dato que hoy no existe y que da valor más allá del paciente."""
        gestiones = [
            expediente("A", "subsidio", SituacionFamiliar(True, cuidador_trabaja=True)),
            expediente("B", "subsidio", SituacionFamiliar(True, cuidador_trabaja=True)),
        ]
        gestiones[0]["estado"] = "otorgado"
        gestiones[1]["estado"] = "sin_respuesta"
        brecha = brecha_de_derechos(gestiones)
        assert brecha["sin_respuesta"] == 1
        assert brecha["monto_no_percibido_soles"] == pytest.approx(2260.0)


class TestTeleinterconsulta:
    def _resultado(self, anc, lo, hi, concluyente=True):
        return ScreeningResult(anc, lo, hi, "x", anc / 0.5, 5, 5, 20, 0.35,
                               800.0, 14.0, 6.0, 0.5, concluyente, [], [])

    def _paquete(self, temperatura=None, anc=420):
        resultado = self._resultado(anc, anc * 0.6, anc * 1.6)
        decision = triage(resultado, ClinicalContext(6, temperature_c=temperatura))
        return crear(resultado, decision, "INSNSB-001",
                     Establecimiento("P.S. Bagua", "00012345", "I-3",
                                     "Amazonas", 9.0),
                     Solicitante("J. Pérez", "técnico de enfermería"))

    def test_la_emergencia_fuerza_tiempo_real(self):
        tic = self._paquete(temperatura=38.6)
        assert tic.prioridad is Prioridad.EMERGENCIA
        assert tic.modalidad is Modalidad.TIEMPO_REAL

    def test_lo_demas_va_diferido(self):
        """En una posta rural, exigir coincidencia de agenda y señal es exigir
        que falle."""
        assert self._paquete(anc=2500).modalidad is Modalidad.DIFERIDA

    def test_incluye_una_pregunta_respondible(self):
        """Una teleinterconsulta sin pregunta concreta desperdicia al especialista."""
        tic = self._paquete(temperatura=38.6)
        assert tic.pregunta_concreta and "?" in tic.pregunta_concreta

    def test_declara_que_no_es_un_hemograma(self):
        tic = self._paquete()
        assert "NO es un hemograma" in tic.resumen_tamizaje["metodo"]

    def test_la_responsabilidad_queda_en_la_posta(self):
        """Es teleinterconsulta, no teleconsulta: el especialista asesora."""
        d = self._paquete().a_dict()
        assert "responsabilidad sobre" in d["responsabilidad_clinica"]
        assert "Ley 30421" in d["marco_legal"]

    def test_los_indicadores_cuentan_traslados_evitados(self):
        """Es el número que justifica el programa."""
        tic = self._paquete(anc=2500)
        responder(tic, "Dra. Ruiz", "12345", "Continuar control", False)
        ind = indicadores([tic])
        assert ind["traslados_evitados"] == 1
        assert ind["horas_de_viaje_ahorradas"] == pytest.approx(18.0)
