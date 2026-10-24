import { prePaintScript } from "@/lib/theme/crm-appearance";

/**
 * Guion previo a la pintura de la apariencia del CRM (expediente
 * docs/changes/2026-10-23-crm-apariencia, I10). Va lo primero dentro de la
 * cáscara del CRM: con «Oscuro» guardado, la página no destella en claro al
 * abrirse. En la navegación del lado del cliente no se ejecuta (React no
 * ejecuta guiones insertados así); allí aplica el tema `CrmThemeProvider`.
 */
export function CrmThemeScript({ userId }: { userId: string }) {
  return <script dangerouslySetInnerHTML={{ __html: prePaintScript(userId) }} />;
}
