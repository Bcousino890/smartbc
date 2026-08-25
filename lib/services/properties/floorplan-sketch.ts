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
const CANVAS_H = 1400;

const INK = "#2a1f10";
const INK_SOFT = "#6b5d47";
const CREAM = "#fbf8f3";
const PANEL = "#f2ead9";
const GOLD = "#c9a24b";
const FOOTER_BG = "#241a0c";
const FOOTER_TEXT = "#f4ead9";

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

// Pictogramas estilo plano arquitectónico, en coordenadas locales centradas
// en (0,0) — se posicionan con un <g transform="translate(...) scale(...)">
// al dibujar cada habitación. Trazo fino, sin relleno, como los símbolos de
// mobiliario de un plano real — es lo que más cambia la sensación de
// "boceto" a "ficha técnica".
const ICON_STROKE = `stroke="${INK}" stroke-width="1.7" fill="none" stroke-linejoin="round" stroke-linecap="round"`;

function bedIcon(): string {
  return `<g ${ICON_STROKE}>
    <rect x="-38" y="-46" width="76" height="92" rx="6" />
    <line x1="-38" y1="-26" x2="38" y2="-26" />
    <rect x="-30" y="-40" width="26" height="20" rx="5" />
    <rect x="4" y="-40" width="26" height="20" rx="5" />
    <line x1="-38" y1="20" x2="38" y2="20" />
  </g>`;
}

function sofaIcon(): string {
  return `<g ${ICON_STROKE}>
    <rect x="-46" y="-17" width="92" height="36" rx="8" />
    <rect x="-54" y="-21" width="17" height="44" rx="5" />
    <rect x="37" y="-21" width="17" height="44" rx="5" />
    <line x1="-29" y1="-9" x2="29" y2="-9" />
    <rect x="-16" y="30" width="32" height="14" rx="2" />
  </g>`;
}

function kitchenIcon(): string {
  return `<g ${ICON_STROKE}>
    <rect x="-48" y="-16" width="96" height="26" rx="3" />
    <circle cx="-28" cy="-3" r="6.5" />
    <circle cx="-6" cy="-3" r="6.5" />
    <rect x="16" y="-11" width="27" height="15" rx="2" />
    <line x1="16" y1="-3.5" x2="43" y2="-3.5" />
  </g>`;
}

function bathIcon(): string {
  return `<g ${ICON_STROKE}>
    <rect x="-12" y="-46" width="24" height="10" rx="2" />
    <ellipse cx="0" cy="-22" rx="15" ry="18" />
    <rect x="-24" y="18" width="30" height="16" rx="3" />
    <path d="M -24 26 a 7 7 0 0 0 7 8" />
  </g>`;
}

function doorIcon(): string {
  return `<g ${ICON_STROKE}>
    <rect x="-22" y="-30" width="16" height="16" rx="2" />
    <circle cx="-12" cy="-10" r="1.6" fill="${INK}" stroke="none" />
  </g>`;
}

const ROOM_ICON: Record<string, () => string> = {
  entrada: doorIcon,
  salon: sofaIcon,
  cocina: kitchenIcon,
};

function iconForRoom(room: RoomSlot): string {
  if (room.id.startsWith("dormitorio")) return bedIcon();
  if (room.id.startsWith("bano")) return bathIcon();
  return (ROOM_ICON[room.id] ?? doorIcon)();
}

// Arco de apertura de puerta en la esquina superior izquierda de cada
// habitación — el símbolo más reconocible de un plano arquitectónico real.
function doorSwing(x: number, y: number): string {
  const r = 26;
  return `<g stroke="${INK}" stroke-width="1.3" fill="none">
    <line x1="${x}" y1="${y}" x2="${x}" y2="${y + r}" />
    <path d="M ${x} ${y} A ${r} ${r} 0 0 1 ${x + r} ${y + r}" stroke-dasharray="2.5 3" />
  </g>`;
}

// Apila las habitaciones de una zona en una sola columna, a lo ancho
// completo y SIN huecos entre ellas — como paredes compartidas de verdad —
// con la altura de cada caja proporcional a su peso (tamaño relativo). No es
// un plano real: es deliberadamente una maqueta simple (una columna, cajas
// apiladas) en vez de un packing 2D, para que nunca se solapen ni queden
// huecos raros, y como los pesos suman exactamente `h` no hay riesgo de que
// una fila se salga del bloque aunque haya muchas habitaciones.
function renderZoneColumn(rooms: RoomSlot[], x: number, y: number, w: number, h: number): string {
  const totalWeight = rooms.reduce((sum, r) => sum + SIZE_WEIGHT[r.size], 0) || 1;
  let cursorY = y;
  const parts: string[] = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${INK}" stroke-width="3.5" />`];

  rooms.forEach((room, i) => {
    const boxH = (SIZE_WEIGHT[room.size] / totalWeight) * h;
    const centerX = x + w / 2;
    const centerY = cursorY + boxH / 2;
    const iconScale = Math.min(1.15, Math.max(0.55, Math.min(w, boxH) / 150));
    const hasNote = room.note.length > 0;
    const labelY = cursorY + boxH - (hasNote ? 34 : 18);

    parts.push(`
      <g>
        ${i > 0 ? `<line x1="${x}" y1="${cursorY}" x2="${x + w}" y2="${cursorY}" stroke="${INK}" stroke-width="1.5" />` : ""}
        <g transform="translate(${centerX} ${centerY - 16}) scale(${iconScale.toFixed(2)})">${iconForRoom(room)}</g>
        <text x="${centerX}" y="${labelY}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif"
              font-size="17" font-weight="600" letter-spacing="0.3" fill="${INK}">${escapeXml(room.label)}</text>
        ${hasNote ? `<text x="${centerX}" y="${labelY + 19}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif"
              font-size="12.5" fill="${INK_SOFT}" font-style="italic">${escapeXml(room.note)}</text>` : ""}
        ${doorSwing(x + 14, cursorY + 14)}
      </g>`);
    cursorY += boxH;
  });
  return parts.join("\n");
}

