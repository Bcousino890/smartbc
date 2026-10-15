# BCP-01 · Corrección de la vista previa de criterios («Ver qué entraría»)

**Estado: APROBADO por Fabricio (D-QA18, 15 de octubre de 2026)**, junto con la corrección del registro de G-ALQ. Va en una rama y un PR propios (`fabri/bcp-01-vista-previa`). Se para antes del merge.

## El defecto (encontrado en la QA de K1–K5 en producción)

En el editor de criterios del gestor:
- al cambiar el precio, el orden o el máximo, la lista anterior seguía visible;
- con un error de validación, la lista anterior seguía debajo del error;
- la frase de encima («24 de 84 coinciden · Alquiler») describía lo escrito **ahora**, no los criterios con los que se calculó la lista;
- una respuesta antigua que llegara tarde podía sustituir a otra más reciente.

## Lo que hace la corrección

- **Revisión del borrador.** Cada cambio en lo escrito sube su revisión. Volver a los mismos valores (A→B→A) también la sube, así que una vista previa invalidada no revive.
- **Cada vista previa recuerda la revisión que la pidió y su resumen**, que es el de los criterios usados. Solo se enseña con esa misma revisión.
- **Después de editar:** la lista se oculta y aparece la nota «Los criterios han cambiado desde la última vista previa: pulsa «Ver qué entraría» para verlos».
- **Con un error de validación:** solo el error. Ninguna lista, ni la que esté en camino.
- **Mientras se pide:** «Calculando…».
- **Cada petición lleva un número.** Una respuesta se acepta solo si es la última pedida **y** el borrador no ha cambiado mientras tanto. Si no se acepta, no enseña nada, tampoco su error.

## Lo que NO hace

- No cambia lo escrito, que se conserva exacto, ni las protecciones de E2.
- No guarda criterios, no cambia de modo, no toca inclusiones ni exclusiones, ni cambia ninguna regla de selección.
- No cumple G-ALQ ni resuelve el caso original de Recoletos.

## Archivos y pruebas

- `lib/catalogs/manager-state.ts`: funciones puras `nextDraftRevision`, `previewStart`, `previewSettle`, `previewInvalid` y `previewView`.
- `components/admin/catalogs/selection-panel.tsx`: las usa. La vista previa ya no bloquea los botones mientras se calcula, así que se puede pedir otra y gana la última.
- `app/dev-fixtures/…/fixture-manager.tsx`: retardos de prueba (`window.__fxPreviewDelays`), solo en las fixtures.
- **CI:** `test:catalogs-manager`, sección «Vista previa de los criterios». Cubre A→B→A, editar tras el resultado, error de validación, respuestas desordenadas, editar mientras se calcula y errores del servidor.
- **Navegador**, en la copia aislada con fixtures sintéticas: editar tras un resultado, criterios no válidos, «Calculando…», respuestas desordenadas, editar mientras se calcula y A→B→A. Más las regresiones del gestor que usan la vista previa.
