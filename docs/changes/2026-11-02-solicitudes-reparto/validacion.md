# Recorrido de validación: Solicitudes y reparto por inmueble (0237)

Este recorrido sirve para validar el cambio **antes de fusionarlo**. Todo es con datos sintéticos, en un Postgres desechable (parte A) y en un **entorno de pruebas** (partes B y C). Nada de esto se ejecuta en producción: los scripts del entorno de pruebas se niegan a correr sin `entorno=pruebas`, y el envío de solicitudes rechaza los dominios de producción.

Resultados que se esperan, en resumen:

| # | Escenario | Qué tiene que pasar |
|---|---|---|
| 1 | Reparto por inmueble | Una solicitud con anuncio exacto va sola al asesor del piso |
| 2 | El cliente conserva su asesor | Una consulta por un piso de **otro** asesor queda con el asesor del cliente |
| 3 | Reasignación administrativa | Solo un administrador la hace: con motivo, viendo antes qué se traslada, y queda en el historial |
| 4 | Anuncio pendiente | Ref. válida con un Cod. aún no catalogado: no se confirma ni se reparte; al catalogarse, se resuelve |

## A. Compatibilidad con la versión de Postgres del VPS (local, desechable)

**La versión real del VPS no está comprobada en el repositorio.** La única pista es que las pruebas RLS anteriores (`scripts/sql-tests/0210…`) usan la imagen `supabase/postgres:15.8.1.085`, lo que apunta a PostgreSQL 15.8. Fabricio debe confirmarla con lo que tenga a mano. No hace falta ningún acceso al VPS para el resto de esta parte.

**Revisión estática.** Lo que usa `0237` existe desde PostgreSQL 11:

- `CREATE TRIGGER … EXECUTE FUNCTION` (11);
- `num_nonnulls` (9.6);
- `jsonb`;
- `ON CONFLICT DO NOTHING` con índices únicos parciales (9.5);
- `ADD COLUMN IF NOT EXISTS` (9.6);
- `CREATE OR REPLACE VIEW` añadiendo columnas al final.

No usa nada exclusivo de la 16.

**Prueba real con esa versión.** La batería ya se ejecutó en verde con PostgreSQL 16 local. Para repetirla con la versión del VPS, por ejemplo la 15:

```sh
brew install postgresql@15        # instalación local; solo si Fabricio la aprueba
BCP_PGBIN=/opt/homebrew/opt/postgresql@15/bin \
BCP_PG_DIR=<scratchpad>/pg-bcp01 BCP_PG_PORT=54332 \
  sh -c 'scripts/sql/run-local.sh clean; scripts/sql/run-local.sh start && scripts/sql/test-solicitudes-reparto.sh'
```

La primera línea de la salida dice contra qué servidor se ejecutó (`Postgres 15.x`). Se espera `test-solicitudes-reparto.sh: todos los escenarios en verde`, con 119 comprobaciones, la de concurrencia (H2), la reversión y la reaplicación.

## B. Entorno de pruebas: preparación

**Requisitos:**

- Un entorno de pruebas con este código desplegado y `0237` aplicada.
- Dos asesores de prueba, «Asesor QA 1» y «Asesor QA 2» (Usuarios → nuevo, rol asesor).
- Un administrador.
- El token de extensión **de ese entorno** (Configuración → Idealista).

Scripts: `scripts/qa/solicitudes-reparto-pruebas/`.

1. **Anuncios sintéticos.** Se crean dos anuncios «inspo» sin ficha propia: QA-0237-A (Cod. 990237001) y QA-0237-B (Cod. 990237002).
   ```sh
   psql "<conexión del entorno de pruebas>" -v entorno=pruebas -f scripts/qa/solicitudes-reparto-pruebas/siembra.sql
   ```
   Son anuncios «inspo» porque, en el esquema real, una ficha propia solo puede tener **un** anuncio (`property_id` es único en `idealista_listings`) y solo los «inspo» pueden compartir referencia.
