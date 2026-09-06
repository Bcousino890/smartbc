-- ============================================================================
-- SmartBC · ¿llegó todo lo del inbox de Idealista?
-- ============================================================================
-- Hasta ahora esa pregunta no tenía respuesta posible. La extensión recorre el
-- inbox con "Capturar todas", cuenta las conversaciones que VISITA y enseña el
-- total en un cartel que desaparece con la pestaña. Si un envío fallaba —token
-- caducado, un corte de red— el recorrido seguía y lo contaba igual: el cartel
-- decía "150 capturadas" habiendo llegado noventa, y nadie tenía forma de
-- saberlo. De ahí salen los "me consta que contactaron y no aparecen".
--
-- Esta tabla guarda el resultado REAL de cada recorrido. No es telemetría: es
-- lo que hace auditable la única vía de entrada de leads que tenemos.
--
-- Idempotente: post-deploy relanza las migraciones en cada despliegue.
-- ============================================================================

CREATE TABLE IF NOT EXISTS idealista_capture_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Enviadas y CONFIRMADAS por el servidor, no visitadas. Son cosas distintas
  -- y confundirlas era justo el problema.
  sent         integer NOT NULL DEFAULT 0,
  failed       integer NOT NULL DEFAULT 0,
  -- Los conversation_id que se quedaron fuera: con ellos se vuelve al hilo
  -- (idealista.com/inbox/CONVERSATION_<id>) y se recaptura a mano.
  failed_ids   text[]  NOT NULL DEFAULT '{}',
  -- Por qué paró: "fin del inbox", "detenido por el usuario", un 401…
  stop_reason  text,
  started_at   timestamptz,
  finished_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- El panel solo pide el último recorrido, y de vez en cuando los diez últimos.
CREATE INDEX IF NOT EXISTS idx_idealista_capture_runs_finished
  ON idealista_capture_runs (finished_at DESC);

COMMENT ON TABLE idealista_capture_runs IS
  'Resultado real de cada recorrido de "Capturar todas" de la extensión: enviadas, fallidas y por qué paró. Sin esto, "¿está llegando todo del inbox de Idealista?" no tiene respuesta.';

NOTIFY pgrst, 'reload schema';
