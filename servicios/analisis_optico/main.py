from __future__ import annotations
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from michicheck import __version__, optics
from michicheck.interop import build_bundle, build_oru_r01
from michicheck.pipeline import ScreeningResult, aggregate, analyze_clip
from michicheck.synth import CapillaryState, OpticalSetup, PatientState, render_capture
from michicheck.triage import ClinicalContext, TriageDecision, screening_schedule, triage
from michicheck import adherencia as adh
from michicheck import derechos as der
from michicheck import mantenimiento as mant
from michicheck.companion import alertas as comp_alert
from michicheck.companion import dispositivo as comp_disp
from michicheck.companion import enrolamiento as comp_enr
from michicheck.companion import estados as comp_est
from michicheck.companion import referencias as comp_ref
from michicheck.companion import tratamiento as comp_trat

app = FastAPI(title="MichiCheck", version=__version__, description="Tamizaje óptico no invasivo de neutropenia grave en pediatría")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_SESIONES: dict[str, dict[str, Any]] = {}
_FICHAS: dict[str, comp_enr.Ficha] = {}
_DISPOSITIVOS: dict[str, comp_disp.Dispositivo] = {}

def _cargar_modelo():
    from michicheck.model import MichiClassifier
    ruta = Path(__file__).resolve().parents[2] / "models" / "michicheck_clf.pkl"
    if not ruta.exists():
        return None
    try:
        return MichiClassifier.load(ruta)
    except Exception:
        return None

_MODELO = _cargar_modelo()

def _aplicar_modelo(resultado: ScreeningResult) -> tuple[float, float | None]:
    if _MODELO is None or not resultado.conclusive:
        return resultado.anc_estimate, resultado.probability_severe
    from michicheck.model import extract_features
    variables = extract_features(resultado).reshape(1, -1)
    anc = float(_MODELO.corrected_anc(variables)[0])
    prob = float(_MODELO.predict_proba(variables)[0])
    return anc, prob

class ContextoClinico(BaseModel):
    edad_anios: float = Field(..., ge=0, le=18)
    temperatura_c: float | None = Field(None, ge=30, le=45)
    fiebre_sostenida_1h: bool = False
    dias_post_quimio: int | None = Field(None, ge=0, le=60)
    anc_ultimo_hemograma: float | None = Field(None, ge=0)
    dias_desde_hemograma: int | None = Field(None, ge=0)
    horas_a_centro_referencia: float | None = Field(None, ge=0)
    porta_cateter_central: bool = False
    fraccion_neutrofilos_paciente: float | None = Field(None, gt=0, lt=1)
    velocidad_basal_um_s: float | None = Field(None, gt=0)

    def a_dominio(self) -> ClinicalContext:
        return ClinicalContext(
            age_years=self.edad_anios,
            temperature_c=self.temperatura_c,
            fever_sustained_1h=self.fiebre_sostenida_1h,
            days_since_chemo=self.dias_post_quimio,
            last_cbc_anc=self.anc_ultimo_hemograma,
            last_cbc_days_ago=self.dias_desde_hemograma,
            hours_to_reference_center=self.horas_a_centro_referencia,
            has_central_line=self.porta_cateter_central,
        )

class PeticionSimulacion(BaseModel):
    paciente_id: str = "DEMO-001"
    contexto: ContextoClinico
    anc_simulado: float = Field(800.0, gt=0, le=20000)
    n_capilares: int = Field(5, ge=1, le=10)
    duracion_s: float = Field(20.0, ge=5, le=60)
    fps: float = Field(60.0, ge=15, le=240)
    temblor_um: float = Field(3.0, ge=0, le=20)
    semilla: int = 0

class RespuestaTamizaje(BaseModel):
    sesion_id: str
    paciente_id: str
    momento: str
    concluyente: bool
    anc_estimado: float | None
    anc_ic95: list[float] | None
    banda: str
    capilares_usados: int
    capilares_intentados: int
    gaps_detectados: int
    volumen_interrogado_nl: float
    velocidad_media_um_s: float | None
    diametro_medio_um: float | None
    probabilidad_grave: float | None
    nivel: str
    titulo: str
    accion: str
    plazo: str
    fundamento: list[str]
    avisos: list[str]
    proximo_tamizaje_dias: int | None

