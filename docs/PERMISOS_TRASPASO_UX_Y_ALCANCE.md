# Traspaso: Usuarios/Permisos (UX) y alcance configurable

Fecha: 2026-10-18 · Rama: `fix/usuarios-ux-modelo-roles` (último commit `08b0722f`)
Árbol de trabajo limpio: no hay cambios sin confirmar.

## 1. Estado real (leer primero)

- **Lo que se publicó en `main` (341d9ab4) NO pasó por PR ni revisión.** Hice `git push origin HEAD:main` cuando se pidió un PR en borrador. Ya está desplegado en producción. Decisión pendiente del dueño: **dejarlo** o **revertir `main` a `2e2631b7`**.
- `08b0722f` (alcance por sección) solo está en la rama, no en `main`.
- No hay PR abierto. El formulario de PR en borrador se mostró y no se llegó a enviar.
- `gh` no está instalado en el VPS/terminal; los PR se crean con el conector de GitHub.

## 2. Qué contiene la rama (listo)

| Archivo | Qué hace |
|---|---|
| `app/[country]/(admin)/admin/usuarios/users-directory.tsx` | Directorio: pestañas con contadores, búsqueda, filtros de estado y país, un botón «Crear», tabla ≥md y tarjetas <md, «Mostrar más». |
| `app/[country]/(admin)/admin/usuarios/usuarios-client.tsx` | Solo orquesta modales y el directorio. Se quitó el listado antiguo y el botón muerto «Reenviar invitación». |
| `app/[country]/(admin)/admin/usuarios/page.tsx` | Acepta el rol `captadora`. |
| `components/admin/permissions/permissions-drawer.tsx` | Panel de permisos: resumen, búsqueda, «solo excepciones», cambios sin guardar, solo lectura, historial con etiquetas. |
| `components/admin/permissions/permission-matrix.tsx` | Matriz por áreas; cada sección se despliega y muestra alcance + qué hace cada interruptor. |
| `components/admin/permissions/permission-details.ts` | Textos por sección y acción, y `PERMISSION_SCOPE` (alcance por sección). Lo no verificado dice «no verificado». |
| `components/admin/permissions/permission-areas.ts` | Agrupa secciones en áreas y calcula conteos. |
| `components/admin/permissions/role-badge.tsx` | Insignia de perfil con matiz y chip «heredado». |
| `scripts/test-permission-areas.mts` + script `test:permission-areas` | 5 pruebas, pasan. |

Verificación hecha: `tsc --noEmit` limpio; `npm run test:permission-areas` pasa; capturas a 1440/1024/390 con datos simulados (página de pruebas en `app/a/dev-preview/`, **excluida de git**, no commiteada).

**Falta comprobar:** en producción no se ha verificado el despliegue ni la pantalla real con datos reales.

## 3. Lo que pidió el dueño y NO está hecho

### 3.1 Selección múltiple / configurar por grupo (decisión pendiente)
- Opción A (recomendada): en la lista, marcar varios usuarios y aplicar el mismo cambio. Reutiliza `POST /api/admin/usuarios/[id]/permissions` por usuario. No cambia el perfil base.
- Opción B: plantilla por perfil. Cambia el valor base de todas las personas de ese perfil. Requiere tocar el modelo de roles en servidor. Más riesgo.

### 3.2 Alcance configurable por persona y sección («todas» / «solo las suyas» / «ninguna»)
- **Hoy:** el alcance lo fija el perfil en código (`getViewRestriction` en `lib/permissions.ts` ~623-656). No se puede cambiar por persona.
- **Falta:**
  1. Modelo: tabla o columnas de alcance por persona y sección (ver / editar), con herencia del perfil. Migración nueva al final de la lista (no tocar migraciones antiguas).
  2. Servidor: aplicar el alcance en **cada** listado, ficha y acción de escritura. Sin esto, la pantalla miente.
  3. Pantalla: selector «Ver» y «Editar» por sección.
- **Clientes y captaciones:** ya tienen responsable (`profiles.assigned_advisor_id` en clientes; asignación en captaciones). Se puede empezar aquí.
- **Propiedades: NO tienen responsable por asesor.** Todo el staff ve la misma cartera (confirmado en `lib/db/queries/view-scope.ts`). Para «solo las mías» hace falta decidir:
  - (a) **Asesor responsable:** campo nuevo en la propiedad, migración, asignación al crear/editar. Recomendado.
  - (b) **Quien la dio de alta:** sin migración de datos, pero no cubre reasignaciones.

### 3.3 «Solo las suyas» en la ficha (ver / editar / publicar)
Depende de 3.2 y de la decisión de 3.2 sobre propiedades. Pendiente de definir: qué puede editar un asesor de solo su cartera en una propiedad que no es suya (probablemente nada).

## 4. Riesgos conocidos (no resueltos, de la auditoría)

Están en `docs/PERMISOS_ANALISIS_DETALLADO.md` (parte B y resumen). Prioridad alta, **independientes de este trabajo de UX**:
- Endpoints sin sesión: `captaciones/[id]/contacts`, `idealista/status-history`, `/api/admin/notifications`.
- `usuarios/create-with-password` no valida el rol (permite crear `owner`) y devuelve la contraseña.
- `agent_admin` puede tocar owner/admin.
- BD (verificar con `docs/PERMISOS_VERIFICACION_BD.sql`): `app_settings` con `using (true)`, `properties_auth_select` expone datos del propietario, RLS de `profiles`, tablas de permisos sin RLS.
- Los `Sin efecto hoy` de la matriz son honestos: hay recursos sin pantalla (documentacion, diagnostico, agencias escritura). Un interruptor sin efecto no protege nada.

## 5. Orden recomendado al retomar

1. Decidir sobre `main`: **revertir o aceptar** el despliegue sin PR. Si se acepta, abrir PR a posteriori para revisión.
2. Abrir PR de la rama `fix/usuarios-ux-modelo-roles` (en borrador) con este documento como referencia.
3. Corregir riesgos alta prioridad de la sección 4 (son seguridad, no UX).
4. Decidir 3.1 (opción A o B) y 3.2 (responsable de propiedades).
5. Implementar alcance: Clientes → Captaciones → Propiedades.

## 6. Preguntas abiertas para el dueño

- ¿Revertir `main` o dejar el despliegue?
- ¿Selección múltiple (A) o plantilla por perfil (B)?
- ¿Propiedades: responsable asignado (a) o quien la dio de alta (b)?
- ¿Un asesor de solo su cartera puede editar propiedades que no son suyas? (Propuesta: no.)

## 7. Comandos útiles

```bash
# Ver lo último en la rama
git log --oneline origin/fix/usuarios-ux-modelo-roles -5
# Comprobar tipos
npx tsc --noEmit -p tsconfig.json
# Pruebas de áreas de permisos
PATH=/opt/node22-standalone/bin:$PATH npm run -s test:permission-areas
```
