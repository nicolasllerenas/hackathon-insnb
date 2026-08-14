# ANEXO 1 — FORMATO DE ENTREGA FINAL

> Rellenar los campos marcados `[…]` antes de enviar.

---

## 1. Datos generales

| Campo | Información |
|---|---|
| **Nombre del equipo** | `[…]` |
| **Nombre de la solución** | **Yawar Ñan** — ruta hematológica sin agujas |
| **Desafío seleccionado** | Desafío 3: Ruta Hematológica — continuidad y calidad para cada paciente |

---

## 2. Descripción de la solución

### Descripción del desafío

En el INSN San Borja, Hematología concentra el **47.21%** de los casos de cáncer
infantil, y la Leucemia Linfoblástica Aguda es la **primera causa de mortalidad**
del instituto (15.21%), con **73.91%** de pacientes clasificados como riesgo alto
(Sala Situacional, noviembre 2025).

El tratamiento de la LLA exige monitoreo hematológico estricto para detectar a
tiempo la neutropenia, cuya complicación —la neutropenia febril— es una
emergencia oncológica que requiere antibiótico dentro de la primera hora. Pero
ese monitoreo depende del hemograma, el hemograma depende del laboratorio, y el
laboratorio está en Lima.

El dato que ordena el problema: **el 56.22% de los pacientes fallecidos en el
instituto no procedía de Lima ni Callao.** Para una familia de provincia, cada
control significa viaje, alojamiento, días de trabajo perdidos y hermanos al
cuidado de terceros. Cuando ese costo se vuelve insostenible, el niño deja de
venir. Entre control y control pueden pasar tres semanas en las que nadie sabe
cómo está su recuento — y el nadir post-quimioterapia ocurre justamente en los
días 7 a 14.

El primer y segundo nivel de atención no tienen forma de evaluar el riesgo
inmunológico de estos niños sin extracción de sangre ni laboratorio, y la ruta
asistencial se rompe justo donde el paciente está más lejos.

### Usuario o beneficiario principal

**Usuario directo:** personal de enfermería y técnico de establecimientos de
primer y segundo nivel en regiones, que hoy no dispone de ninguna herramienta de
tamizaje hematológico.

**Beneficiario:** niños y niñas con LLA en tratamiento o seguimiento en el
INSNSB que residen fuera de Lima, y sus familias.

**Usuario secundario:** el equipo de Hematología del INSNSB, que recibe alertas
priorizadas y un panel de cohorte que muestra qué pacientes necesitan atención
antes, en lugar de descubrir el deterioro cuando el niño llega a Emergencia.

Condicionantes reales que la solución asume, no supone resueltos: conectividad
intermitente, personal sin formación en hematología, equipos disponibles
limitados a un smartphone, y familias con barreras económicas para viajar.

### Solución propuesta

Un sistema de **tamizaje óptico no invasivo de neutropenia grave** que
convierte un smartphone en un instrumento de screening hematológico.

Bajo iluminación de ~420 nm (banda de Soret de la hemoglobina) los eritrocitos
absorben la luz y los capilares del lecho ungueal se ven oscuros. Un leucocito
no contiene hemoglobina: deja pasar la luz azul y desplaza a los eritrocitos
aguas abajo, produciendo un **gap óptico** brillante que viaja por el capilar.
Contar esos gaps equivale a contar leucocitos, mediante una relación puramente
geométrica:

```
R = C · v · π(d/2)² · 60 · 10⁻⁹
```

donde `R` son gaps/capilar/min, `C` la concentración celular (células/µL), `v`
la velocidad de flujo (µm/s) y `d` el diámetro capilar (µm).

Pero el sistema **no entrega un número: entrega una conducta**. El resultado
pasa por un motor de triaje que integra recuento, fiebre, día post-quimioterapia
y distancia al centro de referencia, y produce un semáforo con acción concreta y
plazo, más un mensaje HL7/FHIR que se integra al HIS del instituto.

### Valor público esperado