def _intervalo(resultado: ScreeningResult, escala: float) -> list[float] | None:
    if not resultado.conclusive:
        return None
    lo = resultado.anc_ci_low * escala
    hi = resultado.anc_ci_high * escala
    if not (np.isfinite(lo) and np.isfinite(hi)):
        return None
    return [float(lo), float(hi)]

def _componer(sesion_id: str, paciente_id: str, resultado: ScreeningResult, decision: TriageDecision) -> RespuestaTamizaje:
    avisos = list(resultado.reasons)
    for m in resultado.measurements:
        avisos.extend(m.warnings)
        avisos.extend(m.quality_flags)

    def _finito(x: float) -> float | None:
        return float(x) if np.isfinite(x) else None

    anc, prob = _aplicar_modelo(resultado)
    escala = (anc / resultado.anc_estimate if resultado.anc_estimate and np.isfinite(resultado.anc_estimate) and resultado.anc_estimate > 0 else 1.0)

    return RespuestaTamizaje(
        sesion_id=sesion_id,
        paciente_id=paciente_id,
        momento=datetime.now().isoformat(timespec="seconds"),
        concluyente=resultado.conclusive,
        anc_estimado=_finito(anc),
        anc_ic95=_intervalo(resultado, escala),
        banda=resultado.band,
        capilares_usados=resultado.n_capillaries_used,
        capilares_intentados=resultado.n_capillaries_attempted,
        gaps_detectados=resultado.total_events,
        volumen_interrogado_nl=round(resultado.sampled_volume_nl, 4),
        velocidad_media_um_s=_finito(resultado.mean_velocity_um_s),
        diametro_medio_um=_finito(resultado.mean_diameter_um),
        probabilidad_grave=_finito(prob) if prob is not None else None,
        nivel=decision.level.value,
        titulo=decision.title,
        accion=decision.action,
        plazo=decision.timeframe,
        fundamento=decision.rationale,
        avisos=list(dict.fromkeys(avisos)),
        proximo_tamizaje_dias=decision.next_screening_days,
    )

@app.get("/api/v1/salud")
def salud() -> dict[str, Any]:
    return {"estado": "ok", "version": __version__, "capilares_minimos": optics.MIN_CAPILLARIES_FOR_DECISION, "umbral_anc_grave": optics.SEVERE_NEUTROPENIA_ANC, "modelo_cargado": _MODELO is not None, "auc_modelo": (round(_MODELO.metrics_.auc, 3) if _MODELO is not None and _MODELO.metrics_ else None)}

@app.get("/api/v1/referencia/{edad_anios}")
def referencia(edad_anios: float) -> dict[str, Any]:
    if not 0 <= edad_anios <= 18:
        raise HTTPException(400, "Edad fuera de rango pediátrico")
    inferior, superior = optics.anc_reference_range(edad_anios)
    return {
        "edad_anios": edad_anios,
        "fraccion_neutrofilos": round(optics.neutrophil_fraction_for_age(edad_anios), 3),
        "anc_referencia": {"inferior": inferior, "superior": superior},
        "umbral_gaps_por_min_para_anc_500": round(optics.event_threshold_for_anc(500.0, edad_anios), 2),
        "umbral_del_adulto_equivale_a_anc": round(optics.anc_from_wbc(optics.wbc_from_event_rate(7.0), edad_anios), 0),
    }

