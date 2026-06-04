// GET /api/stammdaten — alle Kalkulations-Stammdaten (für Admin-Audit-Ansicht).
//   Liefert pro WE: WE-Basisdaten + Kalk-Stammdaten + Stellplatz-Aggregat +
//   Vermietungs-Info in einem Response. Nur Admin.

const { verifySession } = require('../_lib/auth');
const { airtable, listAll } = require('../_lib/airtable');
const { methodNotAllowed, sendError } = require('../_lib/http');
const { aggregateStellplaetze, linkIds } = require('../_lib/stellplatz');
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

// Audit-Fix Iter 49 (19.05.2026): gleiche Lookup-Auflösung wie in [weId].js.
// Sonst zeigt der Admin-Audit einen anderen Vermietungsstatus als die Einzel-Ansicht
// (Lookup „Miet-status (ist)" autoritativ seit Iter 41.17, hier zuvor ignoriert).
function resolveVermietungsstatusFromLookup(rawVal) {
  if (rawVal == null) return null;
  let v = rawVal;
  if (Array.isArray(v)) v = v.find(x => x != null && x !== '') || null;
  if (v == null) return null;
  if (typeof v === 'object' && v.name) v = v.name;
  const s = String(v).toLowerCase().trim();
  if (!s) return null;
  if (s.startsWith('vermiet')) return 'vermietet';
  if (s.startsWith('leer') || s.startsWith('frei') || s.includes('leerstehend')) return 'leer';
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  // Iter 45: Auch Vertriebler dürfen die Sammel-Ansicht lesen — sie ist die
  // Datenquelle für den Paket-Modus (Pro-rata-Stellplatzmiete). Die Felder hier
  // sind dieselben, die über /api/stammdaten/[weId] einzeln lesbar sind.

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
          MIETVERTRAG_FIELDS.NEU_VERMIETETER_STELLPLATZ,
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
    const stplById = {}; // alle Stellplatz-Datensätze nach ID (Quelle der Wahrheit für KP + Miete)
    stplRecs.forEach(r => {
      const f = r.fields || {};
      const typObj = f[STELLPLATZ_FIELDS.TYP];
      stplById[r.id] = {
        titel: f[STELLPLATZ_FIELDS.TITEL] || '',
        typ: (typObj && typeof typObj === 'object') ? typObj.name : (typObj || ''),
        kaufpreis: num(f[STELLPLATZ_FIELDS.KAUFPREIS]) || 0,
        mieteMo: num(f[STELLPLATZ_FIELDS.MIETKOSTEN]) || 0,
      };
      const link = f[STELLPLATZ_FIELDS.WE_LINK] || [];
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
        // QA-Fix 2026-05-23 (Audit-BB-8): defensives `|| 0` als NaN-Schutz.
        // `num()` kann null/NaN zurückgeben. Wenn das durch die Pipeline rutscht,
        // multipliziert die Engine mit null = 0, was zu Geister-Cashflows
        // führt. Lieber explizit 0 für „nicht gepflegt" als null.
        kp:        num(wf[WE_FIELDS.KAUFPREIS]) || 0,
        qm:        num(wf[WE_FIELDS.QM]) || 0,
        kaltmiete: num(wf[WE_FIELDS.KALTMIETE]) || 0,
        qmPreis:   num(wf[WE_FIELDS.QM_PREIS]) || 0,
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

      // Stellplatz (NEU 04.06.2026): Verknüpfung primär über aktiven Mietvertrag, Werte aus dem
      // Stellplatz-Datensatz, leer => raus. Gemeinsamer Helfer mit [weId].js.
      const stpl = stplByWe[weRec.id] || [];
      const weStpIds = stpl.map(r => r.id);

      // Mietverträge: NEU-Stellplätze (nicht archiviert) sammeln + alte Pro-rata-Pauschale als Miet-Fallback.
      const vertraege = vertragsByWe[weRec.id] || [];
      let vertragVorhanden = false;
      let jungsteMietsteig = null;
      let jungsterVertragsbeginn = null;
      let neuStpIds = [];
      // Iter-4 WE4-Fix (identisch zu [weId].js): pro Stellplatz gewinnt der JÜNGSTE nicht-archivierte
      // Vertrag — sonst zählt eine Garage, die in Erst- + Erhöhungsvertrag steht, doppelt.
      const jungsteStplMieteByPlatz = new Map();
      vertraege.forEach(r => {
        const f = r.fields || {};
        vertragVorhanden = true;
        const sl = f[MIETVERTRAG_FIELDS.STATUS_LOOKUP];
        const slName = Array.isArray(sl) ? ((sl[0] && sl[0].name) || sl[0]) : ((sl && sl.name) || sl);
        const istArchiviert = typeof slName === 'string' && /archiv/i.test(slName);
        if (!istArchiviert) {
          neuStpIds = neuStpIds.concat(linkIds(f[MIETVERTRAG_FIELDS.NEU_VERMIETETER_STELLPLATZ]));
        }
        const stplLink = f[MIETVERTRAG_FIELDS.STELLPLATZ_LINK];
        const stplMiete = num(f[MIETVERTRAG_FIELDS.STELLPLATZMIETE]) || 0;
        if (stplLink && stplMiete > 0 && !istArchiviert) {
          const vertragStpIds = linkIds(stplLink);
          const relevanteStpIds = vertragStpIds.length > 0
            ? vertragStpIds.filter(id => weStpIds.includes(id))
            : vertragStpIds;
          if (relevanteStpIds.length > 0) {
            const proStpMiete = stplMiete / vertragStpIds.length;
            const datumFuerStpl = f[MIETVERTRAG_FIELDS.GUELTIG_AB] || f[MIETVERTRAG_FIELDS.VERTRAGSBEGINN] || '0000-00-00';
            relevanteStpIds.forEach(stpId => {
              const cur = jungsteStplMieteByPlatz.get(stpId);
              if (!cur || datumFuerStpl > cur.datum) jungsteStplMieteByPlatz.set(stpId, { miete: proStpMiete, datum: datumFuerStpl });
            });
          }
        }
        const gueltig = f[MIETVERTRAG_FIELDS.GUELTIG_AB];
        const beginn = f[MIETVERTRAG_FIELDS.VERTRAGSBEGINN];
        if (gueltig && (!jungsteMietsteig || gueltig > jungsteMietsteig)) jungsteMietsteig = gueltig;
        if (beginn && (!jungsterVertragsbeginn || beginn > jungsterVertragsbeginn)) jungsterVertragsbeginn = beginn;
      });
      const stpVertragMiete = Array.from(jungsteStplMieteByPlatz.values()).reduce((s, x) => s + x.miete, 0);

      // Vermietungs-Status zuerst (Lookup-Vorrang, sonst Vertrag-vorhanden-Heuristik) — steuert leer=raus.
      const lookupStatus = resolveVermietungsstatusFromLookup(sf[KALK_STAMMDATEN_FIELDS.WE_VERMIETUNGSSTATUS]);
      let statusFinal, statusQuelle;
      if (lookupStatus) {
        statusFinal = lookupStatus;
        statusQuelle = 'we-lookup';
      } else {
        statusFinal = vertragVorhanden ? 'vermietet' : 'leer';
        statusQuelle = vertragVorhanden ? 'fallback-mietvertrag' : 'fallback-keine-daten';
      }

      const stpAgg = aggregateStellplaetze({
        vermietet: statusFinal === 'vermietet',
        neuStellplatzIds: neuStpIds,
        altStellplatzIds: weStpIds,
        stpById,
        vertragMieteFallback: stpVertragMiete,
      });

      const stammLetzte = sf[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG] || null;
      const letzteMietsteigerung = stammLetzte || jungsteMietsteig || jungsterVertragsbeginn || null;
      const letzteMietsteigerungQuelle = stammLetzte ? 'kalk' :
        (jungsteMietsteig ? 'vertrag-anpassung' : (jungsterVertragsbeginn ? 'vertrag-beginn' : 'unbekannt'));

      return {
        we,
        stellplaetze: {
          anzahl: stpAgg.anzahl,
          garageCount: stpAgg.garageCount,
          flaecheCount: stpAgg.flaecheCount,
          kaufpreisSumme: stpAgg.kaufpreisSumme,
          mieteMoSumme: stpAgg.mieteMoSumme,
          mieteMoQuelle: stpAgg.mieteMoQuelle,
          details: stpAgg.details,
        },
        vermietung: {
          status: statusFinal,
          statusQuelle,
          vertragVorhanden,
          letzteMietsteigerung: statusFinal === 'leer' ? null : letzteMietsteigerung,
          letzteMietsteigerungQuelle: statusFinal === 'leer' ? 'leerstand-keine' : letzteMietsteigerungQuelle,
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
          grEst:                 num(sf[KALK_STAMMDATEN_FIELDS.GRESt]),
          gebaeudeAnteil:        num(sf[KALK_STAMMDATEN_FIELDS.GEBAEUDE_ANTEIL]),
          hgInflation:           0, // FS-2o (Edgar 24.05.2026): Rücklage-Inflation komplett deaktiviert, immer 0
          notizen:               sf[KALK_STAMMDATEN_FIELDS.NOTIZEN] || '',
          quelle:                sf[KALK_STAMMDATEN_FIELDS.QUELLE] || '',
          // Iter 41.9
          mieteBeiVerkauf:       num(sf[KALK_STAMMDATEN_FIELDS.MIETE_BEI_VERKAUF]),
          marktpreisImmoscout:   num(sf[KALK_STAMMDATEN_FIELDS.MARKTPREIS_IS]),
          marktpreisHomeday:     num(sf[KALK_STAMMDATEN_FIELDS.MARKTPREIS_HD]),
          marktmiete:            num(sf[KALK_STAMMDATEN_FIELDS.MARKTMIETE]),
          // Auto-Subv (vom Cron 3×/Tag gepflegt) — Frontend WE-Liste nutzt diese
          // wenn manueller Mietzuschuss fehlt (Bruchsal-Default-Pattern).
          autoSubvMo:            num(sf[KALK_STAMMDATEN_FIELDS.AUTO_SUBV_MO]),
          autoSubvTotal:         num(sf[KALK_STAMMDATEN_FIELDS.AUTO_SUBV_TOTAL]),
          mietzuschussTotal:     (num(sf[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS]) || 0) * (num(sf[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS_MONATE]) || 0),
        } : null,
      };
    });

    // Iter-3 H6 (21.05.2026): Browser-Cache 60s. Der Endpoint lädt ~14k Records
    // pro Aufruf (WEs + Stammdaten + Stellplätze + Mietverträge). Henry wechselt im
    // Admin-Audit-Tab häufig zwischen Sichten — durch private/max-age=60 holt der
    // Browser bei Tab-Wechseln innerhalb von 60 Sek nicht erneut. ETag wäre noch
    // besser (Server-Side-Vergleich), aber private/max-age=60 ist Quick-Win mit
    // großem Effekt für den Audit-Pflege-Run.
    //
    // private (kein CDN-Cache) ist wichtig, weil die Response Owner-spezifisch sein
    // kann (Admin sieht andere Daten als Vertriebler — aktuell sehen sie das gleiche,
    // aber wir wollen das nicht in einen geteilten Cache packen).
    res.setHeader('Cache-Control', 'private, max-age=60, must-revalidate');
    return res.status(200).json(audit);
  } catch (e) {
    return sendError(res, e);
  }
};
