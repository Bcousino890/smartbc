import "server-only";

/**
 * Resuelve un aviso de corredora a partir del identificador que use el
 * proveedor: nuestro UUID, su `external_id`, o directamente la `source_url`
 * (codificada en la ruta). Así no tiene que almacenar ids ajenos.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResolvedListing = {
  id: string;
  source_url: string;
  price: number | string | null;
  currency: string | null;
  broker_price: number | string | null;
  broker_currency: string | null;
};

export async function resolveListing(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  captacionId: string,
  identifier: string
): Promise<ResolvedListing | null> {
  const decoded = safeDecode(identifier);
  const columns = "id, source_url, price, currency, broker_price, broker_currency";

  if (UUID_RE.test(decoded)) {
    const { data } = await db
      .from("captacion_listings")
      .select(columns)
      .eq("captacion_id", captacionId)
      .eq("id", decoded)
      .maybeSingle();
    if (data) return data;
  }

  const { data: byExternal } = await db
    .from("captacion_listings")
    .select(columns)
    .eq("captacion_id", captacionId)
    .eq("external_id", decoded)
    .maybeSingle();
  if (byExternal) return byExternal;

  if (/^https?:\/\//i.test(decoded)) {
    const { data: byUrl } = await db
      .from("captacion_listings")
      .select(columns)
      .eq("captacion_id", captacionId)
      .eq("source_url", decoded)
      .maybeSingle();
    if (byUrl) return byUrl;
  }

  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