@app.post("/api/v1/tamizaje/simular", response_model=RespuestaTamizaje)
def simular(peticion: PeticionSimulacion) -> RespuestaTamizaje:
    rng = np.random.default_rng(peticion.semilla)
    paciente = PatientState(age_years=peticion.contexto.edad_anios, anc_per_ul=peticion.anc_simulado)
    setup = OpticalSetup(duration_s=peticion.duracion_s, fps=peticion.fps, tremor_um=peticion.temblor_um)
    diametro0 = float(rng.uniform(11.0, 18.0))
    velocidad0 = float(rng.uniform(600.0, 1000.0))

    mediciones = []
    for _ in range(peticion.n_capilares):
        capilar = CapillaryState(diameter_um=float(np.clip(rng.normal(diametro0, 1.2), 8, 22)), velocity_um_s=float(np.clip(rng.normal(velocidad0, 100), 300, 1600)), visible_length_um=float(rng.uniform(150, 230)), curvature=float(rng.uniform(0.0, 0.3)), orientation_deg=float(rng.uniform(-20, 20)))
        captura = render_capture(paciente, capilar, setup, seed=int(rng.integers(0, 2**31 - 1)), with_video=True)
        m = analyze_clip(captura.video, setup.um_per_px, setup.fps, prior_velocity_um_s=peticion.contexto.velocidad_basal_um_s or velocidad0)
        if m is not None:
            mediciones.append(m)

    resultado = aggregate(mediciones, peticion.contexto.edad_anios, peticion.contexto.fraccion_neutrofilos_paciente)
    decision = triage(resultado, peticion.contexto.a_dominio())

    sesion_id = f"S{datetime.now():%Y%m%d%H%M%S}-{peticion.semilla}"
    _SESIONES[sesion_id] = {"paciente_id": peticion.paciente_id, "resultado": resultado, "decision": decision, "anc_real_simulado": peticion.anc_simulado, "momento": datetime.now()}
    return _componer(sesion_id, peticion.paciente_id, resultado, decision)

@app.post("/api/v1/tamizaje/dispositivo", response_model=RespuestaTamizaje)
async def tamizaje_desde_dispositivo(paciente_id: str = Form(...), edad_anios: float = Form(...), um_por_px: float = Form(1.4), fps: float = Form(60.0), temperatura_c: float | None = Form(None), dias_post_quimio: int | None = Form(None), horas_a_centro_referencia: float | None = Form(None), porta_cateter_central: bool = Form(False), velocidad_basal_um_s: float | None = Form(None), fraccion_neutrofilos_paciente: float | None = Form(None), clips: list[UploadFile] = File(...)) -> RespuestaTamizaje:
    if fps < 55.0:
        raise HTTPException(422, f"La captura llegó a {fps:.0f} fps. Por debajo de 55 fps la velocimetría no es viable (error ~81% medido a 30 fps). Revisar la configuración del sensor.")
    if um_por_px > 4.0:
        raise HTTPException(422, f"Muestreo de {um_por_px:.1f} µm/px: un capilar de 15 µm ocuparía menos de 4 píxeles. Configurar el sensor en modo ventana a resolución nativa, no submuestreo.")

    mediciones = []
    for archivo in clips:
        datos = await archivo.read()
        video = _decodificar_video(datos, archivo.filename or "clip")
        if video is None:
            continue
        m = analyze_clip(video, um_por_px, fps, prior_velocity_um_s=velocidad_basal_um_s)
        if m is not None:
            mediciones.append(m)

    if not mediciones:
        raise HTTPException(422, "No se pudo analizar ningún clip recibido.")

    resultado = aggregate(mediciones, edad_anios, fraccion_neutrofilos_paciente)
    contexto = ClinicalContext(age_years=edad_anios, temperature_c=temperatura_c, days_since_chemo=dias_post_quimio, hours_to_reference_center=horas_a_centro_referencia, has_central_line=porta_cateter_central)
    decision = triage(resultado, contexto)

    sesion_id = f"D{datetime.now():%Y%m%d%H%M%S}"
    _SESIONES[sesion_id] = {"paciente_id": paciente_id, "resultado": resultado, "decision": decision, "momento": datetime.now()}
    return _componer(sesion_id, paciente_id, resultado, decision)

