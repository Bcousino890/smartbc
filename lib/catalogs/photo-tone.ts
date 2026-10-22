// ============================================================================
// Acabado fotográfico · tono adaptativo por foto (BCP-01 ampliación, PR7b).
// PURO y sin dependencias (ni `sharp` ni Node): trabaja sobre píxeles RGB de
// 8 bits ya decodificados. Lo usan la variante tratada del proxy /p (y la ruta
// de fotos sintéticas de las fixtures) por photo-variant.ts, el PDF por
// export/photos.ts y el test puro.
//
// Criterios (decisión de Fabricio del 22-10-2026, spec.md DA30/N4):
//   · receta según las medidas de LA PROPIA foto:
//       luminosa → NO sube el brillo: recupera altas luces (la media y el
//                  percentil 98 no suben; los quemados no aumentan);
//       media    → corrección mínima (leve contraste y viveza; media ±2 %);
//       oscura   → abre las sombras sin quemar (P98 ≤ 0,95; quemados no
//                  aumentan);
//   · ajustes moderados, ligera corrección de dominante si la hay y
//     saturación como mucho +5 %;
//   · nada generativo: una curva por canal, unas ganancias por canal y la
//     saturación alrededor de la luma. Mismo píxel de entrada → mismo píxel de
//     salida, en todas partes;
//   · determinista (aritmética de coma flotante de JS, sin azar) y
//     VERSIONADO: TONE_RECIPE_VERSION va en la URL (`t=<versión>`), así que
//     cambiar la receta cambia la clave de caché.
//
// Autocomprobación: cada receta se ensaya sobre la muestra con la que se midió
// y, si incumple sus límites, se suaviza a la mitad (hasta tres veces); si aun
// así no cumple, la foto se deja como está («sin cambio»). Así los límites
// valen para cualquier foto, no solo para las de la prueba.
// ============================================================================

/** Versión de la receta: va en la URL (`t=1`) y en la cabecera. */
export const TONE_RECIPE_VERSION = 1;

export type ToneRecipeName = "luminosa" | "media" | "oscura" | "sin-cambio";

/** Lado mayor de la muestra con la que se mide una foto (se reduce antes). */
export const TONE_SAMPLE_MAX = 512;

/** Luma ≥ 250/255: píxel «quemado». */
export const CLIPPED_LUMA = 250 / 255;

export interface ToneStats {
  /** Luma media (0–1, sobre los valores sRGB codificados). */
  mean: number;
  p02: number;
  p50: number;
  /** Percentil 98 de la luma. */
  p98: number;
  /** Fracción de píxeles con luma ≥ 250/255. */
  clipped: number;
  /** Medias de canal de los píxeles casi neutros de tonos medios (luma entre
   *  0,15 y 0,9 y croma relativo < 0,25: paredes, techos, blancos), para la
   *  dominante. Un cielo o un mar azules no cuentan como dominante. */
  mid: [number, number, number];
  /** Fracción de píxeles casi neutros (sin bastantes, no se corrige). */
  neutral: number;
}

export interface ToneRecipe {
  version: number;
  name: ToneRecipeName;
  /** Ganancias por canal (dominante); producto ponderado por la luma = 1. */
  gains: [number, number, number];
  /** Rodilla y techo de la curva de altas luces. */
  knee: number;
  top: number;
  /** Contraste en S alrededor de la mediana (receta media). */
  contrast: number;
  pivot: number;
  /** Apertura de sombras (receta oscura). */
  lift: number;
  /** Saturación alrededor de la luma (1 = igual; como mucho 1,05). */
  saturation: number;
}

const W = [0.2126, 0.7152, 0.0722] as const;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Medidas de una imagen RGB(A) de 8 bits (`channels` 3 o 4). */
export function measureTone(px: Uint8Array, channels: number): ToneStats {
  const hist = new Float64Array(256);
  let sum = 0;
  let n = 0;
  let clipped = 0;
  const mid = [0, 0, 0];
  let midN = 0;
  for (let i = 0; i + 2 < px.length; i += channels) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const y = (W[0] * r + W[1] * g + W[2] * b) / 255;
    sum += y;
    n++;
    hist[Math.min(255, Math.round(y * 255))]++;
    if (y >= CLIPPED_LUMA) clipped++;
    const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
    const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
    if (y > 0.15 && y < 0.9 && mx > 0 && (mx - mn) / mx < 0.25) {
      mid[0] += r;
      mid[1] += g;
      mid[2] += b;
      midN++;
    }
  }
  const pct = (q: number) => {
    if (n === 0) return 0;
    const target = q * n;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v / 255;
    }
    return 1;
  };
  return {
    mean: n ? sum / n : 0,
    p02: pct(0.02),
    p50: pct(0.5),
    p98: pct(0.98),
    clipped: n ? clipped / n : 0,
    mid: midN ? [mid[0] / midN / 255, mid[1] / midN / 255, mid[2] / midN / 255] : [0.5, 0.5, 0.5],
    neutral: n ? midN / n : 0,
  };
}

