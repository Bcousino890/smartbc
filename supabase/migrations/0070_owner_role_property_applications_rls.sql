-- ============================================================
-- SmartBC · Rol 'owner' en las RLS de solicitudes de documentación
-- ============================================================
-- El rol 'owner' es staff con acceso completo a /admin (ver
-- lib/permissions.ts STAFF_ROLES y lib/db/auth-helpers.ts), pero las
-- políticas de la migración 0052 (y la de storage de 0067) enumeraron
-- los roles staff a mano sin incluirlo. Resultado en producción: el
-- listado del panel cargaba (usa el cliente admin) pero al abrir la
-- ficha de una solicitud la API devolvía 404 "Solicitud no encontrada"
-- porque la lectura pasa por RLS con la sesión del usuario.
--
-- Esta migración recrea esas políticas con 'owner' incluido. Es
-- idempotente: drop if exists + create.
-- ============================================================

-- ─── property_applications ──────────────────────────────────

drop policy if exists "applications_client_read_own" on property_applications;
create policy "applications_client_read_own" on property_applications
  for select using (
    client_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior'))
    or exists (
      select 1 from property_application_co_applicants
      where property_application_id = property_applications.id
        and client_id = auth.uid()
    )
  );

drop policy if exists "applications_client_update_own" on property_applications;
create policy "applications_client_update_own" on property_applications
  for update using (
    client_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior'))
  );

drop policy if exists "applications_admin_delete" on property_applications;
create policy "applications_admin_delete" on property_applications
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor'))
  );

-- ─── property_application_documents ─────────────────────────

drop policy if exists "app_docs_client_read_own" on property_application_documents;
create policy "app_docs_client_read_own" on property_application_documents
  for select using (
    (
      exists (
        select 1 from property_applications pa
        where pa.id = property_application_documents.property_application_id
          and pa.client_id = auth.uid()
      )
      and (co_applicant_id is null or co_applicant_id = auth.uid())
    )
    or co_applicant_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior'))
  );

drop policy if exists "app_docs_insert" on property_application_documents;
create policy "app_docs_insert" on property_application_documents
  for insert with check (
    exists (
      select 1 from property_applications pa
      where pa.id = property_application_documents.property_application_id
        and pa.client_id = auth.uid()
    )
    or (
      co_applicant_id = auth.uid()
      and exists (
        select 1 from property_application_co_applicants
        where property_application_id = property_application_documents.property_application_id
          and client_id = auth.uid()
      )
    )
    or exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior'))
  );

drop policy if exists "app_docs_admin_update" on property_application_documents;
create policy "app_docs_admin_update" on property_application_documents
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior'))
  );

drop policy if exists "app_docs_admin_delete" on property_application_documents;
create policy "app_docs_admin_delete" on property_application_documents
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor'))
  );

-- ─── property_application_co_applicants ─────────────────────

drop policy if exists "co_applicants_read" on property_application_co_applicants;
create policy "co_applicants_read" on property_application_co_applicants
  for select using (
    client_id = auth.uid()
    or exists (
      select 1 from property_applications pa
      where pa.id = property_application_co_applicants.property_application_id
        and pa.client_id = auth.uid()
    )
    or exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior'))
  );

drop policy if exists "co_applicants_insert" on property_application_co_applicants;
create policy "co_applicants_insert" on property_application_co_applicants
  for insert with check (
    exists (
      select 1 from property_applications pa
      where pa.id = property_application_co_applicants.property_application_id
        and pa.client_id = auth.uid()
    )
    or exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor'))
  );

drop policy if exists "co_applicants_update" on property_application_co_applicants;
create policy "co_applicants_update" on property_application_co_applicants
  for update using (
    client_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor'))
  );

-- ─── property_application_scores ────────────────────────────

drop policy if exists "scores_client_read" on property_application_scores;
create policy "scores_client_read" on property_application_scores
  for select using (
    exists (
      select 1 from property_applications pa
      where pa.id = property_application_scores.property_application_id
        and pa.client_id = auth.uid()
    )
    or exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior'))
  );

drop policy if exists "scores_admin_write" on property_application_scores;
create policy "scores_admin_write" on property_application_scores
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior'))
  );

-- ─── property_application_document_annotations ──────────────

drop policy if exists "annotations_client_read" on property_application_document_annotations;
create policy "annotations_client_read" on property_application_document_annotations
  for select using (
    exists (
      select 1 from property_application_documents pad
      join property_applications pa on pa.id = pad.property_application_id
      where pad.id = property_application_document_annotations.document_id
        and (pa.client_id = auth.uid() or pad.co_applicant_id = auth.uid())
    )
    or exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior'))
  );

drop policy if exists "annotations_admin_write" on property_application_document_annotations;
create policy "annotations_admin_write" on property_application_document_annotations
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior'))
  );

-- ─── property_application_document_types ────────────────────

drop policy if exists "doc_types_admin_write" on property_application_document_types;
create policy "doc_types_admin_write" on property_application_document_types
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin', 'advisor'))
  );

-- ─── storage: bucket property-application-documents ─────────

drop policy if exists "app_docs_storage_staff_all" on storage.objects;
create policy "app_docs_storage_staff_all"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'property-application-documents'
    and exists (
      select 1 from profiles
      where id = auth.uid()
        and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior')
    )
  )
  with check (
    bucket_id = 'property-application-documents'
    and exists (
      select 1 from profiles
      where id = auth.uid()
        and role in ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior')
    )
  );