def _decodificar_video(datos: bytes, nombre: str) -> np.ndarray | None:
    import tempfile
    if nombre.endswith(".npy"):
        import io
        arreglo = np.load(io.BytesIO(datos), allow_pickle=False)
        return arreglo if arreglo.ndim == 3 else None

    import cv2
    with tempfile.NamedTemporaryFile(suffix=Path(nombre).suffix or ".mp4", delete=True) as tmp:
        tmp.write(datos)
        tmp.flush()
        captura = cv2.VideoCapture(tmp.name)
        fotogramas = []
        while True:
            ok, frame = captura.read()
            if not ok:
                break
            if frame.ndim == 3:
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            fotogramas.append(frame)
        captura.release()
    return np.stack(fotogramas) if len(fotogramas) > 10 else None

@app.get("/api/v1/sesiones")
def listar_sesiones() -> list[dict[str, Any]]:
    orden = {"priorizable": 0, "grave": 1, "indeterminado": 2, "estable": 3}
    filas = [
        {
            "sesion_id": sid,
            "paciente_id": s["paciente_id"],
            "momento": s["momento"].isoformat(timespec="minutes"),
            "nivel": s["decision"].level.value,
            "titulo": s["decision"].title,
            "anc_estimado": (round(s["resultado"].anc_estimate) if s["resultado"].conclusive else None),
            "plazo": s["decision"].timeframe,
        }
        for sid, s in _SESIONES.items()
    ]
    return sorted(filas, key=lambda f: (orden.get(f["nivel"], 9), f["momento"]))

@app.get("/api/v1/sesiones/{sesion_id}/hl7", response_class=PlainTextResponse)
def exportar_hl7(sesion_id: str) -> str:
    s = _SESIONES.get(sesion_id)
    if s is None:
        raise HTTPException(404, "Sesión no encontrada")
    return build_oru_r01(s["resultado"], s["decision"], patient_id=s["paciente_id"]).replace("\r", "\n")

@app.get("/api/v1/sesiones/{sesion_id}/fhir")
def exportar_fhir(sesion_id: str) -> dict[str, Any]:
    s = _SESIONES.get(sesion_id)
    if s is None:
        raise HTTPException(404, "Sesión no encontrada")
    return build_bundle(s["resultado"], s["decision"], patient_id=s["paciente_id"], device_id="yawar-01")

@app.get("/api/v1/calendario")
def calendario(fecha_quimio: str, ciclo_dias: int = 21) -> list[dict[str, str]]:
    try:
        inicio = datetime.fromisoformat(fecha_quimio)
    except ValueError:
        raise HTTPException(400, "Formato de fecha inválido (usar ISO 8601)")
    return [{"fecha": f.date().isoformat(), "motivo": motivo} for f, motivo in screening_schedule(inicio, ciclo_dias)]

class PeticionTrayectoria(BaseModel):
    mediciones: list[dict[str, Any]]

@app.post("/api/v1/mantenimiento/trayectoria")
def trayectoria(peticion: PeticionTrayectoria) -> dict[str, Any]:
    from datetime import date as _date
    mediciones = [
        mant.Medicion(
            fecha=_date.fromisoformat(m["fecha"]),
            anc_estimado=float(m["anc"]),
            anc_ci_low=float(m.get("ci_low", m["anc"] * 0.4)),
            anc_ci_high=float(m.get("ci_high", m["anc"] * 2.5)),
            concluyente=bool(m.get("concluyente", True)),
        )
        for m in peticion.mediciones
    ]
    t = mant.analizar_trayectoria(mediciones)
    return {
        "n_mediciones": t.n,
        "posicion_actual": t.posicion_actual.value,
        "ventana": list(mant.VENTANA_MANTENIMIENTO),
        "fraccion_en_ventana": round(t.fraccion_en_ventana, 3),
        "tendencia_semanal_pct": round((2.718281828 ** t.tendencia_por_semana - 1) * 100, 1),
        "semanas_sobre_ventana": round(t.semanas_sobre_ventana, 1),
        "sospecha_no_adherencia": t.sospecha_no_adherencia,
        "riesgo_relativo_recaida": round(mant.riesgo_de_recaida_relativo(t.fraccion_en_ventana), 2),
        "mensajes": t.mensajes,
        "para_la_familia": mant.mensaje_para_familia(t),
        "serie": [{"fecha": m.fecha.isoformat(), "anc": round(m.anc_estimado), "ci": [round(m.anc_ci_low), round(m.anc_ci_high)], "posicion": m.posicion.value} for m in t.mediciones],
    }

