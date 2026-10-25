// SOLO PRUEBAS LOCALES. Genera los datos SINTÉTICOS del CRM para CRM-01
// (navegación y fluidez) que sirve scripts/sim/postgrest-sim.mts con `--auth`.
//
//   node --experimental-strip-types scripts/sim/fixtures/crm-01-admin.gen.mts <salida.json> [carpeta-imágenes]
//
// · Determinista (semilla fija), salvo las fechas de visitas y avisos recientes
//   (relativas a la hora de generación: la campana solo mira 7 días). Así las
//   mediciones antes/después comparan lo mismo.
// · Escala parecida a la real, sin datos reales: ~1.700 propiedades `es` (el
//   recuento de producción del 2026-10-13 era 1.632), 8-15 fotos cada una,
//   30 agencias, 20 etiquetas, clientes, leads y conversaciones del equipo.
// · Tres usuarios sintéticos con su token: propietario, asesor y una cuenta
//   suspendida. Los tokens solo existen aquí; el simulador no acepta otros.
// · Ningún nombre, teléfono, correo ni dirección es real: todo sale de listas
//   inventadas y de un contador.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2];
const IMG_DIR = process.argv[3] ?? null;
if (!OUT) {
  console.error("uso: crm-01-admin.gen.mts <salida.json> [carpeta-imágenes]");
  process.exit(1);
}
const SIM = process.env.SIM_BASE ?? "http://127.0.0.1:54371";

// PRNG determinista (mulberry32).
let seed = 0x0c2a01;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const uuid = (prefix: string, n: number) => {
  const hex = (prefix + n.toString(16)).replace(/[^0-9a-f]/g, "0").padStart(12, "0").slice(-12);
  return `00000000-0000-4000-8000-${hex}`;
};
const iso = (daysAgo: number) => new Date(Date.UTC(2026, 9, 20) - daysAgo * 86400000).toISOString();

export const TOKENS = {
  owner: "sim-token-owner-crm01",
  advisor: "sim-token-advisor-crm01",
  suspended: "sim-token-suspended-crm01",
} as const;

const USERS = {
  owner: { id: uuid("a", 1), email: "propietario@sim.invalid", role: "owner", full_name: "Propietaria Sintética" },
  advisor: { id: uuid("a", 2), email: "asesor@sim.invalid", role: "advisor", full_name: "Asesor Sintético" },
  suspended: { id: uuid("a", 3), email: "suspendida@sim.invalid", role: "advisor", full_name: "Cuenta Suspendida" },
};

const authUser = (u: { id: string; email: string }) => ({
  id: u.id,
  aud: "authenticated",
  role: "authenticated",
  email: u.email,
  email_confirmed_at: iso(400),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: iso(400),
  updated_at: iso(1),
});

const profiles = Object.entries(USERS).map(([k, u]) => ({
  id: u.id,
  role: u.role,
  full_name: u.full_name,
  email: u.email,
  phone: null,
  avatar_url: null,
  assigned_advisor_id: null,
  personal_shopper_terms_accepted_at: null,
  country: "es",
  countries: ["es"],
  multi_country: false,
  custom_role_id: null,
  suspended_at: k === "suspended" ? iso(2) : null,
  appearance: null,
  created_at: iso(400),
  updated_at: iso(1),
}));

// ── Agencias ────────────────────────────────────────────────────────────────
const AGENCY_WORDS = ["Norte", "Sur", "Alba", "Brisa", "Cumbre", "Delta", "Faro", "Lumen", "Mirador", "Olivo"];
const agencies = Array.from({ length: 30 }, (_, i) => {
  const name = `Agencia ${AGENCY_WORDS[i % 10]} ${Math.floor(i / 10) + 1}`;
  return {
    id: uuid("b", i + 1),
    name,
    slug: `agencia-sim-${i + 1}`,
    logo_url: null,
    website: null,
    country: "es",
    created_at: iso(500 - i),
    updated_at: iso(10),
    agency_partnerships: [],
  };
});

