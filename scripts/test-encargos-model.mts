/**
 * Tests del modelo de encargos (estado del principal y enlaces).
 * Ejecutar: node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-encargos-model.mts
 */
import { encargoFromRow, encargoLink, validateStatusChange } from "../lib/encargos/model.ts";

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

console.log("\nEstado del encargo");
{
  const a = validateStatusChange({ isPrimary: true, status: "active" }, "paused");
  check("el principal no se pausa", a.ok === false, a);
  const b = validateStatusChange({ isPrimary: true, status: "active" }, "closed");
  check("el principal no se cierra", b.ok === false, b);
  const c = validateStatusChange({ isPrimary: true, status: "active" }, "active");
  check("el principal puede seguir activo", c.ok === true, c);
  const d = validateStatusChange({ isPrimary: false, status: "active" }, "closed");
  check("un secundario se cierra", d.ok === true, d);
  const e = validateStatusChange({ isPrimary: false, status: "closed" }, "paused");
  check("un secundario se pausa", e.ok === true, e);
}

console.log("\nEnlaces");
{
  check(
    "enlace con destacado",
    encargoLink("es", "c1", "e1", { source: "particular", id: "p9" }) ===
      "/es/admin/clientes/c1?encargo=e1&destacar=particular:p9#matching",
  );
  check("enlace sin destacado", encargoLink("es", "c1", "e1") === "/es/admin/clientes/c1?encargo=e1#matching");
}

console.log("\nencargoFromRow");
{
  const e = encargoFromRow({
    id: "e1",
    client_id: "c1",
    label: "Piso 3 dorm",
    end_client_label: null,
    status: "paused",
    is_primary: false,
    position: 2,
    baseline_at: "2026-11-06T10:00:00Z",
    operation: "rent",
    max_price: 6300,
    max_price_by_bedrooms: { "3": 5200 },
  });
  check(
    "mapea columnas",
    e.id === "e1" && e.clientId === "c1" && e.status === "paused" && e.isPrimary === false && e.position === 2 && e.label === "Piso 3 dorm",
    e,
  );
  check("brief incluye tope por dormitorios", e.brief.maxPriceByBedrooms?.["3"] === 5200 && e.brief.maxPrice === 6300, e.brief);
  const bad = encargoFromRow({ id: "x", client_id: "c", status: "raro" });
  check("estado desconocido cae a active", bad.status === "active", bad.status);
}

if (failures) {
  console.log(`\n${failures} fallo(s)`);
  process.exit(1);
}
console.log("\nTodo OK");
