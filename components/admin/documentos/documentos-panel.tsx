"use client";

import { useMemo, useState } from "react";
import {
  FileText,
  Home,
  KeyRound,
  ShoppingBag,
  Printer,
  Download,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DocField, DocRole } from "@/lib/documentos/templates";
import { ROLE_LABELS } from "@/lib/documentos/templates";

type TemplateDTO = {
  id: string;
  category: "venta" | "alquiler" | "personal_shopper";
  name: string;
  subtitle: string;
  roles: DocRole[];
  fields: DocField[];
  reviewNote?: string;
};

const CATEGORY_ICON: Record<TemplateDTO["category"], typeof FileText> = {
  venta: Home,
  alquiler: KeyRound,
  personal_shopper: ShoppingBag,
};

const CATEGORY_LABEL: Record<TemplateDTO["category"], string> = {
  venta: "Venta",
  alquiler: "Arriendo / Alquiler",
  personal_shopper: "Personal Shopper",
};

export function DocumentosPanel({
  country,
  templates,
}: {
  country: "es" | "cl";
  templates: TemplateDTO[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  if (selected) {
    return (
      <DocumentEditor
        template={selected}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div>
      <p className="mb-5 text-sm text-ink/55">
        {country === "cl"
          ? "Órdenes de venta y arriendo listas para rellenar, imprimir y firmar."
          : "Mandatos de venta, alquiler y personal shopper listos para rellenar, imprimir y firmar."}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => {
          const Icon = CATEGORY_ICON[t.category];
          return (
            <Card
              key={t.id}
              as="article"
              className="flex flex-col gap-3 p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="crm-label-sm text-gold">
                    {CATEGORY_LABEL[t.category]}
                  </p>
                  <h3 className="truncate crm-section-title text-ink">
                    {t.name}
                  </h3>
                </div>
              </div>
              <p className="text-sm text-ink/60">{t.subtitle}</p>
              <div className="flex flex-wrap gap-1.5">
                {t.roles.map((r) => (
                  <span
                    key={r}
                    className="rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-xs text-ink/70"
                  >
                    {ROLE_LABELS[r]}
                  </span>
                ))}
              </div>
              <div className="mt-auto pt-2">
                <Button
                  className="w-full"
                  onClick={() => setSelectedId(t.id)}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Rellenar y generar
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function DocumentEditor({
  template,
  onBack,
}: {
  template: TemplateDTO;
  onBack: () => void;
}) {
  // Precargamos los valores por defecto (comisión, exclusividad, etc.) para
  // que el documento salga con las condiciones habituales pero editables.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      template.fields
        .filter((field) => field.defaultValue != null)
        .map((field) => [field.key, field.defaultValue as string]),
    ),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function generate(mode: "print" | "download") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/documentos/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id, values }),
      });
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (mode === "download") {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${template.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } else {
        // Abrir en nueva pestaña para previsualizar / imprimir.
        const win = window.open(url, "_blank");
        if (win) {
          win.addEventListener("load", () => {
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al generar el PDF");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink/60 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a documentos
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <Card as="section" className="p-6">
          <h2 className="crm-section-title text-ink">
            {template.name}
          </h2>
          <p className="mt-1 text-sm text-ink/55">{template.subtitle}</p>

          {template.reviewNote ? (
            <p className="mt-4 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠️ {template.reviewNote}
            </p>
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {template.fields.map((field) => (
              <div
                key={field.key}
                className={cn(field.full && "sm:col-span-2")}
              >
                <label className="mb-1 block text-sm font-medium text-ink/70">
                  {field.label}
                </label>
                {field.type === "select" ? (
                  <select
                    value={values[field.key] ?? field.options?.[0] ?? ""}
                    onChange={(e) => set(field.key, e.target.value)}
                    className="w-full rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-gold/55"
                  >
                    {(field.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea
                    rows={3}
                    value={values[field.key] ?? ""}
                    onChange={(e) => set(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-gold/55"
                  />
                ) : (
                  <input
                    type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                    value={values[field.key] ?? ""}
                    onChange={(e) => set(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-gold/55"
                  />
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card as="aside" className="h-fit p-6 lg:sticky lg:top-6">
          <p className="crm-label-sm text-gold">
            Generar documento
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Los campos vacíos se imprimen como líneas para completar y firmar a
            mano. Puedes previsualizar / imprimir o descargar el PDF.
          </p>

          <div className="mt-5 flex flex-col gap-2.5">
            <Button
              onClick={() => generate("print")}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              Previsualizar / Imprimir
            </Button>
            <Button
              variant="outline"
              onClick={() => generate("download")}
              disabled={loading}
              className="w-full"
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar PDF
            </Button>
          </div>

          {error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-1.5">
            {template.roles.map((r) => (
              <span
                key={r}
                className="rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-xs text-ink/70"
              >
                {ROLE_LABELS[r]}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
