-- ============================================================
-- SmartBC · El encargo del cliente, completo (venta y alquiler)
-- ============================================================
-- "Nuevo cliente" y "El encargo del cliente" pasan a ser el MISMO formulario
-- (components/admin/clientes/encargo/encargo-form.tsx), y el catálogo de
-- campos vive en lib/clients/brief.ts. Estas columnas son lo que faltaba para
-- que el encargo recoja todo lo que un agente pregunta en la primera llamada y
-- para que getSuggestedProperties() lo use para cruzar.
--
-- Qué aplica a qué operación lo decide lib/clients/brief.ts
-- (buildPreferencesPayload): lo que no aplica se guarda como NULL. En venta no
-- hay estudiantes ni estancia ni avales; en alquiler no hay hipoteca ni obra
-- nueva.
--
-- Todo es nullable / vacío por defecto: NULL es "no se ha preguntado", nunca
-- "no". Las CHECK van en línea con el ADD COLUMN IF NOT EXISTS para que
-- relanzar la migración (scripts/post-deploy.sh las relanza todas) no falle.
-- ============================================================

ALTER TABLE client_preferences
  -- Común
  ADD COLUMN IF NOT EXISTS property_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS subzones text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS zones_flexible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_price_flex_pct integer
    CHECK (max_price_flex_pct IS NULL OR max_price_flex_pct BETWEEN 0 AND 50),
  ADD COLUMN IF NOT EXISTS min_floor integer
    CHECK (min_floor IS NULL OR min_floor BETWEEN 0 AND 40),
  ADD COLUMN IF NOT EXISTS must_have text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nice_to_have text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS urgency text
    CHECK (urgency IS NULL OR urgency IN ('now', '1m', '3m', '6m', 'browsing')),
  ADD COLUMN IF NOT EXISTS children integer
    CHECK (children IS NULL OR children >= 0),
  ADD COLUMN IF NOT EXISTS monthly_income numeric(12, 2)
    CHECK (monthly_income IS NULL OR monthly_income >= 0),
  ADD COLUMN IF NOT EXISTS employment text
    CHECK (employment IS NULL OR employment IN (
      'permanent', 'temporary', 'self_employed', 'civil_servant',
      'student', 'retired', 'company', 'foreign_income')),
  ADD COLUMN IF NOT EXISTS dealbreakers text,
  ADD COLUMN IF NOT EXISTS viewing_availability text,
  -- Solo alquiler
  ADD COLUMN IF NOT EXISTS stay_months integer
    CHECK (stay_months IS NULL OR stay_months BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS furnished text
    CHECK (furnished IS NULL OR furnished IN ('furnished', 'unfurnished')),
  ADD COLUMN IF NOT EXISTS pet_details text,
  ADD COLUMN IF NOT EXISTS guarantees text[] NOT NULL DEFAULT '{}',
  -- Solo venta
  ADD COLUMN IF NOT EXISTS purchase_purpose text
    CHECK (purchase_purpose IS NULL OR purchase_purpose IN (
      'primary', 'second', 'investment_rent', 'investment_flip')),
  ADD COLUMN IF NOT EXISTS financing text
    CHECK (financing IS NULL OR financing IN (
      'cash', 'mortgage_approved', 'mortgage_in_progress',
      'mortgage_needed', 'sell_to_buy')),
  ADD COLUMN IF NOT EXISTS down_payment numeric(14, 2)
    CHECK (down_payment IS NULL OR down_payment >= 0),
  ADD COLUMN IF NOT EXISTS condition_pref text
    CHECK (condition_pref IS NULL OR condition_pref IN (
      'move_in', 'renovated', 'to_renovate')),
  ADD COLUMN IF NOT EXISTS new_build text
    CHECK (new_build IS NULL OR new_build IN ('only_new', 'only_resale')),
  ADD COLUMN IF NOT EXISTS accepts_tenanted boolean;

-- La estancia (corta/larga) no existe en venta, pero "Nuevo cliente" la
-- guardaba siempre, y el match filtraba por ella: ninguna propiedad en venta
-- tiene `stay`, así que a ningún comprador le salía una sola sugerencia.
-- El match ya no la mira en venta; esto deja además los datos coherentes.
UPDATE client_preferences
   SET stay = NULL
 WHERE operation = 'sale'
   AND stay IS NOT NULL;
