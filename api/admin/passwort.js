// POST /api/admin/passwort — 06.07.2026 (Henry)
// Body: { vertrieblerId, passwort }
//
// Admin setzt/überschreibt das Login-Passwort eines Vertrieblers (v.a. für
// externe ohne Google-Konto — Admin gibt das Passwort dann telefonisch/per
// Mail weiter; der Nutzer kann es danach selbst ändern via PATCH /api/me).
// requireAdminVerified = DB-Recheck gegen Airtable (mutierender Admin-Endpoint).
// 04.11.2026 (Henry): zusätzlich für Extern-KONTROLLZUGÄNGE (Dominik Seitz) erlaubt — die dürfen
// Vertrieblern/Externen ein Passwort setzen, aber keinem Admin (darfPasswortSetzen in _lib/auth.js).

const { requireLoginVerwaltungVerified, darfPasswortSetzen, requireSafeOrigin } = require('../_lib/auth');
const { hashPasswort, passwortRegelFehler } = require('../_lib/passwort');
const { airtable } = require('../_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const { TABLES, VERTRIEBLER_FIELDS } = require('../_lib/tables');

module.exports = async (req, res) => {
  if (!requireSafeOrigin(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const session = await requireLoginVerwaltungVerified(req, res);
  if (!session) return;

  try {
    const body = await readBody(req);
    const vertrieblerId = String((body && body.vertrieblerId) || '').trim();
    const passwort = String((body && body.passwort) || '');
    if (!/^rec[A-Za-z0-9]{14}$/.test(vertrieblerId)) return res.status(400).json({ error: 'vertrieblerId fehlt oder ungültig' });
    const regelFehler = passwortRegelFehler(passwort);
    if (regelFehler) return res.status(400).json({ error: regelFehler });

    const rec = await airtable('get', TABLES.VERTRIEBLER, { recordId: vertrieblerId }).catch(() => null);
    if (!rec) return res.status(404).json({ error: 'Vertriebler nicht gefunden' });
    const zielRolleRaw = (rec.fields || {})[VERTRIEBLER_FIELDS.ROLLE];
    const zielRolle = (zielRolleRaw && typeof zielRolleRaw === 'object') ? (zielRolleRaw.name || '') : (zielRolleRaw || '');
    if (!darfPasswortSetzen(session, zielRolle)) return res.status(403).json({ error: 'Für diesen Zugang darfst Du kein Passwort setzen' });

    await airtable('update', TABLES.VERTRIEBLER, {
      recordId: vertrieblerId,
      fields: { [VERTRIEBLER_FIELDS.PASSWORT_HASH]: hashPasswort(passwort) },
    });
    return res.status(200).json({ ok: true, name: (rec.fields && rec.fields[VERTRIEBLER_FIELDS.NAME]) || '' });
  } catch (e) {
    return sendError(res, e);
  }
};
