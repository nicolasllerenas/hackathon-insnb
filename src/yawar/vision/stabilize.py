"""Estabilizacion del video: quita el temblor de la mano y del dedo.

El soporte impreso en 3D reduce el movimiento pero no lo elimina: queda un
temblor residual de unos pocos micrometros. Como los gaps que buscamos miden
~30 um y duran ~0.2 s, un desplazamiento no corregido de 5 um se confunde con
flujo. Corregirlo no es cosmetico, es condicion para medir velocidad.

Se usa correlacion de fase (registro rigido, traslacion pura) contra un frame
de referencia robusto. Es subpixelica, rapida y no necesita features: funciona
aunque el capilar sea el unico objeto con contraste de la escena.
"""

from __future__ import annotations

import cv2
import numpy as np


def reference_frame(video: np.ndarray, n: int = 30) -> np.ndarray:
    """Frame de referencia = mediana temporal de los primeros ``n`` frames.

    La mediana descarta los gaps que pasan durante ese lapso, de modo que la
    referencia representa el capilar "lleno de eritrocitos".
    """
    n = min(n, video.shape[0])
    return np.median(video[:n].astype(np.float32), axis=0)


def static_weight(video: np.ndarray, sigma_px: float = 2.0) -> np.ndarray:
    """Peso por pixel que favorece lo que **no** se mueve.

    Registrar esta escena tiene una trampa. Casi todo lo que tiene contraste en
    el campo es sangre en movimiento, de modo que una correlacion de fase
    ingenua se engancha al flujo y no al tejido: devuelve la velocidad de los
    eritrocitos disfrazada de temblor de la mano, y "corrige" un movimiento que
    en realidad es la senal que queremos medir.

    La salida es registrar solo sobre lo estatico. La desviacion tipica
    temporal de cada pixel dice exactamente donde hay flujo; su complemento
    pondera el tejido, el borde del capilar y la textura de la piel, que son
    solidarios con el dedo y por tanto los unicos testigos validos del temblor.
    """
    std_img = video.astype(np.float32).std(axis=0)
    std_img = cv2.GaussianBlur(std_img, (0, 0), sigma_px)
    lo, hi = np.percentile(std_img, [5, 95])
    if hi - lo < 1e-6:
        return np.ones_like(std_img)
    norm = np.clip((std_img - lo) / (hi - lo), 0, 1)
    return (1.0 - norm).astype(np.float32)


def _phase_correlate_restricted(ref: np.ndarray, img: np.ndarray,
                                max_shift: int) -> tuple[float, float]:
    """Correlacion de fase con la busqueda acotada a ``max_shift`` pixeles.

    ``cv2.phaseCorrelate`` busca en todo el plano, y en esta escena eso es un
    problema: la sangre en movimiento y el ruido generan picos espurios lejos
    del origen. Medido sobre video sintetico, devolvia desplazamientos de mas
    de 300 px en una ROI de 200 px de ancho, es decir fisicamente imposibles.

    Como sabemos que el dedo apoyado en el soporte no puede desplazarse mas de
    unas decenas de micrometros, restringir la busqueda a esa vecindad elimina
    los espurios sin perder nada real. El refinamiento parabolico alrededor del
    pico recupera la precision subpixelica.
    """
    f1 = np.fft.rfft2(ref)
    f2 = np.fft.rfft2(img)
    cross = f1 * np.conj(f2)
    cross /= np.abs(cross) + 1e-9
    corr = np.fft.fftshift(np.fft.irfft2(cross, s=ref.shape))

    h, w = ref.shape
    cy, cx = h // 2, w // 2
    my = min(max_shift, cy - 1)
    mx = min(max_shift, cx - 1)
    window = corr[cy - my:cy + my + 1, cx - mx:cx + mx + 1]

    peak = np.unravel_index(int(np.argmax(window)), window.shape)
    dy = _parabolic(window[:, peak[1]], peak[0]) - my
    dx = _parabolic(window[peak[0], :], peak[1]) - mx
    # Convencion de signo: con cross = F(ref) * conj(F(img)), si la imagen es
    # la referencia desplazada en +d, el pico de la correlacion cae en -d. Se
    # invierte para devolver el desplazamiento real del contenido, que es lo
    # que ``apply_shifts`` espera compensar.
    return -float(dx), -float(dy)


