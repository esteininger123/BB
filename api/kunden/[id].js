// GET    /api/kunden/:id  — kompletter Kunde
// PUT    /api/kunden/:id  — Kunden aktualisieren (Vertriebler nur eigene, Admin alle)
// DELETE /api/kunden/:id  — Vertriebler: löscht eigene; Admin: NICHT (stattdessen Phase auf Abgebrochen setzen)

const { verifySession, requireAdminVerified, requireSafeOrigin } = require('../_lib/auth');
const { airtable, listAll } = require('../_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const { TABLES, KUNDEN_FIELDS, VERTRIEBLER_FIELDS, SNAPSHOT_FIELDS } = require('../_lib/tables');
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
// QA-Fix 2026-05-23 (Audit-DD-3 — gleicher Pattern-Bug wie Y-B5 in snapshots.js):
// Owner-Array kann verschiedene Shapes haben (IDs, Objekte, Namen). Vorher
// schlug includes() bei {id, name}-Objekten fehl → Vertriebler bekam 403 auf
// EIGENE Kunden. Robuste Normalisierung wie in canAccessKunde der snapshots.js.
function canAccess(session, rec) {
  if (!rec || !rec.fields) return false;
  if (session.rolle === 'Admin') return true;
  const ownersRaw = rec.fields[KUNDEN_FIELDS.OWNER] || [];
  if (!Array.isArray(ownersRaw)) return false;
  const ownerIds = ownersRaw
    .map(o => (o && typeof o === 'object') ? o.id : (typeof o === 'string' && o.startsWith('rec') ? o : null))
    .filter(Boolean);
  return ownerIds.includes(session.vertrieblerId);
}

module.exports = async (req, res) => {
  // QA-Fix 2026-05-23 (Audit-DD-1): CSRF-Schutz vor jeder Mutation (PUT/DELETE).
  if (!requireSafeOrigin(req, res)) return;
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
      // QA-Fix 2026-05-22 (Audit-A E DSGVO-Cascade): vor dem Kunden-Delete alle
      // verlinkten Snapshots löschen — sonst bleiben Waisen-Snapshots mit SA-JSON
      // (Bankguthaben, Verbindlichkeiten, Lohn) in Airtable. DSGVO-relevant beim
      // „Recht-auf-Vergessen-werden"-Antrag.
      let snapshotsCascaded = 0;
      try {
        const allSnaps = await listAll(TABLES.SNAPSHOTS, {
          fields: [SNAPSHOT_FIELDS.KUNDE]
        }, 5000);
        const linked = allSnaps.filter(s => {
          const k = s.fields && s.fields[SNAPSHOT_FIELDS.KUNDE];
          return Array.isArray(k) && k.includes(id);
        });
        for (const s of linked) {
          try { await airtable('delete', TABLES.SNAPSHOTS, { recordId: s.id }); snapshotsCascaded++; }
          catch (e) { /* swallow per-snapshot — Kunde löschen ist Priorität */ }
        }
      } catch (e) {
        // Snapshot-Lade-Fehler nicht-tödlich, aber Edgar in Response melden
        return res.status(500).json({ error: 'Snapshot-Cascade fehlgeschlagen — Kunde NICHT gelöscht', detail: String(e.message || e) });
      }
      await airtable('delete', TABLES.KUNDEN, { recordId: id });
      return res.status(200).json({ ok: true, action: 'deleted', snapshotsCascaded });
    }

    return methodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
  } catch (e) {
    return sendError(res, e);
  }
};
