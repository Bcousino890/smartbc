# BCP-01 · Rediseño del gestor de catálogos («Lista editorial»)

El gestor interno de catálogos y su estantería en «Mi espacio» pasan al diseño aprobado «Lista editorial»: menos ruido, una acción principal clara y una estructura que otro agente entienda a la primera. Es un cambio de presentación: las acciones, el estado y los datos son los de hoy.

- **Tamaño:** medio (solo interfaz; sin migraciones, permisos, reglas de selección ni de traducción).
- **Responsable:** Fabricio
- **Rama base:** `fabri/bcp-gestor-rediseno` (worktree `wt/bcp-gestor`), y una rama por PR apilada sobre la anterior (ver «Plan»).
- **Estado:** plan aprobado por el encargo del 2026-10-23 (ver «Aprobación»).

## Especificación

### Contexto

- El lector del cliente (`/seleccion`), las portadas, los itinerarios y el PDF están aprobados y **no se tocan** (enmienda visual de PR #338).
- El gestor tiene hoy (comprobado en `origin/main` `fff110c8`):
  - «Mi espacio» con un título grande («MI ESPACIO») + «Accesos» + «Módulos» y, debajo, la sección «CATÁLOGOS» con grupos, seis filtros siempre visibles y portadas grandes ([home-view.tsx](../../../components/admin/catalogs/home-view.tsx), [home-catalogs.tsx](../../../components/admin/catalogs/home-catalogs.tsx), [catalog-shelf.tsx](../../../components/admin/catalogs/catalog-shelf.tsx)).
  - En cada catálogo, un título enorme de la página («CATÁLOGO / SALAMANCA Y CHAMBERÍ») **y además** la cabecera fija del gestor, que repite el título al desplazarse ([catalogos/[id]/page.tsx](../../../app/[country]/(admin)/admin/mi-espacio/catalogos/[id]/page.tsx), [manager-header.tsx](../../../components/admin/catalogs/manager/manager-header.tsx)).
  - Cinco pestañas «Viviendas · Contenido · Diseño · Compartir · Idiomas» con la sección en la URL (`?seccion=viviendas|contenido|diseno|compartir|idiomas&vivienda=…`), historial con `pushState` ([use-manager-url.ts](../../../components/admin/catalogs/manager/use-manager-url.ts)).
  - Todo lo escrito sin guardar vive en un almacén por catálogo ([drafts-store.ts](../../../components/admin/catalogs/manager/drafts-store.ts)), con guarda al salir, conflictos y cancelación de la IA.
- Los componentes de `components/admin/catalogs/` solo se usan desde las páginas de «Mi espacio» (comprobado con `grep`): un estilo limitado a ese árbol no llega al resto del CRM. `components/catalogs/catalog-cover.tsx` sí es compartido (lector, PDF) y no se modifica.
- La maqueta interactiva aprobada **no ha pasado QA en navegador**. Sus datos de ejemplo, acciones simplificadas, avisos y persistencia simulada no son comportamiento a copiar.

### Decisiones

Todas del encargo de Fabricio del 2026-10-23. No se vuelven a preguntar.

- **D1 (2026-10-23):** referencia visual = variante **«Lista editorial»** de `catalogos-estudio.html` (maqueta en `Documents/Codex/…/catalogos-gestor/`). Es referencia de maquetación e interacción, no de datos ni de lógica.
- **D2 (2026-10-23):** tipografía **la que muestra la maqueta**: **Unbounded** en títulos seleccionados y nombres de catálogo; **Roboto** en texto operativo, listas, formularios y botones. Termina (referencia DAMAC) no tiene licencia: ni se compra ni es requisito.
- **D3 (2026-10-23):** estantería primero, con portadas compactas, títulos legibles y metadatos útiles; «Textos aprobados» y «Plantillas de zona» como enlaces compactos de biblioteca; filtros secundarios detrás de «Filtros» con los activos visibles y quitables.
- **D4 (2026-10-23):** una sola cabecera compacta del catálogo en lugar del título grande duplicado.
- **D5 (2026-10-23):** etiquetas visibles **Viviendas · Textos y fotos · Portada y estilo · Idiomas · Compartir**. Se conservan los identificadores de sección, las URL y la navegación del navegador.
- **D6 (2026-10-23):** en textos, la lista de viviendas y **un** editor enfocado, con la adaptación móvil actual.
- **D7 (2026-10-23):** enlaces personales de cliente y enlace general fáciles de distinguir.
- **D8 (2026-10-23):** superficies cálidas sobrias, separadores sutiles y acentos dorados, como la referencia.
- **D9 (2026-10-23):** una descripción válida heredada de la ficha **no** se presenta como error por no tener texto propio. Los avisos reales de material que falta y de contenido no vigente siguen visibles.
- **D10 (2026-10-23):** «Guardar borrador» y «Publicar» siguen explícitos. Nada se guarda ni se publica solo.
- **D11 (2026-10-23):** no se elimina ninguna función porque falte en la maqueta. Inventario y mapa en [inventario.md](inventario.md).

### Decisiones de implementación (Claude, sin efecto de producto)

- **I1:** las fuentes se cargan con `next/font/google` en un archivo propio del módulo, igual que el lector carga sus familias árabe y hebrea ([components/catalogs/reader/fonts.ts](../../../components/catalogs/reader/fonts.ts)): Unbounded y Roboto son OFL/Apache, se descargan una vez al construir y se sirven desde el propio dominio. Sus variables solo se definen en la raíz del módulo; fuera de ella nada cambia. Caras reales: Unbounded 400/500, Roboto 400/500/700 (sin pesos sintéticos). Respaldo: `Arial, sans-serif`.
- **I2:** el estilo vive en una raíz del módulo (`StudioRoot`, clase de CSS module) que redefine `--crm-font-sans` **dentro de su árbol** y ajusta `crm-label-sm` (sin mayúsculas, 14 px) solo ahí. No se toca `app/globals.css`, ni `tailwind.config.ts`, ni componentes compartidos.
- **I3:** tamaños dentro de la escala aprobada del CRM (`text-xs/sm/base/lg`, `text-2xl`, `text-[22px]`, `text-[28px]`) y `tracking-tight` estándar; sin `text-[Npx]` nuevos, sin `tracking-[…]`, sin `fontFamily` en línea. `npm run test:typography` no puede sumar violaciones.
- **I4:** el CRM no tiene modo oscuro; la maqueta sí lo dibuja. Se mantiene solo el claro, como el resto del admin.
- **I5:** el orden de las pestañas pasa a ser el de D5 (Idiomas antes de Compartir). Los identificadores (`viviendas`, `contenido`, `diseno`, `idiomas`, `compartir`) y las URL no cambian; el teclado (← → Inicio Fin) sigue el orden visible.
- **I6:** los botones principales siguen la referencia (tinta oscura sobre crema); el dorado queda para acentos, enlaces y la pestaña activa. Contraste del dorado de texto ≥ 4,5:1 (`#856329` sobre blanco).
- **I8 (PR2):** re-skin acotado. Dentro de `StudioRoot`, las utilidades que ya usan los paneles internos (`border-gold/10…30`, `divide-gold/10`, `bg-white/40…90`, `bg-cream-50/50…70`, `bg-gold/10…20`, `rounded-xl`, `text-gold`, `bg-gold/90` y `hover:bg-gold`) toman los tonos de la referencia (separador neutro, panel blanco, resalte dorado suave, acción principal en tinta oscura, dorado de texto accesible). Así ~30 componentes internos cambian de aspecto sin tocar su marcado ni su lógica. Fuera de `StudioRoot` esas utilidades siguen igual. El diálogo de grupos, que se pinta en `<body>`, lleva su propia raíz.
- **I7:** el editor de una vivienda separa «Título y descripción» y «Fotos» en dos pestañas internas. Las dos quedan **montadas** (la oculta con `hidden`): cambiar de pestaña no cancela la IA ni pierde nada.

### Alcance

1. Raíz del módulo con tipografía y superficies (I1, I2) en las dos páginas de «Mi espacio» que usan el gestor (HOME y catálogo) y en sus páginas de prueba.
2. Estantería: cabecera compacta («Mi espacio / Catálogos», campana e idioma conservados), estantería primero, biblioteca compacta, grupos + búsqueda + «Filtros» con filtros activos quitables, lista editorial con portada compacta. Accesos rápidos conservados, debajo y compactos.
3. Gestor: cabecera compacta única, pestañas con las etiquetas de D5, marcos de cada sección.
4. «Textos y fotos»: lista con estado útil (D9) y editor enfocado con «Título y descripción» / «Fotos».
5. «Compartir»: «Para un cliente» (enlaces personales) y «Enlace general» separados y reconocibles; contacto, PDF y anuncios de origen como filas de ajustes.
6. «Portada y estilo» e «Idiomas»: misma estructura de paneles y filas.
7. Selectores de las pruebas y del QA local actualizados cuando el rediseño lo justifique, sin debilitar ninguna aserción.

### Fuera de alcance

- Lector del cliente, portadas (`catalog-cover`), itinerarios, PDF, barra lateral y logo del CRM, otras secciones del CRM, páginas «Textos aprobados» y «Plantillas de zona» (solo cambia el enlace hacia ellas).
- Migraciones, permisos, reglas de selección o conversión, política de traducción, nuevas librerías de interfaz, servicios de pago.
- Datos que hoy no llegan a la estantería (estado del enlace o idiomas por catálogo, que la maqueta pinta): mostrarlos exige ampliar la consulta; queda como diferencia documentada.
- Guardado o publicación automáticos.

### Criterios de aceptación

| ID | Criterio |
| --- | --- |
| AC1 | «Mi espacio» abre con la estantería: cabecera compacta, «Nuevo catálogo» como acción principal, biblioteca en una fila de enlaces, grupos y búsqueda visibles, filtros secundarios tras «Filtros». |
| AC2 | Los seis filtros de hoy (búsqueda, anuncio de origen, zona de los criterios, operación, modo antiguo y estado) siguen funcionando igual; cada filtro secundario activo se ve como etiqueta y se quita con un clic; el recuento «N de M» sigue. |
| AC3 | Grupos, subgrupos, recuentos, «Más grupos», selector móvil, asignación («Grupos»), `?grupo=` y lo recordado funcionan como antes; al volver de un catálogo se conserva el grupo. |
| AC4 | Un solo título por pantalla de catálogo; la cabecera compacta conserva volver a «Mi espacio», vista previa, compartir, menú ⋯ (archivar/reactivar, PDF, grupos), estado, recuento, enlace y «Cambios sin guardar» con su lista. |
| AC5 | Pestañas «Viviendas · Textos y fotos · Portada y estilo · Idiomas · Compartir» con los mismos `?seccion=`; Atrás/Adelante y el teclado funcionan; el punto de cambios sin guardar sigue. |
| AC6 | En «Textos y fotos», lo escrito sin guardar sobrevive a cambiar de vivienda, de pestaña interna y de sección; guardar ≠ publicar; conflicto, edición durante el guardado, guarda al salir y cancelar IA funcionan como antes. |
| AC7 | Una vivienda sin texto propio pero con descripción válida de la ficha no se marca como error; «Sin descripción», «Sin fotos», «revisar (cambió …)» y la versión no vigente siguen visibles. |
| AC8 | Fotos: elegir, excluir, apertura, aviso de ajustes obsoletos y salvaguardas de portada siguen. |
| AC9 | Idiomas: los ocho idiomas, preparar/revisar, reutilización, estados e idioma por cliente siguen. |
| AC10 | Compartir: enlace personal y enlace general se distinguen a simple vista; contacto, caducidad, renovar, revocar, opiniones, PDF, archivo y anuncios de origen siguen. |
| AC11 | Estados de carga, vacío, validación, error y desactivado siguen visibles. |
| AC12 | Escritorio (1440) y móvil (390 y 320) sin desbordes horizontales; foco visible; navegación con teclado; etiquetas legibles; títulos largos sin romper la maquetación. |
| AC13 | Fuera del módulo nada cambia (CRM, lector, PDF); `test:typography` sin violaciones nuevas; `tsc`, pruebas de la CI y `next build` aislado en verde. |

### Impacto en datos y despliegue

No toca migraciones, datos, permisos ni integraciones. Un merge a `main` despliega en el VPS (y puede llevar commits de otros que estén en `main`). Las fuentes nuevas se descargan durante `next build`, igual que las que ya usan `app/layout.tsx` y el lector.

## Plan

### Base

`origin/main` = `fff110c83dce001c6b7dd239d7a0bc6de4d042ff` (comprobado con `git ls-remote origin refs/heads/main` el 2026-10-23). Si `main` avanza antes de un PR: sin solape con los archivos de la tarea, se anota; con solape, se actualiza la rama y se repiten las comprobaciones; con conflicto, se para y se avisa.

### Pasos de entorno

1. `git worktree add -b fabri/bcp-gestor-rediseno ../wt/bcp-gestor origin/main` (hecho): no toca el checkout original, su rama ni el stash.
2. `node_modules` clonado con `cp -Rc` (copia APFS) desde `wt/bcp-01-tr-auto`, que tiene el **mismo** `package-lock.json` (comprobado con `git diff --no-index`). Sin `npm install` (mismo procedimiento que la ampliación de textos e idiomas).
3. Servidor de fixtures: `PORT=3142 sh scripts/dev-fixtures.sh` (sin `.env`, Supabase a `127.0.0.1:9`, claves ficticias, solo `127.0.0.1`).
4. Navegador: Playwright y Chromium ya instalados (`~/Library/Caches/ms-playwright/chromium-1148`). Los guiones de QA viven en `node_modules/.cache/visual-qa/` (no se versionan).
5. Build aislado: parar el servidor de fixtures, borrar `.next`, mover `.env.production` fuera del worktree, `NEXT_BUILD_DIR=.next.qa npx next build`, devolverlo y comprobar `git status`. Sin red de producción ni credenciales.

### PR y tareas

Cuatro PR pequeños y apilados (cada uno revisable y desplegable por sí mismo). La CI solo se ejecuta en PR hacia `main`: para los apilados se ejecutan en local los mismos pasos (tsc, `npm run test:*` de la CI salvo `build`, build aislado, `lint-migrations`) y se dice en el PR.

**PR1 · Base del módulo y estantería** (`fabri/bcp-gestor-rediseno` → `main`)
- T1 · Expediente: este archivo e [inventario.md](inventario.md). Commit «BCP-01: expediente del rediseño del gestor».
- T2 · `components/admin/catalogs/studio/`: `fonts.ts` (I1), `studio.module.css` y `StudioRoot` (I2). Verificación: fuera de `StudioRoot` las familias calculadas siguen siendo Lato/Optima.
- T3 · Página «Mi espacio» (real y de prueba): cabecera compacta con campana e idioma, `HomeView` con la estantería primero, biblioteca compacta y accesos debajo.
- T4 · `HomeCatalogs` + `CatalogShelf`: cabecera de la sección, grupos + búsqueda + «Filtros», etiquetas de filtros activos, lista editorial (portada compacta, estado, título Unbounded, metadatos, «Abrir catálogo», «Compartir», «Grupos»), vacíos y «Ver archivo».
- Verificación: AC1–AC3, AC11–AC13 en el navegador con fixtures; capturas junto a la referencia.

**PR2 · Marco del gestor** (`fabri/bcp-gestor-marco`, sobre PR1)
- T5 · Página del catálogo (real y de prueba): fuera el título duplicado; `StudioRoot`.
- T6 · `ManagerHeader` compacto (título Unbounded, línea de estado, acciones) y `SectionTabs` con D5/I5; textos que nombran las secciones («Ir a Idiomas», «‹ Contenido»…) con las etiquetas nuevas.
- T7 · Marcos de «Viviendas» y «Portada y estilo».
- Verificación: AC4, AC5, AC8 (portada), AC12; `scripts/qa/catalog-search-e2e.mts` con las etiquetas nuevas.

**PR3 · Textos y fotos** (`fabri/bcp-gestor-textos`, sobre PR2)
- T8 · Lista con estado útil (D9) y editor enfocado (cabecera «Editar vivienda», pestañas internas I7, pie con «Guardar borrador» / «Publicar»).
- Verificación: AC6–AC8, AC11, AC12 con los flujos de borrador, publicación, error, conflicto, edición durante el guardado, salida con cambios y cancelación de IA (acciones falsas de los fixtures; ninguna IA real).

**PR4 · Idiomas y Compartir** (`fabri/bcp-gestor-compartir`, sobre PR3)
- T9 · «Compartir»: «Para un cliente» y «Enlace general» distinguibles; contacto, idioma del enlace general, PDF y anuncios de origen como filas.
- T10 · «Idiomas»: paneles y filas con la estructura de la referencia.
- Verificación: AC9, AC10, AC12; descarga del PDF de fixtures.

**Cierre de cada PR:** sección «Resultado» de este archivo con comandos y resultados, capturas en `capturas-prN/` (implementación junto a la referencia), push de la rama, PR y parada antes del merge.

### Aprobación

El encargo del 2026-10-23 aprueba el diseño y pide continuar la implementación rutinaria sin reabrir las decisiones visuales. Las decisiones nuevas de producto o los cambios de comportamiento inevitables se paran y se preguntan.

## Resultado

### PR1 · Base del módulo y estantería

**Commits:** `39f28da2` expediente · `14e18343` tipografía y superficies del módulo · `3631f7c5` estantería (y el commit de este resultado).

**Qué cambia**

- `components/admin/catalogs/studio/`: `fonts.ts` (Unbounded 400/500, Roboto 400/500/700, `next/font/google`), `studio.module.css` (tokens, primitivas y `crm-label-sm` en frase solo dentro del módulo), `StudioRoot` y `StudioPageBar` (migas + los mismos `NotificationsBell` y `LanguageSwitcher` que ponía `AdminPageHeader`).
- «Mi espacio» (real y de prueba): sin el título grande; h1 «Catálogos» en Unbounded con «Nuevo catálogo» como acción principal y «Organizar» secundaria; biblioteca en una fila; accesos (Clientes, Propiedades, Solicitudes) compactos al final.
- Estantería: grupos (pestañas suaves; misma lógica, móvil igual) y búsqueda a la vista; «Filtros» abre estado, operación, zona de los criterios, anuncio de origen y modo; «Mostrando …» con el estado siempre visible y cada filtro activo como etiqueta quitable; «Quitar filtros»; «Ver archivo» si hay archivados ocultos. Fila editorial: portada compacta (la misma `CatalogCover`), estado, título, «N viviendas · criterios», grupos, anuncios, fecha, «Abrir catálogo», «Grupos» y «Compartir» (`?seccion=compartir`).
- `NewCatalogForm` acepta `open`/`onOpenChange` (se abre bajo la cabecera y sigue montado: cerrar y abrir conserva lo escrito). Creación idéntica.
- Se retira el rótulo sin función «Próximos módulos» (inventario).

**Verificaciones**

| Comprobación | Resultado |
| --- | --- |
| `npx tsc --noEmit` | sin errores |
| `node scripts/check-crm-typography.mjs` | 23 violaciones, todas previas (eran 24: desaparece `text-[15px]` de `group-selector.tsx`); ninguna nueva |
| 29 pasos `npm run …` de la CI (sin `build`) + `lint-migrations` | 27 en verde. **Fallan `test:role-model`/`test:user-rank` y `test:permission-scope`, igual que en `main`** (CI de `main` en rojo desde `42fc5b05` y `fff110c8`, cambios de permisos ajenos a esta tarea: «Solo lo suyo en Solicitudes» frente a «Toda la cartera»). No se tocan. **Actualización 2026-10-23:** corregido en `main` con #361 (`243aa7a8`); tras fusionar `main` en esta rama, los 29 pasos en verde. |
| Build aislado: `git archive 3631f7c5` en una carpeta temporal, sin `.env.production`, `node_modules` enlazado, `NEXT_BUILD_DIR=.next.qa npx next build` | «Compiled successfully»; solo el aviso conocido «supabaseUrl is required» (sin base de datos) |
| QA en Chromium con fixtures (`node_modules/.cache/visual-qa/qa-shelf.mjs`, 33 comprobaciones) | todas en verde: un solo h1, Unbounded/Roboto calculadas, panel oculto al entrar, búsqueda por título y por código, los cinco filtros secundarios con su etiqueta, quitar una etiqueta, «Quitar filtros», «Ver archivo», `?grupo=`, subgrupos, Atrás tras abrir un catálogo, grupo recordado sin `?grupo`, «Compartir», diálogo «Grupos», formulario nuevo conserva lo escrito, foco visible (contorno dorado 2 px) y teclado, vacío, 320 px sin desborde, sin errores de página |
| Fuera del módulo (`qa-outside.mjs`) | «Textos aprobados» y «Plantillas de zona»: Optima/Lato como antes; lector `/seleccion`: Playfair/Cinzel como antes; variables del gestor no definidas fuera |
| Desbordes (`html[data-check]` de las fixtures y `scrollWidth`) | 0 en 1440, 390 y 320 |

**Capturas** ([capturas-pr1/](capturas-pr1/)): `estanteria-escritorio.png`, `filtros-escritorio.png`, `estanteria-movil.png` (referencia | implementación), `estanteria-320.png` y `antes-escritorio.png`. En las capturas se ocultan el distintivo de Next y la barra de diagnóstico de las fixtures.

**Diferencias con la referencia, dichas tal cual**

- La fila no dice «Enlace activo» ni los idiomas de cada catálogo: la estantería no recibe hoy esos datos (fuera de alcance). Dice «Activo»/«Archivado» y, en los antiguos, «Automático (antiguo)».
- Se añaden a la fila los metadatos que ya existían (criterios, grupos, anuncios, fecha) y el botón «Grupos».
- Los iconos de la maqueta no se ven en su captura (dependían de un script del entorno de la maqueta); en la implementación son los de `lucide-react` que ya usa el CRM.
- Tamaños en la escala del CRM: título 24 px, texto 14 px, metadatos 12 px (la maqueta usa 13 px en algunos textos).
- Sin modo oscuro (I4).

### PR2 · Marco del gestor

**Commits:** `f22792c9` superficies del módulo (I8) · `6113824a` cabecera única y pestañas (y el commit de este resultado).

**Qué cambia**

- Página del catálogo (real y de prueba): fuera el bloque «CATÁLOGO / título»; todo dentro de `StudioRoot`.
- `ManagerHeader`: migas «← Mi espacio / Catálogos» (no fijas) y, debajo, la cabecera fija en escritorio con el único h1 (Unbounded, 22–24 px; 18 px y una línea al quedar fija), la línea de estado (Activo/Archivado, «Automático (antiguo)», nº de viviendas, enlace, «Cambios sin guardar (N)» con su lista) y las acciones «Vista previa», «Compartir» (principal) y ⋯ (Archivar/Reactivar, Descargar PDF, Grupos…). En móvil: título, estado y acciones, en ese orden, sin fijar.
- `SectionTabs`: subrayadas, etiquetas y orden de D5 (I5), mismos `id`, `aria-*`, teclado y punto ámbar de cambios. En móvil bajan de línea.
- «Viviendas»: título de sección («Viviendas de esta selección» y qué decide el orden), vistas como pestañas suaves; listas, buscador, importación y paneles sin cambios.
- «Portada y estilo»: panel «Portada y presentación» (título e introducción, portada, acabado fotográfico separados por líneas) y panel «Vista previa de la portada».
- Textos que nombraban las secciones viejas: «‹ Textos y fotos» en el panel móvil; `scripts/qa/catalog-search-e2e.mts` busca las pestañas por sus etiquetas nuevas (mismas aserciones).

**Verificaciones**

| Comprobación | Resultado |
| --- | --- |
| `npx tsc --noEmit` | sin errores |
| `check-crm-typography` | 23, ninguna nueva |
| Pasos de la CI en local (sin `build`) + `lint-migrations` | 28 en verde; los mismos dos fallos previos de `main` (permisos) |
| Build aislado (`git archive 6113824a`, sin `.env.production`, `NEXT_BUILD_DIR=.next.qa`) | «Compiled successfully»; solo el aviso conocido «supabaseUrl is required» |
| `qa-marco.mjs` (37 comprobaciones, Chromium + fixtures) | todas en verde: un solo h1 en Unbounded; migas; etiquetas y orden; cada pestaña → su `?seccion=` y su panel; Atrás/Adelante; ← → Intro Inicio Fin; foco visible; `?seccion` desconocida → viviendas; punto de cambios y «Cambios sin guardar (1)»; el título escrito sobrevive a cambiar de sección; la lista lleva al campo; error de guardado con alerta y lo escrito intacto; conflicto con «Mantener los míos»; edición durante el guardado (se envía la instantánea, lo nuevo queda sin guardar); salir con cambios pide confirmación; archivar y reactivar; PDF desde ⋯ (descarga real del endpoint de fixtures); «Grupos…» en la raíz del gestor; vista previa sin enlace → Compartir con el motivo; cabecera fija de 81 px (< 112 px del panel lateral); título largo a 320 px sin desborde; sin errores de página |
| `BASE=… node --experimental-strip-types scripts/qa/catalog-search-e2e.mts` | «Todo en verde» (buscador, operación, automático antiguo, conversión P4, las cuatro secciones, móvil) |

**Capturas** ([capturas-pr2/](capturas-pr2/)): `viviendas-escritorio.png`, `portada-escritorio.png`, `viviendas-movil.png`, `portada-movil.png` (referencia | implementación), `portada-320.png`, `antes-viviendas-escritorio.png`.

**Diferencias con la referencia**

- Las acciones están a la derecha del título, como en la referencia, pero las migas no son fijas y la cabecera sí lo es en escritorio (comportamiento previo).
- «Compartir» sigue visible también dentro de la pestaña Compartir (la maqueta lo oculta); hace lo mismo que antes (lleva al formulario y limpia el aviso).
- «Viviendas» no tiene el botón «Añadir viviendas» de la maqueta en su título: ya existe la vista «Añadir viviendas» al lado de «En el catálogo», con el buscador real.
- En la referencia móvil, las filas de «Viviendas» salen muy altas y vacías (defecto de la maqueta); la implementación conserva las filas compactas actuales.

### PR3 · Textos y fotos

**Commits:** `c3cfe305` lista y editor (y el commit de este resultado).

**Qué cambia**

- Título de sección «Lo que leerá el cliente» con un resumen (viviendas, textos propios publicados, con la descripción de la ficha y, en ámbar, sin descripción).
- Los siete filtros de siempre (mismos `data-testid` y recuentos) como pestañas suaves; búsqueda «Buscar vivienda o referencia».
- Fila: miniatura (la de Viviendas), título, referencia y zona, estado y avisos. **D9:** sin texto propio, la fila dice «Usa la descripción de la ficha» o «Usa la historia aprobada» en gris; solo es ámbar «Sin descripción: solo datos y fotos», el material que falta («Sin fotos»…) y «Publicado · revisar (cambió …)». El «Qué ve el cliente · Por qué» sigue en cada fila (plegado). Reserva y borradores huérfanos, igual.
- Editor: el mismo `SidePanel` (anterior/siguiente, Esc, foco de vuelta, pantalla propia en móvil con «‹ Textos y fotos»), más ancho, con «Editar vivienda · BC · n de N · Solo cambia este catálogo» y dos pestañas internas, **«Título y descripción»** y **«Fotos»**, montadas las dos (I7). Las ayudas de IA van junto a la descripción. Pie fijo: «Guardar borrador» (secundario) y «Publicar» (principal), con las mismas reglas de activación; «Guardar como texto aprobado» sigue desmarcado.

**Verificaciones**

| Comprobación | Resultado |
| --- | --- |
| `tsc`, tipografía | sin errores; 23, ninguna nueva |
| Pasos de la CI en local + `lint-migrations` | 28 en verde; los dos fallos previos de `main` (permisos) |
| Build aislado (`git archive c3cfe305`) | «Compiled successfully» |
| `qa-textos.mjs` (41 comprobaciones) | todas en verde: D9 (gris) frente a «Sin descripción» (ámbar) y «Sin fotos»; un solo editor; `?vivienda=`; vista organizada en vivo; Fotos/Texto con ← y lo escrito intacto; cambiar de sección y volver conserva título y descripción exactos (y la fila marca «Cambios sin guardar»); anterior/siguiente; Publicar desactivado sin guardar; error al guardar; guardar no publica; publicar; «texto aprobado» desmarcado y sin llamada; foco de vuelta a la fila; edición durante el guardado (se envía la instantánea A y B queda pendiente); conflicto y «Mantener los míos»; cancelar IA; la IA no pisa lo escrito y ofrece la propuesta; **cambiar a «Fotos» no cancela la IA**; bloqueo por teléfono; aviso al salir; apertura, excluir, volver a usar, salvaguarda de la última foto, aviso de ajustes obsoletos; móvil 390 (pantalla propia, pie dentro de la pantalla, vuelta a la lista, sin desborde); sin errores |
| `qa-stale.mjs` | tras cambiar la ficha: fila «Publicado · revisar (cambió los dormitorios)» en ámbar, aviso `text-stale` en el editor y el filtro «Por revisar» la encuentra |

**Capturas** ([capturas-pr3/](capturas-pr3/)): `editor-escritorio.png`, `fotos-escritorio.png`, `editor-movil.png` (referencia | implementación), `lista-escritorio.png`, `lista-movil.png`, `editor-320.png`, `antes-contenido.png`.

**Diferencias con la referencia**

- Siete filtros (los de hoy) en vez de tres; sin paginación (la lista ya cabe: máximo 24 viviendas).
- El editor conserva todos los bloques que la maqueta omite (zona, plantilla «Vivir en…», texto aprobado, entrada y puntos, avisos, retirar, borrar, historia) y los avisos de zona no se pliegan, para no esconder nada pendiente.
- Las fotos se gestionan con los controles actuales (apertura, no usar, sin acabado), no con la cuadrícula de selección única de la maqueta.

### PR4 · Idiomas y Compartir

**Commits:** `6b07f6e6` (y el commit de este resultado).

**Qué cambia**

- «Compartir»: título «Comparte esta selección»; dos bloques lado a lado (apilados en móvil): **«Para un cliente · enlace personal»** (el panel de enlaces personales de siempre, con su explicación) y **«Enlace general»** (crear, duración, copiar, renovar, revocar) con su **«Idioma del enlace general»** debajo. Después, un panel de ajustes comunes: contacto que ve el cliente, «PDF del catálogo» con su botón a la derecha y «Organización interna · anuncios de origen» plegado. Medición (`?medir=1`) igual.
- «Idiomas»: título «Idiomas del catálogo»; mismos paneles. `text-[11px]` → `text-xs` en la marca «sin revisión nativa» y en la nota de la plantilla: la comprobación tipográfica baja a 21 violaciones (todas fuera de este módulo salvo `copy-library-page.tsx`, que no se toca).

**Verificaciones**

| Comprobación | Resultado |
| --- | --- |
| `tsc`, tipografía | sin errores; 21 (antes 24), ninguna nueva |
| Pasos de la CI en local + `lint-migrations` | 28 en verde; los dos fallos previos de `main` (permisos) |
| Build aislado (`git archive 6b07f6e6`) | «Compiled successfully» |
| `qa-compartir.mjs` (27 comprobaciones, servidor de fixtures recién arrancado) | todas en verde: dos bloques distintos (lado a lado en escritorio, apilados en móvil); duración no válida desactiva «Crear enlace»; crear, copiar, renovar y revocar el enlace general (y la cabecera lo refleja); buscar cliente, asignar, opiniones y caducidad, renovar y revocar enlaces personales; idioma del enlace general (árabe con «sin revisión nativa»); validación del teléfono; aviso del PDF con cambios sin guardar y descarga; conflicto del contacto; anuncios de origen; idioma por cliente sin cambiar los demás; 8 idiomas; nota de coste; «Preparar ahora» (traductor sintético de las fixtures, ninguna IA real); archivado bloquea asignar; sin desborde |
| Regresión de toda la pila en el último commit | `qa-shelf`, `qa-marco`, `qa-textos`, `qa-compartir` y `scripts/qa/catalog-search-e2e.mts` en verde; fuera del módulo nada cambia (`qa-outside`) |

**Capturas** ([capturas-pr4/](capturas-pr4/)): `compartir-escritorio.png`, `idiomas-escritorio.png`, `compartir-movil.png`, `idiomas-movil.png` (referencia | implementación), `compartir-320.png`, `antes-compartir.png`, `antes-idiomas.png`.

**Diferencias con la referencia**

- La referencia resume el contacto, el idioma y el enlace en filas con «Editar/Cambiar/Gestionar»; aquí los formularios siguen abiertos (los mismos de hoy), para no esconder cambios sin guardar ni conflictos.
- La explicación del enlace personal es la actual (más larga), porque dice consecuencias reales (sin contraseña, reenvío).
- La lista de idiomas es la del panel actual (progreso por idioma y traducciones), no las filas simplificadas de la maqueta.

## Cierre

- **PR:** #357 (1/4, a `main`), #358 (2/4, sobre #357), #359 (3/4, sobre #358) y #360 (4/4, sobre #359). Orden de merge: 1 → 2 → 3 → 4; cada uno se retargetea a `main` al fusionar el anterior y entonces corre su CI.
- **CI:** `main` está en rojo desde `42fc5b05`/`fff110c8` por `test:role-model`/`test:user-rank` y `test:permission-scope` (permisos, ajeno a esta tarea). Mientras siga así, la CI de estos PR fallará en esos pasos y no llegará al build; el build aislado de cada PR compila.
- **Revisión de Codex:** no pedida.
- **Pendiente de Fabricio:** QA visual en producción tras cada merge y decidir si quiere los datos que la maqueta pinta y la estantería no tiene («Enlace activo» e idiomas por catálogo), que exigen ampliar la consulta.

### Verificación de estilos acotados (2026-10-23, tras el cierre)

`qa-estilos.mjs` (27 comprobaciones, Chromium + fixtures, sobre `fabri/bcp-gestor-compartir`), todas en verde:

- **Errores:** el error del gestor conserva `bg-red-50`/`text-red-800` (rgb 254,242,242 / 153,27,27); el bloqueo de publicación, igual; el error del diálogo «Organizar» (nombre repetido) sigue en `text-red-700`; la validación nativa del título (`required`) sigue activa.
- **Avisos:** «cambios sin guardar» y material que falta en `text-amber-800`; ajustes de fotos obsoletos en `bg-amber-50`/`text-amber-900`; «sin revisión nativa» en `bg-amber-100`. La nota «Qué ve el cliente» queda en fondo suave, no de aviso.
- **Desactivados:** «Publicar» y «Elige un cliente» (acción principal desactivada) con opacidad 0,5.
- **Foco con teclado** (barrido con Tab; cada elemento enfocado debe tener contorno o anillo): estantería (23), diálogo «Organizar» (5), lista de grupos en móvil (3), Compartir (21), Portada y estilo (10), editor de textos (17), pestaña Fotos (4), Idiomas (10), Viviendas (22), menú ⋯ abierto con teclado y diálogo «Grupos» del catálogo (3). Esc cierra el diálogo y devuelve el foco.
- **Vistas previas incrustadas:** la portada de «Portada y estilo» sigue en Playfair (su tipografía propia); los títulos de apartado de la vista organizada siguen en `text-gold-dark` (rgb 168,138,82).
- El mismo sondeo del diálogo «Organizar» en un servidor de fixtures con `main` limpio da el mismo comportamiento (Esc, foco, mensajes de nombre repetido y vacío).

### CI de `main` (diagnóstico, 2026-10-23)

En `main` limpio (`fff110c8`) fallan **5** comprobaciones, no 2 (las pruebas se paran en el primer fallo): `test-role-model` «el detalle explica el alcance…» y, en `test-permission-scope`, «defaultScopes por rol», «excepción Ver 'own' sobre advisor/clientes…», «buildScopeOverrides: envía el conjunto COMPLETO…» e «isLeadAllowedForScope: own ve propios y sin asignar». Las cinco vienen de `42fc5b05` (empujado a `main` sin PR) y `fff110c8` (edición en el VPS). Detalle y decisión pendiente en el resumen entregado a Fabricio. Este rediseño no toca permisos.
