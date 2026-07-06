// POST /api/reservierung/view-link — 06.07.2026 (Henry)
//
// Erzeugt einen frischen Ansichts-/Unterschriften-Link auf die Extern-Reservierung
// eines Kunden (public/reservierung.html) — für Owner (intern wie extern) und Admins,
// z.B. um das (unterschriebene) Dokument aus der Kunden-Übersicht heraus zu öffnen
// oder dem Kunden einen neuen Link zu schicken, wenn der alte abgelaufen ist.
// Friert NICHTS neu ein — reiner Token auf den bestehenden Stand in
// kunde.saJson.reservierungExtern.

const jwt = require('jsonwebtoken');
const { verifySession, requireSafeOrigin } = require('../_lib/auth');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const { airtable } = require('../_lib/airtable');
const { TABLES, KUNDEN_FIELDS } = require('../_lib/tables');

module.exports = async (req, res) => {
  if (!requireSafeOrigin(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  try {
    const body = await readBody(req);
    const kundeId = (body.kundeId || '').trim();
    if (!/^rec[A-Za-z0-9]{14}$/.test(kundeId)) return res.status(400).json({ error: 'kundeId fehlt oder ungültig' });

    let kundeRec;
    try {
      kundeRec = await airtable('get', TABLES.KUNDEN, { recordId: kundeId });
    } catch (e) {
      return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }
    const kf = (kundeRec && kundeRec.fields) || {};
    const ownerIds = kf[KUNDEN_FIELDS.OWNER] || [];
    const isOwner = Array.isArray(ownerIds) && ownerIds.includes(session.vertrieblerId);
    if (!isOwner && session.rolle !== 'Admin') {
      return res.status(403).json({ error: 'Dieser Kunde gehört nicht zu Dir' });
    }

    let sa = kf[KUNDEN_FIELDS.SA_JSON];
    if (typeof sa === 'string') { try { sa = JSON.parse(sa); } catch (e) { sa = null; } }
    if (!sa || !sa.reservierungExtern || !sa.reservierungExtern.doc) {
      return res.status(404).json({ error: 'Für diesen Kunden liegt keine Extern-Reservierung vor.' });
    }

    const expiresInSec = 60 * 60 * 24 * 14;
    const token = jwt.sign({ kind: 'reserv-sign', kundeId, generatedBy: session.vertrieblerId }, process.env.JWT_SECRET, { expiresIn: expiresInSec });
    const protoHeader = (req.headers['x-forwarded-proto'] || 'https');
    const rawHost = req.headers['x-forwarded-host'] || req.headers.host || '';
    const ALLOWED_HOSTS = new Set(['bb-brown-pi.vercel.app', 'backstube.bub-immo.de', 'bb.immo-stein.de', 'localhost:3000', 'localhost:5173']);
    const isPreview = /^bb-brown-pi-[a-z0-9-]+\.vercel\.app$/i.test(rawHost);
    const host = (ALLOWED_HOSTS.has(rawHost) || isPreview) ? rawHost : 'backstube.bub-immo.de';
    const url = `${protoHeader}://${host}/reservierung?token=${encodeURIComponent(token)}`;

    return res.status(200).json({ ok: true, url, signiert: !!(sa.reservierungExtern.signiert && sa.reservierungExtern.signiert.am) });
  } catch (e) {
    return sendError(res, e);
  }
};
