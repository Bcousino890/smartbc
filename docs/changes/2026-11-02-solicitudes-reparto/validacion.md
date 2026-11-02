# Recorrido de validación: Solicitudes y reparto por inmueble (0237)

Este recorrido sirve para validar el cambio **antes de fusionarlo**. Todo es con datos sintéticos, en un Postgres desechable (parte A) y en un **entorno de pruebas** (partes B y C). Nada de esto se ejecuta en producción: los scripts del entorno de pruebas se niegan a correr sin `entorno=pruebas`, y el envío de solicitudes rechaza los dominios de producción.

Resultados que se esperan, en resumen:

| # | Escenario | Qué tiene que pasar |
|---|---|---|
| 1 | Reparto por inmueble | Una solicitud con anuncio exacto va sola al asesor del piso |
| 2 | El cliente conserva su asesor | Una consulta por un piso de **otro** asesor queda con el asesor del cliente |
| 2b | Misma persona, otro anuncio | Es **otra solicitud** visible (no se unifica); al vincularla al cliente comparte cliente y asesor |
| 3 | Reasignación administrativa | Solo un administrador la hace: con motivo, viendo antes qué se traslada, y queda en el historial |
| 4 | Anuncio pendiente y republicación | Ref. válida con un Cod. aún no catalogado: no se confirma ni se reparte. Cuando el anuncio se republica con ese código, se resuelve y hereda el reparto del inmueble; el código anterior sigue resolviendo |
| 4b | Regla posterior a la consulta | La consulta se resuelve exacta pero queda «anterior a la regla», sin reparto automático; la asigna un administrador |

## A. Compatibilidad con la versión de Postgres del VPS (local, desechable)

**La versión real del VPS no está comprobada en el repositorio.** La única pista es que las pruebas RLS anteriores (`scripts/sql-tests/0210…`) usan la imagen `supabase/postgres:15.8.1.085`, lo que apunta a PostgreSQL 15.8. Fabricio debe confirmarla con lo que tenga a mano. No hace falta ningún acceso al VPS para el resto de esta parte.

**Revisión estática.** Lo que usa `0237` existe desde PostgreSQL 11:

- `CREATE TRIGGER … EXECUTE FUNCTION` (11);
- `num_nonnulls` (9.6);
- `jsonb`;
- `ON CONFLICT DO NOTHING` con índices únicos parciales (9.5);
- `ADD COLUMN IF NOT EXISTS` (9.6);
- `CREATE OR REPLACE VIEW` añadiendo columnas al final;
- `SECURITY DEFINER` en la función del trigger del historial de publicaciones.

No usa nada exclusivo de la 16.

**Prueba real con esa versión.** La batería ya se ejecutó en verde con PostgreSQL 16 local. Para repetirla con la versión del VPS, por ejemplo la 15:

```sh
brew install postgresql@15        # instalación local; solo si Fabricio la aprueba
BCP_PGBIN=/opt/homebrew/opt/postgresql@15/bin \
BCP_PG_DIR=<scratchpad>/pg-bcp01 BCP_PG_PORT=54332 \
  sh -c 'scripts/sql/run-local.sh clean; scripts/sql/run-local.sh start && scripts/sql/test-solicitudes-reparto.sh'
```

La primera línea de la salida dice contra qué servidor se ejecutó (`Postgres 15.x`). Se espera `test-solicitudes-reparto.sh: todos los escenarios en verde`, con 127 comprobaciones con el esquema real (incluida la de concurrencia H2), la reversión, la reaplicación y 5 defensivas aparte.

**Recorrido a nivel de base, también en local.** Antes del entorno de pruebas, el mismo recorrido de la parte C se puede ejecutar contra el Postgres desechable. Usa los mismos scripts de siembra, republicación, comprobaciones y limpieza; se esperan 12 líneas `ok ·`:

```sh
BCP_PG_DIR=<scratchpad>/pg-bcp01 BCP_PG_PORT=54331 scripts/sql/run-local.sh start
BCP_PG_DIR=<scratchpad>/pg-bcp01 BCP_PG_PORT=54331 sh scripts/qa/solicitudes-reparto-pruebas/simular-en-local.sh
```