// ── Propiedades ─────────────────────────────────────────────────────────────
const DISTRICTS: Record<string, string[]> = {
  Salamanca: ["Recoletos", "Goya", "Lista", "Castellana"],
  Chamberí: ["Almagro", "Trafalgar", "Ríos Rosas"],
  Retiro: ["Ibiza", "Niño Jesús", "Jerónimos"],
  Centro: ["Sol", "Justicia", "Universidad", "Cortes"],
  Chamartín: ["El Viso", "Hispanoamérica", "Prosperidad"],
  Tetuán: ["Cuatro Caminos", "Bellas Vistas"],
  Moncloa: ["Argüelles", "Ciudad Universitaria"],
  Arganzuela: ["Palos de Moguer", "Delicias"],
};
const STREETS = ["Calle Sintética", "Calle Ficticia", "Avenida Inventada", "Paseo de Prueba", "Calle Ejemplo"];
const FEATURES = ["Ascensor", "Terraza", "Aire acondicionado", "Calefacción central", "Exterior", "Amueblado", "Portero", "Trastero", "Garaje", "Balcón"];
const LOREM =
  "Vivienda sintética generada para pruebas locales. Salón luminoso, cocina equipada y dormitorios amplios. Texto de relleno sin datos reales que da a la descripción un tamaño parecido al de una ficha normal. ";
const STATUSES = ["available", "available", "available", "available", "available", "reserved", "sold", "archived"] as const;

const N_PROPS = Number(process.env.SIM_PROPS ?? 1700);
const photoHost = `${SIM}/img`;
const properties = Array.from({ length: N_PROPS }, (_, i) => {
  const n = i + 1;
  const id = uuid("c", n);
  const slug = `sim-propiedad-${n}`;
  const zone = pick(Object.keys(DISTRICTS));
  const subzone = pick(DISTRICTS[zone]);
  const operation = rnd() < 0.7 ? "rent" : "sale";
  const agency = agencies[i % agencies.length];
  const bedrooms = int(0, 5);
  const price = operation === "rent" ? int(9, 60) * 100 : int(25, 250) * 10000;
  const nPhotos = int(8, 15);
  const archived = i % 9 === 0; // ~11 % archivadas
  const floor = int(0, 9);
  const photos = Array.from({ length: nPhotos }, (_, p) => ({
    url: `${photoHost}/foto-${(n + p) % 12}.jpg?p=${n}-${p}`,
    alt: null,
    position: p,
    is_cover: p === 0,
    source_width: 1600,
    source_height: 1067,
  }));
  return {
    id,
    agency_id: agency.id,
    source: "manual",
    external_id: `SIM-${String(n).padStart(5, "0")}`,
    slug,
    title: `Piso sintético ${n} en ${subzone}, planta ${floor}`,
    title_rent: null,
    description: LOREM.repeat(int(4, 10)),
    operation,
    operations: [operation],
    rent_price: null,
    stay: operation === "rent" ? (rnd() < 0.8 ? "long" : "short") : null,
    status: pick(STATUSES),
    price,
    currency: "EUR",
    bedrooms,
    bathrooms: Math.max(1, Math.min(4, bedrooms)),
    square_meters: 35 + bedrooms * 25 + int(0, 30),
    zone,
    subzone,
    address: `${pick(STREETS)} ${int(1, 200)}`,
    available_from: null,
    features: FEATURES.filter(() => rnd() < 0.35),
    features_manual: [],
    floor_override: null,
    bc_reference: `BC-${String(n).padStart(4, "0")}`,
    property_reference: `PROP-2026-${String(n).padStart(4, "0")}`,
    cover_photo_url: photos[0].url,
    source_url: null,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    internal_notes: null,
    property_type: "piso",
    building_features: null,
    latitude: null,
    longitude: null,
    geocoded_at: null,
    location_precision: null,
    last_synced_at: null,
    archived_at: archived ? iso(int(1, 60)) : null,
    country: "es",
    created_at: iso(N_PROPS - i),
    updated_at: iso(int(0, 30)),
    agencies: { id: agency.id, name: agency.name, slug: agency.slug, logo_url: null },
    property_photos: photos,
  };
});

