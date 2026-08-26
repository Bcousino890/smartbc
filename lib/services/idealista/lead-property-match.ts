import "server-only";

// Fallback de matching lead ↔ propiedad cuando el hilo no trae referencia
// (bc386) ni código de anuncio (idealista.com lo omite muy seguido). Usa lo
// único que sí llega siempre: la dirección/zona y el precio que Idealista
// muestra en el propio inbox (ej. "Calle del General Pardiñas, Lista, Madrid"
// + "1.500 €/mes").
//
// Importante: el match exige que coincida la CALLE (primer segmento antes de
// la coma), no solo la zona. Dos calles distintas del mismo barrio comparten
// casi todos los tokens de zona ("Chueca-Justicia", "Madrid"...) y por eso no
// alcanza con solapar contra la dirección completa — si solo exigiéramos eso,
// "Calle de Gravina, Chueca-Justicia" empataría con "Calle de Hortaleza,
// Chueca-Justicia" con precios parecidos, un falso positivo real que se vio
// al probar esto contra datos reales.

// OJO: "madrid" NO va acá aunque aparezca en casi todos los títulos — es
// justo la única señal de zona que puede distinguir dos fichas propias en la
// misma calle con precios parecidos (caso real: "Calle de Lagasca 105,
// Castellana" vs "Calle de Lagasca, Castellana, Madrid" — con "madrid" como
// stopword, el desempate por zona quedaba ciego y los leads de la segunda
// cayeron todos en la primera).
const STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "el",
  "en",
  "a",
  "y",
  "calle",
  "avenida",
  "paseo",
  "plaza",
  "glorieta",
  "ronda",
  "travesia",
  "urbanizacion",
]);

function tokenize(input: string | null | undefined): string[] {
  if (!input) return [];
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((tok) => tok && !STOPWORDS.has(tok) && !/^\d+$/.test(tok));
}

/** Primer segmento antes de la primera coma: es donde vive el nombre de calle. */
function streetTokens(addressLike: string | null | undefined): string[] {
  if (!addressLike) return [];
  return tokenize(addressLike.split(",")[0]);
}

export function normalizeAddressText(input: string | null | undefined): string[] {
  return tokenize(input);
}

export function parsePriceToNumber(input: string | null | undefined): number | null {
  if (!input) return null;
  // "1.500 €/mes" / "2.450.000 €" -> 1500 / 2450000
  const digits = input.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type AddressMatchCandidate = {
  id: string;
  /** properties.address (puede venir vacío si nunca se cargó la dirección exacta) */
  street: string | null;
  /** properties.zone — solo se usa como desempate/boost, nunca solo */
  zone: string | null;
  price: number | null;
};

/**
 * Empareja el título del lead ("Calle X, Zona, Ciudad") contra las
 * propiedades propias exigiendo que TODOS los tokens de calle del lead
 * aparezcan en la calle de la candidata, y que el precio esté dentro de
 * tolerancia. Entre candidatas que pasan el filtro, gana la de precio más
 * cercano (la señal más fuerte cuando dos fichas propias comparten calle);
 * la zona solo desempata un resto de empate en precio. Si después de todo
 * sigue habiendo empate exacto, se rinde y no matchea — adivinar mal
 * contamina las métricas de leads por ficha, que es peor que dejarlo sin
 * matchear.
 */
export function matchPropertyByAddress(
  leadTitle: string | null,
  leadPrice: string | null,
  candidates: AddressMatchCandidate[],
): string | null {
  const leadStreet = streetTokens(leadTitle);
  if (leadStreet.length < 1) return null; // sin nombre de calle reconocible, no arriesgar
  const leadZone = new Set(tokenize(leadTitle));
  const leadPriceNum = parsePriceToNumber(leadPrice);

  const matches: { id: string; priceDiff: number; zoneOverlap: number }[] = [];

  for (const c of candidates) {
    const candStreet = streetTokens(c.street);
    if (candStreet.length === 0) continue; // sin dirección cargada, no hay con qué comparar

    // Todos los tokens de calle del lead tienen que estar en la calle candidata.
    const allStreetTokensMatch = leadStreet.every((t) => candStreet.includes(t));
    if (!allStreetTokensMatch) continue;

    let priceDiff = 0; // sin precio en alguno de los dos lados: no penaliza, no desempata
    if (leadPriceNum != null && c.price != null) {
      priceDiff = Math.abs(leadPriceNum - c.price) / c.price;
      if (priceDiff > 0.08) continue; // 8% de tolerancia (redondeos, cambios de precio)
    }

    const candZone = new Set(tokenize(c.zone));
    let zoneOverlap = 0;
    for (const t of leadZone) if (candZone.has(t)) zoneOverlap++;

    matches.push({ id: c.id, priceDiff, zoneOverlap });
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].id;

  matches.sort((a, b) => a.priceDiff - b.priceDiff || b.zoneOverlap - a.zoneOverlap);
  const [first, second] = matches;
  const isAmbiguous = first.priceDiff === second.priceDiff && first.zoneOverlap === second.zoneOverlap;
  return isAmbiguous ? null : first.id;
}
