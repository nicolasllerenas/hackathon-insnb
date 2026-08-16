"""Genera la cohorte sintetica y la procesa con el pipeline completo.

Cada paciente aporta una fila del dataset de entrenamiento. Es importante que
el pipeline se ejecute **entero** sobre el video (estabilizar, segmentar,
kymograph, velocimetria, deteccion) y no sobre atajos: el modelo debe aprender
a corregir los sesgos reales del detector, no los de una version idealizada.

Uso:
    python scripts/build_dataset.py --n-patients 250 --out data/cohorte.npz
"""

from __future__ import annotations

import argparse
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from michicheck.model import FEATURE_NAMES, extract_features
from michicheck.pipeline import aggregate, analyze_clip
from michicheck.synth import (
    CapillaryState,
    OpticalSetup,
    PatientState,
    render_capture,
)


def simulate_patient(args: tuple[int, float, int]) -> dict | None:
    """Simula y analiza un paciente completo."""
    seed, duration_s, n_capillaries = args
    rng = np.random.default_rng(seed)

    age = float(rng.uniform(1.0, 17.0))
    anc = float(np.exp(rng.uniform(np.log(60.0), np.log(6000.0))))
    patient = PatientState(age_years=age, anc_per_ul=anc)

    fototipo = str(rng.choice(["II", "III", "IV", "V", "VI"],
                              p=[0.08, 0.27, 0.35, 0.22, 0.08]))
    setup = OpticalSetup(
        duration_s=duration_s,
        fps=60.0,
        um_per_px=1.4,
        wavelength_nm=530.0,
        oblique=True,
        phototype=fototipo,
        tremor_um=float(rng.uniform(1.5, 8.0)),
        photon_scale=float(rng.uniform(600.0, 1800.0)),
        blur_um=float(rng.uniform(2.0, 6.0)),
    )
    d0 = float(rng.uniform(9.0, 21.0))
    v0 = float(rng.uniform(350.0, 1400.0))

    measurements = []
    for _ in range(n_capillaries):
        cap = CapillaryState(
            diameter_um=float(np.clip(rng.normal(d0, 1.2), 7.0, 25.0)),
            velocity_um_s=float(np.clip(rng.normal(v0, v0 * 0.15), 150.0, 2000.0)),
            visible_length_um=float(rng.uniform(120.0, 260.0)),
            curvature=float(rng.uniform(0.0, 0.35)),
            orientation_deg=float(rng.uniform(-25, 25)),
        )
        capture = render_capture(patient, cap, setup,
                                 seed=int(rng.integers(0, 2**31 - 1)),
                                 with_video=True)
        m = analyze_clip(capture.video, setup.um_per_px, setup.fps,
                         prior_velocity_um_s=v0)
        if m is not None:
            measurements.append(m)

    if not measurements:
        return None

    result = aggregate(measurements, age)
    if not np.isfinite(result.anc_estimate):
        return None

    return {
        "features": extract_features(result),
        "anc_true": anc,
        "age": age,
        "velocity_true": v0,
        "diameter_true": d0,
        "phototype": fototipo,
        "n_used": result.n_capillaries_used,
        "events": result.total_events,
        "anc_physical": result.anc_estimate,
        "conclusive": result.conclusive,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n-patients", type=int, default=250)
    parser.add_argument("--duration", type=float, default=30.0)
    parser.add_argument("--capillaries", type=int, default=5)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--seed", type=int, default=20260812)
    parser.add_argument("--out", type=str, default="data/cohorte.npz")
    args = parser.parse_args()

    jobs = [(args.seed + i, args.duration, args.capillaries)
            for i in range(args.n_patients)]

    start = time.time()
    rows: list[dict] = []
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        for i, row in enumerate(pool.map(simulate_patient, jobs, chunksize=1)):
            if row is not None:
                rows.append(row)
            if (i + 1) % 10 == 0:
                elapsed = time.time() - start
                rate = (i + 1) / elapsed
                eta = (len(jobs) - i - 1) / max(rate, 1e-9)
                print(f"  {i + 1}/{len(jobs)} pacientes "
                      f"({elapsed:.0f}s transcurridos, ETA {eta:.0f}s)",
                      flush=True)

    if not rows:
        raise SystemExit("No se genero ninguna fila utilizable.")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        out,
        features=np.stack([r["features"] for r in rows]),
        feature_names=np.array(FEATURE_NAMES),
        anc_true=np.array([r["anc_true"] for r in rows]),
        anc_physical=np.array([r["anc_physical"] for r in rows]),
        age=np.array([r["age"] for r in rows]),
        velocity_true=np.array([r["velocity_true"] for r in rows]),
        diameter_true=np.array([r["diameter_true"] for r in rows]),
        phototype=np.array([r["phototype"] for r in rows]),
        n_used=np.array([r["n_used"] for r in rows]),
        events=np.array([r["events"] for r in rows]),
        conclusive=np.array([r["conclusive"] for r in rows]),
    )
    severe = sum(r["anc_true"] < 500 for r in rows)
    print(f"\n{len(rows)} pacientes guardados en {out} "
          f"({severe} con neutropenia grave, {100 * severe / len(rows):.0f}%)")
    print(f"tiempo total {time.time() - start:.0f}s")


if __name__ == "__main__":
    main()
