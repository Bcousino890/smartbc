/**
 * Tests de los catálogos de la HOME de Fabricio (BCP-01).
 *
 * Funciones puras, sin base de datos ni red: acceso del dueño, traducción de
 * errores, interpretación de referencias y guarda de los datos de prueba.
 * (Las pruebas SQL de 0192 viven en scripts/sql/ y usan un Postgres temporal.)
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-catalogs.mts
 */
import {
  isHomeCountry,
  resolveHomeAccess,
  withHomeAccess,
  type HomeAccessDeps,
} from "../lib/catalogs/access.ts";
import { catalogErrorMessage, GENERIC_ERROR } from "../lib/catalogs/errors.ts";
import {
  catalogNumberLabel,
  editionLabel,
  floorLabel,
  operationLabel,
  priceLabel,
} from "../lib/catalogs/format.ts";
import { isCatalogFixtureMode } from "../lib/catalogs/fixture-mode.ts";
import { isUuid, isValidOrder, normalizeIntro, normalizeTitle } from "../lib/catalogs/validate.ts";

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

type P = { id: string; role: string };
const OWNER: P = { id: "00000000-0000-0000-0000-0000000000f1", role: "admin" };
const STAFF: P = { id: "00000000-0000-0000-0000-0000000000a2", role: "admin" };
const CLIENT: P = { id: "00000000-0000-0000-0000-0000000000c3", role: "client" };
const OWNERS = new Set([OWNER.id]);

function deps(profile: P | null, opts: { ownerThrows?: boolean; profileThrows?: boolean } = {}): HomeAccessDeps<P> {
  return {
    getProfile: async () => {
      if (opts.profileThrows) throw new Error("boom");
      return profile;
    },
    isOwner: async (id) => {
      if (opts.ownerThrows) throw new Error("tabla inexistente");
      return OWNERS.has(id);
    },
  };
}

