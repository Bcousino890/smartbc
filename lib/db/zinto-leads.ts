import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface ZintoCampaignRecord {
  id: string;
  zinto_id?: string | null;
  external_id?: string | null;
  name?: string | null;
  objective?: string | null;
  country?: string | null;
  city?: string | null;
  vertical?: string | null;
  source?: string | null;
  status?: string | null;
  rules?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string;
}

export interface ZintoLeadRecord {
  id: string;
  zinto_id?: string | null;
  external_id?: string | null;
  campaign_external_id?: string | null;
  campaign_zinto_id?: string | null;
  source?: string | null;
  full_name?: string | null;
  company_name?: string | null;
  website?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  country?: string | null;
  city?: string | null;
  score?: number | null;
  status?: string | null;
  sync_status?: string | null;
  notes?: string | null;
  last_event?: string | null;
  raw?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string;
}

/** Shape of a `lead.*` webhook payload from Zinto. */
export interface ZintoLeadEventPayload {
  event?: string;
  event_id?: string;
  occurred_at?: string;
  campaign?: {
    id?: string;
    external_id?: string;
    name?: string;
  };
  lead?: {
    id?: string;
    external_id?: string;
    status?: string;
    score?: number;
    person?: { full_name?: string; first_name?: string; last_name?: string };
    company?: { name?: string; website?: string };
    contact?: { phone?: string; whatsapp?: string; email?: string };
    location?: { country?: string; city?: string };
  };
  sync?: {
    status?: string;
    target?: string;
    mapping_version?: string;
  };
}

export interface LeadWebhookResult {
  status: 'accepted' | 'duplicate' | 'received';
  crm_record_id?: string;
  crm_event_id?: string;
  duplicate_key?: string;
  message: string;
}

// ------------------------------------------------------------
// Campaign upsert
// ------------------------------------------------------------

async function upsertCampaignFromEvent(
  campaign: NonNullable<ZintoLeadEventPayload['campaign']>,
): Promise<string | null> {
  if (!campaign.external_id && !campaign.id) return null;
  const supabase = getSupabaseClient();

  const match = campaign.external_id
    ? { column: 'external_id', value: campaign.external_id }
    : { column: 'zinto_id', value: campaign.id! };

  const { data: existing } = await supabase
    .from('zinto_campaigns')
    .select('id')
    .eq(match.column, match.value)
    .maybeSingle();

  const row = {
    zinto_id: campaign.id ?? null,
    external_id: campaign.external_id ?? null,
    name: campaign.name ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from('zinto_campaigns').update(row).eq('id', existing.id);
    return existing.id;
  }
  const { data: inserted } = await supabase
    .from('zinto_campaigns')
    .insert(row)
    .select('id')
    .single();
  return inserted?.id ?? null;
}

// ------------------------------------------------------------
// Lead upsert from webhook
// ------------------------------------------------------------

/**
 * Handle an inbound `lead.*` webhook: upsert the campaign + lead, record the
 * event for audit, and return the ack Zinto expects. Matching is by our
 * `external_id` first, then Zinto's `zinto_id`, then phone — so events for a
 * lead we already know update it in place instead of duplicating.
 */
