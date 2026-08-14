# Interoperabilidad — ¿cómo llega el resultado a Galenus?

> Investigación hecha el 13/08/2026 sobre fuentes públicas. Lo que está
> confirmado se cita; lo que no pudimos confirmar se dice como tal.

---

## Resumen para el pitch

**No hay una API pública de Galenus.** No existe documentación abierta de
integración de ese HIS, y era previsible: los HIS hospitalarios peruanos no
publican su interfaz.

**Pero eso no bloquea nada**, y por dos razones:

1. Emitimos **HL7 v2 ORU^R01**, que es el mensaje universal con el que un
   equipo de laboratorio o de punto de atención notifica un resultado. Ningún
   HIS hospitalario serio carece de un receptor de ORU. Es lo que se pide, no
   lo que se desarrolla.
2. Emitimos además **FHIR R4 alineado con el perfil nacional peruano**, que es
   hacia donde el MINSA está llevando obligatoriamente al sector. Eso es
   verificable y está publicado.

La pregunta correcta al INSNSB no es «¿tienen API?» sino **«¿a qué host y
puerto envío un ORU^R01, y qué perfil de mensaje espera su motor de
integración?»**. Es una pregunta de media hora para su oficina de informática.

---

## 1. Lo que sí está confirmado: el estándar nacional

El MINSA publica una guía de implementación FHIR propia:

| | |
|---|---|
| **Guía** | `HL7.FHIR.PE.COREPE` |
| **URL** | https://dyaku.minsa.gob.pe/guides/ |
| **Canónico** | `https://www.gob.pe/minsa/RENHICE/fhir/` |
| **Versión FHIR** | 4.0.1 |
| **Versión guía** | 0.1 (ci-build — **en desarrollo**) |
| **Marco legal** | Ley 30024 (RENHICE), Ley 29733 (datos personales), Ley 27269 (firma digital) |

### Perfiles definidos (9)

`PacientePe` · `PractitionerPe` · `OrganizacionPe` · `AlergiaPe` ·
`ConditionPe` · `MedicationStatementPe` · `CompositionPe` · `BundlePe` ·
`ConsentimientoRENHICE`

### Sistemas de códigos (4)

| CodeSystem | Uso |
|---|---|
| `IdspersonaPeru` | Tipos de documento de identidad |
| `IPRESSCS` | Establecimientos de salud (RENIPRESS) |
| `ColegiosProfesionalesSaludCS` | Colegios profesionales |
| `PaisesCS` | Países |

### Extensiones (3)
`pe-ubigeo` · `pe-pais` · `pe-tercerapellido`

### Estado de implementación

En junio de 2025 el MINSA celebró la **primera Conectatón IPS Perú**, con
apoyo del BID y la OPS: 30 entidades y más de 250 profesionales validando el
intercambio bajo el modelo IPS (*International Patient Summary*). Es decir, el
ecosistema está en fase de pruebas reales, no de papel.

---

## 2. El hueco que nos afecta directamente

**La guía nacional no define perfiles de `Observation`, `DiagnosticReport` ni
`ServiceRequest`.**

Cubre el conjunto mínimo IPS — alergias, condiciones, medicación — más
paciente, profesional, organización, composición, bundle y consentimiento. Un
**resultado de laboratorio o de tamizaje todavía no tiene perfil nacional.**

Lo que hicimos con eso:

| Recurso | Conformidad |
|---|---|
| `Patient` | ✅ `PacientePe` |
| `Organization` | ✅ `OrganizacionPe`, identificada por RENIPRESS |
| `Bundle` | ✅ `BundlePe` |
| `Observation` (ANC y calidad) | ⚠️ FHIR R4 base — no existe perfil nacional |
| `DiagnosticReport` | ⚠️ R4 base |
| `ServiceRequest`, `Flag`, `Device` | ⚠️ R4 base |

El bundle **declara esto explícitamente** en un campo `_conformidad`, para que
quien lo procese dentro de seis meses sepa qué partes eran conformes y cuáles
no lo eran porque el perfil aún no existía. No fingimos una conformidad que no
tenemos.

> **Esto es una oportunidad, no sólo una limitación.** Un perfil de
> `Observation` para resultados de tamizaje es algo que hoy le falta al país.
> Proponerlo es exactamente lo que las bases piden como «componentes abiertos y
> reutilizables», y es una contribución que sobrevive al prototipo.

---

## 3. Requisitos reales para conectarse a RENHICE

No son triviales y conviene decirlos en el pitch antes de que los pregunten:

