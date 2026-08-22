# SMARTLINK — HERO MEDIA QUALITY · forense y arreglo

Fecha: 2026-08-22 · En producción y medido en navegador real.

---

## ROOT CAUSE

No era un fallo, eran **tres pérdidas encadenadas**. Las dos primeras explican
por qué BC-1421 y BC-1422 se ven peor que el resto; la tercera explica por qué
*todas* las fichas se ven blandas en una pantalla buena.

**1 · Entrega — el hero servía un único fichero, sin `srcset`.**
El hero ocupa el ancho completo (1440 CSS px en un portátil). En una pantalla
retina eso son 2880 px reales, y el navegador recibía el mismo fichero de 1600:
ratio **0,56×**. Nadie lo nota a 1×; todo Mac con retina lo ve.

**2 · Ingesta de Idealista — perfil de 850 px.**
El importador normalizaba TODA imagen del CDN al perfil "seguro"
(`WEB_DETAIL_TOP-L-L`), elegido porque los compuestos daban 404. Ese perfil da
**850 px**. El resto del catálogo llega a 1600. Fingerprint inconfundible: las
86 fichas con portada corta son casi todas de exactamente 850 px.

**3 · Almacenamiento — techo de 1920 px y calidad 82.**
`downloadAndWatermark` recortaba todo máster a 1920. Aunque el origen fuese
excelente, el techo impedía servir una retina.

**Hero vs galería** (§2, medido, no supuesto): reciben **exactamente la misma
variante**. Confirma que la pérdida es anterior al renderer.

## Lo que se ha cambiado

| Capa | Antes | Ahora |
|---|---|---|
| `/p/[slug]/[idx]` | siempre el original en streaming | igual sin `?w=`; con `?w=N` sirve una variante (sharp, **nunca amplía**) |
| Calidad del reencode | — | 86, y 78 por encima de 2048 px, donde el ojo no lo nota y el peso sí |
| Hero | `<img src>` a secas | `srcset` acotado al ancho real + `sizes="100vw"`, techo 2560 |
| Máster guardado | 1920 px / q82 | 2560 px / q86 |
| Idealista | perfil fijo de 850 px | prueba el perfil grande y **verifica en la descarga**; cae al seguro si no existe |
| Portada | posición 0 (salvo marca de agua) | posición 0 salvo que sea corta (<1440) o lleve marca ajena; entonces gana la mejor de las ocho primeras |
| Metadatos | ninguno | `source_width`/`source_height` (0153), leídos de las cabeceras del fichero |

## Dos errores propios, por si vuelven a aparecer

**Un `srcset` mentiroso deja la foto PEOR que no tenerlo.** El descriptor `w` es
una promesa: el navegador calcula la densidad como *(ancho declarado / ancho de
layout)*. Al declarar la escala completa para fotos cuyo ancho real no
conocíamos, Chromium recibía un fichero de 1600 px anunciado como `2560w`, lo
trataba como una imagen de **900 px CSS** y la estiraba a 1440. Medido en
producción tras el primer despliegue. Ahora: **sin dato de ancho no se declara
`srcset`**, y el último candidato es siempre el ancho real.

**Nuestra propia marca de agua no es un defecto.** La preferencia por fotos
limpias marcaba también las de nuestros anuncios republicados, donde el logo
impreso es el de Benjamín Cousiño: 211 de 423 fotos de esa procedencia. El hero
se movía a otra foto sin motivo. Revisadas: **73 propias, 128 ajenas**. Solo la
ajena cuenta. Apareció ampliando al 200% el hero de BC-1421 en el QA visual —
los números decían "marcada" y la imagen decía "marcada por nosotros".

## El fallo de `Range` — CORREGIDO, no solo documentado

El storage de origen maneja mal la cabecera `Range`, y lo pagábamos nosotros.
Comportamiento medido sobre un fichero de **60.720 bytes**:

| petición | origen | ahora, por `/p/` |
|---|---|---|
| `bytes=0-60719` (exacto) | 206 en 270 ms | 206 |
| `bytes=0-65535` (más allá del final) | **se cuelga** hasta el timeout | **206 en 317 ms**, `bytes 0-60719/60720` |
| `bytes=70000-` (empieza tras el final) | 500 | **416**, `bytes */60720` |
| `bytes=-2000` (sufijo) | 500 | **206**, `bytes 58720-60719/60720` |

Pedir de más es legal y normal en un cliente: la respuesta correcta es
**recortar**, no colgarse. El proxy resuelve ahora el rango contra el tamaño
real (una petición `HEAD` barata) y aguas arriba solo pide lo que ya sabe
satisfacible — nunca reenvía el rango del cliente tal cual. Devuelve 206 con
`Content-Range` y `Content-Length` correctos, 416 cuando de verdad no se puede
servir, `Accept-Ranges: bytes` siempre y el MIME intacto. Las variantes `?w=`
se trocean desde el buffer que ya generamos.

No hay ningún caso especial para el 65535: la cabecera se parsea como manda la
norma en [lib/http/range.ts](lib/http/range.ts), con sus tests
(`npm run test:media`, casos A-G del encargo).

Nuestros propios lectores (el medidor de dimensiones) preguntan el tamaño antes
de pedir un rango: 484 fotos parecían ilegibles solo por este fallo.

## Otras trampas del camino

- La portada se elige entre las ocho primeras, pero se medían cinco: si la
  elegida caía fuera, el hero se quedaba sin `srcset`. Los dos horizontes ya
  coinciden.
