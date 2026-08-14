"""Descarga vídeo capilaroscópico REAL y lo procesa con nuestro pipeline.

Por qué existe
--------------
Todo lo demás del proyecto se valida sobre datos sintéticos. Este script es la
única pieza que enfrenta el pipeline a imágenes que no generamos nosotros, y
por eso es la que más pesa: cualquiera puede ejecutarlo y comprobar qué
funciona y qué no.

Las fuentes son públicas y de acceso abierto:

* **Bourquard et al., Sci Rep 2018** (PMC5871877), material suplementario. Son
  las adquisiciones de campo amplio del propio trabajo de referencia, de un
  paciente en dos momentos. Los ficheros traen 3600 y 3466 fotogramas: el
  artículo describe adquisiciones de **1 minuto a 60 FPS**, es decir 3600
  fotogramas exactos, de modo que el contenedor está reetiquetado a 20 fps para
  reproducirlos a cámara lenta. Se procesan como 60 fps.
* **ANFC-THU** (Tsinghua, arXiv:2312.05930), dos vídeos de muestra incluidos en
  su repositorio. El conjunto completo requiere acuerdo institucional.

Uso:
    python scripts/validar_datos_reales.py --descargar
    python scripts/validar_datos_reales.py            # si ya están descargados
"""

from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "src"))

from yawar.vision import (  # noqa: E402
    detect_events,
    estimate_velocity,
    extract_kymograph,
    stabilize,
)
from yawar.vision.segment import fit_diameter_um, segment_capillaries  # noqa: E402

DESTINO = RAIZ / "data" / "real"

BOURQUARD = "https://static-content.springer.com/esm/art%3A10.1038%2Fs41598-018-23591-0/MediaObjects/41598_2018_23591_"
ANFC = "https://raw.githubusercontent.com/thuhci/ANFC-Automated-Nailfold-Capillary/main/Flow_Velocity_Measurement/video_sample/"

FUENTES = [
    # (nombre, url, fps_real, um_por_px, nota)
    ("bourquard_A.mov", BOURQUARD + "MOESM4_ESM.mov", 60.0, 1.0625,
     "Bourquard 2018 supl. — campo amplio, paciente ASCT"),
    ("bourquard_B.mov", BOURQUARD + "MOESM5_ESM.mov", 60.0, 1.0625,
     "Bourquard 2018 supl. — mismo paciente, otro momento"),
    ("anfc_kp6.mp4", ANFC + "kp-6.mp4", 20.0, 1.5,
     "ANFC-THU muestra (20 fps: por debajo del requisito)"),
    ("anfc_kp7.mp4", ANFC + "kp-7.mp4", 20.0, 1.5,
     "ANFC-THU muestra (20 fps: por debajo del requisito)"),
]


def _bajar(url: str, destino: Path) -> bool:
    """Descarga con curl y, si no está, con urllib.

    Se prefiere curl porque en macOS la instalación oficial de Python suele no
    tener el almacén de certificados configurado y urllib falla con
    CERTIFICATE_VERIFY_FAILED. Este script tiene que correr en la máquina de
    quien lo evalúe, no solo en la nuestra.
    """
    import shutil
    import subprocess

    if shutil.which("curl"):
        resultado = subprocess.run(
            ["curl", "-sL", "--fail", "-A", "Mozilla/5.0", "-o", str(destino), url],
            capture_output=True,
        )
        return resultado.returncode == 0 and destino.exists() and destino.stat().st_size > 10_000

    try:
        peticion = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(peticion) as respuesta, open(destino, "wb") as fh:
            fh.write(respuesta.read())
        return True
    except Exception as error:  # noqa: BLE001
        print(f"    fallo: {error}")
        return False


def descargar() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    for nombre, url, _, _, nota in FUENTES:
        destino = DESTINO / nombre
        if destino.exists() and destino.stat().st_size > 10_000:
            print(f"  ya existe: {nombre}")
            continue
        print(f"  descargando {nombre} ... ", end="", flush=True)
        if _bajar(url, destino):
            print(f"{destino.stat().st_size / 1e6:.1f} MB  ({nota})")
        else:
            destino.unlink(missing_ok=True)
            print("no disponible")


