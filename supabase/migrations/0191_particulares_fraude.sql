-- ============================================================
-- SmartBC · Anuncios falsos (estafas) y contactos fraudulentos
-- ============================================================
-- Caso real (2026-10): un mismo estafador publicó 19 alquileres desde el 9-sep con el correo
-- «rodrimarob﹫hotmail com» (arroba camuflada con U+FE6B), teléfonos extranjeros o distintos en cada
-- anuncio y el texto reformulado; cada anuncio duraba horas o pocos días. Idealista los da de baja con
-- «¡Ojo! Anuncio sospechoso · Nuestro equipo de calidad lo dio de baja el …».
--
-- Estados del anuncio (particulares.fraud_status):
--   confirmed  el portal lo dio de baja por sospechoso (fraud_removed_at) o una persona lo marcó.
--   suspect    lo delatan las reglas: correo repetido con teléfonos distintos, arroba camuflada,
--              teléfono extranjero + «solo por mensaje/captura», o su teléfono/correo ya está marcado.
-- Cuando un anuncio queda marcado POR SU CUENTA (no por contagio) su teléfono y los correos de la
-- descripción pasan a fraud_contacts y marcan los demás anuncios que los usen (en cualquier portal).
-- Una persona manda siempre: fraud_manual = 'ok' (falso positivo) o 'fraud'.
-- Solo se evalúan particulares/sin clasificar: las agencias comparten correos con normalidad.
-- ============================================================

