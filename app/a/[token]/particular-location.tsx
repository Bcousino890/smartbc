import { AdMap } from "@/components/admin/particulares/ad-map";
import type { ShareLocation } from "@/lib/particulares/share-location";

export function ParticularLocation({ location }: { location: ShareLocation | null }) {
  if (!location?.point) return null;
  return (
    <section className="mt-5 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] md:p-8">
      <h2 className="crm-section-title mb-4 text-ink">Ubicación</h2>
      <AdMap resolvedLocation={location} height={288} />
    </section>
  );
}
