# Publicar la extensión SmartBC en la Chrome Web Store

La extensión deja de instalarse con un zip "sin empaquetar" y pasa a la Chrome
Web Store: se instala con un clic, **se actualiza sola** en todos los
navegadores del equipo y su ID queda fijo (lo que permite bloquear copias, ver
abajo).

## Qué protege de las copias (y qué no)

Una extensión de Chrome **no se puede hacer imposible de copiar**: Chrome baja
su código al ordenador de quien la instala. Lo que sí está hecho es que una
copia **no sirva para nada** y cueste encontrarla:

| Capa | Qué hace |
|---|---|
| Usuario del CRM | Sin una cuenta del equipo, la extensión no envía ni recibe nada. |
| Token por persona | Cada uno conecta la suya; se desconecta a cualquiera desde el CRM. Caduca a los 60 días sin uso. |
| Token atado a la instalación | El token solo vale en peticiones con `Origin: chrome-extension://<ID>` de la extensión que lo pidió. Ese Origin lo pone Chrome. Una copia tiene otro ID: el CRM le contesta 403 aunque le peguen un token robado (probado). |
| ID oficial | Al publicar, se apunta el ID de la tienda en el CRM: ninguna otra extensión puede ni conectarse. |
| Visibilidad "No listada" | No aparece en búsquedas de la tienda: solo se instala con el enlace. |
| Código minificado | `npm run build:extension` lo compacta (140 KB → 59 KB). La tienda **prohíbe ofuscar** —una extensión ofuscada se rechaza—, así que no se puede ir más allá en el propio código. |
| Aviso de copyright | Cada fichero lo lleva. |

El valor está en el servidor (clientes, match, CRM): la extensión es solo la
ventanilla.

## Paso a paso

### 1. Cuenta de desarrollador (una sola vez)
1. Entra en <https://chrome.google.com/webstore/devconsole> con la cuenta de
   Google de la empresa (no una personal: quien tenga esa cuenta controla la
   extensión).
2. Paga la cuota única de registro (5 USD) y verifica el correo de contacto.

### 2. Generar el paquete
```bash
npm run build:extension
# → dist/smartbc-extension-2.0.0.zip
```
Antes de cada versión nueva, sube `version` en `chrome-extension/manifest.json`
(la tienda no acepta dos veces el mismo número).

### 3. Subirlo
1. Devconsole → **Nuevo elemento** → sube el zip.
2. **Ficha de la tienda** (textos abajo), icono 128×128
   (`chrome-extension/icons/icon-128.png`) y al menos una captura de 1280×800.
3. **Prácticas de privacidad** (respuestas abajo). URL de la política:
   `https://portal.bcousinoprop.com/privacidad/extension`
4. **Distribución → Visibilidad: «No listado»**. Si la empresa usa Google
   Workspace con el dominio, «Privado» es aún más cerrado: solo pueden
   instalarla las cuentas del dominio.
5. Enviar a revisión (suele tardar entre unas horas y pocos días).

### 4. Cuando la aprueben
1. Copia el **ID** del elemento (32 letras, aparece en la URL de la ficha).
2. CRM → **Extensión de Chrome** → *Seguridad de la extensión*:
   - pega el ID en **IDs de extensión admitidos**;
   - pega el enlace de la tienda en **Enlace de instalación**;
   - guarda.
3. Manda el enlace al equipo. Cada uno: instalar → icono de SmartBC → **Conectar
   con mi usuario**.
4. Cuando todos estén conectados (CRM → Extensión de Chrome → *Todo el
   equipo*), **desmarca «Aceptar todavía el token compartido antiguo»** y
   desinstala la versión 1.x de los navegadores.

## Textos para la ficha

**Nombre:** SmartBC

**Resumen (≤132 caracteres):**
Manda anuncios de Idealista, Fotocasa, Habitaclia y pisos.com a la ficha de tus clientes en SmartBC.

**Descripción:**
Herramienta interna del equipo de Benjamín Cousiño Propiedades. Requiere un usuario del CRM SmartBC.

- Marca con «＋ Añadir» los anuncios que ves con un cliente en Idealista, Fotocasa, Habitaclia o pisos.com, añade una nota y ordénalos por prioridad.
- Envíalos a la ficha del cliente con quien los va a llamar ya asignado. Lo marcado se guarda aunque cambies de página o de portal.
- «✓ En ficha» muestra lo que ya se envió, lo haya mandado quien sea.
- Captura los contactos de tu buzón de Idealista en el CRM.

Cada persona conecta la extensión con su propio usuario desde el CRM; no se guarda ninguna contraseña.

**Categoría:** Herramientas de trabajo / Productividad · **Idioma:** español

## Prácticas de privacidad (formulario de la tienda)

**Finalidad única:** enviar al CRM SmartBC de la empresa los anuncios inmobiliarios
que el agente marca en portales y los contactos de su buzón de Idealista.

**Justificación de permisos:**
- `storage`: guardar la cesta de anuncios marcados, sus notas y la conexión del usuario.
- Acceso a `idealista.com`, `fotocasa.es`, `habitaclia.com`, `pisos.com`: mostrar el botón «＋ Añadir» y el panel sobre los anuncios, y leer los datos del anuncio que el agente marca.
- Acceso a `portal.bcousinoprop.com`: enviar los anuncios y contactos al CRM y conectar la extensión con el usuario.
- Código remoto: **no** se usa (todo el código va en el paquete).

**Datos que se recogen** (marcar en el formulario): información de identificación
personal (nombre y teléfono del anunciante o del contacto, cuando el portal los
muestra), comunicaciones (mensajes del buzón de Idealista del propio agente),
autenticación (token de conexión).

**Certificaciones:** no se venden a terceros · no se usan ni transfieren para
fines ajenos a la finalidad única · no se usan para evaluar solvencia ni para
préstamos.
