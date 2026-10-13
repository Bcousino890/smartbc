-- SOLO PRUEBAS LOCALES (BCP-01). Tras los escenarios sin coincidencia o
-- ambiguos, home_owners debe quedar vacía (fallo cerrado).
SELECT test_util.ok((SELECT count(*) FROM home_owners) = 0, 'siembra: 0 dueños (fallo cerrado)');
