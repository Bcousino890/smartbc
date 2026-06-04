"use client";

import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { GoogleCalendarConnect } from "./google-connect";

// Google Calendar event shape (simplified)
type GCalEvent = {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  htmlLink?: string | null;
};

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DAY_NAMES_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

type NewEventForm = {
  title: string;
  description: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
  attendees: string;
};

const DEFAULT_FORM: NewEventForm = {
  title: "",
  description: "",
  location: "",
  date: new Date().toISOString().slice(0, 10),
  startTime: "10:00",
  endTime: "11:00",
  attendees: "",
};

export function CalendarioClient({
  initialConnected,
  initialConnectedAt,
  pendingVisits,
}: {
  initialConnected: boolean;
  initialConnectedAt?: string;
  pendingVisits: number;
}) {
  const now = new Date();
  const [connected, setConnected] = useState(initialConnected);
  const [connectedAt, setConnectedAt] = useState(initialConnectedAt);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [events, setEvents] = useState<GCalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<NewEventForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/calendario/events?year=${year}&month=${month}`,
      );
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [connected, year, month]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);

    const startISO = new Date(
      `${form.date}T${form.startTime}:00`,
    ).toISOString();
    const endISO = new Date(`${form.date}T${form.endTime}:00`).toISOString();
    const attendees = form.attendees
      ? form.attendees.split(",").map((a) => a.trim()).filter(Boolean)
      : [];

    try {
      const res = await fetch("/api/admin/calendario/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          location: form.location || undefined,
          start: startISO,
          end: endISO,
          attendees,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setSaveError(err.error ?? "Error al crear el evento");
        return;
      }
      setShowModal(false);
      setForm(DEFAULT_FORM);
      await fetchEvents();
    } catch {
      setSaveError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  // ---- Calendar grid logic ----
  const firstDay = new Date(year, month - 1, 1);
  // Monday-based: 0=Mon ... 6=Sun
  const startWeekDay = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  // Map events to day numbers
  const eventsByDay: Record<number, GCalEvent[]> = {};
  for (const ev of events) {
    const dt = ev.start?.dateTime ?? ev.start?.date;
    if (!dt) continue;
    const d = new Date(dt);
    if (d.getFullYear() === year && d.getMonth() + 1 === month) {
      const day = d.getDate();
      if (!eventsByDay[day]) eventsByDay[day] = [];
      eventsByDay[day].push(ev);
    }
  }

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="calendario.title"
        subtitleKey="calendario.subtitle"
        welcome={false}
      />

      {/* Google Calendar connect card */}
      <div className="mt-7">
        <GoogleCalendarConnect
          connected={connected}
          connectedAt={connectedAt}
          onDisconnect={() => {
            setConnected(false);
            setConnectedAt(undefined);
            setEvents([]);
          }}
        />
      </div>

      {connected && (
        <section className="mt-6 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
          {/* Calendar header */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={prevMonth}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 bg-white/70 text-ink/70 transition hover:bg-white"
              >
                <ChevronLeft size={15} strokeWidth={1.75} />
              </button>
              <h2 className="font-serif text-xl font-medium text-ink min-w-[200px] text-center">
                {MONTH_NAMES_ES[month - 1]} {year}
              </h2>
              <button
                type="button"
                onClick={nextMonth}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 bg-white/70 text-ink/70 transition hover:bg-white"
              >
                <ChevronRight size={15} strokeWidth={1.75} />
              </button>
              {loading && (
                <Loader2
                  size={16}
                  strokeWidth={1.75}
                  className="animate-spin text-gold/70"
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              {pendingVisits > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                  <Calendar size={11} strokeWidth={2} />
                  {pendingVisits} visita{pendingVisits !== 1 ? "s" : ""} pendiente
                  {pendingVisits !== 1 ? "s" : ""}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setForm(DEFAULT_FORM);
                  setSaveError(null);
                  setShowModal(true);
                }}
                className="flex items-center gap-2 rounded-lg bg-gold px-3.5 py-2 text-[13px] font-medium text-ink shadow-sm transition hover:bg-gold/80"
              >
                <Plus size={15} strokeWidth={2} />
                Nueva visita
              </button>
            </div>
          </div>

          {/* Day headers */}
          <div className="mt-5 grid grid-cols-7 gap-1 text-center">
            {DAY_NAMES_ES.map((d) => (
              <div
                key={d}
                className="py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink/45"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="mt-1 grid grid-cols-7 gap-1">
            {/* Empty cells before first day */}
            {Array.from({ length: startWeekDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-24 rounded-lg" />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = dateStr === todayStr;
              const dayEvents = eventsByDay[day] ?? [];

              return (
                <div
                  key={day}
                  className={`h-24 rounded-lg border p-1.5 transition ${
                    isToday
                      ? "border-gold/40 bg-gold/8"
                      : "border-transparent bg-white/40 hover:bg-white/70"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-medium ${
                      isToday
                        ? "bg-gold text-ink"
                        : "text-ink/70"
                    }`}
                  >
                    {day}
                  </span>
                  <div className="mt-0.5 space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <a
                        key={ev.id}
                        href={ev.htmlLink ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={ev.summary ?? "Evento"}
                        className="block truncate rounded px-1 py-0.5 text-[10px] font-medium bg-gold/20 text-ink/80 hover:bg-gold/40 transition"
                      >
                        {ev.summary ?? "Evento"}
                      </a>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="block text-[9px] text-ink/45 pl-1">
                        +{dayEvents.length - 2} más
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center gap-4 text-[11px] text-ink/50">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-gold/20" />
              Visita programada
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-emerald-100 border border-emerald-200" />
              Confirmada
            </span>
          </div>
        </section>
      )}

      {/* New event modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-gold/20 bg-cream-50 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-serif text-xl font-medium text-ink">
                Nueva visita
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 bg-white/70 text-ink/70 transition hover:bg-white"
              >
                <X size={15} strokeWidth={1.75} />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-ink/70 mb-1">
                  Título *
                </label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Visita · Piso en Eixample"
                  className="w-full rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-ink/70 mb-1">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[12px] font-medium text-ink/70 mb-1">
                      Inicio *
                    </label>
                    <input
                      type="time"
                      required
                      value={form.startTime}
                      onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                      className="w-full rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-ink/70 mb-1">
                      Fin *
                    </label>
                    <input
                      type="time"
                      required
                      value={form.endTime}
                      onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                      className="w-full rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ink/70 mb-1">
                  Ubicación
                </label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="Calle, número, ciudad"
                  className="w-full rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ink/70 mb-1">
                  Descripción
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Datos del cliente, notas..."
                  className="w-full rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ink/70 mb-1">
                  Invitados (emails separados por coma)
                </label>
                <input
                  type="text"
                  value={form.attendees}
                  onChange={(e) => setForm((f) => ({ ...f, attendees: e.target.value }))}
                  placeholder="cliente@email.com, asesor@email.com"
                  className="w-full rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
                />
              </div>

              {saveError && (
                <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] text-rose-700">
                  {saveError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-ink/10 bg-white/70 px-4 py-2 text-[13px] font-medium text-ink/70 transition hover:bg-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-[13px] font-medium text-ink transition hover:bg-gold/80 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 size={13} strokeWidth={1.75} className="animate-spin" />
                  ) : (
                    <Plus size={13} strokeWidth={2} />
                  )}
                  Crear evento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
