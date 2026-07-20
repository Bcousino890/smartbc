import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";
import { AGENCY_NAME } from "@/lib/services/idealista/description-style";

// Genera la descripción de una propiedad (ficha del admin de Propiedades,
// ES o CL) con IA a partir de los datos del formulario + características
// marcadas + fotos ya subidas. A diferencia de
// /api/admin/idealista/generate-description (pensado solo para el formulario
// de Idealista/España), este endpoint es genérico por país: cambia moneda,
// mercado, vocabulario y formato de salida (CL usa fichas con viñetas por
// secciones, al estilo habitual de PortalInmobiliario; ES sigue el estilo
// prosa premium ya usado para Idealista).

type DescInput = {
  country?: string; // "es" | "cl"
  operation?: "sale" | "rent" | string;
  zone?: string;
  sector?: string; // subzona dentro de la comuna (ej. Chicureo en Colina)
  address?: string;
  squareMeters?: number; // superficie total/construida
  coveredAreaM2?: number; // superficie útil (CL)
  bedrooms?: number;
  bathrooms?: number;
  parkingLots?: number;
  floors?: number; // n.º de pisos de la vivienda
  isCondominium?: boolean;
  constructionYear?: number;
  price?: number;
  currency?: string; // solo CL: "uf" | "clp" | "usd"
  features?: string[];
  // URLs de fotos ya subidas: si se aportan, la IA "ve" las imágenes.
  photos?: string[];
};

const MAX_VISION_PHOTOS = 8;

const CURRENCY_LABEL: Record<string, string> = {
  uf: "UF",
  clp: "CLP",
  usd: "USD",
};

function buildFacts(d: DescInput): string {
  const isCL = d.country === "cl";
  const lines: string[] = [];
  lines.push(`Operación: ${d.operation === "sale" ? "venta" : "arriendo/alquiler"}`);
  if (d.zone) lines.push(`${isCL ? "Comuna" : "Zona"}: ${d.zone}`);
  if (d.sector) lines.push(`Sector/subzona: ${d.sector}`);
  if (d.address) lines.push(`Dirección: ${d.address}`);
  if (d.squareMeters) lines.push(`Superficie construida/total: ${d.squareMeters} m²`);
  if (isCL && d.coveredAreaM2) lines.push(`Superficie útil: ${d.coveredAreaM2} m²`);
  if (d.bedrooms) lines.push(`Dormitorios: ${d.bedrooms}`);
  if (d.bathrooms) lines.push(`Baños: ${d.bathrooms}`);
  if (isCL && d.parkingLots) lines.push(`Estacionamientos: ${d.parkingLots}`);
  if (isCL && d.floors) lines.push(`N.º de pisos de la vivienda: ${d.floors}`);
  if (isCL && d.isCondominium !== undefined) {
    lines.push(`¿Está en condominio?: ${d.isCondominium ? "sí" : "no"}`);
  }
  if (isCL && d.constructionYear) lines.push(`Año de construcción: ${d.constructionYear}`);
  if (d.price) {
    const currency = isCL ? CURRENCY_LABEL[d.currency ?? "clp"] ?? "CLP" : "€";
    lines.push(`Precio: ${d.price} ${currency}${d.operation === "rent" ? "/mes" : ""}`);
  }
  const features = (d.features ?? []).filter(Boolean);
  if (features.length) lines.push(`Características marcadas: ${features.join(", ")}`);
  return lines.join("\n");
}

const CL_VOCAB = `Vocabulario y convenciones de Chile (úsalos, NO los equivalentes de España):
- "Departamento", nunca "piso" (en Chile "piso" es el suelo, no la vivienda; "piso" solo se usa para contar niveles, ej. "primer piso").
- "Arriendo"/"arrendar", nunca "alquiler"/"alquilar".
- "Estacionamiento", nunca "plaza de garaje" ni "parking".
- "Living" o "living-comedor", no "salón".
- "Bodega" para el trastero.
- Comuna en vez de barrio/distrito (ej. "en pleno Las Condes"); si hay sector/subzona, menciónalo (ej. "en Chicureo, comuna de Colina").
- Si el precio está en UF, exprésalo como "UF X" (no "€X"); si es en pesos, "$X" o "CLP X".
- Evita modismos/jerga (nada de "bacán", "la firme", "cuático"): registro premium pero natural para el mercado chileno, no una traducción literal del español de España.`;

