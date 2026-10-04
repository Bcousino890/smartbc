import { NextRequest } from "next/server";
import {
  uploadPropertyPhoto,
  uploadPropertyPlan,
  uploadPropertyVideo,
} from "@/app/(admin)/admin/propiedades/actions";

export const dynamic = "force-dynamic";
// Un vídeo de cientos de MB tarda en subir a storage.
export const maxDuration = 300;

/**
 * Fotos, vídeos y planos de una propiedad — la MISMA lógica que los server
 * actions de actions.ts (permisos incluidos: cada función comprueba
 * properties/edit), pero por un route handler.
 *
 * ¿Por qué? Next 15.5 corta a 10 MB el cuerpo de toda petición que pase por
 * middleware.ts (`middlewareClientMaxBodySize`), y un server action siempre
 * pasa: va contra la URL de la página, que el middleware tiene que proteger.
 * Esta ruta, en cambio, está excluida del matcher del middleware (allí sólo
 * refrescaría la cookie; no controla acceso en /api), así que recibe el
 * archivo entero.
 */
const HANDLERS = {
  photo: uploadPropertyPhoto,
  video: uploadPropertyVideo,
  plan: uploadPropertyPlan,
} as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const handler = HANDLERS[kind as keyof typeof HANDLERS];
  if (!handler) return Response.json({ ok: false, error: "tipo_invalido" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "Se cortó la subida del archivo. Inténtalo de nuevo." }, { status: 400 });
  }

  try {
    return Response.json(await handler(formData));
  } catch (err) {
    console.error(`[upload ${kind}]`, err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "No se pudo subir el archivo." },
      { status: 500 },
    );
  }
}
