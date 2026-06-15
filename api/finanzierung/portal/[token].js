// Kunden-Upload-Portal (Baustein U) — KEIN Login, Zugang über signierten Token.
//   GET  /api/finanzierung/portal/<token>  → Checkliste + Objektunterlagen + bisherige Uploads
//   POST /api/finanzierung/portal/<token>  Body { name, mimeType, dataBase64 }
//        → lädt die Datei in den Kunden-Drive-Ordner

const { requireSafeOrigin } = require('../../_lib/auth');
const { readBody, methodNotAllowed, sendError } = require('../../_lib/http');
const { airtable } = require('../../_lib/airtable');
const { TABLES, FINANZIERUNGSFALL_FIELDS, WE_FIELDS, PROJEKT_FIELDS } = require('../../_lib/tables');
const { verifyUploadToken } = require('../../_lib/upload-token');
const { listFiles, uploadFile, folderIdFromUrl } = require('../../_lib/drive');

// Statische Unterlagen-Checkliste (später leicht erweiterbar).
const CHECKLISTE = [
  'Gehaltsabrechnungen (letzte 3 Monate)',
  'Letzter Steuerbescheid / Einkommensteuererklärung',
  'Personalausweis (Vorder- und Rückseite)',
  'Eigenkapitalnachweis (Kontoauszug / Depot)',
  'Unterschriebene Selbstauskunft',
  'Sonstige Unterlagen',
];

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // ~4 MB (Vercel-Body-Limit ~4,5 MB)

// Löst aus der WE den zentralen Verkaufsunterlagen-Ordner auf: WE → Objekt → Feld.
async function resolveVerkaufsunterlagenFolder(weId) {
  if (!weId) return '';
  try {
    const weRec = await airtable('get', TABLES.WOHNEINHEIT, { recordId: weId });
    const objLink = (weRec.fields && weRec.fields[WE_FIELDS.PROJEKT]) || [];
    const objId = Array.isArray(objLink) && objLink.length
      ? (typeof objLink[0] === 'object' ? objLink[0].id : objLink[0]) : null;
    if (!objId) return '';
    const objRec = await airtable('get', TABLES.PROJEKT, { recordId: objId });
    const url = (objRec.fields && objRec.fields[PROJEKT_FIELDS.VERKAUFSUNTERLAGEN]) || '';
    return folderIdFromUrl(url);
  } catch {
    return '';
  }
}

const slim = (f) => ({ id: f.id, name: f.name, webViewLink: f.webViewLink });

module.exports = async (req, res) => {
  try {
    const token = req.query && req.query.token;
    const payload = token ? verifyUploadToken(token) : null;
    if (!payload || !payload.folderId) {
      return res.status(401).json({ error: 'Link ungültig oder abgelaufen' });
    }

    if (req.method === 'GET') {
      let kundeName = '';
      if (payload.fallId) {
        try {
          const fall = await airtable('get', TABLES.FINANZIERUNGSFALL, { recordId: payload.fallId });
          kundeName = (fall.fields && fall.fields[FINANZIERUNGSFALL_FIELDS.TITEL]) || '';
        } catch { /* Titel optional */ }
      }
      const uploads = await listFiles(payload.folderId).catch(() => []);
      const salesFolderId = await resolveVerkaufsunterlagenFolder(payload.weId);
      const objektunterlagen = salesFolderId ? await listFiles(salesFolderId).catch(() => []) : [];
      return res.status(200).json({
        kundeName,
        checkliste: CHECKLISTE,
        uploads: uploads.map(slim),
        objektunterlagen: objektunterlagen.map(slim),
      });
    }

    if (req.method === 'POST') {
      if (!requireSafeOrigin(req, res)) return;
      const body = await readBody(req);
      const name = (body.name || '').toString().trim();
      const mimeType = (body.mimeType || 'application/octet-stream').toString();
      const dataBase64 = (body.dataBase64 || '').toString();
      if (!name || !dataBase64) return res.status(400).json({ error: 'name und dataBase64 erforderlich' });
      const buffer = Buffer.from(dataBase64, 'base64');
      if (!buffer.length) return res.status(400).json({ error: 'Leere Datei' });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ error: 'Datei zu groß — max. ~4 MB pro Datei.' });
      }
      const safeName = name.replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 180);
      const uploaded = await uploadFile(payload.folderId, safeName, mimeType, buffer);
      return res.status(201).json({ ok: true, file: slim(uploaded) });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (e) {
    return sendError(res, e);
  }
};
