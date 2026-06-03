"use client";

import {
  Check,
  FileText,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type UploadStatus = "idle" | "uploading" | "success" | "error";

export type IdealistaListing = {
  propertyId: string;
  squareMeters: number;
  price: number;
  hasElevator: boolean;
  rentalType: "residential" | "temporary";
  floor: string;
  condition: "good" | "to-reform" | "needs-reform";
  energyClass: string;
  builtSquareMeters: number;
  equipment: string;
  totalRentalPrice: number;
  photos: Array<{ id: string; fileName: string; url: string; hasWatermark: boolean }>;
  videos: Array<{ id: string; fileName: string; url: string }>;
  plans: Array<{ id: string; fileName: string; url: string }>;
};

export function IdealistaForm({
  propertyId,
  propertyTitle,
  initialData,
  onSave,
}: {
  propertyId: string;
  propertyTitle: string;
  initialData?: Partial<IdealistaListing>;
  onSave: (data: IdealistaListing) => Promise<void>;
}) {
  const [formData, setFormData] = useState<Partial<IdealistaListing>>(
    initialData || {
      propertyId,
      squareMeters: 0,
      price: 0,
      hasElevator: false,
      rentalType: "residential",
      floor: "",
      condition: "good",
      energyClass: "A",
      builtSquareMeters: 0,
      equipment: "",
      totalRentalPrice: 0,
      photos: [],
      videos: [],
      plans: [],
    }
  );

  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files) return;

    setUploadStatus("uploading");
    setUploadError(null);

    for (const file of Array.from(files)) {
      try {
        const formDataObj = new FormData();
        formDataObj.append("file", file);
        formDataObj.append("propertyId", propertyId);
        formDataObj.append("type", "photo");
        formDataObj.append("addWatermark", "true");

        const res = await fetch("/api/admin/publicacion/upload-media", {
          method: "POST",
          body: formDataObj,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Error uploading file");
        }

        const newFile = await res.json();
        setFormData((prev) => ({
          ...prev,
          photos: [
            ...(prev.photos || []),
            {
              id: newFile.id,
              fileName: newFile.fileName,
              url: newFile.url,
              hasWatermark: newFile.hasWatermark,
            },
          ],
        }));
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Error desconocido"
        );
        setUploadStatus("error");
        return;
      }
    }

    setUploadStatus("success");
    setTimeout(() => setUploadStatus("idle"), 2000);
    e.currentTarget.value = "";
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files) return;

    setUploadStatus("uploading");
    setUploadError(null);

    for (const file of Array.from(files)) {
      try {
        const formDataObj = new FormData();
        formDataObj.append("file", file);
        formDataObj.append("propertyId", propertyId);
        formDataObj.append("type", "video");

        const res = await fetch("/api/admin/publicacion/upload-media", {
          method: "POST",
          body: formDataObj,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Error uploading file");
        }

        const newFile = await res.json();
        setFormData((prev) => ({
          ...prev,
          videos: [
            ...(prev.videos || []),
            {
              id: newFile.id,
              fileName: newFile.fileName,
              url: newFile.url,
            },
          ],
        }));
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Error desconocido"
        );
        setUploadStatus("error");
        return;
      }
    }

    setUploadStatus("success");
    setTimeout(() => setUploadStatus("idle"), 2000);
    e.currentTarget.value = "";
  };

  const handlePlanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files) return;

    setUploadStatus("uploading");
    setUploadError(null);

    for (const file of Array.from(files)) {
      try {
        const formDataObj = new FormData();
        formDataObj.append("file", file);
        formDataObj.append("propertyId", propertyId);
        formDataObj.append("type", "plan");

        const res = await fetch("/api/admin/publicacion/upload-media", {
          method: "POST",
          body: formDataObj,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Error uploading file");
        }

        const newFile = await res.json();
        setFormData((prev) => ({
          ...prev,
          plans: [
            ...(prev.plans || []),
            {
              id: newFile.id,
              fileName: newFile.fileName,
              url: newFile.url,
            },
          ],
        }));
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Error desconocido"
        );
        setUploadStatus("error");
        return;
      }
    }

    setUploadStatus("success");
    setTimeout(() => setUploadStatus("idle"), 2000);
    e.currentTarget.value = "";
  };

  const deleteMedia = async (mediaId: string, type: "photo" | "video" | "plan") => {
    try {
      const res = await fetch("/api/admin/publicacion/delete-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId }),
      });

      if (!res.ok) throw new Error("Error deleting file");

      setFormData((prev) => ({
        ...prev,
        [type === "photo" ? "photos" : type === "video" ? "videos" : "plans"]: (
          prev[type === "photo" ? "photos" : type === "video" ? "videos" : "plans"] || []
        ).filter((m: any) => m.id !== mediaId),
      }));
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Error al eliminar"
      );
    }
  };

  const handleSave = async () => {
    setSaveError(null);
    setIsSaving(true);
    try {
      await onSave(formData as IdealistaListing);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Error al guardar"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-gold/15 bg-cream-50/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)]">
      <div>
        <h3 className="font-serif text-xl font-semibold text-ink">
          Publicar en Idealista
        </h3>
        <p className="mt-1 text-sm text-ink/55">{propertyTitle}</p>
      </div>

      {/* Formulario */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
            M² totales
          </label>
          <input
            type="number"
            value={formData.squareMeters || ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                squareMeters: Number(e.target.value),
              }))
            }
            className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
            M² construidos
          </label>
          <input
            type="number"
            value={formData.builtSquareMeters || ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                builtSquareMeters: Number(e.target.value),
              }))
            }
            className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
            Precio (€)
          </label>
          <input
            type="number"
            value={formData.price || ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                price: Number(e.target.value),
              }))
            }
            className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
            Precio alquiler total (€)
          </label>
          <input
            type="number"
            value={formData.totalRentalPrice || ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                totalRentalPrice: Number(e.target.value),
              }))
            }
            className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
            Planta
          </label>
          <input
            type="text"
            value={formData.floor || ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                floor: e.target.value,
              }))
            }
            placeholder="Ej: 3, Bajo, Ático"
            className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
            Clase energética
          </label>
          <select
            value={formData.energyClass || "A"}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                energyClass: e.target.value,
              }))
            }
            className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="A">A (Muy eficiente)</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
            <option value="E">E</option>
            <option value="F">F</option>
            <option value="G">G (Menos eficiente)</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
            Estado de conservación
          </label>
          <select
            value={formData.condition || "good"}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                condition: e.target.value as "good" | "to-reform" | "needs-reform",
              }))
            }
            className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="good">Buen estado</option>
            <option value="to-reform">A reformar</option>
            <option value="needs-reform">Necesita reforma</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
            Tipo de alquiler
          </label>
          <select
            value={formData.rentalType || "residential"}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                rentalType: e.target.value as "residential" | "temporary",
              }))
            }
            className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="residential">Residencial</option>
            <option value="temporary">Temporal (estudio/trabajo/mudanza)</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1.5 flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.hasElevator || false}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  hasElevator: e.target.checked,
                }))
              }
              className="h-4 w-4 cursor-pointer accent-gold"
            />
            <span className="text-sm font-semibold text-ink">Tiene ascensor</span>
          </label>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
            Equipamiento
          </label>
          <textarea
            value={formData.equipment || ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                equipment: e.target.value,
              }))
            }
            placeholder="Ej: Cocina equipada, aire acondicionado, terraza..."
            className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
            rows={3}
          />
        </div>
      </div>

      {/* Medios */}
      <div className="space-y-4 border-t border-ink/10 pt-6">
        <h4 className="font-semibold text-ink">Medios</h4>

        {/* Fotos */}
        <div>
          <h5 className="mb-2 text-sm font-medium text-ink">
            Fotos <span className="text-ink/55">({formData.photos?.length || 0})</span>
          </h5>
          <div className="rounded-lg border-2 border-dashed border-ink/15 p-4 text-center">
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploadStatus === "uploading"}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2">
                <ImagePlus size={20} className="text-gold" />
                <span className="text-sm text-ink">Subir fotos</span>
                <span className="text-[11px] text-ink/50">Se aplicará marca de agua automáticamente</span>
              </div>
            </label>
          </div>
          {formData.photos && formData.photos.length > 0 && (
            <div className="mt-2 space-y-1">
              {formData.photos.map((photo) => (
                <div
                  key={photo.id}
                  className="flex items-center justify-between bg-white/50 rounded px-3 py-2 text-sm"
                >
                  <span className="text-ink/70">{photo.fileName}</span>
                  <button
                    type="button"
                    onClick={() => deleteMedia(photo.id, "photo")}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Videos */}
        <div>
          <h5 className="mb-2 text-sm font-medium text-ink">
            Videos <span className="text-ink/55">({formData.videos?.length || 0})</span>
          </h5>
          <div className="rounded-lg border-2 border-dashed border-ink/15 p-4 text-center">
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                accept="video/*"
                onChange={handleVideoUpload}
                disabled={uploadStatus === "uploading"}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2">
                <Video size={20} className="text-gold" />
                <span className="text-sm text-ink">Subir videos</span>
              </div>
            </label>
          </div>
          {formData.videos && formData.videos.length > 0 && (
            <div className="mt-2 space-y-1">
              {formData.videos.map((video) => (
                <div
                  key={video.id}
                  className="flex items-center justify-between bg-white/50 rounded px-3 py-2 text-sm"
                >
                  <span className="text-ink/70">{video.fileName}</span>
                  <button
                    type="button"
                    onClick={() => deleteMedia(video.id, "video")}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Planos */}
        <div>
          <h5 className="mb-2 text-sm font-medium text-ink">
            Planos <span className="text-ink/55">({formData.plans?.length || 0})</span>
          </h5>
          <div className="rounded-lg border-2 border-dashed border-ink/15 p-4 text-center">
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                accept=".pdf"
                onChange={handlePlanUpload}
                disabled={uploadStatus === "uploading"}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2">
                <FileText size={20} className="text-gold" />
                <span className="text-sm text-ink">Subir planos (PDF)</span>
              </div>
            </label>
          </div>
          {formData.plans && formData.plans.length > 0 && (
            <div className="mt-2 space-y-1">
              {formData.plans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex items-center justify-between bg-white/50 rounded px-3 py-2 text-sm"
                >
                  <span className="text-ink/70">{plan.fileName}</span>
                  <button
                    type="button"
                    onClick={() => deleteMedia(plan.id, "plan")}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {uploadStatus === "uploading" && (
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
            <Loader2 size={14} className="animate-spin" />
            Subiendo...
          </div>
        )}

        {uploadStatus === "success" && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            ✓ Archivo subido
          </div>
        )}

        {uploadError && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Error: {uploadError}
          </div>
        )}
      </div>

      {/* Botones */}
      <div className="flex gap-2 border-t border-ink/10 pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center justify-center gap-2 flex-1 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} strokeWidth={2.5} />
          )}
          Guardar para Idealista
        </button>
      </div>

      {saveError && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Error: {saveError}
        </div>
      )}
    </div>
  );
}
