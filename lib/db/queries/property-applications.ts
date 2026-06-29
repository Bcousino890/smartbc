import "server-only";
import { createAdminClient } from "../admin";
import { createClient } from "../server";
import type {
  ApplicationCountry,
  ApplicationOperation,
  ApplicationStatus,
  PropertyApplication,
  PropertyApplicationDocument,
  PropertyApplicationDocumentType,
  PropertyApplicationDocumentWithType,
  PropertyApplicationScore,
  PropertyApplicationWithDetails,
  VerifyDocumentInput,
} from "../../property-applications/types";

// ─── Tipos de documentos ──────────────────────────────────────────────────────

export async function getDocumentTypes(
  country: ApplicationCountry,
  operation: ApplicationOperation
): Promise<PropertyApplicationDocumentType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_application_document_types")
    .select("*")
    .eq("country", country)
    .eq("operation", operation)
    .order("display_order");
  if (error) throw error;
  return data as PropertyApplicationDocumentType[];
}

// ─── Solicitudes ──────────────────────────────────────────────────────────────

export async function getApplicationsByClient(clientId: string): Promise<PropertyApplication[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_applications")
    .select("*, property_application_scores(*)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PropertyApplication[];
}

export async function getApplicationById(
  id: string
): Promise<PropertyApplicationWithDetails | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("property_applications")
    .select(
      `*,
      property_application_scores(*),
      property_application_co_applicants(*, profiles:client_id(id, full_name, email, avatar_url)),
      property_application_documents(
        *,
        property_application_document_types(*),
        property_application_document_annotations(*)
      )`
    )
    .eq("id", id)
    .single();
  if (error) return null;
  return data as unknown as PropertyApplicationWithDetails;
}

export async function getApplicationsForAdmin(filters: {
  country?: ApplicationCountry;
  operation?: ApplicationOperation;
  status?: ApplicationStatus;
  limit?: number;
  offset?: number;
}) {
  const supabase = createAdminClient();
  let query = supabase
    .from("property_applications")
    .select(
      `*,
      profiles:client_id(id, full_name, email, avatar_url, phone),
      properties:property_id(id, title, address, cover_photo_url, price, bc_reference),
      property_application_scores(*),
      property_application_documents(id, status, document_type_id)`,
      { count: "exact" }
    )
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (filters.country) query = query.eq("country", filters.country);
  if (filters.operation) query = query.eq("operation", filters.operation);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.limit) query = query.limit(filters.limit);
  if (filters.offset) query = query.range(filters.offset, (filters.offset + (filters.limit ?? 50)) - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}

