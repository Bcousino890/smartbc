/**
 * Tests del módulo "Enlaces de portales".
 *
 * Lo que se comprueba aquí es la pieza que sostiene todo lo demás: la
 * NORMALIZACIÓN de la URL. De ella depende que reenviar la misma página de
 * resultados no siembre duplicados en la ficha del cliente, que es la promesa
 * que permite a la extensión mandar sin miedo.
 *
 * Funciones puras, sin base de datos: se ejecuta en milisegundos.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-portal-links.mts
 */
import {
  extractUrls,
  parsePortalUrl,
  portalLabel,
} from "../lib/portal-links/portals.ts";
import {
  compareByPriority,
  countLinks,
  isLinkStatus,
  isPendingCall,
  LINK_STATUS_LABEL,
  orderByRating,
  reorderIds,
  SELECTABLE_LINK_STATUSES,
  type PortalLinkStatus,
} from "../lib/portal-links/types.ts";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

const key = (url: string) => parsePortalUrl(url)?.urlKey ?? null;

// ============================================================================
section("🔑 DEDUPLICACIÓN · el mismo anuncio, una sola fila");
// ============================================================================

check(
  "www y sin www son el mismo anuncio",
  key("https://www.idealista.com/inmueble/106548321/") ===
    key("https://idealista.com/inmueble/106548321/"),
);

check(
  "la barra final no cambia nada",
  key("https://www.idealista.com/inmueble/106548321") ===
    key("https://www.idealista.com/inmueble/106548321/"),
);

check(
  "el tracking de una campaña no crea otra fila",
  key("https://www.idealista.com/inmueble/106548321/?utm_source=whatsapp") ===
    key("https://www.idealista.com/inmueble/106548321/"),
);

check(
  "el ancla tampoco",
  key("https://www.idealista.com/inmueble/106548321/#fotos") ===
    key("https://www.idealista.com/inmueble/106548321/"),
);

check(
  "dos rutas distintas del portal al MISMO anuncio colapsan por su referencia",
  key("https://www.idealista.com/inmueble/106548321/") ===
    key("https://www.idealista.com/es/inmueble/106548321/detalle"),
);

check(
  "dos anuncios distintos NO colapsan",
  key("https://www.idealista.com/inmueble/106548321/") !==
    key("https://www.idealista.com/inmueble/106548322/"),
);

check(
  "el orden de los parámetros útiles no importa",
  key("https://ejemplo-inmobiliaria.es/piso?a=1&b=2") ===
    key("https://ejemplo-inmobiliaria.es/piso?b=2&a=1"),
);

check(
  "sin referencia en la URL, dos páginas distintas siguen siendo distintas",
  key("https://ejemplo-inmobiliaria.es/piso/uno") !==
    key("https://ejemplo-inmobiliaria.es/piso/dos"),
);

check(
  "dos portales con la misma referencia no se mezclan",
  key("https://www.idealista.com/inmueble/1234567/") !==
    key("https://www.habitaclia.com/piso-i1234567.htm"),
);

// ============================================================================
section("🏷️  PROCEDENCIA · de dónde viene el anuncio");
// ============================================================================

check(
  "Idealista, con su referencia",
  parsePortalUrl("https://www.idealista.com/inmueble/106548321/")?.portal ===
    "idealista" &&
    parsePortalUrl("https://www.idealista.com/inmueble/106548321/")
      ?.externalRef === "106548321",
);

check(
  "los dominios hermanos de Idealista (it/pt) también",
  parsePortalUrl("https://www.idealista.it/immobile/106548321/")?.portal ===
    "idealista",
);

check(
  "Fotocasa",
  parsePortalUrl(
    "https://www.fotocasa.es/es/alquiler/vivienda/madrid-capital/aire-acondicionado/183434107/d",
  )?.portal === "fotocasa",
);

check(
  "la web de otra inmobiliaria cae en 'Otra web', no se rechaza",
  parsePortalUrl("https://inmobiliaria-del-barrio.es/piso/23")?.portal ===
    "other",
);

check("y tiene etiqueta legible", portalLabel("other") === "Otra web");

check(
  "una URL que no es http(s) se rechaza",
  parsePortalUrl("javascript:alert(1)") === null &&
    parsePortalUrl("ftp://ejemplo.es/piso") === null,
);

check("y una cadena que no es URL, también", parsePortalUrl("no soy una url") === null);

check(
  "la URL guardada queda limpia de tracking",
  parsePortalUrl(
    "https://www.idealista.com/inmueble/106548321/?utm_source=x&fbclid=y",
  )?.url === "https://www.idealista.com/inmueble/106548321",
);

// ============================================================================
section("📋 PEGADO MASIVO · sacar los enlaces de donde estén");
// ============================================================================

const pegote = `Hola, mira estos:
https://www.idealista.com/inmueble/1/
https://www.fotocasa.es/es/alquiler/vivienda/madrid/2/d
y este también https://www.idealista.com/inmueble/3/, que está bien.
https://www.idealista.com/inmueble/1/`;

