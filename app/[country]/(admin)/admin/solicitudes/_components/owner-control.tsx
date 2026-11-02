"use client";

// ============================================================================
// RESPONSABLE DE LA SOLICITUD
//
// Siempre a la vista: quién la lleva, de dónde viene esa asignación y el
// estado de Zinto, que es INDEPENDIENTE (un fallo de Zinto no borra al
// responsable del CRM).
//
// Solo un administrador la cambia. Con cliente vinculado no se reasigna la
// solicitud suelta: se reasigna el cliente entero, viendo antes qué mueve.
// ============================================================================

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { LeadDetail } from "@/lib/db/queries/sales-inbox";
import type { ClientReassignScope } from "@/lib/db/queries/routing";
import type { StaffRef } from "@/lib/portal-links/types";
import { useT } from "@/lib/i18n/provider";
import { Button, Labeled, Modal, Pill, Select, TextArea, type Tone } from "@/components/admin/ui/primitives";
import { assignLead, getReassignScope, reassignClient, retryZintoSync } from "../inbox-actions";

const ZINTO_TONE: Record<string, Tone> = {
  none: "neutral",
  pending: "warning",
  sent: "info",
  acked: "positive",
  error: "critical",
};

export function OwnerControl({
  lead,
  staff,
  isAdmin,
}: {
  lead: LeadDetail;
  staff: StaffRef[];
  isAdmin: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [retrying, startRetry] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sync = lead.zintoSync;
  const syncState = sync?.state ?? "none";
  const clientOwnerDiffers =
    lead.clientAdvisor && lead.clientAdvisor.id && lead.clientAdvisor.id !== lead.assignedTo;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="crm-label-sm text-ink/45">{t("inbox.owner.label")}</span>
        {lead.routingStatus === "conflict" ? (
          <Pill tone="critical">{t("inbox.routing.conflict")}</Pill>
        ) : lead.assignedTo ? (
          <span className="text-sm font-medium text-ink">{lead.assignedName ?? t("inbox.row.assigned")}</span>
        ) : (
          <Pill tone="warning">{t("inbox.routing.pending")}</Pill>
        )}
        {isAdmin ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="min-h-[36px]">
            {lead.clientId ? t("inbox.owner.reassignClient") : t("inbox.owner.change")}
          </Button>
        ) : (
          <span className="text-xs text-ink/40">{t("inbox.owner.adminOnly")}</span>
        )}
      </div>

      <p className="mt-0.5 text-xs text-ink/50">
        {lead.routingStatus !== "assigned" && lead.routingReason
          ? t(`inbox.routing.reason.${lead.routingReason}`)
          : lead.assignmentSource
            ? t(`inbox.owner.source.${lead.assignmentSource}`)
            : null}
        {clientOwnerDiffers && (
          <> · {t("inbox.owner.clientAdvisor", { name: lead.clientAdvisor?.name ?? "—" })}</>
        )}
      </p>

      {/* Zinto: estado propio, separado del responsable. */}
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
        <Pill tone={ZINTO_TONE[syncState]}>{t(`inbox.zintoSync.${syncState}`)}</Pill>
        {sync?.blockedReason === "contract_missing" && syncState === "pending" && (
          <span className="text-ink/45">{t("inbox.zintoSync.contractMissing")}</span>
        )}
        {sync?.state === "error" && sync.lastError && <span className="text-rose-700">{sync.lastError}</span>}
        {isAdmin && sync && sync.state === "error" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={retrying}
            onClick={() =>
              startRetry(async () => {
                setError(null);
                const r = await retryZintoSync(sync.id);
                if (!r.ok) setError(r.error);
                else router.refresh();
              })
            }
          >
            <RefreshCw size={11} /> {t("inbox.zintoSync.retry")}
          </Button>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-rose-700">{error}</p>}

      {open && isAdmin && (lead.clientId ? (
        <ReassignClientDialog lead={lead} staff={staff} onClose={() => setOpen(false)} />
      ) : (
        <AssignLeadDialog lead={lead} staff={staff} onClose={() => setOpen(false)} />
      ))}
    </div>
  );
}

