// Contrato de navegación de la lista de Propiedades del admin (CRM-01).
//
// La lista guarda filtros y página en su URL (?operacion=…&pagina=2). Al abrir
// una ficha, el enlace lleva esa consulta en `?volver=`, y el «Volver» de la
// ficha reconstruye desde ahí la URL de la lista, con un ancla a la fila de
// origen (decisión D1 del expediente).
//
// `volver` es una entrada que cualquiera puede escribir a mano, así que nunca
// se usa tal cual: solo se conservan las claves de la lista, con valores
// acotados, y la RUTA la pone siempre quien llama (prefijo del país actual).
// Por construcción no hay regreso a otro sitio, a otro país ni a otra ruta.
//
// Puro (sin React ni Next): lo prueba scripts/test-admin-properties-list-url.mts.

/** Claves que la lista entiende, en el orden en que se escriben en la URL. */
export const LIST_PARAM_KEYS = [
  "q",
  "etiquetas",
  "operacion",
  "estado",
  "distrito",
  "zona",
  "agencia",
  "estancia",
  "dormitorios",
  "banos",
  "planta",
  "precioMin",
  "precioMax",
  "m2Min",
  "m2Max",
  "pagina",
  "archivadas",
] as const;

const MAX_VALUE_LENGTH = 200;

/** Estado de filtros y página tal como lo lleva la lista en memoria. */
export type ListUrlState = {
  query: string;
  tagFilter: string[];
  operationFilter: string;
  statusFilter: string;
  zoneFilter: string;
  subzoneFilter: string;
  agencyFilter: string;
  stayFilter: string;
  bedroomsFilter: string;
  bathroomsFilter: string;
  floorFilter: string;
  minPrice: string;
  maxPrice: string;
  minM2: string;
  maxM2: string;
  page: number;
};

/**
 * Consulta de la lista (sin «?») a partir del estado en memoria. Parte de
 * `baseSearch` para conservar los parámetros que la lista no maneja (como
 * `archivadas`), igual que el efecto que la escribe en la barra de direcciones.
 */
export function buildListSearch(state: ListUrlState, baseSearch = ""): string {
  const sp = new URLSearchParams(baseSearch);
  const set = (key: string, value: string) => {
    if (value) sp.set(key, value);
    else sp.delete(key);
  };
  set("q", state.query);
  set("etiquetas", state.tagFilter.join(","));
  set("operacion", state.operationFilter);
  set("estado", state.statusFilter);
  set("distrito", state.zoneFilter);
  set("zona", state.subzoneFilter);
  set("agencia", state.agencyFilter);
  set("estancia", state.stayFilter);
  set("dormitorios", state.bedroomsFilter);
  set("banos", state.bathroomsFilter);
  set("planta", state.floorFilter);
  set("precioMin", state.minPrice);
  set("precioMax", state.maxPrice);
  set("m2Min", state.minM2);
  set("m2Max", state.maxM2);
  set("pagina", state.page > 1 ? String(state.page) : "");
  return sp.toString();
}

/**
 * Sanea una consulta de lista que llega de fuera (`?volver=`). Devuelve solo
 * claves conocidas, la primera aparición de cada una, valores no vacíos y
 * acotados; `pagina` entero positivo y `archivadas` solo «1». Sin «?».
 */
export function sanitizeListQuery(raw: string | null | undefined): string {
  // Un parámetro repetido puede llegar como array desde `searchParams`.
  if (typeof raw !== "string" || !raw) return "";
  let sp: URLSearchParams;
  try {
    sp = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  } catch {
    return "";
  }
  const out = new URLSearchParams();
  for (const key of LIST_PARAM_KEYS) {
    const value = sp.get(key)?.trim();
    if (!value || value.length > MAX_VALUE_LENGTH) continue;
    if (key === "pagina") {
      if (!/^\d{1,5}$/.test(value) || Number(value) < 2) continue;
    }
    if (key === "archivadas" && value !== "1") continue;
    out.set(key, value);
  }
  return out.toString();
}

/** Id del elemento de la fila en la lista: destino del ancla de regreso. */
export function rowAnchorId(slug: string): string {
  return `propiedad-${slug}`;
}

/**
 * Enlace de la lista a una ficha, con el contexto de regreso si la lista
 * tiene filtros o página.
 */
export function withReturnContext(detailHref: string, listSearch: string): string {
  const clean = sanitizeListQuery(listSearch);
  if (!clean) return detailHref;
  return `${detailHref}?${new URLSearchParams({ volver: clean }).toString()}`;
}

/**
 * Destino del «Volver» de una ficha: la lista del país actual (`prefix`, p. ej.
 * «/es/admin»), con la consulta saneada de `volver` y el ancla a la fila.
 * Sin `volver` válido, la lista sin filtros: salida segura para la entrada
 * directa, otra sección o un enlace pegado.
 */
export function listReturnHref(prefix: string, rawVolver: string | null | undefined, slug?: string): string {
  const clean = sanitizeListQuery(rawVolver);
  const hash = slug ? `#${encodeURIComponent(rowAnchorId(slug))}` : "";
  return `${prefix}/propiedades${clean ? `?${clean}` : ""}${hash}`;
}
