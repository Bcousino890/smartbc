"use client";

import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import {
  deleteFurnishingImage,
  reorderFurnishingImages,
  saveFurnishingProposal,
  updateFurnishingImage,
  type UploadFurnishingResult,
} from "@/app/(admin)/admin/propiedades/furnishing-actions";
import { FurnishingViewer } from "@/components/furnishing/furnishing-viewer";
import {
  DEFAULT_FURNISHING_TEXTS,
  FURNISHING_ROOM_OPTIONS,
  pairByFileNumber,
  resolveTexts,
  suggestFromFileName,
  toViewerImages,
  type FurnishingImageRow,
  type FurnishingProposalRow,
} from "@/lib/furnishing/proposal";
import { postUploadForm } from "@/lib/http/upload-form";
import { isOptimizableSrc } from "@/lib/images/optimizable-src";
import { cn } from "@/lib/utils";

// Sección «Propuesta amueblada» de la ficha de la propiedad. Vive dentro del
// <form> de la ficha: todos los botones son type="button" y Enter en sus
// campos no envía el formulario de la propiedad.

const inputClass =
  "w-full rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none";
const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink disabled:opacity-50";
const ACCEPT = "image/jpeg,image/png,image/webp";
const ROOMS_LIST_ID = "furnishing-room-options";

type Draft = { label: string; room: string; compare: boolean };

type BulkPlan = ReturnType<typeof pairByFileNumber<File>> & {
  meta: Draft[];
};

