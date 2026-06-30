# Sistema de Tracking y Analytics de Smart Links

## Descripción general

Este sistema registra todas las interacciones de usuarios con Smart Links, links públicos y web pública. Permite:

- **Tracking granular**: cada vista, foto, video, click de contacto
- **Seguridad**: bloqueo de IPs maliciosas, detección de bots
- **Analytics**: dashboards con métricas de engagement y conversión
- **Auditoría**: log completo de todas las actividades

## Arquitectura

### Base de datos

**Tablas de tracking:**
- `page_views`: una fila por visita de página (IP, device, navegador, país)
- `page_events`: eventos granulares dentro de una visita (fotos, videos, contacto, etc.)

**Tablas de seguridad:**
- `ip_blacklist`: IPs bloqueadas con razón y severidad
- `ip_whitelist`: IPs permitidas (oficinas, partners)
- `ip_activity_log`: log de todas las actividades por IP

### Frontend tracking (browser)

**`lib/tracking/analytics.ts`** - Singleton que:
- Mantiene sesión en localStorage
- Cola de eventos (flush cada 5s)
- Envío en batch a `/api/tracking/event`
- Usa `navigator.sendBeacon` en beforeunload

### API endpoints

- `POST /api/tracking/page-view` - Registra vista de página (IP, UA parsing, geoIP)
- `POST /api/tracking/event` - Registra eventos en batch

### Middleware de seguridad

**`middleware.ts`** valida IPs en rutas públicas:
1. Whitelist check → permite sin más
2. Blacklist check → bloquea con 403
3. Bot detection → log de actividad

## Cómo usar

### Para admins: Ver analytics

1. Ve a `/admin/analytics`
2. Filtra por período (últimos 30d, este año, personalizado)
3. Filtra por propiedad (opcional)
4. Ve: KPIs, top propiedades, gráficos, últimas sesiones

### Para admins: Gestionar IPs

1. Ve a `/admin/security/ip-management`
2. Tab "IPs Bloqueadas": agregar/remover IPs
3. Tab "IPs Permitidas": whitelist para oficinas/partners
4. Tab "Activity Log": ver historial de actividades

### Para desarrolladores: Integrar tracking

En componentes de React:

```typescript
import { useAnalytics } from "@/hooks/use-analytics";

export function MyComponent({ propertyId }) {
  const trackerRef = useAnalytics({
    pageType: "public_property",
    propertyId,
  });

  const handlePhotoClick = (index) => {
    trackerRef.current?.trackPhotoView(index);
  };

  return <img onClick={() => handlePhotoClick(0)} src="..." />;
}
```

## Limpieza de datos

Para mantener la BD limpia, ejecutar regularmente:

```bash
# Limpia eventos/vistas más antiguos a 90 días
npm run cleanup-events

# O con variable de entorno
RETENTION_DAYS=60 npm run cleanup-events
```

Se recomienda agendar como cron job:

```bash
# /etc/cron.d/smartbc-cleanup
0 2 * * * cd /app && npm run cleanup-events >> /var/log/smartbc-cleanup.log 2>&1
```

## Detección de bots

El sistema detecta bots por:

1. **User-Agent patterns** (googlebot, selenium, curl, etc.)
2. **Comportamiento** (100+ requests/min, eventos demasiado rápido, etc.)
3. **Heurísticas** (UA vacío, genérica, etc.)

Los bots detectados:
- Se registran en `ip_activity_log` con `detected_bot=true`
- Se pueden bloquear manualmente en blacklist
- No afectan a indexadores legítimos (Google, Bing, etc.)

## Performance

- **page_views**: ~150K/mes con datos de 500 visitantes
- **page_events**: ~500K/mes (3-4 eventos por visita)
- Índices en `created_at` para queries rápidas
- Limpieza automática cada noche mantiene tamaño controlado

## Privacy (RGPD)

- IPs se almacenan completas (para bloqueo, no para PII)
- GeoIP se obtiene pero no se guarda en BD (solo país/ciudad)
- Política de retención: 90 días por default
- Los usuarios pueden solicitar eliminación via `/admin`

## Troubleshooting

**Los eventos no se registran:**
- Verificar que `/api/tracking/event` está accesible
- Revisar DevTools Network tab
- Confirmar que `ip-api.com` no está bloqueado (timeout 3s)

**IPs legítimas están bloqueadas:**
- Agregar a whitelist en `/admin/security/ip-management`

**Dashboard vacío:**
- Esperar 5 minutos después de primera visita (flush de eventos)
- Verificar que las migraciones se aplicaron

---

**Última actualización:** 2026-06-30  
**Mantenedor:** DevOps Team
