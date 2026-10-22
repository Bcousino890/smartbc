import { NextResponse } from "next/server";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";

// SOLO DESARROLLO LOCAL (PR6, E7): las traducciones del gestor de prueba sobre
// el almacén en memoria (mismas reglas que 0226) con una IA FALSA que cuenta
// llamadas. La misma orquestación que las acciones reales
// (translation-service.ts); nunca una IA real. 404 fuera del modo fixtures.

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
  const { mem, ai, configure } = await fixtureTranslations();
  const json = (d: unknown) => NextResponse.json(d, { headers: { "Cache-Control": "no-store" } });
  try {
    switch (op.op) {
      case "ai":
        configure({ mode: op.mode, delayMs: op.delayMs });
        return json({ ok: true, calls: ai.calls() });
      case "calls":
        return json({ ok: true, calls: ai.calls(), jobs: mem.jobs.map((j) => ({ id: j.id, status: j.status, lang: j.lang, discarded: !!j.discardedAt, note: j.note })) });
      case "load":
        return json({ ok: true, panel: await svc.loadPanel(mem, op.catalogId, op.lang) });
      case "prepare": {
        const outcome = await svc.prepareItem(mem, { ai: ai.ai, timeoutMs: typeof op.timeoutMs === "number" ? op.timeoutMs : 20_000 }, { catalogId: op.catalogId, key: op.key, lang: op.lang, retry: op.retry === true });
        return json({ ok: true, outcome: outcome.kind, message: svc.prepareMessage(outcome) });
      }
      case "cancel":
        return json({ ok: true, changed: await mem.cancel(op.jobId) });
      case "save":
        await svc.saveReview(mem, op.catalogId, op.edit);
        return json({ ok: true });
      case "reject":
        return json({ ok: true, changed: await mem.reject(op.textId) });
      case "approve": {
        const version = await svc.approveItem(mem, op);
        notifyCatalogChanged();
        return json({ ok: true, version, fingerprint: null });
      }
      case "use": {
        const r = await svc.useApproved(mem, op.catalogId, op.lang, op.key);
        notifyCatalogChanged();
        return json({ ok: true, copied: r.copied, fingerprint: null });
      }
      case "remove": {
        const version = await mem.copyRemove(op.catalogId, op.key === svc.META_KEY ? null : op.key, op.lang);
        notifyCatalogChanged();
        return json({ ok: true, version, fingerprint: null });
      }
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
