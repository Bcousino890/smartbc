// ============================================================================
// Idiomas de la Viewing Collection pública.
//
// Solo afecta a la superficie que ve el cliente (/v/[token] y su
// previsualización). El panel del CRM sigue en español.
//
// Puro (sin side-effects): lo importan la proyección de servidor y los
// componentes de cliente.
//
// El árabe y el hebreo se sirven en RTL; la dirección se deriva del idioma.
// Las marcas ("Private Viewing Collection", "Private Client Services",
// "WhatsApp", "Ref.") se mantienen tal cual en todos los idiomas.
// ============================================================================

export const COLLECTION_LANGUAGES = [
  "es",
  "en",
  "fr",
  "it",
  "de",
  "ar",
  "tr",
  "he",
] as const;

export type CollectionLanguage = (typeof COLLECTION_LANGUAGES)[number];

export function isCollectionLanguage(v: unknown): v is CollectionLanguage {
  return COLLECTION_LANGUAGES.includes(v as CollectionLanguage);
}

/** Nombre de cada idioma en sí mismo, para el selector del panel. */
export const LANGUAGE_LABELS: Record<CollectionLanguage, string> = {
  es: "Español",
  en: "English",
  fr: "Français",
  it: "Italiano",
  de: "Deutsch",
  ar: "العربية",
  tr: "Türkçe",
  he: "עברית",
};

export function isRtl(lang: CollectionLanguage): boolean {
  return lang === "ar" || lang === "he";
}

/**
 * Locale para Intl. El árabe fuerza numeración latina (`-u-nu-latn`): las
 * horas y precios de la colección deben coincidir con lo que el agente ve en
 * el panel, y los dígitos árabes-índicos romperían esa correspondencia.
 */
export function intlLocale(lang: CollectionLanguage): string {
  switch (lang) {
    case "es":
      return "es-ES";
    case "en":
      return "en-GB";
    case "fr":
      return "fr-FR";
    case "it":
      return "it-IT";
    case "de":
      return "de-DE";
    case "ar":
      return "ar-u-nu-latn";
    case "tr":
      return "tr-TR";
    case "he":
      return "he-IL";
  }
}

export type CollectionDictionary = {
  curatedFor: string;
  residencesCount: (n: number) => string;
  begin: string;

  dayLabel: string;
  dayTitle: string;

  statusConfirmed: string;
  statusPending: string;
  statusCancelled: string;

  residence: string;
  viewPhotos: (n: number) => string;
  closeGallery: string;

  bedrooms: string;
  bathrooms: string;
  surface: string;
  typology: string;

  privateViewing: string;
  location: string;
  addressOnConfirm: string;
  explore: string;
  exploreHint: string;

  reserved: string;
  sold: string;
  noLongerAvailable: string;

  atYourService: string;
  yourAdvisor: string;
  write: string;
  /** Acción del botón de teléfono; el número va en la línea de datos. */
  call: string;

  preparedExclusively: (name: string) => string;
  validUntil: (date: string) => string;

  // Book Mode
  previous: string;
  next: string;
  contents: string;
  pageOf: string;

  minutesShort: string;
  perMonthSuffix: string;
};

/** Cifras en palabra solo en español; en el resto, el dígito es más limpio. */
const ES_WORDS = [
  "ninguna",
  "una",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
];