- Las fotos que se suben a mano **se miden al subirlas**. Sin eso, una
  fotografía nueva y buena entraría sin dimensiones y el hero no podría
  preferirla sobre la pequeña que ya había: la reevaluación de la portada
  dejaría de ser automática justo cuando más falta hace.

## ACCEPTANCE

```
ROOT CAUSE:            entrega sin srcset + perfil de 850px en la ingesta de
                       Idealista + techo de 1920px en el máster guardado

ACTIVE HEROES:         678
GOOD:                    1   (≥2880px, sirve retina)
MARGINAL:              586   (funciona, sin resolución ideal para retina)
LOW_RES_SOURCE:         86   (material insuficiente: hace falta mejor fuente)
NO PHOTO:                5

AUTO-FIXED:             40   (el renderer ya usa otra foto mejor)
WRONG_VARIANT:           0   (eran 9 antes de la corrección automática)

RANGE BUG:            FIXED
RANGE TIMEOUTS:          0
PUBLIC IMAGE ERRORS:     0
FUTURE INGESTION:     PROTECTED

FOTOS MEDIDAS:        5347
MARCA AJENA:           163   (antes 211 contando la nuestra)
```

**MARGINAL no es un error.** Significa que la imagen disponible funciona pero
no tiene resolución ideal para retina a ancho completo. **LOW_RES_SOURCE** sí
pide acción: el material disponible es insuficiente y hace falta una fuente
mejor.

**BC-1421** · antes 850 natural / 1440 css / **0,59×** a 1×; ahora 850 / 1440 /
0,59× — sin cambio: **LOW_RES_SOURCE**. Su origen tiene 850 px y ninguna otra
foto de la ficha es mejor. No se inventa resolución.

**BC-1422** · idéntico: 850 px, **LOW_RES_SOURCE**.

**BC-1238** (control con material bueno, 5712 px de origen) · antes 1024 natural
(elegía la foto equivocada); ahora sirve **2560 px** para 2880 → **0,89×**, y a
1× llega a 1,11×. Es la prueba de que la cadena entera funciona cuando hay
píxeles.

**HERO LCP** · 550-680 ms en el catálogo normal. BC-1238, el caso pesado, pasó
de **3089 ms → 1837 ms** al poner el techo en 2560 y bajar la calidad por
encima de 2048 px (834 KB → 337 KB). Móvil: 1200 px / 78-147 KB donde antes se
bajaban 1600 px / 130-215 KB.

## Contrato de ingesta futura — PROTEGIDO

Para una propiedad nueva ya no se repite ninguno de los tres defectos:

1. **Sin normalización obligatoria a 850px.** La descarga prueba el perfil
   grande del CDN de Idealista y solo cae al seguro si el grande no existe —
   verificado en la propia descarga, no por fe en que un perfil siga publicado.
2. **Sin el techo de 1920.** El máster se guarda hasta 2560px con calidad 86
   cuando la fuente da para ello; por debajo, tal cual venga.
3. **Entrega responsive correcta** en cuanto conocemos las dimensiones, que
   ahora se registran al subir y al importar.

Techo de entrega: **2560px** en escritorio de alta densidad (más pesa 834KB y
aporta detalle invisible) y variantes menores en móvil (1200px, 78-147KB). No
se almacenan ni se sirven originales gigantes sin necesidad.

## Superficie operativa para el equipo (§4)

Sin dashboard nuevo: la **ficha de la propiedad** avisa cuando la mejor foto no
llega a 1440px, junto a las fotos, que es donde se arregla. Indica el ancho real
disponible y el que pide la portada. En cuanto se sube una fotografía mejor, el
SmartLink la prefiere **solo**: la portada se decide al renderizar a partir de
las dimensiones, no hay ningún flag que editar a mano.

## Recuperación (§13)

- **WRONG_VARIANT → corregido solo.** 40 fichas ya muestran otra foto mejor sin
  tocar la base de datos: la decisión se toma al renderizar.
- **LOW_RES_SOURCE → no se inventa resolución.** Las 86 quedan con su bandera
  operativa (`source_width` en la ficha). Su arreglo real es re-importar desde
  Idealista con el importador ya corregido, pero **la ficha devuelve 403
  (DataDome) también a través del proxy residencial**: probado desde la máquina
  local, desde el VPS y con el fetcher de la app. Cuando vuelva a ser
  accesible, una re-importación las sube a la resolución grande sin tocar
  código.

## Limitaciones conocidas

- **Ningún hero del catálogo llega hoy a `GOOD` salvo uno.** El techo de 1920
  llevaba años aplicándose, así que la mejora de la ingesta solo alcanza a lo
  que entre a partir de ahora. Lo existente no se puede reconstruir: los
  originales ya no están.
- Las **86 LOW_RES** necesitan fotografía nueva o re-importación, no código.
- Las variantes se generan **a la carta** en la primera petición de cada ancho
  y quedan en caché 24 h. La primera visita a un ancho nuevo paga el reencode.
- Las dimensiones están medidas para las **ocho primeras fotos** de cada ficha
  activa (5.347). Las demás siguen sin medir; solo importan si algún día el
  hero mira más allá.
- El fallo de `Range` **sigue estando en el storage de origen**: lo que se ha
  corregido es que nuestro proxy ya no lo propaga ni lo sufre. Cualquier código
  nuevo que lea storage directamente debe preguntar el tamaño antes de pedir un
  rango.

# SMARTLINK HERO MEDIA QUALITY — COMPLETE
