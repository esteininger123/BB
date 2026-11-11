// 11.11.2026 (Henry / Domi Seitz, Christoph Zinnbauer): „Nur Einheiten" am Kalk-Vertriebler. Der Externe sieht
// nur die verlinkten WEs — ohne sie den anderen Externen wegzunehmen (das täte „Extern exklusiv für").
// Hier die reine Filterfunktion; die Endpoints rufen externDarfObjekt(weFields, session, weId) auf.
const test = require('node:test');
const assert = require('node:assert');

const { WE_FIELDS } = require('../api/_lib/tables');
const { externDarfObjekt } = require('../api/_lib/extern');

const KITZ4 = 'recObjKitz4', KITZ4A = 'recObjKitz4a', SPECHT = 'recObjSpecht';
const we = (objId) => ({ [WE_FIELDS.PROJEKT]: [objId] });
const WE3 = 'recWE3', WE6 = 'recWE6', WEA3 = 'recWEA3', WEA6 = 'recWEA6';

test('Christoph: Nur Objekte Kitzingen + Nur Einheiten 3/6/A3 → genau diese drei, A6 nicht', () => {
  const s = { rolle: 'Extern', vertrieblerId: 'recC', nurObjekte: [KITZ4, KITZ4A], nurEinheiten: [WE3, WE6, WEA3] };
  assert.strictEqual(externDarfObjekt(we(KITZ4), s, WE3), true);
  assert.strictEqual(externDarfObjekt(we(KITZ4), s, WE6), true);
  assert.strictEqual(externDarfObjekt(we(KITZ4A), s, WEA3), true);
  assert.strictEqual(externDarfObjekt(we(KITZ4A), s, WEA6), false);
  assert.strictEqual(externDarfObjekt(we(SPECHT), s, WE3), false); // Objekt-Filter greift zusätzlich
});

test('Nur Einheiten ohne Nur Objekte: reicht allein', () => {
  const s = { rolle: 'Extern', vertrieblerId: 'recC', nurObjekte: [], nurEinheiten: [WE3] };
  assert.strictEqual(externDarfObjekt(we(KITZ4), s, WE3), true);
  assert.strictEqual(externDarfObjekt(we(KITZ4), s, WE6), false);
});

test('Nur Einheiten gesetzt, aber keine weId übergeben → gesperrt (sicherer Fall)', () => {
  const s = { rolle: 'Extern', vertrieblerId: 'recC', nurEinheiten: [WE3] };
  assert.strictEqual(externDarfObjekt(we(KITZ4), s), false);
  assert.strictEqual(externDarfObjekt(we(KITZ4), s, null), false);
});

test('Andere Externe (Armbruster: nur Kitzingen, kein Einheiten-Filter) sehen WE 3/6/A3 weiterhin', () => {
  const s = { rolle: 'Extern', vertrieblerId: 'recT', nurObjekte: [KITZ4, KITZ4A], nurEinheiten: [] };
  assert.strictEqual(externDarfObjekt(we(KITZ4), s, WE3), true);
  assert.strictEqual(externDarfObjekt(we(KITZ4A), s, WEA3), true);
  assert.strictEqual(externDarfObjekt(we(SPECHT), s, 'recWE305'), false);
});

test('Ohne beide Filter: alles erlaubt; Interne nie gefiltert', () => {
  assert.strictEqual(externDarfObjekt(we(SPECHT), { rolle: 'Extern', vertrieblerId: 'recX' }, 'recWE305'), true);
  assert.strictEqual(externDarfObjekt(we(SPECHT), { rolle: 'Vertriebler', nurEinheiten: [WE3], nurObjekte: [KITZ4] }, 'recWE305'), true);
});
