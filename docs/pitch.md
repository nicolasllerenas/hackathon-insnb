# Guion de pitch — Yawar Ñan

**Duración objetivo: 5 minutos + preguntas.**

La rúbrica pesa así: Impacto en salud 25% · Innovación 20% · Viabilidad 20% ·
Enfoque en el usuario 20% · Calidad de presentación 15%. Este guion está
ordenado por esos pesos, no por el orden en que construimos las cosas.

---

## Estructura

| Bloque | Tiempo | Criterio que ataca |
|---|---|---|
| 1. El problema, con nombre propio | 45 s | Impacto (25%) |
| 2. Qué hacemos | 40 s | — |
| 3. Por qué funciona | 60 s | Innovación (20%) |
| 4. Lo que hicimos distinto | 75 s | Innovación (20%) |
| 5. Demostración | 60 s | Usuario (20%) |
| 6. Viabilidad y ruta | 45 s | Viabilidad (20%) |
| 7. Lo que falta | 25 s | Credibilidad |

---

## 1. El problema (45 s)

> Una niña de 6 años con leucemia linfoblástica aguda vive en Bagua. Está en el
> día 10 después de su quimioterapia — el día en que su recuento de neutrófilos
> toca fondo. Tiene 38.6 de fiebre.
>
> Si su recuento está por debajo de 500, esto es una **emergencia oncológica**:
> necesita antibiótico dentro de la primera hora. Si está por encima, puede
> esperar.
>
> Nadie en Bagua puede saber cuál de las dos cosas es. El hemograma está a nueve
> horas de viaje.

Los tres datos, del propio instituto (Sala Situacional, noviembre 2025):

- Hematología concentra el **47.21%** del cáncer infantil del INSNSB
- La LLA es la **primera causa de muerte** (15.21%), con **73.91%** de riesgo alto
- El **56.22%** de los pacientes fallecidos **no venía de Lima ni Callao**

> Ese último número es el desafío entero. La ruta hematológica se rompe donde el
> paciente está más lejos.

---

## 2. Qué hacemos (40 s)

> Yawar Ñan —«camino de la sangre» en quechua— convierte un celular en un
> tamizaje de neutropenia. Sin aguja, sin laboratorio, sin reactivos. En la
> posta de Bagua.
>
> Y no entrega un número: entrega una conducta. Semáforo, acción concreta,
> plazo, y un mensaje HL7 que entra al sistema del instituto.

**No decir «reemplaza el hemograma». Decir:**

> No reemplazamos el hemograma. Llenamos los veinte días en que ese niño no
> tiene ninguno.

---

## 3. Por qué funciona (60 s)

> A 420 nanómetros, la hemoglobina absorbe luz. Los glóbulos rojos se ven
> negros. Pero un glóbulo blanco no tiene hemoglobina: deja pasar la luz y
> empuja a los rojos hacia adelante. Deja un **hueco brillante** que viaja por
> el capilar.
>
> Contar esos huecos es contar glóbulos blancos. Y la relación no es empírica ni
> aprendida: es geometría.

Mostrar la fórmula, y luego el dato que la valida:

> Con los parámetros del paper de referencia, nuestro modelo predice 3.773
> células por microlitro. El paper reporta 3.773. No ajustamos nada.

*(Mostrar aquí el vídeo sintético y el kymograph lado a lado: el ojo ve
inmediatamente la diferencia entre un niño sano y uno neutropénico.)*

---

## 4. Lo que hicimos distinto (75 s)

**Abrir reconociendo la alternativa. Da credibilidad, no la quita:**

> Esto ya existe para adultos. Se llama PointCheck, tiene designación FDA
> Breakthrough, y funciona. Nosotros hicimos cuatro cosas que ese dispositivo no
> hace.

### 4.1 — El hallazgo pediátrico *(este es el momento fuerte del pitch)*

> El método cuenta glóbulos blancos **totales**. Pero lo que importa clínicamente
> son los neutrófilos. Y en un niño de 2 años, sólo el 31% de sus glóbulos
> blancos son neutrófilos — frente al 59% de un adulto.
>
> El dispositivo comercial usa un umbral de 7 huecos por minuto. En un adulto,
> eso equivale a un recuento de 487: correcto. En un niño de 2 años, ese mismo
> umbral recién se dispara cuando el recuento ya cayó a **272**.
>
> Se pierde entera la franja entre 272 y 500. Que es exactamente donde hay que
> actuar.

*(Mostrar la gráfica de umbral vs edad.)*

### 4.2 — Medimos lo que otros asumen

> El trabajo original asume una velocidad de flujo de 800 micras por segundo
> para todos. Nosotros la medimos en cada vídeo. Y medimos el diámetro del
> capilar ajustando el perfil de absorción, no umbralizando: umbralizar lo
> subestima un 15%, y como el diámetro entra al cuadrado, eso son 25% de error
> en el recuento. Nuestro error es 3%.

### 4.3 — Miramos la sangre desde la sangre

> Un hueco que se mueve es difícil de detectar. Pero si conocés la velocidad,
> podés cambiar de sistema de referencia y viajar con el flujo. En ese marco el
> hueco está quieto. La señal mejora casi cuatro veces.
>
> Ese margen es exactamente lo que nos permite bajar de una cámara científica a
> la cámara de un celular de posta.

### 4.4 — El equipo sabe cuándo está mintiendo *(cerrar con esto)*

