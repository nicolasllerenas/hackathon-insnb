# Hardware — Yawar Ñan / KittyScope

> Todas las cifras salen de un cálculo o de una medición reproducible
> (`src/yawar/illumination.py`, `scripts/`). Los supuestos están marcados como
> tales.

---

## 1. Arquitectura

```
        ┌─ Lente invertida (reverse lens, 1:1) ─┐
Dedo ──▶│  pozo de glicerina · 3–4 mm           │──▶ OV2640 ──▶ ESP32-CAM
        └─ 2× LED 530 nm a 70° fuera de eje ────┘                 │
                                                    microSD ◀─────┤
                                                    WiFi ◀────────┘
                                                      │
                                            celular: vista previa
                                                 y control
```

El **ESP32-CAM captura y graba**; el celular sólo previsualiza y controla. Es
la inversión de la arquitectura habitual, y tiene una consecuencia técnica que
domina todo el diseño (§4).

---

## 2. La elección de 530 nm: validada, con una condición

### 2.1 El problema espectral

A 530 nm la hemoglobina absorbe **11 veces menos** que a 420 nm (banda de
Soret). Con iluminación directa eso da un contraste de gap de apenas 0.10,
frente a 0.47 a 420 nm: insuficiente.

| λ | μ sangre (µm⁻¹) | vs 420 nm |
|---|---|---|
| 415 nm | 0.1219 | 0.8× |
| 420 nm | 0.1000 | 1.0× |
| 520 nm | 0.0076 | 13.2× menos |
| **530 nm** | **0.0091** | **11.0× menos** |
| 577 nm | 0.0146 | 6.9× menos |

### 2.2 Lo que salva el diseño: la geometría oblicua

Con la fuente a 70° fuera del eje pasan dos cosas, y ninguna es campo oscuro:

1. **Se rechaza el reflejo especular** de la superficie de la piel y la uña, que
   iluminando de frente se suma al fondo y lava el contraste del capilar. El
   pozo de glicerina ayuda por la misma razón: iguala índices y elimina la
   interfaz aire–piel.
2. **La luz llega al capilar por dispersión difusa de la dermis**, es decir lo
   *transilumina desde atrás*. El camino óptico dentro de la sangre se alarga y
   la absorción se aprovecha mejor.

Los gaps siguen viéndose **brillantes** sobre lumen oscuro, igual que con luz
azul directa.

### 2.3 Medición

Estimación de ANC del pipeline completo sobre vídeo sintético (5 capilares,
20 s, ANC real en cabecera). La última columna es el **piso de falsos
positivos**: lo que el sistema detecta cuando no hay ningún leucocito.

| Configuración | ANC 2500 | ANC 800 | ANC 250 | **ANC 0** |
|---|---|---|---|---|
| 420 nm directo, fototipo II | 1566 | 546 | 116 | **0** |
| 420 nm directo, fototipo V | 1562 | 462 | 229 | **80** |
| 530 nm **directo**, fototipo IV | 1670 | 481 | 213 | **54** |
| **530 nm oblicuo, fototipo II** | 1602 | 424 | 120 | **0** |
| **530 nm oblicuo, fototipo IV** | 1596 | 528 | 154 | **0** |
| **530 nm oblicuo, fototipo V** | 1607 | 457 | 196 | **41** |

**530 nm oblicuo rinde igual que 420 nm directo.** El diseño se sostiene.

### 2.4 ⚠️ La obliquidad es estructural, no estética

Fila 3 de la tabla: con los mismos LED verdes montados **de frente**, el piso de
falsos positivos sube de 0 a 54. El equipo declararía neutropenia grave en un
niño sano.

Si el montaje mecánico no garantiza los ~70° reales, el dispositivo no funciona
— y falla en silencio, dando números plausibles. **Es lo primero que hay que
verificar el día 1**, antes que cualquier otra cosa.

> El factor de ganancia oblicua (4×) es el parámetro **más incierto** de todo el
> modelo (`illumination.py:illumination_budget`). Medirlo empíricamente —
> fotografiar el mismo capilar con la fuente a 0° y a 70° y comparar el
> contraste — es el experimento de mayor valor por hora invertida de todo el
> proyecto.

### 2.5 El hallazgo de equidad