## B. Entorno de pruebas: preparación

**Requisitos:**

- Un entorno de pruebas con este código desplegado y `0237` aplicada.
- Dos asesores de prueba, «Asesor QA 1» y «Asesor QA 2» (Usuarios → nuevo, rol asesor).
- Un administrador.
- El token de extensión **de ese entorno** (Configuración → Idealista).

Scripts: `scripts/qa/solicitudes-reparto-pruebas/`.

1. **Anuncios sintéticos.** Se crean tres anuncios «inspo» sin ficha propia: QA-0237-A (Cod. 990237001), QA-0237-B (Cod. 990237002) y QA-0237-C (Cod. 990237003).
   ```sh
   psql "<conexión del entorno de pruebas>" -v entorno=pruebas -f scripts/qa/solicitudes-reparto-pruebas/siembra.sql
   ```
   Son anuncios «inspo» porque, en el esquema real, una ficha propia solo puede tener **un** anuncio (`property_id` es único en `idealista_listings`) y solo los «inspo» pueden compartir referencia.
2. **Reparto.** Como administrador: Administración → Reparto comercial, buscar «QA-0237». Asignar QA-0237-A a **Asesor QA 1** y QA-0237-B a **Asesor QA 2**. **QA-0237-C se deja sin asesor** (lo usa el paso 4b). Se ve la revisión antes de confirmar y el resultado de cada inmueble.
3. **Variables para enviar solicitudes:**
   ```sh
   export ENTORNO=pruebas BASE=https://<entorno-de-pruebas> TOKEN=<token de extensión de ese entorno>
   ```

`comprobaciones.sql` es de **solo lectura** y se puede ejecutar tras cada paso. Muestra el vínculo, el reparto, el responsable, el cliente, la auditoría y la cola de Zinto de lo sintético:

```sh
psql "<conexión del entorno de pruebas>" -f scripts/qa/solicitudes-reparto-pruebas/comprobaciones.sql
```

## C. Recorrido

### 1 · Reparto por inmueble

```sh
sh scripts/qa/solicitudes-reparto-pruebas/enviar-solicitud.sh L1
```

- La respuesta trae `routedAssigned: 1`.
- En Solicitudes → Tarjetas, «QA Persona Uno» muestra «Vínculo exacto» y la lleva Asesor QA 1.
- En la ficha:
  - pone «Reparto automático por inmueble»;
  - «Zinto: pendiente» con el aviso de que falta configurar el envío;
  - pestaña Actividad → «Cambios de responsable».
- `comprobaciones.sql`: vínculo `ref`, reparto `assigned`, origen `rule` y un evento `lead_rule`.

### 2 · El cliente conserva su asesor

1. En Clientes, crear el cliente sintético **«QA Cliente Dos»** con teléfono **+34 600 990 002**.
2. Como administrador, en su ficha: «Reasignar cliente» → Asesor QA 2, con motivo «Validación 0237».
3. Enviar su consulta por el anuncio A, que es de Asesor QA 1. L2 ya lleva el nombre y el teléfono de «QA Cliente Dos».
   ```sh
   sh scripts/qa/solicitudes-reparto-pruebas/enviar-solicitud.sh L2
   ```
4. **Antes de vincular:** queda «Pendiente de reparto», con el motivo «Puede ser un cliente que ya tiene asesor (mismo teléfono)». Aunque el piso tenga regla, la consulta **no** va a Asesor QA 1.
5. En la ficha → Cliente y datos → coincidencia «QA Cliente Dos» → **Vincular**.
6. **Después de vincular:**
   - responsable Asesor QA 2, con el origen «Asesor del cliente»;
   - el asesor del cliente no cambia.

### 2b · Misma persona, otro anuncio: otra solicitud

