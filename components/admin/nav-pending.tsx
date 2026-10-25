"use client";

import { Loader2 } from "lucide-react";
import { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import {
  AdminPageSkeleton,
  PropertiesListSkeleton,
  TableListSkeleton,
} from "@/components/admin/route-skeletons";

function SkeletonFor({ href }: { href: string }) {
  if (/\/admin\/propiedades$/.test(href)) return <PropertiesListSkeleton />;
  if (/\/admin\/(clientes|solicitudes)$/.test(href)) return <TableListSkeleton />;
  return <AdminPageSkeleton />;
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
  const host = typeof document !== "undefined" ? document.querySelector("main") : null;
  return (
    <>
      <span data-crm-pending="true" className="flex shrink-0 items-center text-gold">
        <Loader2 size={14} strokeWidth={2} className="animate-spin" aria-hidden />
        <span className="sr-only">Cargando…</span>
      </span>
      {host &&
        createPortal(
          <div className="fixed inset-x-0 bottom-0 top-16 z-20 overflow-hidden bg-cream-50 lg:left-[260px] lg:top-0">
            <SkeletonFor href={href} />
          </div>,
          host,
        )}
    </>
  );
}
