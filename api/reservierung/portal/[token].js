// GET/POST /api/reservierung/portal/[token] — 06.07.2026 (Henry)
//
// Kundenseitiger Zugriff auf die Extern-Reservierung (public/reservierung.html),
// authentifiziert AUSSCHLIESSLICH über das URL-Token (kind 'reserv-sign',
// erzeugt von api/reservierung/extern-link.js). Kein Session-Cookie.
//
//   GET  → eingefrorenes Dokument (kunde.saJson.reservierungExtern) + Signatur-Status.
//          Datenminimierung: keine E-Mail, keine Notizen, kein Owner.
//   POST → { signaturPng } — Unterschrift des Kunden (Canvas-PNG als data-URL).
//          Einmalig; danach 409. Schreibt Aktivitäts-Zeile am Kunden.

const jwt = require('jsonwebtoken');
const { readBody, methodNotAllowed, sendError } = require('../../_lib/http');
const { airtable } = require('../../_lib/airtable');
const { appendActivityZeile } = require('../../_lib/notizen');
const { TABLES, KUNDEN_FIELDS } = require('../../_lib/tables');

const MAX_SIG_CHARS = 300000; // ~220 KB base64 — Canvas-PNGs liegen bei 5-30 KB

function verifyToken(raw) {
  try {
    const decoded = jwt.verify(raw, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded || decoded.kind !== 'reserv-sign' || !decoded.kundeId) return null;
    return decoded;
  } catch (e) {
    return null;
  }
}

function parseSa(raw) {
  let sa = raw;
  if (typeof sa === 'string') { try { sa = JSON.parse(sa); } catch (e) { sa = null; } }
  return (sa && typeof sa === 'object') ? sa : null;
}

module.exports = async (req, res) => {
  const token = req.query && req.query.token;
  const decoded = token ? verifyToken(token) : null;
  if (!decoded) return res.status(401).json({ error: 'Link ungültig oder abgelaufen. Bitte beim Berater einen neuen Link anfordern.' });

  try {
    const kundeRec = await airtable('get', TABLES.KUNDEN, { recordId: decoded.kundeId });
    const kf = (kundeRec && kundeRec.fields) || {};
    const sa = parseSa(kf[KUNDEN_FIELDS.SA_JSON]);
    const rv = sa && sa.reservierungExtern;
    if (!rv || !rv.doc) return res.status(404).json({ error: 'Für diesen Link liegt keine Reservierung vor.' });

    if (req.method === 'GET') {
      return res.status(200).json({
        kaeufer: rv.kaeufer || '',
        adresse: rv.adresse || {},
        vertrieblerName: rv.vertrieblerName || '',
        reservBis: rv.reservBis || '',
        erstelltAm: rv.erstelltAm || '',
        doc: rv.doc,
        signiert: rv.signiert ? { am: rv.signiert.am, ort: rv.signiert.ort || '', png: rv.signiert.png || '' } : null,
      });
    }

    if (req.method === 'POST') {
      if (rv.signiert && rv.signiert.am) {
        return res.status(409).json({ error: 'Diese Reservierung wurde bereits unterschrieben.' });
      }
      const body = await readBody(req);
      const png = (body && body.signaturPng) || '';
      if (typeof png !== 'string' || !png.startsWith('data:image/png;base64,') || png.length < 500) {
        return res.status(400).json({ error: 'Unterschrift fehlt — bitte im Feld unterschreiben.' });
      }
      if (png.length > MAX_SIG_CHARS) {
        return res.status(400).json({ error: 'Unterschrift zu groß — bitte erneut versuchen.' });
      }
      rv.signiert = {
        am: new Date().toISOString(),
        png,
        ua: String(req.headers['user-agent'] || '').slice(0, 200),
      };
      sa.reservierungExtern = rv;
      await airtable('update', TABLES.KUNDEN, {
        recordId: decoded.kundeId,
        fields: {
          [KUNDEN_FIELDS.SA_JSON]: JSON.stringify(sa),
          [KUNDEN_FIELDS.LAST_ACTIVITY]: new Date().toISOString(),
        },
      });
      try {
        const stamp = new Date().toISOString().substring(0, 16).replace('T', ' ');
        await appendActivityZeile(decoded.kundeId, `[${stamp}] ✍️ Reservierung DIGITAL UNTERSCHRIEBEN (Extern-Link) — WE ${rv.doc.weNr || rv.weId || ''}, Gesamtkaufpreis ${(rv.doc.kpGesamt || 0).toLocaleString('de-DE')} € — bitte Kurz-SA prüfen (12-h-Vorbehalt)`);
      } catch (err) { /* nicht-blockierend */ }
      return res.status(200).json({ ok: true, am: rv.signiert.am });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (e) {
    if (e && e.status === 404) return res.status(404).json({ error: 'Kunde nicht gefunden' });
    return sendError(res, e);
  }
};
