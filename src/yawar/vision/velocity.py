"""Medicion de la velocidad de flujo a partir del kymograph.

Por que importa
---------------
El modelo fisico dice que la tasa de gaps es ``R = C * v * A * 60e-9``. Si no
se conoce ``v``, la tasa de gaps es ambigua: un nino con flujo lento y recuento
normal produce los mismos gaps por minuto que un nino con flujo rapido y
neutropenia. El trabajo de referencia esquiva el problema **asumiendo**
v = 800 um/s para todos. Nosotros la medimos.

Metodo: la velocidad a la que la sangre entra en foco
----------------------------------------------------
Si el contenido del capilar solo se traslada, entonces existe un perfil 1D
``A(xi)`` -- la sangre vista desde la sangre -- tal que::

    K(t, s) ~ A(s - D(t))

Para el ``D(t)`` correcto, las muestras que caen en un mismo ``xi`` provienen
del mismo trozo de sangre y coinciden: el perfil sale nitido y explica bien los
datos. Para un ``D(t)`` equivocado se promedian trozos distintos, el perfil se
emborrona y explica mal. Basta entonces con **buscar la velocidad que maximiza
el R^2 de ese modelo**.

Tiene tres ventajas sobre correlacionar filas consecutivas:

* usa todo el kymograph a la vez, no pares de filas, asi que tolera capilares
  cortos y videos ruidosos;
* no sufre el submuestreo de la textura eritrocitaria (periodo ~10 um, que a
  800 um/s y 60 fps avanza mas de un periodo por frame y crea ambiguedad);
* el propio R^2 maximo **es** la medida de confianza, sin inventar heuristicas.

Despues del ajuste de velocidad constante, un segundo paso refina ``D(t)``
frame a frame contra el perfil, lo que recupera la modulacion cardiaca. No es
un detalle: con una pulsatilidad del 25% el desplazamiento oscila unos 20 um
alrededor de la recta, comparable al ancho de un gap.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import gaussian_filter1d

from .kymograph import Kymograph


@dataclass
class VelocityEstimate:
    velocity_um_s: float
    displacement_um: np.ndarray    # D(t), un valor por frame
    confidence: float              # R^2 del modelo de traslacion pura, 0-1
    velocity_series_um_s: np.ndarray
    window_times_s: np.ndarray
    pulsatility: float             # amplitud relativa de la variacion de v(t)
    used_prior: bool = False       # True si se recurrio a la basal del paciente


# --------------------------------------------------------------------------
# Nucleo: perfil material y bondad de ajuste
# --------------------------------------------------------------------------


def _material_profile(data: np.ndarray, arclen: np.ndarray, disp: np.ndarray,
                      bin_um: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Perfil ``A(xi)``, su cobertura, y el indice de bin de cada muestra."""
    xi = arclen[None, :] - disp[:, None]
    idx = np.floor((xi - xi.min()) / bin_um).astype(np.int64)
    n_bins = int(idx.max()) + 1

    flat = idx.ravel()
    total = np.bincount(flat, weights=data.ravel(), minlength=n_bins)
    count = np.bincount(flat, minlength=n_bins)
    profile = total / np.maximum(count, 1)
    return profile, count, idx