class PeticionCarga(BaseModel):
    horas_viaje_ida: float = Field(..., ge=0, le=48)
    costo_viaje_soles: float = Field(0.0, ge=0)
    ingreso_mensual_soles: float | None = None
    zona_rural: bool = False
    cuidador_unico: bool = False
    hermanos_menores: int = 0
    tiene_alojamiento_en_lima: bool = False
    fase: str = "mantenimiento"
    meses_restantes: float = Field(18.0, gt=0, le=36)
    controles_perdidos: int = 0

@app.post("/api/v1/ruta/carga")
def carga_de_viajes(p: PeticionCarga) -> dict[str, Any]:
    ctx = adh.ContextoFamiliar(horas_viaje_ida=p.horas_viaje_ida, costo_viaje_soles=p.costo_viaje_soles, ingreso_mensual_soles=p.ingreso_mensual_soles, zona_rural=p.zona_rural, cuidador_unico=p.cuidador_unico, hermanos_menores=p.hermanos_menores, tiene_alojamiento_en_lima=p.tiene_alojamiento_en_lima)
    fase = adh.FaseTratamiento(p.fase)
    carga = adh.calcular_carga(ctx, fase, p.meses_restantes)
    riesgo = adh.evaluar_riesgo(ctx, carga, p.controles_perdidos)
    ficha = adh.ficha_para_comite("—", riesgo, carga, ctx)
    return {
        "viajes_previstos": round(carga.viajes_totales),
        "viajes_evitables": round(carga.viajes_evitables),
        "reduccion_pct": round(carga.reduccion_relativa * 100),
        "horas_totales": round(carga.horas_totales),
        "costo_soles": round(carga.costo_total_soles),
        "ahorro_soles": round(carga.costo_evitable_soles),
        "pct_del_ingreso": (round(carga.costo_total_soles / p.meses_restantes / p.ingreso_mensual_soles * 100) if p.ingreso_mensual_soles else None),
        "riesgo": {"puntaje": round(riesgo.puntaje), "nivel": riesgo.nivel, "factores": riesgo.factores},
        "alerta_impacto": ficha["alerta_impacto"],
        "acciones": ficha["acciones_sugeridas"],
    }

@app.get("/api/v1/derechos")
def derechos_familia(diagnostico_confirmado: bool = True, cuidador_trabaja: bool = True, edad: float = 8.0) -> dict[str, Any]:
    return der.resumen_para_familia(der.SituacionFamiliar(diagnostico_confirmado=diagnostico_confirmado, cuidador_trabaja=cuidador_trabaja, edad_paciente=edad))

class PeticionEnrolamiento(BaseModel):
    nombre: str
    fecha_nacimiento: str
    historia_clinica: str
    etapa: str = "mantenimiento"
    nombre_del_michi: str = "Michi"
    apoderado: str
    parentesco: str = "madre"
    celular: str
    correo: str | None = None
    canal_preferido: str = "app"
    hora_salida_trabajo: str = "18:00"
    sin_horario_fijo: bool = False
    segundo_contacto: str | None = None
    departamento: str
    provincia: str = ""
    distrito: str = ""
    horas_al_insnsb: float | None = None
    puede_viajar_a_lima: bool = True
    motivo_impedimento: str = ""
    medico_asignado: str
    cmp_medico: str = ""