1. «QA Persona Uno» (la del paso 1) consulta ahora el anuncio B, que es de Asesor QA 2. Mismo nombre y mismo teléfono:
   ```sh
   sh scripts/qa/solicitudes-reparto-pruebas/enviar-solicitud.sh L3
   ```
   - La respuesta trae `mergedLeads: 0` y `mergeBlocked: 1`. **No se unifica** con la del paso 1: es otro anuncio.
   - En Tarjetas aparecen **dos** solicitudes de «QA Persona Uno», una por anuncio, cada una con su mensaje y su vínculo.
   - La nueva queda «Pendiente de reparto» con el motivo «Puede ser un cliente que ya tiene asesor». No va a Asesor QA 2 por la regla de B: el mismo teléfono ya tiene responsable y la identidad aún no está verificada.
2. En la ficha de la solicitud del paso 1: Cliente y datos → **Crear cliente** «QA Persona Uno» (el cliente toma el asesor de esa solicitud, Asesor QA 1).
3. En la ficha de la solicitud nueva: Cliente y datos → coincidencia «QA Persona Uno» → **Vincular**.
4. **Resultado:**
   - la solicitud nueva pasa a Asesor QA 1, con el origen «Asesor del cliente»;
   - las dos siguen siendo solicitudes separadas y comparten el mismo cliente (`comprobaciones.sql` muestra el mismo cliente y asesor en las dos).

### 3 · Reasignación administrativa

1. En la ficha de la solicitud del paso 2: «Registrar contacto» → «No contesta», «Mañana» y «Volver a llamar», y guardar. Esto crea una tarea pendiente.
2. Como administrador: «Reasignar cliente».
   - **Alcance** antes de confirmar: 1 solicitud abierta, 1 tarea pendiente y la conversación de Zinto si existe.
   - Elegir Asesor QA 1 y un motivo.
3. **Resultado:**
   - la solicitud y su tarea pasan a Asesor QA 1;
   - el historial muestra antes → después, autor y motivo;
   - el contacto registrado antes conserva su autor;
   - «Zinto: pendiente». **No es una sincronización real**: falta el contrato.
4. **Permisos.** Entrar como **Asesor QA 2**:
   - ninguna de las dos fichas ofrece «Cambiar» ni «Reasignar cliente»;
   - se lee «Solo un administrador puede cambiarlo»;
   - Reparto comercial explica que es solo para administradores;
   - no aparece en el menú.

### 4 · Anuncio pendiente que se resuelve al republicarse

En el esquema actual una **republicación** no crea otro anuncio: el CRM reescribe el código del mismo anuncio. El historial de publicaciones (`idealista_listing_codes`) conserva el anterior.

1. Enviar una consulta con la Ref. del anuncio A y un Cod. que aún no tiene ningún anuncio (990237009):
   ```sh
   sh scripts/qa/solicitudes-reparto-pruebas/enviar-solicitud.sh L4
   ```
   - «Por verificar» y «Pendiente de reparto», con el motivo «llegó el código del anuncio, pero ese anuncio aún no está en el catálogo».
   - **No** va a Asesor QA 1 y no se le pone el anuncio A.
2. Republicar el anuncio A con ese código, como hace el CRM al republicar:
   ```sh
   psql "<conexión del entorno de pruebas>" -v entorno=pruebas -v ref=QA-0237-A -v codigo=990237009 \
     -f scripts/qa/solicitudes-reparto-pruebas/republicar-anuncio.sql
   ```
   La salida muestra el historial del anuncio: 990237001 cerrado y 990237009 vigente.
3. Provocar un lote de ingesta con una consulta neutra (sin Ref. ni Cod.):
   ```sh
   sh scripts/qa/solicitudes-reparto-pruebas/enviar-solicitud.sh L5
   ```
   La ingesta llama a `reconcile_unresolved_code_leads()` al terminar cada lote.
4. **Resultado:**
   - la consulta de «QA Persona Dos» pasa a «Vínculo exacto» con el anuncio A;
   - la lleva Asesor QA 1, porque la regla de A **ya existía cuando llegó** la consulta (`lead_rule`).
