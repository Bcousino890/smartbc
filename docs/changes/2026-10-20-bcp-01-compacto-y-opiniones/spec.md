# BCP-01 · Lector compacto, título y descripción por catálogo, y opiniones de clientes: especificación

**Fecha:** 20 de octubre de 2026. **Tamaño:** grande (dos migraciones, dos PR dependientes). **Estado:** decisiones de Fabricio registradas; se ejecuta dentro de la autorización coordinada del encargo, sin pedir aprobaciones generales para tareas ordinarias. **Fabricio hace los merges y la QA visual y en producción.** La aprobación visual de la enmienda anterior (#338) no cubre este resultado.

## Contexto comprobado en `main` (dc009960)

- **Lector** (#338): cada vivienda tiene apertura, de 0 a 3 dobles páginas de recorrido (`journey-layout.ts`) y un detalle. En una columna, una hoja continua.
- **Textos del catálogo** (0197): borrador y publicado con texto, entrada y puntos. **No existe título por catálogo**: el título público sale de `properties.title` en `catalog_item_json`. El único campo «Título» del gestor es el del catálogo (Diseño, `catalog_update_meta`), que guarda bien. Publicar exige texto o entrada (`text_empty`), así que un título solo no se podría publicar aunque existiera. El texto publicado solo se ve si la huella de la ficha no cambió (regla C2).
- **IA**: `prepareFromSource` y `draftFromFacts` con el proveedor de Configuración → IA (DeepSeek), inyectada; las pruebas usan IA falsa.
- **Enlaces**: `catalog_shares` admite **un solo enlace activo por catálogo** (índice único). No hay relación entre catálogos y clientes.
- **Clientes**: filas de `profiles` con `role = 'client'`; asesor responsable en `profiles.assigned_advisor_id`. Permisos: recurso `clientes` con alcance `all | own` (`canActOnClient`, `resolveViewScope`, `getAssignedClientIds`).
- **Avisos internos**: existe `crm_notifications` (0050), escrita hoy solo por Captaciones; la campana del encabezado (`notifications-bell.tsx`) muestra avisos calculados (visitas y mensajes).
- **Migraciones**: la última en `main` es 0216; ningún PR abierto usa 0217 ni 0218.

## Decisiones (DC1–DC20)

| | Decisión |
| --- | --- |
| **DC1** | **Exactamente dos pantallas por vivienda** en el lector, en doble composición y en una columna: **1 · Apertura** (foto de apertura grande, título del catálogo, operación, precio, datos clave, miniaturas y acceso a la galería completa elegible) y **2 · Detalle** (título, ficha técnica, características verificadas y la descripción completa del catálogo). Las dos composiciones son las de las capturas de Fabricio y conservan la identidad del itinerario (#338). |
| **DC2** | Se retiran las pantallas de recorrido/historia para **todas** las viviendas, sea cual sea su fuente de texto. Las historias guardadas **no se borran** (siguen en `property_story_*` y en la instantánea); cambiar la presentación no autoriza borrar contenido. |
| **DC3** | **Una sola descripción por vivienda**, con la prioridad aprobada en C2 (texto publicado del catálogo → historia aprobada vigente → descripción limpia vigente → nada). Con historia, la descripción son su entrada y sus capítulos, con sus títulos, en la misma pantalla 2. No se repite la descripción limpia debajo de una historia. Las entradas y puntos antiguos no se pierden: la entrada publicada abre la descripción y los puntos ya están entre las características. |
| **DC4** | Los textos largos se leen **desplazándose dentro de la pantalla 2**, con la señal «Sigue leyendo ↓» en su banda; sin páginas extra, sin encoger la letra por debajo de los mínimos (15 px el texto) y sin recortar. Sin descripción: la pantalla 2 muestra la ficha técnica y las características. |
| **DC5** | **Título y descripción propios del catálogo** como copia principal editable, con borrador y publicado. Título vacío = el de la ficha. No modifican la ficha del CRM ni otro catálogo. |
| **DC6** | **El título publicado no depende de la huella de la ficha**: una sincronización o edición de la ficha no lo retira. El texto publicado conserva la regla C2 (deja de verse si la fuente cambia y la gestión lo marca para revisar). |
| **DC7** | Basta un título para guardar y publicar; la entrada y los puntos dejan de ser necesarios y quedan plegados en «Más opciones» (se conservan; nada se borra). Contacto, URL o precio bloquean también en el título. |
| **DC8** | IA solo al pulsar, con el DeepSeek configurado: «Borrador con IA» propone **título y descripción**; «Preparar desde la ficha» propone la descripción limpia. Son propuestas que se revisan y editan antes de guardar y publicar; nunca inventan hechos (mismas reglas y avisos). Los agentes usan IA simulada. |
| **DC9** | **PDF**: misma identidad, hilo y protecciones. Estructura compacta por vivienda: apertura (foto, título, operación, precio, datos), «La vivienda en detalle» (características y la descripción completa, una sola vez) y «Más fotos». Contenido completo; sin límite de dos hojas; sin secciones de historia repetidas. Las fotos siguen la regla P2: la apertura y hasta 6 más de la galería, en su orden, sin repetir ni incluir excluidas. |
| **DC10** | **Asignar un catálogo a clientes existentes del CRM**: el mismo catálogo reutilizable, un **enlace personal por cliente**, sin inicio de sesión. Flujo «Asignar a cliente» en Compartir. |
| **DC11** | El enlace personal identifica **la asignación**, no a una persona autenticada: quien lo reciba reenviado puede opinar por él (aceptado por Fabricio). El enlace general **nunca** atribuye opiniones a un cliente. |
| **DC12** | **Opinión por vivienda**: 1–5 estrellas (obligatorio) y comentario opcional (hasta 1.000 caracteres), editable por el cliente. Se guarda por asignación y **por la identidad estable de la vivienda** (`property_id`, resuelto en el servidor desde la clave pública), nunca por página ni posición. |
| **DC13** | El servidor decide token → asignación → cliente → vivienda. Nunca se acepta una identidad de cliente enviada por el navegador. Caducidad y revocación se comprueban **en cada escritura**. |
| **DC14** | Reintentos idempotentes: una opinión igual a la guardada no escribe ni avisa. Valoración y comentario se validan en el servidor y en SQL. El lector solo dice «Guardado» cuando la escritura se confirmó. |
| **DC15** | Reordenar no afecta a las opiniones (van por vivienda). Una vivienda que sale del catálogo **conserva su opinión** como histórico: no se puede editar desde el enlace y la ficha del cliente la muestra con «ya no está en el catálogo». Nada se borra en silencio. |
| **DC16** | La **ficha del cliente** muestra sus opiniones con la vivienda (título del catálogo en el momento de opinar), el catálogo, la valoración, el comentario y la fecha, y sus enlaces personales. Se rige por los permisos existentes (`clientes` · ver, con alcance); la HOME sigue privada (el enlace al gestor solo aparece para su dueño). |
| **DC17** | **Aviso interno** al asesor responsable (`assigned_advisor_id`) en `crm_notifications`; sin asesor, al dueño del catálogo. Uno por cambio real; si ya hay uno sin leer de la misma opinión, se actualiza en vez de duplicarse. Se ve en la campana del CRM. **Sin correo ni WhatsApp automáticos.** El contador de Captaciones no cuenta estos avisos. |
| **DC18** | Las opiniones están separadas de la nota del agente, del contenido editorial, de la huella pública y del PDF. No reutilizan las tablas del itinerario. Los datos públicos no exponen nombres, ids ni comentarios de otros clientes. |
| **DC19** | Entrega en dos PR pequeños y dependientes: **A** lector compacto y título/descripción fiables (0217); **B** asignaciones, opiniones y avisos (0218), sobre A. |
| **DC20** | Pendientes que se conservan hasta tener su evidencia: G-ALQ, diagnóstico de Recoletos, D13 y validación del PDF representativo. |

## Decisiones de implementación (PR B)

Registradas al implementar, dentro de DC10–DC18:

- **Quién asigna.** Solo el dueño de la HOME (guarda de siempre) y solo a clientes que estén en su alcance de `clientes` · ver (los permisos existentes del CRM, comprobados en el servidor al buscar y al crear). La búsqueda no ofrece clientes fuera de ese alcance.
- **Una asignación vigente por catálogo y cliente.** Si la anterior caducó, asignar de nuevo la revoca y crea otra con token nuevo; esa asignación nueva ve y edita las opiniones anteriores del mismo cliente en ese catálogo (la opinión es del cliente sobre la vivienda en ese catálogo, no del token).
- **Escritura.** Se revalida en cada envío: enlace inexistente, general, revocado, caducado o de un catálogo archivado responde igual (`link_invalid`, 410). Una vivienda que ya no está en la lista efectiva responde `not_in_catalog` (404). Comentario recortado; en blanco = sin comentario. Escrituras serializadas por opinión (reintentos y dos pestañas).
- **Histórico (DC15).** Revocar, caducar, retirar la vivienda del catálogo o borrarla del CRM no borra la opinión: queda con el título que veía el cliente y la ficha la marca «ya no está en el catálogo». Solo borrar el cliente la borra (cascada, como el resto de su ficha).
- **Avisos (DC17).** Destinatario: `assigned_advisor_id` si existe, si no el dueño del catálogo. Enlace a la ficha del cliente en su país (`/{país}/admin/clientes/{id}?tab=properties#catalog-feedback`). Se ven en la campana del CRM y se marcan leídos al abrirlos; `/api/admin/cl/notifications` y el contador de Captaciones los excluyen.
- **Ficha (DC16).** Tarjeta en Resumen y bloque en Propiedades (ancla `#catalog-feedback`) con las opiniones y los enlaces personales; el enlace «Gestionar» solo aparece al dueño del catálogo. Si 0218 no está aplicada, la ficha se abre igual sin el bloque.
- **Lector.** «Tu opinión» va al pie de los datos de la pantalla 2, dentro de su panel desplazable; no cambia el número de páginas ni el PDF. No muestra el nombre del cliente.

## Alcance

- **A:** reader-state con dos partes por vivienda; páginas Apertura y Detalle; PDF compacto; 0217 (título); gestor con Título y Descripción como copia principal; IA con título; pruebas.
- **B:** 0218 (asignaciones, opiniones, avisos); rutas públicas de opinión con límite y validación; reader con «Tu opinión» solo en enlaces personales; «Asignar a cliente» en Compartir; tarjeta y bloque en la ficha del cliente; avisos en la campana; pruebas.

## Fuera de alcance

Cambiar la ficha del CRM; borrar historias; correo o WhatsApp; inicio de sesión del cliente; opiniones desde el enlace general; tocar `/v`, `/s` o sus tablas; producción, credenciales, escrituras reales, IA real, servicios de pago y revisión de Codex.

## Criterios de aceptación

| | Criterio |
| --- | --- |
| **A1** | Toda vivienda tiene exactamente dos pantallas (historia, descripción limpia, texto propio y sin texto), en doble composición y en una columna. |
| **A2** | Pantalla 1: foto de apertura grande, título, operación, precio, datos, miniaturas y galería. Pantalla 2: título, ficha técnica, características y descripción completa con desplazamiento interno y su señal. |
| **A3** | Texto largo, pantallas pequeñas y fotos excluidas: nada recortado ni extra; teclado, galería y actualizaciones en vivo funcionan. |
| **A4** | Guardar solo un título: guarda, publica, sobrevive a recargar y se ve en índice, lector y PDF; otro catálogo y la ficha del CRM no cambian; un cambio de la ficha no lo retira. |
| **A5** | Conflictos y ediciones durante un guardado se conservan (protocolo del gestor). |
| **A6** | IA solo al pulsar, con propuesta de título y descripción revisable; pruebas con IA simulada. |
| **A7** | PDF compacto completo, en verde con la verificación existente adaptada. |
| **B1** | Dos clientes valoran la misma vivienda por separado; cada uno ve y edita solo lo suyo. |
| **B2** | Reordenar, reintentar, editar, enlaces caducados o revocados y personal sin permiso: comportamientos de DC12–DC16. |
| **B3** | La ficha del cliente muestra sus opiniones y el asesor recibe un aviso interno; ningún mensaje externo. |
| **B4** | El enlace general no permite opinar; los datos públicos no exponen datos de otros clientes. |

## Impacto en datos y despliegue

- **0217**: añade dos columnas a `catalog_texts`, una sobrecarga y redefine cuatro funciones. Sin datos que migrar; ninguna huella cambia salvo en catálogos que publiquen título propio.
- **0218**: tablas nuevas `catalog_client_links` y `catalog_feedback` (RLS sin políticas, solo `service_role`), funciones con guarda de dueño o de token, y `get_public_catalog` / `get_catalog_states` redefinidas para aceptar también los enlaces personales (misma instantánea y misma huella: los enlaces generales existentes no cambian). Inserta y actualiza filas `type = 'catalog_feedback'` en `crm_notifications` (tabla existente). Sin datos que migrar. La reversión borra las dos tablas (las opiniones se pierden si no se copian antes) y conserva los avisos ya creados.
- Las dos se prueban solo en el Postgres temporal (aplicadas dos veces, reversión y reaplicación) y llevan su `rollback-*.sql`. El merge a `main` despliega y aplica migraciones.
