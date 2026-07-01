# SmartBC → Idealista Autopublish

Extensión de Chrome que rellena automáticamente el formulario de "Nueva propiedad"
en Idealista con los datos preparados en SmartBC, incluida la subida de fotos.

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

## Notas

- Necesitas tener sesión iniciada en idealista.com en el mismo navegador
- El enlace generado desde SmartBC expira a los 30 minutos por seguridad
- Si algún campo no se rellena (Idealista cambia su formulario de vez en cuando),
  el panel flotante muestra qué falló — puedes completarlo a mano y avisar para
  ajustar el selector correspondiente
- Las fotos solo se pueden subir después de completar los campos obligatorios
  (así lo exige Idealista) — la extensión ya respeta ese orden
