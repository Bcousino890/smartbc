"use client";

// SmartLink 2.0 · UI de revisión del story (no es un CMS: generar, leer la
// evidencia, editar, aprobar/rechazar bloques, resolver conflictos, publicar).

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, RefreshCw, ShieldAlert, X } from "lucide-react";
import { Button, Panel, Pill, TextArea, TextInput } from "@/components/admin/ui/primitives";
import { CHAPTER_HEADINGS, type StoryChapter } from "@/lib/services/story/types";
import {
  approveVersionAction,
  classifyPhotosAction,
  disableStoryAction,
  generateStoryAction,
  nextInQueueAction,
  probeVideosAction,
  regeneratePreludeAction,
  setBlockStatusAction,
  setPreludeStatusAction,
  updateBlockCopyAction,
  updatePreludeAction,
} from "./actions";

type Version = {
  id: string;
  status: string;
  model: string | null;
  provider: string | null;
  created_at: string;
  reviewed_at: string | null;
  prelude?: string | null;
  prelude_headline?: string | null;
  prelude_status?: string | null;
};
type Block = {
  id: string;
  chapter: StoryChapter;
  copy: string;
  status: string;
  confidence: number;
  claim_ids: string[];
};
type Claim = {
  id: string;
  source_text: string;
  category: string;
  fact: string;
  confidence: number;
  is_duplicate: boolean;
  conflict: boolean;
  conflict_reason: string | null;
};

