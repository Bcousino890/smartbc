import { NextResponse } from "next/server";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";

// SOLO DESARROLLO LOCAL (PR6/0228, E7): las traducciones del gestor de prueba
// sobre el almacén en memoria (mismas reglas que 0226/0228) con una IA FALSA
// que cuenta llamadas. La misma orquestación que las acciones reales
// (translation-service.ts y el traductor automático); nunca una IA real.
// 404 fuera del modo fixtures.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isCatalogFixtureMode()) return new NextResponse("not_found", { status: 404 });
  const host = req.headers.get("host") ?? "";
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return new NextResponse("forbidden", { status: 403 });
  const op = await req.json().catch(() => null);
  if (!op || typeof op.op !== "string") return NextResponse.json({ error: "bad_op" }, { status: 400 });
  const { fixtureTranslations } = await import("@/lib/catalogs/fixture-store");
  const svc = await import("@/lib/catalogs/translation-service");
  const { notifyCatalogChanged } = await import("@/lib/catalogs/sync-hub-instance");
  const { autoTranslator } = await import("@/lib/catalogs/auto-translate-instance");
  const { mem, ai, configure } = await fixtureTranslations();
  const json = (d: unknown) => NextResponse.json(d, { headers: { "Cache-Control": "no-store" } });
  try {
    switch (op.op) {
      case "ai":
        configure({ mode: op.mode, delayMs: op.delayMs });
        return json({ ok: true, calls: ai.calls() });
      case "calls":
        return json({ ok: true, calls: ai.calls(), jobs: mem.jobs.map((j) => ({ id: j.id, status: j.status, lang: j.lang, auto: j.auto, discarded: !!j.discardedAt, note: j.note })) });
      case "idle":
        await autoTranslator().whenIdle();
        return json({ ok: true, calls: ai.calls() });
      case "load":
        return json({ ok: true, panel: await svc.loadPanel(mem, op.catalogId, op.lang) });
      case "prepare-now": {
        await svc.loadPanel(mem, op.catalogId, op.lang);
        void autoTranslator().run({ catalogId: op.catalogId, ownerId: "fixture-owner", lang: op.lang }, { manual: true });
        return json({ ok: true, started: true });
      }
      case "save": {
        const version = await svc.saveAndPublish(mem, op.catalogId, op.edit);
        notifyCatalogChanged();
        return json({ ok: true, version: version ?? 0, fingerprint: null });
      }
      case "reviewed":
        return json({ ok: true, changed: await svc.markItemReviewed(mem, op.catalogId, op.key, op.lang) });
      case "cat-lang": {
        const version = await svc.setLanguage(mem, op.catalogId, null, op.lang);
        notifyCatalogChanged();
        return json({ ok: true, version, fingerprint: null });
      }
      case "link-lang": {
        const version = await svc.setLanguage(mem, op.catalogId, op.linkId, op.lang ?? null);
        notifyCatalogChanged();
        return json({ ok: true, version, fingerprint: null });
      }
      default:
        return NextResponse.json({ ok: false, error: "bad_op" }, { status: 400 });
    }
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : "error" });
  }
}
