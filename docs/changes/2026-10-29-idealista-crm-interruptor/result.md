# Idealista API → CRM: interruptor en el CRM — resultado

[spec.md](spec.md) · [plan.md](plan.md) · rama `fabri/idealista-crm-interruptor` · base `c0ddfbb3`.

**Estado:** hecho en local. **Parado antes del merge.** La sincronización sigue **apagada**. Ni producción, ni credenciales, ni llamadas a Idealista.

## Qué se ha ejecutado y qué salió

Todo en la copia exportada sin `.env*` y en el Postgres temporal, con datos sintéticos.

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| Todos los pasos `npm run` de `ci.yml` salvo `build` | 31/31 |
| `npm run test:idealista-crm-sync` (incluye el interruptor) | 100/100 |
| Lint de migraciones | OK |
| SQL: todo el expediente anterior + interruptor (0234 aplicada dos veces, reversión que conserva el historial) | 188 comprobaciones, exit 0 |
| Mutaciones SQL, con dos nuevas del interruptor («encender aunque haya rojo» y «dar por buena una comprobación NULL») | 15/15 detectadas |
| Comprobaciones previas del operador | todo en verde |
| Flujo real de `crm-sync` | 18/18 |
| Build de producción aislado | exit 0 |
| Rutas reales del SmartLink | 18/18 |
| QA visual: claro y oscuro reales del CRM, 1440 y 390 px | ok |
| QA del interruptor | con algo en rojo «Encender» está desactivado y explica cómo arreglarlo; con todo en verde enciende tras confirmar |

## Qué hace

- **Configuración → Idealista → «Sincronización con el CRM»**, solo para el dueño, muestra el estado y una lista de comprobaciones: las mismas que antes había que ejecutar en el servidor.
- **«Encender»** solo funciona con todo en verde. La base lo vuelve a comprobar al pulsar, así que ni siquiera llamando a la ruta se puede encender con algo en rojo.
- **«Apagar»** funciona siempre.
- **Queda registrado** quién lo cambió y cuándo (`idealista_crm_switch_log`).

## Lo que haces tú después del merge

1. **Fusionar la PR.** Esto vuelve a desplegar `main`. Si el despliegue anterior falló por lo de Google Fonts, este commit nuevo lo vuelve a intentar.
2. **Abrir Configuración → Idealista** (`/es/admin/idealista/configuracion`).
   - Si ves «Sincronización con el CRM», el build nuevo está en marcha.
   - Si dice «La actualización todavía no está instalada del todo», espera unos minutos y pulsa «Volver a comprobar».
   - Si no aparece la sección, el despliegue no ha entrado todavía.
3. **Si sale en rojo «una sola RESERVADO en es»**, crea la etiqueta «RESERVADO» para España en Propiedades → Etiquetas y pulsa «Volver a comprobar».
4. **Con todo en verde, pulsa «Encender».**
5. **Publica o actualiza un anuncio por API** en `/es/admin/idealista`. Su fila mostrará «CRM: ficha de referencia · RESERVADO», con «Copiar SmartLink» y «Ficha CRM».

**Si sale algo en rojo distinto de «RESERVADO»** (políticas, triggers, permisos…), producción no está como esperan las migraciones. No se puede encender, y no lo arregla el CRM: pásame la lista que aparece.

## Lo que no se ha podido demostrar

- **El despliegue real en el VPS.** La sección que aparece en Configuración es la prueba visible desde el navegador.
- **El estado real del esquema de producción.** Lo enseña la propia lista de comprobaciones.
