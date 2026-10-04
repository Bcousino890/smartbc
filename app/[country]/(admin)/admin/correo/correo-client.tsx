"use client";

import {
  AlertTriangle,
  Check,
  Archive,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  Flame,
  Folder,
  Forward,
  Inbox,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MailOpen,
  Paperclip,
  PenLine,
  Pencil,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  Signature,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { requestJson } from "@/lib/http/request-json";
import {
  formatBytes,
  LARGE_FILE_LINK_DAYS,
  MAX_ATTACHED_TOTAL_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES_PER_MAIL,
  planDelivery,
  UPLOAD_CHUNK_BYTES,
  UPLOAD_FALLBACK_CHUNK_BYTES,
} from "@/lib/mailbox/attachments";
import { buildViewerDocument } from "@/lib/mailbox/compose";
import { buildAutoSignatureHtml, type SignatureMode, type SignatureProfile } from "@/lib/mailbox/signature";
import { cn } from "@/lib/utils";

// ─── Tipos (espejo de lo que devuelven /api/admin/correo/**) ────────────────

type Account = {
  connected: boolean;
  email: string | null;
  suggestedEmail: string | null;
  allowedDomains: string[];
  connectedAt: string | null;
  lastError: string | null;
  server: { imap: string; smtp: string };
  signature: {
    mode: SignatureMode;
    customHtml: string | null;
    title: string | null;
    defaultTitle: string;
    autoHtml: string;
    profile: SignatureProfile;
    appUrl: string;
  };
};

type Folder = { path: string; name: string; specialUse: string | null; unseen: number; total: number };
type Addr = { name: string | null; address: string | null };

type ListItem = {
  uid: number;
  subject: string;
  from: Addr | null;
  to: Addr[];
  date: string | null;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  hasAttachments: boolean;
};

type Message = {
  uid: number;
  folder: string;
  subject: string;
  from: Addr[];
  to: Addr[];
  cc: Addr[];
  replyTo: Addr[];
  date: string | null;
  html: string | null;
  text: string | null;
  attachments: Array<{ index: number; filename: string; contentType: string; size: number }>;
  seen: boolean;
  flagged: boolean;
  tooLarge: boolean;
};

type ComposeState = {
  mode: "new" | "reply" | "forward";
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  refFolder?: string;
  refUid?: number;
  showCc: boolean;
};

const API = "/api/admin/correo";

// ─── Utilidades ─────────────────────────────────────────────────────────────

function addrLabel(a: Addr | null | undefined): string {
  if (!a) return "—";
  return a.name?.trim() || a.address || "—";
}

function addrFull(a: Addr): string {
  if (a.name && a.address) return `${a.name} <${a.address}>`;
  return a.address || a.name || "";
}

function listDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `Hoy ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  }
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fullDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "full", timeStyle: "short" });
}

function folderIcon(use: string | null) {
  switch (use) {
    case "\\Inbox":
      return Inbox;
    case "\\Drafts":
      return Pencil;
    case "\\Sent":
      return Send;
    case "\\Junk":
      return Flame;
    case "\\Trash":
      return Trash2;
    case "\\Archive":
      return Archive;
    case "\\Flagged":
      return Flag;
    default:
      return Folder;
  }
}

async function getJson<T>(url: string) {
  return requestJson<T>(url, { method: "GET", timeoutMs: 60_000 });
}

/** Documento de vista previa de firma (mismo sandbox que el lector). */
function signaturePreviewDoc(html: string | null): string {
  return buildViewerDocument(html || "<p style='color:#8a7c66'>Sin firma</p>", null);
}

// ─── Componente principal ───────────────────────────────────────────────────

export function CorreoClient({ country }: { country: string }) {
  const { toast } = useToast();
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const loadAccount = useCallback(async () => {
    const res = await getJson<Account>(`${API}/account`);
    if (res.ok) {
      setAccount(res.data);
      setAccountError(null);
      setNeedsReconnect(Boolean(res.data.lastError));
    } else {
      setAccountError(res.error);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  if (accountError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        <p className="font-semibold">No se pudo abrir el correo</p>
        <p className="mt-1">{accountError}</p>
      </div>
    );
  }
  if (!account) {
    return (
      <div className="flex h-64 items-center justify-center text-ink/50">
        <Loader2 className="animate-spin text-gold" size={20} />
      </div>
    );
  }

  if (!account.connected || needsReconnect) {
    return (
      <ConnectCard
        account={account}
        reconnect={account.connected && needsReconnect}
        onConnected={async () => {
          toast("Correo conectado");
          setNeedsReconnect(false);
          await loadAccount();
        }}
      />
    );
  }

  return (
    <Mailbox
      account={account}
      country={country}
      onAuthFailed={() => setNeedsReconnect(true)}
      onAccountChanged={loadAccount}
    />
  );
}

// ─── Conectar (una sola vez) ────────────────────────────────────────────────

function ConnectCard({
  account,
  reconnect,
  onConnected,
}: {
  account: Account;
  reconnect: boolean;
  onConnected: () => Promise<void>;
}) {
  const [email, setEmail] = useState(account.email ?? account.suggestedEmail ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await requestJson<{ ok: true; smtpWarning: string | null }>(`${API}/account`, {
      body: { email, password },
      timeoutMs: 45_000,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.data.smtpWarning) setWarning(res.data.smtpWarning);
    setPassword("");
    await onConnected();
  }

  const domains = account.allowedDomains.map((d) => `@${d}`).join(", ");

  return (
    <div className="mx-auto mt-6 max-w-lg rounded-2xl border border-gold/20 bg-white p-7 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-gold">
          <Mail size={20} strokeWidth={1.75} />
        </span>
        <div>
          <h2 className="crm-body-strong text-lg text-ink">
            {reconnect ? "Vuelve a conectar tu correo" : "Conecta tu correo corporativo"}
          </h2>
          <p className="text-sm text-ink/55">Solo una vez: después queda conectado siempre.</p>
        </div>
      </div>

      {reconnect && account.lastError && (
        <div className="mt-5 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{account.lastError} Si cambiaste la contraseña en cPanel, escribe la nueva.</span>
        </div>
      )}

      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">
          <span className="crm-label text-ink/60">Correo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`nombre${domains.split(",")[0] || "@bcousinoprop.com"}`}
            required
            autoComplete="username"
            className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold"
          />
        </label>
        <label className="block">
          <span className="crm-label text-ink/60">Contraseña del correo</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold"
          />
          <span className="mt-1 block text-xs text-ink/45">
            La misma con la que entras al webmail. No es la contraseña del CRM.
          </span>
        </label>

        {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {warning && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{warning}</p>}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink py-3 text-sm font-semibold text-cream-50 transition hover:bg-ink/90 disabled:opacity-60"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
          {busy ? "Comprobando con el servidor…" : "Conectar"}
        </button>
      </form>

      <div className="mt-6 rounded-lg bg-cream-50 p-3 text-xs leading-relaxed text-ink/55">
        <p>
          Se comprueba con el servidor antes de guardar y la contraseña se guarda cifrada. Solo se pueden
          conectar buzones {domains}.
        </p>
        <p className="mt-1">
          Servidor: IMAP {account.server.imap} · SMTP {account.server.smtp} (SSL)
        </p>
      </div>
    </div>
  );
}

// ─── Bandeja (tres columnas, estilo webmail) ────────────────────────────────

function Mailbox({
  account,
  country,
  onAuthFailed,
  onAccountChanged,
}: {
  account: Account;
  country: string;
  onAuthFailed: () => void;
  onAccountChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder, setFolder] = useState("INBOX");
  const [items, setItems] = useState<ListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(40);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const listRequest = useRef(0);

  const handleFailure = useCallback(
    (res: { status: number | null; data: Record<string, unknown> | null; error: string }) => {
      if (res.data?.code === "auth_failed" || res.data?.code === "not_connected") {
        onAuthFailed();
        return true;
      }
      return false;
    },
    [onAuthFailed],
  );

  const loadFolders = useCallback(async () => {
    const res = await getJson<{ folders: Folder[] }>(`${API}/folders`);
    if (res.ok) setFolders(res.data.folders);
    else handleFailure(res);
  }, [handleFailure]);

  const loadList = useCallback(
    async (opts?: { silent?: boolean }) => {
      const id = ++listRequest.current;
      if (!opts?.silent) setListLoading(true);
      const qs = new URLSearchParams({ folder, page: String(page) });
      if (activeQuery) qs.set("q", activeQuery);
      const res = await getJson<{ items: ListItem[]; total: number; pageSize: number }>(`${API}/messages?${qs}`);
      if (id !== listRequest.current) return;
      setListLoading(false);
      if (res.ok) {
        setItems(res.data.items);
        setTotal(res.data.total);
        setPageSize(res.data.pageSize);
        setListError(null);
      } else if (!handleFailure(res)) {
        setListError(res.error);
      }
    },
    [folder, page, activeQuery, handleFailure],
  );

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // Correo nuevo cada minuto (solo en la primera página y sin búsqueda).
  useEffect(() => {
    if (page !== 0 || activeQuery) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadList({ silent: true });
      void loadFolders();
    }, 60_000);
    return () => clearInterval(t);
  }, [page, activeQuery, loadList, loadFolders]);

  const currentFolder = folders.find((f) => f.path === folder);

  async function openMessage(uid: number) {
    setSelectedUid(uid);
    setMessageLoading(true);
    setMessage(null);
    const res = await getJson<{ message: Message }>(
      `${API}/messages/${uid}?folder=${encodeURIComponent(folder)}`,
    );
    setMessageLoading(false);
    if (res.ok) {
      setMessage(res.data.message);
      const wasUnseen = items.find((i) => i.uid === uid && !i.seen);
      setItems((prev) => prev.map((i) => (i.uid === uid ? { ...i, seen: true } : i)));
      if (wasUnseen) {
        setFolders((prev) =>
          prev.map((f) => (f.path === folder ? { ...f, unseen: Math.max(0, f.unseen - 1) } : f)),
        );
      }
    } else if (!handleFailure(res)) {
      toast(res.error, "error");
      setSelectedUid(null);
    }
  }

  function selectFolder(path: string) {
    setFolder(path);
    setPage(0);
    setQuery("");
    setActiveQuery("");
    setSelectedUid(null);
    setMessage(null);
  }

  async function patchMessage(uid: number, body: Record<string, unknown>) {
    return requestJson<{ ok: true; movedTo: string | null }>(
      `${API}/messages/${uid}?folder=${encodeURIComponent(folder)}`,
      { method: "PATCH", body },
    );
  }

  function removeFromList(uid: number) {
    setItems((prev) => prev.filter((i) => i.uid !== uid));
    setTotal((t) => Math.max(0, t - 1));
    if (selectedUid === uid) {
      setSelectedUid(null);
      setMessage(null);
    }
  }

  async function deleteSelected() {
    if (!message) return;
    const uid = message.uid;
    const inTrash = currentFolder?.specialUse === "\\Trash";
    if (inTrash && !confirm("¿Eliminar definitivamente este correo?")) return;
    const res = await requestJson(`${API}/messages/${uid}?folder=${encodeURIComponent(folder)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      if (!handleFailure(res)) toast(res.error, "error");
      return;
    }
    removeFromList(uid);
    toast(inTrash ? "Eliminado" : "Movido a la papelera");
    void loadFolders();
  }

  async function moveSelected(target: "archive" | "junk" | "inbox") {
    if (!message) return;
    const uid = message.uid;
    const res = await patchMessage(uid, { moveTo: target });
    if (!res.ok) {
      if (!handleFailure(res)) toast(res.error, "error");
      return;
    }
    removeFromList(uid);
    toast(target === "archive" ? "Archivado" : target === "junk" ? "Marcado como SPAM" : "Movido a Entrada");
    void loadFolders();
  }

  async function toggleFlag() {
    if (!message) return;
    const flagged = !message.flagged;
    const res = await patchMessage(message.uid, { flagged });
    if (!res.ok) return void toast(res.error, "error");
    setMessage({ ...message, flagged });
    setItems((prev) => prev.map((i) => (i.uid === message.uid ? { ...i, flagged } : i)));
  }

  async function markUnread() {
    if (!message) return;
    const res = await patchMessage(message.uid, { seen: false });
    if (!res.ok) return void toast(res.error, "error");
    setItems((prev) => prev.map((i) => (i.uid === message.uid ? { ...i, seen: false } : i)));
    setFolders((prev) => prev.map((f) => (f.path === folder ? { ...f, unseen: f.unseen + 1 } : f)));
    setSelectedUid(null);
    setMessage(null);
  }

  function startReply(all: boolean) {
    if (!message) return;
    const me = (account.email ?? "").toLowerCase();
    const primary = message.replyTo.length ? message.replyTo : message.from;
    const notMe = (a: Addr) => (a.address ?? "").toLowerCase() !== me;
    // En "Enviados", responder es escribir otra vez a los destinatarios.
    const isSentFolder = currentFolder?.specialUse === "\\Sent";
    const toList = isSentFolder ? message.to : primary;
    const extra = all ? [...(isSentFolder ? [] : message.to), ...message.cc].filter(notMe) : [];
    const toSet = new Set(toList.map((a) => (a.address ?? "").toLowerCase()));
    setCompose({
      mode: "reply",
      to: toList.map(addrFull).join(", "),
      cc: extra
        .filter((a) => !toSet.has((a.address ?? "").toLowerCase()))
        .map(addrFull)
        .join(", "),
      bcc: "",
      subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`,
      body: "",
      refFolder: folder,
      refUid: message.uid,
      showCc: all && extra.length > 0,
    });
  }

  function startForward() {
    if (!message) return;
    setCompose({
      mode: "forward",
      to: "",
      cc: "",
      bcc: "",
      subject: /^(fwd?|rv):/i.test(message.subject) ? message.subject : `Fwd: ${message.subject}`,
      body: "",
      refFolder: folder,
      refUid: message.uid,
      showCc: false,
    });
  }

  async function disconnect() {
    if (!confirm("¿Desconectar tu correo del CRM? Tendrás que volver a escribir la contraseña.")) return;
    const res = await requestJson(`${API}/account`, { method: "DELETE" });
    if (!res.ok) return void toast(res.error, "error");
    await onAccountChanged();
  }

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    setActiveQuery(query.trim());
    setSelectedUid(null);
    setMessage(null);
  }

  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const inJunk = currentFolder?.specialUse === "\\Junk";
  const inArchive = currentFolder?.specialUse === "\\Archive";

  return (
    <>
      <div className="flex h-[calc(100vh-170px)] min-h-[560px] overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        {/* ── Columna 1: cuenta + carpetas ─────────────────────────────── */}
        <aside
          className={cn(
            "w-56 shrink-0 flex-col border-r border-ink/10 bg-cream-50/60",
            selectedUid ? "hidden xl:flex" : "hidden md:flex",
          )}
        >
          <div className="border-b border-ink/10 px-4 py-4">
            <p className="truncate text-sm font-bold text-ink" title={account.email ?? ""}>
              {account.email}
            </p>
            <button
              onClick={() =>
                setCompose({ mode: "new", to: "", cc: "", bcc: "", subject: "", body: "", showCc: false })
              }
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-ink py-2.5 text-sm font-semibold text-cream-50 transition hover:bg-ink/90"
            >
              <PenLine size={15} className="text-gold" /> Redactar
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {folders.length === 0 && (
              <div className="flex justify-center py-6">
                <Loader2 size={16} className="animate-spin text-gold" />
              </div>
            )}
            {folders.map((f) => {
              const Icon = folderIcon(f.specialUse);
              const active = f.path === folder;
              return (
                <button
                  key={f.path}
                  onClick={() => selectFolder(f.path)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition",
                    active ? "bg-gold/15 font-semibold text-ink" : "text-ink/70 hover:bg-ink/5",
                  )}
                >
                  <Icon size={16} strokeWidth={1.75} className={active ? "text-gold" : "text-ink/45"} />
                  <span className="flex-1 truncate">{f.name}</span>
                  {f.unseen > 0 && f.specialUse !== "\\Trash" && f.specialUse !== "\\Sent" && (
                    <span className="crm-number rounded-full bg-gold/90 px-1.5 text-xs text-ink">{f.unseen}</span>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="space-y-1 border-t border-ink/10 p-2">
            <button
              onClick={() => setSignatureOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink/65 hover:bg-ink/5"
            >
              <Signature size={15} /> Firma
            </button>
            <button
              onClick={disconnect}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink/50 hover:bg-ink/5"
            >
              <LogOut size={15} /> Desconectar
            </button>
          </div>
        </aside>

        {/* ── Columna 2: lista ─────────────────────────────────────────── */}
        <section
          className={cn(
            "w-full shrink-0 flex-col border-r border-ink/10 md:w-[360px] xl:w-[400px]",
            selectedUid ? "hidden lg:flex" : "flex",
          )}
        >
          <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2.5">
            {/* Móvil: carpetas en un desplegable */}
            <select
              value={folder}
              onChange={(e) => selectFolder(e.target.value)}
              className="max-w-[120px] rounded-lg border border-ink/15 bg-white px-2 py-2 text-sm md:hidden"
            >
              {folders.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.name}
                </option>
              ))}
            </select>
            <form onSubmit={runSearch} className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="w-full rounded-lg border border-ink/10 bg-cream-50/60 py-2 pl-9 pr-8 text-sm outline-none focus:border-gold"
              />
              {activeQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setActiveQuery("");
                    setPage(0);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink"
                  aria-label="Quitar búsqueda"
                >
                  <X size={14} />
                </button>
              )}
            </form>
            <button
              onClick={() => {
                void loadList();
                void loadFolders();
              }}
              className="rounded-lg p-2 text-ink/50 hover:bg-ink/5 hover:text-ink"
              title="Actualizar"
            >
              <RefreshCw size={16} className={listLoading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() =>
                setCompose({ mode: "new", to: "", cc: "", bcc: "", subject: "", body: "", showCc: false })
              }
              className="rounded-lg bg-ink p-2 text-gold md:hidden"
              title="Redactar"
            >
              <PenLine size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {listError && <p className="m-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{listError}</p>}
            {listLoading && items.length === 0 && (
              <div className="flex justify-center py-10">
                <Loader2 size={18} className="animate-spin text-gold" />
              </div>
            )}
            {!listLoading && !listError && items.length === 0 && (
              <p className="py-12 text-center text-sm text-ink/45">
                {activeQuery ? "Nada coincide con la búsqueda." : "No hay correos en esta carpeta."}
              </p>
            )}
            <ul>
              {items.map((m) => {
                const isSent = currentFolder?.specialUse === "\\Sent" || currentFolder?.specialUse === "\\Drafts";
                const who = isSent ? `Para: ${m.to.map(addrLabel).join(", ") || "—"}` : addrLabel(m.from);
                return (
                  <li key={m.uid}>
                    <button
                      onClick={() => openMessage(m.uid)}
                      className={cn(
                        "block w-full border-b border-ink/5 px-4 py-3 text-left transition",
                        selectedUid === m.uid ? "bg-gold/15" : "hover:bg-cream-50",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {!m.seen && <span className="h-2 w-2 shrink-0 rounded-full bg-gold" />}
                        <span className={cn("flex-1 truncate text-sm", m.seen ? "text-ink/60" : "font-bold text-ink")}>
                          {who}
                        </span>
                        <span className="shrink-0 text-xs text-ink/45">{listDate(m.date)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        {m.answered && <Reply size={12} className="shrink-0 text-ink/40" />}
                        <span className={cn("flex-1 truncate text-sm", m.seen ? "text-ink/70" : "font-semibold text-ink")}>
                          {m.subject}
                        </span>
                        {m.flagged && <Flag size={13} className="shrink-0 fill-rose-500 text-rose-500" />}
                        {m.hasAttachments && <Paperclip size={13} className="shrink-0 text-ink/45" />}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex items-center justify-between border-t border-ink/10 px-3 py-2 text-xs text-ink/55">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded p-1.5 hover:bg-ink/5 disabled:opacity-30"
              aria-label="Anteriores"
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Mensajes {from} a {to} de {total}
            </span>
            <button
              disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}
              className="rounded p-1.5 hover:bg-ink/5 disabled:opacity-30"
              aria-label="Siguientes"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </section>

        {/* ── Columna 3: lectura ───────────────────────────────────────── */}
        <section className={cn("min-w-0 flex-1 flex-col", selectedUid ? "flex" : "hidden lg:flex")}>
          <div className="flex flex-wrap items-center gap-1 border-b border-ink/10 px-2 py-1.5">
            <button
              onClick={() => {
                setSelectedUid(null);
                setMessage(null);
              }}
              className="mr-1 rounded-lg p-2 text-ink/60 hover:bg-ink/5 lg:hidden"
              aria-label="Volver"
            >
              <ArrowLeft size={17} />
            </button>
            <ToolbarButton icon={Reply} label="Responder" onClick={() => startReply(false)} disabled={!message} />
            <ToolbarButton icon={ReplyAll} label="Responder a todos" onClick={() => startReply(true)} disabled={!message} />
            <ToolbarButton icon={Forward} label="Reenviar" onClick={startForward} disabled={!message} />
            <span className="mx-1 h-6 w-px bg-ink/10" />
            <ToolbarButton icon={Trash2} label="Eliminar" onClick={deleteSelected} disabled={!message} />
            {!inArchive && (
              <ToolbarButton icon={Archive} label="Archivo" onClick={() => moveSelected("archive")} disabled={!message} />
            )}
            <ToolbarButton
              icon={inJunk ? Inbox : Flame}
              label={inJunk ? "No es SPAM" : "SPAM"}
              onClick={() => moveSelected(inJunk ? "inbox" : "junk")}
              disabled={!message}
            />
            <ToolbarButton
              icon={Flag}
              label={message?.flagged ? "Desmarcar" : "Marcar"}
              onClick={toggleFlag}
              disabled={!message}
              active={message?.flagged}
            />
            <ToolbarButton icon={MailOpen} label="No leído" onClick={markUnread} disabled={!message} />
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {messageLoading && (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 size={20} className="animate-spin text-gold" />
              </div>
            )}
            {!messageLoading && !message && (
              <div className="flex flex-1 flex-col items-center justify-center text-ink/35">
                <Mail size={42} strokeWidth={1} />
                <p className="mt-3 text-sm">Selecciona un correo para leerlo</p>
              </div>
            )}
            {!messageLoading && message && <MessageView message={message} folder={folder} />}
          </div>
        </section>
      </div>

      {compose && (
        <ComposeDialog
          state={compose}
          account={account}
          onClose={() => setCompose(null)}
          onSent={() => {
            setCompose(null);
            toast("Correo enviado");
            void loadFolders();
            if (currentFolder?.specialUse === "\\Sent") void loadList({ silent: true });
            if (compose.mode === "reply" && compose.refUid) {
              setItems((prev) => prev.map((i) => (i.uid === compose.refUid ? { ...i, answered: true } : i)));
            }
          }}
          onAuthFailed={onAuthFailed}
        />
      )}

      {signatureOpen && (
        <SignatureDialog
          account={account}
          onClose={() => setSignatureOpen(false)}
          onSaved={async () => {
            setSignatureOpen(false);
            toast("Firma guardada");
            await onAccountChanged();
          }}
        />
      )}
    </>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-xs transition disabled:opacity-30",
        active ? "text-rose-600" : "text-ink/65 hover:bg-ink/5 hover:text-ink",
      )}
    >
      <Icon size={17} strokeWidth={1.75} />
      <span className="hidden whitespace-nowrap sm:block">{label}</span>
    </button>
  );
}

// ─── Lectura ────────────────────────────────────────────────────────────────

function MessageView({ message, folder }: { message: Message; folder: string }) {
  const doc = useMemo(() => buildViewerDocument(message.html, message.text), [message.html, message.text]);
  const line = (label: string, list: Addr[]) =>
    list.length > 0 && (
      <p className="truncate text-sm text-ink/60">
        <span className="text-ink/40">{label} </span>
        {list.map(addrFull).join(", ")}
      </p>
    );

  return (
    <>
      <div className="border-b border-ink/10 px-6 py-4">
        <h2 className="crm-body-strong text-lg text-ink">{message.subject}</h2>
        <div className="mt-2 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-gold">
            {(addrLabel(message.from[0]).trim()[0] ?? "?").toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {message.from.map(addrFull).join(", ") || "—"}
            </p>
            {line("Para:", message.to)}
            {line("CC:", message.cc)}
          </div>
          <span className="shrink-0 text-xs text-ink/45">{fullDate(message.date)}</span>
        </div>
        {message.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.attachments.map((a) => (
              <a
                key={a.index}
                href={`${API}/messages/${message.uid}/attachments/${a.index}?folder=${encodeURIComponent(folder)}`}
                className="flex max-w-[260px] items-center gap-2 rounded-lg border border-ink/10 bg-cream-50 px-3 py-1.5 text-xs text-ink/75 transition hover:border-gold/50"
              >
                <Paperclip size={13} className="shrink-0 text-gold" />
                <span className="truncate">{a.filename}</span>
                <span className="shrink-0 text-ink/40">{formatBytes(a.size)}</span>
                <Download size={12} className="shrink-0 text-ink/40" />
              </a>
            ))}
          </div>
        )}
      </div>
      {message.tooLarge ? (
        <p className="p-6 text-sm text-ink/55">
          Este correo es demasiado grande para mostrarlo aquí. Ábrelo desde el webmail.
        </p>
      ) : (
        // Sin allow-scripts ni allow-same-origin: el HTML de un correo nunca
        // ejecuta nada ni ve la sesión del CRM.
        <iframe
          title="Contenido del correo"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={doc}
          className="min-h-0 w-full flex-1 bg-white px-4"
        />
      )}
    </>
  );
}

// ─── Redactar / responder / reenviar ────────────────────────────────────────

type UploadItem = {
  key: string;
  file: File;
  id: string | null;
  sent: number;
  status: "uploading" | "done" | "error";
  error?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sube un archivo por trozos (ver lib/mailbox/attachments.ts: el middleware
 * corta cuerpos > 10 MB y nginx puede cortar en 1 MB). Si un trozo devuelve
 * 413 se baja a trozos pequeños; los cortes de red se reintentan y el
 * servidor dice desde qué byte seguir, así que nunca se duplica nada.
 */
async function uploadInChunks(
  file: File,
  onProgress: (sent: number) => void,
  isCancelled: () => boolean,
  onCreated: (id: string) => void,
): Promise<string> {
  const start = await requestJson<{ id: string }>(`${API}/uploads`, {
    body: { filename: file.name, size: file.size, contentType: file.type },
    timeoutMs: 30_000,
  });
  if (!start.ok) throw new Error(start.error);
  const id = start.data.id;
  onCreated(id);

  let offset = 0;
  let chunkSize = UPLOAD_CHUNK_BYTES;
  let failures = 0;
  while (offset < file.size) {
    if (isCancelled()) throw new Error("cancelado");
    const end = Math.min(file.size, offset + chunkSize);
    let res: Response;
    try {
      res = await fetch(`${API}/uploads/${id}?offset=${offset}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: file.slice(offset, end),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      if (++failures > 5) throw new Error("Se cortó la conexión subiendo el archivo.");
      await sleep(1000 * failures);
      continue;
    }
    if (res.status === 413 && chunkSize > UPLOAD_FALLBACK_CHUNK_BYTES) {
      chunkSize = UPLOAD_FALLBACK_CHUNK_BYTES;
      continue;
    }
    let data: { received?: number; error?: string } | null = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok || typeof data?.received !== "number") {
      if (res.status === 413) throw new Error("El servidor web rechaza el archivo por tamaño (límite de nginx).");
      if (res.status < 500 && data?.error) throw new Error(data.error);
      if (++failures > 5) throw new Error(data?.error || `Error del servidor (HTTP ${res.status}).`);
      await sleep(1000 * failures);
      continue;
    }
    failures = 0;
    offset = data.received;
    onProgress(offset);
  }
  return id;
}

