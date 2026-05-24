// POST /api/sa-portal/generate
//
// Vertriebler ruft auf mit { kundeId } → bekommt zurück { url, expiresAt }.
// Erzeugt einen 14-Tage-JWT mit kundeId im Payload (kind: 'sa-portal').
// Kunde öffnet die URL, sieht eine vereinfachte SA-Maske, kann selbst ausfüllen
// und absenden. Der Vertriebler spart 20-30 Min Tipp-Arbeit pro Kunde.

const jwt = require('jsonwebtoken');
const { verifySession, requireSafeOrigin } = require('../_lib/auth');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const { airtable } = require('../_lib/airtable');
const { TABLES, KUNDEN_FIELDS } = require('../_lib/tables');

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET nicht gesetzt');
  return s;
}

module.exports = async (req, res) => {
  if (!requireSafeOrigin(req, res)) return;
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const body = await readBody(req);
    const kundeId = (body.kundeId || '').trim();
    if (!kundeId || !/^rec[A-Za-z0-9]{14}$/.test(kundeId)) {
      return res.status(400).json({ error: 'kundeId fehlt oder ungültig' });
    }

    // Sicherheits-Check: existiert der Kunde + gehört dem Vertriebler (oder Admin)?
    let kundeRec;
    try {
      kundeRec = await airtable('get', TABLES.KUNDEN, { recordId: kundeId });
    } catch (e) {
      return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }
    if (!kundeRec) return res.status(404).json({ error: 'Kunde nicht gefunden' });

    const ownerIds = (kundeRec.fields && kundeRec.fields[KUNDEN_FIELDS.OWNER]) || [];
    const ownerId = Array.isArray(ownerIds) ? ownerIds[0] : null;
    const isOwner = ownerId === session.vertrieblerId;
    const isAdmin = session.rolle === 'Admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Dieser Kunde gehört nicht zu Dir' });
    }

    // 14-Tage-JWT mit kundeId
    const expiresInSec = 60 * 60 * 24 * 14;
    const token = jwt.sign(
      { kind: 'sa-portal', kundeId, generatedBy: session.vertrieblerId },
      getJwtSecret(),
      { expiresIn: expiresInSec }
    );
    const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

    // Origin aus Header rauslesen für die Link-URL
    const protoHeader = (req.headers['x-forwarded-proto'] || 'https');
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'bb-brown-pi.vercel.app';
    const url = `${protoHeader}://${host}/sa-portal.html?token=${encodeURIComponent(token)}`;

    return res.status(200).json({
      url,
      token,
      expiresAt,
      kundeId,
      kundeName: (kundeRec.fields && kundeRec.fields[KUNDEN_FIELDS.NAME]) || '',
    });
  } catch (e) {
    return sendError(res, e);
  }
};
