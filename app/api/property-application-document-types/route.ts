import "server-only";
import { getDocumentTypes } from "@/lib/db/queries/property-applications";
import type { ApplicationCountry, ApplicationOperation } from "@/lib/property-applications/types";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const country = url.searchParams.get("country") as ApplicationCountry | null;
    const operation = url.searchParams.get("operation") as ApplicationOperation | null;

    if (!country || !operation) {
      return Response.json(
        { error: "Se requieren los parámetros country y operation" },
        { status: 400 }
      );
    }

    if (!["ES", "CL"].includes(country)) {
      return Response.json({ error: "country debe ser ES o CL" }, { status: 400 });
    }
    if (!["rent", "sale"].includes(operation)) {
      return Response.json({ error: "operation debe ser rent o sale" }, { status: 400 });
    }

    const types = await getDocumentTypes(country, operation);
    return Response.json({ types });
  } catch (err) {
    console.error("[doc-types] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
