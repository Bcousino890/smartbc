// SOLO PRUEBAS (BCP-01 ampliación, PR5 adaptado al PR6). Traducciones de
// prueba ESCRITAS A MANO para los catálogos de las fixtures, en los 7 idiomas
// distintos del español, para comprobar el PDF con contenido traducido de
// verdad (DA35) y el caso N5.
//
// No hay IA de ningún tipo: `translator(lang)` es una función local y
// determinista que responde con el formato de TRANSLATION_SCHEMA usando frases
// generales correctas de cada idioma (escritas para estas pruebas; ar, tr y he
// «sin revisión nativa», como el resto, DA20), con la misma estructura de
// bloques y párrafos y una longitud parecida a la del español. Se pasa por el
// MISMO camino que el gestor (translation-service: preparar → revisar →
// aprobar → activar) sobre el almacén en memoria de las fixtures, con las
// reglas de 0226; así la instantánea que lee el PDF es la de producción.
//
// Glifos que se fuerzan en el CONTENIDO: el turco lleva ğ ş ı İ en sus frases y
// títulos (y en mayúsculas, İ); el francés lleva «L'Haÿ-les-Roses» en el
// título del catálogo «pdf» (en mayúsculas, «Ÿ»), escrito a propósito para
// probar ese glifo.
import { FIXTURE_TOKENS, fixtureOwnerToken, fixtureTranslations } from "../../lib/catalogs/fixture-store.ts";
import type { CatalogLanguage } from "../../lib/catalogs/i18n.ts";
import { META_KEY, autoUnit, loadPanel, setLanguage } from "../../lib/catalogs/translation-service.ts";
import type { TargetLanguage, TrAiFn } from "../../lib/catalogs/translations.ts";

type Bank = { sentences: string[]; titles: string[]; features: Record<string, string>; meta: Record<string, string>; intro: string };

const FEATURES_ES = ["Terraza de 40 m²", "Ascensor", "Calefacción central", "Portero físico", "Galería", "Molduras", "Suelos de madera", "Amueblado", "Terraza", "Aire acondicionado", "Trastero", "Galería acristalada", "Exterior", "Conserje"];
const feats = (list: string[]) => Object.fromEntries(FEATURES_ES.map((es, i) => [es, list[i]]));
const META_ES = ["Salamanca y Chamberí", "Selección para el PDF", "Veinticuatro recorridos"];
const meta = (list: string[]) => Object.fromEntries(META_ES.map((es, i) => [es, list[i]]));

