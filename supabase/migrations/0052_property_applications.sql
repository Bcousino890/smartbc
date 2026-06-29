-- ============================================================
-- SmartBC · Property Applications (Documentación de Operaciones)
-- ============================================================
-- Sistema de gestión de documentación para alquiler y venta
-- Soporta: España (EUR) y Chile (CLP), con privacidad entre co-solicitantes
-- ============================================================

-- ============================================================
-- 1. ENUMS
-- ============================================================

create type application_operation as enum ('rent', 'sale');
create type application_country as enum ('ES', 'CL');
create type application_status as enum (
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'completed'
);
create type document_status as enum (
  'pending',
  'verified',
  'rejected',
  'needs_correction'
);
create type annotation_type as enum ('info', 'warning', 'error');
create type co_applicant_role as enum ('primary', 'co_applicant');

-- ============================================================
-- 2. TIPOS DE DOCUMENTOS POR PAÍS + OPERACIÓN
-- ============================================================

create table property_application_document_types (
  id uuid primary key default gen_random_uuid(),
  country application_country not null,
  operation application_operation not null,
  document_key text not null,
  display_name text not null,
  description text,
  accepted_formats jsonb not null default '["pdf","jpg","png"]',
  max_file_size_bytes integer not null default 10485760,
  is_required boolean not null default true,
  validation_rules jsonb,
  icon_name text,
  help_text text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country, operation, document_key)
);

create index idx_doc_types_country_op on property_application_document_types(country, operation);

-- ============================================================
-- 3. SOLICITUDES (ALQUILER O VENTA)
-- ============================================================

