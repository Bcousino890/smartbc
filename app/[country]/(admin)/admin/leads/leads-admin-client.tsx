"use client";

import { useState, useTransition } from "react";
import {
  Users,
  Megaphone,
  Loader2,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  previewCampaignSync,
  executeCampaignSync,
  refreshSyncJob,
} from "./leads-actions";

export interface LeadView {
  id: string;
  externalId: string | null;
  fullName: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  city: string | null;
  score: number | null;
  status: string | null;
  syncStatus: string | null;
  campaign: string | null;
  updatedAt: string;
}

export interface CampaignView {
  id: string;
  externalId: string | null;
  zintoId: string | null;
  name: string | null;
  country: string | null;
  city: string | null;
  status: string | null;
  updatedAt: string;
}

type Tab = "leads" | "campaigns";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

/** Colour a status/sync badge by a small keyword map. */
function statusTone(status: string | null): string {
  const s = (status || "").toLowerCase();
  if (/(accepted|converted|synced|approved|qualified|active|completed)/.test(s))
    return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (/(duplicate|rejected|failed|error|disqualified)/.test(s))
    return "bg-rose-50 text-rose-700 ring-rose-600/20";
  if (/(pending|queued|running|draft|created|sent)/.test(s))
    return "bg-amber-50 text-amber-700 ring-amber-600/20";
  return "bg-ink/5 text-ink/60 ring-ink/10";
}

function Badge({ value }: { value: string | null }) {
  if (!value) return <span className="text-ink/30">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        statusTone(value),
      )}
    >
      {value}
    </span>
  );
}

export function LeadsAdminClient({
  leads,
  campaigns,
}: {
  leads: LeadView[];
  campaigns: CampaignView[];
}) {
  const [tab, setTab] = useState<Tab>("leads");

  const tabBtn = (isActive: boolean) =>
    cn(
      "inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition",
      isActive ? "bg-ink text-white" : "text-ink/60 hover:bg-ink/5",
    );

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <button className={tabBtn(tab === "leads")} onClick={() => setTab("leads")}>
          <Users className="h-4 w-4" /> Leads
          <span className="ml-1 rounded-full bg-black/10 px-1.5 text-[11px]">{leads.length}</span>
        </button>
        <button className={tabBtn(tab === "campaigns")} onClick={() => setTab("campaigns")}>
          <Megaphone className="h-4 w-4" /> Campañas
          <span className="ml-1 rounded-full bg-black/10 px-1.5 text-[11px]">
            {campaigns.length}
          </span>
        </button>
      </div>

      {tab === "leads" ? <LeadsTable leads={leads} /> : <CampaignsTable campaigns={campaigns} />}
    </div>
  );
}

function LeadsTable({ leads }: { leads: LeadView[] }) {
  if (leads.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6 text-ink/40" />}
        title="Aún no hay leads de Zinto"
        body="Los leads aparecerán aquí automáticamente cuando Zinto envíe eventos lead.* al webhook, o cuando los envíes desde el CRM."
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-ink/10 bg-ink/[0.02] text-[12px] uppercase tracking-wide text-ink/45">
          <tr>
            <Th>Contacto</Th>
            <Th>Ubicación</Th>
            <Th>Score</Th>
            <Th>Estado</Th>
            <Th>Sync</Th>
            <Th>Campaña</Th>
            <Th>Actualizado</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {leads.map((l) => (
            <tr key={l.id} className="hover:bg-ink/[0.015]">
              <Td>
                <div className="font-medium text-ink">{l.fullName || "—"}</div>
                {l.company && <div className="text-[12px] text-ink/50">{l.company}</div>}
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-ink/55">
                  {l.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" />+{l.phone.replace(/\D/g, "")}
                    </span>
                  )}
                  {l.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {l.email}
                    </span>
                  )}
                </div>
              </Td>
              <Td>
                <span className="text-ink/70">
                  {[l.city, l.country].filter(Boolean).join(", ") || "—"}
                </span>
              </Td>
              <Td>{l.score != null ? <span className="font-medium">{l.score}</span> : "—"}</Td>
              <Td>
                <Badge value={l.status} />
              </Td>
              <Td>
                <Badge value={l.syncStatus} />
              </Td>
              <Td>
                <span className="text-[12px] text-ink/55">{l.campaign || "—"}</span>
              </Td>
              <Td>
                <span className="text-[12px] text-ink/45">{fmtDate(l.updatedAt)}</span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CampaignsTable({ campaigns }: { campaigns: CampaignView[] }) {
  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon={<Megaphone className="h-6 w-6 text-ink/40" />}
        title="Aún no hay campañas"
        body="Las campañas se crean en Zinto y llegan con los eventos de lead. Desde aquí podrás previsualizar y lanzar la sincronización cuando existan."
      />
    );
  }
  return (
    <div className="space-y-3">
      {campaigns.map((c) => (
        <CampaignRow key={c.id} campaign={c} />
      ))}
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: CampaignView }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    previewId: string;
    valid: number;
    duplicates: number;
    invalid: number;
    total: number;
  } | null>(null);
  const [job, setJob] = useState<{ id: string; state: string } | null>(null);

  const extId = campaign.externalId;

  const runPreview = () => {
    if (!extId) {
      setError("La campaña no tiene external_id; no se puede sincronizar.");
      return;
    }
    setError(null);
    setJob(null);
    startTransition(async () => {
      const res = await previewCampaignSync(extId);
      if (!res.ok) {
        setError(res.error);
        setPreview(null);
        return;
      }
      setPreview({
        previewId: res.preview.preview_id,
        valid: res.preview.summary.valid,
        duplicates: res.preview.summary.duplicates,
        invalid: res.preview.summary.invalid,
        total: res.preview.summary.total_candidates,
      });
    });
  };

  const runExecute = () => {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const res = await executeCampaignSync(preview.previewId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setJob({ id: res.job.job.id, state: res.job.job.state });
    });
  };

  const refresh = () => {
    if (!job) return;
    startTransition(async () => {
      const res = await refreshSyncJob(job.id);
      if (res.ok) setJob({ id: res.status.job.id, state: res.status.job.state });
      else setError(res.error);
    });
  };

  return (
    <div className="rounded-xl border border-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{campaign.name || campaign.externalId || "—"}</span>
            <Badge value={campaign.status} />
          </div>
          <div className="mt-0.5 text-[12px] text-ink/50">
            {[campaign.city, campaign.country].filter(Boolean).join(", ") || "—"}
            {campaign.externalId && <span className="ml-2 text-ink/35">· {campaign.externalId}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runPreview}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Previsualizar sync
          </button>
          {preview && (
            <button
              onClick={runExecute}
              disabled={pending || preview.valid === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Ejecutar ({preview.valid})
            </button>
          )}
        </div>
      </div>

      {preview && (
        <div className="mt-3 flex flex-wrap gap-4 rounded-lg bg-ink/[0.02] px-3 py-2 text-[13px]">
          <span className="text-ink/70">
            Total: <b>{preview.total}</b>
          </span>
          <span className="text-emerald-700">
            Válidos: <b>{preview.valid}</b>
          </span>
          <span className="text-amber-700">
            Duplicados: <b>{preview.duplicates}</b>
          </span>
          <span className="text-rose-700">
            Inválidos: <b>{preview.invalid}</b>
          </span>
        </div>
      )}

      {job && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Job <code className="font-mono">{job.id}</code> · estado: <b>{job.state}</b>
          <button
            onClick={refresh}
            disabled={pending}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Actualizar
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink/15 bg-white px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink/5">
        {icon}
      </div>
      <h3 className="font-serif text-lg text-ink">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-ink/55">{body}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
