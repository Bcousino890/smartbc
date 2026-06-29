-- Contact requests from the public portal contact form
CREATE TABLE IF NOT EXISTS contact_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  country_interest TEXT,
  subject     TEXT,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'read', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_requests_status_idx ON contact_requests(status);
CREATE INDEX IF NOT EXISTS contact_requests_created_at_idx ON contact_requests(created_at DESC);
