# BCP-01 · HOME de Fabricio y catálogo editorial: plan

Enlace a la especificación: [spec.md](spec.md) (aprobada el 2026-10-13).

- **Rama de la fase 1:** `fabri/bcp-01-fase1`
- **Estado:** plan corregido aprobado por Fabricio el 2026-10-13. Este documento consolida el plan original con la corrección de identidad y las enmiendas E1–E7. Las etiquetas de «borrador» de las versiones anteriores quedan sustituidas por esta aprobación. Las puertas de evidencia siguen abiertas.

## Base

- **Fase 1:** `origin/main` = `ffcdc7e7b48fdb216c45e9bcf0f924bf20e23b9c` (`git fetch origin` y `git ls-remote` el 2026-10-13). El `main` local (`1506dbc`) no se usa.
- Cada fase siguiente parte del `origin/main` vigente cuando empiece, en su propia rama.
- Números de migración: en la base estaban ocupados hasta `0191`; la fase 1 usa `0192`. Se vuelve a comprobar antes de cada push.

## Pasos de entorno que autoriza el plan

1. `git fetch origin` y fijar el SHA; `git worktree add -b fabri/bcp-01-faseN /Users/fabriirguez/SMARTBC/wt/bcp-01 <SHA>`, sin tocar el `main` local, el stash ni otras ramas.
2. `brew install node@22` (keg-only), usado solo en el worktree con `PATH=/opt/homebrew/opt/node@22/bin:$PATH`; `npm ci`.
3. Paquetes nuevos solo en su fase: fase 3 `pdfjs-dist@6.4.x`, `tesseract.js@7.0.x`, `@tesseract.js-data/spa@1.0.x`; fase 4 `@fontsource/fraunces@5.3.x`, `@fontsource/karla@5.3.x`. Antes de instalar, se vuelven a comprobar versión y licencia.
4. **Postgres temporal (E7)**, con los binarios ya instalados de `/opt/homebrew/opt/postgresql@16/bin`. Lo controla `scripts/sql/run-local.sh`, que:
   - solo funciona con la carpeta de datos `<scratchpad>/pg-bcp01`, el host `127.0.0.1`, el puerto 54329 y la base `bcp_test`;
   - limpia `DATABASE_URL*`, `SUPABASE_*` y `NEXT_PUBLIC_SUPABASE_*` y nunca lee un `.env`;
   - usa un esquema simulado (`scripts/sql/stub-supabase.sql`) y datos sintéticos;
   - al limpiar, borra solo esa carpeta.
5. **Servidor local con datos de prueba (E7).** Las rutas de prueba solo responden si `NODE_ENV === "development"` **y** `CATALOG_FIXTURES === "1"`. `next dev` se arranca sin `.env.local` y con `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9` (puerto cerrado). Chrome headless, sin red externa.
6. **Nada de** Docker, cron, infraestructura nueva, SSH, credenciales ni consultas a la base de datos real.

## Decisiones técnicas

- **Identidad.** `0192` siembra `home_owners` con el id del único usuario de `auth.users` cuyo correo sea `fabricio.andree@bcousinoprop.com` (como `profiles.id` → `auth.users.id`, es el mismo id que el perfil). Con 0 coincidencias o con varias, no siembra nada y nadie entra. Después se autoriza solo por id. Si en vivo da 404, Fabricio ejecuta una consulta de diagnóstico de solo lectura y, si hace falta, una migración posterior con el UUID que él aporte.
- **Permisos (E1).**
  - Tablas nuevas: RLS activado, `revoke all … from public, anon, authenticated` y `grant … to service_role`.
  - Funciones de gestión: `security invoker` y `set search_path = public`; `revoke all … from public, anon, authenticated` y `grant execute … to service_role`.
  - Cada función de gestión recibe `p_actor`: si no está en `home_owners` o no es el dueño del catálogo, lanza `forbidden`.
  - Funciones públicas (fase 2): solo `service_role`, detrás de rutas con token.
- **Huella de cambios (E3, fase 2).** Es el `md5` de la instantánea pública completa, calculado en una sola sentencia. Cubre membresía, cascada, disponibilidad, fotos, `features` y `floor_override`. `catalogs.version` es solo un contador de gestión.
- **Sincronización (E4, fase 2).**
  - Arranque con consulta inmediata y SSE en paralelo hasta el saludo (`hello`).
  - En el servidor, un vigilante cada 300 ms por los tokens que tienen lectores, que comprueba la huella y la validez del acceso; si cambia, manda la instantánea completa.
  - Latido cada 500 ms. Sin latido durante más de 1 s, se pasa a consultar cada 500 ms.
  - Los vigilantes se retiran cuando no quedan lectores.
  - Un gesto retrasa la actualización como mucho 0,38 s.
