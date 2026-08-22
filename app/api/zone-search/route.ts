import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { locationSearchProvider } from "@/lib/services/location/search-provider";
import { foldText, type SearchPlaceDto } from "@/lib/services/location/search";

// BUSCAR CERCA DE ESTA VIVIENDA · ruta de búsqueda externa.
//
// El navegador NUNCA habla con el geocoder: todo pasa por aquí, donde vive el
// ritmo global de 1 req/s y la caché. La petición lleva SOLO la consulta y la
// coordenada de sesgo — sin nombre de cliente, sin email, sin identidad de
// navegación (§17): la vivienda es pública, el que busca no viaja con ella.
//
// La consulta en crudo NO se persiste en ningún sitio: ni logs propios, ni
// analytics. Lo único que la analítica registra después es la categoría del
// resultado elegido.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));

  if (q.length < 2) return NextResponse.json({ results: [] });
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return new NextResponse("bad_bias", { status: 400 });
  }

  // ── mode=local · sugerencias al teclear contra NUESTRA base ──
  // zone_places (0154) tiene el catálogo completo de Madrid importado de OSM:
  // buscar aquí es instantáneo y no toca a ningún tercero, así que sí puede
  // dispararse mientras se escribe. Nominatim queda para el Enter.
  if (url.searchParams.get("mode") === "local") {
    try {
      const db = createAdminClient() as any;
      let folded = foldText(q).replace(/[%_]/g, "");

      // El VOCABULARIO del que busca no es el nombre oficial de OSM: la
      // gente escribe "colegio del Pilar" y el registro se llama "Centro
      // Privado de Educación Infantil, Primaria y Secundaria Nuestra Señora
      // del Pilar". Los términos genéricos filtran por CATEGORÍA, no por
      // nombre; los artículos no filtran nada; el resto sí exige aparecer.
      // "colegio" a secas también funciona: los colegios más cercanos.
      const GENERIC: Record<string, string> = {
        colegio: "educacion", colegios: "educacion", escuela: "educacion",
        instituto: "educacion", guarderia: "educacion", universidad: "educacion",
        facultad: "educacion",
        restaurante: "gastronomia", restaurantes: "gastronomia",
        cafeteria: "gastronomia", bar: "gastronomia",
        hospital: "salud", hospitales: "salud", clinica: "salud",
        gimnasio: "deporte", polideportivo: "deporte", estadio: "deporte",
        museo: "cultura", museos: "cultura", teatro: "cultura", cine: "cultura",
        monumento: "cultura",
        parque: "parque", parques: "parque",
        estacion: "transporte", metro: "transporte", cercanias: "transporte",
        supermercado: "compras", tienda: "compras", mercado: "compras",
      };
      const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "en", "un", "una"]);

      let category: string | null = null;
      // El bigrama "centro comercial" es compras; sus tokens no van al nombre.
      if (/\bcentro comercial(es)?\b/.test(folded)) {
        category = "compras";
        folded = folded.replace(/\bcentro comercial(es)?\b/g, " ").trim();
      }
      const nameTokens: string[] = [];
      for (const t of folded.split(/\s+/).filter(Boolean)) {
        if (STOP.has(t)) continue;
        if (GENERIC[t]) { category = category ?? GENERIC[t]; continue; }
        if (t.length >= 2) nameTokens.push(t);
      }
      if (nameTokens.length === 0 && !category) return NextResponse.json({ results: [] });

      let sel = db.from("zone_places").select("osm_ref, name, category, lat, lng, address");
      if (category) sel = sel.eq("category", category);
      for (const t of nameTokens) sel = sel.ilike("name_folded", `%${t}%`);
      // Sin nombre que filtrar (solo "colegio"), la BD no puede ordenar por
      // cercanía: se trae un lote mayor y el score de abajo lo resuelve.
      const { data } = await sel.limit(nameTokens.length ? 40 : 400);
      const rows = (data ?? []) as Array<{
        osm_ref: string; name: string; category: string; lat: number; lng: number; address: string | null;
      }>;
      // Prefijo gana a subcadena; a igualdad, lo más cercano a la vivienda.
      const score = (r: (typeof rows)[number]) => {
        const km = Math.hypot((r.lat - lat) * 111, (r.lng - lng) * 85);
        // Consulta puramente genérica ("hospital", "colegio"): manda la
        // CERCANÍA y nada más — el bono de frase premiaba a un hospital a
        // 24 min solo porque su nombre empezaba por "Hospital" (visto en QA).
        if (nameTokens.length === 0) return km;
        const name = foldText(r.name);
        const phrase = name.indexOf(nameTokens.join(" "));
        const base = phrase === 0 ? 0 : phrase > 0 ? 500 : 2000;
        return base + km;
      };
      const results: SearchPlaceDto[] = rows
        .sort((a, b) => score(a) - score(b))
        .slice(0, 6)
        .map((r) => ({
          id: `search:${r.osm_ref}`,
          name: r.name,
          category: r.category,
          lat: r.lat,
          lng: r.lng,
          address: r.address,
        }));
      return NextResponse.json(
        { results },
        { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
      );
    } catch {
      return NextResponse.json({ results: [] });
    }
  }

  try {
    const results = await locationSearchProvider.search(q, { lat, lng });
    return NextResponse.json(
      { results },
      // La caché del proveedor ya evita repetir contra Nominatim; esta capa
      // deja además que el CDN absorba la misma búsqueda de otros visitantes.
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
    );
  } catch {
    // El geocoder caído no rompe nada: la UI muestra su mensaje y el mapa y
    // los POIs curados siguen funcionando (§16).
    return NextResponse.json({ results: null }, { status: 503 });
  }
}
