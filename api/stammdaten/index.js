// GET /api/stammdaten — alle Kalkulations-Stammdaten (für Admin-Audit-Ansicht).
//   Liefert pro WE: WE-Basisdaten + Kalk-Stammdaten + Stellplatz-Aggregat +
//   Vermietungs-Info in einem Response. Nur Admin.

const { verifySession } = require('../_lib/auth');
const { airtable, listAll } = require('../_lib/airtable');
const { methodNotAllowed, sendError } = require('../_lib/http');
const {
  TABLES,
  WE_FIELDS,
  STELLPLATZ_FIELDS,
  MIETVERTRAG_FIELDS,
  KALK_STAMMDATEN_FIELDS,
  WE_STATUS_VERMARKTUNG,
  MAKLER_BUB,
} = require('../_lib/tables');

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}

function unwrap(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.name === 'string') return v.name;
  return v;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  if (session.rolle !== 'Admin') return res.status(403).json({ error: 'Nur Admins' });

  try {
    // 1) Alle WEs in Vermarktung (B&B Immo) parallel laden
    const formula = `AND({Status}='${WE_STATUS_VERMARKTUNG}', FIND('${MAKLER_BUB}', ARRAYJOIN({Firma (from Projekt) (from Objekt)}))>0)`;
    const [weRecs, stammRecs, stplRecs, vertraegeRecs] = await Promise.all([
      listAll(TABLES.WOHNEINHEIT, {
        filterByFormula: formula,
        fields: [
          WE_FIELDS.LAGE_BEZ, WE_FIELDS.WE_NR, WE_FIELDS.LAGE_TEXT,
          WE_FIELDS.KAUFPREIS, WE_FIELDS.QM, WE_FIELDS.KALTMIETE, WE_FIELDS.QM_PREIS,
        ],
        pageSize: 100,
      }, 2000),
      listAll(TABLES.KALK_STAMMDATEN, {
        fields: Object.values(KALK_STAMMDATEN_FIELDS),
      }, 2000),
      listAll(TABLES.STELLPLATZ, {
        fields: [
          STELLPLATZ_FIELDS.TITEL, STELLPLATZ_FIELDS.WE_LINK, STELLPLATZ_FIELDS.TYP,
          STELLPLATZ_FIELDS.MIETKOSTEN, STELLPLATZ_FIELDS.KAUFPREIS,
        ],
      }, 5000),
      listAll(TABLES.MIETVERTRAG, {
        fields: [
          MIETVERTRAG_FIELDS.WE_LINK, MIETVERTRAG_FIELDS.STELLPLATZ_LINK,
          MIETVERTRAG_FIELDS.STELLPLATZMIETE, MIETVERTRAG_FIELDS.VERTRAGSBEGINN,
          MIETVERTRAG_FIELDS.GUELTIG_AB, MIETVERTRAG_FIELDS.STATUS_LOOKUP,
        ],
      }, 5000),
    ]);

    // 2) Indexe pro WE
    const stammByWe = {};
    stammRecs.forEach(r => {
      const link = (r.fields && r.fields[KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]) || [];
      if (!Array.isArray(link)) return;
      link.forEach(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        if (!id) return;
        if (!stammByWe[id]) stammByWe[id] = [];
        stammByWe[id].push(r);
      });
    });
    const stplByWe = {};
    stplRecs.forEach(r => {
      const link = (r.fields && r.fields[STELLPLATZ_FIELDS.WE_LINK]) || [];
      if (!Array.isArray(link)) return;
      link.forEach(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        if (!id) return;
        if (!stplByWe[id]) stplByWe[id] = [];
        stplByWe[id].push(r);
      });
    });
    const vertragsByWe = {};
    vertraegeRecs.forEach(r => {
      const link = (r.fields && r.fields[MIETVERTRAG_FIELDS.WE_LINK]) || [];
      if (!Array.isArray(link)) return;
      link.forEach(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        if (!id) return;
        if (!vertragsByWe[id]) vertragsByWe[id] = [];
        vertragsByWe[id].push(r);
      });
    });

    // 3) Aggregat pro WE
    const audit = weRecs.map(weRec => {
      const wf = weRec.fields || {};
      const titel = (Array.isArray(wf[WE_FIELDS.LAGE_BEZ]) ? wf[WE_FIELDS.LAGE_BEZ][0] : wf[WE_FIELDS.LAGE_BEZ]) || '';
      const we = {
        id: weRec.id,
        titel,
        weNr: wf[WE_FIELDS.WE_NR] || '',
        kp:        num(wf[WE_FIELDS.KAUFPREIS]),
        qm:        num(wf[WE_FIELDS.QM]),
        kaltmiete: num(wf[WE_FIELDS.KALTMIETE]),
        qmPreis:   num(wf[WE_FIELDS.QM_PREIS]),
      };

      // Stammdaten — Priorität: Aktiv > Entwurf > Archiviert
      const stamms = stammByWe[weRec.id] || [];
      const byStatus = { Aktiv: [], Entwurf: [], Archiviert: [] };
      stamms.forEach(s => {
        const st = unwrap(s.fields && s.fields[KALK_STAMMDATEN_FIELDS.STATUS]) || '';
        if (byStatus[st]) byStatus[st].push(s);
      });
      const stamm = byStatus.Aktiv[0] || byStatus.Entwurf[0] || byStatus.Archiviert[0] || null;
      const sf = stamm ? (stamm.fields || {}) : {};

      // Stellplatz
      const stpl = stplByWe[weRec.id] || [];
      const stpKp    = stpl.reduce((s, r) => s + (num((r.fields || {})[STELLPLATZ_FIELDS.KAUFPREIS]) || 0), 0);
      const stpMiete = stpl.reduce((s, r) => s + (num((r.fields || {})[STELLPLATZ_FIELDS.MIETKOSTEN]) || 0), 0);

      // Mietvertrag
      const vertraege = vertragsByWe[weRec.id] || [];
      let vertragVorhanden = false;
      let stpVertragMiete = 0;
      let jungsteMietsteig = null;
      let jungsterVertragsbeginn = null;
      vertraege.forEach(r => {
        const f = r.fields || {};
        vertragVorhanden = true;
        const stplLink = f[MIETVERTRAG_FIELDS.STELLPLATZ_LINK];
        const stplMiete = num(f[MIETVERTRAG_FIELDS.STELLPLATZMIETE]) || 0;
        if (stplLink && stplMiete > 0) stpVertragMiete += stplMiete;
        const gueltig = f[MIETVERTRAG_FIELDS.GUELTIG_AB];
        const beginn = f[MIETVERTRAG_FIELDS.VERTRAGSBEGINN];
        if (gueltig && (!jungsteMietsteig || gueltig > jungsteMietsteig)) jungsteMietsteig = gueltig;
        if (beginn && (!jungsterVertragsbeginn || beginn > jungsterVertragsbeginn)) jungsterVertragsbeginn = beginn;
      });
      const stpMieteEffektiv = stpVertragMiete > 0 ? stpVertragMiete : stpMiete;

      const stammLetzte = sf[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG] || null;
      const letzteMietsteigerung = stammLetzte || jungsteMietsteig || jungsterVertragsbeginn || null;
      const letzteMietsteigerungQuelle = stammLetzte ? 'kalk' :
        (jungsteMietsteig ? 'vertrag-anpassung' : (jungsterVertragsbeginn ? 'vertrag-beginn' : 'unbekannt'));

      return {
        we,
        stellplaetze: {
          anzahl: stpl.length,
          kaufpreisSumme: stpKp,
          mieteMoSumme: stpMieteEffektiv,
          mieteMoQuelle: stpVertragMiete > 0 ? 'mietvertrag' : (stpMiete > 0 ? 'stellplatz-alt' : 'keine'),
        },
        vermietung: {
          status: (vertragVorhanden || (we.kaltmiete > 0)) ? 'vermietet' : 'leer',
          vertragVorhanden,
          letzteMietsteigerung,
          letzteMietsteigerungQuelle,
        },
        stammdaten: stamm ? {
          id: stamm.id,
          status: unwrap(sf[KALK_STAMMDATEN_FIELDS.STATUS]) || null,
          hausverwaltung:        num(sf[KALK_STAMMDATEN_FIELDS.HAUSVERWALTUNG]),
          hausgeldRuecklage:     num(sf[KALK_STAMMDATEN_FIELDS.HAUSGELD_RUECKLAGE]),
          mietverwaltungDefault: num(sf[KALK_STAMMDATEN_FIELDS.MIETVERWALTUNG_DEF]),
          mietzuschuss:          num(sf[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS]),
          mietzuschussMonate:    num(sf[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS_MONATE]),
          afaGutachten:          num(sf[KALK_STAMMDATEN_FIELDS.AFA_GUTACHTEN]),
          wertsteigerung:        num(sf[KALK_STAMMDATEN_FIELDS.WERTSTEIGERUNG]),
          vermietungsModus:      unwrap(sf[KALK_STAMMDATEN_FIELDS.VERMIETUNGS_MODUS]) || null,
          kappungsgrenze:        unwrap(sf[KALK_STAMMDATEN_FIELDS.KAPPUNGSGRENZE]) || null,
          indexmiete:            num(sf[KALK_STAMMDATEN_FIELDS.INDEXMIETE]),
          letzteMietsteigerung:  sf[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG] || null,
          notizen:               sf[KALK_STAMMDATEN_FIELDS.NOTIZEN] || '',
          quelle:                sf[KALK_STAMMDATEN_FIELDS.QUELLE] || '',
        } : null,
      };
    });

    return res.status(200).json(audit);
  } catch (e) {
    return sendError(res, e);
  }
};
