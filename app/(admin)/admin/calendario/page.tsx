import { createClient } from "@/lib/db/server";
import { CalendarioClient } from "./calendario-client";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const supabase = await createClient();

  // Load selectors in parallel
  const [propertiesRes, clientsRes] = await Promise.all([
    supabase
      .from("properties")
      .select("id, title, address, zone, status")
      .eq("status", "available")
      .order("title", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "client")
      .order("full_name", { ascending: true }),
  ]);

  return (
    <CalendarioClient
      properties={propertiesRes.data ?? []}
      clients={clientsRes.data ?? []}
    />
  );
}
