"use client";

import { Building2, Globe, User } from "lucide-react";
import { KIND_META, sourceLabel, type SourceKind } from "@/lib/particulares/source-kind";
import { cn } from "@/lib/utils";

const ICONS = { user: User, building: Building2, globe: Globe } as const;

/** Icono del tipo de fuente (particular · agencia en portal · web de agencia). */
export function SourceKindIcon({ kind, size = 12, className }: { kind: SourceKind; size?: number; className?: string }) {
  const Icon = ICONS[KIND_META[kind].icon];
  return <Icon size={size} strokeWidth={1.9} aria-hidden className={className} />;
}

/** Pastilla de tipo: color + icono + texto («Particular», «Agencia», «Web de agencia»). */
export function SourceKindBadge({
  kind,
  portal,
  agency,
  full = false,
  className,
}: {
  kind: SourceKind;
  portal?: string | null;
  agency?: string | null;
  /** Etiqueta completa («Idealista · Agencia X», «Web de Housingo») en lugar de solo el tipo. */
  full?: boolean;
  className?: string;
}) {
  const meta = KIND_META[kind];
  return (
    <span
      title={meta.description}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold", meta.tone, className)}
    >
      <SourceKindIcon kind={kind} />
      <span className="truncate">{full ? sourceLabel({ kind, portal, agency }) : meta.short}</span>
    </span>
  );
}
