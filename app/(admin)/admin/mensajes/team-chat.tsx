"use client";

import { Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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

export function TeamChat({ currentUserId }: { currentUserId: string }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load channels on mount
  useEffect(() => {
    fetch("/api/admin/team/channels")
      .then((r) => r.json())
      .then((data: { channels?: Channel[] }) => {
        const ch = data.channels ?? [];
        setChannels(ch);
        if (ch.length > 0) setActiveChannelId(ch[0].id);
      })
      .catch(() => {});
  }, []);

  const fetchMessages = useCallback(
    async (channelId: string, silent = false) => {
      if (!silent) setLoadingMessages(true);
      try {
        const res = await fetch(
          `/api/admin/team/messages?channelId=${channelId}`
        );
        const data: { messages?: TeamMessage[] } = await res.json();
        setMessages(data.messages ?? []);
      } catch {
        // ignore polling errors silently
      } finally {
        if (!silent) setLoadingMessages(false);
      }
    },
    []
  );

  // Load messages when channel changes
  useEffect(() => {
    if (!activeChannelId) return;
    setMessages([]);
    fetchMessages(activeChannelId);
  }, [activeChannelId, fetchMessages]);

  // Polling every 5 seconds
  useEffect(() => {
    if (!activeChannelId) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetchMessages(activeChannelId, true);
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeChannelId, fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, activeChannelId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !activeChannelId || sending) return;
    setDraft("");
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/admin/team/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: activeChannelId, content }),
      });
      const data: { ok?: boolean; message?: TeamMessage; error?: string } =
        await res.json();
      if (data.ok && data.message) {
        setMessages((prev) => [...prev, data.message!]);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as React.FormEvent);
    }
  };

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;

  return (
    <section className="grid min-h-[640px] grid-cols-1 overflow-hidden rounded-2xl border border-gold/15 bg-cream-50/85 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:grid-cols-[240px_1fr] md:[height:640px]">
      {/* Sidebar: channel list */}
      <aside className="flex flex-col overflow-hidden border-b border-gold/15 md:border-b-0 md:border-r">
        <div className="border-b border-gold/15 px-4 py-3">
          <p className="font-serif text-sm font-semibold text-ink">Canales</p>
        </div>
        <ul className="flex-1 overflow-y-auto py-2">
          {channels.map((ch) => {
            const active = ch.id === activeChannelId;
            return (
              <li key={ch.id}>
                <button
                  type="button"
                  onClick={() => setActiveChannelId(ch.id)}
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
      </aside>

      {/* Main: messages */}
      <div className="flex min-h-[440px] flex-col bg-cream-50/40 md:min-h-0">
        {activeChannel ? (
          <>
            {/* Channel header */}
            <header className="flex items-center gap-3 border-b border-gold/15 bg-cream-50/85 px-4 py-3">
              <span className="text-xl leading-none">{activeChannel.emoji}</span>
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
            </header>

            {/* Messages area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
              {loadingMessages ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2
                    size={20}
                    strokeWidth={1.75}
                    className="animate-spin text-gold"
                  />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center text-sm text-ink/55">
                  No hay mensajes en #{activeChannel.name} todavía. ¡Sé el
                  primero!
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {messages.map((msg, i) => {
                    const isOwn = msg.userId === currentUserId;
                    const prev = messages[i - 1];
                    const showHeader =
                      !prev ||
                      prev.userId !== msg.userId ||
                      new Date(msg.createdAt).getTime() -
                        new Date(prev.createdAt).getTime() >
                        5 * 60 * 1000;
                    return (
                      <MessageRow
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
                placeholder={`Mensaje en #${activeChannel.name}…`}
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
              Selecciona un canal para ver los mensajes.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function MessageRow({
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
            isOwn
              ? "bg-ink text-cream-50"
              : "bg-gold/20 text-gold-dark"
          )}
        >
          {msg.userInitials}
        </span>
      ) : (
        <span className="w-8 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        {showHeader && (
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-ink">
              {msg.userName}
            </span>
            <span className="text-[10px] text-ink/45">{time}</span>
          </div>
        )}
        <p className="text-sm text-ink/85 leading-relaxed break-words">
          {msg.content}
        </p>
      </div>
    </li>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