async function main() {
  section("Acceso a la HOME (T2)");
  {
    const r = await resolveHomeAccess(deps(OWNER));
    check("el dueño entra", r.ok === true && r.profile.id === OWNER.id);
  }
  {
    const r = await resolveHomeAccess(deps(STAFF));
    check("otro staff (aunque sea admin) → forbidden", !r.ok && r.reason === "forbidden");
  }
  {
    const r = await resolveHomeAccess(deps(CLIENT));
    check("un cliente → forbidden", !r.ok && r.reason === "forbidden");
  }
  {
    const r = await resolveHomeAccess(deps(null));
    check("sin sesión → unauthenticated", !r.ok && r.reason === "unauthenticated");
  }
  {
    const r = await resolveHomeAccess(deps(OWNER, { ownerThrows: true }));
    check("si falla la comprobación del dueño → forbidden (fallo cerrado)", !r.ok && r.reason === "forbidden");
  }
  {
    const r = await resolveHomeAccess(deps(OWNER, { profileThrows: true }));
    check("si falla la lectura del perfil → unauthenticated", !r.ok && r.reason === "unauthenticated");
  }
  {
    const r = await resolveHomeAccess<P>({ getProfile: async () => OWNER, isOwner: async () => "true" as unknown as boolean });
    check("solo vale un true estricto", !r.ok && r.reason === "forbidden");
  }

  section("Acciones: si no es el dueño, la acción ni se ejecuta");
  for (const [label, who] of [["otro staff", STAFF], ["cliente", CLIENT], ["sin sesión", null]] as const) {
    let ran = 0;
    const res = await withHomeAccess(deps(who as P | null), async () => {
      ran++;
      return { ok: true as const };
    });
    check(`${label}: acción no ejecutada y error devuelto`, ran === 0 && !res.ok);
  }
  {
    let ran = 0;
    const res = await withHomeAccess(deps(OWNER), async (p) => {
      ran++;
      return { ok: true as const, actor: p.id };
    });
    check("dueño: la acción se ejecuta una vez con su id", ran === 1 && res.ok && (res as { actor: string }).actor === OWNER.id);
  }

  section("País");
  check("es → sí", isHomeCountry("es"));
  check("cl → no (V1 solo España)", !isHomeCountry("cl"));
  check("otro → no", !isHomeCountry("fr"));

  section("Mensajes de error");
  check("forbidden", catalogErrorMessage({ message: "forbidden" }) === "No tienes acceso a este catálogo.");
  check("already_in_catalog", /ya está/.test(catalogErrorMessage({ message: "already_in_catalog" })));
  check("property_not_available", /vendida o archivada/.test(catalogErrorMessage({ message: "property_not_available" })));
  check("property_not_es", /España/.test(catalogErrorMessage({ message: "property_not_es" })));
  check("order_mismatch", /Recarga/.test(catalogErrorMessage({ message: "order_mismatch" })));
  check("CHECK del título (23514)", /título/.test(catalogErrorMessage({ code: "23514", message: 'new row violates check constraint "catalogs_title_len"' })));
  check("CHECK de la intro", /introducción/.test(catalogErrorMessage({ code: "23514", message: 'violates check constraint "catalogs_intro_len"' })));
  check("desconocido → genérico (no filtra el texto técnico)", catalogErrorMessage({ message: "relation xyz does not exist" }) === GENERIC_ERROR);
  check("código propio", /sesión/.test(catalogErrorMessage("unauthenticated")));

  section("Formato (T5)");
  check("edición: octubre → Otoño", editionLabel(new Date(2026, 9, 13)) === "Otoño 2026");
  check("edición: marzo → Primavera", editionLabel(new Date(2027, 2, 1)) === "Primavera 2027");
  check("edición: diciembre cuenta como invierno del año siguiente", editionLabel(new Date(2026, 11, 20)) === "Invierno 2027");
  check("edición: enero → Invierno del mismo año", editionLabel(new Date(2027, 0, 5)) === "Invierno 2027");
  check("número: 3 → nº 03", catalogNumberLabel(3) === "nº 03");
  check("número: 12 → nº 12", catalogNumberLabel(12) === "nº 12");
  check("número: vacío o inválido → null", catalogNumberLabel(0) === null && catalogNumberLabel(null) === null && catalogNumberLabel(Number.NaN) === null);
  check("precio venta", priceLabel({ operation: "sale", price: 1450000, currency: "eur" }) === "1.450.000 €");
  check("precio alquiler", priceLabel({ operation: "rent", price: 4800 }) === "4.800 €/mes");
  check("precio dual", priceLabel({ operation: "sale", operations: ["sale", "rent"], price: 980000, rentPrice: 3200 }) === "Venta 980.000 € · Alquiler 3.200 €/mes");
  check("precio 0 → sin dato (nunca «0 €»)", priceLabel({ operation: "sale", price: 0 }) === "Precio · sin dato");
  check("precio nulo → sin dato", priceLabel({ operation: "rent", price: null }) === "Precio · sin dato");
  check("precio en texto numérico", priceLabel({ operation: "sale", price: "350000.00" }) === "350.000 €");
  check("otra divisa", priceLabel({ operation: "sale", price: 5000, currency: "uf" }) === "UF 5.000");
  check("operación dual", operationLabel("sale", ["sale", "rent"]) === "Venta y alquiler");
  check("operación desconocida", operationLabel(null) === "Operación · sin dato");
  check("planta 7 sin ordinal", floorLabel(7) === "Planta 7");
  check("planta 0 → Planta baja", floorLabel(0) === "Planta baja");
  check("planta −1 → Sótano", floorLabel(-1) === "Sótano");
  check("ático", floorLabel(9, true) === "Ático");
  check("planta desconocida", floorLabel(null) === "Planta · sin dato");
  check("ningún formato usa ordinales «ª/º»", ![floorLabel(1), floorLabel(7), floorLabel(0)].some((s) => /[ªº]/.test(s)));

  section("Datos de prueba: solo en desarrollo Y con la variable (E7)");
  check("producción + variable → NO", !isCatalogFixtureMode({ NODE_ENV: "production", CATALOG_FIXTURES: "1" }));
  check("desarrollo sin variable → NO", !isCatalogFixtureMode({ NODE_ENV: "development" }));
  check("test + variable → NO", !isCatalogFixtureMode({ NODE_ENV: "test", CATALOG_FIXTURES: "1" }));
  check("desarrollo + variable distinta de «1» → NO", !isCatalogFixtureMode({ NODE_ENV: "development", CATALOG_FIXTURES: "true" }));
  check("desarrollo + CATALOG_FIXTURES=1 → sí", isCatalogFixtureMode({ NODE_ENV: "development", CATALOG_FIXTURES: "1" }));

  section("Validación de entradas");
  check("uuid válido", isUuid("f0000000-0000-0000-0000-000000000001"));
  check("uuid inválido", !isUuid("1; drop table") && !isUuid(42) && !isUuid(""));
  check("título se limpia", (() => { const r = normalizeTitle("  Selección   A  "); return r.ok && r.value === "Selección A"; })());
  check("título vacío → error", !normalizeTitle("   ").ok);
  check("título de 161 → error", !normalizeTitle("x".repeat(161)).ok);
  check("intro vacía → null", (() => { const r = normalizeIntro("  "); return r.ok && r.value === null; })());
  check("intro de 2001 → error", !normalizeIntro("x".repeat(2001)).ok);
  check("orden válido", isValidOrder(["f0000000-0000-0000-0000-000000000001", "f0000000-0000-0000-0000-000000000002"]));
  check("orden con repetidos → no", !isValidOrder(["f0000000-0000-0000-0000-000000000001", "F0000000-0000-0000-0000-000000000001"]));
  check("orden con basura → no", !isValidOrder(["f0000000-0000-0000-0000-000000000001", "x"]) && !isValidOrder("no"));

  console.log(`\n${failures === 0 ? "✅ Todo en verde" : `❌ ${failures} fallo(s)`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
