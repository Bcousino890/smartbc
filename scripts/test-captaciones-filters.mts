/**
 * Lectura de los filtros de Captaciones (lista y mapa comparten `parseParticularesParams`) y resumen del
 * encargo del cliente (`describeBrief`). Ejecutar: node_modules/.bin/jiti scripts/test-captaciones-filters.mts
 */
import { parseParticularesParams, resolveZoneNames } from "../lib/particulares/filters-from-params";
import { describeBrief } from "../lib/captaciones-map/brief-view";
import { EMPTY_BRIEF } from "../lib/clients/brief";

let ok = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) ok++;
  else {
    fail++;
    console.log(`  ✗ ${name}`, got === undefined ? "" : JSON.stringify(got));
  }
}

console.log("── parseParticularesParams ──");
const empty = parseParticularesParams({});
check("sin parámetros → solo particulares", empty.advertiserFilter === "particular", empty.advertiserFilter);
check("sin parámetros → activos, página 1", !empty.showRetired && empty.page === 1);
check("advertiser=all → todos", parseParticularesParams({ advertiser: "all" }).advertiserFilter === "");
check("advertiser=professional → agencias", parseParticularesParams({ advertiser: "professional" }).advertiserFilter === "professional");
check("advertiser inválido → particular", parseParticularesParams({ advertiser: "zzz" }).advertiserFilter === "particular");
const search = parseParticularesParams({ q: "serrano" });
check("buscar sin anunciante explícito → todos los anunciantes y estados", search.advertiserFilter === "" && search.searchAllStates);
check("buscar con soloFiltros=1 → respeta anunciante", parseParticularesParams({ q: "x", soloFiltros: "1" }).advertiserFilter === "particular");
check("con agencia elegida y sin anunciante → todos", parseParticularesParams({ agencia: "engel" }).advertiserFilter === "");
check("drop=0 es válido (cualquier bajada)", parseParticularesParams({ drop: "0" }).filters.priceDropMinPct === 0);
check("sin drop → undefined", parseParticularesParams({}).filters.priceDropMinPct === undefined);
check("priceMax numérico", parseParticularesParams({ priceMax: "7500" }).filters.priceMax === 7500);
check("priceMax basura → undefined", parseParticularesParams({ priceMax: "abc" }).filters.priceMax === undefined);
check("operation solo rent/sale", parseParticularesParams({ operation: "rent" }).filters.operation === "rent" && parseParticularesParams({ operation: "x" }).filters.operation === "");
check("alquiler larga/temporada", parseParticularesParams({ alquiler: "temporada" }).filters.rentalKind === "temporada");
check("estados en csv", JSON.stringify(parseParticularesParams({ estado: "buen,reformar" }).filters.condition) === '["buen","reformar"]');
check("portal inseguro se descarta", parseParticularesParams({ portal: "a b;c" }).filters.portal === undefined);
check("portal válido en minúsculas", parseParticularesParams({ portal: "Idealista" }).filters.portal === "idealista");
check("zonePoly corrupto → sin polígonos", parseParticularesParams({ zonePoly: "{no-json" }).drawnPolygons.length === 0);
check("usuario actual para «mis anuncios»", parseParticularesParams({ gestion: "mine" }, "u1").filters.currentUserId === "u1");
check("retired y fuera_zona", (() => { const p = parseParticularesParams({ retired: "1", fuera_zona: "1" }); return p.showRetired && p.showOutOfZone; })());
check("array de valores → el primero", parseParticularesParams({ operation: ["sale", "rent"] }).filters.operation === "sale");

console.log("── resolveZoneNames ──");
const groups = [{ district: "Salamanca", zones: [{ name: "Lista" }, { name: "Goya" }] }, { district: "Chamberí", zones: [{ name: "Trafalgar" }] }];
check("sin selección → undefined", resolveZoneNames([], groups) === undefined);
check("distrito → sus barrios", JSON.stringify(resolveZoneNames(["d:Salamanca"], groups)) === '["Lista","Goya"]');
check("barrio exacto", JSON.stringify(resolveZoneNames(["z:Trafalgar"], groups)) === '["Trafalgar"]');
check("legado sin prefijo", JSON.stringify(resolveZoneNames(["Goya"], groups)) === '["Goya"]');
check("varias selecciones sin repetir", JSON.stringify(resolveZoneNames(["d:Salamanca", "z:Lista"], groups)) === '["Lista","Goya"]');
check("distrito inexistente → [] (cero resultados)", JSON.stringify(resolveZoneNames(["d:Nada"], groups)) === "[]");

console.log("── describeBrief ──");
const items = describeBrief({
  ...EMPTY_BRIEF,
  operation: "rent",
  maxPrice: 7500,
  minBedrooms: 3,
  zones: ["Salamanca"],
  subzones: ["Recoletos"],
  mustHave: ["lift"] as never,
});
const get = (l: string) => items.find((i) => i.label === l)?.value;
check("operación", get("Operación") === "Alquiler");
check("presupuesto con punto de miles", get("Presupuesto") === "hasta 7.500 €/mes", get("Presupuesto"));
check("dormitorios", get("Dormitorios") === "3 o más dorm.", get("Dormitorios"));
check("zonas y barrios", get("Zonas") === "Salamanca, Recoletos", get("Zonas"));
check("no pinta campos vacíos", !items.some((i) => i.label === "Notas" || i.label === "Baños"));
const sale = describeBrief({ ...EMPTY_BRIEF, operation: "sale", minPrice: 300000, maxPrice: 450000, maxPriceFlexPct: 10 });
check("venta con margen", sale.find((i) => i.label === "Presupuesto")?.value === "300.000 € – 450.000 € (con un 10 % de margen)", sale.find((i) => i.label === "Presupuesto"));

console.log(`\n${ok}/${ok + fail} tests OK${fail ? ` — ${fail} FALLIDOS` : ""}`);
process.exit(fail ? 1 : 0);
