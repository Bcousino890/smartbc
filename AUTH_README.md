# Sistema de Autenticación SmartBC - Guía de Prueba

## 📋 Descripción General

Se ha implementado un sistema de autenticación ligero para desarrollo usando credenciales de prueba. El sistema utiliza `localStorage` para persistir sesiones entre recargas de página.

## 🔐 Credenciales de Prueba

### Cliente
- **Email:** `cliente@smartbc.com`
- **Contraseña:** `cliente123`
- **Acceso:** Portal de cliente con funcionalidades de búsqueda de propiedades

### Administrador
- **Email:** `admin@smartbc.com`
- **Contraseña:** `admin123`
- **Acceso:** Panel administrativo con gestión de clientes, propiedades y reportes

## 🏗️ Arquitectura Implementada

### Archivos Creados/Modificados

1. **`lib/auth.ts`** (Nuevo)
   - Gestión centralizada de autenticación
   - `validateCredentials()` - Valida email y contraseña
   - `saveSession()` - Persiste sesión en localStorage
   - `getStoredSession()` - Recupera sesión almacenada
   - `clearSession()` - Limpia sesión al cerrar sesión

2. **`components/login-form.tsx`** (Modificado)
   - Integración con sistema de autenticación
   - Validación de credenciales en tiempo real
   - Manejo de errores y estados de carga
   - Redirección automática al dashboard apropiado

3. **`app/dashboard/cliente/page.tsx`** (Nuevo)
   - Dashboard específico para clientes
   - Funcionalidades:
     - Propiedades disponibles
     - Mis favoritos
     - Mis visitas
     - Personal Shopper
   - Validación de sesión en lado cliente

4. **`app/dashboard/admin/page.tsx`** (Nuevo)
   - Dashboard específico para administradores
   - Funcionalidades:
     - Gestión de clientes
     - Gestión de propiedades
     - Agencias y comisiones
     - Reportes y análisis
   - Validación de sesión en lado cliente

## 🔄 Flujo de Autenticación

```
1. Usuario visita /login
   ↓
2. Completa formulario con email y contraseña
   ↓
3. Sistema valida credenciales contra DEMO_CREDENTIALS
   ↓
4. Si es válido:
   - Guarda sesión en localStorage
   - Redirige a /dashboard/{role}
   
5. Si es inválido:
   - Muestra mensaje de error
   - Permite reintentar
   ↓
6. En dashboard:
   - Verifica sesión al cargar
   - Si sesión no existe o es inválida → redirige a /login
   - Si es válida → muestra contenido del dashboard
   ↓
7. Al hacer clic en "Salir":
   - Limpia sesión de localStorage
   - Redirige a /login
```

## 🚀 Cómo Probar

### 1. Instala las dependencias
```bash
npm install
```

### 2. Inicia el servidor de desarrollo
```bash
npm run dev
```

### 3. Abre en el navegador
```
http://localhost:3000
```

### 4. Prueba con las credenciales
- **Primero como Cliente:**
  - Email: `cliente@smartbc.com`
  - Contraseña: `cliente123`
  - Verifica que puedas acceder al Portal de Cliente

- **Luego como Administrador:**
  - Email: `admin@smartbc.com`
  - Contraseña: `admin123`
  - Verifica que puedas acceder al Panel Administrativo

### 5. Valida la persistencia de sesión
- Una vez autenticado, recarga la página (F5)
- La sesión debe persistir sin necesidad de volver a iniciar sesión
- Haz clic en "Salir" para cerrar sesión

## 🔄 Validaciones Implementadas

✅ Validación de email y contraseña  
✅ Validación de rol (cliente/admin)  
✅ Persistencia de sesión entre recargas  
✅ Redirección a login si sesión no existe  
✅ Prevención de acceso directo a dashboards sin autenticación  
✅ Estados de carga durante validación  
✅ Mensajes de error informativos  
✅ Logout seguro con limpieza de sesión

## ⚠️ Notas Importantes

- Este es un sistema de **desarrollo temporal**
- Las credenciales están **hardcodeadas** en el código
- La sesión se guarda en **localStorage** (no es seguro para producción)
- **No hay encriptación** de datos sensibles
- **No hay validación backend** real

## 🔮 Próximos Pasos (Para Producción)

1. Reemplazar con autenticación real (NextAuth.js, Supabase, etc.)
2. Implementar validación en servidor
3. Usar tokens JWT o sesiones seguras
4. Agregar middleware de protección de rutas
5. Implementar base de datos para usuarios reales
6. Agregar recuperación de contraseña
7. Implementar factor de autenticación de dos pasos (2FA)
8. Agregar auditoría de accesos

## 📝 Estructura de la Sesión Guardada

```typescript
{
  email: string;           // Email del usuario
  role: "cliente" | "admin"; // Rol del usuario
  isAuthenticated: boolean; // Estado de autenticación (siempre true si está guardado)
}
```

## 🐛 Solución de Problemas

**"No puedo iniciar sesión"**
- Verifica que uses exactamente las credenciales indicadas
- Asegúrate de que no hay espacios adicionales

**"Se borra mi sesión al recargar"**
- Verifica que las cookies/localStorage estén habilitadas en el navegador
- Abre la consola (F12) y revisa si hay errores

**"No puedo acceder al dashboard"**
- Verifica que hayas iniciado sesión correctamente
- Asegúrate de usar la URL correcta (/dashboard/cliente o /dashboard/admin)

---

**Creado:** 2026-05-08  
**Estado:** Sistema de autenticación de prueba completado ✅
