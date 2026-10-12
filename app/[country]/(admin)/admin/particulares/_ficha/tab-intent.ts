// Las tarjetas del listado («Ver todos los N anuncios») piden abrir la ficha
// directamente en una pestaña; el modal lo consume al montarse.
export type FichaTab = "detalles" | "fuentes" | "historico" | "contactos";
let pending: FichaTab | null = null;
export const setTabIntent = (t: FichaTab) => {
  pending = t;
};
export const consumeTabIntent = (): FichaTab | null => {
  const t = pending;
  pending = null;
  return t;
};
