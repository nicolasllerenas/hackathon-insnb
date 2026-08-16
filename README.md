# MichiCheck

Sistema de acompañamiento para niños en tratamiento por leucemia linfoblástica
aguda. Consta de un juguete con forma de gato que vive en casa del paciente, una
app móvil que usa el niño, y una consola clínica para el equipo del INSN San
Borja.

Hackatón Niño San Borja 2026, Desafío 3 (Ruta Hematológica).

En vivo: **https://michicheck.vercel.app**

---

## El problema que atacamos

En la fase de mantenimiento el tratamiento dura unos dos años, es ambulatorio y
el niño se ve sano. Ahí es donde se concentra el abandono. Las familias que
viven lejos acumulan viajes, gasto y días de trabajo perdidos hasta que dejan de
ir. El hospital se entera cuando el paciente falta a una cita, y en
mantenimiento las citas son mensuales.

MichiCheck intenta dos cosas: que la familia tenga un motivo diario para no
desengancharse, y que el hospital reciba una señal antes de que se pierda una
cita.

---

## Qué hay aquí

```
apps/michi/          App del niño. HTML/CSS/JS sin dependencias.
apps/insn/           Consola clínica. Igual, sin dependencias.
src/michicheck/      El paquete Python.
services/api/        API FastAPI (24 rutas).
firmware/            Firmware del ESP32-CAM con bocina.
scripts/             Generación de dataset, figuras y demo.
tests/               89 pruebas.
```

Dentro del paquete:

| Módulo | Qué resuelve |
|---|---|
| `optics.py` | Modelo físico: de huecos ópticos por minuto a recuento estimado |
| `illumination.py` | Absorción a 530 nm, fototipos, presupuesto de fotones |
| `vision/` | Estabilización, segmentación, kimografo, velocimetría, detección |
| `pipeline.py` | Del vídeo al recuento con su intervalo de confianza |
| `model.py` | Corrección del sesgo y probabilidad calibrada |
| `triage.py` | Conducta clínica a partir del tamizaje |
| `companion/` | Etapas, enrolamiento, alertas, estado del juguete, referencias |
| `interop/` | HL7 v2 ORU^R01 y FHIR R4 con perfiles PE Core |

---

