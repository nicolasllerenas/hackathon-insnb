# ANEXO 2 — DECLARACIÓN DE USO DE INTELIGENCIA ARTIFICIAL GENERATIVA

**Equipo:** `[…]` · **Solución:** Yawar Ñan · **Desafío:** 3 — Ruta Hematológica

---

## 1. Herramientas empleadas

| Herramienta | Uso |
|---|---|
| Claude (Anthropic), vía Claude Code | Asistencia en desarrollo de software, redacción técnica y búsqueda bibliográfica |

---

## 2. Finalidad del uso

| Ámbito | Qué hizo la herramienta | Qué hizo el equipo |
|---|---|---|
| **Código** | Redacción del pipeline de visión, simulador, API, PWA y firmware; propuesta de estructura del repositorio | Definición del problema, decisiones de arquitectura, revisión y aceptación de cada componente |
| **Física y algoritmos** | Derivación del modelo geométrico; propuesta de la reproyección al marco material y del ajuste de Beer-Lambert para el diámetro | Validación de que los resultados reproducen la literatura; decisión de qué métodos conservar |
| **Análisis** | Ejecución de los experimentos de barrido (fps, diámetro, detección) y comparación de modelos | Interpretación de resultados y decisiones derivadas (p. ej. descartar el gradient boosting) |
| **Bibliografía** | Búsqueda y extracción de parámetros de los artículos citados | Selección de las fuentes, verificación de las cifras |
| **Documentación** | Redacción de README, protocolo clínico, documentación de hardware y guion de pitch | Revisión, corrección y validación clínica |

---

## 3. Contenidos incorporados

**Generado con asistencia de IA y revisado por el equipo:**

- Todo el código fuente de `src/yawar/`, `services/`, `apps/`, `firmware/`, `scripts/` y `tests/`
- Los documentos de `docs/` y el `README.md`
- El notebook `notebooks/01_yawar_colab.ipynb`

**No generado por IA:**

- Las cifras epidemiológicas, tomadas de la Sala Situacional pública del INSNSB (noviembre 2025)
- Los parámetros ópticos y hematológicos, tomados de la literatura citada en el README
- Los criterios clínicos de neutropenia febril, tomados de las guías de referencia y validados por el médico del equipo
- Las decisiones de alcance, diseño y priorización del proyecto

**Datos:** el conjunto de entrenamiento es **íntegramente sintético**, generado
por un simulador físico documentado (`src/yawar/synth.py`). No se empleó ningún
dato de pacientes, real ni anonimizado, ni ningún dataset de terceros.

---

## 4. Acciones de revisión realizadas

1. **Verificación contra la literatura.** El modelo físico se contrastó con los
   valores publicados por Bourquard et al. (2018); reproduce 3.773 y 236
   células/µL con menos de 1% de error, sin ajuste de parámetros. Existe un test
   automatizado que falla si esto deja de cumplirse.

2. **Suite de pruebas.** 30 tests automatizados cubren el modelo físico, la
   corrección pediátrica, el pipeline de visión y las reglas de triaje.

3. **Revisión de errores propuestos por la IA.** Durante el desarrollo se
   detectaron y corrigieron, mediante medición y no por inspección, varios
   defectos en implementaciones inicialmente propuestas: un sesgo de coordenadas
   en el simulador, un umbral de detección que producía falsos positivos por
   comparaciones múltiples, un signo invertido en la correlación de fase y una
   estabilización que se enganchaba al flujo sanguíneo en lugar de al tejido.
   Cada corrección está documentada en el código.

4. **Validación de decisiones de modelado.** Se compararon empíricamente cuatro
   familias de modelos; se descartó la propuesta inicial (gradient boosting) por
   rendir peor que la línea base física.

5. **Revisión clínica.** Los criterios de decisión, umbrales y conductas fueron
   revisados por el médico del equipo (`docs/protocolo_clinico.md`).

6. **Revisión de hardware.** Los cálculos eléctricos y de dimensionamiento se
   verificaron numéricamente, lo que llevó a corregir tres errores de la lista de
   materiales inicial (`docs/hardware.md`).

---

## 5. Declaración

El equipo declara que:

- Conoce y asume la **responsabilidad íntegra** sobre el contenido entregado,
  con independencia de la herramienta empleada para producirlo.
- Ha **revisado y verificado** todo el material generado con asistencia de IA.
- No se emplearon datos personales, información confidencial ni credenciales
  institucionales en ninguna interacción con la herramienta.
- Las fuentes de terceros están **debidamente citadas** en el `README.md`.
- Las afirmaciones cuantitativas del entregable son **reproducibles** ejecutando
  el código del repositorio.

---

**Representante del equipo:** `[…]` · **DNI/CE:** `[…]` · **Fecha:** `[…]`
