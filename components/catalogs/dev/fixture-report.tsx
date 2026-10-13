"use client";

import { useEffect } from "react";

// SOLO DESARROLLO LOCAL (BCP-01, E7). Informe automático para las capturas:
// qué fuentes cargaron y si algo se sale (horizontal en la página, o el
// contenido de una portada/tarjeta marcada con data-check-overflow). Deja el
// resultado en <html data-check="…"> y en un aviso fijo abajo.
export function FixtureReport() {
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const loaded = new Set<string>();
      document.fonts.forEach((f) => {
        if (f.status === "loaded") loaded.add(f.family.replace(/["']/g, ""));
      });
      const want = ["Fraunces", "Karla", "Lato"];
      const fonts = want.map((w) => `${w}:${[...loaded].some((f) => f.includes(w)) ? "sí" : "no"}`).join(" ");
      const issues: string[] = [];
      if (document.documentElement.scrollWidth > window.innerWidth + 1) issues.push("horizontal-documento");
      document.querySelectorAll<HTMLElement>("[data-check-overflow]").forEach((el, i) => {
        el.querySelectorAll<HTMLElement>("*").forEach((child) => {
          const r = child.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          if (r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1)) issues.push(`${el.dataset.checkOverflow}#${i}`);
        });
      });
      const uniq = [...new Set(issues)];
      const txt = `Fuentes ${fonts} · Desbordes: ${uniq.length}${uniq.length ? ` (${uniq.slice(0, 5).join(", ")})` : ""}`;
      document.documentElement.setAttribute("data-check", txt);
      const el = document.getElementById("fixture-report");
      if (el) el.textContent = txt;
    };
    document.fonts.ready.then(() => setTimeout(run, 400));
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <p
      id="fixture-report"
      className="fixed bottom-0 left-0 right-0 z-50 bg-ink/85 px-3 py-1 text-xs text-white"
    >
      Comprobando…
    </p>
  );
}
