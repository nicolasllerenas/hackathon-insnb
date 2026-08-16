/*
  MichiCheck - firmware del juguete acompanante
  ESP32-CAM (AI-Thinker, OV2640) + bocina + LED verde 530 nm

  Tres cosas que este firmware hace y que conviene entender antes de tocarlo:

  1. VENTANA DE LECTURA, NO SUBMUESTREO. La velocimetria por kimografo exige
     mas de 55 fps. A QVGA completo el OV2640 no llega. Se recorta una ventana
     de 320x240 en el centro del sensor con set_res_raw, que reduce el numero
     de pixeles leidos sin tirar resolucion espacial. Cambiar esto por
     set_framesize rompe la medicion de velocidad y con ella todo el calculo.

  2. EL MAULLIDO NO SE PUEDE CALLAR SIN ATENDERLO. El boton no cancela el
     tamizaje pendiente: lo pospone, cuenta el silenciamiento y vuelve a
     maullar mas fuerte. Al tercer silenciamiento deja de insistirle a la
     familia y lo reporta al INSN. La insistencia tiene un limite, y ese
     limite es informacion clinica.

  3. LAS ALERTAS SOLO SUENAN EN LA VENTANA AUDIBLE. Un maullido en una casa
     vacia gasta bateria y credibilidad. Fuera de la ventana el aviso sale por
     los canales convencionales del hospital, no por el juguete.
*/

#include "esp_camera.h"
#include "FS.h"
#include "SD_MMC.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include <time.h>

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

#define CANAL_BOCINA     2
#define RESOLUCION_PWM   8

static const int PIN_LED_VERDE = 12;
static const int PIN_BOTON     = 13;
static const int PIN_BOCINA    = 14;
static const int PIN_BATERIA   = 33;

static const int VENTANA_W = 320;
static const int VENTANA_H = 240;
static const float FPS_MINIMO = 55.0;
static const int SEGUNDOS_CAPTURA = 60;
static const float UM_POR_PIXEL = 2.20;

static const int HORA_INICIO_VENTANA = 19;
static const int HORA_FIN_VENTANA    = 21;
static const int MAX_SILENCIAMIENTOS = 3;
static const uint32_t MINUTOS_ENTRE_INSISTENCIAS = 25;
static const uint32_t HORAS_ENTRE_LATIDOS = 6;

static const float BATERIA_DIVISOR = 2.0f;
static const float BATERIA_MIN_V = 3.30f;
static const float BATERIA_MAX_V = 4.20f;

enum TipoAlerta { ALERTA_TAMIZAJE, ALERTA_CITA, ALERTA_COMPANIA };

struct EstadoMichi {
  bool tamizajePendiente;
  TipoAlerta tipoPendiente;
  int silenciamientos;
  int intento;
  uint32_t proximaInsistenciaMs;
  uint32_t proximoLatidoMs;
  int capturasEnCola;
  int alertasEmitidas;
  int alertasAtendidas;
  bool escalado;
};

static EstadoMichi michi = {false, ALERTA_TAMIZAJE, 0, 0, 0, 0, 0, 0, 0, false};
static int contadorCaptura = 0;

void reportarEstado();
void insistir();
void atender();

void tono(int frecuencia, int duracionMs, int volumen) {
  ledcWriteTone(CANAL_BOCINA, frecuencia);
  ledcWrite(CANAL_BOCINA, volumen);
  delay(duracionMs);
  ledcWrite(CANAL_BOCINA, 0);
}

void barrido(int desde, int hasta, int duracionMs, int volumen) {
  const int pasos = duracionMs / 6;
  if (pasos <= 0) return;
  ledcWrite(CANAL_BOCINA, volumen);
  for (int i = 0; i <= pasos; i++) {
    const float t = (float)i / pasos;
    ledcWriteTone(CANAL_BOCINA, desde + (int)((hasta - desde) * t));
    delay(6);
  }
  ledcWrite(CANAL_BOCINA, 0);
}

/*
  Un maullido real sube de tono y luego cae. Con una sola bocina piezoelectrica
  no hay formantes, pero el contorno de frecuencia es lo que el oido reconoce
  como gato: por eso se sintetiza como dos barridos encadenados y no como una
  secuencia de pitidos.
*/
void maullar(int intensidad) {
  const int volumen = 90 + intensidad * 55;
  const int base = 480 + intensidad * 40;
  barrido(base, base * 2, 130 + intensidad * 20, volumen);
  barrido(base * 2, (int)(base * 0.72f), 260 + intensidad * 40, volumen);
  delay(60);
}

