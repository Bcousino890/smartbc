import { redirect } from "next/navigation";
import { SectionHeader } from "@/components/section-header";
import { PageFooter } from "@/components/ui/page-footer";
import { PreferencesEditor } from "@/components/cliente/preferences-editor";
import { SuggestedPropertiesGrid } from "@/components/cliente/suggested-properties-grid";
import { createClient } from "@/lib/db/server";
import type { Operation, StayType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  // Get client profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .eq("role", "client")
    .maybeSingle();

  if (profileError || !profile) {
    redirect("/login");
  }

  // Get client preferences
  const { data: prefs, error: prefsError } = await supabase
    .from("client_preferences")
    .select("*")
    .eq("client_id", user.id)
    .maybeSingle();

  const preferences = {
    operation: (prefs?.operation === "sale" ? "venta" : "alquiler") as Operation,
    stayType: (prefs?.stay === "long" ? "larga" : "corta") as StayType,
    preferredZone: prefs?.zones?.[0] || "",
    budgetMin: prefs?.min_price || 0,
    budgetMax: prefs?.max_price || 0,
    universities: prefs?.universities || "",
    occupants: prefs?.occupants || 1,
    students: prefs?.students || 0,
    workers: prefs?.workers || 0,
    pets: prefs?.pets || false,
  };

  const firstName = profile.full_name?.split(" ")[0] || "Cliente";

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-10 md:px-8">
      <SectionHeader
        titleKey="inicio.title"
        titleVars={{ name: firstName }}
        subtitleKey="inicio.subtitle"
      />

      {/* Preferences editor */}
      <div className="mt-8">
        <PreferencesEditor
          clientId={user.id}
          initialPreferences={preferences}
        />
      </div>

      {/* Properties grid */}
      <div className="mt-8">
        <h2 className="text-2xl font-semibold text-ink mb-6">
          Propiedades sugeridas para ti
        </h2>
        <SuggestedPropertiesGrid clientId={user.id} />
      </div>

      <PageFooter textKey="login.footer" />
    </div>
  );
}
