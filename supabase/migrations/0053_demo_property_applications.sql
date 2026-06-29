-- ============================================================
-- SmartBC · Demo data para Property Applications
-- ============================================================
-- Crea solicitudes de ejemplo para mostrar el sistema en acción.
-- Usa perfiles existentes en la BD (busca admins o cualquier perfil).
-- Idempotente: borra los demos antes de re-insertarlos.
-- ============================================================

do $$
declare
  -- Perfiles de demo (se crean ficticios o se reutilizan existentes)
  v_admin_id     uuid;
  v_client1_id   uuid;
  v_client2_id   uuid;
  v_client3_id   uuid;

  -- Propiedades (opcionales, la FK admite null)
  v_prop1_id     uuid;
  v_prop2_id     uuid;

  -- IDs de solicitudes
  v_app1_id      uuid := gen_random_uuid();
  v_app2_id      uuid := gen_random_uuid();
  v_app3_id      uuid := gen_random_uuid();
  v_app4_id      uuid := gen_random_uuid();

  -- IDs de tipos de documentos
  v_dt_es_rent_dni       uuid;
  v_dt_es_rent_contrato  uuid;
  v_dt_es_rent_nominas   uuid;
  v_dt_cl_rent_rut       uuid;
  v_dt_cl_rent_contrato  uuid;
  v_dt_cl_rent_nominas   uuid;
  v_dt_es_sale_dni       uuid;
  v_dt_es_sale_hipoteca  uuid;
  v_dt_es_sale_fondos    uuid;
