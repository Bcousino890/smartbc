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
      const folded = foldText(q).replace(/[%_]/g, "");
      // Por PALABRAS, no por frase contigua: "Colegio del Pilar" tiene que
      // encontrar a "Colegio NUESTRA SEÑORA del Pilar". Cada término es un
      // filtro AND; los vacíos de una letra no filtran nada.
      const tokens = folded.split(/\s+/).filter((t) => t.length >= 2);
      if (tokens.length === 0) return NextResponse.json({ results: [] });
      let sel = db
        .from("zone_places")
        .select("osm_ref, name, category, lat, lng, address");
      for (const t of tokens) sel = sel.ilike("name_folded", `%${t}%`);
      const { data } = await sel.limit(40);
      const rows = (data ?? []) as Array<{
        osm_ref: string; name: string; category: string; lat: number; lng: number; address: string | null;
      }>;
      // Prefijo gana a subcadena; a igualdad, lo más cercano a la vivienda.
      const score = (r: (typeof rows)[number]) => {
        const name = foldText(r.name);
        // La frase entera contigua sigue puntuando mejor que las palabras
        // sueltas, y el prefijo mejor que todo; la cercanía desempata.
        const phrase = name.indexOf(folded);
        const base = phrase === 0 ? 0 : phrase > 0 ? 500 : 2000;
        const km = Math.hypot((r.lat - lat) * 111, (r.lng - lng) * 85);
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