/** Qué receta le toca a una foto según sus medidas. */
export function classifyTone(s: ToneStats): Exclude<ToneRecipeName, "sin-cambio"> {
  // Subexpuesta de verdad: oscura en media y sin nada cerca del blanco. Una
  // foto oscura con ventanas quemadas (contraluz) NO se aclara: va como
  // luminosa (solo recupera altas luces).
  if (s.mean < 0.36 && s.p98 < 0.93) return "oscura";
  if (s.mean >= 0.5 || s.p98 >= 0.97 || s.clipped >= 0.005) return "luminosa";
  return "media";
}

/** Corrección ligera de dominante: solo si en las superficies casi neutras
 *  (al menos un 5 % de la foto) un canal se separa más de un 6 % del gris; un
 *  30 % de la desviación, con tope del 3 %. Normalizada para no cambiar la
 *  luma media. */
function castGains(s: ToneStats): [number, number, number] {
  const gray = (s.mid[0] + s.mid[1] + s.mid[2]) / 3;
  if (gray <= 0 || s.neutral < 0.05) return [1, 1, 1];
  const dev = s.mid.map((m) => m / gray - 1);
  if (Math.max(...dev.map(Math.abs)) <= 0.06) return [1, 1, 1];
  const g = dev.map((d) => Math.min(1.03, Math.max(0.97, 1 - 0.3 * d)));
  const norm = W[0] * g[0] + W[1] * g[1] + W[2] * g[2];
  return [g[0] / norm, g[1] / norm, g[2] / norm];
}

function baseRecipe(name: Exclude<ToneRecipeName, "sin-cambio">, s: ToneStats): ToneRecipe {
  const gains = castGains(s);
  const common = { version: TONE_RECIPE_VERSION, name, gains, contrast: 0, pivot: 0.5, lift: 0 };
  if (name === "luminosa") {
    // Solo hombro: por debajo de la rodilla, nada; arriba, compresión suave.
    return { ...common, knee: 0.55, top: s.p98 >= 0.97 || s.clipped >= 0.005 ? 0.955 : 0.965, saturation: 1.04 };
  }
  if (name === "oscura") {
    // Sombras abiertas hacia una media de ~0,40 (como mucho +0,08, liftFor), negro
    // intacto (f(0) = 0) y techo a 0,95 (P98 ≤ 0,95).
    return { ...common, knee: 0.6, top: 0.95, lift: 0.5, saturation: 1.05 };
  }
  // Media: leve contraste en S alrededor de su mediana y techo a 0,975.
  return { ...common, knee: 0.6, top: 0.975, contrast: 0.12, pivot: Math.min(0.65, Math.max(0.3, s.p50)), saturation: 1.03 };
}

/** Curva de tono (0–1 → 0–1), monótona, con f(0) = 0. */
export function toneCurve(r: ToneRecipe, x: number): number {
  let y = x;
  if (r.lift > 0) y = y + r.lift * y * (1 - y) * (1 - y);
  if (r.contrast > 0) {
    // S alrededor del pivote, nula en 0, en el pivote y en 1.
    y = y + r.contrast * 4 * (y - r.pivot) * y * (1 - y);
  }
  // Hombro: y ≤ rodilla intacto; arriba, k + (1−k)(t − a·t²) con f(1) = techo.
  if (y > r.knee) {
    const k = r.knee;
    const a = 1 - (r.top - k) / (1 - k);
    const t = (y - k) / (1 - k);
    y = k + (1 - k) * (t - a * t * t);
  }
  return clamp01(y);
}

/** Tablas por canal (ganancia + curva), en coma flotante. */
function luts(r: ToneRecipe): [Float64Array, Float64Array, Float64Array] {
  const out: Float64Array[] = [];
  for (let c = 0; c < 3; c++) {
    const t = new Float64Array(256);
    for (let v = 0; v < 256; v++) t[v] = toneCurve(r, clamp01((v / 255) * r.gains[c]));
    out.push(t);
  }
  return out as [Float64Array, Float64Array, Float64Array];
}

