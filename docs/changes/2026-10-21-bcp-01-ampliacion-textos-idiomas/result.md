# BCP-01 · Ampliación: textos reutilizables, idiomas, «Vivir en…» y acabado visual — resultado

**Especificación:** [`spec.md`](spec.md) · **Plan:** [`plan.md`](plan.md). Aprobados por Fabricio el 21-10-2026 (N1–N4 cerradas, DA31–DA37; N5 abierta para el PR6).

> **La QA en producción y los merges son de Fabricio.** Todo lo de abajo se ha probado con datos sintéticos, Postgres temporal y fixtures; sin producción, credenciales, IA real ni archivos `.env` del repositorio (el `next build` se hizo con `.env.production` apartado fuera del worktree).

## PR1 · Biblioteca de textos aprobados y reutilización

- **Rama:** `fabri/bcp-01-textos-aprobados`, desde `origin/main` = `8b640e3b`. Comprobado antes de empezar: última migración en `main` 0218 y ningún PR abierto con 0219 o posterior.
- **Migración:** `0219_catalog_copy_library.sql` con [`rollback-0219.sql`](rollback-0219.sql). Sin dependencias nuevas.

### Qué hace

- **Biblioteca por dueño** (`property_copy_versions`): versiones inmutables del título y la descripción aprobados de cada vivienda. Título y descripción son partes independientes: aprobar solo el título conserva la descripción aprobada antes con su huella de la ficha (DA32).
- **Publicar ≠ aprobar (N1).** Junto a «Publicar», la casilla «Guardar como texto aprobado de la vivienda» viene **desmarcada** en todos los catálogos y vuelve a desmarcarse tras usarla. Lo ya publicado se puede aprobar después con «Aprobar lo publicado aquí».
- **Nunca se aprueba un borrador** ni una descripción no vigente (su ficha cambió): primero se revisa y se publica.
- **Reutilización (DA33).** Al añadir una vivienda a un catálogo manual, **solo si ese catálogo no tiene ningún texto suyo** (ni borrador, ni publicado, ni en reserva), se copia la última versión aprobada como texto publicado e independiente del catálogo. Si la ficha cambió desde la aprobación, se copia igual y la regla C2 decide: el título se ve, la descripción no, y el gestor pide revisar. La conversión de automáticos y el cambio de modo no reutilizan nada.
- **Gestor.** Bloque «Texto aprobado de la vivienda» en el editor con versión, origen, aviso «Revisar», «Usar en este catálogo» (solo rellena el editor) y «Retirar título / descripción».
- **HOME.** Acceso «Textos aprobados» a la página con la biblioteca y la siembra. La siembra lista lo publicado en tus catálogos, **sin nada marcado** y sin IA. Señala los catálogos con asignaciones personales («puede ser personal») y no ofrece aprobar descripciones no vigentes.
- Ninguna escritura en la ficha del CRM, en otros catálogos ni en catálogos de otros dueños. Sin IA en ningún paso.

### Verificación

| Comprobación | Resultado |
| --- | --- |
| SQL en Postgres 16 temporal (`scripts/sql/test-catalogs-core.sh`, secciones 2w y 2x): 0219 aplicada dos veces; 44 comprobaciones de `test-catalog-copy.sql` (publicar sin aprobar no reutiliza; aprobación idempotente; reutilizar copia publicada e independiente; editar la copia o aprobar otra versión no cambia otros catálogos; título solo conserva la descripción y su huella; descripción no vigente rechazada; con la ficha cambiada se ve el título y no la descripción; entrada con borrador o en reserva no se pisa; retirar partes; borrador nunca aprobable; candidatos con la marca de asignaciones; biblioteca de cada dueño; ficha del CRM intacta; permisos de anon y authenticated; conversión y cambio de modo sin copiar textos); aprobaciones simultáneas sin choque; reversión y reaplicación; título (0217), opiniones (0218) y conversión (0213) en verde con 0219 | ✅ |
| `test:catalogs-copy` (28 comprobaciones, nuevo en la CI) y todas las suites de la CI, `tsc`, `lint-migrations.py` | ✅ |
| QA en Chromium con fixtures (17 comprobaciones): casilla desmarcada; publicar sin marcar no aprueba; aprobar lo publicado después; título nuevo con la casilla conserva la descripción; la casilla vuelve a desmarcarse; aviso «Revisar» con la ficha cambiada; añadir desde el buscador una vivienda con texto aprobado la trae publicada; siembra sin nada marcado, con aviso de catálogo asignado y sin aprobar descripciones no vigentes; móvil sin desbordes; sin errores de consola | ✅ |
| QA anteriores en esta rama: título propio (7) y lector (24) | ✅ |
| `next build` (`NEXT_BUILD_DIR=.next.qa`, sin `.env.production`) | ✅ «Compiled successfully» |

Capturas en [`capturas-pr1/`](capturas-pr1/).

### Efectos de la migración al fusionar

- Crea la tabla `property_copy_versions`, **vacía**, y la columna `catalog_texts.copy_version_id`, **nula en todas las filas**.
- Crea las funciones `catalog_copy_*` y redefine `catalog_add_property` (igual que la de 0212 más la reutilización).
- Mientras no apruebes ningún texto, añadir viviendas se comporta exactamente como hoy.
- Ningún catálogo existente ni ninguna huella pública cambian por desplegar.

### Reversión

[`rollback-0219.sql`](rollback-0219.sql):
- Devuelve `catalog_add_property` a la versión de 0212 y borra las funciones nuevas, la columna y la tabla.
- **Se pierde la biblioteca**; si hay que conservarla, antes `SELECT * FROM property_copy_versions;`.
- Los textos ya copiados a catálogos siguen siendo textos normales del catálogo, publicados y editables.

### QA en producción (Fabricio)

1. En un catálogo, edita y publica un texto **sin** marcar la casilla. Añade esa vivienda a otro catálogo: debe llegar sin texto.
2. Vuelve al primero y pulsa «Aprobar lo publicado aquí». El bloque debe decir «Versión 1».
3. Añade la vivienda a un catálogo nuevo: debe llegar con título y descripción publicados. El primer catálogo y la ficha del CRM no cambian.
4. Cambia solo el título en el primero, marca la casilla y publica. El bloque debe mostrar «Versión 2» con la misma descripción. El catálogo del paso 3 sigue igual.
5. Quita la vivienda de un catálogo donde tenga un borrador y vuelve a añadirla: el borrador sigue ahí, sin reemplazar.
6. En «Mi espacio → Textos aprobados», revisa la lista: nada viene marcado y los catálogos asignados a clientes aparecen señalados.

### Pendientes que siguen igual

G-ALQ, diagnóstico original de Recoletos, D13 en producción y validación de la importación con PDF representativos reales: sin cambios, esta ampliación no los cierra.
