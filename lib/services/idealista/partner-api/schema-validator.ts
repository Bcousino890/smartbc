import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

// Validador del subconjunto de JSON Schema draft-07 que usan los schemas
// oficiales de Idealista (copiados en `./schemas`).
//
// ¿Por qué no ajv? Porque este repo se despliega en el VPS con `npm ci` y no
// queremos una dependencia más en el árbol de producción por 200 líneas de
// código. Los schemas de Idealista usan un subconjunto pequeño y muy estable:
// $ref, type, enum, required, properties, additionalProperties, mínimos y
// máximos, pattern, items y oneOf/allOf/anyOf.
//
// Sirve para dos cosas:
//   1. Validar el payload ANTES de gastar una llamada (y poder enseñar el fallo
//      campo a campo en el panel en vez de un 400 pelado).
//   2. `scripts/test-idealista-payload.mts`, que ejercita el mapper contra el
//      contrato real sin tocar la red.
//
// Módulo puro (sin `server-only`) para que el script de test pueda importarlo.

export interface SchemaIssue {
  /** Ruta dentro del payload, estilo `features.areaConstructed`. */
  path: string;
  message: string;
}

type JsonSchema = Record<string, unknown>;

/** Resuelve rutas de schema relativas (`address.json`, `../rules.json`). */
export interface SchemaStore {
  load(relativePath: string): JsonSchema;
}

/** Store que lee los .json del disco, cacheando lo ya leído. */
export function createFsSchemaStore(rootDir: string): SchemaStore {
  const cache = new Map<string, JsonSchema>();
  return {
    load(relativePath: string): JsonSchema {
      const key = normalize(relativePath);
      const cached = cache.get(key);
      if (cached) return cached;
      const parsed = JSON.parse(readFileSync(join(rootDir, key), "utf8")) as JsonSchema;
      cache.set(key, parsed);
      return parsed;
    },
  };
}

