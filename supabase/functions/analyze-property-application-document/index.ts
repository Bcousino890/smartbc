/**
 * Edge function: analyze-property-application-document
 *
 * Called after a document is uploaded. Downloads the file from storage,
 * extracts text (PDF/image), sends to Claude for analysis, and updates
 * the property_application_documents row with ai_analysis JSONB.
 *
 * Invoke via: POST /functions/v1/analyze-property-application-document
 * Body: { document_id: string }
 *
 * This function runs on the self-hosted Supabase edge runtime on the VPS.
 * Deploy: supabase functions deploy analyze-property-application-document
 */

import Anthropic from "npm:@anthropic-ai/sdk";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

interface DocumentRow {
  id: string;
  file_url: string;
  storage_path: string;
  mime_type: string;
  property_applications: {
    country: "ES" | "CL";
    operation: "rent" | "sale";
  };
  property_application_document_types: {
    display_name: string;
    validation_rules: Record<string, unknown> | null;
    help_text: string | null;
  };
}

interface AiAnalysis {
  readability: "clear" | "partially_clear" | "unclear";
  completeness: number;
  document_type_detected: string;
  income_amount: number | null;
  income_currency: string | null;
  warnings: string[];
  recommendation: string;
  is_valid: boolean;
  extracted_data: Record<string, string>;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let documentId: string;
  try {
    const body = await req.json() as { document_id: string };
    documentId = body.document_id;
    if (!documentId) throw new Error("Missing document_id");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
  }

  try {
    // 1. Fetch document row with type + application info
    const docRes = await fetch(
      `${SUPABASE_URL}/rest/v1/property_application_documents?id=eq.${documentId}&select=id,file_url,storage_path,mime_type,property_applications(country,operation),property_application_document_types(display_name,validation_rules,help_text)`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const docs = await docRes.json() as DocumentRow[];
    const doc = docs[0];
    if (!doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), { status: 404 });
    }

    const app = doc.property_applications;
    const docType = doc.property_application_document_types;
    const countryLabel = app.country === "CL" ? "Chile" : "Spain";
    const currencyNote = app.country === "CL"
      ? "All monetary values in this document should be in Chilean Pesos (CLP). Flag if USD or EUR is used instead."
      : "All monetary values should be in Euros (EUR).";

    // 2. Download the file
    const fileRes = await fetch(doc.file_url);
    if (!fileRes.ok) {
      throw new Error(`Failed to download file: ${fileRes.status}`);
    }
    const fileBytes = await fileRes.arrayBuffer();
    const base64File = btoa(String.fromCharCode(...new Uint8Array(fileBytes)));

    const isImage = doc.mime_type.startsWith("image/");
    const isPdf = doc.mime_type === "application/pdf";

    // 3. Build message for Claude
    const systemPrompt = `You are a real estate document verification expert for ${countryLabel}.
Analyze the provided document of type "${docType.display_name}" for a ${app.operation === "rent" ? "rental" : "purchase"} application.

${currencyNote}

Validation requirements: ${docType.validation_rules ? JSON.stringify(docType.validation_rules) : "Standard document verification"}
${docType.help_text ? `Context: ${docType.help_text}` : ""}

Respond ONLY with valid JSON in this exact format:
{
  "readability": "clear" | "partially_clear" | "unclear",
  "completeness": <number 0-100>,
  "document_type_detected": "<detected document type>",
  "income_amount": <number or null>,
  "income_currency": "<CLP|EUR|USD|null>",
  "warnings": ["<warning1>", "<warning2>"],
  "recommendation": "<brief recommendation for the reviewer>",
  "is_valid": <true|false>,
  "extracted_data": {
    "name": "<name if found>",
    "document_number": "<ID/RUT/DNI if found>",
    "expiry_date": "<expiry date if found>",
    "employer": "<employer name if found>",
    "salary": "<salary string if found>"
  }
}`;

    let content: Anthropic.MessageParam["content"];
    if (isImage) {
      const mediaType = doc.mime_type as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      content = [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64File } },
        { type: "text", text: "Please analyze this document and respond with JSON only." },
      ];
    } else if (isPdf) {
      content = [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64File },
        } as unknown as Anthropic.TextBlockParam,
        { type: "text", text: "Please analyze this document and respond with JSON only." },
      ];
    } else {
      // Unsupported format — mark as needs manual review
      await updateDocument(documentId, {
        readability: "unclear",
        completeness: 0,
        document_type_detected: "Unknown (unsupported format)",
        income_amount: null,
        income_currency: null,
        warnings: ["Formato de archivo no soportado para análisis automático — revisión manual necesaria"],
        recommendation: "Revisar manualmente",
        is_valid: false,
        extracted_data: {},
      });
      return new Response(JSON.stringify({ ok: true, skipped: true }));
    }

    // 4. Call Claude
    const message = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "";
    // Extract JSON from response (handle potential markdown code fences)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in Claude response");

    const analysis = JSON.parse(jsonMatch[0]) as AiAnalysis;

    // 5. Update document with analysis
    await updateDocument(documentId, analysis);

    // 6. If document is clear and valid, auto-mark as verified; otherwise leave as pending
    if (analysis.is_valid && analysis.readability === "clear" && analysis.completeness >= 80) {
      await setDocumentStatus(documentId, "verified");
    } else if (!analysis.is_valid || analysis.readability === "unclear") {
      await setDocumentStatus(documentId, "needs_correction");
    }

    return new Response(JSON.stringify({ ok: true, analysis }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[analyze-document] Error:", err);
    // Mark as pending so admin can review manually
    try {
      await setDocumentStatus(documentId!, "pending");
    } catch {}
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

async function updateDocument(documentId: string, analysis: AiAnalysis) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/property_application_documents?id=eq.${documentId}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ ai_analysis: analysis }),
    }
  );
}

async function setDocumentStatus(documentId: string, status: string) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/property_application_documents?id=eq.${documentId}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ status }),
    }
  );
}
