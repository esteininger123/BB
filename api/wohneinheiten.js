// GET /api/wohneinheiten — Liste freier Wohneinheiten (B&B Immo GmbH).
//
// Filter: {Status} = 'Vermarktung / Im Verkauf' UND {Maklerfirma} = 'B&B Immo GmbH'

const { verifySession } = require('./_lib/auth');
const { airtable, listAll } = require('./_lib/airtable');
const { methodNotAllowed, sendError } = require('./_lib/http');
const {
  TABLES, WE_FIELDS, PROJEKT_FIELDS, PROJEKT_HEAD_FIELDS,
  KALK_STAMMDATEN_FIELDS, KALK_STATUS_AKTIV,
  WE_STATUS_VERMARKTUNG, MAKLER_BUB
} = require('./_lib/tables');
const { weRecordToApi } = require('./_lib/mappers');

// Versucht Projekt-Namen aus den verlinkten Records zu laden.
// Toleriert Fehler (z.B. wenn Projekt-Tabelle anders heißt) und liefert leeres Mapping.
// Mapping: Projekt-Code aus Airtable → kundenfreundlicher Projekt-Name.
const PROJEKT_PRETTY = {
  'BRUCH_HEID_21':       'Heidelberger Str. 21, Bruchsal',
  'WES_RHEIN 290/292':   'Wesseling, Rheinstr. 290+292',
  'BAD_NORDRING_10':     'Sandweier (Baden-Baden), Nordring 10',
  'LIM_ALTENS_5':        'Limeshain, Altenstädter Weg 5',
  'WALDK_THEOD':         'Waldkirch, Theodor-Heuss-Str. 13+15',
  'KA_HEIN_6':           'Karlsruhe, Heinstraße 6',
  'PFAFF_GEO-HIP_28':    'Pfaffenhofen, Georg-Hipp-Str. 28',
  'LAHR_GAERTN_20':      'Lahr, Gärtnerstraße 20',
  'SINZ_KORNBL_7':       'Sinzheim, Kornblumenweg 7',
};

function beautifyProjektName(rawNameOrCode) {
  if (!rawNameOrCode) return '';
  // Akzeptiert "PR: 17, WES_RHEIN 290/292" oder direkt "WES_RHEIN 290/292"
  const stripped = String(rawNameOrCode).replace(/^PR:\s*\d+,\s*/, '').trim();
  return PROJEKT_PRETTY[stripped] || stripped;
}