create table property_applications (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete set null,
  client_id uuid not null references profiles(id) on delete cascade,
  country application_country not null,
  operation application_operation not null,
  status application_status not null default 'draft',
  submitted_at timestamptz,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  move_in_date date,
  purchase_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_prop_apps_client on property_applications(client_id);
create index idx_prop_apps_property on property_applications(property_id) where property_id is not null;
create index idx_prop_apps_status on property_applications(status);
create index idx_prop_apps_country_op on property_applications(country, operation);

-- ============================================================
-- 4. DOCUMENTOS SUBIDOS
-- ============================================================

create table property_application_documents (
  id uuid primary key default gen_random_uuid(),
  property_application_id uuid not null references property_applications(id) on delete cascade,
  document_type_id uuid not null references property_application_document_types(id),
  -- co_applicant_id: si viene de un co-solicitante (privacidad: solo admin ve todos)
  co_applicant_id uuid references profiles(id) on delete set null,
  file_name text not null,
  storage_path text not null unique,
  file_url text not null,
  file_size_bytes integer,
  mime_type text,
  status document_status not null default 'pending',
  verification_notes text,
  ai_analysis jsonb,
  verification_timestamp timestamptz,
  verified_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_app_docs_application on property_application_documents(property_application_id);
create index idx_app_docs_type on property_application_documents(document_type_id);
create index idx_app_docs_status on property_application_documents(status);
create index idx_app_docs_co_applicant on property_application_documents(co_applicant_id) where co_applicant_id is not null;

-- ============================================================
-- 5. CO-SOLICITANTES (con privacidad entre ellos)
-- ============================================================

create table property_application_co_applicants (
  id uuid primary key default gen_random_uuid(),
  property_application_id uuid not null references property_applications(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  role co_applicant_role not null default 'co_applicant',
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  invite_email text,
  created_at timestamptz not null default now(),
  unique (property_application_id, client_id)
);

create index idx_co_applicants_application on property_application_co_applicants(property_application_id);
create index idx_co_applicants_client on property_application_co_applicants(client_id);

-- ============================================================
-- 6. SCORING DE CANDIDATOS
-- ============================================================

create table property_application_scores (
  id uuid primary key default gen_random_uuid(),
  property_application_id uuid not null references property_applications(id) on delete cascade unique,
  total_score integer not null default 0 check (total_score >= 0 and total_score <= 100),
  income_score integer not null default 0,
  document_completeness_score integer not null default 0,
  document_quality_score integer not null default 0,
  history_score integer not null default 0,
  ai_recommendation text check (ai_recommendation in ('strong_approve', 'approve', 'review', 'reject')),
  ai_summary text,
  currency_context text,
  income_amount numeric,
  income_currency text,
  income_amount_eur numeric,
  income_ratio numeric,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_scores_application on property_application_scores(property_application_id);
create index idx_scores_total on property_application_scores(total_score desc);

-- ============================================================
-- 7. ANOTACIONES EN DOCUMENTOS
-- ============================================================

create table property_application_document_annotations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references property_application_documents(id) on delete cascade,
  annotation_text text not null,
  annotation_type annotation_type not null default 'info',
  created_by uuid not null references profiles(id) on delete cascade,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_annotations_document on property_application_document_annotations(document_id);

-- ============================================================
-- 8. TRIGGERS (updated_at automático)
-- ============================================================

create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Reutiliza la función si ya existe (no falla)
do $$ begin
  create trigger trg_prop_app_doc_types_updated_at
    before update on property_application_document_types
    for each row execute function update_updated_at_column();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_prop_apps_updated_at
    before update on property_applications
    for each row execute function update_updated_at_column();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_app_docs_updated_at
    before update on property_application_documents
    for each row execute function update_updated_at_column();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_scores_updated_at
    before update on property_application_scores
    for each row execute function update_updated_at_column();
exception when duplicate_object then null; end $$;

-- ============================================================
-- 9. RLS POLICIES
-- ============================================================

alter table property_application_document_types enable row level security;
alter table property_applications enable row level security;
alter table property_application_documents enable row level security;
alter table property_application_co_applicants enable row level security;
alter table property_application_scores enable row level security;
alter table property_application_document_annotations enable row level security;

-- Tipos de documentos: todos pueden leer (necesario para el checklist público)
create policy "doc_types_public_read" on property_application_document_types
  for select using (true);

create policy "doc_types_admin_write" on property_application_document_types
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor'))
  );

-- Solicitudes: cliente ve solo las suyas, admin ve todas
create policy "applications_client_read_own" on property_applications
  for select using (
    client_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior'))
    or exists (
      select 1 from property_application_co_applicants
      where property_application_id = property_applications.id
        and client_id = auth.uid()
    )
  );

create policy "applications_client_insert" on property_applications
  for insert with check (client_id = auth.uid());

create policy "applications_client_update_own" on property_applications
  for update using (
    client_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor', 'agent_admin', 'agent_senior'))
  );

create policy "applications_admin_delete" on property_applications
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor'))
  );

-- Documentos: cliente ve solo los suyos (NO los de co-solicitantes), admin ve todos
create policy "app_docs_client_read_own" on property_application_documents
  for select using (
    -- Dueño principal ve solo sus docs (co_applicant_id is null o es él mismo)
    (
      exists (
        select 1 from property_applications pa
        where pa.id = property_application_documents.property_application_id
          and pa.client_id = auth.uid()
      )
      and (co_applicant_id is null or co_applicant_id = auth.uid())
    )
    -- Co-solicitante ve solo sus propios docs
    or co_applicant_id = auth.uid()
    -- Admin ve todo
    or exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior'))
  );

create policy "app_docs_insert" on property_application_documents
  for insert with check (
    -- El cliente principal puede insertar
    exists (
      select 1 from property_applications pa
      where pa.id = property_application_documents.property_application_id
        and pa.client_id = auth.uid()
    )
    -- Co-solicitante puede insertar solo sus propios docs
    or (
      co_applicant_id = auth.uid()
      and exists (
        select 1 from property_application_co_applicants
        where property_application_id = property_application_documents.property_application_id
          and client_id = auth.uid()
      )
    )
    -- Admin puede insertar en cualquiera
    or exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor', 'agent_admin', 'agent_senior'))
  );

create policy "app_docs_admin_update" on property_application_documents
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor', 'agent_admin', 'agent_senior'))
  );

create policy "app_docs_admin_delete" on property_application_documents
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor'))
  );

