// GET /api/admin/vertriebler — 04.11.2026 (Henry)
// Liste der Login-Zugänge für die Verwaltung „Passwort setzen".
// Erlaubt für Admins UND für Extern-Kontrollzugänge (z. B. Dominik Seitz): Kontroll-Accounts
// legen neue Vertriebler in Airtable an und sollen ihnen hier ein Passwort geben können.
// Kontroll-Accounts sehen KEINE Admin-Zugänge (die können sie auch nicht ändern).
// Antwort: [{ id, name, email, rolle, status, hatPasswort }] — nie der Hash.

const { requireLoginVerwaltungVerified, darfPasswortSetzen } = require('../_lib/auth');
const { listAll } = require('../_lib/airtable');
const { methodNotAllowed, sendError } = require('../_lib/http');
const { TABLES, VERTRIEBLER_FIELDS } = require('../_lib/tables');

const selName = (v) => (v && typeof v === 'object') ? (v.name || '') : (v || '');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const session = await requireLoginVerwaltungVerified(req, res);
  if (!session) return;
  try {
    const recs = await listAll(TABLES.VERTRIEBLER, {
      fields: [VERTRIEBLER_FIELDS.NAME, VERTRIEBLER_FIELDS.EMAIL, VERTRIEBLER_FIELDS.ROLLE, VERTRIEBLER_FIELDS.STATUS, VERTRIEBLER_FIELDS.PASSWORT_HASH],
    });
    const liste = recs
      .map(r => {
        const f = r.fields || {};
        return {
          id: r.id,
          name: f[VERTRIEBLER_FIELDS.NAME] || '',
          email: f[VERTRIEBLER_FIELDS.EMAIL] || '',
          rolle: selName(f[VERTRIEBLER_FIELDS.ROLLE]) || 'Vertriebler',
          status: selName(f[VERTRIEBLER_FIELDS.STATUS]) || '',
          hatPasswort: !!f[VERTRIEBLER_FIELDS.PASSWORT_HASH],
        };
      })
      .filter(v => darfPasswortSetzen(session, v.rolle))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return res.status(200).json(liste);
  } catch (e) {
    return sendError(res, e);
  }
};
