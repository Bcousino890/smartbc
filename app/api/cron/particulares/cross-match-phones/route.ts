import "server-only";
import { createClient } from "@supabase/supabase-js";
import { crossMatchPhones } from "@/lib/sync/particulares/cross-match-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number.parseInt(searchParams.get("limit") ?? "2000", 10) || 2000;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const summary = await crossMatchPhones(supabase, { limit });
  return Response.json(summary, { status: summary.ok ? 200 : 500 });
}
