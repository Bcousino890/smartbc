import { createHash } from "node:crypto";
import { syntheticPhoto } from "./fixtures";
import type { InternalItem, InternalSnapshot } from "./to-public";

// ============================================================================
// SOLO DESARROLLO LOCAL (BCP-01 T11, E7). Almacén EN MEMORIA que sustituye a
// la base de datos en la superficie pública cuando isCatalogFixtureMode() es
// cierto (NODE_ENV=development + CATALOG_FIXTURES=1). Así el lector, las rutas
// /api/seleccion/* y el vigilante reales se prueban de punta a punta con datos
// 100 % sintéticos. Nunca se importa fuera de ese modo.
//
// La huella imita a 0193: md5 de la instantánea interna completa.
// ============================================================================

export const FIXTURE_TOKENS = {
  main: "fixtureMainToken000000000001",
  long: "fixtureLongToken000000000002",
  empty: "fixtureEmptyToken00000000003",
  one: "fixtureOneToken0000000000004",
  // Índices largos (QA de PR-B: el índice se recortaba en la doble página).
  twenty: "fixtureTwentyToken0000000005",
  max: "fixtureMaxToken0000000000006",
  // C2: recorrido editorial (texto del catálogo, historia vigente y solo datos).
  journey: "fixtureJourneyToken000000007",
  // C2: 12 y 24 viviendas con los cuatro niveles mezclados y textos largos.
  journey12: "fixtureJourney12Token0000008",
  journey24: "fixtureJourney24Token0000009",
} as const;

// Títulos como los de las fichas reales: varios ocupan dos líneas en el índice.
const STREETS = [
  "Calle de Goya, Barrio de Salamanca", "Calle José Ortega y Gasset", "Calle Alcalá", "Calle de Ayala, Goya",
  "Calle Padilla", "Calle Espartinas", "Calle Conde de Peñalver", "Calle General Díaz Porlier",
  "Paseo de la Castellana, junto a la plaza de Emilio Castelar", "Calle del Príncipe de Vergara s/n",
  "Calle de Velázquez", "Calle de Lagasca, Recoletos", "Calle de Claudio Coello", "Calle de Hermosilla",
  "Calle de Juan Bravo", "Calle de Don Ramón de la Cruz", "Calle de Jorge Juan", "Calle de Villanueva",
  "Calle de Serrano, frente al Museo Arqueológico Nacional", "Calle de Núñez de Balboa", "Calle de Castelló",
  "Calle de Lista", "Calle de Maldonado", "Calle de Montesa",
];

interface Share {
  snapshot: InternalSnapshot;
  expiresAt: number;
  revoked: boolean;
  archived: boolean;
}

const DESC =
  "Vivienda exterior con mucha luz natural, techos altos y una distribución pensada para el día a día. " +
  "El salón se abre a un balcón corrido sobre la calle y la cocina, independiente, conserva la despensa original. " +
  "Los dormitorios dan a un patio de manzana silencioso.";

function longText(n: number): string {
  let s = "";
  while (s.length < n) s += DESC + " ";
  return s.slice(0, n).trim();
}

let seq = 0;

/** V5: título de 120 caracteres. */
const LONG_TITLE = "Casa de tres plantas con jardín, piscina, garaje para dos coches y estudio independiente junto al parque del Retiro, Madrid".slice(0, 120);

function photos(hue: number, n: number, kind: "h" | "v" | "mix") {
  return Array.from({ length: n }, (_, i) => {
    const vertical = kind === "v" || (kind === "mix" && i % 3 === 1);
    return { u: `fx-${hue}-${i}`, w: vertical ? 1000 : 1600, h: vertical ? 1500 : 1067, c: i === 0 };
  });
}

function item(over: Partial<InternalItem> & { key: string; slug: string; title: string }): InternalItem {
  return {
    zone: "Madrid",
    subzone: null,
    operation: "sale",
    operations: null,
    price: null,
    rent_price: null,
    currency: "eur",
    status: "available",
    bedrooms: null,
    bathrooms: null,
    square_meters: null,
    description: null,
    features: null,
    features_manual: null,
    floor_override: null,
    clean: null,
    photos: [],
    ...over,
  };
}

/** Descripción «limpia» vigente para el texto dado (como la caché real). */
async function withClean(it: InternalItem, description: string, features: string[]): Promise<InternalItem> {
  const { clientDescriptionSrc } = await import("./to-public");
  return { ...it, description, features, clean: { src: clientDescriptionSrc(description, features), description, features } };
}

