import "server-only";

// This route is deprecated — OAuth integration was replaced by Playwright browser automation.
// Kept as a stub to avoid 404s from any cached clients.
export async function POST() {
  return Response.json({ error: "Este endpoint ya no está disponible. Usa /api/admin/idealista/update-login." }, { status: 410 });
}
