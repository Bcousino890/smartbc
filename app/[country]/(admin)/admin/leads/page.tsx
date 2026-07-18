import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { getLeads, getCampaigns } from "@/lib/db/zinto-leads";
import { LeadsAdminClient, type LeadView, type CampaignView } from "./leads-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;

  const profile = await getCurrentProfile();
  if (!canAccess(profile?.role ?? "", "solicitudes", "view")) {
    redirect(getCountryConfig(country).prefix);
  }

  let leads: LeadView[] = [];
  let campaigns: CampaignView[] = [];
  try {
    const [leadRows, campaignRows] = await Promise.all([getLeads(200, 0), getCampaigns(100, 0)]);
    leads = leadRows.map((l) => ({
      id: l.id,
      externalId: l.external_id ?? null,
      fullName: l.full_name ?? null,
      company: l.company_name ?? null,
      phone: l.phone ?? l.whatsapp ?? null,
      email: l.email ?? null,
      country: l.country ?? null,
      city: l.city ?? null,
      score: typeof l.score === "number" ? l.score : null,
      status: l.status ?? null,
      syncStatus: l.sync_status ?? null,
      campaign: l.campaign_external_id ?? null,
      updatedAt: l.updated_at ?? l.created_at,
    }));
    campaigns = campaignRows.map((c) => ({
      id: c.id,
      externalId: c.external_id ?? null,
      zintoId: c.zinto_id ?? null,
      name: c.name ?? null,
      country: c.country ?? null,
      city: c.city ?? null,
      status: c.status ?? null,
      updatedAt: c.updated_at ?? c.created_at,
    }));
  } catch {
    // Tables not migrated yet / Zinto not configured — render empty state.
    leads = [];
    campaigns = [];
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader titleKey="adminLeads.title" subtitleKey="adminLeads.subtitle" />
      <div className="mt-7">
        <LeadsAdminClient leads={leads} campaigns={campaigns} />
      </div>
      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
