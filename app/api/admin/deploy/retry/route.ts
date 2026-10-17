import "server-only";
import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { getCurrentProfile } from "@/lib/db/queries/session";
import {
  INFRA_CONFIRMATION,
  auditInfraAction,
  hasConfirmation,
  releaseInfraAction,
  tryLockInfraAction,
} from "@/lib/auth/infra-action";

/**
 * "Reintentar despliegue" — para cuando un build se queda atascado y ningún
 * commit nuevo lo va a despertar (ver scripts/deploy-retry.sh: el cron solo
 * reintenta si HEAD difiere de origin/main, y el `git reset` ya iguala los
 * dos ANTES de que el build falle).
 *
 * El script reinstala node_modules y repite build+swap+salud sobre el commit
 * que ya está en disco. Como termina con un `pm2 restart` (reinicia este
 * mismo proceso), se lanza DESATENDIDO (`detached` + `unref`): si esta
 * petición HTTP muere junto con el proceso viejo, el script sigue corriendo
 * igual. El progreso se seguía por GET, no por la respuesta del POST.
 *
 * Solo owner/admin, igual que /api/admin/migrations/apply.
 */

const LOG_PATH = "/var/log/smartbc-autodeploy.log";

async function requireOwnerOrAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return null;
  }
  return profile;
}

export async function POST(req: Request) {
  const profile = await requireOwnerOrAdmin();
  if (!profile) {
    return Response.json({ error: "Unauthorized - solo Owner/Admin" }, { status: 403 });
  }

  // Confirmación explícita: el cuerpo debe traer la frase exacta.
  if (!(await hasConfirmation(req, INFRA_CONFIRMATION.deploy))) {
    return Response.json(
      {
        ok: false,
        error: `Falta la confirmación. Envía { "confirm": "${INFRA_CONFIRMATION.deploy}" } para reintentar el despliegue.`,
        needsConfirmation: true,
      },
      { status: 400 },
    );
  }
  // El script reinicia este mismo proceso, así que el candado en memoria solo
  // cubre dobles clics seguidos; el propio script ya evita solaparse al compilar.
  if (!tryLockInfraAction("deploy_retry")) {
    return Response.json(
      { ok: false, error: "Ya hay un reintento de despliegue en curso" },
      { status: 409 },
    );
  }
  await auditInfraAction({ actorId: profile.id, action: "deploy_retry", outcome: "started" });

  try {
    const child = spawn("bash", ["scripts/deploy-retry.sh"], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    return Response.json({
      ok: true,
      message:
        "Reintento iniciado en segundo plano: reinstalando dependencias y compilando de nuevo. Puede tardar varios minutos y la app se reiniciará sola si sale bien.",
    });
  } catch (error) {
    releaseInfraAction("deploy_retry");
    await auditInfraAction({
      actorId: profile.id,
      action: "deploy_retry",
      outcome: "error",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/** Últimas líneas del log compartido con el deploy automático, para seguir el progreso. */
export async function GET() {
  const profile = await requireOwnerOrAdmin();
  if (!profile) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const content = await readFile(LOG_PATH, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    const tail = lines.slice(-60).join("\n");
    return Response.json({ ok: true, tail });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "No se pudo leer el log" },
      { status: 500 },
    );
  }
}