La melanina absorbe con ley de potencias λ⁻³·³, así que castiga mucho más al
azul. Transmisión epidérmica (doble paso, 60 µm):

| Fototipo | 420 nm | 530 nm | ventaja del verde |
|---|---|---|---|
| II | 0.681 | 0.837 | 1.2× |
| III | 0.527 | 0.743 | 1.4× |
| **IV** | 0.359 | 0.622 | **1.7×** |
| **V** | 0.202 | 0.476 | **2.4×** |
| VI | 0.096 | 0.337 | 3.5× |

En una población pediátrica peruana —Fitzpatrick III–V mayoritarios— esto no es
un detalle académico. En la tabla de §2.3, el piso de falsos positivos para
fototipo V es **80 con azul y 41 con verde oblicuo**: el verde reduce a la mitad
el sesgo por color de piel.

**Pero no lo elimina.** El sistema sigue sobre-llamando neutropenia en niños de
piel más oscura (41 frente a 0). Clínicamente el error va hacia el lado seguro
—deriva de más, no de menos— pero significa **más viajes evitables a Lima para
los niños de piel más oscura**, que es exactamente la población con más barreras
de acceso.

Mitigaciones, en orden de facilidad:
1. Aumentar la potencia del LED o el tiempo de captura en fototipos IV–VI (más
   fotones, menos ruido). Es un cambio de software.
2. Calibrar el umbral por fototipo, registrándolo en la ficha del paciente.
3. Explorar 577 nm (banda α de la hemoglobina): absorbe 1.6× más que 530 nm y
   la melanina lo penaliza aún menos.

---

## 3. El hardware real: ESP32-CAM (AI-Thinker) + OV2640

Medido sobre el CAD entregado (`esp32_cam.step`: **27.0 × 48.0 mm**), el módulo
es un **AI-Thinker ESP32-CAM**: ESP32 clásico con sensor **OV2640**, no un
ESP32-S3 con OV5640. Los números cambian y conviene tenerlos claros.

### 3.1 Lo que el CAD confirma: el riesgo nº 1 está bien resuelto

Ejes de los taladros del inserto óptico, medidos directamente del fichero STEP:

| Elemento | Diámetro | Ángulo vs eje óptico |
|---|---|---|
| Alojamiento de LED | 5.30 mm | **70.0°** ✓ |
| Rebaje del LED | 8.50 mm | **70.0°** ✓ |
| Apertura de luz | 0.80 mm | **70.0°** ✓ |
| Eje óptico (lente / cámara) | 8.00 / 11.50 mm | 0.0° |

Inserto óptico: 74.7 × 20.0 × 20.6 mm.

**La geometría oblicua está en el diseño y es exacta.** Como el contraste a
530 nm depende por completo de ella (§2.4), ésta es la confirmación más
valiosa que aporta el CAD: el modo de fallo más peligroso del proyecto está
resuelto en el plano.

### 3.2 Óptica: lente invertida 1:1

Emparejando la lente del sistema con una segunda idéntica invertida se obtiene
**1:1**, y en ese régimen la resolución en el objeto es directamente el paso de
píxel del sensor.

| Sensor | Paso de píxel | µm/px a 1:1 | Capilar 15 µm |
|---|---|---|---|
| OV7670 | 3.6 µm | 3.60 | 4.2 px |
| **OV2640 (el del prototipo)** | **2.2 µm** | **2.20** | **6.8 px** |
| OV5640 | 1.4 µm | 1.40 | 10.7 px |

Los 5 capilares no son negociables: en el estudio de referencia el AUC pasa de
**0.68 con 1 capilar a 1.00 con 5**.

---

## 4. ⚠️ La trampa del firmware: ventana, no submuestreo

El requisito de ≥55 fps (§5) empuja de forma natural a bajar la resolución.
Hacerlo por submuestreo destruye la medición **sin dar ninguna señal de error**:
la imagen sale perfectamente bonita.

Con el OV2640 y lente invertida 1:1:

| Modo de captura | µm/px | Capilar 15 µm | Campo | Capilares* | Veredicto |
|---|---|---|---|---|---|
| QVGA por **submuestreo** | 11.00 | **1.4 px** | 3520 µm | 28 | ✗ **inservible** |
| **QVGA por VENTANA** | **2.20** | **6.8 px** | **704 µm** | **5.7** | **✓ correcto** |
| VGA por submuestreo | 5.50 | 2.7 px | 3520 µm | 28 | ✗ inservible |
| VGA por ventana | 2.20 | 6.8 px | 1408 µm | 11.4 | ✓ pero 25–30 fps |
| QQVGA por ventana | 2.20 | 6.8 px | 352 µm | 2.8 | campo corto |

