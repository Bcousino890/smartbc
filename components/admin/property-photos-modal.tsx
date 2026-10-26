"use client";

import {
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deletePropertyPhoto,
  reorderPropertyPhotos,
  type UploadPropertyPhotoResult,
} from "@/app/(admin)/admin/propiedades/actions";
import { postUploadForm } from "@/lib/http/upload-form";
import { Modal } from "@/components/ui/modal";
import { PropertyPhotosFromWeb } from "@/components/admin/property-photos-from-web";
import { useT } from "@/lib/i18n/provider";
import { createGalleryTurns, galleryApiUrl } from "@/lib/properties/admin-gallery";
import { cn } from "@/lib/utils";
import { isOptimizableSrc } from "@/lib/images/optimizable-src";

export type PropertyPhoto = { url: string; isCover: boolean };

export function PropertyPhotosModal({
  open,
  onClose,
  slug,
  title,
  country,
  initialPhotos,
  galleryCountry,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  title: string;
  country?: string;
  /**
   * Galería ya conocida (la ficha la trae). Si no se pasa, el modal la pide al
   * abrirse a /api/admin/properties/[slug]/photos (lista del admin, CRM-02 E1).
   */
  initialPhotos?: PropertyPhoto[];
  /** País de la lista, para pedir la galería (solo con carga bajo demanda). */
  galleryCountry?: string;
}) {
  const t = useT();
  const router = useRouter();
  const onDemand = initialPhotos === undefined;
  // null = todavía no ha llegado la galería (solo con carga bajo demanda).
  const [photoList, setPhotoList] = useState<PropertyPhoto[] | null>(initialPhotos ?? null);
  const photos = photoList ?? [];
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(onDemand ? "loading" : "ready");
  // Turnos: una respuesta tardía (modal cerrado, otra petición más nueva o
  // ediciones hechas mientras tanto) nunca pisa la galería que se está viendo.
  const turns = useRef(createGalleryTurns());
  // Toda edición local pasa por aquí: marca la galería como editada.
  const setPhotos: typeof setPhotoList = (next) => {
    turns.current.edited();
    setPhotoList(next);
  };
  const loadGallery = useCallback(() => {
    if (!onDemand) return;
    const stamp = turns.current.start(slug);
    setLoadState("loading");
    fetch(galleryApiUrl(slug, galleryCountry ?? country ?? "es"), { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as { photos: PropertyPhoto[] };
      })
      .then((data) => {
        if (!turns.current.accepts(stamp, slug)) return;
        setPhotoList(data.photos);
        setLoadState("ready");
      })
      .catch(() => {
        if (!turns.current.accepts(stamp, slug)) return;
        setLoadState("error");
      });
  }, [onDemand, slug, galleryCountry, country]);
  // Cada apertura pide la galería (las fotos pueden haber cambiado desde la
  // ficha u otra pestaña); mientras llega, se enseña la última conocida si la
  // hay. Al cerrar, lo que esté en vuelo deja de valer.
  useEffect(() => {
    if (open) loadGallery();
    else turns.current.invalidate();
  }, [open, loadGallery]);
  const galleryUnavailable = photoList === null;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const hasCover = photos.some((p) => p.isCover);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);

    startTransition(async () => {
      // Subimos en serie (cada upload depende del estado de cover anterior),
      // pero SIN abortar el lote ante el primer error: antes un solo fallo
      // (p.ej. un archivo que supera el límite del storage) cortaba el resto
      // en silencio y el admin veía "se subieron 64, quedaron 11" sin saber
      // por qué. Ahora seguimos con el resto y reportamos cuáles fallaron.
      let coverAssigned = hasCover;
      const failed: string[] = [];
      try {
        for (const file of files) {
          const formData = new FormData();
          formData.set("slug", slug);
          formData.set("file", file);
          formData.set("isCover", String(!coverAssigned));
          if (country) formData.set("country", country);

          const result = await postUploadForm<UploadPropertyPhotoResult>("/api/admin/properties/upload/photo", formData);
          if (result.ok) {
            const isCover = !coverAssigned;
            coverAssigned = coverAssigned || isCover;
            setPhotos((prev) => [...(prev ?? []), { url: result.url, isCover }]);
          } else {
            failed.push(`${file.name}: ${result.error}`);
          }
        }
        if (failed.length > 0) {
          setError(
            `${failed.length} de ${files.length} fotos no se pudieron subir:\n${failed.join("\n")}`,
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron subir las fotos.");
      } finally {
        router.refresh();
        if (inputRef.current) inputRef.current.value = "";
      }
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
      try {
        const result = await deletePropertyPhoto({ slug, photoUrl: url, country });
        if (result.ok) {
          setPhotos((prev) => (prev ?? []).filter((p) => p.url !== url));
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo eliminar la foto.");
      }
    });
  };

  // Persiste un nuevo orden (la 1ª pasa a ser la portada del SmartLink).
  const persistOrder = (next: PropertyPhoto[]) => {
    setPhotos(next);
    setError(null);
    startTransition(async () => {
      try {
        const res = await reorderPropertyPhotos(
          slug,
          next.map((p) => p.url),
          country,
        );
        if (!res.ok) setError(res.error);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo reordenar las fotos.");
      }
    });
  };

  // Reordenar arrastrando: reordenamos en LOCAL mientras se arrastra y solo
  // guardamos al soltar (evita una llamada al servidor por cada movimiento).
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const orderRef = useRef(photos);
  orderRef.current = photos;

  const reorderLocal = (from: number, to: number) => {
    if (from === to) return;
    setPhotos((prev) => {
      const next = [...(prev ?? [])];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      orderRef.current = next;
      return next;
    });
  };

  const persistCurrentOrder = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await reorderPropertyPhotos(
          slug,
          orderRef.current.map((p) => p.url),
          country,
        );
        if (!res.ok) setError(res.error);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo reordenar las fotos.");
      }
    });
  };

  const makePrincipal = (index: number) => {
    if (index === 0) return;
    const next = [...photos];
    const [item] = next.splice(index, 1);
    next.unshift(item);
    persistOrder(next);
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
            disabled={isPending || galleryUnavailable}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isPending || galleryUnavailable}
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
          <p className="mt-2 text-xs text-ink/45">
            {t("adminProps.photos.uploadHint")}
          </p>
        </div>

        {!galleryUnavailable && <PropertyPhotosFromWeb slug={slug} onChanged={setPhotos} />}

        {error && (
          <p className="mt-3 whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6" data-crm-gallery={loadState}>
          {loadState === "error" && (
            <div
              role="alert"
              className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
            >
              <span>
                {galleryUnavailable
                  ? "No se pudieron cargar las fotos."
                  : "No se pudo actualizar la galería; se muestran las últimas fotos cargadas."}
              </span>
              <button
                type="button"
                onClick={loadGallery}
                className="crm-button rounded-md border border-red-300 bg-white px-2.5 py-1 text-red-700 transition hover:bg-red-50"
              >
                Reintentar
              </button>
            </div>
          )}
          {galleryUnavailable ? (
            loadState === "loading" ? (
              <div data-crm-skeleton aria-busy="true" aria-label="Cargando fotos" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-[4/3] animate-pulse rounded-xl border border-gold/15 bg-ink/5" />
                ))}
              </div>
            ) : null
          ) : photos.length === 0 ? (
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
            <>
              <p className="mb-3 text-xs text-ink/55">
                {t("adminProps.photos.reorderHint")}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((photo, index) => (
                  <PhotoCard
                    key={photo.url}
                    photo={photo}
                    index={index}
                    isDragging={dragIndex === index}
                    onDelete={() => handleDelete(photo.url)}
                    onMakePrincipal={() => makePrincipal(index)}
                    onDragStart={() => setDragIndex(index)}
                    onDragEnter={() => {
                      if (dragIndex !== null && dragIndex !== index) {
                        reorderLocal(dragIndex, index);
                        setDragIndex(index);
                      }
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      persistCurrentOrder();
                    }}
                    isPending={isPending}
                  />
                ))}
              </div>
            </>
          )}
        </div>
    </Modal>
  );
}

