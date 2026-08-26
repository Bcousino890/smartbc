-- ============================================================
-- SmartBC · Storage bucket para documentación de solicitudes
-- ============================================================
-- La migración 0052 dejó el bucket 'property-application-documents'
-- pendiente de creación manual. Nunca se creó, por lo que toda subida de
-- documentos (pasaporte, nóminas, etc.) fallaba en producción.
--
-- El bucket es PRIVADO (a diferencia de properties-photos/agencies-logos):
-- contiene documentación personal sensible (identidad, nóminas, cuentas
-- bancarias). El acceso de clientes/co-solicitantes se sirve siempre por
-- URL firmada de corta duración, generada por el servidor después de
-- validar el acceso vía las políticas RLS ya existentes sobre la tabla
-- property_application_documents (createAdminClient solo se usa para
-- firmar la URL de una fila que el usuario ya tenía permiso de leer).
-- Por eso aquí solo hace falta una política de storage para el staff.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('property-application-documents', 'property-application-documents', false)
on conflict (id) do nothing;

create policy "app_docs_storage_staff_all"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'property-application-documents'
    and exists (
      select 1 from profiles
      where id = auth.uid()
        and role in ('admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior')
    )
  )
  with check (
    bucket_id = 'property-application-documents'
    and exists (
      select 1 from profiles
      where id = auth.uid()
        and role in ('admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior')
    )
  );
