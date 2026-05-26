"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Image as ImageIcon,
  Info,
  Loader2,
  Save,
  User,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateProperty } from "@/app/(admin)/admin/propiedades/actions";
import { PropertyPhotosModal } from "@/components/admin/property-photos-modal";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

type Photo = {
  url: string;
  alt: string | null;
  position: number;
  is_cover: boolean;
};

export type PropertyForEdit = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  operation: "rent" | "sale";
  stay: "short" | "long" | null;
  status: "available" | "reserved" | "sold" | "archived";
  price: number;
  bedrooms: number;
  bathrooms: number;
  square_meters: number | null;
  zone: string;
  address: string | null;
  features: string[];
  source: "manual" | "scrape" | "api";
  source_url: string | null;
  archived_at: string | null;
  cover_photo_url: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  internal_notes: string | null;
  agency: { id: string; name: string; slug: string } | null;
  photos: Photo[];
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saved"; at: number }
  | { kind: "error"; msg: string };

export function PropertyEditView({ property }: { property: PropertyForEdit }) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [photosOpen, setPhotosOpen] = useState(false);

  // Estado del form. Inicializamos con los valores actuales.
  const [title, setTitle] = useState(property.title);
  const [description, setDescription] = useState(property.description ?? "");
  const [price, setPrice] = useState(property.price);
  const [bedrooms, setBedrooms] = useState(property.bedrooms);
  const [bathrooms, setBathrooms] = useState(property.bathrooms);
  const [squareMeters, setSquareMeters] = useState<number | "">(
    property.square_meters ?? "",
  );
  const [zone, setZone] = useState(property.zone);
  const [address, setAddress] = useState(property.address ?? "");
  const [status, setStatus] = useState(property.status);
  const [ownerName, setOwnerName] = useState(property.owner_name ?? "");
  const [ownerPhone, setOwnerPhone] = useState(property.owner_phone ?? "");
  const [ownerEmail, setOwnerEmail] = useState(property.owner_email ?? "");
  const [internalNotes, setInternalNotes] = useState(
    property.internal_notes ?? "",
  );

  const isScraped = property.source === "scrape";
  const cover =
    property.cover_photo_url ??
    property.photos.find((p) => p.is_cover)?.url ??
    property.photos[0]?.url ??
    null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveState({ kind: "idle" });
    startTransition(async () => {
      const res = await updateProperty({
        slug: property.slug,
        title,
        description: description || null,
        price,
        bedrooms,
        bathrooms,
        squareMeters: squareMeters === "" ? null : Number(squareMeters),
        zone,
        address: address || null,
        status,
        ownerName: ownerName || null,
        ownerPhone: ownerPhone || null,
        ownerEmail: ownerEmail || null,
        internalNotes: internalNotes || null,
      });
      if (res.ok) {
        setSaveState({ kind: "saved", at: Date.now() });
        router.refresh();
      } else {
        setSaveState({ kind: "error", msg: res.error });
      }
    });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col px-6 pb-24 lg:px-10">
      {/* Cabecera */}
      <div className="flex items-center justify-between pt-7">
        <Link
          href="/admin/propiedades"
          className="inline-flex items-center gap-2 text-[12px] font-medium text-ink/65 transition hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          <span>{t("adminProps.detail.back")}</span>
        </Link>
        <span
          className={cn(
            "rounded-md border px-2.5 py-1 text-[11px] font-medium",
            isScraped
              ? "border-gold/35 bg-gold/10 text-gold-dark"
              : "border-ink/15 bg-ink/5 text-ink/65",
          )}
        >
          {isScraped
            ? t("adminProps.detail.sourceScrape", {
                agency: property.agency?.name ?? "—",
              })
            : t("adminProps.detail.sourceManual")}
        </span>
      </div>

      <header className="mt-4 flex items-start gap-5">
        <button
          type="button"
          onClick={() => setPhotosOpen(true)}
          className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg border border-gold/20 bg-cream-50 transition hover:border-gold/55"
          aria-label={t("adminProps.photos.manage")}
        >
          {cover ? (
            <Image
              src={cover}
              alt=""
              fill
              sizes="128px"
              className="object-cover"
            />
          ) : (
            <ImageIcon
              size={20}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-ink/40"
            />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-2xl font-medium leading-tight text-ink md:text-3xl">
            {property.title}
          </h1>
          <p className="mt-1 text-[12px] text-ink/55">
            {property.zone} · {property.bedrooms} hbt · {property.bathrooms} baños
            {property.square_meters ? ` · ${property.square_meters} m²` : ""}
            {property.source_url && (
              <>
                {" · "}
                <a
                  href={property.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-dark hover:underline"
                >
                  {t("adminProps.detail.viewOnAgency")}
                </a>
              </>
            )}
          </p>
        </div>
      </header>

      {/* Aviso para propiedades sindicadas */}
      {isScraped && (
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-gold/30 bg-gold/10 p-3.5 text-[12px] text-ink/80">
          <AlertTriangle
            size={16}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-gold-dark"
          />
          <span>{t("adminProps.detail.scrapedWarning")}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="mt-6 flex flex-col gap-6">
        {/* Datos básicos */}
        <Section
          icon={<Info size={15} strokeWidth={1.75} />}
          title={t("adminProps.detail.basicData")}
        >
          <Field label={t("adminProps.detail.title")}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className={inputClass}
            />
          </Field>
          <Field label={t("adminProps.detail.description")}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className={cn(inputClass, "resize-y")}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field
              label={
                property.operation === "rent"
                  ? t("adminProps.detail.priceRent")
                  : t("adminProps.detail.priceSale")
              }
            >
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                min={0}
                required
                className={inputClass}
              />
            </Field>
            <Field label={t("adminProps.detail.bedrooms")}>
              <input
                type="number"
                value={bedrooms}
                onChange={(e) => setBedrooms(Number(e.target.value))}
                min={0}
                className={inputClass}
              />
            </Field>
            <Field label={t("adminProps.detail.bathrooms")}>
              <input
                type="number"
                value={bathrooms}
                onChange={(e) => setBathrooms(Number(e.target.value))}
                min={0}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label={t("adminProps.detail.squareMeters")}>
              <input
                type="number"
                value={squareMeters}
                onChange={(e) =>
                  setSquareMeters(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                min={0}
                className={inputClass}
              />
            </Field>
            <Field label={t("adminProps.detail.zone")}>
              <input
                type="text"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
            <Field label={t("adminProps.detail.status")}>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(
                    e.target.value as PropertyForEdit["status"],
                  )
                }
                className={inputClass}
              >
                <option value="available">
                  {t("adminProps.status.available")}
                </option>
                <option value="reserved">
                  {t("adminProps.status.reserved")}
                </option>
                <option value="sold">{t("adminProps.status.sold")}</option>
                <option value="archived">
                  {t("adminProps.status.archived")}
                </option>
              </select>
            </Field>
          </div>
          <Field label={t("adminProps.detail.address")}>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
              placeholder={t("adminProps.detail.addressPlaceholder")}
            />
          </Field>
        </Section>

        {/* Info del dueño — NUNCA se sobrescribe por el sync */}
        <Section
          icon={<User size={15} strokeWidth={1.75} />}
          title={t("adminProps.detail.ownerSection")}
          subtitle={t("adminProps.detail.ownerSubtitle")}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label={t("adminProps.detail.ownerName")}>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className={inputClass}
                placeholder={t("adminProps.detail.ownerNamePh")}
              />
            </Field>
            <Field label={t("adminProps.detail.ownerPhone")}>
              <input
                type="tel"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                className={inputClass}
                placeholder="+34 ..."
              />
            </Field>
            <Field label={t("adminProps.detail.ownerEmail")}>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className={inputClass}
                placeholder="email@..."
              />
            </Field>
          </div>
          <Field label={t("adminProps.detail.internalNotes")}>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={4}
              className={cn(inputClass, "resize-y")}
              placeholder={t("adminProps.detail.internalNotesPh")}
            />
          </Field>
        </Section>

        {/* Fotos */}
        <Section
          icon={<ImageIcon size={15} strokeWidth={1.75} />}
          title={t("adminProps.detail.photosSection")}
        >
          <button
            type="button"
            onClick={() => setPhotosOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2 text-[12px] font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
          >
            <ImageIcon size={13} strokeWidth={1.75} className="text-gold" />
            <span>
              {t("adminProps.photos.action", {
                count: property.photos.length,
              })}
            </span>
          </button>
        </Section>

        {/* Barra inferior sticky con guardar */}
        <div className="sticky bottom-4 mt-2 flex items-center justify-between gap-3 rounded-xl border border-gold/25 bg-cream-50/95 px-4 py-3 shadow-[0_15px_40px_-20px_rgba(40,28,10,0.35)] backdrop-blur">
          <div className="text-[12px] text-ink/65">
            {saveState.kind === "saved" && (
              <span className="text-emerald-700">
                ✓ {t("adminProps.detail.saved")}
              </span>
            )}
            {saveState.kind === "error" && (
              <span className="text-rose-700">
                {t("adminProps.detail.errorSaving", { error: saveState.msg })}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-[12px] font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} strokeWidth={1.75} className="text-gold" />
            )}
            <span>{t("adminProps.detail.save")}</span>
          </button>
        </div>
      </form>

      <PropertyPhotosModal
        open={photosOpen}
        onClose={() => setPhotosOpen(false)}
        slug={property.slug}
        title={property.title}
        initialPhotos={property.photos.map((p) => ({
          url: p.url,
          isCover: p.is_cover,
        }))}
      />
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none";

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gold/15 bg-cream-50/80 p-5 shadow-[0_10px_30px_-20px_rgba(40,28,10,0.25)] md:p-6">
      <header className="flex items-start gap-2.5">
        <span className="mt-0.5 text-gold-dark">{icon}</span>
        <div>
          <h2 className="font-serif text-lg font-medium text-ink">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-ink/55">{subtitle}</p>
          )}
        </div>
      </header>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink/80">
      <span>{label}</span>
      {children}
    </label>
  );
}