def _translation_r2(data: np.ndarray, arclen: np.ndarray, disp: np.ndarray,
                    bin_um: float, min_count: int = 2) -> float:
    """Varianza explicada por traslacion pura, **validada entre frames**.

    Un R^2 ingenuo no sirve aqui, y falla de una forma poco obvia. A velocidad
    supuesta muy alta, un bin material de 3 um se recorre en menos de un frame,
    de modo que **todas** las muestras de ese bin provienen del mismo frame:
    son pixeles espacialmente vecinos, casi identicos entre si. El residuo
    intra-bin se desploma y el R^2 tiende a 1 para cualquier velocidad
    suficientemente grande. El optimizador se va siempre al tope del rango.
    Ajustar por grados de libertad no lo arregla, porque el problema no es el
    numero de parametros sino de donde salen las muestras.

    La solucion es exigir que el modelo prediga **datos que no vio**: el perfil
    se construye con los frames pares y se evalua sobre los impares, y
    viceversa. Si la velocidad es correcta, el perfil de los pares describe la
    misma sangre que veran los impares y los predice bien. Si es incorrecta, el
    perfil esta emborronado y falla. Nada de esto puede simularse con vecinos
    espaciales del mismo frame, porque esos frames estan excluidos por
    construccion.
    """
    n_frames = data.shape[0]
    if n_frames < 8:
        return 0.0

    xi = arclen[None, :] - disp[:, None]
    idx = np.floor((xi - xi.min()) / bin_um).astype(np.int64)
    n_bins = int(idx.max()) + 1

    folds = (np.arange(n_frames) % 2).astype(bool)
    scores = []
    for train_mask in (folds, ~folds):
        tr_idx = idx[train_mask].ravel()
        tr_val = data[train_mask].ravel()
        total = np.bincount(tr_idx, weights=tr_val, minlength=n_bins)
        count = np.bincount(tr_idx, minlength=n_bins)
        usable = count >= min_count
        if usable.sum() < 8:
            continue
        profile = total / np.maximum(count, 1)

        te_idx = idx[~train_mask].ravel()
        te_val = data[~train_mask].ravel()
        keep = usable[te_idx]
        if keep.sum() < 64:
            continue

        observed = te_val[keep]
        predicted = profile[te_idx[keep]]
        ss_res = float(((observed - predicted) ** 2).sum())
        ss_tot = float(((observed - observed.mean()) ** 2).sum())
        if ss_tot <= 0:
            continue
        # Se pondera por la fraccion de muestras que el modelo llego a
        # explicar: un ajuste excelente sobre el 5% de los datos no vale.
        coverage = float(keep.mean())
        scores.append((1.0 - ss_res / ss_tot) * coverage)

    if not scores:
        return 0.0
    return float(np.clip(np.mean(scores), 0.0, 1.0))


# --------------------------------------------------------------------------
# Estimacion
# --------------------------------------------------------------------------


def bandpass_rows(data: np.ndarray, ds_um: float,
                  low_um: float = 18.0, high_um: float = 220.0) -> np.ndarray:
    """Filtro pasabanda espacial sobre cada fila del kymograph.

    Quita dos cosas que estorban a la velocimetria:

    * Por debajo de ``low_um``, la textura del tren de eritrocitos. Su periodo
      es de ~11 um y a 800 um/s y 60 fps la sangre avanza 13 um por frame, mas
      de un periodo completo: la textura queda submuestreada y su correlacion
      entre frames consecutivos cae a ~0.16. Es informacion perdida, y dejarla
      solo aporta maximos espurios.
    * Por encima de ``high_um``, el perfil de iluminacion residual y la deriva,
      que son estaticos y empujan la estimacion hacia velocidad cero.

    Queda la banda de 20-200 um: los gaps leucocitarios y las ondas de densidad
    eritrocitaria, que son justamente las estructuras que viajan con el flujo.
    """
    lo = max(low_um / max(ds_um, 1e-6) / 2.355, 0.5)
    hi = max(high_um / max(ds_um, 1e-6) / 2.355, lo * 2.0)
    smoothed = gaussian_filter1d(data, sigma=lo, axis=1, mode="nearest")
    baseline = gaussian_filter1d(data, sigma=hi, axis=1, mode="nearest")
    return smoothed - baseline


