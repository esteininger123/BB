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
      // Iter-3 W2 (21.05.2026): docStatus kann je nach Event-Typ an verschiedenen Stellen
      // liegen. Bei `document_state_changed` ist es `ev.data.status`. Bei `recipient_completed`
      // ist `ev.data.status` typischerweise nicht gesetzt; wenn vorhanden, ist es im
      // `ev.event_action`/`ev.data.recipient.has_completed`-Kontext. describeEvent fängt
      // beide Fälle ab — wir reichen alle plausiblen Quellen durch.
      const docStatus = docData.status
                     || docData.document_status
                     || ev.event_action
                     || '';

      if (!docId) {
        ergebnisse.push({ event: evName, ok: false, reason: 'keine Doc-ID im Event' });
        continue;
      }

      // 4. Kunde via Notizen-FIND finden (V1 — solange keine dedizierten Status-Felder existieren)
      //
      // BUG-FIX 21.05.2026 (Iter-2): filterByFormula muss Field-NAMEN nutzen, NICHT Field-IDs.
      // Vorher wurde KUNDEN_FIELDS.NOTIZEN (= 'fldtpjO65JHIbUecZ') in die Formel gepackt — das
      // referenzierte ein nicht-existierendes Feld, Airtable lieferte 0 Treffer, und der
      // Webhook verwarf still jede Statusmeldung. HMAC + 200 OK suggerierten "läuft".
      // Lösung: erst Formula mit Field-NAME, bei 0 Treffern Fallback auf clientseitiges
      // Filtern aller Kunden (paginiert). Wenn Henry den Field-Namen umbenennt, fällt der
      // Schnellpfad aus, der Fallback fängt es ab — und wir loggen es deutlich.
      const NOTIZEN_FIELDNAME = 'Notizen';
      let kundenRecs = [];
      let usedFallback = false;
      try {
        const formula = `FIND('${escapeFormulaString(docId)}', {${NOTIZEN_FIELDNAME}}) > 0`;
        kundenRecs = await listAll(TABLES.KUNDEN, {
          filterByFormula: formula,
          maxRecords: 1
        }, 1);
      } catch (e) {
        // Formula-Pfad gescheitert — Fallback unten
      }
      if (!kundenRecs.length) {
        // Fallback: alle Kunden laden, clientseitig nach docId in NOTIZEN-Field-ID filtern
        try {
          const alle = await listAll(TABLES.KUNDEN, {}, 1000);
          kundenRecs = alle.filter(rec => {
            const notizen = (rec.fields && rec.fields[KUNDEN_FIELDS.NOTIZEN]) || '';
            return typeof notizen === 'string' && notizen.includes(docId);
          });
          if (kundenRecs.length) {
            usedFallback = true;
            console.warn(`[pandadoc-webhook] Field-Name-Pfad leer für ${docId}, Fallback hat ${kundenRecs.length} Kunden gefunden — Field-Name "${NOTIZEN_FIELDNAME}" prüfen.`);
          }
        } catch (e) {
          // Auch der Fallback gescheitert → wird unten als "Kunde nicht gefunden" geloggt
        }
      }

      if (!kundenRecs.length) {
        console.warn(`[pandadoc-webhook] Kein Kunde mit DocId ${docId} gefunden (Event: ${evName}). Wenn das systematisch ist, prüfe Field-Name "${NOTIZEN_FIELDNAME}".`);
        ergebnisse.push({ event: evName, docId, ok: false, reason: 'Kunde zu Doc nicht gefunden' });
        continue;
      }

      const kunde = kundenRecs[0];
      const statusText = describeEvent(evName, docStatus, ev);
      const oldNotizen = (kunde.fields && kunde.fields[KUNDEN_FIELDS.NOTIZEN]) || '';
      // Iter 84 (22.05.2026): Doc-Typ aus docName extrahieren (erstes Wort vor " – ").
      //   So sieht Edgar in der Notiz auf einen Blick „Selbstauskunft" vs. „Reservierung".
      //   Wenn docName fehlt oder Pattern nicht matcht, bleibt der Zusatz einfach weg.
      const docTyp = docName && docName.split(/\s*[–—-]\s*/)[0] ? docName.split(/\s*[–—-]\s*/)[0].trim() : '';
      const docTypSuffix = docTyp && (docTyp.toLowerCase().startsWith('selbstauskunft') || docTyp.toLowerCase().startsWith('reservierung'))
        ? ` (${docTyp})`
        : '';
      const neueZeile = `[${stempel}] PandaDoc ${docId}${docTypSuffix}: ${statusText}`;

      // Iter-3 W5 (21.05.2026): Idempotenz — wenn PandaDoc das gleiche Event retried
      // (z.B. weil unser 200 nicht durchkam), nicht doppelt in die Notiz schreiben.
      // Wir suchen den letzten Block vom gleichen DocId und vergleichen den Status-Text.
      // Wenn der jüngste Eintrag identisch ist (gleicher Stempel auf die Minute genau
      // oder gleicher Status-Text innerhalb der letzten Minute), überspringen wir.
      //
      // QA-Fix 2026-05-22 (Audit-B B4): Regex hat den Iter-84-docTypSuffix
      // („ (Selbstauskunft)" / „ (Reservierung)") nicht berücksichtigt. Bei Retries
      // wurden Notizen-Einträge doppelt geschrieben. Regex erlaubt jetzt optional
      // den Suffix vor dem Doppelpunkt. Außerdem: docId wird escaped, weil PandaDoc-
      // IDs zwar alphanumerisch sind, defensiv aber sicher.
      const escId = String(docId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const docMarkerRegex = new RegExp(`PandaDoc ${escId}(?:\\s*\\([^)]+\\))?: (.+)`, 'g');
      const matches = [...oldNotizen.matchAll(docMarkerRegex)];
      const letzterStatusZuDoc = matches.length > 0 ? matches[matches.length - 1][1].trim() : null;
      if (letzterStatusZuDoc === statusText.trim()) {
        ergebnisse.push({ event: evName, docId, kundeId: kunde.id, ok: true, status: statusText, skipped: 'duplicate' });
        continue;
      }

      // Iter-3 W4 (21.05.2026): Notizen-Cutoff — Airtable Long-Text-Felder vertragen
      // 100k Zeichen, aber das Frontend (Kunden-Detail-Notiz-Anzeige) wird bei großen
      // Notizen unübersichtlich. Wir behalten nur die letzten 100 Zeilen. Ältere werden
      // mit Hinweis abgeschnitten — Edgar kann die Snapshot-History eh primär in der
      // Snapshot-Tabelle nachvollziehen.
      const MAX_NOTIZ_ZEILEN = 100;
      const kombinierte = oldNotizen ? `${oldNotizen}\n${neueZeile}` : neueZeile;
      const zeilen = kombinierte.split('\n');
      let neueNotizen;
      if (zeilen.length > MAX_NOTIZ_ZEILEN) {
        const cutoff = zeilen.length - MAX_NOTIZ_ZEILEN;
        neueNotizen = `[… ${cutoff} ältere Einträge abgeschnitten …]\n` + zeilen.slice(cutoff).join('\n');
      } else {
        neueNotizen = kombinierte;
      }

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
      // QA-Fix 2026-05-23 (Audit-CC-8): document.completed heißt "alle
      // Recipients haben signiert" — meist Edgar + Käufer. Klarer formulieren,
      // damit Edgar nicht reflexartig „der Kunde hat unterschrieben" liest.
      // Tatsächlicher Käufer-Signatur-Beleg ist recipient_completed weiter
      // oben in der Notiz mit Käufer-Email.
      case 'document.completed': return 'Doc vollständig (alle Recipients signiert — Käufer-Signatur siehe recipient_completed-Einträge oben)';
      case 'document.rejected':  return 'Abgelehnt';
      case 'document.expired':   return 'Frist abgelaufen';
      case 'document.draft':     return 'Entwurf bereit';
      default:                   return docStatus || evName;
    }
  }
  return evName || 'unbekanntes Event';
}
