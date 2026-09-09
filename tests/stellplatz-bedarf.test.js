// „Bedarf an Stellplatz" (09.09.2026, Henry): WE-Feld singleSelect Ja/Nein/leer →
// API-Flag stellplatzBedarf true/false/null. Sichert den gemeinsamen Mapper-Helfer
// und die Lese-Richtung in weRecordToApi (/api/wohneinheiten → Kalkulator-Kopf-Pill).

const test = require('node:test');
const assert = require('node:assert');

const { WE_FIELDS } = require('../api/_lib/tables');
const { weStellplatzBedarf, weRecordToApi } = require('../api/_lib/mappers');

test('WE_FIELDS.STELLPLATZ_BEDARF ist die bekannte Field-ID', () => {
  assert.strictEqual(WE_FIELDS.STELLPLATZ_BEDARF, 'fldcNbjkfNqvbQs3f');
});

test('weStellplatzBedarf: Ja → true, Nein → false, leer/unbekannt → null', () => {
  assert.strictEqual(weStellplatzBedarf('Ja'), true);
  assert.strictEqual(weStellplatzBedarf('Nein'), false);
  assert.strictEqual(weStellplatzBedarf(undefined), null);
  assert.strictEqual(weStellplatzBedarf(null), null);
  assert.strictEqual(weStellplatzBedarf(''), null);
  assert.strictEqual(weStellplatzBedarf('Vielleicht'), null);
  // Lookup-/Choice-Formen, wie Airtable sie je nach Abfrage liefert
  assert.strictEqual(weStellplatzBedarf(['Ja']), true);
  assert.strictEqual(weStellplatzBedarf([]), null);
  assert.strictEqual(weStellplatzBedarf({ id: 'seld5tyOE2QWZURyJ', name: 'Ja' }), true);
  assert.strictEqual(weStellplatzBedarf({ name: 'Nein' }), false);
  assert.strictEqual(weStellplatzBedarf(' ja '), true);
});

test('weRecordToApi liefert stellplatzBedarf', () => {
  const base = { [WE_FIELDS.WE_NR]: '7', [WE_FIELDS.KAUFPREIS]: 200000 };
  const ja   = weRecordToApi({ id: 'recAAAAAAAAAAAAAA1', fields: Object.assign({}, base, { [WE_FIELDS.STELLPLATZ_BEDARF]: 'Ja' }) });
  const nein = weRecordToApi({ id: 'recAAAAAAAAAAAAAA2', fields: Object.assign({}, base, { [WE_FIELDS.STELLPLATZ_BEDARF]: 'Nein' }) });
  const leer = weRecordToApi({ id: 'recAAAAAAAAAAAAAA3', fields: base });
  assert.strictEqual(ja.stellplatzBedarf, true);
  assert.strictEqual(nein.stellplatzBedarf, false);
  assert.strictEqual(leer.stellplatzBedarf, null);
  assert.strictEqual(ja.weNr, '7', 'übrige Felder bleiben unverändert');
});
