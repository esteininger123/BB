// 12.11.2026 (Henry): Preview-Schutz — BB_READONLY blockt Schreibzugriffe, BB_DEMO_OVERRIDES überlagert Feldwerte beim Lesen.
const test = require('node:test');
const assert = require('node:assert');

process.env.BB_READONLY = '1';
process.env.BB_DEMO_OVERRIDES = JSON.stringify({ reczQEakLLKGbwXh7: { fldKQ5ZpGvEzuc5qc: 237810 }, recPFRRRedX9oSR2u: { fldWZDXaqh04uc5ex: 40000 } });
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test';
process.env.AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appTest';
const { airtable, applyDemoOverrides, BB_READONLY } = require('../api/_lib/airtable');

test('BB_READONLY: update/create/delete gehen nicht raus, liefern Attrappe', async () => {
  assert.strictEqual(BB_READONLY, true);
  const u = await airtable('update', 'tblX', { recordId: 'rec1', fields: { a: 1 } });
  assert.deepStrictEqual(u, { id: 'rec1', fields: { a: 1 }, readonly: true });
  const c = await airtable('create', 'tblX', { fields: { b: 2 } });
  assert.strictEqual(c.readonly, true);
  const d = await airtable('delete', 'tblX', { recordId: 'rec1' });
  assert.deepStrictEqual(d, { ok: true, readonly: true });
});

test('BB_DEMO_OVERRIDES: Einzel-Record und Listen werden überlagert, andere Records unverändert', () => {
  const one = applyDemoOverrides({ id: 'reczQEakLLKGbwXh7', fields: { fldKQ5ZpGvEzuc5qc: 229883, x: 1 } });
  assert.strictEqual(one.fields.fldKQ5ZpGvEzuc5qc, 237810);
  assert.strictEqual(one.fields.x, 1);
  const list = applyDemoOverrides({ records: [{ id: 'recPFRRRedX9oSR2u', fields: {} }, { id: 'recAndere', fields: { fldWZDXaqh04uc5ex: 5 } }] });
  assert.strictEqual(list.records[0].fields.fldWZDXaqh04uc5ex, 40000);
  assert.strictEqual(list.records[1].fields.fldWZDXaqh04uc5ex, 5);
  assert.strictEqual(applyDemoOverrides(null), null);
});
