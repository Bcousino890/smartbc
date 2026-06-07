require('dotenv').config();
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const LEADS_FILE = path.join(__dirname, 'leads.json');
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ─── Storage ─────────────────────────────────────────────────────────────────

function loadLeads() {
  try {
    if (fs.existsSync(LEADS_FILE)) return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  } catch {}
  return [];
}

function saveLeads(leads) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

// ─── Phone normalisation ──────────────────────────────────────────────────────

function normalizePhone(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-\(\)\.]/g, '');
  // Ya tiene código de país → se deja tal cual
  if (cleaned.startsWith('+')) return cleaned;
  // Empieza por 0034 → convertir a +34
  if (cleaned.startsWith('0034')) return '+' + cleaned.slice(2);
  // 9 dígitos españoles que empiezan por 6 o 7 → añadir +34
  if (/^[67]\d{8}$/.test(cleaned)) return '+34' + cleaned;
  // Número desconocido → devolver limpio sin modificar
  return cleaned;
}

function findPhone(text) {
  // Cualquier número internacional con + (ej: +34…, +57…, +1…)
  const intlMatch = text.match(/\+\d{1,3}[\s\-]?\d[\d\s\-]{6,14}/);
  if (intlMatch) return normalizePhone(intlMatch[0]);
  // Número español local 6XX/7XX XX XX XX (sin +)
  const localMatch = text.match(/\b[67]\d{2}[\s\-]?\d{2}[\s\-]?\d{2}[\s\-]?\d{2}\b/);
  if (localMatch) return normalizePhone(localMatch[0]);
  return null;
}

// ─── Barrio ───────────────────────────────────────────────────────────────────

function formatNeighborhood(raw) {
  if (!raw) return '';
  const n = raw.trim();
  // Si ya contiene "barrio" o "distrito" → dejarlo tal cual
  if (/barrio|distrito/i.test(n)) return n;
  // Barrios que sin contexto parecen otra ciudad → añadir "barrio"
  const needsPrefix = /^salamanca$/i.test(n);
  return needsPrefix ? `barrio ${n}` : n;
}

// ─── Alquiler / Venta ─────────────────────────────────────────────────────────

