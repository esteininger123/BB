// GET /api/stammdaten/:weId — kombinierte Stammdaten für eine Wohneinheit:
//   - Wohneinheit (KP, qm, Kaltmiete, Lage)
//   - Verknüpfte Stellplätze (Kaufpreis + Miete aus altem Stellplatz-Feld ODER aus Mietvertrag)
//   - Aktive Kalkulations-Stammdaten-Zeile (Status=Aktiv), falls vorhanden
//
// PUT /api/stammdaten/:weId — Update oder Create der Kalkulations-Stammdaten für diese WE
//   - Body: { status, hausverwaltung, hausgeldRuecklage, mietverwaltungDefault,
//              mietzuschuss, mietzuschussMonate, afaGutachten, wertsteigerung,
//              vermietungsModus, kappungsgrenze, indexmiete, notizen }
//   - Wenn schon ein Aktiv-Datensatz existiert: dieser wird aktualisiert.
//   - Wenn nur Entwurf existiert: dieser wird aktualisiert.
//   - Wenn keiner existiert: neuer wird angelegt mit Quelle = 'App-Edit {Datum}'.
//   - Beim Setzen von status=Aktiv wird ein anderer Aktiv-Datensatz für dieselbe WE auf Archiviert
//     gesetzt (Schutz vor Doppel-Aktiv).
//   - Nur Admins dürfen schreiben.

const { verifySession } = require('../_lib/auth');
const { airtable, listAll } = require('../_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const {
  TABLES,
  WE_FIELDS,
  STELLPLATZ_FIELDS,
  MIETVERTRAG_FIELDS,
  KALK_STAMMDATEN_FIELDS,
  KALK_STATUS_AKTIV,
  KALK_STATUS_ARCHIV,
} = require('../_lib/tables');

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}

function firstStringFromLink(v) {
  if (!Array.isArray(v) || v.length === 0) return null;
  const x = v[0];
  if (x && typeof x === 'object' && x.id) return x.id;
  if (typeof x === 'string') return x;
  return null;
}

// Liefert das Stellplatz-Datenobjekt für die App (kombiniert).
async function loadStellplaetzeForWE(weId) {
  try {
    // Filter: Datensätze in Stellplatz-Tabelle, die mit weId verlinkt sind.
    // FIND() auf dem Lookup-Titel wäre möglich; saubererer Weg: alle Stellplätze
    // mit dem WE-Link laden, dann clientseitig filtern.
    const recs = await listAll(TABLES.STELLPLATZ, {
      fields: [
        STELLPLATZ_FIELDS.TITEL,
        STELLPLATZ_FIELDS.WE_LINK,
        STELLPLATZ_FIELDS.TYP,
        STELLPLATZ_FIELDS.MIETKOSTEN,
        STELLPLATZ_FIELDS.KAUFPREIS,
      ],
    }, 2000);

    const matched = recs.filter(r => {
      const link = (r.fields && r.fields[STELLPLATZ_FIELDS.WE_LINK]) || [];
      if (!Array.isArray(link)) return false;
      return link.some(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        return id === weId;
      });
    });

    return matched.map(r => {
      const f = r.fields || {};
      const typObj = f[STELLPLATZ_FIELDS.TYP];
      const typ = typObj && typeof typObj === 'object' ? typObj.name : typObj || '';
      return {
        id: r.id,
        titel: f[STELLPLATZ_FIELDS.TITEL] || '',
        typ,
        kaufpreis: num(f[STELLPLATZ_FIELDS.KAUFPREIS]) || 0,
        mieteMo: num(f[STELLPLATZ_FIELDS.MIETKOSTEN]) || 0, // alte Spalte, falls befüllt
      };
    });
  } catch (e) {
    console.error('loadStellplaetzeForWE failed:', e.message);
    return [];
  }
}

