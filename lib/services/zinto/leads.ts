// ============================================================
// Zinto Leads / Campaigns / Sync — API client
// ============================================================
// Outbound calls from the SmartBC CRM to the Zinto leads platform. All writes
// send an Idempotency-Key so retries never create duplicates. Endpoints and
// payloads follow Zinto's technical response (crm.zinto.app/api/v1).
// ============================================================

import { zintoFetch } from './client';

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface ZintoCampaignInput {
  /** Campaign id in our CRM (used for idempotent upserts / dedupe). */
  external_id: string;
  name: string;
  objective?: string;
  market: {
    country: string; // ISO-2, e.g. "ES" | "CL"
    city?: string;
    region?: string;
  };
  vertical?: string;
  source?: string;
  rules?: {
    min_score?: number;
    require_phone?: boolean;
    require_email?: boolean;
    dedupe_strategy?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface ZintoCampaignResult {
  status: string; // "created" | "updated" | ...
  campaign: {
    id: string;
    external_id?: string;
    name: string;
    status: string;
    created_at?: string;
    updated_at?: string;
  };
}

export interface ZintoLeadInput {
  external_id: string;
  campaign_id?: string;
  campaign_external_id?: string;
  source?: string;
  person?: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
  };
  company?: {
    name?: string;
    website?: string;
  };
  contact: {
    phone?: string;
    whatsapp?: string;
    email?: string;
  };
  location?: {
    country?: string;
    city?: string;
  };
  qualification?: {
    score?: number;
    status?: string;
    notes?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface ZintoLeadResult {
  status: string; // "created" | "updated"
  lead: {
    id: string;
    external_id?: string;
    campaign_id?: string;
    sync_status?: string;
    created_at?: string;
    updated_at?: string;
  };
}

export interface ZintoSyncPreviewInput {
  direction?: 'zinto_to_crm' | 'crm_to_zinto';
  target: {
    type: 'webhook' | 'api';
    name: string;
    url?: string;
  };
  campaign_external_id?: string;
  campaign_id?: string;
  filters?: {
    lead_status?: string[];
    min_score?: number;
    only_not_synced?: boolean;
  };
  mapping_version?: string;
}

export interface ZintoSyncPreviewResult {
  status: string;
  preview_id: string;
  summary: {
    total_candidates: number;
    valid: number;
    duplicates: number;
    invalid: number;
  };
  invalid_records?: Array<{
    lead_id: string;
    error_code: string;
    field?: string;
    message?: string;
  }>;
  expires_at?: string;
}

export interface ZintoSyncExecuteInput {
  preview_id: string;
  mode?: 'execute_valid_records' | string;
  approval: {
    approved_by: string;
    approved_at?: string;
  };
}

export interface ZintoSyncExecuteResult {
  status: string; // "queued" | ...
  job: {
    id: string;
    type: string;
    target: string;
    record_count: number;
    state: string;
    created_at?: string;
  };
}

// ------------------------------------------------------------
// Client functions
// ------------------------------------------------------------

/** Create (or idempotently upsert) a campaign in Zinto. */
export async function createCampaign(
  input: ZintoCampaignInput,
  idempotencyKey?: string,
): Promise<ZintoCampaignResult> {
  return zintoFetch('/campaigns', {
    method: 'POST',
    idempotencyKey: idempotencyKey || `smartbc-campaign-${input.external_id}`,
    body: JSON.stringify(input),
  });
}

/** Create or update a lead in Zinto (idempotent on external_id). */
export async function upsertLead(
  input: ZintoLeadInput,
  idempotencyKey?: string,
): Promise<ZintoLeadResult> {
  return zintoFetch('/leads', {
    method: 'POST',
    idempotencyKey: idempotencyKey || `smartbc-lead-${input.external_id}`,
    body: JSON.stringify(input),
  });
}

/** Dry-run: how many leads would sync, duplicates and validation errors. */
export async function syncPreview(
  input: ZintoSyncPreviewInput,
): Promise<ZintoSyncPreviewResult> {
  return zintoFetch('/sync/preview', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Execute a previously previewed sync. Idempotent on the preview id. */
export async function syncExecute(
  input: ZintoSyncExecuteInput,
  idempotencyKey?: string,
): Promise<ZintoSyncExecuteResult> {
  return zintoFetch('/sync/execute', {
    method: 'POST',
    // Stable key derived from the (single-use) preview id so a retry of the
    // SAME execution is deduped by Zinto instead of running the sync twice.
    idempotencyKey: idempotencyKey || `smartbc-sync-${input.preview_id}`,
    body: JSON.stringify({
      preview_id: input.preview_id,
      mode: input.mode || 'execute_valid_records',
      approval: { approved_at: new Date().toISOString(), ...input.approval },
    }),
  });
}

// ------------------------------------------------------------
// Sync job status / per-record results
// ------------------------------------------------------------

export interface ZintoSyncJobStatus {
  job: {
    id: string;
    type?: string;
    state: string; // queued | running | completed | completed_with_errors | failed | cancelled
    campaign_id?: string;
    target?: string;
    created_at?: string;
    started_at?: string;
    finished_at?: string;
  };
  summary?: {
    total?: number;
    accepted?: number;
    duplicates?: number;
    failed?: number;
    pending?: number;
  };
}

export interface ZintoSyncJobRecord {
  lead_id: string;
  external_id?: string;
  status: string; // pending | sent | accepted | duplicate | rejected | failed | retrying
  crm_record_id?: string;
  attempts?: number;
  last_error?: { code?: string; message?: string } | null;
}

export interface ZintoSyncJobRecordsResult {
  data: ZintoSyncJobRecord[];
  pagination?: { limit?: number; next_cursor?: string | null };
}

/** Poll the status + summary of a sync job created by syncExecute(). */
export async function getSyncJob(jobId: string): Promise<ZintoSyncJobStatus> {
  return zintoFetch(`/sync/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' });
}

/** Fetch the per-record outcome of a sync job (cursor-paginated). */
export async function getSyncJobRecords(
  jobId: string,
  cursor?: string,
): Promise<ZintoSyncJobRecordsResult> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return zintoFetch(`/sync/jobs/${encodeURIComponent(jobId)}/records${qs}`, { method: 'GET' });
}