-- Co-solicitantes: cliente ve los de su solicitud (solo quiénes son, no sus docs)
create policy "co_applicants_read" on property_application_co_applicants
  for select using (
    client_id = auth.uid()
    or exists (
      select 1 from property_applications pa
      where pa.id = property_application_co_applicants.property_application_id
        and pa.client_id = auth.uid()
    )
    or exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior'))
  );

create policy "co_applicants_insert" on property_application_co_applicants
  for insert with check (
    exists (
      select 1 from property_applications pa
      where pa.id = property_application_co_applicants.property_application_id
        and pa.client_id = auth.uid()
    )
    or exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor'))
  );

create policy "co_applicants_update" on property_application_co_applicants
  for update using (
    client_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor'))
  );

-- Scores: solo admin escribe, clientes pueden leer el score de su solicitud
create policy "scores_client_read" on property_application_scores
  for select using (
    exists (
      select 1 from property_applications pa
      where pa.id = property_application_scores.property_application_id
        and pa.client_id = auth.uid()
    )
    or exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior'))
  );

create policy "scores_admin_write" on property_application_scores
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor', 'agent_admin', 'agent_senior'))
  );

-- Anotaciones: admin escribe, cliente lee las de sus documentos
create policy "annotations_client_read" on property_application_document_annotations
  for select using (
    exists (
      select 1 from property_application_documents pad
      join property_applications pa on pa.id = pad.property_application_id
      where pad.id = property_application_document_annotations.document_id
        and (pa.client_id = auth.uid() or pad.co_applicant_id = auth.uid())
    )
    or exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior'))
  );

create policy "annotations_admin_write" on property_application_document_annotations
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'advisor', 'agent_admin', 'agent_senior'))
  );

-- ============================================================
-- 10. SEED DATA: Tipos de documentos por país + operación
-- ============================================================

-- ESPAÑA - ALQUILER
insert into property_application_document_types
  (country, operation, document_key, display_name, description, accepted_formats, max_file_size_bytes, is_required, icon_name, help_text, display_order)
values
  ('ES', 'rent', 'passport_or_dni', 'Pasaporte o DNI', 'Documento de identidad válido (no caducado)', '["pdf","jpg","png"]', 10485760, true, 'IdCard', 'Sube una copia clara de tu pasaporte o DNI. Debe estar vigente y se deben ver claramente todos los datos.', 1),
  ('ES', 'rent', 'employment_contract', 'Contrato de Trabajo', 'Contrato laboral vigente o carta del empleador', '["pdf"]', 5242880, true, 'FileText', 'Sube tu contrato de trabajo o carta del empleador con tu cargo, salario y tipo de contrato. Máximo 3 meses de antigüedad. El salario debe estar en EUR (€).', 2),
  ('ES', 'rent', 'payslips', 'Nóminas (últimos 3 meses)', 'Recibos de sueldo de los últimos 3 meses', '["pdf"]', 5242880, true, 'Receipt', 'Sube las 3 últimas nóminas para demostrar ingresos mensuales. El salario neto debe ser al menos 3x la renta del piso. Moneda: EUR (€).', 3),
  ('ES', 'rent', 'bank_statement', 'Extracto Bancario (últimos 3 meses)', 'Certificado de cuenta bancaria con movimientos', '["pdf"]', 5242880, false, 'Building2', 'Opcional pero recomendado: muestra tu capacidad de pago. Cualquier banco sirve (BBVA, CaixaBank, Sabadell, etc).', 4),
  ('ES', 'rent', 'rental_references', 'Referencias de Alquileres Anteriores', 'Contacto de propietarios o agencias anteriores', '["pdf","jpg","png"]', 2097152, false, 'Users', 'Opcional: nombres y teléfonos de propietarios anteriores que pueden avalar tu historial.', 5),
  ('ES', 'rent', 'residency_certificate', 'Certificado de Empadronamiento', 'Comprobante de domicilio actual', '["pdf"]', 2097152, false, 'MapPin', 'Para estudiantes o autónomos: comprobante de domicilio actual (factura agua/luz, empadronamiento).', 6);