// Liefert alle Mietvertrag-relevanten Infos für eine WE in einem Pass:
//   - Stellplatzmiete-Summe (aggregiert über verknüpfte Mietverträge)
//   - Vermietungs-Status (vermietet=true, wenn mind. 1 Vertrag mit dieser WE existiert,
//     der nicht offensichtlich archiviert ist)
//   - Letzte Mietsteigerung (Datum) — nimmt das jüngste GUELTIG_AB-Datum,
//     fallback auf das jüngste VERTRAGSBEGINN-Datum
async function loadMietvertragInfoForWE(weId) {
  try {
    const recs = await listAll(TABLES.MIETVERTRAG, {
      fields: [
        MIETVERTRAG_FIELDS.WE_LINK,
        MIETVERTRAG_FIELDS.STELLPLATZ_LINK,
        MIETVERTRAG_FIELDS.STELLPLATZMIETE,
        MIETVERTRAG_FIELDS.STATUS_LOOKUP,
        MIETVERTRAG_FIELDS.VERTRAGSBEGINN,
        MIETVERTRAG_FIELDS.GUELTIG_AB,
        MIETVERTRAG_FIELDS.VERTRAGSART,
      ],
    }, 5000);

    let stplMietsumme = 0;
    let vertraegeMitStellplatz = 0;
    let jungsteMietsteigerung = null; // YYYY-MM-DD
    let jungsterVertragsbeginn = null;
    let vertragVorhanden = false;

    recs.forEach(r => {
      const f = r.fields || {};
      const weLink = f[MIETVERTRAG_FIELDS.WE_LINK] || [];
      const linked = Array.isArray(weLink) && weLink.some(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        return id === weId;
      });
      if (!linked) return;
      vertragVorhanden = true;
      const stpl = f[MIETVERTRAG_FIELDS.STELLPLATZ_LINK];
      const stplMiete = num(f[MIETVERTRAG_FIELDS.STELLPLATZMIETE]) || 0;
      if (stpl && stplMiete > 0) {
        stplMietsumme += stplMiete;
        vertraegeMitStellplatz += 1;
      }
      const gueltig = f[MIETVERTRAG_FIELDS.GUELTIG_AB];
      const beginn = f[MIETVERTRAG_FIELDS.VERTRAGSBEGINN];
      if (gueltig && (!jungsteMietsteigerung || gueltig > jungsteMietsteigerung)) {
        jungsteMietsteigerung = gueltig;
      }
      if (beginn && (!jungsterVertragsbeginn || beginn > jungsterVertragsbeginn)) {
        jungsterVertragsbeginn = beginn;
      }
    });

    return {
      stellplatzMietsumme: stplMietsumme,
      vertraegeMitStellplatz,
      vertragVorhanden,
      letzteMietsteigerung: jungsteMietsteigerung || jungsterVertragsbeginn || null,
      jungsterVertragsbeginn,
    };
  } catch (e) {
    console.error('loadMietvertragInfoForWE failed:', e.message);
    return {
      stellplatzMietsumme: 0,
      vertraegeMitStellplatz: 0,
      vertragVorhanden: false,
      letzteMietsteigerung: null,
      jungsterVertragsbeginn: null,
    };
  }
}

// Findet die Kalkulations-Stammdaten-Zeile für eine WE.
// Priorität: erst aktiv, dann entwurf, dann keinen.
async function loadKalkStammdatenForWE(weId) {
  try {
    const recs = await listAll(TABLES.KALK_STAMMDATEN, {
      fields: Object.values(KALK_STAMMDATEN_FIELDS),
    }, 1000);

    const matched = recs.filter(r => {
      const link = (r.fields && r.fields[KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]) || [];
      if (!Array.isArray(link)) return false;
      return link.some(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        return id === weId;
      });
    });

    if (matched.length === 0) return null;

    // Priorisierung: erst Aktiv, dann Entwurf, dann Archiviert.
    const byStatus = { Aktiv: [], Entwurf: [], Archiviert: [] };
    matched.forEach(r => {
      const s = r.fields && r.fields[KALK_STAMMDATEN_FIELDS.STATUS];
      const name = s && typeof s === 'object' ? s.name : s || '';
      if (byStatus[name]) byStatus[name].push(r);
    });
    const pick = byStatus.Aktiv[0] || byStatus.Entwurf[0] || byStatus.Archiviert[0];
    return pick;
  } catch (e) {
    console.error('loadKalkStammdatenForWE failed:', e.message);
    return null;
  }
}

