// POST /api/auth/passwort — 06.07.2026 (Henry)
// Body: { email, passwort }
//
// E-Mail+Passwort-Login zusätzlich zum Google-Login — v.a. für externe
// Vertriebler ohne Google-Konto. Gleiche Whitelist wie Google (Kalk-Vertriebler,
// Status=Aktiv), gleiche Session (signSession + httpOnly-Cookie), gleiche
// Response-Form wie /api/auth/google. Passwort-Hash: api/_lib/passwort.js.
// Fehlermeldung bewusst generisch (kein User-Enumeration-Leak).

const { signSession, setSessionCookie, requireSafeOrigin } = require('../_lib/auth');
const { verifyPasswort } = require('../_lib/passwort');
const { clampProvision } = require('../_lib/extern');
const { airtable, escapeFormulaString } = require('../_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const { TABLES, VERTRIEBLER_FIELDS } = require('../_lib/tables');

const FEHLER_GENERISCH = 'E-Mail oder Passwort falsch — oder für diesen Zugang ist kein Passwort hinterlegt.';

module.exports = async (req, res) => {
  if (!requireSafeOrigin(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const body = await readBody(req);
    const email = String((body && body.email) || '').toLowerCase().trim();
    const passwort = String((body && body.passwort) || '');
    if (!email || !passwort) return res.status(400).json({ error: 'E-Mail und Passwort angeben' });

    const emailEsc = escapeFormulaString(email);
    const formula = `AND(LOWER({Email})='${emailEsc}', {Status}='Aktiv')`;
    const resp = await airtable('list', TABLES.VERTRIEBLER, {
      filterByFormula: formula,
      maxRecords: 1,
      pageSize: 1,
    });
    const rec = ((resp && resp.records) || [])[0];
    const f = (rec && rec.fields) || {};
    const hash = f[VERTRIEBLER_FIELDS.PASSWORT_HASH];

    // verifyPasswort ist bei fehlendem Hash sofort false — Antwort bleibt generisch.
    if (!rec || !verifyPasswort(passwort, hash)) {
      // kleine konstante Bremse gegen Brute-Force-Schleifen
      await new Promise(r => setTimeout(r, 400));
      return res.status(401).json({ error: FEHLER_GENERISCH });
    }

    const vertriebler = {
      id: rec.id,
      name:    f[VERTRIEBLER_FIELDS.NAME]    || '',
      email:   f[VERTRIEBLER_FIELDS.EMAIL]   || email,
      telefon: f[VERTRIEBLER_FIELDS.TELEFON] || '',
      rolle:   f[VERTRIEBLER_FIELDS.ROLLE]   || 'Vertriebler',
      fotoUrl: f[VERTRIEBLER_FIELDS.FOTO]    || '',
      provisionPct: clampProvision(f[VERTRIEBLER_FIELDS.PROVISION_EXTERN]),
    };
    const sessionToken = signSession({
      vertrieblerId: vertriebler.id,
      email: vertriebler.email,
      rolle: vertriebler.rolle,
    });
    setSessionCookie(res, sessionToken);
    return res.status(200).json({ ok: true, vertriebler });
  } catch (e) {
    return sendError(res, e);
  }
};
