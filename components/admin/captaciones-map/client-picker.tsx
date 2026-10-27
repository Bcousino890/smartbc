"use client";

import { ChevronDown, Search, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export type PickedClient = { id: string; name: string };

export interface ClientPickerProps {
  value: PickedClient | null;
  onChange(c: PickedClient | null): void;
  /** Resumen del encargo («Alquiler · hasta 1.400 € · 2 hab.»); lo aporta quien lo monta. */
  subtitle?: string;
  className?: string;
  /** Solo si no cuelga de `.cm-theme-dark`. */
  theme?: "light" | "dark";
}

type ClientRow = { id: string; full_name: string | null; email: string | null };
type Status = "idle" | "loading" | "ok" | "error";

/** Espera antes de buscar: evita una petición por cada tecla. */
const DEBOUNCE_MS = 250;
const CLEAR_ID = "__clear";

function displayName(c: ClientRow): string {
  return c.full_name?.trim() || c.email?.trim() || "Sin nombre";
}

function initialOf(name: string): string {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

/**
 * Selector de cliente del mapa de captaciones: píldora de cristal (maqueta v4)
 * que al pulsarla abre un buscador. Patrón combobox/listbox con navegación por
 * teclado. Cada búsqueda cancela la anterior (AbortController) para que una
 * respuesta lenta no pise a otra más reciente.
 */
export default function ClientPicker({ value, onChange, subtitle, className, theme }: ClientPickerProps) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Opciones navegables: «Quitar cliente» primero (si hay uno elegido) y luego los resultados.
  const options: { id: string; kind: "clear" | "client"; row?: ClientRow }[] = [
    ...(value ? [{ id: CLEAR_ID, kind: "clear" as const }] : []),
    ...rows.map((row) => ({ id: row.id, kind: "client" as const, row })),
  ];
  const optId = (i: number) => `${uid}-opt-${i}`;

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Búsqueda con debounce; al abrir (query vacía) trae los más recientes.
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setStatus("loading");
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/clientes/search?q=${encodeURIComponent(query.trim())}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { data?: ClientRow[] };
        setRows(Array.isArray(json.data) ? json.data : []);
        setActive(0);
        setStatus("ok");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setRows([]);
        setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [open, query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Clic fuera cierra el desplegable.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);

  const choose = (i: number) => {
    const o = options[i];
    if (!o) return;
    if (o.kind === "clear") onChange(null);
    else if (o.row) onChange({ id: o.row.id, name: displayName(o.row) });
    close(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (options.length) setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (options.length) setActive((a) => (a - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    }
  };

  const title = value ? `Captando para ${value.name}` : "Elegir cliente";
  const sub = value ? subtitle : "Puntúa los anuncios según su encargo";

  return (
    <div
      ref={rootRef}
      className={`cpk ${theme === "dark" ? "cpk-dark" : ""} ${className ?? ""}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className="cpk-pill"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <span className="cpk-av" aria-hidden="true">{value ? initialOf(value.name) : "?"}</span>
        <span className="cpk-txt">
          <b>{title}</b>
          {sub ? <small>{sub}</small> : null}
        </span>
        <ChevronDown width={16} height={16} aria-hidden="true" className="cpk-chev" />
      </button>

      {open ? (
        <div className="cpk-pop">
          <div className="cpk-search">
            <Search width={15} height={15} aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={options.length ? optId(active) : undefined}
              aria-label="Buscar cliente por nombre o email"
              placeholder="Buscar por nombre o email"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Clientes" className="cpk-list">
            {options.map((o, i) => (
              <li
                key={o.id}
                id={optId(i)}
                role="option"
                aria-selected={i === active}
                className={`${i === active ? "cpk-act" : ""} ${o.kind === "clear" ? "cpk-clear" : ""}`}
                onMouseEnter={() => setActive(i)}
                // pointerdown y no click: evita que el input pierda el foco antes de elegir.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                {o.kind === "clear" ? (
                  <>
                    <X width={14} height={14} aria-hidden="true" />
                    <span>Quitar cliente</span>
                  </>
                ) : o.row ? (
                  <>
                    <span className="cpk-av cpk-av-s" aria-hidden="true">{initialOf(displayName(o.row))}</span>
                    <span className="cpk-txt">
                      <b>{displayName(o.row)}</b>
                      {o.row.email && o.row.full_name ? <small>{o.row.email}</small> : null}
                    </span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="cpk-state" role="status" aria-live="polite">
            {status === "loading"
              ? "Buscando clientes…"
              : status === "error"
                ? "No se pudo buscar. Inténtalo de nuevo."
                : status === "ok" && rows.length === 0
                  ? query.trim()
                    ? "Ningún cliente coincide con la búsqueda."
                    : "No hay clientes disponibles."
                  : ""}
          </p>
        </div>
      ) : null}
      <style>{CSS}</style>
    </div>
  );
}

/* Cristal de la maqueta v4 (.clientpill): blanco .74 + desenfoque; avatar navy. */
const CSS = `
.cpk{--pk-glass:rgba(255,255,255,.74);--pk-solid:#fff;--pk-line:rgba(255,255,255,.7);--pk-edge:#e8e0d0;--pk-ink:#0a0a0a;--pk-muted:#7d766c;--pk-hover:rgba(201,169,110,.18);--pk-av:#1b2a4a;
  position:relative;display:inline-block;max-width:100%;font-family:Lato,"Helvetica Neue",Arial,sans-serif;color:var(--pk-ink)}
.cm-theme-dark .cpk,.cpk.cpk-dark{--pk-glass:rgba(24,22,19,.66);--pk-solid:#1d1a16;--pk-line:rgba(255,255,255,.09);--pk-edge:rgba(255,255,255,.12);--pk-ink:#f3eee6;--pk-muted:#a39b8f;--pk-av:#c9a96e}
.cpk-pill{display:flex;align-items:center;gap:10px;max-width:100%;padding:7px 12px 7px 8px;border-radius:999px;cursor:pointer;color:inherit;font:inherit;text-align:left;
  background:var(--pk-glass);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);
  border:1px solid var(--pk-line);box-shadow:0 10px 30px rgba(40,30,10,.16)}
.cpk-pill:focus-visible,.cpk-list li:focus-visible{outline:2px solid #c9a96e;outline-offset:2px}
.cpk-av{flex:none;width:30px;height:30px;border-radius:50%;background:var(--pk-av);color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px}
.cm-theme-dark .cpk-av,.cpk-dark .cpk-av{color:#0a0a0a}
.cpk-av-s{width:26px;height:26px;font-size:12px}
.cpk-txt{min-width:0;display:flex;flex-direction:column}
.cpk-txt b{font-weight:700;font-size:13.5px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpk-txt small{color:var(--pk-muted);font-size:12px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpk-chev{flex:none;color:var(--pk-muted)}
.cpk-pop{position:absolute;z-index:1000;top:calc(100% + 6px);left:0;width:320px;max-width:calc(100vw - 32px);padding:6px;border-radius:14px;
  background:var(--pk-solid);border:1px solid var(--pk-edge);box-shadow:0 14px 36px rgba(40,30,10,.22)}
.cpk-search{display:flex;align-items:center;gap:8px;padding:0 10px;border-radius:10px;border:1px solid var(--pk-edge);color:var(--pk-muted)}
.cpk-search input{flex:1;min-width:0;border:0;background:none;outline:0;padding:9px 0;font:500 13px Lato,"Helvetica Neue",Arial,sans-serif;color:var(--pk-ink)}
.cpk-search:focus-within{border-color:#c9a96e;box-shadow:0 0 0 2px rgba(201,169,110,.3)}
.cpk-list{list-style:none;margin:6px 0 0;padding:0;max-height:264px;overflow:auto}
.cpk-list li{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:10px;cursor:pointer}
.cpk-list li.cpk-act{background:var(--pk-hover)}
.cpk-list li.cpk-clear{color:var(--pk-muted);font-size:13px;font-weight:600;gap:8px}
.cpk-state{margin:0;padding:8px 10px;font-size:12.5px;color:var(--pk-muted);min-height:0}
.cpk-state:empty{display:none}
`;