def _construir_ficha(p: PeticionEnrolamiento) -> comp_enr.Ficha:
    try:
        etapa = comp_trat.etapa_desde_texto(p.etapa)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    try:
        nacimiento = date.fromisoformat(p.fecha_nacimiento)
        salida = time.fromisoformat(p.hora_salida_trabajo)
    except ValueError as exc:
        raise HTTPException(400, f"Fecha u hora inválida: {exc}") from exc

    jornada = comp_enr.JornadaLaboral(fin=salida, sin_horario_fijo=p.sin_horario_fijo)
    try:
        parentesco = comp_enr.Parentesco(p.parentesco)
        canal = comp_enr.CanalPreferido(p.canal_preferido)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    return comp_enr.enrolar(
        paciente=comp_enr.Paciente(p.nombre, nacimiento, p.historia_clinica,
                                   nombre_del_michi=p.nombre_del_michi),
        apoderado=comp_enr.Apoderado(p.apoderado, parentesco, p.celular,
                                     jornada=jornada, canal_preferido=canal,
                                     correo=p.correo,
                                     segundo_contacto=p.segundo_contacto),
        domicilio=comp_ref.Domicilio(p.departamento, p.provincia, p.distrito,
                                     p.horas_al_insnsb, p.puede_viajar_a_lima,
                                     p.motivo_impedimento),
        etapa=etapa, medico_asignado=p.medico_asignado, cmp_medico=p.cmp_medico)

@app.get("/api/v1/companion/etapas")
def companion_etapas() -> list[dict[str, Any]]:
    return [
        {"etapa": perfil.etapa.value, "nombre": perfil.nombre,
         "ambito": perfil.ambito, "riesgo_abandono": perfil.riesgo_abandono,
         "dias_entre_controles": perfil.dias_entre_controles,
         "dias_entre_tamizajes": perfil.dias_entre_tamizajes,
         "quimioterapia_oral_en_casa": perfil.quimioterapia_oral_en_casa,
         "explicacion": perfil.explicacion_para_la_familia,
         "por_que_el_tamizaje": perfil.por_que_importa_el_tamizaje}
        for perfil in comp_trat.PERFILES.values()
    ]

@app.post("/api/v1/companion/enrolar")
def companion_enrolar(peticion: PeticionEnrolamiento) -> dict[str, Any]:
    ficha = _construir_ficha(peticion)
    _FICHAS[ficha.id] = ficha
    _DISPOSITIVOS[ficha.michi.serie] = comp_disp.Dispositivo(ficha.michi.serie, ficha.id)
    plan = comp_alert.planificar(ficha)
    inicio, fin = comp_alert.ventana_audible(ficha, date.today())
    return {
        "ficha": ficha.a_dict(),
        "consentimiento": ficha.consentimiento(),
        "ventana_de_alertas": {"inicio": inicio.strftime("%H:%M"),
                               "fin": fin.strftime("%H:%M")},
        "alertas_programadas": [a.a_dict() for a in plan],
        "resumen_de_alertas": comp_alert.resumen(plan),
    }

@app.get("/api/v1/companion/fichas")
def companion_fichas() -> list[dict[str, Any]]:
    return [
        {"id": f.id, "paciente": f.paciente.nombre, "etapa": f.etapa.value,
         "michi": f.michi.serie, "departamento": f.domicilio.departamento,
         "puede_viajar_a_lima": f.domicilio.puede_viajar_a_lima}
        for f in _FICHAS.values()
    ]

@app.get("/api/v1/companion/fichas/{ficha_id}/alertas")
def companion_alertas(ficha_id: str, dias: int = 14) -> dict[str, Any]:
    ficha = _FICHAS.get(ficha_id)
    if ficha is None:
        raise HTTPException(404, "Ficha no encontrada")
    plan = comp_alert.planificar(ficha, dias=dias)
    ejemplo = plan[0] if plan else None
    return {
        "alertas": [a.a_dict() for a in plan],
        "resumen": comp_alert.resumen(plan),
        "respaldo_convencional": (comp_alert.respaldo_convencional(ficha, ejemplo)
                                  if ejemplo else []),
    }

class PeticionLatido(BaseModel):
    serie: str
    bateria_pct: float = Field(..., ge=0, le=100)
    rssi_dbm: int | None = None
    firmware: str = "0.3.0"
    tamizajes_en_cola: int = 0
    alertas_emitidas: int = 0
    alertas_atendidas: int = 0
    silenciamientos: int = 0
    horas_de_retraso: float = 0.0

