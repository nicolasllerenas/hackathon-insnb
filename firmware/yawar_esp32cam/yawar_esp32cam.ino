/*
 * Yawar Ñan / KittyScope — firmware de captura (ESP32-CAM AI-Thinker)
 * Licencia: Apache-2.0
 *
 * ===========================================================================
 * LO ÚNICO QUE HAY QUE ENTENDER ANTES DE TOCAR ESTE ARCHIVO
 * ===========================================================================
 *
 * El OV2640 tiene un paso de píxel de 2.2 µm. Con la lente invertida en 1:1,
 * eso significa 2.2 µm por píxel EN EL OBJETO — si y solo si se lee el sensor
 * a resolución nativa.
 *
 * La librería estándar consigue QVGA (320x240) **submuestreando** desde
 * 1600x1200, es decir tirando 4 de cada 5 píxeles. El resultado es 11 µm por
 * píxel, con lo que un capilar de 15 µm ocupa 1.4 píxeles y la medición es
 * imposible. Y no falla con un error: devuelve una imagen bonita.
 *
 *      modo                          µm/px   capilar   campo    veredicto
 *      QVGA por submuestreo          11.00     1.4 px   3520 µm  INSERVIBLE
 *      QVGA por VENTANA               2.20     6.8 px    704 µm  correcto
 *
 * 704 µm de campo son ~5.7 capilares a la separación intercapilar pediátrica
 * (124 µm), justo los 5 que exige el protocolo.
 *
 * Por eso este firmware NO usa set_framesize(FRAMESIZE_QVGA). Usa
 * set_res_raw() para leer una ventana centrada del sensor sin escalado.
 *
 * ---------------------------------------------------------------------------
 * EL SEGUNDO RIESGO: LA TASA DE FOTOGRAMAS
 * ---------------------------------------------------------------------------
 * La velocimetría necesita >= 55 fps. Medido sobre la cohorte sintética, a
 * 30 fps el error es del 81% (inservible) y a 60 fps del 7%.
 *
 * El ESP32-CAM da típicamente 45-50 fps a QVGA. Está POR DEBAJO del requisito.
 * De ahí que este firmware mida los fps reales y los reporte con cada captura:
 * un vídeo grabado a 40 fps no es un vídeo peor, es un vídeo del que no se
 * puede extraer velocidad, y el análisis tiene que saberlo.
 *
 * Si no se alcanzan los 55 fps hay un plan B ya implementado en el software:
 * la **velocidad basal por paciente**, medida una vez en el INSNSB con equipo
 * mejor. El conteo de gaps sigue funcionando a menor tasa; lo que se pierde es
 * solo la auto-calibración de velocidad.
 */

#include "esp_camera.h"
#include "FS.h"
#include "SD_MMC.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// --------------------------------------------------------------------------
// Pines del AI-Thinker ESP32-CAM
// --------------------------------------------------------------------------
#define PWDN_GPIO_NUM   32
#define RESET_GPIO_NUM  -1
#define XCLK_GPIO_NUM    0
#define SIOD_GPIO_NUM   26
#define SIOC_GPIO_NUM   27
#define Y9_GPIO_NUM     35
#define Y8_GPIO_NUM     34
#define Y7_GPIO_NUM     39
#define Y6_GPIO_NUM     36
#define Y5_GPIO_NUM     21
#define Y4_GPIO_NUM     19
#define Y3_GPIO_NUM     18
#define Y2_GPIO_NUM      5
#define VSYNC_GPIO_NUM  25
#define HREF_GPIO_NUM   23
#define PCLK_GPIO_NUM   22

// GPIO 12 y 13 quedan libres con la SD en modo 1-bit: se usan para los LEDs.
static const int PIN_LED_VERDE = 12;   // gate del MOSFET de los 2 LED de 530 nm
static const int PIN_BOTON     = 13;   // botón "huella de pata"

