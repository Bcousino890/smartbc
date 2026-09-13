import { getZintoV2Config } from "../lib/services/zinto-v2/config.ts";

const EXPECTED_INTEGRATION_ID = "2276cdd0-9c00-47c0-9613-470c6cabdee8";
let checks = 0;
let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  checks++;
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function configFromEnv(integrationId: string) {
  process.env.ZINTO_V2_API_KEY = "pcp_test_key";
  process.env.ZINTO_V2_INTEGRATION_ID = integrationId;
  return getZintoV2Config();
}

const validConfig = await configFromEnv(EXPECTED_INTEGRATION_ID);
check(
  "conserva el UUID completo",
  validConfig?.integrationId === EXPECTED_INTEGRATION_ID,
  `recibido: ${String(validConfig?.integrationId)}`,
);

const malformedConfig = await configFromEnv("2276");
check(
  "rechaza un Integration ID numérico truncado",
  malformedConfig?.integrationId === null,
  `recibido: ${String(malformedConfig?.integrationId)}`,
);

if (failures) {
  process.exit(1);
}

console.log(`\n${checks}/${checks} tests OK`);
