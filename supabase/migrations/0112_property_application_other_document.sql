-- ============================================================
-- SmartBC · Documento "Otro" con descripción del cliente
-- ============================================================
-- El checklist de documentación (cliente) solo permitía subir contra una
-- de las filas fijas del país/operación (Pasaporte, Nóminas...). Si el
-- candidato tenía algo que aportar que no encajaba en ninguna ("carta del
-- banco", "certificado de estudios", etc.) no tenía dónde subirlo. Se añade
-- un tipo de documento catch-all "Otro documento" por país/operación, y una
-- columna para que el cliente describa con sus palabras qué es — esa
-- descripción se muestra al equipo y se pasa a la IA como contexto.
-- ============================================================

alter table property_application_documents
  add column if not exists client_note text;

insert into property_application_document_types
  (country, operation, document_key, display_name, description, accepted_formats, max_file_size_bytes, is_required, icon_name, help_text, display_order)
values
  ('ES', 'rent', 'other_document', 'Otro documento', 'Cualquier otro documento que quieras aportar y que no encaje en la lista anterior', '["pdf","jpg","jpeg","png","webp","heic","heif"]', 10485760, false, 'FilePlus', 'Describe brevemente qué es este documento en el campo de texto al subirlo — nos ayuda a revisarlo más rápido.', 99),
  ('ES', 'sale', 'other_document', 'Otro documento', 'Cualquier otro documento que quieras aportar y que no encaje en la lista anterior', '["pdf","jpg","jpeg","png","webp","heic","heif"]', 10485760, false, 'FilePlus', 'Describe brevemente qué es este documento en el campo de texto al subirlo — nos ayuda a revisarlo más rápido.', 99),
  ('CL', 'rent', 'other_document', 'Otro documento', 'Cualquier otro documento que quieras aportar y que no encaje en la lista anterior', '["pdf","jpg","jpeg","png","webp","heic","heif"]', 10485760, false, 'FilePlus', 'Describe brevemente qué es este documento en el campo de texto al subirlo — nos ayuda a revisarlo más rápido.', 99),
  ('CL', 'sale', 'other_document', 'Otro documento', 'Cualquier otro documento que quieras aportar y que no encaje en la lista anterior', '["pdf","jpg","jpeg","png","webp","heic","heif"]', 10485760, false, 'FilePlus', 'Describe brevemente qué es este documento en el campo de texto al subirlo — nos ayuda a revisarlo más rápido.', 99)
on conflict (country, operation, document_key) do nothing;
