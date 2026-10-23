# Inventario de controles y mapa al diseño nuevo

Inventario hecho sobre `origin/main` `fff110c8` antes de editar (2026-10-23). Cada fila es una función que existe hoy, dónde está y dónde queda. «Igual» = mismo componente y misma lógica; solo cambia el marco o el estilo. Nada se elimina (D11). La columna PR dice en qué PR cambia su presentación.

## «Mi espacio» (HOME)

| Función hoy | Dónde está hoy | Dónde queda | PR |
| --- | --- | --- | --- |
| Título «Mi espacio» + subtítulo, campana de avisos, selector de idioma del CRM | `AdminPageHeader` en `mi-espacio/page.tsx` | Cabecera compacta: «Mi espacio / Catálogos» + campana + idioma (mismos componentes `NotificationsBell`, `LanguageSwitcher`); el subtítulo pasa a la frase bajo «Catálogos» | 1 |
| Accesos: Clientes, Propiedades, Solicitudes | `HomeView`, arriba | Fila compacta «Accesos» **debajo** de la estantería (mismos enlaces) | 1 |
| Módulos: Catálogos (tarjeta informativa), Textos aprobados, Plantillas de zona | `HomeView`, arriba | «Biblioteca: Textos aprobados · Plantillas de zona» (mismos enlaces y `data-testid`) bajo el título; la tarjeta «Catálogos» la sustituye el propio título de la sección | 1 |
| «Próximos módulos · Se definirán uno a uno» | `HomeView` | Se retira: es un rótulo sin función, sin enlace ni acción | 1 |
| Recuento «N activos · M en total» / «Todavía no hay catálogos» | `HomeCatalogs` | Bajo el título «Catálogos» | 1 |
| Organizar grupos (panel) | Botón «Organizar» | Igual, botón secundario junto a «Nuevo catálogo» | 1 |
| Nuevo catálogo (formulario: título, introducción, contacto precargado, grupo actual) | `NewCatalogForm` | Igual, acción principal | 1 |
| Grupos: Todas, Sin organizar, grupos, subgrupos, recuentos, «Más grupos», lista móvil | `GroupSelector` | Igual (estilo de pestañas suaves de la referencia) | 1 |
| Grupo en la URL (`?grupo=`), recordado por dueño y país, corrección si el grupo desaparece | `HomeCatalogs` | Igual, sin tocar la lógica | — |
| Búsqueda por título o anuncio | Fila de filtros | Junto a los grupos, siempre visible | 1 |
| Anuncio de origen, zona de los criterios, operación, modo (manual/automático), estado | Fila de filtros siempre visible | Panel «Filtros» (desplegable); cada filtro no predeterminado se ve como etiqueta quitable; el estado se ve siempre en «Mostrando …» | 1 |
| Recuento «N de M» | Fila de filtros | «Mostrando … · N de M catálogos» (`data-testid="shelf-count"`) | 1 |
| Vacíos: sin catálogos / grupo vacío / sin coincidencias | `HomeCatalogs`, `CatalogShelf` | Igual (mismos textos y `data-testid`) | 1 |
| Tarjeta: portada, título, estado, modo, nº de propiedades, resumen de criterios, anuncios de origen, fecha, «Gestionar» | `CatalogShelf` (portadas grandes) | Fila editorial: portada compacta, estado, título (Unbounded), «N viviendas · modo», criterios, grupos, anuncios, fecha; «Abrir catálogo» y «Compartir» (enlace a `?seccion=compartir`) | 1 |
| Grupos de una tarjeta (etiquetas + botón «Grupos») y diálogo de asignación | `CatalogShelf`, `CatalogGroupsDialog` | Igual, en la fila | 1 |
| Archivados atenuados | `CatalogShelf` | Igual; además «Ver archivo» cambia el filtro de estado a «Archivados» cuando hay archivados ocultos | 1 |

## Cabecera del catálogo y pestañas

| Función hoy | Dónde está hoy | Dónde queda | PR |
| --- | --- | --- | --- |
| Título grande «CATÁLOGO / título» | `catalogos/[id]/page.tsx` | Se sustituye por el título de la cabecera compacta (un solo título) | 2 |
| Volver a «Mi espacio» | `ManagerHeader` | Igual (enlace «Mi espacio» como migas); vuelve a `basePath`, y la HOME restaura el grupo recordado | 2 |
| Vista previa (enlace activo en otra pestaña; sin enlace → Compartir con el motivo) | `ManagerHeader` | Igual | 2 |
| Compartir (cambia de sección) | `ManagerHeader` | Igual, acción principal | 2 |
| Menú ⋯: Archivar/Reactivar, Descargar PDF, Grupos… | `ManagerHeader` | Igual | 2 |
| Estado, «Automático (antiguo)», nº de viviendas, estado del enlace | `ManagerHeader` | Línea de estado bajo el título | 2 |
| «Cambios sin guardar (N)» con lista que lleva a cada sitio | `ManagerHeader` | Igual, en la línea de estado | 2 |
| Cabecera fija en escritorio con el título al desplazarse | `ManagerHeader` | Igual | 2 |
| Aviso «Tienes cambios sin guardar de antes…» | `CatalogManager` | Igual | 2 |
| Pestañas con `?seccion=`, `pushState`, teclado, punto de cambios | `SectionTabs`, `useManagerUrl` | Etiquetas D5, orden D5 (I5), mismos `id`, mismas URL | 2 |
| Mensajes del gestor (ok/error) junto a las acciones | `CatalogManager` | Igual | — |
| Modo medición (`?medir=1`) | `MeasurePanel` en Compartir | Igual | — |

