// 10.11.2026 (Henry / Domi Seitz, Kitzingen A6): Der Marktpreisvergleich im Rechner
// („Marktpreis pro m² laut Homeday / Einkaufspreis pro m² / Einkaufspreis unter Marktwert")
// darf nur erscheinen, wenn der Preis, den der Nutzer sieht, unter dem Portal-Wert liegt.
// Für Externe ist das der Kundenpreis inkl. Provisionsaufschlag, nicht der interne Abgabepreis.
// Fall A6: intern 168.930 € / 56,31 m² = 3.000 €/m² < Homeday 3.100 → Block sichtbar;
// extern 180.755 € = 3.210 €/m² > 3.100 → Block muss weg (quelle 'ueber-markt').
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { TABLES, WE_FIELDS, KALK_STAMMDATEN_FIELDS, KALK_STATUS_AKTIV } = require('../api/_lib/tables');

const EXT = 'recExternX00000001';
const WE = 'recWEmarkt00000001';
let SESSION = null;

function stub(relPath, exports) {
  const abs = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports };
}

const WE_REC = { id: WE, fields: {
  [WE_FIELDS.WE_NR]: 'A6',
  [WE_FIELDS.LAGE_BEZ]: 'WE: A6, 1. OG, Mozartstraße 4A, 97318 Kitzingen',
  [WE_FIELDS.KAUFPREIS]: 168930,
  [WE_FIELDS.QM]: 56.31,
  [WE_FIELDS.KALTMIETE]: 500,
  [WE_FIELDS.STATUS]: { name: 'Vermarktung / Im Verkauf' },
} };
const STAMM = [{ id: 'recStammMarkt00001', fields: {
  [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]: [{ id: WE }],
  [KALK_STAMMDATEN_FIELDS.STATUS]: { name: KALK_STATUS_AKTIV },
  [KALK_STAMMDATEN_FIELDS.EXTERN_FREIGABE]: true,
  [KALK_STAMMDATEN_FIELDS.EXTERN_EXKLUSIV]: [],
  [KALK_STAMMDATEN_FIELDS.MIETE_BEI_VERKAUF]: 500,
  [KALK_STAMMDATEN_FIELDS.GEBAEUDE_ANTEIL]: 0.85,
  [KALK_STAMMDATEN_FIELDS.MARKTMIETE]: 11,
  [KALK_STAMMDATEN_FIELDS.MARKTPREIS_HD]: 3100,
} }];

stub('api/_lib/auth.js', {
  verifySession: () => SESSION,
  isExtern: (s) => !!(s && s.rolle === 'Extern'),
  requireSafeOrigin: () => true,
});
stub('api/_lib/airtable.js', {
  airtable: async () => ({ fields: {} }),
  listAll: async (table) => {
    if (table === TABLES.KALK_STAMMDATEN) return STAMM;
    if (table === TABLES.WOHNEINHEIT) return [WE_REC];
    return [];
  },
  escapeFormulaString: (s) => String(s),
});

const detail = require(path.join('..', 'api', 'stammdaten', '[weId].js'));
const SESS_EXTERN = { email: 'd.seitz@extern.de', rolle: 'Extern', vertrieblerId: EXT };
const SESS_INTERN = { email: 'intern@bub-immo.de', rolle: 'Vertriebler', vertrieblerId: 'recIntern000000001' };

function detailFuer(session) {
  SESSION = session;
  return detail.buildWeDetail({
    weId: WE, weIdRaw: WE, variante: null, session,
    pre: { weRec: WE_REC, stplRecs: [], mvRecs: [], kalkRecs: STAMM, provisionPct: 0.07, skipWriteBack: true },
  });
}

test('intern: 3.000 €/m² unter Homeday 3.100 → Marktpreis wird ausgewiesen', async () => {
  const r = await detailFuer(SESS_INTERN);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.we.kp, 168930);
  assert.strictEqual(r.body.derived.marktpreisGemittelt, 3100);
  assert.strictEqual(r.body.derived.marktpreisGemitteltQuelle, 'homeday');
});

test('extern: Kundenpreis 3.210 €/m² über Homeday 3.100 → kein Marktpreis (ueber-markt)', async () => {
  const r = await detailFuer(SESS_EXTERN);
  assert.strictEqual(r.status, 200);
  // 2 % Standard-Abschlag → 165.551, plus 7 % Provision auf 165.551 = 11.589 → 177.140 = 3.146 €/m²
  assert.ok(r.body.we.kp / r.body.we.qm > 3100, 'Kundenpreis je m² liegt über dem Portal-Wert');
  assert.strictEqual(r.body.derived.marktpreisGemittelt, 0);
  assert.strictEqual(r.body.derived.marktpreisGemitteltQuelle, 'ueber-markt');
});
