# Captaciones: mapa de zona y captación para un cliente — diseño

Fecha: 2026-10-27 · Rama: `feat/captaciones-mapa-cliente` · Solo España (`/es/admin/captaciones`, que sirve `ParticularesPage`).

## Intención
Hoy una captadora filtra anuncios de particulares con listas y un modal de `leaflet-draw` poco cuidado, y para llevar un anuncio a un cliente tiene que ir a la ficha del cliente. Se quiere que **el cliente sea el punto de partida**: elegir a María, dibujar (o heredar) su zona, ver sobre el mapa qué anuncios encajan y captarlos en lote.

## Objetivos
1. Vista **Mapa** en Captaciones (tercera vista junto a Cuadrícula y Lista) con pines de precio, zona dibujable/editable y panel lateral sincronizado.
2. **Captar para un cliente**: selector de cliente que precarga su encargo y su zona; % de encaje con el cruce que ya existe; «Captar los N que encajan»; guardar la zona en el encargo.
3. **Búsqueda con IA** en lenguaje natural sobre los anuncios de la zona.
4. Herramientas de zona: dibujar, editar, radio y barrios. «Minutos a pie» queda fuera hasta elegir proveedor (ver decisiones abiertas).

## No objetivos
- No se toca Chile (`/cl/admin/captaciones` es otro módulo).
- No se cambia el cruce `evaluateMatch` ni el modelo de datos de `particulares`.
- No se rehace el filtro de zona de la lista actual: sigue funcionando; la vista Mapa comparte el parámetro `zonePoly`.
- Anti-objetivo: un mapa bonito que no encaje con el CRM, o recuentos que no coincidan con la lista.

## Diseño visual (aprobado por el dueño: maqueta v4)
Maqueta de referencia: `docs/superpowers/specs/assets/propuesta-mapa-captaciones-v4.html`.
- Lenguaje del CRM: lienzo `cream-50`, tarjetas blancas con borde fino, botones negros, dorado `#c9a96e`, Optima/Lato. Tokens de `lib/theme/crm-palette.mjs`.
- Barra superior de cristal: herramientas (solo icono, nombre en la activa) + campo de IA + conmutador claro/oscuro. La ayuda va dentro de la tarjeta de herramientas.
- Pines: etiqueta con precio. Encaja ≥80 % (negro; dorado en oscuro), encaja en parte 60–79 % (blanco con borde dorado), en zona sin encajar (punto), fuera de zona (punto pequeño). Punto dorado = nuevo; borde discontinuo = agencia.
- Zona: contorno dorado continuo con brillo suave, relleno translúcido, vértices en anillo, punto dorado en el centro de cada lado para añadir vértices; doble clic en un vértice lo quita.
- Panel de embudo (abajo izquierda): en zona → precio y tipo → encajan; más nuevos 24 h, ya captados y precio medio. Las cifras son las mismas que da la lista (misma consulta).
- Ficha al pulsar un pin (foto, precio, motivos y avisos, «Captar para …», WhatsApp, Ficha) sincronizada con la lista de la derecha.
- Mapa oscuro: filtro CSS sobre las teselas de OpenStreetMap (sin proveedor de pago).
- `prefers-reduced-motion` respetado; foco visible; usable en móvil (panel lateral pasa debajo).

## Reutilización (no rehacer)
- Matching: `lib/clients/brief-match.ts` (`evaluateMatch`) y `getSuggestedParticulares` (`lib/db/queries/suggested-particulares.ts`).
- Zona guardada del cliente: `client_preferences.search_polygons` (migración 0198), `cleanPolygons` en `lib/clients/brief.ts`.
- Geometría: `lib/zone-polygon.ts` (codificar/decodificar `zonePoly`, punto en polígono).
- Captar: `addPortalLinks` (`app/[country]/(admin)/admin/clientes/portal-links-actions.ts`), que además añade a la selección privada.
- Buscar cliente: `GET /api/admin/clientes/search` (respeta alcance de cartera).
- IA: `aiComplete` (`lib/services/ai/chat.ts`), configurable desde Configuración.

## Restricciones
- Permisos: ver mapa exige `particulares.view`; elegir cliente `clientes.view`; captar y guardar zona `clientes` crear/editar (el gate de `addPortalLinks` ya lo hace). El selector solo muestra clientes de la cartera permitida.
- Los datos de particulares llevan teléfono de propietarios: el endpoint de pines **no devuelve teléfono ni descripción**.
- Máximo 300 enlaces por captación en lote (límite de `addPortalLinks`).
- Sin PostGIS: el punto-en-polígono se hace en Node como hoy (`getParticularesIdsInPolygons`).
- Un anuncio sin coordenadas no sale en el mapa, pero se cuenta aparte («N sin ubicación») para que el recuento no engañe.

## Decisiones abiertas (del dueño)
1. **Barrios**: no hay geometría oficial en el repo. Propuesta: descargar los barrios de Madrid de datos abiertos del Ayuntamiento (licencia CC-BY) a `public/geo/`. Pendiente de confirmar fuente.
2. **Minutos a pie**: exige un servicio de rutas (OpenRouteService, Valhalla propio u otro) y una clave. Queda fuera de este plan hasta elegir.
3. **IA**: se usa el proveedor ya configurado en Configuración; el coste por búsqueda se acota a 200 anuncios.

## Lo que decide quien construye
Estructura interna de componentes del mapa, nombres de clases CSS, animaciones concretas y cómo se agrupan pines muy densos (clustering), mientras se respeten los estados de pin y los recuentos de arriba.
