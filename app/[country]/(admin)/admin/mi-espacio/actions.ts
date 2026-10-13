"use server";

// ============================================================================
// Acciones de la HOME y de los catálogos (BCP-01). Cada una:
//   1. pasa por la guarda del dueño (withHomeAccess): si no es el dueño, la
//      acción NI SE EJECUTA;
//   2. llama a una función SQL de 0192 con p_actor = id del dueño, que vuelve
//      a comprobar la propiedad del catálogo en la base de datos;
//   3. solo escribe en tablas del catálogo. Nunca en properties ni en clientes.
// ============================================================================

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { withHomeAccess, type ActionResult } from "@/lib/catalogs/access";
import { catalogErrorMessage } from "@/lib/catalogs/errors";
import { isHomeOwner } from "@/lib/catalogs/owner";
import { normalizeIntro, normalizeTitle } from "@/lib/catalogs/validate";

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;
const ownerDeps = { getProfile: getCurrentProfile, isOwner: isHomeOwner };
const HOME_PATH = "/es/admin/mi-espacio";

function fail(err: Parameters<typeof catalogErrorMessage>[0]): { ok: false; error: string } {
  return { ok: false, error: catalogErrorMessage(err) };
}

/** Los rechazos de la guarda llegan como código ('forbidden' |
 *  'unauthenticated'); los errores de la propia acción ya son mensajes. */
function finish<T extends object>(res: ActionResult<T>): ActionResult<T> {
  if (!res.ok && (res.error === "forbidden" || res.error === "unauthenticated")) {
    return { ok: false, error: catalogErrorMessage(res.error) };
  }
  return res;
}

export async function createCatalogAction(input: {
  title: string;
  intro?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    const title = normalizeTitle(input?.title);
    if (!title.ok) return fail(title.error);
    const intro = normalizeIntro(input?.intro);
    if (!intro.ok) return fail(intro.error);

    const { data, error } = await db().rpc("catalog_create", {
      p_actor: profile.id,
      p_title: title.value,
      p_intro: intro.value,
    });
    if (error || !data) return fail(error);
    revalidatePath(HOME_PATH);
    return { ok: true as const, id: String(data) };
  }));
}