void maullidoInsistente(int intento) {
  const int repeticiones = 2 + intento;
  for (int i = 0; i < repeticiones; i++) {
    maullar(intento);
    delay(180);
  }
}

void ronronear(int duracionMs) {
  const uint32_t fin = millis() + duracionMs;
  ledcWrite(CANAL_BOCINA, 45);
  while (millis() < fin) {
    ledcWriteTone(CANAL_BOCINA, 120);
    delay(20);
    ledcWriteTone(CANAL_BOCINA, 145);
    delay(20);
  }
  ledcWrite(CANAL_BOCINA, 0);
}

void campanita() {
  tono(1046, 90, 70);
  delay(30);
  tono(1568, 140, 70);
}

float leerBateriaPct() {
  const int crudo = analogRead(PIN_BATERIA);
  const float voltaje = (crudo / 4095.0f) * 3.3f * BATERIA_DIVISOR;
  const float pct = (voltaje - BATERIA_MIN_V) / (BATERIA_MAX_V - BATERIA_MIN_V) * 100.0f;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

bool dentroDeVentanaAudible() {
  time_t ahora = time(nullptr);
  if (ahora < 1600000000) return true;
  struct tm local;
  localtime_r(&ahora, &local);
  return local.tm_hour >= HORA_INICIO_VENTANA && local.tm_hour < HORA_FIN_VENTANA;
}

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

  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_GRAYSCALE;
  config.frame_size   = FRAMESIZE_QVGA;
  config.fb_count     = 2;
  config.fb_location  = CAMERA_FB_IN_PSRAM;
  config.grab_mode    = CAMERA_GRAB_LATEST;

  if (esp_camera_init(&config) != ESP_OK) return false;

  sensor_t *s = esp_camera_sensor_get();
  const int inicioX = (1600 - VENTANA_W) / 2;
  const int inicioY = (1200 - VENTANA_H) / 2;
  s->set_res_raw(s, inicioX, inicioY,
                 inicioX + VENTANA_W, inicioY + VENTANA_H,
                 0, 0, VENTANA_W, VENTANA_H,
                 false, false);

  s->set_whitebal(s, 0);
  s->set_awb_gain(s, 0);
  s->set_exposure_ctrl(s, 0);
  s->set_aec2(s, 0);
  s->set_gain_ctrl(s, 0);
  s->set_agc_gain(s, 8);
  s->set_aec_value(s, 300);
  s->set_brightness(s, 0);
  s->set_contrast(s, 0);
  s->set_saturation(s, 0);
  s->set_bpc(s, 0);
  s->set_wpc(s, 0);
  s->set_lenc(s, 0);
  s->set_raw_gma(s, 0);
  return true;
}

float medirFps(int muestras = 60) {
  uint32_t t0 = millis();
  for (int i = 0; i < muestras; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
  }
  return muestras * 1000.0f / (millis() - t0);
}

bool capturar(float fpsMedidos) {
  if (fpsMedidos < FPS_MINIMO) {
    tono(220, 400, 80);
    return false;
  }

  char ruta[48];
  snprintf(ruta, sizeof(ruta), "/cap_%03d.raw", contadorCaptura);
  File f = SD_MMC.open(ruta, FILE_WRITE);
  if (!f) {
    tono(220, 400, 80);
    return false;
  }

  char cabecera[128];
  memset(cabecera, ' ', sizeof(cabecera));
  int n = snprintf(cabecera, sizeof(cabecera),
                   "MICHI1 w=%d h=%d fps=%.2f um_px=%.3f lambda=530 obl=70",
                   VENTANA_W, VENTANA_H, fpsMedidos, UM_POR_PIXEL);
  cabecera[n] = ' ';
  cabecera[sizeof(cabecera) - 1] = '\n';
  f.write((uint8_t *)cabecera, sizeof(cabecera));

  ronronear(600);
  digitalWrite(PIN_LED_VERDE, HIGH);
  delay(200);

  const int objetivo = (int)(fpsMedidos * SEGUNDOS_CAPTURA);
  int escritos = 0, perdidos = 0;
  for (int i = 0; i < objetivo; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) { perdidos++; continue; }
    if (f.write(fb->buf, fb->len) != fb->len) perdidos++;
    else escritos++;
    esp_camera_fb_return(fb);
  }
  digitalWrite(PIN_LED_VERDE, LOW);
  f.close();

  contadorCaptura++;
  michi.capturasEnCola++;
  return escritos > objetivo / 2;
}

