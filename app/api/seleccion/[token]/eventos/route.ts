import { NextResponse, type NextRequest } from "next/server";
import { getPublicCatalogState } from "@/lib/catalogs/public-data";
import { eventsLimiter } from "@/lib/catalogs/rate-limit";
import { isShareToken } from "@/lib/catalogs/share";
import { catalogSyncHub } from "@/lib/catalogs/sync-hub-instance";
import type { HubEvent } from "@/lib/catalogs/sync-hub";

// Canal en vivo de un catálogo compartido (BCP-01 T9, E4). Server-Sent Events:
//   hello        al conectar: contenido público completo + huella + caducidad
//   update       cuando cambia la huella: contenido completo (sin otra petición)
//   ping         latido cada 500 ms con la huella vigente y si el acceso se
//                verificó hace poco
//   unavailable  el enlace dejó de valer (revocado, caducado, archivado),
//                aunque el contenido no cambie; después se cierra
// Cada conexión vive como mucho 30 min; el lector se reconecta solo.
// `X-Accel-Buffering: no` para que nginx no retenga los eventos.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONNECTION_MS = 30 * 60_000;

const HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token)) return sseOnce("unavailable", {});
  if (!eventsLimiter.allow(token)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  let initial;
  try {
    initial = await getPublicCatalogState(token);
  } catch (err) {
    console.error("[catalogos] eventos:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "unavailable_backend" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!initial) return sseOnce("unavailable", {});

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          close();
        }
      };
      let unsubscribe = () => {};
      const lifetime = setTimeout(() => close(), MAX_CONNECTION_MS);
      const onAbort = () => close();
      function close() {
        if (closed) return;
        closed = true;
        clearTimeout(lifetime);
        unsubscribe();
        req.signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          // ya cerrado
        }
      }
      cleanup = close;

      controller.enqueue(encoder.encode("retry: 1000\n\n"));
      write("hello", initial);
      unsubscribe = catalogSyncHub().subscribe(token, initial!.fingerprint, (ev: HubEvent) => {
        if (ev.type === "update") write("update", ev.state);
        else if (ev.type === "ping") write("ping", { fingerprint: ev.fingerprint, verified: ev.verified });
        else {
          write("unavailable", {});
          close();
        }
      });
      if (req.signal.aborted) close();
      else req.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, { headers: HEADERS });
}

function sseOnce(event: string, data: unknown) {
  return new Response(`retry: 1000\n\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`, { headers: HEADERS });
}
