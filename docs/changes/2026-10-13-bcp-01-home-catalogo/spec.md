# BCP-01 · HOME de Fabricio y catálogo editorial: especificación

Especificación aprobada de la HOME privada de Fabricio y de su primer módulo, el catálogo editorial de propiedades.

- **Tamaño:** grande o sensible (tablas y migraciones nuevas, permisos en servidor, enlace público, documentos privados).
- **Responsable:** Fabricio
- **Estado:** especificación v3 aprobada con tres ajustes (2026-10-13); dirección visual D17 aprobada; plan corregido aprobado; fase 1 en implementación.

## Contexto

La HOME es el espacio de trabajo inicialmente privado de Fabricio para trabajar con todo el CRM e irlo mejorando módulo a módulo. El primer módulo es el **catálogo editorial**: una selección común de propiedades reales que se comparte con un enlace vivo y se descarga en PDF. No es una reescritura del CRM.

Exploración en `6e677c2` (código idéntico a `c79d8d7`); la implementación parte de `ffcdc7e`. Comprobado en el código:

- **Se reutiliza:**
  - el lector de libro de `/v/[token]` como patrón (paso de página, teclado, deslizar, menos movimiento);
  - el patrón de enlace protegido de `viewing_collection_shares`;
  - el contrato público con lista cerrada de campos y su test;
  - el proxy de fotos `/p/[slug]/[idx]`;
  - `insertImportedProperty` y la importación por enlace;
  - `@react-pdf/renderer`;
  - `guardPage`/`NAV_ITEMS`.
- **Falta:**
  - una entidad de catálogo independiente de clientes;
  - Realtime: no hay uso en el código ni configuración comprobada en el VPS;
  - librerías de lectura de PDF u OCR;
  - permisos por perfil concreto;
  - fuentes registradas en el PDF;
  - un e2e ejecutable.
- **No se reutiliza como estado del catálogo:** las selecciones, itinerarios y shortlists, que están ligados a un cliente.

## Decisiones

| | Decisión |
| --- | --- |
| D1 | HOME solo para Fabricio al principio. |
| D2 | Catálogo común a todos sus lectores; la personalización por cliente, más adelante. |
| D3 | De los PDF se intenta extraer datos y fotos a fichas revisables. |
| D4 | Lo guardado se ve al momento; no hay un segundo «publicar». |
| D5 | Los lectores abiertos reciben los cambios solos. |
| D6 | Presentación de revista o libro, con páginas y tipografía elegida. |
| D7 | La HOME es el espacio de trabajo del CRM; el catálogo es su primer módulo. |
| D8 | PDF digitales, escaneados y mixtos, con una o varias propiedades. |
| D9 | La HOME tiene accesos a Clientes, Propiedades y Solicitudes (pantallas actuales). |
| D10 | Enlace vivo y descarga en PDF editorial (copia fija). |
| D11 | Caducidad configurable y revocación manual. |
| D12 | Si se retira la propiedad que se lee, se pasa a la siguiente disponible. |
| D13 | Como máximo 2 s desde que se guarda con éxito hasta que el cambio se ve en un lector abierto (pestaña activa, conexión estable). Objetivo, no medición. |
| D14 | Extracción gratuita con PDF.js + Tesseract.js; sin servicios de pago. |
| D15 | La QA integrada y la medición de D13, en el CRM actual y por Fabricio. |
| D16 | Solo España; caducidad de 60 días (1–365); reservadas marcadas, vendidas o archivadas fuera; las fichas de PDF con `published_web = false`. |
| D17 | Dirección visual **C · Boutique**: Fraunces y Karla, papel cálido, tinta marrón, portada con arco, fotos enmarcadas y pies en cursiva. HOME con estantería de portadas y en Lato. |

Ajustes aprobados a la v3:

1. La extracción da prioridad al navegador de Fabricio. El servidor solo con evidencia y aprobación.
2. Claude prepara las tablas de valores esperados y Fabricio las confirma; las muestras se quedan fuera de git.
3. Fusionar puede disparar el despliegue y las migraciones según el script versionado. Las tablas nuevas necesitan una comprobación de compatibilidad y un plan de recuperación.

Planta: se muestra sin ordinal («Planta 7», «Planta baja», «Sótano», «Ático», «Planta · sin dato»). El dato de origen no cambia.

## Alcance