function kalkStammRecordToApi(rec) {
  if (!rec) return null;
  const f = rec.fields || {};
  const statusObj = f[KALK_STAMMDATEN_FIELDS.STATUS];
  const status = statusObj && typeof statusObj === 'object' ? statusObj.name : statusObj || null;
  const vermObj = f[KALK_STAMMDATEN_FIELDS.VERMIETUNGS_MODUS];
  const vermietungsModus = vermObj && typeof vermObj === 'object' ? vermObj.name : vermObj || null;
  const kappObj = f[KALK_STAMMDATEN_FIELDS.KAPPUNGSGRENZE];
  const kappungsgrenze = kappObj && typeof kappObj === 'object' ? kappObj.name : kappObj || null;
  return {
    id: rec.id,
    status,
    bezeichnung:           f[KALK_STAMMDATEN_FIELDS.BEZEICHNUNG] || null,
    hausverwaltung:        num(f[KALK_STAMMDATEN_FIELDS.HAUSVERWALTUNG]),
    hausgeldRuecklage:     num(f[KALK_STAMMDATEN_FIELDS.HAUSGELD_RUECKLAGE]),
    mietverwaltungDefault: num(f[KALK_STAMMDATEN_FIELDS.MIETVERWALTUNG_DEF]),
    mietzuschuss:          num(f[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS]),
    mietzuschussMonate:    num(f[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS_MONATE]),
    afaGutachten:          num(f[KALK_STAMMDATEN_FIELDS.AFA_GUTACHTEN]),
    wertsteigerung:        num(f[KALK_STAMMDATEN_FIELDS.WERTSTEIGERUNG]),
    vermietungsModus,
    kappungsgrenze,
    indexmiete:            num(f[KALK_STAMMDATEN_FIELDS.INDEXMIETE]),
    letzteMietsteigerung:  f[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG] || null,
    grEst:                 num(f[KALK_STAMMDATEN_FIELDS.GRESt]),
    gebaeudeAnteil:        num(f[KALK_STAMMDATEN_FIELDS.GEBAEUDE_ANTEIL]),
    hgInflation:           num(f[KALK_STAMMDATEN_FIELDS.HG_INFLATION]),
    notizen:               f[KALK_STAMMDATEN_FIELDS.NOTIZEN] || '',
    quelle:                f[KALK_STAMMDATEN_FIELDS.QUELLE] || '',
  };
}

