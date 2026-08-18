// ============================================================================
// Private Client Shortlist · idiomas.
//
// Diccionario PROPIO, no una sección del Private Book: son dos productos con
// vocabulario distinto (uno se lee, el otro se usa). Lo que sí se comparte es
// la maquinaria de idioma —qué idiomas hay, cuáles van en RTL, qué locale usa
// Intl—, porque eso sí es común y duplicarlo garantizaría que se separasen.
//
// Español e inglés están revisados. El resto los marca el panel como
// pendientes, con el mismo conjunto que usa la colección.
// ============================================================================

import type { CollectionLanguage } from "@/lib/viewing-collections/i18n";

export type ShortlistDictionary = {
  /** Apertura */
  privateClientServices: string;
  intro: (n: number) => string;
  invitation: string;
  /** Progreso */
  reviewed: (done: number, total: number) => string;
  /** Grupos */
  priorityHomes: string;
  priorityHint: string;
  maybeGroup: string;
  notForMeGroup: string;
  toReview: string;
  /** Decisiones */
  mustVisit: string;
  maybe: string;
  notForMe: string;
  restore: string;
  undo: string;
  /** Acciones */
  viewResidence: string;
  closeResidence: string;
  allPhotographs: string;
  previousPhoto: string;
  nextPhoto: string;
  addNote: string;
  editNote: string;
  notePlaceholder: string;
  saveNote: string;
  addResidence: string;
  searchPlaceholder: string;
  alreadyAdded: string;
  add: string;
  noResults: string;
  addedByYou: string;
  moveUp: string;
  moveDown: string;
  /** Guardado */
  saved: string;
  saving: string;
  saveFailed: string;
  retry: string;
  /** Envío */
  submit: string;
  submitSummary: (must: number, maybe: number, no: number) => string;
  submitted: (when: string) => string;
  submittedAgain: string;
  changesAfterSubmit: string;
  /** Datos */
  bedrooms: string;
  bathrooms: string;
  surface: string;
  /** Terminal */
  emptyState: string;
};

