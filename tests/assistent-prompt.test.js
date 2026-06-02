const test = require('node:test');
const assert = require('node:assert');
const { formatKontext, buildAssistentRequest } = require('../api/_lib/assistent-prompt');

test('formatKontext bei leerem Kontext gibt Hinweis statt leer', () => {
  const t = formatKontext(null);
  assert.match(t, /kein|nichts/i);
});

test('formatKontext nennt Kundennamen und Kalkulations-Eckdaten', () => {
  const t = formatKontext({ view: 'kunde', kunde: { name: 'Marcel Huppauer', phase: 'Lead' }, kalkulation: { kaltmiete: 452, kaufpreis: 127000 } });
  assert.match(t, /Marcel Huppauer/);
  assert.match(t, /452/);
  assert.match(t, /127000|127\.000/);
});

test('buildAssistentRequest: system ist gecachtes Array mit Briefing', () => {
  const r = buildAssistentRequest({ brief: 'BRIEFING-TEXT', kontext: null, verlauf: [], frage: 'Was ist KNK?' });
  assert.ok(Array.isArray(r.system));
  assert.equal(r.system[0].type, 'text');
  assert.match(r.system[0].text, /BRIEFING-TEXT/);
  assert.deepEqual(r.system[0].cache_control, { type: 'ephemeral' });
});

test('buildAssistentRequest: letzte User-Nachricht enthält Kontext und Frage', () => {
  const r = buildAssistentRequest({ brief: 'B', kontext: { kunde: { name: 'X' } }, verlauf: [], frage: 'Warum negativ?' });
  const last = r.messages[r.messages.length - 1];
  assert.equal(last.role, 'user');
  assert.match(last.content, /X/);
  assert.match(last.content, /Warum negativ\?/);
});

test('buildAssistentRequest: Verlauf wird vorangestellt', () => {
  const verlauf = [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hallo' }];
  const r = buildAssistentRequest({ brief: 'B', kontext: null, verlauf, frage: 'weiter' });
  assert.equal(r.messages[0].content, 'Hi');
  assert.equal(r.messages[1].content, 'Hallo');
  assert.equal(r.messages.length, 3);
});
