// POST /api/sa/send-for-signature
//
// Schickt die Selbstauskunft eines Kunden an PandaDoc zur digitalen Signatur.
// STATUS: STUB. Bevor das produktiv funktioniert, muss Edgar:
//   1. PandaDoc-Account anlegen (https://www.pandadoc.com)
//   2. API-Key generieren (Settings → Developer → API Keys → Create API Key)
//   3. Selbstauskunft-PDF einmalig als Template hochladen, Signaturfelder den
//      PandaDoc-Token-Tags {{Signature1}}, {{Date1}}, {{Signature2}}, {{Date2}}
//      zuordnen, Template-ID notieren.
//   4. Env-Vars setzen (Vercel → Settings → Environment Variables):
//        PANDADOC_API_KEY          (der API-Key, Format: "API-Key xxx")
//        PANDADOC_TEMPLATE_ID_SA   (Template-ID aus PandaDoc)
//        PANDADOC_WEBHOOK_SECRET   (frei wählbar — zum Verifizieren der Webhook-Calls)
//
// Wenn Edgar lieber das PDF aus dem Browser an PandaDoc weiterreicht (statt
// Template-Variante), siehe Variante B unten im Kommentarblock.

const { verifySession } = require('../_lib/auth');
const { airtable } = require('../_lib/airtable');
const { readBody, methodNotAllowed } = require('../_lib/http');
const { TABLES, KUNDEN_FIELDS } = require('../_lib/tables');

const PANDADOC_API = 'https://api.pandadoc.com/public/v1';

