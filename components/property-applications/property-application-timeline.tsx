"use client";

import { CheckCircle, FileText, Search, Sparkles, XCircle } from "lucide-react";
import type { ApplicationStatus } from "@/lib/property-applications/types";

type Step = {
  key: string;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const STEPS: Step[] = [
  { key: "draft", label: "Preparando documentación", sublabel: "Sube los documentos requeridos", icon: FileText },
  { key: "pending_review", label: "En revisión", sublabel: "Revisamos en 24–48 horas", icon: Search },
  { key: "approved", label: "Aprobada", sublabel: "Documentación verificada", icon: Sparkles },
  { key: "completed", label: "Proceso completado", sublabel: "Contrato en camino", icon: CheckCircle },
];

const STATUS_STEP_INDEX: Record<ApplicationStatus, number> = {
  draft: 0,
  pending_review: 1,
  approved: 2,
  rejected: 1,
  completed: 3,
};

export function PropertyApplicationTimeline({ status }: { status: ApplicationStatus }) {
  const currentIdx = STATUS_STEP_INDEX[status];
  const isRejected = status === "rejected";

  return (
    <div className="rounded-xl border border-cream-50/60 bg-cream-50/60 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isRejectedStep = isRejected && idx === 1;

          return (
            <div key={step.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              {/* Conector izquierdo */}
              <div className="flex w-full items-center">
                {idx > 0 && (
                  <div className={`h-0.5 flex-1 ${isDone ? "bg-gold" : "bg-ink/10"}`} />
                )}

                {/* Ícono */}
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                  isRejectedStep
                    ? "border-red-400 bg-red-100 text-red-600"
                    : isDone
                    ? "border-gold bg-gold text-cream-50"
                    : isCurrent
                    ? "border-ink bg-ink text-cream-50"
                    : "border-ink/15 bg-cream-50/60 text-ink/25"
                }`}>
                  {isRejectedStep ? (
                    <XCircle size={14} />
                  ) : (
                    <Icon size={14} />
                  )}
                </div>

                {/* Conector derecho */}
                {idx < STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 ${isDone ? "bg-gold" : "bg-ink/10"}`} />
                )}
              </div>

              {/* Label */}
              <div className="hidden text-center sm:block">
                <p className={`text-[11px] font-semibold leading-tight ${
                  isRejectedStep ? "text-red-600" : isCurrent ? "text-ink" : isDone ? "text-ink/60" : "text-ink/30"
                }`}>
                  {isRejectedStep ? "Necesita corrección" : step.label}
                </p>
                {isCurrent && !isRejectedStep && (
                  <p className="mt-0.5 text-[10px] text-ink/40">{step.sublabel}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Estado actual en mobile */}
      <p className="mt-2 text-center text-xs text-ink/50 sm:hidden">
        {isRejected ? "Necesita corrección" : STEPS[currentIdx]?.label}
      </p>
    </div>
  );
}
