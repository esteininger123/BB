// GET    /api/snapshots?kundeId=xxx          — Snapshots zu einem Kunden listen
// POST   /api/snapshots                      — neuen Snapshot anlegen
// PATCH  /api/snapshots  body:{id,bezeichnung} — Bezeichnung umbenennen
// DELETE /api/snapshots?id=xxx               — Snapshot löschen (irreversibel)
//
// Berechtigung: Wer den Kunden bedienen darf (Owner oder Admin), darf auch
// dessen Snapshots umbenennen und löschen.

const { verifySession, requireSafeOrigin } = require('./_lib/auth');
const { airtable, listAll } = require('./_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('./_lib/http');
const { TABLES, SNAPSHOT_FIELDS, KUNDEN_FIELDS } = require('./_lib/tables');
const { snapshotRecordToApi, snapshotBodyToFields } = require('./_lib/mappers');

// Checkt Owner-Zugriff auf den Kunden für die Snapshot-Sicht.
// QA-Fix 2026-05-23 (Audit-Y-B5): Owner-Array kann verschiedene Formen haben:
//   - ['recABC123']                              (Linked-Record-IDs, normaler Fall)
//   - [{ id: 'recABC123', name: 'Edgar' }]       (People-Field oder erweitertes Linked-Record)
//   - ['Edgar Steininger']                       (Lookup auf Name — wenn Schema mal umgestellt wird)
// Vorher: `.includes(session.vertrieblerId)` matched nur exakt String → flatten unklar.
// Jetzt: normalisieren zu IDs + Namen, gegen beides matchen.
async function canAccessKunde(session, kundeId) {
  if (!kundeId) return false;
  if (session.rolle === 'Admin') return true;
  try {
    const rec = await airtable('get', TABLES.KUNDEN, { recordId: kundeId });
    const ownersRaw = (rec.fields && rec.fields[KUNDEN_FIELDS.OWNER]) || [];
    if (!Array.isArray(ownersRaw)) return false;
    const ownerIds = ownersRaw
      .map(o => (o && typeof o === 'object') ? o.id : (typeof o === 'string' && o.startsWith('rec') ? o : null))
      .filter(Boolean);
    if (ownerIds.includes(session.vertrieblerId)) return true;
    // Name-Fallback (falls Schema mal nur Namen liefert)
    const ownerNames = ownersRaw
      .map(o => (o && typeof o === 'object') ? (o.name || o.email || '') : (typeof o === 'string' ? o : ''))
      .filter(s => s && !s.startsWith('rec'));
    if (ownerNames.length > 0) {
      try {
        const { VERTRIEBLER_FIELDS } = require('./_lib/tables');
        const vRec = await airtable('get', TABLES.VERTRIEBLER, { recordId: session.vertrieblerId });
        const myName = (vRec && vRec.fields && vRec.fields[VERTRIEBLER_FIELDS.NAME]) || '';
        if (myName && ownerNames.includes(myName)) return true;
      } catch {}
    }
    return false;
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  // QA-Fix 2026-05-23 (Audit-DD-1): CSRF-Schutz vor jeder Mutation (POST/PATCH/DELETE).
  if (!requireSafeOrigin(req, res)) return;
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  try {
    if (req.method === 'GET') {
      const kundeId = req.query && req.query.kundeId;
      if (!kundeId) return res.status(400).json({ error: 'kundeId erforderlich' });

      const allowed = await canAccessKunde(session, kundeId);
      if (!allowed) return res.status(403).json({ error: 'Kein Zugriff auf diesen Kunden' });

      // Wichtig: ARRAYJOIN({Kunde}) liefert den NAMEN des Linked-Records (z.B. "Toni Bader"),
      // NICHT die Record-ID. Filtern via filterByFormula auf Record-ID schlägt daher fehl.
      // Lösung: alle Snapshots laden und im Code per Record-ID filtern.
      const allRecords = await listAll(TABLES.SNAPSHOTS, {}, 5000);
      const mapped = allRecords
        .map(r => {
          const out = snapshotRecordToApi(r);
          if (!out.created) out.created = r.createdTime || null;
          return out;
        })
        .filter(s => s.kundeId === kundeId);
      mapped.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      return res.status(200).json(mapped);
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body.kundeId) return res.status(400).json({ error: 'kundeId fehlt' });

      const allowed = await canAccessKunde(session, body.kundeId);
      if (!allowed) return res.status(403).json({ error: 'Kein Zugriff auf diesen Kunden' });

      // QA-Fix 2026-05-23 (Audit B-12): Airtable-Long-Text-Limit ist 100k
      // Zeichen. Vor dem Write prüfen, damit User klare Fehlermeldung sieht
      // statt generisches Airtable 422.
      const kalkStr = body.kalkJson ? JSON.stringify(body.kalkJson) : '';
      if (kalkStr.length > 95000) {
        return res.status(413).json({
          error: 'Snapshot zu groß',
          hint: `Kalk-Daten sind ${Math.round(kalkStr.length / 1024)} kB groß, Limit liegt bei 95 kB. Bitte z.B. Sondertilgungen / Notizen kürzen.`,
        });
      }

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

    // --- PATCH: Bezeichnung ändern ---
    // Erlaubt User, die Bezeichnung eines Snapshots umzubenennen, ohne den Inhalt anzufassen.
    // Body: { id, bezeichnung }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const id = body && body.id;
      if (!id) return res.status(400).json({ error: 'Snapshot-id fehlt' });
      if (typeof body.bezeichnung !== 'string') {
        return res.status(400).json({ error: 'bezeichnung (string) fehlt' });
      }

      // Snapshot laden um Kunden-ID rauszufinden → Zugriffsprüfung
      let snapRec;
      try {
        snapRec = await airtable('get', TABLES.SNAPSHOTS, { recordId: id });
      } catch (e) {
        return res.status(404).json({ error: 'Snapshot nicht gefunden' });
      }
      const kundenLink = (snapRec.fields && snapRec.fields[SNAPSHOT_FIELDS.KUNDE]) || [];
      const kundeId = Array.isArray(kundenLink) && kundenLink.length > 0
        ? (typeof kundenLink[0] === 'object' ? kundenLink[0].id : kundenLink[0])
        : null;
      const allowed = await canAccessKunde(session, kundeId);
      if (!allowed) return res.status(403).json({ error: 'Kein Zugriff auf diesen Snapshot' });

      const updated = await airtable('update', TABLES.SNAPSHOTS, {
        recordId: id,
        fields: { [SNAPSHOT_FIELDS.BEZEICHNUNG]: body.bezeichnung.trim() }
      });
      return res.status(200).json(snapshotRecordToApi(updated));
    }

    // --- DELETE: Snapshot löschen ---
    // Irreversibel. Query: ?id=xxx
    if (req.method === 'DELETE') {
      const id = req.query && req.query.id;
      if (!id) return res.status(400).json({ error: 'Snapshot-id fehlt' });

      // Snapshot laden um Kunden-ID rauszufinden → Zugriffsprüfung
      let snapRec;
      try {
        snapRec = await airtable('get', TABLES.SNAPSHOTS, { recordId: id });
      } catch (e) {
        return res.status(404).json({ error: 'Snapshot nicht gefunden' });
      }
      const kundenLink = (snapRec.fields && snapRec.fields[SNAPSHOT_FIELDS.KUNDE]) || [];
      const kundeId = Array.isArray(kundenLink) && kundenLink.length > 0
        ? (typeof kundenLink[0] === 'object' ? kundenLink[0].id : kundenLink[0])
        : null;
      const allowed = await canAccessKunde(session, kundeId);
      if (!allowed) return res.status(403).json({ error: 'Kein Zugriff auf diesen Snapshot' });

      await airtable('delete', TABLES.SNAPSHOTS, { recordId: id });
      return res.status(200).json({ ok: true, id });
    }

    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
  } catch (e) {
    return sendError(res, e);
  }
};
