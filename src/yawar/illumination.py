"""Optica espectral: que longitud de onda conviene y por que.

Este modulo existe porque la eleccion de 420 nm frente a 530 nm no se puede
zanjar citando un paper: los dos funcionan en la literatura, por mecanismos
distintos, y la respuesta correcta depende del **paciente peruano concreto** y
del sensor que se use. Aqui se cuantifica el compromiso.

El compromiso, en una linea
---------------------------
A 420 nm la hemoglobina absorbe **once veces mas** que a 530 nm, asi que el
contraste de los gaps es muchisimo mejor. Pero a 420 nm la **melanina** absorbe
mas del doble, y la luz azul apenas penetra la epidermis. En una poblacion
pediatrica peruana -- fototipos Fitzpatrick III-V mayoritarios -- esa segunda
mitad de la frase no es un detalle academico: determina si el equipo funciona
igual para todos los ninos o solo para los de piel mas clara.

Un tamizaje cuyo rendimiento dependa del color de piel del nino no es
aceptable, y ademas fallaria en la direccion peor: menos senal, menos gaps
detectados, mas falsos "neutropenia grave" precisamente en los pacientes de
piel mas oscura.

Iluminacion oblicua
-------------------
Con la fuente fuera del eje optico (~70 grados) pasan dos cosas, y ninguna es
campo oscuro:

1. **Se rechaza el reflejo especular de la piel.** Iluminando de frente, el
   brillo que devuelve la superficie de la una y la epidermis se suma al fondo
   y lava el contraste del capilar. Fuera de eje, ese reflejo no entra al
   objetivo. Es la misma razon por la que el pozo de glicerina ayuda: iguala
   indices de refraccion y elimina la interfaz aire-piel.
2. **La luz llega al capilar por dispersion difusa de la dermis**, es decir lo
   transilumina desde atras en vez de rebotar en el. El camino optico efectivo
   dentro de la sangre se alarga, y la absorcion -- que es lo que crea el gap --
   se aprovecha mejor.

Los gaps siguen viendose **brillantes** sobre un lumen oscuro, igual que con
iluminacion directa. Es la configuracion con la que la literatura de *reverse
lens* resuelve gaps a 520 nm.

Fuentes de los coeficientes
---------------------------
Coeficientes de extincion molar de la hemoglobina segun la compilacion estandar
de Prahl (Oregon Medical Laser Center), en cm^-1/M. La absorcion de melanina se
modela con la ley de potencias habitual en optica de tejidos.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

#: Extincion molar de la oxihemoglobina (cm^-1/M) en las longitudes de onda
#: relevantes. El pico de Soret esta en 415 nm; 530 nm cae en el valle entre
#: Soret y las bandas beta/alfa (542 y 577 nm).
HBO2_EXTINCTION: dict[float, float] = {
    415.0: 524_280.0,
    420.0: 430_000.0,
    450.0: 62_000.0,
    500.0: 20_930.0,
    520.0: 32_496.0,
    530.0: 39_036.0,
    542.0: 55_540.0,
    560.0: 41_320.0,
    577.0: 62_600.0,
}

#: Coeficiente de absorcion efectivo de sangre entera a 420 nm (um^-1),
#: el valor que usa el simulador como referencia.
MU_BLOOD_REFERENCE_PER_UM = 0.1
REFERENCE_WAVELENGTH_NM = 420.0

#: Absorcion de melanina a 500 nm en epidermis, en cm^-1, por fototipo
#: Fitzpatrick. Valores orientativos de optica de tejidos.
MELANIN_MU_500NM: dict[str, float] = {
    "I": 12.0, "II": 18.0, "III": 30.0, "IV": 48.0, "V": 75.0, "VI": 110.0,
}

#: Exponente de la ley de potencias de la melanina: mu ~ lambda^-k.
MELANIN_POWER = 3.3

#: Espesor tipico de epidermis en el pliegue ungueal (um). La luz lo atraviesa
#: dos veces: de ida hacia el capilar y de vuelta hacia el sensor.
EPIDERMIS_THICKNESS_UM = 60.0


def hemoglobin_extinction(wavelength_nm: float) -> float:
    """Extincion molar de la oxihemoglobina interpolada (cm^-1/M)."""
    lambdas = np.array(sorted(HBO2_EXTINCTION))
    values = np.array([HBO2_EXTINCTION[k] for k in lambdas])
    return float(np.interp(wavelength_nm, lambdas, values))


def blood_absorption_per_um(wavelength_nm: float) -> float:
    """Coeficiente de absorcion de sangre entera (um^-1) a esa longitud de onda.

    Se escala desde el valor de referencia a 420 nm por la razon de extinciones
    molares, que es lo unico que cambia con lambda a hematocrito constante.
    """
    ratio = hemoglobin_extinction(wavelength_nm) / hemoglobin_extinction(
        REFERENCE_WAVELENGTH_NM)
    return MU_BLOOD_REFERENCE_PER_UM * ratio


def melanin_absorption_per_um(wavelength_nm: float,
                              phototype: str = "IV") -> float:
    """Absorcion epidermica por melanina (um^-1)."""
    mu_500_cm = MELANIN_MU_500NM.get(phototype.upper(), MELANIN_MU_500NM["IV"])
    mu_cm = mu_500_cm * (500.0 / wavelength_nm) ** MELANIN_POWER
    return mu_cm / 10_000.0     # cm^-1 -> um^-1


def epidermal_transmission(wavelength_nm: float, phototype: str = "IV",
                           thickness_um: float = EPIDERMIS_THICKNESS_UM
                           ) -> float:
    """Fraccion de luz que sobrevive el doble paso por la epidermis."""
    mu = melanin_absorption_per_um(wavelength_nm, phototype)
    return float(np.exp(-2.0 * mu * thickness_um))


@dataclass(frozen=True)
class IlluminationBudget:
    """Balance de una configuracion de iluminacion, listo para comparar."""

    wavelength_nm: float
    phototype: str
    mu_blood_per_um: float
    epidermal_transmission: float
    lumen_contrast: float          # modulacion gap vs lumen lleno, 0-1
    effective_contrast: float      # tras la atenuacion epidermica
    oblique: bool

    def __str__(self) -> str:
        return (f"{self.wavelength_nm:.0f} nm "
                f"{'oblicuo' if self.oblique else 'directo'}, fototipo "
                f"{self.phototype}: contraste efectivo {self.effective_contrast:.3f}")


def illumination_budget(wavelength_nm: float, phototype: str = "IV",
                        capillary_diameter_um: float = 15.0,
                        oblique: bool = False,
                        oblique_gain: float = 4.0) -> IlluminationBudget:
    """Contraste esperable de un gap para una configuracion dada.

    ``oblique_gain`` recoge la mejora de la iluminacion oblicua (campo oscuro):
    al no recoger luz directa, el contraste relativo entre eritrocito y plasma
    sube. El valor por defecto (4x) es una estimacion conservadora **a validar
    empiricamente**; es el parametro mas incierto de este modulo y de el depende
    buena parte de la comparacion.
    """
    mu = blood_absorption_per_um(wavelength_nm)
    # Modulacion en transmision: lumen lleno frente a hueco de plasma.
    transmit_full = float(np.exp(-mu * capillary_diameter_um))
    contrast = 1.0 - transmit_full
    if oblique:
        contrast = float(np.clip(contrast * oblique_gain, 0.0, 0.95))

    t_epi = epidermal_transmission(wavelength_nm, phototype)
    return IlluminationBudget(
        wavelength_nm=wavelength_nm,
        phototype=phototype,
        mu_blood_per_um=mu,
        epidermal_transmission=t_epi,
        lumen_contrast=contrast,
        # La epidermis atenua la senal util junto con el fondo; lo que degrada
        # la deteccion es la perdida de fotones, que empeora el ruido relativo.
        effective_contrast=contrast * np.sqrt(t_epi),
        oblique=oblique,
    )


def compare_configurations(phototypes: tuple[str, ...] = ("II", "IV", "V"),
                           capillary_diameter_um: float = 15.0
                           ) -> list[IlluminationBudget]:
    """Tabla comparativa de las configuraciones candidatas."""
    configuraciones = [
        (420.0, False),   # azul directo: la del planteamiento inicial
        (420.0, True),
        (530.0, False),
        (530.0, True),    # verde oblicuo: la del prototipo KittyScope
    ]
    return [illumination_budget(nm, fp, capillary_diameter_um, obl)
            for nm, obl in configuraciones for fp in phototypes]