1. HOME en `/es/admin/mi-espacio`, solo para el perfil de Fabricio, comprobado en el servidor por id estable.
2. Catálogos: crear varios; título e introducción; añadir, quitar y ordenar propiedades; archivar.
3. Añadir propiedades existentes (referencia BC, slug o URL de la ficha propia). Desde un portal y desde un PDF, en la fase 3, detrás de G3.
4. Enlace estable con caducidad, revocación y renovación.
5. Lector editorial en vivo (D12, D13).
6. Descarga en PDF editorial.

## Fuera de alcance

HOME para otros agentes; personalización por cliente; datos de clientes en el catálogo; agenda de visitas; revocar a distancia un PDF ya descargado; infraestructura de Realtime; propiedades inventadas; reescribir el CRM.

## Invariantes

1. La gestión se comprueba en el servidor por el id del perfil de Fabricio. Tener la URL no da acceso.
2. Una propiedad conserva su identidad y puede estar en varios catálogos. Lo que se hace en uno no afecta a los demás.
3. Lo extraído y no confirmado no llega a `properties` ni a un catálogo.
4. Un guardado se aplica entero o no se aplica.
5. Añadir, quitar u ordenar no cambia el token. Un enlace revocado no vuelve a funcionar.
6. Ninguna actualización mezcla fotos o datos de dos propiedades.
7. Nunca se publican originales, contactos de colaboradores, notas internas, UUID, URL de almacenamiento ni datos de clientes.
8. Lo desconocido se muestra como desconocido; el precio no se pone a 0.
9. El PDF corresponde a una sola versión.
10. La estética del catálogo no cambia el resto del CRM.

## Datos e impacto

- Tablas nuevas, sin modificar ninguna existente: `home_owners`, `catalogs`, `catalog_items`, `catalog_shares` (fase 1); funciones públicas (fase 2); `catalog_source_documents`, `catalog_extraction_drafts` y buckets privados (fase 3).
- Fusionar un PR puede desplegar y aplicar migraciones según `scripts/vps-autodeploy.sh` (la copia del VPS no está comprobada). Volver al build anterior no deshace la base de datos.

## Recuperación de migraciones

Cada migración va dentro de `BEGIN`/`COMMIT`, es idempotente y tiene su SQL de reversión en este expediente (borra solo los objetos nuevos y sus datos). Ningún agente lo ejecuta fuera del Postgres local; si alguna vez hace falta, lo ejecuta Fabricio. El código anterior no usa los objetos nuevos, así que una vuelta atrás del código es compatible.

## Criterios de aceptación

| # | Criterio |
| --- | --- |
| AC1 | Solo el perfil de Fabricio accede a la HOME y a la gestión. Otro staff, un cliente o una petición sin sesión son rechazados en la página, en las acciones y en SQL. |
| AC2 | La HOME tiene accesos a Clientes, Propiedades y Solicitudes. |
| AC3 | Dos catálogos comparten una propiedad, y lo que se hace en uno no afecta al otro. |
| AC4a | Se añaden propiedades existentes por referencia BC, slug o URL propia (fase 1). |
| AC4b | Se añaden desde un portal (fase 3, tras G3). |
| AC5a/b | Extracción: comportamiento con fixtures sintéticos; validación con muestras. |
| AC6 | Un borrador no aparece en `properties` ni en un catálogo hasta confirmarlo. |
| AC7 | D13: los dos lectores, 20 ensayos, todos ≤ 2 s. |
| AC8 | D12 y sus casos límite. |
| AC9 | Caducidad, revocación y estado sin conexión. |
| AC10 | PDF coherente, completo y con las fuentes incrustadas. |
| AC11 | Privacidad del contrato público y del PDF. |
| AC12 | Aspecto visual: dirección aprobada en maquetas; aprobación final sobre lo implementado. |
| AC13 | Regresiones y CI en verde. |
| AC14 | La QA en vivo no modifica clientes ni la disponibilidad de propiedades. |

## Preguntas abiertas

Ninguna de producto. Quedan puertas de evidencia: G1 (muestras), G2 (viabilidad en el navegador) y G3 (efectos de crear propiedades). Ver `plan.md`.

## Aprobación

- Especificación v3 con los tres ajustes: Fabricio, 2026-10-13: «Sí, aprobar la especificación y preparar maquetas».
- D17: Fabricio eligió «C · Boutique».
- Plan corregido (identidad + E1–E7): aprobado por Fabricio el 2026-10-13, con autorización de la fase 1 (T1–T5 hasta PR-1 y CI, sin merge).
