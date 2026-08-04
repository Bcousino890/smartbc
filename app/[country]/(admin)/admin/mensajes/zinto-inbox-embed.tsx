/**
 * Bandeja de WhatsApp embebida directo desde Zinto (iframe oficial de
 * "Inserción en la bandeja de entrada"), usada como vista provisional
 * mientras se termina de perfeccionar la integración por API en
 * `whatsapp-chat.tsx` / `zinto-actions.ts` (esos archivos siguen intactos
 * para poder volver a activarlos).
 */
export function ZintoInboxEmbed() {
  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs text-ink/50">
        Vista temporal de la bandeja de Zinto mientras terminamos de perfeccionar la integración por API.
      </p>
      <div className="overflow-hidden rounded-2xl border border-gold/15 bg-cream-50/85 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)]">
        <iframe
          src="https://crm.zinto.app/bcousinoprop/inbox/embed"
          title="Bandeja de entrada WhatsApp (Zinto)"
          className="w-full"
          style={{ minHeight: 700, border: 0 }}
          loading="lazy"
        />
      </div>
    </section>
  );
}
