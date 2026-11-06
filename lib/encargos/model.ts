import { briefFromRow, type BriefInput } from "../clients/brief";

export type EncargoStatus = "active" | "paused" | "closed";
export type EncargoSource = "property" | "particular";

export type Encargo = {
  id: string;
  clientId: string;
  label: string;
  endClientLabel: string | null;
  status: EncargoStatus;
  isPrimary: boolean;
  position: number;
  baselineAt: string;
  brief: BriefInput;
};

const STATUSES: EncargoStatus[] = ["active", "paused", "closed"];

/** Una fila de `client_preferences` → el encargo. */
export function encargoFromRow(row: Record<string, unknown>): Encargo {
  const status = STATUSES.includes(row.status as EncargoStatus) ? (row.status as EncargoStatus) : "active";
  const label = typeof row.label === "string" ? row.label : "";
  const end = typeof row.end_client_label === "string" && row.end_client_label.trim() ? row.end_client_label : null;
  const pos = Number(row.position);
  return {
    id: String(row.id ?? ""),
    clientId: String(row.client_id ?? ""),
    label,
    endClientLabel: end,
    status,
    isPrimary: row.is_primary === true,
    position: Number.isFinite(pos) ? pos : 0,
    baselineAt: row.baseline_at ? String(row.baseline_at) : "",
    brief: briefFromRow(row),
  };
}

/** El encargo principal siempre está activo: pausarlo o cerrarlo no se permite. */
export function validateStatusChange(
  e: Pick<Encargo, "isPrimary" | "status">,
  next: EncargoStatus,
): { ok: true } | { ok: false; error: string } {
  if (e.isPrimary && next !== "active") {
    return { ok: false, error: "El encargo principal no se puede pausar ni cerrar." };
  }
  return { ok: true };
}

export { encargoLink } from "./links";
