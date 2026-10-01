# SmartBC → Idealista

Extensión de Chrome con tres funciones:

1. **Autopublicar**: rellena automáticamente el formulario de "Nueva propiedad"
   en Idealista con los datos preparados en SmartBC, incluida la subida de fotos.
2. **Leads del inbox**: captura los contactos del inbox de idealista/tools
   (nombre, teléfono, mensaje, perfil de búsqueda y propiedad consultada) y los
   envía a la pestaña **Idealista** de `/admin/solicitudes` en el portal.
3. **Enviar anuncios a la ficha de un cliente**: marca pisos en el listado del
   portal y los manda a la sección **Enlaces de portales** de su ficha, con el
   compañero que los va a llamar ya asignado.

## Instalación (una sola vez)

1. Abre Chrome → `chrome://extensions`
2. Activa **"Modo de desarrollador"** (interruptor arriba a la derecha)
3. Click en **"Cargar descomprimida"**
4. Selecciona la carpeta `chrome-extension/` de este repositorio
5. Listo — la extensión queda instalada permanentemente en tu navegador

## Uso

1. En SmartBC → **Idealista**, prepara la ficha (dirección, precio, fotos, etc.) y guarda
2. Click en **"Abrir en Idealista"** (o "Guardar y abrir en Idealista" desde el formulario)
3. Se abre una pestaña nueva en `idealista.com/tools/propiedad/nuevo`
4. La extensión detecta que viene de SmartBC y rellena el formulario solo — verás
   un panel flotante arriba a la derecha con el progreso
5. Cuando termine, **revisa los datos** y presiona tú mismo **"Guardar y publicar anuncio"**

## Leads del inbox

### Configuración (una sola vez)

1. En el portal (sesión de owner/admin): **Idealista → Configuración**
   (`/es/admin/idealista/configuracion`) → sección **"Token de la extensión
   de Chrome"** → **Generar token** → botón de copiar
2. Chrome → `chrome://extensions` → SmartBC → Idealista → **Opciones**
3. Pega el token y pulsa **Guardar** (dura 1 año; se revoca rotando
   `IDEALISTA_EXT_SECRET` en el VPS)

### Uso

- **Listado**: abre `idealista.com/inbox` → aparece el botón flotante
  **"📤 Enviar a SmartBC"** abajo a la derecha → captura todos los contactos
  visibles de la página (pagina y repite para el resto)
- **Detalle**: al abrir cualquier conversación, la extensión captura
  automáticamente el mensaje completo y el panel "Perfil para búsqueda de
  vivienda" y enriquece el contacto en el portal (badge breve de confirmación)
- **Reenviar**: dentro de una conversación aparece el botón **"🔄 Reenviar a
  SmartBC"** — útil si el hilo es largo (Idealista carga los mensajes viejos
  al hacer scroll hacia arriba: sube hasta el inicio y pulsa Reenviar para
  capturar TODO el historial)
- **Capturar todas (auto)**: el botón **"⏩ Capturar todas"** captura la
  conversación abierta y pasa sola a la siguiente con el botón "Anterior"
  de Idealista, una por una, hasta recorrer todo el inbox. El botón cambia
  a "⏹ Detener (N)" mientras corre — vuelve a pulsarlo para parar. Consejo:
  abre la conversación más reciente y deja que recorra el resto.
- **Llamadas perdidas**: los hilos de tipo "Llamada perdida" (el contacto
  llamó pidiendo información y no fue respondido) también se capturan —
  llegan sin nombre pero con teléfono y la propiedad consultada, y el
  mensaje indica "☎ Llamada perdida". Se recorren igual en el modo auto.
- Los contactos se deduplican por conversación: reenviar no crea duplicados
- En el portal: `/es/admin/solicitudes` → pestaña **Idealista** → etiqueta el
  tipo (Particular / Agencia / Relocation — con sugerencia automática) y usa
  **Fichar** / **Descartar**

## Notas

- Necesitas tener sesión iniciada en idealista.com en el mismo navegador
- El enlace generado desde SmartBC expira a los 30 minutos por seguridad
- Si algún campo no se rellena (Idealista cambia su formulario de vez en cuando),
  el panel flotante muestra qué falló — puedes completarlo a mano y avisar para
  ajustar el selector correspondiente
- Al terminar, la extensión relee el propio aviso de validación de Idealista
  ("Algunos campos parecen ser incorrectos...") y si sigue habiendo errores el
  panel lo dice explícitamente (en vez de mostrar "✓ Listo" a ciegas) con la
  lista exacta de campos pendientes
