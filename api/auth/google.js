// POST /api/auth/google
// Body: { token: "google-id-token" }
// Validiert Google-Token, prüft Whitelist in Kalk-Vertriebler, setzt Session-Cookie.

const { verifyGoogleToken, signSession, setSessionCookie } = require('../_lib/auth');
const { airtable, escapeFormulaString } = require('../_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const { TABLES, VERTRIEBLER_FIELDS } = require('../_lib/tables');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const body = await readBody(req);
    const token = body && body.token;
    if (!token) return res.status(400).json({ error: 'token fehlt' });

    const googleUser = await verifyGoogleToken(token);
    if (!googleUser) {
      return res.status(401).json({ error: 'Google-Token ungültig oder abgelaufen' });
    }

    const emailEsc = escapeFormulaString(googleUser.email);
    // Wir filtern auf Email-Feld UND Status=Aktiv. Email-Vergleich case-insensitiv via LOWER().
    const formula = `AND(LOWER({Email})='${emailEsc}', {Status}='Aktiv')`;

    const resp = await airtable('list', TABLES.VERTRIEBLER, {
      filterByFormula: formula,
      maxRecords: 1,
      pageSize: 1
    });

    const records = (resp && resp.records) || [];
    if (records.length === 0) {
      return res.status(403).json({ error: 'Kein Zugriff. Bitte wende dich an einen Admin.' });
    }

    const rec = records[0];
    const f = rec.fields || {};

    const vertriebler = {
      id: rec.id,
      name:    f[VERTRIEBLER_FIELDS.NAME]    || googleUser.name || '',
      email:   f[VERTRIEBLER_FIELDS.EMAIL]   || googleUser.email,
      telefon: f[VERTRIEBLER_FIELDS.TELEFON] || '',
      rolle:   f[VERTRIEBLER_FIELDS.ROLLE]   || 'Vertriebler',
      fotoUrl: f[VERTRIEBLER_FIELDS.FOTO]    || googleUser.picture || ''
    };

    const sessionToken = signSession({
      vertrieblerId: vertriebler.id,
      email: vertriebler.email,
      rolle: vertriebler.rolle
    });

    setSessionCookie(res, sessionToken);
    return res.status(200).json({ ok: true, vertriebler });
  } catch (e) {
    return sendError(res, e);
  }
};
