"use client";

import { Clock, Map as MapIcon, Pencil, Radius, Spline, Trash2 } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { EditorTool } from "@/lib/captaciones-map/zone-editor-reducer";

/** Ayuda por herramienta (textos de la maqueta v4 aprobada). */
export const TOOL_HINTS: Record<EditorTool, string> = {
  draw: "Pulsa para marcar vértices. Doble clic para cerrar. Esc cancela.",
  edit: "Arrastra un vértice. El punto dorado de cada lado añade otro. Doble clic en un vértice lo quita.",
  circle: "Pulsa el centro y arrastra para fijar el radio.",
  barrio: "Elige barrios del distrito: se suman a la zona.",
  iso: "Marca un punto (trabajo, colegio) y elige 10, 15 o 20 min a pie.",
};

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
const TOOLS: { tool: EditorTool; label: string; Icon: Icon }[] = [
  { tool: "draw", label: "Dibujar", Icon: Spline },
  { tool: "edit", label: "Editar", Icon: Pencil },
  { tool: "circle", label: "Radio", Icon: Radius },
  { tool: "barrio", label: "Barrios", Icon: MapIcon },
  { tool: "iso", label: "A pie", Icon: Clock },
];

export interface MapToolbarProps {
  tool: EditorTool;
  onTool(t: EditorTool): void;
  onClear(): void;
  hint: string;
  /** Herramientas no disponibles → motivo (va en `title`). */
  disabled?: Partial<Record<EditorTool, string>>;
  /** Solo si la barra no cuelga de `.cm-root`/`.cm-theme-dark`. */
  theme?: "light" | "dark";
}

/**
 * Tarjeta de cristal con las herramientas de zona (maqueta v4). Solo la
 * herramienta activa enseña su nombre; el resto son iconos con `title` y
 * `aria-label`. La ayuda va dentro de la misma tarjeta. Posición: la decide
 * quien la monta (arriba a la izquierda dentro del contenedor del mapa).
 */
export default function MapToolbar({ tool, onTool, onClear, hint, disabled, theme }: MapToolbarProps) {
  return (
    <div className={`cm-toolbar ${theme === "dark" ? "cm-dark" : ""}`} role="toolbar" aria-label="Herramientas de zona">
      <div className="cm-tools">
        {TOOLS.map(({ tool: t, label, Icon }) => {
          const off = disabled?.[t];
          const active = tool === t;
          return (
            <button
              key={t}
              type="button"
              className={active ? "cm-on" : ""}
              aria-pressed={active}
              aria-label={label}
              title={off ?? label}
              disabled={!!off}
              onClick={() => onTool(t)}
            >
              <Icon width={16} height={16} aria-hidden="true" />
              {active ? <span>{label}</span> : null}
            </button>
          );
        })}
        <hr />
        <button type="button" aria-label="Borrar zona" title="Borrar zona" onClick={onClear}>
          <Trash2 width={16} height={16} aria-hidden="true" />
        </button>
      </div>
      <p className="cm-hint" aria-live="polite">{hint}</p>
      <style>{CSS}</style>
    </div>
  );
}

/* Cristal de la maqueta v4: blanco .74 + desenfoque 14px (oscuro: rgba(24,22,19,.66)). */
const CSS = `
.cm-toolbar{--tb-glass:rgba(255,255,255,.74);--tb-line:rgba(255,255,255,.7);--tb-ink:#0a0a0a;--tb-muted:#6f685d;--tb-on-bg:#0a0a0a;--tb-on-ink:#fff;
  display:flex;flex-direction:column;padding:4px;border-radius:14px;font-family:Lato,"Helvetica Neue",Arial,sans-serif;
  background:var(--tb-glass);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);
  border:1px solid var(--tb-line);box-shadow:0 10px 30px rgba(40,30,10,.16);color:var(--tb-ink);width:max-content;max-width:300px}
.cm-theme-dark .cm-toolbar,.cm-toolbar.cm-dark{--tb-glass:rgba(24,22,19,.66);--tb-line:rgba(255,255,255,.09);--tb-ink:#f3eee6;--tb-muted:#a39b8f;--tb-on-bg:#c9a96e;--tb-on-ink:#0a0a0a}
.cm-toolbar .cm-tools{display:flex;gap:2px;align-items:stretch}
.cm-toolbar button{border:0;background:none;color:var(--tb-ink);padding:8px 11px;border-radius:10px;font:600 12.5px Lato,"Helvetica Neue",Arial,sans-serif;
  cursor:pointer;display:flex;gap:6px;align-items:center;opacity:.78;transition:background .15s,opacity .15s}
.cm-toolbar button:hover:not(:disabled){opacity:1;background:rgba(201,169,110,.18)}
.cm-toolbar button.cm-on{background:var(--tb-on-bg);color:var(--tb-on-ink);opacity:1}
.cm-toolbar button:disabled{opacity:.38;cursor:not-allowed}
.cm-toolbar button:focus-visible{outline:2px solid #c9a96e;outline-offset:2px}
.cm-toolbar hr{border:0;border-left:1px solid var(--tb-line);margin:4px 3px}
.cm-toolbar .cm-hint{margin:4px 0 0;padding:8px 10px 6px;border-top:1px solid var(--tb-line);font-size:12px;line-height:1.4;color:var(--tb-muted)}
@media (prefers-reduced-motion:reduce){.cm-toolbar button{transition:none}}
`;
