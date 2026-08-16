# Firmware

`michicheck_esp32cam/` — ESP32-CAM (AI-Thinker, OV2640), que es el módulo del CAD
entregado (`esp32_cam.step`, 27.0 × 48.0 mm).

## Lo único imprescindible antes de tocar el código

El OV2640 tiene un paso de píxel de 2.2 µm. Con la lente invertida en 1:1 eso
son 2.2 µm por píxel **en el objeto** — pero sólo si se lee el sensor a
resolución nativa.

`set_framesize(FRAMESIZE_QVGA)` **no** hace eso: submuestrea desde 1600×1200,
tirando 4 de cada 5 píxeles. Resultado: 11 µm/px, un capilar de 15 µm ocupa
1.4 píxeles y la medición es imposible. Y no da ningún error — la imagen sale
bonita.

Este firmware usa `set_res_raw(..., scaling=false, binning=false)` sobre una
ventana centrada de 320×240. Eso da 2.2 µm/px, campo de 704 × 528 µm y ~5.7
capilares por toma: los 5 que exige el protocolo.

## Requisitos de compilación

- Arduino IDE con soporte ESP32 (`esp32` by Espressif), placa **AI Thinker ESP32-CAM**
- Partition scheme: *Huge APP (3MB No OTA)*
- PSRAM: *Enabled*
- microSD clase 10 o superior (hay que sostener 4.6 MB/s)

## Lo que hay que medir el día 1

1. **fps reales.** El firmware los mide al arrancar y los escribe en la
   cabecera de cada captura. Si salen < 55, la velocimetría no es viable y hay
   que usar la velocidad basal del paciente — el software ya lo contempla.
2. **µm/px reales**, con un portaobjetos micrométrico. Es el parámetro que
   entra al cuadrado en el cálculo de volumen.
3. **Fotogramas perdidos.** Si superan el 5%, la tarjeta SD no da abasto.

## Formato de grabación

Cabecera de texto de 128 bytes, seguida de fotogramas en escala de grises sin
comprimir:

```
MICHI1 w=320 h=240 fps=48.30 um_px=2.200 lambda=530 obl=70
```

**No se graba en JPEG**: los bloques DCT de 8×8 px equivalen a 17.6 µm, justo
la escala de los gaps (~30 µm). Comprimir ahí es destruir la señal.
