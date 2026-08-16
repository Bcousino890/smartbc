// ============================================================================
// CONTRATO PÚBLICO · /v/[token]
// ----------------------------------------------------------------------------
// ⚠️  Todo lo que entre en este fichero lo puede leer cualquiera que tenga el
//     enlace. Añadir un campo aquí es una decisión de SEGURIDAD, no de
//     conveniencia. Cualquier PR que toque este fichero necesita revisión.
//
// PROHIBIDO, directa o anidadamente:
//   · UUIDs de cualquier entidad
//   · owner_name · owner_phone · owner_email
//   · properties.internal_notes · selection.agent_notes · stop.agent_notes
//   · source_url · external_id · cover_photo_url (URL cruda de Storage)
//   · comisiones (agency_partnerships.*)
//   · presupuesto o preferencias del cliente (client_preferences.*)
//   · etiquetas internas (client_tags)
//   · property_shares.label
//   · email o teléfono del cliente
//   · otros clientes, otros itinerarios, otras selecciones
//   · objetos crudos de profiles o properties
// ============================================================================

/** Los 6 estados internos de una parada se colapsan a 3 de cara al cliente. */
export type PublicStopStatus = "confirmed" | "pending" | "cancelled";

export type PublicAvailability =
  | "available"
  | "reserved"
  | "sold"
  | "unavailable";

/**
 * Ubicación aproximada de una zona. Es un tipo DISTINTO de las coordenadas
 * reales a propósito: así es imposible confundir un centroide de barrio con la
 * posición exacta de la propiedad al renderizar el mapa.
 *
 * En V1 siempre es null: no hay centroides fiables (geofence_zones y
 * location_hierarchies están vacías, chile_zones no tiene coordenadas y el
 * ZONE_COORDS del código cubre 7 de los 21 distritos de Madrid y cae a Puerta
 * del Sol para el resto — señalar un sitio incorrecto es peor que no señalar).
 */
export type PublicAreaLocation = {
  label: string;
  centroidLat: number;
  centroidLng: number;
  zoom: number;
};

export type PublicViewingStop = {
  /** 1..N sobre las paradas VISIBLES, recalculado tras filtrar. Sin huecos. */
  order: number;

  timeLabel: string | null;
  /** true = el agente ha declarado que la hora está por confirmar. Sin hora y
   *  sin esto, la parada simplemente no tiene hora (cancelada, por ejemplo). */
  timePending: boolean;
  durationLabel: string | null;
  status: PublicStopStatus;

  // — Propiedad —
  title: string;
  propertyTypeLabel: string | null;
  zoneLabel: string;
  bedrooms: number;
  bathrooms: number;
  squareMeters: number | null;
  priceLabel: string;
  /** Referencia neutra BC-XXXX: no delata el portal de origen. */
  bcReference: string | null;
  availability: PublicAvailability;

  // — Ubicación · exactamente una de las dos ramas, nunca ambas —
  exactAddress: string | null;
  exactLat: number | null;
  exactLng: number | null;
  areaLocation: PublicAreaLocation | null;

  // — Imágenes · SIEMPRE vía el proxy /p/{slug}/{idx} —
  coverPhotoUrl: string | null;
  photoUrls: string[];

  // — SmartLink —
  smartLinkUrl: string | null;
  /** false si cayó al enlace estable /compartir (sin tracking). */
  smartLinkTracked: boolean;
};

export type PublicAgentContact = {
  displayName: string;
  email: string | null;
  phone: string | null;
  whatsappUrl: string | null;
  avatarUrl: string | null;
};

import type { CollectionLanguage } from "./i18n";

export type PublicViewingCollection = {
  /** Idioma elegido por el agente. 'ar' y 'he' se renderizan en RTL. */
  language: CollectionLanguage;
  title: string;
  dateLabel: string;
  windowLabel: string | null;
  /** ⚠️ SOLO el nombre de pila: si el cliente reenvía el enlace, el apellido
   *  sería un dato personal extra sin ninguna ganancia. */
  clientFirstName: string;
  stopCount: number;
  expiresAtLabel: string;
  stops: PublicViewingStop[];
  agent: PublicAgentContact;
};

/**
 * Resultado de resolver un token.
 *
 * La rama de fallo NO lleva motivo a propósito: caducado, revocado,
 * inexistente y cancelado deben ser indistinguibles desde fuera. Un 404 que
 * distingue "no existe" de "existe pero no puedes" ya es información.
 */
export type PublicCollectionResult =
  | { ok: true; collection: PublicViewingCollection; shareId: string }
  | { ok: false };
