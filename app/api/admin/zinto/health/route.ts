import "server-only";
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { diagnoseZintoIntegration } from "@/lib/services/zinto-integration/health";

// Diagnóstico de la integración con Zinto TAL Y COMO LA VE EL SERVIDOR.
//
// Existe porque "Probar Conexión" mentía: probaba la credencial de la capa
// legacy mientras la capa nueva usaba otra distinta y llevaba cuatro semanas
// muerta. Desde fuera, seis causas se ven idénticas ("no conecta"):
//   1. no hay credencial en ninguna parte,
//   2. la credencial sale del entorno y no del panel (dos claves distintas),
//   3. la URL base ya no es la API y devuelve el HTML de la web con un 200,
//   4. la clave está revocada o caducada,
//   5. le faltan scopes,
//   6. el webhook no está registrado, así que no entra nada.
// Aquí se devuelven los datos que las separan, y el veredicto dice qué tocar.
//
// Acceso: owner/admin logueado, o `Authorization: Bearer ${CRON_SECRET}` para
// lanzarlo por curl desde el propio VPS (mismo patrón que ffmpeg-health):
//   curl -s -H "Authorization: Bearer $CRON_SECRET" \
//     http://localhost:3000/api/admin/zinto/health | jq .verdict

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

  const diagnosis = await diagnoseZintoIntegration();

  // 200 siempre: "está roto" es una respuesta válida del diagnóstico, no un
  // fallo del endpoint. El veredicto va en el cuerpo.
  //
  // charset explícito: sin él el navegador adivina latin-1 al abrir la URL a
  // pelo y el veredicto llega con los acentos rotos — que es justo el texto
  // que uno acaba pegando en un chat para pedir ayuda.
  return new NextResponse(JSON.stringify(diagnosis, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
