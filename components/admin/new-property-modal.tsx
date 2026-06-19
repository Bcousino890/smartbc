"use client";

import { Check, ImagePlus, Loader2, Star, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createProperty,
  uploadPropertyPhoto,
} from "@/app/(admin)/admin/propiedades/actions";
import { Modal } from "@/components/ui/modal";
import { MADRID_ZONES } from "@/lib/mock-properties";
import { useT } from "@/lib/i18n/provider";
import type { Operation, StayType } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AgencyOption = { slug: string; name: string };

type Feedback = { kind: "idle" } | { kind: "error"; msg: string };

type StagedPhoto = { id: string; file: File; preview: string };

export function NewPropertyModal({
  open,
  onClose,
  agencies,
}: {
  open: boolean;
  onClose: () => void;
  agencies: AgencyOption[];
}) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });

  const [title, setTitle] = useState("");
  const [agencySlug, setAgencySlug] = useState<string>(agencies[0]?.slug ?? "");
  const [operation, setOperation] = useState<Operation>("alquiler");
  const [stayType, setStayType] = useState<StayType>("larga");
  const [zone, setZone] = useState<string>(MADRID_ZONES[0] ?? "");
  const [price, setPrice] = useState<number>(0);
  const [bedrooms, setBedrooms] = useState<number>(2);
  const [bathrooms, setBathrooms] = useState<number>(1);
  const [squareMeters, setSquareMeters] = useState<number>(0);
  const [externalReference, setExternalReference] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setAgencySlug(agencies[0]?.slug ?? "");
      setOperation("alquiler");
      setStayType("larga");
      setZone(MADRID_ZONES[0] ?? "");
      setPrice(0);
      setBedrooms(2);
      setBathrooms(1);
      setSquareMeters(0);
      setExternalReference("");
      setDescription("");
      setFeedback({ kind: "idle" });
      setUploadingPhotos(false);
      setDragActive(false);
      // Liberar los object URLs de las previsualizaciones para no filtrar memoria.
      setPhotos((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.preview));
        return [];
      });
    }
  }, [open, agencies]);

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      setFeedback({ kind: "error", msg: t("adminProps.new.photos.invalidType") });
      return;
    }
    setPhotos((prev) => [
      ...prev,
      ...images.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const canSubmit =
    title.trim().length > 0 && agencySlug.length > 0 && price > 0 && !isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setFeedback({ kind: "idle" });

    startTransition(async () => {
      const result = await createProperty({
        title: title.trim(),
        agencySlug,
        operation,
        stayType: operation === "alquiler" ? stayType : undefined,
        price,
        bedrooms,
        bathrooms,
        squareMeters: squareMeters || undefined,
        zone,
        description: description.trim() || undefined,
        externalReference: externalReference.trim() || undefined,
      });
      if (!result.ok) {
        setFeedback({ kind: "error", msg: humanError(t, result.error) });
        return;
      }

      // La propiedad ya existe: subimos las fotos con su slug. uploadPropertyPhoto
      // necesita el slug para resolver el property_id, por eso no se puede subir
      // antes de crearla. La primera foto se marca como portada (is_cover).
      let photoError = false;
      if (photos.length > 0) {
        setUploadingPhotos(true);
        for (let i = 0; i < photos.length; i++) {
          const fd = new FormData();
          fd.set("slug", result.slug);
          fd.set("file", photos[i].file);
          fd.set("isCover", i === 0 ? "true" : "false");
          const up = await uploadPropertyPhoto(fd);
          if (!up.ok) photoError = true;
        }
        setUploadingPhotos(false);
      }

      if (photoError) {
        // La propiedad se creó igualmente; dejamos el modal abierto avisando para
        // que el admin pueda reintentar las fotos restantes desde su ficha.
        setFeedback({ kind: "error", msg: t("adminProps.new.photos.uploadFailed") });
        router.refresh();
        return;
      }

      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      isPending={isPending}
      size="3xl"
      title={t("adminProps.new.title")}
      subtitle={t("adminProps.new.subtitle")}
    >
      <form onSubmit={handleSubmit}>
        <Section title={t("adminProps.new.section.basic")}>
          <Field label={t("adminProps.new.field.title")} required wide>
            <TextInput value={title} onChange={setTitle} autoFocus />
          </Field>
          <Field label={t("adminProps.new.field.agency")} required>
            {agencies.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
                {t("adminProps.new.error.noAgencies")}
              </p>
            ) : (
              <select
                value={agencySlug}
                onChange={(e) => setAgencySlug(e.target.value)}
                className="w-full appearance-none rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-[13px] text-ink focus:border-gold/55 focus:outline-none"
              >
                {agencies.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("adminProps.new.field.reference")}>
            <TextInput
              value={externalReference}
              onChange={setExternalReference}
              placeholder="LV-9876"
            />
          </Field>
        </Section>

        <Section title={t("adminProps.new.section.deal")}>
          <Field label={t("adminProps.new.field.operation")}>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value as Operation)}
              className="w-full appearance-none rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-[13px] text-ink focus:border-gold/55 focus:outline-none"
            >
              <option value="alquiler">{t("filters.operation.rent")}</option>
              <option value="venta">{t("filters.operation.sale")}</option>
            </select>
          </Field>
          {operation === "alquiler" && (
            <Field label={t("adminProps.new.field.stay")}>
              <select
                value={stayType}
                onChange={(e) => setStayType(e.target.value as StayType)}
                className="w-full appearance-none rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-[13px] text-ink focus:border-gold/55 focus:outline-none"
              >
                <option value="larga">{t("filters.stay.long")}</option>
                <option value="corta">{t("filters.stay.short")}</option>
              </select>
            </Field>
          )}
          <Field
            label={
              operation === "alquiler"
                ? t("adminProps.new.field.priceRent")
                : t("adminProps.new.field.priceSale")
            }
            required
          >
            <NumberInput value={price} onChange={setPrice} min={0} />
          </Field>
        </Section>

        <Section title={t("adminProps.new.section.layout")}>
          <Field label={t("adminProps.new.field.bedrooms")}>
            <NumberInput value={bedrooms} onChange={setBedrooms} min={0} />
          </Field>
          <Field label={t("adminProps.new.field.bathrooms")}>
            <NumberInput value={bathrooms} onChange={setBathrooms} min={0} />
          </Field>
          <Field label={t("adminProps.new.field.squareMeters")}>
            <NumberInput
              value={squareMeters}
              onChange={setSquareMeters}
              min={0}
            />
          </Field>
        </Section>

        <Section title={t("adminProps.new.section.location")}>
          <Field label={t("adminProps.new.field.zone")} wide>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="w-full appearance-none rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-[13px] text-ink focus:border-gold/55 focus:outline-none"
            >
              {MADRID_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title={t("adminProps.new.section.description")}>
          <Field label={t("adminProps.new.field.description")} wide>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-[13px] text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
              placeholder={t("adminProps.new.field.description.placeholder")}
            />
          </Field>
        </Section>

        <Section title={t("adminProps.new.section.photos")}>
          <div className="space-y-3 sm:col-span-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition",
                dragActive
                  ? "border-gold/60 bg-gold/5"
                  : "border-ink/15 bg-white/50 hover:border-gold/40",
              )}
            >
              <ImagePlus size={20} strokeWidth={1.75} className="text-gold-dark" />
              <span className="text-[12px] font-medium text-ink/70">
                {t("adminProps.new.photos.add")}
              </span>
              <span className="text-[11px] text-ink/45">
                {t("adminProps.new.photos.hint")}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {photos.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] text-ink/45">
                  {t("adminProps.new.photos.count", { n: photos.length })}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {photos.map((p, i) => (
                    <div
                      key={p.id}
                      className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-ink/10 bg-ink/5"
                    >
                      {/* Previsualización local (blob): <img> evita la optimización de next/image. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.preview}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      {i === 0 && (
                        <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-md bg-ink/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cream-50">
                          <Star size={9} strokeWidth={2} className="text-gold" />
                          {t("adminProps.new.photos.cover")}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(p.id)}
                        aria-label={t("adminProps.new.photos.remove")}
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/75"
                      >
                        <X size={12} strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        {feedback.kind === "error" && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
            {feedback.msg}
          </p>
        )}

        <footer className="mt-6 flex items-center justify-end gap-2.5 border-t border-gold/15 pt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-[13px] font-medium text-ink/70 transition hover:border-ink/30 hover:text-ink disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-cream-50 transition",
              "hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {isPending ? (
              <Loader2
                size={14}
                strokeWidth={1.75}
                className="animate-spin text-gold"
              />
            ) : (
              <Check size={14} strokeWidth={1.75} className="text-gold" />
            )}
            <span>
              {uploadingPhotos
                ? t("adminProps.new.photos.uploading")
                : isPending
                  ? t("adminProps.new.creating")
                  : t("adminProps.new.create")}
            </span>
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function humanError(t: (key: string) => string, code: string): string {
  const known: Record<string, string> = {
    title_required: t("adminProps.new.error.titleRequired"),
    slug_required: t("adminProps.new.error.slugRequired"),
    agency_not_found: t("adminProps.new.error.agencyNotFound"),
    forbidden_not_staff: t("adminProps.new.error.forbidden"),
    no_session: t("adminProps.new.error.noSession"),
  };
  return known[code] ?? `${t("adminProps.new.error.generic")} · ${code}`;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">
        {title}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  required,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  wide?: boolean;
}) {
  return (
    <label className={cn("block text-[12px] font-medium text-ink/65", wide && "sm:col-span-3")}>
      <span>
        {label}
        {required && <span className="ml-1 text-gold-dark">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      // biome-ignore lint/a11y/noAutofocus: campo principal del modal
      autoFocus={autoFocus}
      className="w-full rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-[13px] text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
    />
  );
}

function NumberInput({
  value,
  onChange,
  min,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <input
      type="number"
      min={min}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      className="w-full rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-[13px] text-ink focus:border-gold/55 focus:outline-none"
    />
  );
}
