import "server-only";
import sharp from "sharp";
import { createAdminClient } from "@/lib/db/admin";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";

// Dibujo ESQUEMÁTICO aproximado de la distribución de una propiedad, a partir
// de sus fotos ya subidas (property_photos) más los datos ya conocidos de la
// ficha (dormitorios, baños, m² totales). NO es un plano medido — no hay
// forma de sacar metros ni la conexión real entre habitaciones solo de fotos
// sueltas (sin 360°, LiDAR o muchas fotos superpuestas por habitación, que es
// lo que este negocio tiene). Por eso:
//   - El número de dormitorios/baños SIEMPRE sale de `properties`, nunca lo
//     cuenta la IA — evita que el dibujo contradiga los datos reales de la
//     ficha.
//   - La IA solo aporta juicio cualitativo por foto (tamaño relativo, una
//     nota corta de lo que se ve) para las habitaciones que YA sabemos que
//     existen — nunca inventa ni quita espacios de la lista fija.
//   - El PNG final lleva un aviso "APROXIMADO — NO A ESCALA" incrustado en la
//     propia imagen (no en un texto aparte que se pueda perder al subirlo).

export type FloorPlanSketchResult = { ok: true; pngBuffer: Buffer } | { ok: false; error: string };

const MAX_VISION_PHOTOS = 8;
const CANVAS_W = 1000;
const CANVAS_H = 1360;

const INK = "#2a1f10";
const INK_SOFT = "#6b5d47";
const CREAM = "#fbf8f3";
const PANEL = "#f2ead9";
const WARN_BG = "#b45309";
const WARN_TEXT = "#fff7ed";

type SizeImpression = "pequeño" | "mediano" | "grande";
const SIZE_WEIGHT: Record<SizeImpression, number> = { "pequeño": 0.72, mediano: 1, grande: 1.4 };

type RoomSlot = {
  id: string;
  label: string;
  zone: "dia" | "noche";
  size: SizeImpression;
  note: string;
};

function buildRoomSlots(bedrooms: number | null, bathrooms: number | null): RoomSlot[] {
  const slots: RoomSlot[] = [
    { id: "entrada", label: "Entrada", zone: "dia", size: "pequeño", note: "" },
    { id: "salon", label: "Salón", zone: "dia", size: "grande", note: "" },
    { id: "cocina", label: "Cocina", zone: "dia", size: "mediano", note: "" },
  ];
  // Tope defensivo: un dato mal cargado (p.ej. un typo en dormitorios) no
  // debe generar un dibujo con decenas de cajas ilegibles.
  const bedroomCount = Math.min(Math.max(bedrooms ?? 0, 0), 12);
  for (let i = 1; i <= bedroomCount; i++) {
    slots.push({
      id: `dormitorio_${i}`,
      label: bedroomCount > 1 ? `Dormitorio ${i}` : "Dormitorio",
      zone: "noche",
      size: "mediano",
      note: "",
    });
  }
  const bathroomCount = Math.min(Math.max(bathrooms ?? 1, 1), 12);
  for (let i = 1; i <= bathroomCount; i++) {
    slots.push({
      id: `bano_${i}`,
      label: bathroomCount > 1 ? `Baño ${i}` : "Baño",
      zone: "noche",
      size: "pequeño",
      note: "",
    });
  }
  return slots;
}

