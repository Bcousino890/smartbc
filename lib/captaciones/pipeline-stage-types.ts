// Los 6 tipos de etapa que el motor de captaciones entiende. El nombre,
// color y orden de una etapa son libres (el admin los configura), pero su
// stage_type es fijo y determina el comportamiento real: quién puede
// convertir a propiedad, cuál es el punto de entrada, cuáles son
// terminales, etc. Ver migración 0078 para el detalle completo.
export type StageType = "draft" | "assign" | "normal" | "confirmed" | "rejected" | "converted";

export const STAGE_TYPES: StageType[] = ["draft", "assign", "normal", "confirmed", "rejected", "converted"];

export const STAGE_TYPE_LABEL: Record<StageType, string> = {
  draft: "Entrada (nuevas captaciones)",
  assign: "Asignación (pide elegir usuario)",
  normal: "Normal (sin comportamiento especial)",
  confirmed: "Confirmada (habilita convertir a propiedad)",
  rejected: "Rechazada",
  converted: "Convertida (solo vía conversión)",
};

export const STAGE_TYPE_DESCRIPTION: Record<StageType, string> = {
  draft: "Las captaciones nuevas entran aquí. Debe existir exactamente una por pipeline.",
  assign: "Al soltar o mover una captación aquí se pide elegir a qué usuario asignarla.",
  normal: "Etapa libre: úsala para cualquier paso intermedio de tu proceso.",
  confirmed: "Muestra el botón \"Convertir a propiedad\" cuando una captación está aquí.",
  rejected: "El dueño rechazó vender. Se puede mover a otra etapa si cambia de opinión.",
  converted: "Reservada: solo la fija el flujo de conversión, nunca se arrastra manualmente hacia ella (pero sí se puede mover desde ahí a otra etapa).",
};
