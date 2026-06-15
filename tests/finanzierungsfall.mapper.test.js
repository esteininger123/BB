const test = require('node:test');
const assert = require('node:assert');
const { finanzierungsfallBodyToFields } = require('../api/_lib/mappers');
const { FINANZIERUNGSFALL_FIELDS: F, FINANZIERUNGSFALL_STATUS_START } = require('../api/_lib/tables');

const baseBody = {
  kundeId: 'recKUNDE000000001',
  weId: 'recWE0000000000001',
  snapshotId: 'recSNAP00000000001',
  kundeName: 'Mustermann, Max',
  weBezeichnung: 'WE 12, Rheinstraße 292',
  snapshot: { kaufpreis: 200000, wohnflaeche: 60, kaltmiete: 600, zins: 3.5, tilgung: 2, ekBedarf: 25000, knkMitfinanziert: false },
  standVom: '2026-06-15',
  finanzierungsform: '107',
  finanzierungsformAndere: '',
  maxEigenkapital: 30000,
  hausbankVorhanden: true,
  hausbankName: 'Sparkasse Offenburg',
  hausbankBerater: 'Frau Klein',
  finanzberaterVorhanden: false,
  finanzberaterKontakt: '',
  wasWichtig: 'Niedrige monatliche Rate',
  notizVertrieb: 'Kunde braucht schnelle Zusage wegen Notartermin',
  notarterminZiel: '2026-07-30',
};

test('mapper: Links werden als Arrays gesetzt', () => {
  const f = finanzierungsfallBodyToFields(baseBody);
  assert.deepStrictEqual(f[F.KUNDE], ['recKUNDE000000001']);
  assert.deepStrictEqual(f[F.WOHNEINHEIT], ['recWE0000000000001']);
  assert.deepStrictEqual(f[F.SNAPSHOT], ['recSNAP00000000001']);
});

test('mapper: Kennzahlen aus snapshot übernommen', () => {
  const f = finanzierungsfallBodyToFields(baseBody);
  assert.strictEqual(f[F.KAUFPREIS], 200000);
  assert.strictEqual(f[F.EK_BEDARF], 25000);
  assert.strictEqual(f[F.ZINS], 3.5);
  assert.strictEqual(f[F.TILGUNG], 2);
  assert.strictEqual(f[F.WOHNFLAECHE], 60);
  assert.strictEqual(f[F.KALTMIETE], 600);
});

test('mapper: Finanzierungsform 107 setzt P107, nicht P100', () => {
  const f = finanzierungsfallBodyToFields(baseBody);
  assert.strictEqual(f[F.P107], true);
  assert.strictEqual(f[F.P100], false);
});

test('mapper: Finanzierungsform andere setzt Textfeld + keine Checkbox', () => {
  const f = finanzierungsfallBodyToFields({ ...baseBody, finanzierungsform: 'andere', finanzierungsformAndere: 'KfW-Kombi' });
  assert.strictEqual(f[F.P100], false);
  assert.strictEqual(f[F.P107], false);
  assert.strictEqual(f[F.FINANZIERUNGSFORM_ANDERE], 'KfW-Kombi');
});

test('mapper: Formularfelder + Status + Titel', () => {
  const f = finanzierungsfallBodyToFields(baseBody);
  assert.strictEqual(f[F.MAX_EK], 30000);
  assert.strictEqual(f[F.HAUSBANK_VORHANDEN], true);
  assert.strictEqual(f[F.HAUSBANK_NAME], 'Sparkasse Offenburg');
  assert.strictEqual(f[F.HAUSBANK_BERATER], 'Frau Klein');
  assert.strictEqual(f[F.FINANZBERATER_VORHANDEN], false);
  assert.strictEqual(f[F.WAS_WICHTIG], 'Niedrige monatliche Rate');
  assert.strictEqual(f[F.NOTIZ_VERTRIEB], 'Kunde braucht schnelle Zusage wegen Notartermin');
  assert.strictEqual(f[F.NOTARTERMIN_ZIEL], '2026-07-30');
  assert.strictEqual(f[F.STATUS], FINANZIERUNGSFALL_STATUS_START);
  assert.strictEqual(f[F.SA_STATUS], 'fehlt');
  assert.match(f[F.TITEL], /Mustermann, Max/);
  assert.match(f[F.TITEL], /WE 12/);
});
