"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Copy, UserPlus } from "lucide-react";
import type { ClientLinkActions, ClientLinkView, ClientOption } from "@/lib/catalogs/feedback-rules";
import { SHARE_DEFAULT_DAYS, SHARE_MAX_DAYS, SHARE_MIN_DAYS, parseShareDays, shareExpiryLabel, sharePath } from "@/lib/catalogs/share";

// «Asignar a cliente» (0218, DC10–DC11): el MISMO catálogo, un enlace
// personal por cliente del CRM, sin inicio de sesión. Con ese enlace el
// cliente valora cada vivienda; la opinión se ve en su ficha y avisa a su
// asesor dentro del CRM. El enlace general nunca atribuye opiniones.

const STATE_LABEL: Record<ClientLinkView["state"], string> = { active: "Activo", expired: "Caducado", revoked: "Revocado" };

type Msg = { kind: "ok" | "error"; text: string } | null;

export function ClientLinksPanel({ catalogId, archived, actions }: { catalogId: string; archived: boolean; actions: ClientLinkActions }) {
  const [links, setLinks] = useState<ClientLinkView[] | null>(null);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<ClientOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<ClientOption | null>(null);
  const [days, setDays] = useState(String(SHARE_DEFAULT_DAYS));
  const [msg, setMsg] = useState<Msg>(null);
  const [origin, setOrigin] = useState("");
  const [pending, start] = useTransition();
  const seq = useRef(0);
  const parsed = parseShareDays(days);

  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    const res = await actions.list({ catalogId });
    if (res.ok) setLinks(res.links);
    else setMsg({ kind: "error", text: res.error });
  }, [actions, catalogId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Búsqueda con espera corta; una respuesta vieja no pisa a la nueva.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setOptions([]);
      return;
    }
    const n = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await actions.search({ catalogId, q: term });
      if (n !== seq.current) return;
      setSearching(false);
      if (res.ok) setOptions(res.clients);
      else setMsg({ kind: "error", text: res.error });
    }, 250);
    return () => clearTimeout(t);
  }, [q, actions, catalogId]);

  function assign() {
    if (!chosen || !parsed.ok) return;
    setMsg(null);
    start(async () => {
      const res = await actions.create({ catalogId, clientId: chosen.id, days: parsed.days });
      if (!res.ok) {
        setMsg({ kind: "error", text: res.error });
        return;
      }
      setChosen(null);
      setQ("");
      setOptions([]);
      await load();
      setMsg({ kind: "ok", text: `Enlace personal creado para ${res.link.clientName}. Cópialo y envíaselo tú.` });
    });
  }

  function renew(l: ClientLinkView) {
    if (!parsed.ok) {
      setMsg({ kind: "error", text: "La duración del enlace tiene que ser de 1 a 365 días." });
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await actions.renew({ catalogId, linkId: l.id, days: parsed.days });
      if (!res.ok) return setMsg({ kind: "error", text: res.error });
      await load();
      setMsg({ kind: "ok", text: `Enlace de ${l.clientName} renovado: es el mismo enlace, con la nueva fecha.` });
    });
  }

  function revoke(l: ClientLinkView) {
    if (!window.confirm(`¿Revocar el enlace personal de ${l.clientName}? Dejará de funcionar al momento. Sus opiniones se conservan en su ficha.`)) return;
    setMsg(null);
    start(async () => {
      const res = await actions.revoke({ catalogId, linkId: l.id });
      if (!res.ok) return setMsg({ kind: "error", text: res.error });
      await load();
      setMsg({ kind: "ok", text: `Enlace de ${l.clientName} revocado.` });
    });
  }

  async function copy(l: ClientLinkView) {
    try {
      await navigator.clipboard.writeText(`${origin}${sharePath(l.token)}`);
      setMsg({ kind: "ok", text: `Enlace de ${l.clientName} copiado.` });
    } catch {
      setMsg({ kind: "error", text: "No se ha podido copiar. Selecciona el enlace y cópialo a mano." });
    }
  }

  const current = (links ?? []).filter((l) => l.state !== "revoked");
  const revoked = (links ?? []).filter((l) => l.state === "revoked");

  return (
    <section className="space-y-3 rounded-xl border border-gold/20 bg-white/60 p-4" aria-labelledby="cl-title" data-testid="client-links" data-check-overflow="clientes">
      {/* Rediseño 2026-10-23 (D7): enlaces personales, distintos del general. */}
      <h2 id="cl-title" className="flex items-center gap-2 text-base font-medium text-ink">
        <UserPlus className="h-5 w-5 text-[#856329]" aria-hidden="true" /> Para un cliente · enlace personal
      </h2>
      <p className="text-sm text-ink/65">
        Cada cliente recibe su propio enlace a este mismo catálogo, sin contraseña. Con él puede valorar cada vivienda; la opinión aparece en su
        ficha del CRM y avisa a su asesor. No se envía nada solo: el enlace lo mandas tú. Quien lo reciba reenviado podrá opinar en su nombre.
      </p>

      {archived ? (
        <p className="text-xs text-ink/55">Reactiva el catálogo para asignarlo a un cliente.</p>
      ) : (
        <div className="space-y-2">
          <label htmlFor="cl-search" className="block text-sm text-ink/70">
            Cliente del CRM
          </label>
          <input
            id="cl-search"
            type="search"
            value={chosen ? chosen.name : q}
            onChange={(e) => {
              setChosen(null);
              setQ(e.target.value);
            }}
            placeholder="Nombre o correo"
            autoComplete="off"
            aria-controls="cl-options"
            className="w-full rounded-lg border border-gold/25 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-gold"
            data-testid="client-search"
          />
          {!chosen && q.trim().length >= 2 ? (
            <ul id="cl-options" className="max-h-56 overflow-y-auto rounded-lg border border-gold/15 bg-white" aria-label="Clientes encontrados" data-testid="client-options">
              {searching && options.length === 0 ? <li className="px-3 py-2 text-xs text-ink/50">Buscando…</li> : null}
              {!searching && options.length === 0 ? <li className="px-3 py-2 text-xs text-ink/50">Ningún cliente a tu alcance con ese nombre o correo.</li> : null}
              {options.map((o) => {
                const has = current.some((l) => l.clientId === o.id && l.state === "active");
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setChosen(o)}
                      className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-cream-50 focus:bg-cream-50 focus:outline-none"
                      data-testid="client-option"
                    >
                      <span className="min-w-0 truncate text-ink">{o.name}</span>
                      <span className="shrink-0 text-xs text-ink/45">{has ? "ya tiene enlace" : o.detail}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <span>Duración</span>
              <input
                type="number"
                inputMode="numeric"
                min={SHARE_MIN_DAYS}
                max={SHARE_MAX_DAYS}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                aria-invalid={!parsed.ok}
                className="w-20 rounded-lg border border-gold/25 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-gold aria-[invalid=true]:border-red-400"
                data-testid="client-days"
              />
              <span>días</span>
            </label>
            <button
              type="button"
              onClick={assign}
              disabled={pending || !chosen || !parsed.ok}
              className="rounded-lg bg-gold/90 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gold disabled:opacity-50"
              data-testid="client-assign"
            >
              {chosen ? `Crear enlace para ${chosen.name}` : "Elige un cliente"}
            </button>
          </div>
        </div>
      )}

      {links === null ? (
        <p className="text-xs text-ink/50">Cargando asignaciones…</p>
      ) : current.length === 0 ? (
        <p className="text-xs text-ink/55" data-testid="client-links-empty">
          Todavía no lo has asignado a ningún cliente.
        </p>
      ) : (
        <ul className="divide-y divide-gold/10" data-testid="client-links-list">
          {current.map((l) => (
            <li key={l.id} className="space-y-2 py-3" data-testid="client-link">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-ink">{l.clientName}</span>
                <span className={`text-xs ${l.state === "active" ? "text-emerald-800" : "text-red-700"}`}>
                  {STATE_LABEL[l.state]} · {l.state === "expired" ? "caducó el " : "caduca el "}
                  {shareExpiryLabel(l.expiresAt)}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <input
                  readOnly
                  value={`${origin}${sharePath(l.token)}`}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={`Enlace personal de ${l.clientName}`}
                  className="min-w-0 flex-1 truncate rounded-lg border border-gold/25 bg-white px-2 py-1.5 text-xs text-ink/80"
                  data-testid="client-link-url"
                />
                <button type="button" onClick={() => copy(l)} className="shrink-0 rounded-lg border border-gold/40 p-1.5 text-ink/70 hover:bg-white" aria-label={`Copiar el enlace de ${l.clientName}`}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink/60" data-testid="client-link-feedback">
                  {l.feedbackCount === 0 ? "Sin opiniones todavía" : l.feedbackCount === 1 ? "1 opinión" : `${l.feedbackCount} opiniones`}
                </span>
                <button type="button" disabled={pending || archived || !parsed.ok} onClick={() => renew(l)} className="rounded-lg border border-gold/40 px-2.5 py-1 text-ink/80 hover:bg-white disabled:opacity-50">
                  Renovar
                </button>
                <button type="button" disabled={pending} onClick={() => revoke(l)} className="rounded-lg px-2.5 py-1 text-red-700 hover:bg-red-50 disabled:opacity-50" data-testid="client-link-revoke">
                  Revocar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {revoked.length ? (
        <details className="text-xs text-ink/60">
          <summary className="cursor-pointer">Revocados ({revoked.length}) · sus opiniones siguen en la ficha de cada cliente</summary>
          <ul className="mt-2 space-y-1">
            {revoked.map((l) => (
              <li key={l.id}>
                {l.clientName} · {l.feedbackCount === 1 ? "1 opinión" : `${l.feedbackCount} opiniones`}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {msg ? (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={`rounded-lg px-2 py-1.5 text-xs ${msg.kind === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
          data-testid="client-links-message"
        >
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
