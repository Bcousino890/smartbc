# Viewing Collections — Final Release Handoff

**v1.0 · Sprint 5 · 2026-08-15**

**Estado: BCP VIEWING COLLECTIONS — PRODUCTION READY**

Desplegado en producción (`main` @ `c5c3f5d`), migraciones aplicadas, validado de extremo a extremo con datos reales en escritorio y móvil. Datos de prueba eliminados. Feature flag activo.

---

## 1. Resumen

| | |
|---|---|
| Commits desplegados | `a88127a` → `c5c3f5d` (6) |
| Migraciones aplicadas | `0122`–`0129` (8) |
| Bugs encontrados en QA real y corregidos | **4** (uno de ellos anterior al módulo y grave) |
| LCP móvil 4G | **839 ms** |
| CLS | **0.0000** |
| Smoke test | 24/24 |
| Datos de prueba | eliminados |

---

## 2. Los cuatro fallos que solo aparecen con datos reales

### 2.1 🔴 El runner de migraciones llevaba meses muerto — `0030`

Al desplegar, la app subió bien pero **sus migraciones nunca se ejecutaron**. El log:

```
→ aplicando 0030_app_settings.sql
ERROR:  policy "admin_all" for table "app_settings" already exists
[warn] app desplegada pero MIGRACIONES fallaron — revisar
```

`0030_app_settings.sql` hacía `CREATE POLICY` sin su `DROP POLICY IF EXISTS`. La tabla ya existía en producción de antes del runner, así que la policy también, y la migración fallaba **en cada deploy**. Como `apply-migrations.sh` corre con `ON_ERROR_STOP=1` y para en el primer error, **ninguna migración posterior llegaba a aplicarse**.

`schema_migrations` tenía 38 filas frente a 135+ ficheros: solo estaban registradas las anteriores a `0030`. Eso explica por qué el esquema había derivado del repositorio y por qué `0117`–`0121` se venían aplicando a mano.

**Corregido:** `0030` es ahora idempotente, y se registró el backlog `0030`–`0121` como aplicado — verificando antes, objeto por objeto, que su contenido está realmente en el esquema (`app_settings`, `captaciones`, `property_applications`, `page_views`, `idealista_leads`, `zinto_conversations`, `api_clients`, `property_video_jobs`, `custom_roles`, `geofence_zones`… y las columnas tardías de `properties`).

**Migraciones pendientes ahora: 0.** El runner vuelve a funcionar para todo el equipo.

### 2.2 🟠 Una parada cancelada impedía publicar

Publicar la colección de prueba falló con *«Hay paradas visibles sin hora asignada»* en un itinerario correcto.

El diseño dice que una parada cancelada se conserva visible a propósito — si desapareciera, el cliente vería cambiar el plan sin explicación — pero por definición no tiene hora: la visita no va a ocurrir. La validación se la exigía igualmente.

**Corregido** (`0129` + `computeReadiness`): la hora solo se exige a las paradas que van a ocurrir, y la checklist del panel dice ahora exactamente lo mismo que la función que publica.

### 2.3 🔴 `insertPageView` escribía la visita pero devolvía 500 — ningún evento se guardaba nunca

`/api/tracking/page-view` devolvía 500 en todas las cargas. La causa:

```ts
.insert(payload, { select: "id" })   // no es la firma de supabase-js
```

El segundo argumento admite `count`, no `select`. La fila **sí** se insertaba, pero la respuesta venía sin datos, la función lanzaba `no row returned` y el endpoint devolvía 500. Sin `pageViewId`, el `flush()` del tracker descarta la cola entera.

Consecuencia: las visitas se contaban, pero **ningún evento granular llegaba a guardarse jamás** — `photo_view`, `video_play`, `plan_view`, `scroll`, `contact_click`, `time_on_page`. Afecta a los SmartLinks desde que existe el tracking, no solo a las colecciones.

**Corregido:** `.insert(payload).select("id").single()`. Verificado en producción tras el arreglo:

```
collection_open = 10   stop_view = 21   time_on_page = 2
page_views atribuidas a la colección = 10
```

### 2.4 🟠 El UUID del share viajaba al HTML público

El smoke test detectó un UUID en el HTML de la colección:

```
"shareId":"eb10219a-4db3-4301-b573-091309fff269"
```