// --------------------------------------------------------------------------
// Parámetros de captura
// --------------------------------------------------------------------------
static const int VENTANA_W = 320;      // ventana nativa: 704 µm de campo
static const int VENTANA_H = 240;      // 528 µm
static const float FPS_MINIMO = 55.0;  // por debajo, la velocimetría no vale
static const int SEGUNDOS_CAPTURA = 60;

// Escala del sistema. Con lente invertida 1:1 es el paso de píxel del sensor.
// SE DEBE VERIFICAR con un portaobjetos micrométrico: es el parámetro que
// entra al cuadrado en el cálculo de volumen y por tanto en el recuento.
static const float UM_POR_PIXEL = 2.20;

static int contadorCaptura = 0;

// --------------------------------------------------------------------------

bool iniciarCamara() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;   config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;   config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;   config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;   config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;   config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM; config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;   config.pin_reset = RESET_GPIO_NUM;

  // 20 MHz es el máximo fiable del AI-Thinker. Subirlo produce fotogramas
  // corruptos intermitentes, que es peor que ir más lento.
  config.xclk_freq_hz = 20000000;

  // ESCALA DE GRISES, no JPEG. La compresión JPEG mete artefactos de bloque
  // de 8x8 px = 17.6 µm, que es justo la escala de los gaps que buscamos
  // (~30 µm). Comprimir aquí es destruir la señal para ahorrar tarjeta.
  config.pixel_format = PIXFORMAT_GRAYSCALE;
  config.frame_size   = FRAMESIZE_QVGA;   // se sobreescribe abajo con ventana
  config.fb_count     = 2;                // doble buffer: evita perder frames
  config.fb_location  = CAMERA_FB_IN_PSRAM;
  config.grab_mode    = CAMERA_GRAB_LATEST;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("ERROR: cámara no inicializada (0x%x)\n", err);
    return false;
  }

  sensor_t *s = esp_camera_sensor_get();

  /* AQUÍ ESTÁ LA LÍNEA QUE IMPORTA.
   * set_res_raw(startX, startY, endX, endY, offsetX, offsetY, totalX, totalY,
   *             outputW, outputH, scaling, binning)
   * Con scaling=false y binning=false se lee una ventana del sensor a
   * resolución nativa. La ventana se centra en el array de 1600x1200. */
  const int inicioX = (1600 - VENTANA_W) / 2;
  const int inicioY = (1200 - VENTANA_H) / 2;
  s->set_res_raw(s, inicioX, inicioY,
                 inicioX + VENTANA_W, inicioY + VENTANA_H,
                 0, 0, VENTANA_W, VENTANA_H,
                 false /* scaling */, false /* binning */);

  // Todo lo automático se apaga: el algoritmo normaliza por la mediana
  // temporal de cada punto, así que tolera iluminación desigual pero NO que
  // cambie durante la toma. Un AGC activo cambia la ganancia justo cuando
  // pasa un leucocito brillante, y se lo come.
  s->set_whitebal(s, 0);
  s->set_awb_gain(s, 0);
  s->set_exposure_ctrl(s, 0);
  s->set_aec2(s, 0);
  s->set_gain_ctrl(s, 0);
  s->set_agc_gain(s, 8);       // ajustar en calibración
  s->set_aec_value(s, 300);    // exposición fija
  s->set_brightness(s, 0);
  s->set_contrast(s, 0);
  s->set_saturation(s, 0);
  s->set_bpc(s, 0);            // sin corrección de píxeles muertos
  s->set_wpc(s, 0);
  s->set_lenc(s, 0);           // sin corrección de viñeteado: la añadiría el
                               // sensor de forma no documentada y falsearía
                               // la fotometría
  s->set_raw_gma(s, 0);        // sin gamma: el modelo es lineal en intensidad
  return true;
}

/* Mide los fps reales. No es telemetría: es el dato que decide si el vídeo
 * sirve para medir velocidad o solo para contar gaps. */
float medirFps(int muestras = 60) {
  uint32_t t0 = millis();
  for (int i = 0; i < muestras; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
  }
  return muestras * 1000.0f / (millis() - t0);
}