function parsePrice(priceStr) {
  if (!priceStr) return null;
  // "1.550 €" → 1550  |  "715.000 €" → 715000  |  "1.200,50 €" → 1200.50
  const cleaned = priceStr
    .replace(/[€\s]/g, '')   // quitar € y espacios
    .replace(/\./g, '')      // quitar puntos de miles
    .replace(',', '.');      // coma decimal → punto
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function detectPropertyType(priceStr) {
  const price = parsePrice(priceStr);
  if (price === null) return 'consultar';
  if (price < 30_000)  return 'alquiler';
  if (price > 400_000) return 'venta';
  return 'consultar';
}

// ─── Email parsing ────────────────────────────────────────────────────────────

function stripEmojis(str) {
  return str
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')   // banderas
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')   // caras
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')   // símbolos
    .replace(/[\u{2600}-\u{27BF}]/gu, '')     // miscelánea
    .trim();
}

function buildContactNotes(lead, dateStr) {
  const lines = [
    `[Lead Idealista - ${dateStr}]`,
    lead.property_address ? `Inmueble: ${lead.property_address}` : null,
    (lead.property_ref || lead.property_price)
      ? `Ref: ${lead.property_ref || '-'} | Precio: ${lead.property_price || '-'}`
      : null,
    '',
    'Mensaje del interesado:',
    lead.lead_message || '(sin mensaje)',
  ];
  return lines.filter(l => l !== null).join('\n');
}

function extractLeadData(subject, html, text) {
  const $ = cheerio.load(html || '');

  // 1. Lead name — del asunto: "Nuevo mensaje (con perfil) de NAME sobre tu inmueble"
  let lead_name = null;
  const nameMatch = subject.match(/Nuevo mensaje.*?\bde\s+(.+?)\s+sobre\s+tu\s+inmueble/i);
  if (nameMatch) lead_name = stripEmojis(nameMatch[1]);

  // Fallback: nombre en negrita centrado en el cuerpo (font-size 16px + text-align: center)
  if (!lead_name) {
    $('[style*="font-weight: 700"][style*="text-align: center"]').each((_, el) => {
      const t = stripEmojis($(el).text());
      if (t && t.length < 60 && !/tienes|hola|calle|ref\.|código/i.test(t)) {
        lead_name = t;
        return false;
      }
    });
  }

  // 2. Phone — prefer the hidden attribute set by Idealista for click-to-call
  let lead_phone = null;
  const phoneAttr = $('[appcallback_target_phone]').attr('appcallback_target_phone');
  if (phoneAttr) {
    lead_phone = normalizePhone(phoneAttr);
  } else {
    lead_phone = findPhone($.text()) || findPhone(text || '');
  }

  // Also grab visible phone text from "Ver perfil XXX XX XX XX" link
  if (!lead_phone) {
    $('a[style*="color"]').each((_, el) => {
      const t = $(el).text();
      const p = findPhone(t);
      if (p) { lead_phone = p; return false; }
    });
  }

  // 3. Lead message — inside the white rounded bubble
  let lead_message = null;
  // The message is a <span style="font-weight: 600"> inside a border-radius div
  $('span[style*="font-weight: 600"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 15 && !/€|ref\.|código/i.test(t)) {
      lead_message = t;
      return false;
    }
  });
  // Fallback: any text inside the rounded box
  if (!lead_message) {
    $('div[style*="border-radius: 8px"]').each((_, el) => {
      const t = $(el).text().trim();
      if (t.length > 15) { lead_message = t; return false; }
    });
  }

  // 4. Property details
  let property_address = null;
  let property_ref = null;
  let property_price = null;

  // Address — the <a> linking to the specific listing (idealista.com/NNNNNNN)
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (/idealista\.com/.test(href) && /\d{6,}/.test(href)) {
      const t = $(el).text().trim();
      if (t.length > 5) { property_address = t; return false; }
    }
  });

  // Ref and price — inside the listing card <p> tags
  $('p').each((_, el) => {
    const t = $(el).text().trim();
    if (/^Ref\./i.test(t)) {
      property_ref = t.replace(/^Ref\.\s*/i, '').trim();
    }
    if (/[\d\.,]+\s*€/.test(t) && !property_price) {
      property_price = t;
    }
  });

  // Ref from subject as fallback: "ref: BC892,"
  if (!property_ref) {
    const refMatch = subject.match(/ref:\s*([A-Z0-9]+)/i);
    if (refMatch) property_ref = refMatch[1];
  }

  // Address from subject as fallback: "ref: BC892, Piso en Calle …"
  if (!property_address) {
    const addrMatch = subject.match(/ref:\s*\w+,\s*(.+)$/i);
    if (addrMatch) property_address = addrMatch[1].trim();
  }

  return { lead_name, lead_phone, lead_message, property_address, property_price, property_ref };
}

// ─── Zinto webhook ────────────────────────────────────────────────────────────

async function sendToZinto(payload) {
  const url = process.env.ZINTO_WEBHOOK_URL;
  if (!url) {
    console.log('   ⚠️  ZINTO_WEBHOOK_URL not set — skipping webhook');
    return false;
  }
  const res = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10_000,
  });
  return res.status >= 200 && res.status < 300;
}

// ─── IMAP polling ─────────────────────────────────────────────────────────────

