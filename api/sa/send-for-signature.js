// POST /api/sa/send-for-signature
//
// Iter 84 (22.05.2026): Neu geschrieben für Variante B (HTML → PDF → Upload).
// Ersetzt den alten Template-basierten Stub.
//
// Flow:
//   1. Frontend ruft PDF.selbstauskunftHtmlForPandaDoc(kunde, user) → komplettes HTML
//   2. Frontend POSTet { kundeId, html } an diesen Endpoint
//   3. Backend rendert das HTML via Puppeteer + @sparticuz/chromium-min zu PDF
//   4. Backend uploaded das PDF zu PandaDoc (multipart/form-data) mit parse_form_fields:true
//      → PandaDoc erkennt die [signature:Antragsteller___]- und [date:...]-Tags im PDF
//   5. Backend wartet auf document.draft (3-10 Sek async)
//   6. Backend gibt Editor-URL zurück (Hybrid wie Reservierung)
//   7. Frontend öffnet Editor-Tab, Vertriebler klickt im PandaDoc-UI „Dokument senden"
//
// Env-Vars:
//   PANDADOC_API_KEY            (bereits gesetzt für Reservierung)
//   PANDADOC_EDITOR_HOST        (optional, default app.pandadoc.com)
//   CHROMIUM_PACK_URL           (optional, default GitHub-Release v133)
//
// PandaDoc-Workspace muss „Field Tags" aktiviert haben — sonst werden die Tags
// im PDF nicht in Signaturfelder umgewandelt.

const chromium = require('@sparticuz/chromium-min');
const puppeteer = require('puppeteer-core');
const { verifySession } = require('../_lib/auth');
const { airtable } = require('../_lib/airtable');
const { readBody, methodNotAllowed } = require('../_lib/http');
const { TABLES, KUNDEN_FIELDS } = require('../_lib/tables');