## Viviendas

| Función hoy | Dónde | Dónde queda | PR |
| --- | --- | --- | --- |
| Lista ordenada, subir/bajar, quitar, abrir panel de la vivienda, avisos por fila | `HomesSection` | Igual, dentro del marco de la sección | 2 |
| Operación del catálogo | `HomesSection` (barra) | Igual | 2 |
| Buscar y añadir (buscador nuevo con filtros), añadir por referencia BC, importar desde enlace o PDF | `CatalogSearch`, formulario de referencia | Igual | 2 |
| Automáticos antiguos: criterios, conversión, inclusiones/exclusiones, «Cómo funciona», excluidas, inclusiones no disponibles | `ConversionPanel`, `SelectionPanel`, `HomesSection` | Igual | 2 |
| Panel lateral (precio, motivo, ajustes, «Editar texto») | `HomesSection` + `SidePanel` | Igual; «Editar texto» lleva a «Textos y fotos» | 2 |

## Textos y fotos (antes «Contenido»)

| Función hoy | Dónde | Dónde queda | PR |
| --- | --- | --- | --- |
| Filtros por estado (Todas, Por revisar, Borradores, Publicados, Sin texto propio, Sin descripción, Cambios sin guardar) con recuentos | `ContentSection` | Igual (mismos filtros y `data-testid`), estilo de pestañas suaves | 3 |
| Búsqueda por título o referencia | `ContentSection` | Igual | 3 |
| Fila: referencia, título publicado / de la ficha, «Qué ve el cliente · Por qué», estado del texto, material, «Cambios sin guardar» | `ContentSection` | Fila editorial; el estado sin texto propio dice qué ve el cliente (descripción de la ficha / historia) sin tono de error (D9); material que falta y «revisar» siguen en ámbar | 3 |
| Textos en reserva, borradores de viviendas que ya no están (copiar/descartar) | `ContentSection` | Igual | 3 |
| Aviso N5 de idiomas con viviendas en preparación + «Ir a Idiomas» | `CatalogManager` | Igual | 3 |
| Un editor abierto; anterior/siguiente; Esc; volver con el foco a la fila; pantalla propia en móvil | `SidePanel` | Igual, con cabecera «Editar vivienda» | 3 |
| Fotos en este catálogo: elegir apertura, excluir, «sin acabado», aviso de ajustes obsoletos, última foto no excluible | `CatalogPhotosBlock` | Pestaña interna «Fotos» del editor (montada siempre, I7) | 3 |
| Título, descripción, vista organizada, zona, plantilla «Vivir en…», más opciones (entrada, puntos), texto aprobado (usar, aprobar, retirar), IA (preparar, borrador, cancelar, propuesta no aplicada), avisos y bloqueos, retirar, borrar, historia de la ficha | `TextEditor` y bloques | Pestaña interna «Título y descripción» (mismo `TextEditor`) | 3 |
| Guardar borrador / Publicar / «Guardar como texto aprobado» (desmarcada) / estados de guardado | `TextEditor` (pie fijo) | Igual, pie fijo del editor | 3 |
| Conflicto de borrador (descartar / mantener los míos), edición durante el guardado, texto no vigente | `TextEditor` | Igual | 3 |

## Portada y estilo (antes «Diseño»)

| Función hoy | Dónde | Dónde queda | PR |
| --- | --- | --- | --- |
| Título e introducción con «Guardar», conflicto, cambios sin guardar | `DesignSection` | Igual, panel «Portada y presentación» | 2 |
| Vivienda y foto de portada con respaldos, avisos y descarte de la elección pendiente | `CoverPicker` | Igual | 2 |
| Acabado fotográfico (al pulsar) | `DesignSection` | Igual | 2 |
| Vista previa de la portada y «Abrir la vista previa completa» | `DesignSection` | Igual, panel lateral | 2 |

## Idiomas

| Función hoy | Dónde | Dónde queda | PR |
| --- | --- | --- | --- |
| Idioma del catálogo (8 idiomas), aviso de revisión nativa, nota automática, progreso por idioma | `LanguagesSection` | Igual, panel «Idiomas del catálogo» | 4 |
| Idioma por enlace personal | `LanguagesSection` (`LinkLang`) | Igual | 4 |
| Traducciones (opcional): elegir idioma, coste, preparar ahora, filas con estado, revisar, editar, marcar revisada, bloqueos, avisos, desactualizadas, último intento | `LanguagesSection` | Igual | 4 |

## Compartir

| Función hoy | Dónde | Dónde queda | PR |
| --- | --- | --- | --- |
| Asignar a cliente: buscar cliente, duración, crear enlace personal, lista con copiar, renovar, revocar, opiniones | `ClientLinksPanel` | Bloque «Para un cliente · Enlace personal» | 4 |
| Enlace general: crear, duración, copiar, renovar, revocar, caducidad | `SharePanel` | Bloque «Enlace general» | 4 |
| Idioma del enlace general | `ShareSection` | Dentro de «Enlace general» | 4 |
| Contacto que ve el cliente (nombre, teléfono, rol, guardar, conflicto) | `ShareSection` | Fila «Contacto que verá el cliente» | 4 |
| PDF (descargar, ocupado, mensaje, aviso de cambios sin guardar) | `ShareSection` | Fila «PDF del catálogo» | 4 |
| Anuncios de origen (organización interna) | `AdsPanel` plegado | Igual, plegado al final | 4 |
| Aviso «sin enlace / caducado / archivado» al pedir vista previa | `ShareSection` | Igual, arriba | 4 |
| Medición (`?medir=1`) | `MeasurePanel` | Igual | — |
