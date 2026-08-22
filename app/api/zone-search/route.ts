import { NextResponse } from "next/server";
import { locationSearchProvider } from "@/lib/services/location/search-provider";

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
