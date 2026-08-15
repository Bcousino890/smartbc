# Viewing Collections — Handoff de cierre

**Sprint final · 2026-08-16 · `main` @ `a25f94a`**

**Estado: BCP PRIVATE VIEWING EXPERIENCE — COMPLETE & PRODUCTION HARDENED**
salvo el QA manual con sesión que solo tú puedes hacer (§13).

---

## 1. Private Gallery Mode

Lo que se veía: al abrir la galería asomaba por detrás la fotografía del spread,
enorme y recortada, y las miniaturas se estiraban hasta pixelarse. Eran dos
cosas: la capa iba a `bg-ink/97` (translúcida) y solo cubría media página, y
todo usaba `object-cover`.

Ahora es una **capa propia sobre tinta opaca**, del ancho completo, con dos
vistas:

| Vista | Qué hace |
|---|---|
| **Mosaico** | Cuadrícula de miniaturas (recorte razonable: es un índice) |
| **Lámina** | Una fotografía sola, entera, centrada sobre tinta |

En la lámina la imagen usa `object-contain` con `w-auto h-auto`: respeta su
proporción y **nunca se amplía por encima de su tamaño real**. Una foto pequeña
se ve pequeña y nítida en lugar de reventada. Verificado por test: se compara el
tamaño renderizado con el natural y falla si lo supera.

Controles discretos: cerrar, anterior, siguiente, contador `03 / 12`, y volver
al mosaico. Teclado `Esc` / `←` / `→`, y swipe en táctil. Nada de barra pesada.

**El mismo componente en móvil**, donde antes no había forma de ver una foto
suelta: la cuadrícula en línea sigue igual y cada miniatura abre la lámina.

## 2. La galería ya no sobrevive al pase de página

Vivía **dentro** de la página de residencia. Como la hoja saliente sigue montada
durante el giro, se veían las fotos del capítulo anterior sobre la página nueva
casi un segundo. Ahora el estado vive en `BookMode`, por encima del libro:

- `go()` la cierra **antes** de arrancar el giro — vale para siguiente,
  anterior, salto desde el índice y vuelta al índice, porque todos pasan por ahí.
- Un efecto de seguridad la cierra en el mismo commit si la página cambia por
  cualquier otra vía.
- Con la galería abierta el libro es inalcanzable: las flechas mueven
  fotografías, el swipe no pasa página y los botones quedan cubiertos. La
  navegación accidental es imposible por construcción.

Comprobado muestreando el DOM **durante** el giro (40/120/260/500/700 ms) y con
ráfagas de flechas: cero galerías huérfanas, una sola capa al aterrizar.

## 3. Page-turn — QA final

Recorrido completo en **1024×768, 1440×900 y 1920×900**: apertura de portada
(giro 3D confirmado leyendo la matriz de transformación), índice → residencia,
residencia → residencia, atrás, `Home`, salto desde índice, ráfaga rápida,
`prefers-reduced-motion` (sin perspectiva y sin animación, como debe).
Sin desbordamiento horizontal, sin errores de consola, paginación final `10/10`.

Sigue leyéndose como pasar la hoja de un libro, no como un carrusel.

## 4. Ritmo editorial

Medido automáticamente el aire muerto bajo el último bloque de cada spread: no
hay ninguna página que deje más del 42% de la columna vacía. Sin scroll interno
ni siquiera en 1024×768, que era el caso apretado. El colofón sí es una página
con mucho aire, pero a propósito: es la contraportada.

## 5. Calidad de imagen

El proxy `/p/` sirve **el original a resolución completa** (no hay miniaturas en
origen), así que la pixelación venía solo de estirar con `object-cover`. La
lámina lo resuelve. La fotografía a sangre del spread mantiene `object-cover`
porque es la composición aprobada, y ahí el recorte es intencionado.

## 6. Duplicados de cliente — cascada real

Antes: correo, y si no, primer resultado con los mismos 9 últimos dígitos.
Ahora, en orden de fiabilidad:

```
correo normalizado exacto
  → teléfono completo normalizado
    → últimos 9 dígitos (indicio, no prueba)
      → decisión del agente, siempre
```