async function processEmails() {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASSWORD,
    },
    logger: false,
  });

  try {
    await client.connect();
  } catch (err) {
    console.error(`❌ IMAP connection failed: ${err.message}`);
    return;
  }

  const lock = await client.getMailboxLock('INBOX');
  try {
    // Search unseen emails containing "idealista" in the From field
    const uids = await client.search({ seen: false, from: 'idealista' });

    if (!uids.length) {
      console.log(`🔍 No new Idealista emails (${new Date().toLocaleTimeString()})`);
      return;
    }

    console.log(`📬 Found ${uids.length} Idealista email(s) to process`);

    const leads = loadLeads();
    const processedUids = [];

    for await (const msg of client.fetch(uids, { envelope: true, source: true }, { uid: true })) {
      const subject = msg.envelope.subject || '';
      const from = msg.envelope.from?.[0]?.address || '';

      // Extra guard in case IMAP search returns non-idealista results
      if (!from.toLowerCase().includes('idealista')) continue;

      let parsed;
      try {
        parsed = await simpleParser(msg.source);
      } catch (err) {
        console.error(`   ❌ Could not parse email UID ${msg.uid}: ${err.message}`);
        continue;
      }

      const lead = extractLeadData(subject, parsed.html || '', parsed.text || '');
      const timestamp = new Date().toISOString();
      const dateStr = timestamp.slice(0, 10); // YYYY-MM-DD

      console.log(`\n📧 Nuevo lead: ${lead.lead_name || '(sin nombre)'}`);
      if (lead.lead_phone)       console.log(`   📞 Teléfono : ${lead.lead_phone}`);
      if (lead.property_ref)     console.log(`   🏠 Ref      : ${lead.property_ref}`);
      if (lead.property_address) console.log(`   📍 Inmueble : ${lead.property_address}`);
      if (lead.property_price)   console.log(`   💶 Precio   : ${lead.property_price}`);
      if (lead.lead_message)     console.log(`   💬 Mensaje  : ${lead.lead_message.substring(0, 120)}…`);

      // Payload para Zinto:
      // - contact_name / contact_phone → el nodo manage_contact los usa para crear/actualizar el contacto
      // - contact_notes → se guarda en las notas del contacto (incluye fecha, inmueble y mensaje)
      // - lead_message → mensaje en crudo (útil para el AI assistant u otros nodos)
      const payload = {
        contact_name:     lead.lead_name       || '',
        contact_phone:    lead.lead_phone      || '',
        contact_notes:    buildContactNotes(lead, dateStr),
        lead_message:     lead.lead_message    || '',
        property_ref:     lead.property_ref    || '',
        property_address: lead.property_address || '',
        property_price:   lead.property_price  || '',
        property_type:         detectPropertyType(lead.property_price),
        property_neighborhood: formatNeighborhood((lead.property_address || '').split(',')[1]?.trim() || lead.property_address || ''),
      };

      let sent = false;
      try {
        sent = await sendToZinto(payload);
        if (sent) console.log(`   📤 Enviado a Zinto: ${lead.lead_phone}`);
      } catch (err) {
        console.error(`   ❌ Error webhook: ${err.message}`);
      }

      leads.push({
        ...payload,
        timestamp,
        status: sent ? 'sent_to_zinto' : 'webhook_failed',
        subject,
        uid: msg.uid,
      });
      saveLeads(leads);

      processedUids.push(msg.uid);
    }

    // Mark all processed emails as read in one command
    if (processedUids.length) {
      await client.messageFlagsAdd(processedUids, ['\\Seen'], { uid: true });
      console.log(`\n✅ Marked ${processedUids.length} email(s) as read`);
    }
  } catch (err) {
    console.error(`❌ Processing error: ${err.message}`);
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Idealista Lead Monitor started');
  console.log(`📡 Inbox : ${process.env.IMAP_USER}`);
  console.log(`🔗 Zinto : ${process.env.ZINTO_WEBHOOK_URL || '(not configured)'}`);
  console.log(`⏱️  Poll  : every 5 minutes\n`);

  // Process any existing unread emails immediately on startup
  console.log('🔄 Initial scan for unread Idealista emails…');
  await processEmails();

  // Then poll on a schedule
  setInterval(async () => {
    console.log(`\n🔄 Polling… (${new Date().toLocaleTimeString()})`);
    try {
      await processEmails();
    } catch (err) {
      console.error(`❌ Unexpected error: ${err.message}`);
    }
  }, POLL_INTERVAL);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
