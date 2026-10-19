import { useEffect, useRef, useSyncExternalStore } from "react";
import { robot, type InstantaneaRobot } from "./conexion";
import type { LatidoRobot } from "./protocolo";

export function useRobot(): InstantaneaRobot {
  return useSyncExternalStore(robot.suscribir, robot.obtener, robot.obtener);
}

export function useAlLatido(alRecibir: (latido: LatidoRobot) => void): void {
  const ref = useRef(alRecibir);
  useEffect(() => {
    ref.current = alRecibir;
  });
  useEffect(() => robot.alLatido((l) => ref.current(l)), []);
}
