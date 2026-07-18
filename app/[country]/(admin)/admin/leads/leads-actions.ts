"use server";

import { assertPermission } from "@/lib/auth/guard";
import {
  syncPreview,
  syncExecute,
  getSyncJob,
  type ZintoSyncPreviewResult,
  type ZintoSyncExecuteResult,
  type ZintoSyncJobStatus,
} from "@/lib/services/zinto/leads";
import { ZintoApiError } from "@/lib/services/zinto/client";

/** The registered inbound endpoint Zinto pushes lead/sync events to. */
const SMARTBC_WEBHOOK_URL = "https://portal.bcousinoprop.com/api/webhooks/zinto";

function toError(error: unknown): string {
  if (error instanceof ZintoApiError) return `${error.code || error.status}: ${error.message}`;
  return error instanceof Error ? error.message : "unknown_error";
}

export type PreviewResult =
  | { ok: true; preview: ZintoSyncPreviewResult }
  | { ok: false; error: string };

/** Dry-run a sync for a campaign: eligible / duplicate / invalid counts. */
export async function previewCampaignSync(
  campaignExternalId: string,
): Promise<PreviewResult> {
  await assertPermission("solicitudes", "edit");
  if (!campaignExternalId) return { ok: false, error: "missing_campaign" };
  try {
    const preview = await syncPreview({
      direction: "zinto_to_crm",
      target: { type: "webhook", name: "smartbc_crm", url: SMARTBC_WEBHOOK_URL },
      campaign_external_id: campaignExternalId,
      filters: { lead_status: ["qualified", "export_ready"], only_not_synced: true },
      mapping_version: "smartbc_v1",
    });
    return { ok: true, preview };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

export type ExecuteResult =
  | { ok: true; job: ZintoSyncExecuteResult }
  | { ok: false; error: string };

/** Execute a previously previewed sync (writes to Zinto). */
export async function executeCampaignSync(previewId: string): Promise<ExecuteResult> {
  const profile = await assertPermission("solicitudes", "edit");
  if (!previewId) return { ok: false, error: "missing_preview" };
  try {
    const job = await syncExecute({
      preview_id: previewId,
      mode: "execute_valid_records",
      approval: {
        approved_by: profile.full_name || profile.email || profile.id,
        approved_at: new Date().toISOString(),
      },
    });
    return { ok: true, job };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}

export type JobStatusResult =
  | { ok: true; status: ZintoSyncJobStatus }
  | { ok: false; error: string };

/** Poll the status + summary of a running/finished sync job. */
export async function refreshSyncJob(jobId: string): Promise<JobStatusResult> {
  await assertPermission("solicitudes", "view");
  if (!jobId) return { ok: false, error: "missing_job" };
  try {
    const status = await getSyncJob(jobId);
    return { ok: true, status };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}
