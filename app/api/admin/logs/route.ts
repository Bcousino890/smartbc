import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { execSync } from "child_process";
import path from "path";
import { readFileSync } from "fs";

// ⚠️ El nombre real de la app en PM2 es "smartbc-portal" (ver
// scripts/vps-autodeploy.sh: PM2_APP=smartbc-portal, y CLAUDE.md — "App de
// PM2 | smartbc-portal | smartbc-main — no existe", verificado por SSH
// 2026-08-11). Esta ruta pedía logs de un proceso "smartbc" que no existe:
// `pm2 logs smartbc --nostream` no daba error, solo imprimía su banner
// ("[TAILING] Tailing last N lines for [smartbc] process") y nada más
// detrás, porque no había ningún proceso con ese nombre — así que el visor
// parecía funcionar (sin error) pero nunca mostró una sola línea real.
const PM2_APP_NAME = "smartbc-portal";
const TAIL_LINES = 300;

function tailLines(content: string, n: number): string[] {
  return content.split("\n").slice(-n);
}

/** Ruta real de los ficheros de log (out/err) del proceso, vía `pm2 jlist` — más fiable que parsear la salida de `pm2 logs --nostream`, que en la práctica (ver arriba) puede devolver solo su banner sin ningún log real bajo execSync/sin TTY. */
function readPm2LogFiles(appName: string): { out: string[]; err: string[] } | null {
  const jlistRaw = execSync("pm2 jlist", { encoding: "utf-8", timeout: 5000 });
  const processes = JSON.parse(jlistRaw) as Array<{
    name: string;
    pm2_env?: { pm_out_log_path?: string; pm_err_log_path?: string };
  }>;
  const proc = processes.find((p) => p.name === appName);
  if (!proc) return null;

  const outPath = proc.pm2_env?.pm_out_log_path;
  const errPath = proc.pm2_env?.pm_err_log_path;
  const out = outPath ? tailLines(readFileSync(outPath, "utf-8"), TAIL_LINES) : [];
  const err = errPath ? tailLines(readFileSync(errPath, "utf-8"), TAIL_LINES) : [];
  return { out, err };
}

export async function GET(req: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "admin") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const query = (url.searchParams.get("q") || "").trim();

    // Vía principal: leer los ficheros de log de PM2 directamente en disco.
    try {
      const files = readPm2LogFiles(PM2_APP_NAME);
      if (files) {
        const combined = [
          ...files.out.map((l) => `[out] ${l}`),
          ...files.err.map((l) => `[err] ${l}`),
        ].filter((l) => l.trim().length > `[out] `.length || l.trim().length > `[err] `.length);
        if (combined.length > 0) {
          const filtered = query
            ? combined.filter((l) => l.toLowerCase().includes(query.toLowerCase()))
            : combined;
          return Response.json({
            ok: true,
            source: `pm2:${PM2_APP_NAME}`,
            logs: filtered.slice(-TAIL_LINES),
          });
        }
      }
    } catch {
      // pm2 jlist no disponible, o proceso sin ficheros de log legibles
      // (permisos, PM2 no instalado, entorno de desarrollo) → seguir con
      // el fallback de abajo.
    }

    // Fallback: `pm2 logs --nostream` (funciona en la mayoría de entornos,
    // pero puede devolver solo el banner sin contenido bajo execSync — ver
    // comentario de cabecera; se deja como red de seguridad, no como vía
    // principal).
    try {
      const logs = execSync(
        `pm2 logs ${PM2_APP_NAME} --nostream --lines ${TAIL_LINES} 2>/dev/null || echo ''`,
        { encoding: "utf-8", timeout: 5000 },
      ).trim();

      if (logs) {
        const lines = logs.split("\n");
        const filtered = query
          ? lines.filter((l) => l.toLowerCase().includes(query.toLowerCase()))
          : lines;
        return Response.json({ ok: true, source: `pm2-cli:${PM2_APP_NAME}`, logs: filtered });
      }
    } catch {
      // PM2 no disponible, continuar
    }

    // Último fallback: archivo de log local (solo aplica en desarrollo).
    try {
      const logFile = path.join(process.cwd(), ".pm2", "smartbc.log");
      const logs = readFileSync(logFile, "utf-8");
      const lines = tailLines(logs, TAIL_LINES);

      return Response.json({
        ok: true,
        source: "file",
        logs: query ? lines.filter((l) => l.toLowerCase().includes(query.toLowerCase())) : lines,
      });
    } catch {
      // Archivo no existe
    }

    return Response.json({
      ok: true,
      source: "none",
      logs: ["No logs available. Running in development or logs not persisted to disk."],
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