// Franja de circulación entre las dos zonas — sin esto, dos columnas
// separadas leen como dos habitaciones flotando en el vacío en vez de una
// vivienda conectada.
function renderCorridor(x: number, y: number, w: number, h: number): string {
  const hatchGap = 22;
  const hatches: string[] = [];
  for (let hy = y + hatchGap; hy < y + h; hy += hatchGap) {
    hatches.push(`<line x1="${x}" y1="${hy}" x2="${x + w}" y2="${hy - w}" stroke="${INK}" stroke-width="0.6" opacity="0.22" />`);
  }
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${CREAM}" stroke="${INK}" stroke-width="3.5" />
    <clipPath id="corridorClip"><rect x="${x}" y="${y}" width="${w}" height="${h}" /></clipPath>
    <g clip-path="url(#corridorClip)">${hatches.join("")}</g>
    <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="middle"
          font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="12" font-weight="600"
          letter-spacing="2" fill="${INK_SOFT}" transform="rotate(-90 ${x + w / 2} ${y + h / 2})">PASILLO</text>
  </g>`;
}

function renderFloorPlanSvg(
  slots: RoomSlot[],
  opts: { title: string; squareMeters: number | null },
): string {
  const dia = slots.filter((s) => s.zone === "dia");
  const noche = slots.filter((s) => s.zone === "noche");

  const headerH = 108;
  const footerH = 88;
  const pad = 40;
  const corridorW = 62;
  const bodyY = headerH + 24;
  const bodyH = CANVAS_H - headerH - footerH - 24 - pad;

  // Cada columna ocupa un ancho proporcional a cuántas habitaciones tiene,
  // no un 50/50 fijo — así un piso de 4 dormitorios no queda con la zona de
  // noche apretada en la mitad del espacio que la zona de día de 3 salas.
  const totalRooms = dia.length + noche.length || 1;
  const usableW = CANVAS_W - pad * 2 - corridorW;
  const diaW = Math.max(260, Math.round((dia.length / totalRooms) * usableW));
  const nocheW = usableW - diaW;
  const corridorX = pad + diaW;
  const nocheX = corridorX + corridorW;

  const squareMetersLabel =
    opts.squareMeters != null ? `Superficie total: ${new Intl.NumberFormat("es-ES").format(opts.squareMeters)} m² (según ficha)` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="${CREAM}" />

  <text x="${pad}" y="42" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="12" font-weight="700"
        letter-spacing="2.5" fill="${GOLD}">DISTRIBUCIÓN DE ESPACIOS</text>
  <text x="${pad}" y="74" font-family="Georgia, 'Times New Roman', serif" font-size="27" fill="${INK}">${escapeXml(opts.title || "Propiedad")}</text>
  <text x="${pad}" y="98" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="13.5" fill="${INK_SOFT}">${escapeXml(squareMetersLabel)}</text>
  <line x1="${pad}" y1="${headerH}" x2="${CANVAS_W - pad}" y2="${headerH}" stroke="${INK}" stroke-width="1" opacity="0.15" />

  <text x="${pad}" y="${bodyY - 10}" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="2" fill="${INK_SOFT}">ZONA DE DÍA</text>
  <text x="${nocheX}" y="${bodyY - 10}" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="2" fill="${INK_SOFT}">ZONA DE NOCHE</text>

  ${renderZoneColumn(dia, pad, bodyY, diaW, bodyH)}
  ${renderCorridor(corridorX, bodyY, corridorW, bodyH)}
  ${renderZoneColumn(noche, nocheX, bodyY, nocheW, bodyH)}

  <rect x="0" y="${CANVAS_H - footerH}" width="${CANVAS_W}" height="${footerH}" fill="${FOOTER_BG}" />
  <rect x="0" y="${CANVAS_H - footerH}" width="${CANVAS_W}" height="3" fill="${GOLD}" />
  <text x="${CANVAS_W / 2}" y="${CANVAS_H - footerH / 2 - 6}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="15.5" font-weight="700" letter-spacing="0.5" fill="${FOOTER_TEXT}">DISTRIBUCIÓN APROXIMADA — NO A ESCALA</text>
  <text x="${CANVAS_W / 2}" y="${CANVAS_H - footerH / 2 + 16}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="12" fill="${FOOTER_TEXT}" opacity="0.75">Generado por IA a partir de las fotos de la ficha — no sustituye un plano medido</text>
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
