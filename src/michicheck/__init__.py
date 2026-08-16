"""MichiCheck — un juguete que acompaña al niño y sostiene su tratamiento.

«Michi» es gato en el habla peruana. El dispositivo tiene forma de gato por una
razón que no es estética: un niño de seis años no se pone un instrumento médico
en el dedo, pero sí se lo pone a un gatito que se lo pide maullando.

El cliente no es la posta: es el paciente
-----------------------------------------
El michi vive en la casa del niño durante los dos años del tratamiento. Le hace
compañía, le recuerda los controles con la voz de un gato y le pide el dedito
para el tamizaje. La app móvil es la otra mitad del sistema: educa a la familia
y traduce lo que el michi mide.

Se eligió el audio y no la llamada telefónica por una razón concreta: la
mayoría de la gente no contesta números desconocidos. Un maullido en la sala,
después de que el papá llegó del trabajo, sí se escucha.

Las piezas
----------
* :mod:`optics`, :mod:`illumination`, :mod:`vision`, :mod:`pipeline`,
  :mod:`model` — el tamizaje óptico: de un vídeo del dedo a un recuento
  estimado con su incertidumbre.
* :mod:`companion` — el sistema acompañante: etapas, entrega del michi,
  alertas, estado del dispositivo, los tres estados del paciente y la red
  nacional de referencia.
* :mod:`triage`, :mod:`telesalud`, :mod:`mantenimiento`, :mod:`derechos`,
  :mod:`adherencia` — la conducta clínica, la teleinterconsulta, la ventana
  terapéutica, los derechos de la Ley 31041 y la carga real de los viajes.
* :mod:`interop` — la salida a Galenus: HL7 v2 ORU^R01 y FHIR R4 con perfiles
  nacionales.

Desafío 3 de la Hackatón Niño San Borja 2026.
Licencia: Apache-2.0
"""

__version__ = "0.3.0"

from . import (adherencia, companion, derechos, illumination, interop,
               mantenimiento, model, optics, pipeline, synth, telesalud,
               triage, vision)

__all__ = ["adherencia", "companion", "derechos", "illumination", "interop",
           "mantenimiento", "model", "optics", "pipeline", "synth", "telesalud",
           "triage", "vision", "__version__"]
