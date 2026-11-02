// ============================================================================
// Hora de Madrid para las tareas de seguimiento (puro).
//
// La tarea se guarda en UTC y se ENSEÑA en Europe/Madrid, sea cual sea la zona
// del navegador: el equipo trabaja en Madrid, pero un portátil en otra zona (o
// un móvil de viaje) convertiría «mañana a las 10:00» en otra hora sin avisar.
// ============================================================================

export const TASK_TZ = "Europe/Madrid";

/** Hora por defecto de los atajos «Mañana», «En 3 días»… */
export const DEFAULT_TASK_TIME = "10:00";

const parts = (d: Date) => {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TASK_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(f.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
};

/** Diferencia (ms) entre la hora de Madrid y UTC en ese instante. */
function offsetAt(utcMs: number): number {
  const p = parts(new Date(utcMs));
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - utcMs;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha y hora de Madrid de un instante: { date: 'YYYY-MM-DD', time: 'HH:MM' }. */
export function madridParts(at: Date): { date: string; time: string } {
  const p = parts(at);
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

/**
 * «2026-10-31» + «10:00» en Madrid → ISO UTC. NULL si la fecha o la hora no
 * son válidas. En el cambio de hora se resuelve hacia la hora que existe.
 */
export function madridToIso(date: string, time: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, m, d, h, mi] = [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]];
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let utc = guess - offsetAt(guess);
  // Segunda pasada: si la primera cayó al otro lado del cambio de hora.
  utc = guess - offsetAt(utc);
  const check = madridParts(new Date(utc));
  if (check.date !== date) return null; // 31 de febrero y similares
  return new Date(utc).toISOString();
}

/** La fecha de Madrid dentro de `days` días a partir de `from`. */
export function madridDatePlus(from: Date, days: number): string {
  const today = madridParts(from).date;
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
