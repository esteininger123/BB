// POST /api/pandadoc/webhook
//
// Empfängt PandaDoc-Webhook-Events (z.B. document.viewed, recipient_completed,
// document.completed) und schreibt den Status-Verlauf in die Kunden-Notizen.
//
// Sicherheit: HMAC-SHA256 über den Raw-Body, gegen PANDADOC_WEBHOOK_SECRET.
// Header "x-pandadoc-signature" oder Query-Param "signature".
//
// In PandaDoc-Settings → Entwickler-Center → Webhooks abonnieren:
//   - document_state_changed
//   - recipient_completed
// URL: https://bb-brown-pi.vercel.app/api/pandadoc/webhook
// Shared Secret: <Wert von PANDADOC_WEBHOOK_SECRET>
//
// Wichtig: bodyParser muss aus sein, sonst stimmt die HMAC-Signatur nicht.

const crypto = require('crypto');
const { airtable, listAll, escapeFormulaString } = require('../_lib/airtable');
const { TABLES, KUNDEN_FIELDS } = require('../_lib/tables');

// Vercel: Raw-Body, damit HMAC stimmt
module.exports.config = {
  api: { bodyParser: false }
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const secret = process.env.PANDADOC_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'Webhook nicht konfiguriert (PANDADOC_WEBHOOK_SECRET fehlt)' });
  }

  // 1. Raw-Body lesen
  let raw;
  try { raw = await getRawBody(req); }
  catch (e) { return res.status(400).json({ error: 'Body konnte nicht gelesen werden' }); }

  // 2. Signatur prüfen
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const got = (req.headers['x-pandadoc-signature']
            || req.headers['x-pandadoc-shared-key-hmac-sha256']
            || (req.query && req.query.signature)
            || '').toString();
  // timing-safe compare
  if (!got || got.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(got, 'utf8'), Buffer.from(expected, 'utf8'))) {
    return res.status(401).json({ error: 'Ungültige Signatur' });
  }

  // 3. Event-Liste parsen (PandaDoc sendet ein Array)
  let events;
  try { events = JSON.parse(raw); }
  catch (e) { return res.status(400).json({ error: 'Body ist kein gültiges JSON' }); }
  if (!Array.isArray(events)) events = [events];

  const stempel = new Date().toISOString().substring(0, 16).replace('T', ' ');
  const ergebnisse = [];

  for (const ev of events) {
    try {
      const evName = ev.event || (ev.data && ev.data.event) || '';
      const docData = (ev.data) || {};
      const docId = docData.id || (ev.id) || '';
      const docName = docData.name || '';
      const docStatus = docData.status || '';

      if (!docId) {
        ergebnisse.push({ event: evName, ok: false, reason: 'keine Doc-ID im Event' });
        continue;
      }

      // 4. Kunde via Notizen-FIND finden (V1 — solange keine dedizierten Status-Felder existieren)
      const formula = `FIND('${escapeFormulaString(docId)}', {${KUNDEN_FIELDS.NOTIZEN}}) > 0`;
      let kundenRecs = [];
      try {
        kundenRecs = await listAll(TABLES.KUNDEN, {
          filterByFormula: formula,
          maxRecords: 1
        }, 1);
      } catch (e) {
        // Falls Airtable die Formel nicht mag, leise weiter
      }

      if (!kundenRecs.length) {
        ergebnisse.push({ event: evName, docId, ok: false, reason: 'Kunde zu Doc nicht gefunden' });
        continue;
      }

      const kunde = kundenRecs[0];
      const statusText = describeEvent(evName, docStatus, ev);
      const oldNotizen = (kunde.fields && kunde.fields[KUNDEN_FIELDS.NOTIZEN]) || '';
      const neueZeile = `[${stempel}] PandaDoc ${docId}: ${statusText}`;
      const neueNotizen = oldNotizen ? `${oldNotizen}\n${neueZeile}` : neueZeile;

      await airtable('update', TABLES.KUNDEN, {
        recordId: kunde.id,
        fields: { [KUNDEN_FIELDS.NOTIZEN]: neueNotizen }
      });

      ergebnisse.push({ event: evName, docId, kundeId: kunde.id, ok: true, status: statusText });
    } catch (e) {
      ergebnisse.push({ event: ev && ev.event, ok: false, reason: e.message });
    }
  }

  return res.status(200).json({ ok: true, processed: ergebnisse });
};

function describeEvent(evName, docStatus, ev) {
  // Klartext-Mapping für Edgar in der Notiz
  if (evName === 'recipient_completed') {
    const r = (ev.data && ev.data.recipient) || {};
    const who = r.email || r.name || (r.role || '');
    return `Recipient unterschrieben (${who})`;
  }
  if (evName === 'document_state_changed' || evName.startsWith('document.')) {
    switch (docStatus) {
      case 'document.sent':      return 'Versandt';
      case 'document.viewed':    return 'Angesehen';
      case 'document.completed': return 'Vollständig signiert';
      case 'document.rejected':  return 'Abgelehnt';
      case 'document.expired':   return 'Frist abgelaufen';
      case 'document.draft':     return 'Entwurf bereit';
      default:                   return docStatus || evName;
    }
  }
  return evName || 'unbekanntes Event';
}
