// GET  /api/sa-portal/[token] → Kunden-Basis + saJson zurück
// PUT  /api/sa-portal/[token] → saJson speichern + Aktivitäts-Log
//
// Kein Vertriebler-Login nötig — Auth über das Token in der URL.
// Token-Payload: { kind: 'sa-portal', kundeId, generatedBy, exp }
// Nur Read+Write auf das eine Kunden-Record + saJson-Feld.

const jwt = require('jsonwebtoken');
const { airtable } = require('../_lib/airtable');
const { TABLES, KUNDEN_FIELDS } = require('../_lib/tables');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const { appendActivityZeile } = require('../_lib/notizen');

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET nicht gesetzt');
  return s;
}

function verifyPortalToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(String(token), getJwtSecret(), { algorithms: ['HS256'] });
    if (!decoded || decoded.kind !== 'sa-portal' || !decoded.kundeId) return null;
    return decoded;
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  // Token aus URL-Param holen
  const token = (req.query && req.query.token) || '';
  const decoded = verifyPortalToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Link ungültig oder abgelaufen' });
  }
  const kundeId = decoded.kundeId;

  try {
    if (req.method === 'GET') {
      // Kunden-Daten holen
      let rec;
      try {
        rec = await airtable('get', TABLES.KUNDEN, { recordId: kundeId });
      } catch (e) {
        return res.status(404).json({ error: 'Kunde nicht gefunden' });
      }
      const f = rec.fields || {};

      // Nur die nötigen Felder zurück — KEIN owner, ownerId, notizen etc.
      // (Datenminimierung — Kunde soll keinen Backoffice-Datenzugang bekommen)
      const saJsonRaw = f[KUNDEN_FIELDS.SA_JSON];
      let saJson = null;
      if (saJsonRaw) {
        try { saJson = JSON.parse(saJsonRaw); } catch {}
      }
      return res.status(200).json({
        kundeId,
        vorname: f[KUNDEN_FIELDS.VORNAME] || '',
        nachname: f[KUNDEN_FIELDS.NACHNAME] || '',
        email: f[KUNDEN_FIELDS.EMAIL] || '',
        saJson,
      });
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      // Nur saJson akzeptieren — alle anderen Felder ignorieren
      if (typeof body.saJson !== 'object' && body.saJson !== null) {
        return res.status(400).json({ error: 'saJson muss ein Object sein' });
      }
      // Größenbegrenzung: typische SA ~30 KB, Notbremse bei 200 KB
      const saStr = JSON.stringify(body.saJson || {});
      if (saStr.length > 200000) {
        return res.status(413).json({ error: 'saJson zu groß (max 200 KB)' });
      }

      await airtable('update', TABLES.KUNDEN, {
        recordId: kundeId,
        fields: {
          [KUNDEN_FIELDS.SA_JSON]: saStr,
          [KUNDEN_FIELDS.LAST_ACTIVITY]: new Date().toISOString(),
        }
      });

      // Aktivitäts-Log via gemeinsamer Helper-Lib (FS-1 24.05.):
      // Re-Read + Block-aware Insert + 100-Zeilen-Cutoff. Nicht-blocking —
      // wenn Append fehlschlägt, ist der SA-Save trotzdem durch.
      try {
        const stempel = new Date().toISOString().substring(0, 16).replace('T', ' ');
        const zeile = `[${stempel}] Selbstauskunft vom Kunden über Portal-Link aktualisiert`;
        await appendActivityZeile(kundeId, zeile);
      } catch (e) {
        console.warn('[sa-portal] Aktivitäts-Log fehlgeschlagen:', e && e.message);
      }

      return res.status(200).json({ ok: true });
    }

    return methodNotAllowed(res, ['GET', 'PUT']);
  } catch (e) {
    return sendError(res, e);
  }
};