Se devuelven **todos** los candidatos (hasta 4), cada uno con el motivo escrito
("Mismo correo electrónico", "Mismo teléfono", "Mismos últimos 9 dígitos"). Si
hay más de uno, o si el único se sostiene solo en nueve dígitos, el diálogo
avisa de que hay que mirar antes de vincular. Nada se vincula automáticamente.

## 7. Analítica — cinco defectos corregidos

Auditoría completa de `collection_open`, `stop_view`, `stop_expand` y
`share_click`. Lo que estaba mal:

1. **`stop_expand` duplicado** en móvil: el aviso estaba dentro del updater de
   `setState`, que React puede ejecutar dos veces.
2. **`stop_view` perdido al hacer scroll rápido**: el observador se recreaba en
   cada frame (dependía de una función que cambiaba de identidad en cada render
   del padre) y cancelaba notificaciones sin entregar.
3. **`stop_view` imposible en capítulos altos**: con `threshold: 0.35`, una
   sección más alta que ~2.9 pantallas nunca alcanzaba ese ratio y **no se
   contaba jamás**. Ahora el criterio es ocupar la banda central de la pantalla.
4. **Doble conteo al girar una tablet**: el registro de vistas vivía dentro de
   cada modo y se perdía al cruzar el media query. Ahora vive en la vista padre,
   que es lo único que sobrevive al cambio.
5. **Cola de eventos descartada**: si el `page_view` aún no había respondido, el
   flush **tiraba** los eventos encolados — justo el caso de `collection_open`,
   que se encola en el mismo instante del montaje. Ahora se conserva (con tope
   de 50 para no acumular memoria).

Confirmado además: el giro de página no genera eventos, la hoja saliente no
emite nada (`aria-hidden` + sin pointer events), abrir y cerrar la galería no
provoca falsos `stop_view`, y **la previsualización del agente no instrumenta
nada** (token vacío apaga el tracker entero).

## 8. Páginas terminales — bilingües, sin fuga

Caducada, revocada, token inexistente, itinerario cancelado y módulo
desactivado siguen siendo **idénticas byte a byte**: la vista no recibe props,
así que es estructuralmente incapaz de distinguir cuál es.

Por eso es **bilingüe en vez de traducida**: averiguar el idioma exigiría leer
la colección, que es justo lo que no puede hacer. Inglés como titular y español
debajo, ambos legibles, sin decir nunca si existió, si expiró o si se revocó.

## 9. Idiomas

**Español e inglés: production-ready**, revisados de punta a punta (portada,
índice, residencia, galería, asesor, colofón, estados, botones).

**Árabe, turco y hebreo: traducción sin revisar por hablante nativo.** No se
retiran —funcionan y el layout está comprobado—, pero el panel los marca
`· sin revisar` en el selector y avisa al elegirlos. Al validarlos, basta con
vaciar `TRANSLATION_REVIEW_REQUIRED` en `lib/viewing-collections/i18n.ts`.

**RTL comprobado técnicamente** (no lingüísticamente) en árabe: `dir=rtl`, giro
espejado, flechas invertidas, galería en rtl, números y teléfonos con `dir=ltr`
para que el bidi no los parta, y sin desbordamiento.

## 10. Despliegue sin caídas — el arreglo más importante

**El problema real:** `next build` reescribía `.next` mientras el proceso de PM2
seguía sirviendo desde esa misma carpeta. Perdía los manifiestos y devolvía
**500 durante uno o dos minutos en cada despliegue**. Lo vi en directo.

**Y una trampa:** el script de referencia del repo ya decía hacer build atómico,
pero **nunca se instaló en el VPS** (allí había una versión vieja de junio), y
además tenía un fallo que habría tumbado producción: Next graba el `distDir`
**dentro** del build (`required-server-files.json`), así que compilar en
`.next.new` y renombrarlo a `.next` arranca con *"Could not find a production
build"*. Comprobado reproduciéndolo.

**Cómo funciona ahora:**

