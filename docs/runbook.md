# Runbook — cómo ejecutar y demostrar la parte de software

> Documento operativo. Comandos exactos, en orden, con lo que debe salir en
> cada paso. Si algo no sale así, está roto.

---

## 0. Puesta en marcha (una sola vez, ~10 min)

```bash
git clone <vuestro-repo> && cd <vuestro-repo>
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[api,viz,dev]"
```

Comprobación de que el núcleo está sano:

```bash
pytest
```

**Debe salir:** `38 passed`. Si no, no sigáis: algo se rompió al instalar.

> Uno de esos 38 tests verifica que el modelo físico reproduce los valores
> publicados en el paper con menos del 1% de error. Si ese test falla, la
> física está mal y todo lo demás miente.

---

## 1. La demo, en un comando

```bash
bash scripts/demo.sh
```

**Debe imprimir:**

```
✓ modelo físico OK (32 gaps/min → 3773 células/µL; el paper: 3773)
✓ umbral adulto de 7 gaps/min en un niño de 2 años → ANC 272 (debería ser 500)
✓ Todo listo.
  Interfaz:  http://127.0.0.1:8080
  API:       http://127.0.0.1:8000/docs
```

Abrir **http://127.0.0.1:8080** en el navegador. `Ctrl-C` detiene todo.

### Si falla

| Síntoma | Causa | Solución |
|---|---|---|
| «no se pudieron instalar» | falta el venv | `python3 -m venv .venv && source .venv/bin/activate` |
| La interfaz carga pero no aparece el aviso amarillo de edad | la API no responde | comprobar `curl http://127.0.0.1:8000/api/v1/salud` |
| «Address already in use» | quedó un proceso vivo | `pkill -f uvicorn; pkill -f http.server` |

---

## 2. Guion de la demostración (3 minutos)

El caso es **una niña de 6 años en Bagua, día 10 post-quimio, con fiebre**.

### Paso 1 — Escribir la edad: `6`
> **Sale solo un aviso amarillo.** Es el argumento de innovación, y aparece sin
> que nadie lo pida: *«A esta edad solo el 51% de los leucocitos son
> neutrófilos, así que el umbral óptico correcto es 8.32 gaps/min. Con el
> umbral del adulto (7/min) la alerta recién saltaría en un ANC de 421, cuando
> ya debería haber saltado en 500.»*

**Qué decir:** «El dispositivo comercial que existe usa un umbral fijo derivado
de adultos. En un niño de 2 años ese umbral recién salta en un ANC de 272: se
pierde entera la franja donde hay que actuar.»

### Paso 2 — Contexto clínico
Temperatura `38.6` · días post-quimio `10` · horas al INSNSB `9` · catéter ✓

### Paso 3 — Señalar el indicador de presión
> Barra verde, «Presión correcta — 0.26 N».

**Qué decir:** «La presión dentro de un capilar del dedo es de 30 mmHg. Si el
niño aprieta, el capilar se cierra, no pasa ningún glóbulo blanco, y el
algoritmo concluye "neutropenia grave" con total seguridad. Un error de
posicionamiento se disfraza del hallazgo más alarmante posible.»

### Paso 4 — ANC simulado `380` → **Analizar**
Tarda ~20 s (analiza 5 capilares con el pipeline real).

> **Semáforo NEGRO · «Sospecha de neutropenia febril» · INMEDIATO (< 1 hora)**

**Qué decir:** «Y no entrega un número: entrega una conducta. Fíjense en la
acción — iniciar el antibiótico **antes** del traslado, no al llegar. Porque el
sistema sabe que el centro está a 9 horas.»

### Paso 5 — Bajar a «Cómo se llegó a este número»
> Gaps · capilares · nL vistos · µm/s de flujo · µm de diámetro, y debajo el
> razonamiento en lenguaje clínico.

**Qué decir:** «Un hematólogo puede auditar esto. Un modelo de caja negra no.»

### Paso 6 — «Ver mensaje HL7 para Galenus»
> Se abre el ORU^R01 real.

**Qué decir:** «Sale en los dos formatos que el sistema peruano necesita: HL7 v2
para el hospital y FHIR alineado con la guía nacional del MINSA para RENHICE.»

### Paso 7 — Pestaña «Cohorte»
> Ordenada por urgencia, no por fecha.

---

## 3. Demostrar la validación con datos reales

Esto es lo que separa «hicimos un simulador» de «lo probamos contra la
realidad». Vale la pena enseñarlo.

```bash
python scripts/validar_datos_reales.py --descargar
```

Descarga ~92 MB de vídeo capilaroscópico **real y de acceso abierto** (el
material suplementario del propio paper de referencia, más dos muestras del
dataset ANFC de Tsinghua) y lo pasa por nuestro pipeline. Al final imprime
qué está validado y qué no.

