// GET   /api/me — Vertriebler-Profil des eingeloggten Users.
// PATCH /api/me — 06.07.2026 (Henry): Externe pflegen hier ihren Provisionssatz
//                 (0–7 %, Dezimalwert). Nur das eigene Record, nur Rolle 'Extern'.

const { verifySession, requireSafeOrigin, isExtern } = require('./_lib/auth');
const { clampProvision, PROVISION_MAX } = require('./_lib/extern');
const { airtable } = require('./_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('./_lib/http');
const { TABLES, VERTRIEBLER_FIELDS } = require('./_lib/tables');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'PATCH') return methodNotAllowed(res, ['GET', 'PATCH']);
  // CSRF-Schutz für den mutierenden Pfad (GET ist bei requireSafeOrigin immer erlaubt).
  if (!requireSafeOrigin(req, res)) return;

  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  try {
    if (req.method === 'PATCH') {
      // Nur Externe haben einen Provisionssatz — für alle anderen ist der Endpoint gesperrt.
      if (!isExtern(session)) {
        return res.status(403).json({ error: 'Provisionssatz gibt es nur für externe Vertriebler.' });
      }
      const body = await readBody(req);
      const raw = body && body.provisionPct;
      const n = typeof raw === 'number' ? raw : parseFloat(raw);
      if (!isFinite(n) || n < 0 || n > PROVISION_MAX + 1e-9) {
        return res.status(400).json({ error: `provisionPct muss zwischen 0 und ${PROVISION_MAX} (= ${PROVISION_MAX * 100} %) liegen.` });
      }
      const pct = clampProvision(n);
      await airtable('update', TABLES.VERTRIEBLER, {
        recordId: session.vertrieblerId,
        fields: { [VERTRIEBLER_FIELDS.PROVISION_EXTERN]: pct },
      });
      return res.status(200).json({ ok: true, provisionPct: pct });
    }

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
      status:  f[VERTRIEBLER_FIELDS.STATUS]  || '',
      // 06.07.2026 — Provisionssatz (nur für Extern relevant, sonst 0).
      provisionPct: clampProvision(f[VERTRIEBLER_FIELDS.PROVISION_EXTERN]),
    });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: 'Vertriebler nicht gefunden' });
    return sendError(res, e);
  }
};
