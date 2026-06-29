import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !["admin", "owner"].includes(profile.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const supabase = createAdminClient() as any;

    // Demo client IDs (same as migration)
    const demoClients = [
      {
        id: "10000000-demo-0001-0000-000000000001",
        email: "maria.martinez@example.com",
        firstName: "María",
        lastName: "Martínez",
      },
      {
        id: "10000000-demo-0002-0000-000000000002",
        email: "carlos.lopez@example.com",
        firstName: "Carlos",
        lastName: "López",
      },
      {
        id: "10000000-demo-0003-0000-000000000003",
        email: "anna.garcia@example.com",
        firstName: "Anna",
        lastName: "García",
      },
    ];

    // Property IDs
    const demoPropId1 = "20000000-demo-prop-0001-000000000001";
    const demoPropId2 = "20000000-demo-prop-0002-000000000002";

    // Get admin ID for reviewed_by
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", "admin@zinto.app")
      .single();

    const adminId = adminProfile?.id;

    // Delete existing demo applications
    await supabase
      .from("property_applications")
      .delete()
      .in("client_id", demoClients.map((c) => c.id));

    // Create 3 property applications with different states
    const applications = [
      {
        id: "30000000-demo-app-0001-000000000001",
        property_id: demoPropId1,
        client_id: demoClients[0].id,
        country: "ES",
        operation: "rent",
        status: "approved",
        submitted_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        reviewed_by: adminId,
        reviewed_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        review_notes:
          "Excelente candidata. Ingresos verificados y referencias positivas.",
        move_in_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
      },
      {
        id: "30000000-demo-app-0002-000000000002",
        property_id: demoPropId2,
        client_id: demoClients[1].id,
        country: "CL",
        operation: "sale",
        status: "pending_review",
        submitted_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
      },
      {
        id: "30000000-demo-app-0003-000000000003",
        property_id: demoPropId1,
        client_id: demoClients[2].id,
        country: "ES",
        operation: "rent",
        status: "draft",
        submitted_at: null,
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
      },
    ];

    // Insert applications
    for (const app of applications) {
      await supabase.from("property_applications").insert(app);
    }

    // Get document types
    const { data: docTypes } = await supabase
      .from("property_application_document_types")
      .select("id, document_key, display_name, country, operation")
      .in("country", ["ES", "CL"]);

    // Create documents for App 1 (Approved - all verified)
    const esRentDocs = docTypes?.filter(
      (d) => d.country === "ES" && d.operation === "rent"
    ) || [];
    for (const docType of esRentDocs.slice(0, 5)) {
      await supabase.from("property_application_documents").insert({
        id: crypto.randomUUID(),
        property_application_id: applications[0].id,
        document_type_id: docType.id,
        file_name: `doc_${docType.document_key}.pdf`,
        storage_path: `ES/rent/${docType.document_key}.pdf`,
        file_url: "https://example.com/doc.pdf",
        file_size: 125000,
        mime_type: "application/pdf",
        status: "verified",
        verification_notes: "Documento claro y vigente",
        ai_analysis: {
          readability: "clear",
          completeness: 100,
          document_type_detected: docType.display_name,
          extracted_data: { status: "verified" },
          warnings: [],
        },
        verified_by: adminId,
        verification_timestamp: new Date(
          Date.now() - 1 * 24 * 60 * 60 * 1000
        ).toISOString(),
      });
    }

    // Create documents for App 2 (Pending - some pending)
    const clSaleDocs = docTypes?.filter(
      (d) => d.country === "CL" && d.operation === "sale"
    ) || [];
    for (const docType of clSaleDocs.slice(0, 2)) {
      await supabase.from("property_application_documents").insert({
        id: crypto.randomUUID(),
        property_application_id: applications[1].id,
        document_type_id: docType.id,
        file_name: `doc_${docType.document_key}.pdf`,
        storage_path: `CL/sale/${docType.document_key}.pdf`,
        file_url: "https://example.com/doc.pdf",
        file_size: 98000,
        mime_type: "application/pdf",
        status: "pending",
        verification_notes: null,
        ai_analysis: {
          readability: "partially_clear",
          completeness: 75,
          document_type_detected: docType.display_name,
          extracted_data: { status: "partial" },
          warnings: ["Documento parcialmente legible"],
        },
      });
    }

    // Create scores
    const scores = [
      {
        id: crypto.randomUUID(),
        property_application_id: applications[0].id,
        total_score: 87,
        income_score: 50,
        document_completeness_score: 20,
        document_quality_score: 10,
        history_score: 7,
        ai_recommendation: "strong_approve",
        ai_summary:
          "Candidata excelente con ingresos verificados y referencias positivas.",
        currency_context: "€2.800/mes neto (4.2x la renta)",
      },
      {
        id: crypto.randomUUID(),
        property_application_id: applications[1].id,
        total_score: 65,
        income_score: 35,
        document_completeness_score: 15,
        document_quality_score: 10,
        history_score: 5,
        ai_recommendation: "review",
        ai_summary:
          "Candidato solvente pero requiere revisión de algunos documentos.",
        currency_context: "$3.500.000 CLP/mes neto (3.1x renta)",
      },
      {
        id: crypto.randomUUID(),
        property_application_id: applications[2].id,
        total_score: 0,
        income_score: 0,
        document_completeness_score: 0,
        document_quality_score: 0,
        history_score: 0,
        ai_recommendation: "pending",
        ai_summary: "Solicitud en borrador - documentación no iniciada.",
        currency_context: "",
      },
    ];

    for (const score of scores) {
      await supabase.from("property_application_scores").insert(score);
    }

    return Response.json({
      ok: true,
      message: "Demo applications created successfully",
      applications: applications.map((a) => ({
        id: a.id,
        status: a.status,
        country: a.country,
        operation: a.operation,
        clientId: a.client_id,
      })),
    });
  } catch (error) {
    console.error("Error creating demo applications:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
