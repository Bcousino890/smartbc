"use client";

import { Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deletePropertyPhoto,
  uploadPropertyPhoto,
} from "@/app/(admin)/admin/propiedades/actions";
import { Modal } from "@/components/ui/modal";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export type PropertyPhoto = { url: string; isCover: boolean };

export function PropertyPhotosModal({
  open,
  onClose,
  slug,
  title,
  initialPhotos,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  title: string;
  initialPhotos: PropertyPhoto[];
}) {
  const t = useT();
  const router = useRouter();
  const [photos, setPhotos] = useState<PropertyPhoto[]>(initialPhotos);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const hasCover = photos.some((p) => p.isCover);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);

    startTransition(async () => {
      // Subimos en serie: cada upload depende del estado de cover anterior
      // y queremos detectar el primer error sin condiciones de carrera.
      let coverAssigned = hasCover;
      for (const file of files) {
        const formData = new FormData();
        formData.set("slug", slug);
        formData.set("file", file);
        formData.set("isCover", String(!coverAssigned));

        const result = await uploadPropertyPhoto(formData);
        if (result.ok) {
          const isCover = !coverAssigned;
          coverAssigned = coverAssigned || isCover;
          setPhotos((prev) => [...prev, { url: result.url, isCover }]);
        } else {
          setError(result.error);
          break;
        }
      }
      router.refresh();
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  const handleDelete = (url: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("adminProps.photos.deleteConfirm"))
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deletePropertyPhoto({ slug, photoUrl: url });
      if (result.ok) {
        setPhotos((prev) => prev.filter((p) => p.url !== url));
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      isPending={isPending}
      size="3xl"
      title={t("adminProps.photos.title")}
      subtitle={title}
    >
      <div className="mt-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            disabled={isPending}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isPending}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gold/30 bg-white/55 px-4 py-6 text-sm font-medium text-ink/70 transition",
              "hover:border-gold/55 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {isPending ? (
              <Loader2 size={16} strokeWidth={1.75} className="animate-spin text-gold" />
            ) : (
              <Upload size={16} strokeWidth={1.75} className="text-gold" />
            )}
            <span>
              {isPending
                ? t("adminProps.photos.uploading")
                : t("adminProps.photos.uploadAction")}
            </span>
          </button>
          <p className="mt-2 text-[11px] text-ink/45">
            {t("adminProps.photos.uploadHint")}
          </p>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6">
          {photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gold/15 bg-white/40 px-4 py-10 text-center">
              <ImageIcon
                size={28}
                strokeWidth={1.5}
                className="text-ink/30"
              />
              <p className="mt-2 text-sm text-ink/55">
                {t("adminProps.photos.empty")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo) => (
                <PhotoCard
                  key={photo.url}
                  photo={photo}
                  onDelete={() => handleDelete(photo.url)}
                  isPending={isPending}
                />
              ))}
            </div>
          )}
        </div>
    </Modal>
  );
}

function PhotoCard({
  photo,
  onDelete,
  isPending,
}: {
  photo: PropertyPhoto;
  onDelete: () => void;
  isPending: boolean;
}) {
  const t = useT();
  return (
    <div className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-gold/15 bg-cream-100">
      <Image
        src={photo.url}
        alt=""
        fill
        sizes="(max-width: 640px) 50vw, 33vw"
        className="object-cover"
      />
      {photo.isCover && (
        <span className="absolute left-2 top-2 rounded-md bg-ink/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream-50">
          {t("adminProps.photos.cover")}
        </span>
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending}
        aria-label={t("adminProps.photos.delete")}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-cream-50/90 text-red-600 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 disabled:opacity-30"
      >
        <Trash2 size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}
