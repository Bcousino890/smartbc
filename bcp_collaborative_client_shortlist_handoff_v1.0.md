# BCP Collaborative Client Shortlist — Handoff

**Sprint · 2026-08-19 · `main` @ `79f501b` · desplegado y verificado en producción**

La fase que faltaba entre «BCP elige» y «BCP organiza el día»:

```
selección de BCP → SHORTLIST PRIVADO → prioridades del cliente → itinerario → Private Book
```

---

## 1. Qué se implementó

Después de ver catorce casas con el cliente, ya no hace falta cerrar la lista
por WhatsApp. Se le manda un enlace privado donde marca cuáles quiere visitar
de verdad, las ordena a su gusto, deja alternativas, descarta, comenta, añade
alguna que haya encontrado él y lo envía. Al día siguiente el agente abre su
ficha, lo ve todo y con un clic lo convierte en itinerario.

## 2. Modelo elegido, y por qué

**Dos tablas nuevas. `client_property_selections` no se toca.**

| Tabla | Para qué |
|---|---|
| `client_shortlists` | La sesión de revisión. El **token vive aquí**: un shortlist *es* un enlace |
| `client_shortlist_items` | La instantánea de lo enviado + la decisión del cliente |

Tres decisiones detrás de eso:

1. **La curación de BCP y la respuesta del cliente conviven.** «Se la
   propusimos y dijo que no» es justo el dato que interesa; machacar `status`
   lo habría perdido.
2. **Los items copian el `property_id`**, no apuntan a la selección. Es una
   instantánea: si BCP retoca su selección mañana, lo que el cliente está
   ordenando no le cambia debajo.
3. **El token va en la propia fila**, sin tabla de shares aparte. Una colección
   se puede republicar y por eso separa el share; un shortlist es un enlace, y
   renovar o revocar es cambiar dos fechas.

Invariantes en la base, no en el formulario: un `rank` solo existe si la
decisión es `must_visit`, el comentario no pasa de 500 caracteres, no se puede
crear un enlace ya caducado, y una propiedad no puede estar dos veces.

## 3. Rutas

| Ruta | Qué es |
|---|---|
| `/s/{token}` | La selección privada del cliente. Sin indexar, sin previsualización social |
| `/s/preview/{id}` | Lo mismo que verá el cliente, para el agente. Ni escribe ni instrumenta |

Token de 16 caracteres, minúsculas y dígitos, mismo alfabeto y entropía que el
de la colección (ver migración 0132).

## 4. Recorrido del cliente

Abre → ve las catorce con foto, nombre editorial, zona y precio → decide cada
una entre **quiero visitarla / quizá / descartar** → ordena las prioritarias
con flechas → toca una foto y la ve entera → deja notas → añade otra si quiere
→ **envía sus prioridades**.

Todo se guarda solo. **Y el guardado no miente**: el cambio se pinta al
instante y la escritura va detrás; si el servidor dice que no, se deshace el
cambio en pantalla y se avisa con un «reintentar». Nunca aparece «Guardado»
sobre algo que no se guardó — en una conexión de móvil que va y viene, esa
diferencia es la confianza entera.

Puede volver después de enviar y seguir cambiando: el agente verá **«cambió
cosas después de enviar»**.

## 5. Recorrido del agente

En la ficha del cliente, bloque **«Selección privada del cliente»**, colocado
antes de los itinerarios porque ese es su sitio en el journey:

crear (eligiendo qué propiedades e idioma) · previsualizar · copiar enlace ·
WhatsApp · ver progreso (`9 de 14 decididas`, última actividad) · leer el
resultado con sus comentarios · **crear itinerario con sus prioridades** ·
renovar · revocar · archivar.

Se distingue el estado del **trabajo** (sin abrir / revisando / enviada) del
estado del **enlace** (activo / caducado / revocado). No es lo mismo que Paul
haya terminado que que el token haya expirado.

## 6. Seguridad

Esta es la **primera superficie del producto en la que escribe alguien sin
sesión**, así que se trató como tal:

- Todo se resuelve **desde el token**. Nunca se acepta un `client_id` ni un
  `shortlist_id` del navegador.
- Cada item se comprueba contra *su* shortlist antes de tocarlo
  (`.eq("shortlist_id", …)` en toda mutación). Con el token de un cliente no se
  puede escribir en la lista de otro.
- **Caducado o revocado bloquea también la escritura**, no solo la lectura.
  Comprobado revocando con la página ya abierta: la escritura se rechaza y al
  cliente se le avisa.
- Solo se pueden añadir propiedades **disponibles, no archivadas y del país**
  del shortlist. El id llega del navegador, así que se valida en servidor.
- Freno de 120 escrituras por minuto y token.
- Caducado, revocado e inexistente devuelven **exactamente la misma vista**.
- Contrato público propio (`PublicClientShortlist`), proyección pura, sin
  propietarios, notas, origen, comisiones, rutas de Storage, dirección exacta
  ni coordenadas. **El shortlist es antes de la visita: solo zona y subzona.**

## 7. Analítica

`shortlist_open`, `property_view`, `decision_change`, `priority_change`,
`property_discarded`, `property_restored`, `property_added`, `comment_added`,
`shortlist_submitted` (migración 0134 amplía el CHECK de `page_events`).

