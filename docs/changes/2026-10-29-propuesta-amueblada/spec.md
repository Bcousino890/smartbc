# Propuesta amueblada en «Propiedades»: especificación

Cada propiedad puede tener una propuesta de mobiliario virtual. Son parejas de fotografía actual y propuesta de la misma toma. Se gestiona en su ficha y el cliente la abre desde el enlace compartido habitual con el visor aprobado.

- **Tamaño:** grande o sensible (migración nueva y contenido nuevo en una superficie pública)
- **Responsable:** Fabricio
- **Estado:** implementada para revisión en el PR (D4)

## Contexto

- El encargo llegó con una referencia estática aprobada: `index.html`, `styles.css`, `app.js` y los datos y las imágenes de BC-1781.
  - El visor tiene filtros por estancia, miniaturas, propuesta, comparación deslizable, vista doble, anterior/siguiente, teclado y pantalla completa.
  - La referencia carga las parejas de un JSON por nombre de archivo y vive fuera del CRM.
- Lo que había en el repo, comprobado en el código:
  - Las fotos están en `property_photos`; vídeos y planos en `property_media` (`photo|video|plan`).
  - Los archivos van al bucket público `properties-photos` con la ruta `{property_id}/…`.
  - Las subidas grandes entran por `POST /api/admin/properties/upload/{kind}`, que está fuera del middleware por el corte de 10 MB.
  - La ficha compartida tiene dos entradas que pintan el mismo `PublicPropertyView`:
    - `/compartir/[slug]`: estable, propiedad no archivada, slug difícil de adivinar.
    - `/c/[token]`: `property_shares`, con caducidad.
  - En esa vista se enseñan la zona y la ciudad, nunca la dirección exacta.
  - No existía ningún concepto de propuesta, amueblado virtual ni antes/después.
- No comprobado: los datos reales de producción. Fabricio indicó que la ficha es BC-2138, creada a mano (D1). Los archivos de la entrega se nombran BC-1781.

## Decisiones

- `D1 (2026-10-29)`: la propuesta de la entrega va en **BC-2138**: «yo he creado ya el piso manual».
- `D2 (2026-10-29)`: el visor se abre en una **subpágina** del enlace compartido, `/compartir/<slug>/propuesta` y `/c/<token>/propuesta`. La ficha compartida enseña «Ver propuesta amueblada» solo si hay una propuesta publicada.
- `D3 (2026-10-29)`: cada pareja usa **archivos propios**, subidos a `properties-photos/{id}/propuesta/`. No reutiliza `property_photos`, para que una sincronización que rehaga las fotos no rompa la pareja.
- `D4 (2026-10-29)`: **implementar ya y revisar en el PR**, en un worktree desde `origin/main`, sin tocar producción. Fabricio carga las imágenes desde la nueva sección de la ficha tras el despliegue.

Decisiones de implementación (Claude):

- `I1`: dos tablas en lugar de ampliar `property_media`:
  - una fila por propiedad con el estado y los textos;
  - una fila por pareja, con `before_*` y `after_*` juntos.

  La pareja es la fila, con su id; el nombre del archivo no es el vínculo.
- `I2`: estado **borrador / publicada**. El cliente solo ve una propuesta publicada y con imágenes.
- `I3`: «Comparar» exige la fotografía actual (CHECK). Al guardar se rechaza una pareja si la proporción del antes y la del después difieren más de un 2 %, porque no sería la misma toma.
  - Sin «Comparar», la imagen se presenta como «Vista del inmueble». En la entrega son el baño, el vestidor y los exteriores.
- `I4`: los estilos van en un CSS module; ningún selector sale del componente. Se mantienen la paleta clara y las tipografías de la referencia (Georgia e Inter, la del portal). La cabecera usa el logo del portal (`/logo.png`).
- `I5`: precio, operación, zona y ciudad, m², dormitorios y baños salen del registro de la propiedad con las mismas reglas que la ficha compartida: sin dirección exacta y con precio 0 = «a consultar».
- `I6`: carga múltiple que empareja por el número inicial del nombre (`01_salon.png` ↔ `01.jpg`) y sugiere el nombre, la estancia y «comparar». La persona revisa la tabla antes de subir. Lo que no casa se lista y no se sube.

## Alcance

- Migración `0235_property_furnishing_proposals.sql`.
- Lecturas `lib/db/queries/furnishing.ts`:
  - admin, con la sesión de staff;
  - pública, con service role, solo si la propuesta está publicada y solo para la propiedad que resolvió el enlace.