- **Medición (E5, fase 2).** Ensayo, catálogo y huella; reloj `performance.timeOrigin + performance.now()`; los dos lectores por separado; si falta uno en 5 s, cuenta como fallo. `BroadcastChannel` solo lleva estos datos, nunca contenido.
- **PDF (E6, fase 4).** Casos corto y largo, texto por página con PDFKit de macOS, índice, descripción completa, `FontFile` incrustado y caracteres comprobados.
- **Lector:** componentes nuevos en `/seleccion/[token]`, sin modificar `/v`.
- **Importación:** en el navegador (PDF.js + Tesseract.js); el servidor solo con evidencia y aprobación.

## Tareas

### Fase 1 · PR-1 «Mi espacio y catálogos», sin nada público

- **T1 · Migración `0192_catalogs_core.sql`.**
  - Contenido: `home_owners`, `catalogs`, `catalog_items` (clave pública opaca, posición, pareja catálogo-propiedad única, `ON DELETE CASCADE` sobre la propiedad), `catalog_shares` (la tabla; se usa en la fase 2), las funciones de gestión con `p_actor`, los permisos de E1 y la siembra.
  - Verificación en el Postgres local (`scripts/sql/test-catalogs-core.sql`): denegaciones a `anon` y `authenticated` (tablas y funciones), `forbidden` para quien no es dueño, que el dueño sí puede, cardinalidad de la siembra (0, 1 o 2 coincidencias), unicidad, que cada operación suba `version`, cascada al borrar una propiedad y que la migración pueda aplicarse dos veces. Además, `lint-migrations.py`.
  - Reversión: `rollback-0192.sql`.
  - Cubre AC1 y AC3.
- **T2 · Guarda de propietario.**
  - `lib/catalogs/access.ts` (puro) y `lib/catalogs/owner.ts` (`isHomeOwner`, `requireHomeOwnerPage`, `assertHomeOwner`, `withHomeOwner`).
  - Tests: dueño, otro staff, cliente y sin sesión.
  - Cubre AC1.
- **T3 · HOME `/es/admin/mi-espacio`.**
  - Estantería Boutique; interfaz del admin en Lato; accesos a Clientes, Propiedades y Solicitudes; entrada del menú solo para el dueño (`ownerOnly`, calculado en el servidor).
  - Verificación: `test:typography`, `tsc` y capturas con datos de prueba a 1440 px y en un marco de 362 px.
  - Cubre AC1, AC2 y AC12.
- **T4 · Gestión.**
  - Crear catálogos, editar metadatos, añadir propiedades existentes (referencia BC, slug o URL propia), quitar, ordenar y archivar.
  - **No escribe en `properties` ni en clientes, y no importa propiedades nuevas.** La integración con portales es T16b (fase 3, tras G3).
  - Verificación: tests de cómo se interpretan las referencias y revisión del código que confirme que solo escribe en tablas de catálogo.
  - Cubre AC3, AC4a y AC14.
- **T5 · Portada Boutique.**
  - Fraunces y Karla limitadas a la portada (`next/font`, CSS module). No cambia la tipografía del admin.
  - Se aplican los principios de las referencias (etiquetas a ambos lados del arco, número de selección, cifras de ancho fijo) sin copiar fotos, textos ni código.
  - Cubre AC12.

### Fase 2 · PR-2 «Enlace y lector en vivo»

T6 contrato público y huella · T7 enlaces · T8 lector C · T9 sincronización · T10 modo medición · T11 revisión local (detalle en el plan aprobado).

**Notas de ejecución de la fase 2 (sin cambio de arquitectura):**
- Migración `0193` en vez de `0189` (números ocupados). Funciones: `get_catalog_states` (plural), más `catalog_internal_snapshot` y `catalog_public_fingerprint`. La gestión del enlace también va en SQL (`catalog_share_*`, token con `generate_url_safe_token(21)`, el mismo mecanismo que `randomToken()` según `lib/tokens.ts`), para que el dueño se compruebe en la base igual que en la fase 1.
- La huella es el `md5` de la instantánea **interna** completa (un superconjunto de lo público): todo cambio público la cambia; algún cambio no visible también, y solo provoca una actualización de más.
- Rutas: `eventos` (SSE) y `estado`, que reúne las previstas `version` y `contenido` (devuelve el contenido solo si la huella del lector no es la vigente).
- En la doble página, la introducción va a la izquierda del índice; en una página, encima. El cierre lleva el nombre del asesor y el teléfono de la agencia (sin correo).
- `tGuardado` es la llegada de la respuesta de la acción a la HOME (E5); como las acciones avisan al vigilante antes de responder, es normal ver resultados «≤ 0 s».

**Caso de verificación que se arrastraba a T10 (hecho en la fase 2, con test).** Si un lector pinta la huella nueva **antes** de que la HOME publique la confirmación del guardado (el SSE puede llegar antes que la respuesta de la acción), el lector guarda esa observación `{huella, tPintado}` en un búfer corto. Cuando llega la confirmación con esa misma huella y ese catálogo, la empareja con el ensayo. No reutiliza una observación antigua cuya huella no coincida con la de ese ensayo. Si `tPintado < tGuardado`, el resultado del ensayo es «≤ 0 s» y se anota tal cual. T10 incluirá un test de este orden de llegada.