export function StoryClient({
  country,
  slug,
  propertyId,
  propertyTitle,
  description,
  versions,
  blocks,
  claims,
  photos,
  videos,
  gate,
  fromQueue,
  bucket,
}: {
  country: string;
  slug: string;
  propertyId: string;
  propertyTitle: string;
  description: string;
  versions: Version[];
  blocks: Block[];
  claims: Claim[];
  photos: Array<{ id: string; ai_class: string | null; class_override: string | null }>;
  videos: Array<{ id: string; source: string | null; format: string | null; width: number | null; probed_at: string | null }>;
  gate?: { pass: boolean; failures: Array<{ code: string; label: string; blockIds: string[]; detail?: string }> } | null;
  fromQueue?: boolean;
  bucket?: string;
}) {
  const path = `/${country}/admin/propiedades/${slug}/story`;
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [preludeDraft, setPreludeDraft] = useState<string | null>(null);
  const [headlineDraft, setHeadlineDraft] = useState("");
  // Bloques señalados por el quality gate: se resaltan para que el agente sepa
  // exactamente cuál resolver sin leerse la story entera.
  const flaggedBlocks = new Map<string, string[]>();
  for (const f of gate?.failures ?? []) {
    for (const id of f.blockIds) {
      flaggedBlocks.set(id, [...(flaggedBlocks.get(id) ?? []), f.label + (f.detail ? ` (${f.detail})` : "")]);
    }
  }

  const goNext = () => {
    setMessage(null);
    startTransition(async () => {
      const url = await nextInQueueAction(country, bucket ?? "short", slug);
      if (url) window.location.href = url;
      else setMessage("No quedan más propiedades en este filtro de la cola.");
    });
  };

  const latest = versions[0] ?? null;
  const approvedVersion = versions.find((v) => v.status === "approved") ?? null;
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const conflictClaims = claims.filter((c) => c.conflict);
  const duplicateCount = claims.filter((c) => c.is_duplicate).length;
  const boilerplateCount = claims.filter((c) => c.category === "boilerplate").length;
  const classifiedPhotos = photos.filter((p) => p.ai_class || p.class_override).length;
  const probedVideos = videos.filter((v) => (v.width ?? 0) > 0 || v.probed_at).length;

  const run = (fn: () => Promise<{ ok?: boolean; error?: string } | unknown>) => {
    setMessage(null);
    startTransition(async () => {
      const res = (await fn()) as { ok?: boolean; error?: string } | null;
      if (res && res.ok === false && res.error) setMessage(res.error);
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={
            fromQueue
              ? `/${country}/admin/propiedades/story-review?bucket=${bucket ?? "short"}`
              : `/${country}/admin/propiedades/${slug}`
          }
          className="inline-flex items-center gap-1.5 text-sm text-ink/55 hover:text-ink"
        >
          <ArrowLeft size={14} /> {fromQueue ? "Volver a la cola" : "Volver a la propiedad"}
        </Link>
        <div className="flex items-center gap-2">
          <a
            href={`/compartir/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="crm-button inline-flex items-center gap-1.5 rounded-md border border-ink/15 bg-white px-3 py-2 text-ink/75 transition hover:border-gold/50"
          >
            Ver SmartLink
          </a>
          {fromQueue && (
            <Button variant="secondary" disabled={pending} onClick={goNext}>
              Siguiente →
            </Button>
          )}
        </div>
      </div>

      {/* Veredicto del quality gate — mismo módulo que el batch publisher. */}
      {gate && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            gate.pass
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {gate.pass ? (
            <span>✓ Supera el quality gate: se puede publicar.</span>
          ) : (
            <div>
              <p className="font-bold">Bloqueado por el quality gate:</p>
              <ul className="mt-1 space-y-0.5">
                {gate.failures.map((f) => (
                  <li key={f.code}>
                    · {f.label}
                    {f.detail ? ` — ${f.detail}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="crm-section-title text-ink">Story del SmartLink</h1>
          <p className="mt-1 text-sm text-ink/55">{propertyTitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {approvedVersion ? (
            <Pill tone="positive">Story publicado</Pill>
          ) : (
            <Pill tone="neutral">Sin story publicado · el SmartLink usa fallback</Pill>
          )}
        </div>
      </div>

      {message && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {message}
        </div>
      )}

      {/* Media intelligence: prerequisitos de foto→capítulo y hero-vídeo. */}
      <Panel title="Inteligencia de media" className="mt-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink/70">
          <span>
            Fotos clasificadas: <strong className="text-ink">{classifiedPhotos}/{photos.length}</strong>
          </span>
          <span>
            Vídeos con metadata: <strong className="text-ink">{probedVideos}/{videos.length}</strong>
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || photos.length === 0}
              onClick={() => run(() => classifyPhotosAction(propertyId, path))}
            >
              Clasificar fotos
            </Button>
            <Button
              size="sm"
              disabled={pending || videos.length === 0}
              onClick={() => run(() => probeVideosAction(propertyId, path))}
            >
              Analizar vídeos
            </Button>
          </div>
        </div>
      </Panel>

      {/* Generación */}
      <Panel title="Generación" className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-ink/60">
            El motor trocea la descripción en hechos con cita literal, descarta
            duplicados y marketing, bloquea contradicciones con la ficha y
            redacta capítulos de ≤70 palabras. Nada se publica sin tu aprobación.
          </p>
          <Button
            variant="primary"
            disabled={pending || !description.trim()}
            onClick={() => run(() => generateStoryAction(propertyId, path))}
          >
            <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
            {latest ? "Regenerar story" : "Generar story"}
          </Button>
        </div>
        {latest && (
          <p className="crm-meta mt-3 text-ink/45">
            Última versión: {new Date(latest.created_at).toLocaleString("es-ES")} ·{" "}
            {latest.provider ?? "?"}/{latest.model ?? "?"} · estado {latest.status} ·
            {" "}{duplicateCount} duplicados retirados · {boilerplateCount} frases de agencia descartadas
          </p>
        )}
      </Panel>

      {/* Conflictos */}
      {conflictClaims.length > 0 && (
        <Panel title="Conflictos con la ficha" className="mt-4">
          <ul className="space-y-2">
            {conflictClaims.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                <ShieldAlert size={15} className="mt-0.5 shrink-0 text-rose-600" />
                <span>
                  <span className="text-ink">{c.conflict_reason}</span>{" "}
                  <span className="crm-meta block text-ink/45">“{c.source_text}”</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="crm-meta mt-3 text-ink/55">
            Los campos de la ficha mandan. El bloque afectado no se publica hasta
            que lo resuelvas (edita su texto o recházalo).
          </p>
        </Panel>
      )}

      {/* Bloques */}
      {blocks.length > 0 && latest && (
        <Panel
          title={`Bloques (${blocks.filter((b) => b.status === "approved").length}/${blocks.length} aprobados)`}
          className="mt-4"
          action={
            latest.status !== "approved" ? (
              <Button
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => approveVersionAction(latest.id, path))}
              >
                Publicar story
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => disableStoryAction(propertyId, path))}
              >
                Desactivar story
              </Button>
            )
          }
        >
          {/* PROPERTY PRELUDE · apertura editorial. Vive fuera de los gates:
              se edita, aprueba o regenera sin tocar la story. */}
          {latest && (
          <div className="mb-5 rounded-lg border border-gold/30 bg-gold/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="crm-label-sm text-gold-dark">Prelude · apertura editorial</p>
              <div className="flex items-center gap-1.5">
                <Pill tone={latest.prelude_status === "approved" ? "positive" : latest.prelude_status === "rejected" ? "neutral" : latest.prelude_status ? "info" : "neutral"}>
                  {latest.prelude_status ?? "sin prelude"}
                </Pill>
                {latest.prelude && latest.prelude_status !== "approved" && (
                  <Button size="sm" disabled={pending}
                    onClick={() => run(() => setPreludeStatusAction(latest.id, "approved", path))}>
                    Aprobar
                  </Button>
                )}
                {latest.prelude && latest.prelude_status !== "rejected" && (
                  <Button size="sm" disabled={pending}
                    onClick={() => run(() => setPreludeStatusAction(latest.id, "rejected", path))}>
                    Rechazar
                  </Button>
                )}
                <Button size="sm" disabled={pending}
                  onClick={() => run(() => regeneratePreludeAction(latest.id, path))}>
                  {latest.prelude ? "Regenerar" : "Generar"}
                </Button>
              </div>
            </div>
            {preludeDraft !== null ? (
              <div className="mt-3 space-y-2">
                <TextInput
                  value={headlineDraft}
                  onChange={(e) => setHeadlineDraft(e.target.value)}
                  placeholder="Titular editorial (4-10 palabras, sin punto final)"
                />
                <TextArea
                  value={preludeDraft}
                  onChange={(e) => setPreludeDraft(e.target.value)}
                  rows={6}
                  placeholder="Dos párrafos separados por una línea en blanco."
                />
                <div className="flex gap-2">
                  <Button size="sm" disabled={pending}
                    onClick={() => run(async () => { const r = await updatePreludeAction(latest.id, preludeDraft, headlineDraft, path); if (r.ok) setPreludeDraft(null); return r; })}>
                    Guardar
                  </Button>
                  <Button size="sm" disabled={pending} onClick={() => setPreludeDraft(null)}>Cancelar</Button>
                </div>
              </div>
            ) : latest.prelude ? (
              <div
                className="mt-2 cursor-pointer"
                onClick={() => { setPreludeDraft(latest.prelude ?? ""); setHeadlineDraft(latest.prelude_headline ?? ""); }}
                title="Pulsa para editar"
              >
                {latest.prelude_headline ? (
                  <p className="crm-section-title text-ink">{latest.prelude_headline}</p>
                ) : (
                  <p className="text-xs italic text-ink/45">Sin titular (regenera para componer el spread completo)</p>
                )}
                <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-ink/80">
                  {(latest.prelude ?? "").split(/\n+/).filter(Boolean).map((par, i) => (
                    <p key={i}>{par}</p>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink/45">
                Sin apertura editorial. Con evidencia suficiente, «Generar» compone una desde los claims seguros.
              </p>
            )}
          </div>
          )}

          <div className="space-y-4">
            {blocks.map((b) => {
              const evidence = b.claim_ids
                .map((id) => claimById.get(id))
                .filter(Boolean) as Claim[];
              const draft = editing[b.id];
              return (
                <div
                  key={b.id}
                  className={`rounded-lg border p-4 ${
                    b.status === "conflict"
                      ? "border-rose-200 bg-rose-50/50"
                      : b.status === "approved"
                        ? "border-emerald-200 bg-emerald-50/40"
                        : b.status === "rejected"
                          ? "border-ink/10 bg-ink/[0.03] opacity-60"
                          : "border-ink/10 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="crm-label-sm text-ink/60">
                      {CHAPTER_HEADINGS[b.chapter]}
                      {flaggedBlocks.has(b.id) && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                          ⚠ {flaggedBlocks.get(b.id)!.join(" · ")}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Pill
                        tone={
                          b.status === "approved"
                            ? "positive"
                            : b.status === "conflict"
                              ? "critical"
                              : b.status === "rejected"
                                ? "neutral"
                                : "info"
                        }
                      >
                        {b.status === "generated" ? "pendiente" : b.status}
                      </Pill>
                      {b.status !== "approved" && (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => run(() => setBlockStatusAction(b.id, "approved", path))}
                          aria-label="Aprobar bloque"
                        >
                          <Check size={13} />
                        </Button>
                      )}
                      {b.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => run(() => setBlockStatusAction(b.id, "rejected", path))}
                          aria-label="Rechazar bloque"
                        >
                          <X size={13} />
                        </Button>
                      )}
                    </div>
                  </div>

                  {draft != null ? (
                    <div className="mt-2">
                      <TextArea
                        rows={3}
                        value={draft}
                        onChange={(e) =>
                          setEditing((s) => ({ ...s, [b.id]: e.target.value }))
                        }
                      />
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={pending}
                          onClick={() =>
                            run(async () => {
                              const res = await updateBlockCopyAction(b.id, draft, path);
                              if (res.ok) setEditing((s) => {
                                const next = { ...s };
                                delete next[b.id];
                                return next;
                              });
                              return res;
                            })
                          }
                        >
                          Guardar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setEditing((s) => {
                              const next = { ...s };
                              delete next[b.id];
                              return next;
                            })
                          }
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className="mt-2 cursor-text text-sm leading-relaxed text-ink/80"
                      onClick={() => setEditing((s) => ({ ...s, [b.id]: b.copy }))}
                      title="Clic para editar"
                    >
                      {b.copy || (
                        <span className="italic text-ink/40">
                          (sin texto publicable — bloque en conflicto)
                        </span>
                      )}
                    </p>
                  )}

                  {evidence.length > 0 && (
                    <details className="mt-2">
                      <summary className="crm-meta cursor-pointer text-ink/45">
                        Evidencia ({evidence.length})
                      </summary>
                      <ul className="mt-1.5 space-y-1">
                        {evidence.map((c) => (
                          <li key={c.id} className="crm-meta text-ink/55">
                            “{c.source_text}”
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
          <p className="crm-meta mt-4 text-ink/45">
            Vista previa:{" "}
            <a
              href={`/compartir/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold-dark hover:underline"
            >
              abrir SmartLink ↗
            </a>
          </p>
        </Panel>
      )}
    </div>
  );
}
