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

      // Vertriebler sieht nur eigene (Owner-Link enthält seine Record-ID).
      // Airtable: FIND('rec...', ARRAYJOIN({Owner})) > 0
      const listParams = {
        'sort[0][field]': KUNDEN_FIELDS.LAST_ACTIVITY,
        'sort[0][direction]': 'desc'
      };
      if (!isAdmin) {
        listParams.filterByFormula = `FIND('${session.vertrieblerId}', ARRAYJOIN({Owner}))>0`;
      }

      const records = await listAll(TABLES.KUNDEN, listParams, 1000);
      const ownerMap = await getOwnerNameMap();
      const out = records.map(r => kundeRecordToBasic(r, ownerMap));
      return res.status(200).json({ kunden: out });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body.vorname && !body.nachname) {
        return res.status(400).json({ error: 'vorname oder nachname erforderlich' });
      }
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