// Formato CL: ficha con secciones en mayúsculas y viñetas (el formato
// habitual de portales chilenos como PortalInmobiliario), a diferencia del
// formato en prosa que usa ES/Idealista.
const CL_STRUCTURED_FORMAT = `FORMATO (español de Chile, vocabulario chileno — ver arriba):

1) Un párrafo de apertura (2-4 frases, sin encabezado): presenta el tipo de vivienda, la operación y la comuna/sector si se conocen, con un gancho que transmita estilo de vida. Prosa normal, sin viñetas.

2) Luego, secciones en MAYÚSCULAS seguidas de viñetas ("• "), usando SOLO los datos aportados (omite cualquier sección para la que no haya datos suficientes):

CARACTERÍSTICAS GENERALES
• m² construidos / m² útiles / m² terreno si se conocen
• Dormitorios, baños
• Otras características destacadas de la lista de "Características marcadas" (ej. piscina, quincho)

DISTRIBUCIÓN
• Si se aportan fotos y se puede distinguir razonablemente qué se ve en cada nivel, organiza esta sección con subtítulos "PRIMER PISO" / "SEGUNDO PISO" (según el n.º de pisos indicado) y viñetas debajo de cada uno con los ambientes que se aprecian.
• Si NO hay suficiente información para dividir por piso, describe la distribución general en viñetas sin subtítulos de piso. NUNCA inventes una distribución de ambientes que no se aprecie en los datos/fotos.

EXTERIOR
• Estacionamientos, jardín, piscina, quincho, bodegas u otras características exteriores de la lista marcada

ADICIONALES
• Año de construcción (si se conoce)
• Si está en condominio, indícalo aquí ("Ubicada dentro de condominio" o similar)
• Otras características marcadas que no encajen arriba (calefacción, amoblado, etc.)

3) Cierre: una línea breve invitando a agendar una visita (ej. "Aprovecha esta oportunidad y agenda tu visita.").

Reglas:
- Usa ÚNICAMENTE datos reales aportados o visibles en las fotos. NO inventes metros, número de ambientes, año de construcción, precio ni la dirección exacta.
- No incluyas datos de contacto, ID de propiedad ni el nombre de la inmobiliaria (van aparte).
- Las viñetas usan "• " al inicio de línea. Los encabezados de sección van en una línea aparte, en mayúsculas, sin numeración ni markdown (nada de #, **, etc.).
- Si se aportan fotos, básate también en lo que se ve en ellas (luz, distribución, calidades, estado, exteriores) para las viñetas.`;

const ES_PROSE_FORMAT = `FORMATO FIJO (180-240 palabras, 3-4 párrafos, español de España):
1) Apertura: presenta el tipo de vivienda y, si se conoce, la zona/comuna. Un gancho que transmita estilo de vida.
2) La vivienda: distribución, luz, estancias, calidades y detalles que se aprecien en las fotos o los datos aportados (incluidas las características marcadas). Concreto y sensorial.
3) El entorno / estilo de vida: qué ofrece la zona (solo si se conoce); si no, habla del carácter del inmueble.
4) Cierre: una invitación elegante a concertar una visita.

Reglas:
- Usa ÚNICAMENTE datos reales aportados o visibles en las fotos. NO inventes metros, número de estancias, precio, servicios cercanos concretos ni la dirección exacta.
- No incluyas datos de contacto.
- Nada de markdown, títulos, viñetas ni comillas: solo el texto corrido en párrafos.
- Si se aportan fotos, básate también en lo que se ve en ellas (luz, distribución, calidades, estado, exteriores).`;

function systemPrompt(country?: string): string {
  const isCL = country === "cl";
  const market = isCL ? "chileno" : "español";
  const portal = isCL ? "PortalInmobiliario" : "Idealista";
  return `Eres el redactor de anuncios de ${AGENCY_NAME}, una inmobiliaria premium en ${isCL ? "Chile" : "España"}.

Escribe la descripción del anuncio con un registro PREMIUM e inmobiliario de alta gama, elegante, aspiracional y evocador, sin caer en superlativos huecos ni promesas que los datos no respalden, adaptado al mercado residencial ${market} y a ${portal}.
${isCL ? `\n${CL_VOCAB}\n` : ""}
${isCL ? CL_STRUCTURED_FORMAT : ES_PROSE_FORMAT}`;
}

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "properties", "edit")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as DescInput | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const facts = buildFacts(body);
  const photos = (body.photos ?? [])
    .filter((u) => typeof u === "string" && u.startsWith("http"))
    .slice(0, MAX_VISION_PHOTOS);
  const userPrompt =
    `Redacta la descripción del anuncio con estos datos:\n\n${facts}` +
    (photos.length ? `\n\nSe adjuntan ${photos.length} fotos del inmueble.` : "");

  try {
    const raw = await aiComplete({
      system: systemPrompt(body.country),
      userText: userPrompt,
      images: photos,
      maxTokens: 1600,
    });
    if (!raw) {
      return Response.json({ error: "La IA no devolvió texto" }, { status: 502 });
    }
    return Response.json({ description: raw.trim() });
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "Error al generar la descripción" },
      { status: 502 },
    );
  }
}