const DICTS: Record<CollectionLanguage, ShortlistDictionary> = {
  es: {
    privateClientServices: "Private Client Services",
    intro: (n) => `Hemos reunido ${n} residencias para ti.`,
    invitation:
      "Elige las que de verdad quieres visitar, ordénalas a tu gusto y déjanos las notas que quieras.",
    reviewed: (d, t) => `${d} de ${t} revisadas`,
    priorityHomes: "Tus prioridades",
    priorityHint: "El orden es tu preferencia, no un horario.",
    maybeGroup: "Alternativas",
    notForMeGroup: "Descartadas",
    toReview: "Por revisar",
    mustVisit: "Quiero visitarla",
    maybe: "Quizá",
    notForMe: "Descartar",
    restore: "Recuperar",
    undo: "Deshacer",
    viewResidence: "Ver residencia",
    closeResidence: "Cerrar",
    allPhotographs: "Todas las fotografías",
    previousPhoto: "Anterior",
    nextPhoto: "Siguiente",
    addNote: "Añadir nota",
    editNote: "Ver nota",
    notePlaceholder: "Lo que quieras contarnos sobre esta casa…",
    saveNote: "Guardar nota",
    addResidence: "Añadir otra residencia",
    searchPlaceholder: "Referencia, calle o zona",
    alreadyAdded: "Ya está",
    add: "Añadir",
    noResults: "Sin resultados",
    addedByYou: "Añadida por ti",
    moveUp: "Subir",
    moveDown: "Bajar",
    saved: "Guardado",
    saving: "Guardando",
    saveFailed: "No se ha guardado",
    retry: "Reintentar",
    submit: "Enviar mis prioridades",
    submitSummary: (m, q, n) =>
      `${m} para visitar · ${q} alternativas · ${n} descartadas`,
    submitted: (w) => `Enviado el ${w}`,
    submittedAgain: "Volver a enviar",
    changesAfterSubmit: "Has hecho cambios desde que lo enviaste.",
    bedrooms: "Dormitorios",
    bathrooms: "Baños",
    surface: "Superficie",
    emptyState: "Todavía no hay residencias en esta selección.",
  },

  en: {
    privateClientServices: "Private Client Services",
    intro: (n) => `We have gathered ${n} residences for you.`,
    invitation:
      "Choose the ones you would truly like to visit, arrange them in your preferred order, and leave us any notes.",
    reviewed: (d, t) => `${d} of ${t} reviewed`,
    priorityHomes: "Your priorities",
    priorityHint: "The order is your preference, not a schedule.",
    maybeGroup: "Alternatives",
    notForMeGroup: "Set aside",
    toReview: "To review",
    mustVisit: "I want to visit",
    maybe: "Maybe",
    notForMe: "Set aside",
    restore: "Bring back",
    undo: "Undo",
    viewResidence: "View residence",
    closeResidence: "Close",
    allPhotographs: "All photographs",
    previousPhoto: "Previous",
    nextPhoto: "Next",
    addNote: "Add a note",
    editNote: "View note",
    notePlaceholder: "Anything you would like to tell us about this home…",
    saveNote: "Save note",
    addResidence: "Add another residence",
    searchPlaceholder: "Reference, street or area",
    alreadyAdded: "Already in",
    add: "Add",
    noResults: "No results",
    addedByYou: "Added by you",
    moveUp: "Move up",
    moveDown: "Move down",
    saved: "Saved",
    saving: "Saving",
    saveFailed: "Not saved",
    retry: "Try again",
    submit: "Send my priorities",
    submitSummary: (m, q, n) =>
      `${m} to visit · ${q} alternatives · ${n} set aside`,
    submitted: (w) => `Sent on ${w}`,
    submittedAgain: "Send again",
    changesAfterSubmit: "You have made changes since you sent this.",
    bedrooms: "Bedrooms",
    bathrooms: "Bathrooms",
    surface: "Surface",
    emptyState: "There are no residences in this selection yet.",
  },

  fr: {
    privateClientServices: "Private Client Services",
    intro: (n) => `Nous avons réuni ${n} résidences pour vous.`,
    invitation:
      "Choisissez celles que vous souhaitez vraiment visiter, classez-les selon vos préférences et laissez-nous vos notes.",
    reviewed: (d, t) => `${d} sur ${t} passées en revue`,
    priorityHomes: "Vos priorités",
    priorityHint: "L'ordre est votre préférence, pas un horaire.",
    maybeGroup: "Alternatives",
    notForMeGroup: "Écartées",
    toReview: "À examiner",
    mustVisit: "Je veux la visiter",
    maybe: "Peut-être",
    notForMe: "Écarter",
    restore: "Récupérer",
    undo: "Annuler",
    viewResidence: "Voir la résidence",
    closeResidence: "Fermer",
    allPhotographs: "Toutes les photographies",
    previousPhoto: "Précédente",
    nextPhoto: "Suivante",
    addNote: "Ajouter une note",
    editNote: "Voir la note",
    notePlaceholder: "Ce que vous souhaitez nous dire sur ce bien…",
    saveNote: "Enregistrer",
    addResidence: "Ajouter une autre résidence",
    searchPlaceholder: "Référence, rue ou quartier",
    alreadyAdded: "Déjà présente",
    add: "Ajouter",
    noResults: "Aucun résultat",
    addedByYou: "Ajoutée par vous",
    moveUp: "Monter",
    moveDown: "Descendre",
    saved: "Enregistré",
    saving: "Enregistrement",
    saveFailed: "Non enregistré",
    retry: "Réessayer",
    submit: "Envoyer mes priorités",
    submitSummary: (m, q, n) =>
      `${m} à visiter · ${q} alternatives · ${n} écartées`,
    submitted: (w) => `Envoyé le ${w}`,
    submittedAgain: "Renvoyer",
    changesAfterSubmit: "Vous avez modifié votre sélection depuis l'envoi.",
    bedrooms: "Chambres",
    bathrooms: "Salles de bain",
    surface: "Surface",
    emptyState: "Il n'y a encore aucune résidence dans cette sélection.",
  },

  it: {
    privateClientServices: "Private Client Services",
    intro: (n) => `Abbiamo raccolto ${n} residenze per lei.`,
    invitation:
      "Scelga quelle che desidera davvero visitare, le ordini come preferisce e ci lasci le sue note.",
    reviewed: (d, t) => `${d} di ${t} riviste`,
    priorityHomes: "Le sue priorità",
    priorityHint: "L'ordine è la sua preferenza, non un orario.",
    maybeGroup: "Alternative",
    notForMeGroup: "Da parte",
    toReview: "Da rivedere",
    mustVisit: "Voglio visitarla",
    maybe: "Forse",
    notForMe: "Metti da parte",
    restore: "Recupera",
    undo: "Annulla",
    viewResidence: "Vedi residenza",
    closeResidence: "Chiudi",
    allPhotographs: "Tutte le fotografie",
    previousPhoto: "Precedente",
    nextPhoto: "Successiva",
    addNote: "Aggiungi una nota",
    editNote: "Vedi nota",
    notePlaceholder: "Quello che desidera dirci su questa casa…",
    saveNote: "Salva nota",
    addResidence: "Aggiungi un'altra residenza",
    searchPlaceholder: "Riferimento, via o zona",
    alreadyAdded: "Già presente",
    add: "Aggiungi",
    noResults: "Nessun risultato",
    addedByYou: "Aggiunta da lei",
    moveUp: "Sposta su",
    moveDown: "Sposta giù",
    saved: "Salvato",
    saving: "Salvataggio",
    saveFailed: "Non salvato",
    retry: "Riprova",
    submit: "Invia le mie priorità",
    submitSummary: (m, q, n) =>
      `${m} da visitare · ${q} alternative · ${n} da parte`,
    submitted: (w) => `Inviato il ${w}`,
    submittedAgain: "Invia di nuovo",
    changesAfterSubmit: "Ha fatto modifiche dopo l'invio.",
    bedrooms: "Camere",
    bathrooms: "Bagni",
    surface: "Superficie",
    emptyState: "Non ci sono ancora residenze in questa selezione.",
  },

  de: {
    privateClientServices: "Private Client Services",
    intro: (n) => `Wir haben ${n} Residenzen für Sie zusammengestellt.`,
    invitation:
      "Wählen Sie die aus, die Sie wirklich besichtigen möchten, ordnen Sie sie nach Ihren Wünschen und hinterlassen Sie uns Ihre Anmerkungen.",
    reviewed: (d, t) => `${d} von ${t} durchgesehen`,
    priorityHomes: "Ihre Prioritäten",
    priorityHint: "Die Reihenfolge ist Ihr Wunsch, kein Termin.",
    maybeGroup: "Alternativen",
    notForMeGroup: "Zurückgestellt",
    toReview: "Zu prüfen",
    mustVisit: "Möchte ich besichtigen",
    maybe: "Vielleicht",
    notForMe: "Zurückstellen",
    restore: "Zurückholen",
    undo: "Rückgängig",
    viewResidence: "Residenz ansehen",
    closeResidence: "Schließen",
    allPhotographs: "Alle Fotografien",
    previousPhoto: "Zurück",
    nextPhoto: "Weiter",
    addNote: "Notiz hinzufügen",
    editNote: "Notiz ansehen",
    notePlaceholder: "Was Sie uns zu diesem Haus sagen möchten…",
    saveNote: "Notiz speichern",
    addResidence: "Weitere Residenz hinzufügen",
    searchPlaceholder: "Referenz, Straße oder Gegend",
    alreadyAdded: "Bereits dabei",
    add: "Hinzufügen",
    noResults: "Keine Treffer",
    addedByYou: "Von Ihnen hinzugefügt",
    moveUp: "Nach oben",
    moveDown: "Nach unten",
    saved: "Gespeichert",
    saving: "Wird gespeichert",
    saveFailed: "Nicht gespeichert",
    retry: "Erneut versuchen",
    submit: "Meine Prioritäten senden",
    submitSummary: (m, q, n) =>
      `${m} zu besichtigen · ${q} Alternativen · ${n} zurückgestellt`,
    submitted: (w) => `Gesendet am ${w}`,
    submittedAgain: "Erneut senden",
    changesAfterSubmit: "Sie haben seit dem Senden Änderungen vorgenommen.",
    bedrooms: "Schlafzimmer",
    bathrooms: "Badezimmer",
    surface: "Fläche",
    emptyState: "In dieser Auswahl gibt es noch keine Residenzen.",
  },

  ar: {
    privateClientServices: "Private Client Services",
    intro: (n) => `اخترنا لك ${n} من المساكن.`,
    invitation:
      "اختر ما ترغب بزيارته فعلاً، ورتّبها حسب أفضليتك، واترك لنا ملاحظاتك.",
    reviewed: (d, t) => `${d} من ${t} تمت مراجعتها`,
    priorityHomes: "أولوياتك",
    priorityHint: "الترتيب تفضيلك، وليس موعداً.",
    maybeGroup: "بدائل",
    notForMeGroup: "مستبعدة",
    toReview: "للمراجعة",
    mustVisit: "أرغب بزيارتها",
    maybe: "ربما",
    notForMe: "استبعاد",
    restore: "استعادة",
    undo: "تراجع",
    viewResidence: "عرض المسكن",
    closeResidence: "إغلاق",
    allPhotographs: "كل الصور",
    previousPhoto: "السابق",
    nextPhoto: "التالي",
    addNote: "إضافة ملاحظة",
    editNote: "عرض الملاحظة",
    notePlaceholder: "ما تودّ إخبارنا به عن هذا المنزل…",
    saveNote: "حفظ الملاحظة",
    addResidence: "إضافة مسكن آخر",
    searchPlaceholder: "المرجع أو الشارع أو المنطقة",
    alreadyAdded: "مضافة",
    add: "إضافة",
    noResults: "لا نتائج",
    addedByYou: "أضفتها بنفسك",
    moveUp: "أعلى",
    moveDown: "أسفل",
    saved: "تم الحفظ",
    saving: "جارٍ الحفظ",
    saveFailed: "لم يتم الحفظ",
    retry: "إعادة المحاولة",
    submit: "إرسال أولوياتي",
    submitSummary: (m, q, n) => `${m} للزيارة · ${q} بدائل · ${n} مستبعدة`,
    submitted: (w) => `أُرسلت في ${w}`,
    submittedAgain: "إرسال مرة أخرى",
    changesAfterSubmit: "أجريت تغييرات بعد الإرسال.",
    bedrooms: "غرف النوم",
    bathrooms: "الحمامات",
    surface: "المساحة",
    emptyState: "لا توجد مساكن في هذه القائمة بعد.",
  },

  tr: {
    privateClientServices: "Private Client Services",
    intro: (n) => `Sizin için ${n} konut bir araya getirdik.`,
    invitation:
      "Gerçekten görmek istediklerinizi seçin, tercih ettiğiniz sıraya dizin ve notlarınızı bırakın.",
    reviewed: (d, t) => `${t} konuttan ${d} tanesi incelendi`,
    priorityHomes: "Önceliğiniz",
    priorityHint: "Sıra sizin tercihiniz, bir randevu değil.",
    maybeGroup: "Alternatifler",
    notForMeGroup: "Bir kenara",
    toReview: "İncelenecek",
    mustVisit: "Görmek istiyorum",
    maybe: "Belki",
    notForMe: "Bir kenara ayır",
    restore: "Geri al",
    undo: "Geri al",
    viewResidence: "Konutu gör",
    closeResidence: "Kapat",
    allPhotographs: "Tüm fotoğraflar",
    previousPhoto: "Önceki",
    nextPhoto: "Sonraki",
    addNote: "Not ekle",
    editNote: "Notu gör",
    notePlaceholder: "Bu ev hakkında bize söylemek istedikleriniz…",
    saveNote: "Notu kaydet",
    addResidence: "Başka bir konut ekle",
    searchPlaceholder: "Referans, sokak veya bölge",
    alreadyAdded: "Zaten var",
    add: "Ekle",
    noResults: "Sonuç yok",
    addedByYou: "Sizin eklediğiniz",
    moveUp: "Yukarı",
    moveDown: "Aşağı",
    saved: "Kaydedildi",
    saving: "Kaydediliyor",
    saveFailed: "Kaydedilmedi",
    retry: "Tekrar dene",
    submit: "Önceliklerimi gönder",
    submitSummary: (m, q, n) =>
      `${m} görülecek · ${q} alternatif · ${n} bir kenarda`,
    submitted: (w) => `${w} tarihinde gönderildi`,
    submittedAgain: "Yeniden gönder",
    changesAfterSubmit: "Gönderdikten sonra değişiklik yaptınız.",
    bedrooms: "Yatak odası",
    bathrooms: "Banyo",
    surface: "Alan",
    emptyState: "Bu seçkide henüz konut yok.",
  },

  he: {
    privateClientServices: "Private Client Services",
    intro: (n) => `אספנו עבורך ${n} נכסים.`,
    invitation:
      "בחר את אלה שתרצה באמת לראות, סדר אותם לפי העדפתך, והשאר לנו הערות.",
    reviewed: (d, t) => `${d} מתוך ${t} נבדקו`,
    priorityHomes: "העדיפויות שלך",
    priorityHint: "הסדר הוא ההעדפה שלך, לא מועד.",
    maybeGroup: "חלופות",
    notForMeGroup: "הוסרו",
    toReview: "לבדיקה",
    mustVisit: "מעוניין לראות",
    maybe: "אולי",
    notForMe: "להסיר",
    restore: "להחזיר",
    undo: "ביטול",
    viewResidence: "לצפייה בנכס",
    closeResidence: "סגירה",
    allPhotographs: "כל התצלומים",
    previousPhoto: "הקודם",
    nextPhoto: "הבא",
    addNote: "הוספת הערה",
    editNote: "צפייה בהערה",
    notePlaceholder: "מה שתרצה לספר לנו על הבית הזה…",
    saveNote: "שמירת הערה",
    addResidence: "הוספת נכס נוסף",
    searchPlaceholder: "מספר, רחוב או אזור",
    alreadyAdded: "כבר נוסף",
    add: "הוספה",
    noResults: "אין תוצאות",
    addedByYou: "נוסף על ידך",
    moveUp: "למעלה",
    moveDown: "למטה",
    saved: "נשמר",
    saving: "שומר",
    saveFailed: "לא נשמר",
    retry: "לנסות שוב",
    submit: "שליחת העדיפויות שלי",
    submitSummary: (m, q, n) => `${m} לביקור · ${q} חלופות · ${n} הוסרו`,
    submitted: (w) => `נשלח ב-${w}`,
    submittedAgain: "לשלוח שוב",
    changesAfterSubmit: "ביצעת שינויים מאז ששלחת.",
    bedrooms: "חדרי שינה",
    bathrooms: "חדרי רחצה",
    surface: "שטח",
    emptyState: "אין עדיין נכסים בבחירה הזו.",
  },
};

export function getShortlistDictionary(
  lang: CollectionLanguage,
): ShortlistDictionary {
  return DICTS[lang] ?? DICTS.es;
}