export function PropertyFurnishingPanel({
  slug,
  country,
  previewHref,
  initialProposal,
  initialImages,
}: {
  slug: string;
  country: string;
  /** Página del cliente (/compartir/…/propuesta) — solo responde si está publicada. */
  previewHref: string;
  initialProposal: FurnishingProposalRow | null;
  initialImages: FurnishingImageRow[];
}) {
  const [images, setImages] = useState<FurnishingImageRow[]>(initialImages);
  const [proposal, setProposal] = useState<FurnishingProposalRow | null>(initialProposal);
  const [texts, setTexts] = useState({
    headline: initialProposal?.headline ?? "",
    subtitle: initialProposal?.subtitle ?? "",
    disclaimer: initialProposal?.disclaimer ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  // Alta de una pareja.
  const [single, setSingle] = useState<{ after: File | null; before: File | null } & Draft>({
    after: null,
    before: null,
    label: "",
    room: "",
    compare: true,
  });
  const afterRef = useRef<HTMLInputElement>(null);
  const beforeRef = useRef<HTMLInputElement>(null);

  // Carga múltiple.
  const [bulkAfters, setBulkAfters] = useState<File[]>([]);
  const [bulkBefores, setBulkBefores] = useState<File[]>([]);
  const [bulk, setBulk] = useState<BulkPlan | null>(null);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const bulkAfterRef = useRef<HTMLInputElement>(null);
  const bulkBeforeRef = useRef<HTMLInputElement>(null);

  const published = proposal?.status === "published";
  const viewerImages = useMemo(() => toViewerImages(images), [images]);

  const swallowEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
  };

  async function upload(after: File, before: File | null, meta: Draft): Promise<string | null> {
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("country", country);
    fd.set("after", after);
    if (before) fd.set("before", before);
    fd.set("label", meta.label);
    fd.set("room", meta.room);
    fd.set("compare", String(meta.compare && !!before));
    const res = await postUploadForm<UploadFurnishingResult>("/api/admin/properties/upload/furnishing", fd);
    if (!res.ok) return res.error;
    setImages((prev) => [...prev, res.item]);
    return null;
  }

  async function handleSingle() {
    if (!single.after) return setError("Elige la imagen de la propuesta (después).");
    setError(null);
    setBusy("single");
    try {
      const err = await upload(single.after, single.before, single);
      if (err) setError(err);
      else {
        setSingle({ after: null, before: null, label: "", room: "", compare: true });
        if (afterRef.current) afterRef.current.value = "";
        if (beforeRef.current) beforeRef.current.value = "";
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la pareja.");
    } finally {
      setBusy(null);
    }
  }

  function pickSingleAfter(file: File | null) {
    setSingle((s) => {
      if (!file) return { ...s, after: null };
      // Sugerencia a partir del nombre solo si la persona aún no escribió nada.
      const sug = suggestFromFileName(file.name);
      return {
        ...s,
        after: file,
        label: s.label || sug.label,
        room: s.room || sug.room,
        compare: s.label || s.room ? s.compare : sug.compare,
      };
    });
  }

  function planBulk(afters: File[], befores: File[]) {
    if (!afters.length) return setBulk(null);
    const plan = pairByFileNumber(afters, befores);
    setBulk({ ...plan, meta: plan.pairs.map((p) => suggestFromFileName(p.after.name)) });
  }

  async function runBulk() {
    if (!bulk) return;
    setError(null);
    setBusy("bulk");
    try {
      for (const [i, pair] of bulk.pairs.entries()) {
        setBulkProgress(`Subiendo ${i + 1} de ${bulk.pairs.length}…`);
        const err = await upload(pair.after, pair.before, bulk.meta[i]);
        if (err) {
          setError(`${pair.after.name}: ${err}`);
          // Quitar del plan lo que ya subió, para poder reintentar el resto.
          setBulk((b) => (b ? { ...b, pairs: b.pairs.slice(i), meta: b.meta.slice(i) } : b));
          return;
        }
      }
      setBulk(null);
      setBulkAfters([]);
      setBulkBefores([]);
      if (bulkAfterRef.current) bulkAfterRef.current.value = "";
      if (bulkBeforeRef.current) bulkBeforeRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la carga.");
    } finally {
      setBulkProgress(null);
      setBusy(null);
    }
  }

  async function saveRow(img: FurnishingImageRow) {
    const d = drafts[img.id];
    if (!d) return;
    setError(null);
    setBusy(img.id);
    const res = await updateFurnishingImage(slug, img.id, d, country);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setImages((prev) => prev.map((p) => (p.id === img.id ? { ...p, ...d } : p)));
    setDrafts(({ [img.id]: _, ...rest }) => rest);
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= images.length) return;
    const next = images.slice();
    [next[index], next[target]] = [next[target], next[index]];
    const ordered = next.map((p, i) => ({ ...p, position: i }));
    setError(null);
    setBusy("order");
    const res = await reorderFurnishingImages(slug, ordered.map((p) => p.id), country);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setImages(ordered);
  }

  async function remove(img: FurnishingImageRow) {
    if (!window.confirm(`¿Eliminar «${img.label}» de la propuesta?`)) return;
    setError(null);
    setBusy(img.id);
    const res = await deleteFurnishingImage(slug, img.id, country);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setImages((prev) => prev.filter((p) => p.id !== img.id));
  }

  async function saveProposal(status: "draft" | "published") {
    setError(null);
    setBusy("proposal");
    const res = await saveFurnishingProposal(slug, { status, ...texts }, country);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setProposal(res.proposal);
  }

  const thumb = (url: string | null, alt: string) =>
    url ? (
      <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md border border-ink/10 bg-ink/5">
        <Image src={url} alt={alt} fill sizes="80px" className="object-cover" unoptimized={!isOptimizableSrc(url)} />
      </div>
    ) : (
      <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-ink/15 text-[10px] text-ink/40">
        Sin antes
      </div>
    );

  return (
    <div onKeyDown={swallowEnter} className="flex flex-col gap-5">
      <datalist id={ROOMS_LIST_ID}>
        {FURNISHING_ROOM_OPTIONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {/* Estado y acceso del cliente */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium",
            published ? "border-emerald-600/30 bg-emerald-50 text-emerald-800" : "border-ink/15 bg-white text-ink/60",
          )}
        >
          {published ? "Publicada en el enlace compartido" : "Borrador · el cliente no la ve"}
        </span>
        <button
          type="button"
          className={buttonClass}
          disabled={busy !== null || (!published && images.length === 0)}
          onClick={() => saveProposal(published ? "draft" : "published")}
          title={!published && images.length === 0 ? "Añade al menos una imagen" : undefined}
        >
          {busy === "proposal" ? <Loader2 size={13} className="animate-spin" /> : published ? <EyeOff size={13} /> : <Eye size={13} />}
          {published ? "Retirar del enlace" : "Publicar en el enlace"}
        </button>
        {published && (
          <a href={previewHref} target="_blank" rel="noopener noreferrer" className={buttonClass}>
            <ExternalLink size={13} strokeWidth={1.75} />
            Ver como cliente
          </a>
        )}
        {images.length > 0 && (
          <button type="button" className={buttonClass} onClick={() => setShowPreview((v) => !v)}>
            <Eye size={13} strokeWidth={1.75} />
            {showPreview ? "Ocultar vista previa" : "Vista previa"}
          </button>
        )}
      </div>
      <p className="-mt-3 text-xs text-ink/45">
        Publicada, la ficha compartida (/compartir y los SmartLinks) muestra «Ver propuesta amueblada». Precio, zona y
        superficies salen de esta ficha.
      </p>

      {error && <p className="text-xs text-rose-700">{error}</p>}

      {showPreview && images.length > 0 && (
        <FurnishingViewer
          variant="embedded"
          images={viewerImages}
          texts={resolveTexts(proposal)}
          reference={null}
        />
      )}

      {/* Imágenes cargadas */}
      {images.length > 0 && (
        <ol className="flex flex-col gap-2">
          {images.map((img, i) => {
            const d = drafts[img.id] ?? { label: img.label, room: img.room, compare: img.compare };
            const dirty = !!drafts[img.id];
            const setD = (patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [img.id]: { ...d, ...patch } }));
            return (
              <li
                key={img.id}
                className="flex flex-col gap-3 rounded-xl border border-ink/10 bg-white/70 p-3 md:flex-row md:items-center"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 text-xs tabular-nums text-ink/45">{String(i + 1).padStart(2, "0")}</span>
                  {thumb(img.before_url, "Fotografía actual")}
                  {thumb(img.after_url, "Propuesta")}
                </div>
                <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-[1.4fr_1fr_auto]">
                  <input
                    value={d.label}
                    onChange={(e) => setD({ label: e.target.value })}
                    className={inputClass}
                    aria-label="Nombre de la imagen"
                  />
                  <input
                    value={d.room}
                    list={ROOMS_LIST_ID}
                    onChange={(e) => setD({ room: e.target.value })}
                    className={inputClass}
                    aria-label="Estancia"
                  />
                  <label
                    className={cn("flex items-center gap-2 text-xs text-ink/70", !img.before_url && "opacity-50")}
                    title={img.before_url ? undefined : "Sin fotografía actual no se puede comparar"}
                  >
                    <input
                      type="checkbox"
                      checked={d.compare && !!img.before_url}
                      disabled={!img.before_url}
                      onChange={(e) => setD({ compare: e.target.checked })}
                    />
                    Comparar
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  {dirty && (
                    <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => saveRow(img)}>
                      {busy === img.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      Guardar
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink disabled:opacity-30"
                    disabled={i === 0 || busy !== null}
                    onClick={() => move(i, -1)}
                    aria-label="Subir"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink disabled:opacity-30"
                    disabled={i === images.length - 1 || busy !== null}
                    onClick={() => move(i, 1)}
                    aria-label="Bajar"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-ink/50 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30"
                    disabled={busy !== null}
                    onClick={() => remove(img)}
                    aria-label="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {images.length === 0 && (
        <p className="text-xs text-ink/45">
          Sin propuesta aún. Sube cada imagen amueblada con la fotografía actual de la misma toma, o carga varias a la vez.
        </p>
      )}

      {/* Añadir una pareja */}
      <div className="rounded-xl border border-gold/15 bg-white/60 p-4">
        <p className="crm-label text-ink/70">Añadir una imagen</p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-ink/60">
            Propuesta (después) · obligatoria
            <input
              ref={afterRef}
              type="file"
              accept={ACCEPT}
              className="mt-1 block w-full text-xs"
              onChange={(e) => pickSingleAfter(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="text-xs text-ink/60">
            Fotografía actual (antes) · misma toma
            <input
              ref={beforeRef}
              type="file"
              accept={ACCEPT}
              className="mt-1 block w-full text-xs"
              onChange={(e) => setSingle((s) => ({ ...s, before: e.target.files?.[0] ?? null }))}
            />
          </label>
          <input
            placeholder="Nombre (p. ej. Salón · vista hacia el ventanal)"
            value={single.label}
            onChange={(e) => setSingle((s) => ({ ...s, label: e.target.value }))}
            className={inputClass}
          />
          <input
            placeholder="Estancia (p. ej. Dormitorios)"
            value={single.room}
            list={ROOMS_LIST_ID}
            onChange={(e) => setSingle((s) => ({ ...s, room: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className={cn("flex items-center gap-2 text-xs text-ink/70", !single.before && "opacity-50")}>
            <input
              type="checkbox"
              checked={single.compare && !!single.before}
              disabled={!single.before}
              onChange={(e) => setSingle((s) => ({ ...s, compare: e.target.checked }))}
            />
            Permitir comparar (deslizador y vista doble)
          </label>
          <button type="button" className={buttonClass} disabled={busy !== null || !single.after} onClick={handleSingle}>
            {busy === "single" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} strokeWidth={1.75} />}
            Añadir
          </button>
        </div>
      </div>

      {/* Carga múltiple */}
      <div className="rounded-xl border border-gold/15 bg-white/60 p-4">
        <p className="crm-label text-ink/70">Cargar varias a la vez</p>
        <p className="mt-1 text-xs text-ink/45">
          Se emparejan por el número de la toma en el nombre («01_salon.png» con «01.jpg» o «antes-01.jpg»). Revisa la lista antes de
          subir: lo que se guarda es cada pareja, no el nombre del archivo.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-ink/60">
            Propuestas (después)
            <input
              ref={bulkAfterRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="mt-1 block w-full text-xs"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setBulkAfters(files);
                planBulk(files, bulkBefores);
              }}
            />
          </label>
          <label className="text-xs text-ink/60">
            Fotografías actuales (antes)
            <input
              ref={bulkBeforeRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="mt-1 block w-full text-xs"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setBulkBefores(files);
                planBulk(bulkAfters, files);
              }}
            />
          </label>
        </div>

        {bulk && (
          <div className="mt-4">
            <div className="max-h-96 overflow-auto rounded-lg border border-ink/10">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-cream-50 text-ink/55">
                  <tr>
                    <th className="px-2 py-1.5">Nº</th>
                    <th className="px-2 py-1.5">Después · antes</th>
                    <th className="px-2 py-1.5">Nombre</th>
                    <th className="px-2 py-1.5">Estancia</th>
                    <th className="px-2 py-1.5">Comparar</th>
                  </tr>
                </thead>
                <tbody>
                  {bulk.pairs.map((p, i) => {
                    const m = bulk.meta[i];
                    const setM = (patch: Partial<Draft>) =>
                      setBulk((b) => (b ? { ...b, meta: b.meta.map((x, j) => (j === i ? { ...x, ...patch } : x)) } : b));
                    return (
                      <tr key={p.after.name} className="border-t border-ink/5">
                        <td className="px-2 py-1.5 tabular-nums">{String(p.number).padStart(2, "0")}</td>
                        <td className="px-2 py-1.5 text-ink/60">
                          {p.after.name}
                          <br />
                          {p.before ? p.before.name : <span className="text-amber-700">sin antes</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={m.label} onChange={(e) => setM({ label: e.target.value })} className={inputClass} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={m.room}
                            list={ROOMS_LIST_ID}
                            onChange={(e) => setM({ room: e.target.value })}
                            className={inputClass}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={m.compare && !!p.before}
                            disabled={!p.before}
                            onChange={(e) => setM({ compare: e.target.checked })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(bulk.unmatchedBefores.length > 0 || bulk.unnumbered.length > 0 || bulk.duplicates.length > 0) && (
              <p className="mt-2 text-xs text-amber-700">
                No se subirán:{" "}
                {[...bulk.unmatchedBefores, ...bulk.unnumbered, ...bulk.duplicates].map((f) => f.name).join(", ")}
              </p>
            )}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={busy !== null || bulk.pairs.length === 0}
                onClick={runBulk}
              >
                {busy === "bulk" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} strokeWidth={1.75} />}
                Subir {bulk.pairs.length} {bulk.pairs.length === 1 ? "imagen" : "imágenes"}
              </button>
              {bulkProgress && <span className="text-xs text-ink/55">{bulkProgress}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Textos del visor */}
      <div className="rounded-xl border border-gold/15 bg-white/60 p-4">
        <p className="crm-label text-ink/70">Textos del visor</p>
        <p className="mt-1 text-xs text-ink/45">Vacío = texto por defecto.</p>
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={texts.headline}
            placeholder={DEFAULT_FURNISHING_TEXTS.headline}
            onChange={(e) => setTexts((t) => ({ ...t, headline: e.target.value }))}
            className={inputClass}
            aria-label="Titular"
          />
          <input
            value={texts.subtitle}
            placeholder={DEFAULT_FURNISHING_TEXTS.subtitle}
            onChange={(e) => setTexts((t) => ({ ...t, subtitle: e.target.value }))}
            className={inputClass}
            aria-label="Subtítulo"
          />
          <input
            value={texts.disclaimer}
            placeholder={DEFAULT_FURNISHING_TEXTS.disclaimer}
            onChange={(e) => setTexts((t) => ({ ...t, disclaimer: e.target.value }))}
            className={inputClass}
            aria-label="Aviso de propuesta virtual"
          />
        </div>
        <button
          type="button"
          className={cn(buttonClass, "mt-3")}
          disabled={busy !== null}
          onClick={() => saveProposal(proposal?.status ?? "draft")}
        >
          {busy === "proposal" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Guardar textos
        </button>
      </div>
    </div>
  );
}
