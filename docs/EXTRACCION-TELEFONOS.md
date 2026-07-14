# Extracción de teléfonos de particulares — Idealista

> Documento técnico del trabajo de extracción de teléfonos: qué hace el sistema,
> qué se probó, qué **no** funcionó y por qué, y cómo está montada la
> infraestructura (proxy residencial + CapSolver). Sirve de referencia para
> retomar el problema.

## 0. Estado actual (actualización — proveedor de proxy migrado a Evomi)

**Smartproxy se agotó (GB consumidos) y se migró a [Evomi](https://evomi.com)**
como único proveedor de proxy residencial. El resto de este documento (§1-§9)
describe el trabajo original hecho con Smartproxy — sigue siendo válido para
entender el *problema* (cómo esconde Idealista el teléfono, el mecanismo
`t=fe`/`t=bv` de DataDome, CapSolver), pero las referencias concretas a
"Smartproxy" / "Extracción API" / gateway con sticky por *username* ya no
aplican al código actual. Ver `lib/sync/proxy-config.ts` para la
implementación vigente.

**Diferencia de formato Evomi vs Smartproxy** (confirmada en
`docs.evomi.com`, no adivinada): los modificadores de sesión van en el
**password**, no en el username:
```
http://usuario:password_country-XX_session-<id>_lifetime-<min>@core-residential.evomi.com:1000
```
- Sticky NATIVO y confirmado (no una suposición): pedir 2 veces la misma
  sesión da la MISMA IP — verificado con `proxy-health`.
- El flujo de teléfono ahora **rota país en cada reintento**
  (`EVOMI_COUNTRY_ROTATION`: worldwide, ES, DE, FR, GB, IT, PT, US) porque la
  reputación de IP ante DataDome varía mucho por pool/país.

### Pendiente / próximos pasos

1. **Verificar si la rotación de país resuelve el bloqueo.** Última medición
   (`proxy-health`, solo país por defecto/worldwide): 6/7 muestras dieron
   `t=bv` (bloqueo duro) con Evomi — igual que le pasaba al pool de España de
   Smartproxy. La rotación por país (recién añadida) no se había probado
   todavía en el momento de escribir esto. Ejecutar
   `GET /api/admin/particulares/proxy-health` y mirar
   `datadome_estrategias.rotacion_pais` / `.verdict`.
2. **Si ningún país resuelve `t=fe`:** evaluar el pool **móvil (4G/LTE)** de
   Evomi si está disponible (los proxies móviles casi nunca reciben bloqueo
   duro de DataDome), o seguir apoyándose en la fuente cross-portal
   `pisos.com` (ver §5 más abajo / `lib/sync/particulares/pisos-scraper.ts`),
   que no depende de DataDome en absoluto y ya está funcionando en producción.
3. **Confirmar en producción con el cron real** (`/api/cron/particulares/scrape`)
   que el número de particulares "con teléfono" sube de forma sostenida tras
   la migración, no solo en el diagnóstico puntual.

## 1. El objetivo

De ~6.100 anuncios de particulares detectados en Idealista (Madrid), solo
~1.260 tenían teléfono. La meta es subir esa cifra mucho (idealmente 3.000+).

## 2. Por qué es difícil: Idealista esconde el teléfono tras DataDome

El teléfono del anunciante **no está** en el HTML de la ficha. Se comprobó en
vivo, ficha a ficha:

- El HTML servido con **UA de WhatsApp** (que pasa DataDome por estar en su
  whitelist de previews de enlaces) trae la ficha completa (~175 KB) pero con
  el enlace `href="tel:"` **vacío** — el número lo inyecta JavaScript al pulsar
  "Ver teléfono".
- El comentario del anunciante (donde algunos particulares escriben su móvil)
  **tampoco** está en el HTML: se carga aparte vía `/ajax/comment.ajax`, que
  está protegido por DataDome.
- El endpoint "abierto" `adContactInfoForDetail.ajax` responde `HTTP 200` sin
  autenticación, pero con `formattedContactPhone1: null` **siempre** (medido en
  38 anuncios → 0 con teléfono). Además marca `mustBeContactedOnlyWithProfile:
  true` en muchos.
- El número real solo lo entrega `/es/ajax/ads/{id}/contact-phones`, que está
  **protegido por DataDome**.

**Conclusión:** conseguir el teléfono en Idealista obliga a **vencer DataDome**
en el endpoint `contact-phones`. No hace falta login/perfil de inquilino, pero
sí pasar el anti-bot.

## 3. Infraestructura anti-bot

### 3.1 Smartproxy — dos productos distintos en la cuenta

La cuenta de Smartproxy expone **dos** formas de usar el proxy residencial, con
mecanismos de *sticky session* **diferentes**. Esto fue fuente de mucha
confusión y de un bug real:

| | **Extracción API** (usado) | **Gateway usuario/contraseña** |
|---|---|---|
| Endpoint | `smartproxy.org/web_v1/ip/get-ip-v3?app_key=…` | `eu.smartproxy.net:3120` con `user:pass@` |
| Formato IP | `http://ip:puerto` (SIN usuario/contraseña) | `http://user:pass@host:puerto` |
| Autenticación | **IP whitelist** (solo la IP del VPS está autorizada) | usuario/contraseña |
| Sticky session | **`life=N minutos`**: pides una IP y la **reutilizas** ese tiempo | modificador en el username (p.ej. `-session-<id>`) |
| Pool | Residencial España (~25 GB disponibles) | Residencial |

**Hallazgo clave (verificado con el diagnóstico `proxy-health`):**
- La **Extracción API SÍ ancla la IP** (`honra_sticky: true`: dos llamadas
  seguidas reutilizando la URL dan la misma IP). Es el método **preferido**,
  porque su semántica de stickiness está **confirmada por el proveedor**.
- El **gateway estático NO honra** el modificador `-session-<id>` en esta
  cuenta (`honra_sticky: false`: dos llamadas con la misma "sesión" dan IPs
  distintas — `188.26.192.202` vs `90.68.209.168`). Es decir, el primer intento
  de sticky session vía username **era un no-op silencioso**.

Por qué importa el sticky: el flujo de teléfono hace **varias llamadas `curl`
seguidas** (cargar ficha → cookie DataDome → `contact-phones`). Cada `curl` es
una conexión nueva; si cada una sale por una IP distinta, DataDome ve la cookie
emitida para la IP-A llegando desde la IP-B → **bloqueo duro instantáneo**.

Config en código: `lib/sync/smartproxy-api.ts` (llama a la Extracción API con
`life`/`num` parametrizables) y `lib/sync/proxy-config.ts`
(`getFreshResidentialProxyUrl(lifeMinutes)` — pide UNA IP con `life` corto por
búsqueda y se reutiliza).

### 3.2 CapSolver — resolución del CAPTCHA de DataDome

- API key en `app_settings["scraping.capsolver.api_key"]` (formato `CAP-<64 hex>`).
- Verificado operativo: saldo ~$9.6, la key resuelve tareas.
- **Bug encontrado y corregido:** CapSolver rechazaba el UA con
  `ERROR_INVALID_TASK_DATA: unsupported userAgent`. Chrome 119-121 (2023-24) ya
  no están soportados. Se fuerza **Chrome 131**. Probado: con Chrome 131 el
  error desaparece y CapSolver pasa a validar el proxy.

## 4. El mecanismo de reto DataDome: `t=fe` vs `t=bv` (breakthrough)

Este fue el descubrimiento central de por qué CapSolver **siempre** fallaba con
`"blocked captcha url is not supported"`:

DataDome tiene dos tipos de reto, y **solo uno es resoluble**:

- **`t=fe`** = *slider* interactivo → **CapSolver SÍ lo resuelve**.
- **`t=bv`** = bloqueo duro (IP baneada) → **no hay slider que resolver**, no
  tiene solución.

Y lo importante: **el tipo de reto depende de por dónde entras**:

- La **navegación de página completa** (lo que hacía el fallback de Playwright)
  devuelve **`t=bv`** → irresoluble → CapSolver lo rechazaba.
- El **endpoint AJAX `contact-phones`** devuelve **`t=fe`** (slider resoluble) y
  además entrega la **URL exacta del captcha en el cuerpo del 403**:
  ```json
  {"url":"https://geo.captcha-delivery.com/captcha/?...&t=fe&..."}
  ```
  (o, en su variante HTML, un objeto `var dd={…,'t':'fe',…}` del que se
  reconstruye la URL).

Verificado con la API key real: al pasarle a CapSolver la URL `t=fe` correcta,
el error `"not supported"` desaparece.

**El bug de todo este tiempo:** el código nunca leía la URL del reto del cuerpo
del 403; iba a Playwright (página completa → `t=bv`) y le daba a CapSolver una
URL irresoluble.

### Flujo correcto implementado (`fetchIdealistaPhoneViaAjax`)

1. Pedir UNA IP residencial fresca (Extracción API, `life` corto) y usarla en
   **todo** el flujo (sticky).
2. Cargar la ficha con UA de WhatsApp (pasa DataDome) para sembrar cookies.
3. Llamar a `contact-phones` → 403 con el reto en el cuerpo.
4. `extractDatadomeChallengeUrl()` parsea la `captchaUrl` (`t=fe`) de los dos
   formatos reales (JSON y HTML `var dd`), detectando `t=fe` vs `t=bv`.
5. Si `t=fe` → CapSolver la resuelve con el **mismo proxy sticky** → devuelve la
   cookie datadome válida para esa IP.
6. Reintentar `contact-phones` con esa cookie desde la misma IP → teléfono.
7. Si `t=bv` → IP baneada: **no** gasta saldo de CapSolver y **salta** Playwright
   (misma IP, mismo baneo) para no perder ~60 s.

## 5. Fuentes de teléfono adicionales (sin depender de DataDome)

Además de `contact-phones`, el extractor mina el teléfono de donde sea gratis:

- **HTML estático:** algunas fichas sí traen el `href="tel:+34…"` prerrenderado.
  Se corrigió un bug de clase CSS (`hidden-contact-phones_formatted-phone` con
  guion bajo vs guion) que hacía perder esos números.
- **Descripción / comentario del anunciante:** módulo `phone-from-text.ts` que
  extrae el móvil escrito en texto libre (suelto, agrupado `666 77 78 88`, con
  prefijo `+34/0034`, dígito a dígito, escrito con letras "seis seis…"), con
  guardas anti falsos positivos (precios, m², años, referencias, números
  institucionales 90x/80x del propio portal como el 900 423 525).
- **`/ajax/comment.ajax`:** se pide con el mismo proxy sticky y se mina el texto.

## 6. Estado actual y problema abierto

Con TODO lo anterior desplegado, el diagnóstico `proxy-health` mostró:

- ✅ CapSolver OK
- ✅ Extracción API: conecta y **sticky funciona**
- ⛔ **DataDome: 5/5 muestras = `t=bv`** con las IPs residenciales de España

Es decir: la arquitectura es correcta (sticky OK, CapSolver OK, parser OK), pero
**el pool residencial de Smartproxy está muy baneado por DataDome en Idealista**
justo ahora. Soporte de Smartproxy confirmó que **no pueden garantizar IPs
"limpias"** y que **no tienen pool móvil (4G/LTE) para España** (los IPs
móviles son los que mejor evaden DataDome).

Para saber si es recuperable, el diagnóstico prueba varias estrategias de UA
sobre la misma IP y sobre IPs distintas (`datadome_estrategias`): si alguna da
`t=fe`, es cuestión de ajuste; si todas dan `t=bv`, el pool está baneado y el
único camino es un proxy más limpio o móvil.

## 7. Recomendaciones

1. **Proxy móvil (4G/LTE) o residencial premium** para España (Smartproxy no lo
   tiene; sí IPRoyal, Bright Data, Oxylabs). Es el cambio con más impacto:
   DataDome casi nunca da bloqueo duro a IPs móviles.
2. **Reintentos con IP fresca:** el flujo ya pide una IP nueva por intento; con
   un pool medianamente limpio, unos pocos reintentos encuentran una IP `t=fe`.
3. **Fuente alternativa cross-portal** (estilo Casafari): `pisos.com` expone el
   teléfono del particular directamente en el HTML (`"telefono":"…"`), sin
   DataDome. Se añadió como fuente secundaria (`portal="pisos"`). Es la vía más
   fiable mientras el proxy de Idealista no coopere.

## 8. Herramientas de diagnóstico

- `GET /api/admin/particulares/proxy-health` (Owner/Admin) — estado de
  CapSolver, ambos métodos de proxy, verificación real de sticky, y % de IPs del
  pool resolubles (`t=fe`) vs baneadas (`t=bv`) ahora mismo.
- `GET /api/admin/particulares/extract-phone?adId=…&debug=1` — traza completa
  del flujo de teléfono para una ficha (qué endpoint respondió qué, tipo de
  reto, resultado de CapSolver).
- Panel "Testear extracción de teléfono" en `/admin/particulares`.

## 9. Archivos clave

| Archivo | Rol |
|---|---|
| `lib/sync/particulares/idealista-advertiser-detector.ts` | Núcleo: flujo AJAX de teléfono, parser del reto DataDome, extracción de teléfono del HTML |
| `lib/sync/particulares/fetch-phone-with-playwright.ts` | Fallback con navegador headless + stealth + CapSolver |
| `lib/sync/particulares/solve-datadome-with-capsolver.ts` | Integración con CapSolver (DatadomeSliderTask) |
| `lib/sync/particulares/phone-from-text.ts` | Minado de teléfono desde texto libre |
| `lib/sync/smartproxy-api.ts` | Extracción API de Smartproxy (IP fresca con `life`) |
| `lib/sync/proxy-config.ts` | Resolución de proxy (Extracción API preferida, gateway fallback) |
| `app/api/cron/particulares/scrape/route.ts` | Cron de scraping de Idealista |
| `app/api/admin/particulares/proxy-health/route.ts` | Diagnóstico de salud del pipeline |
