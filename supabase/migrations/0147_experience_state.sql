-- 0147 · experience_state en page_views — SmartLink 2.0 FACTS-LED.
--
-- Registra con qué experiencia se sirvió el SmartLink (complete | partial |
-- sparse | facts_led) para poder comparar engagement por estado. Nullable y
-- con lista blanca: el navegador jamás escribe texto libre aquí (la ruta
-- normaliza antes), y el CHECK lo garantiza también a nivel de BD.
alter table page_views add column if not exists experience_state text
  check (experience_state is null
         or experience_state in ('complete','partial','sparse','facts_led'));