### Fase 3 · PR-3 «Importar PDF» (puertas G1, G2 y G3)

T12 dependencias y recursos · T13 extracción · T14 validación con muestras · T15 migración · T16 subida y revisión · **T16b portal → catálogo** (parámetro `catalogo` comprobado antes de escribir; sin el parámetro, el flujo de siempre) · T17 confirmar. G3 cubre toda creación de propiedades, venga de un PDF o de un portal.

### Fase 4 · PR-4 «Descargar el PDF editorial»

T18 fuentes · T19 composición C · T20 ruta de descarga · T21 verificación (E6).

## Verificación final de cada PR

- `tsc --noEmit`, `test:typography`, los tests nuevos y los de regresión (`test:viewing-collections`, `test:client-shortlist`, `test:portal-links`, `test:smartlink`) y `lint-migrations.py`.
- La CI del PR (incluye el build) en verde.
- QA en vivo de Fabricio con los criterios que queden pendientes.

## Riesgos y suposiciones

- Existe exactamente un usuario `fabricio.andree@bcousinoprop.com` con su perfil. Si no, nadie entra y se usa el paso de diagnóstico.
- Los permisos por defecto de Supabase en producción pueden diferir de los del Postgres local; por eso se retiran de forma explícita.
- No está comprobado si el Postgres de producción es de otra versión que el local (16), ni el esquema real de `storage`.
- Fusionar puede desplegar y aplicar migraciones.

## Aprobación

Fabricio, 2026-10-13: aprobó el plan corregido y autorizó la fase 1 (T1–T5, PR-1 y CI; se para antes del merge y antes de la fase 2; sin revisión adicional de Codex).

## Ampliación (aprobada el 2026-10-13)

Plan: [ampliacion-plan.md](ampliacion-plan.md), aprobado por Fabricio el 2026-10-13 (incluido el máximo automático de 1 a 24). Autorización actual: X0–X3 / PR-A, con parada antes del merge. Tres PR:
- **A**, marca, contacto y cierre (`0194`);
- **B**, zonas, precio, modos y anuncios (`0195`);
- **C**, recorrido editorial (`0196`).

Tareas X0–X13. Los números de migración se vuelven a comprobar antes de cada push.

## Hoja de ruta (17 de octubre de 2026, Fabricio)

**Estado de la fase 4 (descargar el PDF editorial):** cerrada.
- Entró por su propio expediente, [`2026-10-16-bcp-01-pdf`](../2026-10-16-bcp-01-pdf/result.md), en el PR #323 (`38d2151`).
- Fabricio aprobó el PDF real en producción el 17 de octubre de 2026.

**Orden siguiente:**
1. **Mejorar el rendimiento del PDF:** sacar la maquetación del bucle de eventos de la web. Primero se planifica y se aprueba. Expediente: [`2026-10-17-bcp-01-pdf-worker`](../2026-10-17-bcp-01-pdf-worker/spec.md).
2. **Implementar y verificar esa mejora**, con la QA de Fabricio.
3. **Importar PDF de colaboradores al catálogo** (la siguiente entrega funcional; aquí era la fase 3). Primero se explora con muestras representativas; después vienen la especificación y el plan.

**Alcance previsto de la importación** (solo para orientar su futura exploración y especificación; **no está aprobada ni empezada**):
- **Qué PDF:** se intenta extraer de PDF digitales, escaneados y mixtos, también de archivos con varias viviendas.
- **Qué sale:** los datos y las fotos de cada vivienda, como **borradores editables** que revisa Fabricio.
  - Se señala con claridad lo que falta o es dudoso.
  - No se inventa nada y no se publica nada automáticamente.
- **Cómo se extrae:**
  - se prefiere la extracción y el OCR gratuitos en el navegador, como ya se acordó (PDF.js y Tesseract.js);
  - cualquier procesamiento en el servidor o dependencia nueva tendrá que justificarse en su plan. Las versiones que anotó el plan original para esta fase no autorizan instalar nada ahora;
  - **no se envían documentos a servicios externos.**
- **Privacidad:** la del catálogo se respeta. Lo importado **no se publica solo** en la web pública.
- **Fichas del CRM:** antes de proponer que la importación cree fichas de propiedad, hay que determinar sus efectos (publicación, sincronizaciones, matching, listados…). La puerta G3 de la fase 3 sigue en pie.
- **Muestras:** el soporte real, los límites y los criterios de aceptación se fijan con muestras representativas de Fabricio. No se promete una extracción fiable de cualquier PDF.

**Siguen pendientes, sin cambios:** G-ALQ, el caso original de Recoletos y D13 en vivo.