- Las fotos solo se pueden subir después de completar los campos obligatorios
  (así lo exige Idealista) — la extensión ya respeta ese orden


## Enviar anuncios a la ficha de un cliente

Resuelve el paso previo a que un piso sea ficha nuestra: los que se ven con el
cliente en Idealista (o Fotocasa, Habitaclia, pisos.com) se marcan ahí mismo y
llegan a su ficha del CRM listos para repartir y llamar.

### Uso

1. Abre un listado del portal (o la ficha de un anuncio suelto). Aparece el
   panel **"SmartBC · Enviar a una ficha"** abajo a la derecha y un botón
   **"＋ Añadir"** en la esquina de cada anuncio. En la página de UN anuncio,
   ese anuncio se añade desde el propio panel ("Este anuncio").
2. Pulsa **＋ Añadir** en los que te interesen. El botón pasa a dorado con su
   número de prioridad (**✓ 1**, **✓ 2**…). "Marcar toda la página" los
   añade todos de golpe.
3. Lo marcado se guarda en una **cesta** del navegador: puedes pasar de
   página, abrir un anuncio, volver, cambiar de pestaña o de portal (de
   Idealista a Fotocasa) y la cesta sigue ahí, con lo ya marcado en dorado.
4. En la cesta, cada anuncio tiene su **nota** ("solo WhatsApp", "negociable"…)
   y flechas **▲▼** para ordenar por prioridad. Las dos cosas llegan al CRM:
   la nota se ve en el anuncio y el orden es el de la cola de llamadas.
5. Busca el cliente por nombre o teléfono y elige **quién los llama**. Ambas
   cosas se recuerdan. Con el cliente elegido, lo que ya está en su ficha sale
   como **✓ En ficha** (lo dice el CRM, así que vale también para lo que mandó
   otro compañero).
6. **Enviar** → llegan a la ficha del cliente, en estado *Por llamar*, y salen
   de la cesta. El panel deja un enlace **"Ver en su ficha ↗"**.
7. El botón **–** pliega el panel a una pastilla ("SmartBC · 3 marcados →
   Camila"); se queda plegado al cambiar de página hasta que lo vuelvas a
   abrir.
8. Quien llama abre la ficha, marca el resultado ("no acepta contrato de menos
   de 11 meses", "podemos verlo mañana") y, cuando el piso sigue adelante,
   pulsa **Crear ficha desde el anuncio**: se importa con el importador por
   enlace y queda en la selección del cliente, listo para el itinerario y la
   colección privada.

### Dónde llegan

| Dónde | URL | Qué se ve |
|---|---|---|
| Lista de clientes | `/es/admin/clientes` | Columna **Anuncios**: "3 por llamar", "2 nuevos" (últimas 48 h). Ordenar por *Anuncios por llamar* los pone arriba. |
| Ficha → Resumen | `/es/admin/clientes/<id>` | Tarjeta **Anuncios de portales**: cifras y los 3 últimos que llegaron. |
| Ficha → Propiedades | `/es/admin/clientes/<id>?tab=properties#portal-links` | El bloque **Enlaces de portales**, el primero de la pestaña: llamar, anotar, repartir, crear la ficha. |

La pestaña Propiedades lleva un punto dorado mientras haya anuncios nuevos.

### Notas

- Usa el **mismo token** que los leads del inbox (Opciones de la extensión).
- Reenviar la misma página **no duplica**: el portal deduplica por la URL
  normalizada del anuncio (o por su referencia, cuando el portal la lleva en la
  URL), así que se puede pasar por el listado entero sin miedo.
- Máximo 60 anuncios en la cesta y por envío.
- Los anuncios nuevos entran **al final** de la cola de la ficha, en el orden
  de la cesta. Para colocarlos por delante de los que ya había, se arrastran
  (o ▲▼) en la propia ficha.
- Si un anuncio ya estaba en la ficha, el envío lo salta y **su nota no se
  cambia** (el panel lo dice: "N ya estaban").
- La extracción (título, precio, habitaciones, m², foto) va anclada a URLs y a
  regex de texto, nunca a clases CSS: si un portal cambia su maquetación, el
  campo llega vacío pero **el enlace se envía igual** — que es lo que hace
  falta para llamar.
- El teléfono del anuncio casi nunca está en el listado (los portales lo
  ocultan): se escribe en la propia ficha al llamar la primera vez.
