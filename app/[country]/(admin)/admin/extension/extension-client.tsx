"use client";

// ============================================================================
// Conectar la extensión con el usuario del CRM, sin pegar tokens.
//
// La página y la extensión hablan por `window.postMessage` con el content
// script `chrome-extension/crm-connect.js`, que solo se inyecta en esta página
// del dominio del CRM:
//
//   página → extensión  {source:"smartbc-crm", type:"ping"}
//   extensión → página  {source:"smartbc-extension", type:"present", extensionId, version, connectedAs}
//   página → extensión  {source:"smartbc-crm", type:"connect", token, user}
//   extensión → página  {source:"smartbc-extension", type:"connected", user} | {type:"error", error}
//
// El token lo crea el servidor con la sesión del CRM (la de siempre, con su
// contraseña) y atado al ID de ESTA extensión: no sirve en ninguna otra.
// ============================================================================

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Chrome, Loader2, LogOut, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button, Labeled, Panel, TextArea, TextInput } from "@/components/admin/ui/primitives";
import type { ExtensionSecurity, ExtensionSessionRow } from "@/lib/extension/sessions";
import { revokeSession, revokeUserSessions, saveExtensionSecurity } from "./actions";

type Presence =
  | { state: "detecting" }
  | { state: "absent" }
  | { state: "present"; extensionId: string; version: string; connectedAs: string | null };

