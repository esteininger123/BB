// Kunden-Upload-Portal (Baustein U) — KEIN Login, Zugang über signierten Token.
//   GET  /api/finanzierung/portal/<token>  → Checkliste + Objektunterlagen + bisherige Uploads
//   POST /api/finanzierung/portal/<token>  Body { name, mimeType, dataBase64, punkt }
//        → lädt die Datei (beschriftet nach Checklisten-Punkt) in den Kunden-Drive-Ordner;
//          bei Vollständigkeit aller Pflicht-Punkte → Fall-Status "Unterlagen vollständig"

const { requireSafeOrigin } = require('../../_lib/auth');
const { readBody, methodNotAllowed, sendError } = require('../../_lib/http');
const { airtable } = require('../../_lib/airtable');
const { TABLES, FINANZIERUNGSFALL_FIELDS } = require('../../_lib/tables');
const { verifyUploadToken } = require('../../_lib/upload-token');
const { listFiles, uploadFile } = require('../../_lib/drive');
const { resolveVerkaufsunterlagenFolder } = require('../../_lib/objektunterlagen');

// Pflicht-Dokumente jeder Angestellten-Finanzierung (key · label · Datei-Präfix).
// Selbstauskunft ist NICHT dabei — die kommt von B&B (PandaDoc), nicht vom Kunden.
const CHECKLISTE = [
  { key: 'gehalt',  label: 'Gehaltsabrechnungen (letzte 3 Monate)', file: 'Gehaltsabrechnung' },
  { key: 'steuer',  label: 'Letzter Einkommensteuerbescheid', file: 'Steuerbescheid' },
  { key: 'ausweis', label: 'Personalausweis (Vorder- & Rückseite)', file: 'Personalausweis' },
  { key: 'ek',      label: 'Eigenkapitalnachweis (Kontoauszug / Depot)', file: 'Eigenkapitalnachweis' },
];
// Situative Nachweise (Dropdown im Portal) — was Banken zusätzlich verlangen können
// und die Nachweise aus der Selbstauskunft. Beliebig erweiterbar, alles optional.
const WEITERE_TYPEN = [
  { key: 'arbeitsvertrag', label: 'Arbeitsvertrag' },
  { key: 'dezember',       label: 'Dezember-Gehaltsabrechnung (bei Bonus/variabel)' },
  { key: 'kontoauszuege',  label: 'Kontoauszüge Gehaltskonto (letzte Monate)' },
  { key: 'schufa',         label: 'SCHUFA-Selbstauskunft' },
  { key: 'mietvertrag',    label: 'Aktueller Mietvertrag (vermietete Immobilie)' },
  { key: 'mieteinnahmen',  label: 'Nachweis weiterer Mieteinnahmen' },
  { key: 'darlehen',       label: 'Bestehende Darlehens-/Kreditverträge' },
  { key: 'rente',          label: 'Renten- oder Pensionsbescheid' },
  { key: 'bwa',            label: 'BWA / Jahresabschluss (Selbstständige)' },
  { key: 'versicherung',   label: 'Bauspar- oder Lebensversicherungs-Nachweis' },
  { key: 'depot',          label: 'Depot- / Wertpapierauszug' },
  { key: 'schenkung',      label: 'Schenkungs- / Eigenkapital-Nachweis' },
  { key: 'sonstiges',      label: 'Sonstiges (mit eigener Beschreibung)' },
];
const PFLICHT = CHECKLISTE.map((c) => c.key);
const byKey = (k) => CHECKLISTE.find((c) => c.key === k);

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // ~4 MB (Vercel-Body-Limit ~4,5 MB)
const STATUS_VOLLSTAENDIG = 'Unterlagen vollständig';
const FRUEH_STATI = ['Unterlagen noch anfordern', 'Unterlagen angefordert', 'Unterlagen unvollständig'];

const slim = (f) => ({
  id: f.id, name: f.name, webViewLink: f.webViewLink,
  punkt: (f.appProperties && f.appProperties.punkt) || '',
  typ: (f.appProperties && f.appProperties.typ) || '',
});

