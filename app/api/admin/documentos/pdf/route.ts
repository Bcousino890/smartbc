import { renderToBuffer } from "@react-pdf/renderer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createElement, type ReactElement } from "react";
import { requireStaff } from "@/lib/db/auth-helpers";
import { createClient } from "@/lib/db/server";
import { getTemplateById } from "@/lib/documentos/templates";
import { DocumentoPdfDocument } from "@/lib/pdf/documento-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cargamos el logo (public/logo.png) y lo pasamos como data URI al PDF.
async function loadLogoDataUri(): Promise<string | null> {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const buf = await readFile(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  // Auth: solo staff puede generar estos documentos (info contractual).
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: { templateId?: string; values?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const template = body.templateId ? getTemplateById(body.templateId) : undefined;
  if (!template) {
    return NextResponse.json({ error: "template_not_found" }, { status: 404 });
  }

  const values = body.values ?? {};
  const blocks = template.build(values);
  const logoDataUri = await loadLogoDataUri();

  const dateLabel = (values.fecha ?? "").trim()
    ? `Fecha: ${values.fecha}`
    : undefined;

  const footerText =
    template.country === "es"
      ? "BENJAMÍN COUSIÑO PROPIEDADES S.L. · CIF B19444561 · Calle Serrano 19, 28001 Madrid"
      : "Benjamín Cousiño Propiedades SpA · RUT 77290154-2";

  const element = createElement(DocumentoPdfDocument, {
    title: template.name.toUpperCase(),
    subtitle: template.subtitle,
    dateLabel,
    blocks,
    logoDataUri,
    footerText,
  }) as unknown as ReactElement<{ children?: unknown }>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);

  const safeName = template.id.replace(/[^a-zA-Z0-9]+/g, "-");

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