> Y esta es la que más nos importa. La presión dentro de un capilar del dedo es
> de 30 milímetros de mercurio. Si el niño **aprieta**, el capilar se cierra, no
> pasa ningún glóbulo blanco, y el algoritmo concluye «neutropenia grave» con
> total seguridad.
>
> Un error de posicionamiento se disfraza del hallazgo más alarmante posible. Y
> mirando el vídeo no hay forma de distinguirlos.
>
> Por eso nuestro equipo mide la fuerza del dedo y **se niega a grabar** fuera de
> la ventana segura. Un tamizaje que no sabe cuándo no puede medir no es un
> tamizaje: es un generador de alarmas falsas, y el personal deja de creerle en
> tres semanas.

---

## 5. Demostración (60 s)

Abrir la PWA en el celular. Caso: la niña de Bagua.

1. Introducir edad 6, temperatura 38.6, día 10 post-quimio, 9 horas al INSNSB
2. **Señalar el aviso de ajuste pediátrico que aparece solo al escribir la edad**
3. Mostrar el indicador de presión en vivo
4. Analizar → semáforo **NEGRO**, «INMEDIATO (< 1 hora)»
5. Leer la acción: antibiótico antes del traslado, no al llegar
6. Mostrar el mensaje HL7 que sale hacia Galenus

> Fíjense en el fundamento: el sistema explica cómo llegó al número. Cuántos
> huecos, en cuántos capilares, con qué velocidad de flujo. Un hematólogo puede
> auditar esto. Un modelo de caja negra no.

**Si preguntan por qué el resultado dice NEGRO aunque el tamizaje sea dudoso:**

> Porque la fiebre manda sobre el número. Un tamizaje dudoso nunca puede rebajar
> la conducta que ya indica la clínica; sólo puede subirla. El equipo detecta
> riesgo — jamás lo descarta.

---

## 6. Viabilidad (45 s)

| | |
|---|---|
| Costo por unidad | **S/ 168–327** (USD 45–88) |
| Comparación | Un citómetro de flujo: decenas de miles de dólares |
| Infraestructura | El celular ya está en la posta |
| Software | Íntegramente abierto: Python, OpenCV, FastAPI, Arduino |
| Conectividad | **Funciona sin señal**; la captura se sincroniza sola |

Y un hallazgo de ingeniería que conviene decir porque demuestra rigor:

> Medimos qué necesita realmente la cámara. A 30 fps el método **no funciona**:
> 81% de error. A 60 fps, 7%. El requisito no es resolución, es tasa de
> fotogramas — al revés de lo que uno supondría al comprar un teléfono. Eso lo
> supimos antes de comprar nada.

---

## 7. Lo que falta (25 s)

**Esto suma, no resta. Un jurado clínico castiga el exceso de confianza.**

> Nuestro modelo está entrenado con datos sintéticos generados desde la física,
> porque las bases prohíben usar datos de pacientes y porque no teníamos acceso
> a vídeo real. Nuestro AUC de 0.921 mide la coherencia del pipeline, **no su
> exactitud clínica**. No vamos a decir otra cosa.
>
> Lo que falta no es más código. Son 30 o 50 vídeos reales con hemograma
> pareado. Con eso la calibración se reajusta y estas métricas empiezan a
> significar algo clínico.
>
> Y ese es exactamente el pedido que le hacemos al instituto.

---

## Cierre (10 s)

> La niña de Bagua no necesita un hospital más cerca. Necesita que alguien en su
> posta pueda responder una sola pregunta: ¿su recuento está por debajo de 500?
>
> Eso es Yawar Ñan.

---

## Preguntas probables

**«¿Cómo sé que esto no es un juguete?»**
> El modelo físico reproduce los valores publicados con menos de 1% de error, sin
> ajuste. Y el repositorio tiene 30 tests, uno de los cuales verifica
> precisamente eso — si alguien rompe la física, la suite falla.

**«¿Y si el niño se mueve?»**
> El sistema mide el movimiento residual después de estabilizar y descarta la
> captura si supera el umbral. Preferimos decir «no pude medir» que dar un
> número malo.

**«¿No es peligroso que una enfermera reciba un ANC?»**
> Por eso el resultado sale marcado como tamizaje y preliminar, en HL7 y en
> FHIR, con el método explícito. No entra a la historia como un hemograma. Y la
> interfaz nunca muestra un número sin su intervalo de confianza y su conducta.

**«¿Por qué no una red neuronal?»**
> La probamos. Un gradient boosting sobre 13 variables da AUC 0.892 — **peor que
> no usar modelo**, que da 0.916. Con 300 casos sobreajusta. Embarcamos una
> regresión logística de cuatro parámetros: 0.921, auditable, y que va a poder
> reajustarse con los 30 casos reales que pidamos. Elegir el modelo más simple
> que funciona fue una decisión, no una limitación.

**«¿Qué pasa si el paciente tiene neutropenia étnica benigna?»**
> Es la razón por la que anclamos la calibración al hemograma previo del propio
> paciente cuando existe, en lugar de a un valor poblacional. El equipo se
> empareja con el niño, no con la población.

**«¿Cuánto tarda una medición?»**
> Cinco minutos: 60 segundos en cada uno de 5 capilares. Son cinco porque el
> estudio de referencia mostró que con un solo capilar el AUC es 0.68 —
> inservible — y con cinco llega a 1.00. Un sistema que concluya con un capilar
> está mintiendo por diseño.
