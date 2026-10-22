-- SOLO PRUEBAS LOCALES. Tras rollback-0229: vuelve la regla de 0226 (el precio bloquea en lo traducido).
\set ON_ERROR_STOP 1
SET ROLE service_role;
SELECT test_util.ok(catalog_tr_blocker('{"t": "X", "b": [{"k": "intro", "x": "Kısa süreli kiralama: 5.500 €/ay."}]}'::jsonb) = 'text_has_price', 'reversión: el precio vuelve a bloquear');
RESET ROLE;
SELECT test_util.ok(to_regproc('public.catalog_tr_text_blocker') IS NULL, 'reversión: catalog_tr_text_blocker fuera');