type ConnectState =
  | { state: "idle" }
  | { state: "working" }
  | { state: "done"; name: string }
  | { state: "error"; error: string };

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-ES", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export function ExtensionClient({
  me,
  mine,
  all,
  isAdmin,
  security,
}: {
  me: { id: string; name: string };
  mine: ExtensionSessionRow[];
  all: ExtensionSessionRow[];
  isAdmin: boolean;
  security: ExtensionSecurity;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [presence, setPresence] = useState<Presence>({ state: "detecting" });
  const [connect, setConnect] = useState<ConnectState>({ state: "idle" });
  const ackRef = useRef<((ok: boolean, payload: string) => void) | null>(null);
  const autoTried = useRef(false);

  // ── Hablar con la extensión ──
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.source !== "smartbc-extension") return;
      if (data.type === "present") {
        setPresence({
          state: "present",
          extensionId: String(data.extensionId ?? ""),
          version: String(data.version ?? ""),
          connectedAs: typeof data.connectedAs === "string" ? data.connectedAs : null,
        });
      } else if (data.type === "connected") {
        ackRef.current?.(true, String((data.user as { name?: string } | undefined)?.name ?? me.name));
      } else if (data.type === "error") {
        ackRef.current?.(false, String(data.error ?? "La extensión no pudo guardar la conexión."));
      }
    };
    window.addEventListener("message", onMessage);

    // El content script puede cargar después que la página: se pregunta unas
    // cuantas veces antes de dar la extensión por no instalada.
    let tries = 0;
    const ping = () => window.postMessage({ source: "smartbc-crm", type: "ping" }, window.location.origin);
    ping();
    const timer = window.setInterval(() => {
      tries += 1;
      ping();
      if (tries >= 8) {
        window.clearInterval(timer);
        setPresence((p) => (p.state === "detecting" ? { state: "absent" } : p));
      }
    }, 400);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(timer);
    };
  }, [me.name]);

  const doConnect = useCallback(async () => {
    if (presence.state !== "present") return;
    setConnect({ state: "working" });
    try {
      const res = await fetch("/api/extension/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extensionId: presence.extensionId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.token) {
        setConnect({ state: "error", error: body.error ?? `Error ${res.status}` });
        return;
      }
      const acked = await new Promise<{ ok: boolean; payload: string }>((resolve) => {
        const timeout = window.setTimeout(
          () => resolve({ ok: false, payload: "La extensión no respondió. Recarga la página y vuelve a probar." }),
          4000,
        );
        ackRef.current = (ok, payload) => {
          window.clearTimeout(timeout);
          resolve({ ok, payload });
        };
        window.postMessage(
          { source: "smartbc-crm", type: "connect", token: body.token, user: body.user },
          window.location.origin,
        );
      });
      ackRef.current = null;
      if (!acked.ok) {
        setConnect({ state: "error", error: acked.payload });
        return;
      }
      setConnect({ state: "done", name: acked.payload });
      setPresence((p) => (p.state === "present" ? { ...p, connectedAs: acked.payload } : p));
      router.refresh();
    } catch {
      setConnect({ state: "error", error: "No se pudo contactar con el servidor." });
    }
  }, [presence, router]);

  // Desde el botón "Conectar" de la extensión se llega con ?conectar=1: se
  // conecta solo, sin otro clic. SIEMPRE, aunque la extensión diga que ya
  // está conectada: si alguien pulsó "Conectar" o "Volver a conectar", es que
  // la sesión que tiene ya no vale (revocada o caducada).
  useEffect(() => {
    if (autoTried.current || params?.get("conectar") !== "1") return;
    if (presence.state === "present") {
      autoTried.current = true;
      void doConnect();
    }
  }, [params, presence, doConnect]);

  return (
    <div className="mt-7 space-y-5">
      <Panel title="Este navegador">
        <div className="px-4 py-4">
          {presence.state === "detecting" && (
            <p className="flex items-center gap-2 text-sm text-ink/60">
              <Loader2 size={14} className="animate-spin" /> Buscando la extensión…
            </p>
          )}

          {presence.state === "absent" && (
            <div className="space-y-2 text-sm text-ink/70">
              <p className="flex items-center gap-2 font-medium text-ink">
                <Chrome size={16} /> No encontramos la extensión en este navegador.
              </p>
              {security.storeUrl ? (
                <p>
                  Instálala desde{" "}
                  <a href={security.storeUrl} target="_blank" rel="noreferrer" className="text-gold-dark underline">
                    la Chrome Web Store
                  </a>{" "}
                  y recarga esta página.
                </p>
              ) : (
                <p>Pide el enlace de instalación a un administrador, instálala y recarga esta página.</p>
              )}
            </div>
          )}

          {presence.state === "present" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                {connect.state === "done" || presence.connectedAs ? (
                  <p className="flex items-center gap-2 font-medium text-emerald-700">
                    <CheckCircle2 size={16} /> Conectada como{" "}
                    {connect.state === "done" ? connect.name : presence.connectedAs}
                  </p>
                ) : (
                  <p className="font-medium text-ink">La extensión está instalada pero sin conectar.</p>
                )}
                <p className="mt-1 text-xs text-ink/45">Versión {presence.version || "—"}</p>
              </div>
              <Button variant="primary" onClick={doConnect} disabled={connect.state === "working"}>
                {connect.state === "working" ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Conectando…
                  </>
                ) : presence.connectedAs || connect.state === "done" ? (
                  `Volver a conectar como ${me.name}`
                ) : (
                  `Conectar como ${me.name}`
                )}
              </Button>
            </div>
          )}

          {connect.state === "error" && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-rose-700">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {connect.error}
            </p>
          )}

          <p className="mt-4 border-t border-ink/8 pt-3 text-xs text-ink/45">
            La extensión entra con tu usuario: ve los mismos clientes que tú en el CRM, deja constancia de quién
            mandó cada anuncio y deja de funcionar si se desconecta desde aquí o si tu usuario pierde el acceso.
            No guarda ninguna contraseña.
          </p>
        </div>
      </Panel>

      <SessionsPanel title="Mis navegadores conectados" sessions={mine} showUser={false} />

      {isAdmin && (
        <>
          <SessionsPanel title="Todo el equipo" sessions={all} showUser />
          <SecurityPanel security={security} sessions={all} />
        </>
      )}
    </div>
  );
}

