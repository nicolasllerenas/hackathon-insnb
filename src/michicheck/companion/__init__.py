"""El sistema acompañante: el michi doméstico y la app que lo acompaña.

El cliente de MichiCheck no es el establecimiento de salud: es el niño. El
dispositivo es un juguete que vive en su casa, le hace compañía, le recuerda
los controles y le pide el dedito. La app móvil es la otra mitad: educa a la
familia y traduce lo que el michi mide.

Piezas, en el orden en que ocurren:

* :mod:`tratamiento` — las etapas de la leucemia y cómo cambian el ritmo del
  sistema. El abandono se concentra en el mantenimiento, y el michi insiste
  más ahí.
* :mod:`enrolamiento` — la entrega del michi en el primer control. Dos minutos
  en los que se captura lo que hoy no se captura: cuándo se puede contactar a
  quien cuida al niño.
* :mod:`alertas` — cuándo maúlla y por qué a esa hora. Las alertas se programan
  después de la jornada laboral del apoderado, porque un recordatorio que suena
  en una casa vacía no lo escucha nadie.
* :mod:`dispositivo` — el estado del juguete. Un michi que dejó de comunicarse
  es la señal de abandono más temprana que produce el sistema: llega antes que
  la cita perdida.
* :mod:`estados` — los tres estados del paciente y la conducta de cada uno.
* :mod:`referencias` — la red nacional y el establecimiento capaz más cercano,
  para que la respuesta a «no puedo viajar a Lima» deje de ser «entonces no hay
  atención».
"""

from __future__ import annotations

from . import alertas, dispositivo, enrolamiento, estados, referencias, tratamiento

__all__ = ["alertas", "dispositivo", "enrolamiento", "estados", "referencias",
           "tratamiento"]