begin

  -- ── Obtener IDs de perfiles reales (preferir admin) ──────────────────────
  select id into v_admin_id from profiles where role = 'admin' limit 1;
  if v_admin_id is null then
    select id into v_admin_id from profiles limit 1;
  end if;

  -- Si no hay ningún perfil, salir sin error
  if v_admin_id is null then
    raise notice 'No hay perfiles en la BD. Omitiendo demo data.';
    return;
  end if;

  -- Crear perfiles ficticios de clientes demo (si no existen)
  -- Usamos UUIDs fijos para idempotencia
  v_client1_id := '00000000-demo-0001-0000-000000000001'::uuid;
  v_client2_id := '00000000-demo-0001-0000-000000000002'::uuid;
  v_client3_id := '00000000-demo-0001-0000-000000000003'::uuid;

  -- Insertar perfiles demo en auth.users (necesario para FK de profiles)
  -- Usamos on conflict do nothing para idempotencia
  insert into auth.users (id, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, encrypted_password)
  values
    (v_client1_id, 'demo.juan.lopez@example.com', now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, ''),
    (v_client2_id, 'demo.ana.garcia@example.com', now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, ''),
    (v_client3_id, 'demo.carlos.perez@example.com', now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '')
  on conflict (id) do nothing;

  insert into profiles (id, full_name, email, role, created_at, updated_at)
  values
    (v_client1_id, 'Juan López Martínez', 'demo.juan.lopez@example.com', 'client', now(), now()),
    (v_client2_id, 'Ana García Rodríguez', 'demo.ana.garcia@example.com', 'client', now(), now()),
    (v_client3_id, 'Carlos Pérez Soto', 'demo.carlos.perez@example.com', 'client', now(), now())
  on conflict (id) do update set full_name = excluded.full_name, email = excluded.email;

  -- ── Obtener propiedades existentes (opcionales) ───────────────────────────
  select id into v_prop1_id from properties where country = 'es' and status = 'available' limit 1;
  select id into v_prop2_id from properties where country = 'cl' and status = 'available' limit 1;

  -- ── Obtener IDs de tipos de documento ─────────────────────────────────────
  select id into v_dt_es_rent_dni      from property_application_document_types where country = 'ES' and operation = 'rent' and document_key = 'passport_or_dni';
  select id into v_dt_es_rent_contrato from property_application_document_types where country = 'ES' and operation = 'rent' and document_key = 'employment_contract';
  select id into v_dt_es_rent_nominas  from property_application_document_types where country = 'ES' and operation = 'rent' and document_key = 'payslips';
  select id into v_dt_cl_rent_rut      from property_application_document_types where country = 'CL' and operation = 'rent' and document_key = 'passport_or_rut';
  select id into v_dt_cl_rent_contrato from property_application_document_types where country = 'CL' and operation = 'rent' and document_key = 'employment_contract';
  select id into v_dt_cl_rent_nominas  from property_application_document_types where country = 'CL' and operation = 'rent' and document_key = 'payslips';
  select id into v_dt_es_sale_dni      from property_application_document_types where country = 'ES' and operation = 'sale' and document_key = 'passport_or_dni';
  select id into v_dt_es_sale_hipoteca from property_application_document_types where country = 'ES' and operation = 'sale' and document_key = 'mortgage_preapproval';
  select id into v_dt_es_sale_fondos   from property_application_document_types where country = 'ES' and operation = 'sale' and document_key = 'proof_of_funds';

  -- ── Limpiar demos anteriores ──────────────────────────────────────────────
  delete from property_applications
  where client_id in (v_client1_id, v_client2_id, v_client3_id);

  -- ── SOLICITUD 1: Juan López — ES/alquiler — pendiente revisión ────────────
  insert into property_applications (id, property_id, client_id, country, operation, status, submitted_at, created_at, updated_at)
  values (v_app1_id, v_prop1_id, v_client1_id, 'ES', 'rent', 'pending_review', now() - interval '2 hours', now() - interval '3 hours', now());

  -- Documentos de Juan (todos verificados)
  if v_dt_es_rent_dni is not null then
    insert into property_application_documents
      (property_application_id, document_type_id, file_name, storage_path, file_url, file_size_bytes, mime_type, status,
       ai_analysis, verification_notes, verified_by, verification_timestamp)
    values
      (v_app1_id, v_dt_es_rent_dni, 'dni_juan_lopez.pdf',
       'ES/' || v_app1_id || '/passport_or_dni/demo-dni.pdf',
       'https://example.com/demo/dni.pdf', 245760, 'application/pdf', 'verified',
       '{"readability":"clear","completeness":98,"document_type_detected":"DNI España","extracted_data":{"nombre":"Juan López Martínez","doi":"12345678A","fecha_expiracion":"2029-03-15","fecha_nacimiento":"1988-07-22"},"warnings":[],"is_valid":true,"recommendation":"Documento válido y legible"}'::jsonb,
       'DNI verificado correctamente. Datos claros y vigente.', v_admin_id, now() - interval '30 minutes');
  end if;

  if v_dt_es_rent_contrato is not null then
    insert into property_application_documents
      (property_application_id, document_type_id, file_name, storage_path, file_url, file_size_bytes, mime_type, status,
       ai_analysis, verification_notes, verified_by, verification_timestamp)
    values
      (v_app1_id, v_dt_es_rent_contrato, 'contrato_trabajo_juan.pdf',
       'ES/' || v_app1_id || '/employment_contract/demo-contrato.pdf',
       'https://example.com/demo/contrato.pdf', 512000, 'application/pdf', 'verified',
       '{"readability":"clear","completeness":95,"document_type_detected":"Contrato de Trabajo Indefinido","extracted_data":{"nombre":"Juan López Martínez","empresa":"Tech Solutions S.L.","cargo":"Desarrollador Senior","salario_bruto_eur":3800,"fecha_inicio":"2021-01-15","tipo_contrato":"indefinido"},"warnings":[],"is_valid":true,"recommendation":"Contrato indefinido con salario suficiente (3.17x renta de €1.200)"}'::jsonb,
       'Contrato indefinido verificado. Salario: €3.800 bruto/mes.', v_admin_id, now() - interval '25 minutes');
  end if;

  if v_dt_es_rent_nominas is not null then
    insert into property_application_documents
      (property_application_id, document_type_id, file_name, storage_path, file_url, file_size_bytes, mime_type, status,
       ai_analysis, verification_notes, verified_by, verification_timestamp)
    values
      (v_app1_id, v_dt_es_rent_nominas, 'nominas_3meses_juan.pdf',
       'ES/' || v_app1_id || '/payslips/demo-nominas.pdf',
       'https://example.com/demo/nominas.pdf', 890000, 'application/pdf', 'verified',
       '{"readability":"clear","completeness":100,"document_type_detected":"Nóminas x3","extracted_data":{"salario_neto_promedio_eur":2850,"meses":["enero 2026","febrero 2026","marzo 2026"],"empresa":"Tech Solutions S.L."},"warnings":[],"is_valid":true,"recommendation":"3 nóminas correctas. Ratio ingreso/renta: 2.37x neto (suficiente para €1.200/mes)"}'::jsonb,
       '3 nóminas verificadas. Neto promedio: €2.850/mes.', v_admin_id, now() - interval '20 minutes');
  end if;

  -- Score de Juan
  insert into property_application_scores
    (property_application_id, total_score, income_score, document_completeness_score, document_quality_score,
     history_score, ai_recommendation, ai_summary, currency_context,
     income_amount, income_currency, income_amount_eur, income_ratio, calculated_at)
  values
    (v_app1_id, 87, 45, 20, 12, 10, 'approve',
     'Juan López presenta documentación completa y en orden. Contrato indefinido con salario neto de €2.850/mes, lo que supone 2.4x la renta mensual solicitada. Sin incidencias en los documentos. Candidato solvente y de bajo riesgo.',
     null, 3800, 'EUR', 3800, 2.37, now() - interval '15 minutes');

  -- ── SOLICITUD 2: Ana García — ES/venta — aprobada ─────────────────────────
  insert into property_applications (id, property_id, client_id, country, operation, status, submitted_at, reviewed_by, reviewed_at, review_notes, created_at, updated_at)
  values (v_app2_id, v_prop1_id, v_client2_id, 'ES', 'sale', 'approved',
          now() - interval '5 days', v_admin_id, now() - interval '2 days',
          'Documentación completa y solvencia acreditada. Pre-aprobación hipotecaria vigente hasta diciembre 2026.',
          now() - interval '6 days', now() - interval '2 days');

  if v_dt_es_sale_dni is not null then
    insert into property_application_documents
      (property_application_id, document_type_id, file_name, storage_path, file_url, file_size_bytes, mime_type, status,
       ai_analysis, verified_by, verification_timestamp)
    values
      (v_app2_id, v_dt_es_sale_dni, 'pasaporte_ana_garcia.pdf',
       'ES/' || v_app2_id || '/passport_or_dni/demo-pasaporte.pdf',
       'https://example.com/demo/pasaporte.pdf', 320000, 'application/pdf', 'verified',
       '{"readability":"clear","completeness":100,"document_type_detected":"Pasaporte Español","extracted_data":{"nombre":"Ana García Rodríguez","doi":"87654321B","fecha_expiracion":"2031-08-20"},"warnings":[],"is_valid":true,"recommendation":"Pasaporte válido"}'::jsonb,
       v_admin_id, now() - interval '3 days');
  end if;

  if v_dt_es_sale_hipoteca is not null then
    insert into property_application_documents
      (property_application_id, document_type_id, file_name, storage_path, file_url, file_size_bytes, mime_type, status,
       ai_analysis, verified_by, verification_timestamp)
    values
      (v_app2_id, v_dt_es_sale_hipoteca, 'preaprobacion_hipoteca_ana.pdf',
       'ES/' || v_app2_id || '/mortgage_preapproval/demo-hipoteca.pdf',
       'https://example.com/demo/hipoteca.pdf', 450000, 'application/pdf', 'verified',
       '{"readability":"clear","completeness":98,"document_type_detected":"Pre-aprobación Hipotecaria","extracted_data":{"nombre":"Ana García Rodríguez","banco":"Banco Santander","monto_max_eur":320000,"fecha_vigencia":"2026-12-31","tipo_interes":"3.1% fijo"},"warnings":[],"is_valid":true,"recommendation":"Pre-aprobación vigente y por importe suficiente"}'::jsonb,
       v_admin_id, now() - interval '3 days');
  end if;

  if v_dt_es_sale_fondos is not null then
    insert into property_application_documents
      (property_application_id, document_type_id, file_name, storage_path, file_url, file_size_bytes, mime_type, status,
       ai_analysis, verified_by, verification_timestamp)
    values
      (v_app2_id, v_dt_es_sale_fondos, 'fondos_entrada_ana.pdf',
       'ES/' || v_app2_id || '/proof_of_funds/demo-fondos.pdf',
       'https://example.com/demo/fondos.pdf', 380000, 'application/pdf', 'verified',
       '{"readability":"clear","completeness":95,"document_type_detected":"Extracto Bancario","extracted_data":{"banco":"BBVA","saldo_disponible_eur":85000,"periodo":"enero-marzo 2026"},"warnings":[],"is_valid":true,"recommendation":"Fondos suficientes para entrada del 20% (€64.000 necesarios, €85.000 disponibles)"}'::jsonb,
       v_admin_id, now() - interval '3 days');
  end if;

  insert into property_application_scores
    (property_application_id, total_score, income_score, document_completeness_score, document_quality_score,
     history_score, ai_recommendation, ai_summary, currency_context,
     income_amount, income_currency, income_amount_eur, income_ratio, calculated_at)
  values
    (v_app2_id, 94, 50, 20, 14, 10, 'strong_approve',
     'Ana García es una compradora excelente. Pre-aprobación hipotecaria de Santander por €320.000 (vigente hasta dic 2026). Fondos propios de €85.000 en BBVA — suficientes para la entrada del 20% y los gastos de compraventa. Documentación completa sin incidencias.',
     null, 6200, 'EUR', 6200, null, now() - interval '2 days' - interval '2 hours');

  -- ── SOLICITUD 3: Carlos Pérez — CL/alquiler — necesita corrección ─────────
  insert into property_applications (id, property_id, client_id, country, operation, status, submitted_at, created_at, updated_at)
  values (v_app3_id, v_prop2_id, v_client3_id, 'CL', 'rent', 'pending_review',
          now() - interval '1 day', now() - interval '1 day', now());

  if v_dt_cl_rent_rut is not null then
    insert into property_application_documents
      (property_application_id, document_type_id, file_name, storage_path, file_url, file_size_bytes, mime_type, status,
       ai_analysis, verified_by, verification_timestamp)
    values
      (v_app3_id, v_dt_cl_rent_rut, 'cedula_carlos_perez.jpg',
       'CL/' || v_app3_id || '/passport_or_rut/demo-cedula.jpg',
       'https://example.com/demo/cedula.jpg', 180000, 'image/jpeg', 'verified',
       '{"readability":"clear","completeness":100,"document_type_detected":"Cédula de Identidad Chile","extracted_data":{"nombre":"Carlos Pérez Soto","rut":"15.234.567-8","fecha_expiracion":"2028-11-30"},"warnings":[],"is_valid":true,"recommendation":"Cédula vigente y legible"}'::jsonb,
       v_admin_id, now() - interval '18 hours');
  end if;

  if v_dt_cl_rent_contrato is not null then
    insert into property_application_documents
      (property_application_id, document_type_id, file_name, storage_path, file_url, file_size_bytes, mime_type, status,
       ai_analysis, verification_notes, verified_by, verification_timestamp)
    values
      (v_app3_id, v_dt_cl_rent_contrato, 'contrato_carlos.pdf',
       'CL/' || v_app3_id || '/employment_contract/demo-contrato-cl.pdf',
       'https://example.com/demo/contrato-cl.pdf', 290000, 'application/pdf', 'needs_correction',
       '{"readability":"partially_clear","completeness":72,"document_type_detected":"Contrato de Trabajo","extracted_data":{"nombre":"Carlos Pérez Soto","empresa":"Constructora Andes S.A.","cargo":"Ingeniero Civil","salario_bruto":2500},"warnings":["ALERTA: El salario aparece como $2.500 — posible USD en lugar de CLP. Confirmar moneda.","El campo de firma del empleador está borroso"],"is_valid":false,"recommendation":"Solicitar versión con moneda explícita (CLP) y firma legible del empleador"}'::jsonb,
       'El contrato no especifica claramente la moneda del salario. El valor $2.500 parece estar en USD, no CLP. Sube una versión con el salario expresado en pesos chilenos (CLP). Además, la firma del empleador no es legible.',
       v_admin_id, now() - interval '16 hours');
  end if;

  if v_dt_cl_rent_nominas is not null then
    insert into property_application_documents
      (property_application_id, document_type_id, file_name, storage_path, file_url, file_size_bytes, mime_type, status,
       ai_analysis)
    values
      (v_app3_id, v_dt_cl_rent_nominas, 'liquidaciones_carlos.pdf',
       'CL/' || v_app3_id || '/payslips/demo-liquidaciones.pdf',
       'https://example.com/demo/liquidaciones.pdf', 640000, 'application/pdf', 'pending',
       '{"readability":"clear","completeness":88,"document_type_detected":"Liquidaciones de Sueldo x3","extracted_data":{"salario_neto_promedio":2250000,"meses":["enero 2026","febrero 2026","marzo 2026"],"empresa":"Constructora Andes S.A."},"warnings":["Confirmar que los $2.250.000 son CLP — consistente con cifras de Chile"],"is_valid":true,"recommendation":"Liquidaciones aparentemente correctas en CLP. Pendiente validación manual para confirmar moneda."}'::jsonb);
  end if;

  insert into property_application_scores
    (property_application_id, total_score, income_score, document_completeness_score, document_quality_score,
     history_score, ai_recommendation, ai_summary, currency_context,
     income_amount, income_currency, income_amount_eur, income_ratio, calculated_at)
  values
    (v_app3_id, 58, 30, 15, 8, 5, 'review',
     'Carlos Pérez tiene ingresos suficientes (~$2.250.000 CLP neto/mes) pero hay una inconsistencia en la moneda del contrato de trabajo. Se requiere corrección antes de aprobar. Las liquidaciones de sueldo parecen correctas y muestran estabilidad laboral.',
     '$2.250.000 CLP/mes ≈ €2.300 EUR/mes (tipo de cambio referencial: 1 EUR = 980 CLP)', 2250000, 'CLP', 2300, 2.1, now() - interval '15 hours');

  -- Anotación del admin en el contrato
  insert into property_application_document_annotations
    (document_id, annotation_text, annotation_type, created_by)
  select pad.id, 'El salario parece estar en USD ($2.500). En Chile los salarios suelen ser entre $800.000 y $3.000.000 CLP. Solicitar confirmación o nuevo documento con moneda explícita en CLP.', 'warning', v_admin_id
  from property_application_documents pad
  where pad.property_application_id = v_app3_id
    and pad.storage_path like '%employment_contract%';

  -- ── SOLICITUD 4: Juan López — CL/venta — borrador ────────────────────────
  insert into property_applications (id, property_id, client_id, country, operation, status, created_at, updated_at)
  values (v_app4_id, v_prop2_id, v_client1_id, 'CL', 'sale', 'draft',
          now() - interval '6 hours', now());

  raise notice 'Demo data insertada correctamente: 4 solicitudes, 8 documentos, 3 scores, 1 anotación.';
end;
$$;
