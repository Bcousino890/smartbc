/**
 * Tests de la parte pública de los catálogos (BCP-01 fase 2), sin base de
 * datos ni red:
 *   · contrato público y privacidad (T6)
 *   · validación de días de los enlaces (T7)
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-catalogs-public.mts
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FORBIDDEN_PUBLIC_KEYS, UUID_RE } from "../lib/catalogs/public-contract.ts";
import { isValidContactName, validateCatalogContact } from "../lib/catalogs/contact.ts";
import { contactPhoneHref, contactRoleLabel, formatContactPhone } from "../lib/catalogs/contact-format.ts";
import { CATALOG_ZONE_ALIASES, catalogBarrios, catalogDistricts, catalogZoneMatch, catalogZoneTermsSql } from "../lib/catalogs/zones.ts";
import { MADRID_DISTRICTS, normalizeZone } from "../lib/madrid-zones.ts";
import { criteriaSummary, normalizeCriteria } from "../lib/catalogs/criteria.ts";
import { autoSelect, candidates, type CandidateProperty } from "../lib/catalogs/selection.ts";
import { explainProperty, zoneRedundancies } from "../lib/catalogs/explain.ts";
import { ENGINE_VERSION, isStorySourceCurrent, storySourceHash } from "../lib/services/story/source-hash.ts";
import { deriveEditorial, highlightCandidates, leadFrom, type EditorialInput } from "../lib/catalogs/editorial.ts";
import { textBlocker } from "../lib/catalogs/text-rules.ts";
import { checkDraft, draftFromFacts, draftUserText, pendingWarnings, prepareFromSource, type AiFn, type DraftSource } from "../lib/catalogs/ai-draft.ts";
import {
  coverPhotoOf,
  clientDescriptionSrc,
  findForbiddenKeys,
  toPublicCatalog,
  type InternalItem,
  type InternalSnapshot,
} from "../lib/catalogs/to-public.ts";

import { parseShareDays, isShareToken, SHARE_DEFAULT_DAYS } from "../lib/catalogs/share.ts";
import { SyncHub, HUB_CHECK_MS, HUB_HEARTBEAT_MS, type HubEvent, type TokenState } from "../lib/catalogs/sync-hub.ts";
import { SyncClient, type EventSourceLike, type FetchStateResult } from "../lib/catalogs/sync-client.ts";
import {
  applyUpdate,
  initialState,
  openGallery,
  pagesOf,
  step,
  updateDelay,
  PAGE_TURN_MS,
  REMOVED_NOTICE,
} from "../lib/catalogs/reader-state.ts";
import { HomeMeter, ReaderMeter, formatLatency, type TrialMsg } from "../lib/catalogs/measurement.ts";
import type { PublicCatalog, PublicCatalogState } from "../lib/catalogs/public-contract.ts";

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

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

const RAW_DESC = "Precioso piso reformado. Llame a Inmobiliaria Sol al 600 123 456. Ref. 4411.";
const RAW_FEATURES = ["Planta 7ª exterior", "Ascensor", "", "Contacto: agencia@ejemplo.com"];

function item(over: Partial<InternalItem> = {}): InternalItem {
  return {
    key: "k1AbCdEfGhIj",
    slug: "piso-almagro-12",
    title: "Piso luminoso en Almagro",
    zone: "Madrid",
    subzone: "Chamberí",
    operation: "sale",
    operations: null,
    price: 1450000,
    rent_price: null,
    currency: "eur",
    status: "available",
    bedrooms: 3,
    bathrooms: 2,
    square_meters: 142,
    description: RAW_DESC,
    features: RAW_FEATURES,
    features_manual: null,
    floor_override: null,
    clean: null,
    photos: [
      { u: md5("https://x.supabase.co/storage/v1/object/public/properties-photos/a.webp"), w: 1600, h: 1067, c: false },
      { u: md5("https://x.supabase.co/storage/v1/object/public/properties-photos/b.webp"), w: 1000, h: 1500, c: true },
    ],
    ...over,
  };
}

function snap(items: InternalItem[], over: Partial<InternalSnapshot> = {}): InternalSnapshot {
  return {
    title: "Ático y luz · Chamberí",
    intro: "Una selección para ti.",
    created_at: "2026-10-13T10:00:00Z",
    status: "active",
    owner_name: "Perfil Del Dueño",
    contact: { name: "Laura Méndez", phone: "+34600111222", role: "asesora" },
    items,
    ...over,
  };
}

// ── Reloj simulado ─────────────────────────────────────────────────────────

class FakeClock {
  t = 1_000_000;
  private seq = 0;
  timers = new Map<number, { at: number; fn: () => void; every: number | null }>();
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => this.add(fn, ms, null);
  setInterval = (fn: () => void, ms: number) => this.add(fn, ms, ms);
  clear = (h: unknown) => {
    this.timers.delete(h as number);
  };
  private add(fn: () => void, ms: number, every: number | null) {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + Math.max(0, ms), fn, every });
    return id;
  }
  async flush() {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }
  async advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      let nextId = -1;
      let next: { at: number; fn: () => void; every: number | null } | null = null;
      for (const [id, tm] of this.timers) if (tm.at <= end && (!next || tm.at < next.at)) [nextId, next] = [id, tm];
      if (!next) break;
      this.t = next.at;
      if (next.every !== null) next.at += next.every;
      else this.timers.delete(nextId);
      next.fn();
      await this.flush();
    }
    this.t = end;
    await this.flush();
  }
}

function pubCatalog(keys: string[], title = "Catálogo"): PublicCatalog {
  return {
    title,
    intro: null,
    edition: "Otoño 2026",
    preparedBy: "Fabricio Andree",
    phone: "+34 641 457 123",
    phoneHref: "tel:+34641457123",
    role: "asesor",
    coverPhoto: null,
    items: keys.map((key) => ({
      key,
      title: `Vivienda ${key}`,
      place: null,
      operation: "Venta",
      price: "1 €",
      reserved: false,
      bedrooms: null,
      bathrooms: null,
      squareMeters: null,
      floor: "Planta · sin dato",
      description: null,
      features: [],
      photos: [{ src: `/p/${key}/0.webp`, width: null, height: null, orientation: "unknown" as const }, { src: `/p/${key}/1.webp`, width: null, height: null, orientation: "unknown" as const }],
      coverIndex: 0,
    })),
  };
}

function pubState(fp: string, keys: string[], expiresAt = "2099-01-01T00:00:00Z"): PublicCatalogState {
  return { fingerprint: fp, expiresAt, catalog: pubCatalog(keys) };
}

/** Base de datos simulada para el vigilante. */
class FakeDb {
  fp = "A";
  keys = ["a", "b", "c"];
  valid = true;
  stateCalls = 0;
  contentCalls = 0;
  state(): TokenState {
    return this.valid ? { valid: true, fingerprint: this.fp, expiresAt: "2099-01-01T00:00:00Z" } : { valid: false, fingerprint: null, expiresAt: null };
  }
}

function makeHub(clock: FakeClock, db: FakeDb) {
  return new SyncHub({
    fetchStates: async (tokens) => {
      db.stateCalls++;
      return new Map(tokens.map((t) => [t, db.state()]));
    },
    fetchContent: async () => {
      db.contentCalls++;
      return db.valid ? pubState(db.fp, db.keys) : null;
    },
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clear,
  });
}

