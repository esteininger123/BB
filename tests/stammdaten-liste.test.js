// Batch-Detail für die WE-Liste (09.09.2026) — /api/stammdaten/liste.
// Sichert: (1) buildWeDetail rechnet mit vorgeladenen Tabellen OHNE einen einzigen
// Airtable-Call (sonst reißt das Rate-Limit wieder), (2) das Ergebnis hat dieselbe
// Form wie der Einzel-GET, (3) parseIds filtert Müll und Duplikate.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Airtable-Wrapper VOR dem Laden der Module stubben: jeder echte Call = Testfehler.
const airtablePath = require.resolve('../api/_lib/airtable');
const calls = [];
require.cache[airtablePath] = {
  id: airtablePath, filename: airtablePath, loaded: true,
  exports: {
    airtable: async (method, table, params) => { calls.push({ method, table, params }); throw new Error('Airtable-Call im Batch-Pfad: ' + method + ' ' + table); },
    listAll: async (table, params) => { calls.push({ method: 'list', table, params }); throw new Error('Airtable-listAll im Batch-Pfad: ' + table); },
    escapeFormulaString: (s) => String(s),
  },
};

const {
  TABLES, WE_FIELDS, STELLPLATZ_FIELDS, MIETVERTRAG_FIELDS, KALK_STAMMDATEN_FIELDS, KALK_STATUS_AKTIV,
} = require('../api/_lib/tables');
const detail = require(path.join('..', 'api', 'stammdaten', '[weId].js'));
const liste = require('../api/stammdaten/liste.js');

const WE_ID = 'rechH1v5onqY0bO6H';   // WE 1 Meckesheim (Zahlen vom 08.09.2026)
const STP_ID = 'recY6GQnXDkAtO0jm';
const STAMM_ID = 'recr0NCI3zr4gB6us';

function weRec() {
  return { id: WE_ID, fields: {
    [WE_FIELDS.WE_NR]: '1', [WE_FIELDS.LAGE_BEZ]: ['UG Links'], [WE_FIELDS.LAGE_TEXT]: ['UG Links'],
    [WE_FIELDS.KAUFPREIS]: 128000, [WE_FIELDS.QM]: 41.38, [WE_FIELDS.KALTMIETE]: 250, [WE_FIELDS.QM_PREIS]: 3093,
    [WE_FIELDS.STELLPLATZ_BEDARF]: 'Ja', // 09.09.2026 — „Mieter wünscht Stellplatz"
  } };
}
function stplRecs() {
  return [{ id: STP_ID, fields: {
    [STELLPLATZ_FIELDS.TITEL]: 'StPl: 128, 5, Fläche', [STELLPLATZ_FIELDS.WE_LINK]: [{ id: WE_ID }],
    [STELLPLATZ_FIELDS.TYP]: 'Fläche', [STELLPLATZ_FIELDS.KAUFPREIS]: 8000, [STELLPLATZ_FIELDS.MIETKOSTEN]: 40,
  } }];
}
function mvRecs() {
  return [{ id: 'recMV0000000000001', fields: {
    [MIETVERTRAG_FIELDS.WE_LINK]: [{ id: WE_ID }], [MIETVERTRAG_FIELDS.STELLPLATZ_LINK]: [{ id: STP_ID }],
    [MIETVERTRAG_FIELDS.NEU_VERMIETETER_STELLPLATZ]: [{ id: STP_ID }],
    [MIETVERTRAG_FIELDS.KALTMIETE]: 250, [MIETVERTRAG_FIELDS.STELLPLATZMIETE]: 40,
    [MIETVERTRAG_FIELDS.STATUS_LOOKUP]: ['Aktiv'], [MIETVERTRAG_FIELDS.VERTRAGSBEGINN]: '2021-04-01',
    [MIETVERTRAG_FIELDS.GUELTIG_AB]: '2022-11-01',
  } }];
}
function kalkRecs() {
  return [{ id: STAMM_ID, fields: {
    [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]: [{ id: WE_ID }], [KALK_STAMMDATEN_FIELDS.STATUS]: KALK_STATUS_AKTIV,
    [KALK_STAMMDATEN_FIELDS.HAUSVERWALTUNG]: 30, [KALK_STAMMDATEN_FIELDS.HAUSGELD_RUECKLAGE]: 20.69,
    [KALK_STAMMDATEN_FIELDS.MIETVERWALTUNG_DEF]: 30, [KALK_STAMMDATEN_FIELDS.GEBAEUDE_ANTEIL]: 0.85,
    [KALK_STAMMDATEN_FIELDS.AFA_GUTACHTEN]: 0.0278, [KALK_STAMMDATEN_FIELDS.MIETE_BEI_VERKAUF]: 360,
    [KALK_STAMMDATEN_FIELDS.STELLPLATZ_MIETE_BEI_VERKAUF]: 40,
    [KALK_STAMMDATEN_FIELDS.VERMIETUNGS_MODUS]: 'Bestand', [KALK_STAMMDATEN_FIELDS.MARKTMIETE]: 12.5,
    [KALK_STAMMDATEN_FIELDS.MARKTPREIS_IS]: 2888, [KALK_STAMMDATEN_FIELDS.MARKTPREIS_HD]: 3650,
    [KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG]: '2026-09-01', [KALK_STAMMDATEN_FIELDS.WE_VERMIETUNGSSTATUS]: ['Vermietet'],
    [KALK_STAMMDATEN_FIELDS.SUBV_MAX_MONATE]: 72, [KALK_STAMMDATEN_FIELDS.KAPPUNGSGRENZE]: '20 % alle 3 Jahre',
  } }];
}

