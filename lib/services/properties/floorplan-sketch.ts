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

// El título de la ficha es texto libre y a veces incluye el número exacto
// del portal ("Calle de Fortuny, 23" / "...Fortuny 23, 4ºB") — este dibujo
// puede acabar en manos de un cliente antes de cerrar nada, así que nunca
// debe delatar la dirección exacta. Corta desde la primera coma seguida de
// un número (cubre "calle, número" y "calle, número, piso"), y si no hay
// coma pero el título termina en un número de portal (con o sin piso/letra
// pegados), corta eso también. Deja intacto cualquier texto sin números.
function sanitizeAddressForDisplay(title: string): string {
  return title
    .replace(/,\s*\d.*$/, "")
    .replace(/\s+\d+\s*[a-záéíóúñ]{0,3}\.?\s*$/i, "")
    .trim();
}

// Jerarquía de muros como en un plano CAD real: perímetro exterior grueso,
// partición mayor (columna↔pasillo, con hueco de puerta) media, división
// entre habitaciones de una misma columna fina. Esa jerarquía de grosores es
// gran parte de lo que hace que un dibujo lea como "plano" y no como
// "diagrama de cajas".
const WALL_EXT = 9;
const WALL_MID = 6;
const WALL_THIN = 3;

// Pictogramas estilo plano arquitectónico, en coordenadas locales centradas
// en (0,0) — se posicionan con un <g transform="translate(...) scale(...)">
// al dibujar cada habitación. Trazo fino, sin relleno, como los símbolos de
// mobiliario de un plano real.
const ICON_STROKE = `stroke="${INK}" stroke-width="1.7" fill="none" stroke-linejoin="round" stroke-linecap="round"`;

