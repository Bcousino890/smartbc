/**
 * El orden de las paradas de un día de visitas.
 *
 * Un itinerario es una jornada, así que se lee en el reloj: primero las que
 * tienen hora, de la más temprana a la más tardía, y al final las que todavía
 * no la tienen. Es automático — el agente pone las horas y el orden se ordena
 * solo, sin acordarse de mover nada.
 *
 * Antes mandaba `position` (el orden manual), y bastaba con poner las horas en
 * otro orden para que el cliente leyera 19:00 antes que 18:00.
 *
 * `position` sigue existiendo y decide entre las que NO tienen hora, que son
 * las únicas donde el agente elige el sitio.
 *
 * Vive aparte porque lo usan los dos lados: la proyección pública y la consulta
 * del panel. Si cada uno ordenara por su cuenta, el agente vería una cosa y el
 * cliente otra.
 */
export type OrderableStop = {
  scheduled_at: string | null;
  position: number;
  created_at: string;
};

export function compareStopsByDay(a: OrderableStop, b: OrderableStop): number {
  const at = a.scheduled_at;
  const bt = b.scheduled_at;

  // Con hora las dos: manda el reloj. Empate técnico (misma hora exacta) →
  // el orden manual, para que no baile entre recargas.
  if (at && bt) {
    return (
      at.localeCompare(bt) ||
      a.position - b.position ||
      a.created_at.localeCompare(b.created_at)
    );
  }
  // Una con hora y otra sin ella: la que tiene hora va antes.
  if (at) return -1;
  if (bt) return 1;

  // Ninguna tiene hora: aquí sí manda el orden que haya fijado el agente.
  return a.position - b.position || a.created_at.localeCompare(b.created_at);
}
