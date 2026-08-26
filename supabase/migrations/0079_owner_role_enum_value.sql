-- El rol 'owner' se usa en toda la app (STAFF_ROLES en lib/permissions.ts,
-- RLS de 0070, getChileAssignableUsers() en captaciones/actions.ts) pero,
-- igual que pasó con 'captadora' antes de la migración 0065, nunca se
-- añadió como valor válido del enum user_role.
--
-- Efecto en producción: cualquier query que filtre roles con
-- .in("role", [..., "owner", ...]) — como el selector "Asignar a" del
-- pipeline de captaciones de Chile — falla en Postgres con
-- "invalid input value for enum user_role: owner" al construir el
-- literal del array. Ese error queda silenciado por un try/catch que
-- devuelve una lista vacía, así que el selector aparecía vacío.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'owner';