- Acciones `furnishing-actions.ts`:
  - subir una pareja, editar, ordenar, borrar y publicar o retirar;
  - todas con `properties/edit` y staff.
- La subida entra por el `[kind]` existente (`furnishing`).
- Visor `components/furnishing/furnishing-viewer.tsx` con su CSS module. Variante `page` para el cliente y `embedded` para la vista previa del admin.
- Sección «Propuesta amueblada» en la ficha del admin, después de Planos.
- Subpáginas públicas `/compartir/[slug]/propuesta` y `/c/[token]/propuesta` (noindex) y la tarjeta de acceso en `PublicPropertyView`.
- Lógica pura `lib/furnishing/*`, test `npm run test:furnishing-proposal` y su paso en la CI.
- QA local: `scripts/qa/furnishing-*.mts` y `/dev-fixtures/propuesta-amueblada`.

## Fuera de alcance

- Subir las imágenes de BC-2138: lo hace Fabricio desde la ficha (D4, P-1).
- Generar renders o quitar marcas de agua. Las imágenes se suben tal cual se entregan.
- Borrar del bucket los archivos de una propiedad que se elimina. Es el mismo comportamiento que tienen hoy planos y vídeos.
- Analítica específica del visor.

## Invariantes

- Un enlace solo enseña la propuesta de **su** propiedad, resuelta con las reglas del propio enlace: no archivada, o token existente y sin caducar.
- Un borrador no sale por ningún enlace.
- El cliente no recibe rutas de storage, ids de fila, la dirección exacta, notas internas ni datos del propietario.
- La gestión sigue tras el login: página `guardPage("properties")` y acciones `checkPermission("properties","edit")` + `requireStaff`, con la RLS de staff en tablas y bucket.
- Sin la migración aplicada, la ficha del admin y el enlace compartido funcionan como antes (las lecturas toleran que no exista la tabla).

## Datos e impacto

- Tablas nuevas `property_furnishing_proposals` y `property_furnishing_images`, con `ON DELETE CASCADE` desde `properties`.
- Archivos en `properties-photos/{property_id}/propuesta/{ts}-{antes|despues}-{nombre}`, sin conversión. El visor los sirve por `next/image`, que redimensiona en WebP o AVIF.
- No hay integraciones externas.
- **Fusionar el PR equivale a desplegar y aplicar la 0235 en producción** (autodeploy).

## Recuperación de migraciones

- `0235`:
  - Va en su propia transacción y es idempotente: `IF NOT EXISTS` y `DROP POLICY IF EXISTS` antes de cada `CREATE POLICY`.
  - Reversión: [rollback-0235.sql](rollback-0235.sql) borra las dos tablas.
  - **Efecto irreversible:** se pierden las parejas y los textos guardados. Los archivos del bucket no se borran.
  - El código anterior es compatible con el esquema nuevo: solo añade tablas. El código nuevo funciona sin las tablas (lecturas tolerantes) mientras no se aplique.

## Criterios de aceptación

| Id | Criterio |
| --- | --- |
| AC1 | Ficha con propuesta publicada: «Ver propuesta amueblada» en `/compartir` y `/c`; el visor abre sin login. |
| AC2 | Ficha sin propuesta o en borrador: ficha normal sin acceso; `/propuesta` responde 404 y no filtra nada. |
| AC3 | Un token caducado o de otra ficha no enseña la propuesta (404). |
| AC4 | Cada pareja enseña la misma toma antes y después. La proporción se mantiene en horizontal y en vertical. |
| AC5 | Funcionan filtros, miniaturas, anterior/siguiente, Amueblado/Comparar/Vista doble, teclado, táctil y ampliación, en escritorio y en móvil, sin scroll horizontal. |
| AC6 | Las vistas sin comparación (baño, vestidor, exteriores) se ven como «Vista del inmueble», con Comparar deshabilitado. |
| AC7 | Se conserva el aviso de propuesta virtual. Precio, zona y superficies salen del registro. |
| AC8 | La gestión sigue protegida: ficha del admin → login; subida sin sesión → rechazada. |
| AC9 | Los estilos no salen del componente. |
| AC10 | `tsc`, las pruebas de la CI que tocan esto, el lint de migraciones y el build aislado, en verde. |

## Preguntas abiertas

Ninguna que bloquee el PR. Fabricio confirma con la QA visual (capturas en el PR) y, tras el despliegue, cargando BC-2138.

## Aprobación

D4 (2026-10-29): «Implementar ya, revisar en PR». El merge lo hace Fabricio.