/** EventSource simulado que se conecta al vigilante simulado. */
class FakeEs implements EventSourceLike {
  onerror: ((ev: unknown) => void) | null = null;
  closed = false;
  listeners = new Map<string, Array<(ev: { data: string }) => void>>();
  unsub: (() => void) | null = null;
  addEventListener(type: string, fn: (ev: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, data: unknown) {
    if (this.closed) return;
    for (const fn of this.listeners.get(type) ?? []) fn({ data: JSON.stringify(data) });
  }
  close() {
    this.closed = true;
    this.unsub?.();
  }
}

async function liveTests() {
  section("QA de PR-B · índice sin recortes en la doble página");
  {
    // En la doble página la hoja tiene altura fija y overflow oculto: el
    // índice tiene que ir dentro de una zona que se desplaza (la del texto
    // largo), o las últimas entradas quedan fuera de alcance. La prueba en el
    // navegador (12/20/24 viviendas) vive fuera de CI; esto evita que se
    // pierda la zona sin que nadie lo note.
    const pages = readFileSync("components/catalogs/reader/pages.tsx", "utf8");
    const index = pages.slice(pages.indexOf("export function IndexPage"), pages.indexOf("function Fact("));
    check("índice dentro de ScrollRegion (variante «index»)", /<ScrollRegion label="Índice" variant="index"[^>]*>\s*<ol className=\{styles\.indexList\}>/.test(index));
    check("índice: todas las entradas, sin cortes ni límites", /catalog\.items\.map\(/.test(index) && !/catalog\.items\.slice\(/.test(index));
    const css = readFileSync("components/catalogs/reader/reader.module.css", "utf8");
    check("índice: la hoja es columna flexible en la doble página", /\.indexPage \{\s*display: flex;\s*flex-direction: column;/.test(css));
  }

  section("Ampliación X4 · zonas de los catálogos");
  {
    const mig = readFileSync("supabase/migrations/0195_catalog_selection.sql", "utf8");
    const block = mig.slice(mig.indexOf("INSERT INTO catalog_zone_terms (term, district, barrio) VALUES\n") + "INSERT INTO catalog_zone_terms (term, district, barrio) VALUES\n".length, mig.indexOf("\nON CONFLICT (term)"));
    check("la tabla de la migración es exactamente la que genera el TS (sin deriva)", block === catalogZoneTermsSql());
    const globalBefore = JSON.stringify(MADRID_DISTRICTS);
    check("Chueca → Justicia, Malasaña → Universidad, Huertas → Cortes",
      catalogZoneMatch("Chueca")?.barrio === "Justicia" && catalogZoneMatch("malasaña, Madrid")?.barrio === "Universidad" && catalogZoneMatch("HUERTAS")?.barrio === "Cortes");
    check("la taxonomía global NO cambia (normalizeZone sigue igual)",
      normalizeZone("Chueca").barrio === "Chueca" && JSON.stringify(MADRID_DISTRICTS) === globalBefore && MADRID_DISTRICTS.Centro.includes("Chueca"));
    check("mismas reglas que normalizeZone para lo demás", ["Goya, Madrid", "barrio de Salamanca", "Retiro - Ibiza", "Las Águilas", "Fuencarral-El Pardo"].every((t) => {
      const a = catalogZoneMatch(t); const b = normalizeZone(t);
      return a !== null && a.district === b.district && a.barrio === b.barrio;
    }));
    check("zona desconocida → null (no se inventa)", catalogZoneMatch("Pozuelo de Alarcón") === null && catalogZoneMatch("") === null && catalogZoneMatch(null) === null);
    check("los selectores no ofrecen los nombres populares", !catalogBarrios("Centro").some((b) => b in CATALOG_ZONE_ALIASES) && catalogBarrios("Centro").includes("Justicia"));
    check("21 distritos", catalogDistricts().length === 21);
  }

  section("Ampliación X5 · criterios y selección (referencia TS)");
  {
    const d = normalizeCriteria({});
    check("por defecto: ambas, 12, precio ascendente", d.ok && d.criteria.max === 12 && d.criteria.sort === "price_asc" && d.criteria.operation === "any");
    const bad = [{ max: 0 }, { max: 25 }, { max: 2.5 }, { price_max: 100 }, { operation: "sale", price_min: 5, price_max: 4 },
      { operation: "sale", price_min: -1 }, { zones: [{ kind: "district", name: "Gotham" }] }, { zones: [{ kind: "barrio", name: "Chueca" }] },
      { zones: Array.from({ length: 31 }, (_, i) => ({ kind: "free", name: `Zona ${i}` })) }, { operation: "x" }, { sort: "x" }];
    check("criterios inválidos (mismas reglas que SQL)", bad.every((b) => !normalizeCriteria(b).ok));
    const s = normalizeCriteria({ operation: "sale", zones: [{ kind: "district", name: "Salamanca" }, { kind: "barrio", name: "Justicia" }], price_min: "900.000", price_max: 1500000 });
    check("resumen con unidades (venta €)", s.ok && criteriaSummary(s.criteria) === "Salamanca · Justicia · Venta · 900.000–1.500.000 €", s.ok ? criteriaSummary(s.criteria) : "");
    const r = normalizeCriteria({ operation: "rent", price_max: 4000 });
    check("resumen alquiler €/mes", r.ok && criteriaSummary(r.criteria) === "Alquiler · hasta 4.000 €/mes");
    const P = (o: Partial<CandidateProperty> & { id: string }): CandidateProperty => ({
      country: "es", archived_at: null, status: "available", operation: "sale", operations: ["sale"], price: 1000, rent_price: null,
      zone: "Salamanca", subzone: null, created_at: "2026-01-01T00:00:00Z", photo_count: 1, ...o,
    });
    const props = [
      P({ id: "a", price: 900 }), P({ id: "b", price: 900, created_at: "2026-02-01T00:00:00Z" }), P({ id: "c", price: 0 }),
      P({ id: "d", photo_count: 0 }), P({ id: "e", status: "sold" }), P({ id: "f", zone: "Chueca", price: 800 }),
      P({ id: "g", operation: "rent", operations: ["rent"], price: 3000 }), P({ id: "h", operations: ["sale", "rent"], price: 2000, rent_price: 4000 }),
    ];
    const c1 = normalizeCriteria({ operation: "sale", zones: [{ kind: "district", name: "Salamanca" }, { kind: "barrio", name: "Justicia" }], max: 3 });
    const res0 = c1.ok ? autoSelect(props, c1.criteria) : { ids: [], total: 0 };
    const res = { ids: res0.ids, total: res0.total };
    check("orden completo y estable, después el máximo (total completo)", JSON.stringify(res) === JSON.stringify({ ids: ["f", "b", "a"], total: 5 }), JSON.stringify(res));
    const c2 = normalizeCriteria({ operation: "rent" });
    check("alquiler: la dual compara su precio de alquiler", c2.ok && JSON.stringify(autoSelect(props, c2.criteria).ids) === JSON.stringify(["g", "h"]));
    const c3 = normalizeCriteria({ operation: "sale", price_min: 1 });
    check("con rango, sin precio no entra; sin rango sí (al final)", c3.ok && !autoSelect(props, c3.criteria).ids.includes("c") && d.ok && autoSelect(props, { ...d.criteria, operation: "sale" }).ids.at(-1) === "c");
    check("búsqueda manual: sin foto obligatoria", d.ok && candidates(props, d.criteria, { requirePhoto: false }).some((x) => x.id === "d") && !candidates(props, d.criteria, { requirePhoto: true }).some((x) => x.id === "d"));
  }

  section("Ampliación C2 · huella de la historia extraída del motor (Z2)");
  {
    // La fórmula que tenía engine.ts en línea, copiada tal cual como referencia.
    const sha = (x: string) => createHash("sha256").update(x).digest("hex");
    const facts = { bedrooms: 3, bathrooms: 2, squareMeters: 142, features: ["Ascensor", "Terraza", "Trastero"] };
    const description = "  Ático con terraza. Salón doble con chimenea.  ";
    const inline = sha(JSON.stringify([4.1, description.trim(), facts.bedrooms, facts.bathrooms, facts.squareMeters, facts.features]));
    const input = { description, ...facts };
    check("misma huella que la fórmula en línea de engine.ts (versión 4.1)", ENGINE_VERSION === 4.1 && storySourceHash(input) === inline);
    const nulls = { description: null, bedrooms: null, bathrooms: null, squareMeters: null, features: [] as string[] };
    check("con datos vacíos también coincide", storySourceHash(nulls) === sha(JSON.stringify([4.1, "", null, null, null, []])));
    const v2 = sha(JSON.stringify([2, description.trim(), 3, 2, 142, facts.features]));
    const v1 = sha(JSON.stringify([description.trim(), 3, 2, 142, facts.features]));
    check("vigente con cualquier versión conocida del motor (4.1, 4, 3, 2 y la primera)", isStorySourceCurrent(v2, input) && isStorySourceCurrent(v1, input)
      && isStorySourceCurrent(storySourceHash(input, 4), input) && isStorySourceCurrent(storySourceHash(input, 3), input));
    check("no vigente si cambia la fuente o la huella es otra", !isStorySourceCurrent(inline, { ...input, bedrooms: 4 })
      && !isStorySourceCurrent(inline, { ...input, features: ["Ascensor"] }) && !isStorySourceCurrent("otra", input) && !isStorySourceCurrent(null, input));
    check("engine.ts usa el módulo extraído (sin fórmula propia)", (() => {
      const src = readFileSync("lib/services/story/engine.ts", "utf8");
      return src.includes('from "./source-hash"') && !/JSON\.stringify\(\[ENGINE_VERSION/.test(src);
    })());
  }

  section("Ampliación C2 · recorrido editorial (Z3)");
  {
    const CLEAN = "Piso exterior y muy luminoso en una finca señorial. Cocina reformada con salida a un patio tranquilo. " +
      "Los tres dormitorios dan a la calle y el principal tiene baño en suite. El salón se abre a un balcón corrido.";
    const base = (o: Partial<EditorialInput> = {}): EditorialInput => ({
      description: "Texto del portal. Llame al 600 123 456.", features: ["Ascensor"], features_manual: ["Trastero"],
      bedrooms: 3, bathrooms: 2, square_meters: 110, zone: "Madrid", subzone: "Delicias",
      cleanDescription: CLEAN, cleanFeatures: ["Ascensor", "Terraza de 20 m²", "Calefacción central", "Llame al 600 111 222"],
      text: null, story: null,
      photos: [{ u: "0" }, { u: "1", k: "kitchen" }, { u: "2", k: "living_room" }, { u: "3", k: "terrace_outdoor" }, { u: "4" }],
      coverIndex: 0, ...o,
    });
    const storyHash = storySourceHash({ description: "Texto del portal. Llame al 600 123 456.", bedrooms: 3, bathrooms: 2, squareMeters: 110, features: ["Ascensor", "Trastero"] });
    const story = { h: storyHash, p: "Un piso con luz de la mañana a la tarde.", b: [
      { c: "kitchen", t: "Cocina reformada con salida a un patio tranquilo y despensa original." },
      { c: "living", t: "El salón se abre a un balcón corrido sobre la calle, con techos altos." },
      { c: "building", t: "Portería." },
      { c: "outdoor", t: "Terraza de 20 m² orientada al sur, con vistas despejadas." },
    ] };

    const c = deriveEditorial(base());
    check("nivel limpio: entrada = 1–2 primeras frases literales (≤ 45 palabras)", c.level === "clean"
      && c.lead === "Piso exterior y muy luminoso en una finca señorial. Cocina reformada con salida a un patio tranquilo.", c.lead ?? "");
    check("nivel limpio: secciones SIN títulos y con fotos en su orden (sin la de portada)", c.sections.length === 1
      && c.sections[0].heading === null && c.sections[0].photo === 1 && c.sections[0].text.startsWith("Los tres dormitorios"));
    check("descripción completa íntegra, carácter a carácter", c.description === CLEAN);
    check("puntos verificados: literales, de la lista cerrada, sin contacto (máx. 3)",
      JSON.stringify(c.highlights) === JSON.stringify(["Ascensor", "Terraza de 20 m²", "Calefacción central"]), JSON.stringify(c.highlights));
    check("detalle: características limpias + manuales, sin contacto y sin duplicados",
      JSON.stringify(c.features) === JSON.stringify(["Ascensor", "Terraza de 20 m²", "Calefacción central", "Trastero"]), JSON.stringify(c.features));

    const st = deriveEditorial(base({ story }));
    check("historia vigente: entrada = la aprobada; capítulos con su título", st.level === "story" && st.lead === story.p
      && JSON.stringify(st.sections.map((x) => x.heading)) === JSON.stringify(["Cocina y comedor", "Salón y luz", "Vida al aire libre"]), JSON.stringify(st.sections.map((x) => x.heading)));
    check("historia: foto de la clase de cada capítulo (sin repetir, sin la portada)",
      JSON.stringify(st.sections.map((x) => x.photo)) === JSON.stringify([1, 2, 3]), JSON.stringify(st.sections.map((x) => x.photo)));
    check("historia: el micro-capítulo pasa al detalle", !st.sections.some((x) => x.text === "Portería.") && st.features.includes("Portería"));
    check("historia: la descripción completa sigue siendo la limpia vigente", st.description === CLEAN);

    const stale = deriveEditorial(base({ story, bedrooms: 4 }));
    check("historia con la fuente cambiada: no se usa (vuelve el nivel limpio)", stale.level === "clean" && !stale.sections.some((x) => x.heading));

    const tx = deriveEditorial(base({ story, text: { b: "Una vivienda pensada para vivir con calma. Tiene una cocina amplia y luminosa. " + "Frase de relleno. ".repeat(80), l: "Calma y luz en Delicias", h: ["Terraza de 20 m²", "Inventado"] } }));
    check("texto del catálogo vigente: manda sobre la historia y la limpia", tx.level === "text" && tx.lead === "Calma y luz en Delicias");
    check("texto: los puntos elegidos valen solo si siguen siendo candidatos", JSON.stringify(tx.highlights) === JSON.stringify(["Terraza de 20 m²"]));
    check("texto: sin título inventado y descripción completa íntegra", tx.sections.every((x) => x.heading === null) && tx.sections.length > 1
      && tx.description?.startsWith("Una vivienda pensada") === true && tx.description?.endsWith("Frase de relleno.") === true);
    check("texto sin entrada propia: la entrada son sus primeras frases y no se repiten en las secciones",
      (() => { const r = deriveEditorial(base({ text: { b: "Primera frase corta. Segunda frase corta. Tercera frase.", l: null, h: [] } }));
        return r.lead === "Primera frase corta. Segunda frase corta." && r.sections.length === 1 && r.sections[0].text === "Tercera frase."; })());

    const facts = deriveEditorial(base({ cleanDescription: null, cleanFeatures: [] }));
    check("sin texto: solo datos y fotos (sin secciones ni entrada inventadas)", facts.level === "facts" && facts.lead === null
      && facts.sections.length === 0 && facts.description === null && JSON.stringify(facts.highlights) === JSON.stringify(["Trastero"]));
    const leak = deriveEditorial(base({ cleanDescription: "Piso muy luminoso con vistas. Más información en www.agencia.com o en el 600 123 456. Cocina amplia." }));
    check("privacidad: ninguna sección ni entrada con contacto, URL o agencia", !JSON.stringify(leak.sections).match(/agencia|600 123|www\./) && !(leak.lead ?? "").match(/www\./));
    const long = "Frase larga de una descripción real con detalles de la vivienda y su entorno. ".repeat(40).trim();
    const lg = deriveEditorial(base({ cleanDescription: long }));
    check("descripción de 3.000 caracteres: íntegra en el detalle y repartida sin perder texto", lg.description === long
      && long.length >= 3000 && (lg.lead + " " + lg.sections.map((x) => x.text).join(" ")).replace(/\s+/g, " ") === long.replace(/\s+/g, " "));
    check("ninguna sección vacía", [c, st, tx, lg].every((r) => r.sections.every((x) => x.text.trim().length > 0)));
    check("entrada: una primera frase de > 45 palabras no se recorta (sin entrada)", leadFrom(("palabra ").repeat(50) + ".").lead === null);
    check("candidatos: deduplicados sin tildes", JSON.stringify(highlightCandidates(["Calefacción", "calefaccion"], [])) === JSON.stringify(["Calefacción"]));
    const pubC = toPublicCatalog(snap([item({ text: { b: "Texto propio del catálogo. Con dos frases.", l: null, h: [] },
      story: { h: "x", p: "Entrada", b: [{ c: "living", t: "Salón." }] } })]));
    check("contrato público con texto e historia: sin claves prohibidas, UUID ni huellas internas",
      findForbiddenKeys(pubC, FORBIDDEN_PUBLIC_KEYS).length === 0 && !UUID_RE.test(JSON.stringify(pubC))
      && !/"(h|b|l|p|ph|story|level)":/.test(JSON.stringify(pubC)) && pubC.items[0].description === "Texto propio del catálogo. Con dos frases.");
    check("bloqueos de publicación iguales a SQL (contacto, URL, correo, precio; años y m² no)",
      textBlocker("Llame al 600 123 456") === "text_has_contact" && textBlocker("www.x.es") === "text_has_contact" && textBlocker("a@b.com") === "text_has_contact"
      && textBlocker("Por 590.000 €") === "text_has_price" && textBlocker("1.500 euros al mes") === "text_has_price"
      && textBlocker("Reformado entre 1990-2000, con 120 m² y 3 dormitorios.") === null);
  }

  section("Ampliación C2 · borradores con IA inyectada y comprobación (Z4)");
  {
    const calls: Array<Parameters<AiFn>[0]> = [];
    const fake = (replies: string[]): AiFn => async (o) => {
      calls.push(o);
      const r = replies.shift();
      if (r === undefined) throw new Error("sin respuesta");
      return r;
    };
    const p1 = await prepareFromSource({ description: "Piso exterior. Llame a Inmo Sol al 600 123 456.", features: ["Ascensor"] },
      fake([JSON.stringify({ description: "Piso exterior.", features: ["Ascensor"] })]));
    check("preparar desde la ficha: propuesta limpia (no guarda nada)", p1.body === "Piso exterior." && p1.origin === "ai_clean" && p1.lead === null);
    check("preparar: misma limpieza que la descripción para clientes, en español y sin fotos",
      /Elimina por completo/.test(calls[0].system) && /español/.test(calls[0].system) && !("images" in calls[0]));
    const p2 = await prepareFromSource({ description: "x", features: [] }, fake(["{cortado", JSON.stringify({ description: "Texto bueno.", features: [] })]));
    check("preparar: reintenta una vez si la IA devuelve un JSON cortado", p2.body === "Texto bueno.");
    let threw = "";
    try { await prepareFromSource({ description: "", features: [] }, fake([])); } catch (e) { threw = (e as Error).message; }
    check("preparar: ficha sin texto → error sin llamar a la IA", threw === "source_empty");
    const slow: AiFn = (o) => new Promise((_, rej) => o.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    let aborted = "";
    // Con un temporizador normal (AbortSignal.timeout no mantiene vivo el proceso de pruebas).
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30);
    try { await prepareFromSource({ description: "x", features: [] }, slow, ctl.signal); } catch (e) { aborted = (e as Error).message; }
    clearTimeout(timer);
    check("tiempo máximo / cancelación: la llamada se corta y no reintenta", aborted === "aborted");
    const src: DraftSource = { title: "Piso en Delicias", operation: "Venta", place: "Delicias, Madrid", bedrooms: 3, bathrooms: 2, squareMeters: 110,
      floor: "Planta 3.ª", features: ["Ascensor", "Terraza"], cleanDescription: "Piso exterior con terraza." };
    const ut = draftUserText(src);
    check("borrador con IA: solo hechos conocidos, sin precio ni fotos", !/precio|€|price|foto|photo|http/i.test(ut) && /"dormitorios":3/.test(ut) && /Terraza/.test(ut));
    const d = await draftFromFacts(src, fake([JSON.stringify({ lead: "Luz y terraza en Delicias.", body: "Piso exterior de 110 m² con terraza." })]));
    check("borrador con IA: propuesta con entrada y cuerpo (no publica ni guarda)", d.origin === "ai_draft" && d.lead === "Luz y terraza en Delicias.");
    const ok = checkDraft({ body: d.body, lead: d.lead, highlights: ["Terraza"] }, src);
    check("comprobación: sin avisos cuando todo sale de la ficha", ok.blockers.length === 0 && ok.warnings.length === 0, JSON.stringify(ok));
    const bad = checkDraft({ body: "Piso de 140 m² con piscina y garaje. Llame al 600 123 456. Por 590.000 €.", lead: null, highlights: [] }, src);
    check("comprobación: contacto y precio bloquean", bad.blockers.some((b) => b.code === "text_has_contact") && bad.blockers.some((b) => b.code === "text_has_price"));
    check("comprobación: cifra y elementos que no están en la ficha → avisos con id estable",
      ["number:140", "feature:piscina", "feature:garaje"].every((id) => bad.warnings.some((w) => w.id === id)), JSON.stringify(bad.warnings.map((w) => w.id)));
    const w = checkDraft({ body: "Piso de 140 m² con piscina.", lead: null, highlights: [] }, src);
    check("avisos: hay que confirmarlos uno a uno", pendingWarnings(w, ["number:140"]).map((x) => x.id).join() === "feature:piscina"
      && pendingWarnings(w, ["number:140", "feature:piscina"]).length === 0);
  }

  section("Ampliación C1 · ajustes del automático y explicación (solo gestión)");
  {
    const P = (o: Partial<CandidateProperty> & { id: string }): CandidateProperty => ({
      country: "es", archived_at: null, status: "available", operation: "sale", operations: ["sale"], price: 1000, rent_price: null,
      zone: "Tetuán", subzone: null, created_at: "2026-01-01T00:00:00Z", photo_count: 1, ...o,
    });
    const props = [
      P({ id: "d1", price: 500 }), P({ id: "d2", price: 600 }), P({ id: "d3", price: 700 }), P({ id: "d4", price: 800, status: "reserved" }),
      P({ id: "d5", price: 550, zone: "Chamberí", subzone: "Trafalgar" }), P({ id: "d6", price: 650, photo_count: 0 }),
      P({ id: "d7", operation: "rent", operations: ["rent"], price: 2000 }), P({ id: "d8", operation: "rent", operations: ["rent"], price: 1500 }),
      P({ id: "d9", price: 900, status: "sold" }), P({ id: "d10", price: 900, country: "cl" }), P({ id: "d12", price: 1500 }),
    ];
    const n = normalizeCriteria({ operation: "sale", zones: [{ kind: "district", name: "Tetuán" }], price_max: 1000, max: 3 });
    const c = n.ok ? n.criteria : (null as never);
    const sel = (adj: Array<[string, "include" | "exclude"]>, cc = c) =>
      autoSelect(props, cc, adj.map(([propertyId, kind]) => ({ propertyId, kind })));
    const show = (r: ReturnType<typeof sel>) => r.ids.map((id, i) => `${id}:${r.via[i]}`).join(",");
    check("base: 3 de 4 coincidencias", show(sel([])) === "d1:match,d2:match,d3:match" && sel([]).total === 4);
    check("exclusión antes del máximo: entra la siguiente", show(sel([["d1", "exclude"]])) === "d2:match,d3:match,d4:match" && sel([["d1", "exclude"]]).matched === 3);
    check("inclusión fuera de zona: plaza asegurada y mezclada por precio",
      show(sel([["d1", "exclude"], ["d5", "include"]])) === "d5:include,d2:match,d3:match", show(sel([["d1", "exclude"], ["d5", "include"]])));
    check("inclusión sin foto: entra en su sitio", show(sel([["d1", "exclude"], ["d5", "include"], ["d6", "include"]])) === "d5:include,d2:match,d6:include");
    const c5 = { ...c, max: 5 };
    check("otra operación: grupo posterior por su propio importe (nunca mezclado con venta)",
      show(sel([["d5", "include"], ["d7", "include"], ["d8", "include"]], c5)) === "d1:match,d5:include,d2:match,d8:include,d7:include",
      show(sel([["d5", "include"], ["d7", "include"], ["d8", "include"]], c5)));
    check("incluir una que ya coincide: una vez («both»)", show(sel([["d2", "include"]])) === "d1:match,d2:both,d3:match");
    check("inclusiones no disponibles (vendida, Chile) no cuentan", show(sel([["d9", "include"], ["d10", "include"]])) === "d1:match,d2:match,d3:match");
    const over = sel([["d5", "include"], ["d6", "include"], ["d7", "include"], ["d8", "include"]]);
    check("más inclusiones disponibles que plazas: las primeras del orden y nunca más que el máximo",
      show(over) === "d5:include,d6:include,d8:include", show(over));

    const ex = (id: string, adj: "include" | "exclude" | null) => explainProperty(props.find((p) => p.id === id)!, c, adj);
    const m = ex("d2", null);
    check("explicación: coincide (zona, operación y precio)", m.status === "match" && m.headline === "Coincide con los criterios"
      && m.details.includes("Zona: distrito Tetuán") && m.details.includes("Venta") && m.details.some((d) => d.startsWith("600 € dentro de")), JSON.stringify(m));
    const inc = ex("d5", "include");
    check("explicación: incluida fuera de criterios dice qué no cumple", inc.status === "include" && inc.headline === "Incluida a mano · fuera de criterios"
      && inc.details.some((d) => d.startsWith("Zona «Trafalgar, Chamberí» fuera de: Tetuán")), JSON.stringify(inc));
    check("explicación: inclusión sin foto avisa", ex("d6", "include").warnings.includes("Sin foto: el lector la mostrará sin imagen"));
    const other = ex("d7", "include");
    check("explicación: otra operación avisa y no compara importes", other.warnings.some((w) => w.startsWith("Otra operación (alquiler)"))
      && !other.details.some((d) => d.startsWith("Precio")) , JSON.stringify(other));
    check("explicación: excluida a mano (y si coincidiría)", ex("d2", "exclude").headline === "Excluida a mano (coincidiría con los criterios)"
      && ex("d12", "exclude").headline === "Excluida a mano");
    const out = ex("d12", null);
    check("explicación: no entra, con el motivo", out.status === "out" && out.details.some((d) => d.startsWith("Precio 1.500 €, por encima de 1.000 €")), JSON.stringify(out));
    check("explicación: inclusión vendida avisa de que no aparece", ex("d9", "include").warnings.some((w) => w.includes("vendida: no aparece")));
    check("explicación: «both» cuando también coincide", ex("d2", "include").status === "both");
    const z = normalizeCriteria({ zones: [{ kind: "district", name: "Salamanca" }, { kind: "barrio", name: "Castellana" }, { kind: "free", name: "Goya" }] });
    check("zonas redundantes: Castellana y Goya ya están dentro de Salamanca", z.ok
      && JSON.stringify(zoneRedundancies(z.criteria)) === JSON.stringify(["Castellana ya está dentro de Salamanca", "Goya ya está dentro de Salamanca"]),
      z.ok ? JSON.stringify(zoneRedundancies(z.criteria)) : "");
  }

  section("Ampliación C1 · portada elegida y privacidad del contrato");
  {
    const u = (n: string) => md5(`https://x.supabase.co/storage/v1/object/public/properties-photos/${n}.webp`);
    const A = item({ key: "kA0000000000001", slug: "piso-a", photos: [
      { u: u("a1"), w: 1600, h: 1067, c: true }, { u: u("a2"), w: 1600, h: 1067, c: false }, { u: u("a1"), w: 1600, h: 1067, c: false }, { u: u("a3"), w: 1000, h: 1500, c: false }] });
    const B = item({ key: "kB0000000000002", slug: "piso-b", photos: [{ u: u("b1"), w: 1600, h: 1067, c: false }, { u: u("b2"), w: 1600, h: 1067, c: true }] });
    const N = item({ key: "kN0000000000003", slug: "sin-fotos", photos: [] });
    const S = item({ key: "kS0000000000004", slug: "vendida", status: "sold" });
    check("sin elección: la regla de siempre (primera con foto, su portada)", coverPhotoOf(snap([N, B, A])) === "/p/piso-b/1.webp");
    check("elegida con foto concreta (índice del proxy sin URL repetidas)",
      coverPhotoOf(snap([B, A], { cover: { key: "kA0000000000001", photo: u("a3") } })) === "/p/piso-a/2.webp");
    check("independiente del orden: sigue siendo la elegida aunque no sea la primera",
      toPublicCatalog(snap([B, A], { cover: { key: "kA0000000000001", photo: u("a2") } })).coverPhoto === "/p/piso-a/1.webp");
    check("foto elegida desaparecida → la foto de portada de esa vivienda",
      coverPhotoOf(snap([B, A], { cover: { key: "kA0000000000001", photo: null } })) === "/p/piso-a/0.webp"
      && coverPhotoOf(snap([B, A], { cover: { key: "kA0000000000001", photo: u("zz") } })) === "/p/piso-a/0.webp");
    check("vivienda fuera de la lista → la primera con foto", coverPhotoOf(snap([B, A], { cover: { key: null, photo: null } })) === "/p/piso-b/1.webp");
    check("vivienda elegida sin fotos → la primera con foto", coverPhotoOf(snap([N, A], { cover: { key: "kN0000000000003", photo: null } })) === "/p/piso-a/0.webp");
    check("vivienda elegida vendida (defensa en profundidad) → la primera con foto", coverPhotoOf(snap([S, B], { cover: { key: "kS0000000000004", photo: null } })) === "/p/piso-b/1.webp");
    check("catálogo vacío → sin foto", coverPhotoOf(snap([], { cover: { key: "kA0000000000001", photo: u("a1") } })) === null);
    const pub = toPublicCatalog(snap([B, A], { cover: { key: "kA0000000000001", photo: u("a3") } }));
    const json = JSON.stringify(pub);
    check("contrato público: ni portada interna, ni ajustes, ni criterios, ni explicación, ni anuncios",
      !("cover" in pub) && !/"(via|adjustment|explain|matched|criteria|ads|reasons|cover_property_id|cover_photo_id)"/.test(json)
      && findForbiddenKeys(pub, FORBIDDEN_PUBLIC_KEYS).length === 0 && !UUID_RE.test(json) && !json.includes("supabase"), json.slice(0, 200));
  }

  section("Ampliación X2 · contacto del catálogo");
  {
    const ok = validateCatalogContact({ name: "  Laura Méndez ", phone: "600 111 222", role: "asesora" });
    check("contacto válido normalizado a E.164", ok.ok && ok.contact.phone === "+34600111222" && ok.contact.name === "Laura Méndez");
    const intl = validateCatalogContact({ name: "Laura", phone: "0044 7700 900123", role: "asesor" });
    check("internacional 00 → +", intl.ok && intl.contact.phone === "+447700900123");
    const bad: Array<[Record<string, unknown>, string]> = [
      [{ name: "L", phone: "600111222", role: "asesor" }, "invalid_contact_name"],
      [{ name: "x".repeat(81), phone: "600111222", role: "asesor" }, "invalid_contact_name"],
      [{ name: "laura@agencia.es", phone: "600111222", role: "asesor" }, "invalid_contact_name"],
      [{ name: "Laura www.agencia.es", phone: "600111222", role: "asesor" }, "invalid_contact_name"],
      [{ name: "Laura 600 111 222", phone: "600111222", role: "asesor" }, "invalid_contact_name"],
      [{ name: "Laura", phone: "12345", role: "asesor" }, "invalid_contact_phone"],
      [{ name: "Laura", phone: "+34 123", role: "asesor" }, "invalid_contact_phone"],
      [{ name: "Laura", phone: "600111222", role: "jefa" }, "invalid_contact_role"],
      [{}, "invalid_contact_name"],
    ];
    check("validaciones (nombre, teléfono, rol)", bad.every(([i, e]) => {
      const r = validateCatalogContact(i);
      return !r.ok && r.error === e;
    }));
    check("nombre: mismas reglas que SQL (2–80, sin @/web/teléfono)", isValidContactName("Ana") && !isValidContactName(" A ") && isValidContactName("María José de la Fuente-López"));
    check("formato +34", formatContactPhone("+34641457123") === "+34 641 457 123");
    check("formato internacional", formatContactPhone("+447700900123") === "+44 770 090 012 3");
    check("formato inválido → null", formatContactPhone("600111222") === null && contactPhoneHref("abc") === null);
    check("etiqueta asesor/asesora", contactRoleLabel("asesor") === "Tu asesor" && contactRoleLabel("asesora") === "Tu asesora");
    // Sin contacto en la instantánea: no se inventa uno (ni perfil ni constante).
    const noContact = toPublicCatalog({ ...snap([]), contact: { name: null, phone: null, role: null } });
    check("sin contacto → líneas vacías, sin recurrir al perfil ni al teléfono de la agencia",
      noContact.preparedBy === null && noContact.phone === null && noContact.phoneHref === null && noContact.role === "asesor");
    // Regla #297 intacta fuera de los catálogos: firmas y colecciones siguen
    // con el teléfono de la agencia y nadie fuera de lib/catalogs usa el
    // contacto editable.
    check("firma de correo: teléfono de la agencia intacto", /AGENCY_PHONE = "\+34 641 457 123"/.test(readFileSync("lib/mailbox/signature.ts", "utf8")));
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const pth = join(dir, f);
        if (f === "node_modules" || f.startsWith(".")) continue;
        if (statSync(pth).isDirectory()) walk(pth);
        else if (/\.(ts|tsx)$/.test(f) && /catalogs\/contact(-format)?["']/.test(readFileSync(pth, "utf8"))) offenders.push(pth);
      }
    };
    for (const d of ["app", "components", "lib"]) walk(d);
    const allowed = (pth: string) =>
      pth.startsWith("lib/catalogs/") || pth.startsWith("components/admin/catalogs/") ||
      pth.startsWith("components/catalogs/") || pth.startsWith("app/[country]/(admin)/admin/mi-espacio/") ||
      pth.startsWith("app/seleccion/") || pth.startsWith("app/dev-fixtures/");
    check("contacto editable solo en catálogos", offenders.every(allowed), offenders.filter((x) => !allowed(x)).join(", "));
  }

  section("T7 · días del enlace");
  check("vacío → 60", (parseShareDays("") as { days: number }).days === SHARE_DEFAULT_DAYS);
  check("ausente → 60", (parseShareDays(undefined) as { days: number }).days === 60);
  check("1 y 365 valen", parseShareDays(1).ok && parseShareDays("365").ok);
  check("0, 366, -5, 2.5 y texto no valen", [0, 366, -5, 2.5, "abc", "12d"].every((v) => !parseShareDays(v).ok));
  check("token de 28 caracteres vale", isShareToken("AbCdEfGhIjKlMnOpQrStUvWxYz_-"));
  check("token corto, con / o con espacios no", [ "abc", "a/b".padEnd(30, "x"), " ".repeat(30)].every((t) => !isShareToken(t)));

  section("T9 · vigilante del servidor (reloj simulado)");
  {
    const clock = new FakeClock();
    const db = new FakeDb();
    const hub = makeHub(clock, db);
    const evA: HubEvent[] = [];
    const evB: HubEvent[] = [];
    const unA = hub.subscribe("tok1", "A", (e) => evA.push(e));
    await clock.flush();
    check("alta → 2 temporizadores (300 ms y 500 ms)", hub.stats().timers === 2);
    db.fp = "B";
    await clock.advance(HUB_CHECK_MS);
    const upd = evA.find((e) => e.type === "update");
    check("cambio recogido en ≤ 300 ms con contenido completo", !!upd && upd.type === "update" && upd.state.fingerprint === "B");
    const contentBefore = db.contentCalls;
    db.fp = "C";
    hub.poke();
    await clock.flush();
    check("poke() tras guardar comprueba al momento", evA.filter((e) => e.type === "update").length === 2 && db.contentCalls === contentBefore + 1);
    const unB = hub.subscribe("tok1", "B", (e) => evB.push(e));
    await clock.flush();
    check("lector que saludó con huella vieja se pone al día en el alta", evB.some((e) => e.type === "update" && e.state.fingerprint === "C"));
    await clock.advance(HUB_HEARTBEAT_MS);
    const ping = evA.find((e) => e.type === "ping");
    check("latido cada 500 ms con huella y verificado", !!ping && ping.type === "ping" && ping.fingerprint === "C" && ping.verified === true);
    const callsBefore = db.stateCalls;
    await clock.advance(3000);
    check("una consulta por pasada para todos los lectores", db.stateCalls - callsBefore === 10, String(db.stateCalls - callsBefore));
    db.valid = false;
    await clock.advance(HUB_CHECK_MS);
    check("revocado/caducado sin cambiar contenido → unavailable", evA.at(-1)?.type === "unavailable" && evB.at(-1)?.type === "unavailable");
    check("sin lectores válidos → 0 temporizadores", hub.stats().timers === 0 && hub.stats().tokens === 0);
    unA();
    unB();
    unA();
    check("bajas idempotentes", hub.stats().listeners === 0);
  }
  {
    const clock = new FakeClock();
    const db = new FakeDb();
    const hub = makeHub(clock, db);
    const un1 = hub.subscribe("t1", "A", () => {});
    const un2 = hub.subscribe("t2", "A", () => {});
    await clock.flush();
    un1();
    check("queda un lector → siguen los temporizadores", hub.stats().timers === 2);
    un2();
    check("último lector fuera → 0 temporizadores y mapa vacío", hub.stats().timers === 0 && hub.stats().tokens === 0);
    hub.poke();
    await clock.advance(2000);
    check("sin lectores no se consulta la BD", db.stateCalls <= 2, String(db.stateCalls));
  }
  {
    // Comprobación lenta: un poke durante la consulta no se pierde.
    const clock = new FakeClock();
    const db = new FakeDb();
    let release: (() => void) | null = null;
    const hub = new SyncHub({
      fetchStates: (tokens) =>
        new Promise((res) => {
          const snap = db.state();
          release = () => res(new Map(tokens.map((t) => [t, snap])));
        }),
      fetchContent: async () => pubState(db.fp, db.keys),
      now: clock.now,
      setInterval: clock.setInterval,
      clearInterval: clock.clear,
    });
    const ev: HubEvent[] = [];
    hub.subscribe("t", "A", (e) => ev.push(e));
    await clock.flush();
    db.fp = "B";
    hub.poke();
    release!();
    await clock.flush();
    release!();
    await clock.flush();
    check("guardado durante una consulta en curso → se repite y llega", ev.some((e) => e.type === "update" && e.state.fingerprint === "B"));
  }

  section("T9 · sincronización del lector (reloj simulado)");
  async function clientRig(opts: { sseUp?: boolean } = {}) {
    const clock = new FakeClock();
    const db = new FakeDb();
    const hub = makeHub(clock, db);
    const sources: FakeEs[] = [];
    let sseUp = opts.sseUp ?? true;
    const states: PublicCatalogState[] = [];
    const conn: string[] = [];
    let unavailable = 0;
    let polls = 0;
    const client = new SyncClient(
      {
        openEventSource: () => {
          const es = new FakeEs();
          sources.push(es);
          if (sseUp) {
            // Como la ruta: lee el estado, saluda y se da de alta.
            void Promise.resolve().then(() => {
              if (es.closed) return;
              if (!db.valid) {
                es.emit("unavailable", {});
                return;
              }
              const hello = pubState(db.fp, db.keys);
              es.emit("hello", hello);
              es.unsub = hub.subscribe("tok", hello.fingerprint, (e) => {
                if (e.type === "update") es.emit("update", e.state);
                else if (e.type === "ping") es.emit("ping", { fingerprint: e.fingerprint, verified: e.verified });
                else es.emit("unavailable", {});
              });
            });
          }
          return es;
        },
        fetchState: async (known): Promise<FetchStateResult> => {
          polls++;
          if (!db.valid) return { kind: "invalid" };
          return known === db.fp
            ? { kind: "ok", fingerprint: db.fp, expiresAt: "2099-01-01T00:00:00Z" }
            : { kind: "ok", fingerprint: db.fp, expiresAt: "2099-01-01T00:00:00Z", catalog: pubCatalog(db.keys) };
        },
        now: clock.now,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clear,
        setInterval: clock.setInterval,
        clearInterval: clock.clear,
      },
      {
        onState: (s) => states.push(s),
        onUnavailable: () => unavailable++,
        onConnectivity: (c) => conn.push(c),
      },
    );
    return {
      clock, db, hub, sources, client, states, conn,
      get unavailable() { return unavailable; },
      get polls() { return polls; },
      setSse(up: boolean) { sseUp = up; },
    };
  }
  {
    const r = await clientRig();
    r.client.start();
    check("arranque: consulta al momento y abre el SSE a la vez", r.polls === 1 && r.sources.length === 1);
    // Guardado justo durante el saludo.
    r.db.fp = "B";
    r.hub.poke();
    await r.clock.flush();
    await r.clock.advance(400);
    check("guardado durante el saludo → se ve la huella nueva en < 0,5 s", r.states.at(-1)?.fingerprint === "B");
    check("SSE confirmado → deja de consultar", r.client.stats().sseConfirmed && !r.client.stats().polling);
    const pollsBefore = r.polls;
    await r.clock.advance(2000);
    check("con SSE sano no hay consultas de respaldo", r.polls === pollsBefore);
    r.client.stop();
    await r.clock.flush();
    check("stop() → 0 temporizadores y SSE cerrado", r.client.stats().timers === 0 && !r.client.stats().sseOpen && r.sources.every((s) => s.closed));
    check("stop() → el vigilante se queda sin lectores", r.hub.stats().timers === 0 && r.hub.stats().listeners === 0);
  }
  {
    const r = await clientRig();
    r.client.start();
    await r.clock.advance(600);
    // El SSE se cae (nginx, red) sin avisar y justo después se guarda.
    const es = r.sources[0];
    es.unsub?.();
    es.listeners.clear();
    r.setSse(false);
    await r.clock.advance(100);
    const tSave = r.clock.now();
    r.db.fp = "B";
    let seenAt: number | null = null;
    for (let i = 0; i < 40 && seenAt === null; i++) {
      await r.clock.advance(50);
      if (r.states.at(-1)?.fingerprint === "B") seenAt = r.clock.now();
    }
    const lag = seenAt === null ? Infinity : seenAt - tSave;
    check("SSE caído justo antes de guardar → visible en ≤ 2 s por el respaldo", lag <= 2000, `${lag} ms`);
    check("respaldo activo y reconexión programada", r.client.stats().polling);
    r.setSse(true);
    await r.clock.advance(3000);
    check("al volver el SSE deja de consultar", r.client.stats().sseConfirmed && !r.client.stats().polling);
    r.client.stop();
    check("stop() tras respaldo → 0 temporizadores", r.client.stats().timers === 0);
  }
  {
    const r = await clientRig({ sseUp: false });
    r.client.start();
    r.db.fp = "B";
    await r.clock.advance(500);
    check("SSE que nunca conecta → consulta cada 500 ms y ve el cambio", r.states.at(-1)?.fingerprint === "B");
    r.client.stop();
  }
  {
    const r = await clientRig();
    r.client.start();
    await r.clock.advance(600);
    const fpBefore = r.states.at(-1)?.fingerprint;
    r.db.valid = false;
    await r.clock.advance(HUB_CHECK_MS + 10);
    check("revocación sin cambio de contenido → no disponible por SSE", r.unavailable === 1 && fpBefore === r.db.fp);
    check("no disponible → todo parado", r.client.stats().timers === 0 && !r.client.stats().sseOpen);
  }
  {
    const r = await clientRig({ sseUp: false });
    r.client.start();
    await r.clock.flush();
    r.db.valid = false;
    await r.clock.advance(500);
    check("revocación detectada también por la consulta de respaldo", r.unavailable === 1);
  }
  {
    // Caducidad local programada sin red.
    const clock = new FakeClock();
    let unavailable = 0;
    const exp = new Date(clock.now() + 5000).toISOString();
    const c = new SyncClient(
      {
        openEventSource: () => new FakeEs(),
        fetchState: async () => ({ kind: "error" }),
        now: clock.now,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clear,
        setInterval: clock.setInterval,
        clearInterval: clock.clear,
      },
      { onState: () => {}, onUnavailable: () => unavailable++ },
      { fingerprint: "A", expiresAt: exp, catalog: pubCatalog(["a"]) },
    );
    const conn: string[] = [];
    c.start();
    await clock.advance(4900);
    check("antes de caducar sigue disponible", unavailable === 0);
    await clock.advance(200);
    check("caducidad aplicada en local sin red", unavailable === 1 && c.stats().timers === 0);
    void conn;
  }
  {
    const r = await clientRig({ sseUp: false });
    r.client.start();
    await r.clock.advance(100);
    // Corte total: la consulta falla.
    (r.client as unknown as { deps: { fetchState: () => Promise<FetchStateResult> } }).deps.fetchState = async () => ({ kind: "error" });
    await r.clock.advance(2600);
    check("sin contacto > 2 s → aviso «sin verificar»", r.conn.at(-1) === "offline");
    r.client.stop();
  }

  section("T8 · estado del lector (D12)");
  {
    const s0 = initialState(pubState("A", ["a", "b", "c"]), { kind: "item", key: "b" });
    check("páginas: portada, índice, 3 viviendas, cierre", pagesOf(s0.catalog).length === 6);
    const s1 = applyUpdate(s0, pubState("B", ["a", "c"]));
    check("se quita la que leo → pasa a la siguiente", s1.page.kind === "item" && s1.page.key === "c" && s1.notice === REMOVED_NOTICE);
    const s2 = applyUpdate(initialState(pubState("A", ["a", "b", "c"]), { kind: "item", key: "c" }), pubState("B", ["a", "b"]));
    check("se quita la última → vuelve al índice", s2.page.kind === "index" && !!s2.notice);
    const s3 = applyUpdate(initialState(pubState("A", ["a", "b"]), { kind: "item", key: "a" }), pubState("B", []));
    check("no queda ninguna → índice vacío", s3.page.kind === "index" && s3.catalog.items.length === 0);
    const s4 = applyUpdate(initialState(pubState("A", ["a", "b", "c"]), { kind: "item", key: "a" }), pubState("B", ["c", "b", "a"]));
    check("reordenar no me mueve de la vivienda", s4.page.kind === "item" && s4.page.key === "a" && s4.notice === null);
    const s5 = applyUpdate(initialState(pubState("A", ["a", "b", "c", "d"]), { kind: "item", key: "b" }), pubState("B", ["a", "d"]));
    check("se quitan la actual y la siguiente → la siguiente que queda", s5.page.kind === "item" && s5.page.key === "d");
    const g0 = openGallery(initialState(pubState("A", ["a", "b"]), { kind: "item", key: "a" }), "a", 1);
    const g1 = applyUpdate(g0, pubState("B", ["a", "b"].concat("z")));
    check("galería abierta: cambio aplicado al momento y conserva la foto", g1.gallery?.key === "a" && g1.gallery.photo === 1 && g1.fingerprint === "B");
    const g2 = applyUpdate(g0, pubState("C", ["b"]));
    check("galería de una vivienda quitada → se cierra y D12", g2.gallery === null && g2.page.kind === "item" && g2.page.key === "b");
    const same = applyUpdate(s0, pubState("A", ["a", "b", "c"], "2100-01-01T00:00:00Z"));
    check("misma huella con nueva caducidad → solo cambia la caducidad", same.page === s0.page && same.expiresAt.startsWith("2100"));
    check("paso de página en el borde no se sale", step(initialState(pubState("A", ["a"])), -1).page.kind === "cover");
  }
  {
    const d1 = updateDelay({ now: 1000, turnStartedAt: 1000, reducedMotion: false, galleryOpen: false });
    const d2 = updateDelay({ now: 1300, turnStartedAt: 1000, reducedMotion: false, galleryOpen: false });
    const d3 = updateDelay({ now: 1000, turnStartedAt: 900, reducedMotion: true, galleryOpen: false });
    const d4 = updateDelay({ now: 1000, turnStartedAt: 1000, reducedMotion: false, galleryOpen: true });
    const d5 = updateDelay({ now: 1000, turnStartedAt: 5000, reducedMotion: false, galleryOpen: false });
    check("gesto en curso → espera ≤ 0,38 s", d1 === PAGE_TURN_MS && d2 === 80 && d5 <= PAGE_TURN_MS, `${d1} ${d2} ${d5}`);
    check("menos movimiento o galería → 0 s", d3 === 0 && d4 === 0);
  }

  section("T10 · medición correlacionada");
  {
    const home = new HomeMeter("tok");
    const r1 = new ReaderMeter("L1", "tok");
    const r2 = new ReaderMeter("L2", "tok");
    r1.onPaint("A", 10);
    r2.onPaint("A", 10);
    home.onPresence(r1.presence(), 100);
    home.onPresence(r2.presence(), 100);
    // Ensayo 1, normal: guarda en 1000, pintan después.
    const t1 = home.saved({ trial: "e1", label: "edición", fingerprint: "B", tStart: 900, tSaved: 1000 });
    check("ensayo espera a los dos lectores", home.busy() && t1.catalog === "tok");
    const a = [...r1.onTrial(t1), ...r1.onPaint("B", 1400)];
    const b = [...r2.onTrial(t1), ...r2.onPaint("B", 1650)];
    a.concat(b).forEach((m) => home.onResult(m));
    check("dos resultados independientes", home.rows[0].done && (home.rows[0].results.L1 as { latencyMs: number }).latencyMs === 400 && (home.rows[0].results.L2 as { latencyMs: number }).latencyMs === 650);
    // Ensayo 2: el SSE gana — el lector pinta ANTES de que llegue la confirmación.
    const p1 = r1.onPaint("C", 1900);
    const p2 = r2.onPaint("C", 2100);
    check("pintado antes del ensayo → se guarda, no se descarta", p1.length === 0 && p2.length === 0);
    const t2 = home.saved({ trial: "e2", label: "alta", fingerprint: "C", tStart: 1800, tSaved: 2000 });
    const res2 = [...r1.onTrial(t2), ...r2.onTrial(t2)];
    res2.forEach((m) => home.onResult(m));
    check("se empareja al llegar el ensayo; ≤ 0 s anotado tal cual", res2.length === 2 && res2[0].latencyMs === -100 && formatLatency(res2[0].latencyMs) === "≤ 0 s" && res2[1].latencyMs === 100);
    // Ensayo 3: vuelve a A (A → B → C → A). La pintura vieja de A (t=10) no vale.
    const t3 = home.saved({ trial: "e3", label: "deshacer", fingerprint: "A", tStart: 3000, tSaved: 3100 });
    const stale = r1.onTrial(t3);
    check("A → B → A: no reutiliza la pintura vieja de A", stale.length === 0);
    const fresh = r1.onPaint("A", 3300);
    check("se empareja con la pintura nueva de A", fresh.length === 1 && fresh[0].latencyMs === 200);
    fresh.forEach((m) => home.onResult(m));
    // L2 se salta A y pinta directamente una versión posterior D.
    const later = [...r2.onTrial(t3), ...r2.onPaint("D", 3500)];
    check("una versión posterior no se mide como la de un ensayo anterior", later.length === 0);
    home.tick(3100 + 5001);
    check("lector sin respuesta en 5 s → fallo", home.rows[2].results.L2 === "missing" && !home.busy());
    // Resultado repetido o de otro catálogo: se ignora.
    check("resultado duplicado ignorado", home.onResult(res2[0]) === false);
    check("resultado de otro catálogo ignorado", home.onResult({ ...res2[0], catalog: "otro", trial: "e2" }) === false);
    const s = home.summary();
    check("resumen: fallo contado, no aprueba", s.failures === 1 && s.pass === false && s.results === 5 && s.maxMs === 650);
    check("CSV con una fila por lector y ensayo", home.csv().split("\n").length === 1 + 6 && /fallo: sin respuesta/.test(home.csv()));
    // Ampliación X9: un guardado sin cambio público se anota aparte y no cuenta.
    const before = home.summary();
    const none = home.saved({ trial: "e4", label: "anuncio", fingerprint: "D", tStart: 9000, tSaved: 9100, changed: false });
    const after = home.summary();
    check("sin cambio público: no se publica ensayo ni se espera a los lectores", none === null && !home.busy());
    check("sin cambio público: no cuenta como acierto ni como fallo", after.trials === before.trials && after.failures === before.failures && after.results === before.results && after.unchanged === 1);
    check("CSV marca «sin cambio público (no cuenta)»", /sin cambio público \(no cuenta\)/.test(home.csv()));
  }
  {
    const home = new HomeMeter("tok");
    const readers = [new ReaderMeter("L1", "tok"), new ReaderMeter("L2", "tok")];
    readers.forEach((r) => home.onPresence(r.presence(), 0));
    for (let i = 0; i < 20; i++) {
      const fp = `F${i}`;
      readers.forEach((r) => home.onPresence(r.presence(), i * 10_000));
      const t = home.saved({ trial: `e${i}`, label: "x", fingerprint: fp, tStart: i * 10_000, tSaved: i * 10_000 + 100 });
      readers.forEach((r, j) => [...r.onTrial(t), ...r.onPaint(fp, i * 10_000 + 600 + j * 300)].forEach((m) => home.onResult(m)));
    }
    const s = home.summary();
    check("20 ensayos × 2 lectores ≤ 2 s → aprueba", s.pass && s.results === 40 && s.maxMs === 800, JSON.stringify(s));
    // Camino del vigilante («sin aviso inmediato») se cuenta igual y se marca.
    const hw = new HomeMeter("tok");
    readers.forEach((r) => hw.onPresence(r.presence(), 300_000));
    const tw = hw.saved({ trial: "w1", label: "orden", fingerprint: "W1", tStart: 300_000, tSaved: 300_050, watcherPath: true });
    readers.forEach((r, j) => [...r.onTrial(tw!), ...r.onPaint("W1", 300_400 + j * 50)].forEach((m) => hw.onResult(m)));
    const sw = hw.summary();
    check("camino del vigilante: cuenta como ensayo y se marca", sw.trials === 1 && sw.watcherTrials === 1 && sw.results === 2 && /,vigilante,/.test(hw.csv()));
    const home2 = new HomeMeter("tok");
    home2.onPresence(readers[0].presence(), 0);
    home2.saved({ trial: "x", label: "x", fingerprint: "Z", tStart: 0, tSaved: 1 });
    check("con un solo lector presente el ensayo cuenta un fallo", home2.summary().failures >= 1);
    const late = new HomeMeter("tok");
    readers.forEach((r) => late.onPresence(r.presence(), 0));
    late.saved({ trial: "y", label: "y", fingerprint: "Y", tStart: 0, tSaved: 0 });
    late.onResult({ type: "result", trial: "y", catalog: "tok", reader: "L1", fingerprint: "Y", tPainted: 2500, latencyMs: 2500 });
    check("> 2 s cuenta como fallo", late.summary().failures >= 1);
    const wrongFp = late.onResult({ type: "result", trial: "y", catalog: "tok", reader: "L2", fingerprint: "OTRA", tPainted: 10, latencyMs: 10 });
    check("resultado con otra huella para ese ensayo se rechaza", wrongFp === false);
    void ({} as TrialMsg);
  }
}

async function main() {
  section("T6 · contrato público y privacidad");
  {
    const cat = toPublicCatalog(snap([item()]));
    const json = JSON.stringify(cat);
    const forbidden = findForbiddenKeys(cat, FORBIDDEN_PUBLIC_KEYS);
    check("ninguna clave prohibida", forbidden.length === 0, forbidden.join(", "));
    check("ningún UUID", !UUID_RE.test(json));
    check("ninguna URL de almacenamiento", !/supabase|storage\/v1|properties-photos/i.test(json));
    check("sin hash de URL de foto", !json.includes(md5("https://x.supabase.co/storage/v1/object/public/properties-photos/a.webp")));
    check("sin descripción de portal (teléfono ajeno)", !json.includes("600 123 456") && !json.includes("Inmobiliaria Sol"));
    check("sin características de portal", !json.includes("agencia@ejemplo.com") && cat.items[0].features.length === 0);
    check("descripción omitida sin caché", cat.items[0].description === null);
    check("contacto del catálogo, no del perfil", cat.preparedBy === "Laura Méndez" && !json.includes("Perfil Del Dueño"));
    check("teléfono del catálogo formateado", cat.phone === "+34 600 111 222" && cat.phoneHref === "tel:+34600111222");
    check("asesora", cat.role === "asesora");
    check("edición", cat.edition === "Otoño 2026", cat.edition);
    check("lugar", cat.items[0].place === "Chamberí, Madrid");
    check("precio", cat.items[0].price === "1.450.000 €", cat.items[0].price);
    check("planta sin ordinal desde features", cat.items[0].floor === "Planta 7", cat.items[0].floor);
    check("fotos por el proxy", cat.items[0].photos.map((p) => p.src).join() === "/p/piso-almagro-12/0.webp,/p/piso-almagro-12/1.webp");
    check("orientaciones", cat.items[0].photos.map((p) => p.orientation).join() === "landscape,portrait");
    check("portada = foto marcada", cat.items[0].coverIndex === 1 && cat.coverPhoto === "/p/piso-almagro-12/1.webp");
    check("clave pública conservada", cat.items[0].key === "k1AbCdEfGhIj");
  }
  {
    const src = clientDescriptionSrc(RAW_DESC, RAW_FEATURES);
    const ok = toPublicCatalog(
      snap([item({ clean: { src, description: "Precioso piso reformado.", features: ["Planta 7 exterior", "Ascensor", " "] } })]),
    );
    check("caché vigente → descripción limpia", ok.items[0].description === "Precioso piso reformado.");
    check("caché vigente → características limpias sin vacíos", ok.items[0].features.join("|") === "Planta 7 exterior|Ascensor");
    const stale = toPublicCatalog(
      snap([item({ description: RAW_DESC + " Nuevo texto.", clean: { src, description: "Antiguo", features: ["X"] } })]),
    );
    check("caché desfasada → nada de texto", stale.items[0].description === null && stale.items[0].features.length === 0);
    const expectedSrc = md5(RAW_DESC.trim() + "\u0000" + RAW_FEATURES.filter((f) => f.trim()).join("\u0001"));
    check("hash igual que client-description.ts", src === expectedSrc);
  }
  {
    const c = toPublicCatalog(
      snap([
        item({ key: "a", status: "reserved" }),
        item({ key: "b", status: "sold" }),
        item({ key: "c", status: "archived" }),
      ]),
    );
    check("reservada aparece con marca", c.items.length === 1 && c.items[0].reserved === true);
    check("vendida y archivada no aparecen", !c.items.some((i) => i.key === "b" || i.key === "c"));
  }
  {
    const c = toPublicCatalog(
      snap([
        item({
          price: null,
          operation: "rent",
          bedrooms: null,
          square_meters: "0",
          features: [],
          title: "Estudio",
          description: null,
          photos: [
            { u: "x", w: null, h: null, c: null },
            { u: "x", w: 800, h: 800, c: null },
            { u: "y", w: 800, h: 790, c: null },
          ],
        }),
      ]),
    );
    const it = c.items[0];
    check("precio sin dato", it.price === "Precio · sin dato");
    check("planta sin dato", it.floor === "Planta · sin dato");
    check("m² 0 → sin dato", it.squareMeters === null && it.bedrooms === null);
    check("fotos repetidas se cuentan una vez (como el proxy)", it.photos.length === 2 && it.photos[1].src.endsWith("/1.webp"));
    check("sin medidas → unknown; casi cuadrada → square", it.photos[0].orientation === "unknown" && it.photos[1].orientation === "square");
    check("portada por defecto 0", it.coverIndex === 0);
  }
  {
    const c = toPublicCatalog(snap([item({ floor_override: "atico" }), item({ key: "z", floor_override: "0" })]));
    check("ático", c.items[0].floor === "Ático", c.items[0].floor);
    check("planta 0 → Planta baja", c.items[1].floor === "Planta baja", c.items[1].floor);
    const dual = toPublicCatalog(snap([item({ operations: ["sale", "rent"], rent_price: 4800 })]));
    check("venta y alquiler", dual.items[0].price === "Venta 1.450.000 € · Alquiler 4.800 €/mes", dual.items[0].price);
    const empty = toPublicCatalog(snap([], { intro: "  " }));
    check("catálogo vacío", empty.items.length === 0 && empty.coverPhoto === null && empty.intro === null);
    const slugHostile = toPublicCatalog(snap([item({ slug: "a/b?c" })]));
    check("slug escapado en la ruta de foto", slugHostile.items[0].photos[0].src === "/p/a%2Fb%3Fc/0.webp");
  }
  {
    // Una instantánea interna con campos que NO están en la lista blanca no
    // los arrastra (p. ej. si alguien amplía la función SQL).
    const extra = item() as InternalItem & Record<string, unknown>;
    extra.bc_reference = "BC-1234";
    extra.id = "4f1c2d1e-0000-4000-8000-000000000001";
    extra.notes = "nota interna";
    const c = toPublicCatalog(snap([extra]));
    const json = JSON.stringify(c);
    check("campos internos nuevos no se cuelan", !json.includes("BC-1234") && !json.includes("nota interna") && !UUID_RE.test(json));
  }

  await liveTests();

  console.log(`\n${failures === 0 ? "✅ Todo en verde" : `❌ ${failures} fallo(s)`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
