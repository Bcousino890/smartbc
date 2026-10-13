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

  console.log(`\n${failures === 0 ? "✅ Todo en verde" : `❌ ${failures} fallo(s)`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