const session = { email: 'henry@wackersolutions.de', rolle: 'Admin' };

test('buildWeDetail mit Preload: kein Airtable-Call, Detail-Form wie Einzel-GET', async () => {
  calls.length = 0;
  const r = await detail.buildWeDetail({
    weId: WE_ID, weIdRaw: WE_ID, variante: null, session,
    pre: { weRec: weRec(), stplRecs: stplRecs(), mvRecs: mvRecs(), kalkRecs: kalkRecs(), provisionPct: 0, skipWriteBack: true },
  });
  assert.strictEqual(calls.length, 0, 'Batch-Pfad darf Airtable nicht anfassen: ' + JSON.stringify(calls));
  assert.strictEqual(r.status, 200);
  const b = r.body;
  assert.strictEqual(b.we.id, WE_ID);
  assert.strictEqual(b.we.kp, 128000);
  assert.strictEqual(b.we.qm, 41.38);
  assert.strictEqual(b.we.stellplatzBedarf, true, 'Bedarf an Stellplatz = Ja muss als true im Batch-Detail ankommen');
  assert.strictEqual(b.stellplaetze.kaufpreisSumme, 8000);
  assert.strictEqual(b.stellplaetze.mieteMoSumme, 40);
  assert.strictEqual(b.stellplaetze.details.length, 1);
  assert.strictEqual(b.vermietung.status, 'vermietet');
  assert.strictEqual(b.kalkStammdaten.mieteBeiVerkauf, 360);
  assert.ok(Array.isArray(b.derived.subventionPhasen), 'derived.subventionPhasen fehlt');
  assert.ok(b.derived.subventionPhasen.length >= 1, 'WE 1 muss eine Subventionsphase haben');
  assert.ok(b.derived.subventionTotalEur > 0);
  // Genau die Felder, die der Einfache Rechner (_rechnerBasis) liest
  for (const k of ['we', 'stellplaetze', 'vermietung', 'kalkStammdaten', 'derived']) assert.ok(b[k], 'Feld fehlt: ' + k);
});

test('buildWeDetail ohne Preload würde Airtable rufen (Sanity des Stubs)', async () => {
  calls.length = 0;
  const r = await detail.buildWeDetail({ weId: WE_ID, weIdRaw: WE_ID, variante: null, session, pre: {} })
    .catch(e => ({ status: 500, body: { error: e.message } }));
  assert.ok(calls.length > 0);
  assert.notStrictEqual(r.status, 200);
});

test('Extern ohne Freigabe → 404 auch im Batch-Pfad', async () => {
  const r = await detail.buildWeDetail({
    weId: WE_ID, weIdRaw: WE_ID, variante: null,
    session: { email: 'x@y.de', rolle: 'Extern', vertrieblerId: 'recV00000000000001' },
    pre: { weRec: weRec(), stplRecs: stplRecs(), mvRecs: mvRecs(), kalkRecs: kalkRecs(), provisionPct: 0.05, skipWriteBack: true },
  });
  assert.strictEqual(r.status, 404);
});

test('parseIds: Duplikate, Müll und Varianten-IDs', () => {
  const ids = liste.parseIds(' rechH1v5onqY0bO6H, rechH1v5onqY0bO6H ,foo,recof0GW7Qp5YfL7G~recr0NCI3zr4gB6us,,<script>');
  assert.deepStrictEqual(ids, ['rechH1v5onqY0bO6H', 'recof0GW7Qp5YfL7G~recr0NCI3zr4gB6us']);
  assert.deepStrictEqual(liste.parseIds(''), []);
  assert.deepStrictEqual(liste.parseIds(undefined), []);
});
