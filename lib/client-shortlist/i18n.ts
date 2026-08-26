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
  /** Cuántas quedan por decidir. */
  pending: (n: number) => string;
  /** Modos */
  modeReview: string;
  modePriorities: string;
  modeSummary: string;
  reviewAllDone: string;
  ofTotal: (n: number, total: number) => string;
  /** Posición DENTRO de lo que falta por decidir: «Sin decidir · 1 de 3». */
  pendingOfTotal: (n: number, total: number) => string;
  /** Rótulo para una residencia que ya tiene decisión. */
  alreadyDecided: string;
  goToPending: string;
  summaryTitle: string;
  undecidedWarning: (n: number) => string;
  continueReviewing: string;
  sendAnyway: string;
  /** Grupos */
  priorityHomes: string;
  priorityHint: string;
  maybeGroup: string;
  notForMeGroup: string;
  toReview: string;
  /** Explica que "Por revisar" también se puede ordenar, antes de decidir nada. */
  toReviewHint: string;
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
  /** Asa de arrastre de las prioritarias. */
  dragToReorder: string;
  /** Guardado */
  saved: string;
  /** Confirmación discreta del autoguardado. */
  savedChanges: string;
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
    pending: (n) => `${n} sin decidir`,
    priorityHomes: "Tus prioridades",
    modeReview: "Revisar",
    modePriorities: "Prioridades",
    modeSummary: "Resumen",
    reviewAllDone: "Todas revisadas",
    ofTotal: (n, total) => `${n} de ${total}`,
    pendingOfTotal: (n, total) => `Sin decidir · ${n} de ${total}`,
    alreadyDecided: "Ya decidida",
    goToPending: "Ir a la siguiente",
    summaryTitle: "Tu selección",
    undecidedWarning: (n) => `Quedan ${n} residencias sin revisar.`,
    continueReviewing: "Seguir revisando",
    sendAnyway: "Enviar de todos modos",
    priorityHint: "El orden es tu preferencia, no un horario. Arrástralas para cambiarlo.",
    maybeGroup: "Alternativas",
    notForMeGroup: "Descartadas",
    toReview: "Por revisar",
    toReviewHint: "Arrástralas para decidir primero las que más te interesan.",
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
    dragToReorder: "Arrastra para cambiar el orden",
    saved: "Guardado",
    savedChanges: "Cambios guardados",
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
    pending: (n) => `${n} still to decide`,
    priorityHomes: "Your priorities",
    modeReview: "Review",
    modePriorities: "Priorities",
    modeSummary: "Summary",
    reviewAllDone: "All reviewed",
    ofTotal: (n, total) => `${n} of ${total}`,
    pendingOfTotal: (n, total) => `Undecided · ${n} of ${total}`,
    alreadyDecided: "Already decided",
    goToPending: "Go to the next one",
    summaryTitle: "Your selection",
    undecidedWarning: (n) => `${n} residences are still undecided.`,
    continueReviewing: "Continue reviewing",
    sendAnyway: "Send anyway",
    priorityHint: "The order is your preference, not a schedule. Drag them to change it.",
    maybeGroup: "Alternatives",
    notForMeGroup: "Set aside",
    toReview: "To review",
    toReviewHint: "Drag them to decide the ones you care about first.",
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
    dragToReorder: "Drag to reorder",
    saved: "Saved",
    savedChanges: "Changes saved",
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
    pending: (n) => `${n} à décider`,
    priorityHomes: "Vos priorités",
    modeReview: "Passer en revue",
    modePriorities: "Priorités",
    modeSummary: "Résumé",
    reviewAllDone: "Tout est vu",
    ofTotal: (n, total) => `${n} sur ${total}`,
    pendingOfTotal: (n, total) => `Sans décision · ${n} sur ${total}`,
    alreadyDecided: "Déjà décidée",
    goToPending: "Aller à la suivante",
    summaryTitle: "Votre sélection",
    undecidedWarning: (n) => `Il reste ${n} résidences à examiner.`,
    continueReviewing: "Continuer",
    sendAnyway: "Envoyer quand même",
    priorityHint: "L'ordre est votre préférence, pas un horaire. Faites-les glisser pour le modifier.",
    maybeGroup: "Alternatives",
    notForMeGroup: "Écartées",
    toReview: "À examiner",
    toReviewHint: "Faites-les glisser pour décider d’abord celles qui vous intéressent.",
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
    dragToReorder: "Faites glisser pour réordonner",
    saved: "Enregistré",
    savedChanges: "Modifications enregistrées",
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
    pending: (n) => `${n} da decidere`,
    priorityHomes: "Le sue priorità",
    modeReview: "Rivedere",
    modePriorities: "Priorità",
    modeSummary: "Riepilogo",
    reviewAllDone: "Tutto rivisto",
    ofTotal: (n, total) => `${n} di ${total}`,
    pendingOfTotal: (n, total) => `Da decidere · ${n} di ${total}`,
    alreadyDecided: "Già decisa",
    goToPending: "Vai alla prossima",
    summaryTitle: "La sua selezione",
    undecidedWarning: (n) => `Restano ${n} residenze da rivedere.`,
    continueReviewing: "Continuare",
    sendAnyway: "Invia comunque",
    priorityHint: "L'ordine è la sua preferenza, non un orario. Le trascini per cambiarlo.",
    maybeGroup: "Alternative",
    notForMeGroup: "Da parte",
    toReview: "Da rivedere",
    toReviewHint: "Le trascini per decidere prima quelle che le interessano di più.",
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
    dragToReorder: "Trascina per riordinare",
    saved: "Salvato",
    savedChanges: "Modifiche salvate",
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
    pending: (n) => `${n} noch offen`,
    priorityHomes: "Ihre Prioritäten",
    modeReview: "Durchsehen",
    modePriorities: "Prioritäten",
    modeSummary: "Übersicht",
    reviewAllDone: "Alles gesehen",
    ofTotal: (n, total) => `${n} von ${total}`,
    pendingOfTotal: (n, total) => `Offen · ${n} von ${total}`,
    alreadyDecided: "Bereits entschieden",
    goToPending: "Zur nächsten",
    summaryTitle: "Ihre Auswahl",
    undecidedWarning: (n) => `${n} Residenzen sind noch offen.`,
    continueReviewing: "Weiter ansehen",
    sendAnyway: "Trotzdem senden",
    priorityHint: "Die Reihenfolge ist Ihr Wunsch, kein Termin. Ziehen Sie sie, um sie zu ändern.",
    maybeGroup: "Alternativen",
    notForMeGroup: "Zurückgestellt",
    toReview: "Zu prüfen",
    toReviewHint: "Ziehen Sie sie, um zuerst über die für Sie wichtigsten zu entscheiden.",
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
    dragToReorder: "Zum Umsortieren ziehen",
    saved: "Gespeichert",
    savedChanges: "Änderungen gespeichert",
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
    pending: (n) => `${n} دون قرار`,
    priorityHomes: "أولوياتك",
    modeReview: "المراجعة",
    modePriorities: "الأولويات",
    modeSummary: "الملخص",
    reviewAllDone: "اكتملت المراجعة",
    ofTotal: (n, total) => `${n} من ${total}`,
    pendingOfTotal: (n, total) => `لم تُحدَّد بعد · ${n} من ${total}`,
    alreadyDecided: "تم تحديدها",
    goToPending: "إلى التالية",
    summaryTitle: "اختيارك",
    undecidedWarning: (n) => `بقيت ${n} من المساكن دون مراجعة.`,
    continueReviewing: "متابعة المراجعة",
    sendAnyway: "الإرسال على أي حال",
    priorityHint: "الترتيب تفضيلك، وليس موعداً. اسحبها لتغييره.",
    maybeGroup: "بدائل",
    notForMeGroup: "مستبعدة",
    toReview: "للمراجعة",
    toReviewHint: "اسحبها لتقرر أولاً ما يهمك أكثر.",
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
    dragToReorder: "اسحب لإعادة الترتيب",
    saved: "تم الحفظ",
    savedChanges: "تم حفظ التغييرات",
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
    pending: (n) => `${n} karar bekliyor`,
    priorityHomes: "Önceliğiniz",
    modeReview: "İnceleme",
    modePriorities: "Öncelikler",
    modeSummary: "Özet",
    reviewAllDone: "Tümü incelendi",
    ofTotal: (n, total) => `${total} içinden ${n}`,
    pendingOfTotal: (n, total) => `Karar verilmedi · ${total} içinden ${n}`,
    alreadyDecided: "Karar verildi",
    goToPending: "Sıradakine geç",
    summaryTitle: "Seçiminiz",
    undecidedWarning: (n) => `${n} konut hâlâ incelenmedi.`,
    continueReviewing: "İncelemeye devam",
    sendAnyway: "Yine de gönder",
    priorityHint: "Sıra sizin tercihiniz, bir randevu değil. Değiştirmek için sürükleyin.",
    maybeGroup: "Alternatifler",
    notForMeGroup: "Bir kenara",
    toReview: "İncelenecek",
    toReviewHint: "En çok ilginizi çekenlere önce karar vermek için sürükleyin.",
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
    dragToReorder: "Sıralamak için sürükleyin",
    saved: "Kaydedildi",
    savedChanges: "Değişiklikler kaydedildi",
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
    pending: (n) => `${n} ללא החלטה`,
    priorityHomes: "העדיפויות שלך",
    modeReview: "סקירה",
    modePriorities: "עדיפויות",
    modeSummary: "סיכום",
    reviewAllDone: "הכול נסקר",
    ofTotal: (n, total) => `${n} מתוך ${total}`,
    pendingOfTotal: (n, total) => `ללא החלטה · ${n} מתוך ${total}`,
    alreadyDecided: "כבר הוחלט",
    goToPending: "למשל הבא",
    summaryTitle: "הבחירה שלך",
    undecidedWarning: (n) => `נותרו ${n} נכסים לסקירה.`,
    continueReviewing: "להמשיך לסקור",
    sendAnyway: "לשלוח בכל זאת",
    priorityHint: "הסדר הוא ההעדפה שלך, לא מועד. גרור אותן כדי לשנות.",
    maybeGroup: "חלופות",
    notForMeGroup: "הוסרו",
    toReview: "לבדיקה",
    toReviewHint: "גרור אותן כדי להחליט קודם על אלה שמעניינות אותך.",
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
    dragToReorder: "גרור כדי לשנות את הסדר",
    saved: "נשמר",
    savedChanges: "השינויים נשמרו",
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
