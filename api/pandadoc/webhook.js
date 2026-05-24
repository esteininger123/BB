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
const { appendActivityZeile } = require('../_lib/notizen');

// Vercel: Raw-Body, damit HMAC stimmt
module.exports.config = {
  api: { bodyParser: false }
};

async function getRawBody(req) {
  // FS-1 Security-Fix 2026-05-24 (Pen-Tester HIGH #4):
  // Body-Size-Limit gegen DoS via Memory-Exhaustion. PandaDoc-Events sind
  // realistisch < 50 KB; 256 KB als sicherer Cap. Beim Überlauf wird der
  // Stream destroyed und Promise rejected → 413 zurückgeben.
  // Plus: Buffer-Concat statt String-Concat (Pen-Tester MEDIUM #10) für
  // korrekte HMAC-Verifikation bei Unicode/Binär-Anomalien.
  const MAX = 256 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let len = 0;
    req.on('data', chunk => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      len += buf.length;
      if (len > MAX) {
        const err = new Error('payload-too-large');
        err.code = 'PAYLOAD_TOO_LARGE';
        try { req.destroy(err); } catch {}
        return reject(err);
      }
      chunks.push(buf);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
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
  catch (e) {
    if (e && e.code === 'PAYLOAD_TOO_LARGE') {
      return res.status(413).json({ error: 'Webhook-Body zu groß (max 256 KB)' });
    }
    return res.status(400).json({ error: 'Body konnte nicht gelesen werden' });
  }

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
      let formulaPathOK = false; // FS-3m: track ob Formula-Pfad lief (auch wenn 0 Records)
      let usedFallback = false;
      try {
        const formula = `FIND('${escapeFormulaString(docId)}', {${NOTIZEN_FIELDNAME}}) > 0`;
        kundenRecs = await listAll(TABLES.KUNDEN, {
          filterByFormula: formula,
          maxRecords: 1
        }, 1);
        formulaPathOK = true;
      } catch (e) {
        // Formula-Pfad gescheitert (z.B. Field-Name geändert) — Fallback unten
      }
      // FS-3m (Re-Audit P1 25.05.2026): Fallback NUR wenn Formula-Pfad selbst
      // gefehlt hat (Field-Name-Drift). Wenn die Formula durchlief und 0 Records
      // lieferte → Kunde existiert wirklich nicht (oder DocId stimmt nicht).
      // Vorher lief der Fallback bei jedem leeren Formula-Result → 1000-Record-
      // Scan bei jedem Webhook-Event. Plus: bei Fallback nur AKTIVE Kunden
      // scannen (archivierte sind eh nicht mehr relevant für neue Statuses).
      if (!formulaPathOK && !kundenRecs.length) {
        try {
          // FS-3m: kein server-side-Filter (Field-Typ unklar) — clientside filtern
          // nach archiviert + docId in einem Pass. Spart Airtable-Roundtrips.
          const alle = await listAll(TABLES.KUNDEN, {}, 1000);
          kundenRecs = alle.filter(rec => {
            const f = (rec && rec.fields) || {};
            if (f[KUNDEN_FIELDS.ARCHIVIERT]) return false; // archivierte überspringen
            const notizen = f[KUNDEN_FIELDS.NOTIZEN] || '';
            return typeof notizen === 'string' && notizen.includes(docId);
          });
          if (kundenRecs.length) {
            usedFallback = true;
            console.warn(`[pandadoc-webhook] Field-Name-Pfad gescheitert für ${docId}, Fallback (active-only) hat ${kundenRecs.length} Kunden gefunden — Field-Name "${NOTIZEN_FIELDNAME}" prüfen.`);
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
      // Iter 84 (22.05.2026): Doc-Typ aus docName extrahieren (erstes Wort vor " – ").
      //   So sieht Edgar in der Notiz auf einen Blick „Selbstauskunft" vs. „Reservierung".
      //   Wenn docName fehlt oder Pattern nicht matcht, bleibt der Zusatz einfach weg.
      const docTyp = docName && docName.split(/\s*[–—-]\s*/)[0] ? docName.split(/\s*[–—-]\s*/)[0].trim() : '';
      const docTypSuffix = docTyp && (docTyp.toLowerCase().startsWith('selbstauskunft') || docTyp.toLowerCase().startsWith('reservierung'))
        ? ` (${docTyp})`
        : '';
      const neueZeile = `[${stempel}] PandaDoc ${docId}${docTypSuffix}: ${statusText}`;

      // FS-1 Refactor 2026-05-24 (Tech-Architekt BLOCKER B-2):
      // Notizen-Append via gemeinsamer Helper-Lib `api/_lib/notizen.js`. Diese
      // erkennt BEIDE Block-Marker ([KAV-TRACKER] + [WUNSCH-PROFIL]) und fügt
      // vor dem ersten Block ein. Idempotenz-Marker (Webhook-Retry-Schutz)
      // wird an die Lib übergeben — die kümmert sich um den Match-Check.
      // FS-1 Final-Audit-Polish 24.05.2026: alter manueller Re-Read entfernt
      // (war Doppel-Roundtrip: Lib macht eigenen Re-Read). Idempotenz-Pattern
      // jetzt via opts an die Lib — Code-Duplikation weg.
      const escId = String(docId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const idempotencyRegex = new RegExp(`PandaDoc ${escId}(?:\\s*\\([^)]+\\))?: ${statusText.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      const result = await appendActivityZeile(kunde.id, neueZeile, { idempotencyMarker: idempotencyRegex });
      if (result && result.skipped === 'duplicate') {
        ergebnisse.push({ event: evName, docId, kundeId: kunde.id, ok: true, status: statusText, skipped: 'duplicate' });
        continue;
      }

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