async function seed(): Promise<Map<string, Share>> {
  const base: InternalItem[] = [
    await withClean(
      item({
        key: "fxKeyAtico01", slug: "fx-atico", title: "Ático con terraza sobre los tejados de Jerónimos",
        subzone: "Jerónimos", price: 1450000, bedrooms: 3, bathrooms: 2, square_meters: 142,
        floor_override: "7", photos: photos(28, 4, "h"),
      }),
      DESC,
      ["Terraza de 40 m²", "Ascensor", "Calefacción central", "Portero físico"],
    ),
    await withClean(
      item({
        key: "fxKeyPiso002", slug: "fx-piso",
        title: "Piso señorial con galería acristalada, molduras originales y suelos de madera restaurados en la calle Almagro",
        subzone: "Almagro", operations: ["sale", "rent"], price: 2100000, rent_price: 6800, bedrooms: 4, bathrooms: 3,
        square_meters: 186, floor_override: "0", photos: photos(205, 12, "mix"),
      }),
      longText(1500),
      ["Galería", "Molduras", "Suelos de madera"],
    ),
    item({
      key: "fxKeyDuplex3", slug: "fx-duplex", title: "Dúplex con patio", zone: null, operation: "rent",
      status: "reserved", bathrooms: 2, photos: photos(145, 1, "v"),
    }),
    await withClean(
      item({
        key: "fxKeyEstud04", slug: "fx-estudio", title: "Estudio de diseño", subzone: "Recoletos", operation: "rent",
        price: 2100, bedrooms: 1, bathrooms: 1, square_meters: 54, floor_override: "atico", photos: photos(330, 2, "v"),
      }),
      "Estudio reformado con cocina abierta.",
      ["Amueblado"],
    ),
  ];
  const snap = (title: string, intro: string | null, items: InternalItem[]): InternalSnapshot => ({
    title,
    intro,
    created_at: "2026-10-01T09:00:00Z",
    status: "active",
    owner_name: "Fabricio Andree",
    contact: { name: "Fabricio Andree", phone: "+34641457123", role: "asesor" },
    items,
  });
  const far = Date.now() + 60 * 86_400_000;
  const longItems = Array.from({ length: 12 }, (_, i) =>
    item({
      key: `fxLong${String(i).padStart(6, "0")}`, slug: `fx-long-${i}`,
      title: i === 0 ? LONG_TITLE : `Vivienda ${i + 1} de doce`,
      price: 400000 + i * 85000, bedrooms: (i % 4) + 1, bathrooms: (i % 3) + 1, square_meters: 60 + i * 11,
      photos: photos(20 + i * 25, (i % 5) + 1, i % 2 ? "v" : "h"),
    }),
  );
  const series = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) =>
      item({
        key: `${prefix}${String(i).padStart(6, "0")}`, slug: `fx-${prefix}-${i}`,
        // La última del máximo lleva el título de 120 caracteres (V5).
        title: n === 24 && i === n - 1 ? LONG_TITLE : `${i % 6 === 5 ? "Ático" : "Piso"} en venta en ${STREETS[i % STREETS.length]}`,
        subzone: i % 3 ? "Salamanca" : "Goya", price: 1000000 + i * 8000,
        status: i === 7 ? "reserved" : "available", bedrooms: (i % 4) + 1, bathrooms: (i % 3) + 1,
        square_meters: 80 + i * 7, photos: photos(15 + i * 13, (i % 3) + 1, i % 2 ? "v" : "h"),
      }),
    );
  // C2 · recorrido: 1) texto del catálogo largo; 2) historia aprobada vigente
  // con fotos por clase; 3) solo datos y fotos (sin texto ni descripción).
  const { storySourceHash } = await import("@/lib/services/story/source-hash");
  const JOURNEY_TEXT = [
    "Una casa pensada para vivir despacio, con la luz entrando por tres fachadas a lo largo del día.",
    "El salón ocupa toda la crujía principal y se abre a un balcón corrido sobre la calle arbolada.",
    "La cocina, independiente y reformada, conserva la despensa original y da a un patio silencioso.",
    "Los dormitorios están en la zona de noche, separados de la de día por un pasillo con armarios empotrados.",
    "El principal tiene vestidor y baño en suite con ducha de obra y doble lavabo.",
    "La finca, de principios del siglo pasado, tiene portería, ascensor y una escalera de madera restaurada.",
    "El barrio reúne mercado, colegios y comercio de toda la vida a pocos minutos a pie.",
  ].join(" ");
  // Texto largo (tres párrafos): el recorrido llena sus tres dobles páginas y
  // lo que no cabe sigue íntegro en la descripción completa.
  const JOURNEY_LONG = [JOURNEY_TEXT, JOURNEY_TEXT, JOURNEY_TEXT].join("\n\n");
  const jStoryItem = item({
    key: "fxJourney00002", slug: "fx-journey-2", title: "Ático con terraza y vistas sobre el parque",
    subzone: "Retiro", price: 1890000, bedrooms: 3, bathrooms: 2, square_meters: 168,
    photos: [
      { u: "fx-j2-0", w: 1600, h: 1067, c: true },
      { u: "fx-j2-1", w: 1600, h: 1067, c: false, k: "living_room" },
      { u: "fx-j2-2", w: 1600, h: 1067, c: false, k: "kitchen" },
      { u: "fx-j2-3", w: 1000, h: 1500, c: false, k: "bedroom" },
      { u: "fx-j2-4", w: 1600, h: 1067, c: false, k: "terrace_outdoor" },
    ],
  });
  const jStoryDesc = "Ático con terraza de 60 m² y vistas al parque. Salón de doble altura con chimenea. Cocina office reformada. Tres dormitorios, el principal con terraza propia.";
  const jStoryFeatures = ["Terraza", "Ascensor", "Aire acondicionado"];
  const jStory = await withClean(jStoryItem, jStoryDesc, jStoryFeatures);
  jStory.story = {
    h: storySourceHash({ description: jStoryDesc, bedrooms: 3, bathrooms: 2, squareMeters: 168, features: jStoryFeatures }),
    p: "Un ático para vivir mirando al parque, con una terraza que funciona como una habitación más.",
    b: [
      { c: "living", t: "El salón, de doble altura y con chimenea, se abre por completo a la terraza y recibe luz durante todo el día." },
      { c: "kitchen", t: "La cocina office está reformada, con isla central y espacio para comer junto a la ventana." },
      { c: "private", t: "Los tres dormitorios quedan en la planta alta; el principal tiene una terraza propia orientada al este." },
      { c: "outdoor", t: "La terraza de 60 m² rodea el ático y ofrece vistas abiertas sobre el parque y la ciudad." },
      { c: "building", t: "Conserje." },
    ],
  };
  const journeyItems: InternalItem[] = [
    {
      ...(await withClean(
        item({
          key: "fxJourney00001", slug: "fx-journey-1", title: "Piso señorial con balcón corrido en Almagro",
          subzone: "Almagro", price: 1650000, bedrooms: 4, bathrooms: 3, square_meters: 196, photos: photos(48, 7, "mix"),
        }),
        "Piso señorial en Almagro. Texto del portal que no se usa porque manda el texto del catálogo.",
        ["Ascensor", "Portero físico", "Calefacción central"],
      )),
      text: { b: JOURNEY_LONG, l: "Luz por tres fachadas y una finca de principios de siglo, a un paso de Alonso Martínez.", h: ["Ascensor", "Portero físico"] },
    },
    jStory,
    item({ key: "fxJourney00003", slug: "fx-journey-3", title: "Estudio sin descripción", subzone: "Lavapiés", price: 320000, bedrooms: 1, bathrooms: 1, square_meters: 42, photos: photos(300, 2, "h") }),
  ];
  // 12/24: texto del catálogo al máximo (6000), historia, limpia larga y solo datos.
  const MAX_TEXT = (() => {
    let t = "";
    while (t.length + JOURNEY_TEXT.length + 2 <= 6000) t += (t ? "\n\n" : "") + JOURNEY_TEXT;
    return t;
  })();
  const journeySeries = async (n: number, prefix: string): Promise<InternalItem[]> => {
    const out: InternalItem[] = [];
    for (let i = 0; i < n; i++) {
      const kind = i % 4;
      const base = item({
        key: `${prefix}${String(i).padStart(6, "0")}`, slug: `fx-${prefix}-${i}`,
        title: n === 24 && i === n - 1 ? LONG_TITLE : `${["Piso con texto propio", "Ático con historia", "Piso con descripción", "Estudio solo con datos"][kind]} en ${STREETS[i % STREETS.length]}`,
        subzone: i % 3 ? "Salamanca" : "Goya", price: 900000 + i * 15000, status: i === 5 ? "reserved" : "available",
        bedrooms: (i % 4) + 1, bathrooms: (i % 3) + 1, square_meters: 70 + i * 6, photos: photos(40 + i * 11, (i % 5) + 2, i % 2 ? "mix" : "h"),
      });
      if (kind === 0) out.push({ ...(await withClean(base, DESC, ["Ascensor", "Portero físico"])), text: { b: MAX_TEXT, l: null, h: ["Ascensor"] } });
      else if (kind === 1) out.push({ ...jStory, key: base.key, slug: base.slug, title: base.title, subzone: base.subzone, status: base.status });
      else if (kind === 2) out.push(await withClean(base, longText(3000), ["Terraza", "Calefacción central", "Trastero"]));
      else out.push(base);
    }
    return out;
  };
  const journey12 = await journeySeries(12, "fxJ12");
  const journey24 = await journeySeries(24, "fxJ24");
  return new Map<string, Share>([
    [FIXTURE_TOKENS.journey12, { snapshot: snap("Doce recorridos", "Doce viviendas con textos largos, historias, descripciones y solo datos.", journey12), expiresAt: far, revoked: false, archived: false }],
    [FIXTURE_TOKENS.journey24, { snapshot: snap("Veinticuatro recorridos", "El máximo de un catálogo automático, con textos largos.", journey24), expiresAt: far, revoked: false, archived: false }],
    [FIXTURE_TOKENS.main, { snapshot: snap("Salamanca y Chamberí", "Cuatro viviendas elegidas para una búsqueda concreta: luz, silencio y buena comunicación.", base), expiresAt: far, revoked: false, archived: false }],
    [FIXTURE_TOKENS.long, { snapshot: snap("Áticos con terraza para una familia que se traslada desde Londres en primavera", null, longItems), expiresAt: far, revoked: false, archived: false }],
    [FIXTURE_TOKENS.empty, { snapshot: snap("Inversores · Chamberí", null, []), expiresAt: far, revoked: false, archived: false }],
    [FIXTURE_TOKENS.one, { snapshot: snap("Una sola vivienda", "Catálogo de una propiedad.", [base[0]]), expiresAt: far, revoked: false, archived: false }],
    [FIXTURE_TOKENS.twenty, { snapshot: snap("Barrio de Salamanca", "Exclusivos pisos en la zona más exclusiva de todo Madrid.", series(20, "fxVeinte")), expiresAt: far, revoked: false, archived: false }],
    [FIXTURE_TOKENS.journey, { snapshot: snap("El recorrido de cada vivienda", "Tres viviendas: una con texto propio, otra con historia aprobada y otra solo con datos.", journeyItems), expiresAt: far, revoked: false, archived: false }],
    [FIXTURE_TOKENS.max, { snapshot: snap("Salamanca · selección máxima", "Veinticuatro viviendas, el máximo de un catálogo automático.", series(24, "fxMax")), expiresAt: far, revoked: false, archived: false }],
  ]);
}