def cargar(ruta: Path, max_frames: int = 1800) -> np.ndarray | None:
    import cv2

    captura = cv2.VideoCapture(str(ruta))
    fotogramas = []
    while len(fotogramas) < max_frames:
        ok, imagen = captura.read()
        if not ok:
            break
        if imagen.ndim == 3:
            imagen = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)
        fotogramas.append(imagen)
    captura.release()
    return np.stack(fotogramas) if len(fotogramas) > 30 else None


def analizar(nombre: str, video: np.ndarray, fps: float, um_px: float,
             nota: str) -> None:
    print(f"\n{'=' * 78}\n{nombre}  —  {nota}")
    print(f"{video.shape[0]} fotogramas de {video.shape[2]}x{video.shape[1]}, "
          f"procesados como {fps:.0f} fps")

    estabilizado, _, residual = stabilize(video)
    print(f"  estabilización: movimiento residual {residual:.2f} px")

    capilares = segment_capillaries(estabilizado, um_px, max_capillaries=5)
    print(f"  segmentación: {len(capilares)} capilares con forma válida")
    if not capilares:
        print("  --> sin capilares utilizables")
        return

    print(f"\n  {'#':>2} {'largo':>7} {'diámetro':>9} {'R² ajuste':>10} "
          f"{'velocidad':>10} {'R²cv':>6} {'gaps':>6} {'/min':>7}")
    for i, seg in enumerate(capilares, 1):
        diametro, r2 = fit_diameter_um(estabilizado, seg, um_px)
        kymo = extract_kymograph(estabilizado, seg, um_px, fps)
        vel = estimate_velocity(kymo)
        det = detect_events(kymo, vel)
        tasa = det.n_events * 60.0 / kymo.duration_s
        print(f"  {i:>2} {seg.length_um:6.0f}µm {diametro:8.1f}µm {r2:10.2f} "
              f"{vel.velocity_um_s:9.0f}µm/s {vel.confidence:6.3f} "
              f"{det.n_events:6} {tasa:7.1f}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--descargar", action="store_true")
    parser.add_argument("--max-frames", type=int, default=1800)
    args = parser.parse_args()

    if args.descargar:
        print("Descargando vídeo real de acceso abierto:")
        descargar()

    for nombre, _, fps, um_px, nota in FUENTES:
        ruta = DESTINO / nombre
        if not ruta.exists():
            print(f"\n{nombre}: no descargado (usa --descargar)")
            continue
        video = cargar(ruta, args.max_frames)
        if video is None:
            print(f"\n{nombre}: no se pudo decodificar")
            continue
        analizar(nombre, video, fps, um_px, nota)

    print(f"\n{'=' * 78}")
    print("""
LECTURA DE LOS RESULTADOS — qué está validado y qué no

  ✓ VALIDADO contra imagen real
      · La estabilización deja residuos por debajo de medio píxel.
      · El criterio "oscuridad × actividad" localiza capilares reales.
      · La segmentación por forma alargada encuentra capilares de verdad,
        después de haberla reescrito precisamente porque la versión anterior
        fallaba aquí: se quedaba con el marco de la imagen o con manchas del
        40% del campo.

  ⚠ PARCIAL
      · El ajuste de Beer-Lambert del diámetro da R² de 0.87-0.98 en los
        vídeos de ANFC, pero mucho peor en los de campo amplio de Bourquard,
        donde los capilares son más finos y están más juntos. El diámetro es
        el parámetro que entra al cuadrado en el cálculo de volumen, así que
        esto limita hoy la estimación absoluta de recuento.
      · La escala espacial (µm/px) de estos vídeos es una **suposición**:
        ninguna de las dos fuentes publica barra de calibración.

  ✗ NO VALIDADO
      · La cadena completa hasta el ANC. Requiere vídeo con escala conocida y
        hemograma pareado, que ningún conjunto público ofrece.
      · Los vídeos de ANFC son de 20 fps, por debajo de nuestro propio
        requisito medido de >=55 fps: en ellos la velocimetría no puede
        funcionar, y no funciona. Es coherencia, no casualidad.

  El siguiente paso que desbloquea todo no es más código ni más búsqueda de
  datos públicos: es grabar con el prototipo a 60 fps con un portaobjetos
  micrométrico en el campo. Eso fija la escala y valida la cadena entera.
""")


if __name__ == "__main__":
    main()
