# CRM-03 · Resultado · PR-A (columnas explícitas de la lista)

Plan y criterios: [change.md](change.md) (A, P1, P2, AC2–AC5). **El merge espera a que la persona autorizada ejecute la consulta de solo lectura de `change.md`**: confirma que las 23 columnas existen en producción y da el tamaño almacenado por fila.

## Qué cambia

- `getAdminPropertyList` (`lib/db/queries/properties.ts`) pide `ADMIN_LIST_SELECT` (`lib/properties/admin-list-columns.ts`) en lugar de `*`. Son exactamente las columnas que lee `propertyRowToAdminProperty`, más `id` para las etiquetas, más `agencies(name, slug)` y `property_photos(url, is_cover, position)` como antes. Mismos filtros, orden y tope de 2.000 que `getProperties({ includeUnavailable: true, includeArchived, country }, 2000)`.
- `getProperties` no cambia: la usa el portal del cliente.
- `AdminListRow`: el adaptador declara solo lo que lee, así que TypeScript avisa si alguien usa en la lista una columna que no se pide.
- Riesgo que motiva el bloqueo: con `*`, una columna que no existiera en producción no se notaba. Con la lista explícita, PostgREST respondería 400 y la lista fallaría. `currency`, `property_reference` y `floor_override` no están en `database.types.ts` (sí en las migraciones 0020, 0047 y 0146).

## Paridad (AC2)

`scripts/test-admin-properties-columns.mts`, en `npm run test:admin-properties`:
- el adaptador da lo mismo con la fila completa (con columnas que la lista no usa) que con la proyectada;
- quitar cualquier columna de la lista cambia el resultado de alguna fila: la paridad detectaría una columna olvidada;
- el `select` no repite columnas, no lleva `*` ni datos internos (dueño, notas, dirección);
- filtros, búsqueda, totales, opciones y selección (por id), iguales.

## Medición

2026-10-26, misma sesión, con el Mac enchufado: `main` `47c7437d` (base) frente a la rama, en copias aisladas sin `.env`. Mismo arnés y mismos datos para los dos builds. 3 pasadas por variante, en frío y en caliente; 36 corridas completas. Contrato: 52/52 (escritorio y 40 ms) y 50/50 (móvil) en todas. **Local o simulado: no es producción.**

**Lo que viaja de la base de datos a Next en la lista** (AC3): JSON serializado, sin comprimir, con los datos sintéticos. Son las 1.511 filas de la lista por defecto (sin archivar, país `es`):

| | Base (`*`) | Rama (columnas) | Diferencia |
|---|---|---|---|
| Respuesta completa de `properties` (con fotos y agencia) | 5.500.719 B | 4.780.877 B | −13,1 % |
| Solo las columnas de `properties` | 3.871.001 B | 3.151.159 B | −18,6 % |

- La cifra de la rama es la que registró el simulador de la rama en las 18 pasadas (siempre 4.780.877 B).
- La de la base se calcula con la misma función de proyección del simulador sobre las mismas filas. El simulador de `main` aún no registra bytes, porque eso llega con este PR.
- **No es tráfico real.** Los datos sintéticos no tienen el ancho real de notas, direcciones ni descripciones, y les faltan columnas que en producción sí existen. En producción solo se conocerá el **tamaño almacenado** por fila (`pg_column_size`, de la consulta autorizada), que es una proporción orientativa y no el tamaño del JSON.

**Otros criterios:**

| # | Criterio | Resultado |
|---|---|---|
| AC4 | Consultas de la lista | 9 → 9: identidad y permisos igual; `properties`, `agencies`, `property_tags`, `property_tag_links` |
| AC5 | Lo que llega al navegador | 886 KB → 886 KB (igual: no es el objetivo de A) |

**Tiempos.** No se espera mejora local: la lista sigue enviando lo mismo al navegador, y en local la base de datos responde al instante. Contenido útil de «sidebar → Propiedades», 1.ª vez, en frío:

| Variante | Base | Rama |
|---|---|---|
| escritorio | 289 (246–306) | 237 (234–349) |
| 40 ms simulados | 487 (468–521) | 529 (490–544) |
| móvil | 1357 (1345–1363) | 1372 (1365–1402) |

En la variante de 40 ms la rama salió un 5–9 % más lenta en las seis pasadas; en escritorio, más rápida; en móvil, igual. El cambio no añade consultas ni datos, y la base se midió antes que la rama. Se comprueba aparte alternando base y rama (ver abajo).

## Arnés

R12 espera a que la lista esté pintada antes de buscar la campana. Sin esto, 2 de 54 pasadas de escritorio (en `main` y en la rama) buscaban la campana antes de que llegara la página y fallaban. No era un fallo de la app.
