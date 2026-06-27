// GET /api/hubspot/contacts?q=...  — sucht Kontakte in HubSpot für "Import on demand".
// Nur lesend, nur eingeloggte Vertriebler. Token via HUBSPOT_TOKEN (Service-Key/Legacy-pat).
// Antwort: [{ id, vorname, nachname, email, telefon, rawName }] — wird im "Neuer Kunde"-
// Modal vorausgefüllt, der Vertriebler prüft + speichert über POST /api/kunden.

const { verifySession, isExtern } = require('../_lib/auth');
const { methodNotAllowed, sendError } = require('../_lib/http');
const { searchContacts } = require('../_lib/hubspot');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  // Externe Vertriebler dürfen keine HubSpot-Leads suchen/übernehmen (2026-06-27).
  // Backend-Sperre ist die echte Grenze — das Frontend blendet das Suchfeld nur zusätzlich aus.
  if (isExtern(session)) {
    return res.status(403).json({ error: 'Kein HubSpot-Zugriff für externe Vertriebler.', code: 'HUBSPOT_FORBIDDEN_EXTERN' });
  }

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    // Kein Crash, klare Meldung — Pattern wie api/assistent.js bei fehlendem Key.
    return res.status(503).json({
      error: 'HubSpot ist nicht verbunden (HUBSPOT_TOKEN fehlt in den Environment-Variablen).',
      code: 'HUBSPOT_NOT_CONFIGURED',
    });
  }

  try {
    const q = (req.query && (req.query.q || req.query.query)) || '';
    const contacts = await searchContacts(token, q, 8);
    return res.status(200).json(contacts);
  } catch (e) {
    return sendError(res, e);
  }
};
