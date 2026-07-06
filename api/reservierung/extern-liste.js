// GET /api/reservierung/extern-liste — 06.07.2026 (Henry)
//
// Alle Extern-Reservierungen über alle Kunden hinweg — fürs Admin-Cockpit
// (Admin-Bereich → „Externer Vertrieb"). Kunden von Externen tauchen in
// „Meine Kunden" der Internen nicht auf; hier ist die zentrale Übersicht,
// wo Unterschriften (12-h-Prüfvorbehalt!) sichtbar werden.

const { requireAdmin } = require('../_lib/auth');
const { listAll } = require('../_lib/airtable');
const { methodNotAllowed, sendError } = require('../_lib/http');
const { TABLES, KUNDEN_FIELDS } = require('../_lib/tables');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const session = requireAdmin(req, res);
  if (!session) return;

  try {
    const recs = await listAll(TABLES.KUNDEN, {
      fields: [KUNDEN_FIELDS.NAME, KUNDEN_FIELDS.VORNAME, KUNDEN_FIELDS.NACHNAME, KUNDEN_FIELDS.SA_JSON],
    }, 5000);

    const liste = [];
    recs.forEach(r => {
      const f = r.fields || {};
      let sa = f[KUNDEN_FIELDS.SA_JSON];
      if (typeof sa === 'string') { try { sa = JSON.parse(sa); } catch (e) { sa = null; } }
      const rv = sa && sa.reservierungExtern;
      if (!rv || !rv.doc) return;
      liste.push({
        kundeId: r.id,
        kundeName: (((f[KUNDEN_FIELDS.VORNAME] || '') + ' ' + (f[KUNDEN_FIELDS.NACHNAME] || '')).trim()) || f[KUNDEN_FIELDS.NAME] || '',
        kaeufer: rv.kaeufer || '',
        vertrieblerName: rv.vertrieblerName || '',
        erstelltAm: rv.erstelltAm || null,
        reservBis: rv.reservBis || '',
        weNr: rv.doc.weNr || '',
        lage: rv.doc.lage || '',
        projektName: rv.doc.projektName || '',
        kpGesamt: rv.doc.kpGesamt || 0,
        signiertAm: (rv.signiert && rv.signiert.am) || null,
      });
    });
    // Unterschriebene zuerst (Prüf-Frist!), innerhalb dessen neueste oben.
    liste.sort((a, b) => {
      if (!!b.signiertAm !== !!a.signiertAm) return b.signiertAm ? 1 : -1;
      return String(b.signiertAm || b.erstelltAm || '').localeCompare(String(a.signiertAm || a.erstelltAm || ''));
    });
    return res.status(200).json(liste);
  } catch (e) {
    return sendError(res, e);
  }
};