function ComposeDialog({
  state,
  account,
  onClose,
  onSent,
  onAuthFailed,
}: {
  state: ComposeState;
  account: Account;
  onClose: () => void;
  onSent: () => void;
  onAuthFailed: () => void;
}) {
  const [form, setForm] = useState(state);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [includeSignature, setIncludeSignature] = useState(account.signature.mode !== "none");
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cancelled = useRef(new Set<string>());
  const itemsRef = useRef<UploadItem[]>([]);
  itemsRef.current = items;

  const signatureHtml =
    account.signature.mode === "custom"
      ? account.signature.customHtml
      : account.signature.mode === "auto"
        ? account.signature.autoHtml
        : null;

  const set = (k: keyof ComposeState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const patchItem = (key: string, patch: Partial<UploadItem>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (!incoming.length) return;
    setError(null);
    const room = MAX_FILES_PER_MAIL - itemsRef.current.length;
    if (incoming.length > room) setError(`Máximo ${MAX_FILES_PER_MAIL} archivos por correo.`);
    for (const file of incoming.slice(0, Math.max(0, room))) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      if (file.size === 0) {
        setItems((p) => [...p, { key, file, id: null, sent: 0, status: "error", error: "Archivo vacío" }]);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setItems((p) => [
          ...p,
          { key, file, id: null, sent: 0, status: "error", error: `Supera ${formatBytes(MAX_FILE_BYTES)}` },
        ]);
        continue;
      }
      setItems((p) => [...p, { key, file, id: null, sent: 0, status: "uploading" }]);
      uploadInChunks(
        file,
        (sent) => patchItem(key, { sent }),
        () => cancelled.current.has(key),
        (id) => patchItem(key, { id }),
      )
        .then((id) => patchItem(key, { id, sent: file.size, status: "done" }))
        .catch((err: Error) => {
          if (cancelled.current.has(key)) return;
          patchItem(key, { status: "error", error: err.message });
        });
    }
  }

  function removeItem(item: UploadItem) {
    cancelled.current.add(item.key);
    setItems((p) => p.filter((i) => i.key !== item.key));
    if (item.id) void requestJson(`${API}/uploads/${item.id}`, { method: "DELETE" });
  }

  function close() {
    // Lo subido y no enviado se borra ya (si no, a las 24 h).
    for (const it of itemsRef.current) {
      cancelled.current.add(it.key);
      if (it.id) void requestJson(`${API}/uploads/${it.id}`, { method: "DELETE" });
    }
    onClose();
  }

  const okItems = items.filter((i) => i.status !== "error");
  const plan = planDelivery(okItems.map((i) => i.file.size));
  const deliveryOf = new Map(okItems.map((it, i) => [it.key, plan[i]]));
  const anyLink = plan.includes("link");
  const uploading = items.some((i) => i.status === "uploading");
  const failed = items.filter((i) => i.status === "error");
  const totalSize = okItems.reduce((n, i) => n + i.file.size, 0);

  async function send() {
    setError(null);
    if (!form.to.trim()) return setError("Falta el destinatario.");
    if (uploading) return setError("Espera a que terminen de subirse los archivos.");
    if (failed.length) return setError("Quita los archivos con error antes de enviar.");
    if (!form.subject.trim() && !confirm("¿Enviar sin asunto?")) return;
    setSending(true);
    const res = await requestJson<{ ok: true; linked: number }>(`${API}/send`, {
      body: {
        to: form.to,
        cc: form.cc,
        bcc: form.bcc,
        subject: form.subject,
        body: form.body,
        mode: form.mode,
        includeSignature,
        refFolder: form.refFolder,
        refUid: form.refUid,
        uploads: items.map((i) => i.id).filter(Boolean),
      },
      timeoutMs: 180_000,
    });
    setSending(false);
    if (!res.ok) {
      if (res.data?.code === "auth_failed") onAuthFailed();
      setError(
        res.kind === "network" || res.kind === "timeout"
          ? `${res.error} Revisa en Enviados si salió antes de reintentar.`
          : res.error,
      );
      return;
    }
    onSent();
  }

  const title = form.mode === "reply" ? "Responder" : form.mode === "forward" ? "Reenviar" : "Nuevo correo";
  const input =
    "w-full border-0 border-b border-ink/10 bg-transparent px-0 py-2 text-sm text-ink outline-none focus:border-gold focus:ring-0";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6">
      <div
        className="relative flex max-h-[100vh] w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gold bg-cream-50/95 text-ink">
            <Paperclip size={28} className="text-gold" />
            <p className="mt-2 text-sm font-semibold">Suelta los archivos para adjuntarlos</p>
          </div>
        )}

        <div className="flex items-center justify-between bg-ink px-5 py-3 text-cream-50">
          <p className="text-sm font-semibold">{title}</p>
          <button onClick={close} className="text-cream-50/70 hover:text-cream-50" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <p className="py-1 text-xs text-ink/45">De: {account.email}</p>
          <div className="flex items-center gap-2">
            <span className="w-12 text-sm text-ink/45">Para</span>
            <input value={form.to} onChange={set("to")} className={input} autoFocus={form.mode !== "reply"} />
            {!form.showCc && (
              <button
                onClick={() => setForm((f) => ({ ...f, showCc: true }))}
                className="shrink-0 text-xs text-ink/50 hover:text-ink"
              >
                CC/CCO
              </button>
            )}
          </div>
          {form.showCc && (
            <>
              <div className="flex items-center gap-2">
                <span className="w-12 text-sm text-ink/45">CC</span>
                <input value={form.cc} onChange={set("cc")} className={input} />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 text-sm text-ink/45">CCO</span>
                <input value={form.bcc} onChange={set("bcc")} className={input} />
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            <span className="w-12 text-sm text-ink/45">Asunto</span>
            <input value={form.subject} onChange={set("subject")} className={input} />
          </div>
          <textarea
            value={form.body}
            onChange={set("body")}
            autoFocus={form.mode === "reply"}
            rows={10}
            placeholder="Escribe tu mensaje…"
            className="mt-3 w-full resize-y rounded-lg border border-ink/10 p-3 text-sm text-ink outline-none focus:border-gold"
          />

          {form.mode !== "new" && (
            <p className="mt-1 text-xs text-ink/45">
              {form.mode === "reply"
                ? "El mensaje original se cita debajo de tu firma."
                : "El mensaje original y sus adjuntos van incluidos."}
            </p>
          )}

          {items.length > 0 && (
            <div className="mt-3 space-y-2">
              {items.map((it) => {
                const pct = it.file.size ? Math.round((it.sent / it.file.size) * 100) : 0;
                const delivery = deliveryOf.get(it.key);
                return (
                  <div
                    key={it.key}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs",
                      it.status === "error" ? "border-rose-200 bg-rose-50" : "border-ink/10 bg-cream-50",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Paperclip size={13} className="shrink-0 text-gold" />
                      <span className="min-w-0 flex-1 truncate text-ink/80">{it.file.name}</span>
                      <span className="shrink-0 text-ink/45">{formatBytes(it.file.size)}</span>
                      {it.status === "done" && delivery === "link" && (
                        <span className="shrink-0 rounded-full bg-gold/20 px-2 py-0.5 text-ink/70">Enlace</span>
                      )}
                      {it.status === "done" && delivery === "attach" && <Check size={14} className="shrink-0 text-emerald-600" />}
                      <button onClick={() => removeItem(it)} aria-label="Quitar" className="shrink-0 text-ink/40 hover:text-ink">
                        <X size={13} />
                      </button>
                    </div>
                    {it.status === "uploading" && (
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink/10">
                        <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    {it.status === "error" && <p className="mt-1 text-rose-700">{it.error}</p>}
                  </div>
                );
              })}
              {anyLink && (
                <p className="text-xs leading-relaxed text-ink/55">
                  Más de {formatBytes(MAX_ATTACHED_TOTAL_BYTES)} adjuntos hacen rebotar el correo en Outlook o Gmail:
                  los marcados como <b>Enlace</b> van como enlace de descarga dentro del correo, válido{" "}
                  {LARGE_FILE_LINK_DAYS} días.
                </p>
              )}
            </div>
          )}

          {signatureHtml && (
            <div className="mt-4 rounded-lg border border-dashed border-ink/15 p-3">
              <label className="flex items-center gap-2 text-xs text-ink/55">
                <input
                  type="checkbox"
                  checked={includeSignature}
                  onChange={(e) => setIncludeSignature(e.target.checked)}
                  className="accent-gold"
                />
                Incluir firma
              </label>
              {includeSignature && (
                <iframe
                  title="Firma"
                  sandbox=""
                  srcDoc={signaturePreviewDoc(signatureHtml)}
                  className="mt-2 h-60 w-full"
                />
              )}
            </div>
          )}

          {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        </div>

        <div className="flex items-center gap-3 border-t border-ink/10 px-5 py-3">
          <button
            onClick={send}
            disabled={sending || uploading}
            className="flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-cream-50 hover:bg-ink/90 disabled:opacity-60"
          >
            {sending || uploading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Send size={15} className="text-gold" />
            )}
            {sending ? "Enviando…" : uploading ? "Subiendo archivos…" : "Enviar"}
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-ink/60 hover:bg-ink/5"
          >
            <Paperclip size={15} /> Adjuntar
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="ml-auto hidden text-xs text-ink/40 sm:block">
            {totalSize > 0 ? `${formatBytes(totalSize)} · ` : ""}Arrastra archivos aquí · hasta {formatBytes(MAX_FILE_BYTES)} cada uno
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Firma ──────────────────────────────────────────────────────────────────

function SignatureDialog({
  account,
  onClose,
  onSaved,
}: {
  account: Account;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const sig = account.signature;
  const [mode, setMode] = useState<SignatureMode>(sig.mode);
  const [title, setTitle] = useState(sig.title ?? "");
  const [html, setHtml] = useState(sig.customHtml ?? sig.autoHtml);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La vista previa automática se recalcula al vuelo con el cargo escrito.
  const autoHtml = useMemo(
    () => buildAutoSignatureHtml({ ...sig.profile, title: title.trim() || null }, sig.appUrl),
    [sig.profile, sig.appUrl, title],
  );
  const preview = mode === "auto" ? autoHtml : mode === "custom" ? html : null;

  async function save() {
    setSaving(true);
    setError(null);
    const res = await requestJson(`${API}/signature`, {
      method: "PUT",
      body: { mode, html: mode === "custom" ? html : (sig.customHtml ?? ""), title },
    });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    await onSaved();
  }

  const option = (value: SignatureMode, label: string, hint: string) => (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-lg border p-3 transition",
        mode === value ? "border-gold bg-gold/10" : "border-ink/10 hover:border-ink/25",
      )}
    >
      <input type="radio" checked={mode === value} onChange={() => setMode(value)} className="mt-1 accent-gold" />
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-ink/50">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-ink px-5 py-3 text-cream-50">
          <p className="text-sm font-semibold">Firma de correo</p>
          <button onClick={onClose} aria-label="Cerrar" className="text-cream-50/70 hover:text-cream-50">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {option("auto", "Automática (recomendada)", "Con tu nombre, tu cargo, el teléfono de la agencia y el logo. Se actualiza sola.")}
          {option("custom", "Personalizada", "Escribe tu propia firma en HTML.")}
          {option("none", "Sin firma", "")}

          {mode === "auto" && (
            <label className="block">
              <span className="crm-label text-ink/60">Cargo</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={sig.defaultTitle}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-gold"
              />
              <span className="mt-1 block text-xs text-ink/45">
                Vacío = «{sig.defaultTitle}». El nombre sale de tu perfil; el teléfono es siempre el de la agencia.
              </span>
            </label>
          )}
          {mode === "custom" && (
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-ink/15 p-3 font-mono text-xs outline-none focus:border-gold"
            />
          )}
          {preview && (
            <div className="rounded-lg border border-ink/10 p-3">
              <p className="crm-label-sm text-ink/45">Vista previa</p>
              <iframe title="Vista previa de la firma" sandbox="" srcDoc={signaturePreviewDoc(preview)} className="mt-2 h-52 w-full" />
            </div>
          )}
          {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-ink/10 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-ink/60 hover:bg-ink/5">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-cream-50 hover:bg-ink/90 disabled:opacity-60"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