module.exports = async (req, res) => {
  try {
    const token = req.query && req.query.token;
    const payload = token ? verifyUploadToken(token) : null;
    if (!payload || !payload.folderId) {
      return res.status(401).json({ error: 'Link ungültig oder abgelaufen' });
    }

    // Objektunterlagen = zentral (immer aktuell, via WE aufgelöst) + WE-spezifischer
    // Unterordner im Kunden-Ordner (manuelle Ergänzungen). Verlinkung statt Kopie.
    const centralFolderId = payload.weId ? await resolveVerkaufsunterlagenFolder(payload.weId) : '';
    const weSpezFolderId = payload.weSpezifischFolderId || '';

    if (req.method === 'GET') {
      let kundeName = '';
      if (payload.fallId) {
        try {
          const fall = await airtable('get', TABLES.FINANZIERUNGSFALL, { recordId: payload.fallId });
          kundeName = (fall.fields && fall.fields[FINANZIERUNGSFALL_FIELDS.TITEL]) || '';
        } catch { /* Titel optional */ }
      }
      const uploads = (await listFiles(payload.folderId).catch(() => [])).map(slim);
      const objCentral = centralFolderId ? (await listFiles(centralFolderId).catch(() => [])).map(slim) : [];
      const objSpez = weSpezFolderId ? (await listFiles(weSpezFolderId).catch(() => [])).map(slim) : [];
      const objektunterlagen = [...objCentral, ...objSpez];
      return res.status(200).json({ kundeName, checkliste: CHECKLISTE, weitereTypen: WEITERE_TYPEN, uploads, objektunterlagen });
    }

    if (req.method === 'POST') {
      if (!requireSafeOrigin(req, res)) return;
      const body = await readBody(req);
      const origName = (body.name || '').toString().trim();
      const mimeType = (body.mimeType || 'application/octet-stream').toString();
      const dataBase64 = (body.dataBase64 || '').toString();
      const punkt = (body.punkt || '').toString();
      const bezeichnung = (body.bezeichnung || '').toString().trim().slice(0, 100);
      if (!origName || !dataBase64) return res.status(400).json({ error: 'name und dataBase64 erforderlich' });
      const buffer = Buffer.from(dataBase64, 'base64');
      if (!buffer.length) return res.status(400).json({ error: 'Leere Datei' });
      if (buffer.length > MAX_UPLOAD_BYTES) return res.status(413).json({ error: 'Datei zu groß — max. ~4 MB pro Datei.' });

      // Pflicht-Dokument → fester Präfix; sonst freie Beschreibung (weitere Nachweise).
      const def = byKey(punkt);
      const cleanOrig = origName.replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120);
      const prefix = def ? def.file : (bezeichnung || 'Weiterer Nachweis');
      const finalName = (prefix + ' — ' + cleanOrig).slice(0, 200);
      const appProps = { punkt: def ? def.key : 'weitere' };
      if (!def && bezeichnung) appProps.typ = bezeichnung;
      const uploaded = await uploadFile(payload.folderId, finalName, mimeType, buffer, appProps);

      // Vollständigkeit prüfen → Fall-Status hochsetzen (nur aus frühen Stati, nie zurück).
      try {
        if (payload.fallId) {
          const all = await listFiles(payload.folderId).catch(() => []);
          const done = new Set(all.map((f) => f.appProperties && f.appProperties.punkt).filter(Boolean));
          if (PFLICHT.every((k) => done.has(k))) {
            const fall = await airtable('get', TABLES.FINANZIERUNGSFALL, { recordId: payload.fallId });
            const cur = (fall.fields && fall.fields[FINANZIERUNGSFALL_FIELDS.STATUS]) || '';
            const curName = (cur && typeof cur === 'object') ? cur.name : cur;
            if (FRUEH_STATI.includes(curName)) {
              await airtable('update', TABLES.FINANZIERUNGSFALL, {
                recordId: payload.fallId,
                fields: { [FINANZIERUNGSFALL_FIELDS.STATUS]: STATUS_VOLLSTAENDIG },
              });
            }
          }
        }
      } catch (e) { /* Status-Update nicht kritisch */ }

      return res.status(201).json({ ok: true, file: slim(uploaded) });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (e) {
    return sendError(res, e);
  }
};