// La IA solo puede AJUSTAR tamaño/nota de espacios ya listados en `slots` —
// nunca agregar ni quitar. Un id que no está en la lista se descarta.
async function annotateFromPhotos(slots: RoomSlot[], photoUrls: string[]): Promise<RoomSlot[]> {
  const list = slots.map((s) => `- id: "${s.id}" (${s.label})`).join("\n");
  const system = `Vas a ver fotos reales de una propiedad. Esta es la lista FIJA de espacios que ya sabemos que existen — no la cambies, no agregues ni quites ninguno:
${list}

Para cada id de la lista: si alguna foto muestra claramente ese tipo de espacio, indica su tamaño relativo aproximado ("pequeño", "mediano" o "grande") y una nota de 3 a 8 palabras sobre lo que se ve (luz, si la cocina está abierta al salón, si el baño tiene bañera o ducha, terraza, etc.). Si ninguna foto muestra ese espacio con claridad, usa "mediano" y nota vacía "" — nunca inventes detalles que no veas en una foto real.

Responde ÚNICAMENTE con JSON válido, sin markdown:
{ "rooms": [ { "id": "<uno de los ids de la lista>", "size": "pequeño" | "mediano" | "grande", "note": "<nota breve o vacía>" } ] }`;

  const raw = await aiComplete({
    system,
    userText: "Analiza las fotos y responde solo con el JSON solicitado.",
    images: photoUrls,
    maxTokens: 900,
  });

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return slots;
    const parsed = JSON.parse(match[0]) as { rooms?: Array<{ id?: string; size?: string; note?: string }> };
    const byId = new Map(slots.map((s) => [s.id, s]));
    for (const item of parsed.rooms ?? []) {
      const slot = item.id ? byId.get(item.id) : undefined;
      if (!slot) continue;
      if (item.size === "pequeño" || item.size === "mediano" || item.size === "grande") slot.size = item.size;
      if (typeof item.note === "string") slot.note = item.note.trim().slice(0, 80);
    }
    return slots;
  } catch (err) {
    console.error("[floorplan-sketch] Respuesta IA no interpretable:", err);
    return slots; // seguimos con los tamaños/notas que ya teníamos por defecto
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Apila las habitaciones de una zona en una sola columna, con la altura de
// cada caja proporcional a su peso (tamaño relativo). No es un plano real —
// es deliberadamente una maqueta simple (una columna, cajas apiladas) en vez
// de un packing 2D, para que nunca se solapen ni queden huecos raros.
function renderZoneColumn(rooms: RoomSlot[], x: number, y: number, w: number, h: number): string {
  const totalWeight = rooms.reduce((sum, r) => sum + SIZE_WEIGHT[r.size], 0) || 1;
  const gap = 10;
  const availableH = h - gap * (rooms.length - 1);
  let cursorY = y;
  const parts: string[] = [];

  for (const room of rooms) {
    const boxH = Math.max(70, (SIZE_WEIGHT[room.size] / totalWeight) * availableH);
    parts.push(`
      <g>
        <rect x="${x}" y="${cursorY}" width="${w}" height="${boxH}" rx="10"
              fill="${PANEL}" stroke="${INK}" stroke-width="2.5" />
        <text x="${x + 18}" y="${cursorY + 30}" font-family="Georgia, 'Times New Roman', serif"
              font-size="20" fill="${INK}">${escapeXml(room.label)}</text>
        ${room.note ? `<text x="${x + 18}" y="${cursorY + 54}" font-family="-apple-system, Helvetica, Arial, sans-serif"
              font-size="13" fill="${INK_SOFT}" font-style="italic">${escapeXml(room.note)}</text>` : ""}
      </g>`);
    cursorY += boxH + gap;
  }
  return parts.join("\n");
}

function renderFloorPlanSvg(
  slots: RoomSlot[],
  opts: { title: string; squareMeters: number | null },
): string {
  const dia = slots.filter((s) => s.zone === "dia");
  const noche = slots.filter((s) => s.zone === "noche");

  const headerH = 92;
  const footerH = 96;
  const pad = 32;
  const gapCols = 24;
  const bodyY = headerH + pad;
  const bodyH = CANVAS_H - headerH - footerH - pad * 2;

  // Cada columna ocupa un ancho proporcional a cuántas habitaciones tiene,
  // no un 50/50 fijo — así un piso de 4 dormitorios no queda con la zona de
  // noche apretada en la mitad del espacio que la zona de día de 3 salas.
  const totalRooms = dia.length + noche.length || 1;
  const bodyW = CANVAS_W - pad * 2 - gapCols;
  const diaW = Math.max(260, Math.round((dia.length / totalRooms) * bodyW));
  const nocheW = bodyW - diaW;

  const squareMetersLabel =
    opts.squareMeters != null ? `${new Intl.NumberFormat("es-ES").format(opts.squareMeters)} m² (referencia, según ficha)` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="${CREAM}" />

  <text x="${pad}" y="46" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="${INK}">${escapeXml(opts.title || "Distribución de la propiedad")}</text>
  <text x="${pad}" y="72" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="14" fill="${INK_SOFT}">${escapeXml(squareMetersLabel)}</text>

  <text x="${pad}" y="${bodyY - 12}" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="13" font-weight="600" letter-spacing="1.5" fill="${INK_SOFT}">ZONA DE DÍA</text>
  <text x="${pad + diaW + gapCols}" y="${bodyY - 12}" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="13" font-weight="600" letter-spacing="1.5" fill="${INK_SOFT}">ZONA DE NOCHE</text>

  ${renderZoneColumn(dia, pad, bodyY, diaW, bodyH)}
  ${renderZoneColumn(noche, pad + diaW + gapCols, bodyY, nocheW, bodyH)}

  <rect x="0" y="${CANVAS_H - footerH}" width="${CANVAS_W}" height="${footerH}" fill="${WARN_BG}" />
  <text x="${CANVAS_W / 2}" y="${CANVAS_H - footerH / 2 - 8}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="${WARN_TEXT}">DISTRIBUCIÓN APROXIMADA — NO A ESCALA</text>
  <text x="${CANVAS_W / 2}" y="${CANVAS_H - footerH / 2 + 16}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="12.5" fill="${WARN_TEXT}">Generado por IA a partir de las fotos de la ficha — no sustituye un plano medido</text>
</svg>`;
}

export async function generateApproximateFloorPlan(propertyId: string): Promise<FloorPlanSketchResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: property, error: propErr } = await db
    .from("properties")
    .select("title, bedrooms, bathrooms, square_meters")
    .eq("id", propertyId)
    .maybeSingle();
  if (propErr) return { ok: false, error: propErr.message };
  if (!property) return { ok: false, error: "No se encontró la propiedad." };

  const { data: photos, error: photosErr } = await db
    .from("property_photos")
    .select("url")
    .eq("property_id", propertyId)
    .order("position", { ascending: true })
    .limit(MAX_VISION_PHOTOS);
  if (photosErr) return { ok: false, error: photosErr.message };

  const photoUrls = ((photos ?? []) as Array<{ url: string }>).map((p) => p.url).filter(Boolean);
  if (photoUrls.length === 0) {
    return { ok: false, error: "Esta ficha no tiene fotos todavía — sube al menos una foto para generar la distribución." };
  }

  let slots = buildRoomSlots(property.bedrooms, property.bathrooms);
  try {
    slots = await annotateFromPhotos(slots, photoUrls);
  } catch (err) {
    if (err instanceof AINotConfiguredError) return { ok: false, error: err.message };
    // Un fallo puntual de la IA (red, proveedor caído) no debe bloquear el
    // dibujo — sigue siendo útil con los tamaños por defecto, sin notas.
    console.error("[floorplan-sketch] Error consultando la IA:", err);
  }

  const svg = renderFloorPlanSvg(slots, {
    title: (property.title as string) ?? "",
    squareMeters: (property.square_meters as number | null) ?? null,
  });

  try {
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return { ok: true, pngBuffer };
  } catch (err) {
    console.error("[floorplan-sketch] Error renderizando la imagen:", err);
    return { ok: false, error: "No se pudo generar la imagen." };
  }
}
