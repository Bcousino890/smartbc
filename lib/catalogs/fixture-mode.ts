// Datos de prueba de los catálogos (BCP-01, E7): SOLO en desarrollo local y
// SOLO si además se pide expresamente con CATALOG_FIXTURES=1. En un build de
// producción NODE_ENV es "production", así que las rutas /dev-fixtures/*
// responden 404 aunque alguien ponga la variable por error.
export function isCatalogFixtureMode(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.NODE_ENV === "development" && env.CATALOG_FIXTURES === "1";
}
