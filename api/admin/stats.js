// GET /api/admin/stats — Statistik über alle Vertriebler/Kunden/Phasen (Admin only).

const { requireAdminVerified } = require('../_lib/auth');
const { listAll } = require('../_lib/airtable');
const { methodNotAllowed, sendError } = require('../_lib/http');
const { TABLES, KUNDEN_FIELDS, VERTRIEBLER_FIELDS } = require('../_lib/tables');
const { kundeRecordToBasic } = require('../_lib/mappers');

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

  // QA-Fix 2026-05-22 (Audit-D B2): DB-Recheck statt nur JWT-Payload — schützt
  // gegen forged JWT mit `rolle: "Admin"`.
  const session = await requireAdminVerified(req, res);
  if (!session) return;

  try {
    const [vertriebler, kunden] = await Promise.all([
      listAll(TABLES.VERTRIEBLER, {
        fields: [VERTRIEBLER_FIELDS.NAME, VERTRIEBLER_FIELDS.EMAIL, VERTRIEBLER_FIELDS.ROLLE, VERTRIEBLER_FIELDS.STATUS]
      }, 500),
      listAll(TABLES.KUNDEN, {
        fields: [
          KUNDEN_FIELDS.NAME,
          KUNDEN_FIELDS.VORNAME,
          KUNDEN_FIELDS.NACHNAME,
          KUNDEN_FIELDS.EMAIL,
          KUNDEN_FIELDS.TELEFON,
          KUNDEN_FIELDS.OWNER,
          KUNDEN_FIELDS.PHASE,
          KUNDEN_FIELDS.LAST_ACTIVITY
        ]
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

    // Frontend-kompatible Felder bereitstellen
    const vertrieblerList = Object.values(perVertriebler).map(v => ({
      ...v,
      kundenGesamt: v.total,
      beurkundet:   (v.phasen && v.phasen['Beurkundet']) || 0,
      reserviert:   (v.phasen && v.phasen['Reservierung']) || 0,
      notarTermin:  (v.phasen && v.phasen['Notar-Termin']) || 0,
      kaufKomplett: ((v.phasen && v.phasen['Beurkundet']) || 0) + ((v.phasen && v.phasen['Notar-Termin']) || 0),
      // Pipeline-Counter (offen / in Bearbeitung — alles vor Beurkundet, nach Lead)
      inBearbeitung:
        ((v.phasen && v.phasen['Kalkulation läuft']) || 0) +
        ((v.phasen && v.phasen['Reservierung']) || 0) +
        ((v.phasen && v.phasen['Selbstauskunft']) || 0) +
        ((v.phasen && v.phasen['Bank-Einreichung']) || 0) +
        ((v.phasen && v.phasen['Notar-Termin']) || 0),
    }));

    // Owner-Name-Map für die Kundenliste
    const ownerNameMap = {};
    vertriebler.forEach(v => {
      ownerNameMap[v.id] = (v.fields && v.fields[VERTRIEBLER_FIELDS.NAME]) || '';
    });
    const alleKunden = kunden.map(r => kundeRecordToBasic(r, ownerNameMap));

    const inBearbeitung =
      (total.phasen['Kalkulation läuft'] || 0) +
      (total.phasen['Reservierung'] || 0) +
      (total.phasen['Selbstauskunft'] || 0) +
      (total.phasen['Bank-Einreichung'] || 0) +
      (total.phasen['Notar-Termin'] || 0);

    return res.status(200).json({
      vertriebler: vertrieblerList,
      total,
      totalKunden: total.total,
      byPhase: total.phasen,
      inBearbeitung,
      alleKunden,
      orphans,
      phasen: PHASEN,
    });
  } catch (e) {
    return sendError(res, e);
  }
};
