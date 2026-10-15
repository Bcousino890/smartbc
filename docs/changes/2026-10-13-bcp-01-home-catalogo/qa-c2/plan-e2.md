# BCP-01 · Plan de E2 «Gestor en cuatro secciones»

**Estado: APROBADO PARA EJECUTARSE (15 de octubre de 2026), tareas T0–T10, con A1–A4 y cuatro ajustes obligatorios** ya incorporados (§0). Registro: [enmienda §0, D-QA12](enmienda.md).

## 0. Aprobación y ajustes obligatorios

Fabricio aprueba la ejecución de E2 (T0–T10) y los puntos A1–A4 de §8.1, con estos ajustes, que **mandan sobre el resto del plan** si difieren:

| | Ajuste | Dónde |
| --- | --- | --- |
| **1** | Lo escrito se conserva **en bruto y exacto**: precios con formato, espacios del teléfono, selecciones de zona a medio hacer y entradas incompletas. La normalización semántica solo decide validación e indicadores; nunca borra lo escrito porque coincida con lo guardado | §3.4 (reglas 2 y 3), §3.5 |
| **2** | Ediciones hechas **mientras un guardado está en curso**: se captura la instantánea enviada; la respuesta solo reconoce esa instantánea; nunca se borran ni pisan ediciones más nuevas; la referencia guardada se reconcilia conservándolas. Pruebas independientes de guardado con retraso, con éxito y con fallo | §3.4 (regla 4), §3.5, §5, T1 y T9 |
| **3** | `test:catalogs-manager` entra en la **CI real** (`.github/workflows/ci.yml`), para que corra en el último commit del PR | T1 |
| **4** | Solo herramientas y configuración de lint **existentes**. No se instala nada ni se añade una configuración de lint. Si una comprobación no está disponible, se dice | §7 |

Autoriza: `npm ci` con el lockfile existente, el Chromium en caché, el entorno aislado, fixtures y pruebas sintéticas, commits, push de `fabri/bcp-01-e2`, PR y CI. **No autoriza el merge** (de Fabricio), E3 ni PDF. Si faltara Chromium, se pregunta antes de descargarlo.

Decisiones de origen: [enmienda §0](enmienda.md) (D-QA7, D-QA8, D-QA9 y D-QA10, aprobadas el 14 de octubre de 2026) y §4 (AC-G1–AC-G8). Maqueta: [gestor](maquetas/gestor.html) (G1–G4 y GM1–GM3). Modelo de plan: [`plan-e1.md`](plan-e1.md).

## 1. Alcance

**Entra en E2.** Solo interfaz del gestor y una lectura nueva para los diagnósticos. **Sin migración ni SQL nuevo**, y con las mismas acciones de servidor, permisos y contrato público.

| | Qué | Origen |
| --- | --- | --- |
| S | Cuatro secciones (Viviendas, Contenido, Diseño y Compartir), con la sección en la URL (`?seccion=`) y la navegación global del CRM intacta | D-QA7, AC-G1 |
| H | Cabecera con nombre, estado, número de viviendas, «Vista previa» y «Compartir», que no guardan, publican, crean enlaces ni llaman a la IA | §4 |
| V | **Viviendas:** criterios resumidos con editor desplegable, lista compacta, vistas, panel de la vivienda con los motivos y todas las acciones de selección actuales | AC-G2 |
| C | **Contenido:** lista con «Qué ve el cliente», estado del texto y material, búsqueda y filtros, y **un único editor** (panel lateral en escritorio, pantalla propia en móvil) | AC-G3, AC-G4 |
| D | **Diseño:** título, introducción, portada (vivienda y foto) y vista previa, con las reglas de portada de C1 | AC-G5 |
| P | **Compartir:** asesor/a, nombre y teléfono; enlace, caducidad, renovar y revocar; anuncios de origen como «Organización interna»; medición con `?medir=1` | AC-G6 |
| U | **Valores sin guardar** en todos los formularios, con un único dueño del estado y aviso al salir | D-QA9, AC-G3 |
| M | **Diagnósticos de material** sin IA («Sin descripción», «N capítulos sin foto adecuada», «Sin fotos») | D-QA8 |
| R | Móvil a 362 y 320 px, teclado y foco | AC-G7 |

**No entra:**
- fotos por catálogo y exclusiones (E3, con su migración);
- PDF;
- cambios en el lector público, en SQL o en las acciones de servidor (`actions.ts` no cambia);
- rediseñar la barra lateral del CRM (D-QA7);
- conservar valores sin guardar tras una recarga (D-QA9).

**No se da por hecho sin evidencia:**
- la QA completa de Fabricio;
- D13 en vivo, en el VPS;
- las pruebas en dispositivos reales.

Aquí solo habrá pruebas locales con datos sintéticos.

## 2. Base, rama y preparación del entorno

