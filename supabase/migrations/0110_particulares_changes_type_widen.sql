-- El cron inserta change_type='floor_plan_added'/'video_added' desde que
-- existe la detección de plano/vídeo (migración 0036), pero el CHECK de
-- particulares_changes.change_type (última ampliación: 0034, para
-- 'phone_changed') nunca se amplió para incluirlos. Cada vez que un
-- anuncio gana plano o vídeo, el INSERT de TODO el lote de cambios de esa
-- ficha (precio, fotos, teléfono incluidos) fallaba en silencio — mismo
-- patrón de bug que ya rompió las migraciones 0034 y 0088 antes.
ALTER TABLE particulares_changes
  DROP CONSTRAINT IF EXISTS particulares_changes_change_type_check;

ALTER TABLE particulares_changes
  ADD CONSTRAINT particulares_changes_change_type_check
  CHECK (change_type IN (
    'price_change', 'photo_added', 'description_updated', 'deleted',
    'reactivated', 'price_up', 'price_down', 'photo_count_change',
    'phone_added', 'phone_changed', 'new_listing',
    'floor_plan_added', 'video_added'
  ));
