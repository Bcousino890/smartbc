# SmartBC → Idealista

Extensión de Chrome con dos funciones:

1. **Autopublicar**: rellena automáticamente el formulario de "Nueva propiedad"
   en Idealista con los datos preparados en SmartBC, incluida la subida de fotos.
2. **Leads del inbox**: captura los contactos del inbox de idealista/tools
   (nombre, teléfono, mensaje, perfil de búsqueda y propiedad consultada) y los
   envía a la pestaña **Idealista** de `/admin/solicitudes` en el portal.

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

1. Con sesión de owner/admin en el portal, genera el token de la extensión:
   ```
   curl -X POST https://portal.bcousinoprop.com/api/admin/idealista/extension-token \
     -H "Cookie: <tu sesión>"
   ```
   (o desde la consola del navegador logueado en el portal:
   `fetch("/api/admin/idealista/extension-token", {method:"POST"}).then(r=>r.json()).then(console.log)`)
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
- Las fotos solo se pueden subir después de completar los campos obligatorios
  (así lo exige Idealista) — la extensión ya respeta ese orden