// ── Etiquetas ───────────────────────────────────────────────────────────────
const TAG_NAMES = ["Destacada", "Revisar fotos", "Llamar dueño", "Exclusiva", "Bajada de precio", "Estudiantes", "Familias", "Lujo", "Oportunidad", "Sin ascensor", "Mascotas", "Corta estancia", "Larga estancia", "Nueva", "Reformada", "Para reformar", "Con terraza", "Con garaje", "Ático", "Bajo"];
const COLORS = ["gold", "blue", "green", "red", "gray"];
const property_tags = TAG_NAMES.map((name, i) => ({ id: uuid("d", i + 1), name, color: COLORS[i % COLORS.length], country: "es" }));
const property_tag_links = properties.flatMap((p, i) =>
  i % 3 === 0 ? [{ property_id: p.id, tag_id: property_tags[i % property_tags.length].id }] : [],
);

// ── Datos de la ficha (CRM-03): más etiquetas, SmartLinks, aperturas y medios ─
// Sin `rnd()`: con aritmética sobre el índice, para no mover la secuencia de
// los datos que vienen después (clientes, mensajes…) ni las mediciones previas.
// · Dos etiquetas de `cl` enlazadas a propiedades `es`: la ficha `es` no debe
//   mostrarlas (se cruzan con el catálogo del país).
const cl_tags = ["Chile A", "Chile B"].map((name, i) => ({ id: uuid("7", i + 1), name, color: "gray", country: "cl" }));
property_tags.push(...cl_tags);
properties.forEach((p, i) => {
  if (i % 6 === 0) property_tag_links.push({ property_id: p.id, tag_id: property_tags[(i + 7) % TAG_NAMES.length].id });
  if (i % 9 === 0) property_tag_links.push({ property_id: p.id, tag_id: cl_tags[i % 2].id });
});
const property_shares = properties.flatMap((p, i) =>
  i % 2 === 0
    ? Array.from({ length: 1 + (i % 3) }, (_, k) => ({
        id: uuid("4", i * 4 + k + 1),
        property_id: p.id,
        token: `simtoken${i}x${k}`,
        label: k === 0 ? null : `Enlace sintético ${k}`,
        created_at: iso((i % 40) + k),
        expires_at: k === 2 ? iso(-30) : null,
      }))
    : [],
);
const property_share_opens = property_shares.flatMap((sh, j) =>
  Array.from({ length: j % 4 }, (_, k) => ({ share_id: sh.id, opened_at: iso(j % 7 + k / 24) })),
);
const property_media = properties.flatMap((p, i) =>
  i % 2 === 0
    ? (["video", "plan"] as const).map((type, k) => ({
        id: uuid("6", i * 2 + k + 1),
        property_id: p.id,
        type,
        url: `${SIM}/img/media-${i}-${type}`,
        file_name: `${type === "video" ? "video" : "plano"}-sintetico-${i + 1}.${type === "video" ? "mp4" : "pdf"}`,
        storage_path: `sim/${p.id}/${type}`,
        source: "upload",
        format: type === "video" ? "landscape" : null,
        width: null,
        height: null,
        duration_seconds: type === "video" ? 30 : null,
        poster_url: null,
      }))
    : [],
);

// ── Clientes, leads y mensajes (para Clientes, Solicitudes y contadores) ─────
// Los clientes del CRM son perfiles con rol `client` (lib/db/queries/clients.ts).
const clients = Array.from({ length: 300 }, (_, i) => ({
  id: uuid("e", i + 1),
  role: "client",
  full_name: `Cliente Sintético ${i + 1}`,
  email: `cliente${i + 1}@sim.invalid`,
  phone: null,
  avatar_url: null,
  assigned_advisor_id: i % 2 ? USERS.advisor.id : USERS.owner.id,
  personal_shopper_terms_accepted_at: null,
  country: "es",
  countries: ["es"],
  multi_country: false,
  custom_role_id: null,
  suspended_at: null,
  created_at: iso(300 - i),
  updated_at: iso(int(0, 30)),
}));

