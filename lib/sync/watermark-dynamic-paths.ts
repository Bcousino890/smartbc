import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, readdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAdminClient } from "@/lib/db/admin";

// Variante de cleanDynamicWatermark que opera sobre una lista EXPLÍCITA de paths
// de storage (no acoplada a `properties`). La usan las inspos, cuyas fotos se
// re-alojan en `synced/inspo/{ref}/{pos}.webp` pero no tienen fila en properties.
//
// Mismo motor y mismas cautelas: necesita ≥8 fotos para estimar la marca, y si
// el engine no está disponible en el VPS hace no-op sin romper nada.

const BUCKET = "properties-photos";
const PYTHON = process.env.WMRM_PYTHON ?? "/opt/wmrm/bin/python";
const ENGINE = process.env.WMRM_DYNAMIC ?? "/opt/wmrm/wm_remove_dynamic.py";

export type CleanPathsResult =
  | { ok: true; cleaned: number }
  | { ok: false; error: string };

export async function cleanDynamicWatermarkPaths(
  paths: string[],
): Promise<CleanPathsResult> {
  if (paths.length < 8) {
    return { ok: false, error: "Se necesitan al menos 8 fotos en nuestro storage para estimar la marca." };
  }
  const supabase = createAdminClient();
  const storage = supabase.storage.from(BUCKET);

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "wmd-inspo-"));
    const inDir = join(dir, "in");
    const outDir = join(dir, "out");
    await mkdir(inDir, { recursive: true });
    await mkdir(outDir, { recursive: true });

    // 1) Descargar cada path al dir temporal. El nombre codifica el índice para
    // poder re-subir cada foto a su path original tras limpiarla.
    const indexToPath = new Map<number, string>();
    let n = 0;
    for (const path of paths) {
      const { data, error } = await storage.download(path);
      if (error || !data) continue;
      const buf = Buffer.from(await data.arrayBuffer());
      await writeFile(join(inDir, `${String(n).padStart(4, "0")}.webp`), buf);
      indexToPath.set(n, path);
      n++;
    }
    if (indexToPath.size < 8) {
      return { ok: false, error: "No hay suficientes fotos alojadas en nuestro storage (mín. 8)." };
    }

    // 2) Motor dinámico.
    await new Promise<void>((resolve, reject) => {
      const ps = spawn(PYTHON, [ENGINE, inDir, outDir], {
        stdio: "ignore",
        timeout: 180_000,
      });
      ps.on("error", reject);
      ps.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`wmd_exit_${code}`)),
      );
    });

    // 3) Re-subir las fotos limpias a su path original (upsert).
    const outFiles = await readdir(outDir);
    let cleaned = 0;
    for (const fn of outFiles) {
      const idx = parseInt(fn, 10);
      if (Number.isNaN(idx)) continue;
      const path = indexToPath.get(idx);
      if (!path) continue;
      const buf = await readFile(join(outDir, fn));
      const { error } = await storage.upload(path, buf, {
        contentType: "image/webp",
        upsert: true,
      });
      if (!error) cleaned++;
    }

    return { ok: true, cleaned };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "wmd_unknown_error",
    };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Deriva el path de storage a partir de una URL pública del bucket. Devuelve null
// si la URL no pertenece a nuestro bucket (p.ej. una foto que quedó con su URL de
// origen porque falló el re-alojado).
export function publicUrlToStoragePath(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length).split("?")[0];
  return path || null;
}
