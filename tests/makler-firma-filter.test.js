const test = require('node:test');
const assert = require('node:assert');
const { maklerFirmaFormula, MAKLER_FIRMEN } = require('../api/_lib/tables');

// 2026-06-25: Backstube zeigte nur 'B&B Immo GmbH'. B&B Bayern (Marktheidenfeld) und
// Bärte Immo fielen raus. Der Filter erlaubt jetzt alle drei Gesellschaften.

test('MAKLER_FIRMEN enthält alle drei Vertriebsgesellschaften', () => {
  assert.deepStrictEqual(MAKLER_FIRMEN, ['B&B Immo GmbH', 'B&B Bayern GmbH', 'Bärte Immo GmbH']);
});

test('maklerFirmaFormula: OR über alle drei Firmen mit FIND auf den Firma-Lookup', () => {
  const f = maklerFirmaFormula();
  assert.ok(f.startsWith('OR('), 'beginnt mit OR(');
  assert.ok(f.includes("FIND('B&B Immo GmbH'"), 'B&B Immo GmbH enthalten');
  assert.ok(f.includes("FIND('B&B Bayern GmbH'"), 'B&B Bayern GmbH enthalten');
  assert.ok(f.includes("FIND('Bärte Immo GmbH'"), 'Bärte Immo GmbH enthalten');
  // exakt drei FIND-Klauseln, alle auf dasselbe Lookup-Feld
  assert.strictEqual((f.match(/FIND\(/g) || []).length, 3);
  assert.strictEqual((f.match(/ARRAYJOIN\(\{Firma \(from Projekt\) \(from Objekt\)\}\)/g) || []).length, 3);
});

test('maklerFirmaFormula: keine Substring-Kollision zwischen den Firmennamen', () => {
  // "B&B Immo GmbH" darf nicht versehentlich "B&B Bayern GmbH" matchen und umgekehrt.
  const a = 'B&B Immo GmbH', b = 'B&B Bayern GmbH', c = 'Bärte Immo GmbH';
  assert.ok(!b.includes(a) && !a.includes(b), 'Immo vs Bayern disjunkt');
  assert.ok(!c.includes(a) && !a.includes(c), 'Immo vs Bärte disjunkt');
});
