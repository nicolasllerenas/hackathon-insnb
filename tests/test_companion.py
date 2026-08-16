"""Pruebas del sistema acompañante.

Cada prueba corresponde a una decisión de diseño que se puede discutir. Si
alguien cambia de opinión sobre una de ellas, la prueba tiene que fallar.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

import pytest

from michicheck.companion import (alertas, dispositivo, enrolamiento, estados,
                                  referencias, tratamiento)
from michicheck.companion.dispositivo import Dispositivo, Enlace, Latido
from michicheck.companion.enrolamiento import (Apoderado, JornadaLaboral,
                                               Paciente, Parentesco)
from michicheck.companion.estados import EstadoPaciente
from michicheck.companion.referencias import Capacidad, Domicilio, Nivel
from michicheck.companion.tratamiento import Etapa
from michicheck.pipeline import ScreeningResult
from michicheck.triage import ClinicalContext


def _resultado(anc, lo, hi, concluyente=True, razones=None):
    return ScreeningResult(anc, lo, hi, "x", anc / 0.5, 5, 5, 20, 0.35,
                           800.0, 14.0, 6.0, 0.5, concluyente, razones or [], [])


def _ficha(**cambios):
    base = dict(
        paciente=Paciente("Ana Lucia Quispe", date(2019, 3, 14), "2026-04871",
                          nombre_del_michi="Nube"),
        apoderado=Apoderado("Rosa Quispe", Parentesco.MADRE, "987654321",
                            jornada=JornadaLaboral(fin=time(18, 30))),
        domicilio=Domicilio("Amazonas", "Bagua", horas_al_insnsb=9.0),
        etapa=Etapa.MANTENIMIENTO,
        medico_asignado="Dra. Hematologia", cmp_medico="00000")
    base.update(cambios)
    return enrolamiento.enrolar(**base)


class TestEtapas:
    def test_el_mantenimiento_es_la_etapa_de_mayor_riesgo(self):
        """El abandono se concentra donde el niño se ve sano."""
        perfiles = tratamiento.PERFILES
        assert perfiles[Etapa.MANTENIMIENTO].riesgo_abandono == "alto"
        assert perfiles[Etapa.INDUCCION].riesgo_abandono == "bajo"

    def test_el_michi_insiste_mas_cuando_el_nino_esta_en_casa(self):
        """Menos controles presenciales exige más tamizajes en domicilio."""
        induccion = tratamiento.PERFILES[Etapa.INDUCCION]
        mantenimiento = tratamiento.PERFILES[Etapa.MANTENIMIENTO]
        assert mantenimiento.dias_entre_controles > induccion.dias_entre_controles
        assert mantenimiento.ambito == "domiciliario"

    def test_el_plan_no_programa_dos_anos_de_golpe(self):
        plan = tratamiento.planificar(Etapa.MANTENIMIENTO, date(2026, 1, 1),
                                      horizonte_dias=90)
        assert plan.tamizajes
        assert max(plan.tamizajes) <= date(2026, 1, 1) + timedelta(days=90)

    def test_acepta_lo_que_escriba_el_medico(self):
        assert tratamiento.etapa_desde_texto("Inducción") is Etapa.INDUCCION
        assert tratamiento.etapa_desde_texto("REINDUCCION") is Etapa.INTENSIFICACION
        with pytest.raises(ValueError):
            tratamiento.etapa_desde_texto("fase lunar")


class TestEnrolamiento:
    def test_cada_michi_queda_vinculado_a_un_paciente(self):
        a, b = _ficha(), _ficha()
        assert a.michi.serie != b.michi.serie
        assert a.michi.codigo_vinculacion != b.michi.codigo_vinculacion

    def test_el_celular_no_viaja_completo_en_el_volcado(self):
        ficha = _ficha()
        assert "987654321" not in str(ficha.a_dict())
        assert ficha.a_dict()["apoderado"]["celular"].endswith("321")

    def test_el_consentimiento_dice_que_el_juguete_transmite(self):
        texto = " ".join(_ficha().consentimiento()).lower()
        assert "insn san borja" in texto
        assert "no condiciona ninguna atención" in texto

    def test_cambiar_de_etapa_rehace_el_calendario(self):
        ficha = _ficha(etapa=Etapa.INDUCCION)
        tamizajes_antes = list(ficha.plan.tamizajes)
        enrolamiento.cambiar_de_etapa(ficha, Etapa.MANTENIMIENTO)
        assert ficha.etapa is Etapa.MANTENIMIENTO
        assert ficha.plan.tamizajes != tamizajes_antes


class TestVentanaDeAlertas:
    def test_el_michi_calla_mientras_los_padres_trabajan(self):
        """El maullido tiene que sonar cuando hay alguien en casa."""
        ficha = _ficha()
        lunes = date(2026, 8, 17)
        inicio, fin = alertas.ventana_audible(ficha, lunes)
        assert inicio.time() >= time(19, 0)
        assert fin.time() == alertas.HORA_MAS_TARDIA

    def test_sin_horario_fijo_la_ventana_se_corre_a_la_noche(self):
        ficha = _ficha(apoderado=Apoderado(
            "Julia", Parentesco.MADRE, "900000000",
            jornada=JornadaLaboral(sin_horario_fijo=True)))
        inicio, _ = alertas.ventana_audible(ficha, date(2026, 8, 17))
        assert inicio.time() == alertas.HORA_SIN_HORARIO_FIJO

    def test_ninguna_alerta_del_juguete_cae_fuera_de_la_ventana(self):
        ficha = _ficha()
        for alerta in alertas.planificar(ficha, dias=21):
            if alerta.canal is not alertas.Canal.JUGUETE:
                continue
            inicio, fin = alertas.ventana_audible(ficha, alerta.programada.date())
            assert inicio <= alerta.programada <= fin + timedelta(minutes=5)

    def test_el_tamizaje_es_lo_que_calla_al_michi(self):
        ficha = _ficha()
        tamizajes = [a for a in alertas.planificar(ficha, dias=30)
                     if a.tipo is alertas.Tipo.TAMIZAJE]
        assert tamizajes
        assert all(a.exige_tamizaje for a in tamizajes)
        assert all(a.canal is alertas.Canal.JUGUETE for a in tamizajes)

    def test_la_insistencia_tiene_un_limite_y_ese_limite_avisa_al_hospital(self):
        ficha = _ficha()
        alerta = alertas.planificar(ficha, dias=30)[0]
        for _ in range(alertas.MAX_POSTERGACIONES - 1):
            alerta = alertas.escalar(alerta, ficha)
            assert alerta is not None
        assert alertas.escalar(alerta, ficha) is None
        assert alerta.estado is alertas.Estado.ESCALADA

    def test_los_canales_convencionales_salen_igual(self):
        """El michi complementa la llamada, el SMS y el correo; no los sustituye."""
        ficha = _ficha()
        alerta = alertas.planificar(ficha, dias=30)[0]
        canales = {r["canal"] for r in alertas.respaldo_convencional(ficha, alerta)}
        assert canales == {"sms", "llamada", "correo"}


class TestDispositivo:
    def _con_silencio(self, horas, **campos):
        d = Dispositivo("MC-TEST", "F1")
        d.registrar(Latido(datetime.now() - timedelta(hours=horas),
                           campos.pop("bateria_pct", 80.0), **campos))
        return d

    def test_el_silencio_prolongado_es_una_alerta_urgente(self):
        salud = dispositivo.evaluar(self._con_silencio(96))
        assert salud.enlace is Enlace.SIN_CONTACTO
        assert salud.urgente
        assert "abandono" in salud.conducta.lower()

    def test_un_michi_recien_hablado_no_genera_ruido(self):
        salud = dispositivo.evaluar(self._con_silencio(2))
        assert salud.enlace is Enlace.EN_LINEA
        assert not salud.urgente

    def test_silenciar_repetidamente_precede_al_abandono(self):
        salud = dispositivo.evaluar(self._con_silencio(3, silenciamientos=4))
        assert salud.urgente
        assert any("silenciamiento" in m for m in salud.motivos)

    def test_la_bateria_critica_escala(self):
        salud = dispositivo.evaluar(self._con_silencio(1, bateria_pct=5.0))
        assert salud.urgente

    def test_sin_latidos_el_enlace_no_revienta(self):
        salud = dispositivo.evaluar(Dispositivo("MC-VACIO", "F1"))
        assert salud.enlace is Enlace.SIN_CONTACTO
        assert salud.a_dict()["horas_de_silencio"] is None


class TestRedNacional:
    def test_la_red_oncologica_esta_concentrada_en_cuatro_departamentos(self):
        onco = {c.departamento for c in referencias.RED
                if c.nivel is Nivel.ONCOLOGICO}
        assert onco == {"Lima", "La Libertad", "Arequipa", "Cusco"}

    def test_si_no_pueden_ir_a_lima_el_destino_no_es_lima(self):
        domicilio = Domicilio("Loreto", "Maynas", horas_al_insnsb=2.0,
                              puede_viajar_a_lima=False)
        ref = referencias.generar("HC1", domicilio, "hemograma_de_control")
        assert ref.destino.departamento != "Lima"
        assert ref.horas_de_viaje_evitadas > 0

    def test_la_fiebre_no_manda_al_nino_a_nueve_horas_por_un_hemocultivo(self):
        """La primera hora de antibiótico manda sobre la distancia."""
        domicilio = Domicilio("Amazonas", "Bagua", horas_al_insnsb=9.0,
                              puede_viajar_a_lima=False)
        ref = referencias.generar("HC1", domicilio, "neutropenia_febril")
        assert ref.destino.departamento == "Amazonas"
        assert any("ANTES del traslado" in a for a in ref.advertencias)

    def test_un_destino_de_continuidad_declara_lo_que_no_puede_hacer(self):
        domicilio = Domicilio("Loreto", "Maynas", puede_viajar_a_lima=False)
        ref = referencias.generar("HC1", domicilio, "transfusion")
        assert ref.destino.nivel is Nivel.CONTINUIDAD
        assert any("no sustituye al centro oncológico" in a
                   for a in ref.advertencias)
        assert any("contrarreferencia" in a.lower() for a in ref.advertencias)

    def test_la_quimioterapia_solo_va_a_un_centro_oncologico(self):
        domicilio = Domicilio("Puno", "Azángaro", puede_viajar_a_lima=False)
        ref = referencias.generar("HC1", domicilio, "quimioterapia")
        assert Capacidad.QUIMIOTERAPIA_PEDIATRICA in ref.destino.capacidades

    def test_prefiere_el_departamento_propio_antes_que_el_vecino(self):
        domicilio = Domicilio("Junín", "Huancayo")
        orden = referencias.candidatos(domicilio, {Capacidad.HEMOGRAMA})
        assert orden[0].departamento == "Junín"


class TestTresEstados:
    def test_estable_no_moviliza_a_nadie(self):
        ev = estados.evaluar(_resultado(1800, 1400, 2300), ClinicalContext(6))
        assert ev.estado is EstadoPaciente.ESTABLE
        assert not ev.requiere_teleconsulta
        assert not ev.habilita_emergencia

    def test_grave_abre_teleconsulta_pero_no_emergencia(self):
        ev = estados.evaluar(_resultado(420, 280, 640), ClinicalContext(6))
        assert ev.estado is EstadoPaciente.GRAVE
        assert ev.requiere_teleconsulta
        assert not ev.habilita_emergencia

    def test_la_fiebre_escala_a_priorizable_y_habilita_emergencia(self):
        ev = estados.evaluar(_resultado(420, 280, 640),
                             ClinicalContext(6, temperature_c=38.6))
        assert ev.estado is EstadoPaciente.PRIORIZABLE
        assert ev.habilita_emergencia
        assert ev.escalado_por_fiebre

    def test_un_tamizaje_dudoso_con_fiebre_nunca_tranquiliza(self):
        """Es el modo de fallo que mataría a un niño. Tiene que ser imposible."""
        dudoso = _resultado(900, 400, 2000, concluyente=False,
                            razones=["capilares_insuficientes (2/5)"])
        ev = estados.evaluar(dudoso, ClinicalContext(6, temperature_c=38.5))
        assert ev.estado is EstadoPaciente.PRIORIZABLE

    def test_el_michi_callado_escala_aunque_el_tamizaje_fuera_normal(self):
        d = Dispositivo("MC-X", "F1")
        d.registrar(Latido(datetime.now() - timedelta(hours=96), 0.0))
        ev = estados.evaluar(_resultado(1800, 1400, 2300), ClinicalContext(6),
                             salud_del_enlace=dispositivo.evaluar(d))
        assert ev.estado is EstadoPaciente.GRAVE
        assert ev.escalado_por_silencio
        assert "búsqueda" in ev.para_el_equipo

    def test_si_no_pueden_viajar_la_referencia_ya_viene_resuelta(self):
        ficha = _ficha(domicilio=Domicilio(
            "Puno", "Azángaro", horas_al_insnsb=20.0,
            puede_viajar_a_lima=False, motivo_impedimento="tres hijos a cargo"))
        ev = estados.evaluar(_resultado(420, 280, 640), ClinicalContext(6),
                             ficha=ficha)
        assert ev.referencia_sugerida is not None
        assert ev.referencia_sugerida.destino.departamento != "Lima"

    def test_si_pueden_viajar_no_se_genera_referencia(self):
        ev = estados.evaluar(_resultado(420, 280, 640), ClinicalContext(6),
                             ficha=_ficha())
        assert ev.referencia_sugerida is None

    def test_la_cola_pone_primero_lo_que_no_puede_esperar(self):
        casos = [
            ("estable", estados.evaluar(_resultado(1800, 1400, 2300),
                                        ClinicalContext(6))),
            ("priorizable", estados.evaluar(_resultado(300, 180, 500),
                                            ClinicalContext(6, temperature_c=38.7))),
            ("grave", estados.evaluar(_resultado(420, 280, 640),
                                      ClinicalContext(6))),
        ]
        orden = [fila["estado"] for fila in estados.cola_de_atencion(casos)]
        assert orden == ["priorizable", "grave", "estable"]
