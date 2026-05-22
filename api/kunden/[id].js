// GET    /api/kunden/:id  — kompletter Kunde
// PUT    /api/kunden/:id  — Kunden aktualisieren (Vertriebler nur eigene, Admin alle)
// DELETE /api/kunden/:id  — Vertriebler: löscht eigene; Admin: NICHT (stattdessen Phase auf Abgebrochen setzen)

const { verifySession, requireAdminVerified } = require('../_lib/auth');
const { airtable, listAll } = require('../_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const { TABLES, KUNDEN_FIELDS, VERTRIEBLER_FIELDS } = require('../_lib/tables');
const { kundeRecordToFull, kundeBodyToFields } = require('../_lib/mappers');

async function getOwnerNameMap() {
  try {
    const records = await listAll(TABLES.VERTRIEBLER, {
      fields: [VERTRIEBLER_FIELDS.NAME]
    }, 500);
    const map = {};
    records.forEach(r => {
      map[r.id] = (r.fields && r.fields[VERTRIEBLER_FIELDS.NAME]) || '';
    });
    return map;
  } catch {
    return {};
  }
}

// Checkt: Darf session auf rec zugreifen? Owner-Check + Admin-Ausnahme.
function canAccess(session, rec) {
  if (!rec || !rec.fields) return false;
  if (session.rolle === 'Admin') return true;
  const ownerIds = rec.fields[KUNDEN_FIELDS.OWNER] || [];
  return Array.isArray(ownerIds) && ownerIds.includes(session.vertrieblerId);
}

module.exports = async (req, res) => {
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const id = req.query && req.query.id;
  if (!id) return res.status(400).json({ error: 'id fehlt' });

  try {
    if (req.method === 'GET') {
      let rec;
      try { rec = await airtable('get', TABLES.KUNDEN, { recordId: id }); }
      catch (e) {
        if (e.status === 404) return res.status(404).json({ error: 'Kunde nicht gefunden' });
        throw e;
      }
      if (!canAccess(session, rec)) return res.status(403).json({ error: 'Kein Zugriff auf diesen Kunden' });
      const ownerMap = await getOwnerNameMap();
      return res.status(200).json(kundeRecordToFull(rec, ownerMap));
    }

    if (req.method === 'PUT') {
      let rec;
      try { rec = await airtable('get', TABLES.KUNDEN, { recordId: id }); }
      catch (e) {
        if (e.status === 404) return res.status(404).json({ error: 'Kunde nicht gefunden' });
        throw e;
      }
      if (!canAccess(session, rec)) return res.status(403).json({ error: 'Kein Zugriff auf diesen Kunden' });

      const body = await readBody(req);
      const fields = kundeBodyToFields(body, { touchLastActivity: true });
      // Owner-Wechsel nur Admin (und nur wenn explizit body.ownerId mitgegeben)
      if (body.ownerId && session.rolle === 'Admin') {
        fields[KUNDEN_FIELDS.OWNER] = [body.ownerId];
      }
      const updated = await airtable('update', TABLES.KUNDEN, { recordId: id, fields });
      const ownerMap = await getOwnerNameMap();
      return res.status(200).json({ ok: true, kunde: kundeRecordToFull(updated, ownerMap) });
    }

    if (req.method === 'DELETE') {
      // Iter 52: NUR Admin darf endgültig löschen. Vertriebler bekommt 403 mit Hinweis
      // auf Archivieren (Endpoint: PUT mit archiviert=true).
      if (session.rolle !== 'Admin') {
        return res.status(403).json({
          error: 'Vertrieb darf nicht löschen — bitte archivieren statt löschen.',
          hint: 'Nutze den Archivieren-Button. Admin kann den Kunden später endgültig löschen.'
        });
      }
      // QA-Fix 2026-05-22 (Audit-D B2): DB-Recheck vor harter Lösch-Operation —
      // forged JWT mit rolle: "Admin" wird hier gefangen.
      const verified = await requireAdminVerified(req, res);
      if (!verified) return;
      let rec;
      try { rec = await airtable('get', TABLES.KUNDEN, { recordId: id }); }
      catch (e) {
        if (e.status === 404) return res.status(404).json({ error: 'Kunde nicht gefunden' });
        throw e;
      }
      await airtable('delete', TABLES.KUNDEN, { recordId: id });
      return res.status(200).json({ ok: true, action: 'deleted' });
    }

    return methodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
  } catch (e) {
    return sendError(res, e);
  }
};
