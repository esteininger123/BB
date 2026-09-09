// GET /api/stammdaten/liste?weIds=recA,recB,recC~recStamm,…
//
// 09.09.2026 (Henry) — Batch-Detail für die WE-Liste („Wohnungen").
//
// Problem vorher: Die Liste holte pro aktiver WE einzeln /api/stammdaten/:weId —
// ~50 parallele Calls, jeder mit drei kompletten Tabellen-Scans (Stellplatz,
// Mietvertrag, Kalk-Stammdaten). Airtable erlaubt 5 Requests/s pro Base →
// 429 RATE_LIMIT_REACHED → zufällige Zeilen „Stammdaten nicht ladbar" (bzw.
// vorher still falsche Engine-Werte, weil der Mietvertrag-Loader leer zurückkam).
//
// Jetzt: die drei Tabellen EINMAL laden, die WE-Records in Blöcken per
// RECORD_ID()-Formel, dann pro WE dieselbe Logik wie der Einzel-GET
// (buildWeDetail aus [weId].js) rein in-process. ~10–15 Airtable-Calls statt ~600.
// Antwort: { anzahl, byId: { [weIdRaw]: <Detail wie /api/stammdaten/:weId> | { error, status } } }
//
// Kein Auto-Subv-Write-back hier (skipWriteBack) — das erledigt der Cron refresh-all.

const { verifySession, isExtern } = require('../_lib/auth');
const { listAll } = require('../_lib/airtable');
const { loadProvisionPct } = require('../_lib/extern');
const { methodNotAllowed, sendError } = require('../_lib/http');
const { TABLES } = require('../_lib/tables');
const { parseWeId, loadVariante } = require('../_lib/we-variante');
const detail = require('./[weId].js');

const ID_RE = /^rec[A-Za-z0-9]{14}(~rec[A-Za-z0-9]{14})?$/;
const MAX_IDS = 300;
const WE_CHUNK = 40; // RECORD_ID()-OR-Formel pro Request (URL-Länge)

function parseIds(raw) {
  const out = [];
  const seen = new Set();
  String(raw || '').split(',').forEach(x => {
    const id = x.trim();
    if (!ID_RE.test(id) || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out.slice(0, MAX_IDS);
}

// WE-Records in Blöcken laden (statt 1 GET pro WE).
async function loadWeRecords(baseIds) {
  const byId = {};
  for (let i = 0; i < baseIds.length; i += WE_CHUNK) {
    const chunk = baseIds.slice(i, i + WE_CHUNK);
    const formula = 'OR(' + chunk.map(id => `RECORD_ID()='${id}'`).join(',') + ')';
    const recs = await listAll(TABLES.WOHNEINHEIT, { filterByFormula: formula, pageSize: 100 }, 500);
    recs.forEach(r => { byId[r.id] = r; });
  }
  return byId;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const ids = parseIds(req.query && req.query.weIds);
  if (ids.length === 0) return res.status(400).json({ error: 'weIds fehlt oder ungültig' });

  try {
    const baseIds = Array.from(new Set(ids.map(x => parseWeId(x).weId).filter(Boolean)));
    const [pre, weById, provisionPct] = await Promise.all([
      detail.loadPreloadedTables(),
      loadWeRecords(baseIds),
      isExtern(session) ? loadProvisionPct(session) : Promise.resolve(0),
    ]);

    const byId = {};
    for (const weIdRaw of ids) {
      const { weId, variantId } = parseWeId(weIdRaw);
      if (!weId) { byId[weIdRaw] = { error: 'weId ungültig', status: 400 }; continue; }
      try {
        const variante = variantId ? await loadVariante(weId, variantId) : null;
        if (variantId && !variante) { byId[weIdRaw] = { error: 'Variante nicht gefunden', status: 404 }; continue; }
        const r = await detail.buildWeDetail({
          weId, weIdRaw, variante, session,
          pre: Object.assign({ weRec: weById[weId] || null, provisionPct, skipWriteBack: true }, pre),
        });
        byId[weIdRaw] = (r.status === 200) ? r.body : { error: (r.body && r.body.error) || 'Fehler', status: r.status };
      } catch (e) {
        byId[weIdRaw] = { error: (e && e.message) || 'Fehler', status: (e && e.status) || 500 };
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ anzahl: ids.length, byId });
  } catch (e) {
    return sendError(res, e);
  }
};

module.exports.parseIds = parseIds;