@app.post("/api/v1/companion/dispositivo/latido")
def companion_latido(peticion: PeticionLatido) -> dict[str, Any]:
    aparato = _DISPOSITIVOS.setdefault(
        peticion.serie, comp_disp.Dispositivo(peticion.serie, ""))
    aparato.registrar(comp_disp.Latido(
        momento=datetime.now() - timedelta(hours=peticion.horas_de_retraso),
        bateria_pct=peticion.bateria_pct, rssi_dbm=peticion.rssi_dbm,
        firmware=peticion.firmware, tamizajes_en_cola=peticion.tamizajes_en_cola,
        alertas_emitidas=peticion.alertas_emitidas,
        alertas_atendidas=peticion.alertas_atendidas,
        silenciamientos=peticion.silenciamientos))
    return {"serie": peticion.serie, "salud": comp_disp.evaluar(aparato).a_dict()}

@app.get("/api/v1/companion/dispositivos")
def companion_dispositivos() -> dict[str, Any]:
    aparatos = list(_DISPOSITIVOS.values())
    return {
        "cohorte": comp_disp.cohorte(aparatos),
        "dispositivos": [
            {"serie": d.serie, "ficha_id": d.ficha_id,
             "salud": comp_disp.evaluar(d).a_dict()}
            for d in aparatos],
    }

@app.get("/api/v1/companion/red")
def companion_red(capacidad: str | None = None) -> dict[str, Any]:
    centros = comp_ref.RED
    if capacidad:
        try:
            requerida = comp_ref.Capacidad(capacidad)
        except ValueError as exc:
            raise HTTPException(400, f"Capacidad desconocida: {capacidad}") from exc
        centros = tuple(c for c in centros if requerida in c.capacidades)
    return {
        "cobertura": comp_ref.cobertura(),
        "centros": [
            {"codigo": c.codigo, "nombre": c.nombre, "nivel": c.nivel.value,
             "departamento": c.departamento, "ciudad": c.ciudad,
             "horas_a_lima": c.horas_a_lima, "renipress": c.renipress,
             "capacidades": sorted(x.value for x in c.capacidades)}
            for c in centros],
    }

class PeticionReferencia(BaseModel):
    paciente_id: str
    departamento: str
    provincia: str = ""
    horas_al_insnsb: float | None = None
    puede_viajar_a_lima: bool = False
    motivo_impedimento: str = ""
    motivo: str = "hemograma_de_control"
    emitida_por: str = ""

@app.post("/api/v1/companion/referencia")
def companion_referencia(peticion: PeticionReferencia) -> dict[str, Any]:
    domicilio = comp_ref.Domicilio(
        peticion.departamento, peticion.provincia, "", peticion.horas_al_insnsb,
        peticion.puede_viajar_a_lima, peticion.motivo_impedimento)
    try:
        referencia = comp_ref.generar(
            peticion.paciente_id, domicilio, peticion.motivo,
            emitida_por=peticion.emitida_por)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return referencia.a_dict()

class PeticionEstado(BaseModel):
    sesion_id: str
    contexto: ContextoClinico
    ficha_id: str | None = None
    serie_del_michi: str | None = None

@app.post("/api/v1/companion/estado")
def companion_estado(peticion: PeticionEstado) -> dict[str, Any]:
    sesion = _SESIONES.get(peticion.sesion_id)
    if sesion is None:
        raise HTTPException(404, "Sesión no encontrada")

    ficha = _FICHAS.get(peticion.ficha_id) if peticion.ficha_id else None
    aparato = _DISPOSITIVOS.get(peticion.serie_del_michi) if peticion.serie_del_michi else None
    salud = comp_disp.evaluar(aparato) if aparato is not None else None

    evaluacion = comp_est.evaluar(
        sesion["resultado"], peticion.contexto.a_dominio(),
        ficha=ficha, salud_del_enlace=salud)
    respuesta = evaluacion.a_dict()
    respuesta["sesion_id"] = peticion.sesion_id
    respuesta["dispositivo"] = salud.a_dict() if salud else None
    return respuesta
