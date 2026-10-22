import type { TrAiFn } from "./translations";

// ============================================================================
// SOLO PRUEBAS Y FIXTURES (PR6). Una «IA» FALSA para las traducciones: no hay
// red ni proveedor; devuelve una traducción determinista (el texto con la
// marca del idioma delante, conservando cifras y nombres propios, y unas
// pocas frases sintéticas de los fixtures traducidas a mano) y CUENTA las
// llamadas, para comprobar que nada público la usa (AC8). Nunca se importa
// desde el código que sirve a clientes ni desde las acciones reales.
// ============================================================================

const CANNED: Record<string, Record<string, string>> = {
  en: {
    "Ático con terraza sobre los tejados de Jerónimos": "Penthouse with a terrace over the rooftops of Jerónimos",
    "Vivienda exterior con mucha luz natural, techos altos y una distribución pensada para el día a día.": "An outward-facing home with plenty of natural light, high ceilings and a layout designed for everyday life.",
    "El salón se abre a un balcón corrido sobre la calle y la cocina, independiente, conserva la despensa original.": "The living room opens onto a long balcony over the street, and the separate kitchen keeps its original pantry.",
    "Los dormitorios dan a un patio de manzana silencioso.": "The bedrooms face a quiet inner courtyard.",
    "Salamanca y Chamberí": "Salamanca and Chamberí",
    "Cuatro viviendas elegidas para una búsqueda concreta: luz, silencio y buena comunicación.": "Four homes chosen for a specific search: light, quiet and good transport links.",
    "Terraza de 40 m²": "40 m² terrace",
    "Ascensor": "Lift",
    "Calefacción central": "Central heating",
    "Portero físico": "On-site concierge",
  },
  ar: {
    "Ático con terraza sobre los tejados de Jerónimos": "بنتهاوس مع شرفة فوق أسطح Jerónimos",
    "Vivienda exterior con mucha luz natural, techos altos y una distribución pensada para el día a día.": "مسكن مطلّ على الخارج مع الكثير من الضوء الطبيعي وأسقف عالية وتوزيع مصمَّم للحياة اليومية.",
    "El salón se abre a un balcón corrido sobre la calle y la cocina, independiente, conserva la despensa original.": "تنفتح الصالة على شرفة طويلة تطلّ على الشارع، ويحتفظ المطبخ المستقل بخزانة المؤن الأصلية.",
    "Los dormitorios dan a un patio de manzana silencioso.": "تطلّ غرف النوم على فناء داخلي هادئ.",
    "Salamanca y Chamberí": "Salamanca و Chamberí",
    "Cuatro viviendas elegidas para una búsqueda concreta: luz, silencio y buena comunicación.": "أربعة مساكن مختارة لبحث محدد: الضوء والهدوء وسهولة المواصلات.",
    "Terraza de 40 m²": "شرفة مساحتها 40 m²",
    "Ascensor": "مصعد",
    "Calefacción central": "تدفئة مركزية",
    "Portero físico": "بوّاب",
  },
};

function tr(lang: string, text: string): string {
  const table = CANNED[lang] ?? {};
  if (table[text]) return table[text];
  // Frase a frase: las conocidas, traducidas; las demás, con la marca.
  const parts = text.split(/(?<=[.!?])\s+/);
  if (parts.length > 1 && parts.some((p) => table[p])) return parts.map((p) => table[p] ?? `[${lang}] ${p}`).join(" ");
  return text
    .split(/\n\n/)
    .map((p) => (p.trim() ? `[${lang}] ${p}` : p))
    .join("\n\n");
}

export interface FakeAi {
  ai: TrAiFn;
  calls: () => number;
  reset: () => void;
  /** Lo que se le pidió (para comprobar la instrucción). */
  last: () => { system: string; userText: string } | null;
}

/** IA falsa. `mode`: «ok» traduce; «timeout» espera y lanza TimeoutError;
 *  «error» responde como un 500 del proveedor; «bad» devuelve bloques que no
 *  casan. `delayMs` simula lo que tarda; `gate` permite soltarla a mano. */
export function fakeTranslationAi(opts: { mode?: () => "ok" | "timeout" | "error" | "bad"; delayMs?: () => number; gate?: () => Promise<void> | null } = {}): FakeAi {
  let n = 0;
  let lastReq: { system: string; userText: string } | null = null;
  const ai: TrAiFn = async ({ system, userText, signal }) => {
    n++;
    lastReq = { system, userText };
    const g = opts.gate?.();
    if (g) await g;
    const ms = opts.delayMs?.() ?? 0;
    if (ms > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
        });
      });
    }
    const mode = opts.mode?.() ?? "ok";
    if (mode === "timeout") throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    if (mode === "error") throw new Error("IA 500: fallo simulado del proveedor");
    const req = JSON.parse(userText) as {
      idioma_destino: string;
      titulo?: string;
      bloques?: Array<{ k: string; x: string }>;
      zona?: string;
      caracteristicas?: string[];
      catalogo?: { titulo: string; introduccion: string };
    };
    const lang = req.idioma_destino;
    const blocks = (req.bloques ?? []).map((b) => ({ k: mode === "bad" ? "otra" : b.k, x: tr(lang, b.x) }));
    return JSON.stringify({
      title: req.titulo ? tr(lang, req.titulo) : "",
      blocks,
      area: req.zona ? tr(lang, req.zona) : "",
      features: (req.caracteristicas ?? []).map((f) => ({ es: f, tr: tr(lang, f) })),
      catalog_title: req.catalogo ? tr(lang, req.catalogo.titulo) : "",
      catalog_intro: req.catalogo?.introduccion ? tr(lang, req.catalogo.introduccion) : "",
    });
  };
  return { ai, calls: () => n, reset: () => { n = 0; }, last: () => lastReq };
}
