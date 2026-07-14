# ⚠️ Referencia histórica — Sistema de proxy con Smartproxy (pre-Evomi)

> **Este documento y la rama que lo acompaña (`reference/smartproxy-system-pre-evomi`)
> son un SNAPSHOT DE SOLO LECTURA.** Capturan el último estado 100% funcional
> del sistema de proxy basado en Smartproxy, justo antes de migrar a Evomi
> (Smartproxy se quedó sin GB). Sirve para poder **volver a Smartproxy sin
> tener que redescubrir nada** si en el futuro se decide reactivarlo (p. ej.
> tras recargar saldo, o si Evomi no funciona bien).
>
> **NO fusionar este PR/rama a `main` sin más.** Su diff frente a `main`
> actual es literalmente "deshacer la migración a Evomi" — es intencionado,
> es la utilidad del documento (ver §6 "Cómo restaurar"), pero mezclado sin
> criterio revertiría también las mejoras hechas en paralelo a la migración
> (rotación de país, fix de reintentos, etc.).

## 0. Por qué se dejó de usar

**Motivo único: se agotaron los GB contratados en Smartproxy.** No fue por
mal funcionamiento del código — de hecho, en el momento de la migración el
sistema estaba en su mejor estado (sticky session con el mecanismo OFICIAL
del proveedor, confirmado y funcionando). Simplemente no había más saldo de
tráfico para seguir usándolo.

Commit exacto del último estado funcional: **`5d136b1`**
(`fix(particulares): permitir portal=pisos + no depender del gateway ES roto`,
2026-07-13). El siguiente commit (`61dd0a1`) migró todo a Evomi.

## 1. Arquitectura: DOS productos Smartproxy en la misma cuenta

Esto fue la fuente de más confusión de todo el proyecto — la cuenta de
Smartproxy expone dos formas completamente distintas de usar el proxy
residencial, con **mecanismos de sticky session incompatibles entre sí**:

| | **Extracción API** (el que SÍ funcionaba) | **Gateway usuario/contraseña** (roto/no confirmado) |
|---|---|---|
| Endpoint | `https://www.smartproxy.org/web_v1/ip/get-ip-v3?app_key=…` | `eu.smartproxy.net:3120` con `user:pass@` |
| Formato de IP devuelta | `http://ip:puerto` (**sin** usuario/contraseña) | `http://usuario:contraseña@host:puerto` |
| Autenticación | **IP whitelist** — solo la IP pública del VPS está autorizada a llamar a la API | usuario/contraseña embebidos en la URL |
| Mecanismo de sticky | `life=N` (minutos, 1-120): la API devuelve una IP y **se reutiliza la misma URL** ese tiempo — confirmado oficialmente en la doc del dashboard ("Tiempo máximo de extracción de IP única de 120 minutos") | Se intentó `-session-<id>` en el **username** (convención Smartproxy/Decodo) — **nunca confirmado oficialmente para esta cuenta**, y verificado que **NO funcionaba** (`honra_sticky: false` en el diagnóstico: dos llamadas con la misma "sesión" daban IPs distintas) |
| Pool | Residencial, `cc=ES` inicialmente, luego `cc=` vacío (aleatorio) | Residencial estático, targeting `area-ES_city-MADRID` en el username |
| Estado al momento de migrar | ✅ Funcionando (sticky confirmado) | ⛔ Roto — `CONNECT tunnel failed, response 612` (probablemente por agotamiento de GB) |

**Lección aprendida:** cuando un proveedor de proxy ofrece varios "productos"
en la misma cuenta, verificar SIEMPRE con un test empírico (pedir la misma
sesión dos veces, comparar IP de salida) cuál de ellos realmente ancla la
sesión — no asumir que la convención de un proveedor (username-based) aplica
a otro producto de la misma marca.

## 2. Dónde vivía la configuración (Supabase `app_settings`)

| Clave | Contenido | UI (`/admin/configuracion`) |
|---|---|---|
| `scraping.smartproxy.app_key` | App key de la Extracción API (32 chars hex) | Campo "Smartproxy App Key" |
| `scraping.proxyUrl` | URL del gateway estático (fallback) | Campo "URL del proxy (fallback)" |
| `scraping.capsolver.api_key` | Sin cambios — CapSolver es independiente del proveedor de proxy | Campo "CapSolver API Key" |

Variables de entorno de fallback (si la DB fallaba): `SMARTPROXY_URL`,
`SMARTPROXY_RESIDENTIAL_URL`, `SMARTPROXY_COUNTRY`.

## 3. Archivos del sistema (tal como están en esta rama)

- **`lib/sync/smartproxy-api.ts`** — cliente de la Extracción API
  (`getSmartproxyIP`, `getFreshProxyUrl`). Parámetros: `app_key`, `pt=9`
  (protocolo), `num` (tamaño del pool a barajar), `cc` (país, vacío =
  aleatorio), `life` (minutos de sticky), `format=json`, `protocol=1`
  (HTTP/SOCKS5).
- **`lib/sync/proxy-config.ts`** — capa de abstracción:
  - `getProxyUrl()`: Extracción API con 3 reintentos → fallback a
    `scraping.proxyUrl` estático.
  - `getFreshResidentialProxyUrl(lifeMinutes)`: pide una IP sticky a la
    Extracción API (método preferido); si no hay `app_key`, cae a
    `getResidentialProxyUrl()` + `withStickySession()`.
  - `withStickySession` / `withStickySessionForce`: intento de sticky vía
    modificador `-session-<id>` en el **username** del gateway estático
    (formato Smartproxy/Decodo) — **este es el mecanismo que resultó NO
    funcionar** para el gateway de esta cuenta.
