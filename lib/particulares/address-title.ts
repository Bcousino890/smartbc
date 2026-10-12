// Título vs dirección de los anuncios de particulares.
//
// Idealista guardaba el TÍTULO del anuncio en `address` («Piso en venta en Calle
// de Orense, 49»). La migración 0186 añade `title` y deja en `address` solo la
// dirección («Calle de Orense, 49»). Este módulo es el espejo en TypeScript de
// `particulares_clean_address` / `particulares_address_has_title` (SQL) para:
//   · filas anteriores al backfill (o con la migración sin aplicar),
//   · el geocodificador y la UI.
// Si cambias una regla aquí, cámbiala también en la migración 0186.

const ES_TYPE =
  "(?:piso|apartamento|estudio|loft|[aá]tico|d[uú]plex|tr[ií]plex|chalet(?: adosado| pareado| independiente)?|" +
  "casa(?: o chalet(?: independiente| adosado| pareado)?| rural| de pueblo| terrera| adosada| pareada| independiente)?|" +
  "finca r[uú]stica|caser[oó]n|cortijo|mas[ií]a|palacio|torre|local(?: comercial)?|garaje|trastero|habitaci[oó]n|" +
  "terreno|solar|nave(?: industrial)?|oficina|edificio|bajo|planta baja|villa)";
const ES_TITLE = new RegExp(
  `^(?:alquiler de |venta de |alquiler y venta de )?${ES_TYPE}(?: en (?:venta|alquiler|alquiler con opci[oó]n a compra|traspaso))? en .`,
  "i",
);
const EN_TITLE = new RegExp(
  "^(?:flat / apartment|flat|apartment|studio|penthouse|duplex|triplex|loft|detached house|terraced house|" +
    "semi-detached house|house|villa|village house|country house|estate|rural manor|masía|mansion|" +
    "commercial premises|garage|storage room|room|land|plot|office|building|chalet) for (?:sale|rent) in .",
  "i",
);

const STREET_START =
  /^(?:(?:calle|avenida|paseo|plaza|camino|carretera|traves[ií]a|ronda|glorieta|pasaje|pasadizo|cuesta|bulevar|urbanizaci[oó]n|calzada|costanilla|corredera|ribera|v[ií]a|senda|sendero|callej[oó]n|ca[ñn]ada|rambla|poblado|barrio)(?: |$)|(?:c\/|c\.|cl\.?|av\.?|avda\.?|pza\.?|ctra\.?|pº)(?: |\/|$)|de la |del |de los |de las |de )/i;

const NUM_SEG = /^(?:s\/n|sn|km ?\d+(?:[.,]\d+)?|\d{1,4} ?[a-z]?(?: |\/|-|$))/i;
const NUM_TAKE = /^(s\/n|sn|km ?\d+(?:[.,]\d+)?|\d{1,4}(?: ?[a-z](?![a-zñáéíóú]))?)/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** ¿El texto es un título de anuncio («Piso en venta en …», «Flat / apartment for rent in …»)? */
export function addressHasTitle(text: string | null | undefined): boolean {
  const t = clean(text ?? "");
  return !!t && (ES_TITLE.test(t) || EN_TITLE.test(t));
}

export function looksLikeStreet(text: string): boolean {
  return STREET_START.test(text);
}

/**
 * Espejo de `particulares_clean_address`: «Piso en venta en Calle Alcalá, Madrid, 163»
 * → «Calle Alcalá, 163»; «Calle del Barco, 38, Malasaña, Madrid» → «Calle del Barco, 38».
 * Un título que solo trae barrio/municipio («Piso en venta en Goya») → «Goya».
 * Un texto sin prefijo y sin pinta de calle (descripción, barrio suelto) se devuelve igual.
 */
export function cleanAddress(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = clean(raw);
  if (!s) return null;
  const titled = addressHasTitle(s);
  if (titled) {
    s = s.replace(/^.*? (?:en|in) /i, "");
    s = s.replace(/^(?:venta|alquiler|alquiler con opci[oó]n a compra|traspaso) en /i, "");
    s = s.replace(/^(?:sale|rent) in /i, "");
  } else if (!looksLikeStreet(s)) {
    return s;
  }
  let segs = s.split(/\s*,\s*/);
  let street = segs[0];
  if (!street) return s;
  if (segs.length >= 2 && /^(?:el|la|los|las)$/i.test(segs[1])) {
    street = `${segs[1]} ${street}`;
    segs = [street, ...segs.slice(2)];
  }
  let num: string | null = null;
  for (let i = 1; i < segs.length; i++) {
    if (NUM_SEG.test(segs[i])) {
      num = NUM_TAKE.exec(segs[i])?.[1] ?? null;
      break;
    }
  }
  if (num) return `${street.trim()}, ${num.trim()}`;
  return street.trim();
}

/** Dirección para mostrar: la limpia si hay (tolera filas aún con el título dentro). */
export function addressLine(address: string | null | undefined): string {
  return cleanAddress(address) ?? "";
}

/**
 * Título para el encabezado: el original (`title`), o el título guardado en `address`
 * en filas sin backfill, o uno compuesto «Piso en venta en <calle|zona>».
 */
export function listingTitle(input: {
  title?: string | null;
  address?: string | null;
  zone?: string | null;
  operation?: string | null;
}): string {
  const t = clean(input.title ?? "");
  if (t) return t;
  if (addressHasTitle(input.address)) return clean(input.address as string);
  const street = addressLine(input.address);
  const zone = clean(input.zone ?? "");
  const where = street ? (zone ? `${street}, ${zone}` : street) : zone;
  const rent = input.operation === "rent";
  if (!where) return rent ? "Alquiler de piso" : "Piso en venta";
  return rent ? `Alquiler de piso en ${where}` : `Piso en venta en ${where}`;
}

/** ¿Es calle (vía o número de portal) y no solo un barrio/municipio («Goya», «Meco»)? */
export function isStreetAddress(address: string | null | undefined): boolean {
  const a = addressLine(address);
  return !!a && (looksLikeStreet(a) || /\d/.test(a));
}
