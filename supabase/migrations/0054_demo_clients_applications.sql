-- Demo clients for testing documentation portal
-- This migration creates 3 demo clients with various documentation states

DO $$
DECLARE
  v_demo_client_1_id UUID := '10000000-demo-0001-0000-000000000001'::UUID;
  v_demo_client_2_id UUID := '10000000-demo-0002-0000-000000000002'::UUID;
  v_demo_client_3_id UUID := '10000000-demo-0003-0000-000000000003'::UUID;
  v_demo_prop_1_id UUID := '20000000-demo-prop-0001-000000000001'::UUID;
  v_demo_prop_2_id UUID := '20000000-demo-prop-0002-000000000002'::UUID;
  v_demo_app_1_id UUID := '30000000-demo-app-0001-000000000001'::UUID;
  v_demo_app_2_id UUID := '30000000-demo-app-0002-000000000002'::UUID;
  v_demo_app_3_id UUID := '30000000-demo-app-0003-000000000003'::UUID;
BEGIN
  -- Delete demo data if exists
  DELETE FROM property_applications WHERE client_id IN (v_demo_client_1_id, v_demo_client_2_id, v_demo_client_3_id);
  DELETE FROM auth.users WHERE id IN (v_demo_client_1_id, v_demo_client_2_id, v_demo_client_3_id);

  -- Create auth users (demo clients)
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, phone_confirmed_at, confirmation_token, recovery_token, recovery_sent_at, email_change_token, email_change_sent_at, raw_user_meta_data, raw_app_meta_data, is_super_admin, deleted_at)
  VALUES
    (v_demo_client_1_id, '00000000-0000-0000-0000-000000000000', 'maria.martinez@example.com', '$2a$10$demo1', now(), now(), now(), null, '', '', null, '', null, '{"first_name":"María","last_name":"Martínez","full_name":"María Martínez"}', '{}', false, null),
    (v_demo_client_2_id, '00000000-0000-0000-0000-000000000000', 'carlos.lopez@example.com', '$2a$10$demo2', now(), now(), now(), null, '', '', null, '', null, '{"first_name":"Carlos","last_name":"López","full_name":"Carlos López"}', '{}', false, null),
    (v_demo_client_3_id, '00000000-0000-0000-0000-000000000000', 'anna.garcia@example.com', '$2a$10$demo3', now(), now(), now(), null, '', '', null, '', null, '{"first_name":"Anna","last_name":"García","full_name":"Anna García"}', '{}', false, null)
  ON CONFLICT (id) DO NOTHING;

  -- Create profiles
  INSERT INTO profiles (id, email, first_name, last_name, phone, country, role, status, created_at, updated_at)
  VALUES
    (v_demo_client_1_id, 'maria.martinez@example.com', 'María', 'Martínez', '+34 612 345 678', 'ES', 'client', 'active', now(), now()),
    (v_demo_client_2_id, 'carlos.lopez@example.com', 'Carlos', 'López', '+34 623 456 789', 'ES', 'client', 'active', now(), now()),
    (v_demo_client_3_id, 'anna.garcia@example.com', 'Anna', 'García', '+56 9 1234 5678', 'CL', 'client', 'active', now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- Create demo properties
  INSERT INTO properties (id, owner_id, country, operation, address, city, postal_code, title, bedrooms, bathrooms, price, currency, description, status, created_at, updated_at)
  VALUES
    (v_demo_prop_1_id, (SELECT id FROM profiles WHERE email = 'owner@zinto.app' LIMIT 1), 'ES', 'rent', 'Calle Mayor 45', 'Madrid', '28001', 'Piso en Gracia', 2, 1, 1200, 'EUR', 'Piso moderno en centro de Madrid', 'available', now(), now()),
    (v_demo_prop_2_id, (SELECT id FROM profiles WHERE email = 'owner@zinto.app' LIMIT 1), 'CL', 'sale', 'Las Condes 1234', 'Santiago', '7550000', 'Departamento Nueva Las Condes', 3, 2, 450000000, 'CLP', 'Depto de lujo en Las Condes', 'available', now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- Create property application #1: ES Rental - Complete & Approved
  INSERT INTO property_applications (
    id, property_id, client_id, country, operation, status, submitted_at, reviewed_by, reviewed_at, review_notes, move_in_date, created_at, updated_at
  )
  VALUES (
    v_demo_app_1_id,
    v_demo_prop_1_id,
    v_demo_client_1_id,
    'ES',
    'rent',
    'approved',
    now() - interval '2 days',
    (SELECT id FROM profiles WHERE email = 'admin@zinto.app' LIMIT 1),
    now() - interval '1 day',
    'Excelente candidata. Ingresos verificados y referencias positivas.',
    now() + interval '7 days',
    now() - interval '3 days',
    now() - interval '1 day'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create property application #2: CL Rental - Pending Review
  INSERT INTO property_applications (
    id, property_id, client_id, country, operation, status, submitted_at, reviewed_by, reviewed_at, review_notes, move_in_date, created_at, updated_at
  )
  VALUES (
    v_demo_app_2_id,
    v_demo_prop_2_id,
    v_demo_client_2_id,
    'CL',
    'sale',
    'pending_review',
    now() - interval '4 hours',
    null,
    null,
    null,
    null,
    now() - interval '5 hours',
    now() - interval '4 hours'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create property application #3: ES Sale - Draft
  INSERT INTO property_applications (
    id, property_id, client_id, country, operation, status, submitted_at, reviewed_by, reviewed_at, review_notes, created_at, updated_at
  )
  VALUES (
    v_demo_app_3_id,
    v_demo_prop_1_id,
    v_demo_client_3_id,
    'ES',
    'rent',
    'draft',
    null,
    null,
    null,
    null,
    now() - interval '1 hour',
    now() - interval '1 hour'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create demo documents for App #1 (Approved - All verified)
  INSERT INTO property_application_documents (
    id, property_application_id, document_type_id, file_name, storage_path, file_url, file_size, mime_type, status, verification_notes, ai_analysis, verified_by, verification_timestamp, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    v_demo_app_1_id,
    dt.id,
    'DNI_' || dt.document_key || '.pdf',
    'ES/rent/' || dt.document_key || '.pdf',
    'https://storage.example.com/ES/rent/' || dt.document_key || '.pdf',
    125000,
    'application/pdf',
    'verified',
    'Documento claro y vigente',
    jsonb_build_object(
      'readability', 'clear',
      'completeness', 100,
      'document_type_detected', dt.display_name,
      'extracted_data', jsonb_build_object('status', 'verified'),
      'warnings', '[]'::jsonb
    ),
    (SELECT id FROM profiles WHERE email = 'admin@zinto.app' LIMIT 1),
    now() - interval '1 day',
    now() - interval '3 days',
    now() - interval '1 day'
  FROM property_application_document_types dt
  WHERE dt.country = 'ES' AND dt.operation = 'rent' AND dt.is_required = true
  LIMIT 5;

  -- Create demo documents for App #2 (Pending - Some uploaded, some pending)
  INSERT INTO property_application_documents (
    id, property_application_id, document_type_id, file_name, storage_path, file_url, file_size, mime_type, status, verification_notes, ai_analysis, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    v_demo_app_2_id,
    dt.id,
    'RUT_' || dt.document_key || '.pdf',
    'CL/sale/' || dt.document_key || '.pdf',
    'https://storage.example.com/CL/sale/' || dt.document_key || '.pdf',
    98000,
    'application/pdf',
    'pending',
    null,
    jsonb_build_object(
      'readability', 'partially_clear',
      'completeness', 75,
      'document_type_detected', dt.display_name,
      'extracted_data', jsonb_build_object('status', 'partial'),
      'warnings', '["Documento parcialmente legible"]'::jsonb
    ),
    now() - interval '4 hours',
    now() - interval '4 hours'
  FROM property_application_document_types dt
  WHERE dt.country = 'CL' AND dt.operation = 'sale' AND dt.is_required = true
  LIMIT 2;

  -- Create property application scores
  INSERT INTO property_application_scores (id, property_application_id, total_score, income_score, document_completeness_score, document_quality_score, history_score, ai_recommendation, ai_summary, currency_context, calculated_at)
  VALUES
    (gen_random_uuid(), v_demo_app_1_id, 87, 50, 20, 10, 7, 'strong_approve', 'Candidata excelente con ingresos verificados y referencias positivas.', '€2.800/mes neto (4.2x la renta)', now()),
    (gen_random_uuid(), v_demo_app_2_id, 65, 35, 15, 10, 5, 'review', 'Candidato solvente pero requiere revisión de algunos documentos.', '$3.500.000 CLP/mes neto (3.1x renta)', now()),
    (gen_random_uuid(), v_demo_app_3_id, 0, 0, 0, 0, 0, 'pending', 'Solicitud en borrador - documentación no iniciada.', '', now());

  RAISE NOTICE 'Demo clients and applications created successfully';
END $$;
