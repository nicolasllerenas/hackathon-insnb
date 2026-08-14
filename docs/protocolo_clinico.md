# Protocolo clínico de uso — Yawar Ñan

> **Documento para revisión y firma del médico del equipo.** Recoge los criterios
> implementados en el código; cualquier cambio aquí debe reflejarse en
> `src/yawar/triage.py` y viceversa.

---

## 1. Alcance y límites

Yawar Ñan es una herramienta de **tamizaje**, no de diagnóstico.

| Sí puede | No puede |
|---|---|
| Detectar sospecha de neutropenia grave | Confirmar un diagnóstico |
| Escalar la conducta clínica | **Descartar** neutropenia |
| Priorizar quién necesita hemograma | Sustituir al hemograma |
| Vigilar entre controles | Justificar suspender o modificar quimioterapia |

**Regla de seguridad fundamental:** un resultado verde nunca anula un juicio
clínico. Ante fiebre, síntomas de alarma o duda razonable, se procede según el
protocolo habitual **independientemente del tamizaje**.

---

## 2. Población

**Indicado en:** pacientes pediátricos (0–18 años) con LLA en tratamiento o
seguimiento en el INSNSB, que residan fuera de Lima metropolitana o tengan
dificultad de acceso al control programado.

**No indicado en:** pacientes con lesión, infección o alteración estructural del
lecho ungueal; onicomicosis extensa; esmalte o uñas artificiales que no puedan
retirarse; hipotermia periférica marcada o vasoconstricción que impida
visualizar flujo capilar.

---

## 3. Criterios de decisión

### 3.1 Bandas de recuento (escala NCI / equivalencia CTCAE)

| Banda | ANC (/µL) | Grado CTCAE |
|---|---|---|
| Normal | ≥ 1500 | — |
| Leve | 1000 – 1499 | 2 |
| Moderada | 500 – 999 | 3 |
| **Grave** | **< 500** | **4** |
| Profunda | < 200 | 4 (agranulocitosis) |

> **A confirmar por el médico del equipo.** La nomenclatura en castellano varía
> entre fuentes: algunas reservan «grave» para 500–1000 y llaman «potencialmente
> mortal» a <500. Aquí se usa la equivalencia CTCAE, que es la de uso más
> extendido en oncología pediátrica. El **umbral operativo de 500/µL no cambia**
> con la nomenclatura.

Nótese que el límite inferior de normalidad **depende de la edad** (1500/µL en
menores de 6 años, 1800/µL desde los 10) y que existe la **neutropenia étnica
benigna**, en la que valores de 1000–1500 son normales sin mayor riesgo
infeccioso. Por eso el sistema contrasta siempre con el hemograma previo del
propio paciente cuando existe.

### 3.2 Definición de fiebre (paciente oncológico pediátrico)

- Una toma aislada **≥ 38.3 °C**, **o**
- **≥ 38.0 °C** sostenida durante una hora

### 3.3 Neutropenia febril

Fiebre (según 3.2) **+** ANC < 500/µL, o ANC < 1000/µL con descenso esperable.

**Es una emergencia oncológica.** Antibiótico de amplio espectro dentro de la
primera hora.

---

## 4. Semáforo y conducta

| Nivel | Situación | Conducta | Plazo |
|---|---|---|---|
| 🟢 **VERDE** | ANC ≥ 1500, sin fiebre | Continuar calendario. Reforzar signos de alarma. | Según calendario |
| 🟡 **AMARILLO** | ANC 500–1500, sin fiebre | Repetir tamizaje y coordinar teleconsulta. | 48–72 h |
| 🔴 **ROJO** | Límite inferior del IC95 < 500, sin fiebre | Teleconsulta con Hematología el mismo día. Precauciones y control de temperatura c/8 h. Confirmar con hemograma. | < 6 h |
| ⚫ **NEGRO** | Fiebre + neutropenia o tamizaje no concluyente | **Emergencia oncológica.** Antibiótico de amplio espectro < 1 h, hemocultivos sin demorar el antibiótico, activar referencia. | **< 1 h** |
| ⬜ **INDETERMINADO** | Tamizaje no concluyente, sin fiebre | Repetir siguiendo la guía de calidad. Si persiste, derivar para hemograma. | Repetir ahora |

### 4.1 Dos reglas que el sistema aplica siempre

