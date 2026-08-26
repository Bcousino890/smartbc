// Universidades cercanas a una propiedad, para el módulo de ubicación.
//
// REUTILIZA lo que ya existe, no crea nada:
//   · el catálogo `lib/data/universities.ts` (universidades y sus sedes, con
//     dirección y coordenadas) — misma fuente que "Distancia al campus" del
//     portal de cliente;
//   · el cálculo `computePoiTravel` del propio módulo de ubicación, así que
//     los minutos, los modos y la semántica de `≈` son EXACTAMENTE los mismos
//     que los de cualquier otro destino. Ni un minuto nuevo, ni otra fórmula.
//
// Sobre el "contexto estudiante": un SmartLink público es anónimo — el perfil
// "Estudiante" existe en la ficha del CLIENTE dentro del CRM, no en la
// propiedad, así que no hay forma honesta de saber quién está mirando. Por eso
// la sección no se condiciona a un segmento adivinado: se muestra cuando
// APORTA (hay coordenadas y hay campus a una distancia razonable) y no se
// muestra cuando no.

import { UNIVERSITIES } from "@/lib/data/universities";
import { computePoiTravel, type PoiTravel } from "@/lib/geo/poi-distance";

export type NearbyUniversity = PoiTravel & {
  /** Sede concreta cuando la universidad tiene varias ("IE Tower"). */
  campusLabel: string | null;
};

/** Por encima de esto la universidad ya no es un argumento de la ubicación. */
const MAX_MINUTES = 45;
const MAX_RESULTS = 5;

export function findNearbyUniversities(
  property: { lat: number | null; lng: number | null },
  limit = MAX_RESULTS,
): NearbyUniversity[] {
  if (property.lat == null || property.lng == null) return [];
  const origin = { lat: property.lat, lng: property.lng };

  const best: NearbyUniversity[] = [];
  for (const uni of UNIVERSITIES) {
    // Una entrada por UNIVERSIDAD, con su sede más cercana: mostrar dos
    // campus de la misma escuela ocuparía sitio sin añadir información.
    let winner: NearbyUniversity | null = null;
    for (const campus of uni.campuses) {
      const travel = computePoiTravel(origin, {
        name: uni.shortName ?? uni.name,
        category: "educacion",
        latitude: campus.lat,
        longitude: campus.lng,
        // Andando si está cerca, en coche si no: mismo criterio que el resto
        // de destinos del módulo.
        travel_modes: ["walk", "drive"],
      });
      if (!travel) continue;
      if (!winner || travel.minutes < winner.minutes) {
        winner = {
          ...travel,
          campusLabel: uni.campuses.length > 1 ? campus.label : null,
        };
      }
    }
    if (winner && winner.minutes <= MAX_MINUTES) best.push(winner);
  }

  return best.sort((a, b) => a.minutes - b.minutes).slice(0, limit);
}
