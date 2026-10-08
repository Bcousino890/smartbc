import { processPendingPortalLinks } from "@/lib/portal-links/auto-import";

// Respaldo de las fichas automáticas de "Enlaces de portales".
//
// Cada alta ya lanza la creación al momento (after() en la acción y en la ruta
// de la extensión). Esto recoge lo que se quedó a medias: un reinicio del
// servidor en mitad de la tanda, un anuncio que el portal bloqueó y toca
// reintentar. Lo llama el cron del VPS cada 5 min
// (/opt/smartbc-portal-links-import.sh). Ver lib/portal-links/auto-import.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // No se espera a que acabe: con 30 anuncios son minutos, y el cron solo
  // necesita saber que arrancó. Si ya hay un recorrido en marcha, se suma a él.
  void processPendingPortalLinks();
  return Response.json({ ok: true, started: new Date().toISOString() });
}