export async function handleLeadWebhookEvent(
  eventName: string,
  payload: ZintoLeadEventPayload,
): Promise<LeadWebhookResult> {
  const supabase = getSupabaseClient();
  const lead = payload.lead || {};
  const contact = lead.contact || {};

  if (payload.campaign) {
    await upsertCampaignFromEvent(payload.campaign);
  }

  // Resolve an existing lead (external_id → zinto_id → phone).
  let existing: { id: string } | null = null;
  let matchedBy: string | undefined;
  if (lead.external_id) {
    const { data } = await supabase
      .from('zinto_leads')
      .select('id')
      .eq('external_id', lead.external_id)
      .maybeSingle();
    if (data) {
      existing = data;
      matchedBy = 'external_id';
    }
  }
  if (!existing && lead.id) {
    const { data } = await supabase
      .from('zinto_leads')
      .select('id')
      .eq('zinto_id', lead.id)
      .maybeSingle();
    if (data) {
      existing = data;
      matchedBy = 'zinto_id';
    }
  }
  if (!existing && contact.phone) {
    const { data } = await supabase
      .from('zinto_leads')
      .select('id')
      .eq('phone', contact.phone)
      .maybeSingle();
    if (data) {
      existing = data;
      matchedBy = 'phone';
    }
  }

  const row: Record<string, unknown> = {
    zinto_id: lead.id ?? null,
    external_id: lead.external_id ?? null,
    campaign_external_id: payload.campaign?.external_id ?? null,
    campaign_zinto_id: payload.campaign?.id ?? null,
    full_name: lead.person?.full_name ?? null,
    company_name: lead.company?.name ?? null,
    website: lead.company?.website ?? null,
    phone: contact.phone ?? null,
    whatsapp: contact.whatsapp ?? null,
    email: contact.email ?? null,
    country: lead.location?.country ?? null,
    city: lead.location?.city ?? null,
    score: typeof lead.score === 'number' ? lead.score : null,
    status: lead.status ?? eventName.replace(/^lead\./, ''),
    sync_status: payload.sync?.status ?? null,
    last_event: eventName,
    raw: payload as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };

  let leadRecordId: string | undefined;
  if (existing) {
    // Only overwrite columns we actually received (don't null out known data).
    const patch = Object.fromEntries(
      Object.entries(row).filter(([, v]) => v !== null && v !== undefined),
    );
    await supabase.from('zinto_leads').update(patch).eq('id', existing.id);
    leadRecordId = existing.id;
  } else {
    const { data: inserted } = await supabase
      .from('zinto_leads')
      .insert(row)
      .select('id')
      .single();
    leadRecordId = inserted?.id;
  }

  // Audit trail of the raw event (best-effort; never block the ack on this).
  try {
    await supabase.from('zinto_lead_events').insert({
      event: eventName,
      event_id: payload.event_id ?? null,
      lead_external_id: lead.external_id ?? null,
      lead_zinto_id: lead.id ?? null,
      payload: payload as unknown as Record<string, unknown>,
    });
  } catch {
    // ignore audit failures
  }

  // A create-type event for a lead we already had is reported as a duplicate.
  const isCreateEvent = eventName === 'lead.created' || eventName === 'lead.approved_for_crm';
  if (existing && isCreateEvent) {
    return {
      status: 'duplicate',
      crm_record_id: leadRecordId,
      duplicate_key: matchedBy,
      message: 'El lead ya existe en SmartBC',
    };
  }

  return {
    status: 'accepted',
    crm_record_id: leadRecordId,
    crm_event_id: payload.event_id,
    message: 'Lead recibido correctamente',
  };
}

// ------------------------------------------------------------
// Sync job events (sync.job.completed / sync.job.failed)
// ------------------------------------------------------------

export interface ZintoSyncEventPayload {
  event?: string;
  event_id?: string;
  occurred_at?: string;
  job?: {
    id?: string;
    type?: string;
    state?: string;
    target?: string;
    campaign_id?: string;
    campaign_external_id?: string;
    record_count?: number;
    direction?: string;
  };
  summary?: {
    total?: number;
    accepted?: number;
    duplicates?: number;
    failed?: number;
    pending?: number;
  };
}

/**
 * Handle a `sync.*` webhook: upsert the job row (matched by Zinto's job id)
 * with its latest state + summary so the CRM can show sync outcomes.
 */
export async function handleSyncWebhookEvent(
  eventName: string,
  payload: ZintoSyncEventPayload,
): Promise<LeadWebhookResult> {
  const job = payload.job || {};
  if (!job.id) {
    return { status: 'received', message: 'Sync event without job id ignored' };
  }
  const supabase = getSupabaseClient();

  const { data: existing } = await supabase
    .from('zinto_sync_jobs')
    .select('id')
    .eq('zinto_job_id', job.id)
    .maybeSingle();

  const row = {
    zinto_job_id: job.id,
    campaign_external_id: job.campaign_external_id ?? null,
    direction: job.direction ?? null,
    state: job.state ?? eventName.replace(/^sync\.job\./, ''),
    record_count: typeof job.record_count === 'number' ? job.record_count : null,
    summary: (payload.summary ?? null) as Record<string, unknown> | null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from('zinto_sync_jobs').update(row).eq('id', existing.id);
  } else {
    await supabase.from('zinto_sync_jobs').insert(row);
  }

  return {
    status: 'accepted',
    crm_event_id: payload.event_id,
    message: 'Sync event recorded',
  };
}

// ------------------------------------------------------------
// Reads for the admin UI
// ------------------------------------------------------------

export async function getLeads(limit = 50, offset = 0): Promise<ZintoLeadRecord[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('zinto_leads')
    .select('*')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`Failed to fetch leads: ${error.message}`);
  return (data as ZintoLeadRecord[]) || [];
}

export async function getCampaigns(limit = 50, offset = 0): Promise<ZintoCampaignRecord[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('zinto_campaigns')
    .select('*')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`Failed to fetch campaigns: ${error.message}`);
  return (data as ZintoCampaignRecord[]) || [];
}