function SessionsPanel({
  title,
  sessions,
  showUser,
}: {
  title: string;
  sessions: ExtensionSessionRow[];
  showUser: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const revoke = (id: string) =>
    start(async () => {
      setError(null);
      const r = await revokeSession(id);
      if (!r.ok) setError(r.error);
      router.refresh();
    });

  const revokeUser = (userId: string, name: string) => {
    if (!window.confirm(`¿Desconectar TODOS los navegadores de ${name}?`)) return;
    start(async () => {
      setError(null);
      const r = await revokeUserSessions(userId);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  };

  return (
    <Panel title={title} count={sessions.length}>
      {sessions.length === 0 ? (
        <p className="px-4 py-5 text-sm text-ink/45">Ningún navegador conectado.</p>
      ) : (
        <ul className="divide-y divide-ink/8">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                {showUser && <p className="font-medium text-ink">{s.userName || s.userEmail || "—"}</p>}
                <p className={showUser ? "text-xs text-ink/60" : "font-medium text-ink"}>
                  {s.label || "Navegador"} <span className="font-mono text-xs text-ink/40">{s.prefix}…</span>
                </p>
                <p className="text-xs text-ink/45">
                  Conectada {fmt(s.createdAt)} · último uso {fmt(s.lastUsedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {showUser && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => revokeUser(s.userId, s.userName || "este usuario")}>
                    Todos los suyos
                  </Button>
                )}
                <Button size="sm" disabled={pending} onClick={() => revoke(s.id)}>
                  <LogOut size={12} /> Desconectar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="px-4 pb-3 text-xs text-rose-700">{error}</p>}
    </Panel>
  );
}

function SecurityPanel({
  security,
  sessions,
}: {
  security: ExtensionSecurity;
  sessions: ExtensionSessionRow[];
}) {
  const router = useRouter();
  const [legacy, setLegacy] = useState(security.legacyTokenEnabled);
  const [ids, setIds] = useState(security.allowedExtensionIds.join("\n"));
  const [storeUrl, setStoreUrl] = useState(security.storeUrl ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const seenIds = [...new Set(sessions.map((s) => s.extensionId).filter(Boolean))] as string[];

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await saveExtensionSecurity({
        legacyTokenEnabled: legacy,
        allowedExtensionIds: ids.split(/[\s,]+/),
        storeUrl: storeUrl || null,
      });
      setMsg(r.ok ? { ok: true, text: "Guardado." } : { ok: false, text: r.error });
      router.refresh();
    });

  return (
    <Panel title="Seguridad de la extensión">
      <div className="space-y-5 px-4 py-4 text-sm">
        <div className="flex items-start gap-2 text-xs text-ink/55">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-gold-dark" />
          <p>
            Cada token va atado a su usuario y a la instalación que lo pidió. Con el ID de la Chrome Web Store
            apuntado abajo, una copia de la extensión (que tendría otro ID) no puede ni conectarse ni usar un token
            robado.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={legacy}
            onChange={(e) => setLegacy(e.target.checked)}
            className="mt-1 h-3.5 w-3.5 accent-[#8a6d3b]"
          />
          <span>
            Aceptar todavía el token compartido antiguo (extensión 1.x)
            <span className="block text-xs text-ink/45">
              No dice quién es, dura un año y da acceso a toda la lista de clientes. Apágalo en cuanto todo el
              equipo haya conectado la versión 2.
            </span>
          </span>
        </label>

        <Labeled label="IDs de extensión admitidos (uno por línea; vacío = cualquiera)">
          <TextArea
            rows={2}
            value={ids}
            onChange={(e) => setIds(e.target.value)}
            placeholder="El ID que da la Chrome Web Store al publicar (32 letras)"
            className="font-mono text-xs"
          />
        </Labeled>
        {seenIds.length > 0 && (
          <p className="-mt-3 text-xs text-ink/45">
            En uso ahora mismo:{" "}
            {seenIds.map((id) => (
              <code key={id} className="me-2 font-mono">
                {id}
              </code>
            ))}
          </p>
        )}

        <Labeled label="Enlace de instalación (Chrome Web Store)">
          <TextInput
            value={storeUrl}
            onChange={(e) => setStoreUrl(e.target.value)}
            placeholder="https://chromewebstore.google.com/detail/…"
          />
        </Labeled>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={save} disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          {msg && <p className={msg.ok ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>{msg.text}</p>}
        </div>
      </div>
    </Panel>
  );
}
