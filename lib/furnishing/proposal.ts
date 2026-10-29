// Propuesta de mobiliario (amueblamiento virtual) de una propiedad — lógica
// pura, sin base de datos ni red. La comparten la ficha del admin, el visor
// público (/compartir/[slug]/propuesta y /c/[token]/propuesta) y su test
// (scripts/test-furnishing-proposal.mts). Tablas: migración 0235.

/** Fila de property_furnishing_images (lo que lee el servidor). */
export type FurnishingImageRow = {
  id: string;
  position: number;
  label: string;
  room: string;
  compare: boolean;
  after_path: string;
  after_url: string;
  after_width: number;
  after_height: number;
  before_path: string | null;
  before_url: string | null;
  before_width: number | null;
  before_height: number | null;
};

/** Fila de property_furnishing_proposals. */
export type FurnishingProposalRow = {
  status: "draft" | "published";
  headline: string | null;
  subtitle: string | null;
  disclaimer: string | null;
};

/** Imagen tal como la pinta el visor. Sin rutas de storage ni ids internos. */
export type FurnishingViewerImage = {
  /** Número visible ("01"…): orden en la propuesta, no el nombre del archivo. */
  number: string;
  label: string;
  room: string;
  /** true → «Comparar» y «Vista doble» disponibles (hay antes de la misma toma). */
  compare: boolean;
  after: { url: string; width: number; height: number };
  before: { url: string; width: number; height: number } | null;
};

export type FurnishingTexts = {
  headline: string;
  subtitle: string;
  disclaimer: string;
};

export const DEFAULT_FURNISHING_TEXTS: FurnishingTexts = {
  headline: "Una propuesta para imaginar tu hogar",
  subtitle:
    "Explora las estancias amuebladas y compara la propuesta con las fotografías del piso.",
  disclaimer:
    "El mobiliario mostrado es una propuesta virtual. Consulta con la inmobiliaria las características y el equipamiento incluidos.",
};

/** Estancias que el admin elige al cargar una imagen (texto libre también vale). */
export const FURNISHING_ROOM_OPTIONS = [
  "Salón y comedor",
  "Cocina",
  "Dormitorios",
  "Baños",
  "Otros espacios",
] as const;

export const ALL_ROOMS_FILTER = "Todas";

/** Proporción máxima admitida entre antes y después para comparar (2 %). */
export const MAX_COMPARE_RATIO_DRIFT = 0.02;

/** Formatos que acepta la carga (los mismos que sirve el optimizador). */
export const FURNISHING_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const FURNISHING_MAX_BYTES = 30 * 1024 * 1024;

export function resolveTexts(row: FurnishingProposalRow | null): FurnishingTexts {
  const pick = (v: string | null | undefined, d: string) => (v && v.trim() ? v.trim() : d);
  return {
    headline: pick(row?.headline, DEFAULT_FURNISHING_TEXTS.headline),
    subtitle: pick(row?.subtitle, DEFAULT_FURNISHING_TEXTS.subtitle),
    disclaimer: pick(row?.disclaimer, DEFAULT_FURNISHING_TEXTS.disclaimer),
  };
}

/** Filas → imágenes del visor, en orden de `position`. */
export function toViewerImages(rows: FurnishingImageRow[]): FurnishingViewerImage[] {
  return rows
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((r, i) => {
      const before =
        r.before_url && r.before_width && r.before_height
          ? { url: r.before_url, width: r.before_width, height: r.before_height }
          : null;
      return {
        number: String(i + 1).padStart(2, "0"),
        label: r.label,
        room: r.room,
        compare: r.compare && before !== null,
        after: { url: r.after_url, width: r.after_width, height: r.after_height },
        before,
      };
    });
}

/** Estancias en el orden en que aparecen por primera vez. */
export function roomsInOrder(images: Array<{ room: string }>): string[] {
  const seen: string[] = [];
  for (const img of images) if (!seen.includes(img.room)) seen.push(img.room);
  return seen;
}

/** ¿La propuesta se puede enseñar al cliente? */
export function isPublishable(
  proposal: FurnishingProposalRow | null,
  images: unknown[],
): boolean {
  return proposal?.status === "published" && images.length > 0;
}

/**
 * ¿Antes y después son la misma toma, por proporción? Un recorte o un giro
 * distinto haría que la comparación deslizable mintiera. No demuestra que
 * sea la misma foto (eso lo revisa la persona al ver la miniatura).
 */
export function sameAspect(
  a: { width: number; height: number },
  b: { width: number; height: number },
): boolean {
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) / ra <= MAX_COMPARE_RATIO_DRIFT;
}

/** Validación común de una pareja antes de guardarla. */
export function validatePair(input: {
  label: string;
  room: string;
  compare: boolean;
  after: { width: number; height: number } | null;
  before: { width: number; height: number } | null;
}): { ok: true } | { ok: false; error: string } {
  if (!input.label.trim()) return { ok: false, error: "Falta el nombre de la imagen." };
  if (!input.room.trim()) return { ok: false, error: "Falta la estancia." };
  if (!input.after) return { ok: false, error: "Falta la imagen de la propuesta (después)." };
  if (input.compare && !input.before) {
    return { ok: false, error: "Para comparar hace falta la fotografía actual (antes)." };
  }
  if (input.before && !sameAspect(input.before, input.after)) {
    return {
      ok: false,
      error:
        "El antes y el después no tienen la misma proporción: no parecen la misma toma.",
    };
  }
  return { ok: true };
}

