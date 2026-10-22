// ============================================================================
// Idiomas del catálogo compartido (BCP-01 ampliación, expediente
// 2026-10-21-bcp-01-ampliacion-textos-idiomas, PR4: spec §3, DA9–DA21, N2).
//
// Apoyado en la maquinaria del itinerario (lib/viewing-collections/i18n.ts):
// la misma lista de ocho idiomas, la misma dirección (ar y he en RTL), el
// mismo locale de Intl (el árabe con cifras latinas) y la misma marca
// «sin revisión nativa» para ar, tr y he (TRANSLATION_REVIEW_REQUIRED).
//
// Aquí viven SOLO las etiquetas fijas del lector: portada, índice, ficha,
// navegación, galería, estados de las fotos, avisos, contacto, PDF,
// valoraciones, errores, operación, precio, planta, estaciones y títulos de
// las secciones (incluido «Vivir en {zona}», con el nombre propio sin
// traducir). El contenido (título y descripción de cada vivienda) sigue en
// español hasta el PR6. Puro: sin red, sin IA, sin side-effects.
//
// Las cifras, los precios y los teléfonos se formatean con Intl y el locale
// del idioma, SIEMPRE con dígitos latinos; quien los pinta los aísla en LTR.
// El español reproduce EXACTAMENTE los textos y formatos que el lector y el
// PDF tenían antes de este PR (scripts/test-catalogs-i18n.mts lo vigila).
// ============================================================================

import {
  COLLECTION_LANGUAGES,
  LANGUAGE_LABELS,
  TRANSLATION_REVIEW_REQUIRED,
  intlLocale,
  isCollectionLanguage,
  isRtl,
  type CollectionLanguage,
} from "@/lib/viewing-collections/i18n";
import type { SectionKey } from "./structure";

export type CatalogLanguage = CollectionLanguage;
export const CATALOG_LANGUAGES = COLLECTION_LANGUAGES;
export const DEFAULT_CATALOG_LANGUAGE: CatalogLanguage = "es";

export { LANGUAGE_LABELS, TRANSLATION_REVIEW_REQUIRED, intlLocale, isRtl };

export function isCatalogLanguage(v: unknown): v is CatalogLanguage {
  return isCollectionLanguage(v);
}

/** Idioma que trae la instantánea (`lang`, 0223); lo desconocido es español. */
export function snapshotLang(v: unknown): CatalogLanguage {
  return isCatalogLanguage(v) ? v : DEFAULT_CATALOG_LANGUAGE;
}

export function textDirection(lang: CatalogLanguage): "ltr" | "rtl" {
  return isRtl(lang) ? "rtl" : "ltr";
}

/** ar, tr y he: traducidos sin revisión nativa; nunca se presentan como validados. */
export function needsNativeReview(lang: CatalogLanguage): boolean {
  return TRANSLATION_REVIEW_REQUIRED.has(lang);
}

export type Season = "winter" | "spring" | "summer" | "autumn";

export type CatalogDictionary = {
  // ── Portada ──
  /** aria de la portada. */
  cover: string;
  privateSelection: string;
  preparedBy: string;
  /** «Cuatro viviendas», «Una vivienda», «24 viviendas». */
  homesCount: (n: number) => string;
  begin: string;
  seasons: Record<Season, string>;

  // ── Índice ──
  introLabel: string;
  /** aria de la introducción. */
  introduction: string;
  greeting: string;
  contents: string;
  inThisSelection: string;
  emptyTitle: string;
  emptyHint: string;
  moreHomes: string;
  placeNoData: string;
  reserved: string;
  /** «p. 3» (folio en el índice). */
  pageAbbr: (n: number) => string;

  // ── Vivienda ──
  viewPhotos: (n: number) => string;
  viewPhotosOf: (title: string) => string;
  noPhotos: string;
  photoNofM: (i: number, n: number) => string;
  keyFacts: string;
  surface: string;
  bedrooms: string;
  bathrooms: string;
  floor: string;
  features: string;
  operation: string;
  price: string;
  place: string;
  noData: string;
  inDetail: string;
  detailOf: (title: string) => string;
  sheetOf: (title: string) => string;
  descriptionOf: (title: string) => string;
  description: string;
  keepReading: string;
  scrollsHint: (label: string) => string;

  // ── Navegación ──
  previous: string;
  next: string;
  pageOf: string;
  navLabel: string;
  modePages: string;
  modeScroll: string;
  closeNotice: string;

  // ── Galería y fotos ──
  closeGallery: string;
  galleryAll: string;
  loadingPhoto: string;
  photoUnavailable: string;
  photoCannotShow: string;

  // ── Avisos ──
  offline: string;
  itemRemoved: string;
  itemRemovedLast: string;
  photoRemoved: string;

  // ── Contacto y colofón ──
  contact: string;
  letsTalk: string;
  closingHint: string;
  advisor: (role: "asesor" | "asesora") => string;
  call: string;
  closingFooter: (date: string) => string;
  colophon: string;
  colophonLine: string;
  colophonFooter: (date: string) => string;
  dateUnknown: string;

  // ── Estados ──
  linkKicker: string;
  linkUnavailable: string;
  linkUnavailableHint: string;

  // ── PDF ──
  pdfDownload: string;
  pdfPreparing: string;
  pdfHint: string;
  pdfDownloaded: string;
  pdfNotFound: string;
  pdfBusy: string;
  pdfChanging: string;
  pdfRateLimited: string;
  pdfOtherInProgress: string;
  pdfFailed: string;
  pdfNetwork: string;

  // ── Opiniones ──
  yourOpinion: string;
  feedbackHint: string;
  ratingOf: (title: string) => string;
  stars: (n: number) => string;
  notRated: string;
  nOf5: (n: number) => string;
  comment: string;
  optional: string;
  savedAt: (date: string) => string;
  saving: string;
  saveChanges: string;
  saveOpinion: string;
  savedOk: string;
  savedUnchanged: string;
  errLinkInvalid: string;
  errNotInCatalog: string;
  errInvalidRating: string;
  /** `max` llega ya formateado en el idioma. */
  errTooLong: (max: string) => string;
  errRateLimited: string;
  errNetwork: string;
  errBackend: string;

  // ── Operación y precio ──
  sale: string;
  rent: string;
  saleAndRent: string;
  operationNoData: string;
  priceNoData: string;
  /** `n` llega ya agrupado («1.450.000»); aquí solo se coloca el símbolo. */
  priceEur: (n: string) => string;
  perMonth: (price: string) => string;

  // ── Planta ──
  floorN: (n: number) => string;
  groundFloor: string;
  basement: string;
  penthouse: string;
  floorNoData: string;
  /** Forma breve de los datos clave: «7», «baja». */
  floorShortN: (n: number) => string;
  groundFloorShort: string;

  // ── Secciones de la descripción (DA18: la clave manda, el título sale de aquí) ──
  sections: Record<SectionKey, string>;
  livingIn: (zone: string) => string;

  untitled: string;
};