| Requisito | Implicación para nosotros |
|---|---|
| **Acreditación del SIHCE** ante el MINSA | Un prototipo de hackatón no se acredita. Se integra *a través del* SIHCE del INSNSB, que sí lo está o lo estará. |
| **Consentimiento expreso del paciente** | Debe registrarse como recurso `Consent` (`ConsentimientoRENHICE`). |
| **Certificado digital** del profesional (Ley 27269) | La firma la pone el profesional del establecimiento, no el dispositivo. |
| **Acceso vía Plataforma de Interoperabilidad del Estado** | No se conecta un equipo directamente a RENHICE. |

**Conclusión arquitectónica:** el KittyScope **nunca habla con RENHICE
directamente**. Habla con el SIHCE del establecimiento, y ese sistema —que sí
está acreditado, firmado y autorizado— es el que reporta. Es la arquitectura
correcta y además la única legalmente viable.

```
KittyScope → API Yawar Ñan → HL7 v2 ORU^R01 → HIS/Galenus del INSNSB
                           ↘ FHIR Bundle    → SIHCE acreditado → RENHICE
```

---

## 4. Lo que hay que preguntarle al INSNSB

Preguntas concretas para la oficina de informática / OGTI del instituto. Cada
una tiene respuesta de una línea y desbloquea la integración:

1. ¿Galenus cuenta con **motor de integración HL7 v2** (Mirth, Rhapsody,
   InterSystems u otro)? ¿A qué host y puerto MLLP se envían los ORU^R01?
2. ¿Qué versión de HL7 v2 acepta — 2.3, 2.5, 2.5.1 — y hay una **guía de
   mensajería institucional** que debamos seguir?
3. ¿Cómo se identifica al paciente en el mensaje: número de historia clínica
   institucional, DNI, o ambos? ¿Qué va en `PID-3`?
4. ¿Existe un **catálogo local de pruebas** al que haya que mapear el resultado,
   o se acepta un código propio en `OBX-3` con LOINC?
5. ¿El instituto ya está en el proceso de acreditación **SIHCE/RENHICE**? ¿En
   qué fase?
6. ¿Cuál es el **código RENIPRESS** exacto del INSN San Borja? *(usamos
   `00006213` como marcador; hay que confirmarlo)*
7. ¿Hay un **entorno de pruebas** contra el que podamos validar el mensaje sin
   tocar producción?

> La pregunta 7 es la más importante para el prototipo, y la más fácil de
> conceder: no requiere decisión de gobierno ni presupuesto.

---

## 5. Qué está implementado ya

```python
from yawar.interop import build_oru_r01, build_bundle

# HL7 v2 para el HIS actual
mensaje = build_oru_r01(resultado, decision, patient_id="INSNSB-2026-0147")

# FHIR R4 + PE Core para RENHICE, vía el SIHCE
bundle = build_bundle(resultado, decision, patient_id="INSNSB-2026-0147",
                      device_id="yawar-01", renipress="00006213")
```

Y por API:

```
GET /api/v1/sesiones/{id}/hl7    → ORU^R01 en texto plano
GET /api/v1/sesiones/{id}/fhir   → Bundle transaction JSON
```

Ambos marcan el resultado como **tamizaje** y **preliminar**, con el método
explícito y una nota de interpretación obligatoria. Eso no es formalismo: es lo
que impide que dentro de seis meses alguien lea el valor en la historia clínica
como si fuera un hemograma de laboratorio.

---

## 6. Fuentes

- MINSA — Guía de implementación FHIR Perú Core: https://dyaku.minsa.gob.pe/guides/
- MINSA — Lineamientos: https://dyaku.minsa.gob.pe/guides/Lineamientos.html
- MINSA — Ejemplo de Bundle IPS: https://dyaku.minsa.gob.pe/guides/Bundle-BundleEjemploPe.html
- OPS/OMS — *Perú valida interoperabilidad de historias clínicas electrónicas* (20/06/2025): https://www.paho.org/es/noticias/20-6-2025-transformacion-digital-peru-valida-interoperabilidad-historias-clinicas
- MINSA — Nota sobre la Conectatón: https://www.gob.pe/institucion/minsa/noticias/1190113-hito-historico-minsa-dio-primer-gran-paso-hacia-la-interoperabilidad-entre-sistemas-de-informacion-de-historias-clinicas-electronicas
- RACSEL — *Perú avanza en interoperabilidad con su primera Conectatón IPS 2025*: https://racsel.org/noticias/Perú-avanza-en-interoperabilidad-con-su-primera-Conectatón-IPS-2025/
- MINSA — SIHCE: https://www.minsa.gob.pe/sihce/manuales.asp
