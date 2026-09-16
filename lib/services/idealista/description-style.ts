// Estilo y formato ÚNICO de las descripciones de anuncios. Centralizado aquí para
// que salga idéntico desde "Generar con IA" (texto) y "Completar con fotos"
// (visión). Registro premium tipo promotora de lujo (EMAAR / DAMAC) adaptado al
// mercado residencial español y a Idealista, con una estructura fija.

export const AGENCY_NAME = "Benjamín Cousiño Propiedades";
export const AGENCY_OPENING = `${AGENCY_NAME} presenta`;

// Se añade SIEMPRE al final de la descripción de todo anuncio de ALQUILER
// (nunca en venta: habla de fianza, que no aplica). Centralizado aquí para que
// la vista previa del formulario (idealista-form.tsx) y lo que de verdad viaja
// a Idealista (mapper.ts, buildPropertyPayload) sean exactamente el mismo texto.
export const DESCRIPTION_FOOTER = `\n\nRequisitos: 1 fianza + personal shopper\n\nPara más propiedades consulta por chat de Idealista y WhatsApp y te enviamos más opciones que se acomoden a tus necesidades.`;

// Guía de estilo que se inyecta en el prompt del sistema de ambos endpoints.
export const DESCRIPTION_STYLE = `Escribe la descripción del anuncio con un registro PREMIUM e inmobiliario de alta gama, al estilo de las grandes promotoras de lujo (EMAAR, DAMAC), pero adaptado al mercado residencial español y a Idealista. Elegante, aspiracional y evocador, sin caer en superlativos huecos ni promesas que los datos no respalden.

FORMATO FIJO (respétalo SIEMPRE, en español de España, 180-240 palabras, 3-4 párrafos):
1) Apertura: empieza EXACTAMENTE con "${AGENCY_OPENING}" seguido del tipo de vivienda y, si se conoce, el barrio/zona (ej. "${AGENCY_OPENING} un exclusivo piso en el corazón de Chamberí..."). Un gancho que transmita estilo de vida.
2) La vivienda: distribución, luz, estancias, calidades y detalles que se aprecien en las fotos o los datos. Concreto y sensorial.
3) El entorno / estilo de vida: qué ofrece la zona (solo si se conoce el barrio); si no se conoce, habla del carácter del inmueble.
4) Cierre: una invitación elegante y exclusiva a concertar una visita.

Reglas:
- Usa ÚNICAMENTE datos reales aportados o visibles en las fotos. NO inventes metros, número de estancias, precio, servicios cercanos concretos ni la calle exacta.
- No incluyas datos de contacto ni el footer (se añaden aparte).
- Nada de markdown, títulos, viñetas ni comillas: solo el texto corrido en párrafos.`;

// Garantiza que la descripción empiece por la apertura de la agencia, salga el
// modelo que salga (algunos la olvidan). Si ya empieza así, la deja igual.
export function enforceAgencyOpening(text: string): string {
  const t = (text ?? "").trim();
  if (!t) return t;
  const normalized = t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const key = AGENCY_OPENING.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (normalized.startsWith(key)) return t;
  // Si el modelo empezó con el nombre pero sin "presenta", u otra variante, o no
  // lo puso: anteponemos la apertura y enlazamos en minúscula la primera palabra.
  const firstLower = t.charAt(0).toLowerCase() + t.slice(1);
  return `${AGENCY_OPENING} ${firstLower}`;
}
