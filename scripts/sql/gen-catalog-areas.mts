// Genera las filas de catalog_areas (0220) desde lib/catalogs/areas.ts.
// Uso: node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/sql/gen-catalog-areas.mts
import { areaRows } from "../../lib/catalogs/areas.ts";
const q = (s: string | null) => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const rows = areaRows().map((r) => `  (${q(r.id)}, ${q(r.level)}, ${q(r.name)}, ${q(r.district_id)}, ${q(r.official_id)}, ARRAY[${r.terms.map(q).join(", ")}]::text[])`);
console.log(`INSERT INTO catalog_areas (id, level, name, district_id, official_id, terms) VALUES\n${rows.join(",\n")}\nON CONFLICT (id) DO UPDATE SET level = EXCLUDED.level, name = EXCLUDED.name, district_id = EXCLUDED.district_id, official_id = EXCLUDED.official_id, terms = EXCLUDED.terms;`);