-- ESPAÑA - VENTA
insert into property_application_document_types
  (country, operation, document_key, display_name, description, accepted_formats, max_file_size_bytes, is_required, icon_name, help_text, display_order)
values
  ('ES', 'sale', 'passport_or_dni', 'Pasaporte o DNI', 'Documento de identidad válido (no caducado)', '["pdf","jpg","png"]', 10485760, true, 'IdCard', 'Sube una copia clara de tu pasaporte o DNI. Debe estar vigente.', 1),
  ('ES', 'sale', 'mortgage_preapproval', 'Pre-aprobación Hipotecaria o Carta de Solvencia', 'Pre-aprobación de tu banco o carta de solvencia', '["pdf"]', 5242880, true, 'Home', 'Sube la pre-aprobación hipotecaria de tu banco. Debe mostrar el monto máximo en EUR (€) y fecha de vigencia. Alternativa: carta de solvencia bancaria.', 2),
  ('ES', 'sale', 'proof_of_funds', 'Comprobante de Fondos para Entrada', 'Disponibilidad de dinero para la entrada (down payment)', '["pdf"]', 5242880, true, 'Wallet', 'Sube extracto bancario mostrando disponibilidad para la entrada. Mínimo últimos 3 meses en EUR (€).', 3),
  ('ES', 'sale', 'employment_or_income', 'Contrato de Trabajo o Prueba de Ingresos', 'Contrato laboral o prueba de ingresos actualizada', '["pdf"]', 5242880, true, 'Briefcase', 'Sube tu contrato de trabajo, nómina reciente o certificado de ingresos. Debe estar actualizado (máximo 3 meses). Moneda: EUR (€).', 4),
  ('ES', 'sale', 'tax_certificate', 'Certificado de Impuestos (últimos 2 años)', 'Declaración de Hacienda (IRPF) de los últimos 2 años', '["pdf"]', 5242880, false, 'FileCheck', 'Opcional pero recomendado: acreditación fiscal de los últimos 2 años fiscales.', 5),
  ('ES', 'sale', 'credit_report', 'Informe de Crédito', 'Score crediticio o informe de acreedores', '["pdf"]', 5242880, false, 'TrendingUp', 'Opcional: informe de crédito que demuestre buen historial crediticio.', 6);

-- CHILE - ALQUILER
insert into property_application_document_types
  (country, operation, document_key, display_name, description, accepted_formats, max_file_size_bytes, is_required, icon_name, help_text, display_order)
values
  ('CL', 'rent', 'passport_or_rut', 'Cédula de Identidad o Pasaporte', 'Documento de identidad válido (cédula con RUT o pasaporte)', '["pdf","jpg","png"]', 10485760, true, 'IdCard', 'Sube una copia clara de tu cédula de identidad (RUT) o pasaporte. Debe estar vigente. IMPORTANTE: todos los valores de ingresos deben estar en pesos chilenos (CLP), NO en USD ni otro currency.', 1),
  ('CL', 'rent', 'employment_contract', 'Contrato de Trabajo o Carta del Empleador', 'Contrato laboral vigente en CLP', '["pdf"]', 5242880, true, 'FileText', 'Sube tu contrato de trabajo o carta del empleador. CRÍTICO: El salario debe estar en pesos chilenos (CLP). Ejemplo correcto: $2.500.000 CLP, NO $2500 USD.', 2),
  ('CL', 'rent', 'payslips', 'Liquidaciones de Sueldo (últimos 3 meses)', 'Liquidaciones de sueldo en CLP de los últimos 3 meses', '["pdf"]', 5242880, true, 'Receipt', 'Sube las 3 últimas liquidaciones de sueldo. El salario neto debe ser al menos 3x la renta mensual. MONEDA: CLP solamente. Ejemplo: $1.800.000 CLP neto.', 3),
  ('CL', 'rent', 'tax_certificate', 'Certificado de Impuestos o Renta (último año)', 'Declaración de impuestos del SII o certificado de renta', '["pdf"]', 5242880, false, 'FileCheck', 'Opcional pero recomendado: descarga tu certificado de impuestos del SII o certificado de renta. Moneda en CLP.', 4),
  ('CL', 'rent', 'bank_statement', 'Extracto Bancario Chileno (últimos 3 meses)', 'Comprobante de banco chileno con movimientos en CLP', '["pdf"]', 5242880, false, 'Building2', 'Opcional: comprobante de banco chileno (BancoEstado, Santander, Itaú, Falabella, etc) mostrando saldo disponible en CLP.', 5),
  ('CL', 'rent', 'rental_references', 'Referencias de Arrendamientos Anteriores', 'Contacto de propietarios o inmobiliarias anteriores', '["pdf","jpg","png"]', 2097152, false, 'Users', 'Opcional: nombres y teléfonos de propietarios anteriores que puedan avalar tu historial de pago.', 6),
  ('CL', 'rent', 'aval_letter', 'Carta de Aval (si aplica)', 'Aval de tercero si tienes historial limitado', '["pdf"]', 2097152, false, 'UserCheck', 'Si no tienes historial de arriendo o empleador formal: un avalista con RUT e ingresos en CLP puede respaldar tu solicitud.', 7);

