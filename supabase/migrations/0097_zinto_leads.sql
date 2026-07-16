-- ============================================================
-- SmartBC · Zinto Leads / Campaigns / Sync
-- ============================================================
-- Persists the leads platform side of the Zinto integration: campaigns and
-- leads pushed to / received from Zinto, plus an audit trail of lead.* webhook
-- events and a record of sync jobs. Admin-only (RLS), like the rest of Zinto.
-- ============================================================

-- ---------- Campaigns ----------
CREATE TABLE IF NOT EXISTS zinto_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zinto_id text,                       -- Zinto's campaign id (cmp_...)
  external_id text,                    -- our CRM campaign id
  name text,
  objective text,
  country text,
  city text,
  vertical text,
  source text,
  status text,
  rules jsonb,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_zinto_campaigns_external_id
  ON zinto_campaigns (external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_zinto_campaigns_zinto_id
  ON zinto_campaigns (zinto_id) WHERE zinto_id IS NOT NULL;

-- ---------- Leads ----------
CREATE TABLE IF NOT EXISTS zinto_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zinto_id text,                       -- Zinto's lead id (lead_...)
  external_id text,                    -- our CRM lead id
  campaign_external_id text,
  campaign_zinto_id text,
  source text,
  full_name text,
  company_name text,
  website text,
  phone text,
  whatsapp text,
  email text,
  country text,
  city text,
  score integer,
  status text,                         -- lifecycle: created/qualified/approved_for_crm/...
  sync_status text,                    -- pending/accepted/rejected/...
  notes text,
  last_event text,
  raw jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_zinto_leads_external_id
  ON zinto_leads (external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_zinto_leads_zinto_id
  ON zinto_leads (zinto_id) WHERE zinto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_zinto_leads_phone ON zinto_leads (phone);
CREATE INDEX IF NOT EXISTS idx_zinto_leads_status ON zinto_leads (status);
CREATE INDEX IF NOT EXISTS idx_zinto_leads_updated_at ON zinto_leads (updated_at DESC);

-- ---------- Lead event audit ----------
CREATE TABLE IF NOT EXISTS zinto_lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  event_id text,
  lead_external_id text,
  lead_zinto_id text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zinto_lead_events_created_at
  ON zinto_lead_events (created_at DESC);
-- De-dupe repeated webhook deliveries of the same event.
CREATE UNIQUE INDEX IF NOT EXISTS uq_zinto_lead_events_event_id
  ON zinto_lead_events (event_id) WHERE event_id IS NOT NULL;

-- ---------- Sync jobs ----------
CREATE TABLE IF NOT EXISTS zinto_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zinto_job_id text,
  preview_id text,
  campaign_external_id text,
  direction text,
  state text,
  record_count integer,
  summary jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zinto_sync_jobs_created_at
  ON zinto_sync_jobs (created_at DESC);

-- ---------- updated_at triggers ----------
DROP TRIGGER IF EXISTS zinto_campaigns_updated_at ON zinto_campaigns;
CREATE TRIGGER zinto_campaigns_updated_at
  BEFORE UPDATE ON zinto_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS zinto_leads_updated_at ON zinto_leads;
CREATE TRIGGER zinto_leads_updated_at
  BEFORE UPDATE ON zinto_leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS zinto_sync_jobs_updated_at ON zinto_sync_jobs;
CREATE TRIGGER zinto_sync_jobs_updated_at
  BEFORE UPDATE ON zinto_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- RLS (admins only) ----------
ALTER TABLE zinto_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE zinto_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE zinto_lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE zinto_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zinto_campaigns_admin_all" ON zinto_campaigns;
CREATE POLICY "zinto_campaigns_admin_all" ON zinto_campaigns
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "zinto_leads_admin_all" ON zinto_leads;
CREATE POLICY "zinto_leads_admin_all" ON zinto_leads
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "zinto_lead_events_admin_all" ON zinto_lead_events;
CREATE POLICY "zinto_lead_events_admin_all" ON zinto_lead_events
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "zinto_sync_jobs_admin_all" ON zinto_sync_jobs;
CREATE POLICY "zinto_sync_jobs_admin_all" ON zinto_sync_jobs
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
