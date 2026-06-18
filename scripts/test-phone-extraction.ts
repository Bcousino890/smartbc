#!/usr/bin/env node
/**
 * Test script para verificar la cadena completa de extracción de teléfonos
 * Uso: node_modules/.bin/ts-node scripts/test-phone-extraction.ts <adId>
 * Ej:  node_modules/.bin/ts-node scripts/test-phone-extraction.ts 111741746
 */

import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getProxyUrl } from "@/lib/sync/proxy-config";
import {
  fetchIdealistaPhoneViaAjax,
  detectAdvertiserFromHtml,
} from "@/lib/sync/particulares/idealista-advertiser-detector";
import { fetchMultipleAjaxWithCookieJar } from "@/lib/sync/import-by-link/fetch-via-curl";

const adId = process.argv[2];
if (!adId) {
  console.error("❌ Uso: ts-node scripts/test-phone-extraction.ts <adId>");
  console.error("Ej: ts-node scripts/test-phone-extraction.ts 111741746");
  process.exit(1);
}

async function testPhoneExtraction() {
  console.log(`\n🔍 Test de extracción de teléfono para anuncio ${adId}\n`);
  console.log("═".repeat(60));

  try {
    // Step 1: Verificar app_key en BD
    console.log("\n📋 Step 1: Verificando configuración de Smartproxy...");
    const db = createAdminClient() as any;
    const { data: appKeyData, error: appKeyError } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.smartproxy.app_key")
      .maybeSingle();

    if (appKeyError) {
      console.error(`❌ Error consultando app_key: ${appKeyError.message}`);
      return;
    }

    const appKey = appKeyData?.value as string | null;
    if (!appKey) {
      console.warn(
        "⚠️  No hay app_key guardado en app_settings['scraping.smartproxy.app_key']"
      );
    } else {
      console.log(`✅ App_key encontrado (${appKey.slice(0, 8)}...)`);
    }

    // Step 2: Obtener proxy URL fresca
    console.log("\n🌐 Step 2: Obteniendo IP fresca de Smartproxy...");
    const proxyUrl = await getProxyUrl();
    if (!proxyUrl) {
      console.warn(
        "⚠️  No hay proxy URL disponible (fallback a env var o ninguno)"
      );
    } else {
      const ipPart = proxyUrl.split("//")[1];
      console.log(`✅ Proxy URL: ${ipPart}`);
    }

    // Step 3: Llamar a fetchIdealistaPhoneViaAjax
    console.log("\n📞 Step 3: Llamando a fetchIdealistaPhoneViaAjax...");
    console.log(`   URL: https://www.idealista.com/inmueble/${adId}/`);
    const result = await fetchIdealistaPhoneViaAjax(adId, {
      proxyUrl,
      debug: true,
    });

    console.log("\n📊 Resultado:");
    console.log(`   Teléfono: ${result.phone ?? "(no encontrado)"}`);
    console.log(`   Confianza: ${result.phone_confidence ?? "N/A"}`);
    console.log(`   Nombre contacto: ${result.contact_name ?? "(no encontrado)"}`);

    if (result.debug && result.debug.length > 0) {
      console.log("\n🔧 Debug (endpoints intentados):");
      for (const d of result.debug) {
        const status = d.status === 0 ? "skip" : `HTTP ${d.status}`;
        console.log(`   • ${d.endpoint}`);
        console.log(`     Status: ${status}`);
        console.log(`     Body: ${d.bodySnippet}`);
      }
    }

    console.log("\n═".repeat(60));
    if (result.phone) {
      console.log(`✅ ÉXITO: Teléfono extraído: ${result.phone}`);
    } else {
      console.log(`⚠️  No se pudo extraer teléfono para este anuncio`);
    }
  } catch (err) {
    console.error("\n❌ Error durante el test:");
    console.error(err instanceof Error ? err.message : String(err));
  }
}

testPhoneExtraction().catch(console.error);
