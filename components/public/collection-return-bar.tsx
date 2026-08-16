"use client";

// ============================================================================
// La vuelta a la colección, en la ficha de una propiedad.
//
// Solo aparece si este mismo navegador llegó desde una Viewing Collection (ver
// lib/viewing-collections/return-link.ts). Para cualquier otro visitante —un
// enlace reenviado, el portal, un SmartLink suelto— la ficha se comporta
// exactamente igual que siempre y esto no existe.
//
// Va arriba, y como FRANJA en el flujo (sticky), no como píldora flotante: una
// píldora encima del contenido se comía el logotipo de la cabecera en móvil.
// Así ocupa su propio sitio, no tapa nada y sigue visible al bajar. Abajo no
// puede ir: en móvil el pie ya lo ocupa la barra de contacto.
//
// ── Volver es volver, no abrir otra ─────────────────────────────────────────
// "Explorar residencia" abre esta ficha en una pestaña nueva y la colección se
// queda intacta en la de atrás. Así que volver NO es navegar aquí —eso dejaba
// la colección duplicada y las pestañas acumulándose según el cliente mira
// pisos—: es devolver el foco a la pestaña de origen y cerrar esta. El lector
// aterriza en su libro por la misma página que dejó.
//
// Si esta pestaña no la abrimos nosotros (un enlace guardado, un reenvío que
// además tenga el retorno guardado en ese navegador), no hay pestaña a la que
// volver y entonces sí se navega. Y si el navegador se niega a cerrar la
// pestaña, se navega igualmente: nunca se queda el botón sin hacer nada.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  readCollectionReturn,
  type CollectionReturn,
} from "@/lib/viewing-collections/return-link";

export function CollectionReturnBar() {
  const [ret, setRet] = useState<CollectionReturn | null>(null);

  // En el montaje: el almacenamiento no existe en el servidor, así que esto
  // nunca puede formar parte del HTML servido a un visitante cualquiera.
  useEffect(() => setRet(readCollectionReturn()), []);

  const goBack = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!ret) return;
      // Clic con modificador o botón central: que el navegador haga lo suyo.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();

      try {
        const opener = window.opener as Window | null;
        if (opener && !opener.closed) {
          opener.focus();
          window.close();
          // Algunos navegadores se niegan a cerrar; si seguimos vivos, se
          // navega aquí para que el botón siempre lleve a alguna parte.
          window.setTimeout(() => {
            window.location.href = ret.url;
          }, 200);
          return;
        }
      } catch {
        // Acceso a `opener` bloqueado: se navega y ya está.
      }
      window.location.href = ret.url;
    },
    [ret],
  );

  if (!ret) return null;

  return (
    <div className="sticky top-0 z-50 w-full bg-ink text-cream-50">
      {/* Mismo contenedor y mismos márgenes que la cabecera de la ficha, para
          que el texto caiga alineado con el logotipo de debajo. */}
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <a
          href={ret.url}
          onClick={goBack}
          className="inline-flex items-center gap-2.5 py-3 text-[12px] font-medium text-cream-50/85 transition-colors duration-300 hover:text-cream-50"
        >
          <span aria-hidden>&larr;</span>
          {ret.label}
        </a>
      </div>
    </div>
  );
}