\* capilares dentro del campo, a 124 µm de separación intercapilar pediátrica.

**Usar `set_res_raw()` con `scaling=false` y `binning=false` sobre una ventana
centrada del sensor.** No `set_framesize(FRAMESIZE_QVGA)`.

Los 704 µm de campo dan ~5.7 capilares: justo los 5 que exige el protocolo, en
una sola toma. Implementado en `firmware/yawar_esp32cam/`.

### 4.1 Tasa de fotogramas alcanzable

El OV2640 sobre ESP32 clásico da típicamente:

| Modo | fps |
|---|---|
| UXGA 1600×1200 | 5–8 |
| VGA 640×480 | 25–30 |
| **QVGA 320×240** | **45–50** |
| QQVGA 160×120 | ~60 |

**QVGA se queda justo por debajo de los 55 fps que necesita la velocimetría.**

No es fatal: a menor tasa el **conteo de gaps sigue siendo válido**, y lo único
que se pierde es la auto-calibración de velocidad. El software ya contempla el
plan B — la **velocidad basal por paciente**, medida una vez en el INSNSB con
hemograma pareado (`prior_velocity_um_s`), con el resultado marcado como
`velocidad_tomada_de_basal`.

Lo que sí hay que hacer el día 1 es **medir los fps reales**, no confiar en la
hoja de datos. El firmware los mide y los escribe en la cabecera de cada
captura, porque un vídeo sin ese dato es ininterpretable.

### 4.2 Tasa de datos

| Modo | MB/s | Por minuto |
|---|---|---|
| 320×240 @ 60 fps | 4.6 | 0.28 GB |
| 320×240 @ 45 fps | 3.5 | 0.21 GB |
| 640×480 @ 30 fps | 9.2 | 0.55 GB |

Un paciente completo (5 capilares × 60 s) son **~1.4 GB** a 320×240/60 fps.

> **No grabar en JPEG.** Los bloques DCT de 8×8 px equivalen a 17.6 µm, justo la
> escala de los gaps (~30 µm). Comprimir aquí es destruir la señal para ahorrar
> tarjeta. Grabar en escala de grises sin comprimir.

---


## 5. Tasa de fotogramas: requisito duro

Error de velocimetría medido (v real = 800 µm/s, mediana de 5 semillas):

| fps | ANC 3000 | ANC 1500 | ANC 600 | ANC 200 |
|---|---|---|---|---|
| **30** | 81% | 81% | 22% | 81% |
| **60** | 6.9% | 7.3% | 7.3% | 18.2% |
| 120 | 5.5% | 4.5% | 4.5% | 10.0% |
| 240 | 3.9% | 5.9% | 5.0% | 1.9% |

A 30 fps la sangre avanza 26.7 µm entre fotogramas y el tren de eritrocitos
tiene periodo ~11 µm: está aliaseado y es irrecuperable.

El error empeora cuando baja el ANC —justo el caso crítico— porque hay menos
gaps que seguir. De ahí la **velocidad basal por paciente** (§7).

---

## 6. Lo que resuelve el pozo de glicerina, y lo que no

**Resuelve, y muy bien:** la presión de contacto. La presión dentro de un
capilar ungueal es de 25–35 mmHg; si el niño apoya con más fuerza, el capilar se
colapsa, no pasa ningún leucocito y el algoritmo concluye «neutropenia grave»
con total coherencia interna. Un acoplamiento óptico por líquido a 3–4 mm de
distancia de trabajo **elimina el contacto mecánico con la óptica**, que era la
causa principal de ese fallo. Es mejor solución que el sensor de fuerza que
habíamos previsto.

**No resuelve del todo:** el dedo sigue apoyándose en el canal de inserción, y
un niño puede empujar hacia abajo comprimiendo el pliegue ungueal contra el
borde del pozo. Sigue valiendo la pena:

