/**
 * Única política para el booleano `chat_only`: sin teléfono efectivo →
 * solo contactable por chat. Antes se escribía con 3 lógicas ligeramente
 * distintas según el sitio (cron, refresh-phones, verify-phones).
 */
export function resolveChatOnly(effectivePhone: string | null | undefined): boolean {
  return !effectivePhone;
}