export const BANKS: Record<TargetLanguage, Bank> = {
  en: {
    sentences: [
      "A bright home with plenty of natural light and high ceilings.",
      "The living room opens onto a balcony overlooking a quiet street.",
      "The kitchen is separate and fully equipped.",
      "The bedrooms face a peaceful inner courtyard.",
      "The building has a lift and a concierge.",
      "The neighbourhood offers shops, restaurants and good public transport.",
      "The wooden floors and original mouldings have been carefully restored.",
      "The layout is practical and designed for everyday life.",
      "The main bathroom has a window and natural ventilation.",
      "Several parks and schools are within walking distance.",
      "The home is ready to move into.",
      "Central heating and air conditioning keep it comfortable all year round.",
    ],
    titles: ["Penthouse with a terrace over the rooftops", "Stately flat with a glazed gallery", "Duplex with a private patio", "Design studio on a quiet street", "Bright flat with high ceilings", "Corner flat with balconies", "Family home near the park", "Renovated flat close to the metro"],
    features: feats(["40 m² terrace", "Lift", "Central heating", "On-site concierge", "Gallery", "Mouldings", "Wooden floors", "Furnished", "Terrace", "Air conditioning", "Storage room", "Glazed gallery", "Outward-facing", "Concierge"]),
    meta: meta(["Salamanca and Chamberí", "Selection for the PDF", "Twenty-four tours"]),
    intro: "A selection of homes chosen for a specific search: light, quiet and good transport links.",
  },
  fr: {
    sentences: [
      "Un logement lumineux, avec beaucoup de lumière naturelle et de hauts plafonds.",
      "Le séjour s'ouvre sur un balcon donnant sur une rue calme.",
      "La cuisine est indépendante et entièrement équipée.",
      "Les chambres donnent sur une cour intérieure paisible.",
      "L'immeuble dispose d'un ascenseur et d'un gardien.",
      "Le quartier offre des commerces, des restaurants et de bons transports en commun.",
      "Les parquets et les moulures d'origine ont été soigneusement restaurés.",
      "La distribution est pratique et pensée pour la vie quotidienne.",
      "La salle de bains principale a une fenêtre et une ventilation naturelle.",
      "Plusieurs parcs et écoles se trouvent à quelques minutes à pied.",
      "Le logement est prêt à être habité.",
      "Le chauffage central et la climatisation assurent le confort toute l'année.",
    ],
    titles: ["Attique avec terrasse sur les toits", "Appartement de caractère avec galerie vitrée", "Duplex avec patio privé", "Studio design dans une rue calme", "Appartement lumineux aux hauts plafonds", "Appartement d'angle avec balcons", "Maison familiale près du parc", "Appartement rénové près du métro"],
    features: feats(["Terrasse de 40 m²", "Ascenseur", "Chauffage central", "Gardien", "Galerie", "Moulures", "Parquet", "Meublé", "Terrasse", "Climatisation", "Cave", "Galerie vitrée", "Donnant sur rue", "Concierge"]),
    meta: meta(["Salamanca et Chamberí", "Une sélection, de L'Haÿ-les-Roses à Madrid", "Vingt-quatre visites"]),
    intro: "Une sélection de logements choisis pour une recherche précise : lumière, calme et bons transports.",
  },
  it: {
    sentences: [
      "Un'abitazione luminosa, con molta luce naturale e soffitti alti.",
      "Il soggiorno si apre su un balcone che affaccia su una strada tranquilla.",
      "La cucina è indipendente e completamente attrezzata.",
      "Le camere da letto danno su un cortile interno silenzioso.",
      "L'edificio dispone di ascensore e portiere.",
      "Il quartiere offre negozi, ristoranti e buoni collegamenti pubblici.",
      "I pavimenti in legno e le modanature originali sono stati restaurati con cura.",
      "La distribuzione è pratica e pensata per la vita di tutti i giorni.",
      "Il bagno principale ha una finestra e ventilazione naturale.",
      "Diversi parchi e scuole si trovano a pochi minuti a piedi.",
      "L'abitazione è pronta da abitare.",
      "Il riscaldamento centralizzato e l'aria condizionata garantiscono comfort tutto l'anno.",
    ],
    titles: ["Attico con terrazza sui tetti", "Appartamento signorile con veranda", "Duplex con patio privato", "Monolocale di design in una via tranquilla", "Appartamento luminoso con soffitti alti", "Appartamento d'angolo con balconi", "Casa familiare vicino al parco", "Appartamento ristrutturato vicino alla metro"],
    features: feats(["Terrazza di 40 m²", "Ascensore", "Riscaldamento centralizzato", "Portiere", "Galleria", "Modanature", "Pavimenti in legno", "Arredato", "Terrazza", "Aria condizionata", "Ripostiglio", "Veranda", "Esterno", "Custode"]),
    meta: meta(["Salamanca e Chamberí", "Selezione per il PDF", "Ventiquattro percorsi"]),
    intro: "Una selezione di abitazioni scelte per una ricerca precisa: luce, silenzio e buoni collegamenti.",
  },
  de: {
    sentences: [
      "Eine helle Wohnung mit viel Tageslicht und hohen Decken.",
      "Das Wohnzimmer öffnet sich zu einem Balkon mit Blick auf eine ruhige Straße.",
      "Die Küche ist separat und voll ausgestattet.",
      "Die Schlafzimmer liegen zu einem ruhigen Innenhof.",
      "Das Gebäude verfügt über einen Aufzug und einen Concierge.",
      "Das Viertel bietet Geschäfte, Restaurants und gute öffentliche Verkehrsanbindungen.",
      "Die Holzböden und die originalen Stuckleisten wurden sorgfältig restauriert.",
      "Die Aufteilung ist praktisch und auf den Alltag ausgelegt.",
      "Das Hauptbad hat ein Fenster und natürliche Belüftung.",
      "Mehrere Parks und Schulen sind zu Fuß erreichbar.",
      "Die Wohnung ist bezugsfertig.",
      "Zentralheizung und Klimaanlage sorgen das ganze Jahr über für Komfort.",
    ],
    titles: ["Penthouse mit Terrasse über den Dächern", "Altbauwohnung mit verglaster Galerie", "Maisonette mit eigenem Innenhof", "Designer-Studio in ruhiger Straße", "Helle Wohnung mit hohen Decken", "Eckwohnung mit Balkonen", "Familienhaus in Parknähe", "Renovierte Wohnung nahe der U-Bahn"],
    features: feats(["Terrasse mit 40 m²", "Aufzug", "Zentralheizung", "Hausmeister vor Ort", "Galerie", "Stuckleisten", "Holzböden", "Möbliert", "Terrasse", "Klimaanlage", "Abstellraum", "Verglaste Galerie", "Außenlage", "Concierge"]),
    meta: meta(["Salamanca und Chamberí", "Auswahl für das PDF", "Vierundzwanzig Rundgänge"]),
    intro: "Eine Auswahl an Wohnungen für eine gezielte Suche: Licht, Ruhe und gute Verkehrsanbindung.",
  },
  tr: {
    sentences: [
      "Doğal ışık alan, yüksek tavanlı aydınlık bir daire.",
      "Salon, sakin bir sokağa bakan bir balkona açılıyor.",
      "Mutfak ayrı ve tam donanımlı.",
      "Yatak odaları sessiz bir iç avluya bakıyor.",
      "Binada asansör ve kapıcı bulunuyor.",
      "Mahallede dükkânlar, restoranlar ve iyi bir toplu ulaşım var.",
      "Ahşap zeminler ve orijinal kartonpiyerler özenle restore edildi.",
      "Yerleşim pratik ve günlük yaşam için düşünülmüş.",
      "Ana banyonun penceresi ve doğal havalandırması var.",
      "İstasyona ve birkaç parka yürüyerek gidilebiliyor.",
      "Daire taşınmaya hazır.",
      "Merkezi ısıtma ve klima, evi yıl boyunca konforlu tutuyor.",
    ],
    titles: ["Çatıların üzerinde teraslı çatı katı", "Camlı galerili şık daire", "Özel avlulu dubleks", "Sakin sokakta tasarım stüdyo", "Yüksek tavanlı aydınlık daire", "Balkonlu köşe daire", "Parka yakın aile evi", "Metroya yakın yenilenmiş daire"],
    features: feats(["40 m² teras", "Asansör", "Merkezi ısıtma", "Kapıcı", "Galeri", "Kartonpiyer", "Ahşap zemin", "Eşyalı", "Teras", "Klima", "Depo", "Camlı galeri", "Cepheli", "Görevli"]),
    meta: meta(["Salamanca ve Chamberí", "PDF için seçki", "Yirmi dört gezinti"]),
    intro: "Belirli bir arayış için seçilmiş evler: ışık, sessizlik ve iyi ulaşım.",
  },
  ar: {
    sentences: [
      "مسكن مشرق يتمتع بالكثير من الضوء الطبيعي وأسقف عالية.",
      "تنفتح الصالة على شرفة تطل على شارع هادئ.",
      "المطبخ مستقل ومجهز بالكامل.",
      "تطل غرف النوم على فناء داخلي هادئ.",
      "يضم المبنى مصعداً وبواباً.",
      "يوفر الحي متاجر ومطاعم ومواصلات عامة جيدة.",
      "رُمّمت الأرضيات الخشبية والزخارف الأصلية بعناية.",
      "التوزيع عملي ومصمم للحياة اليومية.",
      "للحمام الرئيسي نافذة وتهوية طبيعية.",
      "تقع عدة حدائق ومدارس على مسافة قريبة سيراً على الأقدام.",
      "المسكن جاهز للسكن.",
      "تحافظ التدفئة المركزية والتكييف على راحة المسكن طوال العام.",
    ],
    titles: ["بنتهاوس مع شرفة فوق الأسطح", "شقة فاخرة مع رواق زجاجي", "دوبلكس مع فناء خاص", "استوديو عصري على شارع هادئ", "شقة مشرقة بأسقف عالية", "شقة زاوية مع شرفات", "منزل عائلي قرب الحديقة", "شقة مجددة قرب المترو"],
    features: feats(["شرفة مساحتها 40 m²", "مصعد", "تدفئة مركزية", "بوّاب", "رواق", "زخارف", "أرضيات خشبية", "مفروش", "شرفة", "تكييف", "مخزن", "رواق زجاجي", "مطل على الخارج", "حارس"]),
    meta: meta(["Salamanca و Chamberí", "اختيار لملف PDF", "أربع وعشرون جولة"]),
    intro: "مجموعة من المساكن اختيرت لبحث محدد: الضوء والهدوء وسهولة المواصلات.",
  },
  he: {
    sentences: [
      "דירה מוארת עם הרבה אור טבעי ותקרות גבוהות.",
      "הסלון נפתח למרפסת הצופה לרחוב שקט.",
      "המטבח נפרד ומאובזר במלואו.",
      "חדרי השינה פונים לחצר פנימית שקטה.",
      "בבניין יש מעלית ושוער.",
      "בשכונה יש חנויות, מסעדות ותחבורה ציבורית טובה.",
      "רצפות העץ והכרכובים המקוריים שוחזרו בקפידה.",
      "החלוקה מעשית ומתוכננת לחיי היומיום.",
      "בחדר הרחצה הראשי יש חלון ואוורור טבעי.",
      "כמה פארקים ובתי ספר נמצאים במרחק הליכה.",
      "הדירה מוכנה לכניסה.",
      "החימום המרכזי והמיזוג שומרים על נוחות הדירה כל השנה.",
    ],
    titles: ["פנטהאוז עם מרפסת מעל הגגות", "דירת יוקרה עם גלריה מזוגגת", "דופלקס עם חצר פרטית", "סטודיו מעוצב ברחוב שקט", "דירה מוארת עם תקרות גבוהות", "דירת פינה עם מרפסות", "בית משפחתי ליד הפארק", "דירה משופצת ליד המטרו"],
    features: feats(["מרפסת של 40 m²", "מעלית", "חימום מרכזי", "שוער", "גלריה", "כרכובים", "רצפות עץ", "מרוהט", "מרפסת", "מיזוג אוויר", "מחסן", "גלריה מזוגגת", "פונה החוצה", "אב בית"]),
    meta: meta(["Salamanca ו-Chamberí", "מבחר עבור ה-PDF", "עשרים וארבעה סיורים"]),
    intro: "מבחר דירות שנבחרו לחיפוש מסוים: אור, שקט ותחבורה נוחה.",
  },
};