function PhotoCard({
  photo,
  index,
  isDragging,
  onDelete,
  onMakePrincipal,
  onDragStart,
  onDragEnter,
  onDragEnd,
  isPending,
}: {
  photo: PropertyPhoto;
  index: number;
  isDragging: boolean;
  onDelete: () => void;
  onMakePrincipal: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  isPending: boolean;
}) {
  const t = useT();
  const isPrincipal = index === 0;
  return (
    <div
      data-crm-gallery-item
      draggable={!isPending}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative aspect-[4/3] cursor-grab overflow-hidden rounded-xl border border-gold/15 bg-cream-100 active:cursor-grabbing",
        isDragging && "opacity-40 ring-2 ring-gold",
      )}
    >
      <Image
        src={photo.url}
        alt=""
        unoptimized={!isOptimizableSrc(photo.url)}
        fill
        sizes="(max-width: 640px) 50vw, 33vw"
        className="pointer-events-none object-cover"
      />

      {/* Asa de arrastre (señal visual) */}
      <span className="absolute left-1.5 top-1.5 rounded-md bg-cream-50/85 p-1 text-ink/55 opacity-0 transition group-hover:opacity-100">
        <GripVertical size={13} strokeWidth={1.75} />
      </span>

      {isPrincipal && (
        <span className="absolute left-2 bottom-2 flex items-center gap-1 rounded-md bg-gold px-2 py-0.5 crm-label-sm text-fixed-ink">
          <Star size={10} strokeWidth={2} fill="currentColor" />
          {t("adminProps.photos.principal")}
        </span>
      )}

      {/* Borrar (arriba derecha) */}
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending}
        aria-label={t("adminProps.photos.delete")}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-cream-50/90 text-red-600 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 disabled:opacity-30"
      >
        <Trash2 size={13} strokeWidth={1.75} />
      </button>

      {/* Hacer principal (solo si no lo es ya) */}
      {!isPrincipal && (
        <button
          type="button"
          onClick={onMakePrincipal}
          disabled={isPending}
          className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-md bg-cream-50/95 px-2 py-1 text-xs font-semibold text-ink opacity-0 transition group-hover:opacity-100 hover:bg-white disabled:opacity-40"
        >
          <Star size={11} strokeWidth={2} className="text-gold" />
          {t("adminProps.photos.makePrincipal")}
        </button>
      )}
    </div>
  );
}