void capturar(float fpsMedidos) {
  char ruta[48];
  snprintf(ruta, sizeof(ruta), "/cap_%03d.raw", contadorCaptura);
  File f = SD_MMC.open(ruta, FILE_WRITE);
  if (!f) { Serial.println("ERROR: no se pudo abrir la SD"); return; }

  /* Cabecera de texto de 128 bytes. El analizador necesita saber la escala y
   * los fps REALES, no los nominales: sin eso el vídeo es ininterpretable, y
   * un fichero sin cabecera acaba siendo un fichero inútil dentro de un mes. */
  char cabecera[128];
  memset(cabecera, ' ', sizeof(cabecera));
  int n = snprintf(cabecera, sizeof(cabecera),
                   "YAWAR1 w=%d h=%d fps=%.2f um_px=%.3f lambda=530 obl=70",
                   VENTANA_W, VENTANA_H, fpsMedidos, UM_POR_PIXEL);
  cabecera[n] = ' ';
  cabecera[sizeof(cabecera) - 1] = '\n';
  f.write((uint8_t *)cabecera, sizeof(cabecera));

  digitalWrite(PIN_LED_VERDE, HIGH);
  delay(200);                                   // estabilización del LED

  const int objetivo = (int)(fpsMedidos * SEGUNDOS_CAPTURA);
  int escritos = 0, perdidos = 0;
  uint32_t t0 = millis();
  for (int i = 0; i < objetivo; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) { perdidos++; continue; }
    if (f.write(fb->buf, fb->len) != fb->len) perdidos++;
    else escritos++;
    esp_camera_fb_return(fb);
  }
  float duracion = (millis() - t0) / 1000.0f;
  digitalWrite(PIN_LED_VERDE, LOW);
  f.close();

  Serial.printf("%s: %d fotogramas en %.1f s (%.1f fps reales, %d perdidos)\n",
                ruta, escritos, duracion, escritos / duracion, perdidos);
  if (perdidos > escritos / 20)
    Serial.println("  AVISO: >5% de fotogramas perdidos. La tarjeta SD no "
                   "sostiene la escritura; usar una clase 10 o superior.");
  contadorCaptura++;
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);   // brownout por el pico del LED
  Serial.begin(115200);
  pinMode(PIN_LED_VERDE, OUTPUT);
  digitalWrite(PIN_LED_VERDE, LOW);
  pinMode(PIN_BOTON, INPUT_PULLUP);

  if (!iniciarCamara()) return;

  // SD en modo 1 bit: libera GPIO 4, 12 y 13 para LED y botón.
  if (!SD_MMC.begin("/sdcard", true)) {
    Serial.println("ERROR: sin tarjeta SD");
    return;
  }

  float fps = medirFps();
  Serial.printf("\n=== Yawar Ñan / KittyScope ===\n");
  Serial.printf("ventana %dx%d nativa · %.2f µm/px · campo %.0f x %.0f µm\n",
                VENTANA_W, VENTANA_H, UM_POR_PIXEL,
                VENTANA_W * UM_POR_PIXEL, VENTANA_H * UM_POR_PIXEL);
  Serial.printf("fps medidos: %.1f\n", fps);

  if (fps < FPS_MINIMO) {
    Serial.printf(
      "\nAVISO IMPORTANTE: %.1f fps está por debajo de los %.0f necesarios.\n"
      "  El conteo de gaps sigue siendo válido, pero la velocimetría NO.\n"
      "  Hay que usar la velocidad basal del paciente (medida en el INSNSB)\n"
      "  y marcar el resultado como 'velocidad tomada de basal'.\n"
      "  Para subir los fps: reducir la ventana, o subir XCLK con cuidado.\n\n",
      fps, FPS_MINIMO);
  }
  Serial.println("Listo. Pulsa el botón para capturar 60 s.\n");
}

void loop() {
  if (digitalRead(PIN_BOTON) == LOW) {
    delay(50);                                  // antirrebote
    if (digitalRead(PIN_BOTON) == LOW) {
      capturar(medirFps(30));
      while (digitalRead(PIN_BOTON) == LOW) delay(10);
    }
  }
  delay(20);
}
