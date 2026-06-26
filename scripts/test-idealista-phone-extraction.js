#!/usr/bin/env node

/**
 * Test script for Idealista phone extraction patterns.
 * Usage: node scripts/test-idealista-phone-extraction.js [url1] [url2] ...
 *
 * If no URLs provided, tests a predefined set of problematic listings.
 */

const https = require('https');

// Default test URLs (particulares listings where phone extraction was failing)
const DEFAULT_URLS = [
  'https://www.idealista.com/inmueble/111772866/',
  'https://www.idealista.com/inmueble/111741746/',
  'https://www.idealista.com/inmueble/110570990/',
];

function extractPhonePatterns(html) {
  const patterns = {
    'HIGH: appcallback_target_phone': /appcallback_target_phone="(\d{9,})"/,
    'HIGH: data-phone': /data-(?:contact-)?phone\s*=\s*["']([+\d][\d\s\-]{6,})["']/,
    'HIGH: JSON phone': /"phone"\s*:\s*"([+\d][\d\s\-]{6,15})"/,
    'HIGH: userPhone/mobilePhone': /(?:"userPhone"|"mobilePhone"|"ownerPhone")\s*:\s*"([+\d][\d\s\-]{6,15})"/,
    'MEDIUM: tel link': /href=["']tel:([+\d][\d\s\-]{6,})["']/,
    'MEDIUM: WhatsApp': /wa\.me\/(?:34)?([6789]\d{8})/,
    'MEDIUM: telLink/callLink': /(?:telLink|callLink)\s*[=:]\s*["']([+\d][\d\s\-]{6,})["']/i,
    'MEDIUM: Text "Llamar"': /(?:Llamar|Teléfono|Tel\.|Contacto|Móvil|Tfno\.?)\s*[:]?\s*([+\d][\d\s\-()]{8,})/i,
    'MEDIUM: Text "El número"': /(?:El número|El teléfono|Su teléfono|Mi teléfono|Numero de contacto)\s*[:]?\s*([+\d][\d\s\-()]{8,})/i,
  };

  const results = {};
  for (const [name, pattern] of Object.entries(patterns)) {
    const match = html.match(pattern);
    if (match) {
      results[name] = match[1];
    }
  }
  return results;
}

function extractAdvertiserInfo(html) {
  const adProfMatch = html.match(/adProfessionalName\s*:\s*(['"])([^'"]*)\1/);
  const advertiserType = adProfMatch
    ? (adProfMatch[2]?.trim().length > 0 ? 'professional' : 'particular')
    : 'unknown';

  const adNameMatch = html.match(/advertiserName\s*:\s*(['"])([^'"]{2,60})\1/);
  const advertiserName = adNameMatch?.[2]?.trim() || null;

  return { advertiserType, advertiserName };
}

async function testUrl(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'WhatsApp/2.23.20.0',
      },
      timeout: 15000,
    }, (res) => {
      let html = '';

      res.on('data', chunk => {
        html += chunk;
        // Limit to 2MB to avoid huge downloads
        if (html.length > 2 * 1024 * 1024) {
          res.destroy();
        }
      });

      res.on('end', () => {
        const adId = url.match(/\/inmueble\/(\d+)\//)?.[1];
        const { advertiserType, advertiserName } = extractAdvertiserInfo(html);
        const phones = extractPhonePatterns(html);
        const hasPhone = Object.keys(phones).length > 0;

        resolve({
          url,
          adId,
          advertiserType,
          advertiserName,
          phoneFound: hasPhone,
          phonePatterns: hasPhone ? phones : 'NO DETECTADO',
          htmlLength: html.length,
          status: 'OK',
        });
      });
    }).on('error', (err) => {
      resolve({
        url,
        status: 'ERROR',
        error: err.message,
      });
    }).on('timeout', () => {
      resolve({
        url,
        status: 'TIMEOUT',
        error: 'Request timeout after 15 seconds',
      });
    });
  });
}

async function main() {
  const urls = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_URLS;

  console.log('📱 Idealista Phone Extraction Test');
  console.log(`Testing ${urls.length} URL(s)\n`);

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`[${i + 1}/${urls.length}] Testing: ${url}`);

    const result = await testUrl(url);

    if (result.status !== 'OK') {
      console.log(`  ❌ ${result.status}: ${result.error}`);
      failureCount++;
    } else {
      const phoneStatus = result.phoneFound ? '✅ FOUND' : '❌ NOT FOUND';
      console.log(`  Anunciante: ${result.advertiserType}${result.advertiserName ? ` (${result.advertiserName})` : ''}`);
      console.log(`  Teléfono: ${phoneStatus}`);

      if (result.phoneFound) {
        console.log(`  Patrones coincidentes:`);
        for (const [pattern, phone] of Object.entries(result.phonePatterns)) {
          console.log(`    - ${pattern}: ${phone}`);
        }
        successCount++;
      }
    }
    console.log('');
  }

  console.log(`\nResultado: ${successCount}/${urls.length} anuncios con teléfono detectado`);
  process.exit(failureCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
