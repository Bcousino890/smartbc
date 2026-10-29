# Idealista API → CRM: interruptor en el CRM — plan

- **Especificación:** [spec.md](spec.md), aprobada el 2026-10-29.
- **Rama:** `fabri/idealista-crm-interruptor`
- **Base:** `c0ddfbb3`
- **Estado:** aprobado

## Pasos de entorno

Los mismos que en el expediente anterior:
- la copia exportada sin `.env*`;
- `npm ci` sin paquetes nuevos;
- el Postgres temporal (`run-local.sh`);
- el build aislado con `env -i`;
- el servidor de fixtures;
- Chromium;
- push, PR y CI.

**Nada de producción, credenciales ni Idealista.**

## Tareas

1. **T1. Migración 0234 y su reversión.** Se aplica dos veces y pasa el lint.
2. **T2. Pruebas SQL** (AC1–AC4) en el runner existente.
3. **T3. Módulo** `lib/services/idealista/crm-sync/switch.ts`, la ruta y la sección. Se comprueba con `tsc`.
4. **T4. Suite de la CI**, con la parte de interruptor en `test:idealista-crm-sync`.
5. **T5. Fixture, capturas en claro y oscuro, y build aislado.**
6. **T6. `result.md`, push, PR y CI.** Se para antes del merge.
