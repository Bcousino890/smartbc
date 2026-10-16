-- ============================================================
-- SmartBC · Web propia de la agencia: política de lectura (sobre 0203)
-- ============================================================
-- · `trigger_sig`: huella del anuncio del portal que sí rastreamos (precio, estado, referencia) cuando
--   se leyó la web. La web de la agencia se lee UNA vez y solo se vuelve a leer si esa huella cambia
--   (o a mano con «Releer web»). Ya no hay refresco por el paso del tiempo.
-- · `status = 'blocked'`: el robots.txt de la web prohíbe la ruta (no se lee).
-- Idempotente. No toca datos de `particulares`.
-- ============================================================

alter table particulares_agency_webs add column if not exists trigger_sig text;

alter table particulares_agency_webs drop constraint if exists particulares_agency_webs_status_check;
alter table particulares_agency_webs
  add constraint particulares_agency_webs_status_check
  check (status in ('ok', 'gone', 'error', 'unsupported', 'blocked'));
