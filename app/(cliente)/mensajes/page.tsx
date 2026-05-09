"use client";

import { Send } from "lucide-react";
import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/section-header";
import { PageFooter } from "@/components/ui/page-footer";
import { useT } from "@/lib/i18n/provider";
import { mockConversations } from "@/lib/mock-conversations";
import type { Conversation, ConversationMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function MensajesPage() {
  const t = useT();
  const [activeId, setActiveId] = useState<string>(mockConversations[0]?.id);
  const [draft, setDraft] = useState<string>("");
  const [extraMessages, setExtraMessages] = useState<
    Record<string, ConversationMessage[]>
  >({});

  const active = useMemo(
    () => mockConversations.find((c) => c.id === activeId),
    [activeId],
  );

  const threadMessages = useMemo(() => {
    if (!active) return [];
    return [...active.messages, ...(extraMessages[active.id] ?? [])];
  }, [active, extraMessages]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!active || draft.trim().length === 0) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const newMessage: ConversationMessage = {
      id: `local-${now.getTime()}`,
      fromMe: true,
      text: draft.trim(),
      time,
    };
    setExtraMessages((prev) => ({
      ...prev,
      [active.id]: [...(prev[active.id] ?? []), newMessage],
    }));
    setDraft("");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-10 md:px-8">
      <SectionHeader titleKey="mensajes.title" subtitleKey="mensajes.subtitle" />

      <div className="mt-8 grid grid-cols-1 gap-4 overflow-hidden rounded-2xl border border-gold/20 bg-cream-50/85 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.30)] backdrop-blur-sm md:grid-cols-[320px_1fr] md:gap-0 md:[height:640px]">
        {/* Left: list of conversations */}
        <ConversationsList
          conversations={mockConversations}
          activeId={activeId}
          onSelect={setActiveId}
        />

        {/* Right: thread + input */}
        <div className="flex min-h-[440px] flex-col bg-cream-50/40 md:min-h-0 md:border-l md:border-gold/15">
          {active ? (
            <>
              <ThreadHeader conversation={active} />
              <ThreadMessages messages={threadMessages} />
              <form
                onSubmit={handleSend}
                className="flex items-center gap-2 border-t border-gold/15 bg-cream-50/85 p-3"
              >
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t("messages.input.placeholder")}
                  className="flex-1 rounded-lg border border-gold/25 bg-white/80 px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={draft.trim().length === 0}
                  className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-cream-50 transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send size={14} strokeWidth={1.75} className="text-gold" />
                  <span>{t("messages.input.send")}</span>
                </button>
              </form>
            </>
          ) : (
            <ThreadEmptyState />
          )}
        </div>
      </div>

      <PageFooter textKey="login.footer" />
    </div>
  );
}

function ConversationsList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (id: string) => void;
}) {
  const t = useT();

  if (conversations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink/55">
        {t("messages.list.empty")}
      </div>
    );
  }

  return (
    <ul className="flex flex-col overflow-y-auto md:max-h-full">
      <li className="border-b border-gold/15 px-4 py-3">
        <p className="font-serif text-sm font-semibold text-ink">
          {t("messages.list.title")}
        </p>
      </li>
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
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-100 font-serif text-xs font-medium text-ink">
                {c.participant.initials ??
                  c.participant.name
                    .split(" ")
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {c.participant.name}
                  </p>
                  <p className="shrink-0 text-[10px] text-ink/55">
                    {c.lastTimestampLabelKey
                      ? t(c.lastTimestampLabelKey, {
                          time: c.lastTimestamp ?? "",
                        })
                      : (c.lastTimestamp ?? "")}
                  </p>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink/65">
                  {c.lastPreview}
                </p>
              </div>
              {c.unreadCount > 0 && (
                <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-semibold text-ink">
                  {t("messages.unreadBadge", { count: c.unreadCount })}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ThreadHeader({ conversation }: { conversation: Conversation }) {
  const initials =
    conversation.participant.initials ??
    conversation.participant.name
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("");
  return (
    <header className="flex items-center gap-3 border-b border-gold/15 bg-cream-50/85 px-4 py-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cream-100 font-serif text-xs font-medium text-ink">
        {initials}
      </span>
      <p className="font-serif text-base font-semibold text-ink">
        {conversation.participant.name}
      </p>
    </header>
  );
}

function ThreadMessages({ messages }: { messages: ConversationMessage[] }) {
  const t = useT();

  // Group messages by dateGroupKey (only the first one in each group has it)
  return (
    <div className="flex-1 overflow-y-auto px-4 py-5">
      <ul className="flex flex-col gap-2">
        {messages.map((m, i) => (
          <ThreadBubble
            key={m.id}
            message={m}
            // Show date separator if this message has a group key (start of group)
            dateLabel={
              m.dateGroupKey ? t(m.dateGroupKey) : m.dateGroupLabel
            }
            // Show timestamp if next message is from a different sender or is the last
            showTime={
              i === messages.length - 1 ||
              messages[i + 1].fromMe !== m.fromMe
            }
          />
        ))}
      </ul>
    </div>
  );
}

function ThreadBubble({
  message,
  dateLabel,
  showTime,
}: {
  message: ConversationMessage;
  dateLabel?: string;
  showTime: boolean;
}) {
  return (
    <>
      {dateLabel && (
        <li className="my-3 flex items-center justify-center">
          <span className="rounded-full bg-cream-100 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-ink/55">
            {dateLabel}
          </span>
        </li>
      )}
      <li
        className={cn(
          "flex flex-col",
          message.fromMe ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
            message.fromMe
              ? "rounded-br-md bg-ink text-cream-50"
              : "rounded-bl-md bg-white text-ink",
          )}
        >
          {message.text}
        </div>
        {showTime && (
          <span
            className={cn(
              "mt-0.5 text-[10px] text-ink/45",
              message.fromMe ? "pr-2" : "pl-2",
            )}
          >
            {message.time}
          </span>
        )}
      </li>
    </>
  );
}

function ThreadEmptyState() {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <p className="font-serif text-lg text-ink">
        {t("messages.thread.empty.title")}
      </p>
      <p className="mt-1 max-w-xs text-sm text-ink/55">
        {t("messages.thread.empty.text")}
      </p>
    </div>
  );
}