**La fiebre escala, nunca rebaja.** Si hay fiebre y el tamizaje no es
concluyente, el resultado es NEGRO. Un tamizaje dudoso no puede reducir la
conducta que la clínica ya indica.

**Se decide sobre el límite inferior del intervalo, no sobre la estimación.**
Con pocos eventos detectados el intervalo de confianza es ancho; usar el valor
central equivaldría a fingir una precisión que no se tiene. Un paciente con
estimación de 700 pero IC95 de 320–1500 se clasifica como ROJO.

### 4.2 Modificadores

| Condición | Efecto |
|---|---|
| Catéter venoso central | Escala a ROJO como mínimo (riesgo de bacteriemia) |
| Caída > 800/µL respecto de hemograma de ≤ 7 días | Escala a AMARILLO como mínimo |
| Día 7–14 post-quimioterapia | Se registra en el fundamento: el recuento aún puede bajar |
| > 4 h al centro de referencia y nivel NEGRO | **Iniciar antibiótico antes del traslado**, no al llegar |

---

## 5. Procedimiento de captura

### 5.1 Preparación
1. Verificar que el niño no tenga esmalte ni uñas artificiales.
2. Limpiar el dedo (anular o medio de la mano no dominante) con agua y jabón.
3. Si las manos están frías, entibiar 2–3 minutos: la vasoconstricción reduce el
   flujo y degrada la medición.
4. Aplicar una gota de aceite de inmersión sobre el pliegue ungueal.

### 5.2 Posicionamiento
5. Apoyar el dedo en el soporte hasta el tope, **sin presionar**.
6. Esperar la señal verde de presión del módulo. Si suena el aviso de exceso,
   aflojar. **No grabar con el aviso activo.**

### 5.3 Grabación
7. Grabar **60 segundos** por capilar, a **≥ 60 fps**.
8. Repetir en **5 capilares distintos**. Con menos de 5 el sistema no concluye.

> Los 5 capilares no son un capricho: en el estudio de referencia el AUC pasa de
> 0.68 con un capilar a 1.00 con cinco.

### 5.4 Criterios de repetición
Repetir la captura si el sistema informa: movimiento no corregido, columna
sanguínea insuficiente, diámetro implausible o flujo no medible sin basal.

---

## 6. Calibración basal por paciente

**Cuándo:** en el control presencial en el INSNSB, el mismo día en que se toma un
hemograma.

**Qué se registra:** velocidad de flujo capilar, diámetro capilar y fracción de
neutrófilos del hemograma de ese día.

**Por qué importa:** la velocimetría óptica requiere estructuras que seguir en el
flujo, y en neutropenia profunda casi no hay ninguna — es decir, **falla justo
en el caso crítico**. Anclar la calibración al propio paciente resuelve ese punto
ciego mucho mejor que asumir un valor poblacional. El equipo se empareja con el
niño, no con la población.

**Vigencia sugerida:** revisar la basal en cada control presencial.

---

## 7. Registro e interoperabilidad

Cada tamizaje genera un mensaje **HL7 v2 ORU^R01** hacia el HIS y un **Bundle
FHIR R4**. En ambos, el resultado va marcado como *tamizaje* y *preliminar*, con
el método explícito y una nota de interpretación obligatoria.

Esto no es formalismo: impide que dentro de seis meses alguien lea el valor en la
historia clínica como si fuera un hemograma de laboratorio.

**Datos personales:** sólo se registra el código institucional del paciente. No
se almacenan nombres, DNI ni vídeo más allá del análisis.

---

## 8. Formación mínima del operador

| Contenido | Duración |
|---|---|
| Fundamento del método y sus límites | 30 min |
| Práctica de captura con el modo demostración | 60 min |
| Interpretación del semáforo y criterios de derivación | 30 min |
| Reconocimiento de signos de alarma de neutropenia febril | 30 min |

El modo demostración de la aplicación permite practicar el flujo completo sin
paciente y sin hardware.

---

## 9. Advertencia

Este es un **prototipo de investigación**. No es un dispositivo médico
registrado ante DIGEMID y no debe emplearse para tomar decisiones clínicas fuera
de un protocolo de investigación aprobado por el comité de ética
correspondiente.

---

**Revisado por:** `[…]`  ·  **CMP:** `[…]`  ·  **Fecha:** `[…]`
