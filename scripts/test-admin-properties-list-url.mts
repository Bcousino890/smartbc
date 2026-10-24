// Contrato de navegación de la lista de Propiedades (CRM-01):
// lib/properties/admin-list-url.ts.
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-admin-properties-list-url.mts
import assert from "node:assert/strict";
import {
  buildListSearch,
  listReturnHref,
  rowAnchorId,
  sanitizeListQuery,
  withReturnContext,
  type ListUrlState,
} from "../lib/properties/admin-list-url.ts";

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✅ ${name}`);
};

const EMPTY: ListUrlState = {
  query: "", tagFilter: [], operationFilter: "", statusFilter: "", zoneFilter: "", subzoneFilter: "",
  agencyFilter: "", stayFilter: "", bedroomsFilter: "", bathroomsFilter: "", floorFilter: "",
  minPrice: "", maxPrice: "", minM2: "", maxM2: "", page: 1,
};

console.log("buildListSearch");
t("sin filtros ni página: consulta vacía", () => assert.equal(buildListSearch(EMPTY), ""));
t("filtros, etiquetas y página", () =>
  assert.equal(
    buildListSearch({ ...EMPTY, operationFilter: "alquiler", zoneFilter: "Salamanca", tagFilter: ["a", "b"], page: 2 }),
    "etiquetas=a%2Cb&operacion=alquiler&distrito=Salamanca&pagina=2",
  ));
t("página 1 no se escribe", () => assert.equal(buildListSearch({ ...EMPTY, page: 1, query: "goya" }), "q=goya"));
t("conserva lo que la lista no maneja (archivadas)", () =>
  assert.equal(buildListSearch({ ...EMPTY, operationFilter: "venta" }, "archivadas=1"), "archivadas=1&operacion=venta"));
t("un filtro vaciado se borra de la base", () =>
  assert.equal(buildListSearch(EMPTY, "operacion=venta&pagina=3&archivadas=1"), "archivadas=1"));

console.log("sanitizeListQuery");
t("vacío o null → vacío", () => {
  assert.equal(sanitizeListQuery(""), "");
  assert.equal(sanitizeListQuery(null), "");
  assert.equal(sanitizeListQuery(undefined), "");
});
t("conserva claves conocidas en orden canónico", () =>
  assert.equal(sanitizeListQuery("pagina=2&distrito=Salamanca&operacion=alquiler"), "operacion=alquiler&distrito=Salamanca&pagina=2"));
t("acepta un «?» inicial", () => assert.equal(sanitizeListQuery("?q=goya"), "q=goya"));
t("descarta claves desconocidas", () => assert.equal(sanitizeListQuery("redirect=https://evil.example&next=//evil&q=x"), "q=x"));
t("descarta valores enormes", () => assert.equal(sanitizeListQuery(`q=${"x".repeat(201)}&operacion=venta`), "operacion=venta"));
t("pagina solo entero ≥ 2", () => {
  assert.equal(sanitizeListQuery("pagina=1"), "");
  assert.equal(sanitizeListQuery("pagina=0"), "");
  assert.equal(sanitizeListQuery("pagina=-3"), "");
  assert.equal(sanitizeListQuery("pagina=2.5"), "");
  assert.equal(sanitizeListQuery("pagina=abc"), "");
  assert.equal(sanitizeListQuery("pagina=4"), "pagina=4");
});
t("archivadas solo «1»", () => {
  assert.equal(sanitizeListQuery("archivadas=0"), "");
  assert.equal(sanitizeListQuery("archivadas=true"), "");
  assert.equal(sanitizeListQuery("archivadas=1"), "archivadas=1");
});
t("primera aparición de una clave repetida", () => assert.equal(sanitizeListQuery("q=a&q=b"), "q=a"));
t("valores con espacios y tildes se conservan", () =>
  assert.equal(new URLSearchParams(sanitizeListQuery("distrito=Chamber%C3%AD&q=calle+de+goya")).get("distrito"), "Chamberí"));
t("mayúsculas en la clave no cuentan como la clave", () => assert.equal(sanitizeListQuery("Operacion=venta&OPERACION=venta"), ""));

console.log("listReturnHref (destino de «Volver»)");
t("con volver: lista del país + consulta + ancla", () =>
  assert.equal(listReturnHref("/es/admin", "operacion=alquiler&pagina=2", "piso-1"), "/es/admin/propiedades?operacion=alquiler&pagina=2#propiedad-piso-1"));
t("sin volver: lista sin filtros (salida segura)", () => assert.equal(listReturnHref("/es/admin", null, "piso-1"), "/es/admin/propiedades#propiedad-piso-1"));
t("sin slug: sin ancla", () => assert.equal(listReturnHref("/cl/admin", "q=x"), "/cl/admin/propiedades?q=x"));
for (const evil of [
  "//evil.example/propiedades",
  "https://evil.example/",
  "javascript:alert(1)",
  "/cl/admin/propiedades?q=x",
  "%2F%2Fevil.example",
  "q=x#evil",
  "\\\\evil.example",
]) {
  t(`un volver manipulado no cambia la ruta: ${evil}`, () => {
    const href = listReturnHref("/es/admin", evil, "piso-1");
    assert.ok(href.startsWith("/es/admin/propiedades"), href);
    assert.ok(!href.startsWith("//"), href);
    const u = new URL(href, "https://crm.example");
    assert.equal(u.origin, "https://crm.example");
    assert.equal(u.pathname, "/es/admin/propiedades");
    assert.equal(u.hash, "#propiedad-piso-1");
  });
}
t("doble codificación no se interpreta dos veces", () =>
  assert.equal(listReturnHref("/es/admin", "q%3Dx%26operacion%3Dventa"), "/es/admin/propiedades"));

console.log("withReturnContext (enlace de la fila)");
t("sin consulta: enlace limpio", () => assert.equal(withReturnContext("/es/admin/propiedades/piso-1", ""), "/es/admin/propiedades/piso-1"));
t("con consulta: ?volver= codificado", () =>
  assert.equal(withReturnContext("/es/admin/propiedades/piso-1", "operacion=alquiler&pagina=2"), "/es/admin/propiedades/piso-1?volver=operacion%3Dalquiler%26pagina%3D2"));
t("ida y vuelta: lo que lleva la fila es lo que reconstruye «Volver»", () => {
  const search = buildListSearch({ ...EMPTY, operationFilter: "alquiler", zoneFilter: "Chamberí", query: "ático luminoso", tagFilter: ["t1"], page: 3 }, "archivadas=1");
  const href = withReturnContext("/es/admin/propiedades/piso-1", search);
  const volver = new URL(href, "https://crm.example").searchParams.get("volver");
  const back = new URL(listReturnHref("/es/admin", volver, "piso-1"), "https://crm.example");
  assert.deepEqual(Object.fromEntries(back.searchParams), Object.fromEntries(new URLSearchParams(search)));
});
t("el ancla coincide con el id de la fila", () => assert.equal(listReturnHref("/es/admin", null, "piso-1").split("#")[1], rowAnchorId("piso-1")));

console.log("Trayecto con la story: lista → ficha → story → ficha → lista");
t("la consulta llega intacta a la lista tras pasar por la story", () => {
  const search = buildListSearch({ ...EMPTY, operationFilter: "venta", zoneFilter: "Retiro", page: 4 }, "archivadas=1");
  const toDetail = new URL(withReturnContext("/es/admin/propiedades/piso-1", search), "https://crm.example");
  const v1 = toDetail.searchParams.get("volver");
  const toStory = new URL(withReturnContext("/es/admin/propiedades/piso-1/story", v1 ?? ""), "https://crm.example");
  assert.equal(toStory.pathname, "/es/admin/propiedades/piso-1/story");
  const v2 = sanitizeListQuery(toStory.searchParams.get("volver"));
  const backToDetail = new URL(withReturnContext("/es/admin/propiedades/piso-1", v2), "https://crm.example");
  assert.equal(backToDetail.pathname, "/es/admin/propiedades/piso-1");
  const back = new URL(listReturnHref("/es/admin", backToDetail.searchParams.get("volver"), "piso-1"), "https://crm.example");
  assert.deepEqual(Object.fromEntries(back.searchParams), Object.fromEntries(new URLSearchParams(search)));
  assert.equal(back.hash, "#propiedad-piso-1");
});
t("sin contexto, la story vuelve a la ficha limpia y la ficha a la lista sin filtros", () => {
  assert.equal(withReturnContext("/es/admin/propiedades/piso-1", sanitizeListQuery(null)), "/es/admin/propiedades/piso-1");
  assert.equal(listReturnHref("/es/admin", null), "/es/admin/propiedades");
});
t("un volver manipulado en la story no sobrevive a la ida y vuelta", () => {
  const v = sanitizeListQuery("redirect=//evil.example&q=x");
  assert.equal(withReturnContext("/es/admin/propiedades/piso-1", v), "/es/admin/propiedades/piso-1?volver=q%3Dx");
});
t("parámetro repetido (array desde searchParams) → vacío, sin lanzar", () =>
  assert.equal(sanitizeListQuery(["q=x", "q=y"] as unknown as string), ""));

console.log(`\n${n} comprobaciones en verde`);
