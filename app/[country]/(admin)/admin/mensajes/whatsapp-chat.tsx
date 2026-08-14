"use client";

import {
  Check,
  CheckCheck,
  Clock,
  Loader2,
  Send,
  AlertCircle,
  Plus,
  Home,
  X,
  Edit2,
  Trash2,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { getCountryConfig, isCountry } from "@/lib/country-config";
import { cn } from "@/lib/utils";
import {
  sendZintoMessage,
  getZintoThread,
  markZintoConversationRead,
  startWhatsAppConversation,
  updateConversationName,
  deleteConversation,
} from "./zinto-actions";
import { ZintoCrmPanel } from "./zinto-crm-panel";

export type WhatsAppConversation = {
  id: string;
  phoneNumber: string;
  displayName: string;
  initials: string;
  lastTimestamp: string | null;
  lastMessage: string | null;
  unreadCount: number;
  contactMessage?: string | null;
  propertyTitle?: string | null;
  country?: 'es' | 'cl';
};

export type WhatsAppMessage = {
  id: string;
  body: string;
  fromClient: boolean;
  time: string;
  status: string;
};

function toView(rows: {
  id: string;
  message_text: string;
  type: string;
  status: string;
  created_at: string;
}[]): WhatsAppMessage[] {
  return rows.map((m) => ({
    id: m.id,
    body: m.message_text,
    fromClient: m.type === "received",
    time: formatTime(m.created_at),
    status: m.status,
  }));
}

export function WhatsAppChat({
  conversations,
  activeId,
  initialMessages,
}: {
  conversations: WhatsAppConversation[];
  activeId: string | null;
  initialMessages: WhatsAppMessage[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ country?: string }>();
  const country = isCountry(params?.country) ? params.country : "es";
  const config = getCountryConfig(country);
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>(initialMessages);
  const [showNew, setShowNew] = useState(false);
  const [showEditName, setShowEditName] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  // Auto-generate greeting message when conversation changes
  useEffect(() => {
    if (active && messages.length === 0 && !draft) {
      const name = active.displayName.split(" ")[0] || "Cliente";
      const greeting = active.propertyTitle
        ? `Hola ${name}, ¿cómo estás? 👋 Nos consultaste por este piso:\n\n${active.propertyTitle}`
        : `Hola ${name}, ¿cómo estás? 👋`;
      setDraft(greeting);
    }
  }, [active?.id, messages.length, draft]);

  // Track the currently-viewed conversation so in-flight polls can be discarded
  // if the user switches away before the request resolves (avoids showing the
  // wrong thread / setState races).
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Reset thread when switching conversation.
  useEffect(() => {
    setMessages(initialMessages);
  }, [activeId, initialMessages]);

  // Poll the active thread for inbound replies (delivered via Zinto webhook).
  const refreshThread = useCallback(async () => {
    const idAtCall = activeIdRef.current;
    if (!idAtCall) return;
    try {
      const rows = await getZintoThread(idAtCall);
      // Only apply if we're still viewing the same conversation.
      if (idAtCall === activeIdRef.current) {
        setMessages(toView(rows));
      }
    } catch {
      // ignore transient polling errors
    }
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const interval = setInterval(refreshThread, 5000);
    return () => clearInterval(interval);
  }, [activeId, refreshThread]);

  // Mark read on open, then refresh so the list badge clears.
  useEffect(() => {
    if (activeId) {
      markZintoConversationRead(activeId)
        .then(() => router.refresh())
        .catch(() => {});
    }
  }, [activeId, router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, activeId]);

  const selectConversation = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "whatsapp");
    next.set("w", id);
    router.push(`${config.prefix}/mensajes?${next.toString()}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!active) return;
    const body = draft.trim();
    if (!body) return;
    setError(null);
    setDraft("");
    startTransition(async () => {
      const result = await sendZintoMessage(active.id, body);
      if (result.ok) {
        await refreshThread();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <section className="grid min-h-[640px] grid-cols-1 overflow-hidden rounded-2xl border border-gold/15 bg-cream-50/85 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:grid-cols-[320px_1fr] md:[height:640px]">
      {showNew && (
        <NewConversationModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            selectConversation(id);
          }}
        />
      )}
      {showEditName && active && (
        <EditNameModal
          currentName={active.displayName}
          onClose={() => setShowEditName(false)}
          conversationId={active.id}
          onUpdated={() => {
            setShowEditName(false);
            router.refresh();
          }}
        />
      )}
      {showDeleteConfirm && active && (
        <DeleteConfirmModal
          contactName={active.displayName}
          onClose={() => setShowDeleteConfirm(false)}
          conversationId={active.id}
          onDeleted={() => {
            setShowDeleteConfirm(false);
            router.push(`${config.prefix}/mensajes?tab=whatsapp`);
          }}
        />
      )}
      <WhatsAppList
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={() => setShowNew(true)}
      />

      <div className="flex min-h-[440px] flex-col bg-cream-50/40 md:min-h-0 md:border-l md:border-gold/15">
        {active ? (
          <>
            <header className="border-b border-gold/15 bg-cream-50/85 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366]/15 font-serif text-xs font-medium text-[#128C7E]">
                    {active.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-serif text-base font-semibold text-ink">
                      {active.displayName}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-ink/55">
                      <span>+{active.phoneNumber}</span>
                      <span className="inline-block rounded-full bg-gold/20 px-1.5 py-0.5 font-medium">
                        {active.country === 'cl' ? '🇨🇱 Chile' : '🇪🇸 España'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditName(true)}
                    title="Editar nombre"
                    className="flex items-center justify-center rounded-lg p-1.5 text-ink/50 transition hover:bg-gold/10 hover:text-ink"
                  >
                    <Edit2 size={16} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    title="Borrar chat"
                    className="flex items-center justify-center rounded-lg p-1.5 text-ink/50 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
              {(active.propertyTitle || active.contactMessage) && (
                <div className="mt-3 space-y-2 rounded-lg border border-gold/15 bg-white/60 px-3 py-2">
                  {active.propertyTitle && (
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      <Home size={14} strokeWidth={2} className="text-[#128C7E]" />
                      {active.propertyTitle}
                    </p>
                  )}
                  {active.contactMessage && (
                    <p className="line-clamp-2 text-xs italic text-ink/60">
                      {active.contactMessage}
                    </p>
                  )}
                </div>
              )}
            </header>

            <ZintoCrmPanel phone={active.phoneNumber} />

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center text-sm text-ink/55">
                  Aún no hay mensajes. Escribe el primero.
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {messages.map((m, i) => (
                    <Bubble
                      key={m.id}
                      body={m.body}
                      fromClient={m.fromClient}
                      time={m.time}
                      status={m.status}
                      showMeta={
                        i === messages.length - 1 ||
                        messages[i + 1].fromClient !== m.fromClient
                      }
                    />
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <p className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
                {translateError(error)}
              </p>
            )}

            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 border-t border-gold/15 bg-cream-50/85 p-3"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escribe un mensaje de WhatsApp…"
                maxLength={4096}
                className="flex-1 rounded-lg border border-gold/25 bg-white/80 px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
              />
              <button
                type="submit"
                disabled={draft.trim().length === 0 || isPending}
                className="flex items-center gap-2 rounded-lg bg-[#128C7E] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#0e6f64] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                ) : (
                  <Send size={14} strokeWidth={1.75} />
                )}
                <span>Enviar</span>
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <p className="text-sm text-ink/55">
              Selecciona una conversación de WhatsApp.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function WhatsAppList({
  conversations,
  activeId,
  onSelect,
  onNew,
}: {
  conversations: WhatsAppConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const header = (
    <li className="flex items-center justify-between border-b border-gold/15 px-4 py-3">
      <p className="font-serif text-sm font-semibold text-ink">WhatsApp</p>
      <button
        type="button"
        onClick={onNew}
        title="Nueva conversación"
        className="flex items-center gap-1 rounded-lg bg-[#128C7E] px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-[#0e6f64]"
      >
        <Plus size={13} strokeWidth={2} />
        Nueva
      </button>
    </li>
  );

  if (conversations.length === 0) {
    return (
      <ul className="flex flex-col overflow-y-auto md:max-h-full">
        {header}
        <li className="flex flex-1 items-center justify-center p-6 text-center text-sm text-ink/55">
          No hay conversaciones de WhatsApp todavía.
        </li>
      </ul>
    );
  }
  return (
    <ul className="flex flex-col overflow-y-auto md:max-h-full">
      {header}
      {conversations.map((c) => {
        const active = c.id === activeId;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                "flex w-full items-start gap-3 border-b border-gold/10 px-4 py-3 text-left transition hover:bg-white/55",
                active && "bg-white/75",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15 font-serif text-xs font-medium text-[#128C7E]">
                {c.initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {c.displayName}
                  </p>
                  {c.lastTimestamp && (
                    <p className="shrink-0 text-[10px] text-ink/55">
                      {formatRelative(c.lastTimestamp)}
                    </p>
                  )}
                </div>
                {c.lastMessage && (
                  <p className="truncate text-[11px] text-ink/50">
                    {c.lastMessage}
                  </p>
                )}
              </div>
              {c.unreadCount > 0 && (
                <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25D366] px-1.5 text-[10px] font-semibold text-white">
                  {c.unreadCount}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function NewConversationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const params = useParams<{ country?: string }>();
  const currentCountry = isCountry(params?.country) ? params.country : "es";
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<'es' | 'cl'>(currentCountry);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await startWhatsAppConversation(phone, name, selectedCountry);
      if (result.ok) {
        onCreated(result.id);
      } else {
        setError(
          result.error === "invalid_phone"
            ? "Número inválido. Usa prefijo internacional (ej. 34612345678)."
            : `No se pudo crear la conversación: ${result.error}`,
        );
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gold/20 bg-cream-50 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-base font-semibold text-ink">
            Nueva conversación
          </h3>
          <button type="button" onClick={onClose} className="text-ink/50 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-ink/65">
              Número de WhatsApp (prefijo internacional)
            </span>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="34612345678"
              autoFocus
              className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-ink/65">
              Nombre (opcional)
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del contacto"
              className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-ink/65">
              País
            </span>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value as 'es' | 'cl')}
              className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            >
              <option value="es">🇪🇸 España (WhatsApp #4)</option>
              <option value="cl">🇨🇱 Chile (WhatsApp #50)</option>
            </select>
          </label>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gold/25 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-gold/5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || phone.trim().length === 0}
              className="flex items-center gap-2 rounded-xl bg-[#128C7E] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0e6f64] disabled:opacity-50"
            >
              {pending && <Loader2 size={14} className="animate-spin" />}
              Abrir chat
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Bubble({
  body,
  fromClient,
  time,
  status,
  showMeta,
}: {
  body: string;
  fromClient: boolean;
  time: string;
  status: string;
  showMeta: boolean;
}) {
  return (
    <li className={cn("flex flex-col", fromClient ? "items-start" : "items-end")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
          fromClient
            ? "rounded-bl-md bg-white text-ink"
            : "rounded-br-md bg-[#128C7E] text-white",
        )}
      >
        {body}
      </div>
      {showMeta && (
        <span
          className={cn(
            "mt-0.5 flex items-center gap-1 text-[10px] text-ink/45",
            fromClient ? "pl-2" : "pr-2",
          )}
        >
          {time}
          {!fromClient && <StatusIcon status={status} />}
        </span>
      )}
    </li>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "delivered":
      return <CheckCheck size={12} strokeWidth={2} className="text-[#128C7E]" />;
    case "sent":
      return <Check size={12} strokeWidth={2} />;
    case "failed":
      return <AlertCircle size={12} strokeWidth={2} className="text-red-500" />;
    default:
      return <Clock size={11} strokeWidth={2} />;
  }
}

function translateError(code: string): string {
  const map: Record<string, string> = {
    message_required: "El mensaje no puede estar vacío.",
    message_too_long: "El mensaje supera los 4096 caracteres.",
    conversation_not_found: "No se encontró la conversación.",
    channel_inactive: "El canal de WhatsApp no está activo en Zinto.",
    zinto_send_failed: "Zinto no pudo enviar el mensaje.",
    INVALID_PHONE_NUMBER: "El número de teléfono no es válido.",
    RATE_LIMIT_EXCEEDED: "Demasiadas solicitudes. Intenta en un momento.",
    CHANNEL_NOT_FOUND: "El canal de WhatsApp no existe en Zinto.",
    CHANNEL_INACTIVE: "El canal de WhatsApp no está activo.",
  };
  return map[code] || "No se pudo enviar el mensaje. Inténtalo de nuevo.";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function generateGreeting(conversation: WhatsAppConversation): string {
  const name = conversation.displayName.split(" ")[0] || "Cliente";
  const property = conversation.propertyTitle || "";
  const originalMessage = conversation.contactMessage || "";

  if (!property && !originalMessage) {
    return `Hola ${name}, ¿cómo estás?`;
  }

  if (property) {
    return `Hola ${name}, ¿cómo estás? 👋 Nos consultaste por este piso:\n\n${property}`;
  }

  return `Hola ${name}, ¿cómo estás? 👋 Vi tu consulta anterior:\n\n"${originalMessage}"`;
}

function EditNameModal({
  currentName,
  onClose,
  conversationId,
  onUpdated,
}: {
  currentName: string;
  onClose: () => void;
  conversationId: string;
  onUpdated: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const newName = name.trim();
    if (!newName) {
      setError("El nombre no puede estar vacío.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateConversationName(conversationId, newName);
      if (result.ok) {
        onUpdated();
      } else {
        setError(result.error || "No se pudo actualizar el nombre.");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gold/20 bg-cream-50 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-base font-semibold text-ink">
            Editar nombre
          </h3>
          <button type="button" onClick={onClose} className="text-ink/50 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-ink/65">
              Nombre del contacto
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
              autoFocus
              className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            />
          </label>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gold/25 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-gold/5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || name.trim().length === 0}
              className="flex items-center gap-2 rounded-xl bg-[#128C7E] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0e6f64] disabled:opacity-50"
            >
              {pending && <Loader2 size={14} className="animate-spin" />}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  contactName,
  onClose,
  conversationId,
  onDeleted,
}: {
  contactName: string;
  onClose: () => void;
  conversationId: string;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteConversation(conversationId);
      if (result.ok) {
        onDeleted();
      } else {
        setError(result.error || "No se pudo borrar la conversación.");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-red-200 bg-cream-50 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-base font-semibold text-red-600">
            Borrar conversación
          </h3>
          <button type="button" onClick={onClose} className="text-ink/50 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <p className="mt-3 text-sm text-ink/70">
          ¿Estás seguro de que deseas borrar la conversación con{" "}
          <strong>{contactName}</strong>? Se eliminarán todos los mensajes y esta acción no se puede deshacer.
        </p>
        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gold/25 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-gold/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Borrar
          </button>
        </div>
      </div>
    </div>
  );
}