def estimate_velocity(kymo: Kymograph,
                      velocity_range: tuple[float, float] = (40.0, 2500.0),
                      n_coarse: int = 48,
                      bin_um: float = 3.0,
                      refine_pulsatility: bool = True,
                      prior_velocity_um_s: float | None = None,
                      min_confidence: float = 0.15) -> VelocityEstimate:
    """Estima la velocidad de flujo y el desplazamiento acumulado ``D(t)``.

    ``prior_velocity_um_s`` es la velocidad basal medida previamente **en este
    mismo paciente** (por ejemplo en el control del INSNSB, donde ademas hay
    hemograma). Sirve de respaldo, y no es un lujo: cuando el nino esta muy
    neutropenico casi no hay gaps que seguir, es decir que la velocimetria
    falla precisamente en el caso critico. Anclar la calibracion al propio
    paciente resuelve ese punto ciego mucho mejor que asumir un valor
    poblacional.
    """
    ds, fps = kymo.ds_um, kymo.fps
    arclen = (kymo.arclength_um - kymo.arclength_um[0]).astype(np.float64)
    n_frames = kymo.data.shape[0]
    t = np.arange(n_frames) / fps

    data = bandpass_rows(kymo.data.astype(np.float64), ds)

    # --- 1. Barrido grueso en escala logaritmica -------------------------
    candidates = np.geomspace(velocity_range[0], velocity_range[1], n_coarse)
    scores = np.array([
        _translation_r2(data, arclen, v * t, bin_um) for v in candidates
    ])
    best = int(np.argmax(scores))

    # --- 2. Refinamiento local -------------------------------------------
    lo = candidates[max(best - 1, 0)]
    hi = candidates[min(best + 1, n_coarse - 1)]
    fine = np.linspace(lo, hi, 25)
    fine_scores = np.array([
        _translation_r2(data, arclen, v * t, bin_um) for v in fine
    ])
    v0 = float(fine[int(np.argmax(fine_scores))])
    r2 = float(fine_scores.max())

    # Sin senal suficiente, se usa la basal del paciente en vez de inventar.
    used_prior = False
    if r2 < min_confidence and prior_velocity_um_s is not None:
        v0 = float(prior_velocity_um_s)
        used_prior = True

    disp = v0 * t
    pulsatility = 0.0
    v_series = np.array([v0])
    win_times = np.array([float(t.mean())])

    # --- 3. Recuperar la modulacion cardiaca ------------------------------
    if refine_pulsatility and r2 > 0.2 and not used_prior:
        disp, r2_ref = _refine_displacement(data, arclen, disp, bin_um, fps)
        if r2_ref >= r2:
            r2 = r2_ref
        v_inst = np.gradient(disp) * fps
        v_inst = gaussian_filter1d(v_inst, sigma=max(fps * 0.05, 1.0),
                                   mode="nearest")
        v_series, win_times = v_inst, t
        v_mean = float(np.mean(v_inst))
        if v_mean > 0:
            pulsatility = float(np.std(v_inst) / v_mean)

    return VelocityEstimate(
        velocity_um_s=float(np.mean(np.gradient(disp)) * fps),
        displacement_um=disp,
        confidence=r2,
        velocity_series_um_s=v_series,
        window_times_s=win_times,
        pulsatility=pulsatility,
        used_prior=used_prior,
    )


def _refine_displacement(data: np.ndarray, arclen: np.ndarray,
                         disp: np.ndarray, bin_um: float, fps: float,
                         n_iter: int = 2, max_shift_bins: int = 6
                         ) -> tuple[np.ndarray, float]:
    """Ajusta ``D(t)`` frame a frame contra el perfil material.

    Cada frame se alinea con el perfil acumulado buscando el desplazamiento que
    minimiza el error; la correccion resultante se suaviza en el tiempo (el
    flujo no da saltos) y se acumula. Dos iteraciones bastan.
    """
    disp = disp.copy()
    r2 = 0.0
    for _ in range(n_iter):
        profile, count, _ = _material_profile(data, arclen, disp, bin_um)
        valid = count >= 2
        if valid.sum() < 8:
            break

        xi0 = (arclen[None, :] - disp[:, None]).min()
        shifts = np.arange(-max_shift_bins, max_shift_bins + 1)
        n_frames = data.shape[0]
        errors = np.empty((n_frames, shifts.size))

        base_idx = np.floor((arclen[None, :] - disp[:, None] - xi0) / bin_um)
        for j, sh in enumerate(shifts):
            idx = np.clip(base_idx + sh, 0, profile.size - 1).astype(np.int64)
            ok = valid[idx]
            diff = (data - profile[idx]) ** 2
            errors[:, j] = np.where(ok, diff, np.nan).mean(axis=1)

        errors = np.nan_to_num(errors, nan=np.inf)
        best = np.argmin(errors, axis=1)
        correction = shifts[best] * bin_um
        # El flujo es suave: se filtra la correccion antes de aplicarla.
        correction = gaussian_filter1d(correction.astype(np.float64),
                                       sigma=max(fps * 0.04, 1.0),
                                       mode="nearest")
        disp = disp - correction
        # D(t) debe ser monotona creciente: el flujo capilar no se invierte.
        disp = np.maximum.accumulate(disp)
        r2 = _translation_r2(data, arclen, disp, bin_um)
    return disp, r2
