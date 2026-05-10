"use client";

import {
  CheckCircle2,
  Search,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { formatRelativeMinutes } from "@/lib/relative-time";
import type { VisitRequest, VisitRequestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<VisitRequestStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rescheduled: "border-blue-200 bg-blue-50 text-blue-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  completed: "border-violet-200 bg-violet-50 text-violet-700",
};

export function SolicitudesAdminClient({
  requests,
}: {
  requests: VisitRequest[];
}) {
  const t = useT();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(
      (r) =>
        r.clientName.toLowerCase().includes(q) ||
        r.propertyTitle.toLowerCase().includes(q) ||
        r.propertyReference.toLowerCase().includes(q),
    );
  }, [requests, query]);

  return (
    <section className="mt-5 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <label className="flex w-full max-w-md items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
        <Search size={15} strokeWidth={1.75} className="text-ink/45" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("solicitudes.search.placeholder")}
          className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
        />
      </label>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1100px] border-separate border-spacing-y-1.5 text-left text-sm">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
              <th className="px-3 pb-2">{t("solicitudes.table.client")}</th>
              <th className="px-3 pb-2">{t("solicitudes.table.property")}</th>
              <th className="px-3 pb-2">{t("solicitudes.table.requestedDate")}</th>
              <th className="px-3 pb-2">{t("solicitudes.table.channel")}</th>
              <th className="px-3 pb-2">{t("solicitudes.table.advisor")}</th>
              <th className="px-3 pb-2">{t("solicitudes.table.received")}</th>
              <th className="px-3 pb-2">{t("solicitudes.table.status")}</th>
              <th className="px-3 pb-2 text-right">{t("solicitudes.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="rounded-xl border border-gold/15 bg-white/40 px-4 py-10 text-center text-ink/55"
                >
                  {t("solicitudes.empty")}
                </td>
              </tr>
            ) : (
              filtered.map((r) => <RequestRow key={r.id} request={r} />)
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RequestRow({ request }: { request: VisitRequest }) {
  const t = useT();
  const isPending = request.status === "pending";
  return (
    <tr className="bg-white/55 transition hover:bg-white/85">
      <td className="rounded-l-xl px-3 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-100 font-serif text-[10px] font-medium text-ink">
            {request.clientInitials}
          </span>
          <span className="font-medium text-ink">{request.clientName}</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <p className="font-medium text-ink">{request.propertyTitle}</p>
        <p className="text-[11px] text-ink/55">
          {t("agency.properties.ref", { ref: request.propertyReference })}
        </p>
      </td>
      <td className="px-3 py-3 text-ink/75">{request.requestedDateLabel}</td>
      <td className="px-3 py-3">
        <span className="rounded-md border border-ink/10 bg-cream-100/80 px-2.5 py-1 text-[11px] font-medium text-ink/75">
          {t(request.channelKey)}
        </span>
      </td>
      <td className="px-3 py-3 text-ink/75">{request.assignedAdvisor}</td>
      <td className="px-3 py-3 text-[12px] text-ink/65">
        {formatRelativeMinutes(request.receivedRelativeMinutes, t)}
      </td>
      <td className="px-3 py-3">
        <span
          className={cn(
            "rounded-md border px-2.5 py-1 text-[11px] font-medium",
            STATUS_STYLES[request.status],
          )}
        >
          {t(`solicitudes.status.${request.status}`)}
        </span>
      </td>
      <td className="rounded-r-xl px-3 py-3 text-right">
        {isPending ? (
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-700"
            >
              <CheckCircle2 size={12} strokeWidth={1.75} />
              <span>{t("solicitudes.action.confirm")}</span>
            </button>
            <button
              type="button"
              aria-label={t("solicitudes.action.reject")}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100"
            >
              <XCircle size={13} strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-ink/70 transition hover:bg-white"
          >
            {t("solicitudes.action.reschedule")}
          </button>
        )}
      </td>
    </tr>
  );
}