/** Un párrafo del idioma de longitud parecida a `es`, empezando en `from`. */
function paragraphLike(bank: Bank, es: string, from: number): { text: string; next: number } {
  const out: string[] = [];
  let i = from;
  do out.push(bank.sentences[i++ % bank.sentences.length]);
  while (out.join(" ").length < es.length * 0.9);
  return { text: out.join(" "), next: i };
}

/** «Traductor» local y determinista (sin IA): responde como TRANSLATION_SCHEMA. */
export function translator(lang: TargetLanguage): TrAiFn {
  const bank = BANKS[lang];
  const titleOf = new Map<string, string>();
  return async ({ userText }) => {
    const req = JSON.parse(userText) as { titulo?: string; bloques?: Array<{ k: string; x: string }>; zona?: string; caracteristicas?: string[]; catalogo?: { titulo: string; introduccion: string } };
    let cursor = 0;
    const blocks = (req.bloques ?? []).map((b) => ({
      k: b.k,
      x: b.x
        .split(/\n{2,}/)
        .map((p) => {
          const r = paragraphLike(bank, p, cursor);
          cursor = r.next;
          return r.text;
        })
        .join("\n\n"),
    }));
    if (req.titulo && !titleOf.has(req.titulo)) titleOf.set(req.titulo, bank.titles[titleOf.size % bank.titles.length] + (titleOf.size >= bank.titles.length ? ` (${titleOf.size + 1})` : ""));
    const missing = (req.caracteristicas ?? []).filter((f) => !bank.features[f]);
    if (missing.length) throw new Error(`pdf-translations: sin traducción de prueba para ${missing.join(", ")}`);
    return JSON.stringify({
      title: req.titulo ? titleOf.get(req.titulo) : "",
      blocks,
      area: req.zona ? paragraphLike(bank, req.zona, 3).text : "",
      features: (req.caracteristicas ?? []).map((f) => ({ es: f, tr: bank.features[f] })),
      catalog_title: req.catalogo ? bank.meta[req.catalogo.titulo] ?? bank.titles[0] : "",
      catalog_intro: req.catalogo?.introduccion ? bank.intro : "",
    });
  };
}