- **`scripts/test-phone-extraction.ts`** — script manual de diagnóstico que
  verificaba el `app_key` en BD antes de probar la extracción.

## 4. Problemas encontrados con Smartproxy (cronología, para no repetirlos)

1. **Bug de clase CSS de Idealista** (no específico de Smartproxy, pero
   descubierto en esta fase): el teléfono a veces viene pre-renderizado en
   el HTML con la clase `hidden-contact-phones_formatted-phone` (guion
   bajo), y el regex original buscaba con guion. Este fix es independiente
   del proveedor de proxy y **sigue vigente** en el código actual.
2. **Sticky por username no confirmado** — ver §1. Costó una ronda entera
   de debugging hasta verificarlo empíricamente con el diagnóstico
   `proxy-health`.
3. **CapSolver rechazaba el User-Agent** (`unsupported userAgent` con
   Chrome 119-121) — bug independiente del proxy, fix (forzar Chrome 131)
   también sigue vigente.
4. **El reto `t=bv` vs `t=fe` de DataDome** — descubrimiento de que
   `contact-phones` da un slider resoluble (`t=fe`) mientras que la
   navegación de página completa da bloqueo duro (`t=bv`). Independiente
   del proveedor, sigue vigente.
5. **Pool de España quemado por DataDome**: con `cc=ES` fijo, Idealista
   devolvía bloqueo duro (`t=bv`) en el 100% de las muestras. Cambiar a
   `cc=` vacío (país aleatorio) **mejoró temporalmente** la tasa de éxito
   (se llegó a medir `todo_ok: true` con una IP `t=fe`), pero en mediciones
   posteriores el pool volvió a dar mayoritariamente `t=bv` incluso con país
   aleatorio — indicando que el problema no era solo España, sino reputación
   general del pool compartido de Smartproxy frente a DataDome.
6. **Soporte de Smartproxy confirmó** (conversación de soporte, ver
   `docs/EXTRACCION-TELEFONOS.md` §6): no garantizan IPs "limpias" en el pool
   residencial compartido, y **no tienen pool móvil (4G/LTE) para España** —
   los proxies móviles son los que mejor evaden DataDome en general.
7. **Motivo final de la baja: se agotó el saldo de GB contratado.**

## 5. Comparación rápida Smartproxy vs Evomi (para decidir si volver)

| | Smartproxy (esta rama) | Evomi (main actual) |
|---|---|---|
| Modificador de sticky | Username (`-session-<id>`, gateway) **NO confirmado/roto**; o `life=` en la Extracción API (SÍ funcionaba) | **Password** (`_session-<id>_lifetime-<min>`) — confirmado en documentación oficial |
| Nº de productos/mecanismos en la cuenta | 2 (Extracción API vs gateway), con reglas distintas | 1 (gateway único, sticky nativo) |
| Sticky verificado en producción | Solo la Extracción API (`honra_sticky: true`); gateway roto | Sí, verificado (`honra_sticky: true`) |
| Rotación de país | `cc=` en la query de la Extracción API | `_country-XX` en el password |
| Motivo de la baja | GB agotados | (activo) |
| Reputación ante DataDome (Idealista) | Mala en el pool ES; mixta en aleatorio | Por confirmar — ver `docs/EXTRACCION-TELEFONOS.md` §0 "Pendiente" |

## 6. Cómo restaurar Smartproxy si hace falta en el futuro

1. Recargar saldo de GB en la cuenta de Smartproxy (`smartproxy.org`).
2. Desde `main`, traer los archivos de esta rama:
   ```bash
   git checkout reference/smartproxy-system-pre-evomi -- \
     lib/sync/smartproxy-api.ts \
     lib/sync/proxy-config.ts
   ```
   (Nota: `proxy-config.ts` actual tiene mejoras hechas DESPUÉS de la
   migración —rotación de país (`EVOMI_COUNTRY_ROTATION`), guardas de
   sticky más robustas— que NO existían en la versión Smartproxy. Revisar
   el diff con cuidado antes de sobrescribir en vez de copiar ciegamente;
   probablemente lo mejor sea portar el mecanismo `life=` de la Extracción
   API al esqueleto actual, no volver al archivo viejo tal cual.)
3. Restaurar en `/admin/configuracion` el campo "Smartproxy App Key" (había
   que volver a añadirlo a la UI — se quitó en la migración a Evomi, ver
   `app/[country]/(admin)/admin/configuracion/configuracion-client.tsx` en
   esta rama para el código del campo).
4. Pegar el `app_key` nuevo (o el mismo si la cuenta sigue activa) en ese
   campo.
5. Verificar con `/api/admin/particulares/proxy-health` (adaptar el
   diagnóstico si sigue con la lógica de un solo proveedor de la versión
   Evomi) que `sticky_verificado.honra_sticky: true`.

## 7. Estado de saldo en el momento de la baja

CapSolver (independiente del proxy, no se tocó): saldo ~$9.6, key válida.
Smartproxy: GB agotados (motivo de la baja, ver §0).