/** Solicitud sin cliente vinculado: se asigna ella sola. */
function AssignLeadDialog({ lead, staff, onClose }: { lead: LeadDetail; staff: StaffRef[]; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [advisor, setAdvisor] = useState(lead.assignedTo ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const replacing = !!lead.assignedTo && advisor !== lead.assignedTo;
  const unchanged = (advisor || null) === (lead.assignedTo ?? null);

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await assignLead(lead.id, advisor || null, {
        expectedVersion: lead.assignmentVersion,
        reason,
      });
      if (!r.ok) setError(r.error);
      else {
        router.refresh();
        onClose();
      }
    });

  return (
    <Modal
      open
      onClose={onClose}
      title={t("inbox.assignDialog.title")}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={submit} disabled={saving || unchanged || (replacing && !reason.trim())}>
            {saving ? t("cc.saving") : t("inbox.assignDialog.confirm")}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink/65">
        {t("inbox.assignDialog.current", { name: lead.assignedName ?? t("inbox.routing.pending") })}
      </p>
      <Labeled label={t("inbox.assignDialog.advisor")} className="mt-3">
        <Select value={advisor} onChange={(e) => setAdvisor(e.target.value)}>
          <option value="">{t("inbox.assignDialog.leavePending")}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </Labeled>
      <Labeled label={replacing ? t("inbox.assignDialog.reasonRequired") : t("inbox.assignDialog.reason")} className="mt-3">
        <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Labeled>
      <p className="mt-3 text-xs text-ink/55">{t("inbox.assignDialog.zintoNote")}</p>
      {error && <p role="alert" className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </Modal>
  );
}

/** Cliente vinculado: se reasigna el cliente completo, con alcance previo. */
function ReassignClientDialog({ lead, staff, onClose }: { lead: LeadDetail; staff: StaffRef[]; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [scope, setScope] = useState<ClientReassignScope | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [advisor, setAdvisor] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ leads: number; tasks: number } | null>(null);
  const [saving, start] = useTransition();
  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.name ?? null;

  useEffect(() => {
    let cancelled = false;
    getReassignScope(lead.clientId as string).then((r) => {
      if (cancelled) return;
      if (r.ok) setScope(r.scope);
      else setLoadError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [lead.clientId]);

  const submit = () =>
    scope &&
    start(async () => {
      setError(null);
      const r = await reassignClient({
        clientId: scope.clientId,
        advisorId: advisor,
        reason,
        expectedVersion: scope.version,
      });
      if (!r.ok) setError(r.error);
      else {
        setDone({ leads: r.leads, tasks: r.tasks });
        router.refresh();
      }
    });

  if (done) {
    return (
      <Modal open onClose={onClose} title={t("inbox.reassign.title")} footer={<Button variant="primary" onClick={onClose}>{t("reparto.result.close")}</Button>}>
        <p role="status" className="text-sm text-ink/75">{t("inbox.reassign.done", done)}</p>
        <p className="mt-2 text-xs text-ink/55">{t("inbox.assignDialog.zintoNote")}</p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("inbox.reassign.title")}
      wide
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={saving || !scope || !advisor || advisor === scope?.currentAdvisorId || !reason.trim()}
          >
            {saving ? t("cc.saving") : t("inbox.reassign.confirm")}
          </Button>
        </>
      }
    >
      {loadError ? (
        <p role="alert" className="text-sm text-rose-700">{loadError}</p>
      ) : !scope ? (
        <p className="text-sm text-ink/50">{t("inbox.searching")}</p>
      ) : (
        <>
          <p className="text-sm text-ink/70">
            {t("inbox.reassign.intro", { client: scope.clientName, name: nameOf(scope.currentAdvisorId) ?? t("inbox.routing.pending") })}
          </p>
          <div className="mt-3 rounded-md border border-ink/10 p-3">
            <p className="crm-label-sm text-ink/55">{t("inbox.reassign.scope")}</p>
            <ul className="mt-1.5 space-y-1 text-sm text-ink/75">
              <li>{t("inbox.reassign.openLeads", { count: scope.openLeads.length })}</li>
              <li>{t("inbox.reassign.tasks", { count: scope.pendingTasks })}</li>
              <li>{scope.hasConversation ? t("inbox.reassign.conversation") : t("inbox.reassign.noConversation")}</li>
            </ul>
            {scope.openLeads.length > 0 && (
              <ul className="mt-2 max-h-36 divide-y divide-ink/6 overflow-y-auto text-xs text-ink/60">
                {scope.openLeads.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2 py-1">
                    <span className="truncate">{l.title ?? t("inbox.card.unknownListing")}</span>
                    <span className="shrink-0">{nameOf(l.assignedTo) ?? t("inbox.routing.pending")}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-ink/50">{t("inbox.reassign.history")}</p>
          </div>
          <Labeled label={t("inbox.assignDialog.advisor")} className="mt-3">
            <Select value={advisor} onChange={(e) => setAdvisor(e.target.value)} required>
              <option value="">{t("reparto.dialog.chooseAdvisor")}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === scope.currentAdvisorId}>{s.name}</option>
              ))}
            </Select>
          </Labeled>
          <Labeled label={t("inbox.assignDialog.reasonRequired")} className="mt-3">
            <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required />
          </Labeled>
          <p className="mt-3 text-xs text-ink/55">{t("inbox.assignDialog.zintoNote")}</p>
          {error && <p role="alert" className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </>
      )}
    </Modal>
  );
}
