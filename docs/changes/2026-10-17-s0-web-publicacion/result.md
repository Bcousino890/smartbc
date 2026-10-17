# S0 · La web pública solo descubre viviendas publicadas: resultado

Especificación: [`spec.md`](spec.md). Plan: [`plan.md`](plan.md). Los dos los aprobó Fabricio el 17 de octubre de 2026.

## Base y commits

- **Base:** `origin/main` = `4ccbfa6`, comprobado con `git ls-remote`.
- **Rama:** `fabri/s0-web-publicacion`, en el worktree `wt/s0-web`.
- **Sin migración, sin dependencias nuevas** (`npm ci` con el lockfile existente) **y sin cambios de datos**.

| Commit | Tarea |
| --- | --- |
| `f1ea1c4` | T0: aprobación y base |
| `19ee37c` | T1: un solo filtro de publicación en la web pública, y sin dirección |
| `59316d4` | T2: simulador local de PostgREST y prueba de punta a punta (antes y después) |
| (este commit) | T3: resultado |

## Qué cambia

- **`lib/web/public-contract.ts`:** `applyPublicWebFilter` es la **única** regla de descubrimiento público: `status in (available, reserved)`, `archived_at is null` y `published_web = true`.
- **Dónde se aplica:**

  | Superficie | Comportamiento |
  |---|---|
  | Catálogo (`lib/portal-fetch.ts`) | Sin cambios |
  | Ficha (`getPortalProperty`) | Sin cambios |
  | **«Similares»** (`getSimilarProperties`) | **Corregido** |
  | **API de los destacados de la portada** (`/api/portal/properties`) | **Corregido** |

- **Dirección:** las cuatro superficies **dejan de pedirla y de enviarla** (`address` ya no está en el `select` ni en la respuesta). No se pintaba en ningún sitio. `Property.address` pasa a ser opcional.
- **La API conserva** el resto de campos, el orden (`id` descendente), el límite de 1.000 y la estructura (O-S0-1).
- **No se han tocado:**
  - `/compartir`, `/c`, `/s`, `/v`, `/seleccion`, `/a`, `/p` y `/og`;
  - el portal del cliente (O-S0-3);
  - el `middleware`, las consultas del staff y los catálogos.
  - Comprobado con `git diff --name-only 4ccbfa6..HEAD`: ninguna ruta protegida.
- **Las coordenadas exactas** del mapa de las fichas publicadas quedan como estaban (O-S0-2).

## Verificaciones

Todo es local y sintético:
- sin `.env*` ni credenciales reales;
- copia aislada `s0-iso`, verificada: 0 archivos `.env*`, solo variables ficticias y `@next/env` sin cargar archivos;
- `NEXT_PUBLIC_SUPABASE_URL` apunta al simulador en `127.0.0.1:54399`;
- sin IA (sin credenciales);
- Chromium con el proxy cerrado.

| Comprobación | Resultado |
| --- | --- |
| `npx tsc --noEmit` | sin errores |
| `scripts/test-public-web.mts`: el filtro aplica las tres condiciones, lo usan las cuatro consultas, nadie filtra a mano y nadie pide `address` | 15 ✅ |
| `scripts/test-public-web-e2e.mts` sobre el **build de producción compilado** (`next build` limpio + `next start`, `NODE_ENV=production`) y el simulador, con el código de **`main`** | **12 ❌**, todos en lo que corrige S0 (ver abajo) |
| La misma prueba con la **corrección** | **27 ✅, 0 ❌** (en «antes» hay 2 comprobaciones más: los enlaces de «similares» a P3 y P4) |
| `test:catalogs`, `test:catalogs-public`, `test:catalogs-manager` | 83, 453 y 148 ✅ |
| `test:smartlink`, `test:viewing-collections`, `test:client-shortlist`, `test:portal-links`, `test-admin-properties-search` | en verde |
| `test:typography` | las mismas 16 violaciones que ya hay en `main`; ninguna en archivos tocados |
| `next build` (producción, aislado) | correcto, dos veces (antes y después) |

### La matriz sintética

Cada vivienda lleva la dirección centinela `CALLE-SENTINELA-S0 9n`.

| Vivienda | `published_web` | `status` | `archived_at` | API, portada, catálogo, «similares» | Ficha `/web/propiedades/…` | `/compartir/…` |
|---|---|---|---|---|---|---|
| P1 | sí | available | — | sí | 200 | — |
| P2 | sí | reserved | — | sí | 200 | — |
| P3 | **no** | available | — | **no** (antes: **sí** en la API, la portada y «similares») | 404 | **200** (enlace intencionado) |
| P4 | **no** | reserved | — | **no** (antes: **sí**) | 404 | — |
| P5 | sí | sold | — | no | 404 | — |
| P6 | sí | archived | — | no | 404 | 404 |
| P7 | sí | available | con fecha | no | 404 | 404 |

### Antes (código de `main`) → después (corrección)

| Comprobación | Antes | Después |
|---|---|---|
| API: solo P1 y P2 | ❌ P3, P4, P2, P1 | ✅ |
| API: sin `address` ni centinela | ❌ | ✅ |
| API: resto de campos y orden | ❌ (por `address`); el orden, ✅ | ✅ |
| Catálogo: solo P1 y P2 | ✅ | ✅ |
| Catálogo: sin centinela en los datos | ❌ | ✅ |
| «Similares» de P1: solo P2, sin enlaces a 404 | ❌ P2, P3, P4 (P3 y P4 → 404) | ✅ |
| Portada (Chromium): destacados solo P1 y P2, sin centinela | ❌ P1 a P4 | ✅ |
| 404 de P3 a P7 en la ficha | ✅ | ✅ |
| `/compartir/P3` 200; P6 y P7 404 | ✅ | ✅ |
| Consultas reales: todas con las tres condiciones | ❌ («similares» sin `published_web`) | ✅ |
| Consultas reales: ninguna pide `address` | ❌ | ✅ |

