"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import {
  AdminPageSkeleton,
  PropertiesListSkeleton,
  PropertyDetailSkeleton,
  TableListSkeleton,
} from "@/components/admin/route-skeletons";

function SkeletonFor({ href }: { href: string }) {
  if (/\/admin\/propiedades$/.test(href)) return <PropertiesListSkeleton />;
  if (/\/admin\/(clientes|solicitudes)$/.test(href)) return <TableListSkeleton />;
  return <AdminPageSkeleton />;
}

/** Esqueleto encima del área de contenido (`<main>`), fuera de la sidebar. */
function PendingOverlay({ children }: { children: ReactNode }) {
  const host = typeof document !== "undefined" ? document.querySelector("main") : null;
  if (!host) return null;
  return createPortal(
    // En móvil cubre también la franja superior (el botón del menú, z-40, queda
    // encima) y deja el mismo hueco que `<main>` (pt-16): sin franja con la
    // página anterior asomando.
    <div className="fixed inset-x-0 bottom-0 top-0 z-20 overflow-hidden bg-cream-50 pt-16 lg:left-[260px] lg:pt-0">
      {children}
    </div>,
    host,
  );
}

/**
 * «Cargando» de un enlace de la sidebar (CRM-02, E2 · D2 de CRM-01).
 * Va DENTRO del `<Link>`: `useLinkStatus` dice si su navegación está en curso.
 * Mientras lo está: marca giratoria en el propio enlace y, encima del área de
 * contenido, el esqueleto de la sección de destino. No usa `Suspense`
 * (`loading.tsx`): React no impone su espera mínima para revelar el contenido
 * y la página aparece en cuanto llega. En móvil el menú se cierra al pulsar,
 * así que el esqueleto es lo que se ve.
 */
export function NavPendingMark({ href }: { href: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      <span data-crm-pending="true" className="flex shrink-0 items-center text-gold">
        <Loader2 size={14} strokeWidth={2} className="animate-spin" aria-hidden />
        <span className="sr-only">Cargando…</span>
      </span>
      <PendingOverlay>
        <SkeletonFor href={href} />
      </PendingOverlay>
    </>
  );
}

const SKELETONS = {
  "properties-list": PropertiesListSkeleton,
  "property-detail": PropertyDetailSkeleton,
} as const;

/**
 * El mismo «cargando» para enlaces dentro de una página (CRM-03, PR-B): lista →
 * ficha y ficha → «Volver al listado». Va DENTRO del `<Link>` y no pinta nada
 * en el propio enlace, así que no lo mueve. Solo hay `pending` en la navegación
 * de ESE enlace dentro de la pestaña: Cmd/Ctrl+clic (pestaña nueva) no lo
 * activa, y otro clic posterior lo apaga.
 */
export function LinkPendingOverlay({ skeleton }: { skeleton: keyof typeof SKELETONS }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  const Skeleton = SKELETONS[skeleton];
  return (
    <PendingOverlay>
      <Skeleton />
    </PendingOverlay>
  );
}
