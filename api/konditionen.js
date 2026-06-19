// GET  /api/konditionen  — Finanzierungs-Konditionen (jeder eingeloggte User)
// PUT  /api/konditionen  — Konditionen setzen (nur Admin, validiert)
//
// Persistenz: Airtable App-Konfig, 1 Record (Key="konditionen"), JSON-Blob.
// ACHTUNG: KONDITIONEN_DEFAULTS synchron mit public/kalkulator.js halten.

const { airtable, listAll, escapeFormulaString } = require('./_lib/airtable');
const { verifySession, requireAdminVerified } = require('./_lib/auth');
const { readBody, methodNotAllowed, sendError } = require('./_lib/http');
const { TABLES, APP_KONFIG_FIELDS, APP_KONFIG_KEY_KONDITIONEN } = require('./_lib/tables');

const KONDITIONEN_DEFAULTS = {
  version: 1,
  schwelleKaufpreis: 150000,
  baender: {
    klein: { ohneKnk: { zins: 0.045, tilgung: 0.01 }, mitKnk: { zins: 0.048, tilgung: 0.01 } },
    gross: { ohneKnk: { zins: 0.045, tilgung: 0.01 }, mitKnk: { zins: 0.048, tilgung: 0.01 } },
  },
};

const BANDS = ['klein', 'gross'];
const VARIANTS = ['ohneKnk', 'mitKnk'];

function _zahl(v) { return typeof v === 'number' && isFinite(v); }

function validateKonditionen(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Kein Objekt' };
  if (!_zahl(obj.schwelleKaufpreis) || obj.schwelleKaufpreis <= 0) return { ok: false, error: 'Schwelle muss > 0 sein' };
  if (!obj.baender || typeof obj.baender !== 'object') return { ok: false, error: 'baender fehlt' };
  for (const b of BANDS) {
    const band = obj.baender[b];
    if (!band || typeof band !== 'object') return { ok: false, error: `Band ${b} fehlt` };
    for (const v of VARIANTS) {
      const z = band[v];
      if (!z || typeof z !== 'object') return { ok: false, error: `${b}.${v} fehlt` };
      if (!_zahl(z.zins) || z.zins < 0 || z.zins > 0.20) return { ok: false, error: `${b}.${v}.zins ungültig (0–20 %)` };
      if (!_zahl(z.tilgung) || z.tilgung < 0 || z.tilgung > 0.10) return { ok: false, error: `${b}.${v}.tilgung ungültig (0–10 %)` };
    }
  }
  // Normalisiertes, sauberes Objekt zurück (keine Fremdfelder)
  const clean = { version: 1, schwelleKaufpreis: obj.schwelleKaufpreis, baender: {} };
  for (const b of BANDS) {
    clean.baender[b] = {};
    for (const v of VARIANTS) {
      clean.baender[b][v] = { zins: obj.baender[b][v].zins, tilgung: obj.baender[b][v].tilgung };
    }
  }
  return { ok: true, value: clean };
}

async function findRecord() {
  const formula = `{Key}='${escapeFormulaString(APP_KONFIG_KEY_KONDITIONEN)}'`;
  const recs = await listAll(TABLES.APP_KONFIG, { filterByFormula: formula, maxRecords: 1 }, 1);
  return recs[0] || null;
}

function parseStored(rec) {
  if (!rec || !rec.fields) return null;
  const raw = rec.fields[APP_KONFIG_FIELDS.JSON];
  if (!raw || typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const session = verifySession(req);
    if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
    try {
      const rec = await findRecord();
      const stored = parseStored(rec);
      const v = stored ? validateKonditionen(stored) : { ok: false };
      const val = v.ok ? v.value : KONDITIONEN_DEFAULTS;
      const aktualisiert = (rec && rec.fields && rec.fields[APP_KONFIG_FIELDS.AKTUALISIERT]) || '';
      return res.status(200).json({ ...val, _aktualisiert: aktualisiert });
    } catch (e) {
      // Resilienz: nie blockieren — Defaults liefern
      return res.status(200).json({ ...KONDITIONEN_DEFAULTS, _aktualisiert: '', _fallback: true });
    }
  }

  if (req.method === 'PUT') {
    const session = await requireAdminVerified(req, res);
    if (!session) return; // requireAdminVerified hat schon geantwortet
    try {
      const body = await readBody(req);
      const v = validateKonditionen(body);
      if (!v.ok) return res.status(400).json({ error: v.error });
      const stamp = `${new Date().toISOString()} · ${session.email || ''}`;
      const fields = {
        [APP_KONFIG_FIELDS.KEY]: APP_KONFIG_KEY_KONDITIONEN,
        [APP_KONFIG_FIELDS.JSON]: JSON.stringify(v.value),
        [APP_KONFIG_FIELDS.AKTUALISIERT]: stamp,
      };
      const rec = await findRecord();
      if (rec) await airtable('update', TABLES.APP_KONFIG, { recordId: rec.id, fields });
      else await airtable('create', TABLES.APP_KONFIG, { fields });
      return res.status(200).json({ ...v.value, _aktualisiert: stamp });
    } catch (e) {
      return sendError(res, e);
    }
  }

  return methodNotAllowed(res, ['GET', 'PUT']);
};

module.exports.validateKonditionen = validateKonditionen;
module.exports.KONDITIONEN_DEFAULTS = KONDITIONEN_DEFAULTS;
