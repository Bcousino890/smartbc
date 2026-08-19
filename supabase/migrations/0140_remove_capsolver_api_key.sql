-- Elimina CapSolver: ya no se usa para resolver el reto DataDome de Idealista.
-- Borra la API key guardada en app_settings (la migración 0008 la insertaba).
-- ⚠️ Revocar además la key en el panel de CapSolver: sigue viva en el
-- historial de git de 0008_add_capsolver_api_key.sql.
DELETE FROM app_settings WHERE key = 'scraping.capsolver.api_key';