-- CHILE - VENTA
insert into property_application_document_types
  (country, operation, document_key, display_name, description, accepted_formats, max_file_size_bytes, is_required, icon_name, help_text, display_order)
values
  ('CL', 'sale', 'passport_or_rut', 'Cédula de Identidad o Pasaporte', 'Documento de identidad válido (cédula con RUT o pasaporte)', '["pdf","jpg","png"]', 10485760, true, 'IdCard', 'Sube una copia clara de tu cédula de identidad (RUT) o pasaporte. Debe estar vigente.', 1),
  ('CL', 'sale', 'mortgage_preapproval', 'Pre-aprobación Hipotecaria', 'Pre-aprobación hipotecaria de banco chileno', '["pdf"]', 5242880, true, 'Home', 'Sube la pre-aprobación hipotecaria de tu banco chileno (BancoEstado, Santander, Itaú, etc). Debe mostrar el monto máximo a financiar en CLP y fecha de vigencia (mínimo 60 días).', 2),
  ('CL', 'sale', 'proof_of_funds', 'Comprobante de Fondos para Entrada (Pie)', 'Extracto bancario mostrando disponibilidad en CLP', '["pdf"]', 5242880, true, 'Wallet', 'Sube extracto de tu banco chileno mostrando disponibilidad de dinero para el pie. Últimos 3 meses en CLP.', 3),
  ('CL', 'sale', 'employment_or_income', 'Contrato de Trabajo o Certificado de Ingresos', 'Contrato laboral actualizado o certificado de ingresos en CLP', '["pdf"]', 5242880, true, 'Briefcase', 'Sube tu contrato de trabajo o certificado de ingresos. Moneda: CLP. Debe estar actualizado (máximo 3 meses).', 4),
  ('CL', 'sale', 'tax_certificate', 'Certificado de Impuestos (últimos 2 años)', 'Declaración de impuestos del SII', '["pdf"]', 5242880, false, 'FileCheck', 'Opcional pero recomendado: certificado de impuestos del SII de los últimos 2 años fiscales en CLP.', 5),
  ('CL', 'sale', 'credit_report', 'Informe de Crédito (Dicom o Acreedores)', 'Informe crediticio de Dicom o acreedores', '["pdf"]', 5242880, false, 'TrendingUp', 'Opcional: informe Dicom o de acreedores que demuestre buen historial crediticio en Chile.', 6);

-- ============================================================
-- 11. STORAGE BUCKET (política)
-- ============================================================
-- El bucket 'property-application-documents' debe crearse manualmente
-- o via scripts/post-deploy.sh. Las RLS del storage se aplican por separado.
-- Path format: {country}/{application_id}/{document_type_key}/{timestamp}-{filename}