module.exports = async (req, res) => {
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const weId = req.query && req.query.weId;
  if (!weId || !weId.startsWith('rec')) return res.status(400).json({ error: 'weId fehlt oder ungültig' });

  try {
    if (req.method === 'GET') {
      // --- 1) Wohneinheit-Datensatz lesen ---
      const weResp = await airtable('get', TABLES.WOHNEINHEIT, { recordId: weId });
      if (!weResp || !weResp.fields) return res.status(404).json({ error: 'WE nicht gefunden' });
      const wf = weResp.fields || {};
      const we = {
        id: weResp.id,
        weNr:      wf[WE_FIELDS.WE_NR] || '',
        lage:      (Array.isArray(wf[WE_FIELDS.LAGE_BEZ]) ? wf[WE_FIELDS.LAGE_BEZ][0] : wf[WE_FIELDS.LAGE_BEZ]) || '',
        lageText:  (Array.isArray(wf[WE_FIELDS.LAGE_TEXT]) ? wf[WE_FIELDS.LAGE_TEXT][0] : wf[WE_FIELDS.LAGE_TEXT]) || '',
        kp:        num(wf[WE_FIELDS.KAUFPREIS]),
        qm:        num(wf[WE_FIELDS.QM]),
        kaltmiete: num(wf[WE_FIELDS.KALTMIETE]),
        qmPreis:   num(wf[WE_FIELDS.QM_PREIS]),
      };

      // --- 2) Stellplätze + Mietvertrag-Info parallel ---
      const [stellplaetze, vertragInfo, kalkRec] = await Promise.all([
        loadStellplaetzeForWE(weId),
        loadMietvertragInfoForWE(weId),
        loadKalkStammdatenForWE(weId),
      ]);

      // Stellplatz-Aggregat: Kaufpreis-Summe + Miete (Mietvertrag hat Vorrang, sonst alte Spalte)
      const stpKaufpreisSumme = stellplaetze.reduce((s, x) => s + (x.kaufpreis || 0), 0);
      const stpAlteMieteSumme = stellplaetze.reduce((s, x) => s + (x.mieteMo || 0), 0);
      const stpMieteEffektiv = vertragInfo.stellplatzMietsumme > 0 ? vertragInfo.stellplatzMietsumme : stpAlteMieteSumme;

      // Vermietungs-Status: vermietet wenn Vertrag vorhanden ODER Kaltmiete > 0 in WE
      // (Excel-Werte berücksichtigen, falls Mietvertrag-Tabelle nicht gepflegt ist)
      const vermietet = vertragInfo.vertragVorhanden || (we.kaltmiete > 0);

      // Letzte Mietsteigerung: erst aus Kalk-Stammdaten (manuell gepflegt von Henry/Schenki),
      // sonst aus Mietvertrag-Tabelle (GUELTIG_AB || VERTRAGSBEGINN), sonst null.
      const kalkLetzte = (kalkRec && kalkRec.fields && kalkRec.fields[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG]) || null;
      const letzteMietsteigerung = kalkLetzte || vertragInfo.letzteMietsteigerung || null;
      const letzteMietsteigerungQuelle = kalkLetzte ? 'kalk-stammdaten' :
        (vertragInfo.letzteMietsteigerung ? 'mietvertrag' : 'unbekannt');

      return res.status(200).json({
        we,
        stellplaetze: {
          anzahl:        stellplaetze.length,
          kaufpreisSumme: stpKaufpreisSumme,
          mieteMoSumme:   stpMieteEffektiv,
          mieteMoQuelle:  vertragInfo.stellplatzMietsumme > 0 ? 'mietvertrag' : (stpAlteMieteSumme > 0 ? 'stellplatz-alt' : 'keine'),
          details:        stellplaetze,
        },
        vermietung: {
          status:                 vermietet ? 'vermietet' : 'leer',
          vertragVorhanden:       vertragInfo.vertragVorhanden,
          letzteMietsteigerung,            // ISO-Date oder null
          letzteMietsteigerungQuelle,      // 'kalk-stammdaten' | 'mietvertrag' | 'unbekannt'
        },
        kalkStammdaten: kalkStammRecordToApi(kalkRec),
      });
    }

    if (req.method === 'PUT') {
      // Schreibrechte: nur Admin
      if (session.rolle !== 'Admin') {
        return res.status(403).json({ error: 'Nur Admins dürfen Stammdaten ändern.' });
      }
      const body = await readBody(req);
      if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body fehlt' });

      // Existierenden Datensatz finden (egal welcher Status)
      const existing = await loadKalkStammdatenForWE(weId);

      // Body → Airtable-Field-IDs (nur gesetzte Felder)
      const fields = {};
      if (body.status !== undefined)                fields[KALK_STAMMDATEN_FIELDS.STATUS]               = body.status;
      if (body.hausverwaltung !== undefined)        fields[KALK_STAMMDATEN_FIELDS.HAUSVERWALTUNG]       = num(body.hausverwaltung);
      if (body.hausgeldRuecklage !== undefined)     fields[KALK_STAMMDATEN_FIELDS.HAUSGELD_RUECKLAGE]   = num(body.hausgeldRuecklage);
      if (body.mietverwaltungDefault !== undefined) fields[KALK_STAMMDATEN_FIELDS.MIETVERWALTUNG_DEF]   = num(body.mietverwaltungDefault);
      if (body.mietzuschuss !== undefined)          fields[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS]         = num(body.mietzuschuss);
      if (body.mietzuschussMonate !== undefined)    fields[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS_MONATE]  = num(body.mietzuschussMonate);
      if (body.afaGutachten !== undefined)          fields[KALK_STAMMDATEN_FIELDS.AFA_GUTACHTEN]        = num(body.afaGutachten);
      if (body.wertsteigerung !== undefined)        fields[KALK_STAMMDATEN_FIELDS.WERTSTEIGERUNG]       = num(body.wertsteigerung);
      if (body.vermietungsModus !== undefined)      fields[KALK_STAMMDATEN_FIELDS.VERMIETUNGS_MODUS]    = body.vermietungsModus;
      if (body.kappungsgrenze !== undefined)        fields[KALK_STAMMDATEN_FIELDS.KAPPUNGSGRENZE]       = body.kappungsgrenze;
      if (body.indexmiete !== undefined)            fields[KALK_STAMMDATEN_FIELDS.INDEXMIETE]           = num(body.indexmiete);
      if (body.letzteMietsteigerung !== undefined)  fields[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG] = body.letzteMietsteigerung || null;
      if (body.grEst !== undefined)                 fields[KALK_STAMMDATEN_FIELDS.GRESt]                = num(body.grEst);
      if (body.gebaeudeAnteil !== undefined)        fields[KALK_STAMMDATEN_FIELDS.GEBAEUDE_ANTEIL]      = num(body.gebaeudeAnteil);
      if (body.hgInflation !== undefined)           fields[KALK_STAMMDATEN_FIELDS.HG_INFLATION]         = num(body.hgInflation);
      if (body.notizen !== undefined)               fields[KALK_STAMMDATEN_FIELDS.NOTIZEN]              = body.notizen || '';

      // Quelle automatisch setzen: "App-Edit {VertrieblerName} {YYYY-MM-DD}"
      const datum = new Date().toISOString().slice(0, 10);
      fields[KALK_STAMMDATEN_FIELDS.QUELLE] = `App-Edit ${session.email || 'unbekannt'} ${datum}`;

      let updatedRec;
      if (existing) {
        if (body.status === KALK_STATUS_AKTIV) {
          await archiveOtherAktivForWE(weId, existing.id);
        }
        updatedRec = await airtable('update', TABLES.KALK_STAMMDATEN, { recordId: existing.id, fields });
      } else {
        // Neu anlegen — wenn keiner existiert
        if (body.status === KALK_STATUS_AKTIV) {
          await archiveOtherAktivForWE(weId, null);
        }
        const createFields = Object.assign({}, fields, {
          [KALK_STAMMDATEN_FIELDS.BEZEICHNUNG]: body.bezeichnung || `WE ${weId.slice(-6)}`,
          [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]: [weId],
        });
        updatedRec = await airtable('create', TABLES.KALK_STAMMDATEN, { fields: createFields });
      }
      return res.status(200).json({ ok: true, kalkStammdaten: kalkStammRecordToApi(updatedRec) });
    }

    return methodNotAllowed(res, ['GET', 'PUT']);
  } catch (e) {
    return sendError(res, e);
  }
};

// Archiviert alle Aktiv-Datensätze für eine WE außer dem aktuellen.
async function archiveOtherAktivForWE(weId, exceptId) {
  try {
    const recs = await listAll(TABLES.KALK_STAMMDATEN, {
      fields: [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT, KALK_STAMMDATEN_FIELDS.STATUS],
    }, 1000);
    const others = recs.filter(r => {
      if (r.id === exceptId) return false;
      const s = r.fields && r.fields[KALK_STAMMDATEN_FIELDS.STATUS];
      const name = s && typeof s === 'object' ? s.name : s || '';
      if (name !== KALK_STATUS_AKTIV) return false;
      const link = (r.fields && r.fields[KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]) || [];
      return Array.isArray(link) && link.some(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        return id === weId;
      });
    });
    for (const r of others) {
      await airtable('update', TABLES.KALK_STAMMDATEN, {
        recordId: r.id,
        fields: { [KALK_STAMMDATEN_FIELDS.STATUS]: KALK_STATUS_ARCHIV },
      });
    }
  } catch (e) {
    console.error('archiveOtherAktivForWE failed:', e.message);
  }
}