/** Aplica la receta a píxeles RGB(A) de 8 bits. Devuelve un búfer NUEVO del
 *  mismo formato (el alfa, si lo hay, se copia). La entrada no se toca. */
export function applyTone(px: Uint8Array, channels: number, r: ToneRecipe): Uint8Array {
  const out = new Uint8Array(px.length);
  if (r.name === "sin-cambio") {
    out.set(px);
    return out;
  }
  const [lr, lg, lb] = luts(r);
  const s = r.saturation;
  for (let i = 0; i + 2 < px.length; i += channels) {
    const R = lr[px[i]];
    const G = lg[px[i + 1]];
    const B = lb[px[i + 2]];
    const Y = W[0] * R + W[1] * G + W[2] * B;
    out[i] = Math.round(255 * clamp01(Y + s * (R - Y)));
    out[i + 1] = Math.round(255 * clamp01(Y + s * (G - Y)));
    out[i + 2] = Math.round(255 * clamp01(Y + s * (B - Y)));
    if (channels === 4) out[i + 3] = px[i + 3];
  }
  return out;
}

/** Límites de cada receta (los mismos que comprueba el test puro). */
export function toneWithinLimits(name: ToneRecipeName, before: ToneStats, after: ToneStats): boolean {
  const eps = 1e-9;
  if (after.clipped > before.clipped + eps) return false;
  if (name === "luminosa") return after.mean <= before.mean + eps && after.p98 <= before.p98 + eps;
  if (name === "media") return before.mean > 0 && Math.abs(after.mean - before.mean) / before.mean <= 0.02;
  if (name === "oscura") return after.mean > before.mean && after.p98 <= 0.95 + eps;
  return true;
}

/** Apertura de sombras de la receta oscura: la `b` de f(x) = x + b·x·(1−x)²
 *  (negro intacto) que lleva la media de la muestra a min(0,40; media + 0,08),
 *  por bisección sobre la propia muestra (determinista), entre 0 y 0,9. */
function liftFor(r: ToneRecipe, sample: Uint8Array, channels: number, before: ToneStats): number {
  const target = Math.min(0.4, before.mean + 0.08);
  let lo = 0;
  let hi = 0.9;
  for (let i = 0; i < 10; i++) {
    const b = (lo + hi) / 2;
    const m = measureTone(applyTone(sample, channels, { ...r, lift: b }), channels).mean;
    if (m < target) lo = b;
    else hi = b;
  }
  return Math.round(((lo + hi) / 2) * 1000) / 1000;
}

function soften(r: ToneRecipe): ToneRecipe {
  const half = (x: number) => 1 + (x - 1) / 2;
  return {
    ...r,
    gains: [half(r.gains[0]), half(r.gains[1]), half(r.gains[2])],
    contrast: r.contrast / 2,
    lift: r.lift / 2,
    saturation: half(r.saturation),
    // El techo se mantiene: es lo que garantiza no quemar.
  };
}

/** Receta para una foto a partir de su MUESTRA (píxeles ya reducidos a
 *  TONE_SAMPLE_MAX). Ensaya la receta sobre la muestra y la suaviza si
 *  incumple sus límites; si no hay forma, «sin cambio». */
export function toneRecipeFor(sample: Uint8Array, channels: number): { recipe: ToneRecipe; before: ToneStats; predicted: ToneStats } {
  const before = measureTone(sample, channels);
  let recipe = baseRecipe(classifyTone(before), before);
  if (recipe.name === "oscura") recipe = { ...recipe, lift: liftFor(recipe, sample, channels, before) };
  for (let i = 0; i < 4; i++) {
    const predicted = measureTone(applyTone(sample, channels, recipe), channels);
    if (toneWithinLimits(recipe.name, before, predicted)) return { recipe, before, predicted };
    recipe = soften(recipe);
  }
  const none: ToneRecipe = { ...recipe, name: "sin-cambio", gains: [1, 1, 1], contrast: 0, lift: 0, saturation: 1, knee: 1, top: 1 };
  return { recipe: none, before, predicted: before };
}

/** Texto de la cabecera `X-Bcp-Tone`: «v1/luminosa». */
export function toneHeader(r: Pick<ToneRecipe, "version" | "name">): string {
  return `v${r.version}/${r.name}`;
}
