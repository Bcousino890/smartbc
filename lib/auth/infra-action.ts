import "server-only";
import { logPermissionEvent } from "@/lib/db/queries/audit";
import {
  INFRA_CONFIRMATION,
  hasConfirmation,
  releaseInfraAction,
  tryLockInfraAction,
  type InfraActionName,
} from "./infra-lock";

export { INFRA_CONFIRMATION, hasConfirmation, releaseInfraAction, tryLockInfraAction };
export type { InfraActionName };

/**
 * Acciones de infraestructura lanzadas desde el panel (aplicar migraciones,
 * reintentar el despliegue). Pueden tumbar producción, así que exigen:
 *   1. una CONFIRMACIÓN explícita en el cuerpo (frase exacta). Un POST sin
 *      cuerpo, o un formulario cruzado desde otro sitio (que no puede mandar JSON
 *      sin preflight de CORS), no basta.
 *   2. dejar constancia de quién la lanzó y cómo terminó (`permission_audit_log`,
 *      evento `infra_action`) y en el log del servidor.
 *   3. no solaparse consigo misma: un segundo lanzamiento mientras hay uno en
 *      curso se rechaza.
 */

/** Constancia de la acción (best-effort: nunca bloquea la operación). */
export async function auditInfraAction(input: {
  actorId: string;
  action: InfraActionName;
  outcome: "started" | "ok" | "error";
  detail?: string;
}): Promise<void> {
  console.log(
    `[infra] ${input.action} · actor=${input.actorId} · ${input.outcome}${input.detail ? ` · ${input.detail}` : ""}`,
  );
  await logPermissionEvent({
    actorId: input.actorId,
    targetUserId: input.actorId,
    eventType: "infra_action",
    resource: "sistema",
    action: input.action,
    newValue: { outcome: input.outcome, detail: input.detail?.slice(0, 500) ?? null },
  });
}
