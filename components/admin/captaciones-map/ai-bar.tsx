"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type AiBarResult = {
  criteria: string[];
  matches: { id: string; satisfied: string[]; missing: string[] }[];
};

export interface AiBarProps {
  /** El mapa aún no tiene anuncios que analizar (sin zona, cargando…). */
  disabled: boolean;
  /** Ids a analizar (la vista decide cuáles; el servidor valida el tope de 200). */
  ids: string[];
  onResult(r: AiBarResult): void;
}

/** Mensaje en español por código HTTP; nunca se enseña texto crudo del servidor. */
function messageFor(status: number): string {
  if (status === 429) return "Demasiadas búsquedas seguidas. Espera un minuto.";
  if (status === 503) return "La IA no está configurada. Actívala en Configuración.";
  if (status === 400) return "La búsqueda no es válida. Revisa el texto.";
  return "La IA no ha podido responder. Inténtalo de nuevo.";
}

/**
 * Barra de búsqueda con IA (maqueta v4: `.ai` + `.chip`). Solo habla con
 * /api/admin/particulares/map-ai y entrega el resultado por `onResult`; qué
 * hacer con las coincidencias (puntuación, ficha del pin) lo decide la vista.
 */
export default function AiBar({ disabled, ids, onResult }: AiBarProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [criteria, setCriteria] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Si la barra se desmonta con una petición en vuelo, no dejarla colgada.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function submit() {
    const query = text.trim();
    if (!query || loading || disabled || ids.length === 0) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/particulares/map-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, ids }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        setError(messageFor(res.status));
        return;
      }
      const data = (await res.json()) as Partial<AiBarResult> & { ok?: boolean };
      const result: AiBarResult = {
        // Sin repetidos: cada criterio es la `key` de su etiqueta.
        criteria: Array.isArray(data.criteria) ? [...new Set(data.criteria)] : [],
        matches: Array.isArray(data.matches) ? data.matches : [],
      };
      setCriteria(result.criteria);
      onResult(result);
    } catch (e) {
      // Cancelar no es un error: el usuario lo pidió.
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError("No se ha podido conectar. Revisa tu conexión e inténtalo de nuevo.");
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setLoading(false);
    }
  }

  function clear() {
    setCriteria([]);
    setText("");
    setError(null);
    onResult({ criteria: [], matches: [] });
  }

  return (
    <div className="cm-ai-wrap">
      <div className="cm-ai" aria-busy={loading}>
        <Sparkles width={16} height={16} aria-hidden="true" className="cm-ai-ico" />
        <input
          type="text"
          value={text}
          maxLength={300}
          disabled={disabled || loading}
          autoComplete="off"
          aria-label="Búsqueda con IA"
          placeholder="Describe lo que busca con tus palabras…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {loading ? (
          <button type="button" className="cm-ai-cancel" onClick={() => abortRef.current?.abort()}>
            Cancelar
          </button>
        ) : (
          <kbd aria-hidden="true">Enter</kbd>
        )}
      </div>
      <div className="cm-ai-status" role="status" aria-live="polite">
        {loading ? "Analizando anuncios…" : ""}
      </div>
      {error ? (
        <p className="cm-ai-error" role="alert">
          {error}
        </p>
      ) : null}
      {criteria.length > 0 ? (
        <div className="cm-ai-chips">
          {criteria.map((c) => (
            <span key={c} className="cm-ai-chip">
              <i aria-hidden="true" />
              {c}
            </span>
          ))}
          <button type="button" className="cm-ai-clear" onClick={clear} aria-label="Quitar búsqueda con IA">
            <X width={13} height={13} aria-hidden="true" />
            Quitar
          </button>
        </div>
      ) : null}
      <style>{CSS}</style>
    </div>
  );
}

/* Cristal de la maqueta v4 (.ai y .chip); mismos tokens que la barra de zonas. */
const CSS = `
.cm-ai-wrap{--ai-glass:rgba(255,255,255,.74);--ai-line:rgba(255,255,255,.7);--ai-ink:#0a0a0a;--ai-muted:#6f685d;--ai-gold:#c9a96e;--ai-gold-dark:#a88a52;--ai-err:#9a2f1f;
  font-family:Lato,"Helvetica Neue",Arial,sans-serif;display:flex;flex-direction:column;gap:6px;min-width:220px;position:relative}
.cm-theme-dark .cm-ai-wrap,.cm-root.cm-dark .cm-ai-wrap{--ai-glass:rgba(24,22,19,.66);--ai-line:rgba(255,255,255,.09);--ai-ink:#f3eee6;--ai-muted:#a39b8f;--ai-gold-dark:#c9a96e;--ai-err:#f0a090}
.cm-ai,.cm-ai-chip,.cm-ai-clear{background:var(--ai-glass);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);
  border:1px solid var(--ai-line);color:var(--ai-ink)}
.cm-ai{display:flex;align-items:center;gap:10px;padding:6px 8px 6px 14px;border-radius:14px;box-shadow:0 10px 30px rgba(40,30,10,.16)}
.cm-ai:focus-within{outline:2px solid var(--ai-gold);outline-offset:2px}
.cm-ai-ico{color:var(--ai-gold-dark);flex:none}
.cm-ai input{flex:1;min-width:0;border:0;background:none;outline:none;font:500 13px Lato,"Helvetica Neue",Arial,sans-serif;color:var(--ai-ink);padding:6px 0}
.cm-ai input::placeholder{color:var(--ai-muted)}
.cm-ai input:disabled{opacity:.6}
.cm-ai kbd{font:700 11px Lato,"Helvetica Neue",Arial,sans-serif;padding:3px 7px;border-radius:6px;border:1px solid var(--ai-line);color:var(--ai-muted)}
.cm-ai-cancel{border:0;background:rgba(201,169,110,.22);color:var(--ai-ink);font:700 11.5px Lato,"Helvetica Neue",Arial,sans-serif;padding:6px 10px;border-radius:8px;cursor:pointer}
.cm-ai-cancel:hover{background:rgba(201,169,110,.4)}
.cm-ai-cancel:focus-visible,.cm-ai-clear:focus-visible{outline:2px solid var(--ai-gold);outline-offset:2px}
.cm-ai-status{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.cm-ai-error{margin:0;padding:7px 12px;border-radius:10px;font:600 12px/1.35 Lato,"Helvetica Neue",Arial,sans-serif;color:var(--ai-err);
  background:var(--ai-glass);border:1px solid var(--ai-line);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);width:max-content;max-width:100%}
.cm-ai-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.cm-ai-chip{padding:5px 10px;border-radius:999px;font:700 11.5px Lato,"Helvetica Neue",Arial,sans-serif;display:flex;gap:6px;align-items:center;box-shadow:0 4px 14px rgba(40,30,10,.12)}
.cm-ai-chip i{width:6px;height:6px;border-radius:50%;background:var(--ai-gold);display:block}
.cm-ai-clear{display:flex;gap:4px;align-items:center;padding:5px 9px;border-radius:999px;font:600 11.5px Lato,"Helvetica Neue",Arial,sans-serif;color:var(--ai-muted);cursor:pointer}
.cm-ai-clear:hover{color:var(--ai-ink)}
`;
