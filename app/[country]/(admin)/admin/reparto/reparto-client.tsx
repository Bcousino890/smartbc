"use client";

// ============================================================================
// REPARTO COMERCIAL · la pantalla
//
// Una tabla de inmuebles (fichas propias y anuncios de Idealista sin ficha)
// con su «Asesor del piso». Se seleccionan varios —también de páginas
// distintas— y se asignan a un asesor en UNA operación. Antes de confirmar se
// ve qué se sustituye; después, el resultado de cada inmueble (incluidos los
// que otro administrador cambió entretanto, que NO se sobrescriben).
//
// Esto decide el reparto INICIAL de clientes nuevos o sin asesor que lleguen
// desde ahora. No mueve a ningún cliente ya asignado: para eso está
// «Reasignar cliente» en la ficha de la solicitud.
// ============================================================================

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button, Empty, Labeled, Modal, Pill, Select, TextArea } from "@/components/admin/ui/primitives";
import type { RoutingPage, RoutingTarget } from "@/lib/db/queries/routing";
import type { RuleItemOutcome } from "@/lib/sales-inbox/routing";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { clearRoutingRules, setRoutingRules } from "./actions";

type Advisor = { id: string; name: string; role: string };

/** Lo que se recuerda de cada inmueble seleccionado (puede ser de otra página). */
type Picked = {
  key: string;
  title: string;
  reference: string | null;
  version: number;
  advisorId: string | null;
};

function pick(t: RoutingTarget): Picked {
  return {
    key: t.key,
    title: t.title,
    reference: t.reference,
    version: t.rule?.version ?? 0,
    advisorId: t.rule?.active ? t.rule.advisorId : null,
  };
}

export function RepartoClient(props: {
  country: string;
  denied?: string;
  page?: RoutingPage;
  advisors?: Advisor[];
  pendingLeads?: number;
  inboxHref?: string;
}) {
  const t = useT();
  if (props.denied || !props.page || !props.advisors) {
    return (
      <div className="sol-root min-h-screen">
        <div className="mx-auto max-w-[1100px] px-6 pb-10 lg:px-10">
          <AdminPageHeader titleKey="reparto.title" subtitleKey="reparto.subtitle" welcome={false} />
          <div className="mt-8">
            <Empty>{t("reparto.denied")}</Empty>
          </div>
        </div>
      </div>
    );
  }
  return <RepartoTable {...props} page={props.page} advisors={props.advisors} />;
}

