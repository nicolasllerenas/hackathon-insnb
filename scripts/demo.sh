#!/usr/bin/env bash
# Levanta la demo completa de Yawar Ñan con un solo comando.
#
#   bash scripts/demo.sh
#
# Deja la API en http://127.0.0.1:8000 y la interfaz en http://127.0.0.1:8080
# Ctrl-C detiene ambas.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

echo "── Yawar Ñan · demo ────────────────────────────────────────────"

# 1. Entorno
if [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
else
  PY="$(command -v python3 || command -v python)"
  echo "  (sin .venv; usando $PY)"
fi

# 2. Dependencias mínimas
if ! "$PY" -c "import fastapi, cv2, sklearn" 2>/dev/null; then
  echo "  Faltan dependencias. Instalando..."
  "$PY" -m pip install -q -e ".[api,viz]" || {
    echo "  ERROR: no se pudieron instalar. Ejecuta:"
    echo "    python -m venv .venv && source .venv/bin/activate"
    echo "    pip install -e '.[api,viz,dev]'"
    exit 1
  }
fi

# 3. Comprobación rápida de que el núcleo funciona
"$PY" - <<'PYCHECK'
import sys
sys.path.insert(0, "src")
from yawar.optics import wbc_from_event_rate, anc_from_wbc
valor = wbc_from_event_rate(32.0)
assert abs(valor - 3773) / 3773 < 0.01, "el modelo físico no reproduce la literatura"
print(f"  ✓ modelo físico OK (32 gaps/min → {valor:.0f} células/µL; el paper: 3773)")
print(f"  ✓ umbral adulto de 7 gaps/min en un niño de 2 años → ANC "
      f"{anc_from_wbc(wbc_from_event_rate(7.0), 2):.0f} (debería ser 500)")
PYCHECK

# 4. Servicios
limpiar() {
  echo ""
  echo "  deteniendo servicios..."
  kill "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap limpiar EXIT INT TERM

echo "  levantando API..."
"$PY" -m uvicorn services.api.main:app --host 127.0.0.1 --port 8000 \
  --log-level warning &
API_PID=$!

echo "  levantando interfaz..."
"$PY" -m http.server 8080 --directory apps/web --bind 127.0.0.1 >/dev/null 2>&1 &
WEB_PID=$!

# Espera activa a que la API responda
for _ in $(seq 1 40); do
  if curl -sf http://127.0.0.1:8000/api/v1/salud >/dev/null 2>&1; then break; fi
  sleep 0.5
done

if ! curl -sf http://127.0.0.1:8000/api/v1/salud >/dev/null 2>&1; then
  echo "  ERROR: la API no respondió."
  exit 1
fi

cat <<'FIN'

  ✓ Todo listo.

    Interfaz (abrir en el navegador):  http://127.0.0.1:8080
    API y documentación interactiva:   http://127.0.0.1:8000/docs

  GUION SUGERIDO PARA LA DEMOSTRACIÓN

    1. Escribe la edad: 6 años.
       → Aparece solo el aviso pediátrico: a esa edad el umbral correcto
         son 8.0 gaps/min, y con el umbral del adulto la alerta recién
         saltaría en un ANC de 437.

    2. Temperatura 38.6 · día 10 post-quimio · 9 horas al INSNSB · catéter.

    3. Fíjate en el indicador de presión: si el niño aprieta, el capilar se
       cierra y el resultado saldría falsamente alarmante.

    4. ANC simulado 380 → "Analizar".
       → Semáforo NEGRO, plazo INMEDIATO (< 1 hora).
       → La acción dice: iniciar antibiótico ANTES del traslado, no al llegar.

    5. "Ver mensaje HL7 para Galenus" → el ORU^R01 que recibiría el hospital.

    6. Pestaña "Cohorte" → ordenada por urgencia, no por fecha.

  Ctrl-C para detener.

FIN

wait
