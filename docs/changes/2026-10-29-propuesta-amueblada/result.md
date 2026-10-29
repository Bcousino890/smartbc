# Propuesta amueblada en «Propiedades»: resultado

Base `origin/main` `53714f22`. Todo se comprobó en local con datos sintéticos. Las imágenes de la entrega solo se usaron en el scratchpad y no se versionan.

## Verificaciones

| Comprobación | Comando | Resultado |
| --- | --- | --- |
| Tipos | `npx tsc --noEmit` | ✅ |
| Lógica y barreras de la propuesta | `npm run test:furnishing-proposal` | ✅ 58/58 |
| Todas las pruebas de la CI (sin `build`) | cada `npm run test:*` de `ci.yml` | ✅ 35/35 |
| Lint de migraciones | `python3 scripts/lint-migrations.py` | ✅ |
| Build de producción aislado | plan E1–E2 (`env -i`, sin `.env*`, `NEXT_BUILD_DIR=.next.qa`) | ✅ exit 0; rutas `/compartir/[slug]/propuesta` y `/c/[token]/propuesta` |
| Rutas reales, anónimo | `scripts/qa/furnishing-routes.mts` (`next start` + simulador) | ✅ 27/27 |
| Interacción y capturas | `scripts/qa/furnishing-e2e.mts` (Chromium) | ✅ 82/82 |

## Criterios

| Id | Evidencia |
| --- | --- |
| AC1 | `/compartir/…` y `/c/…` muestran «Ver propuesta amueblada». `/propuesta` responde 200 sin cookies y lo mismo desde `/c`. |
| AC2 | Sin propuesta o en borrador, la ficha no muestra el acceso y `/propuesta` da 404. El HTML no contiene los centinelas del borrador. |
| AC3 | Token caducado, de otra ficha, de un borrador o inventado: 404. |
| AC4 | Proporción del escenario igual a la de la foto (<1 %), en horizontal y en vertical. Antes y después de la misma fila, con la misma proporción (<2 %). Las 15 parejas de la entrega cumplen la regla (test). |
| AC5 | Comprobado en escritorio (1440) y móvil (390, táctil), sin scroll horizontal: filtros (Otros espacios 4, Dormitorios 8), miniaturas, anterior/siguiente, ← →, Comparar con arrastre del ratón y táctil (CDP), Vista doble y pantalla completa. |
| AC6 | Vestidor: Comparar deshabilitado, modo «Fotografía», etiqueta «Vista del inmueble». |
| AC7 | Aviso de propuesta virtual presente. «1.250.000 €», «El Viso», «180 m²» salen del registro y no aparece la dirección exacta. |
| AC8 | Ficha del admin sin sesión → `/login`. Subida sin sesión → `ok:false`. El simulador no registra ninguna escritura en la propuesta ni en storage. |
| AC9 | El test comprueba que todos los selectores del CSS module empiezan por una clase del módulo. |
| AC10 | Ver la tabla de verificaciones. |

## Hallazgos durante la QA, corregidos

- La carga múltiple solo emparejaba por el número del **principio** del nombre. Con «antes-01.jpg» no casaba nada, aunque la pantalla lo avisaba. Ahora usa el número inicial o, si no lo hay, el último número del nombre (`fileNumber`), con test.
- Móvil:
  - el titular del cierre decía «reala», por el `<br>` oculto (la referencia tiene el mismo fallo);
  - la cabecera se partía en dos líneas;
  - los datos que bajaban de línea empezaban por «·».

## No demostrado

- **RLS y CHECK de la 0235 en Postgres real.** El simulador no los aplica. Se comprobaron por lectura del SQL (test) y con el lint. Riesgo bajo: es el mismo modelo que `property_photos`.
- **Subida real de una pareja y publicación con sesión.** Necesitan GoTrue y storage. Las acciones siguen el patrón de `uploadPropertyPhoto` y `uploadPropertyPlan`. Lo valida Fabricio al cargar BC-2138 tras el despliegue.
- **Optimizador de imágenes con las URLs de storage reales.** En la QA, las imágenes se sirvieron desde 127.0.0.1 sin optimizar. En producción `portal.bcousinoprop.com` está en `remotePatterns`, como en el resto de la ficha.

## Notas

- El tipo de vivienda se enseña tal como está en el registro (`property_type`), igual que en la ficha compartida. En el fixture salía «flat».
- Volver desde `/c/[token]/propuesta` a `/c/[token]` cuenta otra apertura del SmartLink, porque es la misma página con tracking.
- Revisión de Codex: no hecha (opcional, a petición de Fabricio).
