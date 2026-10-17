# S0 · La web pública solo descubre viviendas publicadas: plan

Especificación: [`spec.md`](spec.md), en borrador.

- **Rama:** `fabri/s0-web-publicacion`, en el worktree `wt/s0-web`, creada desde `origin/main` = `4ccbfa6` (comprobado con `git ls-remote` el 17-10-2026).
- **Estado:** **aprobado** el 17-10-2026, junto con la especificación (ver su sección de aprobación).

## Base

- Hoy, `origin/main` = `4ccbfa6`.
- **Al aprobar:**
  1. `git fetch`;
  2. `git ls-remote`;
  3. el worktree nuevo desde ese SHA, con este expediente copiado.
- **Si `main` avanza antes del PR:**
  - si no toca los archivos de la tarea, se anota el SHA nuevo;
  - si los toca, se rebasa y se repiten las comprobaciones;
  - si hay conflicto, se para y se avisa.

## Pasos de entorno que autorizaría el plan

1. `git worktree add -b fabri/s0-web-publicacion /Users/fabriirguez/SMARTBC/wt/s0-web <SHA>`.
2. `npm ci` con el lockfile existente y **sin paquetes nuevos**. Es una instalación.
3. **Copia aislada** sin `.env*` (`iso.sh`, como en #323) para `next build` y `next start` con `NODE_ENV=production`, con estas variables ficticias:
   - `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<puerto>`;
   - las claves.
4. **Simulador local de PostgREST** (`scripts/sim/postgrest-sim.mts`, Node `http`, sin dependencias):
   - escucha solo en `127.0.0.1`;
   - sirve tablas en memoria con datos sintéticos;
   - responde a los filtros que usan estas rutas: `eq`, `neq`, `in`, `is`, `order`, `limit`, `select` (devuelve la fila con sus relaciones ya anidadas) y una sola fila por la cabecera `Accept`;
   - una tabla que no conoce devuelve `[]`, y una escritura devuelve 201 sin guardar nada;
   - no se conecta a nada real.
   - Es la base del simulador que el plan del PDF en un hilo prevé en su T2, que podrá reutilizarlo.
5. Chromium de Playwright, el ya usado en #323, solo para la portada (que carga los destacados en el navegador).
6. Commits en la rama, push, PR y CI.

**No autorizaría:** producción, credenciales, bases de datos reales, migraciones, dependencias nuevas ni revisión de Codex.

## Tareas

### T0. Registro y base

- **Acción:**
  - anotar la aprobación y las respuestas a O-S0-1, O-S0-2 y O-S0-3;
  - crear el worktree y ejecutar `npm ci`.
- **Verificación:** `tsc` en verde, antes de cambiar nada.
- **Commit:** «S0 T0: aprobación y base».

### T1. Filtro de publicación compartido y respuesta sin dirección

- **Acción:**
  - `lib/web/public-contract.ts`:
    - `PUBLIC_WEB_STATUSES`;
    - `applyPublicWebFilter(query)`, con `.in("status", …).is("archived_at", null).eq("published_web", true)`;
    - `PUBLIC_WEB_SELECT`, sin `address`.
  - Usarlo en:
    - `lib/portal-fetch.ts`;
    - `app/web/propiedades/[id]/page.tsx`, en `getPortalProperty` y en `getSimilarProperties`;
    - `app/api/portal/properties/route.ts`.
  - Quitar `address` de las cuatro respuestas; `Property.address` pasa a ser opcional.
  - No cambia nada más: ni la forma de la API, ni el límite, ni el orden, ni el formato del precio.
- **Verificación:**
  - **Pruebas puras** (`scripts/test-public-web.mts`):
    - un constructor de consultas falso registra las llamadas, y el filtro aplica exactamente las tres condiciones;
    - `PUBLIC_WEB_SELECT` no contiene `address`;
    - una búsqueda en el código confirma que las cuatro superficies usan `applyPublicWebFilter` y que ningún archivo de `app/web/**` ni `app/api/portal/**` vuelve a seleccionar `address`.
  - `tsc` en verde.
- **Cubre:** S0-7 y, en parte, S0-5.
- **Commit:** «S0 T1: un solo filtro de publicación en la web pública y sin dirección».

### T2. Simulador y prueba de punta a punta en el build de producción

- **Acción:**
  - **El simulador del paso 4**, con un juego sintético. Cada vivienda tiene foto, título reconocible y la **dirección centinela** `CALLE-SENTINELA-S0 99`:

    | Vivienda | `published_web` | `status` | `archived_at` |
    |---|---|---|---|
    | P1 | sí | available | — |
    | P2 | sí | reserved | — |
    | P3 | no | available | — |
    | P4 | no | reserved | — |
    | P5 | sí | sold | — |
    | P6 | sí | archived | — |
    | P7 | sí | available | con fecha |

  - **`scripts/test-public-web-e2e.mts`** contra `next start`, sobre el build compilado:
    1. `GET /api/portal/properties` → exactamente P1 y P2; ningún objeto con `address`; el centinela no aparece.
    2. `GET /web/propiedades` → solo P1 y P2 en el HTML y en los datos RSC; el centinela no aparece.
    3. `GET /web/propiedades/P1` → 200; «similares» solo enlaza a P2; sin el centinela.
    4. `GET /web/propiedades/P3`, `…/P5` y `…/P7` → 404, como antes.
    5. La **portada** `/web`, en Chromium: espera a los destacados; solo aparecen P1 y P2.
    6. `GET /compartir/P3` → 200 (enlace intencionado); `GET /compartir/P6` → 404.
       - Las viviendas sintéticas son de una agencia que **no** es `portales-externos`, para que `/compartir` no intente generar la descripción con IA.
       - El servidor arranca sin credenciales de IA, así que **no puede haber llamadas reales de IA**.
       - Cualquier petición saliente que no sea al simulador falla (sin red: proxy cerrado, como en #323).
  - **Antes y después:** la misma prueba se ejecuta primero con el código de `main`. Ahí debe fallar en los puntos 1, 2 (el centinela), 3 y 5, y pasar en el 4 y el 6. Así se demuestra que la prueba detecta el problema.
- **Cubre:** S0-1 a S0-6 y S0-8 (el build).
- **Commit:** «S0 T2: simulador local y prueba de punta a punta (antes y después)».

### T3. Cierre

- **Acción:**
  - `git diff` contra la base: no se ha tocado ningún archivo de `/compartir`, `/c`, `/s`, `/v`, `/seleccion`, `/a`, `/p`, `/og` ni del portal del cliente (S0-6);
  - `tsc`, las pruebas de catálogos y de Propiedades que ya existen, `test:typography` y `next build` aislado;
  - `result.md`; volver a comprobar `main`; push, PR y CI.
- **Parada:** antes del merge.
- **QA de Fabricio después del despliegue:**
  - en la web pública, una vivienda sin publicar no aparece en la portada ni en «similares»;
  - publicarla en el panel la hace aparecer en unos 5 minutos;
  - su SmartLink sigue funcionando.
- **Commit:** «S0 T3: resultado».

## Verificación final

- La CI del PR en verde.
- S0-1 a S0-8 con su evidencia en `result.md`. Lo que no se pueda demostrar se dice con su motivo.

## Riesgos y suposiciones

| Riesgo o suposición | Qué se hace |
|---|---|
| **Consumidor externo de `/api/portal/properties`** (no visto en el repo) | Se mantiene la forma; solo cambian qué viviendas salen y desaparece `address`. Si alguien la usaba para listar viviendas sin publicar o su dirección, deja de poder: es lo que se busca. |
| **Menos de 4 viviendas publicadas** | La portada enseña menos tarjetas; no se rellena con viviendas sin publicar. |
| **Caché de 5 minutos** | El cambio, y cada publicación o retirada, tarda hasta 5 minutos en verse. Ya pasa hoy. |
| **El simulador no es Supabase** | Solo reproduce los filtros que usan estas rutas. El código de las consultas es el mismo; la QA de Fabricio lo confirma en producción. |

## Aprobación

**17 de octubre de 2026 · Fabricio** aprueba este plan y la especificación. Respuestas:
- **O-S0-1:** se mantienen la forma, el orden y el límite de 1.000 de la API; solo se quita la dirección.
- **O-S0-2:** las coordenadas exactas quedan fuera.
- **O-S0-3:** el portal del cliente se conserva.

Se ejecutan T0–T3 seguidas y se para antes del merge.