**Qué decir:** «Nuestro modelo está entrenado con datos sintéticos, y lo
decimos. Pero el pipeline sí lo enfrentamos a vídeo real: la estabilización, la
segmentación y el ajuste de diámetro funcionan sobre imágenes que no generamos
nosotros. Lo que no pudimos validar es la cadena hasta el ANC, porque hace
falta vídeo con escala conocida y hemograma pareado — y eso es exactamente lo
que le pedimos al instituto.»

---

## 4. Reproducir las gráficas y el modelo

```bash
python scripts/make_figures.py      # las 5 figuras, ~2 min
python scripts/make_notebook.py     # regenera el notebook de Colab
```

Reentrenar desde cero (**~20 min**, solo si hace falta):

```bash
python scripts/build_dataset.py --n-patients 300 --duration 30 --workers 8
```

---

## 5. Las cinco gráficas y para qué sirve cada una

| # | Archivo | Qué demuestra | Dónde va en la PPT |
|---|---|---|---|
| 1 | `01_umbral_pediatrico.png` | El umbral del adulto pierde la franja ANC 272–500 | **Innovación** — es la diapositiva más fuerte |
| 2 | `02_sano_vs_neutropenico.png` | El dato crudo no distingue los casos; la reproyección al marco material sí (40 leucocitos vs 1) | **Innovación** — justifica el algoritmo |
| 3 | `03_requisito_fps.png` | A 30 fps el método no funciona (81% de error) | **Viabilidad técnica** — demuestra rigor |
| 4 | `04_metricas.png` | ROC y estimación vs verdad. AUC 0.939 | **Impacto en salud** |
| 5 | `05_validacion_real.png` | El pipeline sobre vídeo real | **Credibilidad** — úsala cuando pregunten «¿y con datos reales?» |

---

## 6. Lo pendiente, por responsable

### 🔴 Bloqueante — sin esto no hay entrega

| Qué | Quién | Tiempo |
|---|---|---|
| Poner la URL del repo en el notebook (1 línea, celda 2) | CS | 1 min |
| Rellenar datos del equipo en `docs/anexo1_entrega_final.md` (campos `[…]`) | Representante | 15 min |
| Rellenar y firmar `docs/anexo2_declaracion_ia.md` | Representante | 10 min |
| Publicar el repo con licencia abierta (ya están LICENSE y LICENSE-DOCS) | CS | 5 min |
| **Anexo 3**: aclarar si el cirujano laparoscópico es un quinto integrante | Representante | — |

### 🟡 Importante — mejora mucho la nota

| Qué | Quién | Tiempo |
|---|---|---|
| **Que el médico revise y firme `docs/protocolo_clinico.md`** | Médico | 30 min |
| Confirmar las bandas ANC (la fuente que pasaron es internamente inconsistente) | Médico | 10 min |
| Enviar el correo a la OGTI del INSNSB (`docs/correos.md` §2) | Representante | 10 min |
| Ensayar la demo dos veces con el guion del §2 | Todos | 20 min |
| Confirmar el código RENIPRESS del instituto (usamos `00006213` provisional) | Representante | — |

### 🟢 Si sobra tiempo

| Qué | Quién |
|---|---|
| Enviar el correo a Tsinghua por el dataset (no llega para mañana, pero cuenta) | Docente |
| Imprimir el inserto óptico y **verificar con transportador que los 70° se respetan** | Mecatrónico |
| Flashear `firmware/yawar_esp32cam/` y **medir los fps reales** | Mecatrónico |
| Medir µm/px con portaobjetos micrométrico | Bioingeniero |

---

## 7. Plan B si algo se cae en el escenario

| Si falla… | Qué hacer |
|---|---|
| No hay internet | La demo es **enteramente local**. No necesita red. |
| No arranca la API | Enseñar el notebook de Colab, que corre solo. |
| No arranca nada | Las 5 figuras de `docs/figuras/` cuentan la historia completa. |
| El hardware no está listo | **Irrelevante**: el modo demostración genera la captura y la procesa con el pipeline real. Fue diseñado exactamente para esto. |

> Grabad un vídeo de pantalla de la demo funcionando **hoy**. Es el seguro más
> barato que existe.

---

## 8. Las tres frases que conviene no improvisar

1. **Sobre el alcance:** «No reemplazamos el hemograma. Llenamos los veinte días
   en que ese niño no tiene ninguno.»

2. **Sobre la validación:** «Nuestro AUC de 0.939 mide la coherencia del
   pipeline, no su exactitud clínica. Está entrenado con datos sintéticos
   generados desde la física, y no vamos a decir otra cosa.»

3. **Sobre lo que piden:** «Lo que falta no es más código. Son 30 o 50 vídeos
   reales con hemograma pareado. Y ese es el pedido que le hacemos al
   instituto.»
