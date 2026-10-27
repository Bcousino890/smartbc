/** Tema (claro/oscuro) del mapa de captaciones, recordado entre visitas. */
export type MapTheme = "light" | "dark";

const KEY = "captaciones-map-theme";

/** localStorage puede lanzar (modo privado, datos bloqueados, SSR): siempre dentro de try/catch. */
export function readStoredTheme(): MapTheme {
  try {
    return window.localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function storeTheme(t: MapTheme): void {
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    /* sin almacenamiento: el tema solo dura la sesión */
  }
}
