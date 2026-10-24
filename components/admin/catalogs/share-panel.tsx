"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, Link2 } from "lucide-react";
import type { ActionResult } from "@/lib/catalogs/access";
import {
  SHARE_DEFAULT_DAYS,
  SHARE_MAX_DAYS,
  SHARE_MIN_DAYS,
  parseShareDays,
  shareExpiryLabel,
  sharePath,
} from "@/lib/catalogs/share";

// Enlace para compartir el catálogo (BCP-01 T7, D11/D16): uno activo por
// catálogo, 60 días por defecto (1–365), renovación con el mismo enlace y
// revocación manual. Interfaz del admin en Lato.

export interface ShareView {
  token: string;
  expiresAt: string;
  expired: boolean;
}

type ShareRes = ActionResult<{ token: string; expiresAt: string }>;

export interface ShareActions {
  create: (i: { catalogId: string; days: number }) => Promise<ShareRes>;
  renew: (i: { catalogId: string; days: number }) => Promise<ShareRes>;
  revoke: (i: { catalogId: string }) => Promise<ActionResult<object>>;
}

export function SharePanel({
  catalogId,
  share: initial,
  archived,
  actions,
  onChange,
}: {
  catalogId: string;
  share: ShareView | null;
  archived: boolean;
  actions: ShareActions;
  onChange?: (share: ShareView | null) => void;
}) {
  const [share, setShare] = useState(initial);
  const [days, setDays] = useState(String(SHARE_DEFAULT_DAYS));
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [origin, setOrigin] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => setShare(initial), [initial]);
  useEffect(() => setOrigin(window.location.origin), []);

  const parsed = parseShareDays(days);
  const url = share ? `${origin}${sharePath(share.token)}` : "";

  function update(next: ShareView | null) {
    setShare(next);
    onChange?.(next);
  }

  function run(fn: () => Promise<ShareRes>, ok: string) {
    if (!parsed.ok) {
      setMessage({ kind: "error", text: "La duración del enlace tiene que ser de 1 a 365 días." });
      return;
    }
    setMessage(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setMessage({ kind: "error", text: res.error });
        return;
      }
      update({ token: res.token, expiresAt: res.expiresAt, expired: false });
      setMessage({ kind: "ok", text: ok });
    });
  }

  function revoke() {
    if (!window.confirm("¿Revocar el enlace? Dejará de funcionar al momento para quien lo tenga abierto. Si luego creas otro, será un enlace distinto.")) return;
    setMessage(null);
    start(async () => {
      const res = await actions.revoke({ catalogId });
      if (!res.ok) {
        setMessage({ kind: "error", text: res.error });
        return;
      }
      update(null);
      setMessage({ kind: "ok", text: "Enlace revocado." });
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage({ kind: "ok", text: "Enlace copiado." });
    } catch {
      setMessage({ kind: "error", text: "No se ha podido copiar. Selecciona el enlace y cópialo a mano." });
    }
  }

  const daysField = (
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
      />
      <span>días</span>
    </label>
  );

  return (
    <section className="space-y-3 rounded-xl border border-gold/20 bg-white/60 p-4" aria-labelledby="sp-title" data-check-overflow="enlace">
      {/* Rediseño 2026-10-23 (D7): el enlace general, distinto a simple vista del personal. */}
      <div>
        <h2 id="sp-title" tabIndex={-1} className="flex items-center gap-2 text-base font-medium text-ink focus:outline-none">
          <Link2 className="h-5 w-5 text-gold-text" aria-hidden="true" /> Enlace general
        </h2>
        <p className="mt-1 text-sm text-ink/65">Un solo enlace para compartir el catálogo sin atribuir opiniones a ningún cliente.</p>
      </div>

      {share ? (
        <>
          <div className="flex min-w-0 items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Enlace del catálogo"
              className="min-w-0 flex-1 truncate rounded-lg border border-gold/25 bg-white px-2 py-1.5 text-xs text-ink/80"
              data-testid="share-url"
            />
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-lg border border-gold/40 p-1.5 text-ink/70 hover:bg-white"
              aria-label="Copiar enlace"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className={`text-xs ${share.expired ? "text-red-700" : "text-ink/55"}`} data-testid="share-expiry">
            {share.expired ? "Caducado el " : "Caduca el "}
            {shareExpiryLabel(share.expiresAt)}
            {archived ? " · no se puede abrir mientras el catálogo esté archivado" : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {daysField}
            <button
              type="button"
              disabled={pending || archived || !parsed.ok}
              onClick={() => parsed.ok && run(() => actions.renew({ catalogId, days: parsed.days }), "Enlace renovado: es el mismo enlace, con la nueva fecha.")}
              className="rounded-lg border border-gold/40 px-3 py-1.5 text-sm text-ink/80 hover:bg-white disabled:opacity-50"
            >
              Renovar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={revoke}
              className="rounded-lg px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Revocar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-ink/55">
            {archived
              ? "Reactiva el catálogo para poder compartirlo."
              : "Nadie más puede ver este catálogo hasta que crees un enlace. Quien lo tenga lo verá en vivo mientras no caduque ni lo revoques."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {daysField}
            <button
              type="button"
              disabled={pending || archived || !parsed.ok}
              onClick={() => parsed.ok && run(() => actions.create({ catalogId, days: parsed.days }), "Enlace creado.")}
              className="rounded-lg bg-gold/90 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gold disabled:opacity-50"
            >
              Crear enlace
            </button>
          </div>
        </>
      )}

      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`rounded-lg px-2 py-1.5 text-xs ${message.kind === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