const ES_WORDS = ["", "Una", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho", "Nueve", "Diez", "Once", "Doce"];

const DICTIONARIES: Record<CatalogLanguage, CatalogDictionary> = {
  es: {
    cover: "Portada",
    privateSelection: "Selección privada",
    preparedBy: "Preparada por",
    homesCount: (n) => `${ES_WORDS[n] ?? n} ${n === 1 ? "vivienda" : "viviendas"}`,
    begin: "Comenzar",
    seasons: { winter: "Invierno", spring: "Primavera", summer: "Verano", autumn: "Otoño" },
    introLabel: "Una selección pensada para ti",
    introduction: "Introducción",
    greeting: "Un saludo,",
    contents: "Índice",
    inThisSelection: "En esta selección",
    emptyTitle: "Esta selección no tiene viviendas ahora mismo",
    emptyHint: "Se actualizará en cuanto haya opciones nuevas. Esta página se actualiza sola.",
    moreHomes: "Más viviendas ↓",
    placeNoData: "Zona · sin dato",
    reserved: "Reservada",
    pageAbbr: (n) => `p. ${n}`,
    viewPhotos: (n) => `Ver ${n} ${n === 1 ? "fotografía" : "fotografías"}`,
    viewPhotosOf: (t) => `Ver las fotos de ${t}`,
    noPhotos: "Sin fotos",
    photoNofM: (i, n) => `Foto ${i} de ${n}`,
    keyFacts: "Datos clave",
    surface: "Superficie",
    bedrooms: "Dormitorios",
    bathrooms: "Baños",
    floor: "Planta",
    features: "Características",
    operation: "Operación",
    price: "Precio",
    place: "Zona",
    noData: "sin dato",
    inDetail: "La vivienda en detalle",
    detailOf: (t) => `${t} · en detalle`,
    sheetOf: (t) => `${t} · ficha`,
    descriptionOf: (t) => `${t} · descripción`,
    description: "Descripción",
    keepReading: "Sigue leyendo ↓",
    scrollsHint: (l) => `${l} (se desplaza)`,
    previous: "Anterior",
    next: "Siguiente",
    pageOf: "de",
    navLabel: "Navegación de la selección",
    modePages: "Páginas",
    modeScroll: "Desplazar",
    closeNotice: "Cerrar aviso",
    closeGallery: "Cerrar galería",
    galleryAll: "Todas las fotografías",
    loadingPhoto: "Cargando foto…",
    photoUnavailable: "Foto no disponible",
    photoCannotShow: "Esta foto no se puede mostrar",
    offline: "Sin conexión. Lo que ves puede no estar al día; se actualizará en cuanto vuelva la conexión.",
    itemRemoved: "La vivienda que estabas viendo ya no forma parte de la selección.",
    itemRemovedLast: "La vivienda que estabas viendo ya no forma parte de la selección. Vuelves al índice.",
    photoRemoved: "Esa foto ya no forma parte del catálogo.",
    contact: "Contacto",
    letsTalk: "Hablemos",
    closingHint: "Si alguna de estas viviendas te encaja, organizamos la visita cuando mejor te venga.",
    advisor: (r) => (r === "asesora" ? "Tu asesora" : "Tu asesor"),
    call: "Llamar",
    closingFooter: (d) => `Selección preparada para ti. Se actualiza sola cuando hay cambios · disponible hasta el ${d}.`,
    colophon: "Colofón",
    colophonLine: "Una selección preparada para ti.",
    colophonFooter: (d) => `Selección privada · disponible hasta el ${d}`,
    dateUnknown: "fecha desconocida",
    linkKicker: "Enlace",
    linkUnavailable: "Este enlace ya no está disponible",
    linkUnavailableHint: "Si necesitas volver a ver la selección, pide un enlace nuevo a tu asesor.",
    pdfDownload: "Descargar en PDF",
    pdfPreparing: "Preparando el PDF…",
    pdfHint: "Una copia de esta selección tal como está hoy, para guardarla o imprimirla.",
    pdfDownloaded: "PDF descargado.",
    pdfNotFound: "Este enlace ya no está disponible.",
    pdfBusy: "Ya se está preparando el PDF.",
    pdfChanging: "El catálogo está cambiando ahora mismo; vuelve a intentarlo en unos segundos.",
    pdfRateLimited: "Has pedido varias descargas seguidas; inténtalo de nuevo en un minuto.",
    pdfOtherInProgress: "Ahora mismo se está preparando otro PDF; inténtalo en un momento.",
    pdfFailed: "No se pudo preparar el PDF. Inténtalo de nuevo.",
    pdfNetwork: "No se pudo descargar el PDF: revisa la conexión e inténtalo de nuevo.",
    yourOpinion: "Tu opinión",
    feedbackHint: "Valora esta vivienda para tu asesor. Puedes cambiarlo cuando quieras.",
    ratingOf: (t) => `Valoración de ${t}`,
    stars: (n) => (n === 1 ? "1 estrella" : `${n} estrellas`),
    notRated: "Sin valorar",
    nOf5: (n) => `${n} de 5`,
    comment: "Comentario",
    optional: "(opcional)",
    savedAt: (d) => `Guardada el ${d}`,
    saving: "Guardando…",
    saveChanges: "Guardar cambios",
    saveOpinion: "Guardar opinión",
    savedOk: "Guardado. Tu asesor lo verá.",
    savedUnchanged: "Ya estaba guardada así.",
    errLinkInvalid: "Este enlace ya no admite opiniones. Pide uno nuevo a tu asesor.",
    errNotInCatalog: "Esta vivienda ya no está en la selección.",
    errInvalidRating: "Elige de 1 a 5 estrellas.",
    errTooLong: (max) => `El comentario no puede pasar de ${max} caracteres.`,
    errRateLimited: "Has guardado muchas veces seguidas. Espera un momento y vuelve a intentarlo.",
    errNetwork: "No se ha podido guardar: revisa la conexión y vuelve a intentarlo.",
    errBackend: "No se ha podido guardar ahora mismo. Vuelve a intentarlo en un momento.",
    sale: "Venta",
    rent: "Alquiler",
    saleAndRent: "Venta y alquiler",
    operationNoData: "Operación · sin dato",
    priceNoData: "Precio · sin dato",
    priceEur: (n) => `${n} €`,
    perMonth: (p) => `${p}/mes`,
    floorN: (n) => `Planta ${n}`,
    groundFloor: "Planta baja",
    basement: "Sótano",
    penthouse: "Ático",
    floorNoData: "Planta · sin dato",
    floorShortN: (n) => `${n}`,
    groundFloorShort: "baja",
    sections: { living: "Salón y luz", kitchen: "Cocina y comedor", finishes: "Acabados y confort", building: "La finca", barrio: "El barrio" },
    livingIn: (z) => `Vivir en ${z}`,
    untitled: "Sin título",
  },

  en: {
    cover: "Cover",
    privateSelection: "Private selection",
    preparedBy: "Prepared by",
    homesCount: (n) => `${n} ${n === 1 ? "home" : "homes"}`,
    begin: "Begin",
    seasons: { winter: "Winter", spring: "Spring", summer: "Summer", autumn: "Autumn" },
    introLabel: "A selection made for you",
    introduction: "Introduction",
    greeting: "Kind regards,",
    contents: "Contents",
    inThisSelection: "In this selection",
    emptyTitle: "This selection has no homes at the moment",
    emptyHint: "It will update as soon as there are new options. This page refreshes on its own.",
    moreHomes: "More homes ↓",
    placeNoData: "Area · not available",
    reserved: "Reserved",
    pageAbbr: (n) => `p. ${n}`,
    viewPhotos: (n) => `View ${n} ${n === 1 ? "photograph" : "photographs"}`,
    viewPhotosOf: (t) => `View the photos of ${t}`,
    noPhotos: "No photos",
    photoNofM: (i, n) => `Photo ${i} of ${n}`,
    keyFacts: "Key facts",
    surface: "Surface",
    bedrooms: "Bedrooms",
    bathrooms: "Bathrooms",
    floor: "Floor",
    features: "Features",
    operation: "Listing",
    price: "Price",
    place: "Area",
    noData: "not available",
    inDetail: "The home in detail",
    detailOf: (t) => `${t} · in detail`,
    sheetOf: (t) => `${t} · facts`,
    descriptionOf: (t) => `${t} · description`,
    description: "Description",
    keepReading: "Keep reading ↓",
    scrollsHint: (l) => `${l} (scrolls)`,
    previous: "Previous",
    next: "Next",
    pageOf: "of",
    navLabel: "Selection navigation",
    modePages: "Pages",
    modeScroll: "Scroll",
    closeNotice: "Close notice",
    closeGallery: "Close gallery",
    galleryAll: "All photographs",
    loadingPhoto: "Loading photo…",
    photoUnavailable: "Photo not available",
    photoCannotShow: "This photo cannot be shown",
    offline: "No connection. What you see may be out of date; it will refresh as soon as the connection returns.",
    itemRemoved: "The home you were viewing is no longer part of the selection.",
    itemRemovedLast: "The home you were viewing is no longer part of the selection. Back to the contents.",
    photoRemoved: "That photo is no longer part of the catalogue.",
    contact: "Contact",
    letsTalk: "Let's talk",
    closingHint: "If any of these homes suits you, we will arrange the viewing whenever suits you best.",
    advisor: () => "Your advisor",
    call: "Call",
    closingFooter: (d) => `A selection prepared for you. It updates on its own when there are changes · available until ${d}.`,
    colophon: "Colophon",
    colophonLine: "A selection prepared for you.",
    colophonFooter: (d) => `Private selection · available until ${d}`,
    dateUnknown: "unknown date",
    linkKicker: "Link",
    linkUnavailable: "This link is no longer available",
    linkUnavailableHint: "If you need to see the selection again, ask your advisor for a new link.",
    pdfDownload: "Download as PDF",
    pdfPreparing: "Preparing the PDF…",
    pdfHint: "A copy of this selection as it stands today, to keep or print.",
    pdfDownloaded: "PDF downloaded.",
    pdfNotFound: "This link is no longer available.",
    pdfBusy: "The PDF is already being prepared.",
    pdfChanging: "The catalogue is changing right now; try again in a few seconds.",
    pdfRateLimited: "You have requested several downloads in a row; try again in a minute.",
    pdfOtherInProgress: "Another PDF is being prepared right now; try again in a moment.",
    pdfFailed: "The PDF could not be prepared. Please try again.",
    pdfNetwork: "The PDF could not be downloaded: check your connection and try again.",
    yourOpinion: "Your opinion",
    feedbackHint: "Rate this home for your advisor. You can change it whenever you like.",
    ratingOf: (t) => `Rating for ${t}`,
    stars: (n) => (n === 1 ? "1 star" : `${n} stars`),
    notRated: "Not rated",
    nOf5: (n) => `${n} of 5`,
    comment: "Comment",
    optional: "(optional)",
    savedAt: (d) => `Saved on ${d}`,
    saving: "Saving…",
    saveChanges: "Save changes",
    saveOpinion: "Save opinion",
    savedOk: "Saved. Your advisor will see it.",
    savedUnchanged: "It was already saved like this.",
    errLinkInvalid: "This link no longer accepts opinions. Ask your advisor for a new one.",
    errNotInCatalog: "This home is no longer in the selection.",
    errInvalidRating: "Choose from 1 to 5 stars.",
    errTooLong: (max) => `The comment cannot exceed ${max} characters.`,
    errRateLimited: "You have saved many times in a row. Wait a moment and try again.",
    errNetwork: "Could not save: check your connection and try again.",
    errBackend: "Could not save right now. Try again in a moment.",
    sale: "Sale",
    rent: "Rent",
    saleAndRent: "Sale and rent",
    operationNoData: "Listing · not available",
    priceNoData: "Price · not available",
    priceEur: (n) => `€${n}`,
    perMonth: (p) => `${p}/month`,
    floorN: (n) => `Floor ${n}`,
    groundFloor: "Ground floor",
    basement: "Basement",
    penthouse: "Penthouse",
    floorNoData: "Floor · not available",
    floorShortN: (n) => `${n}`,
    groundFloorShort: "ground",
    sections: { living: "Living room and light", kitchen: "Kitchen and dining", finishes: "Finishes and comfort", building: "The building", barrio: "The neighbourhood" },
    livingIn: (z) => `Living in ${z}`,
    untitled: "Untitled",
  },

  fr: {
    cover: "Couverture",
    privateSelection: "Sélection privée",
    preparedBy: "Préparée par",
    homesCount: (n) => `${n} ${n === 1 ? "logement" : "logements"}`,
    begin: "Commencer",
    seasons: { winter: "Hiver", spring: "Printemps", summer: "Été", autumn: "Automne" },
    introLabel: "Une sélection pensée pour vous",
    introduction: "Introduction",
    greeting: "Bien à vous,",
    contents: "Sommaire",
    inThisSelection: "Dans cette sélection",
    emptyTitle: "Cette sélection ne contient aucun logement pour le moment",
    emptyHint: "Elle sera mise à jour dès qu'il y aura de nouvelles options. Cette page s'actualise toute seule.",
    moreHomes: "Plus de logements ↓",
    placeNoData: "Quartier · non renseigné",
    reserved: "Réservé",
    pageAbbr: (n) => `p. ${n}`,
    viewPhotos: (n) => `Voir ${n} ${n === 1 ? "photographie" : "photographies"}`,
    viewPhotosOf: (t) => `Voir les photos de ${t}`,
    noPhotos: "Sans photos",
    photoNofM: (i, n) => `Photo ${i} sur ${n}`,
    keyFacts: "Données clés",
    surface: "Surface",
    bedrooms: "Chambres",
    bathrooms: "Salles de bain",
    floor: "Étage",
    features: "Caractéristiques",
    operation: "Transaction",
    price: "Prix",
    place: "Quartier",
    noData: "non renseigné",
    inDetail: "Le logement en détail",
    detailOf: (t) => `${t} · en détail`,
    sheetOf: (t) => `${t} · fiche`,
    descriptionOf: (t) => `${t} · description`,
    description: "Description",
    keepReading: "Continuer la lecture ↓",
    scrollsHint: (l) => `${l} (défilement)`,
    previous: "Précédent",
    next: "Suivant",
    pageOf: "sur",
    navLabel: "Navigation de la sélection",
    modePages: "Pages",
    modeScroll: "Défiler",
    closeNotice: "Fermer l'avis",
    closeGallery: "Fermer la galerie",
    galleryAll: "Toutes les photographies",
    loadingPhoto: "Chargement de la photo…",
    photoUnavailable: "Photo non disponible",
    photoCannotShow: "Cette photo ne peut pas être affichée",
    offline: "Pas de connexion. Ce que vous voyez n'est peut-être pas à jour ; la page s'actualisera dès le retour de la connexion.",
    itemRemoved: "Le logement que vous consultiez ne fait plus partie de la sélection.",
    itemRemovedLast: "Le logement que vous consultiez ne fait plus partie de la sélection. Retour au sommaire.",
    photoRemoved: "Cette photo ne fait plus partie du catalogue.",
    contact: "Contact",
    letsTalk: "Parlons-en",
    closingHint: "Si l'un de ces logements vous convient, nous organisons la visite au moment qui vous arrange.",
    advisor: (r) => (r === "asesora" ? "Votre conseillère" : "Votre conseiller"),
    call: "Appeler",
    closingFooter: (d) => `Sélection préparée pour vous. Elle se met à jour toute seule en cas de changement · disponible jusqu'au ${d}.`,
    colophon: "Colophon",
    colophonLine: "Une sélection préparée pour vous.",
    colophonFooter: (d) => `Sélection privée · disponible jusqu'au ${d}`,
    dateUnknown: "date inconnue",
    linkKicker: "Lien",
    linkUnavailable: "Ce lien n'est plus disponible",
    linkUnavailableHint: "Si vous souhaitez revoir la sélection, demandez un nouveau lien à votre conseiller.",
    pdfDownload: "Télécharger en PDF",
    pdfPreparing: "Préparation du PDF…",
    pdfHint: "Une copie de cette sélection telle qu'elle est aujourd'hui, à conserver ou à imprimer.",
    pdfDownloaded: "PDF téléchargé.",
    pdfNotFound: "Ce lien n'est plus disponible.",
    pdfBusy: "Le PDF est déjà en préparation.",
    pdfChanging: "Le catalogue est en train de changer ; réessayez dans quelques secondes.",
    pdfRateLimited: "Vous avez demandé plusieurs téléchargements de suite ; réessayez dans une minute.",
    pdfOtherInProgress: "Un autre PDF est en préparation ; réessayez dans un instant.",
    pdfFailed: "Le PDF n'a pas pu être préparé. Réessayez.",
    pdfNetwork: "Le PDF n'a pas pu être téléchargé : vérifiez la connexion et réessayez.",
    yourOpinion: "Votre avis",
    feedbackHint: "Évaluez ce logement pour votre conseiller. Vous pourrez le modifier quand vous voudrez.",
    ratingOf: (t) => `Évaluation de ${t}`,
    stars: (n) => (n === 1 ? "1 étoile" : `${n} étoiles`),
    notRated: "Sans évaluation",
    nOf5: (n) => `${n} sur 5`,
    comment: "Commentaire",
    optional: "(facultatif)",
    savedAt: (d) => `Enregistré le ${d}`,
    saving: "Enregistrement…",
    saveChanges: "Enregistrer les modifications",
    saveOpinion: "Enregistrer l'avis",
    savedOk: "Enregistré. Votre conseiller le verra.",
    savedUnchanged: "C'était déjà enregistré ainsi.",
    errLinkInvalid: "Ce lien n'accepte plus d'avis. Demandez-en un nouveau à votre conseiller.",
    errNotInCatalog: "Ce logement ne fait plus partie de la sélection.",
    errInvalidRating: "Choisissez de 1 à 5 étoiles.",
    errTooLong: (max) => `Le commentaire ne peut pas dépasser ${max} caractères.`,
    errRateLimited: "Vous avez enregistré de nombreuses fois de suite. Patientez un instant et réessayez.",
    errNetwork: "Impossible d'enregistrer : vérifiez la connexion et réessayez.",
    errBackend: "Impossible d'enregistrer pour le moment. Réessayez dans un instant.",
    sale: "Vente",
    rent: "Location",
    saleAndRent: "Vente et location",
    operationNoData: "Transaction · non renseignée",
    priceNoData: "Prix · non renseigné",
    priceEur: (n) => `${n} €`,
    perMonth: (p) => `${p}/mois`,
    floorN: (n) => `${n === 1 ? "1er" : `${n}e`} étage`,
    groundFloor: "Rez-de-chaussée",
    basement: "Sous-sol",
    penthouse: "Attique",
    floorNoData: "Étage · non renseigné",
    floorShortN: (n) => (n === 1 ? "1er" : `${n}e`),
    groundFloorShort: "RDC",
    sections: { living: "Séjour et lumière", kitchen: "Cuisine et salle à manger", finishes: "Finitions et confort", building: "L'immeuble", barrio: "Le quartier" },
    livingIn: (z) => `Vivre à ${z}`,
    untitled: "Sans titre",
  },

  it: {
    cover: "Copertina",
    privateSelection: "Selezione privata",
    preparedBy: "Preparata da",
    homesCount: (n) => `${n} ${n === 1 ? "immobile" : "immobili"}`,
    begin: "Iniziare",
    seasons: { winter: "Inverno", spring: "Primavera", summer: "Estate", autumn: "Autunno" },
    introLabel: "Una selezione pensata per te",
    introduction: "Introduzione",
    greeting: "Un saluto,",
    contents: "Indice",
    inThisSelection: "In questa selezione",
    emptyTitle: "Questa selezione al momento non contiene immobili",
    emptyHint: "Si aggiornerà non appena ci saranno nuove opzioni. Questa pagina si aggiorna da sola.",
    moreHomes: "Altri immobili ↓",
    placeNoData: "Zona · non disponibile",
    reserved: "Riservato",
    pageAbbr: (n) => `p. ${n}`,
    viewPhotos: (n) => `Vedi ${n} ${n === 1 ? "fotografia" : "fotografie"}`,
    viewPhotosOf: (t) => `Vedi le foto di ${t}`,
    noPhotos: "Senza foto",
    photoNofM: (i, n) => `Foto ${i} di ${n}`,
    keyFacts: "Dati principali",
    surface: "Superficie",
    bedrooms: "Camere",
    bathrooms: "Bagni",
    floor: "Piano",
    features: "Caratteristiche",
    operation: "Operazione",
    price: "Prezzo",
    place: "Zona",
    noData: "non disponibile",
    inDetail: "L'immobile nel dettaglio",
    detailOf: (t) => `${t} · nel dettaglio`,
    sheetOf: (t) => `${t} · scheda`,
    descriptionOf: (t) => `${t} · descrizione`,
    description: "Descrizione",
    keepReading: "Continua a leggere ↓",
    scrollsHint: (l) => `${l} (scorrevole)`,
    previous: "Precedente",
    next: "Successiva",
    pageOf: "di",
    navLabel: "Navigazione della selezione",
    modePages: "Pagine",
    modeScroll: "Scorri",
    closeNotice: "Chiudi avviso",
    closeGallery: "Chiudi la galleria",
    galleryAll: "Tutte le fotografie",
    loadingPhoto: "Caricamento della foto…",
    photoUnavailable: "Foto non disponibile",
    photoCannotShow: "Questa foto non può essere mostrata",
    offline: "Nessuna connessione. Ciò che vedi potrebbe non essere aggiornato; si aggiornerà non appena tornerà la connessione.",
    itemRemoved: "L'immobile che stavi guardando non fa più parte della selezione.",
    itemRemovedLast: "L'immobile che stavi guardando non fa più parte della selezione. Torni all'indice.",
    photoRemoved: "Quella foto non fa più parte del catalogo.",
    contact: "Contatto",
    letsTalk: "Parliamone",
    closingHint: "Se uno di questi immobili fa per te, organizziamo la visita quando preferisci.",
    advisor: (r) => (r === "asesora" ? "La tua consulente" : "Il tuo consulente"),
    call: "Chiamare",
    closingFooter: (d) => `Selezione preparata per te. Si aggiorna da sola quando ci sono cambiamenti · disponibile fino al ${d}.`,
    colophon: "Colophon",
    colophonLine: "Una selezione preparata per te.",
    colophonFooter: (d) => `Selezione privata · disponibile fino al ${d}`,
    dateUnknown: "data sconosciuta",
    linkKicker: "Link",
    linkUnavailable: "Questo link non è più disponibile",
    linkUnavailableHint: "Se hai bisogno di rivedere la selezione, chiedi un nuovo link al tuo consulente.",
    pdfDownload: "Scarica in PDF",
    pdfPreparing: "Preparazione del PDF…",
    pdfHint: "Una copia di questa selezione così com'è oggi, da conservare o stampare.",
    pdfDownloaded: "PDF scaricato.",
    pdfNotFound: "Questo link non è più disponibile.",
    pdfBusy: "Il PDF è già in preparazione.",
    pdfChanging: "Il catalogo sta cambiando proprio ora; riprova tra qualche secondo.",
    pdfRateLimited: "Hai richiesto diversi download di seguito; riprova tra un minuto.",
    pdfOtherInProgress: "In questo momento si sta preparando un altro PDF; riprova tra un attimo.",
    pdfFailed: "Non è stato possibile preparare il PDF. Riprova.",
    pdfNetwork: "Non è stato possibile scaricare il PDF: controlla la connessione e riprova.",
    yourOpinion: "La tua opinione",
    feedbackHint: "Valuta questo immobile per il tuo consulente. Puoi cambiarla quando vuoi.",
    ratingOf: (t) => `Valutazione di ${t}`,
    stars: (n) => (n === 1 ? "1 stella" : `${n} stelle`),
    notRated: "Senza valutazione",
    nOf5: (n) => `${n} su 5`,
    comment: "Commento",
    optional: "(facoltativo)",
    savedAt: (d) => `Salvata il ${d}`,
    saving: "Salvataggio…",
    saveChanges: "Salva le modifiche",
    saveOpinion: "Salva l'opinione",
    savedOk: "Salvata. Il tuo consulente la vedrà.",
    savedUnchanged: "Era già salvata così.",
    errLinkInvalid: "Questo link non accetta più opinioni. Chiedine uno nuovo al tuo consulente.",
    errNotInCatalog: "Questo immobile non è più nella selezione.",
    errInvalidRating: "Scegli da 1 a 5 stelle.",
    errTooLong: (max) => `Il commento non può superare ${max} caratteri.`,
    errRateLimited: "Hai salvato molte volte di seguito. Attendi un momento e riprova.",
    errNetwork: "Non è stato possibile salvare: controlla la connessione e riprova.",
    errBackend: "Non è stato possibile salvare in questo momento. Riprova tra poco.",
    sale: "Vendita",
    rent: "Affitto",
    saleAndRent: "Vendita e affitto",
    operationNoData: "Operazione · non disponibile",
    priceNoData: "Prezzo · non disponibile",
    priceEur: (n) => `${n} €`,
    perMonth: (p) => `${p}/mese`,
    floorN: (n) => `Piano ${n}`,
    groundFloor: "Piano terra",
    basement: "Seminterrato",
    penthouse: "Attico",
    floorNoData: "Piano · non disponibile",
    floorShortN: (n) => `${n}`,
    groundFloorShort: "terra",
    sections: { living: "Soggiorno e luce", kitchen: "Cucina e sala da pranzo", finishes: "Finiture e comfort", building: "Il palazzo", barrio: "Il quartiere" },
    livingIn: (z) => `Vivere a ${z}`,
    untitled: "Senza titolo",
  },

  de: {
    cover: "Titelseite",
    privateSelection: "Private Auswahl",
    preparedBy: "Zusammengestellt von",
    homesCount: (n) => `${n} ${n === 1 ? "Immobilie" : "Immobilien"}`,
    begin: "Beginnen",
    seasons: { winter: "Winter", spring: "Frühjahr", summer: "Sommer", autumn: "Herbst" },
    introLabel: "Eine Auswahl, zusammengestellt für Sie",
    introduction: "Einführung",
    greeting: "Mit freundlichen Grüßen,",
    contents: "Inhalt",
    inThisSelection: "In dieser Auswahl",
    emptyTitle: "Diese Auswahl enthält derzeit keine Immobilien",
    emptyHint: "Sie wird aktualisiert, sobald es neue Optionen gibt. Diese Seite aktualisiert sich von selbst.",
    moreHomes: "Weitere Immobilien ↓",
    placeNoData: "Lage · keine Angabe",
    reserved: "Reserviert",
    pageAbbr: (n) => `S. ${n}`,
    viewPhotos: (n) => `${n} ${n === 1 ? "Fotografie" : "Fotografien"} ansehen`,
    viewPhotosOf: (t) => `Fotos von ${t} ansehen`,
    noPhotos: "Keine Fotos",
    photoNofM: (i, n) => `Foto ${i} von ${n}`,
    keyFacts: "Eckdaten",
    surface: "Fläche",
    bedrooms: "Schlafzimmer",
    bathrooms: "Bäder",
    floor: "Etage",
    features: "Ausstattung",
    operation: "Angebot",
    price: "Preis",
    place: "Lage",
    noData: "keine Angabe",
    inDetail: "Die Immobilie im Detail",
    detailOf: (t) => `${t} · im Detail`,
    sheetOf: (t) => `${t} · Daten`,
    descriptionOf: (t) => `${t} · Beschreibung`,
    description: "Beschreibung",
    keepReading: "Weiterlesen ↓",
    scrollsHint: (l) => `${l} (scrollbar)`,
    previous: "Zurück",
    next: "Weiter",
    pageOf: "von",
    navLabel: "Navigation der Auswahl",
    modePages: "Seiten",
    modeScroll: "Scrollen",
    closeNotice: "Hinweis schließen",
    closeGallery: "Galerie schließen",
    galleryAll: "Alle Fotografien",
    loadingPhoto: "Foto wird geladen…",
    photoUnavailable: "Foto nicht verfügbar",
    photoCannotShow: "Dieses Foto kann nicht angezeigt werden",
    offline: "Keine Verbindung. Was Sie sehen, ist möglicherweise nicht aktuell; es wird aktualisiert, sobald die Verbindung zurückkehrt.",
    itemRemoved: "Die Immobilie, die Sie gerade angesehen haben, gehört nicht mehr zur Auswahl.",
    itemRemovedLast: "Die Immobilie, die Sie gerade angesehen haben, gehört nicht mehr zur Auswahl. Zurück zum Inhalt.",
    photoRemoved: "Dieses Foto gehört nicht mehr zum Katalog.",
    contact: "Kontakt",
    letsTalk: "Sprechen wir",
    closingHint: "Wenn eine dieser Immobilien zu Ihnen passt, organisieren wir die Besichtigung, wann es Ihnen am besten passt.",
    advisor: (r) => (r === "asesora" ? "Ihre Beraterin" : "Ihr Berater"),
    call: "Anrufen",
    closingFooter: (d) => `Eine Auswahl, zusammengestellt für Sie. Sie aktualisiert sich bei Änderungen von selbst · verfügbar bis ${d}.`,
    colophon: "Kolophon",
    colophonLine: "Eine Auswahl, zusammengestellt für Sie.",
    colophonFooter: (d) => `Private Auswahl · verfügbar bis ${d}`,
    dateUnknown: "unbekanntes Datum",
    linkKicker: "Link",
    linkUnavailable: "Dieser Link ist nicht mehr verfügbar",
    linkUnavailableHint: "Wenn Sie die Auswahl erneut ansehen möchten, bitten Sie Ihren Berater um einen neuen Link.",
    pdfDownload: "Als PDF herunterladen",
    pdfPreparing: "PDF wird vorbereitet…",
    pdfHint: "Eine Kopie dieser Auswahl im heutigen Stand, zum Aufbewahren oder Ausdrucken.",
    pdfDownloaded: "PDF heruntergeladen.",
    pdfNotFound: "Dieser Link ist nicht mehr verfügbar.",
    pdfBusy: "Das PDF wird bereits vorbereitet.",
    pdfChanging: "Der Katalog ändert sich gerade; versuchen Sie es in einigen Sekunden erneut.",
    pdfRateLimited: "Sie haben mehrere Downloads hintereinander angefordert; versuchen Sie es in einer Minute erneut.",
    pdfOtherInProgress: "Gerade wird ein anderes PDF vorbereitet; versuchen Sie es gleich noch einmal.",
    pdfFailed: "Das PDF konnte nicht vorbereitet werden. Bitte versuchen Sie es erneut.",
    pdfNetwork: "Das PDF konnte nicht heruntergeladen werden: Prüfen Sie die Verbindung und versuchen Sie es erneut.",
    yourOpinion: "Ihre Meinung",
    feedbackHint: "Bewerten Sie diese Immobilie für Ihren Berater. Sie können es jederzeit ändern.",
    ratingOf: (t) => `Bewertung von ${t}`,
    stars: (n) => (n === 1 ? "1 Stern" : `${n} Sterne`),
    notRated: "Nicht bewertet",
    nOf5: (n) => `${n} von 5`,
    comment: "Kommentar",
    optional: "(optional)",
    savedAt: (d) => `Gespeichert am ${d}`,
    saving: "Wird gespeichert…",
    saveChanges: "Änderungen speichern",
    saveOpinion: "Meinung speichern",
    savedOk: "Gespeichert. Ihr Berater wird es sehen.",
    savedUnchanged: "Es war bereits so gespeichert.",
    errLinkInvalid: "Dieser Link nimmt keine Meinungen mehr an. Bitten Sie Ihren Berater um einen neuen.",
    errNotInCatalog: "Diese Immobilie ist nicht mehr in der Auswahl.",
    errInvalidRating: "Wählen Sie 1 bis 5 Sterne.",
    errTooLong: (max) => `Der Kommentar darf höchstens ${max} Zeichen haben.`,
    errRateLimited: "Sie haben sehr oft hintereinander gespeichert. Warten Sie einen Moment und versuchen Sie es erneut.",
    errNetwork: "Speichern nicht möglich: Prüfen Sie die Verbindung und versuchen Sie es erneut.",
    errBackend: "Speichern ist im Moment nicht möglich. Versuchen Sie es gleich noch einmal.",
    sale: "Kauf",
    rent: "Miete",
    saleAndRent: "Kauf und Miete",
    operationNoData: "Angebot · keine Angabe",
    priceNoData: "Preis · keine Angabe",
    priceEur: (n) => `${n} €`,
    perMonth: (p) => `${p}/Monat`,
    floorN: (n) => `${n}. Etage`,
    groundFloor: "Erdgeschoss",
    basement: "Untergeschoss",
    penthouse: "Penthouse",
    floorNoData: "Etage · keine Angabe",
    floorShortN: (n) => `${n}.`,
    groundFloorShort: "EG",
    sections: { living: "Wohnzimmer und Licht", kitchen: "Küche und Essbereich", finishes: "Ausstattung und Komfort", building: "Das Gebäude", barrio: "Das Viertel" },
    livingIn: (z) => `Leben in ${z}`,
    untitled: "Ohne Titel",
  },

  // Árabe: sin revisión nativa (TRANSLATION_REVIEW_REQUIRED). Cifras latinas.
  ar: {
    cover: "الغلاف",
    privateSelection: "اختيار خاص",
    preparedBy: "من إعداد",
    homesCount: (n) => (n === 1 ? "مسكن واحد" : n === 2 ? "مسكنان" : n <= 10 ? `${n} مساكن` : `${n} مسكناً`),
    begin: "ابدأ",
    seasons: { winter: "شتاء", spring: "ربيع", summer: "صيف", autumn: "خريف" },
    introLabel: "اختيار أُعدَّ خصيصاً لك",
    introduction: "مقدمة",
    greeting: "مع أطيب التحيات،",
    contents: "الفهرس",
    inThisSelection: "في هذا الاختيار",
    emptyTitle: "لا يضم هذا الاختيار أي مسكن حالياً",
    emptyHint: "سيُحدَّث فور توفر خيارات جديدة. تُحدَّث هذه الصفحة تلقائياً.",
    moreHomes: "مساكن أخرى ↓",
    placeNoData: "المنطقة · غير متوفرة",
    reserved: "محجوز",
    pageAbbr: (n) => `ص. ${n}`,
    viewPhotos: (n) => (n === 1 ? "عرض صورة واحدة" : n === 2 ? "عرض صورتين" : n <= 10 ? `عرض ${n} صور` : `عرض ${n} صورة`),
    viewPhotosOf: (t) => `عرض صور ${t}`,
    noPhotos: "بدون صور",
    photoNofM: (i, n) => `الصورة ${i} من ${n}`,
    keyFacts: "البيانات الأساسية",
    surface: "المساحة",
    bedrooms: "غرف النوم",
    bathrooms: "الحمّامات",
    floor: "الطابق",
    features: "المواصفات",
    operation: "نوع العرض",
    price: "السعر",
    place: "المنطقة",
    noData: "غير متوفر",
    inDetail: "المسكن بالتفصيل",
    detailOf: (t) => `${t} · بالتفصيل`,
    sheetOf: (t) => `${t} · البيانات`,
    descriptionOf: (t) => `${t} · الوصف`,
    description: "الوصف",
    keepReading: "تابع القراءة ↓",
    scrollsHint: (l) => `${l} (قابل للتمرير)`,
    previous: "السابق",
    next: "التالي",
    pageOf: "من",
    navLabel: "التنقل في الاختيار",
    modePages: "صفحات",
    modeScroll: "تمرير",
    closeNotice: "إغلاق التنبيه",
    closeGallery: "إغلاق المعرض",
    galleryAll: "كل الصور",
    loadingPhoto: "جارٍ تحميل الصورة…",
    photoUnavailable: "الصورة غير متوفرة",
    photoCannotShow: "تعذّر عرض هذه الصورة",
    offline: "لا يوجد اتصال. قد لا يكون ما تراه محدَّثاً؛ سيُحدَّث فور عودة الاتصال.",
    itemRemoved: "المسكن الذي كنت تشاهده لم يعد ضمن الاختيار.",
    itemRemovedLast: "المسكن الذي كنت تشاهده لم يعد ضمن الاختيار. ستعود إلى الفهرس.",
    photoRemoved: "تلك الصورة لم تعد ضمن الكتالوج.",
    contact: "التواصل",
    letsTalk: "لنتحدث",
    closingHint: "إذا ناسبك أحد هذه المساكن، ننظّم المعاينة في الوقت الأنسب لك.",
    advisor: (r) => (r === "asesora" ? "مستشارتك" : "مستشارك"),
    call: "اتصال",
    closingFooter: (d) => `اختيار أُعدَّ خصيصاً لك. يُحدَّث تلقائياً عند أي تغيير · متاح حتى ${d}.`,
    colophon: "خاتمة",
    colophonLine: "اختيار أُعدَّ خصيصاً لك.",
    colophonFooter: (d) => `اختيار خاص · متاح حتى ${d}`,
    dateUnknown: "تاريخ غير معروف",
    linkKicker: "الرابط",
    linkUnavailable: "هذا الرابط لم يعد متاحاً",
    linkUnavailableHint: "إذا أردت مشاهدة الاختيار مجدداً، فاطلب رابطاً جديداً من مستشارك.",
    pdfDownload: "تنزيل بصيغة PDF",
    pdfPreparing: "جارٍ تجهيز ملف PDF…",
    pdfHint: "نسخة من هذا الاختيار كما هو اليوم، للاحتفاظ بها أو طباعتها.",
    pdfDownloaded: "تم تنزيل ملف PDF.",
    pdfNotFound: "هذا الرابط لم يعد متاحاً.",
    pdfBusy: "ملف PDF قيد التجهيز بالفعل.",
    pdfChanging: "الكتالوج يتغيّر الآن؛ حاول مجدداً بعد ثوانٍ.",
    pdfRateLimited: "طلبت عدة تنزيلات متتالية؛ حاول مجدداً بعد دقيقة.",
    pdfOtherInProgress: "يجري الآن تجهيز ملف PDF آخر؛ حاول مجدداً بعد قليل.",
    pdfFailed: "تعذّر تجهيز ملف PDF. حاول مجدداً.",
    pdfNetwork: "تعذّر تنزيل ملف PDF: تحقق من الاتصال وحاول مجدداً.",
    yourOpinion: "رأيك",
    feedbackHint: "قيّم هذا المسكن لمستشارك. يمكنك تغيير التقييم متى شئت.",
    ratingOf: (t) => `تقييم ${t}`,
    stars: (n) => (n === 1 ? "نجمة واحدة" : n === 2 ? "نجمتان" : `${n} نجوم`),
    notRated: "بدون تقييم",
    nOf5: (n) => `${n} من 5`,
    comment: "تعليق",
    optional: "(اختياري)",
    savedAt: (d) => `حُفظ في ${d}`,
    saving: "جارٍ الحفظ…",
    saveChanges: "حفظ التغييرات",
    saveOpinion: "حفظ الرأي",
    savedOk: "تم الحفظ. سيطّلع عليه مستشارك.",
    savedUnchanged: "كان محفوظاً بهذه الصيغة بالفعل.",
    errLinkInvalid: "هذا الرابط لم يعد يقبل الآراء. اطلب رابطاً جديداً من مستشارك.",
    errNotInCatalog: "هذا المسكن لم يعد ضمن الاختيار.",
    errInvalidRating: "اختر من نجمة واحدة إلى 5 نجوم.",
    errTooLong: (max) => `لا يمكن أن يتجاوز التعليق ${max} حرفاً.`,
    errRateLimited: "حفظت مرات كثيرة متتالية. انتظر قليلاً ثم حاول مجدداً.",
    errNetwork: "تعذّر الحفظ: تحقق من الاتصال وحاول مجدداً.",
    errBackend: "تعذّر الحفظ الآن. حاول مجدداً بعد قليل.",
    sale: "بيع",
    rent: "إيجار",
    saleAndRent: "بيع وإيجار",
    operationNoData: "نوع العرض · غير متوفر",
    priceNoData: "السعر · غير متوفر",
    priceEur: (n) => `${n} €`,
    perMonth: (p) => `${p}/شهرياً`,
    floorN: (n) => `الطابق ${n}`,
    groundFloor: "الطابق الأرضي",
    basement: "الطابق السفلي",
    penthouse: "بنتهاوس",
    floorNoData: "الطابق · غير متوفر",
    floorShortN: (n) => `${n}`,
    groundFloorShort: "الأرضي",
    sections: { living: "الصالة والإضاءة", kitchen: "المطبخ وغرفة الطعام", finishes: "التشطيبات والراحة", building: "المبنى", barrio: "الحي" },
    livingIn: (z) => `العيش في ${z}`,
    untitled: "بدون عنوان",
  },

  // Turco: sin revisión nativa (TRANSLATION_REVIEW_REQUIRED).
  tr: {
    cover: "Kapak",
    privateSelection: "Özel seçki",
    preparedBy: "Hazırlayan",
    homesCount: (n) => `${n} konut`,
    begin: "Başla",
    seasons: { winter: "Kış", spring: "İlkbahar", summer: "Yaz", autumn: "Sonbahar" },
    introLabel: "Sizin için hazırlanmış bir seçki",
    introduction: "Giriş",
    greeting: "Saygılarımla,",
    contents: "İçindekiler",
    inThisSelection: "Bu seçkide",
    emptyTitle: "Bu seçkide şu anda konut yok",
    emptyHint: "Yeni seçenekler olduğunda güncellenecek. Bu sayfa kendiliğinden yenilenir.",
    moreHomes: "Daha fazla konut ↓",
    placeNoData: "Bölge · bilgi yok",
    reserved: "Rezerve",
    pageAbbr: (n) => `s. ${n}`,
    viewPhotos: (n) => `${n} fotoğrafı gör`,
    viewPhotosOf: (t) => `${t} fotoğraflarını gör`,
    noPhotos: "Fotoğraf yok",
    photoNofM: (i, n) => `Fotoğraf ${i} / ${n}`,
    keyFacts: "Temel bilgiler",
    surface: "Alan",
    bedrooms: "Yatak odası",
    bathrooms: "Banyo",
    floor: "Kat",
    features: "Özellikler",
    operation: "İşlem",
    price: "Fiyat",
    place: "Bölge",
    noData: "bilgi yok",
    inDetail: "Konutun ayrıntıları",
    detailOf: (t) => `${t} · ayrıntılar`,
    sheetOf: (t) => `${t} · bilgiler`,
    descriptionOf: (t) => `${t} · açıklama`,
    description: "Açıklama",
    keepReading: "Okumaya devam et ↓",
    scrollsHint: (l) => `${l} (kaydırılabilir)`,
    previous: "Önceki",
    next: "Sonraki",
    pageOf: "/",
    navLabel: "Seçki gezinmesi",
    modePages: "Sayfalar",
    modeScroll: "Kaydır",
    closeNotice: "Uyarıyı kapat",
    closeGallery: "Galeriyi kapat",
    galleryAll: "Tüm fotoğraflar",
    loadingPhoto: "Fotoğraf yükleniyor…",
    photoUnavailable: "Fotoğraf mevcut değil",
    photoCannotShow: "Bu fotoğraf gösterilemiyor",
    offline: "Bağlantı yok. Gördükleriniz güncel olmayabilir; bağlantı geri geldiğinde güncellenecek.",
    itemRemoved: "Görüntülediğiniz konut artık seçkide yer almıyor.",
    itemRemovedLast: "Görüntülediğiniz konut artık seçkide yer almıyor. İçindekilere dönüyorsunuz.",
    photoRemoved: "Bu fotoğraf artık katalogda yer almıyor.",
    contact: "İletişim",
    letsTalk: "Konuşalım",
    closingHint: "Bu konutlardan biri size uygunsa, ziyareti size en uygun zamanda düzenleriz.",
    advisor: () => "Danışmanınız",
    call: "Arayın",
    closingFooter: (d) => `Sizin için hazırlanmış seçki. Değişiklik olduğunda kendiliğinden güncellenir · ${d} tarihine kadar geçerli.`,
    colophon: "Kolofon",
    colophonLine: "Sizin için hazırlanmış bir seçki.",
    colophonFooter: (d) => `Özel seçki · ${d} tarihine kadar geçerli`,
    dateUnknown: "bilinmeyen tarih",
    linkKicker: "Bağlantı",
    linkUnavailable: "Bu bağlantı artık kullanılamıyor",
    linkUnavailableHint: "Seçkiyi yeniden görmeniz gerekirse danışmanınızdan yeni bir bağlantı isteyin.",
    pdfDownload: "PDF olarak indir",
    pdfPreparing: "PDF hazırlanıyor…",
    pdfHint: "Bu seçkinin bugünkü haliyle bir kopyası; saklamak veya yazdırmak için.",
    pdfDownloaded: "PDF indirildi.",
    pdfNotFound: "Bu bağlantı artık kullanılamıyor.",
    pdfBusy: "PDF zaten hazırlanıyor.",
    pdfChanging: "Katalog şu anda değişiyor; birkaç saniye sonra tekrar deneyin.",
    pdfRateLimited: "Art arda birkaç indirme istediniz; bir dakika sonra tekrar deneyin.",
    pdfOtherInProgress: "Şu anda başka bir PDF hazırlanıyor; birazdan tekrar deneyin.",
    pdfFailed: "PDF hazırlanamadı. Tekrar deneyin.",
    pdfNetwork: "PDF indirilemedi: bağlantınızı kontrol edip tekrar deneyin.",
    yourOpinion: "Görüşünüz",
    feedbackHint: "Bu konutu danışmanınız için puanlayın. İstediğiniz zaman değiştirebilirsiniz.",
    ratingOf: (t) => `${t} puanı`,
    stars: (n) => `${n} yıldız`,
    notRated: "Puanlanmadı",
    nOf5: (n) => `${n} / 5`,
    comment: "Yorum",
    optional: "(isteğe bağlı)",
    savedAt: (d) => `${d} tarihinde kaydedildi`,
    saving: "Kaydediliyor…",
    saveChanges: "Değişiklikleri kaydet",
    saveOpinion: "Görüşü kaydet",
    savedOk: "Kaydedildi. Danışmanınız görecek.",
    savedUnchanged: "Zaten bu şekilde kayıtlıydı.",
    errLinkInvalid: "Bu bağlantı artık görüş kabul etmiyor. Danışmanınızdan yeni bir bağlantı isteyin.",
    errNotInCatalog: "Bu konut artık seçkide değil.",
    errInvalidRating: "1 ile 5 yıldız arasında seçin.",
    errTooLong: (max) => `Yorum ${max} karakteri geçemez.`,
    errRateLimited: "Art arda çok kez kaydettiniz. Biraz bekleyip tekrar deneyin.",
    errNetwork: "Kaydedilemedi: bağlantınızı kontrol edip tekrar deneyin.",
    errBackend: "Şu anda kaydedilemedi. Birazdan tekrar deneyin.",
    sale: "Satılık",
    rent: "Kiralık",
    saleAndRent: "Satılık ve kiralık",
    operationNoData: "İşlem · bilgi yok",
    priceNoData: "Fiyat · bilgi yok",
    priceEur: (n) => `${n} €`,
    perMonth: (p) => `${p}/ay`,
    floorN: (n) => `${n}. kat`,
    groundFloor: "Zemin kat",
    basement: "Bodrum",
    penthouse: "Çatı katı",
    floorNoData: "Kat · bilgi yok",
    floorShortN: (n) => `${n}.`,
    groundFloorShort: "zemin",
    sections: { living: "Salon ve ışık", kitchen: "Mutfak ve yemek alanı", finishes: "Donanım ve konfor", building: "Bina", barrio: "Semt" },
    livingIn: (z) => `${z} semtinde yaşamak`,
    untitled: "Başlıksız",
  },

  // Hebreo: sin revisión nativa (TRANSLATION_REVIEW_REQUIRED). Cifras latinas.
  he: {
    cover: "שער",
    privateSelection: "מבחר פרטי",
    preparedBy: "הוכן על ידי",
    homesCount: (n) => (n === 1 ? "נכס אחד" : n === 2 ? "שני נכסים" : `${n} נכסים`),
    begin: "להתחיל",
    seasons: { winter: "חורף", spring: "אביב", summer: "קיץ", autumn: "סתיו" },
    introLabel: "מבחר שהוכן במיוחד עבורך",
    introduction: "הקדמה",
    greeting: "בברכה,",
    contents: "תוכן",
    inThisSelection: "במבחר זה",
    emptyTitle: "במבחר זה אין נכסים כרגע",
    emptyHint: "הוא יתעדכן ברגע שיהיו אפשרויות חדשות. דף זה מתעדכן מעצמו.",
    moreHomes: "נכסים נוספים ↓",
    placeNoData: "אזור · אין נתון",
    reserved: "שמור",
    pageAbbr: (n) => `עמ׳ ${n}`,
    viewPhotos: (n) => (n === 1 ? "צפייה בתצלום אחד" : `צפייה ב-${n} תצלומים`),
    viewPhotosOf: (t) => `צפייה בתצלומים של ${t}`,
    noPhotos: "אין תצלומים",
    photoNofM: (i, n) => `תצלום ${i} מתוך ${n}`,
    keyFacts: "נתונים עיקריים",
    surface: "שטח",
    bedrooms: "חדרי שינה",
    bathrooms: "חדרי רחצה",
    floor: "קומה",
    features: "מאפיינים",
    operation: "סוג העסקה",
    price: "מחיר",
    place: "אזור",
    noData: "אין נתון",
    inDetail: "הנכס לפרטיו",
    detailOf: (t) => `${t} · לפרטיו`,
    sheetOf: (t) => `${t} · נתונים`,
    descriptionOf: (t) => `${t} · תיאור`,
    description: "תיאור",
    keepReading: "להמשיך לקרוא ↓",
    scrollsHint: (l) => `${l} (ניתן לגלילה)`,
    previous: "הקודם",
    next: "הבא",
    pageOf: "מתוך",
    navLabel: "ניווט במבחר",
    modePages: "עמודים",
    modeScroll: "גלילה",
    closeNotice: "סגירת ההודעה",
    closeGallery: "סגירת הגלריה",
    galleryAll: "כל התצלומים",
    loadingPhoto: "התצלום נטען…",
    photoUnavailable: "התצלום אינו זמין",
    photoCannotShow: "לא ניתן להציג תצלום זה",
    offline: "אין חיבור. ייתכן שמה שמוצג אינו מעודכן; הדף יתעדכן ברגע שהחיבור יחזור.",
    itemRemoved: "הנכס שצפית בו אינו חלק מהמבחר עוד.",
    itemRemovedLast: "הנכס שצפית בו אינו חלק מהמבחר עוד. חזרה לתוכן.",
    photoRemoved: "תצלום זה אינו חלק מהקטלוג עוד.",
    contact: "יצירת קשר",
    letsTalk: "נדבר",
    closingHint: "אם אחד הנכסים האלה מתאים לך, נתאם את הביקור במועד הנוח לך.",
    advisor: (r) => (r === "asesora" ? "היועצת שלך" : "היועץ שלך"),
    call: "להתקשר",
    closingFooter: (d) => `מבחר שהוכן עבורך. מתעדכן מעצמו כשיש שינויים · זמין עד ${d}.`,
    colophon: "קולופון",
    colophonLine: "מבחר שהוכן עבורך.",
    colophonFooter: (d) => `מבחר פרטי · זמין עד ${d}`,
    dateUnknown: "תאריך לא ידוע",
    linkKicker: "קישור",
    linkUnavailable: "קישור זה אינו זמין עוד",
    linkUnavailableHint: "כדי לראות שוב את המבחר, אפשר לבקש קישור חדש מהיועץ שלך.",
    pdfDownload: "הורדה כ-PDF",
    pdfPreparing: "ה-PDF בהכנה…",
    pdfHint: "עותק של המבחר כפי שהוא היום, לשמירה או להדפסה.",
    pdfDownloaded: "ה-PDF הורד.",
    pdfNotFound: "קישור זה אינו זמין עוד.",
    pdfBusy: "ה-PDF כבר בהכנה.",
    pdfChanging: "הקטלוג משתנה ברגע זה; כדאי לנסות שוב בעוד כמה שניות.",
    pdfRateLimited: "התבקשו כמה הורדות ברצף; כדאי לנסות שוב בעוד דקה.",
    pdfOtherInProgress: "ברגע זה מוכן PDF אחר; כדאי לנסות שוב בעוד רגע.",
    pdfFailed: "לא ניתן היה להכין את ה-PDF. כדאי לנסות שוב.",
    pdfNetwork: "לא ניתן היה להוריד את ה-PDF: כדאי לבדוק את החיבור ולנסות שוב.",
    yourOpinion: "דעתך",
    feedbackHint: "אפשר לדרג את הנכס עבור היועץ שלך ולשנות בכל עת.",
    ratingOf: (t) => `דירוג של ${t}`,
    stars: (n) => (n === 1 ? "כוכב אחד" : n === 2 ? "שני כוכבים" : `${n} כוכבים`),
    notRated: "ללא דירוג",
    nOf5: (n) => `${n} מתוך 5`,
    comment: "הערה",
    optional: "(לא חובה)",
    savedAt: (d) => `נשמר ב-${d}`,
    saving: "שומר…",
    saveChanges: "שמירת השינויים",
    saveOpinion: "שמירת הדעה",
    savedOk: "נשמר. היועץ שלך יראה זאת.",
    savedUnchanged: "כבר היה שמור כך.",
    errLinkInvalid: "קישור זה אינו מקבל עוד דעות. אפשר לבקש קישור חדש מהיועץ שלך.",
    errNotInCatalog: "נכס זה אינו במבחר עוד.",
    errInvalidRating: "יש לבחור בין כוכב אחד ל-5 כוכבים.",
    errTooLong: (max) => `ההערה לא יכולה לעלות על ${max} תווים.`,
    errRateLimited: "נשמר פעמים רבות ברצף. כדאי להמתין רגע ולנסות שוב.",
    errNetwork: "לא ניתן היה לשמור: כדאי לבדוק את החיבור ולנסות שוב.",
    errBackend: "לא ניתן לשמור כרגע. כדאי לנסות שוב בעוד רגע.",
    sale: "מכירה",
    rent: "השכרה",
    saleAndRent: "מכירה והשכרה",
    operationNoData: "סוג העסקה · אין נתון",
    priceNoData: "מחיר · אין נתון",
    priceEur: (n) => `${n} €`,
    perMonth: (p) => `${p}/לחודש`,
    floorN: (n) => `קומה ${n}`,
    groundFloor: "קומת קרקע",
    basement: "מרתף",
    penthouse: "פנטהאוז",
    floorNoData: "קומה · אין נתון",
    floorShortN: (n) => `${n}`,
    groundFloorShort: "קרקע",
    sections: { living: "סלון ואור", kitchen: "מטבח ופינת אוכל", finishes: "גימורים ונוחות", building: "הבניין", barrio: "השכונה" },
    livingIn: (z) => `לגור ב-${z}`,
    untitled: "ללא כותרת",
  },
};

export function catalogDictionary(lang: CatalogLanguage): CatalogDictionary {
  return DICTIONARIES[lang] ?? DICTIONARIES.es;
}

// ── Formato numérico y de fechas (Intl con el locale del idioma) ────────────

/** Como `n.toLocaleString(locale)`: en español, «1234» (sin agrupar 4 cifras),
 *  igual que el lector antes de este PR. Dígitos siempre latinos. */
export function formatNumber(n: number, lang: CatalogLanguage): string {
  return n.toLocaleString(intlLocale(lang));
}

/** Cifras de dinero: agrupación de miles SIEMPRE (también 4 dígitos) y sin
 *  decimales. En español, «4.800» y «1.450.000». */
export function formatGrouped(n: number, lang: CatalogLanguage): string {
  return new Intl.NumberFormat(intlLocale(lang), { useGrouping: "always", maximumFractionDigits: 0 } as Intl.NumberFormatOptions).format(Math.round(n));
}

/** «5 dic 2026» (caducidad del enlace), en la zona de Madrid. */
export function formatDateShort(iso: string, lang: CatalogLanguage): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return catalogDictionary(lang).dateUnknown;
  return new Intl.DateTimeFormat(intlLocale(lang), { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" }).format(d);
}

/** «5 de diciembre, 11:05» (opinión guardada), en la zona de Madrid. */
export function formatDateTime(iso: string, lang: CatalogLanguage): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(lang), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Madrid" }).format(d);
}

/** Estación de la edición: diciembre cuenta como invierno del año siguiente. */
export function seasonOf(date: Date): { season: Season; year: number } {
  const m = date.getMonth();
  const season: Season = m <= 1 || m === 11 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
  return { season, year: m === 11 ? date.getFullYear() + 1 : date.getFullYear() };
}
