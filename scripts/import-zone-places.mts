// Importación del catálogo COMPLETO de lugares de Madrid (0154).
//
// Fuente: OpenStreetMap vía Overpass API. Es una importación de UNA VEZ (y
// refrescable con el mismo script): una decena de consultas con pausa entre
// ellas, no un uso continuo — dentro del fair use de Overpass. El resultado
// vive en `zone_places` y de ahí en adelante la búsqueda es contra NUESTRA
// base, sin políticas de terceros.
//
// Se importa la Comunidad de Madrid entera, solo elementos CON nombre.
//
// Uso (VPS): node scripts/import-places.bundle.cjs [--confirm]

import { createAdminClient } from "../lib/db/admin";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "smartbc-portal/1.0 (contacto@bcousinoprop.com)";
// Área administrativa de la Comunidad de Madrid en Overpass:
// relation 349055 → área 3600349055.
const MADRID_AREA = "3600349055";
const PAUSE_MS = 8000;

/** Cada lote es una categoría de la casa con sus etiquetas OSM. */
const BATCHES: Array<{ category: string; selector: string }> = [
  { category: "educacion", selector: '(nwr["amenity"~"^(university|college)$"](area.a); nwr["amenity"="school"](area.a););' },
  // El etiquetado moderno de OSM usa healthcare=* y algunos centros ya no
  // llevan amenity: se piden las dos familias (el upsert deduplica).
  { category: "salud", selector: '(nwr["amenity"~"^(hospital|clinic)$"](area.a); nwr["healthcare"~"^(hospital|clinic)$"](area.a););' },
  { category: "gastronomia", selector: 'nwr["amenity"~"^(restaurant|cafe|bar)$"](area.a);' },
  { category: "compras", selector: '(nwr["shop"~"^(mall|department_store)$"](area.a); nwr["amenity"="marketplace"](area.a););' },
  { category: "cultura", selector: '(nwr["tourism"~"^(museum|gallery|attraction)$"](area.a); nwr["amenity"~"^(theatre|cinema)$"](area.a); nwr["historic"~"^(monument|memorial|castle)$"](area.a););' },
  { category: "transporte", selector: '(nwr["railway"="station"](area.a); nwr["amenity"="bus_station"](area.a););' },
  { category: "deporte", selector: 'nwr["leisure"~"^(sports_centre|fitness_centre|stadium)$"](area.a);' },
  { category: "parque", selector: 'nwr["leisure"="park"]["name"](area.a);' },
];

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

async function fetchBatch(selector: string): Promise<OverpassElement[]> {
  const query = `[out:json][timeout:180];area(${MADRID_AREA})->.a;(${selector});out center tags;`;
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(200_000),
  });
  if (!res.ok) throw new Error(`overpass_${res.status}`);
  const json = (await res.json()) as { elements: OverpassElement[] };
  return json.elements ?? [];
}

function addressOf(tags: Record<string, string>): string | null {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  const city = tags["addr:city"];
  return [street || null, city].filter(Boolean).join(", ") || null;
}

async function main() {
  const CONFIRM = process.argv.includes("--confirm");
  if (!CONFIRM) console.log("[places] sin --confirm → DRY-RUN (cuenta, no escribe)");
  const db = createAdminClient() as any;

  let total = 0;
  for (const batch of BATCHES) {
    let elements: OverpassElement[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        elements = await fetchBatch(batch.selector);
        break;
      } catch (e: any) {
        console.log(`  reintento ${batch.category}: ${e?.message}`);
        await new Promise((r) => setTimeout(r, 30_000));
      }
    }
    const rows = elements
      .filter((e) => e.tags?.name)
      .map((e) => ({
        osm_ref: `${e.type}/${e.id}`,
        name: e.tags!.name!.slice(0, 200),
        name_folded: fold(e.tags!.name!).slice(0, 200),
        category: batch.category,
        lat: e.lat ?? e.center?.lat,
        lng: e.lon ?? e.center?.lon,
        address: addressOf(e.tags!),
      }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
    console.log(`  ${batch.category.padEnd(12)} ${rows.length} lugares con nombre`);
    total += rows.length;
    if (CONFIRM) {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db
          .from("zone_places")
          .upsert(rows.slice(i, i + 500), { onConflict: "osm_ref" });
        if (error) console.log(`  ✗ upsert: ${error.message}`);
      }
    }
    // Pausa entre lotes: Overpass es de uso justo, no un grifo.
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  console.log(`\n[places] total: ${total}`);
  process.exit(0);
}

void main();
