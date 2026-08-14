"""Genera las figuras del pitch en docs/figuras/.

Son las dos visuales que sostienen la presentación: el hallazgo pediátrico
(por qué el umbral del adulto no sirve) y la comparación visual entre un niño
sano y uno neutropénico.
"""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from yawar.optics import (  # noqa: E402
    anc_from_wbc,
    event_threshold_for_anc,
    neutrophil_fraction_for_age,
    wbc_from_event_rate,
)
from yawar.synth import (  # noqa: E402
    CapillaryState,
    OpticalSetup,
    PatientState,
    render_capture,
)

SALIDA = Path(__file__).resolve().parents[1] / "docs" / "figuras"
AZUL, ROJO, GRIS = "#0b2545", "#c1121f", "#5b6472"

plt.rcParams.update({
    "font.size": 11, "axes.spines.top": False, "axes.spines.right": False,
    "figure.facecolor": "white", "savefig.dpi": 160, "savefig.bbox": "tight",
})


def figura_umbral_pediatrico() -> None:
    """El hallazgo central: el umbral del adulto pierde la franja crítica."""
    fig, ax = plt.subplots(1, 2, figsize=(12, 4.4))
    edades = np.linspace(0.5, 21, 300)

    ax[0].plot(edades, [neutrophil_fraction_for_age(e) for e in edades],
               lw=2.5, color=ROJO)
    ax[0].axvspan(1, 4, alpha=.10, color=ROJO)
    ax[0].annotate("predominio\nlinfocitario", (2.5, 0.33), xytext=(7.0, 0.36),
                   fontsize=10, color=ROJO, ha="left", va="center",
                   arrowprops=dict(arrowstyle="->", color=ROJO, lw=1.2))
    ax[0].set_ylim(0.28, 0.63)
    ax[0].set_xlabel("edad (años)")
    ax[0].set_ylabel("neutrófilos / leucocitos totales")
    ax[0].set_title("El método cuenta leucocitos, no neutrófilos", fontweight="bold")
    ax[0].grid(alpha=.25)

    anc_umbral_adulto = [anc_from_wbc(wbc_from_event_rate(7.0), e) for e in edades]
    ax[1].plot(edades, anc_umbral_adulto, lw=2.5, color=AZUL,
               label="ANC al que salta la alerta\ncon el umbral adulto (7 gaps/min)")
    ax[1].axhline(500, ls="--", color=ROJO, lw=2, label="ANC 500 — donde hay que actuar")
    ax[1].fill_between(edades, anc_umbral_adulto, 500,
                       where=np.array(anc_umbral_adulto) < 500,
                       color=ROJO, alpha=.18)
    ax[1].annotate("franja perdida", (5.0, 405), color=ROJO, fontsize=11,
                   fontweight="bold")
    ax[1].annotate(f"a los 2 años la alerta\nrecién salta en ANC "
                   f"{anc_from_wbc(wbc_from_event_rate(7.0), 2):.0f}",
                   (2, 272), xytext=(7.5, 285), fontsize=10, color=ROJO,
                   va="center",
                   arrowprops=dict(arrowstyle="->", color=ROJO, lw=1.2))
    ax[1].set_ylim(230, 660)
    ax[1].set_xlabel("edad (años)"); ax[1].set_ylabel("ANC (/µL)")
    ax[1].set_title("El umbral del adulto no sirve en pediatría", fontweight="bold")
    ax[1].legend(fontsize=9, loc="upper left", framealpha=.95)
    ax[1].grid(alpha=.25)

    fig.savefig(SALIDA / "01_umbral_pediatrico.png")
    plt.close(fig)


