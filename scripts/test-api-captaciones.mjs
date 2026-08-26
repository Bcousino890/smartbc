#!/usr/bin/env node
/**
 * Prueba de humo de la API pública de captaciones.
 *
 * Recorre el ciclo completo que hará un proveedor real: ping → dry-run → alta →
 * reenvío sin cambios → cambio de precio → idempotencia → sub-recursos →
 * lectura de la ficha → lote → errores esperados.
 *
 * Uso:
 *   SMARTBC_API_KEY=sbc_live_… node scripts/test-api-captaciones.mjs
 *   SMARTBC_API_KEY=… SMARTBC_BASE_URL=http://localhost:3137 node scripts/test-api-captaciones.mjs
 *
 * Escribe datos reales (salvo los pasos marcados como dry-run). Úsalo contra un
 * entorno de pruebas o con una integración dedicada, y borra después la
 * captación de prueba desde el panel.
 */

const BASE = (process.env.SMARTBC_BASE_URL || "http://localhost:3137").replace(/\/$/, "");
const KEY = process.env.SMARTBC_API_KEY;

if (!KEY) {
  console.error("Falta SMARTBC_API_KEY. Genera una clave en /cl/admin/integraciones.");
  process.exit(1);
}

const EXTERNAL_ID = `SMOKE-${Date.now()}`;
let passed = 0;
let failed = 0;

