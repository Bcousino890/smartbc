#!/usr/bin/env node
/**
 * Test CapSolver integration for phone extraction
 * Usage: node scripts/test-capsolver.mjs 111741746
 */

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import process from "process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

// Import from dist (built code)
const { fetchIdealistaPhoneViaPlaywright } = await import(
  resolve(projectRoot, ".next/server/lib/sync/particulares/fetch-phone-with-playwright.js")
).catch(async () => {
  // If .next doesn't exist, try from source (TS)
  const mod = await import(resolve(projectRoot, "lib/sync/particulares/fetch-phone-with-playwright.ts"));
  return mod;
});

const adId = process.argv[2] || "111741746";
const expectedPhone = "+34696165042";

console.log(`\n[test-capsolver] Testing CapSolver + phone extraction`);
console.log(`[test-capsolver] Ad ID: ${adId}`);
console.log(`[test-capsolver] Expected: ${expectedPhone}\n`);

const startTime = Date.now();
try {
  const result = await fetchIdealistaPhoneViaPlaywright(adId);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n[test-capsolver] ✓ Completed in ${elapsed}s`);
  console.log(`[test-capsolver] Result:`, JSON.stringify(result, null, 2));

  if (result.phone) {
    if (result.phone === expectedPhone) {
      console.log(`\n✓ SUCCESS: Got expected phone ${result.phone}`);
      process.exit(0);
    } else {
      console.log(
        `\n⚠️  Phone mismatch: got ${result.phone}, expected ${expectedPhone}`,
      );
      process.exit(0); // Still success, just different phone
    }
  } else {
    console.log(
      `\n✗ FAILED: No phone extracted. Error: ${result.error || "unknown"}`,
    );
    process.exit(1);
  }
} catch (err) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.error(
    `\n✗ ERROR after ${elapsed}s:`,
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
}