| Mecanismo | Efecto esperado |
|---|---|
| Tamizaje en el establecimiento más cercano | Elimina el viaje a Lima como requisito para saber el recuento |
| Detección precoz de neutropenia grave | Reduce el retraso hasta el antibiótico en neutropenia febril |
| Vigilancia concentrada en el nadir (días 7–14) | Encuentra el deterioro cuando aún es reversible |
| Panel de cohorte priorizado | El INSNSB ve quién necesita atención antes de que llegue a Emergencia |
| Menor carga logística sobre la familia | Ataca una de las causas del abandono de tratamiento |
| Interoperabilidad HL7/FHIR | El dato entra a la historia clínica, no muere en un cuaderno |

**Lo que la solución no hace, y conviene decirlo:** no reemplaza al hemograma y
no puede descartar neutropenia. Es una herramienta para *detectar* sospecha y
escalar, nunca para tranquilizar.

### Funcionamiento del prototipo

1. **Captura.** El niño apoya el dedo en un soporte impreso en 3D. Un módulo
   ESP32 controla la iluminación de 420 nm y **mide la fuerza de contacto**. El
   smartphone graba 60 s en cada uno de 5 capilares distintos, a ≥60 fps.
2. **Procesamiento.** El vídeo se estabiliza, se segmenta el lumen capilar, se
   construye el kymograph, se mide la velocidad de flujo y el diámetro, y se
   cuentan los gaps reproyectando al marco material.
3. **Conversión pediátrica.** El recuento leucocitario se convierte a ANC con la
   fracción de neutrófilos correspondiente a la edad, o con el propio hemograma
   previo del paciente si existe.
4. **Triaje.** Semáforo verde / amarillo / rojo / negro con acción y plazo.
5. **Integración.** Mensaje HL7 v2 (ORU^R01) hacia el HIS y Bundle FHIR R4.

**Rendimiento medido** (validación cruzada por paciente, n=300, cohorte
sintética): AUC **0.921**, sensibilidad **0.947**, especificidad **0.774**, VPN
**0.949**.

> Estas métricas miden la **coherencia del pipeline**, no su exactitud clínica.
> El modelo está entrenado sobre datos simulados físicamente, no sobre
> pacientes. Lo sostenemos así también en el pitch.

#### Cuatro diferencias técnicas frente a las alternativas existentes

El método óptico existe y hay un dispositivo comercial validado en adultos
(PointCheck, de Leuko, con designación FDA Breakthrough). Nuestras diferencias
son técnicas y verificables:

**1. Corrección pediátrica.** El método cuenta leucocitos totales, no
neutrófilos, y la fracción de neutrófilos varía de ~31% al año de vida a ~59% en
el adulto. Con el umbral adulto de 7 gaps/min, la alerta salta en ANC≈487 en un
adulto pero en **ANC≈272 en un niño de 2 años**: se pierde entera la franja
272–500, que es donde hay que actuar. El umbral correcto a esa edad es 12.8.

**2. Auto-calibración.** El trabajo de referencia *asume* v=800 µm/s y d=15 µm.
Nosotros los medimos en el propio vídeo. Umbralizar el diámetro lo subestima
~15% por física —cerca del borde la cuerda óptica tiende a cero—, lo que produce
**−25% de error en el recuento**; ajustando el perfil de Beer-Lambert el error
baja a **+3%**.

**3. Reproyección al marco material.** Conocida la velocidad, en la coordenada
ξ = s − D(t) el gap está quieto: la SNR mejora en √n (≈3.7× típico) y cada gap
se cuenta una sola vez por construcción. Ese margen es lo que permite bajar de
una cámara científica a la de un celular de posta.

**4. Sabe cuándo no puede medir.** La presión capilar ungueal es de 25–35 mmHg.
Si el niño aprieta el dedo, el capilar se colapsa, no pasa ningún leucocito y el
algoritmo concluye «neutropenia grave» con total coherencia interna. **Un error
de posicionamiento se disfraza del hallazgo más alarmante posible**, y nada en
el vídeo lo delata. El ESP32 mide la fuerza (ventana segura 0.08–0.50 N) y
bloquea la captura fuera de ella.

### Componentes abiertos y reutilizables

Todo el repositorio, bajo **Apache-2.0** (código) y **CC BY 4.0** (documentación):