def figura_sano_vs_neutropenico() -> None:
    """Por qué hace falta el algoritmo: el dato crudo no distingue nada.

    Es tentador enseñar dos kymographs y decir "vean la diferencia". No la hay:
    la textura del tren de eritrocitos domina la imagen y los gaps quedan
    enterrados en ella. Presentarlo de otro modo sería vender humo, y el jurado
    lo notaría al mirar la figura.

    Lo que sí separa los casos es la reproyeccion al marco material, que es
    justamente el aporte algoritmico. La figura cuenta esa historia: dato crudo
    ambiguo a la izquierda, discriminacion limpia a la derecha.
    """
    from yawar.vision import (
        detect_events,
        estimate_velocity,
        extract_kymograph,
        segment_capillary,
        stabilize,
    )

    setup = OpticalSetup(duration_s=60.0, fps=60.0)
    casos = [
        (3000.0, "ANC 3000 · recuento normal", "#1b7f4b"),
        (250.0, "ANC 250 · neutropenia grave", ROJO),
    ]

    fig, axes = plt.subplots(2, 3, figsize=(15, 6.2),
                             gridspec_kw={"width_ratios": [0.85, 1.35, 2.2]})
    for fila, (anc, titulo, color) in enumerate(casos):
        cap = render_capture(PatientState(age_years=8, anc_per_ul=anc),
                             CapillaryState(), setup, seed=7, with_video=True)
        video, _, _ = stabilize(cap.video)
        seg = segment_capillary(video, setup.um_per_px)
        kymo = extract_kymograph(video, seg, setup.um_per_px, setup.fps)
        vel = estimate_velocity(kymo, prior_velocity_um_s=800.0)
        det = detect_events(kymo, vel)

        axes[fila, 0].imshow(cap.video[0], cmap="gray")
        axes[fila, 0].set_title(titulo, fontweight="bold", color=color, fontsize=11)
        axes[fila, 0].axis("off")

        axes[fila, 1].imshow(kymo.data[:420].T, aspect="auto", cmap="gray",
                             origin="lower",
                             extent=[0, 420 / setup.fps, 0, kymo.length_um])
        axes[fila, 1].set_ylabel("posición (µm)", fontsize=9)
        if fila == 0:
            axes[fila, 1].set_title("kymograph crudo\n(indistinguibles)",
                                    fontsize=10, color=GRIS)
        if fila == 1:
            axes[fila, 1].set_xlabel("tiempo (s)", fontsize=9)

        p = det.projection
        v = p.valid & np.isfinite(p.profile)
        # La coordenada material crece hacia atras (la sangre que ya paso);
        # se invierte para que el eje se lea como "columna recorrida".
        xi_mm = (p.xi_um[v] - p.xi_um[v].min()) / 1000.0
        axes[fila, 2].plot(xi_mm, p.profile[v], lw=.7, color="#333")
        if det.positions_um.size:
            alturas = np.interp(det.positions_um, p.xi_um[v], p.profile[v])
            axes[fila, 2].plot((det.positions_um - p.xi_um[v].min()) / 1000.0,
                               alturas, "v", color=color, ms=8, mec="k", mew=.5)
        axes[fila, 2].set_ylabel("intensidad", fontsize=9)
        plural = "leucocito" if det.n_events == 1 else "leucocitos"
        axes[fila, 2].set_title(
            f"marco material — {det.n_events} {plural} detectados "
            f"({det.n_events * 60 / setup.duration_s:.0f}/min)"
            if det.n_events != 1 else
            f"marco material — 1 leucocito detectado "
            f"({det.n_events * 60 / setup.duration_s:.0f}/min)",
            fontsize=11, color=color, fontweight="bold")
        axes[fila, 2].grid(alpha=.25)
        if fila == 1:
            axes[fila, 2].set_xlabel("columna de sangre recorrida (mm)", fontsize=9)

    fig.suptitle("El dato crudo no distingue los casos. La reproyección al marco "
                 "material, sí.", fontsize=12.5, fontweight="bold", y=1.0)
    fig.tight_layout()
    fig.savefig(SALIDA / "02_sano_vs_neutropenico.png", dpi=140)
    plt.close(fig)


def figura_requisito_fps() -> None:
    """El requisito de hardware, medido."""
    fps = [30, 60, 120, 240]
    datos = {
        "ANC 3000": [81.2, 6.9, 5.5, 3.9],
        "ANC 600": [22.2, 7.3, 4.5, 5.0],
        "ANC 200": [81.2, 18.2, 10.0, 1.9],
    }
    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    x = np.arange(len(fps)); ancho = 0.26
    for i, (etiqueta, valores) in enumerate(datos.items()):
        ax.bar(x + (i - 1) * ancho, valores, ancho, label=etiqueta)
    ax.axhline(10, ls="--", color=GRIS, lw=1.5)
    ax.text(3.35, 11.5, "límite aceptable", fontsize=9, color=GRIS, ha="right")
    ax.axvspan(-0.5, 0.5, color=ROJO, alpha=.10)
    ax.text(0, 88, "inservible", ha="center", color=ROJO, fontweight="bold")
    ax.set_xticks(x); ax.set_xticklabels([f"{f} fps" for f in fps])
    ax.set_ylabel("error de velocimetría (%)")
    ax.set_title("El requisito no es resolución: es tasa de fotogramas",
                 fontweight="bold")
    ax.legend(); ax.grid(alpha=.25, axis="y")
    fig.savefig(SALIDA / "03_requisito_fps.png")
    plt.close(fig)


