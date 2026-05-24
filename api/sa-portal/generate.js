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

    // FS-3k (Audit SA P1 25.05.2026): vorher nur ownerIds[0] — bei Multi-Owner
    // (Edgar + Henry auf einem Kunden) kriegt der Co-Owner sonst 403. Pattern
    // analog zu kunden.canAccess.
    const ownerIds = (kundeRec.fields && kundeRec.fields[KUNDEN_FIELDS.OWNER]) || [];
    const isOwner = Array.isArray(ownerIds) && ownerIds.includes(session.vertrieblerId);
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

    // FS-3k (Audit SA P3 25.05.2026): Host gegen Allowlist prüfen. Vorher
    // konnte ein attacker via Host-Header-Injection eigene Domain in den
    // Magic-Link einschleusen → Token leaked beim Anklicken zu attacker-host
    // (Referer-Leak). Allowed-Hosts deckt Production + neue Subdomain ab.
    const protoHeader = (req.headers['x-forwarded-proto'] || 'https');
    const rawHost = req.headers['x-forwarded-host'] || req.headers.host || '';
    const ALLOWED_HOSTS = new Set([
      'bb-brown-pi.vercel.app',
      'backstube.bub-immo.de',
      'bb.immo-stein.de',
      'localhost:3000',
      'localhost:5173',
    ]);
    // Vercel-Preview-Pattern: bb-brown-pi-git-xxx.vercel.app
    const isPreview = /^bb-brown-pi-[a-z0-9-]+\.vercel\.app$/i.test(rawHost);
    const host = (ALLOWED_HOSTS.has(rawHost) || isPreview) ? rawHost : 'bb-brown-pi.vercel.app';
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
