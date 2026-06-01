// GET  /api/kunden — Liste (Vertriebler: eigene; Admin: alle)
// POST /api/kunden — neuen Kunden anlegen (Owner = current user)

const { verifySession, requireSafeOrigin } = require('./_lib/auth');
const { airtable, listAll, escapeFormulaString } = require('./_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('./_lib/http');
const { TABLES, KUNDEN_FIELDS, VERTRIEBLER_FIELDS, SNAPSHOT_FIELDS } = require('./_lib/tables');
const { kundeRecordToBasic, kundeBodyToFields } = require('./_lib/mappers');

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

module.exports = async (req, res) => {
  // QA-Fix 2026-05-23 (Audit-DD-1): CSRF-Schutz vor jeder Mutation.
  if (!requireSafeOrigin(req, res)) return;
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  try {
    if (req.method === 'GET') {
      const isAdmin = session.rolle === 'Admin';
      // QA-Fix 2026-05-23 (Edgar-Doc B1): Admin sah in „Meine Kunden"-Liste auch
      // fremde Kunden. Fix: ?mineOnly=1 erzwingt Owner-Filter — auch für Admin.
      // Frontend-Dashboard nutzt das Flag, Admin-Tab nicht.
      const mineOnly = req.query && (req.query.mineOnly === '1' || req.query.mineOnly === 'true');

      // Iter 52: archivierte Kunden werden für Vertriebler standardmäßig ausgeblendet.
      // Admin sieht alle (das archiviert-Flag bleibt im Response, damit die Admin-UI
      // sie separat in der Archiv-Sektion darstellen kann). Mit ?withArchived=1 kann
      // der Vertriebler bewusst auch archivierte sehen (für Such-Use-Cases später).
      const withArchived = req.query && (req.query.withArchived === '1' || req.query.withArchived === 'true');
      const listParams = {
        'sort[0][field]': 'Letzte-Aktivität',
        'sort[0][direction]': 'desc'
      };
      const filters = [];
      if (!isAdmin || mineOnly) {
        // QA-Fix 2026-05-23 (P1 — Edgar's Kunden weg): ARRAYJOIN({Owner}) liefert in
        // Airtable-Formula die DISPLAY-Werte (= Vertriebler-Namen), nicht die Record-IDs.
        // Filter mit vertrieblerId hat IMMER 0 gematcht. War seit Anfang an kaputt für
        // Vertriebler, jetzt durch mineOnly=1 auch für Admin sichtbar geworden.
        // Fix: Vertriebler-Namen aus Airtable holen + im Filter nutzen.
        let vName = '';
        try {
          const vRec = await airtable('get', TABLES.VERTRIEBLER, { recordId: session.vertrieblerId });
          vName = (vRec && vRec.fields && vRec.fields[VERTRIEBLER_FIELDS.NAME]) || '';
        } catch (e) {
          // QA-Fix 2026-05-23 (Audit-Y-B3): Silent fail loggen, damit Server-Logs
          // zeigen WARUM ein Vertriebler plötzlich 0 Kunden sieht (typische
          // Ursache: Vertriebler-Record gelöscht / IDs verschoben).
          console.error('[kunden:GET] Vertriebler-Lookup fehlgeschlagen für vertrieblerId=' + session.vertrieblerId + ':', e && e.message);
        }
        if (vName) {
          // QA-Fix 2026-05-23 (Audit-Y-B1): exakter Match mit Komma-Separator-Wrapping.
          // Vorher Substring-Match: „Henry" matched „Henry Wacker" UND „Henry Schmidt".
          // Jetzt: ARRAYJOIN mit „, " als Separator, suche nach „, {Name}, " mit
          // Komma-Begrenzern → exakter Match auf vollständigen Namen.
          const esc = escapeFormulaString(vName);
          filters.push(`OR(FIND(', ${esc}, ', ', ' & ARRAYJOIN({Owner}, ', ') & ', ')>0)`);
        } else {
          // ID-Fallback (matched aktuell nicht, aber zukunftssicher falls Schema-Change)
          filters.push(`FIND('${escapeFormulaString(session.vertrieblerId)}', ARRAYJOIN({Owner}))>0`);
        }
        if (!withArchived) filters.push(`NOT({Archiviert})`);
      }
      if (filters.length === 1) listParams.filterByFormula = filters[0];
      else if (filters.length > 1) listParams.filterByFormula = 'AND(' + filters.join(', ') + ')';

      const records = await listAll(TABLES.KUNDEN, listParams, 1000);
      const ownerMap = await getOwnerNameMap();
      // Beratene WE pro Kunde (Team-Feedback 2026-06-01): einmal alle Snapshots laden
      // (nur Kunde-Link + WE-Bezeichnung), nach Kunde gruppieren. Defensiv — bei Fehler
      // liefert die Kundenliste einfach ohne WE-Info weiter.
      let snapshotsByKunde = {};
      try {
        const snaps = await listAll(TABLES.SNAPSHOTS, {
          fields: [SNAPSHOT_FIELDS.KUNDE, SNAPSHOT_FIELDS.WE_BEZ, SNAPSHOT_FIELDS.WE_RECID]
        }, 5000);
        snaps.forEach(s => {
          const link = (s.fields && s.fields[SNAPSHOT_FIELDS.KUNDE]) || [];
          const kId = Array.isArray(link) && link.length
            ? (typeof link[0] === 'object' ? link[0].id : link[0]) : null;
          if (!kId) return;
          const bez = (s.fields && s.fields[SNAPSHOT_FIELDS.WE_BEZ]) || '';
          const recId = (s.fields && s.fields[SNAPSHOT_FIELDS.WE_RECID]) || '';
          (snapshotsByKunde[kId] = snapshotsByKunde[kId] || []).push({ recId, bez });
        });
      } catch (e) {
        console.error('[kunden:GET] Snapshot-Aggregation fehlgeschlagen:', e && e.message);
        snapshotsByKunde = {};
      }
      const out = records.map(r => kundeRecordToBasic(r, ownerMap, snapshotsByKunde));
      return res.status(200).json(out);
    }

    if (req.method === 'POST') {
      const body = await readBody(req);

      // Iter 61 (20.05.2026): Validierung verschärft. Vorher reichte EIN Feld,
      // dadurch konnten Kunden mit "Auto-Snapshot WE 5 Wesseling ..." im Vornamen
      // und leerem Nachnamen entstehen. Jetzt: beide Pflicht, beide getrimmt,
      // E-Mail-Format-Check, Identitäts-Check Vorname/Nachname.
      const vorname  = (body.vorname  || '').trim();
      const nachname = (body.nachname || '').trim();
      const email    = (body.email    || '').trim();
      const telefon  = (body.telefon  || '').trim();

      if (!vorname)  return res.status(400).json({ error: 'vorname erforderlich' });
      if (!nachname) return res.status(400).json({ error: 'nachname erforderlich' });
      if (vorname.toLowerCase() === nachname.toLowerCase()) {
        return res.status(400).json({ error: 'vorname und nachname dürfen nicht identisch sein' });
      }
      if (vorname.includes('@') || nachname.includes('@')) {
        return res.status(400).json({ error: 'vorname/nachname enthält "@" — vermutlich E-Mail im falschen Feld' });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'email-Format ungültig' });
      }

      // getrimmte Werte zurück in body, damit kundeBodyToFields sie kriegt
      body.vorname  = vorname;
      body.nachname = nachname;
      body.email    = email;
      body.telefon  = telefon;

      const fields = kundeBodyToFields(body, {
        ownerId: session.vertrieblerId,
        touchLastActivity: true
      });
      if (!fields[KUNDEN_FIELDS.PHASE]) fields[KUNDEN_FIELDS.PHASE] = 'Lead';
      const created = await airtable('create', TABLES.KUNDEN, { fields });
      const ownerMap = await getOwnerNameMap();
      return res.status(201).json(kundeRecordToBasic(created, ownerMap));
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (e) {
    return sendError(res, e);
  }
};
