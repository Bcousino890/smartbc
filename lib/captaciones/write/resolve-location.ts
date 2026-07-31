import "server-only";
import { createAdminClient } from "@/lib/db/admin";

/**
 * Normaliza región y comuna contra las tablas maestras de Chile
 * (chile_regions / chile_communes, migración 0049).
 *
 * `captaciones.region` y `captaciones.commune` son TEXT, no claves ajenas, así
 * que sin esto cada proveedor guardaría su propia grafía ("Las Condes", "LAS
 * CONDES", "las condes") y los filtros del panel se romperían. Aquí se pasa el
 * texto recibido a la forma canónica del maestro; si no hay coincidencia se
 * conserva lo que mandó el proveedor y se devuelve un aviso, para no perder
 * dato por ser estrictos.
 */

type MasterData = { regions: Map<string, string>; communes: Map<string, string> };

let cache: { data: MasterData; loadedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

/** Clave de comparación: sin tildes, sin dobles espacios, en minúsculas. */
export function locationKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function loadMasterData(): Promise<MasterData> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.data;

  const regions = new Map<string, string>();
  const communes = new Map<string, string>();

  try {
    const db = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyDb = db as any;

    const [{ data: regionRows }, { data: communeRows }] = await Promise.all([
      anyDb.from("chile_regions").select("code, name, full_name"),
      anyDb.from("chile_communes").select("name"),
    ]);

    for (const row of regionRows ?? []) {
      if (row.name) regions.set(locationKey(row.name), row.name);
      if (row.code) regions.set(locationKey(row.code), row.name);
      if (row.full_name) regions.set(locationKey(row.full_name), row.name);
    }
    for (const row of communeRows ?? []) {
      if (row.name) communes.set(locationKey(row.name), row.name);
    }
  } catch (err) {
    // Sin maestro (migración pendiente) se pasa el texto tal cual.
    console.error("[resolve-location] no se pudo cargar el maestro", err);
  }

  const data = { regions, communes };
  cache = { data, loadedAt: Date.now() };
  return data;
}

export type ResolvedLocation = {
  region: string | null;
  commune: string | null;
  warnings: string[];
};

export async function resolveChileLocation(input: {
  region?: string | null;
  commune?: string | null;
}): Promise<ResolvedLocation> {
  const warnings: string[] = [];
  const master = await loadMasterData();

  const rawRegion = input.region?.trim() || null;
  const rawCommune = input.commune?.trim() || null;

  let region = rawRegion;
  if (rawRegion && master.regions.size > 0) {
    const canonical = master.regions.get(locationKey(rawRegion));
    if (canonical) {
      region = canonical;
    } else {
      warnings.push(`Región "${rawRegion}" no está en el maestro de Chile; se guarda tal cual.`);
    }
  }

  let commune = rawCommune;
  if (rawCommune && master.communes.size > 0) {
    const canonical = master.communes.get(locationKey(rawCommune));
    if (canonical) {
      commune = canonical;
    } else {
      warnings.push(`Comuna "${rawCommune}" no está en el maestro de Chile; se guarda tal cual.`);
    }
  }

  return { region, commune, warnings };
}

/** Solo para tests manuales: fuerza recargar el maestro. */
export function clearLocationCache(): void {
  cache = null;
}
