// ENDPOINT TEMPORAL — eliminar después de uso
import "server-only";
import { createAdminClient } from "@/lib/db/admin";

const RECOVERY_TOKEN = "RC-smartbc-2026-7f3d9a2b4e8c11ef";

export async function POST(req: Request) {
  let body: { token: string; email: string; newPassword: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (body.token !== RECOVERY_TOKEN) {
    return Response.json({ error: "Token incorrecto" }, { status: 401 });
  }

  const { email, newPassword } = body;
  if (!email || !newPassword || newPassword.length < 8) {
    return Response.json({ error: "email y newPassword (≥8 chars) requeridos" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  // Buscar el usuario por email en auth.users
  const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    return Response.json({ error: listErr.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = (usersData?.users ?? []).find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    return Response.json({ error: `Usuario ${email} no encontrado en auth.users` }, { status: 404 });
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
    email_confirm: true,
  });

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, userId: user.id, email: user.email });
}
