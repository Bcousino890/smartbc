/**
 * Tests de la matriz de permisos tras añadir el recurso `viewing_collections`
 * y la acción `publish`.
 *
 * Lo que importa: que ningún rol gane permisos por accidente, que agent_junior
 * pueda preparar pero no publicar, y que normalizeMatrix (que es lo que decide
 * los permisos efectivos de un rol personalizado) devuelva la matriz completa.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-viewing-collections-permissions.mts
 */
import {
  ACTION_LABELS,
  PERMISSIONS_BY_ROLE,
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  RESOURCE_DESCRIPTIONS,
  RESOURCE_LABELS,
  canAccess,
  getViewRestriction,
  normalizeMatrix,
} from "../lib/permissions.ts";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ✅ ${name}`);
  else {
    failures++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(t: string) {
  console.log(`\n${t}`);
}

// ============================================================================
section("Estructura de la matriz");
// ============================================================================

check(
  "viewing_collections está en PERMISSION_RESOURCES",
  PERMISSION_RESOURCES.includes("viewing_collections"),
);
check("publish está en PERMISSION_ACTIONS", PERMISSION_ACTIONS.includes("publish"));
check("hay 16 recursos", PERMISSION_RESOURCES.length === 16, String(PERMISSION_RESOURCES.length));
check("hay 6 acciones", PERMISSION_ACTIONS.length === 6, String(PERMISSION_ACTIONS.length));

check(
  "el recurso tiene etiqueta para la UI",
  Boolean(RESOURCE_LABELS.viewing_collections),
);
check(
  "el recurso tiene descripción para la UI",
  Boolean(RESOURCE_DESCRIPTIONS.viewing_collections),
);
check("la acción publish tiene etiqueta", Boolean(ACTION_LABELS.publish));

// Toda matriz debe cubrir todos los recursos × todas las acciones.
for (const [role, matrix] of Object.entries(PERMISSIONS_BY_ROLE)) {
  const missingResource = PERMISSION_RESOURCES.find((r) => !(r in matrix));
  check(
    `${role}: cubre los 16 recursos`,
    !missingResource,
    missingResource,
  );
  const missingAction = PERMISSION_RESOURCES.flatMap((r) =>
    PERMISSION_ACTIONS.filter((a) => matrix[r] && !(a in matrix[r])).map(
      (a) => `${r}.${a}`,
    ),
  )[0];
  check(`${role}: cubre las 6 acciones en cada recurso`, !missingAction, missingAction);
}

// ============================================================================
section("publish solo aplica a viewing_collections");
// ============================================================================

for (const [role, matrix] of Object.entries(PERMISSIONS_BY_ROLE)) {
  const leaked = PERMISSION_RESOURCES.filter(
    (r) => r !== "viewing_collections" && matrix[r]?.publish === true,
  );
  check(
    `${role}: ningún recurso antiguo gana publish`,
    leaked.length === 0,
    leaked.join(", "),
  );
}

// ============================================================================
section("Matriz por rol · viewing_collections");
// ============================================================================

const EXPECTED: Record<string, Record<string, boolean>> = {
  owner:        { view: true,  create: true,  edit: true,  delete: true,  publish: true  },
  admin:        { view: true,  create: true,  edit: true,  delete: true,  publish: true  },
  advisor:      { view: true,  create: true,  edit: true,  delete: true,  publish: true  },
  agent_admin:  { view: true,  create: true,  edit: true,  delete: true,  publish: true  },
  agent_senior: { view: true,  create: true,  edit: true,  delete: false, publish: true  },
  agent_junior: { view: true,  create: true,  edit: true,  delete: false, publish: false },
  captadora:    { view: false, create: false, edit: false, delete: false, publish: false },
  client:       { view: false, create: false, edit: false, delete: false, publish: false },
  viewer:       { view: false, create: false, edit: false, delete: false, publish: false },
};

for (const [role, expected] of Object.entries(EXPECTED)) {
  for (const [action, want] of Object.entries(expected)) {
    const got = canAccess(role, "viewing_collections", action as never);
    check(
      `${role}.${action} = ${want}`,
      got === want,
      `obtenido ${got}`,
    );
  }
}

// ============================================================================
section("Reglas de negocio clave");
// ============================================================================

check(
  "agent_junior PUEDE preparar (create + edit)",
  canAccess("agent_junior", "viewing_collections", "create") &&
    canAccess("agent_junior", "viewing_collections", "edit"),
);
check(
  "agent_junior NO PUEDE publicar",
  !canAccess("agent_junior", "viewing_collections", "publish"),
);
check(
  "agent_senior SÍ puede publicar",
  canAccess("agent_senior", "viewing_collections", "publish"),
);
check(
  "captadora no accede al módulo",
  !canAccess("captadora", "viewing_collections", "view"),
);
check(
  "un rol client (portal) no accede",
  !canAccess("client", "viewing_collections", "view"),
);
check(
  "un rol desconocido no accede",
  !canAccess("rol_inventado", "viewing_collections", "view"),
);

// ============================================================================
section("Scope de visibilidad");
// ============================================================================

check(
  "agent_junior: own_only",
  getViewRestriction("agent_junior", "viewing_collections") === "own_only",
);
check(
  "agent_senior: team",
  getViewRestriction("agent_senior", "viewing_collections") === "team",
);
check(
  "admin: all",
  getViewRestriction("admin", "viewing_collections") === "all",
);
check(
  "captadora: none",
  getViewRestriction("captadora", "viewing_collections") === "none",
);
check(
  "properties sigue siendo inventario compartido para agent_junior",
  getViewRestriction("agent_junior", "properties") === "all",
);

// ============================================================================
section("normalizeMatrix · roles personalizados");
// ============================================================================

const normalized = normalizeMatrix({});
check(
  "devuelve los 16 recursos",
  Object.keys(normalized).length === 16,
  String(Object.keys(normalized).length),
);
check(
  "cada recurso trae las 6 acciones",
  PERMISSION_RESOURCES.every(
    (r) => Object.keys(normalized[r]).length === 6,
  ),
);
check(
  "una matriz vacía deniega por defecto (de ahí el backfill de 0127)",
  normalized.viewing_collections.view === false &&
    normalized.viewing_collections.publish === false,
);

const partial = normalizeMatrix({
  viewing_collections: { view: true, create: true, edit: true },
});
check(
  "respeta lo que sí viene en el JSON",
  partial.viewing_collections.view === true &&
    partial.viewing_collections.create === true,
);
check(
  "las acciones ausentes quedan en false",
  partial.viewing_collections.publish === false &&
    partial.viewing_collections.delete === false,
);

console.log(`\n${failures === 0 ? "✅ TODO OK" : `❌ ${failures} FALLO(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
