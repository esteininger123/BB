// GET /api/wohneinheiten — Liste freier Wohneinheiten (B&B Immo GmbH).
//
// Filter: {Status} = 'Vermarktung / Im Verkauf' UND {Maklerfirma} = 'B&B Immo GmbH'

const { verifySession } = require('./_lib/auth');
const { airtable, listAll } = require('./_lib/airtable');
const { methodNotAllowed, sendError } = require('./_lib/http');
const { TABLES, WE_FIELDS, PROJEKT_FIELDS, WE_STATUS_VERMARKTUNG, MAKLER_BUB } = require('./_lib/tables');
const { weRecordToApi } = require('./_lib/mappers');

// Versucht Projekt-Namen aus den verlinkten Records zu laden.
// Toleriert Fehler (z.B. wenn Projekt-Tabelle anders heißt) und liefert leeres Mapping.
// Mapping: Code aus Airtable → kundenfreundlicher Projekt-Name.
// Erweiterbar wenn neue Projekte dazukommen.
const PROJEKT_PRETTY = {
  'BRUCH_HEID_21':     'Heidelberger Str. 21, Bruchsal',
  'WES_RHEIN 290/292': 'Wesseling, Rheinstr. 290+292',
};

function beautifyProjektName(raw) {
  if (!raw) return '';
  // "PR: 17, WES_RHEIN 290/292" → "WES_RHEIN 290/292"
  const stripped = String(raw).replace(/^PR:\s*\d+,\s*/, '').trim();
  return PROJEKT_PRETTY[stripped] || stripped;
}

// Mapping Objekt-ID → Projekt-Name (übergeordnete Projekt-Ebene).
// 1 Projekt kann mehrere Objekte enthalten (z.B. Wesseling = 290 + 292).
async function loadProjektNames(objektIds) {
  const ids = [...new Set(objektIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const objektTable = process.env.PROJEKT_TABLE_ID || TABLES.PROJEKT;
  if (!objektTable) return {};
  try {
    const formula = 'OR(' + ids.map(id => `RECORD_ID()='${id}'`).join(',') + ')';
    // Aus jedem Objekt-Record holen wir den Projekt-Link (mit embedded {id, name}).
    const records = await listAll(objektTable, {
      filterByFormula: formula,
      fields: [PROJEKT_FIELDS.PROJEKT_LINK],
      maxRecords: ids.length
    }, ids.length);
    const map = {};
    records.forEach(r => {
      const f = r.fields || {};
      const projektLink = f[PROJEKT_FIELDS.PROJEKT_LINK];
      let rawName = '';
      if (Array.isArray(projektLink) && projektLink.length > 0) {
        const first = projektLink[0];
        rawName = (first && first.name) || (typeof first === 'string' ? first : '');
      }
      map[r.id] = beautifyProjektName(rawName);
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
    // Status ist Single-Select → exakter Vergleich.
    // Firma-Feld auf der Wohneinheit ist ein Lookup vom Projekt → "Firma (from Projekt) (from Objekt)".
    // Lookups geben Arrays zurück → FIND() + ARRAYJOIN(). Auch Trailing-Spaces wie
    // "B&B Immo GmbH  " sind dank FIND() unproblematisch.
    //
    // Zusätzlich beschränken auf das aktive Verkaufs-Projekt (Heidelberger Str. 21).
    // Wir filtern via Substring auf den Objekt-Link-Text — robust gegen Umbenennungen.
    // Wenn weitere Projekte zugelassen werden sollen: WOHNEINHEIT_OBJEKT_FILTER setzen
    // (kommagetrennte Substring-Liste).
    // Default-Filter: Heidelberger Str. (Bruchsal) + Wesseling — beide aktiv für Vertriebs-Calls.
    // Überschreibbar via Vercel-Env-Var WOHNEINHEIT_OBJEKT_FILTER (kommagetrennt).
    const objektFilterRaw = process.env.WOHNEINHEIT_OBJEKT_FILTER || 'Heidelberger,Wesseling';
    const objektTokens = objektFilterRaw.split(',').map(s => s.trim()).filter(Boolean);
    // Wir filtern im {Titel}-Feld (Formel: "WE: X, Lage, Straße Nr, PLZ Ort"), weil
    // dort die echte Ortsangabe steht. Das verlinkte Objekt-Feld enthält nur den
    // Objekt-Code wie "Obj: WES_RHEIN 290, 14" — da würde 'Wesseling' nicht matchen.
    const objektFormula = objektTokens.length === 1
      ? `FIND('${objektTokens[0]}', {Titel})>0`
      : objektTokens.length > 1
        ? 'OR(' + objektTokens.map(t => `FIND('${t}', {Titel})>0`).join(', ') + ')'
        : 'TRUE()';

    const formula = `AND({Status}='${WE_STATUS_VERMARKTUNG}', FIND('${MAKLER_BUB}', ARRAYJOIN({Firma (from Projekt) (from Objekt)}))>0, ${objektFormula})`;

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
