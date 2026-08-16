"use client";

// ============================================================================
// La vuelta a la colección, en la ficha de una propiedad.
//
// Solo aparece si este mismo navegador llegó desde una Viewing Collection (ver
// lib/viewing-collections/return-link.ts). Para cualquier otro visitante —un
// enlace reenviado, el portal, un SmartLink suelto— la ficha se comporta
// exactamente igual que siempre y esto no existe.
//
// Va arriba, no abajo: en móvil el pie ya lo ocupa la barra de contacto.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  readCollectionReturn,
  type CollectionReturn,
} from "@/lib/viewing-collections/return-link";

export function CollectionReturnBar() {
  const [ret, setRet] = useState<CollectionReturn | null>(null);

  // En el montaje: el almacenamiento no existe en el servidor, así que esto
  // nunca puede formar parte del HTML servido a un visitante cualquiera.
  useEffect(() => setRet(readCollectionReturn()), []);

  if (!ret) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-3 sm:justify-start sm:p-4">
      <Link
        href={ret.url}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-cream-50/20 bg-ink/90 px-4 py-2.5 text-[11px] font-medium text-cream-50 shadow-lg backdrop-blur-sm transition-colors duration-300 hover:bg-ink"
      >
        <span aria-hidden>&larr;</span>
        {ret.label}
      </Link>
    </div>
  );
}
