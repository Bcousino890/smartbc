import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { encryptSecret } from "@/lib/crypto/secret";
import { ZintoIntegrationApiClient } from "@/lib/services/zinto-integration/client";
import { ZintoIntegrationApiError } from "@/lib/services/zinto-integration/errors";
import { getIntegrationWebhookUrl, readZintoConfigRow } from "@/lib/services/zinto-integration/server-config";
import { WEBHOOK_EVENT_TYPES, type WebhookEndpoint } from "@/lib/services/zinto-integration/types";

/**
 * Alta y baja del webhook del contrato nuevo, desde el panel.
 *
 * El motivo de que esto sea un botón y no un curl documentado: el secreto
 * `whsec_` se devuelve UNA sola vez, en la respuesta del POST. Si viaja por
 * las manos de alguien camino de un formulario, basta con que se pierda para
 * tener que borrar el endpoint y volver a crearlo. Aquí se cifra y se guarda
 * en la misma operación que lo crea, y no se devuelve nunca al navegador.
 *
 * Ojo: este secreto NO es `zinto_config.webhook_secret_*`, que firma los
 * webhooks legacy de estado de entrega. Son dos protocolos distintos con dos
 * formatos de firma distintos; viven en columnas separadas a propósito.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const profile = await getCurrentProfile().catch(() => null);
  if (!profile || !["admin", "owner"].includes(profile.role)) return null;
  return profile;
}

function describeError(err: unknown): string {
  if (err instanceof ZintoIntegrationApiError) {
    return `${err.code}: ${err.message}`;
  }
  return err instanceof Error ? err.message : "Error desconocido";
}

/** Lista los endpoints registrados en Zinto, para no duplicar. */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const expectedUrl = getIntegrationWebhookUrl();

  try {
    const client = await ZintoIntegrationApiClient.fromResolvedConfig();
    const page = await client.listWebhooks();
    const endpoints: WebhookEndpoint[] = page.data ?? [];
    const row = await readZintoConfigRow();

    return NextResponse.json({
      ok: true,
      expectedUrl,
      hasStoredSecret: Boolean(row?.integration_webhook_secret_encrypted),
      storedWebhookId: row?.integration_webhook_id ?? null,
      endpoints: endpoints.map((e) => ({
        id: e.id,
        url: e.url,
        active: e.active,
        eventCount: e.event_types?.length ?? 0,
        isOurs: e.url === expectedUrl,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, expectedUrl, error: describeError(err) },
      { status: 200 },
    );
  }
}

/**
 * Registra el webhook y guarda el secreto cifrado en el mismo paso.
 * Si ya había uno nuestro registrado, se borra primero: dos endpoints con la
 * misma URL significan cada evento entregado dos veces, y aunque el receptor
 * deduplica por `event.id`, es gasto de cuota y ruido en el log.
 */
export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = getIntegrationWebhookUrl();

  try {
    const client = await ZintoIntegrationApiClient.fromResolvedConfig();

    const existing = await client.listWebhooks().catch(() => null);
    const duplicates = (existing?.data ?? []).filter((e) => e.url === url);
    for (const dup of duplicates) {
      await client.deleteWebhook(dup.id).catch(() => {
        // Si no se puede borrar, seguimos: es preferible un duplicado a no
        // tener webhook. El health check lo hará visible.
      });
    }

    const created = await client.createWebhook({
      url,
      event_types: [...WEBHOOK_EVENT_TYPES],
    });

    const secret = created.data.secret;
    if (!secret) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Zinto creó el webhook pero no devolvió el secreto. Bórralo desde el panel y vuelve a registrarlo.",
        },
        { status: 200 },
      );
    }

    const enc = encryptSecret(secret);
    const db = createAdminClient() as any;
    const { data: row } = await db.from("zinto_config").select("id").limit(1).maybeSingle();
    if (!row) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No hay fila en zinto_config donde guardar el secreto. Guarda primero la configuración de Zinto.",
        },
        { status: 200 },
      );
    }

    const { error } = await db
      .from("zinto_config")
      .update({
        integration_webhook_secret_encrypted: enc.encrypted,
        integration_webhook_secret_iv: enc.iv,
        integration_webhook_id: created.data.id,
      })
      .eq("id", row.id);

    if (error) {
      // El webhook YA existe en Zinto pero no hemos podido guardar su secreto:
      // decirlo claramente es mejor que dejar un endpoint firmando con una
      // clave que no tenemos.
      return NextResponse.json(
        {
          ok: false,
          error: `El webhook se creó en Zinto (${created.data.id}) pero no se pudo guardar su secreto: ${error.message}. Bórralo y vuelve a registrarlo.`,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok: true,
      url,
      webhookId: created.data.id,
      eventTypes: created.data.event_types?.length ?? WEBHOOK_EVENT_TYPES.length,
      replaced: duplicates.length,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, url, error: describeError(err) }, { status: 200 });
  }
}

/** Da de baja el webhook y limpia las columnas. */
export async function DELETE() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const row = await readZintoConfigRow();
    const client = await ZintoIntegrationApiClient.fromResolvedConfig();

    // Borramos por id guardado y, por si acaso, cualquiera que apunte a
    // nuestra URL (el id pudo perderse en un despliegue anterior).
    const url = getIntegrationWebhookUrl();
    const listed = await client.listWebhooks().catch(() => null);
    const ids = new Set<string>();
    if (row?.integration_webhook_id) ids.add(row.integration_webhook_id);
    for (const e of listed?.data ?? []) if (e.url === url) ids.add(e.id);

    for (const id of ids) {
      await client.deleteWebhook(id).catch(() => {});
    }

    const db = createAdminClient() as any;
    const { data: cfg } = await db.from("zinto_config").select("id").limit(1).maybeSingle();
    if (cfg) {
      await db
        .from("zinto_config")
        .update({
          integration_webhook_secret_encrypted: null,
          integration_webhook_secret_iv: null,
          integration_webhook_id: null,
        })
        .eq("id", cfg.id);
    }

    return NextResponse.json({ ok: true, deleted: ids.size });
  } catch (err) {
    return NextResponse.json({ ok: false, error: describeError(err) }, { status: 200 });
  }
}