| Componente | Reutilizable para |
|---|---|
| `src/yawar/optics.py` | Modelo físico y priors hematológicos pediátricos por edad |
| `src/yawar/synth.py` | Simulador de videocapilaroscopía — sirve a cualquier grupo que trabaje microcirculación sin acceso a pacientes |
| `src/yawar/vision/` | Pipeline de kymografía, velocimetría y detección de eventos en microcirculación |
| `src/yawar/triage.py` | Motor de reglas de neutropenia febril pediátrica |
| `src/yawar/interop/` | Generadores HL7 v2 ORU^R01 y FHIR R4 **alineados con el perfil nacional `HL7.FHIR.PE.COREPE`** (PacientePe, OrganizacionPe, RENIPRESS). Reutilizables por cualquier proyecto que deba reportar a RENHICE |
| `src/yawar/illumination.py` | Presupuesto óptico por longitud de onda y fototipo de piel; sirve a cualquier proyecto de imagen sobre tejido en población peruana |
| `firmware/yawar_esp32/` | Control de iluminación con estrobo y sensado de presión de contacto |
| `notebooks/` | Notebook Colab reproducible de extremo a extremo |
| `docs/hardware.md` | BOM, diseño óptico y protocolo de calibración |
| `tests/` | 30 tests, incluida la verificación del modelo contra la literatura publicada |

### Próximos pasos sugeridos

| Plazo | Acción |
|---|---|
| **Inmediato** | Grabar **30–50 vídeos reales con hemograma pareado** en el INSNSB, bajo aprobación del comité de ética. Es el único paso que convierte las métricas actuales en métricas clínicas. |
| **Corto** | Reajustar la capa de calibración con esos datos y fijar el umbral operativo definitivo por edad. |
| **Corto** | Validar empíricamente 420 nm vs 520 nm oblicuo, y clip-on 15x vs *reverse lens* (más capilares por toma: el AUC pasa de 0.68 con 1 capilar a 1.00 con 5). |
| **Medio** | Estudio de concordancia con tamaño muestral suficiente; someter a evaluación de INS/DIGEMID como dispositivo de tamizaje. |
| **Medio** | Piloto en 2–3 establecimientos de una región con alta derivación al INSNSB. |
| **Largo** | Integración formal al HIS del instituto y a la ruta asistencial nacional de cáncer infantil. |

---

## 3. Enlaces o archivos entregados

| Entregable | Enlace de acceso público | Observaciones |
|---|---|---|
| Presentación en PDF | `[…]` | |
| Demo o prototipo funcional | `[…]` | PWA + API; incluye modo demostración sin hardware |
| Repositorio de código | `[…]` | Apache-2.0; `README.md` con instrucciones de uso |
| Declaración de uso de IA generativa | `docs/anexo2_declaracion_ia.md` | |
| Notebook reproducible | `notebooks/01_yawar_colab.ipynb` | Ejecutable en Colab de principio a fin |
| Documentación de hardware | `docs/hardware.md` | BOM v2 y calibración |
| Protocolo clínico | `docs/protocolo_clinico.md` | Criterios de uso y derivación |
| Plan de interoperabilidad | `docs/interoperabilidad.md` | Alineación con FHIR PE Core / RENHICE y preguntas concretas a la OGTI del INSNSB |

---

## 4. Declaraciones finales del equipo

- La solución entregada tiene carácter **prototípico, experimental y demostrativo**.
- El equipo declara que la solución es original y que los componentes de terceros
  utilizados (bibliotecas de código abierto, literatura científica citada) se
  emplean conforme a sus licencias.
- La solución **no depende de software propietario restrictivo**, servicios
  comerciales cerrados ni infraestructura privada no replicable. Todo el stack
  es abierto: Python, OpenCV, scikit-learn, FastAPI, Arduino.
- El equipo declara que **no utilizó datos personales reales**, información
  confidencial, sistemas no autorizados ni credenciales institucionales. Los
  datos de entrenamiento son **íntegramente sintéticos**, generados a partir de
  un modelo físico documentado. Las cifras epidemiológicas citadas provienen de
  la Sala Situacional pública del INSNSB.
- El equipo acepta que la entrega **no genera derecho** a pago, contratación,
  implementación, financiamiento ni continuidad obligatoria.

**Nombres y apellidos:** `[…]`

**DNI / CE:** `[…]`
