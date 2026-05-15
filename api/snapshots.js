// GET  /api/snapshots?kundeId=xxx — Snapshots zu einem Kunden listen
// POST /api/snapshots             — neuen Snapshot anlegen

const { verifySession } = require('./_lib/auth');
const { airtable, listAll } = require('./_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('./_lib/http');
const { TABLES, SNAPSHOT_FIELDS, KUNDEN_FIELDS } = require('./_lib/tables');
const { snapshotRecordToApi, snapshotBodyToFields } = require('./_lib/mappers');

// Checkt Owner-Zugriff auf den Kunden für die Snapshot-Sicht.
async function canAccessKunde(session, kundeId) {
  if (!kundeId) return false;
  if (session.rolle === 'Admin') return true;
  try {
    const rec = await airtable('get', TABLES.KUNDEN, { recordId: kundeId });
    const owners = (rec.fields && rec.fields[KUNDEN_FIELDS.OWNER]) || [];
    return Array.isArray(owners) && owners.includes(session.vertrieblerId);
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  try {
    if (req.method === 'GET') {
      const kundeId = req.query && req.query.kundeId;
      if (!kundeId) return res.status(400).json({ error: 'kundeId erforderlich' });

      const allowed = await canAccessKunde(session, kundeId);
      if (!allowed) return res.status(403).json({ error: 'Kein Zugriff auf diesen Kunden' });

      const formula = `FIND('${kundeId}', ARRAYJOIN({Kunde}))>0`;
      // Sort NICHT im Airtable-Request — das `Created`-Feld ist im Datensatz oft leer.
      // Stattdessen nach dem Laden im Code via r.createdTime sortieren (Airtable Auto-Property).
      const params = { filterByFormula: formula };
      const records = await listAll(TABLES.SNAPSHOTS, params, 500);
      // Auto-Created-Time aus Record-Level mitgeben (Fallback). Sortierung: neueste zuerst.
      const mapped = records.map(r => {
        const out = snapshotRecordToApi(r);
        if (!out.created) out.created = r.createdTime || null;
        return out;
      });
      mapped.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      return res.status(200).json(mapped);
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body.kundeId) return res.status(400).json({ error: 'kundeId fehlt' });

      const allowed = await canAccessKunde(session, body.kundeId);
      if (!allowed) return res.status(403).json({ error: 'Kein Zugriff auf diesen Kunden' });

      const fields = snapshotBodyToFields(body, { erstelltVon: session.vertrieblerId });
      const created = await airtable('create', TABLES.SNAPSHOTS, { fields });

      // Letzte-Aktivität auf Kunden mit-touchen
      try {
        await airtable('update', TABLES.KUNDEN, {
          recordId: body.kundeId,
          fields: { [KUNDEN_FIELDS.LAST_ACTIVITY]: new Date().toISOString() }
        });
      } catch { /* nicht kritisch */ }

      return res.status(201).json(snapshotRecordToApi(created));
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (e) {
    return sendError(res, e);
  }
};
