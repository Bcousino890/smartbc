# CRM · Apariencia clara u oscura por persona

Cada persona del equipo puede elegir en el CRM interno una apariencia clara, oscura o la del sistema. Cambia el aspecto, no la estructura: maquetación, tipografía, funciones y permisos siguen igual.

- **Tamaño:** medio (solo interfaz; sin migraciones, datos, permisos ni integraciones).
- **Responsable:** Fabricio
- **Rama base:** `fabri/crm-apariencia` (worktree `wt/crm-apariencia`), con una rama por PR apilada sobre la anterior (ver «Plan»).
- **Estado:** fusionado (#364, #365 y #366, 2026-10-24).

## Especificación

### Contexto (comprobado en `origin/main` `36788970`)

- **No hay ninguna infraestructura de temas.** Ni `darkMode` en [tailwind.config.ts](../../../tailwind.config.ts), ni variantes `dark:`, ni `prefers-color-scheme` en el código de la aplicación.
- El CRM son ~380 archivos (`app/(admin)`, `app/[country]/(admin)`, `components/admin`, `components/ui`, `components/dashboard`, la barra lateral) con ~470 utilidades de color distintas. Casi todo usa la paleta de marca de Tailwind: `text-ink` (~3.650 usos), `border-ink/…`, `bg-white` (~930), `bg-cream-50…` (~270), `gold` (~1.800) y los tonos de estado de Tailwind (`red`, `amber`, `emerald`, `rose`, `blue`…). Hay pocos colores literales: 11 archivos con `bg-[#…]`, ~50 con hex en línea (gráficos, mapas, pastillas).
- **Los pares importan.** La barra lateral ya es oscura (`bg-ink text-cream-50`), los botones principales también (`bg-ink text-cream-50`, 179 usos) y `bg-ink/5` es el relleno suave de los `hover`. Invertir la paleta sin más volvería clara la barra lateral y los botones.
- Preferencias existentes: el idioma vive en `localStorage` (`smartbc.lang`, [lib/i18n/provider.tsx](../../../lib/i18n/provider.tsx)), por navegador y no por usuario. No hay tabla de preferencias de interfaz; no hace falta migración.
- Las dos cáscaras del CRM son [app/(admin)/layout.tsx](../../../app/(admin)/layout.tsx) (legado `/admin`, casi todo redirige) y [app/[country]/(admin)/layout.tsx](../../../app/[country]/(admin)/layout.tsx) (`/es/admin`, `/cl/admin`). Las dos ponen `.crm-root`; el login también.
- Diálogos fuera de su componente: [components/ui/modal.tsx](../../../components/ui/modal.tsx), [groups-modal.tsx](../../../components/admin/catalogs/groups/groups-modal.tsx), [particular-modal.tsx](../../../app/[country]/(admin)/admin/particulares/particular-modal.tsx), el visor de fotos de particulares y el avatar de solicitudes usan `createPortal(…, document.body)`.
- Superficies protegidas: web pública (`/web`), portal del cliente (`(cliente)`), enlaces (`/c`, `/compartir`, `/a`, `/p`), itinerario (`/v`), catálogo del cliente (`/seleccion`), vistas previas y PDF. Dentro del CRM se incrustan la portada del catálogo ([catalog-cover](../../../components/catalogs/catalog-cover.tsx), CSS module con colores propios) y vistas previas de correo en `iframe` (documento aparte). Los PDF se generan en servidor con `@react-pdf` (sin CSS).
- El gestor de catálogos (rediseño aprobado, PR #357–#360) tiene sus propias variables `--st-*` y retoques de utilidades dentro de `StudioRoot` ([studio.module.css](../../../components/admin/catalogs/studio/studio.module.css)).

### Decisiones (encargo de Fabricio, 2026-10-23; no se vuelven a preguntar)

- **D1:** cada persona elige su apariencia con independencia: **Claro**, **Oscuro**, **Según el sistema**. Sin preferencia guardada: el claro actual.
- **D2:** «Según el sistema» sigue los cambios del sistema operativo en vivo.
- **D3:** la preferencia se guarda por usuario con sesión **en ese navegador**. No cambia la de otra persona ni promete sincronizar entre dispositivos. Sin migración.
- **D4:** selector accesible junto a los controles de cuenta e idioma existentes.
- **D5:** dirección visual: fondos carbón cálidos, superficies oscuras distinguibles, texto blanco roto cómodo, dorado contenido. Errores, avisos, éxitos, desactivados y foco claramente distinguibles.
- **D6:** se conservan el rediseño aprobado del catálogo y su tipografía; ni fotos, ni logos, ni gráficos, ni otros medios se invierten u oscurecen globalmente.
- **D7:** alcance = cáscara del CRM interno y sus páginas de personal autorizadas en los dos países (menús, formularios, tablas, diálogos, desplegables, tooltips, notificaciones, carga/error/vacío). Ningún acceso nuevo a módulos.
- **D8:** sin cambios en la web pública, el portal del cliente, los enlaces compartidos, el itinerario, el catálogo del cliente, las vistas previas incrustadas del catálogo ni el PDF.
- **D9:** tokens semánticos con alcance limitado y el stack actual; sin reglas amplias de sustitución de colores ni filtros de página; sin destello claro al reabrir en oscuro; almacenamiento no disponible tratado con elegancia.
- **D10:** fixtures sintéticos aislados; sin credenciales reales, producción, IA real, servicios de pago ni paquetes nuevos. PR pequeños con la CI en verde; Fabricio hace los merges. Sin revisión de Codex.

### Decisiones de implementación (Claude, sin efecto de producto)

- **I1 · Alcance del tema = atributo en `<html>`.** El oscuro se activa con `html[data-crm-theme="dark"]`. Solo lo ponen las dos cáscaras del CRM (guion previo a la pintura + componente cliente que lo quita al desmontarse con `useLayoutEffect`). Así los diálogos pintados en `<body>` heredan el tema sin tocarlos, y ninguna página pública ni el login lo reciben nunca (no montan esa cáscara). Al navegar del CRM a una página pública dentro de la misma pestaña, el atributo se quita antes de pintar.
- **I2 · Tokens por papel, con el claro como respaldo.** Las utilidades de color del CRM se resuelven así: `rgb(var(--crm-bg-ink, 10 10 10) / α)`. El valor de respaldo es el color de hoy; **las variables solo se definen dentro de `html[data-crm-theme="dark"]`** (y solo en pantalla, `@media screen`). Fuera de ese alcance la utilidad da exactamente el mismo color que antes: la web pública, el portal y el CRM en claro compilan a los mismos colores calculados. No hay selectores sobre nombres de clase, ni `!important`, ni filtros.
- **I3 · Tres familias por papel.** El mismo nombre de color puede significar cosas distintas según dónde se use, así que cada papel lee su propia familia de tokens: **fondo** (`bg-*`, degradados), **contenido** (`text-*`, `fill`, `stroke`, `placeholder`, `caret`, `decoration`, `accent`) y **línea** (`border-*`, `divide-*`, `ring-*`, `outline-*`). Ejemplos en oscuro: `text-ink` → texto blanco roto; `bg-ink` (barra lateral, botones) → carbón profundo; `bg-ink/5` (hover) → velo claro; `bg-white` → superficie; `text-white` y `text-cream-*` (siempre sobre fondos oscuros o fotos) → sin cambio; `bg-red-50` → tinte rojo oscuro; `text-red-700` → rojo claro legible; `border-red-200` → línea roja oscura.
- **I4 · Semántica explícita para los neutros de marca.** En oscuro: `--crm-canvas` (lienzo, `cream-50`), `--crm-surface` (tarjeta, `white`), `--crm-surface-2/3` (`cream-100/200`), `--crm-deep` (`bg-ink`), `--crm-fg` (`text-ink`), `--crm-accent` (`gold`) y `--crm-accent-text` (`gold-dark` como texto). Los tonos de estado (rojo, ámbar, esmeralda, azul…) usan rampas tonales por papel calculadas a partir de la paleta de Tailwind y mezcladas con el carbón del lienzo; los grises (`gray`, `stone`, `slate`…) se llevan a la rampa cálida.
- **I5 · Transparencia.** En los neutros que hacen de «papel» o de «tinta» la opacidad cambia el significado: `bg-white/10` o `bg-cream-50/8` son velos claros sobre fondos oscuros (barra lateral, fotos) y se quedan como están; `bg-white/70` o `bg-cream-50/85` son paneles y pasan a superficie oscura. Umbral: α < 0,35 = velo. Lo mismo para `bg-ink/5` (velo) frente a `bg-ink/80` (fondo profundo).
- **I6 · Colores fijos para las excepciones.** `fixed-ink`, `fixed-white` (`text-fixed-ink`…) no cambian nunca. Se usan solo donde un par queda descompensado (texto tinta sobre dorado sólido, texto sobre foto).
- **I7 · Frontera clara.** `.crm-theme-light` anula los tokens de su árbol (`--…: initial`) y fija `color-scheme: light`. Envuelve lo protegido incrustado en el CRM: portadas de catálogo y cualquier vista previa de superficie pública.
- **I8 · Gestor de catálogos.** Sus variables `--st-*` y sus retoques de utilidades reciben valores oscuros dentro del mismo alcance; estructura y tipografía (Unbounded/Roboto) intactas.
- **I9 · Preferencia.** `localStorage["smartbc.crm.appearance.v1:<id de usuario>"]` = `light | dark | system`. Sin valor o con valor desconocido: claro. Si el almacenamiento falla (privado, bloqueado, cuota), la elección vale para la página abierta y no se rompe nada. Las pestañas del mismo usuario se sincronizan con el evento `storage`. Otro usuario en el mismo navegador tiene su propia clave.
- **I10 · Sin destello.** Un guion en línea, al principio de la cáscara del CRM, lee la clave del usuario (el id lo pone el servidor) y aplica el atributo antes de pintar. `<html>` lleva `suppressHydrationWarning` (solo afecta a sus propios atributos).
- **I11 · Selector.** En la tarjeta de cuenta de la barra lateral (visible en todas las páginas del CRM, escritorio y cajón móvil), encima de «Cerrar sesión»: un `<select>` nativo con etiqueta «Apariencia» y las opciones «Claro», «Oscuro», «Según el sistema» (teclado, lector de pantalla y selector nativo en móvil sin código propio). Textos en los cuatro idiomas del diccionario.
- **I12 · Impresión.** Los tokens oscuros solo aplican en pantalla: imprimir una página del CRM sale en claro.

### Alcance

1. Motor: familias de tokens en Tailwind, valores oscuros, alcance, frontera, colores fijos, preferencia por usuario, guion previo, proveedor.
2. Superficies: cáscaras (fondos con degradado), barra lateral, primitivas `components/ui` (modal, toast, card, button, skeleton, empty-state, pagination, stat-card), selector de idioma, campana de notificaciones.
3. Módulos: excepciones por pares (texto sobre dorado o foto), colores literales, gráficos (`recharts`), controles de mapas, gestor de catálogos, portadas incrustadas, vistas previas.
4. Selector de apariencia e idiomas.

### Fuera de alcance

- Web pública, portal del cliente, enlaces, itinerario, catálogo del cliente, vistas previas incrustadas, PDF, login (sin sesión no hay usuario al que guardar nada: sigue en claro).
- Sincronizar entre dispositivos, guardar en base de datos, migraciones.
- Cambios de maquetación, tipografía, textos (salvo los del selector), permisos o funciones.
- Teselas de mapas, fotos, logos, vídeos e `iframe` de terceros: se muestran como son.
- Correos HTML en vista previa (`iframe` con su propio documento): se ven como los recibirá el cliente.

### Criterios de aceptación

| ID | Criterio |
| --- | --- |
| AC1 | Selector «Apariencia» con «Claro», «Oscuro», «Según el sistema», accesible con teclado y lector de pantalla, en escritorio y en el cajón móvil. |
| AC2 | Sin preferencia guardada el CRM se ve exactamente como hoy (mismos colores calculados). |
| AC3 | «Oscuro» se mantiene al recargar y al navegar entre secciones y países, sin destello claro al reabrir. |
| AC4 | «Según el sistema» cambia en vivo al cambiar el sistema operativo. |
| AC5 | Dos usuarios en el mismo navegador conservan cada uno su elección. |
| AC6 | Con el almacenamiento bloqueado el CRM abre en claro, el selector funciona en la página y no hay errores. |
| AC7 | En oscuro: fondos carbón cálidos, superficies distinguibles, texto blanco roto, dorado contenido; errores, avisos, éxitos, desactivados y foco distinguibles; contraste de texto operativo ≥ 4,5:1 en las combinaciones principales. |
| AC8 | Menús, formularios largos, tablas, diálogos (también los pintados en `<body>`), desplegables, tooltips, notificaciones y estados de carga/error/vacío se ven bien en los dos temas, en escritorio (1440) y móvil (390). |
| AC9 | Fotos, logos, gráficos, mapas y medios no se invierten ni se oscurecen. Los gráficos siguen legibles. |
| AC10 | Superficies protegidas (web pública, portal, enlaces, itinerario, catálogo del cliente, portadas incrustadas, PDF) sin cambios aunque el CRM esté en oscuro en esa pestaña. |
| AC11 | Permisos: el selector no añade módulos ni rutas; la barra lateral sigue mostrando solo lo que el rol puede ver. |
| AC12 | `tsc`, pruebas de la CI, `test:typography` (sin violaciones nuevas) y `next build` aislado en verde. |

### Impacto en datos y despliegue

Sin migraciones, datos, permisos ni integraciones. La preferencia vive en el navegador. Un merge a `main` despliega en el VPS (y puede llevar commits de otros que estén en `main`).

## Plan

### Base

`origin/main` = `3678897010314a3817567e165c7a9cd668ae880b` (comprobado con `git ls-remote origin refs/heads/main` el 2026-10-23).

### Pasos de entorno

1. Worktree `wt/crm-apariencia` desde ese SHA; `node_modules` enlazado al del repo principal (sin instalar nada).
2. QA local sin sistemas reales: `next dev` en `127.0.0.1` con un **Supabase falso** en `127.0.0.1` (servidor HTTP del scratchpad de la sesión, filas sintéticas, sesiones sintéticas de dos usuarios), sin `.env`, claves ficticias. Mismas garantías que [scripts/dev-fixtures.sh](../../../scripts/dev-fixtures.sh); no se versiona. Playwright/Chromium ya instalados.
3. Build aislado como en los expedientes anteriores: `git archive` del commit al scratchpad, sin `.env.production`, `node_modules` enlazado, `NEXT_BUILD_DIR=.next.qa`.

### PR y tareas

**PR1 · Motor del tema** (`fabri/crm-apariencia` → `main`). Sin cambio visible: no hay selector.
- T1 · `lib/theme/crm-palette.mjs`: familias, rampas y valores oscuros (puro, probado); plugin de Tailwind que emite el bloque oscuro y la frontera; `tailwind.config.ts` con las familias por papel y los colores fijos.
- T2 · `lib/theme/crm-appearance.ts`: clave por usuario, lectura/escritura tolerantes, resolución `system`; guion previo; `CrmThemeScope` (aplica, escucha `matchMedia` y `storage`, limpia al desmontar); montado en las dos cáscaras; `suppressHydrationWarning` en `<html>`.
- T3 · `npm run test:crm-appearance` (prueba de la lógica pura) añadido a la CI.
- Verificación: CSS compilado — mismos colores calculados en claro (comparación automática de computed styles en páginas del CRM, públicas y de fixtures); tema oscuro activable desde `localStorage` en QA.

**PR2 · Superficies y módulos** (`fabri/crm-apariencia-superficies`, sobre PR1).
- T4 · Cáscaras, barra lateral, primitivas `components/ui`, idioma, campana.
- T5 · Pares descompensados y colores literales por módulo (inventario), gráficos, mapas, gestor, portadas con frontera clara.
- Verificación: recorrido de todas las páginas del inventario con fixtures en claro y oscuro, escritorio y móvil; contraste medido; superficies protegidas sin cambios.

**PR3 · Selector** (`fabri/crm-apariencia-selector`, sobre PR2).
- T6 · Selector en la tarjeta de cuenta, textos en cuatro idiomas.
- Verificación: AC1–AC6, AC11 en navegador (persistencia, dos usuarios, sistema en vivo, almacenamiento bloqueado, navegación entre secciones y países, sin destello); capturas antes/después.

**Cierre de cada PR:** sección «Resultado», capturas en `capturas/`, push, PR y parada antes del merge. La CI solo corre en PR contra `main`: PR2 y PR3 llevan las comprobaciones de la CI ejecutadas en local hasta que se reapunten.

### Aprobación

Encargo de Fabricio del 2026-10-23: alcance y decisiones D1–D10 aprobados; pide registrar especificación, plan e inventario antes de programar y ejecutar en PR pequeños sin reabrir decisiones. Paradas: antes de cada merge, y si aparece un bloqueo que exija dependencia nueva, migración o cambio de comportamiento.

## Resultado

QA local con un Supabase falso en `127.0.0.1` (sesiones sintéticas de dos usuarios del equipo y una clienta, filas inventadas para las tablas que piden las páginas, fotos SVG generadas); `next dev` sin `.env` y con claves ficticias. Ninguna llamada a producción, IA ni servicios de pago. Los guiones de QA viven en el scratchpad de la sesión (no se versionan).

### PR1 · Motor del tema (`fabri/crm-apariencia`)

| Comprobación | Resultado |
| --- | --- |
| `npm run test:crm-appearance` | En verde: preferencia por usuario, almacenamiento roto o ausente, guion previo (mismas reglas que `resolveTheme`, `<` escapado), 4.608 combinaciones utilidad·opacidad con el color de siempre como respaldo, cada variable usada tiene valor oscuro, contrastes del oscuro. |
| Colores calculados en claro (Tailwind compilado de `main` y de la rama, cada clase medida en Chromium sin el atributo) | 1.650 de 1.650 clases idénticas, más las 3 renombradas (degradados de la cáscara) idénticas a su versión anterior. Es la prueba de que la web pública, el portal y el CRM en claro no cambian. |
| Capturas en claro antes/después (51 pantallas del CRM comparadas píxel a píxel) | 25 idénticas. Las distintas que se revisaron (calendario, agencias) cambian por contenido que depende de la hora: el «hoy» del calendario y los «hace N min» cambiaron de día entre una pasada y otra. Por eso la prueba de identidad que vale es la de colores calculados, no la de píxeles. |
| `npx tsc --noEmit` | Sin errores. |
| `npm run test:typography` | Las mismas 21 violaciones que `main` (preexistentes), ninguna nueva. |

Sin selector: nadie puede activar el oscuro con este PR solo.

### PR2 · Superficies y módulos (`fabri/crm-apariencia-superficies`)

Cambios: texto tinta sobre dorado sólido → `text-fixed-ink` (23 sitios); dorado de texto `#856329` como token `gold-text`; gráficos (`recharts`) con rejilla, ejes y tooltip según el tema (`useThemed`, series intactas); variables `--st-*` del gestor con valores oscuros; portadas incrustadas dentro de `.crm-theme-light`; el «velo claro» queda solo para `white` y `cream-50` (el panel `bg-cream-100/30` de Solicitudes salía gris en la primera pasada).

| Comprobación | Resultado |
| --- | --- |
| Colores calculados en claro (como en PR1) | 1.651 de 1.651 clases idénticas y las 6 renombradas (`text-fixed-ink`, `text-gold-text`, `decoration-gold-text` y los degradados) idénticas a su versión anterior. |
| Recorrido en oscuro: 37 rutas × escritorio y móvil (74 capturas) | Todas las secciones del inventario en los dos países con datos sintéticos. Fondos carbón, superficies distinguibles, texto blanco roto; avisos, errores y éxitos con su tono; barra lateral oscura igual que en claro. |
| Gestor de catálogos (páginas de fixtures; 7 pantallas × claro/oscuro × escritorio/móvil) | Estantería, Viviendas, Textos y fotos, Portada y estilo, Idiomas y Compartir en oscuro con Unbounded/Roboto intactas; la portada incrustada no cambia. |
| Estados interactivos (11 escenarios × claro/oscuro × escritorio/móvil) | Diálogo «Nuevo cliente» (se pinta en `<body>`), «Nueva visita», cajón de permisos, menú ⋯, desplegable de idioma, notificaciones, panel de filtros, solicitud abierta y foco de teclado: todos en oscuro. |
| Gráficos | Analytics (líneas y tarta) y precio de particulares legibles en oscuro, series con sus colores. |
| `npx tsc --noEmit`, `npm run test:crm-appearance`, `npm run test:typography` | En verde; tipografía con las mismas 21 violaciones previas. |

Capturas (antes en claro de `main` · después en oscuro): [dashboard](capturas/dashboard.png), [propiedades](capturas/propiedades.png), [ficha de propiedad](capturas/ficha-propiedad.png), [clientes](capturas/clientes.png), [ficha de cliente](capturas/ficha-cliente.png), [particulares](capturas/particulares.png), [calendario](capturas/calendario.png), [analytics](capturas/analytics-graficos.png), [sindicación](capturas/sindicacion.png), [captación Chile](capturas/chile-captacion.png), [propiedades en móvil](capturas/propiedades-movil.png), [diálogo](capturas/dialogo-nuevo-cliente.png), [solicitud abierta](capturas/solicitud-abierta.png), [permisos](capturas/permisos-usuario.png), [notificaciones](capturas/notificaciones.png), [menú y foco](capturas/menu-y-foco.png), [gestor · viviendas](capturas/gestor-viviendas.png), [gestor · portada](capturas/gestor-portada.png), [gestor · compartir](capturas/gestor-compartir.png).

**Lo que no se ha visto con datos, dicho tal cual:**
- `mi-espacio/textos-aprobados` y `plantillas-zona`: en el entorno de QA dan error de servidor también en `main` (una acción del servidor pasada a un componente cliente con el Supabase falso). Sus componentes usan las mismas utilidades que el resto del gestor, pero no hay captura.
- Correo con buzón conectado, chat de WhatsApp con mensajes y `particulares/scraper` (el mapa de zonas propio, con su lienzo claro `#fbf9f4`, se deja como mapa): no hay datos sintéticos para ellos; vistos solo vacíos o sin acceso.
- La ficha de propiedad en oscuro se capturó antes de que cargaran las teselas del mapa (teselas de OpenStreetMap: se muestran tal cual).
- Las capturas son de `next dev`: abajo a la izquierda se ve el distintivo de Next.

### PR3 · Selector (`fabri/crm-apariencia-selector`)

`<select>` nativo «Apariencia» (Claro / Oscuro / Según el sistema; es, en, fr, de) en la tarjeta de cuenta de la barra lateral, encima de «Cerrar sesión»; también en el cajón móvil.

| Comprobación (Chromium, servidor de QA) | Resultado |
| --- | --- |
| `qa-selector`: 34 comprobaciones, escritorio y móvil | Todas en verde: etiqueta accesible y tres opciones; sin preferencia = claro; «Oscuro» se aplica al momento y se guarda para ese usuario; al recargar el oscuro ya está puesto antes de que aparezca el primer `<main>` (sin destello); sigue al navegar a otra sección y al cambiar de España a Chile; al salir a `/login` en la misma pestaña se quita; «Según el sistema» sigue al sistema en vivo (oscuro → claro → oscuro); otro usuario en el mismo navegador abre en claro y su elección no toca la del primero (una clave por usuario); `/login`, `/seleccion/…` y el portal del cliente (`/inicio`) no reciben el tema aunque haya oscuro guardado; con el almacenamiento bloqueado abre en claro, el selector funciona en la página y avisa de que no se guarda; se alcanza con Tab; sin errores de página. |
| Permisos | El selector no añade enlaces ni rutas: el diff de la barra lateral es una línea (`<AppearanceSelect />`) y la lista de módulos sigue saliendo de `visibleItems`. |
| Pasos de la CI en local sobre este commit (todos los `npm run` de `ci.yml` salvo `build`, más `tsc` y `lint-migrations`) | 33 de 33 en verde. |
| Build aislado (`git archive`, sin `.env.production`, `NEXT_BUILD_DIR=.next.qa`) | Compila (153 páginas) en PR2 y en PR3. El de PR3 falló una vez en el cargador de `next/font` de Google (`loader.js:122`, en `studio/fonts.ts`, que este trabajo no toca; fallo intermitente ya conocido) y compiló al repetir. |
| `npm run test:typography` | Las mismas 21 violaciones previas. |

Capturas: [selector en escritorio y con almacenamiento bloqueado](capturas/selector-escritorio.png), [selector en el cajón móvil](capturas/selector-movil.png).

Sin revisión de Codex (no pedida).

### Cierre

| PR | Rama | Merge en `main` | CI en `main` |
| --- | --- | --- | --- |
| #364 · motor del tema | `fabri/crm-apariencia` | `9a25173b` | en verde |
| #365 · superficies y módulos | `fabri/crm-apariencia-superficies` | `4eceef63` | en verde |
| #366 · selector | `fabri/crm-apariencia-selector` | `e9b8718b` | en verde (build incluido) |

Fusionados por Fabricio el 2026-10-24. Tras fusionar cada PR, el siguiente se actualizó con un merge de `main` (sin reescribir historia) y se reapuntó a `main` antes de su CI; en #366 hizo falta un commit vacío (`c5f9d948`) para que la CI arrancara tras el cambio de base. No se ha comprobado el despliegue en el VPS (fuera del alcance de los agentes, política P-1).

Sigue pendiente lo listado como no visto con datos en «Resultado · PR2» (textos aprobados y plantillas de zona, correo con buzón conectado, chat de WhatsApp con mensajes, mapa de zonas del scraper), por si Fabricio quiere revisarlo con datos reales.