const KEY = "__bcpCatalogFixtureStore";
type G = typeof globalThis & { [KEY]?: Promise<Map<string, Share>> };

function store(): Promise<Map<string, Share>> {
  const g = globalThis as G;
  if (!g[KEY]) g[KEY] = seed();
  return g[KEY]!;
}

export async function resetFixtureStore(): Promise<void> {
  (globalThis as G)[KEY] = seed();
}

function fingerprintOf(s: InternalSnapshot): string {
  return createHash("md5").update(JSON.stringify(s)).digest("hex");
}

function valid(s: Share | undefined): s is Share {
  return !!s && !s.revoked && !s.archived && s.expiresAt > Date.now();
}

export async function fixtureGetPublic(token: string): Promise<{ snapshot: InternalSnapshot; fingerprint: string; expiresAt: string } | null> {
  const s = (await store()).get(token);
  if (!valid(s)) return null;
  return { snapshot: s.snapshot, fingerprint: fingerprintOf(s.snapshot), expiresAt: new Date(s.expiresAt).toISOString() };
}

export async function fixtureGetStates(tokens: string[]) {
  const st = await store();
  return new Map(
    tokens.map((t) => {
      const s = st.get(t);
      return [t, valid(s) ? { valid: true, fingerprint: fingerprintOf(s.snapshot), expiresAt: new Date(s.expiresAt).toISOString() } : { valid: false, fingerprint: null, expiresAt: null }] as const;
    }),
  );
}

