import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { verifyUnsubscribeToken } from "@/lib/email/property-offer";

// Sin sesión, a propósito: es el enlace de baja del digest de "nuevas
// propiedades" (ver app/api/cron/property-alerts) — el cliente lo recibe por
// correo y puede no tener sesión abierta. Exigir login solo para darse de
// baja es la fricción que hace que la gente marque el correo como spam en
// vez de usar el enlace.
//
// El enlace del correo (sin `action`) lleva a una página de elección en vez
// de dar de baja directamente: "recibir menos seguido" salva al cliente que
// solo quiere menos correos, no ninguno — con un solo botón de baja esa
// opción no existe y el resultado es la baja total de todas formas.

function page(title: string, bodyHtml: string): Response {
  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#fbf8f3; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:440px; margin:15vh auto 0; padding:0 20px; text-align:center;">
      <p style="font-family:Georgia,'Iowan Old Style','Times New Roman',Times,serif; font-size:20px; color:#2a1f10; margin:0 0 20px 0;">Benjam&iacute;n Cousi&ntilde;o Propiedades</p>
      <div style="background:#ffffff; border:1px solid #e8dfd0; border-radius:8px; padding:32px 28px;">
        <h1 style="margin:0 0 10px 0; font-family:Georgia,serif; font-size:20px; font-weight:400; color:#2a1f10;">${title}</h1>
        ${bodyHtml}
      </div>
    </div>
  </body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function message(text: string): string {
  return `<p style="margin:0; font-size:14px; line-height:1.6; color:#2a1f10;">${text}</p>`;
}

function choicePage(clientId: string, token: string): Response {
  const base = `/api/public/property-alerts/unsubscribe?client=${clientId}&token=${token}`;
  const buttonStyle =
    "display:block; width:100%; box-sizing:border-box; margin:0 0 10px 0; padding:12px 16px; border-radius:8px; font-size:14px; font-weight:600; text-decoration:none; text-align:center;";
  return page(
    "¿Qué prefieres?",
    `
    ${message("Puedes recibir estos avisos con menos frecuencia, o dejar de recibirlos del todo.")}
    <div style="margin-top:20px; text-align:left;">
      <a href="${base}&action=reduce" style="${buttonStyle} background-color:#2a1f10; color:#fbf8f3;">Recibir menos seguido (resumen semanal)</a>
      <a href="${base}&action=unsubscribe" style="${buttonStyle} background-color:#ffffff; color:#2a1f10; border:1px solid #e8dfd0;">Darme de baja del todo</a>
    </div>
    `,
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client");
  const token = url.searchParams.get("token");
  const action = url.searchParams.get("action");

  if (!clientId || !token || !verifyUnsubscribeToken(clientId, token)) {
    return page(
      "Enlace no válido",
      message(
        "Este enlace no es válido o ya no está activo. Si sigues recibiendo estos avisos y quieres darte de baja, escríbenos.",
      ),
    );
  }

  const db = createAdminClient() as any;

  if (action === "reduce") {
    await db
      .from("client_preferences")
      .update({ new_listing_alerts_frequency: "weekly" })
      .eq("client_id", clientId);

    return page(
      "Listo",
      message(
        "A partir de ahora recibirás como mucho un resumen a la semana, en vez de cada vez que entre algo nuevo.",
      ),
    );
  }

  if (action === "unsubscribe") {
    await db
      .from("client_preferences")
      .update({ new_listing_alerts_enabled: false })
      .eq("client_id", clientId);

    return page(
      "Baja confirmada",
      message(
        "Ya no recibirás avisos de nuevas propiedades. El resto de comunicaciones de tu cuenta (como recuperar tu contraseña) no se ven afectadas.",
      ),
    );
  }

  return choicePage(clientId, token);
}
