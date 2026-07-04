export type ApplicationOperation = "rent" | "sale";
export type ApplicationCountry = "ES" | "CL";
export type ApplicationStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "completed";
export type DocumentStatus =
  | "pending"
  | "verified"
  | "rejected"
  | "needs_correction";
export type AnnotationType = "info" | "warning" | "error";
export type CoApplicantRole = "primary" | "co_applicant";
export type AiRecommendation =
  | "strong_approve"
  | "approve"
  | "review"
  | "reject";

export type PropertyApplicationDocumentType = {
  id: string;
  country: ApplicationCountry;
  operation: ApplicationOperation;
  document_key: string;
  display_name: string;
  description: string | null;
  accepted_formats: string[];
  max_file_size_bytes: number;
  is_required: boolean;
  validation_rules: Record<string, unknown> | null;
  icon_name: string | null;
  help_text: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type PropertyApplication = {
  id: string;
  property_id: string | null;
  client_id: string;
  country: ApplicationCountry;
  operation: ApplicationOperation;
  status: ApplicationStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  move_in_date: string | null;
  purchase_date: string | null;
  created_at: string;
  updated_at: string;
};

export type AiDocumentAnalysis = {
  readability: "clear" | "partially_clear" | "unclear";
  completeness: number;
  document_type_detected: string;
  extracted_data: Record<string, string>;
  warnings: string[];
  is_valid: boolean;
  recommendation: string;
  currency_detected?: string;
  income_amount?: number;
  income_currency?: string;
};

export type PropertyApplicationDocument = {
  id: string;
  property_application_id: string;
  document_type_id: string;
  co_applicant_id: string | null;
  file_name: string;
  storage_path: string;
  file_url: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  status: DocumentStatus;
  verification_notes: string | null;
  ai_analysis: AiDocumentAnalysis | null;
  verification_timestamp: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PropertyApplicationCoApplicant = {
  id: string;
  property_application_id: string;
  client_id: string;
  role: CoApplicantRole;
  invited_at: string;
  accepted_at: string | null;
  invite_email: string | null;
  created_at: string;
};

export type PropertyApplicationScore = {
  id: string;
  property_application_id: string;
  total_score: number;
  income_score: number;
  document_completeness_score: number;
  document_quality_score: number;
  history_score: number;
  ai_recommendation: AiRecommendation | null;
  ai_summary: string | null;
  currency_context: string | null;
  income_amount: number | null;
  income_currency: string | null;
  income_amount_eur: number | null;
  income_ratio: number | null;
  calculated_at: string;
  created_at: string;
  updated_at: string;
};

export type PropertyApplicationDocumentAnnotation = {
  id: string;
  document_id: string;
  annotation_text: string;
  annotation_type: AnnotationType;
  created_by: string;
  resolved_at: string | null;
  created_at: string;
};

// Tipos extendidos con joins (para UI)

export type PropertyApplicationWithDetails = PropertyApplication & {
  client?: {
    id: string;
    full_name: string | null;
    email: string;
    phone: string | null;
    avatar_url: string | null;
  };
  property?: {
    id: string;
    title: string;
    address: string | null;
    cover_photo_url: string | null;
    price: number | null;
    bc_reference: string | null;
  };
  documents?: PropertyApplicationDocumentWithType[];
  score?: PropertyApplicationScore;
  co_applicants?: PropertyApplicationCoApplicant[];
  document_types?: PropertyApplicationDocumentType[];
};

export type PropertyApplicationDocumentWithType = PropertyApplicationDocument & {
  document_type?: PropertyApplicationDocumentType;
  annotations?: PropertyApplicationDocumentAnnotation[];
  // URL firmada de corta duración (bucket privado). Se genera en el
  // servidor en cada lectura y sustituye a file_url para visualizar/abrir
  // el archivo — null si aún no se ha podido generar (p.ej. falta el
  // objeto en storage).
  signed_url?: string | null;
};

// Tipos para checklist de cliente (solo lo necesario por privacidad)
export type ClientChecklistItem = {
  document_type: PropertyApplicationDocumentType;
  document: PropertyApplicationDocument | null;
  is_own: boolean; // false si pertenece a co-solicitante
};

// Resumen para el dueño (sin documentos crudos)
export type OwnerCandidateSummary = {
  application_id: string;
  client_name: string;
  operation: ApplicationOperation;
  country: ApplicationCountry;
  score: number;
  ai_recommendation: AiRecommendation | null;
  ai_summary: string | null;
  income_amount: number | null;
  income_currency: string | null;
  income_amount_eur: number | null;
  income_ratio: number | null;
  currency_context: string | null;
  document_completeness_pct: number;
  has_references: boolean;
  employment_type: string | null;
  submitted_at: string | null;
  co_applicant_count: number;
};

export type UploadDocumentResult = {
  ok: boolean;
  document_id?: string;
  file_url?: string;
  error?: string;
};

export type VerifyDocumentInput = {
  status: "verified" | "rejected" | "needs_correction";
  notes?: string;
};

export type SubmitApplicationResult = {
  ok: boolean;
  error?: string;
};