## Correr el proyecto

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e '.[api,viz,dev]'
pytest -q
```

Para levantar todo junto:

```bash
bash scripts/demo.sh
```

Eso deja la API en el 8000 y las dos interfaces en el 8080. Ambas apps traen un
recorrido guiado que se reproduce solo; se activa con el botón DEMO o añadiendo
`?demo=1` a la URL.

Las interfaces no llaman a la API. Funcionan solas, sin red y sin cargar nada de
un CDN. Los maullidos y el ronroneo están sintetizados con la Web Audio API
dentro de la propia página. Eso fue a propósito: en una demostración en vivo lo
que más falla es la conexión.

---

## Los tres estados

El tamizaje no devuelve solo un número. Devuelve uno de tres estados, cada uno
con su plazo y su responsable.

| Estado | Cuándo | Conducta | Plazo |
|---|---|---|---|
| Estable | Límite inferior del IC95 por encima de 500/µL, sin fiebre | Recordatorio de audio | — |
| Grave | El IC95 baja de 500/µL, el tamizaje no concluye, o el michi lleva 3 días callado | Teleconsulta con el médico asignado | 6 h |
| Priorizable | Fiebre ≥ 38 °C con neutropenia, o tamizaje dudoso con fiebre | Teleconsulta + opción de ingreso por emergencia | 15 min |

Hay una regla que atraviesa todo el triaje: la fiebre escala y nunca rebaja. Un
tamizaje dudoso puede aumentar la conducta que indica la clínica, nunca
reducirla. Con eso el modo de fallo grave (decirle a una familia que todo está
bien cuando el niño tiene neutropenia febril) queda descartado por diseño, y la
clase de seguridad del software baja de C a B según IEC 62304.

---

## El silencio del juguete

El michi manda un latido cada seis horas. Si deja de mandarlo por más de 72
horas, el caso entra a la cola clínica como grave aunque el último tamizaje
haya salido normal.

La lógica es simple: no sabemos cómo está ese niño y llevamos días sin saberlo.
Y a diferencia de la cita perdida, esta señal llega en tres días y no en cuatro
semanas.

También se cuentan los silenciamientos. Si la familia apaga el juguete tres
veces seguidas sin hacer el tamizaje, el michi deja de insistir y avisa al
instituto.

---

## Cuando la familia no puede viajar a Lima

`companion/referencias.py` tiene cargada la red: 10 centros oncológicos
pediátricos (que están solo en Lima, La Libertad, Arequipa y Cusco) y 20
hospitales regionales que pueden hacer hemograma, hemocultivo, antibiótico de
amplio espectro, transfusión y hospitalización pediátrica.

Cuando la teleconsulta concluye que hace falta atención presencial, el sistema
busca el establecimiento capaz más cercano al domicilio y emite la referencia
declarando qué cosas ese establecimiento no puede hacer.

Un ejemplo de cómo se comporta: una niña de Bagua con fiebre no se manda nueve
horas a Trujillo por un hemocultivo. Se manda a Chachapoyas, con la advertencia
de iniciar el antibiótico antes del traslado. La primera hora manda sobre la
distancia. Si el motivo fuera quimioterapia, sí iría a Trujillo, porque eso no
se puede hacer en Chachapoyas.

---

## Cómo funciona el tamizaje

Con luz verde de 530 nm los glóbulos rojos absorben y el capilar del lecho
ungueal se ve oscuro. Un leucocito no lleva hemoglobina, deja pasar la luz y
produce un hueco que se puede contar.

```
R = C · v · π(d/2)² · 60 · 10⁻⁹
```

`R` son huecos por capilar por minuto, `C` la concentración celular, `v` la
velocidad del flujo y `d` el diámetro del capilar. El modelo reproduce el valor
publicado: 32 huecos/min dan 3 773 células/µL, y el paper reporta 3 773.

Después se aplica la fracción de neutrófilos por edad. Esto último importa más
de lo que parece: el umbral publicado de 7 huecos/min es de adultos, y aplicado
a un niño de dos años la alerta recién saltaría con un ANC de 272. El valor que
exige actuar es 500.

### Sobre el modelo

La física sola ya da AUC 0.943 sin entrenar nada. El modelo entrenado da 0.939,
o sea que no la supera. Está ahí por otras dos razones: corrige el sesgo de la
estimación física, que subestima por un factor de tres, y entrega una
probabilidad calibrada, sin la cual no se puede fijar un punto de operación.
Elegimos una regresión logística de cuatro variables porque gradient boosting
daba lo mismo y no es auditable.

La cohorte de entrenamiento es simulada, n=300. Es la limitación más grande que
tenemos. La validación real son 30–50 vídeos con hemograma pareado, y eso pasa
por el comité de ética del instituto.

### Lo que no hace

No identifica células. No mide plaquetas, y no es cuestión de mejorar el
algoritmo: miden 2–4 µm y no ocluyen un capilar de 10–20 µm, así que el
fenómeno no ocurre. No mide hemoglobina. No reemplaza el hemograma. Todas las
salidas lo dicen, y en HL7 el resultado va marcado como preliminar con el método
explícito para que nadie lo confunda dentro de seis meses.

---

## Integración con Galenus

Cada tamizaje sale como mensaje HL7 v2 ORU^R01 y como Bundle FHIR R4 con los
perfiles nacionales del MINSA. La correlación con el paciente se hace por
historia clínica, que queda enlazada con la serie del dispositivo en el primer
control, cuando el médico entrega el juguete. Un michi corresponde a un paciente
durante todo el tratamiento, así que no hace falta emparejar por nombre ni por
fecha de nacimiento.

Lo que falta no es desarrollo. Falta el endpoint, las credenciales y el ambiente
de pruebas de la OGTI del instituto.

---

## Despliegue

Las dos interfaces son estáticas y se publican en Vercel desde la raíz:

```bash
vercel deploy --prod
```

La configuración está en `vercel.json`. Al estar en HTTPS funcionan las
notificaciones push del sistema operativo y la app del niño se puede instalar
como PWA en el celular.

---

## Estado

Funciona y está probado: el modelo físico, el pipeline de visión, el
clasificador, los tres estados, el planificador de alertas, el estado del
dispositivo, la red de referencias, las dos interfaces, el firmware y la
generación de HL7 y FHIR.

Falta: validación clínica con pacientes reales, confirmación de los códigos
RENIPRESS, el acuerdo de interoperabilidad con la OGTI, y la firma de un médico
en el protocolo clínico.

---

## Aviso

MichiCheck es un tamizaje. Orienta y prioriza, no diagnostica ni descarta, y no
debe usarse para modificar o suspender quimioterapia. La conducta clínica la fija
el protocolo y el profesional tratante.

Los pacientes que aparecen en las interfaces son ficticios.

Código bajo Apache-2.0.
