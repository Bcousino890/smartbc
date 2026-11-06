/**
 * Lógica pura de la ficha del cliente para los encargos múltiples (España):
 *  · qué encargo se enseña en el matching (`?encargo=`),
 *  · qué elemento se destaca al entrar desde un aviso (`?destacar=`),
 *  · el editor del tope de precio por dormitorios ↔ `maxPriceByBedrooms`,
 *  · qué acciones admite cada encargo (el principal no se pausa ni se cierra),
 *  · la URL al cambiar de encargo y la pestaña por defecto al llegar de un aviso.
 *
 * Ejecutar:
 *   npm run test:encargos-ui-state
 */
import {
  encargoActions,
  encargoSummary,
  hrefForEncargo,
  initialTabFor,
  parseHighlight,
  priceByBedroomsFromRows,
  priceByBedroomsToRows,
  resolveSelectedEncargo,
} from "../lib/encargos/ui-state.ts";
import { EMPTY_BRIEF } from "../lib/clients/brief.ts";
import type { Encargo } from "../lib/encargos/model.ts";

let failed = 0;
let passed = 0;
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${name}\n  esperado: ${e}\n  obtenido: ${a}`);
  }
}

const enc = (id: string, over: Partial<Encargo> = {}): Encargo => ({
  id,
  clientId: "c1",
  label: `Encargo ${id}`,
  endClientLabel: null,
  status: "active",
  isPrimary: false,
  position: 0,
  baselineAt: "",
  brief: { ...EMPTY_BRIEF },
  ...over,
});

// ─── resolveSelectedEncargo ─────────────────────────────────────────────────
const primary = enc("e1", { isPrimary: true });
const second = enc("e2", { position: 1 });
const closed = enc("e3", { position: 2, status: "closed" });
const list = [primary, second, closed];

eq("id ajeno → principal", resolveSelectedEncargo(list, "otro-cliente")?.id, "e1");
eq("param null → principal", resolveSelectedEncargo(list, null)?.id, "e1");
eq("param vacío → principal", resolveSelectedEncargo(list, "")?.id, "e1");
eq("«editar» (abre el diálogo) → principal", resolveSelectedEncargo(list, "editar")?.id, "e1");
eq("id propio → ese", resolveSelectedEncargo(list, "e2")?.id, "e2");
eq("un encargo cerrado sigue siendo seleccionable", resolveSelectedEncargo(list, "e3")?.id, "e3");
eq("sin encargos → null", resolveSelectedEncargo([], "e1"), null);
eq("sin principal marcado → el primero", resolveSelectedEncargo([second, closed], null)?.id, "e2");

// ─── parseHighlight ─────────────────────────────────────────────────────────
eq("particular:p9", parseHighlight("particular:p9"), { source: "particular", id: "p9" });
eq("property:abc-123", parseHighlight("property:abc-123"), { source: "property", id: "abc-123" });
eq("uuid", parseHighlight("property:3f1c2a9e-0b6d-4e57-9a8c-1d2e3f4a5b6c"), {
  source: "property",
  id: "3f1c2a9e-0b6d-4e57-9a8c-1d2e3f4a5b6c",
});
eq("x → null", parseHighlight("x"), null);
eq("'' → null", parseHighlight(""), null);
eq("null → null", parseHighlight(null), null);
eq("particular: → null", parseHighlight("particular:"), null);
eq("other:1 → null", parseHighlight("other:1"), null);
eq("id con caracteres raros → null", parseHighlight("property:a b"), null);
eq("dos puntos de más → null", parseHighlight("property:a:b"), null);

// ─── tope por dormitorios ───────────────────────────────────────────────────
eq("null → sin filas", priceByBedroomsToRows(null), []);
eq(
  "mapa → filas ordenadas por dormitorios",
  priceByBedroomsToRows({ "4": 6300, "3": 5200 }),
  [
    { bedrooms: "3", maxPrice: "5200" },
    { bedrooms: "4", maxPrice: "6300" },
  ],
);
eq(
  "filas → mapa",
  priceByBedroomsFromRows([
    { bedrooms: "3", maxPrice: "5200" },
    { bedrooms: "4", maxPrice: "6.300" },
  ]),
  { value: { "3": 5200, "4": 6300 }, issues: [] },
);
eq("sin filas → null", priceByBedroomsFromRows([]), { value: null, issues: [] });
eq(
  "fila vacía se ignora sin aviso",
  priceByBedroomsFromRows([{ bedrooms: "", maxPrice: "" }]),
  { value: null, issues: [] },
);
eq(
  "fila a medias no se guarda y se avisa",
  priceByBedroomsFromRows([
    { bedrooms: "3", maxPrice: "" },
    { bedrooms: "4", maxPrice: "6300" },
  ]),
  { value: { "4": 6300 }, issues: [{ row: 0, message: "Falta el importe: esta fila no se guardará." }] },
);
eq(
  "dormitorios a medias",
  priceByBedroomsFromRows([{ bedrooms: "", maxPrice: "5000" }]),
  { value: null, issues: [{ row: 0, message: "Faltan los dormitorios: esta fila no se guardará." }] },
);
eq(
  "dormitorios 0 no valen",
  priceByBedroomsFromRows([{ bedrooms: "0", maxPrice: "5000" }]),
  { value: null, issues: [{ row: 0, message: "Los dormitorios van de 1 a 20: esta fila no se guardará." }] },
);
eq(
  "dormitorios repetidos: manda la primera",
  priceByBedroomsFromRows([
    { bedrooms: "3", maxPrice: "5200" },
    { bedrooms: "3", maxPrice: "9000" },
  ]),
  { value: { "3": 5200 }, issues: [{ row: 1, message: "3 dormitorios ya tiene tope: esta fila no se guardará." }] },
);
eq(
  "importe 0 no vale",
  priceByBedroomsFromRows([{ bedrooms: "2", maxPrice: "0" }]),
  { value: null, issues: [{ row: 0, message: "El importe tiene que ser mayor que 0: esta fila no se guardará." }] },
);
eq(
  "ida y vuelta",
  priceByBedroomsFromRows(priceByBedroomsToRows({ "1": 900, "2": 1200 })).value,
  { "1": 900, "2": 1200 },
);

// ─── acciones por encargo ───────────────────────────────────────────────────
eq("principal: ni pausa ni cierre", encargoActions(primary), {
  canPause: false,
  canClose: false,
  canReactivate: false,
  canMakePrimary: false,
  lockedReason: "Es el encargo principal: para pausarlo o cerrarlo, haz principal otro antes.",
});
eq("secundario activo", encargoActions(second), {
  canPause: true,
  canClose: true,
  canReactivate: false,
  canMakePrimary: true,
  lockedReason: null,
});
eq("cerrado: reactivar, no principal", encargoActions(closed), {
  canPause: false,
  canClose: false,
  canReactivate: true,
  canMakePrimary: false,
  lockedReason: null,
});
eq("en pausa: reactivar o cerrar", encargoActions(enc("e4", { status: "paused" })), {
  canPause: false,
  canClose: true,
  canReactivate: true,
  canMakePrimary: false,
  lockedReason: null,
});

// ─── URL al cambiar de encargo ──────────────────────────────────────────────
eq(
  "cambia encargo, conserva la pestaña y quita destacar",
  hrefForEncargo("tab=properties&encargo=e1&destacar=property:x", "e2"),
  "?tab=properties&encargo=e2",
);
eq("sin nada previo", hrefForEncargo("", "e2"), "?encargo=e2");

// ─── pestaña al llegar de un aviso ──────────────────────────────────────────
eq("aviso sin tab → propiedades", initialTabFor(new URLSearchParams("encargo=e2&destacar=particular:p9")), "properties");
eq("solo encargo → propiedades", initialTabFor(new URLSearchParams("encargo=e2")), "properties");
eq("encargo=editar → resumen", initialTabFor(new URLSearchParams("encargo=editar")), "overview");
eq("tab explícita manda", initialTabFor(new URLSearchParams("tab=viewings&encargo=e2")), "viewings");
eq("nada → resumen", initialTabFor(new URLSearchParams("")), "overview");

// ─── resumen de una línea ───────────────────────────────────────────────────
eq(
  "resumen con tope por dormitorios",
  encargoSummary({
    ...EMPTY_BRIEF,
    operation: "rent",
    zones: ["Retiro"],
    subzones: ["Jerónimos"],
    maxPrice: 5900,
    minBedrooms: 3,
    maxBedrooms: 4,
    maxPriceByBedrooms: { "4": 6300, "3": 5200 },
  }),
  "Alquiler · hasta 5.900 €/mes · 3–4 dorm. · Retiro, Jerónimos · tope: 3 dorm. 5.200 €/mes, 4 dorm. 6.300 €/mes",
);
eq("resumen vacío", encargoSummary({ ...EMPTY_BRIEF, operation: "sale" }), "Venta");

console.log(`\n${passed} OK, ${failed} fallos`);
if (failed) process.exit(1);
