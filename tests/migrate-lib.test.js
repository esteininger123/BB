const test = require('node:test');
const assert = require('node:assert');
const { normEmail, fullName, findDuplicate } = require('../scripts/migrate-lib');

test('normEmail trimmt + lowercased', () => {
  assert.equal(normEmail('  Foo@Bar.DE '), 'foo@bar.de');
  assert.equal(normEmail(null), '');
});

test('fullName: trimmt, lowercased, kollabiert Leerzeichen', () => {
  assert.equal(fullName('Omar ', 'Al Kadi'), 'omar al kadi');
  assert.equal(fullName('Andreas', 'Walther'), 'andreas walther');
  assert.equal(fullName(null, null), '');
});

test('findDuplicate matcht zuerst per E-Mail', () => {
  const kaeufer = [{ id: 'recA', fields: { 'fldUkBbJTTEfeQB0J': 'akim.ziegert@gmail.com', 'fldUW2JYSMP5sOqM6': 'Akim Ziegert' } }];
  const ki = { fields: { 'fldNXcwpC75MuGGhd': 'AKIM.ziegert@gmail.com', 'fldkRrN0cjBc7z4sx': 'Akim', 'fldjsUvoh3caONyYa': 'Ziegert' } };
  assert.equal(findDuplicate(ki, kaeufer), 'recA');
});

test('findDuplicate matcht per Vollname (Vorname/Nachname)', () => {
  const kaeufer = [{ id: 'recW', fields: { 'fldUW2JYSMP5sOqM6': 'Andreas Walther' } }];
  const ki = { fields: { 'fldkRrN0cjBc7z4sx': 'Andreas', 'fldjsUvoh3caONyYa': 'Walther' } };
  assert.equal(findDuplicate(ki, kaeufer), 'recW');
});

test('findDuplicate: Vollname-Fallback aufs Name-Feld (Vorname/Nachname leer)', () => {
  const kaeufer = [{ id: 'recW', fields: { 'fldUW2JYSMP5sOqM6': 'Andreas Walther' } }];
  const ki = { fields: { 'fldEyLcNBa1Xe3ISs': 'Andreas Walther' } };
  assert.equal(findDuplicate(ki, kaeufer), 'recW');
});

test('findDuplicate: mehrteiliger Nachname matcht (Omar Al Kadi)', () => {
  const kaeufer = [{ id: 'recO', fields: { 'fldUW2JYSMP5sOqM6': 'Omar Al Kadi' } }];
  const ki = { fields: { 'fldkRrN0cjBc7z4sx': 'Omar ', 'fldjsUvoh3caONyYa': 'Al Kadi' } };
  assert.equal(findDuplicate(ki, kaeufer), 'recO');
});

test('findDuplicate: Marijam Al Kadi matcht NICHT auf Omar Al Kadi', () => {
  const kaeufer = [{ id: 'recO', fields: { 'fldUW2JYSMP5sOqM6': 'Omar Al Kadi' } }];
  const ki = { fields: { 'fldkRrN0cjBc7z4sx': 'Marijam', 'fldjsUvoh3caONyYa': 'Al Kadi' } };
  assert.equal(findDuplicate(ki, kaeufer), null);
});

test('findDuplicate: nur gleicher Nachname ist KEIN Match', () => {
  const kaeufer = [{ id: 'recM', fields: { 'fldUW2JYSMP5sOqM6': 'Michael Müller' } }];
  const ki = { fields: { 'fldkRrN0cjBc7z4sx': 'Ken', 'fldjsUvoh3caONyYa': 'Müller' } };
  assert.equal(findDuplicate(ki, kaeufer), null);
});

test('findDuplicate ohne Treffer → null', () => {
  const ki = { fields: { 'fldNXcwpC75MuGGhd': 'neu@x.de', 'fldkRrN0cjBc7z4sx': 'Neu', 'fldjsUvoh3caONyYa': 'Person' } };
  assert.equal(findDuplicate(ki, []), null);
});