const encontrados = extractUrls(pegote);
check("saca las URLs de un WhatsApp reenviado", encontrados.length === 3, String(encontrados.length));
check(
  "no se traga la coma final de la frase",
  encontrados.every((u) => !u.endsWith(",")),
);
check(
  "la repetida literal no aparece dos veces",
  new Set(encontrados).size === encontrados.length,
);
// El tope se aplica DESPUÉS de deduplicar: diez anuncios distintos, cinco.
const muchos = Array.from(
  { length: 10 },
  (_, i) => `https://www.idealista.com/inmueble/90${i}/`,
).join("\n");
check("respeta el tope", extractUrls(muchos, 5).length === 5);
check("y sin tope los devuelve todos", extractUrls(muchos).length === 10);

// Bug real reportado en producción: pegar el enlace TAL CUAL lo copia el
// navegador (sin "https://" delante) dejaba el diálogo con el botón "Añadir"
// deshabilitado y sin ningún aviso — extractUrls devolvía 0 enlaces porque
// el regex exigía el esquema literal en el texto.
check(
  "un enlace sin esquema, con www., SÍ se reconoce",
  extractUrls("www.idealista.com/inmueble/111905585").length === 1,
);
check(
  "y se le añade https:// para que parsePortalUrl lo acepte",
  extractUrls("www.idealista.com/inmueble/111905585")[0] ===
    "https://www.idealista.com/inmueble/111905585",
);
check(
  "el mismo enlace con y sin esquema no duplica",
  extractUrls(
    "www.idealista.com/inmueble/1\nhttps://www.idealista.com/inmueble/1",
  ).length === 1,
);
check(
  "un dominio de correo en prosa NO se confunde con un enlace",
  extractUrls("Contacta en info@agencia.com para más info").length === 0,
);

// ============================================================================
section("📞 COLA DE LLAMADAS · estados");
// ============================================================================

check(
  "«por llamar» agrupa los tres estados con el teléfono pendiente",
  isPendingCall("pending") &&
    isPendingCall("no_answer") &&
    isPendingCall("callback") &&
    !isPendingCall("to_visit") &&
    !isPendingCall("discarded") &&
    !isPendingCall("converted"),
);

check(
  "«ficha creada» no se ofrece en el desplegable: lo escribe el vínculo",
  !(SELECTABLE_LINK_STATUSES as readonly string[]).includes("converted"),
);

check(
  "todos los estados tienen etiqueta",
  Object.keys(LINK_STATUS_LABEL).length === 6 &&
    Object.values(LINK_STATUS_LABEL).every((v) => v.length > 0),
);

check(
  "isLinkStatus rechaza lo que no es un estado",
  isLinkStatus("pending") && !isLinkStatus("llamando") && !isLinkStatus(42),
);

const muestra: Array<{ status: PortalLinkStatus }> = [
  { status: "pending" },
  { status: "no_answer" },
  { status: "callback" },
  { status: "to_visit" },
  { status: "to_visit" },
  { status: "discarded" },
  { status: "converted" },
];
const counts = countLinks(muestra);
check(
  "los contadores del panel cuadran",
  counts.all === 7 &&
    counts.toCall === 3 &&
    counts.toVisit === 2 &&
    counts.discarded === 1 &&
    counts.converted === 1,
  JSON.stringify(counts),
);

// ============================================================================
section("↕️  PRIORIDAD · arrastrar y valorar");
// ============================================================================

const lista = ["a", "b", "c", "d"];

check(
  "mover uno delante de otro",
  reorderIds(lista, "d", "b").join() === "a,d,b,c",
  reorderIds(lista, "d", "b").join(),
);

check(
  "mover al principio",
  reorderIds(lista, "c", "a").join() === "c,a,b,d",
);

check(
  "mover al final (sin vecino delante)",
  reorderIds(lista, "a", null).join() === "b,c,d,a",
);

check(
  "soltar sobre sí mismo no cambia nada",
  reorderIds(lista, "b", "b").join() === lista.join(),
);

check(
  "bajar una posición: delante del que va dos más abajo",
  reorderIds(lista, "a", "c").join() === "b,a,c,d",
);

check(
  "un id que no está en la lista la deja intacta",
  reorderIds(lista, "z", "b").join() === lista.join(),
);

check(
  "un destino que no está en la lista la deja intacta",
  reorderIds(lista, "a", "z").join() === lista.join(),
);

const conPos = [
  { id: "x", position: 300, created_at: "2026-08-01T10:00:00Z", rating: 2 },
  { id: "y", position: 100, created_at: "2026-08-03T10:00:00Z", rating: 5 },
  { id: "z", position: 200, created_at: "2026-08-02T10:00:00Z", rating: 5 },
];

check(
  "la posición manda sobre la fecha",
  [...conPos].sort(compareByPriority).map((l) => l.id).join() === "y,z,x",
);

const sinPos = [
  { id: "nuevo", position: null, created_at: "2026-08-05T10:00:00Z", rating: 0 },
  ...conPos,
];
check(
  "un enlace sin posición cae al final, no desordena el resto",
  [...sinPos].sort(compareByPriority).map((l) => l.id).join() === "y,z,x,nuevo",
);

check(
  "ordenar por valoración: primero lo que más le gusta",
  orderByRating(conPos).join() === "y,z,x",
);

check(
  "y con la misma nota se respeta el orden que ya tenían",
  orderByRating([
    { id: "primero", rating: 5 },
    { id: "segundo", rating: 5 },
  ]).join() === "primero,segundo",
);

// ============================================================================
console.log(`\n${failures === 0 ? "✅ TODO OK" : `❌ ${failures} FALLO(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