La página lo pasaba como prop al componente cliente para atribuir la analítica, y **todo lo que se pasa como prop viaja en el payload RSC**. No daba acceso a nada (el secreto es el token, y la RLS impide leer `viewing_collection_shares` con la anon key), pero incumple la regla del propio contrato —ningún identificador interno— y el test S-6 la daba por buena porque solo inspecciona el objeto proyectado, no las demás props de la página.

**Corregido:** se pasa el token, que ya es público porque está en la URL, y el endpoint de tracking lo traduce a `share_id` en servidor con `resolveCollectionShareId()`.

---

## 3. QA con datos reales

Colección de prueba controlada sobre **propiedades reales de cartera**, con el cliente «Cliente Prueba» que ya existía en producción. Elegidas para estresar el diseño:

| # | Caso | Estado |
|---|---|---|
| 1 | 83 fotos, venta 1.990.000 € | confirmada · dirección exacta |
| 2 | 78 fotos, ático señorial, título de 58 caracteres | confirmada · dirección exacta |
| 3 | **1 sola foto**, reservada | **propuesta · solo zona** |
| 4 | **título de 88 caracteres**, alquiler | confirmada · dirección exacta |
| 5 | 59 fotos, alquiler 2.400 €/mes | confirmada · dirección exacta |
| 6 | 1 foto | **cancelada · visible** |

Publicada con la función real: **6 SmartLinks creados**, token de 28 caracteres, caducidad a 60 días.

**Resultado visual:** 42 capturas en 6 viewports (375 / 430 / 768 / 1024 / 1440 / 1920) — **sin overflow horizontal y sin errores de consola en ninguno**. Encuadres correctos con fotografía real: la portada aguanta un interior luminoso, la propiedad de una sola foto no muestra el rótulo de galería, y los títulos largos no rompen la composición.

---

## 4. Rendimiento móvil

iPhone Pro (430×932, DPR 3) · 4G a 9 Mbps con 150 ms de RTT · CPU ×4.

| Métrica | Valor | Umbral «bueno» |
|---|---|---|
| **LCP** | **839 ms** | < 2.500 ms ✅ |
| FCP | 839 ms | < 1.800 ms ✅ |
| **CLS** | **0.0000** | < 0.1 ✅ |
| `load` | 1.002 ms | — |
| Peticiones iniciales | 21 | — |
| **Fotos al inicio** | **1** | — |
| Fotos tras hacer scroll | 3 (+2 diferidas) | — |

La estrategia de carga funciona: entra la portada y nada más; el resto llega al hacer scroll. No hizo falta optimizar nada, así que **no se ha sacrificado calidad visual**.

---

## 5. Smoke test en producción — 24/24

**Colección pública:** 200 · portada · cliente · jornada · 6 residencias · estados en palabras · asesor · caducidad.

**Contrato client-safe sobre el HTML real:** sin `owner_*`, sin `internal_notes`, sin `agent_notes`, sin `source_url`, sin `external_id`, **sin UUIDs internos**, sin rutas de Storage, sin labels de SmartLink. Todas las fotos por el proxy `/p/`.

**SmartLinks:** 5+ CTA presentes; el enlace de una residencia responde 200.

**Analítica:** 27 aperturas de servidor, 10 sesiones atribuidas, 31 eventos granulares.

**Ciclo de vida del enlace, verificado en vivo:**

| Acción | Resultado |
|---|---|
| Revocar | la colección deja de ser accesible ✅ |
| Renovar | vuelve a ser accesible ✅ |
| Enlace caducado | bloquea ✅ |
| Token inexistente | 200 (no 404) con la misma página, sin filtrar datos ✅ |
| Feature flag `enabled:false` | apaga la colección sin desplegar ✅ |
| Feature flag `enabled:true` | la restablece ✅ |

`X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` presente.

> **Hallazgo menor durante la prueba de caducidad:** el CHECK `vcs_expiry_sane` (`expires_at > created_at`) impide *retrodatar* una caducidad. Es correcto —no se reescribe la historia— y para cortar el acceso de inmediato ya está la revocación. La caducidad se verificó creando un enlace genuinamente antiguo.

**No regresión:** `/compartir/[slug]` 200 · proxy `/p/` 200 · `/login` 200 · `/es/admin` 307 a login · SmartLink de la colección 200.

---

## 6. Deploy

