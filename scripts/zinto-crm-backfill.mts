// Backfill local CRM cache (zinto_crm_contacts, zinto_crm_notes) from the
// Zinto Integration API (docs/api/SMARTBC-INTEGRATION-GUIDE-2026-08-13.md).
//
//   ZINTO_API_URL=https://crm.zinto.app/_integration-api \
//   ZINTO_API_KEY=pcp_... \
//   npm run zinto-crm:backfill
//
// Resumes from the last saved checkpoint (resource "contacts") — see
// docs/PAGINATION.md and lib/services/zinto-integration/sync.ts. Not wired to
// a cron; run manually.

import { ZintoIntegrationApiClient } from "../lib/services/zinto-integration/client.ts";
import { getZintoIntegrationConfig } from "../lib/services/zinto-integration/config.ts";
import { backfillAllContacts } from "../lib/services/zinto-integration/sync.ts";
import { logZintoIntegrationRequest } from "../lib/db/zinto-integration.ts";

async function main() {
  const config = getZintoIntegrationConfig();
  if (!config) {
    console.error(
      "BLOCKED: ZINTO_API_KEY no está configurada. No se ejecuta ningún backfill real."
    );
    process.exitCode = 2;
    return;
  }

  console.log("=== Zinto CRM cache backfill ===");
  console.log(`Base URL: ${config.apiUrl}\n`);

  const client = new ZintoIntegrationApiClient(config, logZintoIntegrationRequest);

  const result = await backfillAllContacts(client);

  console.log(`\nOK — ${result.synced} contacto(s) sincronizado(s) (contactos + notas).`);
}

main().catch((err) => {
  console.error("Error inesperado en el backfill:", err);
  process.exitCode = 1;
});
