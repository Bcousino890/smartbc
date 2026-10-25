# CRM-03 · Resultado · PR-B (abrir y volver)

Plan y criterios: [change.md](change.md) (B, P3, AC6, AC7, AC12). Aparte de `change.md` para que los PR de CRM-03 no choquen en el mismo fichero.

## Qué cambia

- `LinkPendingOverlay` (`components/admin/nav-pending.tsx`): mismo mecanismo que la sidebar (E2, D6), sin `loading.tsx`. Va **dentro** del `Link` y usa `useLinkStatus`: mientras la navegación de ESE enlace está en curso, pinta el esqueleto del destino encima del contenido. No dibuja nada en el propio enlace, así que no lo mueve.
  - Lista → ficha: en el título de la fila (solo si el enlace va a la ficha del admin) y en «Editar» → `PropertyDetailSkeleton`.
  - Ficha → «Volver al listado» → `PropertiesListSkeleton`.
- El portal del esqueleto es compartido con la sidebar. En móvil ahora cubre también la franja superior (antes asomaba la página anterior en los 64 px de arriba). El botón del menú (z-40) queda encima y el contenido del esqueleto conserva el mismo hueco que `<main>` (`pt-16`). Afecta también al esqueleto de la sidebar: es el mismo componente.
- El contrato de CRM-01 no cambia: `?volver=`, ancla y resalte de la fila de origen, pestaña nueva y salida segura.

## Medición

2026-10-25/26, misma sesión: `main` `a604f260` (base) frente a la rama, en copias aisladas sin `.env`. Mismo arnés (el de la rama, con R14) para los dos builds. 3 pasadas por variante, en frío y en caliente; mediana (mín–máx). **Local o simulado: no son tiempos de producción.**

**Primer indicador** (clic → `[data-crm-skeleton]` o `[data-crm-pending]`), en frío (AC6, objetivo ≤ 100 ms):

| Navegación | escritorio | 40 ms simulados | móvil |
|---|---|---|---|
| R1 lista → ficha | — → **21** (16–27) | — → **19** (16–20) | — → **21** (19–24) |
| R1 ficha → «Volver» | — → **14** (11–14) | — → **17** (12–22) | — → **22** (22–36) |
| R2 lista → ficha | — → **20** (15–21) | — → **14** (12–20) | — → **29** (21–29) |

«—» = en `main` no aparece ningún indicador: la pantalla no cambia hasta que llega la página.

**Contenido útil** (AC7, objetivo: no empeorar más de un 10 %), en frío:

| Navegación | escritorio | 40 ms simulados | móvil |
|---|---|---|---|
| R1 lista → ficha | 124 → 110 | 675 → 640 | 605 → 595 |
| R1 ficha → «Volver» | 200 → 189 | 459 → 429 | 743 → 764 (+2,8 %) |
| R2 lista → ficha | 76 → 74 | 664 → 645 | 551 → 574 (+4,2 %) |

El peor caso es +4,2 % en móvil, dentro del margen y del orden de la dispersión de esa variante (551 en base, con un máximo de 939). Las consultas no cambian (13 en lista → ficha, 9 en «Volver»).

## Comprobaciones

- Contrato de navegación: rama 47/47 (escritorio y 40 ms) y 45/45 (móvil) en las 18 pasadas. En `main` fallan exactamente las dos comprobaciones de «aparece el esqueleto» (45/47 y 43/45): es lo que B añade.
- **R14** (nuevo, `page.route` retiene o hace fallar las respuestas para no depender de la velocidad):
  - **cancelada:** la ficha tarda y se pulsa otra sección; gana el último destino y no queda esqueleto;
  - **fallida:** la respuesta de la ficha da 500 o se corta; Next carga el documento entero, la ficha llega y no queda esqueleto. Si además falla el documento, se ve el error y ningún esqueleto;
  - **Cmd/Ctrl+clic:** pestaña nueva con `volver=`; la actual sigue en la lista, sin esqueleto;
  - **con filtros y página 2:** ida y «Volver» con esqueleto; vuelven filtros, página y fila de origen.
- Tras rebasar sobre `main` con C (#376): 52/52 (escritorio) y 50/50 (móvil), R13 y R14 incluidos.
- Capturas locales en claro y oscuro, escritorio y móvil, de los dos esqueletos (AC12): solo tokens, sin colores fijos. No se suben al repositorio.
- En local: los 33 `test:*` del CI, `tsc` y `lint-migrations`.