5. **El código anterior sigue resolviendo.** Volver a enviar `L1`, que lleva el código antiguo 990237001:
   - sigue con «Vínculo exacto» al anuncio A;
   - en Cliente y datos → Evidencia del origen se lee «Publicación anterior: el anuncio se republicó con el código 990237009».

**Límite.** Si no llega ningún lote, la consulta sigue pendiente hasta el siguiente. Una persona puede lanzar el reprocesado a mano en el entorno de pruebas con `select reconcile_unresolved_code_leads();`.

### 4b · Regla creada después de la consulta

1. Consulta por el anuncio C, que aún no tiene asesor, con un Cod. todavía sin catalogar:
   ```sh
   sh scripts/qa/solicitudes-reparto-pruebas/enviar-solicitud.sh L6
   ```
   Queda «Pendiente de reparto» por el código.
2. **Ahora**, como administrador, en Reparto comercial: QA-0237-C → Asesor QA 2.
3. Republicar C con ese código y provocar un lote:
   ```sh
   psql "<conexión del entorno de pruebas>" -v entorno=pruebas -v ref=QA-0237-C -v codigo=990237013 \
     -f scripts/qa/solicitudes-reparto-pruebas/republicar-anuncio.sql
   sh scripts/qa/solicitudes-reparto-pruebas/enviar-solicitud.sh L5
   ```
4. **Resultado:**
   - la consulta pasa a «Vínculo exacto»;
   - **no se reparte sola**: queda «Pendiente de reparto» con el motivo «Llegó antes de que se configurara el reparto de ese piso: lo asigna un administrador»;
   - un cambio de reparto vale para lo que llega después de confirmarlo.
5. El administrador la asigna a mano desde la ficha («Cambiar»).

## D. Limpieza del entorno de pruebas

```sh
psql "<conexión del entorno de pruebas>" -v entorno=pruebas -f scripts/qa/solicitudes-reparto-pruebas/limpieza.sql
```

- Borra solicitudes, anuncios, su historial de códigos y reglas sintéticos.
- El cliente «QA Cliente Dos» y los dos asesores de prueba se borran desde la interfaz.
- La auditoría (`assignment_events`) es append-only por diseño y queda como rastro del ensayo.

## E. Registro de resultados (para rellenar)

| Paso | Resultado esperado | Obtenido | Notas |
|---|---|---|---|
| A · versión del servidor |  |  |  |
| A · batería SQL | todos los escenarios en verde |  |  |
| A · recorrido simulado en local | 12 líneas `ok ·` |  |  |
| 1 | Asesor QA 1, vínculo exacto, `lead_rule` |  |  |
| 2 · antes de vincular | pendiente, «posible cliente existente» |  |  |
| 2 · después de vincular | Asesor QA 2 (del cliente) |  |  |
| 2b · al llegar | otra solicitud visible, `mergedLeads: 0`, pendiente |  |  |
| 2b · tras vincular | mismo cliente y Asesor QA 1, dos solicitudes |  |  |
| 3 · alcance | 1 solicitud, 1 tarea |  |  |
| 3 · resultado | Asesor QA 1, historial con autor y motivo |  |  |
| 3 · permisos del asesor | sin botones, explicación visible |  |  |
| 4 · antes de republicar | por verificar, pendiente, sin anuncio A |  |  |
| 4 · tras republicar y lote | vínculo exacto al anuncio A, Asesor QA 1 |  |  |
| 4 · código anterior | sigue exacto; «Publicación anterior» en Evidencia |  |  |
| 4b · tras regla, republicación y lote | exacto, «anterior a la regla», sin reparto |  |  |
| D · limpieza | sin restos salvo la auditoría |  |  |

## F. Antes de fusionar

- Resultados de este recorrido.
- Versión de Postgres del VPS y resultado de la parte A con esa versión.
- Plan de reversión: `rollback-0237.sql`, explicado en `result.md` §6.
  - Fusionar equivale a aplicar `0237` en el siguiente despliegue.
  - Revertir el código no deshace la base de datos.
  - Antes de ejecutar el rollback, es aconsejable una copia de seguridad comprobada.