- **El registro del simulador** confirma las consultas que llegaron de verdad: 2 durante el build (la API y el catálogo, que se generan en el build con caché de 5 minutos) y las de la ejecución.
- **`/compartir`** no devolvió la dirección centinela en ningún caso (informativo; está fuera de S0).
- **Cómo se ejecutó cada pasada:**
  1. copia aislada sincronizada (en «antes», con los cuatro archivos de la app tal como están en `4ccbfa6`);
  2. `.next` borrado;
  3. simulador con registro para el build;
  4. `next build`;
  5. simulador con registro para la ejecución;
  6. `next start`;
  7. la prueba.
- **Nota del proceso:** un primer «después» dio falsos fallos porque seguía vivo el `next-server` del «antes», y `pkill -f "next start"` no lo mataba. Desde entonces el guion libera los puertos por PID y borra `.next` antes de cada build. Las dos pasadas que constan arriba son limpias.

## Criterios de aceptación

| # | Estado | Evidencia |
| --- | --- | --- |
| S0-1 | demostrado | API: solo P1 y P2, en el build compilado |
| S0-2 | demostrado | Portada en Chromium: destacados P1 y P2 |
| S0-3 | demostrado | «Similares» de P1: solo P2; su enlace da 200 |
| S0-4 | demostrado | Catálogo y ficha: las mismas viviendas que antes; P3 a P7 dan 404 antes y después |
| S0-5 | demostrado | Centinela ausente de la API, la portada, el catálogo (HTML y datos RSC) y la ficha. Ninguna consulta pública pide `address` |
| S0-6 | demostrado | `/compartir/P3` 200 y P6/P7 404, antes y después; el diff no toca ninguna ruta protegida |
| S0-7 | demostrado | `test-public-web.mts` (15 ✅) |
| S0-8 | demostrado en local | `tsc`, `next build` y las pruebas. La CI, en el PR |

## Despliegue y caché

- **Sin migración.** El merge despliega como cualquier PR, y también despliega lo que haya en `main` sin desplegar.
- **Al desplegar**, la API y el catálogo se vuelven a generar en el build, así que la portada y el catálogo salen corregidos desde el primer momento. Si hay menos de 4 viviendas publicadas, la portada muestra menos tarjetas.
- **Después**, la API (`/api/portal/properties`) y el catálogo se regeneran cada 5 minutos (`revalidate = 300`). Publicar o retirar una vivienda en el panel tarda **hasta 5 minutos** en verse en la portada y el catálogo, igual que antes.
  - La ficha y «similares» se generan en cada petición: se ven al momento.
  - La página de la portada (`/web`) tiene caché de 1 hora, pero sus destacados los pide el navegador a la API, así que siguen los 5 minutos de esta.
- Una API de terceros que hubiera usado `/api/portal/properties` para ver viviendas sin publicar, o su dirección, deja de poder hacerlo, que es lo que se busca. En el repo no hay ninguna.

## Vuelta atrás

Revertir el merge con un PR (`git revert`). No hay datos ni esquema que deshacer.

## QA de Fabricio (después del despliegue)

1. En la web pública, la **portada** muestra como destacadas solo viviendas con «Publicar en la web» activado.
2. En la ficha de una vivienda publicada, **«similares»** solo muestra viviendas publicadas, y sus enlaces abren su ficha (no un 404).
3. Una vivienda **disponible pero sin publicar** no aparece en la portada, ni en el catálogo, ni en «similares». Su **SmartLink** (`/compartir/…` o «Copiar SmartLink» en la ficha del panel) **sigue funcionando**.
4. Al publicarla en el panel, aparece en la portada y el catálogo en unos 5 minutos. Al retirarla, desaparece en el mismo tiempo.
5. Opcional: abrir `/api/portal/properties` en el navegador. Ningún objeto tiene `address`, y solo salen viviendas publicadas.

## Merge y QA en producción

- **Merge:** Fabricio fusionó #324 el 17-10-2026 a las 14:25 UTC.
  - El commit de merge es `ab7bbcd`, con el mismo contenido que el último commit de la rama, `acd8c35` (comprobado con `gh pr view` y `git diff`).
  - La CI de `main` en `ab7bbcd`, en verde.
- **Producción:** **Fabricio confirma que S0 funciona en producción** (su informe del 17-10-2026).
  - El agente no ha comprobado nada en producción (P-1).
  - No hay evidencia propia del despliegue ni de la base de datos: lo que consta aquí es el informe de Fabricio.

## Revisión

No se pidió revisión adicional de Codex: la aprobación lo excluía.

## Pendiente o no demostrado

- **En producción no se ha comprobado nada** (P-1). Lo confirma la QA de Fabricio.
- **El simulador no es Supabase:** reproduce los filtros que usan estas rutas. El código de las consultas es el mismo que corre en producción.
- **Fuera de S0, sin cambios:** las coordenadas exactas en las fichas publicadas (O-S0-2), que «similares» mezcle países, el formato del precio de Chile en la API y el portal del cliente (O-S0-3).
- **Sigue igual el orden de entregas:** S0 → mejora del PDF (con su decisión sobre qué hacer si el hilo no arranca) → nuevo buscador del catálogo sin «Manual / Automático» → importación por enlace o PDF.
- **Siguen pendientes:** G-ALQ, el caso original de Recoletos y D13 en vivo.

## PR, CI y merge

- PR: https://github.com/Bcousino890/smartbc/pull/324 (rama `fabri/s0-web-publicacion`). La CI se comprueba en el último commit.
- El merge lo hace Fabricio. Sin migración; el merge dispara el autodespliegue.