const PANDADOC_API = 'https://api.pandadoc.com/public/v1';
const DEFAULT_PACK_URL = 'https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const startTs = Date.now();

  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const apiKey = process.env.PANDADOC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'PandaDoc nicht konfiguriert',
      hint: 'Env-Var PANDADOC_API_KEY fehlt in Vercel.'
    });
  }

  const body = await readBody(req);
  const { kundeId, html } = body || {};
  if (!kundeId) return res.status(400).json({ error: 'kundeId erforderlich' });
  if (!html || typeof html !== 'string' || html.length < 100) {
    return res.status(400).json({ error: 'html erforderlich (vom Frontend via PDF.selbstauskunftHtmlForPandaDoc)' });
  }

  // Kunde laden + Owner-Check (analog Reservierungs-Endpoint)
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

  // saJson aus Kunde lesen — daraus Recipients ableiten
  const sa = parseSaJson(kundeRec.fields && kundeRec.fields[KUNDEN_FIELDS.SA_JSON]);
  if (!sa || !sa.antragsteller) {
    return res.status(400).json({ error: 'Selbstauskunft des Kunden ist leer — bitte erst ausfüllen.' });
  }
  const a = sa.antragsteller || {};
  const m = sa.mitantragsteller || {};
  const gemeinsam = sa.gemeinsam === true;

  if (!a.email) return res.status(400).json({ error: 'E-Mail des Antragstellers fehlt in der Selbstauskunft.' });
  if (gemeinsam && !m.email) return res.status(400).json({ error: 'E-Mail des Mitantragstellers fehlt — bitte in der SA ergänzen.' });

  // ----- 1) HTML zu PDF via Puppeteer -----
  let pdfBuffer = null;
  let browser = null;
  try {
    const executablePath = await chromium.executablePath(process.env.CHROMIUM_PACK_URL || DEFAULT_PACK_URL);
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '18mm', left: '12mm' },
    });
  } catch (e) {
    if (browser) try { await browser.close(); } catch {}
    return res.status(500).json({ error: 'PDF-Generation fehlgeschlagen', detail: e.message, durationMs: Date.now() - startTs });
  } finally {
    if (browser) try { await browser.close(); } catch {}
  }

  // ----- 2) PandaDoc-Upload (multipart/form-data) -----
  // Recipients: Antragsteller + ggf. Mitantragsteller. Rollen-Strings exakt
  // wie die Field-Tags im PDF ([signature:Antragsteller___]).
  const recipients = [{
    email: a.email,
    first_name: a.vorname || '',
    last_name: a.name || '',
    role: 'Antragsteller',
    signing_order: 1,
  }];
  if (gemeinsam) {
    recipients.push({
      email: m.email,
      first_name: m.vorname || '',
      last_name: m.name || '',
      role: 'Mitantragsteller',
      signing_order: 2,
    });
  }
  const docName = `Selbstauskunft – ${a.vorname || ''} ${a.name || ''}`.trim();
  const dataJson = {
    name: docName,
    recipients,
    parse_form_fields: true,  // Triggert Field-Tag-Erkennung im PDF
    tags: ['selbstauskunft', 'bb-immo'],
  };

  let document;
  try {
    const formBody = buildMultipart(dataJson, pdfBuffer, docName);
    const createResp = await fetch(`${PANDADOC_API}/documents/`, {
      method: 'POST',
      headers: {
        'Authorization': `API-Key ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${formBody.boundary}`,
      },
      body: formBody.body,
    });
    if (!createResp.ok) {
      const errText = await createResp.text();
      return res.status(502).json({ error: 'PandaDoc-Create fehlgeschlagen', detail: errText, durationMs: Date.now() - startTs });
    }
    document = await createResp.json();
  } catch (e) {
    return res.status(502).json({ error: 'PandaDoc nicht erreichbar', detail: e.message, durationMs: Date.now() - startTs });
  }

  const docId = document.id;

  // ----- 3) Auf document.draft warten (PandaDoc verarbeitet PDF + Tags async) -----
  let ready = false;
  for (let i = 0; i < 12 && !ready; i++) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const statusResp = await fetch(`${PANDADOC_API}/documents/${docId}`, {
        headers: { 'Authorization': `API-Key ${apiKey}` }
      });
      const statusData = await statusResp.json();
      if (statusData.status === 'document.draft') ready = true;
    } catch {}
  }

  // ----- 4) Hybrid-Workflow: Editor-URL zurückgeben, kein Auto-Send -----
  // Analog zum Reservierungs-Endpoint: Vertriebler prüft im PandaDoc-Editor
  // und klickt „Dokument senden" manuell.
  const editorHost = process.env.PANDADOC_EDITOR_HOST || 'app.pandadoc.com';
  const editorUrl = `https://${editorHost}/a/#/documents/${docId}`;

  // PandaDoc-DocId in Kunden-Notizen vermerken
  try {
    const oldNotizen = (kundeRec.fields && kundeRec.fields[KUNDEN_FIELDS.NOTIZEN]) || '';
    const stempel = new Date().toISOString().substring(0, 16).replace('T', ' ');
    const neueZeile = `[${stempel}] Selbstauskunft erstellt für ${a.email}${gemeinsam ? ` + ${m.email}` : ''} — PandaDoc-Doc: ${docId} (wartet auf manuellen Send)`;
    const neueNotizen = oldNotizen ? `${oldNotizen}\n${neueZeile}` : neueZeile;
    await airtable('update', TABLES.KUNDEN, {
      recordId: kundeId,
      fields: { [KUNDEN_FIELDS.NOTIZEN]: neueNotizen }
    });
  } catch (e) {
    // Notiz-Schreib-Fehler ist nicht tödlich
  }

  return res.status(200).json({
    ok: true,
    message: ready
      ? 'Selbstauskunft erstellt — öffne PandaDoc und klick „Dokument senden"'
      : 'Dokument wird im Hintergrund vorbereitet — öffne PandaDoc, dort steht es gleich versandbereit',
    pandadocDocumentId: docId,
    editorUrl,
    recipients: recipients.map(r => r.email),
    durationMs: Date.now() - startTs,
  });
};

function parseSaJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

// Multipart/form-data Body Builder — schickt JSON-„data"-Part + PDF-„file"-Part
// im Format das PandaDoc erwartet. Vermeidet eine extra form-data-Dependency.
function buildMultipart(dataJson, pdfBuffer, filename) {
  const boundary = '----BBImmo' + Math.random().toString(36).slice(2);
  const CRLF = '\r\n';
  const parts = [];

  // Part 1: data (JSON)
  parts.push(Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="data"${CRLF}` +
    `Content-Type: application/json${CRLF}${CRLF}` +
    JSON.stringify(dataJson) +
    CRLF
  ));

  // Part 2: file (PDF)
  const safeName = (filename || 'selbstauskunft').replace(/[^\w\-äöüÄÖÜß ]/g, '_') + '.pdf';
  parts.push(Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="file"; filename="${safeName}"${CRLF}` +
    `Content-Type: application/pdf${CRLF}${CRLF}`
  ));
  parts.push(pdfBuffer);
  parts.push(Buffer.from(CRLF));

  // Closing boundary
  parts.push(Buffer.from(`--${boundary}--${CRLF}`));

  return { boundary, body: Buffer.concat(parts) };
}
