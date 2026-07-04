import "server-only";
import { createClient } from "@/lib/db/server";
import { requireSession } from "@/lib/db/auth-helpers";
import { getApplicationByIdAdmin } from "@/lib/db/queries/property-applications";
import { formatCLP, formatEUR } from "@/lib/property-applications/currency";
import { getRecommendationLabel } from "@/lib/property-applications/scoring";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const auth = await requireSession(supabase);
    if (!auth.ok) return new Response("No autorizado", { status: 401 });

    const isStaff = ["admin", "owner", "advisor", "agent_admin", "agent_senior", "agent_junior"].includes(auth.role);
    if (!isStaff) return new Response("Sin permiso", { status: 403 });

    const application = await getApplicationByIdAdmin(id);
    if (!application) return new Response("No encontrada", { status: 404 });

    const score = application.score;
    const docs = application.documents ?? [];
    const client = application.client;
    const property = application.property;

    const opLabel = application.operation === "rent" ? "Alquiler" : "Compra";
    const countryLabel = application.country === "ES" ? "España 🇪🇸" : "Chile 🇨🇱";
    const recLabel = score ? getRecommendationLabel(score.ai_recommendation) : "—";
    const incomeDisplay = score?.income_amount
      ? score.income_currency === "CLP"
        ? `${formatCLP(score.income_amount)}${score.income_amount_eur ? ` ≈ ${formatEUR(score.income_amount_eur)}` : ""}`
        : formatEUR(score.income_amount)
      : null;

    const statusLabel: Record<string, string> = {
      verified: "Verificado ✅",
      pending: "Pendiente ⏳",
      rejected: "Rechazado ❌",
      needs_correction: "Necesita corrección ⚠️",
    };

    const docRows = docs.map((d) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${d.document_type?.display_name ?? "Documento"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${statusLabel[d.status] ?? d.status}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${d.verification_notes ?? "—"}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resumen Candidato — ${client?.full_name ?? client?.email ?? id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, serif; color: #1a1a2e; background: #fff; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    h2 { font-size: 15px; font-weight: 600; margin: 24px 0 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    .meta { font-size: 12px; color: #6b7280; margin-bottom: 24px; }
    .score-box { display: inline-flex; align-items: center; gap: 8px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 12px 20px; margin-bottom: 16px; }
    .score-num { font-size: 32px; font-weight: 700; color: #16a34a; }
    .score-label { font-size: 13px; color: #4b5563; }
    .rec { font-size: 13px; font-weight: 600; color: #16a34a; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .info-item { background: #f9fafb; border-radius: 8px; padding: 10px 14px; }
    .info-item .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; }
    .info-item .value { font-size: 14px; font-weight: 600; color: #111827; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead tr { background: #f3f4f6; }
    th { padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; }
    .summary-text { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; font-size: 13px; color: #78350f; line-height: 1.6; }
    .context { font-size: 11px; color: #6b7280; margin-top: 8px; font-style: italic; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>Resumen de Candidato</h1>
  <p class="meta">
    Operación: <strong>${opLabel}</strong> · País: <strong>${countryLabel}</strong>
    ${property ? `· Propiedad: <strong>${property.title}</strong>` : ""}
    · Generado: ${new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}
  </p>

  ${score ? `
  <div class="score-box">
    <div>
      <div class="score-num">${score.total_score}<span style="font-size:16px;color:#6b7280">/100</span></div>
    </div>
    <div>
      <div class="score-label">Puntuación del candidato</div>
      <div class="rec">${recLabel}</div>
    </div>
  </div>` : ""}

  <h2>Información del Candidato</h2>
  <div class="info-grid">
    <div class="info-item">
      <div class="label">Nombre</div>
      <div class="value">${client?.full_name ?? "—"}</div>
    </div>
    <div class="info-item">
      <div class="label">Email</div>
      <div class="value">${client?.email ?? "—"}</div>
    </div>
    ${incomeDisplay ? `
    <div class="info-item">
      <div class="label">Ingresos verificados</div>
      <div class="value">${incomeDisplay}</div>
    </div>` : ""}
    ${score?.income_ratio ? `
    <div class="info-item">
      <div class="label">Ratio ingresos / renta</div>
      <div class="value">${score.income_ratio.toFixed(1)}x la renta</div>
    </div>` : ""}
  </div>

  ${score?.ai_summary ? `
  <h2>Análisis del Sistema</h2>
  <div class="summary-text">${score.ai_summary}</div>
  ${score.currency_context ? `<p class="context">${score.currency_context}</p>` : ""}
  ` : ""}

  <h2>Documentación (${docs.filter(d => d.status === "verified").length}/${docs.length} verificados)</h2>
  <table>
    <thead>
      <tr>
        <th>Documento</th>
        <th>Estado</th>
        <th>Notas</th>
      </tr>
    </thead>
    <tbody>
      ${docRows || "<tr><td colspan='3' style='padding:12px;color:#9ca3af;'>Sin documentos</td></tr>"}
    </tbody>
  </table>

  <div class="footer">
    Este resumen fue preparado por el equipo smartbc / zinto. Los documentos originales están en custodia del equipo y no se adjuntan en este informe.<br>
    Referencia solicitud: <code>${id}</code>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="candidato-${client?.full_name?.replace(/\s+/g, "-").toLowerCase() ?? id}.html"`,
      },
    });
  } catch (err) {
    console.error("[export-summary] Error:", err);
    return new Response("Error interno", { status: 500 });
  }
}
