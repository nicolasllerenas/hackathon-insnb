"""API de Yawar Ñan: tamizaje, triaje y exportación interoperable.

Diseñada para una posta rural, lo que impone dos condiciones poco habituales:

* **El análisis corre en el servidor, pero la decisión no depende de la red.**
  La PWA guarda las capturas en el dispositivo y las sincroniza cuando hay
  señal. Un resultado que exige conectividad no sirve en Amazonas.
* **Nada se guarda que identifique al niño.** El identificador es el código
  institucional del INSNSB; no hay nombres, no hay DNI, no hay vídeo
  persistido más allá del análisis.

Levantar en desarrollo:

    uvicorn services.api.main:app --reload
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from yawar import __version__, optics  # noqa: E402
from yawar.interop import build_bundle, build_oru_r01  # noqa: E402
from yawar.pipeline import ScreeningResult, aggregate, analyze_clip  # noqa: E402
from yawar.synth import (  # noqa: E402
    CapillaryState,
    OpticalSetup,
    PatientState,
    render_capture,
)
from yawar.triage import ClinicalContext, TriageDecision, screening_schedule, triage  # noqa: E402

app = FastAPI(
    title="Yawar Ñan",
    version=__version__,
    description="Tamizaje óptico no invasivo de neutropenia grave en pediatría",
)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# Almacén en memoria. En producción sería la base del establecimiento, con
# sincronización diferida hacia el INSNSB.
_SESIONES: dict[str, dict[str, Any]] = {}


def _cargar_modelo():
    """Carga el clasificador entrenado, si existe.

    Sin él la API sigue funcionando con la estimación puramente física, pero
    **sesgada**: el detector de gaps recupera solo una fracción de los eventos
    reales, y con la iluminación de 530 nm oblicuo (menos contraste que el
    420 nm del trabajo original) esa fracción baja bastante. Medido sobre la
    cohorte, la estimación física subestima el ANC verdadero unas 4 veces.

    La corrección de ese sesgo es justamente para lo que se entrenó el modelo,
    así que no aplicarlo equivale a tirar la mitad del trabajo. La API avisa
    en `/salud` cuando está operando sin modelo.
    """
    from yawar.model import YawarClassifier

    ruta = Path(__file__).resolve().parents[2] / "models" / "yawar_clf.pkl"
    if not ruta.exists():
        return None
    try:
        return YawarClassifier.load(ruta)
    except Exception:  # noqa: BLE001 - un modelo viejo no debe tumbar la API
        return None


_MODELO = _cargar_modelo()


def _aplicar_modelo(resultado: ScreeningResult) -> tuple[float, float | None]:
    """Devuelve ``(anc_corregido, probabilidad_grave)``.

    Si no hay modelo, se devuelve la estimación física y la probabilidad
    derivada del intervalo de Poisson.
    """
    if _MODELO is None or not resultado.conclusive:
        return resultado.anc_estimate, resultado.probability_severe

    from yawar.model import extract_features

    variables = extract_features(resultado).reshape(1, -1)
    anc = float(_MODELO.corrected_anc(variables)[0])
    prob = float(_MODELO.predict_proba(variables)[0])
    return anc, prob


# --------------------------------------------------------------------------
# Modelos de entrada y salida
# --------------------------------------------------------------------------


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
    """Modo demostración: genera la captura en lugar de recibirla.

    Existe por una razón práctica: permite mostrar el flujo completo en el
    pitch sin depender de que el hardware funcione en el escenario, y sirve de
    banco de pruebas para el personal antes de tocar a un paciente.
    """

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


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------


def _intervalo(resultado: ScreeningResult, escala: float) -> list[float] | None:
    """Intervalo de confianza, o ``None`` si no está acotado por ambos lados."""
    if not resultado.conclusive:
        return None
    lo = resultado.anc_ci_low * escala
    hi = resultado.anc_ci_high * escala
    if not (np.isfinite(lo) and np.isfinite(hi)):
        return None
    return [float(lo), float(hi)]


def _componer(sesion_id: str, paciente_id: str, resultado: ScreeningResult,
              decision: TriageDecision) -> RespuestaTamizaje:
    avisos = list(resultado.reasons)
    for m in resultado.measurements:
        avisos.extend(m.warnings)
        avisos.extend(m.quality_flags)

    def _finito(x: float) -> float | None:
        return float(x) if np.isfinite(x) else None

    # El ANC que se reporta es el **corregido por el modelo**, no el físico
    # crudo: el detector recupera solo una fracción de los gaps y ese sesgo es
    # sistemático, no ruido. El intervalo se escala en la misma proporción para
    # que siga siendo coherente con el valor central.
    anc, prob = _aplicar_modelo(resultado)
    escala = (anc / resultado.anc_estimate
              if resultado.anc_estimate and np.isfinite(resultado.anc_estimate)
              and resultado.anc_estimate > 0 else 1.0)

    return RespuestaTamizaje(
        sesion_id=sesion_id,
        paciente_id=paciente_id,
        momento=datetime.now().isoformat(timespec="seconds"),
        concluyente=resultado.conclusive,
        anc_estimado=_finito(anc),
        # El intervalo solo se publica si **ambos** extremos son finitos. Con
        # cero gaps detectados el límite superior es infinito (un conteo de
        # Poisson nulo no acota por arriba), y enviar un intervalo a medias
        # sería peor que no enviarlo: la interfaz lo mostraría como si fuera
        # una medición acotada.
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


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------


@app.get("/api/v1/salud")
def salud() -> dict[str, Any]:
    return {"estado": "ok", "version": __version__,
            "capilares_minimos": optics.MIN_CAPILLARIES_FOR_DECISION,
            "umbral_anc_grave": optics.SEVERE_NEUTROPENIA_ANC,
            "modelo_cargado": _MODELO is not None,
            "auc_modelo": (round(_MODELO.metrics_.auc, 3)
                           if _MODELO is not None and _MODELO.metrics_ else None)}


@app.get("/api/v1/referencia/{edad_anios}")
def referencia(edad_anios: float) -> dict[str, Any]:
    """Valores de referencia y umbral óptico correcto para esa edad."""
    if not 0 <= edad_anios <= 18:
        raise HTTPException(400, "Edad fuera de rango pediátrico")
    inferior, superior = optics.anc_reference_range(edad_anios)
    return {
        "edad_anios": edad_anios,
        "fraccion_neutrofilos": round(optics.neutrophil_fraction_for_age(edad_anios), 3),
        "anc_referencia": {"inferior": inferior, "superior": superior},
        "umbral_gaps_por_min_para_anc_500": round(
            optics.event_threshold_for_anc(500.0, edad_anios), 2),
        "umbral_del_adulto_equivale_a_anc": round(
            optics.anc_from_wbc(optics.wbc_from_event_rate(7.0), edad_anios), 0),
    }


@app.post("/api/v1/tamizaje/simular", response_model=RespuestaTamizaje)
def simular(peticion: PeticionSimulacion) -> RespuestaTamizaje:
    """Genera una captura sintética y la procesa con el pipeline real."""
    rng = np.random.default_rng(peticion.semilla)
    paciente = PatientState(age_years=peticion.contexto.edad_anios,
                            anc_per_ul=peticion.anc_simulado)
    setup = OpticalSetup(duration_s=peticion.duracion_s, fps=peticion.fps,
                         tremor_um=peticion.temblor_um)

    diametro0 = float(rng.uniform(11.0, 18.0))
    velocidad0 = float(rng.uniform(600.0, 1000.0))

    mediciones = []
    for _ in range(peticion.n_capilares):
        capilar = CapillaryState(
            diameter_um=float(np.clip(rng.normal(diametro0, 1.2), 8, 22)),
            velocity_um_s=float(np.clip(rng.normal(velocidad0, 100), 300, 1600)),
            visible_length_um=float(rng.uniform(150, 230)),
            curvature=float(rng.uniform(0.0, 0.3)),
            orientation_deg=float(rng.uniform(-20, 20)),
        )
        captura = render_capture(paciente, capilar, setup,
                                 seed=int(rng.integers(0, 2**31 - 1)),
                                 with_video=True)
        m = analyze_clip(captura.video, setup.um_per_px, setup.fps,
                         prior_velocity_um_s=peticion.contexto.velocidad_basal_um_s
                         or velocidad0)
        if m is not None:
            mediciones.append(m)

    resultado = aggregate(mediciones, peticion.contexto.edad_anios,
                          peticion.contexto.fraccion_neutrofilos_paciente)
    decision = triage(resultado, peticion.contexto.a_dominio())

    sesion_id = f"S{datetime.now():%Y%m%d%H%M%S}-{peticion.semilla}"
    _SESIONES[sesion_id] = {
        "paciente_id": peticion.paciente_id,
        "resultado": resultado,
        "decision": decision,
        "anc_real_simulado": peticion.anc_simulado,
        "momento": datetime.now(),
    }
    return _componer(sesion_id, peticion.paciente_id, resultado, decision)


@app.post("/api/v1/tamizaje/dispositivo", response_model=RespuestaTamizaje)
async def tamizaje_desde_dispositivo(
    paciente_id: str = Form(...),
    edad_anios: float = Form(...),
    um_por_px: float = Form(1.4),
    fps: float = Form(60.0),
    temperatura_c: float | None = Form(None),
    dias_post_quimio: int | None = Form(None),
    horas_a_centro_referencia: float | None = Form(None),
    porta_cateter_central: bool = Form(False),
    velocidad_basal_um_s: float | None = Form(None),
    fraccion_neutrofilos_paciente: float | None = Form(None),
    clips: list[UploadFile] = File(...),
) -> RespuestaTamizaje:
    """Ingesta de los vídeos grabados por el KittyScope.

    El dispositivo graba en su microSD y sube los clips por WiFi; el celular
    sólo previsualiza. Un clip por capilar.

    ``um_por_px`` viene de la calibración de la unidad y **no tiene valor por
    defecto seguro**: con la lente invertida a 1:1 es el paso de píxel del
    sensor (1.4 µm en el OV5640), pero si el firmware submuestrea en vez de
    leer por ventana, el valor real es varias veces mayor y toda la estimación
    de volumen —y por tanto de recuento— se va al traste. Se envía en cada
    petición a propósito, para que quede registrado con el resultado.
    """
    if fps < 55.0:
        raise HTTPException(
            422, f"La captura llegó a {fps:.0f} fps. Por debajo de 55 fps la "
                 "velocimetría no es viable (error ~81% medido a 30 fps). "
                 "Revisar la configuración del sensor.")
    if um_por_px > 4.0:
        raise HTTPException(
            422, f"Muestreo de {um_por_px:.1f} µm/px: un capilar de 15 µm "
                 "ocuparía menos de 4 píxeles. Configurar el sensor en modo "
                 "ventana a resolución nativa, no submuestreo.")

    mediciones = []
    for archivo in clips:
        datos = await archivo.read()
        video = _decodificar_video(datos, archivo.filename or "clip")
        if video is None:
            continue
        m = analyze_clip(video, um_por_px, fps,
                         prior_velocity_um_s=velocidad_basal_um_s)
        if m is not None:
            mediciones.append(m)

    if not mediciones:
        raise HTTPException(422, "No se pudo analizar ningún clip recibido.")

    resultado = aggregate(mediciones, edad_anios, fraccion_neutrofilos_paciente)
    contexto = ClinicalContext(
        age_years=edad_anios, temperature_c=temperatura_c,
        days_since_chemo=dias_post_quimio,
        hours_to_reference_center=horas_a_centro_referencia,
        has_central_line=porta_cateter_central,
    )
    decision = triage(resultado, contexto)

    sesion_id = f"D{datetime.now():%Y%m%d%H%M%S}"
    _SESIONES[sesion_id] = {
        "paciente_id": paciente_id, "resultado": resultado,
        "decision": decision, "momento": datetime.now(),
    }
    return _componer(sesion_id, paciente_id, resultado, decision)


def _decodificar_video(datos: bytes, nombre: str) -> np.ndarray | None:
    """Decodifica un clip a ``(T, H, W)`` en escala de grises.

    Se aceptan ``.npy`` (crudo, lo que el firmware puede volcar tal cual) y
    contenedores de vídeo. Nota: **grabar en JPEG o en un códec con pérdida
    degrada la detección**, porque los artefactos de bloque caen en la misma
    escala espacial que los gaps. El formato recomendado es crudo.
    """
    import tempfile

    if nombre.endswith(".npy"):
        import io
        arreglo = np.load(io.BytesIO(datos), allow_pickle=False)
        return arreglo if arreglo.ndim == 3 else None

    import cv2

    with tempfile.NamedTemporaryFile(suffix=Path(nombre).suffix or ".mp4",
                                     delete=True) as tmp:
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
    """Panel de cohorte: qué niños necesitan atención, ordenados por urgencia."""
    orden = {"negro": 0, "rojo": 1, "amarillo": 2, "indeterminado": 3, "verde": 4}
    filas = [
        {
            "sesion_id": sid,
            "paciente_id": s["paciente_id"],
            "momento": s["momento"].isoformat(timespec="minutes"),
            "nivel": s["decision"].level.value,
            "titulo": s["decision"].title,
            "anc_estimado": (round(s["resultado"].anc_estimate)
                             if s["resultado"].conclusive else None),
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
    return build_oru_r01(s["resultado"], s["decision"],
                         patient_id=s["paciente_id"]).replace("\r", "\n")


@app.get("/api/v1/sesiones/{sesion_id}/fhir")
def exportar_fhir(sesion_id: str) -> dict[str, Any]:
    s = _SESIONES.get(sesion_id)
    if s is None:
        raise HTTPException(404, "Sesión no encontrada")
    return build_bundle(s["resultado"], s["decision"],
                        patient_id=s["paciente_id"], device_id="yawar-01")


@app.get("/api/v1/calendario")
def calendario(fecha_quimio: str, ciclo_dias: int = 21) -> list[dict[str, str]]:
    """Calendario de tamizaje concentrado alrededor del nadir esperado."""
    try:
        inicio = datetime.fromisoformat(fecha_quimio)
    except ValueError:
        raise HTTPException(400, "Formato de fecha inválido (usar ISO 8601)")
    return [{"fecha": f.date().isoformat(), "motivo": motivo}
            for f, motivo in screening_schedule(inicio, ciclo_dias)]
