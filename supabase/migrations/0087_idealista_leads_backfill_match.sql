-- Backfill de matched_property_id para leads ya capturados antes de que la
-- ingesta (app/api/extension/idealista-leads/route.ts) intentara el match
-- por idealista_code, y para los que quedaron sin re-scrapear desde que se
-- guardó property_ref. Mismo criterio que usa la ingesta:
--   1) property_ref (Ref. bc386) contra idealista_listings.reference_code,
--      con fallback a properties.bc_reference.
--   2) idealista_code (Cod. 12345678) contra idealista_listings.idealista_property_id.
-- No pisa un matched_property_id ya seteado.

UPDATE idealista_leads l
SET matched_property_id = il.property_id,
    updated_at = now()
FROM idealista_listings il
WHERE l.matched_property_id IS NULL
  AND l.property_ref IS NOT NULL
  AND il.property_id IS NOT NULL
  AND il.reference_code IS NOT NULL
  AND lower(il.reference_code) = lower(l.property_ref);

UPDATE idealista_leads l
SET matched_property_id = p.id,
    updated_at = now()
FROM properties p
WHERE l.matched_property_id IS NULL
  AND l.property_ref IS NOT NULL
  AND p.bc_reference IS NOT NULL
  AND lower(p.bc_reference) = lower(l.property_ref);

UPDATE idealista_leads l
SET matched_property_id = il.property_id,
    updated_at = now()
FROM idealista_listings il
WHERE l.matched_property_id IS NULL
  AND l.idealista_code IS NOT NULL
  AND il.property_id IS NOT NULL
  AND il.idealista_property_id IS NOT NULL
  AND il.idealista_property_id = l.idealista_code;
