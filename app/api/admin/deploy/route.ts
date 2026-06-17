import "server-only";
import { exec } from "child_process";
import { promisify } from "util";
import { getCurrentProfile } from "@/lib/db/queries/session";

const execAsync = promisify(exec);

// POST /api/admin/deploy
// Lanza git pull + npm build + pm2 restart en el VPS. Solo owner/admin.
// El build es lento (~2min); la respuesta se devuelve ANTES de que termine
// para no agotar el timeout HTTP. El estado real se ve en los logs de PM2.
export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const cwd = process.cwd();

  // Ejecutar git pull sincrónico para saber si hay cambios nuevos
  let pullOutput = "";
  try {
    const { stdout } = await execAsync("git pull origin main", { cwd, timeout: 30000 });
    pullOutput = stdout.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: `git pull failed: ${msg}` }, { status: 500 });
  }

  const hasChanges = !pullOutput.includes("Already up to date");

  // Lanzar build + restart en background (no bloqueamos la respuesta HTTP)
  const buildCmd = `npm run build && pm2 restart smartbc-portal`;
  exec(buildCmd, { cwd, timeout: 300000 }, (err) => {
    if (err) console.error("[deploy] build/restart failed:", err.message);
    else console.log("[deploy] build + pm2 restart completed");
  });

  return Response.json({
    ok: true,
    hasChanges,
    pullOutput,
    message: hasChanges
      ? "Cambios detectados. Build iniciado en background (~2 min). Verifica los logs de PM2."
      : "Ya estás en la última versión. Forzando restart de PM2.",
  });
}
