/**
 * Edge function: analyze-property-application-document
 *
 * Called after a document is uploaded. Downloads the file from storage,
 * sends to OpenRouter (google/gemini-flash-1.5) for analysis, and updates
 * the property_application_documents row with ai_analysis JSONB.
 *
 * Invoke via: POST /functions/v1/analyze-property-application-document
 * Body: { document_id: string }
 *
 * Env vars required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

// Cheap model with vision support — ~$0.075/M tokens
const MODEL = "google/gemini-flash-1.5";

interface DocumentRow {
  id: string;
  file_url: string;
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
      `${SUPABASE_URL}/rest/v1/property_application_documents?id=eq.${documentId}&select=id,file_url,mime_type,property_applications(country,operation),property_application_document_types(display_name,validation_rules,help_text)`,
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
      ? "All monetary values should be in Chilean Pesos (CLP). Flag if USD or EUR is detected."
      : "All monetary values should be in Euros (EUR).";

    const systemPrompt = `You are a real estate document verification expert for ${countryLabel}.
Analyze the provided document of type "${docType.display_name}" for a ${app.operation === "rent" ? "rental" : "purchase"} application.

${currencyNote}
${docType.validation_rules ? `Validation requirements: ${JSON.stringify(docType.validation_rules)}` : ""}
${docType.help_text ? `Context: ${docType.help_text}` : ""}

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "readability": "clear" | "partially_clear" | "unclear",
  "completeness": <number 0-100>,
  "document_type_detected": "<detected document type>",
  "income_amount": <number or null>,
  "income_currency": "<CLP|EUR|USD|null>",
  "warnings": ["<warning1>"],
  "recommendation": "<brief recommendation for the reviewer>",
  "is_valid": <true|false>,
  "extracted_data": {
    "name": "<if found>",
    "document_number": "<ID/RUT/DNI if found>",
    "expiry_date": "<if found>",
    "employer": "<if found>",
    "salary": "<salary string if found>"
  }
}`;

    // 2. Build message content — use image for supported types, text for others
    const isImage = doc.mime_type.startsWith("image/");
    const isPdf = doc.mime_type === "application/pdf";

    let messageContent: unknown[];

    if (isImage) {
      // Download and encode as base64
      const fileRes = await fetch(doc.file_url);
      if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`);
      const fileBytes = await fileRes.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBytes)));
      messageContent = [
        {
          type: "image_url",
          image_url: { url: `data:${doc.mime_type};base64,${base64}` },
        },
        { type: "text", text: "Analyze this document and respond with JSON only." },
      ];
    } else if (isPdf) {
      // For PDFs: download, encode, pass as base64 image_url with pdf mime
      const fileRes = await fetch(doc.file_url);
      if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`);
      const fileBytes = await fileRes.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBytes)));
      // Gemini via OpenRouter supports PDF as base64 image_url
      messageContent = [
        {
          type: "image_url",
          image_url: { url: `data:application/pdf;base64,${base64}` },
        },
        { type: "text", text: "Analyze this PDF document and respond with JSON only." },
      ];
    } else {
      // Unsupported format — skip AI, mark for manual review
      await updateDocument(documentId, {
        readability: "unclear",
        completeness: 0,
        document_type_detected: "Formato no soportado",
        income_amount: null,
        income_currency: null,
        warnings: ["Formato de archivo no soportado — revisión manual necesaria"],
        recommendation: "Revisar manualmente",
        is_valid: false,
        extracted_data: {},
      });
      return new Response(JSON.stringify({ ok: true, skipped: true }));
    }

    // 3. Call OpenRouter (OpenAI-compatible endpoint)
    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://smartbc.app",
        "X-Title": "smartbc document analysis",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: messageContent },
        ],
      }),
    });

    if (!orRes.ok) {
      const errText = await orRes.text();
      throw new Error(`OpenRouter error ${orRes.status}: ${errText}`);
    }

    const orData = await orRes.json() as {
      choices: { message: { content: string } }[];
    };
    const rawText = orData.choices?.[0]?.message?.content ?? "";

    // Extract JSON (handle potential extra text)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON in response: ${rawText.slice(0, 200)}`);

    const analysis = JSON.parse(jsonMatch[0]) as AiAnalysis;

    // 4. Save analysis to DB
    await updateDocument(documentId, analysis);

    // 5. Auto-set status based on analysis
    if (analysis.is_valid && analysis.readability === "clear" && analysis.completeness >= 80) {
      await setDocumentStatus(documentId, "verified");
    } else if (!analysis.is_valid || analysis.readability === "unclear") {
      await setDocumentStatus(documentId, "needs_correction");
    }
    // else leave as "pending" for admin to review

    return new Response(JSON.stringify({ ok: true, analysis }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[analyze-document] Error:", err);
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
