import "server-only";
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { diagnoseFfmpeg } from "@/lib/services/video/ffmpeg";

// Diagnóstico de ffmpeg TAL Y COMO LO VE EL PROCESO DE LA WEB.
//
// El panel solo sabe decir "falta ffmpeg", que es la conclusión de un
// `spawn("ffmpeg")` que devolvió ENOENT. Pero ese ENOENT tiene tres causas
// distintas que desde fuera se ven idénticas:
//   1. no está instalado,
//   2. está instalado pero en un directorio que no está en el PATH que heredó
//      el demonio de PM2 (el caso más común: `pm2 restart` NO refresca el
//      entorno del demonio, hace falta `--update-env`),
//   3. está pero el usuario del proceso no puede ejecutarlo.
// Aquí se devuelven los datos que las separan: PATH real, usuario, rutas
// encontradas y el error exacto al ejecutar cada binario.
//
// Acceso: owner/admin logueado, o `Authorization: Bearer ${CRON_SECRET}` para
// poder lanzarlo por curl desde el propio VPS (mismo patrón que proxy-health):
//   curl -s -H "Authorization: Bearer $CRON_SECRET" \
//     http://localhost:3137/api/admin/video/ffmpeg-health | jq

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const hasCronSecret =
    !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!hasCronSecret) {
    const profile = await getCurrentProfile().catch(() => null);
    if (!profile || !["owner", "admin"].includes(profile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }

  const diagnosis = await diagnoseFfmpeg();
  // 200 siempre: un "no está instalado" es una respuesta válida del
  // diagnóstico, no un fallo del endpoint. El veredicto va en el cuerpo.
  //
  // charset explícito: sin él, el navegador adivina latin-1 al abrir la URL a
  // pelo y el veredicto llega con acentos rotos ("no se encontrÃ³"), que es
  // justo lo que uno acaba pegando en un chat para pedir ayuda.
  return new NextResponse(JSON.stringify(diagnosis, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
