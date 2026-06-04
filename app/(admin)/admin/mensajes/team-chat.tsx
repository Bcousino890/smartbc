"use client";

import { Loader2, MessageSquarePlus, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type Channel = {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
};

type TeamMessage = {
  id: string;
  content: string;
  createdAt: string;
  replyTo: string | null;
  userId: string;
  userName: string;
  userInitials: string;
};

type DirectConversation = {
  id: string;
  otherId: string;
  otherName: string;
  otherInitials: string;
  lastMessageAt: string | null;
  unreadCount: number;
};

type DirectMessage = {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  senderInitials: string;
};

type Member = {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: string;
};

type ActiveView =
  | { type: "channel"; id: string }
  | {
      type: "dm";
      conversationId: string;
      otherId: string;
      otherName: string;
      otherInitials: string;
    };

// ─── Main component ───────────────────────────────────────────────────────────

export function TeamChat({ currentUserId }: { currentUserId: string }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [directConvs, setDirectConvs] = useState<DirectConversation[]>([]);
  const [activeView, setActiveView] = useState<ActiveView | null>(null);

  // Channel messages
  const [channelMessages, setChannelMessages] = useState<TeamMessage[]>([]);
  const [loadingChannel, setLoadingChannel] = useState(false);

  // DM messages
  const [dmMessages, setDmMessages] = useState<DirectMessage[]>([]);
  const [loadingDm, setLoadingDm] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // New DM modal
  const [showNewDm, setShowNewDm] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // ── Load channels ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/admin/team/channels")
      .then((r) => r.json())
      .then((data: { channels?: Channel[] }) => {
        const ch = data.channels ?? [];
        setChannels(ch);
        if (ch.length > 0) {
          setActiveView({ type: "channel", id: ch[0].id });
        }
      })
      .catch(() => {});
  }, []);

  // ── Load DM conversations list ─────────────────────────────────────────────
  const fetchDirectConvs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/team/direct/conversations");
      const data: { conversations?: DirectConversation[] } = await res.json();
      setDirectConvs(data.conversations ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchDirectConvs();
  }, [fetchDirectConvs]);

  // ── Fetch channel messages ─────────────────────────────────────────────────
  const fetchChannelMessages = useCallback(
    async (channelId: string, silent = false) => {
      if (!silent) setLoadingChannel(true);
      try {
        const res = await fetch(
          `/api/admin/team/messages?channelId=${channelId}`
        );
        const data: { messages?: TeamMessage[] } = await res.json();
        setChannelMessages(data.messages ?? []);
      } catch {
        // ignore
      } finally {
        if (!silent) setLoadingChannel(false);
      }
    },
    []
  );

  // ── Fetch DM messages ──────────────────────────────────────────────────────
  const fetchDmMessages = useCallback(
    async (conversationId: string, silent = false) => {
      if (!silent) setLoadingDm(true);
      try {
        const res = await fetch(
          `/api/admin/team/direct/messages?conversationId=${conversationId}`
        );
        const data: { messages?: DirectMessage[] } = await res.json();
        setDmMessages(data.messages ?? []);
      } catch {
        // ignore
      } finally {
        if (!silent) setLoadingDm(false);
      }
    },
    []
  );

  // ── React to view changes ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activeView) return;
    setDraft("");
    setError(null);

    if (activeView.type === "channel") {
      setDmMessages([]);
      setChannelMessages([]);
      fetchChannelMessages(activeView.id);
    } else if (!activeView.conversationId.startsWith("new:")) {
      setChannelMessages([]);
      setDmMessages([]);
      fetchDmMessages(activeView.conversationId);
    } else {
      // Pending new conversation — clear messages
      setChannelMessages([]);
      setDmMessages([]);
    }
  }, [activeView, fetchChannelMessages, fetchDmMessages]);

  // ── Polling every 5s ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeView) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (activeView.type === "channel") {
        fetchChannelMessages(activeView.id, true);
      } else if (!activeView.conversationId.startsWith("new:")) {
        fetchDmMessages(activeView.conversationId, true);
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeView, fetchChannelMessages, fetchDmMessages]);

  // ── Scroll to bottom ───────────────────────────────────────────────────────
  const msgCount =
    activeView?.type === "channel"
      ? channelMessages.length
      : dmMessages.length;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgCount, activeView]);

  // ── Send channel message ───────────────────────────────────────────────────
  const handleSendChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeView || activeView.type !== "channel") return;
    const content = draft.trim();
    if (!content || sending) return;
    setDraft("");
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/admin/team/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: activeView.id, content }),
      });
      const data: { ok?: boolean; message?: TeamMessage; error?: string } =
        await res.json();
      if (data.ok && data.message) {
        setChannelMessages((prev) => [...prev, data.message!]);
      } else {
        setError(data.error ?? "Error al enviar");
        setDraft(content);
      }
    } catch {
      setError("Error de conexión");
      setDraft(content);
    } finally {
      setSending(false);
    }
  };

  // ── Send DM (existing conversation) ───────────────────────────────────────
  const handleSendDm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeView || activeView.type !== "dm") return;
    const content = draft.trim();
    if (!content || sending) return;
    setDraft("");
    setError(null);
    setSending(true);

    const isPending = activeView.conversationId.startsWith("new:");
    const body = isPending
      ? { recipientId: activeView.otherId, content }
      : { conversationId: activeView.conversationId, content };

    try {
      const res = await fetch("/api/admin/team/direct/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: {
        ok?: boolean;
        conversationId?: string;
        message?: DirectMessage;
        error?: string;
      } = await res.json();

      if (data.ok && data.message) {
        if (isPending && data.conversationId) {
          // Upgrade view to real conversation id
          const convId = data.conversationId;
          setActiveView((prev) =>
            prev && prev.type === "dm"
              ? { ...prev, conversationId: convId }
              : prev
          );
        }
        setDmMessages((prev) => [...prev, data.message!]);
        fetchDirectConvs();
      } else {
        setError(data.error ?? "Error al enviar");
        setDraft(content);
      }
    } catch {
      setError("Error de conexión");
      setDraft(content);
    } finally {
      setSending(false);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    if (!activeView) return;
    if (activeView.type === "channel") return handleSendChannel(e);
    return handleSendDm(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as React.FormEvent);
    }
  };

  // ── Open new DM modal ──────────────────────────────────────────────────────
  const openNewDm = async () => {
    setShowNewDm(true);
    setLoadingMembers(true);
    try {
      const res = await fetch("/api/admin/team/direct/members");
      const data: { members?: Member[] } = await res.json();
      setMembers(data.members ?? []);
    } catch {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  // ── Start DM with a member ─────────────────────────────────────────────────
  const startDm = (member: Member) => {
    setShowNewDm(false);
    const existingConv = directConvs.find((c) => c.otherId === member.id);
    if (existingConv) {
      setActiveView({
        type: "dm",
        conversationId: existingConv.id,
        otherId: member.id,
        otherName: member.name,
        otherInitials: member.initials,
      });
    } else {
      // Open a pending DM view — conversation created on first message
      setActiveView({
        type: "dm",
        conversationId: `new:${member.id}`,
        otherId: member.id,
        otherName: member.name,
        otherInitials: member.initials,
      });
      setDmMessages([]);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeChannel =
    activeView?.type === "channel"
      ? channels.find((c) => c.id === activeView.id) ?? null
      : null;

  const isPendingNewConv =
    activeView?.type === "dm" &&
    activeView.conversationId.startsWith("new:");

  const currentMessages: TeamMessage[] | DirectMessage[] =
    activeView?.type === "channel" ? channelMessages : dmMessages;
  const loadingMessages =
    activeView?.type === "channel" ? loadingChannel : loadingDm;

  const placeholder =
    activeView?.type === "channel" && activeChannel
      ? `Mensaje en #${activeChannel.name}…`
      : activeView?.type === "dm"
      ? `Mensaje a ${activeView.otherName}…`
      : "Escribe un mensaje…";

  return (
    <>
      <section className="grid min-h-[640px] grid-cols-1 overflow-hidden rounded-2xl border border-gold/15 bg-cream-50/85 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:grid-cols-[240px_1fr] md:[height:640px]">
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="flex flex-col overflow-hidden border-b border-gold/15 md:border-b-0 md:border-r">
          {/* Channels section header */}
          <div className="border-b border-gold/15 px-4 py-3">
            <p className="font-serif text-sm font-semibold text-ink">Canales</p>
          </div>
          <ul className="py-2">
            {channels.map((ch) => {
              const active =
                activeView?.type === "channel" && activeView.id === ch.id;
              return (
                <li key={ch.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveView({ type: "channel", id: ch.id })
                    }
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg mx-1.5 px-3 py-2 text-left text-sm transition",
                      active
                        ? "bg-gold/12 font-semibold text-ink"
                        : "text-ink/65 hover:bg-gold/8 hover:text-ink"
                    )}
                  >
                    <span className="text-base leading-none">{ch.emoji}</span>
                    <span className="truncate"># {ch.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* DMs section */}
          <div className="border-t border-gold/15 px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/40">
              Mensajes Directos
            </p>
          </div>
          <ul className="flex-1 overflow-y-auto py-1">
            {directConvs.map((conv) => {
              const active =
                activeView?.type === "dm" &&
                (activeView.conversationId === conv.id ||
                  (activeView.conversationId.startsWith("new:") &&
                    activeView.otherId === conv.otherId));
              return (
                <li key={conv.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveView({
                        type: "dm",
                        conversationId: conv.id,
                        otherId: conv.otherId,
                        otherName: conv.otherName,
                        otherInitials: conv.otherInitials,
                      })
                    }
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg mx-1.5 px-3 py-2 text-left text-sm transition",
                      active
                        ? "bg-gold/12 font-semibold text-ink"
                        : "text-ink/65 hover:bg-gold/8 hover:text-ink"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-serif text-[10px] font-semibold",
                        active
                          ? "bg-ink text-cream-50"
                          : "bg-gold/20 text-gold-dark"
                      )}
                    >
                      {conv.otherInitials}
                    </span>
                    <span className="flex-1 truncate">{conv.otherName}</span>
                    {conv.unreadCount > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-semibold text-ink">
                        {conv.unreadCount}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* New DM button */}
          <div className="border-t border-gold/15 p-2">
            <button
              type="button"
              onClick={openNewDm}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink/55 transition hover:bg-gold/8 hover:text-ink"
            >
              <MessageSquarePlus size={15} strokeWidth={1.75} />
              <span>Nuevo mensaje directo</span>
            </button>
          </div>
        </aside>

        {/* ── Main panel ──────────────────────────────────────────────────── */}
        <div className="flex min-h-[440px] flex-col bg-cream-50/40 md:min-h-0">
          {activeView ? (
            <>
              {/* Header */}
              <header className="flex items-center gap-3 border-b border-gold/15 bg-cream-50/85 px-4 py-3">
                {activeView.type === "channel" && activeChannel ? (
                  <>
                    <span className="text-xl leading-none">
                      {activeChannel.emoji}
                    </span>
                    <div>
                      <p className="font-serif text-base font-semibold text-ink">
                        #{activeChannel.name}
                      </p>
                      {activeChannel.description && (
                        <p className="text-[11px] text-ink/55">
                          {activeChannel.description}
                        </p>
                      )}
                    </div>
                  </>
                ) : activeView.type === "dm" ? (
                  <>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/20 font-serif text-sm font-semibold text-gold-dark">
                      {activeView.otherInitials}
                    </span>
                    <div>
                      <p className="font-serif text-base font-semibold text-ink">
                        {activeView.otherName}
                      </p>
                      <p className="text-[11px] text-ink/55">Mensaje directo</p>
                    </div>
                  </>
                ) : null}
              </header>

              {/* Messages area */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-5"
              >
                {loadingMessages ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2
                      size={20}
                      strokeWidth={1.75}
                      className="animate-spin text-gold"
                    />
                  </div>
                ) : currentMessages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-center text-sm text-ink/55">
                    {activeView.type === "channel" && activeChannel
                      ? `No hay mensajes en #${activeChannel.name} todavía. ¡Sé el primero!`
                      : isPendingNewConv
                      ? `Empieza una conversación con ${activeView.type === "dm" ? activeView.otherName : ""}.`
                      : "No hay mensajes todavía. ¡Sé el primero!"}
                  </div>
                ) : activeView.type === "channel" ? (
                  <ul className="flex flex-col gap-1">
                    {(currentMessages as TeamMessage[]).map((msg, i) => {
                      const isOwn = msg.userId === currentUserId;
                      const prev = (currentMessages as TeamMessage[])[i - 1];
                      const showHeader =
                        !prev ||
                        prev.userId !== msg.userId ||
                        new Date(msg.createdAt).getTime() -
                          new Date(prev.createdAt).getTime() >
                          5 * 60 * 1000;
                      return (
                        <ChannelMessageRow
                          key={msg.id}
                          msg={msg}
                          isOwn={isOwn}
                          showHeader={showHeader}
                        />
                      );
                    })}
                  </ul>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {(currentMessages as DirectMessage[]).map((msg, i) => {
                      const isOwn = msg.senderId === currentUserId;
                      const prev = (currentMessages as DirectMessage[])[i - 1];
                      const showHeader =
                        !prev ||
                        prev.senderId !== msg.senderId ||
                        new Date(msg.createdAt).getTime() -
                          new Date(prev.createdAt).getTime() >
                          5 * 60 * 1000;
                      return (
                        <DmMessageRow
                          key={msg.id}
                          msg={msg}
                          isOwn={isOwn}
                          showHeader={showHeader}
                        />
                      );
                    })}
                  </ul>
                )}
              </div>

              {error && (
                <p className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
                  {error}
                </p>
              )}

              {/* Input */}
              <form
                onSubmit={handleSend}
                className="flex items-center gap-2 border-t border-gold/15 bg-cream-50/85 p-3"
              >
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  className="flex-1 rounded-lg border border-gold/25 bg-white/80 px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={draft.trim().length === 0 || sending}
                  className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-cream-50 transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2
                      size={14}
                      strokeWidth={1.75}
                      className="animate-spin text-gold"
                    />
                  ) : (
                    <Send size={14} strokeWidth={1.75} className="text-gold" />
                  )}
                  <span>Enviar</span>
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center">
              <p className="text-sm text-ink/55">
                Selecciona un canal o conversación para ver los mensajes.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── New DM Modal ───────────────────────────────────────────────────── */}
      {showNewDm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNewDm(false);
          }}
        >
          <div className="mx-4 w-full max-w-sm overflow-hidden rounded-2xl border border-gold/15 bg-cream-50 shadow-[0_25px_60px_-15px_rgba(40,28,10,0.30)]">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-gold/15 px-5 py-4">
              <p className="font-serif text-base font-semibold text-ink">
                Nuevo mensaje directo
              </p>
              <button
                type="button"
                onClick={() => setShowNewDm(false)}
                className="rounded-lg p-1 text-ink/50 transition hover:bg-gold/10 hover:text-ink"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>

            {/* Members list */}
            <div className="max-h-80 overflow-y-auto py-2">
              {loadingMembers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2
                    size={20}
                    strokeWidth={1.75}
                    className="animate-spin text-gold"
                  />
                </div>
              ) : members.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink/55">
                  No hay otros miembros del equipo.
                </p>
              ) : (
                members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => startDm(m)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-gold/8"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/20 font-serif text-sm font-semibold text-gold-dark">
                      {m.initials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink">
                        {m.name}
                      </p>
                      <p className="truncate text-[11px] text-ink/50">
                        {m.email}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Channel message row ──────────────────────────────────────────────────────

function ChannelMessageRow({
  msg,
  isOwn,
  showHeader,
}: {
  msg: TeamMessage;
  isOwn: boolean;
  showHeader: boolean;
}) {
  const time = formatTime(msg.createdAt);
  return (
    <li className={cn("flex gap-3", showHeader ? "mt-4 first:mt-0" : "mt-0.5")}>
      {showHeader ? (
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-serif text-xs font-semibold",
            isOwn ? "bg-ink text-cream-50" : "bg-gold/20 text-gold-dark"
          )}
        >
          {msg.userInitials}
        </span>
      ) : (
        <span className="w-8 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-ink">
              {msg.userName}
            </span>
            <span className="text-[10px] text-ink/45">{time}</span>
          </div>
        )}
        <p className="break-words text-sm leading-relaxed text-ink/85">
          {msg.content}
        </p>
      </div>
    </li>
  );
}

// ─── DM message row ───────────────────────────────────────────────────────────

function DmMessageRow({
  msg,
  isOwn,
  showHeader,
}: {
  msg: DirectMessage;
  isOwn: boolean;
  showHeader: boolean;
}) {
  const time = formatTime(msg.createdAt);
  return (
    <li className={cn("flex gap-3", showHeader ? "mt-4 first:mt-0" : "mt-0.5")}>
      {showHeader ? (
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-serif text-xs font-semibold",
            isOwn ? "bg-ink text-cream-50" : "bg-gold/20 text-gold-dark"
          )}
        >
          {msg.senderInitials}
        </span>
      ) : (
        <span className="w-8 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-ink">
              {msg.senderName}
            </span>
            <span className="text-[10px] text-ink/45">{time}</span>
          </div>
        )}
        <p className="break-words text-sm leading-relaxed text-ink/85">
          {msg.content}
        </p>
      </div>
    </li>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
