#!/usr/bin/env bash
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

echo "── MichiCheck · demo ────────────────────────────────────────────"

if [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
else
  PY="$(command -v python3 || command -v python)"
  echo "  (sin .venv; usando $PY)"
fi

if ! "$PY" -c "import fastapi, cv2, sklearn" 2>/dev/null; then
  echo "  Faltan dependencias. Instalando..."
  "$PY" -m pip install -q -e ".[api,viz]" || {
    echo "  ERROR: no se pudieron instalar. Ejecuta:"
    echo "    python -m venv .venv && source .venv/bin/activate"
    echo "    pip install -e '.[api,viz,dev]'"
    exit 1
  }
fi

"$PY" - <<'PYCHECK'
import sys
sys.path.insert(0, "src")
from michicheck.optics import wbc_from_event_rate, anc_from_wbc
from michicheck.companion import referencias
valor = wbc_from_event_rate(32.0)
assert abs(valor - 3773) / 3773 < 0.01, "el modelo físico no reproduce la literatura"
print(f"  ✓ modelo físico OK (32 gaps/min → {valor:.0f} células/µL; el paper: 3773)")
print(f"  ✓ umbral adulto de 7 gaps/min en un niño de 2 años → ANC "
      f"{anc_from_wbc(wbc_from_event_rate(7.0), 2):.0f} (debería ser 500)")
cob = referencias.cobertura()
print(f"  ✓ red nacional: {cob['centros']} establecimientos, "
      f"{cob['centros_oncologicos_pediatricos']} oncológicos pediátricos, "
      f"{len(cob['departamentos_sin_centro_oncologico'])} departamentos sin ninguno")
PYCHECK

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

echo "  levantando interfaces..."
"$PY" -m http.server 8080 --directory apps --bind 127.0.0.1 >/dev/null 2>&1 &
WEB_PID=$!

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

    App del NIÑO y su familia:      http://127.0.0.1:8080/michi/
    Consola clínica del INSNSB:     http://127.0.0.1:8080/insn/
    API y documentación:            http://127.0.0.1:8000/docs

  DOS SISTEMAS, UN SOLO BACKEND

    /michi/  → el juguete digital. Lo usa el niño todos los días.
    /insn/   → la consola del instituto. Enrolamiento, estados y referencias.

  GUION DE 5 MINUTOS

    1. /insn/ → «Entregar michi». Es el primer control: se capturan el
       paciente, las fechas, el apoderado y —lo que hoy nadie captura— la
       HORA A LA QUE SALE DE TRABAJAR y si pueden viajar a Lima.
       Marcar «no puede viajar a Lima». Generar ficha.
       → Sale el código de vinculación y la ventana de alertas.

    2. /michi/ → así lo ve el niño. Tocar al gato: maúlla, ronronea, pide
       atención. Acariciar. Ir a «Aprender» y abrir «Las tres reglas de la
       6-MP»: ese es el rol educativo.

    3. Volver a la pantalla del michi y tocar «Dedito».
       Mantener el dedo sobre la nariz sin soltar.
       → Ese es el tamizaje. El gato ronronea mientras mide.

    4. Si sale GRAVE o PRIORIZABLE: «Abrir teleconsulta» →
       «No podemos viajar a Lima» → el sistema emite la REFERENCIA al
       establecimiento capaz más cercano y dice cuántas horas de viaje evita.

    5. /insn/ → «Tablero». Los tres estados y, junto a ellos, el estado del
       juguete. Abrir a Joaquín Ccahuana: su michi lleva 5 días callado.
       Esa es la señal de abandono más temprana del sistema: llega antes que
       la cita perdida.

    6. /insn/ → «Red nacional»: 10 centros oncológicos pediátricos en 4
       departamentos; 21 departamentos dependen de la teleconsulta.

    7. /insn/ → «Galenus / HL7»: el ORU^R01 que recibe el HIS del instituto,
       marcado como PRELIMINAR y con el método explícito.

  Ctrl-C para detener.

FIN

wait