void pedirAtencion(TipoAlerta tipo) {
  michi.tamizajePendiente = (tipo == ALERTA_TAMIZAJE);
  michi.tipoPendiente = tipo;
  michi.intento = 1;
  michi.silenciamientos = 0;
  michi.escalado = false;
  michi.proximaInsistenciaMs = millis() + MINUTOS_ENTRE_INSISTENCIAS * 60000UL;
  michi.alertasEmitidas++;

  if (tipo == ALERTA_CITA) campanita();
  maullidoInsistente(1);
}

void insistir() {
  michi.intento++;
  michi.silenciamientos++;
  michi.alertasEmitidas++;

  if (michi.silenciamientos >= MAX_SILENCIAMIENTOS) {
    michi.escalado = true;
    michi.tamizajePendiente = false;
    reportarEstado();
    tono(392, 220, 60);
    tono(330, 320, 60);
    return;
  }

  maullidoInsistente(michi.intento);
  michi.proximaInsistenciaMs = millis() + MINUTOS_ENTRE_INSISTENCIAS * 60000UL;
}

/*
  El latido es lo que permite al INSN darse cuenta de que una familia se
  descolgo antes de que pierda una cita. Se emite pase lo que pase, tambien
  cuando no hay nada que reportar: el silencio es la senal.
*/
void reportarEstado() {
  Serial.printf("{\"latido\":1,\"bateria_pct\":%.0f,\"capturas_en_cola\":%d,"
                "\"alertas_emitidas\":%d,\"alertas_atendidas\":%d,"
                "\"silenciamientos\":%d,\"escalado\":%s,\"firmware\":\"0.3.0\"}\n",
                leerBateriaPct(), michi.capturasEnCola,
                michi.alertasEmitidas, michi.alertasAtendidas,
                michi.silenciamientos, michi.escalado ? "true" : "false");
  michi.proximoLatidoMs = millis() + HORAS_ENTRE_LATIDOS * 3600000UL;
}

void atender() {
  const bool ok = capturar(medirFps(30));
  if (!ok) return;

  michi.tamizajePendiente = false;
  michi.silenciamientos = 0;
  michi.intento = 0;
  michi.escalado = false;
  michi.alertasAtendidas++;

  ronronear(900);
  campanita();
  reportarEstado();
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  Serial.begin(115200);

  pinMode(PIN_LED_VERDE, OUTPUT);
  digitalWrite(PIN_LED_VERDE, LOW);
  pinMode(PIN_BOTON, INPUT_PULLUP);
  analogSetPinAttenuation(PIN_BATERIA, ADC_11db);

  ledcSetup(CANAL_BOCINA, 2000, RESOLUCION_PWM);
  ledcAttachPin(PIN_BOCINA, CANAL_BOCINA);
  ledcWrite(CANAL_BOCINA, 0);

  if (!iniciarCamara()) { tono(220, 900, 90); return; }
  if (!SD_MMC.begin("/sdcard", true)) { tono(220, 900, 90); return; }

  configTime(-5 * 3600, 0, "pool.ntp.org");

  maullar(0);
  reportarEstado();
}

void loop() {
  const uint32_t ahora = millis();

  if (digitalRead(PIN_BOTON) == LOW) {
    delay(50);
    if (digitalRead(PIN_BOTON) == LOW) {
      const uint32_t inicioPulsacion = millis();
      while (digitalRead(PIN_BOTON) == LOW) delay(10);
      const uint32_t duracion = millis() - inicioPulsacion;

      if (michi.tamizajePendiente && duracion < 800) {
        insistir();
      } else {
        atender();
      }
    }
  }

  if (michi.tamizajePendiente && ahora >= michi.proximaInsistenciaMs
      && dentroDeVentanaAudible()) {
    insistir();
  }

  if (ahora >= michi.proximoLatidoMs) {
    reportarEstado();
  }

  if (Serial.available()) {
    const char orden = Serial.read();
    if (orden == 'T' && dentroDeVentanaAudible()) pedirAtencion(ALERTA_TAMIZAJE);
    else if (orden == 'C' && dentroDeVentanaAudible()) pedirAtencion(ALERTA_CITA);
    else if (orden == 'M') maullar(0);
    else if (orden == 'L') reportarEstado();
  }

  delay(20);
}