function bedIcon(): string {
  return `<g ${ICON_STROKE}>
    <rect x="-38" y="-46" width="76" height="92" rx="6" />
    <line x1="-38" y1="-26" x2="38" y2="-26" />
    <rect x="-30" y="-40" width="26" height="20" rx="5" />
    <rect x="4" y="-40" width="26" height="20" rx="5" />
    <line x1="-38" y1="20" x2="38" y2="20" />
    <rect x="-53" y="-30" width="13" height="17" rx="2" />
    <rect x="40" y="-30" width="13" height="17" rx="2" />
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
    <rect x="33" y="12" width="15" height="34" rx="3" />
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

// Felpudo — para "Entrada", que ya lleva el símbolo de puerta real en el
// hueco del muro; un segundo icono de puerta flotando encima sobraba.
function matIcon(): string {
  return `<g ${ICON_STROKE}>
    <rect x="-26" y="-15" width="52" height="30" rx="3" stroke-dasharray="4 3" />
  </g>`;
}

const ROOM_ICON: Record<string, () => string> = {
  entrada: matIcon,
  salon: sofaIcon,
  cocina: kitchenIcon,
};

function iconForRoom(room: RoomSlot): string {
  if (room.id.startsWith("dormitorio")) return bedIcon();
  if (room.id.startsWith("bano")) return bathIcon();
  return (ROOM_ICON[room.id] ?? matIcon)();
}

// Hueco de puerta en el muro medio (columna↔pasillo), con su arco de
// apertura — el símbolo más reconocible de un plano arquitectónico real.
// `dir` indica hacia qué lado del muro se abre (adentro de la habitación).
function doorway(px: number, gapCenterY: number, gapHalf: number, dir: 1 | -1): string {
  const r = gapHalf * 2;
  const sweep = dir > 0 ? 1 : 0;
  const hingeY = gapCenterY - gapHalf;
  const closedY = gapCenterY + gapHalf;
  return `<g stroke="${INK}" stroke-width="1.3" fill="none">
    <line x1="${px}" y1="${hingeY}" x2="${px + dir * r}" y2="${hingeY}" />
    <path d="M ${px + dir * r} ${hingeY} A ${r} ${r} 0 0 ${sweep} ${px} ${closedY}" stroke-dasharray="2.5 3" />
  </g>`;
}

// Marca de ventana (dos trazos cruzando el muro exterior) — junto con el
// hueco de puerta, es la otra convención que más "vende" un plano real.
function windowTicks(x: number, yCenter: number): string {
  const gap = 8;
  return `<line x1="${x - 7}" y1="${yCenter - gap}" x2="${x + 7}" y2="${yCenter - gap}" stroke="${INK}" stroke-width="2.2" />
          <line x1="${x - 7}" y1="${yCenter + gap}" x2="${x + 7}" y2="${yCenter + gap}" stroke="${INK}" stroke-width="2.2" />`;
}

// Dibuja UNA habitación dentro de su celda (icono + etiqueta + nota), y
// opcionalmente el muro con hueco de puerta (doorWallX) y/o la marca de
// ventana (windowWallX) en los bordes verticales de esa celda. Sacar esto a
// una función propia es lo que permite reutilizar exactamente la misma
// lógica tanto en una columna simple (una habitación = todo el ancho) como
// en una rejilla de a pares (dos habitaciones comparten fila) sin duplicar
// el dibujo del mobiliario/etiqueta.
function renderRoomCell(
  room: RoomSlot,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  doorWallX: number | null,
  doorDir: 1 | -1,
  windowWallX: number | null,
): string {
  const centerX = cellX + cellW / 2;
  const centerY = cellY + cellH / 2;
  const iconScale = Math.min(1.15, Math.max(0.42, Math.min(cellW, cellH) / 150));
  const hasNote = room.note.length > 0;
  const labelY = cellY + cellH - (hasNote ? 32 : 17);

  let doorPart = "";
  if (doorWallX != null) {
    const gapHalf = 15;
    if (cellH > gapHalf * 2 + 40) {
      const gapCenterY = Math.min(Math.max(centerY, cellY + gapHalf + 12), cellY + cellH - gapHalf - 12);
      doorPart = `<line x1="${doorWallX}" y1="${cellY}" x2="${doorWallX}" y2="${gapCenterY - gapHalf}" stroke="${INK}" stroke-width="${WALL_MID}" />
                  <line x1="${doorWallX}" y1="${gapCenterY + gapHalf}" x2="${doorWallX}" y2="${cellY + cellH}" stroke="${INK}" stroke-width="${WALL_MID}" />
                  ${doorway(doorWallX, gapCenterY, gapHalf, doorDir)}`;
    } else {
      doorPart = `<line x1="${doorWallX}" y1="${cellY}" x2="${doorWallX}" y2="${cellY + cellH}" stroke="${INK}" stroke-width="${WALL_MID}" />`;
    }
  }

  const showWindow = windowWallX != null && room.id !== "entrada" && !room.id.startsWith("bano") && cellH > 65;

  return `
    <g>
      ${doorPart}
      ${showWindow ? windowTicks(windowWallX as number, centerY) : ""}
      <g transform="translate(${centerX} ${centerY - 15}) scale(${iconScale.toFixed(2)})">${iconForRoom(room)}</g>
      <text x="${centerX}" y="${labelY}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif"
            font-size="16" font-weight="600" letter-spacing="0.2" fill="${INK}">${escapeXml(room.label)}</text>
      ${hasNote ? `<text x="${centerX}" y="${labelY + 17}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif"
            font-size="11.5" fill="${INK_SOFT}" font-style="italic">${escapeXml(room.note)}</text>` : ""}
    </g>`;
}

// Apila las habitaciones de una zona en una sola columna a lo ancho
// completo, sin huecos entre ellas — paredes compartidas de verdad — con la
// altura de cada caja proporcional a su peso. Buena para pocas habitaciones
// (2-3): a ese ancho, la proporción sigue pareciendo una habitación real.
// Con más, ver renderPairedGrid.
function renderSingleColumn(rooms: RoomSlot[], x: number, y: number, w: number, h: number, corridorSide: "left" | "right"): string {
  const totalWeight = rooms.reduce((sum, r) => sum + SIZE_WEIGHT[r.size], 0) || 1;
  const corridorX = corridorSide === "right" ? x + w : x;
  const exteriorX = corridorSide === "right" ? x : x + w;
  const doorDir: 1 | -1 = corridorSide === "right" ? -1 : 1;
  let cursorY = y;
  const parts: string[] = [];

  rooms.forEach((room, i) => {
    const boxH = (SIZE_WEIGHT[room.size] / totalWeight) * h;
    if (i > 0) parts.push(`<line x1="${x}" y1="${cursorY}" x2="${x + w}" y2="${cursorY}" stroke="${INK}" stroke-width="${WALL_THIN}" />`);
    parts.push(renderRoomCell(room, x, cursorY, w, boxH, corridorX, doorDir, exteriorX));
    cursorY += boxH;
  });
  return parts.join("\n");
}

// Intercala baños con el resto (dormitorios) antes de emparejar en filas,
// para que en cada pareja el baño tienda a caer del lado interior (sin
// ventana — normal en un baño con ventilación forzada) y el dormitorio del
// lado exterior (con ventana — lo contrario sería dejar un dormitorio
// interior sin ventana pudiendo evitarlo). Con más dormitorios que baños
// (el caso normal) esto le da ventana a todos los dormitorios que entren en
// pareja; el resto puede quedar en la fila impar final, que siempre tiene
// ventana propia por ir a ancho completo.
function orderForPairing(rooms: RoomSlot[]): RoomSlot[] {
  const bathrooms = rooms.filter((r) => r.id.startsWith("bano"));
  const others = rooms.filter((r) => !r.id.startsWith("bano"));
  const ordered: RoomSlot[] = [];
  for (let i = 0; i < Math.max(bathrooms.length, others.length); i++) {
    if (bathrooms[i]) ordered.push(bathrooms[i]);
    if (others[i]) ordered.push(others[i]);
  }
  return ordered;
}

// A partir de 4 habitaciones, apilarlas todas a ancho completo las deja
// larguísimas y angostas (un baño de 400×110 no se parece a ningún baño
// real). En vez de eso, dos por fila: la mitad que da al pasillo tiene la
// puerta, la mitad interior tiene la ventana (queda lejos del muro exterior
// y por eso NO se le dibuja puerta al pasillo — sería una habitación sin
// entrada propia, y aquí preferimos omitirla antes que inventar un acceso
// que no sabemos que existe). Fila impar al final: una sola habitación a
// ancho completo, con puerta y ventana como en la columna simple.
function renderPairedGrid(rooms: RoomSlot[], x: number, y: number, w: number, h: number, corridorSide: "left" | "right"): string {
  const ordered = orderForPairing(rooms);
  const rows: RoomSlot[][] = [];
  for (let i = 0; i < ordered.length; i += 2) rows.push(ordered.slice(i, i + 2));

  const rowWeight = (row: RoomSlot[]) => row.reduce((s, r) => s + SIZE_WEIGHT[r.size], 0);
  const totalWeight = rows.reduce((s, row) => s + rowWeight(row), 0) || 1;

  const corridorX = corridorSide === "right" ? x + w : x;
  const exteriorX = corridorSide === "right" ? x : x + w;
  const doorDir: 1 | -1 = corridorSide === "right" ? -1 : 1;
  const halfW = w / 2;
  const corridorCellX = corridorSide === "right" ? x + halfW : x;
  const interiorCellX = corridorSide === "right" ? x : x + halfW;

  let cursorY = y;
  const parts: string[] = [];

  rows.forEach((row, rowIndex) => {
    const rowH = (rowWeight(row) / totalWeight) * h;
    if (rowIndex > 0) parts.push(`<line x1="${x}" y1="${cursorY}" x2="${x + w}" y2="${cursorY}" stroke="${INK}" stroke-width="${WALL_THIN}" />`);

    if (row.length === 1) {
      parts.push(renderRoomCell(row[0], x, cursorY, w, rowH, corridorX, doorDir, exteriorX));
    } else {
      parts.push(`<line x1="${x + halfW}" y1="${cursorY}" x2="${x + halfW}" y2="${cursorY + rowH}" stroke="${INK}" stroke-width="${WALL_THIN}" />`);
      parts.push(renderRoomCell(row[0], corridorCellX, cursorY, halfW, rowH, corridorX, doorDir, null));
      parts.push(renderRoomCell(row[1], interiorCellX, cursorY, halfW, rowH, null, doorDir, exteriorX));
    }
    cursorY += rowH;
  });
  return parts.join("\n");
}

function renderZone(rooms: RoomSlot[], x: number, y: number, w: number, h: number, corridorSide: "left" | "right"): string {
  return rooms.length > 3 ? renderPairedGrid(rooms, x, y, w, h, corridorSide) : renderSingleColumn(rooms, x, y, w, h, corridorSide);
}

// Franja de circulación entre las dos zonas — sin esto, dos columnas
// separadas leen como dos habitaciones flotando en el vacío en vez de una
// vivienda conectada. Sin borde propio: sus cuatro lados ya quedan definidos
// por el perímetro exterior (arriba/abajo) y los muros medios de cada
// columna (izquierda/derecha, dibujados en renderZoneColumn).
function renderCorridor(x: number, y: number, w: number, h: number): string {
  const hatchGap = 22;
  const hatches: string[] = [];
  for (let hy = y + hatchGap; hy < y + h + w; hy += hatchGap) {
    hatches.push(`<line x1="${x}" y1="${hy}" x2="${x + w}" y2="${hy - w}" stroke="${INK}" stroke-width="0.6" opacity="0.22" />`);
  }
  return `<g>
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

  ${renderZone(dia, pad, bodyY, diaW, bodyH, "right")}
  ${renderCorridor(corridorX, bodyY, corridorW, bodyH)}
  ${renderZone(noche, nocheX, bodyY, nocheW, bodyH, "left")}

  <!-- Perímetro exterior por encima de todo lo demás: un solo trazo grueso
       alrededor de toda la vivienda, en vez de un borde por columna, para
       que lea como UN edificio y no como tres cajas sueltas. -->
  <rect x="${pad}" y="${bodyY}" width="${CANVAS_W - pad * 2}" height="${bodyH}" fill="none" stroke="${INK}" stroke-width="${WALL_EXT}" />

  <rect x="0" y="${CANVAS_H - footerH}" width="${CANVAS_W}" height="${footerH}" fill="${FOOTER_BG}" />
  <rect x="0" y="${CANVAS_H - footerH}" width="${CANVAS_W}" height="3" fill="${GOLD}" />
  <text x="${CANVAS_W / 2}" y="${CANVAS_H - footerH / 2 - 6}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="15.5" font-weight="700" letter-spacing="0.5" fill="${FOOTER_TEXT}">DISTRIBUCIÓN APROXIMADA — NO A ESCALA</text>
  <text x="${CANVAS_W / 2}" y="${CANVAS_H - footerH / 2 + 16}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="12" fill="${FOOTER_TEXT}" opacity="0.75">Generado por IA a partir de las fotos de la ficha — no sustituye un plano medido</text>
</svg>`;
}

type FloorPlanInputs = {
  title: string;
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  photoUrls: string[];
};

// Paso común a las dos fuentes posibles (propiedad real vía property_photos,
// o ficha de Idealista vía idealista_listings.photo_ids): arma los espacios,
// los anota con la IA y renderiza. Solo cambia de dónde salen los datos, no
// qué se hace con ellos.
async function renderFloorPlanFromInputs(inputs: FloorPlanInputs): Promise<FloorPlanSketchResult> {
  if (inputs.photoUrls.length === 0) {
    return { ok: false, error: "Esta ficha no tiene fotos todavía — sube al menos una foto para generar la distribución." };
  }

  let slots = buildRoomSlots(inputs.bedrooms, inputs.bathrooms);
  try {
    slots = await annotateFromPhotos(slots, inputs.photoUrls.slice(0, MAX_VISION_PHOTOS));
  } catch (err) {
    if (err instanceof AINotConfiguredError) return { ok: false, error: err.message };
    // Un fallo puntual de la IA (red, proveedor caído) no debe bloquear el
    // dibujo — sigue siendo útil con los tamaños por defecto, sin notas.
    console.error("[floorplan-sketch] Error consultando la IA:", err);
  }

  const svg = renderFloorPlanSvg(slots, {
    title: sanitizeAddressForDisplay(inputs.title),
    squareMeters: inputs.squareMeters,
  });

  try {
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return { ok: true, pngBuffer };
  } catch (err) {
    console.error("[floorplan-sketch] Error renderizando la imagen:", err);
    return { ok: false, error: "No se pudo generar la imagen." };
  }
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

  return renderFloorPlanFromInputs({
    title: (property.title as string) ?? "",
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    squareMeters: (property.square_meters as number | null) ?? null,
    photoUrls: ((photos ?? []) as Array<{ url: string }>).map((p) => p.url).filter(Boolean),
  });
}

// Mismo dibujo, pero para una ficha de "Fichas guardadas" en /admin/idealista
// (inspo o vinculada a una propiedad real) en vez de la ficha de propiedad.
// Ahí las fotos y los datos (dormitorios, baños, m²) viven en la propia fila
// de idealista_listings — es su propia galería, independiente de
// property_photos — así que nunca hace falta tocar `properties` para esto.
export async function generateApproximateFloorPlanForListing(listingId: string): Promise<FloorPlanSketchResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: listing, error } = await db
    .from("idealista_listings")
    .select("inspo_title, address_street, bedrooms, bathrooms, square_meters, photo_ids")
    .eq("id", listingId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!listing) return { ok: false, error: "No se encontró la ficha." };

  return renderFloorPlanFromInputs({
    // address_street ya viene sin número de portal (columna separada de
    // address_number) — más seguro que depender solo del saneador de texto.
    title: (listing.address_street as string) || (listing.inspo_title as string) || "",
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    squareMeters: (listing.square_meters as number | null) ?? null,
    photoUrls: ((listing.photo_ids ?? []) as string[]).filter(Boolean),
  });
}
