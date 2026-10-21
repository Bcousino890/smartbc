/**
 * Test del scraper de Housely Consulting (web eGO Real Estate).
 *
 * El fixture `scripts/fixtures/housely-properties.json` es la respuesta REAL de
 * `websiteapi.egorealestate.com/v1/Properties` del 2026-10-21, recortada a seis
 * inmuebles que cubren los casos raros: alquiler con `Bathrooms: 0`, venta+
 * alquiler con el alquiler a 0 €, inmueble sin título, barrio en el título,
 * m² solo en superficie útil.
 *
 * No hace red: prueba la extracción de la sesión y el mapeo eGO → RawProperty.
 *
 * Ejecutar:
 *   npm run test:housely
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  cleanHouselyDescription,
  extractHouselySession,
  houselySourceUrl,
  mapHouselyProperty,
  pickOperation,
  type EgoProperty,
} from "../lib/sync/scrapers/housely.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond
    ? (ok++, console.log(`  ✓ ${name}`))
    : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "fixtures", "housely-properties.json"), "utf8"),
) as { Properties: EgoProperty[] };
const byId = (id: number) => {
  const p = fixture.Properties.find((x) => x.ID === id);
  if (!p) throw new Error(`falta ${id} en el fixture`);
  return p;
};

console.log("── sesión (token + requestID del HTML) ──");
// Las dos líneas tal y como las sirve la web (copiadas de una ficha real).
const html = `<script>var WebApp=window.WebApp||[];WebApp.push({"APIToken":"2XJe75fRTaDIu/pBR1OXyhIZgS7LFsgpWmBRaFyOrWs=","applicationMetabaseID":42819});</script>
<script>var DataApi=window.DataApi||[];DataApi.push({'requestID':'427c775a-eaa2-a9264-4318b-5874428191645073510'});</script>`;
const session = extractHouselySession(html);
check("saca el APIToken", session?.token === "2XJe75fRTaDIu/pBR1OXyhIZgS7LFsgpWmBRaFyOrWs=", session);
check("saca el requestID", session?.requestId === "427c775a-eaa2-a9264-4318b-5874428191645073510", session);
check("sin requestID no hay sesión", extractHouselySession(html.split("\n")[0]) === null);

console.log("── alquiler (Velázquez, 23184627) ──");
const rent = mapHouselyProperty(byId(23184627));
check("se importa", rent !== null);
check("operación alquiler", rent?.operation === "rent", rent?.operation);
check("precio 5.500", rent?.price === 5500, rent?.price);
check("larga estancia", rent?.stay === "long", rent?.stay);
check("zona Salamanca (sin 'Barrio de')", rent?.zone === "Salamanca", rent?.zone);
check("m² de la superficie útil (144)", rent?.squareMeters === 144, rent?.squareMeters);
check("baños del texto cuando la API dice 0", rent?.bathrooms === 2, rent?.bathrooms);
check("características de eGO (ascensor, amueblado)",
  !!rent && ["Ascensor", "Amueblado", "Terraza"].every((f) => rent.features?.includes(f)),
  rent?.features);
check("fotos ZOriginal (sin marca de agua)",
  !!rent && rent.photos.length > 0 && rent.photos.every((p) => p.url.includes("/ZOriginal/")),
  rent?.photos.map((p) => p.url));
check("URL de origen = la del sitemap",
  rent?.sourceUrl === "https://www.houselyconsulting.com/inmueble/alquiler-de-piso-en-calle-velazquez/23184627",
  rent?.sourceUrl);

console.log("── descripción saneada ──");
const desc = rent?.description ?? "";
check("sin la marca", !/housely/i.test(desc), desc.slice(0, 120));
check("sin '#ref' ni teléfono oculto", !/#ref|tel[eé]fono/i.test(desc));
check("sin llamadas a contactar", !/cont[aá]ct|off-market/i.test(desc));
check("empieza por la frase del piso, capitalizada", desc.startsWith("Esta espectacular propiedad en alquiler"), desc.slice(0, 60));
check("conserva los párrafos", desc.includes("\n\n"));
check("no se come precios",
  cleanHouselyDescription("Precio de venta: 1.380.000 €. Llámanos al 919 01 75 52.") === "Precio de venta: 1.380.000 €.",
  cleanHouselyDescription("Precio de venta: 1.380.000 €. Llámanos al 919 01 75 52."));

console.log("── venta + alquiler a 0 € (25915453) ──");
check("es venta", pickOperation(byId(25915453))?.operation === "sale", pickOperation(byId(25915453)));
check("precio de venta", mapHouselyProperty(byId(25915453))?.price === 1809000);

console.log("── barrio (subzona) ──");
check("título 'Ático dúplex en Justicia' → Centro / Justicia",
  mapHouselyProperty(byId(25069068))?.zone === "Centro" && mapHouselyProperty(byId(25069068))?.subzone === "Justicia",
  [mapHouselyProperty(byId(25069068))?.zone, mapHouselyProperty(byId(25069068))?.subzone]);
check("título con Recoletos → Salamanca / Recoletos",
  mapHouselyProperty(byId(26764663))?.subzone === "Recoletos",
  mapHouselyProperty(byId(26764663))?.subzone);

console.log("── inmueble sin título (26291646) ──");
const untitled = mapHouselyProperty(byId(26291646));
check("título compuesto", untitled?.title === "Piso de 3 habitaciones en Centro", untitled?.title);
check("barrio desde 'barrio de Justicia' en el texto", untitled?.subzone === "Justicia", untitled?.subzone);
check("URL de origen = la del sitemap (slug truncado de eGO)",
  houselySourceUrl(byId(26291646)) ===
    "https://www.houselyconsulting.com/inmueble/piso-3-habitaciones-housely-consulting-presenta-esta-extraordinaria-vivienda-situada-en-el-corazon-d/26291646",
  houselySourceUrl(byId(26291646)));

console.log("── criterios de captación ──");
const base = byId(25616905);
check("alquiler de 4.950 entra", mapHouselyProperty(base)?.operation === "rent");
const cheap: EgoProperty = {
  ...base,
  PropertyBusiness: [{ BusinessID: 2, BusinessName: "Alquiler", Prices: [{ PriceValue: 2500 }] }],
};
check("alquiler por debajo de 3.000 €/mes se descarta", mapHouselyProperty(cheap) === null);
check("garaje se descarta", mapHouselyProperty({ ...base, Type: "Garaje" }) === null);
check("sin precio se descarta", mapHouselyProperty({ ...base, PropertyBusiness: [] }) === null);
check("sin fotos se descarta", mapHouselyProperty({ ...base, Images: [] }) === null);

console.log("── todo el fixture ──");
const all = fixture.Properties.map(mapHouselyProperty);
check("los 6 inmuebles reales se importan", all.every((p) => p !== null), all.map((p) => p?.externalId));
check("externalId = ID de eGO", all.every((p, i) => p?.externalId === String(fixture.Properties[i].ID)));

console.log(`\n${ok} ok, ${fail} fallos`);
if (fail > 0) process.exit(1);
