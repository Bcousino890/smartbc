// SmartLink 2.0 · tipos del story de propiedad (modelo de 3 capas).

export const STORY_CHAPTERS = [
  "overview",
  "living",
  "kitchen",
  "private",
  "outdoor",
  "finishes",
  "building",
  "barrio",
] as const;
export type StoryChapter = (typeof STORY_CHAPTERS)[number];

// Vocabulario visible cerrado por producto (decisión D6): español y sobrio.
export const CHAPTER_HEADINGS: Record<StoryChapter, string> = {
  overview: "La vivienda",
  living: "Salón y luz",
  kitchen: "Cocina y comedor",
  private: "Zona privada",
  outdoor: "Vida al aire libre",
  finishes: "Acabados y confort",
  building: "La finca",
  // El heading real es "Vivir en {barrio}" — se compone en el renderer.
  barrio: "El barrio",
};

export type StoryClaim = {
  id?: string;
  source_text: string;
  source_field: "description" | "features" | "specs";
  category: StoryChapter | "boilerplate" | "other";
  fact: string;
  confidence: number;
  is_duplicate: boolean;
  conflict: boolean;
  conflict_reason?: string | null;
};

export type StoryBlock = {
  id?: string;
  chapter: StoryChapter;
  copy: string;
  position: number;
  status: "generated" | "approved" | "rejected" | "conflict";
  confidence: number;
  claim_ids: string[];
};

// Proyección PÚBLICA del story: solo lo que el visitante necesita. Nunca
// claims, evidencia, ids de revisor ni metadatos del modelo.
export type PublicStoryBlock = {
  chapter: StoryChapter;
  copy: string;
};