const team_direct_conversations = Array.from({ length: 6 }, (_, i) => ({
  id: uuid("f", i + 1),
  participant_a: USERS.owner.id,
  participant_b: uuid("a", 10 + i),
  created_at: iso(30 - i),
  last_message_at: iso(i),
}));
// Mensajes con la forma que leen el layout (recuentos) y
// /api/admin/notifications (`content`, `read_at`, remitente embebido).
const teammates = team_direct_conversations.map((c, i) => ({ id: c.participant_b, full_name: `Compañera Sintética ${i + 1}` }));
const team_direct_messages = team_direct_conversations.flatMap((c, i) =>
  Array.from({ length: 5 }, (_, m) => ({
    id: uuid("1", i * 10 + m + 1),
    conversation_id: c.id,
    sender_id: c.participant_b,
    content: `Mensaje sintético ${m + 1} de la conversación ${i + 1}, con texto suficiente para recortarse en la campana.`,
    read_at: m < 2 ? iso(1) : null,
    created_at: iso(i + m / 10),
    profiles: { full_name: teammates[i].full_name },
  })),
);

// Visitas pendientes recientes (la campana mira 7 días) y avisos de opiniones
// de catálogos sin leer, para que /api/admin/notifications devuelva de todo.
const visit_requests = Array.from({ length: 4 }, (_, i) => ({
  id: uuid("2", i + 1),
  client_id: clients[i].id,
  property_id: properties[i].id,
  status: i < 3 ? "pending" : "confirmed",
  created_at: new Date(Date.now() - (i + 1) * 3600_000).toISOString(),
  profiles: { full_name: clients[i].full_name },
  properties: { title: properties[i].title, bc_reference: properties[i].bc_reference },
}));
const crm_notifications = Array.from({ length: 3 }, (_, i) => ({
  id: uuid("3", i + 1),
  user_id: USERS.owner.id,
  type: i < 2 ? "catalog_feedback" : "captacion",
  read: false,
  title: `Opinión sintética ${i + 1}`,
  body: "Al cliente sintético le ha gustado el catálogo.",
  link: "/es/admin/clientes",
  created_at: new Date(Date.now() - (i + 2) * 3600_000).toISOString(),
}));

const data = {
  auth: {
    users: {
      [TOKENS.owner]: authUser(USERS.owner),
      [TOKENS.advisor]: authUser(USERS.advisor),
      [TOKENS.suspended]: authUser(USERS.suspended),
    },
  },
  profiles: [...profiles, ...clients, ...teammates.map((t) => ({ ...t, role: "advisor", email: `${t.id}@sim.invalid`, country: "es", countries: ["es"], suspended_at: null }))],
  agencies,
  properties,
  property_tags,
  property_tag_links,
  property_shares,
  property_share_opens,
  property_media,
  team_direct_conversations,
  team_conversation_reads: [],
  team_direct_messages,
  visit_requests,
  crm_notifications,
  user_permission_overrides: [],
  profiles_country_roles: [],
  custom_roles: [],
  home_owners: [],
};

writeFileSync(OUT, JSON.stringify(data));
console.log(`crm-01: ${properties.length} propiedades, ${agencies.length} agencias, ${property_tags.length} etiquetas → ${OUT}`);

// Una docena de imágenes diminutas (JPEG 1×1 gris) para que las portadas no
// den 404. Su contenido no importa: solo que existan.
if (IMG_DIR) {
  mkdirSync(IMG_DIR, { recursive: true });
  const jpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64",
  );
  for (let k = 0; k < 12; k++) writeFileSync(join(IMG_DIR, `foto-${k}.jpg`), jpeg);
}