def _parabolic(values: np.ndarray, i: int) -> float:
    """Refina la posicion de un maximo discreto con una parabola."""
    if i <= 0 or i >= values.size - 1:
        return float(i)
    a, b, c = float(values[i - 1]), float(values[i]), float(values[i + 1])
    denom = a - 2 * b + c
    if abs(denom) < 1e-12:
        return float(i)
    return float(i) + 0.5 * (a - c) / denom


def estimate_shifts(video: np.ndarray, reference: np.ndarray | None = None,
                    weight: np.ndarray | None = None,
                    max_shift_px: int | None = None,
                    smooth_frames: int = 5) -> np.ndarray:
    """Desplazamiento (dx, dy) en pixeles de cada frame respecto a la referencia."""
    ref = reference_frame(video) if reference is None else reference
    ref = ref.astype(np.float32)

    if weight is None:
        weight = static_weight(video)
    win = cv2.createHanningWindow((ref.shape[1], ref.shape[0]), cv2.CV_32F)
    win = (win * weight).astype(np.float32)

    if max_shift_px is None:
        max_shift_px = max(int(min(ref.shape) * 0.25), 4)

    ref_w = (ref - ref.mean()) * win
    shifts = np.zeros((video.shape[0], 2), dtype=np.float32)
    for i, frame in enumerate(video):
        f = frame.astype(np.float32)
        f = (f - f.mean()) * win
        shifts[i] = _phase_correlate_restricted(ref_w, f, max_shift_px)

    # El temblor es un movimiento suave (tiempo de correlacion ~0.3 s): un
    # filtro de mediana corto elimina los saltos aislados que quedan sin
    # tocar la trayectoria real.
    if smooth_frames > 1 and shifts.shape[0] > smooth_frames:
        from scipy.ndimage import median_filter
        shifts = median_filter(shifts, size=(smooth_frames, 1), mode="nearest")
    return shifts


def apply_shifts(video: np.ndarray, shifts: np.ndarray) -> np.ndarray:
    """Reencuadra cada frame para anular su desplazamiento."""
    out = np.empty_like(video, dtype=np.float32)
    h, w = video.shape[1:3]
    for i, frame in enumerate(video):
        m = np.array([[1, 0, -shifts[i, 0]], [0, 1, -shifts[i, 1]]], dtype=np.float32)
        out[i] = cv2.warpAffine(frame.astype(np.float32), m, (w, h),
                                flags=cv2.INTER_LINEAR,
                                borderMode=cv2.BORDER_REPLICATE)
    return out


def stabilize(video: np.ndarray, measure_residual: bool = True
              ) -> tuple[np.ndarray, np.ndarray, float]:
    """Estabiliza el video.

    Devuelve ``(video_estabilizado, desplazamientos, rms_residual_px)``.

    Lo que se controla no es cuanto se movio el dedo sino **cuanto movimiento
    quedo sin corregir**: un temblor grande bien compensado es inofensivo,
    mientras que un residuo pequeno pero sistematico arruina la velocimetria.
    El residuo se mide volviendo a estimar el desplazamiento sobre el video ya
    corregido.
    """
    # Pasada 1: registro con peso uniforme, solo para quitar el grueso del
    # temblor. Es imprecisa porque el flujo sanguineo tira del registro.
    rough_shifts = estimate_shifts(video, weight=np.ones(video.shape[1:],
                                                         dtype=np.float32))
    rough = apply_shifts(video, rough_shifts)

    # El peso estatico debe calcularse **sobre el video ya enderezado**. Si se
    # calcula sobre el original, el temblor hace vibrar tambien a la piel, su
    # desviacion temporal se dispara y el peso acaba anulando el tejido junto
    # con la sangre: el registro se queda sin nada a lo que agarrarse. Sobre el
    # video enderezado, en cambio, lo unico que sigue variando es el flujo, que
    # es justo lo que hay que descartar.
    weight = static_weight(rough)

    # Pasada 2: registro definitivo sobre el video original, ya con el peso
    # correcto.
    shifts = estimate_shifts(video, weight=weight)
    out = apply_shifts(video, shifts)
    residual = (motion_rms_px(estimate_shifts(out, weight=weight))
                if measure_residual else 0.0)
    return out, shifts, residual


def motion_rms_px(shifts: np.ndarray) -> float:
    """Amplitud RMS del movimiento residual, en pixeles."""
    centered = shifts - shifts.mean(axis=0, keepdims=True)
    return float(np.sqrt((centered**2).sum(axis=1).mean()))
