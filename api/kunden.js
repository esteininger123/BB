// GET  /api/kunden — Liste (Vertriebler: eigene; Admin: alle)
// POST /api/kunden — neuen Kunden anlegen (Owner = current user)

const { verifySession } = require('./_lib/auth');
const { airtable, listAll } = require('./_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('./_lib/http');
const { TABLES, KUNDEN_FIELDS, VERTRIEBLER_FIELDS } = require('./_lib/tables');
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
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  try {
    if (req.method === 'GET') {
      const isAdmin = session.rolle === 'Admin';

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
      if (!isAdmin) {
        filters.push(`FIND('${session.vertrieblerId}', ARRAYJOIN({Owner}))>0`);
        if (!withArchived) filters.push(`NOT({Archiviert})`);
      }
      if (filters.length === 1) listParams.filterByFormula = filters[0];
      else if (filters.length > 1) listParams.filterByFormula = 'AND(' + filters.join(', ') + ')';

      const records = await listAll(TABLES.KUNDEN, listParams, 1000);
      const ownerMap = await getOwnerNameMap();
      const out = records.map(r => kundeRecordToBasic(r, ownerMap));
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