const OWNER_IDS = ["f0000000-0000-0000-0000-000000000001", "f0000000-0000-0000-0000-0000000000a1", "f0000000-0000-0000-0000-0000000000a2"];
export function catalogIdOf(token: string): string {
  const id = OWNER_IDS.find((x) => fixtureOwnerToken(x) === token);
  if (!id) throw new Error(`pdf-translations: ${token} no es un catálogo con dueño en las fixtures`);
  return id;
}

/**
 * Traduce y publica las traducciones de prueba de un catálogo de las
 * fixtures en `lang`, por el mismo camino que la traducción automática
 * («Preparar ahora»: autoUnit), y elige ese idioma para el catálogo con
 * setLanguage (al momento, 0228).
 *   · Con `skip` (claves de vivienda): esas viviendas quedan SIN traducción
 *     (N5).
 * No resetea nada: quien llama decide (fixtureMutate({ op: "reset" })).
 */
export async function translateFixtureCatalog(token: string, lang: TargetLanguage, opts: { skip?: string[] } = {}): Promise<{ catalogId: string; translated: string[]; skipped: string[] }> {
  const catalogId = catalogIdOf(token);
  const { mem } = await fixtureTranslations();
  const ai = translator(lang);
  const skip = new Set(opts.skip ?? []);
  const keys = (await loadPanel(mem, catalogId, lang)).items.map((i) => i.key).filter((k) => !skip.has(k));
  for (const key of keys) {
    const out = await autoUnit(mem, { ai, timeoutMs: 10_000, spend: () => true }, { catalogId, key, lang, manual: true });
    const ok = out.kind === "published" || (out.kind === "ai" && out.published) || (out.kind === "skipped" && out.reason === "current");
    if (!ok) throw new Error(`pdf-translations: traducir ${key} en ${lang} → ${JSON.stringify(out)}`);
  }
  await setLanguage(mem, catalogId, null, lang as CatalogLanguage);
  return { catalogId, translated: keys.filter((k) => k !== META_KEY), skipped: [...skip] };
}

export const PDF_TOKEN = FIXTURE_TOKENS.pdf;
export const MAIN_TOKEN = FIXTURE_TOKENS.main;
