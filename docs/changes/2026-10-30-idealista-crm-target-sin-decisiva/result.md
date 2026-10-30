# Idealista API → CRM: «No se pudo preparar la sincronización» sin operación decisiva

Arreglo posterior a la activación de la sincronización (expedientes
[2026-10-28-idealista-api-crm-sync](../2026-10-28-idealista-api-crm-sync/) y
[2026-10-29-idealista-crm-interruptor](../2026-10-29-idealista-crm-interruptor/)).

## Síntoma

Al pulsar «Actualizar por API» en un anuncio que ya estaba dado de baja
(estado `inactive`), Idealista contestaba bien, pero el panel mostraba
«⚠ Local (Idealista sí lo hizo): No se pudo preparar la sincronización…».

## Causa

`idealista_crm_target` (0233), en la comprobación de «operación abierta», leía
`v_dec.seq` aunque no hubiera ninguna operación decisiva. Una modificación
confirmada con estado `inactive` no es decisiva, así que `v_dec` (record) seguía
sin asignar. plpgsql prepara la expresión entera (`NOT v_has_dec OR … v_dec.seq`):
el `OR` no evita el error `record "v_dec" is not assigned yet`.

Solo falla en la **primera** llamada de cada conexión: después plpgsql
reutiliza el plan ya preparado y lee NULL. Por eso la suite SQL, que hace todo
en una sola sesión empezando por casos con decisiva, no lo veía. En producción
las conexiones de PostgREST se renuevan, así que el fallo aparecía.

Afectaba a cualquier anuncio sin decisiva en el registro: modificaciones de
anuncios ya dados de baja, registros con solo rechazos o lecturas fallidas, y
una operación abierta sin decisiva previa.

## Cambio

- **0236** redefine `idealista_crm_target` con `v_dec_seq bigint` (NULL mientras
  no hay decisiva). El resto del cuerpo es el de 0233 (diff de 3 líneas).
  `CREATE OR REPLACE` conserva los permisos (solo `service_role`). No toca datos.
  Reversión: [rollback-0236.sql](rollback-0236.sql).
- `toResult` (`lib/services/idealista/crm-sync/sync.ts`): `nothing_confirmed` ya
  no es un fallo: mensaje «Nada que reflejar en el CRM…» y sin aviso naranja.
- Panel: una fila `pending` sin ficha y con intento (`last_attempt_at`) es «nada
  que reflejar» y no pinta la etiqueta, igual que un anuncio anterior a la
  sincronización. (Un fallo al aplicar se deshace entero y no deja
  `last_attempt_at`, así que sigue enseñando «CRM: pendiente · Sincronizar».)

Comportamiento esperado (sin cambios de diseño): un anuncio dado de baja no crea
ficha de referencia; «Actualizar por API» de un anuncio antiguo **activo** sí la
crea (o reutiliza la propiedad vinculada) con «RESERVADO».

## Pruebas

- SQL, bloque 9f de `scripts/sql/test-idealista-crm-sync.sql`, en conexión nueva
  (`\connect`): falla con la 0233 sola (`record "v_dec" is not assigned yet`) y
  pasa con 0236.
- Mutación nueva: volver a leer `v_dec.seq` → detectada. Las mutaciones de
  «operación abierta» y «solapes» apuntan ahora a 0236, donde vive la función.
- Suite de la CI: `nothing_confirmed` → `ok` y sin paso local fallido.

## Despliegue

El autodeploy aplica 0236 solo. El informe del interruptor no vigila el cuerpo de
esta función (solo sus permisos), así que sigue en verde. No hay que apagar ni
volver a encender nada.