/** Sigue un puntero JSON (`#/integer1to999999`) dentro de un schema. */
function resolvePointer(schema: JsonSchema, pointer: string): JsonSchema {
  if (!pointer || pointer === "#") return schema;
  const parts = pointer.replace(/^#\//, "").split("/").filter(Boolean);
  let current: unknown = schema;
  for (const part of parts) {
    if (!current || typeof current !== "object") {
      throw new Error(`No se pudo resolver el puntero de schema "${pointer}"`);
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (!current || typeof current !== "object") {
    throw new Error(`El puntero de schema "${pointer}" no apunta a un objeto`);
  }
  return current as JsonSchema;
}

interface ResolvedSchema {
  schema: JsonSchema;
  /** Directorio del fichero que contiene el schema, para resolver $ref relativos. */
  baseDir: string;
}

/**
 * Aplana los `$ref`. Los schemas de Idealista a veces mezclan `$ref` con más
 * claves (`{"type":"integer","$ref":"../rules.json#/imageId"}`), así que las
 * claves locales se conservan y ganan sobre las que trae el $ref.
 */
function resolveRefs(schema: JsonSchema, baseDir: string, store: SchemaStore, depth = 0): ResolvedSchema {
  if (depth > 20) throw new Error("Cadena de $ref demasiado profunda en los schemas de Idealista");

  const ref = schema.$ref;
  if (typeof ref !== "string") return { schema, baseDir };

  const [filePart, pointerPart] = ref.split("#");
  if (!filePart) {
    // Los schemas de Idealista siempre nombran el fichero en el $ref, incluso
    // cuando apuntan a sí mismos (`rules.json#/stringTo400` dentro de
    // rules.json). Si algún día aparece un `#/...` a secas, mejor enterarse.
    throw new Error(`$ref sin fichero ("${ref}"): no está soportado`);
  }
  const relativePath = normalize(join(baseDir, filePart));
  const target = store.load(relativePath);
  const nextBaseDir = dirname(relativePath);

  const pointed = pointerPart ? resolvePointer(target, `#${pointerPart}`) : target;
  const resolved = resolveRefs(pointed, nextBaseDir, store, depth + 1);

  const merged: JsonSchema = { ...resolved.schema };
  for (const [key, value] of Object.entries(schema)) {
    if (key !== "$ref") merged[key] = value;
  }
  return { schema: merged, baseDir: resolved.baseDir };
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function matchesType(value: unknown, expected: string): boolean {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  if (expected === "integer") return actual === "integer";
  return actual === expected;
}

function joinPath(path: string, key: string | number): string {
  if (typeof key === "number") return `${path}[${key}]`;
  return path ? `${path}.${key}` : key;
}

function validateNode(
  value: unknown,
  rawSchema: JsonSchema,
  baseDir: string,
  store: SchemaStore,
  path: string,
  issues: SchemaIssue[]
): void {
  const { schema, baseDir: dir } = resolveRefs(rawSchema, baseDir, store);

  // type
  const type = schema.type;
  if (typeof type === "string") {
    if (!matchesType(value, type)) {
      issues.push({ path, message: `debe ser de tipo ${type} (llegó ${typeOf(value)})` });
      return;
    }
  } else if (Array.isArray(type)) {
    if (!type.some((t) => typeof t === "string" && matchesType(value, t))) {
      issues.push({ path, message: `debe ser de tipo ${type.join(" | ")} (llegó ${typeOf(value)})` });
      return;
    }
  }

  // enum
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.includes(value as never)) {
      const allowed = schema.enum.slice(0, 12).join(", ");
      issues.push({
        path,
        message: `"${String(value)}" no es un valor admitido. Admitidos: ${allowed}${
          schema.enum.length > 12 ? ", …" : ""
        }`,
      });
    }
  }

  // Números
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      issues.push({ path, message: `debe ser ${schema.minimum} o más (llegó ${value})` });
    }
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) {
      issues.push({ path, message: `debe ser mayor que ${schema.exclusiveMinimum} (llegó ${value})` });
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      issues.push({ path, message: `debe ser ${schema.maximum} o menos (llegó ${value})` });
    }
    if (typeof schema.multipleOf === "number" && schema.multipleOf > 0) {
      // En coma flotante 0.1*3 !== 0.3: se compara con una tolerancia mínima.
      const ratio = value / schema.multipleOf;
      if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
        issues.push({ path, message: `debe ser múltiplo de ${schema.multipleOf} (llegó ${value})` });
      }
    }
  }

  // Cadenas
  if (typeof value === "string" && typeof schema.pattern === "string") {
    let regex: RegExp | null = null;
    try {
      regex = new RegExp(schema.pattern);
    } catch {
      regex = null; // patrón que JS no sabe compilar: no es motivo para bloquear
    }
    if (regex && !regex.test(value)) {
      issues.push({ path, message: `no cumple el formato que exige Idealista (${schema.pattern})` });
    }
  }

  // Arrays
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      issues.push({ path, message: `necesita al menos ${schema.minItems} elemento(s)` });
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      issues.push({ path, message: `admite como mucho ${schema.maxItems} elemento(s) (llegaron ${value.length})` });
    }
    if (schema.items && typeof schema.items === "object") {
      value.forEach((item, index) => {
        validateNode(item, schema.items as JsonSchema, dir, store, joinPath(path, index), issues);
      });
    }
  }

  // Objetos
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const properties = (schema.properties as Record<string, JsonSchema> | undefined) ?? {};

    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === "string" && obj[key] === undefined) {
          issues.push({ path: joinPath(path, key), message: "es obligatorio y falta" });
        }
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in properties)) {
          issues.push({ path: joinPath(path, key), message: "no existe en el schema de Idealista (sobra)" });
        }
      }
    }

    for (const [key, propSchema] of Object.entries(properties)) {
      if (obj[key] !== undefined) {
        validateNode(obj[key], propSchema, dir, store, joinPath(path, key), issues);
      }
    }
  }

  // Combinadores
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      validateNode(value, sub as JsonSchema, dir, store, path, issues);
    }
  }

  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
    const branches = (schema.oneOf ?? schema.anyOf) as JsonSchema[];
    const branchIssues = branches.map((sub) => {
      const collected: SchemaIssue[] = [];
      validateNode(value, sub, dir, store, path, collected);
      return collected;
    });
    const matches = branchIssues.filter((list) => list.length === 0).length;

    if (matches === 0) {
      // Se enseña la rama que menos se quejó: casi siempre es la tipología que
      // el usuario quería, y sus errores son los útiles.
      const best = branchIssues.reduce((a, b) => (b.length < a.length ? b : a), branchIssues[0] ?? []);
      issues.push(...best);
    } else if (Array.isArray(schema.oneOf) && matches > 1) {
      issues.push({ path, message: "encaja con más de una tipología de Idealista a la vez" });
    }
  }
}

/**
 * Valida un valor contra uno de los schemas oficiales.
 *
 * @param schemaPath Ruta relativa dentro de `./schemas`,
 *                   p. ej. `property/property_create.json`.
 */
export function validateAgainstSchema(
  value: unknown,
  schemaPath: string,
  store: SchemaStore
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const schema = store.load(schemaPath);
  validateNode(value, schema, dirname(schemaPath), store, "", issues);
  return issues;
}

/** Convierte los problemas en frases para enseñar en el panel. */
export function formatSchemaIssues(issues: SchemaIssue[]): string[] {
  return issues.map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message));
}
