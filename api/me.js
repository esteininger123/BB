// GET /api/me
// Returns Vertriebler-Profil des eingeloggten Users.

const { verifySession } = require('./_lib/auth');
const { airtable } = require('./_lib/airtable');
const { methodNotAllowed, sendError } = require('./_lib/http');
const { TABLES, VERTRIEBLER_FIELDS } = require('./_lib/tables');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  try {
    const rec = await airtable('get', TABLES.VERTRIEBLER, { recordId: session.vertrieblerId });
    if (!rec || !rec.id) return res.status(404).json({ error: 'Vertriebler nicht gefunden' });
    const f = rec.fields || {};
    return res.status(200).json({
      id: rec.id,
      name:    f[VERTRIEBLER_FIELDS.NAME]    || '',
      email:   f[VERTRIEBLER_FIELDS.EMAIL]   || session.email,
      telefon: f[VERTRIEBLER_FIELDS.TELEFON] || '',
      rolle:   f[VERTRIEBLER_FIELDS.ROLLE]   || session.rolle || 'Vertriebler',
      fotoUrl: f[VERTRIEBLER_FIELDS.FOTO]    || '',
      status:  f[VERTRIEBLER_FIELDS.STATUS]  || ''
    });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: 'Vertriebler nicht gefunden' });
    return sendError(res, e);
  }
};
