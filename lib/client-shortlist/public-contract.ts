// ============================================================================
// Private Client Shortlist · CONTRATO PÚBLICO
//
// Lo que sale por el cable hacia el navegador del cliente. Mismas lecciones
// que PublicViewingCollection, con una diferencia grande: esta superficie
// además ESCRIBE, así que aquí van también los identificadores que el cliente
// necesita para referirse a sus propias tarjetas.
//
// Ese identificador (`itemId`) es un UUID, y es la única excepción a la regla
// de "ningún UUID interno": sin él no hay forma de decir "esta tarjeta". No
// sirve para nada fuera de este shortlist — toda mutación resuelve el
// shortlist DESDE EL TOKEN y comprueba que el item le pertenece.
//
// Lo que NUNCA aparece aquí:
//   · propietario (nombre, teléfono, email)      · notas internas
//   · notas del agente                            · URL de origen / external_id
//   · comisiones                                  · rutas de Storage
//   · el id del cliente ni su perfil              · otros clientes
//   · dirección exacta ni coordenadas  ← el shortlist es ANTES de la visita
// ============================================================================

import type { CollectionLanguage } from "@/lib/viewing-collections/i18n";
import type { ShortlistDecision, ShortlistItemOrigin } from "./types";

export type PublicShortlistProperty = {
  /** Identificador del ITEM dentro de este shortlist. Ver nota de arriba. */
  itemId: string;
  /** Título editorial: «Alquiler de piso en Calle de Jorge Juan» → «Jorge Juan». */
  title: string;
  /** Zona y subzona. NUNCA la calle: esto ocurre antes de confirmar la visita. */
  zoneLabel: string;
  priceLabel: string;
  /** null cuando el anuncio del portal no lo traía. No se inventa un 0. */
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  bcReference: string | null;
  /**
   * true = todavía no es ficha nuestra, es un anuncio que estamos revisando.
   * El cliente no ve de qué portal viene; esto solo sirve para no prometer
   * una galería que no existe.
   */
  pendingProperty: boolean;
  /** Siempre vía proxy /p/. Nunca la URL de Storage. */
  coverPhotoUrl: string | null;
  photoUrls: string[];
  origin: ShortlistItemOrigin;
  decision: ShortlistDecision;
  rank: number | null;
  /**
   * Orden dentro de "Por revisar", ANTES de decidir nada. Hermano de `rank`
   * pero sin su restricción: `rank` solo existe en las prioritarias (lo
   * impone un CHECK), y el cliente tiene que poder ordenar la lista de
   * revisión desde el principio, no solo después de marcar la primera.
   */
  position: number;
  comment: string | null;
};

export type PublicClientShortlist = {
  clientFirstName: string;
  language: CollectionLanguage;
  /** Estado del trabajo, para saber si ya lo envió. */
  submitted: boolean;
  submittedAtLabel: string | null;
  /** Sube con cada escritura; el cliente lo devuelve para detectar rancio. */
  revision: number;
  properties: PublicShortlistProperty[];
  agency: { name: string };
};

export type PublicShortlistResult =
  | { ok: true; shortlist: PublicClientShortlist }
  /** Un único motivo hacia fuera: caducado, revocado e inexistente se ven
   *  IGUAL. Quien pruebe tokens no aprende nada. */
  | { ok: false };
