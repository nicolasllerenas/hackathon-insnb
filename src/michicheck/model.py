"""Clasificador calibrado de neutropenia grave.

Filosofia: el modelo corrige, no adivina
----------------------------------------
Seria facil -- y malo -- tirar una red neuronal al video crudo y esperar que
aprenda hematologia con unos cientos de ejemplos. Aqui la fisica ya entrega un
estimador de ANC con unidades y sentido; lo que el modelo aporta es corregir
sus sesgos conocidos y traducir el resultado a una probabilidad calibrada.

Eso importa por tres razones:

1. **Sesgo medible.** El detector de gaps recupera ~70-86% de los eventos
   reales (medido sobre cohorte sintetica). Es un factor sistematico, no ruido,
   y un modelo sobre la estimacion fisica lo absorbe con muy pocos parametros.
2. **Interpretabilidad.** Un hematologo puede auditar "conto 13 gaps en 5
   capilares, con este flujo y este diametro, luego el ANC es ~490". No puede
   auditar un embedding.
3. **Transferencia.** Cuando lleguen datos reales del INSNSB seran pocos.
   Reajustar una capa de calibracion sobre una estimacion fisica correcta
   necesita decenas de casos; entrenar de cero necesitaria miles.

Por que una regresion logistica y no un modelo mas potente
-----------------------------------------------------------
Se comparo por validacion cruzada sobre la cohorte sintetica de 300 pacientes:

======================================================  =====  =====
Modelo                                                    AUC  Brier
======================================================  =====  =====
Fisica sola (score = -log ANC estimado)                 0.916     --
Logistica sobre ANC fisico                              0.914  0.126
**Logistica: ANC + edad + eventos + volumen**           0.921  0.115
Logistica sobre las 13 variables                        0.921  0.112
Gradient boosting sobre las 13 variables                0.892  0.125
======================================================  =====  =====

El gradient boosting es **peor que no usar modelo**. Con 300 pacientes y 13
variables sobreajusta, y ademas destruye la calibracion. La logistica compacta
gana con cuatro parametros.

Se eligio la version de cuatro variables y no la de trece pese a su Brier
ligeramente peor, porque el destino de este modelo es reajustarse con **30-50
casos reales** del INSNSB. Con esa cantidad de datos, cuatro parametros se
estiman y trece no. Optimizar aqui la tercera cifra decimal a costa de que el
modelo no sobreviva al cambio a datos reales seria un mal negocio.

Umbral: sensibilidad primero
----------------------------
El error de no detectar una neutropenia grave (un nino con fiebre que se queda
en casa) y el de detectarla de mas (un viaje evitable a Lima) no se parecen en
gravedad. El umbral operativo se elige por eso sobre la **sensibilidad
objetivo**, no maximizando exactitud.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from . import optics
from .pipeline import ScreeningResult

FEATURE_NAMES: tuple[str, ...] = (
    "log_anc_fisico",
    "log_wbc_fisico",
    "log_eventos_totales",
    "log_volumen_nl",
    "eventos_por_nl",
    "n_capilares",
    "velocidad_media",
    "diametro_medio",
    "edad_anos",
    "fraccion_neutrofilos",
    "ancho_gap_medio",
    "confianza_velocidad_media",
    "fraccion_capilares_con_basal",
)


def extract_features(result: ScreeningResult) -> np.ndarray:
    """Vector de variables a partir de un resultado de tamizaje."""
    usable = [m for m in result.measurements if m.usable]
    n = max(len(usable), 1)

    def _log1p(x: float) -> float:
        return float(np.log1p(max(x, 0.0)))

    volume = max(result.sampled_volume_nl, 1e-6)
    values = {
        "log_anc_fisico": _log1p(result.anc_estimate),
        "log_wbc_fisico": _log1p(result.wbc_estimate),
        "log_eventos_totales": _log1p(result.total_events),
        "log_volumen_nl": float(np.log(volume)),
        "eventos_por_nl": float(result.total_events / volume),
        "n_capilares": float(result.n_capillaries_used),
        "velocidad_media": float(result.mean_velocity_um_s),
        "diametro_medio": float(result.mean_diameter_um),
        "edad_anos": float(result.age_years),
        "fraccion_neutrofilos": float(result.neutrophil_fraction_used),
        "ancho_gap_medio": float(np.nanmean([m.mean_gap_width_um for m in usable]))
        if usable else np.nan,
        "confianza_velocidad_media": float(
            np.mean([m.velocity_confidence for m in usable])) if usable else 0.0,
        "fraccion_capilares_con_basal": float(
            sum(m.used_velocity_prior for m in usable) / n),
    }
    return np.array([values[k] for k in FEATURE_NAMES], dtype=np.float64)


@dataclass
class ModelMetrics:
    auc: float
    sensitivity: float
    specificity: float
    ppv: float
    npv: float
    threshold: float
    n_patients: int
    n_positive: int
    brier: float


COMPACT_FEATURES: tuple[str, ...] = (
    "log_anc_fisico",
    "edad_anos",
    "log_eventos_totales",
    "log_volumen_nl",
)


class MichiClassifier:
    """Clasificador de neutropenia grave (ANC < 500/uL), con probabilidad calibrada."""

    def __init__(self, target_sensitivity: float = 0.95, random_state: int = 0,
                 kind: str = "logistica", compact: bool = True):
        self.target_sensitivity = target_sensitivity
        self.random_state = random_state
        self.kind = kind
        self.compact = compact
        self.pipeline = None
        self.threshold_ = 0.5
        self.metrics_: ModelMetrics | None = None
        self.anc_correction_: tuple[float, float] = (0.0, 1.0)


    @property
    def feature_index(self) -> list[int]:
        names = COMPACT_FEATURES if self.compact else FEATURE_NAMES
        return [FEATURE_NAMES.index(n) for n in names]

    def _select(self, features: np.ndarray) -> np.ndarray:
        return features[:, self.feature_index]

    def _build(self):
        from sklearn.impute import SimpleImputer
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler

        if self.kind == "arbol":
            from sklearn.calibration import CalibratedClassifierCV
            from sklearn.ensemble import HistGradientBoostingClassifier
            return CalibratedClassifierCV(
                HistGradientBoostingClassifier(
                    max_depth=3, max_iter=200, learning_rate=0.06,
                    min_samples_leaf=20, l2_regularization=1.0,
                    random_state=self.random_state),
                method="isotonic", cv=5)

        from sklearn.linear_model import LogisticRegression
        return make_pipeline(
            SimpleImputer(strategy="median"),
            StandardScaler(),
            LogisticRegression(C=1.0, max_iter=2000,
                               random_state=self.random_state),
        )

    def fit(self, features: np.ndarray, labels: np.ndarray,
            anc_true: np.ndarray | None = None) -> "MichiClassifier":
        self.pipeline = self._build()
        self.pipeline.fit(self._select(features), labels)

        if anc_true is not None:
            self.anc_correction_ = _fit_log_correction(
                features[:, FEATURE_NAMES.index("log_anc_fisico")], anc_true)
        return self

    def predict_proba(self, features: np.ndarray) -> np.ndarray:
        if self.pipeline is None:
            raise RuntimeError("El modelo no esta entrenado.")
        return self.pipeline.predict_proba(self._select(features))[:, 1]

    def coefficients(self) -> dict[str, float] | None:
        """Coeficientes del modelo lineal, para poder auditarlo."""
        if self.pipeline is None or self.kind != "logistica":
            return None
        clf = self.pipeline[-1]
        names = COMPACT_FEATURES if self.compact else FEATURE_NAMES
        return dict(zip(names, clf.coef_[0].tolist()))

    def corrected_anc(self, features: np.ndarray) -> np.ndarray:
        """ANC corregido por el sesgo sistematico del detector."""
        a, b = self.anc_correction_
        log_phys = features[:, FEATURE_NAMES.index("log_anc_fisico")]
        return np.expm1(a + b * log_phys)

    def calibrate_threshold(self, proba: np.ndarray, labels: np.ndarray) -> float:
        """Umbral mas alto que aun alcanza la sensibilidad objetivo."""
        positives = proba[labels == 1]
        if positives.size == 0:
            self.threshold_ = 0.5
            return self.threshold_
        q = float(np.quantile(positives, 1.0 - self.target_sensitivity))
        self.threshold_ = float(np.clip(q, 1e-4, 1 - 1e-4))
        return self.threshold_


    def save(self, path: str | Path) -> None:
        import pickle

        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as fh:
            pickle.dump({
                "pipeline": self.pipeline,
                "threshold": self.threshold_,
                "anc_correction": self.anc_correction_,
                "feature_names": FEATURE_NAMES,
                "metrics": asdict(self.metrics_) if self.metrics_ else None,
                "target_sensitivity": self.target_sensitivity,
                "kind": self.kind,
                "compact": self.compact,
            }, fh)

    @classmethod
    def load(cls, path: str | Path) -> "MichiClassifier":
        import pickle

        with open(path, "rb") as fh:
            blob = pickle.load(fh)
        if tuple(blob["feature_names"]) != FEATURE_NAMES:
            raise ValueError(
                "El modelo guardado usa otras variables que la version actual "
                "del codigo. Reentrenar antes de usarlo."
            )
        obj = cls(target_sensitivity=blob.get("target_sensitivity", 0.95),
                  kind=blob.get("kind", "logistica"),
                  compact=blob.get("compact", True))
        obj.pipeline = blob["pipeline"]
        obj.threshold_ = blob["threshold"]
        obj.anc_correction_ = tuple(blob["anc_correction"])
        if blob.get("metrics"):
            obj.metrics_ = ModelMetrics(**blob["metrics"])
        return obj


def _fit_log_correction(log_phys: np.ndarray, anc_true: np.ndarray
                        ) -> tuple[float, float]:
    """Ajusta ``log1p(ANC_real) = a + b * log1p(ANC_fisico)``."""
    ok = np.isfinite(log_phys) & np.isfinite(anc_true)
    if ok.sum() < 10:
        return 0.0, 1.0
    y = np.log1p(np.maximum(anc_true[ok], 0.0))
    x = log_phys[ok]
    b, a = np.polyfit(x, y, 1)
    return float(a), float(b)


def evaluate(proba: np.ndarray, labels: np.ndarray,
             threshold: float) -> ModelMetrics:
    """Metricas al umbral operativo."""
    from sklearn.metrics import brier_score_loss, roc_auc_score

    pred = proba >= threshold
    tp = int(((pred == 1) & (labels == 1)).sum())
    tn = int(((pred == 0) & (labels == 0)).sum())
    fp = int(((pred == 1) & (labels == 0)).sum())
    fn = int(((pred == 0) & (labels == 1)).sum())

    def _ratio(num: int, den: int) -> float:
        return float(num / den) if den else float("nan")

    auc = float(roc_auc_score(labels, proba)) if len(set(labels)) > 1 else float("nan")
    return ModelMetrics(
        auc=auc,
        sensitivity=_ratio(tp, tp + fn),
        specificity=_ratio(tn, tn + fp),
        ppv=_ratio(tp, tp + fp),
        npv=_ratio(tn, tn + fn),
        threshold=float(threshold),
        n_patients=int(labels.size),
        n_positive=int(labels.sum()),
        brier=float(brier_score_loss(labels, proba)),
    )


def physics_only_auc(features: np.ndarray, labels: np.ndarray) -> float:
    """AUC usando solo la estimacion fisica, sin ningun modelo entrenado.

    Es la linea base contra la que hay que justificar cualquier modelo. Si el
    modelo no la supera, sobra: mas complejidad, menos auditable y sin
    ganancia.
    """
    from sklearn.metrics import roc_auc_score

    return float(roc_auc_score(labels,
                               -features[:, FEATURE_NAMES.index("log_anc_fisico")]))


def cross_validate(features: np.ndarray, labels: np.ndarray,
                   anc_true: np.ndarray, n_splits: int = 5,
                   target_sensitivity: float = 0.95,
                   random_state: int = 0, kind: str = "logistica",
                   compact: bool = True) -> tuple[np.ndarray, ModelMetrics]:
    """Validacion cruzada estratificada, **a nivel de paciente**.

    Cada fila es un paciente y cada paciente aparece en un solo pliegue. Si se
    validara por capilar, los cinco capilares de un mismo nino caerian en
    pliegues distintos y el modelo veria en entrenamiento casi el mismo dato
    que luego evalua: el AUC saldria inflado y la cifra del pitch seria falsa.
    """
    from sklearn.model_selection import StratifiedKFold

    proba = np.zeros(labels.shape, dtype=float)
    skf = StratifiedKFold(n_splits=n_splits, shuffle=True,
                          random_state=random_state)
    for train_idx, test_idx in skf.split(features, labels):
        clf = MichiClassifier(target_sensitivity, random_state, kind, compact)
        clf.fit(features[train_idx], labels[train_idx], anc_true[train_idx])
        proba[test_idx] = clf.predict_proba(features[test_idx])

    tmp = MichiClassifier(target_sensitivity, random_state, kind, compact)
    threshold = tmp.calibrate_threshold(proba, labels)
    return proba, evaluate(proba, labels, threshold)


def label_severe(anc_per_ul: np.ndarray) -> np.ndarray:
    """Etiqueta binaria: neutropenia grave (ANC < 500/uL)."""
    return (np.asarray(anc_per_ul) < optics.SEVERE_NEUTROPENIA_ANC).astype(int)
