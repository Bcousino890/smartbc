import { createClient } from "@supabase/supabase-js";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { ParticularesCient } from "./particulares-client";

export default async function AdminParticularesPage() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, count, error } = await supabase
      .from("particulares")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .order("detected_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[AdminParticularesPage] Error fetching particulares:", error);
    }

    const particulares = data || [];
    const totalCount = count || 0;

    return (
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
        <AdminPageHeader
          titleKey="admin.nav.particulares"
          subtitleKey="admin.nav.particulares"
        />

        <div className="mt-7">
          <ParticularesCient
            initialData={particulares as any}
            initialCount={totalCount}
          />
        </div>

        <PageFooter textKey="admin.realtime.footer" variant="inline" />
      </div>
    );
  } catch (error) {
    console.error("[AdminParticularesPage] Error:", error);

    return (
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
        <AdminPageHeader
          titleKey="admin.nav.particulares"
          subtitleKey="admin.nav.particulares"
        />
        <div className="mt-7 rounded-lg bg-white p-12 text-center shadow-sm">
          <p className="text-gray-600">
            Error al cargar los particulares. Intenta de nuevo más tarde.
          </p>
        </div>
        <PageFooter textKey="admin.realtime.footer" variant="inline" />
      </div>
    );
  }
}