2. **Reparto.** Como administrador: Administración → Reparto comercial, buscar «QA-0237». Asignar QA-0237-A a **Asesor QA 1** y QA-0237-B a **Asesor QA 2**. Se ve la revisión antes de confirmar y el resultado de cada inmueble.
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

### 4 · Anuncio pendiente que se resuelve al catalogarse

1. Enviar una consulta con la Ref. del anuncio A y un Cod. aún no catalogado (990237009):
   ```sh
   sh scripts/qa/solicitudes-reparto-pruebas/enviar-solicitud.sh L4
   ```
   - «Por verificar» y «Pendiente de reparto», con el motivo «llegó el código del anuncio, pero ese anuncio aún no está en el catálogo».
   - **No** va a Asesor QA 1 y no se le pone el anuncio A.
2. Catalogar ese anuncio:
   ```sh
   psql "<conexión del entorno de pruebas>" -v entorno=pruebas -f scripts/qa/solicitudes-reparto-pruebas/catalogar-anuncio-pendiente.sql
   ```
3. En Reparto comercial, asignar el anuncio nuevo («QA · Ático en Castelló (republicado)», Cod. 990237009) a Asesor QA 1. Al ser «inspo», es un inmueble propio y necesita su regla.
4. Provocar un lote de ingesta con una consulta neutra (sin Ref. ni Cod.):
   ```sh
   sh scripts/qa/solicitudes-reparto-pruebas/enviar-solicitud.sh L5
   ```
   La ingesta llama a `reconcile_unresolved_code_leads()` al terminar cada lote.
5. **Resultado:** la consulta de «QA Persona Dos» pasa a «Vínculo exacto» con el anuncio nuevo y la lleva Asesor QA 1. `comprobaciones.sql` muestra un evento `lead_rule`.

**Límite.** Si no llega ningún lote, la consulta sigue pendiente hasta el siguiente. Una persona puede lanzar el reprocesado a mano en el entorno de pruebas con `select reconcile_unresolved_code_leads();`.

## D. Limpieza del entorno de pruebas

```sh
psql "<conexión del entorno de pruebas>" -v entorno=pruebas -f scripts/qa/solicitudes-reparto-pruebas/limpieza.sql
```

- Borra solicitudes, anuncios y reglas sintéticos.
- El cliente «QA Cliente Dos» y los dos asesores de prueba se borran desde la interfaz.
- La auditoría (`assignment_events`) es append-only por diseño y queda como rastro del ensayo.

## E. Registro de resultados (para rellenar)

| Paso | Resultado esperado | Obtenido | Notas |
|---|---|---|---|
| A · versión del servidor |  |  |  |
| A · batería SQL | todos los escenarios en verde |  |  |
| 1 | Asesor QA 1, vínculo exacto, `lead_rule` |  |  |
| 2 · antes de vincular | pendiente, «posible cliente existente» |  |  |
| 2 · después de vincular | Asesor QA 2 (del cliente) |  |  |
| 3 · alcance | 1 solicitud, 1 tarea |  |  |
| 3 · resultado | Asesor QA 1, historial con autor y motivo |  |  |
| 3 · permisos del asesor | sin botones, explicación visible |  |  |
| 4 · antes de catalogar | por verificar, pendiente, sin anuncio A |  |  |
| 4 · tras catalogar y lote | vínculo exacto al anuncio nuevo, Asesor QA 1 |  |  |
| D · limpieza | sin restos salvo la auditoría |  |  |

## F. Antes de fusionar

- Resultados de este recorrido.
- Versión de Postgres del VPS y resultado de la parte A con esa versión.
- Plan de reversión: `rollback-0237.sql`, explicado en `result.md` §6.
  - Fusionar equivale a aplicar `0237` en el siguiente despliegue.
  - Revertir el código no deshace la base de datos.
  - Antes de ejecutar el rollback, es aconsejable una copia de seguridad comprobada.