- **Base:** `origin/main` = `87bf218a340e72c8ac8919cb232425cf1b6b872b`, comprobado con `git ls-remote` el 15 de octubre de 2026.
  - Incluye el merge de E1 (`78bfa15`, PR #317).
  - Tras ese merge solo hay un commit, de particulares (`87bf218`), que no toca ningún archivo de catálogos.
  - Al empezar la ejecución se vuelve a comprobar `origin/main`. Si ha cambiado, se informa antes de seguir.
- **Rama y worktree:** `fabri/bcp-01-e2` en `/Users/fabriirguez/SMARTBC/wt/bcp-01-e2`, creada desde esa base.
  - El checkout original (en `main`, limpio) y su stash no se tocan.
  - Este plan es el único commit de la rama.
- **Dependencias:** Node 22 y `npm ci` con el `package-lock.json` existente. **`npm ci` necesita la aprobación de ejecución.** Sin dependencias nuevas: `package.json` solo gana un script de prueba (`test:catalogs-manager`) y `package-lock.json` no cambia.
- **Navegador:** Chromium de Playwright `chromium-1208`, ya en la caché local. Si faltara, se pide permiso antes de descargarlo.
- **No hace falta:** Postgres, credenciales, VPS, producción ni IA real.

### 2.1 Aislamiento (el mismo de E1)

Se repite al pie de la letra [el §2.1 de E1](plan-e1.md), con la copia en `e2-iso/app` del scratchpad:

1. **Copia aislada.**
   - `rsync -a --delete` del worktree, excluyendo `.git`, `node_modules`, `.next` y cualquier `.env*` en cualquier carpeta.
   - `node_modules` clonado con `cp -cR`, sin descargar nada.
   - Ningún `.env*` se abre, imprime ni copia. El repo versiona `.env.production` y `.env.example`, y por eso nada se ejecuta en el worktree.
2. **Entorno mínimo explícito** con `env -i`:
   - `PATH` con Node 22 y `/usr/bin:/bin`;
   - `HOME` y `TMPDIR` propios;
   - `NEXT_TELEMETRY_DISABLED=1`;
   - `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9`;
   - claves anónima y de servicio ficticias;
   - en el servidor de fixtures, `CATALOG_FIXTURES=1` y `PORT=3137`.
3. **Comprobación antes de cada arranque o compilación**, repetida tras cada sincronización:
   - (a) sin `.env*` en la copia;
   - (b) solo variables permitidas (más `__CF_USER_TEXT_ENCODING`, de macOS);
   - (c) `@next/env` informa de 0 archivos en `development` y `production`;
   - (d) ninguna línea `Environments:` en los registros.

   Si falla una, no se arranca nada y se informa.
4. **Red:**
   - el servidor escucha solo en `127.0.0.1`;
   - los navegadores usan un proxy a un puerto cerrado;
   - Supabase apunta al puerto cerrado.
5. **Pruebas puras y `tsc`** también con `env -i` y el mismo entorno.

**Política P-1 durante toda la ejecución:**
- sin VPS ni acceso de administración o de base de datos a producción;
- sin credenciales ni IA real (la IA de las fixtures es falsa);
- sin escrituras en cachés compartidas ni en las fichas del CRM.

### 2.2 Qué pide aprobación

La aprobación de ejecución tendría que cubrir:
1. `npm ci` en el worktree;
2. el uso del Chromium en caché;
3. el servidor de fixtures y la compilación en la copia aislada;
4. los commits;
5. el push de `fabri/bcp-01-e2`, el PR y la CI.

**El merge queda fuera:** es de Fabricio y puede desplegar.

## 3. Diseño técnico

### 3.1 Estructura y archivos

`CatalogManager` sigue siendo el punto de entrada y mantiene sus props. Por eso la página real y la de fixtures no cambian su forma de llamarlo. Pasa a orquestar las secciones:

```
CatalogManager (catalog-manager.tsx)
├─ acciones envueltas UNA vez con la medición (`mo`) y el `run` de siempre
├─ ManagerHeader        (manager/manager-header.tsx)    nombre · estado · nº · Vista previa · Compartir · ⋯
├─ SectionTabs          (manager/section-tabs.tsx)      tablist accesible
├─ HomesSection         (manager/homes-section.tsx)     Viviendas
│   ├─ SelectionPanel (selection-panel.tsx, controlado por el almacén)
│   ├─ PropertySearch (property-search.tsx)
│   └─ PropertyPanel  (manager/property-panel.tsx)  dentro de SidePanel
├─ ContentSection       (manager/content-section.tsx)   Contenido
│   └─ TextEditor     (catalog-texts-panel.tsx, controlado por el almacén) dentro de SidePanel
├─ DesignSection        (manager/design-section.tsx)    Diseño: meta, CoverPicker, vista previa
└─ ShareSection         (manager/share-section.tsx)     Compartir: contacto, SharePanel, AdsPanel, MeasurePanel
```

Piezas compartidas:
- `manager/side-panel.tsx`:
  - en escritorio (≥ 1024 px), `aside` lateral fijo con su pie de acciones;
  - en móvil, una pantalla propia con «‹ Volver» y barra inferior de acciones.
- `manager/drafts-store.ts`: el almacén de valores sin guardar (§3.4).
- `manager/use-manager-url.ts`: la sección y la vivienda abierta, en la URL (§3.2).
- `manager/use-leave-guard.ts`: el aviso al salir (§3.6).

**Componentes y estilo:**
- solo los componentes y las clases del CRM: `crm-*`, la paleta `gold`/`ink`/`cream` y Lato;
- `components/admin/ui/primitives.tsx` cuando encaje;
- iconos de `lucide-react`, que ya está instalado;
- ningún framework ni dependencia nueva.

**Secciones inactivas.** Quedan montadas pero ocultas (`hidden`). Así se conserva el estado de interfaz que no es un formulario (resultados de una búsqueda, la vista elegida) sin volver a pedirlo. Los **valores de formulario** no dependen de esto: su único dueño es el almacén (§3.4).

### 3.2 Navegación por URL e historial

- **Parámetros:**
  - `?seccion=viviendas|contenido|diseno|compartir`; sin valor o con uno desconocido, Viviendas (corregido con `replaceState`);
  - `&vivienda=<propertyId>` cuando hay un panel o un editor abierto;
  - los demás parámetros (`medir`, `vivo`, `grande`) se conservan siempre.
- **Cómo se cambia:**
  - con `window.history.pushState`, que Next 15 integra con `useSearchParams`;
  - **sin** ida y vuelta al servidor: la página es `force-dynamic`, y `router.push` volvería a pedir todos los datos.
- **Cada entrada del historial** es un cambio de sección o una apertura o cierre de panel:
  - «Atrás» y «Adelante» recorren esos estados;
  - en móvil, «Atrás» cierra el editor y vuelve a la lista;
  - recargar conserva la sección y el panel abierto, pero **no** los valores sin guardar.
- **Pestañas** (`role="tablist"`):
  - ← y → mueven el foco; Inicio y Fin van a la primera y a la última;
  - Intro y Espacio activan la pestaña. Se activa a mano para que mover el foco con las flechas no llene el historial.

### 3.3 Cabecera

| Elemento | Comportamiento |
| --- | --- |
| Nombre | El título **guardado** (no el borrador) y la miga «‹ Mi espacio» |
| Estado | Chip Activo/Archivado · Manual/Automático · «N viviendas» · validez del enlace («Enlace hasta el 13 dic», «Sin enlace», «Enlace caducado») |
| Cambios sin guardar | Indicador «Cambios sin guardar (N)». Al pulsarlo, lista los formularios afectados y lleva a cada uno, **sin guardar nada** |
| **Vista previa** | Si hay enlace **activo** (existe, no ha caducado y el catálogo no está archivado): enlace normal a `sharePath(token)` en una pestaña nueva (`target="_blank"`, `rel="noopener"`). Si no lo hay: lleva a Compartir, pone el foco en el bloque del enlace y dice por qué («Aún no hay enlace», «El enlace caducó: renuévalo», «Reactiva el catálogo para compartirlo»). **Nunca** crea ni renueva un enlace |
| **Compartir** | Lleva a la sección Compartir. No crea nada |
| ⋯ | Menú con «Archivar»/«Reactivar» (la misma acción de hoy, `setStatus`, envuelta con `mo`) |

- **Escritorio:** la cabecera es fija (`sticky`) en la columna de contenido, al lado de la barra lateral del CRM.
- **Móvil:** la cabecera **no** es fija. El botón de menú del CRM está fijo arriba a la izquierda (`fixed left-4 top-4 z-40`, 40 × 40), y una barra fija arriba quedaría debajo de él. La única barra fija en móvil es la inferior de acciones del editor (§3.13).

### 3.4 Valores sin guardar: un único dueño

**Dueño.** `manager/drafts-store.ts` es un almacén de módulo (fuera de React):
- se lee con `useSyncExternalStore` y es la **única fuente** de los valores en edición de todos los formularios;
- los componentes de formulario pasan a ser **controlados** por él y no guardan copia propia;
- su clave es el `catalogId`, y dentro de cada catálogo hay una clave por formulario:

| Clave | Formulario | Valor |
| --- | --- | --- |
| `criteria` | Criterios (`SelectionPanel`) | operación, zonas, orden, máximo; precio mínimo y máximo **como se escribieron** (texto); los selectores de distrito y barrio a medio elegir y el texto de «Otra zona» |
| `meta` | Diseño | título e introducción |
| `cover` | Diseño | vivienda elegida en el selector de portada aún sin confirmar |
| `contact` | Compartir | papel, nombre y teléfono como se escribieron |
| `text:<propertyId>` | Contenido | entrada, texto completo y puntos verificados |

**Estado de sesión que no se marca como cambios sin guardar** (en el mismo almacén, con claves aparte):
- `textSession:<propertyId>`: origen (`manual`, `ai_clean` o `ai_draft`), la comprobación, los avisos confirmados, la propuesta de IA pendiente y la vista previa. Al reabrir el editor siguen ahí.
- `ui`:
  - texto y alcance de las búsquedas;
  - vista de Viviendas;
  - filtro y búsqueda de Contenido;
  - criterios desplegados;
  - duración del enlace;
  - los campos de anuncios.

**Modelo de cada borrador** (puro, en `lib/catalogs/manager-state.ts`):

```ts
interface Draft<R, S> {
  start: S;            // valor GUARDADO de referencia (semántico): el de cuando empezó la edición o el último guardado confirmado
  value: R;            // lo escrito, EN BRUTO y tal cual (texto de precios «1.200.000», teléfono con sus espacios, zona a medio elegir…)
  pending: S | null;   // forma semántica de la instantánea enviada en el guardado en curso (ajuste 2)
  conflict: S | null;  // valor guardado nuevo, distinto de `start` y de lo escrito, llegado durante la edición
}
```

**Reglas** (ajustes obligatorios 1 y 2 de la aprobación, §0):
1. **Sin borrador,** el formulario enseña el valor guardado. El borrador se crea al **primer cambio**, no al abrir: abrir un editor no marca nada.
2. **Lo escrito se conserva en bruto, exactamente.** La normalización semántica (criterios normalizados, precio como número, teléfono en E.164, textos recortados, puntos como conjunto) **solo** decide la validación y los indicadores. Un borrador **nunca** se borra porque su valor normalizado coincida con lo guardado: deja de marcarse como cambio, pero el campo sigue mostrando lo que se escribió.
3. **Cambios sin guardar** = existe un borrador y `semántico(value) ≠ start`. Los campos incompletos que no forman parte de lo guardado (distrito o barrio elegidos sin «Añadir», texto de «Otra zona») también cuentan, porque se perderían al salir.
4. **Guardado con otros cambios en curso (ajuste 2).** Al pulsar Guardar se captura la instantánea enviada: `pending = semántico(instantánea)`. La respuesta solo **reconoce esa instantánea**:
   - **éxito** → `start = pending` y `pending = null`. `value` **no se toca**: lo escrito después de enviar sigue ahí y sigue marcado como cambio si difiere de lo enviado;
   - **fallo** → `pending = null` y nada más. El borrador y lo escrito se quedan.

   Ninguna respuesta borra ni pisa ediciones más nuevas.
5. **El borrador solo desaparece** por una decisión explícita: «Descartar mis cambios», o aceptar salir sin guardar (§3.6).
6. **Nada se guarda ni se publica solo.** El almacén no llama a ninguna acción.
7. **Vida del almacén:** la del documento de la pestaña (el «runtime» de la aplicación). Sobrevive a:
   - cerrar un editor;
   - cambiar de sección o de vivienda;
   - `router.refresh()`;
   - las navegaciones internas del CRM.

   **No sobrevive a una recarga**, y la interfaz no sugiere lo contrario: no hay mensajes de «guardado en el navegador» ni `localStorage`.

**Dos nociones distintas en el editor de texto.** En C2, al abrir el editor de una vivienda con texto publicado y sin borrador, se enseña lo publicado y «Guardar borrador» está activo. Eso se conserva tal cual:

| Noción | Para qué sirve | Cómo se calcula |
| --- | --- | --- |
| **Pendiente de guardar** (`dirty` de C2) | Activar «Guardar borrador» y bloquear «Publicar», con las mismas condiciones que hoy | Lo escrito ≠ el último borrador guardado |
| **Cambios sin guardar** (D-QA9) | Marca en la fila, filtro, punto en la pestaña, contador de la cabecera y aviso al salir | Existe borrador y `semántico(value) ≠ start` (lo cambió la persona en esta sesión) |

Así, abrir lo publicado no dispara el aviso al salir. En el texto, el borrador lleva dos referencias: `start` (lo que se enseñaba al empezar, o lo último guardado) y `saved` (el último borrador guardado con su `rev`, que decide «Guardar borrador», «Publicar» y el `expectedRev`). Un guardado con éxito reconoce la instantánea enviada en las dos.

### 3.5 Refrescos y cambios en la lista

**Refrescos.** Tras cada acción, `run` llama a `router.refresh()` como hoy. Al llegar los datos nuevos, el almacén reconcilia cada borrador con el valor guardado nuevo (`reconcileDraft`, pura y probada):

En todos los casos `value` (lo escrito en bruto) **no cambia**.

| Valor guardado nuevo `S` | Resultado |
| --- | --- |
| Igual a `start` | No pasa nada |
| Igual a `pending` (guardado en curso que ya llegó) | `start = S`; es el reconocimiento de esa instantánea |
| Igual a `semántico(value)` | `start = S`: ya no hay cambio que marcar, pero el campo conserva lo escrito |
| Distinto de todo lo anterior (otra pestaña u otra acción) | `conflict = S`. El formulario avisa: «Lo guardado cambió mientras editabas. Tus cambios siguen aquí.», enseña lo guardado y ofrece «Descartar mis cambios» o «Mantener los míos» (que solo toma `S` como nueva referencia, sin guardar). **Nunca se pisa en silencio** |

**Texto con revisión cambiada (A2, aprobado).** El servidor sigue rechazando con su mensaje de siempre el guardado con un `expectedRev` antiguo. Entonces:
- el editor conserva lo escrito y hace `router.refresh()`;
- la versión guardada actual se enseña junto a lo escrito;
- la persona elige «Descartar mis cambios» o «Mantener los míos»;
- «Mantener los míos» **no guarda**: solo toma la revisión nueva como referencia. El siguiente «Guardar borrador» sigue mandando `expectedRev`, y si la revisión volviera a cambiar, se rechazaría igual.

**Cambios en la lista** (automático que se recalcula, exclusiones, quitar o reordenar):
- **Texto de una vivienda que pasa a la reserva:** el borrador se conserva y el editor se sigue abriendo, porque la reserva es editable como en C2.
- **Texto de una vivienda que deja de aparecer** (ni en la lista ni en la reserva):
  - el borrador se conserva y Contenido lo enseña en «Cambios sin guardar de viviendas que ya no están», con el texto, «Copiar» y «Descartar»;
  - no se puede guardar desde ahí;
  - la acción de servidor decide como hoy, y la interfaz no lo intenta.
- **Panel de Viviendas abierto de una vivienda que sale:**
  - el panel dice «Ya no está en el catálogo» y su estado (por ejemplo, excluida);
  - no se cierra solo.
- **Portada pendiente cuya vivienda sale de la lista (A4, aprobado):**
  - solo se descarta **esa** elección no confirmada, con un aviso, porque ya no puede ser portada (regla de C1);
  - los demás formularios sin guardar no se tocan, y la portada guardada sigue con sus respaldos de siempre;
  - es la única excepción a la regla 5 y queda anotada.
- **Reordenar:** el editor sigue en la misma vivienda (clave `propertyId`, no posición).

### 3.6 Aviso al salir

`use-leave-guard.ts` solo está activo mientras hay cambios sin guardar.

1. **`beforeunload`** cubre recargar, cerrar la pestaña, escribir otra URL y los enlaces externos. Muestra el diálogo del navegador. Solo se registra con cambios, para no estropear la caché de ida y vuelta.
2. **Navegación interna** por enlaces:
   - `click` en fase de captura sobre `document`, que llega **antes** que el `Link` de Next;
   - afecta a los enlaces `a[href]` del mismo origen que **cambian de ruta**: la barra lateral del CRM, «‹ Mi espacio», el selector de país, notificaciones y cualquier otro;
   - quedan fuera los que abren en otra pestaña o descargan, los clics con modificadores o con el botón central, y los enlaces que no salen de la página;
   - pregunta con `window.confirm`: «Tienes cambios sin guardar en: Criterios, Texto de «…». Si sales, se pierden. ¿Salir sin guardar?»;
   - **Cancelar** ejecuta `preventDefault` y `stopPropagation`: no se navega;
   - **Aceptar** descarta los borradores de ese catálogo y deja seguir la navegación.
3. **Formularios de fuera del gestor**, como «Cerrar sesión» de la barra lateral: `submit` en fase de captura, con la misma confirmación.

**A1 (aprobado).** «Atrás» del navegador, cuando **sale** de la página del gestor, no se intercepta: en el App Router no se puede cancelar sin manipular el historial interno de Next. Los valores siguen en el almacén mientras viva el mismo documento de la aplicación, y al volver dentro de él («Adelante» o un enlace) reaparecen con el aviso «Tienes cambios sin guardar de antes en este catálogo». **No se promete** recuperarlos tras una recarga ni en un documento nuevo (otra pestaña, otra sesión), y la interfaz no lo sugiere. Recarga, enlaces internos y «Cerrar sesión» siguen pidiendo confirmación. Dentro del gestor, «Atrás» solo cambia de sección o cierra paneles, y no pierde nada.

La barra lateral del CRM solo navega con `Link` y el formulario de cerrar sesión (comprobado en `components/admin-sidebar.tsx`). No hay `router.push` que escape al aviso.

### 3.7 Viviendas

**Criterios:**
- una barra con el resumen (`criteriaSummary`), el modo y «Modificar criterios»;
- ese botón despliega en el sitio el `SelectionPanel` actual (`aria-expanded`/`aria-controls`), con sus campos, «Guardar criterios», «Ver qué entraría», el cambio de modo y sus confirmaciones;
- **sin cambiar** reglas ni mensajes.

**Vistas:**

| Modo | Vistas | De dónde salen |
| --- | --- | --- |
| Automático | «En el catálogo · N» | `catalog.items` |
| | «Coincidencias · M» | Búsqueda con los criterios **guardados** (la acción `search` de siempre, solo lectura), al abrir la vista |
| | «Excluidas · K» | `adjustments.excluded` |
| Manual | «En el catálogo · N» | La lista |
| | «Añadir» | Búsqueda y «Referencia BC, slug o URL» |

**Lista compacta:** una fila por vivienda con:
- posición, miniatura, referencia, título en una línea, zona, precio y m²/dormitorios/baños;
- insignias (Reservada…, «Incluida a mano») y un indicador de avisos con su número;
- **sin párrafos**;
- con 20–24 filas, sin desplazamiento horizontal a 1280 px, también con el panel abierto (se ocultan columnas secundarias).

Acciones en la fila:
- **manual:** ↑, ↓ y «Quitar», con la confirmación de hoy;
- **automático:** «Excluir» y «Quitar inclusión».

Se conservan los mismos `aria-label` («Subir «X»», «Excluir «X»», «Quitar la inclusión de «X»»…).

**Avisos de la lista:**
- «Inclusiones que hoy no aparecen» (`data-testid=unavailable-inclusions`): una línea compacta, desplegable, en «En el catálogo»;
- `over-max`: sigue con su texto;
- `stored-adjustments` en manual: sigue con su texto.

**Panel de la vivienda** (al pulsar la fila):
- «Por qué está en el catálogo»: titular, detalles y avisos de `explain`, «Incluida a mano» o «Por criterios», y el ajuste guardado;
- las mismas acciones de la fila;
- «Editar texto», que lleva a Contenido con esa vivienda (es navegación y no guarda nada).

Las explicaciones salen **solo aquí**, no repetidas en cada fila. La explicación general del automático pasa a un texto breve junto a las vistas («La lista sale de los criterios y se actualiza sola…») y se puede plegar.

### 3.8 Contenido

**Lista:**
- las viviendas de la lista y, aparte, «Textos en reserva»;
- columnas:
  - «Qué ve el cliente»: `LEVEL[level]`, con «Por qué» desplegable para la prioridad (texto publicado → historia aprobada → descripción limpia → datos y fotos), la fuente limpia y la historia;
  - «Texto»: Publicado / Revisar · cambió X / Borrador sin publicar / Sin texto propio;
  - «Material»: §3.11;
  - marca «Cambios sin guardar»;
- búsqueda por título o referencia;
- filtros con su número: Todas, Por revisar, Borradores, Publicados, Sin texto propio, Sin descripción y Cambios sin guardar.

**Un solo editor abierto** (`?vivienda=`):
- en escritorio, panel lateral con «‹ › » para pasar de vivienda y ✕ para cerrar;
- en móvil, pantalla propia con «‹ Contenido».

El editor es el `TextEditor` de C2, controlado por el almacén y con lo mismo:
- entrada (280), texto completo (6.000) y hasta 3 puntos verificados;
- «Guardar borrador» separado de «Publicar», con las mismas condiciones para publicar:
  - borrador guardado;
  - sin cambios pendientes;
  - sin bloqueos;
  - cada aviso confirmado uno a uno;
- «Retirar lo publicado», «Borrar texto» (con su confirmación) y «Historia de la ficha (revisión aparte)»;
- la comprobación al reabrir un borrador guardado, con `preview`, que es lectura y no IA;
- `text-stale` cuando cambió la fuente.

**IA:**
- solo al pulsar «Preparar desde la ficha (IA)» o «Borrador con IA»;
- «Cancelar» sigue igual;
- el límite de 60 s está en el servidor (`AI_TIMEOUT_MS`), y `actions.ts` no cambia;
- una respuesta tardía no pisa lo escrito: se compara con el valor **del almacén** y, si cambió, sale «Usar la propuesta» / «Descartarla»;
- **A3 (aprobado): cerrar el editor, pasar a otra vivienda o salir de Contenido con la IA trabajando cuenta como «Cancelar»**: la respuesta tardía se ignora, lo escrito se conserva y **reabrir no lanza ninguna llamada nueva** a la IA.

**Acciones fijas:** en el pie del panel (escritorio) o en la barra inferior (móvil) van «Guardar borrador» y «Publicar». El resto de acciones siguen en el cuerpo del editor.

### 3.9 Diseño

- **Formulario de título e introducción:** controlado por `meta`, con «Guardar» y el mensaje «Datos guardados.».
- **Portada:** el `CoverPicker` de C1, con la vivienda pendiente en `cover` y las mismas reglas:
  - solo viviendas de la lista efectiva y fotos suyas;
  - mismos respaldos y avisos;
  - elegir una foto guarda al momento, como hoy;
  - «Usar su foto de portada» y «Volver a la portada automática».
- **Vista previa:** el `CatalogCover` de hoy, con el título y la introducción **escritos** (marcados «Con cambios sin guardar» si los hay) y la foto efectiva **guardada**. Si hay enlace activo, «Abrir la vista previa completa ↗» abre el lector.

### 3.10 Compartir

- **Contacto:** `ContactFields` controlado por `contact`, «Guardar contacto» y los mismos mensajes y validaciones.
- **Enlace:** el `SharePanel` de hoy, con crear, duración de 1 a 365, copiar, renovar, revocar (con su confirmación) y los textos de caducado y archivado.
- **«Organización interna · anuncios de origen»:** el `AdsPanel` de hoy, dentro de un bloque secundario plegado (`<details>`). Sigue sin llegar nunca al contrato público.
- **Medición:** el `MeasurePanel`, solo con `?medir=1`.

### 3.11 Diagnósticos de material (DQ8, sin IA)

Se calculan a partir de **lo que ve hoy el cliente**: la misma instantánea interna y la misma proyección que el lector. No hay estimaciones aparte.

```ts
// lib/catalogs/material.ts (puro)
export interface CatalogMaterial {
  noText: boolean;             // ni descripción ni capítulos: ficha breve
  sections: number;            // capítulos del recorrido
  sectionsWithoutPhoto: number; // de ellos, sin foto adecuada (photo === null)
  photos: number;              // fotos que ve el cliente
}
export function materialOf(item: PublicItem): CatalogMaterial;
export function materialLabels(m: CatalogMaterial): string[];
// «Sin descripción» · «N capítulo(s) sin foto adecuada» · «Sin fotos»
export function materialByProperty(snap: InternalSnapshot, items: CatalogItemView[]): Record<string, CatalogMaterial>;
```

- **`getCatalogDetail`** ya carga `catalog_internal_snapshot` para la portada. Con esa misma instantánea calcula `material`, **sin consultas nuevas**:
  - pasa cada vivienda por `toPublicItem` y después por `materialOf`;
  - empareja por `slug` con `items`.
- **Contrato:** `CatalogDetail.material: Record<propertyId, CatalogMaterial>` es obligatorio, para que `tsc` obligue a actualizar todos los literales.
- **Solo gestión:** el contrato público no cambia.
- **Reserva y viviendas fuera de la lista:** no tienen diagnóstico y muestran «—».
- **Nada de esto llama a la IA ni escribe.**

### 3.12 Lo que no cambia (invariantes que se comprueban)

- **Acciones de servidor** (`app/[country]/(admin)/admin/mi-espacio/actions.ts`): ni una línea, comprobado con `git diff --stat`. Tampoco cambian `page.tsx` (`material` viaja dentro de `catalog`), SQL, migraciones ni permisos.
- **Medición:** la envoltura `mo` cubre exactamente las mismas acciones que hoy:
  - `updateMeta`, `addProperty`, `removeProperty`, `reorder`, `setStatus` y `setContact`;
  - `addPropertyById`, `selection.setCriteria` y `selection.setMode`;
  - `adjust`, `clearAdjustment` y `cover.set`;
  - `texts.save`, `publish`, `withdraw` y `remove`.

  Se hace en **un único sitio**, en `CatalogManager`.
- **`run`:** mensajes, medición y `router.refresh()`, igual que hoy.
- **Reglas del automático, portada, prioridad de fuentes, bloqueos y avisos de publicación:** sin cambios, porque viven en el servidor y en SQL.

### 3.13 Móvil, teclado y foco

- **Móvil (362 y 320 px):**
  - las cuatro pestañas caben en una fila sin desplazamiento horizontal: etiquetas cortas, a 13–14 px, con el ancho repartido;
  - sin barras fijas arriba, por el botón de menú del CRM.
- **Barra inferior de acciones** (editor y panel en móvil):
  - `position: sticky; bottom: 0`, con `env(safe-area-inset-bottom)`;
  - el contenido reserva su altura;
  - cada campo y botón del editor lleva `scroll-margin-bottom` igual a la barra más 16 px, así que al recibir el foco nunca queda debajo;
  - `z-index` por debajo del menú del CRM (30/40), para que el menú siga tapándolo todo cuando se abre.
- **Panel de escritorio:** su cuerpo se desplaza por dentro y el pie de acciones no tapa ningún campo, con la misma regla de margen.
- **Foco:**
  - al abrir un panel o editor, el foco va a su título (`tabIndex=-1`);
  - Esc o ✕ (o «‹» en móvil) lo cierran y devuelven el foco al botón de la fila que lo abrió;
  - el orden de tabulación sigue el visual;
  - foco visible (`focus-visible`) en todos los controles nuevos;
  - los mensajes conservan `role="status"`/`role="alert"`.
- **Mensajes del gestor:**
  - con un panel o editor abierto, se ven **encima de su barra de acciones**;
  - si no, encima de la sección;
  - nunca en una capa flotante que pueda tapar algo.

### 3.14 Quién es dueño de cada estado

| Estado | Dueño |
| --- | --- |
| Datos guardados del catálogo, la lista, los textos y el material | Servidor (props), refrescados con `router.refresh()` |
| Lista optimista al reordenar o quitar (con vuelta atrás si falla) | `CatalogManager`, como hoy |
| Enlace actual | `CatalogManager` (`currentShare`), como hoy |
| Sección y vivienda abierta | URL (`use-manager-url.ts`) |
| Valores en edición de **todos** los formularios y la sesión del editor | `drafts-store.ts` (único dueño) |
| Petición de IA en curso | El `TextEditor` abierto (id de petición). Se cancela al desmontarlo |
| Mensajes del gestor y `pending` | `CatalogManager` (`run`), como hoy |

## 4. Tareas (en orden de dependencias; un commit por tarea)

Cada tarea es un commit que compila y pasa:
- `npx tsc --noEmit`;
- `npm run test:catalogs`, `test:catalogs-public` y, desde T1, `test:catalogs-manager`;
- más su propia verificación.

**Un cambio de API llega en el mismo commit que todos sus consumidores.** Los arreglos que salgan de T9 son commits aparte («E2 · T9: …»), y cada uno compila.

| Tarea | Contenido | Archivos | Depende de | Verificación propia |
| --- | --- | --- | --- | --- |
| **T0** | Registro de la aprobación en la enmienda (D-QA12) y en la cabecera de este plan | `qa-c2/enmienda.md`, `qa-c2/plan-e2.md` | — | `git log` |
| **T1** | Modelos puros y sus pruebas: `materialOf`/`materialLabels`; secciones y URL (`parseSection`, `managerHref`); igualdad y normalización de cada formulario; `reconcileDraft`; dos nociones del editor; predicados de los filtros de Contenido | `lib/catalogs/material.ts` (nuevo), `lib/catalogs/manager-state.ts` (nuevo), `scripts/test-catalogs-manager.mts` (nuevo), `package.json` (solo el script `test:catalogs-manager`), `.github/workflows/ci.yml` (un paso que lo ejecuta; ajuste 3) | T0 | Casos **escritos a mano** (§5): `PublicItem` con 0/1/3 capítulos y fotos nulas; reconciliación en todos sus casos; lo escrito en bruto se conserva aunque coincida al normalizar («1.000.000» frente a `1000000`, «600 111 222» frente a `+34600111222`); guardado con retraso: ediciones durante el guardado que sobreviven al éxito y al fallo |
| **T2** | `material` en los datos, con **todos** sus literales | `lib/catalogs/types.ts`, `lib/catalogs/material.ts` (`materialByProperty`), `lib/catalogs/queries.ts`, `lib/catalogs/fixtures.ts` (`material` de las 4 viviendas, a mano), `app/dev-fixtures/…/fixture-manager.tsx` (`refresh` lo conserva), `scripts/test-catalogs-manager.mts` | T1 | `tsc`; `materialByProperty` con una instantánea escrita a mano (vendida filtrada, slug que no casa, orden distinto); `git diff` sin cambios en `actions.ts` ni en SQL |
| **T3** | Fixtures de E2 (solo desarrollo): catálogo grande con `?grande=1` (22 viviendas en manual y un conjunto de 36 para que el automático llene 24); su `material` sintético; contadores `window.__fxCalls` (por acción: escrituras, IA y lecturas, con el último contenido enviado); `window.__fxAiDelay`, `window.__fxSaveDelay` y `window.__fxFailNext`; marco del CRM en la página de fixtures (§6.1) | `lib/catalogs/fixtures-selection.ts`, `lib/catalogs/fixtures.ts`, `app/dev-fixtures/mi-espacio/catalogos/[id]/page.tsx`, `fixture-manager.tsx` (`pool` como prop; por defecto el de hoy), `fixture-texts.ts` | T2 | `tsc`. Las regresiones **C1, C2, PR-A, PR-B y enlace, sin tocar**, pasan contra las fixtures por defecto: el catálogo de 4 y sus números no cambian. Se escribe a mano la tabla de recuentos esperados del catálogo grande (§6.2) **antes** de abrirlo en el navegador |
| **T4** | Estructura: cabecera, pestañas y las cuatro secciones con los paneles **actuales** reubicados (aún sin rediseñar); `?seccion=` con historial; «Vista previa» y «Compartir»; ⋯ con Archivar; anuncios plegados; medición en Compartir. Secciones inactivas montadas y ocultas, así que ningún valor se pierde todavía | `catalog-manager.tsx`, `manager/manager-header.tsx`, `manager/section-tabs.tsx`, `manager/use-manager-url.ts` (nuevos) | T3 | `tsc`; navegador: URL, Atrás y Adelante, teclado de las pestañas y contadores sin escrituras ni IA al navegar; regresiones con el único cambio de «ir a la sección» antes de cada paso |
| **T5** | Valores sin guardar: almacén, reconciliación, aviso al salir; `SelectionPanel`, meta, contacto, `CoverPicker` y `TextEditor` controlados por el almacén; indicadores (punto en la pestaña, contador de la cabecera, «Cambios sin guardar» en el editor) | `manager/drafts-store.ts`, `manager/use-leave-guard.ts` (nuevos), `selection-panel.tsx`, `cover-picker.tsx`, `catalog-texts-panel.tsx`, `catalog-manager.tsx`, `manager/manager-header.tsx`, `manager/section-tabs.tsx` | T4 | `tsc`, `test:catalogs-manager`; navegador: el guion D-QA9 de §6.3 sobre la estructura de T4 |
| **T6** | Viviendas: barra de criterios y editor desplegable, vistas, lista compacta, panel de la vivienda (escritorio y móvil) y avisos compactos | `manager/homes-section.tsx`, `manager/property-panel.tsx`, `manager/side-panel.tsx` (nuevos), `property-search.tsx` (presentación), `selection-panel.tsx` (despliegue), `catalog-manager.tsx` | T5 | `tsc`; navegador: §6.4 (todas las acciones de selección con sus mensajes literales) |
| **T7** | Contenido: lista con columnas, búsqueda y filtros, editor único en `SidePanel`, «‹ ›», diagnósticos, reserva y borradores huérfanos | `manager/content-section.tsx` (nuevo), `catalog-texts-panel.tsx` (queda el `TextEditor` y el tipo `TextActions`, en la misma ruta, así que la fixture no cambia su `import`), `catalog-manager.tsx` | T6 (usa `side-panel.tsx`) | `tsc`; navegador: §6.5 |
| **T8** | Diseño y Compartir con su disposición final; vista previa con los valores escritos; foco al llegar desde «Vista previa» sin enlace | `manager/design-section.tsx`, `manager/share-section.tsx` (nuevos), `share-panel.tsx` (ancla y foco), `catalog-manager.tsx` | T5 | `tsc`; navegador: §6.6 |
| **T9** | Matriz completa, regresiones, compilación aislada, lint y capturas | Solo los arreglos que salgan, cada uno con su motivo | T6, T7, T8 | §5, §6 y §7 |
| **T10** | Resultado y entrega | `result.md` (sección E2), `qa-c2/capturas-e2/` | T9 | Push de `fabri/bcp-01-e2`, PR y CI en verde en el último commit. **Se para antes del merge** |

## 5. Criterios de aceptación y su prueba

**Verificación independiente:**
- **Pruebas puras:** casos y resultados **escritos a mano**, nunca obtenidos ejecutando el código que se prueba.
- **Mensajes de las acciones:** las pruebas de navegador comparan con **literales copiados de `87bf218`** (el código anterior a E2), no con constantes del código nuevo.
- **Recuentos de los fixtures** (viviendas en el catálogo, coincidencias, excluidas, diagnósticos de cada vivienda): se escriben a mano en T3, a partir de la definición de cada vivienda sintética y los criterios, **antes** de abrir la interfaz. No se calculan con `autoSelect` ni con `materialOf`.
- **Que navegar no guarda nada:** se demuestra con los contadores de las fixtures, que cuentan lo que **llega** a las acciones, no lo que la interfaz cree haber hecho.
- **Barras fijas y desbordes:** se comprueban con las cajas reales del navegador.

| Criterio | Cómo se demuestra |
| --- | --- |
| **AC-G1 Navegación:** sección en la URL; recargar y Atrás conservan el sitio; `tablist` con teclado | T4 y T9: cada pestaña cambia `?seccion=` sin peticiones al servidor de la página (0 peticiones RSC observadas); Atrás y Adelante recorren secciones y paneles; recargar abre la misma sección y el mismo panel; ←/→/Inicio/Fin/Intro; `aria-selected` y `aria-controls` correctos; `medir`/`vivo`/`grande` se conservan |
| **Cabecera y navegación sin efectos** | T9: tras un guion solo de navegación (pestañas, Atrás/Adelante, abrir y cerrar paneles, «‹ ›», «Vista previa» sin enlace, «Compartir», «Editar texto» desde Viviendas), `__fxCalls` tiene **0 escrituras y 0 llamadas a la IA**. Las únicas lecturas son las enumeradas: `texts.preview` al abrir un borrador guardado, `cover.photos` y `search` al abrir «Coincidencias». Con enlace activo, «Vista previa» es un `<a target="_blank">` a `/seleccion/<token>` y sin enlace lleva a Compartir con el foco en el bloque del enlace |
| **AC-G2 Viviendas** | T6 y T9 con el catálogo grande: 22 filas en manual y 24 en automático (recuentos de §6.2), sin desplazamiento horizontal a 1280 y 1440, con y sin panel. Todas las acciones con su **mensaje literal**: incluir, excluir, quitar inclusión, volver a permitir, subir/bajar, quitar (con confirmación), añadir por búsqueda y por referencia, pasar a automático, «Volver a mi lista anterior», «Convertir». Bloqueo del máximo, criterios no válidos, zonas redundantes, inclusión no disponible y `over-max`. Explicaciones **solo** en el panel: el texto de `explain` no aparece en las filas |
| **AC-G3 / D-QA9 Valores sin guardar** | T5 y T9, guion de §6.3: en los **cinco** formularios se escribe un valor conocido, se cierra, se cambia de sección o de vivienda, y se vuelve: el valor escrito es **exactamente** el mismo. Las marcas «Cambios sin guardar» de la fila, el filtro, la pestaña y la cabecera coinciden con la lista esperada. Recarga: diálogo `beforeunload`; al aceptar, valores perdidos y ninguna frase de «recuperado». Enlace interno y «Cerrar sesión»: confirmación; cancelar = misma página y valores; aceptar = sale y no vuelven. Atrás fuera de la página y Adelante de vuelta: valores conservados con su aviso. Ninguna escritura sin pulsar Guardar o Publicar (`__fxCalls`). Guardar borrador y Publicar separados, con las 4 condiciones para publicar. Abrir lo publicado sin tocarlo **no** marca cambios |
| **Ajustes 1 y 2: en bruto y guardado con retraso** | T1 (puro) y T9 (navegador, con `window.__fxSaveDelay` y `window.__fxFailNext` de las fixtures): «1.200.000», «600 111 222» y un distrito sin añadir se ven **exactamente** igual tras guardar, refrescar, cambiar de sección y volver. En los cinco formularios: se pulsa Guardar con 2 s de retraso, se sigue escribiendo, y (a) con éxito, lo escrito después sigue en el campo y marcado como cambio, sin «conflicto»; (b) con fallo, todo lo escrito sigue y aparece el mensaje de error de siempre. `__fxCalls` registra exactamente el envío de la instantánea, con su contenido |
| **Refrescos y lista** | T9: un guardado en otra pestaña de fixtures (el mismo almacén sintético) produce `conflict` con su aviso y sin pisar. Una exclusión que saca la vivienda del editor abierto la deja en reserva o en «ya no están» con su texto. Reordenar no cambia la vivienda del editor. Portada pendiente de una vivienda excluida: aviso y descarte |
| **AC-G4 IA** | T7 y T9 con la IA falsa: solo actúa al pulsar (0 llamadas al abrir y al navegar); «Cancelar»; con `__fxAiDelay=3000`, escribir durante la espera da «Usar la propuesta» y no pisa; cerrar el editor o pasar a otra vivienda durante la espera cancela (la respuesta no aparece al reabrir y el texto se conserva); aviso «piscina» que se confirma uno a uno; bloqueo por teléfono o precio que impide publicar; los avisos se ven al reabrir un borrador guardado; «Qué ve el cliente» con su «Por qué» y la fuente cambiada (`__fxChangeSource`). El límite de 60 s no cambia (`actions.ts` sin diferencias) |
| **DQ8 Material** | T1 (puro, a mano) y T9: las etiquetas de cada vivienda del catálogo grande coinciden con la tabla escrita a mano en T3; el filtro «Sin descripción» da su número esperado; 0 llamadas a la IA |
| **AC-G5 Diseño** | T8 y T9: elegir vivienda y foto («Portada elegida.»), «Usar su foto de portada», «Volver a la portada automática» («Portada automática.»), avisos de respaldo (vivienda excluida, foto que ya no existe), vista previa con el título escrito sin guardar |
| **AC-G6 Compartir** | T8 y T9: contacto (validaciones y «Contacto guardado. …»); crear (días fuera de 1–365 → mensaje), copiar, renovar, revocar con confirmación, catálogo archivado; los anuncios, plegados por defecto; con `?medir=1`, el panel de medición. Contrato público sin anuncios (la prueba existente de `test:catalogs-public` sigue en verde) |
| **AC-G7 Móvil** (362 y 320) | T9: sin desplazamiento horizontal en ninguna sección; 4 pestañas en una fila; en el editor y en el panel, al recorrer con Tab cada campo, aviso y botón, su caja no se cruza con la barra inferior ni con el botón de menú del CRM; la barra no tapa el último campo al final del desplazamiento |
| **AC-G8 En vivo** | T9: mediciones sintéticas 20 × 2 (fase 2, C1 y C2) en **PASA** con el gestor en secciones (`?vivo=1&medir=1`). Es local y sintético: no demuestra D13 |
| **Teclado y foco** | T9: abrir un panel lleva el foco a su título; Esc lo cierra y devuelve el foco a la fila; «‹ ›» con teclado; foco visible; sin trampas de foco |
| **P-1 y aislamiento** | Comprobaciones de §2.1 en cada arranque; sin `.env*`; solo IA falsa |

## 6. Matriz de navegador (T9)

### 6.1 Marco del CRM en las fixtures
La página de fixtures pasa a reproducir el marco del layout del admin:
- `main` con `pt-16 lg:ml-[260px] lg:pt-0`;
- la **barra lateral real** (`AdminSidebar`) con datos sintéticos, dentro de su proveedor de idioma.

Así se comprueban el aviso al salir y las barras fijas frente al botón de menú del CRM. Si la barra real no pudiera montarse sin servicios, se usaría una barra sintética con los mismos mecanismos (`Link` y un formulario), y se anotaría. «Cerrar sesión» **nunca** se acepta en las pruebas: solo se cancela.

### 6.2 Fixtures
| Fixture | Uso |
| --- | --- |
| Catálogo por defecto (4 viviendas, manual) | Regresiones C1/C2/PR-A/PR-B/enlace, sin cambios |
| `?grande=1` (22 en manual; automático con máx. 24 sobre 36) | Lista de 20–24, todas las acciones de selección, material, rendimiento de la lista |
| `?vivo=1`, `?medir=1` | En vivo y medición |

Recuentos esperados del catálogo grande (en el catálogo, coincidencias, excluidas, inclusiones no disponibles, material de cada vivienda): se escriben a mano en T3 y se copian en el resultado.

### 6.3 Guion D-QA9 (escritorio y móvil)
1. Criterios: añadir la zona «Chamberí», escribir el precio máximo «1.200.000» y «Otra zona: Pozuelo».
2. Diseño: título «Prueba E2 título» e introducción.
3. Diseño: elegir vivienda de portada sin confirmar foto.
4. Compartir: nombre «Ana Prueba», teléfono «600 111 222» y «Tu asesora».
5. Contenido: textos en dos viviendas distintas (A y B).
6. Comprobaciones, en cada paso y al final:
   - cambiar de sección cuatro veces;
   - cerrar y reabrir A;
   - abrir B y volver a A;
   - Atrás y Adelante.

   Todos los valores, exactos; marcas y contadores, los esperados.
7. Salidas: recarga (aceptar y cancelar), «‹ Mi espacio» (cancelar y aceptar), otro enlace de la barra lateral, «Cerrar sesión» (solo cancelar), Atrás fuera de la página y vuelta.
8. Guardar uno a uno: cada guardado borra solo su marca, y `__fxCalls` registra exactamente una escritura por guardado.

### 6.4 Viviendas
- **Manual (22):**
  - subir y bajar en la primera, una intermedia y la última (botones desactivados en los extremos);
  - quitar (confirmación);
  - añadir por búsqueda y por referencia (incluida una referencia no válida, con su mensaje).
- **Automático:**
  - pasar a automático (vista previa entran/salen y confirmación) y llenar 24;
  - Coincidencias: incluir, y que el máximo bloquee con su mensaje;
  - excluir desde la fila y desde el panel;
  - Excluidas: volver a permitir;
  - quitar inclusión;
  - inclusión no disponible;
  - zonas redundantes;
  - criterios no válidos;
  - «Ver qué entraría».
- **Vuelta a manual:** «Volver a mi lista anterior» y, en otra pasada, «Convertir».

### 6.5 Contenido
- Filtros y búsqueda, con los números esperados.
- Editor:
  - guardar borrador;
  - publicar (con un aviso pendiente, bloqueado; confirmado, publicado);
  - retirar;
  - borrar (confirmación).
- Reserva, fuente cambiada, IA (§5, AC-G4) y «‹ ›».
- Móvil: pantalla propia, «‹ Contenido» y Atrás del navegador.

### 6.6 Diseño y Compartir
Las acciones de AC-G5 y AC-G6. Además:
- «Vista previa» con enlace activo, caducado, sin enlace y con el catálogo archivado;
- Archivar y Reactivar desde ⋯.

### 6.7 Viewports
| Viewport | Qué |
| --- | --- |
| 1280 × 720, 1440 × 900 | Todo §6.3–§6.6, desbordes con 22 y 24 filas, con el panel abierto y cerrado |
| 1024 × 768 | El panel lateral y la lista conviven sin desplazamiento horizontal |
| 362 × 740, 320 × 568 | §6.3, §6.5 y lo esencial de §6.4 y §6.6; barras fijas frente a campos, avisos, botones y botón de menú; 4 pestañas en una fila |

Las capturas para la QA de Fabricio salen de esta matriz.

## 7. Regresiones

- **Pruebas:**
  - `test:catalogs`, `test:catalogs-public` y `test:catalogs-manager`, más `tsc`;
  - las mismas suites que E1: `test:smartlink`, `test:particulares`, `test:idealista`, `test:lead-merge`, `test:zinto-v2`, `test:viewing-collections`, `test:client-shortlist` y `test:portal-links`;
  - `lint-migrations`;
  - `test:typography`: como mucho las mismas 15 infracciones de la base, en archivos ajenos;
  - lint: **solo lo que ya existe** (ajuste 4). El repo no tiene configuración de ESLint, y `next lint` sin ella pide crear una de forma interactiva. Si sigue así, se anota «no disponible» y no se añade ninguna configuración ni paquete;
  - compilación aislada (`npm run build`, §2.1).
- **Navegador, lector:** lector, índice, PR-A, PR-B, enlace, C1 y C2 (scripts del scratchpad usados en E1).
  - Las pruebas del lector no cambian.
  - Las de la gestión **solo** cambian en:
    - el paso «ir a la sección» antes de cada acción;
    - los selectores de elementos que se han movido (por ejemplo, abrir el editor desde Contenido o desplegar los criterios).

  **Ninguna expectativa (número, mensaje o estado) se relaja.** Cada cambio de selector se lista en el resultado con su motivo.
- **Mediciones sintéticas:** fase 2, C1 y C2, 20 × 2, en **PASA**.

## 8. Decisiones de implementación (las toma Claude y quedan anotadas)

- El almacén de borradores vive **fuera de React** y por catálogo. Así sobrevive a cerrar editores, a cambiar de sección o de vivienda, a `router.refresh()` y a las navegaciones internas, pero no a una recarga. Es la forma más simple de tener **un solo dueño** sin `localStorage`.
- La sección va en la URL con `history.pushState` y **no** con `router.push`: así se evita volver a pedir todos los datos al servidor en cada pestaña.
- Las secciones inactivas quedan montadas y ocultas, para conservar búsquedas y vistas. Los valores de formulario no dependen de ello.
- Los diagnósticos se calculan con la **misma** instantánea y la misma proyección que el lector, y viajan dentro de `CatalogDetail`, sin consultas nuevas.
- «Coincidencias» usa la búsqueda que ya existe (solo lectura) con los criterios guardados.
- En móvil no hay barras fijas arriba, por el botón de menú fijo del CRM.
- Archivar pasa al menú ⋯ de la cabecera, como en la maqueta.

### 8.1 Puntos aprobados con el plan (15 de octubre de 2026)
| | Punto | Propuesta |
| --- | --- | --- |
| **A1** ✅ | «Atrás» del navegador que **sale** del gestor no se puede cancelar sin manipular el historial interno de Next | Aprobado: no se intercepta. Los valores reaparecen al volver dentro del mismo documento de la aplicación, con aviso; no se promete nada tras una recarga ni en un documento nuevo. Recarga, enlaces internos y «Cerrar sesión» piden confirmación |
| **A2** ✅ | Guardar un texto cuando el borrador cambió en otra pestaña (`expectedRev`) | El servidor lo sigue rechazando. La interfaz conserva lo escrito, refresca y deja elegir «Descartar mis cambios» o «Mantener los míos». Aprobado: «Mantener los míos» no guarda; los guardados siguientes siguen comprobando la revisión. Hoy solo se puede recargar y perder lo escrito |
| **A3** ✅ | Cerrar el editor, cambiar de vivienda o salir de Contenido con la IA trabajando | Aprobado: cuenta como «Cancelar». La respuesta tardía se ignora, lo escrito se conserva y reabrir no lanza ninguna llamada nueva |
| **A4** ✅ | Portada pendiente de una vivienda que sale de la lista | Aprobado: se descarta solo esa elección, con aviso; los demás formularios y los respaldos de la portada guardada no cambian |

## 9. Recuperación

- **E2 es solo código:**
  - sin migración, sin cambios de datos, sin cambio de huella ni del contrato público;
  - los valores sin guardar solo viven en la memoria de la pestaña.
- **Revertir:** `git revert` del merge en una rama y PR, que fusiona Fabricio. Vuelve el gestor de E1 tal cual y no se pierde ningún dato guardado.
- **Durante el despliegue:** quien tenga el gestor abierto sigue con su versión hasta recargar. Si recarga con cambios sin guardar, el navegador avisa (con E2) o los pierde (sin E2), como hoy.
- **Fixtures nuevas:** solo existen en desarrollo (`CATALOG_FIXTURES=1`) y dan 404 en producción.

## 10. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La integración de `pushState` con `useSearchParams` falla en algún caso de Atrás o Adelante | Pruebas de historial en T4 y T9. Si fallara, se pasa a `router.push(…, { scroll: false })` con el coste de la petición, anotado |
| El almacén de módulo se comparte entre peticiones en el servidor | Solo se escribe en manejadores del navegador; `getServerSnapshot` devuelve un estado vacío; prueba de que la primera pintura no trae borradores |
| Conflictos entre pestañas | `reconcileDraft` probado con los tres casos; nunca se pisa lo escrito ni lo guardado sin una acción explícita |
| Las regresiones de la gestión se rompen por la nueva estructura | Solo cambian la navegación y los selectores, con la lista de cambios; las expectativas no se tocan |
| Rendimiento de la lista con 24 filas, miniaturas y el panel | Miniaturas con `loading="lazy"`; sin recalcular explicaciones en el navegador |
| La barra lateral real no se puede montar en las fixtures | Barra sintética con los mismos mecanismos, anotado (§6.1) |

## 11. Fase y siguiente paso

> **Actualización (15 de octubre de 2026):** T0–T10 hechos; el resultado está en [`result.md`](../result.md) (sección E2). La fase es **PR abierto, a la espera de la revisión, el merge y la QA en vivo de Fabricio**. Desviaciones anotadas en el resultado: el panel va lado a lado desde 1280 px (no 1024), y `materialByProperty` va en `material-data.ts`.


- **Fase actual:** E2 en planificación. **Este plan es un BORRADOR** pendiente de la aprobación de Fabricio para ejecutarse. No se ha cambiado la aplicación, no se ha instalado nada y no hay push ni PR. El único commit de `fabri/bcp-01-e2` es este plan.
- **Siguiente paso:** Fabricio aprueba (o corrige) el plan y los puntos A1–A4 de §8.1. Solo entonces:
  1. preparación del entorno: `npm ci` y la copia aislada de §2.1;
  2. T0–T10;
  3. parada antes del merge.
- **Fuera de alcance:** E3 (fotos por catálogo), PDF, D13 en vivo y las pruebas en dispositivos reales.