function log(ok, name, extra = "") {
  if (ok) {
    passed++;
    console.log(`  [32m✓[0m ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    failed++;
    console.log(`  [31m✗[0m ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function call(method, path, { body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // respuesta sin cuerpo JSON
  }
  return { status: res.status, json, headers: res.headers };
}

function samplePayload(overrides = {}) {
  return {
    external_id: EXTERNAL_ID,
    title: "Casa de prueba · smoke test",
    description: "Captación generada por scripts/test-api-captaciones.mjs",
    operation: "venta",
    price: 450000000,
    currency: "clp",
    bedrooms: 4,
    bathrooms: 3,
    square_meters: 320,
    useful_square_meters: 265,
    property_type: "house",
    features: ["Piscina", "Bodega"],
    source_url: `https://ejemplo.cl/aviso/${EXTERNAL_ID}`,
    source_site: "smoke-test",
    broker_name: "Corredora de prueba",
    external_reference: "EB-SMOKE-1",
    portal_publication_number: "3914632576",
    published_ago: "Publicado hace 2 meses",
    region: "Metropolitana",
    commune: "Las Condes",
    zone: "El Golf",
    address_scraped: "Av. Apoquindo 1234",
    latitude: -33.4089,
    longitude: -70.5673,
    rol_propiedad: "1234-56",
    owner: { name: "María Pérez", phone: "+56912345678", confirmed: false },
    notes: "Vende por traslado",
    contacts: [
      {
        external_id: "CT-1",
        contact_type: "owner",
        contact_name: "María Pérez",
        phone: "+56912345678",
        email: "maria@ejemplo.cl",
        has_whatsapp: true,
        rut: "12.345.678-9",
        extra_phones: [{ phone: "+56987654321", has_whatsapp: false, label: "Oficina" }],
      },
      { contact_type: "spouse", contact_name: "Juan Soto", phone: "+56911112222" },
    ],
    listings: [
      {
        source_url: `https://portalinmobiliario.com/${EXTERNAL_ID}`,
        source_site: "portalinmobiliario",
        broker_name: "Corredora X",
        price: 460000000,
        currency: "clp",
        operation: "venta",
        broker_price: 455000000,
        broker_currency: "clp",
      },
    ],
    attempts: [
      {
        external_id: "AT-1",
        attempt_type: "call",
        result: "no_answer",
        notes: "No contesta",
        next_action_at: new Date(Date.now() + 4 * 86400000).toISOString(),
        next_action_note: "Volver a llamar",
      },
    ],
    ...overrides,
  };
}

async function main() {
  console.log(`\nAPI: ${BASE}`);
  console.log(`external_id de prueba: ${EXTERNAL_ID}\n`);

  console.log("1 · Autenticación");
  {
    const ping = await call("GET", "/api/v1/ping");
    log(ping.status === 200, "ping con clave válida", `HTTP ${ping.status}`);
    if (ping.status === 200) {
      console.log(`      integración: ${ping.json.data.client.name} (${ping.json.data.client.country})`);
    } else {
      console.error("      No se puede continuar sin autenticación válida.");
      process.exit(1);
    }

    const bad = await fetch(`${BASE}/api/v1/ping`, {
      headers: { Authorization: "Bearer sbc_live_00000000_0000000000000000000000000000000" },
    });
    log(bad.status === 401, "clave inválida rechazada", `HTTP ${bad.status}`);

    const none = await fetch(`${BASE}/api/v1/ping`);
    log(none.status === 401, "sin clave rechazada", `HTTP ${none.status}`);
  }

  console.log("\n2 · Catálogos");
  {
    const pipelines = await call("GET", "/api/v1/catalogos?tipo=pipelines");
    log(pipelines.status === 200 && Array.isArray(pipelines.json?.data), "pipelines");
    const enums = await call("GET", "/api/v1/catalogos?tipo=enums");
    log(enums.status === 200 && !!enums.json?.data?.property_type, "enums");
  }

  console.log("\n3 · Simulación (dry-run)");
  {
    const dry = await call("POST", "/api/v1/captaciones", {
      body: samplePayload(),
      headers: { "X-SmartBC-Dry-Run": "1" },
    });
    log(dry.status === 200 && dry.json?.data?.dry_run === true, "dry-run no escribe", `action=${dry.json?.data?.action}`);

    const check = await call("GET", `/api/v1/captaciones/${EXTERNAL_ID}`);
    log(check.status === 404, "la captación no existe tras el dry-run", `HTTP ${check.status}`);
  }

  console.log("\n4 · Alta con ficha completa");
  {
    const created = await call("POST", "/api/v1/captaciones", { body: samplePayload() });
    log(created.status === 201 && created.json?.data?.action === "created", "alta", `HTTP ${created.status}`);
    const s = created.json?.data?.sections ?? {};
    log(s.contacts?.created === 2, "2 contactos creados", JSON.stringify(s.contacts));
    log(s.listings?.created === 1, "1 aviso creado", JSON.stringify(s.listings));
    log((s.listings?.price_snapshots ?? 0) >= 1, "histórico de precios inicializado");
    log(s.attempts?.created === 1, "1 intento registrado");
    if (created.json?.data?.warnings?.length) {
      console.log(`      avisos: ${created.json.data.warnings.join(" | ")}`);
    }
    console.log(`      ficha: ${created.json?.data?.admin_url}`);
  }

  console.log("\n5 · Reenvío idéntico");
  {
    const again = await call("POST", "/api/v1/captaciones", { body: samplePayload() });
    log(again.json?.data?.action === "unchanged", "sin cambios no reescribe", `action=${again.json?.data?.action}`);
  }

  console.log("\n6 · Cambio de precio");
  {
    const updated = await call("POST", "/api/v1/captaciones", {
      body: samplePayload({ price: 470000000 }),
    });
    const changed = updated.json?.data?.changed_fields ?? [];
    log(updated.json?.data?.action === "updated", "actualización detectada");
    log(
      changed.length === 1 && changed[0] === "price",
      "solo cambia el precio",
      `changed_fields=${JSON.stringify(changed)}`
    );
  }

  console.log("\n7 · Campos del equipo protegidos");
  {
    // El equipo ya rellenó owner_phone en el alta; un valor distinto no debe pisarlo.
    const attempt = await call("POST", "/api/v1/captaciones", {
      body: samplePayload({ owner: { name: "Otro nombre", phone: "+56999999999" } }),
    });
    const protectedFields = attempt.json?.data?.protected_fields ?? [];
    log(
      protectedFields.includes("owner_phone"),
      "owner_phone no se sobrescribe",
      `protected_fields=${JSON.stringify(protectedFields)}`
    );
  }

  console.log("\n8 · Idempotencia");
  {
    const key = `smoke-${EXTERNAL_ID}`;
    const body = samplePayload({ price: 480000000 });
    const first = await call("POST", "/api/v1/captaciones", { body, headers: { "Idempotency-Key": key } });
    const second = await call("POST", "/api/v1/captaciones", { body, headers: { "Idempotency-Key": key } });
    log(second.headers.get("x-idempotent-replay") === "true", "misma clave y cuerpo → respuesta reproducida");
    log(
      first.json?.data?.action === second.json?.data?.action,
      "la respuesta reproducida es idéntica"
    );

    const conflict = await call("POST", "/api/v1/captaciones", {
      body: samplePayload({ price: 999000000 }),
      headers: { "Idempotency-Key": key },
    });
    log(conflict.status === 409, "misma clave con otro cuerpo → 409", `HTTP ${conflict.status}`);
  }

  console.log("\n9 · Sub-recursos");
  {
    const contacts = await call("GET", `/api/v1/captaciones/${EXTERNAL_ID}/contactos`);
    log(contacts.status === 200 && contacts.json.data.length === 2, "listar contactos");

    const upsert = await call("POST", `/api/v1/captaciones/${EXTERNAL_ID}/contactos`, {
      body: {
        contacts: [
          { external_id: "CT-1", contact_type: "owner", contact_name: "María Pérez Soto", phone: "+56912345678" },
        ],
      },
    });
    log(upsert.json?.data?.updated === 1, "upsert de contacto por external_id no duplica");

    const avisos = await call("GET", `/api/v1/captaciones/${EXTERNAL_ID}/avisos`);
    log(avisos.status === 200 && avisos.json.data.length === 1, "listar avisos");
    log(
      (avisos.json?.data?.[0]?.price_history ?? []).length >= 1,
      "el aviso tiene histórico de precios"
    );

    const intentos = await call("POST", `/api/v1/captaciones/${EXTERNAL_ID}/intentos`, {
      body: { attempts: [{ external_id: "AT-1", attempt_type: "call", result: "answered" }] },
    });
    log(intentos.json?.data?.unchanged === 1, "intento repetido no se duplica");

    const etapa = await call("POST", `/api/v1/captaciones/${EXTERNAL_ID}/etapa`, {
      body: { stage: "contacting" },
    });
    log([200].includes(etapa.status), "cambio de etapa", `HTTP ${etapa.status}`);

    const convertido = await call("POST", `/api/v1/captaciones/${EXTERNAL_ID}/etapa`, {
      body: { stage: "converted" },
    });
    log(convertido.status === 403, "etapa converted bloqueada", `HTTP ${convertido.status}`);
  }

  console.log("\n10 · Lectura de la ficha completa");
  {
    const detail = await call("GET", `/api/v1/captaciones/${EXTERNAL_ID}`);
    const d = detail.json?.data ?? {};
    log(detail.status === 200, "GET ficha");
    log(!!d.title && !!d.commune && !!d.rol_propiedad, "ficha y ubicación presentes");
    log(Array.isArray(d.contacts) && d.contacts.length === 2, "contactos en la ficha");
    log(Array.isArray(d.listings) && d.listings.length === 1, "avisos en la ficha");
    log(Array.isArray(d.attempts) && d.attempts.length >= 1, "intentos en la ficha");
    log(d.origin === "api", "marcada como origen API");

    const list = await call("GET", "/api/v1/captaciones?limit=5");
    log(list.status === 200 && Array.isArray(list.json.data), "listado paginado");
  }

  console.log("\n11 · Lote");
  {
    const batch = await call("POST", "/api/v1/captaciones/batch", {
      body: {
        items: [
          { external_id: `${EXTERNAL_ID}-B1`, title: "Lote 1", price: 100000000, currency: "clp" },
          { external_id: `${EXTERNAL_ID}-B2`, title: "Lote 2", price: 200000000, currency: "clp" },
        ],
      },
    });
    log(batch.status === 200, "lote procesado", `HTTP ${batch.status}`);
    log(batch.json?.meta?.summary?.created === 2, "2 creadas en el lote");
  }

  console.log("\n12 · Validación");
  {
    const unknown = await call("POST", "/api/v1/captaciones", {
      body: { external_id: EXTERNAL_ID, campo_inventado: "x" },
    });
    log(unknown.status === 400, "campo desconocido rechazado", `HTTP ${unknown.status}`);
    log(
      (unknown.json?.error?.details ?? []).length > 0,
      "el error indica el campo",
      JSON.stringify(unknown.json?.error?.details?.[0] ?? {})
    );

    const badType = await call("POST", "/api/v1/captaciones", {
      body: { external_id: EXTERNAL_ID, price: "muy caro" },
    });
    log(badType.status === 400, "tipo inválido rechazado", `HTTP ${badType.status}`);

    const missing = await call("GET", "/api/v1/captaciones/NO-EXISTE-XYZ");
    log(missing.status === 404, "captación inexistente → 404");
  }

  console.log("\n13 · Baja lógica");
  {
    const del = await call("DELETE", `/api/v1/captaciones/${EXTERNAL_ID}-B2`, {
      body: { reason: "Retirada por el proveedor (smoke test)" },
    });
    log(del.status === 200 && del.json?.data?.action === "archived", "baja lógica");

    const after = await call("GET", `/api/v1/captaciones/${EXTERNAL_ID}-B2`);
    log(after.status === 200 && after.json?.data?.status === "rejected", "sigue existiendo, en rechazada");
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Resultado: ${passed} correctas, ${failed} fallidas`);
  console.log(`Limpieza: borra las captaciones ${EXTERNAL_ID}* desde el panel.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nError inesperado:", err);
  process.exit(1);
});