function RepartoTable({
  country,
  page,
  advisors,
  pendingLeads = 0,
  inboxHref,
}: {
  country: string;
  page: RoutingPage;
  advisors: Advisor[];
  pendingLeads?: number;
  inboxHref?: string;
}) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [navPending, startNav] = useTransition();
  const [search, setSearch] = useState(params?.get("q") ?? "");
  const [picked, setPicked] = useState<Map<string, Picked>>(new Map());
  const [dialog, setDialog] = useState<null | "assign" | "clear">(null);
  const [results, setResults] = useState<RuleItemOutcome[] | null>(null);

  const nameOf = useMemo(() => {
    const m = new Map(advisors.map((a) => [a.id, a.name]));
    return (id: string | null | undefined) => (id ? (m.get(id) ?? t("reparto.unknownAdvisor")) : null);
  }, [advisors, t]);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const qs = new URLSearchParams(params?.toString() ?? "");
      for (const [k, v] of Object.entries(patch)) {
        if (!v) qs.delete(k);
        else qs.set(k, v);
      }
      if (!("page" in patch)) qs.delete("page");
      startNav(() => router.replace(`?${qs.toString()}`, { scroll: false }));
    },
    [params, router],
  );

  const pageKeys = page.items.map((i) => i.key);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => picked.has(k));
  const toggle = (row: RoutingTarget) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(row.key)) next.delete(row.key);
      else next.set(row.key, pick(row));
      return next;
    });
  const togglePage = () =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (allOnPage) pageKeys.forEach((k) => next.delete(k));
      else page.items.forEach((r) => next.set(r.key, pick(r)));
      return next;
    });

  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));

  return (
    <div className="sol-root min-h-screen">
    <div className="mx-auto max-w-[1200px] px-4 pb-10 sm:px-6 lg:px-10">
      <AdminPageHeader titleKey="reparto.title" subtitleKey="reparto.subtitle" welcome={false} />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label={t("reparto.stat.withRule")} value={page.withRule} />
        <Stat label={t("reparto.stat.withoutRule")} value={page.withoutRule} />
        <div className="rounded-lg border border-ink/10 bg-white px-4 py-3">
          <p className="crm-label-sm text-ink/50">{t("reparto.stat.pending")}</p>
          <p className="crm-number mt-1 text-2xl text-ink">{pendingLeads}</p>
          {inboxHref && pendingLeads > 0 && (
            <Link href={inboxHref} className="mt-1 inline-block text-xs text-gold-dark underline-offset-2 hover:underline">
              {t("reparto.stat.pendingLink")}
            </Link>
          )}
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm text-ink/60">{t("reparto.policy")}</p>

      {/* Filtros */}
      <form
        className="mt-5 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ q: search.trim() || null });
        }}
        role="search"
      >
        <Labeled label={t("reparto.search")} className="min-w-[220px] flex-1">
          <span className="relative block">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("reparto.searchPlaceholder")}
              className="crm-input w-full rounded-md border border-ink/15 bg-white py-2 pl-8 pr-3 text-ink outline-none focus:border-gold/60"
            />
          </span>
        </Labeled>
        <Labeled label={t("reparto.filter.advisor")} className="w-full sm:w-64">
          <Select
            value={params?.get("advisor") ?? ""}
            onChange={(e) => setParams({ advisor: e.target.value || null })}
          >
            <option value="">{t("reparto.filter.all")}</option>
            <option value="none">{t("reparto.filter.none")}</option>
            {advisors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Labeled>
        <Button type="submit" className="min-h-[44px] sm:min-h-0">{t("reparto.searchButton")}</Button>
      </form>

      {/* Tabla */}
      <div className={cn("mt-4 overflow-hidden rounded-lg border border-ink/10 bg-white", navPending && "opacity-60")}>
        {page.items.length === 0 ? (
          <div className="p-4">
            <Empty
              action={
                (params?.get("q") || params?.get("advisor")) && (
                  <Button size="sm" onClick={() => { setSearch(""); setParams({ q: null, advisor: null }); }}>
                    {t("reparto.clearFilters")}
                  </Button>
                )
              }
            >
              {t("reparto.empty")}
            </Empty>
          </div>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">{t("reparto.title")}</caption>
            <thead className="hidden border-b border-ink/8 text-left md:table-header-group">
              <tr className="crm-label-sm text-ink/50">
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allOnPage}
                    onChange={togglePage}
                    aria-label={t("reparto.selectPage")}
                    className="h-4 w-4"
                  />
                </th>
                <th className="px-3 py-2">{t("reparto.col.property")}</th>
                <th className="px-3 py-2">{t("reparto.col.listings")}</th>
                <th className="px-3 py-2">{t("reparto.col.advisor")}</th>
                <th className="px-3 py-2">{t("reparto.col.rule")}</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((row) => {
                const active = !!row.rule?.active && !!row.rule.advisorId;
                const checked = picked.has(row.key);
                return (
                  <tr
                    key={row.key}
                    className={cn(
                      "grid grid-cols-[2.5rem_1fr] gap-x-1 border-b border-ink/6 px-1 py-2 md:table-row md:p-0",
                      checked && "bg-gold/[0.06]",
                    )}
                  >
                    <td className="row-span-4 px-2 py-1 md:px-3 md:py-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(row)}
                        aria-label={t("reparto.selectOne", { name: row.reference ?? row.title })}
                        className="h-5 w-5 md:h-4 md:w-4"
                      />
                    </td>
                    <td className="px-1 md:px-3 md:py-2.5">
                      <p className="font-medium text-ink">
                        {row.reference && <span className="crm-number mr-2 text-ink/55">{row.reference}</span>}
                        {row.title}
                      </p>
                      {row.address && <p className="text-xs text-ink/50">{row.address}</p>}
                      {row.subject.kind === "listing" && (
                        <p className="text-xs text-ink/40">{t("reparto.listingOnly")}</p>
                      )}
                    </td>
                    <td className="px-1 text-xs text-ink/60 md:px-3 md:py-2.5">
                      {row.listings.length === 0
                        ? <span className="text-ink/35">{t("reparto.noListings")}</span>
                        : row.listings.map((l) => (
                            <span key={l.id} className="mr-2 inline-block">
                              {[l.reference, l.code && `Cod. ${l.code}`].filter(Boolean).join(" · ")}
                            </span>
                          ))}
                    </td>
                    <td className="px-1 md:px-3 md:py-2.5">
                      {active ? (
                        <span className="text-ink">{nameOf(row.rule!.advisorId)}</span>
                      ) : (
                        <Pill tone="warning">{t("reparto.noRule")}</Pill>
                      )}
                    </td>
                    <td className="px-1 text-xs text-ink/50 md:px-3 md:py-2.5">
                      {row.rule
                        ? t(row.rule.active ? "reparto.ruleActive" : "reparto.ruleInactive", {
                            version: row.rule.version,
                            date: new Date(row.rule.updatedAt).toLocaleDateString("es-ES"),
                          })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {pages > 1 && (
        <nav className="mt-3 flex items-center justify-between text-xs text-ink/55" aria-label={t("reparto.pagination")}>
          <span>{t("reparto.pageOf", { page: page.page, pages, total: page.total })}</span>
          <span className="flex gap-2">
            <Button size="sm" disabled={page.page <= 1} onClick={() => setParams({ page: String(page.page - 1) })} aria-label={t("reparto.prev")}>
              <ChevronLeft size={12} />
            </Button>
            <Button size="sm" disabled={page.page >= pages} onClick={() => setParams({ page: String(page.page + 1) })} aria-label={t("reparto.next")}>
              <ChevronRight size={12} />
            </Button>
          </span>
        </nav>
      )}

      {/* Barra contextual de selección */}
      {picked.size > 0 && (
        // Pegada al pie DEL CONTENIDO (no de la ventana): no se mete bajo el menú
        // lateral ni tapa la última fila.
        <div className="sticky bottom-3 z-30 mt-4 rounded-lg border border-ink/10 bg-white/95 px-4 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink" aria-live="polite">
              {t("reparto.selected", { count: picked.size })}
            </span>
            <Button variant="primary" onClick={() => { setResults(null); setDialog("assign"); }} className="min-h-[44px] sm:min-h-0">
              {t("reparto.assign")}
            </Button>
            <Button onClick={() => { setResults(null); setDialog("clear"); }} className="min-h-[44px] sm:min-h-0">
              {t("reparto.clear")}
            </Button>
            <Button variant="ghost" onClick={() => setPicked(new Map())} className="ms-auto">
              <X size={12} /> {t("reparto.unselect")}
            </Button>
          </div>
        </div>
      )}

      {dialog && (
        <RuleDialog
          mode={dialog}
          country={country}
          picked={[...picked.values()]}
          advisors={advisors}
          nameOf={nameOf}
          results={results}
          onResults={(r) => {
            setResults(r);
            // Lo que salió bien deja de estar seleccionado; los conflictos se
            // quedan para revisarlos con el dato actual.
            setPicked((prev) => {
              const next = new Map(prev);
              for (const o of r) {
                const key = o.propertyId ? `p:${o.propertyId}` : `l:${o.listingId}`;
                if (o.result !== "version_conflict") next.delete(key);
              }
              return next;
            });
            router.refresh();
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white px-4 py-3">
      <p className="crm-label-sm text-ink/50">{label}</p>
      <p className="crm-number mt-1 text-2xl text-ink">{value}</p>
    </div>
  );
}

/** Confirmación con alcance y, después, resultado por inmueble. */
function RuleDialog({
  mode,
  country,
  picked,
  advisors,
  nameOf,
  results,
  onResults,
  onClose,
}: {
  mode: "assign" | "clear";
  country: string;
  picked: Picked[];
  advisors: Advisor[];
  nameOf: (id: string | null | undefined) => string | null;
  results: RuleItemOutcome[] | null;
  onResults: (r: RuleItemOutcome[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [advisorId, setAdvisorId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const replacing = mode === "assign" ? picked.filter((p) => p.advisorId && p.advisorId !== advisorId) : [];
  const byKey = new Map(picked.map((p) => [p.key, p]));

  const submit = () => {
    setError(null);
    const items = picked.map((p) => ({ key: p.key, expectedVersion: p.version }));
    startSave(async () => {
      const r =
        mode === "assign"
          ? await setRoutingRules({ country, advisorId, items, reason })
          : await clearRoutingRules({ country, items, reason });
      if (!r.ok) setError(r.error);
      else onResults(r.outcomes);
    });
  };

  const title = t(mode === "assign" ? "reparto.dialog.assignTitle" : "reparto.dialog.clearTitle", { count: picked.length });

  if (results) {
    const conflicts = results.filter((r) => r.result === "version_conflict").length;
    return (
      <Modal open onClose={onClose} title={t("reparto.result.title")} footer={<Button variant="primary" onClick={onClose}>{t("reparto.result.close")}</Button>}>
        <p className="text-sm text-ink/70" role="status">
          {t("reparto.result.summary", { ok: results.length - conflicts, conflicts })}
        </p>
        <ul className="mt-3 divide-y divide-ink/6 text-sm">
          {results.map((r) => {
            const key = r.propertyId ? `p:${r.propertyId}` : `l:${r.listingId}`;
            const p = byKey.get(key);
            return (
              <li key={key} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0 text-ink">
                  {p?.reference && <span className="crm-number mr-1.5 text-ink/55">{p.reference}</span>}
                  {p?.title ?? key}
                </span>
                <span className="shrink-0 text-right">
                  <Pill tone={r.result === "version_conflict" ? "critical" : r.result === "unchanged" ? "neutral" : "positive"}>
                    {t(`reparto.result.${r.result}`)}
                  </Pill>
                  {r.result === "version_conflict" && (
                    <span className="mt-1 block text-xs text-ink/55">
                      {t("reparto.result.conflictNow", { name: nameOf(r.currentAdvisorId) ?? t("reparto.noRule") })}
                    </span>
                  )}
                  {r.result === "replaced" && r.previousAdvisorId && (
                    <span className="mt-1 block text-xs text-ink/55">
                      {t("reparto.result.before", { name: nameOf(r.previousAdvisorId) ?? "—" })}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      wide
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={submit} disabled={saving || (mode === "assign" && !advisorId)}>
            {saving ? t("reparto.dialog.saving") : t(mode === "assign" ? "reparto.dialog.confirmAssign" : "reparto.dialog.confirmClear")}
          </Button>
        </>
      }
    >
      {mode === "assign" && (
        <Labeled label={t("reparto.dialog.advisor")}>
          <Select value={advisorId} onChange={(e) => setAdvisorId(e.target.value)} required>
            <option value="">{t("reparto.dialog.chooseAdvisor")}</option>
            {advisors.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Labeled>
      )}

      <p className="mt-3 text-sm text-ink/65">
        {t(mode === "assign" ? "reparto.dialog.assignScope" : "reparto.dialog.clearScope")}
      </p>
      {replacing.length > 0 && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t("reparto.dialog.replacing", { count: replacing.length })}
        </p>
      )}

      <ul className="mt-3 max-h-64 divide-y divide-ink/6 overflow-y-auto rounded-md border border-ink/10 text-sm">
        {picked.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0 truncate text-ink">
              {p.reference && <span className="crm-number mr-1.5 text-ink/55">{p.reference}</span>}
              {p.title}
            </span>
            <span className="shrink-0 text-xs text-ink/55">
              {p.advisorId
                ? mode === "assign" && p.advisorId === advisorId
                  ? t("reparto.dialog.same")
                  : t("reparto.dialog.current", { name: nameOf(p.advisorId) ?? "—" })
                : t("reparto.noRule")}
            </span>
          </li>
        ))}
      </ul>

      <Labeled label={t("reparto.dialog.reason")} className="mt-3">
        <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reparto.dialog.reasonPlaceholder")} />
      </Labeled>

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </Modal>
  );
}