- una **FSR pequeña en el borde del canal** (no bajo la yema) como testigo; o
- detectarlo por software: **flujo cero con capilares bien segmentados es
  fisiológicamente improbable** y debe marcarse como sospecha de oclusión, no
  como neutropenia.

La segunda opción no cuesta hardware y ya está prevista en el pipeline
(`quality_flags`). Recomendado implementarla en cualquier caso.

---

## 7. Calibración por unidad y por paciente

**Por unidad** (30 min, una sola vez):
1. **Escala espacial (µm/px)** fotografiando un portaobjetos micrométrico. Es el
   parámetro más importante: entra al cuadrado en el cálculo de volumen.
2. **Verificación de fps real** grabando un cronómetro y contando fotogramas.
   Muchos sensores anuncian 60 fps y entregan menos con poca luz — y aquí
   siempre hay poca luz.
3. **Contraste oblicuo** (§2.4): el experimento de 0° vs 70°.
4. **Corriente del LED** y consigna del fotodiodo con el pozo cargado.

**Por paciente**, en el control presencial con hemograma: velocidad de flujo,
diámetro capilar y fracción de neutrófilos. El equipo se empareja con el niño,
no con la población.

---

## 8. BOM

| # | Componente | Cant. | Precio (S/) | Notas |
|---|---|---|---|---|
| 1 | **ESP32-CAM AI-Thinker** (ESP32 + OV2640) | 1 | 45–70 | El del CAD entregado. Cámara incluida; **readout por ventana** (§4) |
| 1b | Programador FTDI para ESP32-CAM | 1 | 15–25 | El módulo no trae USB |
| 3 | Lente para configuración invertida | 2 | 20–50 | Recuperables de móviles en desuso |
| 4 | LED 530 nm × 2 | 2 | 8–20 | Montaje a 70° fuera de eje — **crítico** (§2.4) |
| 5 | Resistencia limitadora (verde, Vf≈3.2 V) | 2 | <2 | ~90 Ω desde 5 V para 20 mA |
| 6 | MOSFET AO3400 | 2 | 3–6 | Estrobo y control de corriente |
| 7 | Fotodiodo BPW34 + NTC 10k | 1 | 10–18 | Estabilidad de iluminación |
| 8 | microSD 32 GB clase 10 | 1 | 20–35 | ≥10 MB/s de escritura sostenida |
| 9 | Batería LiPo + cargador Qi | 1 | 45–80 | |
| 10 | Glicerina USP | 1 frasco | 10–15 | Acoplamiento óptico |
| 11 | Insertos desechables (impresión 3D) | lote | 15–25 | Higiene entre pacientes |
| 12 | Carcasa impresa 3D (PLA) | 1 | 15–25 | |
| 13 | FSR pequeña (opcional, §6) | 1 | 25–40 | Testigo de presión en el canal |
| 14 | Software | — | 0 | Apache-2.0, este repositorio |

**Total estimado: S/ 226 – 401 (USD 60 – 108) por unidad.**

Sube respecto a la estimación inicial porque el dispositivo ahora es autónomo
(cámara, almacenamiento y batería propios) en vez de depender del celular. A
cambio no requiere un smartphone de gama suficiente en cada posta, que era el
supuesto más frágil del diseño anterior. Sigue estando tres órdenes de magnitud
por debajo de un citómetro de flujo.

---

## 9. Riesgos de construcción, por prioridad

| # | Riesgo | Cómo se detecta | Cuándo verificar |
|---|---|---|---|
| 1 | ~~Obliquidad insuficiente~~ | **RESUELTO en el CAD: 70.0° exactos** (§3.1). Verificar solo que la pieza impresa respeta la cota | impresión |
| 2 | **Submuestreo en vez de ventana** → capilar de 1.4 px | Medir µm/px con portaobjetos micrométrico | **Día 1** |
| 3 | **fps real < 55** (probable con OV2640: da 45–50) | El firmware los mide y los graba en la cabecera | **Día 1** |
| 4 | Grabación en JPEG → artefactos en la escala del gap | Inspeccionar el kymograph: bloques de 8 px | Día 2 |
| 5 | Escritura a microSD no sostiene 4.6 MB/s → fotogramas perdidos | El firmware cuenta los perdidos y avisa si superan el 5% | Día 2 |
| 6 | Sesgo por fototipo (§2.5) | Comparar piso de falsos positivos entre voluntarios | Día 3 |
