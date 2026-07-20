-- ============================================================
-- SmartBC · Zinto webhook delivery dedupe (replay protection)
-- ============================================================
-- Stores the X-Zinto-Delivery-Id of every processed webhook so retried/replayed
-- deliveries are dropped instead of double-processed. A unique index makes the
-- insert the atomic dedupe check.
-- ============================================================

CREATE TABLE IF NOT EXISTS zinto_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_zinto_webhook_deliveries_delivery_id
  ON zinto_webhook_deliveries (delivery_id);
CREATE INDEX IF NOT EXISTS idx_zinto_webhook_deliveries_created_at
  ON zinto_webhook_deliveries (created_at DESC);

ALTER TABLE zinto_webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Admin-only (the webhook writes via the service role, which bypasses RLS).
DROP POLICY IF EXISTS "zinto_webhook_deliveries_admin_all" ON zinto_webhook_deliveries;
CREATE POLICY "zinto_webhook_deliveries_admin_all" ON zinto_webhook_deliveries
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