// Mapping Objekt-ID → Projekt-Name.
// Schritt 1: Objekte laden → für jedes Objekt die Projekt-IDs sammeln (Linked-Records sind
//            in der Airtable-REST-API reine String-IDs).
// Schritt 2: Projekte aus PROJEKT_HEAD-Tabelle laden → Code-Field zu lesbarem Namen mappen.
// Schritt 3: Objekt-ID → Projekt-Name verbinden.
async function loadProjektNames(objektIds) {
  const ids = [...new Set(objektIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const objektTable = process.env.PROJEKT_TABLE_ID || TABLES.PROJEKT;
  if (!objektTable) return {};
  try {
    // --- Schritt 1: Objekt-Records → Projekt-Link-ID ---
    const objektFormula = 'OR(' + ids.map(id => `RECORD_ID()='${id}'`).join(',') + ')';
    const objektRecords = await listAll(objektTable, {
      filterByFormula: objektFormula,
      fields: [PROJEKT_FIELDS.PROJEKT_LINK],
      maxRecords: ids.length
    }, ids.length);

    const objektToProjektId = {};
    const projektIds = new Set();
    objektRecords.forEach(r => {
      const f = r.fields || {};
      const projektLink = f[PROJEKT_FIELDS.PROJEKT_LINK];
      let pid = null;
      if (Array.isArray(projektLink) && projektLink.length > 0) {
        const first = projektLink[0];
        // REST-API: String-ID. MCP-Variante: {id, name}-Object → defensiv beides.
        pid = (first && typeof first === 'object' && first.id) ? first.id
            : (typeof first === 'string' ? first : null);
      }
      if (pid) {
        objektToProjektId[r.id] = pid;
        projektIds.add(pid);
      }
    });

    if (projektIds.size === 0) return {};

    // --- Schritt 2: Projekte aus PROJEKT_HEAD laden ---
    const pidArr = Array.from(projektIds);
    const projektFormula = 'OR(' + pidArr.map(id => `RECORD_ID()='${id}'`).join(',') + ')';
    const projektRecords = await listAll(TABLES.PROJEKT_HEAD, {
      filterByFormula: projektFormula,
      fields: [PROJEKT_HEAD_FIELDS.CODE, PROJEKT_HEAD_FIELDS.PRIMARY],
      maxRecords: pidArr.length
    }, pidArr.length);

    const projektIdToName = {};
    projektRecords.forEach(r => {
      const f = r.fields || {};
      const raw = f[PROJEKT_HEAD_FIELDS.CODE] || f[PROJEKT_HEAD_FIELDS.PRIMARY] || '';
      projektIdToName[r.id] = beautifyProjektName(raw);
    });

    // --- Schritt 3: Objekt-ID → Projekt-Name ---
    const map = {};
    Object.keys(objektToProjektId).forEach(objektId => {
      const pid = objektToProjektId[objektId];
      map[objektId] = projektIdToName[pid] || '';
    });
    return map;
  } catch (e) {
    console.error('loadProjektNames failed:', e.message);
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  try {
    // Iter 41.9 (17.05.2026) — Henry-Feedback:
    // Datenquelle des Kalkulators war zu breit (Makler-Einheiten + Eigennutzer-Verkäufe
    // erschienen mit). Neuer Filter: nur WEs, für die in Kalkulations-Stammdaten ein
    // Datensatz mit Status=Aktiv existiert. So entscheidet Henry pro WE explizit, ob
    // sie im KAV gezeigt wird.
    //
    // Step 1: Alle aktiven Stammdaten-Records laden → daraus die verlinkten WE-IDs sammeln.
    // Step 2: WE-Tabelle abfragen mit Vermarktung + Firma=B&B Immo + WE-ID in der Aktiv-Liste.

    // --- Step 1: aktive Stammdaten holen ---
    const stammdatenRecords = await listAll(TABLES.KALK_STAMMDATEN, {
      filterByFormula: `{${KALK_STAMMDATEN_FIELDS.STATUS}}='${KALK_STATUS_AKTIV}'`,
      fields: [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT],
      pageSize: 100
    }, 1000);

    const aktiveWeIds = new Set();
    stammdatenRecords.forEach(r => {
      const links = (r.fields || {})[KALK_STAMMDATEN_FIELDS.WOHNEINHEIT] || [];
      if (!Array.isArray(links)) return;
      links.forEach(link => {
        const id = (link && typeof link === 'object' && link.id) ? link.id : (typeof link === 'string' ? link : null);
        if (id) aktiveWeIds.add(id);
      });
    });

    // Wenn keine WE auf Aktiv → leeres Array zurückgeben (statt unfiltered alles laden).
    if (aktiveWeIds.size === 0) {
      return res.status(200).json([]);
    }

    // Status ist Single-Select → exakter Vergleich.
    // Firma-Feld auf der Wohneinheit ist ein Lookup vom Projekt → "Firma (from Projekt) (from Objekt)".
    // Lookups geben Arrays zurück → FIND() + ARRAYJOIN(). Auch Trailing-Spaces wie
    // "B&B Immo GmbH  " sind dank FIND() unproblematisch.
    //
    // Wenn doch ein Filter nötig ist (z.B. Demo-Modus), kann WOHNEINHEIT_OBJEKT_FILTER
    // als Env-Var gesetzt werden — kommagetrennte Substring-Liste auf {Titel}.
    const objektFilterRaw = process.env.WOHNEINHEIT_OBJEKT_FILTER || '';
    const objektTokens = objektFilterRaw.split(',').map(s => s.trim()).filter(Boolean);
    const objektFormula = objektTokens.length === 1
      ? `FIND('${objektTokens[0]}', {Titel})>0`
      : objektTokens.length > 1
        ? 'OR(' + objektTokens.map(t => `FIND('${t}', {Titel})>0`).join(', ') + ')'
        : 'TRUE()';

    // WE-ID-Filter aus aktiven Stammdaten
    const weIdArr = Array.from(aktiveWeIds);
    const weIdFormula = 'OR(' + weIdArr.map(id => `RECORD_ID()='${id}'`).join(', ') + ')';

    const formula = `AND({Status}='${WE_STATUS_VERMARKTUNG}', FIND('${MAKLER_BUB}', ARRAYJOIN({Firma (from Projekt) (from Objekt)}))>0, ${objektFormula}, ${weIdFormula})`;

    const fields = [
      WE_FIELDS.LAGE_BEZ,
      WE_FIELDS.WE_NR,
      WE_FIELDS.LAGE_TEXT,
      WE_FIELDS.KAUFPREIS,
      WE_FIELDS.QM,
      WE_FIELDS.KALTMIETE,
      WE_FIELDS.QM_PREIS,
      WE_FIELDS.PROJEKT
    ];

    const records = await listAll(TABLES.WOHNEINHEIT, {
      filterByFormula: formula,
      fields,
      pageSize: 100
    }, 2000);

    // Linked-Records kommen als String-IDs ODER als [{id, name}]-Objects — beides flatten.
    const projektIds = records.flatMap(r => {
      const links = (r.fields && r.fields[WE_FIELDS.PROJEKT]) || [];
      if (!Array.isArray(links)) return [];
      return links.map(x => (x && typeof x === 'object' && x.id) ? x.id : x).filter(Boolean);
    });
    const projektMap = await loadProjektNames(projektIds);

    const out = records.map(r => weRecordToApi(r, projektMap));
    // Frontend erwartet direktes Array.
    return res.status(200).json(out);
  } catch (e) {
    return sendError(res, e);
  }
};
