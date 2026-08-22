-- 0152 · marca de agua detectada en la foto.
--
-- El clasificador de visión ya mira cada foto para decidir su capítulo; que
-- diga además si lleva encima el logo de un portal cuesta un campo más en la
-- misma respuesta. Sirve para no elegir como imagen de un capítulo una foto
-- marcada por la competencia habiendo una limpia (misma lección que el vídeo
-- hero de BC-1397, ahora aplicada a las fotos).
--
-- NULL = todavía sin analizar; se trata como "sin marca" para no esconder
-- fotos por falta de dato.
alter table property_photos
  add column if not exists ai_watermark boolean;
