# Migración de Evomi Residential a Evomi Mobile Pool

**Estado actual:** Evomi residential está completamente bloqueado por DataDome (t=bv).  
**Solución:** Contratar Evomi Mobile Pool (4G/LTE). DataDome raramente bloquea IPs mobile.

---

## Paso 1: Contratar Mobile Pool en Evomi

1. Accede a https://dashboard.evomi.com/settings
2. Localiza tu plan actual (probablemente "Residential Proxy")
3. Busca la opción "Mobile Pool" o "4G/LTE Proxies"
4. Si no está disponible, contacta `support@evomi.com`:
   - Asunto: "Upgrade to Mobile Pool"
   - Mensaje: "I need to upgrade from Residential to Mobile Pool. My current subscription is [tu username]."
5. Una vez aprobado, obtén las credenciales en el dashboard:
   - URL base: algo como `http://user:pass@mob.evomi.com:1000`
   - Anota exactamente tal cual aparece

---

## Paso 2: Actualizar en SmartBC

### A) Vía panel /admin/configuracion (recomendado)

1. En producción, accede a https://portal.bcousinoprop.com/admin/configuracion
2. Busca la sección "Proxy configuration"
3. En el campo "Proxy URL", reemplaza la URL anterior por:
   ```
   http://user:pass@mob.evomi.com:1000
   ```
   (Donde `user`, `pass` y el host son los de Evomi Mobile)
4. Guarda

El sistema auto-detecta que es Evomi y aplica automáticamente:
- Sticky sessions (session-ID)
- Rotación de países (worldwide → ES → DE → etc.)
- Expert settings como EVOMI_FRAUDSCORE si está configurado

**⚠️ No toques nada más del código.** La autodetección funciona.

### B) Si prefieres actualizar en código (avanzado)

```bash
# En la VPS o localmente:
cd /home/vps/smartbc  # o tu path local

# Actualizar .env.production
echo "EVOMI_MOBILE_URL=http://user:pass@mob.evomi.com:1000" >> .env.production

# Commit
git add .env.production
git commit -m "chore(proxy): migrar a Evomi Mobile Pool"
git push origin main

# En la VPS, el cron auto-deployará en ~5 min
```

---

## Paso 3: Verificar que funciona

### Via /admin/particulares/proxy-health (recomendado)

1. Accede a https://portal.bcousinoprop.com/admin/particulares/proxy-health
2. Espera ~30s mientras ejecuta diagnóstico
3. Busca en el JSON:
   - **"proxy_status":** debe ser ✅ (conecta sin error)
   - **"datadome_verdicts":** debe mostrar `"t=fe"` (SOLVABLE) o `"OK"` en lugar de `"t=bv"`
   - **"capsolver_end_to_end":** si aparece `"t=fe"`, debe devolver `"solved": true`

### Via logs (alternativa)

```bash
# En la VPS:
tail -f /var/log/pm2/smartbc-error.log | grep -i "datadome\|proxy\|contact-phones"

# O ver últimos requests:
curl -s http://localhost:3000/api/admin/particulares/proxy-health \
  -H "Authorization: Bearer YOUR_CRON_SECRET" | jq .
```

---

## Paso 4: Si sigue fallando

### ¿Evomi Mobile también está bloqueado?

Raro, pero posible. Síntomas:
- `/admin/particulares/proxy-health` sigue mostrando `"t=bv"`
- Ningún país devuelve `"t=fe"`

**Soluciones:**
1. Contacta a Evomi support: "¿Por qué Mobile Pool también está bloqueado por DataDome?"
2. Cambia temporalmente a **Smartproxy Mobile** (si tienes contratado)
   - URL: `http://user:pass@mob.smartproxy.net:3120`
   - Código auto-detecta y funciona igual
3. Prueba **Geonode Mobile** (fallback último)
   - URL: `http://geonode-user-residential_country-ES:pass@host:10000`

---

## Resumen técnico (para referencia)

El código en `lib/sync/proxy-config.ts`:
- Detecta automáticamente el proveedor por el host/username
- Aplica sticky sessions según protocolo de cada proveedor
- Evomi (residential + mobile) usan el mismo formato URL
- Cambiar de residential a mobile es **solo cambiar la URL**, sin código

**Costo estimado:** Mobile Pool cuesta ~3-5x más que residential por GB.  
**Ganancia:** DataDome raramente bloquea IPs mobile → CAPTCHAs solvables → CapSolver funciona.

---

## Contactos rápidos

- **Evomi Support:** support@evomi.com (responden en ~2h)
- **Evomi Docs Mobile:** docs.evomi.com/proxy-instructions/mobile-proxies
- **Smartproxy Mobile:** smartproxy.net (si necesitas alternativa)
