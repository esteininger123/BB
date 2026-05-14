// GET /api/admin/stats — Statistik über alle Vertriebler/Kunden/Phasen (Admin only).

const { requireAdmin } = require('../_lib/auth');
const { listAll } = require('../_lib/airtable');
const { methodNotAllowed, sendError } = require('../_lib/http');
const { TABLES, KUNDEN_FIELDS, VERTRIEBLER_FIELDS } = require('../_lib/tables');

const PHASEN = [
  'Lead',
  'Kalkulation läuft',
  'Reservierung',
  'Selbstauskunft',
  'Bank-Einreichung',
  'Notar-Termin',
  'Beurkundet',
  'Abgebrochen'
];

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const session = requireAdmin(req, res);
  if (!session) return; // requireAdmin hat schon geantwortet

  try {
    const [vertriebler, kunden] = await Promise.all([
      listAll(TABLES.VERTRIEBLER, {
        fields: [VERTRIEBLER_FIELDS.NAME, VERTRIEBLER_FIELDS.EMAIL, VERTRIEBLER_FIELDS.ROLLE, VERTRIEBLER_FIELDS.STATUS]
      }, 500),
      listAll(TABLES.KUNDEN, {
        fields: [KUNDEN_FIELDS.OWNER, KUNDEN_FIELDS.PHASE, KUNDEN_FIELDS.LAST_ACTIVITY]
      }, 5000)
    ]);

    // Aggregation: pro Vertriebler ein Counter-Objekt
    const perVertriebler = {};
    vertriebler.forEach(v => {
      perVertriebler[v.id] = {
        id: v.id,
        name:   (v.fields && v.fields[VERTRIEBLER_FIELDS.NAME])   || '',
        email:  (v.fields && v.fields[VERTRIEBLER_FIELDS.EMAIL])  || '',
        rolle:  (v.fields && v.fields[VERTRIEBLER_FIELDS.ROLLE])  || '',
        status: (v.fields && v.fields[VERTRIEBLER_FIELDS.STATUS]) || '',
        total: 0,
        phasen: PHASEN.reduce((a, p) => { a[p] = 0; return a; }, {})
      };
    });

    const total = { total: kunden.length, phasen: PHASEN.reduce((a, p) => { a[p] = 0; return a; }, {}) };
    const orphans = []; // Kunden ohne Owner

    kunden.forEach(k => {
      const f = k.fields || {};
      const phase = f[KUNDEN_FIELDS.PHASE] || 'Lead';
      total.phasen[phase] = (total.phasen[phase] || 0) + 1;
      const ownerIds = f[KUNDEN_FIELDS.OWNER] || [];
      const ownerId = Array.isArray(ownerIds) ? ownerIds[0] : null;
      if (!ownerId || !perVertriebler[ownerId]) {
        orphans.push({ id: k.id, ownerId, phase });
        return;
      }
      perVertriebler[ownerId].total += 1;
      perVertriebler[ownerId].phasen[phase] = (perVertriebler[ownerId].phasen[phase] || 0) + 1;
    });

    return res.status(200).json({
      vertriebler: Object.values(perVertriebler),
      total,
      orphans,
      phasen: PHASEN
    });
  } catch (e) {
    return sendError(res, e);
  }
};
