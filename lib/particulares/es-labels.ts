// ─────────────────────────────────────────────────────────────────────────────
// Normaliza a ESPAÑOL los textos de un anuncio que llegan en inglés del portal
// (Idealista sirve a veces la ficha en inglés según la salida del relay:
// «Flat / apartment for sale in Calle X», «4 bedrooms», «Second hand/good
// condition», «1st floor exterior», «North, West»…).
//
// STUB: ahora devuelve el texto tal cual. La implementación real (diccionario
// guiado por los textos que de verdad hay en la BD + tests) la hace el agente
// "es-pin"; el listado y la ficha SOLO deben llamar a estas funciones, nunca
// pintar directamente address / features / floor / condition / orientation.
// ─────────────────────────────────────────────────────────────────────────────

type S = string | null | undefined;

/** Título/dirección del anuncio: «Flat / apartment for sale in Calle X» → «Piso en venta en Calle X». */
export const esAddress = (s: S): string => s ?? "";
/** Una característica: «Terrace and balcony» → «Terraza y balcón». */
export const esFeature = (s: S): string => s ?? "";
export const esFeatures = (l: S[] | null | undefined): string[] => (l ?? []).map(esFeature).filter(Boolean);
/** Planta: «1st floor exterior» → «1.ª planta exterior». */
export const esFloor = (s: S): string => s ?? "";
/** Estado: «Second hand/good condition» → «Segunda mano / buen estado». */
export const esCondition = (s: S): string => s ?? "";
/** Orientación: «North, West» → «Norte, Oeste». */
export const esOrientation = (s: S): string => s ?? "";
/** Texto libre de cualquier otro campo. */
export const esText = (s: S): string => s ?? "";