// ─── Sugerencias para la carga múltiple ────────────────────────────────────
// Solo AYUDAN a rellenar el formulario a partir del nombre del archivo; lo que
// se guarda es la fila con su id. La persona confirma antes de subir.

const ROOM_HINTS: Array<{ re: RegExp; label: string; room: string; compare: boolean }> = [
  { re: /sal[oó]n|living|comedor/i, label: "Salón", room: "Salón y comedor", compare: true },
  { re: /cocina|kitchen/i, label: "Cocina", room: "Cocina", compare: true },
  { re: /dormitorio|habitaci[oó]n|bedroom/i, label: "Dormitorio", room: "Dormitorios", compare: true },
  { re: /ba[nñ]o|aseo|bath/i, label: "Baño", room: "Otros espacios", compare: false },
  { re: /vestidor/i, label: "Vestidor", room: "Otros espacios", compare: false },
  { re: /exterior|terraza|vistas|balc[oó]n/i, label: "Vistas exteriores", room: "Otros espacios", compare: false },
];

/** "03_cocina.png" → { label: "Cocina", room: "Cocina", compare: true }. */
export function suggestFromFileName(name: string): {
  label: string;
  room: string;
  compare: boolean;
} {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const hint = ROOM_HINTS.find((h) => h.re.test(base));
  const num = fileNumber(name);
  if (!hint) {
    return { label: num !== null ? `Vista ${pad(num)}` : base, room: "Otros espacios", compare: true };
  }
  // Varias tomas de la misma estancia: el número las distingue en la tira.
  const label = hint.room === "Dormitorios" && num !== null ? `${hint.label} · vista ${pad(num)}` : hint.label;
  return { label, room: hint.room, compare: hint.compare };
}

/**
 * Número de la toma en el nombre del archivo: el del principio
 * ("07_dormitorio.png" → 7) o, si no empieza por número, el último del nombre
 * ("antes-07.jpg", "BC-1781_07.jpg" → 7). Solo grupos de 1 a 4 cifras.
 */
export function fileNumber(name: string): number | null {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const lead = base.match(/^\s*(\d{1,4})(?!\d)/);
  if (lead) return Number(lead[1]);
  const all = [...base.matchAll(/(?<!\d)(\d{1,4})(?!\d)/g)];
  return all.length ? Number(all[all.length - 1][1]) : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Empareja dos selecciones de archivos (después y antes) por el número de
 * la toma en el nombre (fileNumber). Lo que no casa se devuelve aparte para que la
 * persona lo vea: nunca se empareja «por posición» a ciegas.
 */
export function pairByFileNumber<T extends { name: string }>(
  afters: T[],
  befores: T[],
): {
  pairs: Array<{ number: number; after: T; before: T | null }>;
  unmatchedBefores: T[];
  unnumbered: T[];
  duplicates: T[];
} {
  const beforeByNum = new Map<number, T>();
  const unnumbered: T[] = [];
  const duplicates: T[] = [];
  for (const b of befores) {
    const n = fileNumber(b.name);
    if (n === null) unnumbered.push(b);
    else if (beforeByNum.has(n)) duplicates.push(b);
    else beforeByNum.set(n, b);
  }
  const pairs: Array<{ number: number; after: T; before: T | null }> = [];
  const seenAfter = new Set<number>();
  for (const a of afters) {
    const n = fileNumber(a.name);
    if (n === null) {
      unnumbered.push(a);
      continue;
    }
    if (seenAfter.has(n)) {
      duplicates.push(a);
      continue;
    }
    seenAfter.add(n);
    pairs.push({ number: n, after: a, before: beforeByNum.get(n) ?? null });
  }
  pairs.sort((x, y) => x.number - y.number);
  const unmatchedBefores = [...beforeByNum.entries()]
    .filter(([n]) => !seenAfter.has(n))
    .map(([, b]) => b);
  return { pairs, unmatchedBefores, unnumbered, duplicates };
}

/** Enlace de contacto del visor (mismo buzón que la ficha compartida). */
export const FURNISHING_CONTACT_EMAIL = "contacto@bcousinoprop.com";

export function furnishingContactHref(reference: string | null | undefined): string {
  const subject = reference ? `Consulta sobre ${reference}` : "Consulta sobre una vivienda";
  return `mailto:${FURNISHING_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** Acceso «Ver propuesta amueblada» de la ficha compartida. */
export type FurnishingTeaser = {
  href: string;
  coverUrl: string;
  count: number;
};

export function furnishingTeaser(
  furnishing: { images: FurnishingViewerImage[] } | null,
  href: string,
): FurnishingTeaser | null {
  if (!furnishing || furnishing.images.length === 0) return null;
  // Portada: la primera imagen amueblada que se puede comparar.
  const cover = furnishing.images.find((i) => i.compare) ?? furnishing.images[0];
  return { href, coverUrl: cover.after.url, count: furnishing.images.length };
}