| | |
|---|---|
| Rama | `main` |
| HEAD | `c5c3f5d` |
| PM2 | `smartbc-portal` online |
| Último deploy | `[ok] deploy completado` |
| Migraciones pendientes | **0** |
| Rutas | `/v/[token]` · `/v/preview/[id]` (staff) |
| Feature flag | `{"enabled": true, "default_expiry_days": 60, "max_expiry_days": 180, "allow_renewal": true}` |

**Nota sobre el proceso:** durante el sprint entraron 12 commits ajenos en `main`. Hicieron falta tres rebases y renumerar mis migraciones de `0123`–`0127` a `0124`–`0128`, porque otro commit ocupó el `0123`. Con el autodeploy corriendo **cada minuto** y alguien más empujando, hubo dos falsos positivos de 400 en assets: son el cambio de hash de chunks a mitad de una medición, no defectos. La app ya tiene su script de recuperación para eso.

---

## 7. Regresión completa

```
npx tsc --noEmit                  limpio
npm run build                     compila
npm run test:viewing-collections  172 asserts, TODO OK
QA visual 6 viewports             42 capturas, sin problemas
smoke test producción             24/24
no regresión rutas públicas       todas 200
```

---

## 8. Idioma

**Se mantiene el español**, según lo previsto. No existe infraestructura de i18n en la superficie pública y montarla no debía retrasar el lanzamiento.

La marca ya está en inglés (*Private Viewing Collection*, *Private Client Services*), así que el registro internacional se sostiene, pero el cuerpo es español.

**La siguiente mejora lógica es permitir español / inglés por colección o por cliente.** Lo natural sería una columna `language` en `viewing_itineraries` (heredando de `profiles`) y un diccionario para la superficie pública: son ~40 cadenas, todas en `app/v/[token]/_components/`. La proyección ya devuelve el texto formateado según `getCountryConfig`, así que el punto de entrada existe.

Relevante: `idealista_leads` tiene un campo `is_international`, señal de que una parte de los clientes no habla español.

---

## 9. Limitaciones restantes

1. **`area_only` no muestra mapa.** No hay centroides de zona fiables (sin PostGIS, `geofence_zones` y `location_hierarchies` vacías, `ZONE_COORDS` cubre 7 de 21 distritos). El texto explica que la dirección llega al confirmar. `areaLocation` ya está en el contrato como tipo aparte: activarlo será rellenar una función.

2. **Sin i18n** — §8.

3. **`profiles_select USING (true)` sigue viva en producción.** Cualquiera con la anon key lee emails y teléfonos de todos los clientes y del staff. Este módulo no lo empeora (la colección pública no carga el cliente Supabase), pero es deuda preexistente que ahora convive con una superficie pública nueva. **Merece su propio ticket.**

4. **7 migraciones legacy siguen sin ser idempotentes** en sus policies. Ya no bloquean porque están registradas como aplicadas, pero si alguien reinicia `schema_migrations` volverán a romper la cola. No las he reescrito: tocar 90 ficheros legacy contra una base viva era más arriesgado que el problema.

5. **Nadie ha usado el módulo a mano todavía.** Todo el QA se hizo por SQL y HTTP contra producción, que cubre la lógica y la superficie pública pero **no el recorrido del agente por la interfaz**. Antes de anunciarlo al equipo conviene que alguien recorra la ficha de un cliente real: añadir a la selección, crear itinerario, arrastrar paradas, previsualizar y publicar.

6. **`share_click` sin datos reales.** El smoke test no pulsó los CTA, así que ese evento no se ha visto llegar de punta a punta (los otros tres sí). El código es el mismo `trackEvent`.

---

## 10. Para el equipo

**Cómo se usa:** ficha de un cliente → *Propiedades seleccionadas* → marcar → *Crear itinerario* → ordenar y poner horas → *Previsualizar* → *Publicar* → copiar el enlace.

**Cómo se apaga:** `/admin/configuracion` → `app_settings.viewing_collections.enabled = false`. Efecto inmediato, sin desplegar.

**Quién puede publicar:** `owner`, `admin`, `advisor`, `agent_admin` y `agent_senior`. `agent_junior` prepara pero no publica. `captadora` no accede.

**Comprobar el estado:**

```bash
SQL64=$(echo "SELECT count(*) FROM viewing_itineraries;" | base64)
ssh root@178.105.185.125 \
  "echo $SQL64 | base64 -d | docker exec -i supabase-db psql -U postgres -d postgres -A -t"
```