ALTER TABLE particulares ADD COLUMN IF NOT EXISTS fraud_status text;
ALTER TABLE particulares ADD COLUMN IF NOT EXISTS fraud_reasons text[];
ALTER TABLE particulares ADD COLUMN IF NOT EXISTS fraud_flagged_at timestamptz;
ALTER TABLE particulares ADD COLUMN IF NOT EXISTS fraud_removed_at date;       -- fecha de baja que da el portal
ALTER TABLE particulares ADD COLUMN IF NOT EXISTS fraud_removed_text text;     -- su frase literal
ALTER TABLE particulares ADD COLUMN IF NOT EXISTS fraud_manual text;           -- 'fraud' | 'ok' (decisión humana)
ALTER TABLE particulares ADD COLUMN IF NOT EXISTS fraud_checked_at timestamptz; -- sirve para forzar un re-análisis
ALTER TABLE particulares ADD COLUMN IF NOT EXISTS contact_emails text[];       -- correos de la descripción (normalizados)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'particulares_fraud_status_check') THEN
    ALTER TABLE particulares ADD CONSTRAINT particulares_fraud_status_check CHECK (fraud_status IN ('suspect', 'confirmed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'particulares_fraud_manual_check') THEN
    ALTER TABLE particulares ADD CONSTRAINT particulares_fraud_manual_check CHECK (fraud_manual IN ('fraud', 'ok'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS particulares_fraud_status_idx ON particulares (fraud_status) WHERE fraud_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS particulares_contact_emails_gin ON particulares USING gin (contact_emails) WHERE contact_emails IS NOT NULL;
CREATE INDEX IF NOT EXISTS particulares_phone_idx ON particulares (phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS fraud_contacts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                 text NOT NULL CHECK (kind IN ('phone', 'email')),
  value                text NOT NULL,                      -- teléfono E.164 / correo en minúsculas
  status               text NOT NULL DEFAULT 'suspect' CHECK (status IN ('confirmed', 'suspect', 'cleared')),
  reason               text,
  source_particular_id uuid REFERENCES particulares (id) ON DELETE SET NULL,
  listings_count       int NOT NULL DEFAULT 0,
  first_seen_at        timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);
ALTER TABLE fraud_contacts ENABLE ROW LEVEL SECURITY;      -- sin políticas: solo el service role

-- ---------------------------------------------------------------- helpers puros
-- Minúsculas y arroba/punto normales: el estafador camufla la arroba (﹫ U+FE6B, ＠ U+FF20) o la escribe
-- con palabras («usuario (arroba) hotmail (punto) com», «usuario [at] …»).
CREATE OR REPLACE FUNCTION fraud_norm_text(t text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT regexp_replace(
            regexp_replace(lower(translate(coalesce(t, ''), '﹫＠', '@@')),
              '([a-z0-9._%+-]{2,})\s*(?:[\(\[\{]\s*(?:arroba|at)\s*[\)\]\}]|\s+arroba\s+)\s*', '\1@', 'g'),
            '\s*(?:[\(\[\{]\s*punto\s*[\)\]\}]|\s+punto\s+)\s*', '.', 'g') $$;

-- Correos de un texto, también los escritos «usuario ﹫ hotmail. com» o «usuario@hotmail com».
CREATE OR REPLACE FUNCTION fraud_emails(t text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
$$ SELECT coalesce(array_agg(DISTINCT m[1] || '@' || m[2] || '.' || m[3]), '{}'::text[])
   FROM regexp_matches(fraud_norm_text(t),
        '([a-z0-9][a-z0-9._%+-]{1,40})\s*@\s*([a-z0-9-]+)\s*(?:\.|\s)\s*(com|es|net|org|info|eu|fr|it|de|pt|nl|co)\y', 'g') AS m $$;

CREATE OR REPLACE FUNCTION fraud_only_message(t text) RETURNS boolean LANGUAGE sql IMMUTABLE AS
$$ SELECT fraud_norm_text(t) ~ '(solo|sólo|únicamente|unicamente|exclusivamente)\s+(por\s+)?(mensaje|correo|e-?mail|email|whatsapp|escrito)|env[ií]a(me)?\s+(una\s+)?captura' $$;

-- ---------------------------------------------------------------- evaluación (BEFORE INSERT/UPDATE)
CREATE OR REPLACE FUNCTION particulares_fraud_before() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  st text := NULL;
  reasons text[] := '{}';
  own boolean := false;         -- ¿hay prueba propia (no solo contagio)?
  emails text[];
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.phone IS NOT DISTINCT FROM OLD.phone
     AND NEW.advertiser_type IS NOT DISTINCT FROM OLD.advertiser_type
     AND NEW.fraud_removed_at IS NOT DISTINCT FROM OLD.fraud_removed_at
     AND NEW.fraud_manual IS NOT DISTINCT FROM OLD.fraud_manual
     AND NEW.fraud_checked_at IS NOT DISTINCT FROM OLD.fraud_checked_at THEN
    RETURN NEW;                  -- nada que pueda cambiar el veredicto (los upserts del crawler son miles)
  END IF;

  emails := CASE WHEN NEW.description IS NULL THEN NULL ELSE fraud_emails(NEW.description) END;
  NEW.contact_emails := CASE WHEN emails IS NULL OR cardinality(emails) = 0 THEN NULL ELSE emails END;

  IF NEW.fraud_manual = 'ok' THEN                 -- una persona dijo «no es fraude»
    NEW.fraud_status := NULL; NEW.fraud_reasons := NULL; NEW.fraud_flagged_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.fraud_manual = 'fraud' THEN
    st := 'confirmed'; reasons := array_append(reasons, 'marcado_a_mano'); own := true;
  END IF;
  IF NEW.fraud_removed_at IS NOT NULL THEN
    st := 'confirmed'; reasons := array_append(reasons, 'portal_baja_sospechoso'); own := true;
  END IF;

  IF st IS NULL AND coalesce(NEW.advertiser_type, 'unknown') <> 'professional' THEN
    -- contagio: su teléfono o un correo suyo ya están marcados
    IF NEW.phone IS NOT NULL AND EXISTS (SELECT 1 FROM fraud_contacts c
          WHERE c.kind = 'phone' AND c.value = NEW.phone AND c.status IN ('confirmed', 'suspect')) THEN
      reasons := array_append(reasons, 'telefono_marcado'); st := 'suspect';
    END IF;
    IF NEW.contact_emails IS NOT NULL AND EXISTS (SELECT 1 FROM fraud_contacts c
          WHERE c.kind = 'email' AND c.value = ANY (NEW.contact_emails) AND c.status = 'confirmed') THEN
      reasons := array_append(reasons, 'correo_marcado'); st := 'confirmed';     -- el correo es del estafador
    ELSIF NEW.contact_emails IS NOT NULL AND EXISTS (SELECT 1 FROM fraud_contacts c
          WHERE c.kind = 'email' AND c.value = ANY (NEW.contact_emails) AND c.status = 'suspect') THEN
      reasons := array_append(reasons, 'correo_marcado'); st := coalesce(st, 'suspect');
    END IF;
    -- pruebas propias
    IF NEW.contact_emails IS NOT NULL AND EXISTS (SELECT 1 FROM particulares o
          WHERE o.contact_emails && NEW.contact_emails AND o.id IS DISTINCT FROM NEW.id
            AND o.phone IS DISTINCT FROM NEW.phone AND coalesce(o.fraud_manual, '') <> 'ok'
            AND coalesce(o.advertiser_type, 'unknown') <> 'professional') THEN
      reasons := array_append(reasons, 'correo_repetido'); st := 'suspect'; own := true;
    END IF;
    IF NEW.description ~ '[﹫＠]' THEN
      reasons := array_append(reasons, 'arroba_camuflada'); st := 'suspect'; own := true;
    END IF;
    IF NEW.phone IS NOT NULL AND NEW.phone !~ '^\+34'
       AND (NEW.contact_emails IS NOT NULL OR fraud_only_message(NEW.description)) THEN
      reasons := array_append(reasons, 'extranjero_y_solo_mensaje'); st := 'suspect'; own := true;
    END IF;
  END IF;

  IF st IS NULL THEN
    NEW.fraud_status := NULL; NEW.fraud_reasons := NULL; NEW.fraud_flagged_at := NULL;
  ELSE
    -- «confirmed» (portal / persona) nunca se rebaja a «suspect» por una regla
    NEW.fraud_status := CASE WHEN NEW.fraud_status = 'confirmed' AND st = 'suspect'
                                  AND NEW.fraud_removed_at IS NULL AND coalesce(NEW.fraud_manual, '') <> 'fraud'
                             THEN 'suspect' ELSE st END;
    NEW.fraud_reasons := reasons;
    NEW.fraud_flagged_at := coalesce(CASE WHEN TG_OP = 'UPDATE' THEN OLD.fraud_flagged_at END, now());
  END IF;
  RETURN NEW;
END $$;

-- ------------------------------------------- registrar contactos (AFTER) si el anuncio se marcó por su cuenta
CREATE OR REPLACE FUNCTION particulares_fraud_after() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  e text;
  st text;
BEGIN
  IF NEW.fraud_status IS NULL
     OR NOT (NEW.fraud_reasons && ARRAY['portal_baja_sospechoso', 'marcado_a_mano', 'correo_repetido',
                                        'arroba_camuflada', 'extranjero_y_solo_mensaje']) THEN
    RETURN NULL;                                   -- sin prueba propia: el contagio no se propaga más
  END IF;
  st := NEW.fraud_status;
  IF NEW.phone IS NOT NULL THEN
    INSERT INTO fraud_contacts (kind, value, status, reason, source_particular_id)
    VALUES ('phone', NEW.phone, st, NEW.fraud_reasons[1], NEW.id)
    ON CONFLICT (kind, value) DO UPDATE SET
      status = CASE WHEN fraud_contacts.status = 'cleared' THEN 'cleared'
                    WHEN EXCLUDED.status = 'confirmed' THEN 'confirmed' ELSE fraud_contacts.status END,
      updated_at = now();
  END IF;
  IF NEW.contact_emails IS NOT NULL THEN
    FOREACH e IN ARRAY NEW.contact_emails LOOP
      INSERT INTO fraud_contacts (kind, value, status, reason, source_particular_id)
      VALUES ('email', e, st, NEW.fraud_reasons[1], NEW.id)
      ON CONFLICT (kind, value) DO UPDATE SET
        status = CASE WHEN fraud_contacts.status = 'cleared' THEN 'cleared'
                      WHEN EXCLUDED.status = 'confirmed' THEN 'confirmed' ELSE fraud_contacts.status END,
        updated_at = now();
    END LOOP;
  END IF;
  RETURN NULL;
END $$;

-- ------------------------------------------- contagio hacia los anuncios que YA existían
CREATE OR REPLACE FUNCTION fraud_contacts_after() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'cleared' THEN RETURN NULL; END IF;
  IF NEW.kind = 'phone' THEN
    UPDATE particulares p SET fraud_status = 'suspect', fraud_flagged_at = now(),
           fraud_reasons = array_append(coalesce(p.fraud_reasons, '{}'), 'telefono_marcado')
    WHERE p.phone = NEW.value AND p.fraud_status IS NULL AND coalesce(p.fraud_manual, '') <> 'ok'
      AND coalesce(p.advertiser_type, 'unknown') <> 'professional';
  ELSE
    UPDATE particulares p SET fraud_status = CASE WHEN NEW.status = 'confirmed' THEN 'confirmed' ELSE 'suspect' END,
           fraud_flagged_at = coalesce(p.fraud_flagged_at, now()),
           fraud_reasons = CASE WHEN 'correo_marcado' = ANY (coalesce(p.fraud_reasons, '{}')) THEN p.fraud_reasons
                                ELSE array_append(coalesce(p.fraud_reasons, '{}'), 'correo_marcado') END
    WHERE p.contact_emails @> ARRAY[NEW.value]
      AND (p.fraud_status IS NULL OR (NEW.status = 'confirmed' AND p.fraud_status = 'suspect'))
      AND coalesce(p.fraud_manual, '') <> 'ok' AND coalesce(p.advertiser_type, 'unknown') <> 'professional';
  END IF;
  UPDATE fraud_contacts c SET listings_count = (
      SELECT count(*) FROM particulares p WHERE (NEW.kind = 'phone' AND p.phone = NEW.value)
                                              OR (NEW.kind = 'email' AND p.contact_emails @> ARRAY[NEW.value]))
  WHERE c.id = NEW.id AND pg_trigger_depth() < 3;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS particulares_fraud_before_trg ON particulares;
CREATE TRIGGER particulares_fraud_before_trg BEFORE INSERT OR UPDATE ON particulares
  FOR EACH ROW EXECUTE FUNCTION particulares_fraud_before();
DROP TRIGGER IF EXISTS particulares_fraud_after_trg ON particulares;
CREATE TRIGGER particulares_fraud_after_trg AFTER INSERT OR UPDATE ON particulares
  FOR EACH ROW EXECUTE FUNCTION particulares_fraud_after();
DROP TRIGGER IF EXISTS fraud_contacts_after_trg ON fraud_contacts;
CREATE TRIGGER fraud_contacts_after_trg AFTER INSERT OR UPDATE OF status ON fraud_contacts
  FOR EACH ROW EXECUTE FUNCTION fraud_contacts_after();

-- ---------------------------------------------------------------- acciones de una persona (service role)
CREATE OR REPLACE FUNCTION particular_fraud_mark(p_id uuid) RETURNS void LANGUAGE sql AS
$$ UPDATE particulares SET fraud_manual = 'fraud', fraud_checked_at = clock_timestamp() WHERE id = p_id $$;

-- Falso positivo: el anuncio deja de estar marcado y sus contactos dejan de marcar a otros.
CREATE OR REPLACE FUNCTION particular_fraud_clear(p_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r particulares%ROWTYPE;
BEGIN
  SELECT * INTO r FROM particulares WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE particulares SET fraud_manual = 'ok', fraud_checked_at = clock_timestamp() WHERE id = p_id;
  UPDATE fraud_contacts SET status = 'cleared', updated_at = now()
   WHERE (kind = 'phone' AND value = r.phone) OR (kind = 'email' AND value = ANY (coalesce(r.contact_emails, '{}')));
  -- los anuncios que solo estaban marcados por contagio de esos contactos se liberan
  UPDATE particulares p SET fraud_status = NULL, fraud_reasons = NULL, fraud_flagged_at = NULL
   WHERE p.fraud_status IN ('suspect', 'confirmed') AND p.fraud_reasons <@ ARRAY['telefono_marcado', 'correo_marcado']
     AND p.fraud_removed_at IS NULL AND coalesce(p.fraud_manual, '') <> 'fraud'
     AND ((p.phone = r.phone AND r.phone IS NOT NULL) OR p.contact_emails && coalesce(r.contact_emails, '{}'));
END $$;

-- Re-análisis de todos los anuncios (tras cambiar reglas o contactos). Devuelve cuántos quedaron marcados.
CREATE OR REPLACE FUNCTION particulares_fraud_rescan() RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN
  UPDATE particulares SET contact_emails = CASE WHEN cardinality(fraud_emails(description)) = 0 THEN NULL ELSE fraud_emails(description) END
   WHERE description IS NOT NULL AND coalesce(advertiser_type, 'unknown') <> 'professional';
  UPDATE particulares SET fraud_checked_at = clock_timestamp()
   WHERE coalesce(advertiser_type, 'unknown') <> 'professional';
  RETURN (SELECT count(*) FROM particulares WHERE fraud_status IS NOT NULL);
END $$;

-- Correos que el equipo ya conoce como estafa (se siembran antes del análisis inicial): todos los
-- anuncios que los usen quedan confirmados, en cualquier portal, con cualquier variante de escritura.
INSERT INTO fraud_contacts (kind, value, status, reason) VALUES
  ('email', 'rodrimarob@hotmail.com',   'confirmed', 'marcado_a_mano'),
  ('email', 'isabeltoro88@hotmail.com', 'confirmed', 'marcado_a_mano')
ON CONFLICT (kind, value) DO NOTHING;

-- Análisis inicial de lo que ya hay.
SELECT particulares_fraud_rescan();

NOTIFY pgrst, 'reload schema';
