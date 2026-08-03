import "server-only";
import { getParticularesPage } from "@/lib/db/queries/particulares";
import { requirePermission } from "@/lib/auth/guard";

export async function GET(req: Request) {
  const gate = await requirePermission("particulares", "view");
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const pageSize = 100;

  try {
    const { rows } = await getParticularesPage(offset, pageSize);
    return Response.json({ rows });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "query_failed" },
      { status: 500 },
    );
  }
}
