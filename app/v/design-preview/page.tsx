import { notFound } from "next/navigation";
import type {
  PublicViewingCollection,
  PublicViewingStop,
} from "@/lib/viewing-collections/public-contract";
import { ViewingCollectionView } from "../[token]/viewing-collection-view";
import { isCollectionLanguage } from "@/lib/viewing-collections/i18n";

/**
 * Banco de pruebas visual de la Viewing Collection.
 *
 * ⚠️ SOLO DESARROLLO: devuelve 404 en producción. No toca la base de datos ni
 * resuelve ningún token — construye a mano un objeto PublicViewingCollection
 * y lo renderiza con el mismo componente que ve el cliente.
 *
 * Existe para poder hacer QA visual (y capturas responsive) sin escribir nada
 * en producción ni depender de que haya una colección publicada. Los slugs son
 * de propiedades reales para que el proxy /p/ sirva fotografías auténticas.
 *
 * Para el preview REAL que usa el agente antes de publicar, ver
 * /v/preview/[itineraryId].
 *
 * ⚠️ La carpeta NO puede llamarse `_preview`: Next.js excluye del enrutado las
 * que empiezan por guion bajo, así que la URL caía en /v/[token] y servía la
 * página de "colección no disponible". Un segmento estático gana al dinámico,
 * de ahí que `design-preview` sí funcione.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Preview · Viewing Collection",
  robots: { index: false, follow: false },
};

type Seed = {
  slug: string;
  title: string;
  zone: string;
  subzone: string | null;
  type: string;
  beds: number;
  baths: number;
  sqm: number;
  price: number;
  ref: string;
  photos: number;
};

const SEEDS: Seed[] = [
  { slug: "piso-en-venta-en-calle-jose-abascal-7171", title: "Piso en Calle José Abascal", zone: "Chamberí", subzone: "Ríos Rosas", type: "Piso", beds: 3, baths: 4, sqm: 182, price: 1990000, ref: "BC-0674", photos: 9 },
  { slug: "atico-en-venta-en-finca-senorial-en-calle-del-general-oraa-6606", title: "Ático en finca señorial, General Oráa", zone: "Salamanca", subzone: "Recoletos", type: "Ático", beds: 4, baths: 5, sqm: 393, price: 10800000, ref: "BC-0537", photos: 9 },
  { slug: "piso-en-venta-en-guindalera-7196", title: "Piso en Guindalera", zone: "Salamanca", subzone: "Guindalera", type: "Piso", beds: 5, baths: 5, sqm: 259, price: 1780000, ref: "BC-0682", photos: 9 },
  { slug: "chalet-en-venta-en-barrio-salamanca-5710", title: "Chalet en Barrio Salamanca", zone: "Salamanca", subzone: "Castellana", type: "Chalet", beds: 5, baths: 6, sqm: 297, price: 2150000, ref: "BC-0505", photos: 9 },
  { slug: "piso-en-venta-en-calle-velazquez-6994", title: "Piso en Calle Velázquez", zone: "Salamanca", subzone: "Recoletos", type: "Piso", beds: 3, baths: 4, sqm: 165, price: 1650000, ref: "BC-0626", photos: 9 },
  { slug: "titulo-7479", title: "Chalet independiente en Pozuelo", zone: "Pozuelo", subzone: null, type: "Chalet", beds: 7, baths: 8, sqm: 657, price: 4400000, ref: "BC-1351", photos: 9 },
];

const EUR = new Intl.NumberFormat("es-ES");

const PLACEHOLDERS = ["/portal-hero.jpg", "/login-bg.jpg"];

function stop(
  seed: Seed,
  order: number,
  over: Partial<PublicViewingStop> = {},
): PublicViewingStop {
  // Fotografías locales del propio repo. En producción las URLs vienen del
  // proxy /p/{slug}/{idx}, pero este banco de pruebas no depende de la base de
  // datos a propósito: así el QA visual funciona en cualquier entorno, incluso
  // sin credenciales. Lo que se valida aquí es la composición, no el origen.
  const photos = Array.from(
    { length: seed.photos },
    (_, i) => PLACEHOLDERS[i % PLACEHOLDERS.length],
  );
  return {
    order,
    // Banco de pruebas visual: no hay base de datos detrás, así que la
    // valoración no se puede guardar.
    clientRating: 0,
    timeLabel: null,
    timePending: false,
    durationLabel: "30 min",
    status: "confirmed",
    title: seed.title,
    propertyTypeLabel: seed.type,
    zoneLabel: [seed.zone, seed.subzone].filter(Boolean).join(" · "),
    bedrooms: seed.beds,
    bathrooms: seed.baths,
    squareMeters: seed.sqm,
    priceLabel: `${EUR.format(seed.price)} €`,
    bcReference: seed.ref,
    availability: "available",
    exactAddress: null,
    exactLat: null,
    exactLng: null,
    areaLocation: null,
    coverPhotoUrl: photos[0],
    photoUrls: photos,
    smartLinkUrl: `/compartir/${seed.slug}`,
    smartLinkTracked: false,
    ...over,
  };
}

// Cubre todos los estados que el diseño tiene que soportar: confirmada con
// dirección exacta, por confirmar en solo-zona, reservada, cancelada visible y
// no disponible.
const COLLECTION: PublicViewingCollection = {
  language: "es",
  title: "Visitas del lunes",
  dateLabel: "Lunes, 17 de agosto de 2026",
  windowLabel: "10:00 – 14:00",
  clientFirstName: "Paul",
  stopCount: 6,
  expiresAtLabel: "16/10/2026",
  stops: [
    stop(SEEDS[0], 1, {
      timeLabel: "10:00",
      exactAddress: "Calle José Abascal 21, 3º Izquierda",
      exactLat: 40.4368,
      exactLng: -3.7018,
    }),
    stop(SEEDS[1], 2, {
      timeLabel: "10:45",
      exactAddress: "Calle del General Oráa 12, Ático",
      exactLat: 40.4331,
      exactLng: -3.6812,
    }),
    // Caso "hora por confirmar": sin hora, pero declarada a propósito. Añade
    // un renglón al bloque editorial, que es donde el móvil se quedaba corto.
    stop(SEEDS[2], 3, {
      timeLabel: null,
      timePending: true,
      status: "pending",
      availability: "reserved",
    }),
    stop(SEEDS[3], 4, {
      timeLabel: "12:15",
      exactAddress: "Calle Padilla 34",
      exactLat: 40.4302,
      exactLng: -3.6791,
    }),
    stop(SEEDS[4], 5, {
      timeLabel: "13:00",
      exactAddress: "Calle Velázquez 55, 2º Derecha",
      exactLat: 40.4288,
      exactLng: -3.6845,
    }),
    stop(SEEDS[5], 6, {
      timeLabel: null,
      status: "cancelled",
      smartLinkUrl: null,
    }),
  ],
  agent: {
    displayName: "María López",
    email: "maria@bcousinoprop.com",
    phone: "+34 694 20 97 63",
    whatsappUrl: "https://wa.me/34694209763",
    avatarUrl: null,
  },
};

export default async function ViewingCollectionPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { lang } = await searchParams;
  const language = isCollectionLanguage(lang) ? lang : "es";
  // El banco construye el objeto a mano, así que la traducción de labels de
  // proyección (fechas, sufijos) no aplica aquí — pero language sí gobierna
  // el diccionario de los componentes y el RTL, que es lo que se revisa.
  const collection = { ...COLLECTION, language };
  // Token vacío: el banco de pruebas no emite analítica.
  return <ViewingCollectionView collection={collection} collectionToken="" />;
}
