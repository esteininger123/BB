const test = require('node:test');
const assert = require('node:assert');
const { splitName, mapContact } = require('../api/_lib/hubspot');

// --- splitName: die Namens-Aufteilung ist die kritische Stelle, weil HubSpot
// den vollen Namen oft in firstname legt und lastname leer lässt. ---

test('splitName: beide Felder gesetzt → unverändert übernommen', () => {
  assert.deepStrictEqual(splitName('Jochen', 'Suckrau'), { vorname: 'Jochen', nachname: 'Suckrau' });
});

test('splitName: lastname leer, firstname zweiteilig → erstes Wort Vorname, Rest Nachname', () => {
  assert.deepStrictEqual(splitName('Patrik Neudecker', ''), { vorname: 'Patrik', nachname: 'Neudecker' });
});

test('splitName: lastname null behandelt wie leer', () => {
  assert.deepStrictEqual(splitName('Dirk Mayer', null), { vorname: 'Dirk', nachname: 'Mayer' });
});

test('splitName: mehrteiliger Nachname bleibt zusammen', () => {
  assert.deepStrictEqual(splitName('Nicole Allegretti-Reichgruber', ''), { vorname: 'Nicole', nachname: 'Allegretti-Reichgruber' });
});

test('splitName: drei Wörter → erstes Vorname, Rest Nachname', () => {
  assert.deepStrictEqual(splitName('Karl von Habsburg', ''), { vorname: 'Karl', nachname: 'von Habsburg' });
});

test('splitName: nur ein Wort → Nachname bleibt leer (Vertriebler ergänzt)', () => {
  assert.deepStrictEqual(splitName('Karl', ''), { vorname: 'Karl', nachname: '' });
});

test('splitName: überflüssige Whitespaces normalisiert', () => {
  assert.deepStrictEqual(splitName('  Fati   Alili  ', '  '), { vorname: 'Fati', nachname: 'Alili' });
});

test('splitName: beide leer → beide leer', () => {
  assert.deepStrictEqual(splitName('', ''), { vorname: '', nachname: '' });
});

// --- mapContact: HubSpot-Record → flaches App-Objekt ---

test('mapContact: sauberer Record', () => {
  const rec = { id: '123', properties: { firstname: 'Jochen', lastname: 'Suckrau', email: 'a@b.de', phone: '+49 1629 205518' } };
  assert.deepStrictEqual(mapContact(rec), {
    id: '123', vorname: 'Jochen', nachname: 'Suckrau', email: 'a@b.de', telefon: '+49 1629 205518', rawName: 'Jochen Suckrau',
  });
});

test('mapContact: voller Name im firstname, lastname null → aufgeteilt, rawName = Original', () => {
  const rec = { id: '333942592715', properties: { firstname: 'Patrik Neudecker', lastname: null, email: 'x@y.de', phone: '' } };
  const out = mapContact(rec);
  assert.strictEqual(out.vorname, 'Patrik');
  assert.strictEqual(out.nachname, 'Neudecker');
  assert.strictEqual(out.rawName, 'Patrik Neudecker');
  assert.strictEqual(out.email, 'x@y.de');
  assert.strictEqual(out.telefon, '');
});

test('mapContact: id wird zu String, fehlende Properties → leere Strings', () => {
  const out = mapContact({ id: 999, properties: {} });
  assert.strictEqual(out.id, '999');
  assert.strictEqual(out.vorname, '');
  assert.strictEqual(out.nachname, '');
  assert.strictEqual(out.email, '');
  assert.strictEqual(out.telefon, '');
  assert.strictEqual(out.rawName, '');
});

test('mapContact: defensiv bei kaputtem Input', () => {
  const out = mapContact(null);
  assert.strictEqual(out.id, '');
  assert.strictEqual(out.vorname, '');
});