export async function getApplicationsForProperty(propertyId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("property_applications")
    .select(
      `*,
      profiles:client_id(id, full_name, email, avatar_url),
      property_application_scores(*),
      property_application_co_applicants(id, client_id, role)`
    )
    .eq("property_id", propertyId)
    .in("status", ["pending_review", "approved"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createApplication(input: {
  client_id: string;
  country: ApplicationCountry;
  operation: ApplicationOperation;
  property_id?: string;
}): Promise<PropertyApplication> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("property_applications")
    .insert({
      client_id: input.client_id,
      country: input.country,
      operation: input.operation,
      property_id: input.property_id ?? null,
      status: "draft",
    })
    .select()
    .single();
  if (error) throw error;
  return data as PropertyApplication;
}

export async function submitApplicationForReview(id: string): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("property_applications")
    .update({ status: "pending_review", submitted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function approveApplication(
  id: string,
  reviewerId: string,
  notes?: string
): Promise<void> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("property_applications")
    .update({
      status: "approved",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_notes: notes ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function rejectApplication(
  id: string,
  reviewerId: string,
  notes: string
): Promise<void> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("property_applications")
    .update({
      status: "rejected",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_notes: notes,
    })
    .eq("id", id);
  if (error) throw error;
}

// ─── Documentos ──────────────────────────────────────────────────────────────

export async function getDocumentsForApplication(
  applicationId: string,
  coApplicantId?: string
): Promise<PropertyApplicationDocumentWithType[]> {
  const supabase = await createClient();
  let query = supabase
    .from("property_application_documents")
    .select("*, property_application_document_types(*), property_application_document_annotations(*)")
    .eq("property_application_id", applicationId)
    .order("created_at");

  // Si hay un co-solicitante, filtra solo sus docs
  if (coApplicantId) {
    query = query.eq("co_applicant_id", coApplicantId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as PropertyApplicationDocumentWithType[];
}

export async function insertDocument(input: {
  property_application_id: string;
  document_type_id: string;
  co_applicant_id?: string;
  file_name: string;
  storage_path: string;
  file_url: string;
  file_size?: number;
  mime_type?: string;
}): Promise<PropertyApplicationDocument> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("property_application_documents")
    .insert({
      property_application_id: input.property_application_id,
      document_type_id: input.document_type_id,
      co_applicant_id: input.co_applicant_id ?? null,
      file_name: input.file_name,
      storage_path: input.storage_path,
      file_url: input.file_url,
      file_size: input.file_size ?? null,
      mime_type: input.mime_type ?? null,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data as PropertyApplicationDocument;
}

export async function updateDocumentAiAnalysis(
  documentId: string,
  aiAnalysis: Record<string, unknown>
): Promise<void> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("property_application_documents")
    .update({ ai_analysis: aiAnalysis })
    .eq("id", documentId);
  if (error) throw error;
}

export async function verifyDocument(
  documentId: string,
  verifierId: string,
  input: VerifyDocumentInput
): Promise<void> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("property_application_documents")
    .update({
      status: input.status,
      verification_notes: input.notes ?? null,
      verified_by: verifierId,
      verification_timestamp: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (error) throw error;
}

export async function deleteDocument(documentId: string): Promise<string | null> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("property_application_documents")
    .delete()
    .eq("id", documentId)
    .select("storage_path")
    .single();
  if (error) throw error;
  return (data as { storage_path: string } | null)?.storage_path ?? null;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export async function upsertScore(
  applicationId: string,
  score: Omit<PropertyApplicationScore, "id" | "property_application_id" | "created_at" | "updated_at" | "calculated_at">
): Promise<void> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("property_application_scores")
    .upsert({
      property_application_id: applicationId,
      ...score,
      calculated_at: new Date().toISOString(),
    }, { onConflict: "property_application_id" });
  if (error) throw error;
}

// ─── Anotaciones ─────────────────────────────────────────────────────────────

export async function addAnnotation(input: {
  document_id: string;
  annotation_text: string;
  annotation_type: "info" | "warning" | "error";
  created_by: string;
}): Promise<void> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("property_application_document_annotations")
    .insert(input);
  if (error) throw error;
}

export async function resolveAnnotation(annotationId: string): Promise<void> {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("property_application_document_annotations")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", annotationId);
  if (error) throw error;
}

// ─── Co-solicitantes ─────────────────────────────────────────────────────────

export async function addCoApplicant(input: {
  property_application_id: string;
  invite_email: string;
}): Promise<void> {
  const supabase = await createClient();

  // Busca si el email ya tiene un perfil
  const adminSupabase = createAdminClient();
  const { data: profileData } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("email", input.invite_email)
    .single();
  const profile = profileData as { id: string } | null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("property_application_co_applicants")
    .insert({
      property_application_id: input.property_application_id,
      client_id: profile?.id ?? null,
      invite_email: input.invite_email,
      role: "co_applicant",
    });
  if (error) throw error;
}

export async function acceptCoApplicantInvite(
  applicationId: string,
  clientId: string
): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("property_application_co_applicants")
    .update({ accepted_at: new Date().toISOString(), client_id: clientId })
    .eq("property_application_id", applicationId)
    .is("accepted_at", null);
  if (error) throw error;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function getApplicationDocumentProgress(applicationId: string): Promise<{
  total: number;
  required: number;
  uploaded: number;
  required_uploaded: number;
  verified: number;
  pct: number;
}> {
  const supabase = await createClient();

  // Obtener tipos requeridos para el país/operación de esta solicitud
  const { data: appRaw } = await supabase
    .from("property_applications")
    .select("country, operation")
    .eq("id", applicationId)
    .single();
  const app = appRaw as { country: string; operation: string } | null;

  if (!app) return { total: 0, required: 0, uploaded: 0, required_uploaded: 0, verified: 0, pct: 0 };

  const [{ data: docTypesRaw }, { data: docsRaw }] = await Promise.all([
    supabase
      .from("property_application_document_types")
      .select("id, is_required")
      .eq("country", app.country)
      .eq("operation", app.operation),
    supabase
      .from("property_application_documents")
      .select("document_type_id, status")
      .eq("property_application_id", applicationId),
  ]);
  const docTypes = docTypesRaw as { id: string; is_required: boolean }[] | null;
  const docs = docsRaw as { document_type_id: string; status: string }[] | null;

  const total = docTypes?.length ?? 0;
  const required = docTypes?.filter((t) => t.is_required).length ?? 0;
  const uploadedIds = new Set(docs?.map((d) => d.document_type_id) ?? []);
  const uploaded = uploadedIds.size;
  const required_uploaded = (docTypes ?? [])
    .filter((t) => t.is_required && uploadedIds.has(t.id)).length;
  const verified = docs?.filter((d) => d.status === "verified").length ?? 0;
  const pct = total > 0 ? Math.round((uploaded / total) * 100) : 0;

  return { total, required, uploaded, required_uploaded, verified, pct };
}
