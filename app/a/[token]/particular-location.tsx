type Props = {
  zone: string | null;
  latitude: number | null;
  longitude: number | null;
};

export function ParticularLocation({ zone, latitude, longitude }: Props) {
  const hasCoordinates =
    typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
  const area = zone?.trim();
  if (!hasCoordinates && !area) return null;

  const query = encodeURIComponent(`${area}, Madrid, España`);
  const src = hasCoordinates
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${longitude! - 0.004},${latitude! - 0.004},${longitude! + 0.004},${latitude! + 0.004}&layer=mapnik&marker=${latitude},${longitude}`
    : `https://maps.google.com/maps?q=${query}&output=embed&zoom=14`;
  const href = hasCoordinates
    ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;

  return (
    <section className="mt-5 rounded-2xl border border-gold/20 bg-white/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] md:p-8">
      <h2 className="crm-section-title text-ink">Ubicación</h2>
      <p className="mt-2 text-sm text-ink/60">
        {hasCoordinates ? "Ubicación aproximada del anuncio" : "Zona aproximada"}{area ? ` · ${area}` : ""}
      </p>
      <iframe
        title="Mapa de ubicación del anuncio"
        src={src}
        className="mt-4 h-72 w-full rounded-xl border-0 md:h-96"
        loading="lazy"
        referrerPolicy="no-referrer"
        allowFullScreen
      />
      <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-gold-dark underline">
        Abrir en el mapa
      </a>
    </section>
  );
}
