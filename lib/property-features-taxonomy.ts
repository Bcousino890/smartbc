// SmartLink 2.0 · taxonomía determinista de features.
//
// Los features llegan como strings libres del scraper (+manuales). Este mapa
// los agrupa en RESIDENCIA / EDIFICIO / TÉCNICO para "Detalles de la vivienda".
// Lo no reconocido va a OTROS con su string original: NUNCA se pierde un dato.
// Sustituye a las 2 regex de 12 keywords que vivían en la vista.

export type FeatureGroup = "residencia" | "edificio" | "tecnico" | "otros";

export const FEATURE_GROUP_LABELS: Record<FeatureGroup, string> = {
  residencia: "Residencia",
  edificio: "Edificio",
  tecnico: "Técnico",
  otros: "Otros",
};

const RULES: Array<{ re: RegExp; group: FeatureGroup }> = [
  // ── Residencia (la vivienda en sí) ──
  { re: /amueblad/i, group: "residencia" },
  { re: /reformad|a estrenar|buen estado/i, group: "residencia" },
  { re: /aire acondicionado|a\/a|climatizaci[oó]n|aerotermia/i, group: "residencia" },
  { re: /calefacci[oó]n/i, group: "residencia" },
  { re: /armarios? empotrad/i, group: "residencia" },
  { re: /vestidor/i, group: "residencia" },
  { re: /(baño|bano) en suite|en suite/i, group: "residencia" },
  { re: /terraza/i, group: "residencia" },
  { re: /balc[oó]n/i, group: "residencia" },
  { re: /chimenea/i, group: "residencia" },
  { re: /cocina (equipada|amueblada|americana|office|abierta)/i, group: "residencia" },
  { re: /electrodom[eé]sticos/i, group: "residencia" },
  { re: /domótica|domotica/i, group: "residencia" },
  { re: /suelo radiante/i, group: "residencia" },
  { re: /parquet|tarima/i, group: "residencia" },
  { re: /lavadero/i, group: "residencia" },
  { re: /despacho|oficina/i, group: "residencia" },
  { re: /exterior\b/i, group: "residencia" },
  { re: /luminoso/i, group: "residencia" },
  { re: /jard[ií]n privado/i, group: "residencia" },
  { re: /piscina privada/i, group: "residencia" },
  // ── Edificio y zonas comunes ──
  { re: /ascensor/i, group: "edificio" },
  { re: /portero|conserje|seguridad 24/i, group: "edificio" },
  { re: /garaje|parking|plaza de aparcamiento/i, group: "edificio" },
  { re: /trastero/i, group: "edificio" },
  { re: /piscina(?! privada)/i, group: "edificio" },
  { re: /jard[ií]n(?! privado)|zonas? verdes?/i, group: "edificio" },
  { re: /gimnasio|gym/i, group: "edificio" },
  { re: /p[aá]del|pista deportiva/i, group: "edificio" },
  { re: /urbanizaci[oó]n/i, group: "edificio" },
  { re: /videoportero|portero autom[aá]tico/i, group: "edificio" },
  { re: /accesib|adaptad/i, group: "edificio" },
  // ── Técnico ──
  { re: /certificado energ|eficiencia energ|calificaci[oó]n energ/i, group: "tecnico" },
  { re: /año de construcci[oó]n|construido en/i, group: "tecnico" },
  { re: /gastos de comunidad/i, group: "tecnico" },
  { re: /orientaci[oó]n/i, group: "tecnico" },
  { re: /planta \d|[aá]tico|bajo\b/i, group: "tecnico" },
];

export function groupFeatures(
  features: string[],
): Array<{ group: FeatureGroup; label: string; items: string[] }> {
  const buckets: Record<FeatureGroup, string[]> = {
    residencia: [],
    edificio: [],
    tecnico: [],
    otros: [],
  };
  for (const raw of features) {
    const f = raw.trim();
    if (!f) continue;
    const rule = RULES.find((r) => r.re.test(f));
    buckets[rule?.group ?? "otros"].push(f);
  }
  return (Object.keys(buckets) as FeatureGroup[])
    .filter((g) => buckets[g].length > 0)
    .map((g) => ({ group: g, label: FEATURE_GROUP_LABELS[g], items: buckets[g] }));
}