def figura_metricas() -> None:
    """ROC y calibración del modelo final, si existe la cohorte."""
    ruta = Path(__file__).resolve().parents[1] / "data" / "cohorte.npz"
    if not ruta.exists():
        print("  (sin cohorte: se omite la figura de métricas)")
        return

    from sklearn.metrics import roc_curve
    from yawar.model import cross_validate, label_severe, physics_only_auc

    d = np.load(ruta, allow_pickle=True)
    X, anc = d["features"], d["anc_true"]
    y = label_severe(anc)
    proba, met = cross_validate(X, y, anc, target_sensitivity=0.95)

    fig, ax = plt.subplots(1, 2, figsize=(11.5, 4.4))
    fpr, tpr, _ = roc_curve(y, proba)
    ax[0].plot(fpr, tpr, lw=2.5, color=AZUL, label=f"modelo · AUC {met.auc:.3f}")
    fpr_f, tpr_f, _ = roc_curve(y, -X[:, 0])
    ax[0].plot(fpr_f, tpr_f, lw=1.5, ls="--", color=GRIS,
               label=f"física sola · AUC {physics_only_auc(X, y):.3f}")
    ax[0].plot([0, 1], [0, 1], ":", color="#bbb")
    ax[0].scatter([1 - met.specificity], [met.sensitivity], s=90, color=ROJO,
                  zorder=5, label=f"operativo · S {met.sensitivity:.2f} / E {met.specificity:.2f}")
    ax[0].set_xlabel("1 − especificidad"); ax[0].set_ylabel("sensibilidad")
    ax[0].set_title(f"Validación cruzada por paciente (n={met.n_patients})",
                    fontweight="bold")
    ax[0].legend(fontsize=9, loc="lower right"); ax[0].grid(alpha=.25)

    phys = np.expm1(X[:, 0])
    sc = ax[1].scatter(anc, phys, c=proba, cmap="RdYlGn_r", s=22,
                       edgecolor="k", linewidth=.3, vmin=0, vmax=1)
    lim = [60, 8000]
    ax[1].plot(lim, lim, "--", color=GRIS, lw=1.2)
    ax[1].axvline(500, color=ROJO, ls=":", lw=1.5)
    ax[1].axhline(500, color=ROJO, ls=":", lw=1.5)
    ax[1].set_xscale("log"); ax[1].set_yscale("log")
    ax[1].set_xlim(lim); ax[1].set_ylim(lim)
    ax[1].set_xlabel("ANC real (/µL)"); ax[1].set_ylabel("ANC estimado (/µL)")
    ax[1].set_title("Estimación física frente a la verdad", fontweight="bold")
    plt.colorbar(sc, ax=ax[1], label="P(neutropenia grave)")
    ax[1].grid(alpha=.25)

    fig.savefig(SALIDA / "04_metricas.png")
    plt.close(fig)
    print(f"  AUC {met.auc:.3f} · S {met.sensitivity:.3f} · E {met.specificity:.3f} "
          f"· VPN {met.npv:.3f}")


if __name__ == "__main__":
    SALIDA.mkdir(parents=True, exist_ok=True)
    for nombre, fn in [
        ("umbral pediátrico", figura_umbral_pediatrico),
        ("sano vs neutropénico", figura_sano_vs_neutropenico),
        ("requisito de fps", figura_requisito_fps),
        ("métricas", figura_metricas),
    ]:
        print(f"generando: {nombre}")
        fn()
    for f in sorted(SALIDA.glob("*.png")):
        print(f"  {f.relative_to(SALIDA.parents[1])}  ({f.stat().st_size // 1024} KB)")