export type FixtureOp =
  | { op: "reset" }
  | { op: "price"; token: string; key: string; price: number }
  | { op: "title"; token: string; title: string }
  | { op: "contact"; token: string; name: string; phone: string; role: "asesor" | "asesora" }
  | { op: "remove"; token: string; key: string }
  | { op: "add"; token: string; title?: string }
  | { op: "reorder"; token: string; keys?: string[] }
  | { op: "status"; token: string; key: string; status: "available" | "reserved" | "sold" | "archived" }
  | { op: "photo"; token: string; key: string }
  | { op: "cover"; token: string; choose: number | null }
  | { op: "text"; token: string; index: number; body: string | null; lead: string | null }
  | { op: "revoke"; token: string }
  | { op: "expire"; token: string; inMs?: number }
  | { op: "archive"; token: string };

/** Aplica un cambio sintético y devuelve la huella nueva (o null si el
 *  enlace ya no vale). */
export async function fixtureMutate(op: FixtureOp): Promise<{ fingerprint: string | null }> {
  if (op.op === "reset") {
    await resetFixtureStore();
    return { fingerprint: null };
  }
  const st = await store();
  const s = st.get(op.token);
  if (!s) return { fingerprint: null };
  const snap = s.snapshot;
  switch (op.op) {
    case "price":
      snap.items = snap.items.map((it) => (it.key === op.key ? { ...it, price: op.price } : it));
      break;
    case "title":
      snap.title = op.title;
      break;
    case "text": {
      // C2: texto publicado del catálogo (sintético) en la vivienda nº `index`.
      const i = snap.items.length ? op.index % snap.items.length : -1;
      if (i >= 0) {
        const { text: _old, ...rest } = snap.items[i];
        void _old;
        snap.items[i] = op.body || op.lead ? { ...rest, text: { b: op.body, l: op.lead, h: [] } } : rest;
      }
      break;
    }
    case "cover":
      // C1: portada elegida (sintética): la vivienda nº `choose` de la lista.
      if (op.choose === null || op.choose < 0) delete snap.cover;
      else snap.cover = { key: snap.items[op.choose]?.key ?? null, photo: null };
      break;
    case "contact":
      snap.contact = { name: op.name, phone: op.phone, role: op.role };
      break;
    case "remove":
      snap.items = op.key === "__first__" ? snap.items.slice(1) : snap.items.filter((it) => it.key !== op.key);
      break;
    case "add": {
      seq += 1;
      snap.items = [
        ...snap.items,
        item({ key: `fxAdded${String(seq).padStart(5, "0")}`, slug: `fx-added-${seq}`, title: op.title ?? `Vivienda añadida ${seq}`, price: 900000 + seq * 1000, bedrooms: 2, bathrooms: 1, square_meters: 80, photos: photos(60 + seq * 30, 2, "h") }),
      ];
      break;
    }
    case "reorder":
      if (op.keys?.length) {
        const by = new Map(snap.items.map((it) => [it.key, it]));
        snap.items = op.keys.map((k) => by.get(k)).filter((x): x is InternalItem => !!x);
      } else {
        snap.items = [...snap.items.slice(1), ...snap.items.slice(0, 1)];
      }
      break;
    case "status":
      snap.items = snap.items
        .map((it) => (it.key === op.key ? { ...it, status: op.status } : it))
        .filter((it) => it.status !== "sold" && it.status !== "archived");
      break;
    case "photo":
      snap.items = snap.items.map((it) => (it.key === op.key ? { ...it, photos: [...it.photos].reverse() } : it));
      break;
    case "revoke":
      s.revoked = true;
      break;
    case "expire":
      s.expiresAt = Date.now() + (op.inMs ?? 0);
      break;
    case "archive":
      s.archived = true;
      break;
  }
  return { fingerprint: valid(s) ? fingerprintOf(snap) : null };
}

/** Foto sintética para la ruta de prueba /dev-fixtures/foto/[slug]/[idx],
 *  con las medidas que declara la instantánea (para que la orientación del
 *  marco y la de la imagen coincidan). */
export async function fixturePhotoSvg(slug: string, idx: number): Promise<string | null> {
  for (const share of (await store()).values()) {
    const it = share.snapshot.items.find((x) => x.slug === slug);
    const ph = it?.photos[idx];
    if (!it || !ph) continue;
    let hue = 0;
    for (const ch of ph.u) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
    const uri = syntheticPhoto(hue, ph.w ?? 1600, ph.h ?? 1067, `${slug} · ${idx + 1}`);
    return decodeURIComponent(uri.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
  }
  return null;
}
