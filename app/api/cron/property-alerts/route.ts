import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getSuggestedProperties } from "@/lib/db/queries/suggested-properties";
import { sendNewListingsDigestEmail, buildUnsubscribeUrl } from "@/lib/email/property-offer";

// Digest de "nuevas propiedades" — opt-in por cliente
// (client_preferences.new_listing_alerts_enabled, activado por un asesor
// desde la ficha del cliente). Solo manda lo que entró desde el último envío,
// agrupado en un correo — nunca uno por propiedad, para no saturar al
// cliente en un día con varias altas (p.ej. una carga de Idealista).
//
// Añadir al crontab del VPS, por ejemplo una vez al día:
//   0 9 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     http://localhost:3000/api/cron/property-alerts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;

type ClientPrefsRow = {
  client_id: string;
  new_listing_alerts_last_sent_at: string | null;
  new_listing_alerts_frequency: "immediate" | "weekly";
  profiles: { email: string | null; full_name: string | null; country: string | null } | null;
};

export async function POST(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = createAdminClient() as any;

  const { data, error } = await db
    .from("client_preferences")
    .select(
      "client_id, new_listing_alerts_last_sent_at, new_listing_alerts_frequency, profiles!inner(email, full_name, country)",
    )
    .eq("new_listing_alerts_enabled", true);

  if (error) {
    console.error("[cron/property-alerts]", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as ClientPrefsRow[];
  const now = new Date().toISOString();

  let sent = 0;
  let checked = 0;
  const errors: string[] = [];

  for (const row of rows) {
    checked++;
    const email = row.profiles?.email;
    if (!email) continue;

    // Cliente en modo "semanal" (pedido desde el enlace de baja, ver
    // app/api/public/property-alerts/unsubscribe): esta pasada del cron no
    // le toca todavía si no pasó una semana desde el último envío.
    if (row.new_listing_alerts_frequency === "weekly" && row.new_listing_alerts_last_sent_at) {
      const elapsed = Date.now() - new Date(row.new_listing_alerts_last_sent_at).getTime();
      if (elapsed < WEEKLY_MS) continue;
    }

    try {
      const result = await getSuggestedProperties(row.client_id, {
        country: row.profiles?.country ?? undefined,
        limit: 5,
        createdAfter: row.new_listing_alerts_last_sent_at ?? undefined,
        supabase: db,
      });

      if (result.ok && result.suggestions.length > 0) {
        const emailResult = await sendNewListingsDigestEmail({
          to: email,
          clientName: row.profiles?.full_name || "Cliente",
          properties: result.suggestions,
          unsubscribeUrl: buildUnsubscribeUrl(row.client_id),
        });
        if (emailResult.success) sent++;
        else errors.push(`${row.client_id}: ${emailResult.error}`);
      }

      // Avanza el reloj tanto si hubo envío como si no: la próxima pasada
      // solo debe mirar lo que entre a partir de ahora, no volver a evaluar
      // propiedades ya vistas en esta.
      await db
        .from("client_preferences")
        .update({ new_listing_alerts_last_sent_at: now })
        .eq("client_id", row.client_id);
    } catch (err) {
      errors.push(`${row.client_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return Response.json({ ok: true, checked, sent, errors });
}
