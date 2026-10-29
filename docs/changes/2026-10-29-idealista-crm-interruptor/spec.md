# Idealista API → CRM: interruptor en el CRM — especificación

Permite encender y apagar la sincronización Idealista API → CRM ([expediente anterior](../2026-10-28-idealista-api-crm-sync/spec.md)) **desde el propio CRM**. Antes de encender, el CRM comprueba él mismo lo que antes había que mirar en el servidor.

- **Tamaño:** grande. Lleva una migración, aunque solo añade funciones y una tabla de registro.
- **Responsable:** Fabricio
- **Estado:** aprobada (ver «Aprobación»)
- **Base:** `origin/main` = `c0ddfbb38233d7016b91cc0952b55f3a0531bc93` (merge de #380)

## Contexto

- **#380 está fusionada.** La sincronización está apagada (`app_settings.idealista_crm_sync`).
- **Por qué hace falta esto:** encenderla y comprobar la activación requería acceso al VPS y a la base de datos (`idealista-crm-sync-activation.sql`), y Fabricio no lo tiene.
- **La CI del merge** falló una vez por la descarga de Google Fonts (el árbol es idéntico al de la PR) y pasó al reintentar. El despliegue del VPS pudo fallar por lo mismo, y el autodeploy no reintenta un commit fallido. Un commit nuevo en `main` sí dispara un despliegue nuevo.

## Decisiones

- **D1 (2026-10-29).** Se enciende y se apaga desde Configuración → Idealista, solo para el **dueño** (`owner`).
- **D2 (2026-10-29).** «Encender» solo funciona si todas las comprobaciones de activación salen bien. «Apagar» funciona siempre.
- **D3 (2026-10-29).** Queda registrado quién lo cambió y cuándo.

## Alcance

1. **Migración `0234_idealista_crm_switch.sql`:**
   - `idealista_crm_activation_report()`: solo lectura y solo `service_role`. Devuelve la lista de comprobaciones con `ok`. Son las mismas que `idealista-crm-sync-activation.sql`, salvo «interruptor apagado» y «aún no hay fichas de referencia», que tienen sentido en el servidor antes de encender pero no en un interruptor que también sirve para volver a encender.
   - `idealista_crm_set_enabled(p_enabled, p_actor)`: solo `service_role`.
     - Al encender, vuelve a calcular el informe y se niega si algo falla.
     - Al apagar, apaga siempre.
     - Escribe `app_settings` y un registro.
   - `idealista_crm_switch_log`: quién, cuándo, a qué estado, y si el informe estaba bien. Con RLS y sin políticas.
2. **Ruta `GET/POST /api/admin/idealista/crm-sync/switch`:** solo el dueño. Nunca llama a Idealista.
3. **Sección «Sincronización con el CRM»** en Configuración → Idealista, solo para el dueño:
   - el estado;
   - la lista ✓/✗;
   - «Encender», desactivado si algo falla;
   - «Apagar»;
   - el último cambio.
4. **Pruebas:**
   - SQL: el informe coincide con la comprobación del servidor, encender se niega con algo en rojo, apagar siempre funciona, el registro y los permisos;
   - TypeScript en la CI;
   - el build aislado;
   - capturas en tema claro y oscuro.

## Invariantes

- I1. Nada de esto llama a Idealista ni cambia la sincronización salvo `enabled`.
- I2. No se puede encender con alguna comprobación en rojo, ni siquiera llamando a la ruta directamente: la regla está en la base.
- I3. Solo el dueño ve la sección y puede usar la ruta. Las funciones y la tabla, solo `service_role`.
- I4. El informe es de solo lectura.

## Recuperación de la migración

- **Formato.** `BEGIN`/`COMMIT`, idempotente, y `lint-migrations.py` en verde.
- **`rollback-0234.sql`.** Borra las dos funciones. La tabla de registro se borra solo si está vacía; si no, se conserva como historial.
- **Compatibilidad.** El código anterior no usa nada de esto, así que es compatible.
- **Efectos irreversibles.** Ninguno. El valor del interruptor es el de siempre (`app_settings`).

## Criterios de aceptación

| # | Criterio | Cómo se comprueba |
|---|---|---|
| AC1 | Con todo bien, el informe sale entero en ✓ y «Encender» enciende. | SQL |
| AC2 | Sin «RESERVADO», o con un trigger desactivado, el informe lo marca ✗ y encender se niega sin cambiar nada. | SQL |
| AC3 | Apagar funciona siempre y queda registrado. | SQL |
| AC4 | `anon` y `authenticated` no pueden ejecutar las funciones ni leer el registro. | SQL |
| AC5 | La ruta solo responde al dueño, y la sección solo se pinta para él. | Pruebas de fuente y TS |
| AC6 | La sección se ve bien en tema claro y oscuro a 1440 y 390 px. | Capturas |
| AC7 | `tsc`, la CI, el build aislado y el lint de migraciones en verde. | Local y CI |

## Aprobación

- **2026-10-29.** Fabricio, tras la explicación en lenguaje sencillo: «perfecto si empieza».
