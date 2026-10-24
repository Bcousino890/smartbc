// Preferencia de apariencia del CRM interno (expediente
// docs/changes/2026-10-23-crm-apariencia). Lógica pura: sin React ni Next,
// para que la prueba la ejecute en Node y el guion previo a la pintura use
// exactamente las mismas reglas.
//
// · Por usuario y por navegador: la clave lleva el id del usuario con sesión.
//   Otro usuario en el mismo navegador tiene su propia clave; nada se
//   sincroniza entre dispositivos (no hay base de datos de por medio).
// · Sin valor, o con un valor desconocido: claro (el CRM de siempre).
// · Si el almacenamiento falla (modo privado, bloqueado, cuota llena) nada se
//   rompe: se lee como «claro» y la elección vale para la página abierta.

export type CrmAppearance = "light" | "dark" | "system";
export type CrmTheme = "light" | "dark";

export const CRM_APPEARANCES: readonly CrmAppearance[] = ["light", "dark", "system"];
export const CRM_APPEARANCE_KEY_PREFIX = "smartbc.crm.appearance.v1:";
/** Atributo de <html> que activa el oscuro. Solo lo ponen las cáscaras del CRM. */
export const CRM_THEME_ATTRIBUTE = "data-crm-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function appearanceStorageKey(userId: string): string {
  return CRM_APPEARANCE_KEY_PREFIX + userId;
}

export function parseAppearance(value: unknown): CrmAppearance {
  return value === "dark" || value === "system" ? value : "light";
}

export function resolveTheme(appearance: CrmAppearance, systemPrefersDark: boolean): CrmTheme {
  if (appearance === "dark") return "dark";
  if (appearance === "system") return systemPrefersDark ? "dark" : "light";
  return "light";
}

export function readAppearance(storage: StorageLike | null | undefined, userId: string): CrmAppearance {
  try {
    return parseAppearance(storage?.getItem(appearanceStorageKey(userId)) ?? null);
  } catch {
    return "light";
  }
}

/** Devuelve false si no se pudo guardar (la elección sigue valiendo en la página). */
export function writeAppearance(storage: StorageLike | null | undefined, userId: string, appearance: CrmAppearance): boolean {
  try {
    if (!storage) return false;
    storage.setItem(appearanceStorageKey(userId), appearance);
    return true;
  } catch {
    return false;
  }
}

/**
 * Guion en línea que la cáscara del CRM pinta antes que su contenido: aplica
 * el oscuro antes de la primera pintura para no dar un destello claro. Repite
 * las reglas de arriba en ES5 sin dependencias; la prueba comprueba que da lo
 * mismo que `resolveTheme(readAppearance(...))`.
 */
export function prePaintScript(userId: string): string {
  // `<` escapado: el texto va dentro de <script>.
  const js = (v: string) => JSON.stringify(v).replace(/</g, "\\u003c");
  const key = js(appearanceStorageKey(userId));
  const attr = js(CRM_THEME_ATTRIBUTE);
  const query = js(DARK_QUERY);
  return `(function(){var p=null;try{p=window.localStorage.getItem(${key});}catch(e){}var d=false;try{d=p==="dark"||(p==="system"&&window.matchMedia(${query}).matches);}catch(e){}var r=document.documentElement;if(d){r.setAttribute(${attr},"dark");}else{r.removeAttribute(${attr});}})();`;
}
