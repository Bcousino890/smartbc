import { Sparkles } from "lucide-react";
import { getCachedDashboardGreeting } from "@/lib/services/idealista/dashboard-greeting";

// Server component async, pensado para ir dentro de un <Suspense>: generar
// el saludo puede disparar una llamada a la IA (en caché fría), y no debe
// bloquear el resto del Dashboard mientras responde.
export function DashboardGreetingSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 shrink-0 rounded-lg bg-gold/10" />
        <div className="h-3.5 w-2/3 rounded bg-ink/10" />
      </div>
    </div>
  );
}

export async function DashboardGreetingCard({ firstName }: { firstName: string | null }) {
  const greeting = await getCachedDashboardGreeting();
  if (!greeting) return null;

  const hello = firstName ? `Hola ${firstName}` : "Hola";

  return (
    <div className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-lg bg-gold/10 p-2 text-gold">
          <Sparkles size={16} />
        </div>
        <p className="text-sm leading-relaxed text-ink/80">
          <span className="font-semibold text-ink">{hello}, </span>
          {greeting.text}
        </p>
      </div>
    </div>
  );
}
