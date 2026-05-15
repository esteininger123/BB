// GET /api/wohneinheiten — Liste freier Wohneinheiten (B&B Immo GmbH).
//
// Filter: {Status} = 'Vermarktung / Im Verkauf' UND {Maklerfirma} = 'B&B Immo GmbH'

const { verifySession } = require('./_lib/auth');
const { airtable, listAll } = require('./_lib/airtable');
const { methodNotAllowed, sendError } = require('./_lib/http');
const { TABLES, WE_FIELDS, WE_STATUS_VERMARKTUNG, MAKLER_BUB } = require('./_lib/tables');
const { weRecordToApi } = require('./_lib/mappers');

// Versucht Projekt-Namen aus den verlinkten Records zu laden.
// Toleriert Fehler (z.B. wenn Projekt-Tabelle anders heißt) und liefert leeres Mapping.
async function loadProjektNames(projektIds) {
  const ids = [...new Set(projektIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const projektTable = process.env.PROJEKT_TABLE_ID || TABLES.PROJEKT;
  if (!projektTable) return {};
  try {
    const formula = 'OR(' + ids.map(id => `RECORD_ID()='${id}'`).join(',') + ')';
    const records = await listAll(projektTable, {
      filterByFormula: formula,
      maxRecords: ids.length
    }, ids.length);
    const map = {};
    records.forEach(r => {
      const f = r.fields || {};
      // Wir kennen das Primary-Field nicht — nehmen Name|Projekt|erstes String-Field als Heuristik
      const firstStringVal = f.Name || f.Projekt || Object.values(f).find(v => typeof v === 'string');
      map[r.id] = firstStringVal || '';
    });
    return map;
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  try {
    // Status ist Single-Select → exakter Vergleich.
    // Das Firma-Feld auf der Wohneinheit ist ein Lookup vom Projekt → "Firma (from Projekt) (from Objekt)".
    // Lookups geben Arrays zurück, daher FIND() + ARRAYJOIN(). Auch Trailing-Spaces wie
    // "B&B Immo GmbH  " sind dank FIND() unproblematisch.
    const formula = `AND({Status}='${WE_STATUS_VERMARKTUNG}', FIND('${MAKLER_BUB}', ARRAYJOIN({Firma (from Projekt) (from Objekt)}))>0)`;

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

    const projektIds = records.flatMap(r => {
      const links = (r.fields && r.fields[WE_FIELDS.PROJEKT]) || [];
      return Array.isArray(links) ? links : [];
    });
    const projektMap = await loadProjektNames(projektIds);

    const out = records.map(r => weRecordToApi(r, projektMap));
    // Frontend erwartet direktes Array.
    return res.status(200).json(out);
  } catch (e) {
    return sendError(res, e);
  }
};
