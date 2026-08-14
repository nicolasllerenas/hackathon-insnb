# Correos a enviar

---

## 1. Dataset ANFC-THU (Tsinghua) — envío hoy, respuesta en semanas

> ⚠️ **No llega para mañana.** El acuerdo de acceso exige que el correo lo envíe
> un **docente**, no un estudiante, desde correo institucional. Envíalo igual:
> desbloquea la fase siguiente y, si el jurado pregunta por validación con datos
> reales, poder decir «ya está solicitado» vale mucho más que «lo pensamos pedir».
>
> **Para mañana ya tenemos datos reales** (vídeos suplementarios de Bourquard
> 2018, abiertos, ya descargados y procesados).

**Para:** tjk24@mails.tsinghua.edu.cn
**CC:** yuntaowang@tsinghua.edu.cn, *(el docente que firma)*
**Asunto:** `ANFC_THU Access Request - [Nombre de la universidad]`
**Adjunto:** `ANFC_THU_Release_Agreement.pdf` firmado y escaneado

```
Dear Dr. Tang and Prof. Wang,

I am writing to request access to the ANFC_THU nailfold capillary dataset
described in "A Comprehensive Dataset and Automated Pipeline for Nailfold
Capillary Analysis" (arXiv:2312.05930).

I am [cargo] at [universidad] in Lima, Peru ([sitio web institucional]).
Our group works on [línea de investigación]; relevant publications include
[1-2 referencias].

We are developing a non-invasive optical screening method for severe
neutropenia in paediatric patients with acute lymphoblastic leukaemia,
in collaboration with the Instituto Nacional de Salud del Niño - San Borja,
Peru's national paediatric referral hospital. The clinical problem we address
is that most of these children live far from Lima, and the blood count that
guides their chemotherapy is only available at the referral centre. Our
approach counts optical absorption gaps in nailfold capillaries, following
the method of Bourquard et al. (Sci Rep 2018).

We would use ANFC_THU for two specific purposes:

1. To validate our capillary segmentation and lumen-diameter estimation
   against expert annotations. We currently fit a Beer-Lambert absorption
   profile to measure lumen diameter, and we need expert-annotated data to
   quantify its accuracy.
2. To measure the statistics of erythrocyte density fluctuations in real
   capillary flow. Our physical simulator assumes a 25% modulation amplitude,
   which is currently our least-supported parameter.

The dataset would be used strictly for academic, non-commercial research, in
accordance with the release agreement, which is attached signed. We would
cite the dataset in any resulting publication, and we are glad to share our
findings with your group.

Thank you for making this resource available to the community.

Sincerely,
[Nombre completo]
[Cargo], [Departamento]
[Universidad]
[Correo institucional] | [Teléfono]
```

---

## 2. OGTI / Informática del INSN San Borja — este sí puede responderse rápido

> Este correo es **mucho más útil para mañana** que el anterior. Aunque no
> conteste a tiempo, haberlo enviado convierte «proponemos integrarnos con
> Galenus» en «ya solicitamos los datos de integración», que es una posición
> completamente distinta ante el jurado.

**Asunto:** `Hackatón Niño San Borja 2026 - Consulta técnica de interoperabilidad (Desafío 3)`

```
Estimado equipo de la Oficina de Tecnologías de la Información:

Somos el equipo [nombre], participantes del Desafío 3 (Ruta Hematológica) de
la Hackatón Niño San Borja 2026.

Nuestra solución genera un resultado de tamizaje hematológico no invasivo y lo
emite en dos formatos: HL7 v2 (mensaje ORU^R01) para el sistema hospitalario, y
FHIR R4 alineado con la guía nacional HL7.FHIR.PE.COREPE publicada por el MINSA
(https://dyaku.minsa.gob.pe/guides/), pensando en la interoperabilidad con
RENHICE.

Para que la propuesta sea realista y no una suposición nuestra, agradeceríamos
su orientación en los siguientes puntos. Cada uno se responde en una línea:

1. ¿El sistema del instituto cuenta con motor de integración HL7 v2 (Mirth,
   Rhapsody, InterSystems u otro)? ¿A qué host y puerto MLLP se dirigen los
   mensajes ORU^R01?
2. ¿Qué versión de HL7 v2 acepta (2.3 / 2.5 / 2.5.1)? ¿Existe una guía de
   mensajería institucional que debamos seguir?
3. ¿Cómo se identifica al paciente en el segmento PID-3: número de historia
   clínica institucional, DNI, o ambos?
4. ¿Debemos mapear el resultado a un catálogo local de pruebas, o se acepta un
   código propio en OBX-3 acompañado de LOINC?
5. ¿El instituto se encuentra en proceso de acreditación SIHCE/RENHICE? ¿En qué
   fase?
6. ¿Cuál es el código RENIPRESS exacto del INSN San Borja? (estamos usando
   00006213 como valor provisional y preferimos no publicar un dato incorrecto)
7. ¿Existe un entorno de pruebas contra el cual podamos validar el formato del
   mensaje, sin tocar producción?

La pregunta 7 es la que más nos ayudaría y la que menos les cuesta: nos
permitiría verificar que nuestros mensajes son correctos antes de proponer
cualquier integración.

Queremos dejar constancia de que nuestro prototipo no accede a ningún sistema
del instituto, no utiliza datos de pacientes y trabaja íntegramente con datos
sintéticos generados por nosotros. Esta consulta es únicamente para que el
diseño de interoperabilidad se ajuste a la realidad del INSNSB y no a
suposiciones.

Quedamos atentos y agradecemos su tiempo.

Atentamente,
[Nombre] - representante del equipo [nombre del equipo]
[Correo] | [Teléfono]
```

---

## 3. Opcional: autores del método original (MIT / Leuko)

> Solo si sobra tiempo. Baja probabilidad de respuesta rápida, pero una
> respuesta afirmativa sería un aval fuerte para el proyecto.

**Asunto:** `Paediatric adaptation of nailfold OAG neutropenia screening - Peru`

```
Dear Dr. Bourquard and colleagues,

We are a multidisciplinary team in Lima, Peru, adapting the nailfold optical
absorption gap method (Sci Rep 2018;8:5301) to paediatric patients with acute
lymphoblastic leukaemia at our national children's referral hospital.

We wanted to share one finding and ask one question.

The finding: because the method counts total leukocytes rather than
neutrophils, and because the neutrophil fraction in children varies from ~31%
at one year of age to ~59% in adults, the ~7 events/capillary/minute threshold
does not transfer. In a two-year-old it corresponds to an ANC of roughly
272/uL rather than 500/uL, missing the clinically actionable range. We
estimate the age-appropriate threshold at that age to be closer to
12.8 events/minute.

The question: in your cohort, did you observe systematic differences in gap
detectability across skin phototypes? Our optical budget suggests 420 nm is
substantially attenuated by melanin, which matters for our population, and we
would value your empirical experience before committing to a wavelength.

Our work is open source under Apache-2.0 and we would be glad to share it.

With thanks and appreciation for your work,
[Nombre] - [institución]
```

---

## Orden y plazos

| # | Correo | Cuándo | Llega a tiempo |
|---|---|---|---|
| 2 | **OGTI INSNSB** | **ahora** | Quizá; y enviarlo ya cuenta |
| 1 | Tsinghua (dataset) | hoy | No — es para la fase siguiente |
| 3 | MIT / Leuko | si sobra tiempo | No |