```
build en .next.new          ← .next intacto: la web sigue sirviendo
  → migraciones             ← si fallan, NO se cambia de versión
    → se corrige el distDir grabado
      → swap atómico (mv) + reinicio de PM2
        → health check (hasta 60 s)
          → si no responde: vuelta automática a la versión anterior
```

Extras: `npm install` solo se ejecuta si cambió `package-lock.json` (reescribir
`node_modules` bajo un proceso vivo también rompía peticiones), y la versión
anterior se conserva en `.next.prev` hasta el siguiente despliegue, así que el
rollback es un `mv`.

Instalado en `/opt/vps-autodeploy.sh` (copia del anterior en
`/opt/vps-autodeploy.sh.bak-20260816`) y sincronizado con `scripts/`.

## 11. Rendimiento

En el banco local: LCP ≈ 400 ms, CLS = 0. El CLS a cero importa porque la
fotografía a sangre tiene proporción reservada y no empuja el texto al cargar.
Las fotos vecinas se precargan antes del giro, y en el mosaico las seis primeras
cargan con prioridad y el resto en diferido.

Medición con cartera real: la del smoke de producción (§12), no el banco.

## 12. Tests y smoke

```
npx tsc --noEmit                          limpio
npm run test:viewing-collections          en verde
npm run test:idealista                    100/100
node scripts/check-viewing-collection-html.mjs   sin fugas (13 comprobaciones)
npm run build                             ok
```

Más los bancos de Playwright escritos para este sprint (galería, giro,
ritmo, móvil, RTL, reduced-motion) — se ejecutaron y se retiraron del repo
para no dejar basura.

## 13. QA manual pendiente — requiere tu sesión

Es lo único que no puedo hacer: no tengo login, y crear un usuario de prueba en
producción está bloqueado por política (con razón). **Lo demás está cerrado.**

1. **Tu teléfono** — `/es/admin/usuarios`, edítate y guarda tu número. Sin eso
   tu ficha de asesor sale sin teléfono ni WhatsApp.
2. **Solicitudes → Preparar visitas** — con un lead que coincida con un cliente
   existente (prueba "Vincular") y con uno nuevo (prueba "Crear cliente").
   Comprueba que aterrizas en la ficha con la propiedad del anuncio ya en la
   selección.
3. **Reordenar** — mueve paradas, guarda, cierra, reabre: las horas y las
   confirmaciones deben quedarse con su propiedad, y el libro reflejar el orden.
   Repítelo con la colección ya publicada.
4. **Editor de parada** — en especial `confirmada + dirección exacta → cancelada`
   debe dejar `cancelada + solo zona` de una vez, sin estado intermedio.
5. **Diálogo de publicar** — checklist, qué falta, SmartLinks que se crearán,
   caducidad, copiar, abrir, WhatsApp, renovar, revocar. En español y en inglés.
6. **Recorrido completo** — solicitud → cliente → selección → itinerario →
   publicar → abrir el enlace → SmartLink → analítica → revocar.

## 14. Limitaciones que quedan

1. **ar/tr/he sin revisión humana** (§9). Marcado en el panel; no bloquea.
2. **El reinicio de PM2 sigue costando unos segundos.** El 500 largo está
   resuelto, pero el intercambio implica reiniciar el proceso. Eliminarlo del
   todo exige dos procesos y nginx delante (blue/green): otro orden de obra, y
   hoy no compensa.
3. **`stop_expand` cuenta aperturas brutas** mientras `stop_view` cuenta
   residencias distintas. No colisiona porque hoy no se lee en ningún panel,
   pero si algún día se cruzan hay que decidir la semántica.
4. **Los enlaces de contacto del asesor no se miden** (WhatsApp, llamar,
   escribir). Es un hueco de instrumentación, no un defecto.
5. **Coincidencia por teléfono en memoria** sobre hasta 500 clientes con
   teléfono. Suficiente hoy; con una base mucho mayor habrá que normalizar el
   teléfono en columna e indexarlo.
6. Persisten los duplicados históricos de numeración de migraciones
   (0122/0123): cosmético, el runner registra por nombre de fichero.
