// Tokens de movimiento del módulo de localización.
//
// Una sola tabla para que el rail, la cámara, los marcadores y la ficha se
// muevan como una coreografía y no como cuatro componentes que casualmente
// animan a la vez. Sin esto acaban apareciendo 300, 450 y 700 ms repartidos
// por el código sin que nadie sepa cuál manda.
//
// El reparto de tiempos sale del documento de arquitectura (§13) y es una
// línea de salida para afinar con la QA grabada, no una copia de tiempos
// ajenos:
//
//   T+0     el nodo del rail se activa y el indicador arranca
//   T+80    la cámara empieza a moverse
//   T+280   los POIs no seleccionados se apagan
//   T+360   entra el marcador del destino
//   T+440   aparece la ficha
//   T+700   todo asentado
export const LOCATION_MOTION = {
  /** Recorrido del indicador de viaje por el rail. */
  rail: 620,
  /** Encuadre de la cámara sobre vivienda + destino. */
  camera: 650,
  /** Entrada del marcador del destino. */
  marker: 280,
  /** Aparición de la ficha contextual. */
  card: 300,
  /** Vuelta al overview. */
  reset: 600,
  /** Retardo de la cámara respecto al rail: el rail manda, el mapa acompaña. */
  cameraDelay: 80,
} as const;

/** Sin rebote y sin sobrepasar el destino: entra decidido y se para. */
export const LOCATION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/** ¿El usuario ha pedido menos movimiento? Se consulta en el momento. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