// B&B-Kontaktdaten zentral. Wenn sich Nummer/E-Mail ändert, hier anpassen.
const BB_KONTAKT = {
  telefon: '07805 / 919 16 41',
  email:   'info@bub-immo.de',
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const apiKey = process.env.PANDADOC_API_KEY;
  const templateId = process.env.PANDADOC_TEMPLATE_ID_SA;
  if (!apiKey || !templateId) {
    return res.status(503).json({
      error: 'PandaDoc nicht konfiguriert',
      hint: 'Env-Vars PANDADOC_API_KEY und PANDADOC_TEMPLATE_ID_SA fehlen. Siehe Kommentar in api/sa/send-for-signature.js.'
    });
  }

  const body = await readBody(req);
  const { kundeId } = body;
  if (!kundeId) return res.status(400).json({ error: 'kundeId erforderlich' });

  // Kunde laden + Zugriff prüfen (gleiche Logik wie in snapshots.js)
  let kundeRec;
  try {
    kundeRec = await airtable('get', TABLES.KUNDEN, { recordId: kundeId });
  } catch (e) {
    return res.status(404).json({ error: 'Kunde nicht gefunden' });
  }
  if (session.rolle !== 'Admin') {
    const owners = (kundeRec.fields && kundeRec.fields[KUNDEN_FIELDS.OWNER]) || [];
    if (!Array.isArray(owners) || !owners.includes(session.vertrieblerId)) {
      return res.status(403).json({ error: 'Kein Zugriff auf diesen Kunden' });
    }
  }

  const sa = parseSaJson(kundeRec.fields && kundeRec.fields[KUNDEN_FIELDS.SA_JSON]);
  if (!sa || !sa.antragsteller) {
    return res.status(400).json({ error: 'Selbstauskunft des Kunden ist leer — bitte erst ausfüllen.' });
  }

  const a = sa.antragsteller;
  const m = sa.mitantragsteller || {};
  const gemeinsam = sa.gemeinsam === true;

  if (!a.email) return res.status(400).json({ error: 'E-Mail des Antragstellers fehlt in der Selbstauskunft.' });
  if (gemeinsam && !m.email) return res.status(400).json({ error: 'E-Mail des Mitantragstellers fehlt.' });

  // --- Empfänger-Mapping. Die "role" muss exakt so heißen, wie im PandaDoc-Template
  // hinterlegt ist (in PandaDoc als Recipient-Role-Name beim Template-Setup festgelegt).
  const recipients = [
    {
      email: a.email,
      first_name: a.vorname || '',
      last_name: a.name || '',
      role: 'Antragsteller'
    }
  ];
  if (gemeinsam) {
    recipients.push({
      email: m.email,
      first_name: m.vorname || '',
      last_name: m.name || '',
      role: 'Mitantragsteller'
    });
  }

  // --- Token-Mapping. Variablen, die PandaDoc in das Template einsetzt.
  // Mappt sa.* auf die im Template definierten Tokens (z.B. {{Antragsteller.Name}}).
  // Diese Liste muss zum Template passen, das in PandaDoc hochgeladen wurde.
  const tokens = [
    { name: 'Antragsteller.Name', value: `${a.vorname || ''} ${a.name || ''}`.trim() },
    { name: 'Antragsteller.Adresse', value: `${a.strasse || ''}, ${a.plz || ''} ${a.ort || ''}` },
    { name: 'Antragsteller.Geburtsdatum', value: a.geburtsdatum || '' },
    { name: 'Datum.Heute', value: new Date().toLocaleDateString('de-DE') }
  ];
  if (gemeinsam) {
    tokens.push(
      { name: 'Mitantragsteller.Name', value: `${m.vorname || ''} ${m.name || ''}`.trim() },
      { name: 'Mitantragsteller.Adresse', value: `${m.strasse || ''}, ${m.plz || ''} ${m.ort || ''}` }
    );
  }

  // --- 1) Dokument aus Template erzeugen
  let document;
  try {
    const createResp = await fetch(`${PANDADOC_API}/documents`, {
      method: 'POST',
      headers: {
        'Authorization': `API-Key ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `Selbstauskunft – ${a.vorname || ''} ${a.name || ''}`.trim(),
        template_uuid: templateId,
        recipients,
        tokens
      })
    });
    if (!createResp.ok) {
      const errText = await createResp.text();
      return res.status(502).json({ error: 'PandaDoc-Create fehlgeschlagen', detail: errText });
    }
    document = await createResp.json();
  } catch (e) {
    return res.status(502).json({ error: 'PandaDoc nicht erreichbar', detail: e.message });
  }

  // PandaDoc baut das Dokument asynchron. Wir müssen warten, bis Status = "document.draft".
  // In der Praxis dauert das 1–5 Sekunden. Hier: kurzes Polling (max 10s).
  const docId = document.id;
  let ready = false;
  for (let i = 0; i < 10 && !ready; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const statusResp = await fetch(`${PANDADOC_API}/documents/${docId}`, {
        headers: { 'Authorization': `API-Key ${apiKey}` }
      });
      const statusData = await statusResp.json();
      if (statusData.status === 'document.draft') ready = true;
    } catch { /* retry */ }
  }
  if (!ready) {
    return res.status(202).json({
      message: 'Dokument erstellt, aber noch nicht versandfertig. Bitte später erneut versenden.',
      pandadocDocumentId: docId
    });
  }

  // --- 2) Versenden
  try {
    const sendResp = await fetch(`${PANDADOC_API}/documents/${docId}/send`, {
      method: 'POST',
      headers: {
        'Authorization': `API-Key ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Sehr geehrte/r ${a.vorname || ''} ${a.name || ''},\n\n` +
          `anbei Ihre persönliche Selbstauskunft zur digitalen Unterschrift. ` +
          `Bitte prüfen Sie die Angaben sorgfältig und unterzeichnen Sie das Dokument direkt online.\n\n` +
          `Bei Rückfragen erreichen Sie uns unter ${BB_KONTAKT.email} oder ${BB_KONTAKT.telefon}.\n\n` +
          `Mit freundlichen Grüßen\nB&B Immo GmbH`,
        subject: 'Ihre Selbstauskunft – Bitte digital unterzeichnen',
        silent: false
      })
    });
    if (!sendResp.ok) {
      const errText = await sendResp.text();
      return res.status(502).json({ error: 'PandaDoc-Send fehlgeschlagen', detail: errText });
    }
  } catch (e) {
    return res.status(502).json({ error: 'Versand fehlgeschlagen', detail: e.message });
  }

  // --- 3) Erfolg zurückgeben (Kunde-Phase könnte hier auf "Selbstauskunft versandt" gesetzt werden)
  return res.status(200).json({
    message: 'Selbstauskunft versandt',
    pandadocDocumentId: docId,
    recipients: recipients.map(r => r.email)
  });
};

function parseSaJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

/*
 * =======================================================================================
 * VARIANTE B: PDF aus dem Browser hochladen (statt Template)
 * =======================================================================================
 *
 * Wenn Edgar das PDF lieber aus der Webapp generiert und 1:1 an PandaDoc weiterreicht
 * (statt PandaDoc-Templates zu pflegen), so funktioniert es:
 *
 * 1) Frontend: PDF.js generiert das HTML → window.print() ist NICHT scriptbar. Stattdessen
 *    nutzt man html2pdf.js / jspdf, um das HTML zu Base64-PDF zu konvertieren.
 *    Beispiel: const pdfBlob = await html2pdf().from(html).output('blob');
 *
 * 2) Frontend → Backend POST mit { kundeId, pdfBase64 }.
 *
 * 3) Backend: PandaDoc-API "Create document from PDF" verwenden:
 *      POST /v1/documents
 *      multipart/form-data:
 *        - file: <pdfBlob>
 *        - data: { name, recipients, fields: [{...positioniert per Text-Tag-Erkennung}] }
 *    PandaDoc erkennt die {{Signature1}}-Tags automatisch im PDF-Text (wenn im
 *    PandaDoc-Workspace "Text Tags" aktiviert ist: Settings → Workspace → Text Tags).
 *
 * Vorteil Variante B: Layout-Änderungen am PDF brauchen kein Template-Update.
 * Nachteil: PandaDoc rechnet pro Dokument-Upload (vs. Template = unlimited).
 *
 * Empfehlung: Erstmal Variante A (Template). Wenn Edgar das PDF oft ändert, auf B umstellen.
 */