const DICTIONARIES: Record<CollectionLanguage, CollectionDictionary> = {
  es: {
    curatedFor: "Preparada para",
    residencesCount: (n) =>
      `${ES_WORDS[n] ?? n} ${n === 1 ? "residencia" : "residencias"}`,
    begin: "Comenzar",
    dayLabel: "La jornada",
    dayTitle: "Tu día de visitas",
    statusConfirmed: "Confirmada",
    statusPending: "Por confirmar",
    statusCancelled: "Cancelada",
    residence: "Residencia",
    viewPhotos: (n) => `Ver ${n} fotografías`,
    closeGallery: "Cerrar galería",
    bedrooms: "Dormitorios",
    bathrooms: "Baños",
    surface: "Superficie",
    typology: "Tipología",
    privateViewing: "Visita privada",
    location: "Ubicación",
    addressOnConfirm:
      "La dirección exacta se facilita al confirmar la visita.",
    explore: "Explorar residencia",
    exploreHint: "Galería completa, descripción, vídeo y planos.",
    reserved: "Reservada",
    sold: "Vendida",
    noLongerAvailable: "Esta residencia ya no está disponible.",
    atYourService: "A tu disposición",
    yourAdvisor: "Tu asesor",
    write: "Escribir",
    call: "Llamar",
    preparedExclusively: (name) => `Preparada en exclusiva para ${name}.`,
    validUntil: (date) => `Colección privada · disponible hasta el ${date}`,
    previous: "Anterior",
    next: "Siguiente",
    contents: "Índice",
    pageOf: "de",
    minutesShort: "min",
    perMonthSuffix: "/mes",
  },

  en: {
    curatedFor: "Curated for",
    residencesCount: (n) => `${n} ${n === 1 ? "residence" : "residences"}`,
    begin: "Begin",
    dayLabel: "The itinerary",
    dayTitle: "Your viewing day",
    statusConfirmed: "Confirmed",
    statusPending: "To be confirmed",
    statusCancelled: "Cancelled",
    residence: "Residence",
    viewPhotos: (n) => `View ${n} photographs`,
    closeGallery: "Close gallery",
    bedrooms: "Bedrooms",
    bathrooms: "Bathrooms",
    surface: "Surface",
    typology: "Type",
    privateViewing: "Private viewing",
    location: "Location",
    addressOnConfirm:
      "The exact address is provided once the viewing is confirmed.",
    explore: "Explore residence",
    exploreHint: "Full gallery, description, video and floor plans.",
    reserved: "Reserved",
    sold: "Sold",
    noLongerAvailable: "This residence is no longer available.",
    atYourService: "At your service",
    yourAdvisor: "Your advisor",
    write: "Write",
    call: "Call",
    preparedExclusively: (name) => `Prepared exclusively for ${name}.`,
    validUntil: (date) => `Private collection · available until ${date}`,
    previous: "Previous",
    next: "Next",
    contents: "Contents",
    pageOf: "of",
    minutesShort: "min",
    perMonthSuffix: "/month",
  },

  fr: {
    curatedFor: "Préparée pour",
    residencesCount: (n) => `${n} ${n === 1 ? "résidence" : "résidences"}`,
    begin: "Commencer",
    dayLabel: "L'itinéraire",
    dayTitle: "Votre journée de visites",
    statusConfirmed: "Confirmée",
    statusPending: "À confirmer",
    statusCancelled: "Annulée",
    residence: "Résidence",
    viewPhotos: (n) => `Voir ${n} photographies`,
    closeGallery: "Fermer la galerie",
    bedrooms: "Chambres",
    bathrooms: "Salles de bain",
    surface: "Surface",
    typology: "Type",
    privateViewing: "Visite privée",
    location: "Emplacement",
    addressOnConfirm:
      "L'adresse exacte est communiquée une fois la visite confirmée.",
    explore: "Découvrir la résidence",
    exploreHint: "Galerie complète, description, vidéo et plans.",
    reserved: "Réservée",
    sold: "Vendue",
    noLongerAvailable: "Cette résidence n'est plus disponible.",
    atYourService: "À votre service",
    yourAdvisor: "Votre conseiller",
    write: "Écrire",
    call: "Appeler",
    preparedExclusively: (name) => `Préparée en exclusivité pour ${name}.`,
    validUntil: (date) => `Collection privée · disponible jusqu'au ${date}`,
    previous: "Précédent",
    next: "Suivant",
    contents: "Sommaire",
    pageOf: "sur",
    minutesShort: "min",
    perMonthSuffix: "/mois",
  },

  it: {
    curatedFor: "Preparata per",
    residencesCount: (n) => `${n} ${n === 1 ? "residenza" : "residenze"}`,
    begin: "Iniziare",
    dayLabel: "L'itinerario",
    dayTitle: "La tua giornata di visite",
    statusConfirmed: "Confermata",
    statusPending: "Da confermare",
    statusCancelled: "Annullata",
    residence: "Residenza",
    viewPhotos: (n) => `Vedi ${n} fotografie`,
    closeGallery: "Chiudi la galleria",
    bedrooms: "Camere",
    bathrooms: "Bagni",
    surface: "Superficie",
    typology: "Tipologia",
    privateViewing: "Visita privata",
    location: "Posizione",
    addressOnConfirm:
      "L'indirizzo esatto viene fornito alla conferma della visita.",
    explore: "Esplora la residenza",
    exploreHint: "Galleria completa, descrizione, video e planimetrie.",
    reserved: "Riservata",
    sold: "Venduta",
    noLongerAvailable: "Questa residenza non è più disponibile.",
    atYourService: "A tua disposizione",
    yourAdvisor: "Il tuo consulente",
    write: "Scrivere",
    call: "Chiamare",
    preparedExclusively: (name) => `Preparata in esclusiva per ${name}.`,
    validUntil: (date) => `Collezione privata · disponibile fino al ${date}`,
    previous: "Precedente",
    next: "Successiva",
    contents: "Indice",
    pageOf: "di",
    minutesShort: "min",
    perMonthSuffix: "/mese",
  },

  de: {
    curatedFor: "Zusammengestellt für",
    residencesCount: (n) => `${n} ${n === 1 ? "Residenz" : "Residenzen"}`,
    begin: "Beginnen",
    dayLabel: "Der Tagesplan",
    dayTitle: "Ihr Besichtigungstag",
    statusConfirmed: "Bestätigt",
    statusPending: "Zu bestätigen",
    statusCancelled: "Storniert",
    residence: "Residenz",
    viewPhotos: (n) => `${n} Fotografien ansehen`,
    closeGallery: "Galerie schließen",
    bedrooms: "Schlafzimmer",
    bathrooms: "Bäder",
    surface: "Fläche",
    typology: "Objektart",
    privateViewing: "Private Besichtigung",
    location: "Lage",
    addressOnConfirm:
      "Die genaue Adresse wird nach Bestätigung der Besichtigung mitgeteilt.",
    explore: "Residenz entdecken",
    exploreHint: "Vollständige Galerie, Beschreibung, Video und Grundrisse.",
    reserved: "Reserviert",
    sold: "Verkauft",
    noLongerAvailable: "Diese Residenz ist nicht mehr verfügbar.",
    atYourService: "Für Sie da",
    yourAdvisor: "Ihr Berater",
    write: "Schreiben",
    call: "Anrufen",
    preparedExclusively: (name) =>
      `Exklusiv zusammengestellt für ${name}.`,
    validUntil: (date) => `Private Kollektion · verfügbar bis ${date}`,
    previous: "Zurück",
    next: "Weiter",
    contents: "Inhalt",
    pageOf: "von",
    minutesShort: "Min.",
    perMonthSuffix: "/Monat",
  },

  ar: {
    curatedFor: "أُعدَّت خصيصاً لـ",
    residencesCount: (n) => `${n} ${n === 1 ? "مسكن" : "مساكن"}`,
    begin: "ابدأ",
    dayLabel: "برنامج اليوم",
    dayTitle: "يوم المعاينات الخاص بك",
    statusConfirmed: "مؤكَّدة",
    statusPending: "بانتظار التأكيد",
    statusCancelled: "ملغاة",
    residence: "مسكن",
    viewPhotos: (n) => `عرض ${n} صورة`,
    closeGallery: "إغلاق المعرض",
    bedrooms: "غرف النوم",
    bathrooms: "الحمّامات",
    surface: "المساحة",
    typology: "النوع",
    privateViewing: "معاينة خاصة",
    location: "الموقع",
    addressOnConfirm: "يُقدَّم العنوان الدقيق عند تأكيد المعاينة.",
    explore: "استكشاف المسكن",
    exploreHint: "معرض كامل، وصف، فيديو ومخططات.",
    reserved: "محجوز",
    sold: "مُباع",
    noLongerAvailable: "لم يعد هذا المسكن متاحاً.",
    atYourService: "في خدمتك",
    yourAdvisor: "مستشارك",
    write: "مراسلة",
    call: "اتصال",
    preparedExclusively: (name) => `أُعدَّت حصرياً من أجل ${name}.`,
    validUntil: (date) => `مجموعة خاصة · متاحة حتى ${date}`,
    previous: "السابق",
    next: "التالي",
    contents: "الفهرس",
    pageOf: "من",
    minutesShort: "د",
    perMonthSuffix: "/شهرياً",
  },

  tr: {
    curatedFor: "Sizin için hazırlandı",
    residencesCount: (n) => `${n} rezidans`,
    begin: "Başla",
    dayLabel: "Program",
    dayTitle: "Ziyaret gününüz",
    statusConfirmed: "Onaylandı",
    statusPending: "Onay bekliyor",
    statusCancelled: "İptal edildi",
    residence: "Rezidans",
    viewPhotos: (n) => `${n} fotoğrafı gör`,
    closeGallery: "Galeriyi kapat",
    bedrooms: "Yatak odası",
    bathrooms: "Banyo",
    surface: "Alan",
    typology: "Tür",
    privateViewing: "Özel ziyaret",
    location: "Konum",
    addressOnConfirm: "Kesin adres, ziyaret onaylandığında paylaşılır.",
    explore: "Rezidansı keşfet",
    exploreHint: "Tam galeri, açıklama, video ve planlar.",
    reserved: "Rezerve",
    sold: "Satıldı",
    noLongerAvailable: "Bu rezidans artık mevcut değil.",
    atYourService: "Hizmetinizde",
    yourAdvisor: "Danışmanınız",
    write: "Yazın",
    call: "Arayın",
    preparedExclusively: (name) =>
      `${name} için özel olarak hazırlanmıştır.`,
    validUntil: (date) => `Özel koleksiyon · ${date} tarihine kadar`,
    previous: "Önceki",
    next: "Sonraki",
    contents: "İçindekiler",
    pageOf: "/",
    minutesShort: "dk",
    perMonthSuffix: "/ay",
  },

  he: {
    curatedFor: "הוכן במיוחד עבור",
    residencesCount: (n) => `${n} ${n === 1 ? "נכס" : "נכסים"}`,
    begin: "להתחיל",
    dayLabel: "המסלול",
    dayTitle: "יום הביקורים שלך",
    statusConfirmed: "מאושר",
    statusPending: "ממתין לאישור",
    statusCancelled: "בוטל",
    residence: "נכס",
    viewPhotos: (n) => `צפייה ב-${n} תצלומים`,
    closeGallery: "סגירת הגלריה",
    bedrooms: "חדרי שינה",
    bathrooms: "חדרי רחצה",
    surface: "שטח",
    typology: "סוג",
    privateViewing: "ביקור פרטי",
    location: "מיקום",
    addressOnConfirm: "הכתובת המדויקת תימסר עם אישור הביקור.",
    explore: "לגלות את הנכס",
    exploreHint: "גלריה מלאה, תיאור, וידאו ותוכניות.",
    reserved: "שמור",
    sold: "נמכר",
    noLongerAvailable: "נכס זה אינו זמין עוד.",
    atYourService: "לשירותך",
    yourAdvisor: "היועץ שלך",
    write: "לכתוב",
    call: "להתקשר",
    preparedExclusively: (name) => `הוכן באופן בלעדי עבור ${name}.`,
    validUntil: (date) => `אוסף פרטי · זמין עד ${date}`,
    previous: "הקודם",
    next: "הבא",
    contents: "תוכן",
    pageOf: "מתוך",
    minutesShort: "דק׳",
    perMonthSuffix: "/לחודש",
  },
};

export function getCollectionDictionary(
  lang: CollectionLanguage,
): CollectionDictionary {
  return DICTIONARIES[lang] ?? DICTIONARIES.es;
}