La sesión se ata al shortlist con `page_views.shortlist_id` (0135). **Se guarda
el id, nunca el token.** La previsualización del agente no instrumenta nada.

Las señales que de verdad usa el agente —si lo abrió, por dónde va, si lo
envió, si cambió algo después— son columnas de primera clase en la tabla, no
eventos: no dependen de que la analítica funcione.

## 8. Integración con la selección de BCP

No se toca. La curación sigue en su bloque. Una propiedad que añadió el cliente
queda marcada `client_added` para siempre y se muestra como **«la añadió él»**;
nunca se disfraza de recomendación nuestra.

## 9. Integración con el itinerario

**Crear itinerario con sus prioridades** hace un borrador con las `must_visit`
en el orden del cliente. Las alternativas solo si el agente lo pide; las
descartadas nunca. **Sin fecha, sin horas y sin confirmaciones**: su ranking es
un punto de partida, no una agenda.

Reutiliza `createItinerary`, así que mantiene las mismas invariantes, permisos y
protección cruzada entre clientes. Después el flujo sigue igual: horas,
confirmaciones, SmartLinks, publicar el Private Book.

**No hay sincronización automática.** Si el cliente cambia sus prioridades
después de crear el itinerario, el itinerario no se toca — eso destruiría
planificación real. El agente ve el aviso y decide.

## 10. Propiedades añadidas por el cliente

Una parada exige una fila en `client_property_selections`. Al crear el
itinerario, las que no la tengan se crean con `source: 'client_shortlist'`
(valor nuevo del CHECK, migración 0134). El origen no se pierde.

## 11. Tests

```
npm run test:client-shortlist     28 comprobaciones · verde
npm run test:viewing-collections  verde (sin regresiones)
npx tsc --noEmit                  limpio
npm run build                     ok
```

La suite nueva mete a propósito `owner_name`, `internal_notes`, `source_url`,
`external_id`, rutas de Storage, dirección y coordenadas en la fila cruda, y
falla si alguno aparece en el contrato público.

## 12. QA sobre producción

Caso Paul completo, con 14 propiedades reales, desde un móvil de 390 px:

abre con las catorce · le llama por su nombre · el HTML no filtra nada ·
decide las catorce (5 / 4 / 5) · reordena · comenta · **recargar no pierde
nada** · envía · token inválido y corto dan la vista terminal.

Resultado en la base: `submitted`, 5 prioritarias ordenadas 1–5, 4
alternativas, 5 descartadas, comentario en la primera.

Seguridad: revocar con la página abierta **bloquea la escritura y avisa**;
caducado deja de servir; los tres estados terminales son indistinguibles.

**Dos fallos reales los encontró este QA, no la revisión:**

1. Al reordenar cambiaba el número pero la tarjeta no se movía: el grupo se
   filtraba sin ordenar por rango (arreglado en `79f501b`).
2. Un primer test de caducidad **pasó por el motivo equivocado** — el `CHECK`
   impide antedatar una caducidad, así que el registro seguía revocado del paso
   anterior. Se rehízo con un shortlist nacido hace tres meses.

## 13. Limitaciones reales

1. **Reordenar es con flechas, no arrastrando.** Las flechas funcionan con
   pulgar, teclado y lector de pantalla; el arrastre habría que añadirlo encima,
   nunca en su lugar. Es lo que pedía la accesibilidad del brief, pero el brief
   también pedía *drag & drop* en escritorio: eso queda pendiente.
2. **ar / tr / he sin revisión nativa**, igual que en el Private Book. El panel
   los marca «sin revisar».
3. **Sin aviso activo al agente** cuando el cliente envía: aparece en la ficha
   con su fecha, pero no llega notificación. El brief lo permitía; la campana
   del CRM sigue sin implementación funcional y no quise depender de ella.
4. **El freno de escritura es por proceso.** Vale para el PM2 de un solo
   proceso que hay hoy; si algún día se reparte la carga, pasa a ser por
   proceso.
5. **La comparación «cambió después de crear el itinerario»** se muestra como
   aviso, pero no hay todavía una pantalla que enseñe el diff propiedad a
   propiedad.

## 14. ⚠️ Solape que hay que decidir

Mientras se construía esto, en `main` entró **otra forma de que el cliente
opine**: `client_rating` / `client_rank` sobre `client_property_selections`
(migraciones 0136–0138), que se escribe desde la colección publicada `/v/`.

Las dos cosas conviven técnicamente y ninguna rompe a la otra, pero son dos
sitios distintos donde el cliente expresa preferencia:

| | Cuándo | Dónde | Qué expresa |
|---|---|---|---|
| Shortlist `/s/` | **Antes** del itinerario | Enlace propio | Visitar / quizá / descartar, orden, notas |
| Valoración `/v/` | **Después** de publicar | Private Book | Estrellas y orden sobre la selección |

Conviene decidir si son dos fases deliberadas del mismo viaje o si una sustituye
a la otra, antes de enseñárselas a un cliente a la vez.

## 15. Escenario listo para probar

Hay un shortlist de QA creado y **en punto de partida limpio**:

- Cliente **Paul**, 14 propiedades reales, en inglés.
- Enlace: `/s/qa7paulshortlist`
- Estado: sin abrir, nada decidido.

Al terminar de probarlo, se puede archivar o revocar desde su ficha.
