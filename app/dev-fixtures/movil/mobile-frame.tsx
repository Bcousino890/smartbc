"use client";

import { useEffect, useRef } from "react";

// SOLO DESARROLLO LOCAL (BCP-01, E7). Copia el informe del iframe (mismo
// origen) al documento exterior para leerlo desde una ejecución headless.
export function MobileFrame({ src, height = 780 }: { src: string; height?: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const c = ref.current?.contentDocument?.documentElement.getAttribute("data-check");
      if (c) {
        document.documentElement.setAttribute("data-check", c);
        const el = document.getElementById("frame-report");
        if (el) el.textContent = c;
        clearInterval(t);
      }
      if (tries > 80) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex min-h-screen flex-col items-center gap-3 bg-[#2a2d31] py-4 text-xs text-white/80">
      <p>Prueba local · {src} · 362 px de ancho</p>
      <div className="rounded-[44px] bg-black p-[14px] shadow-2xl">
        <iframe ref={ref} src={src} title="Vista móvil" width={362} height={height} className="rounded-[32px] bg-white" />
      </div>
      <p id="frame-report">Comprobando…</p>
    </div>
  );
}
