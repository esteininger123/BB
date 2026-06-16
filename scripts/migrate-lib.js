// scripts/migrate-lib.js — reine Funktionen für die Kunden-Migration (testbar, kein Netz).
const KI = { email: 'fldNXcwpC75MuGGhd', vorname: 'fldkRrN0cjBc7z4sx', nachname: 'fldjsUvoh3caONyYa', name: 'fldEyLcNBa1Xe3ISs' };
const KU = { email: 'fldUkBbJTTEfeQB0J', name: 'fldUW2JYSMP5sOqM6' };

const normEmail = e => (e || '').trim().toLowerCase();
// Vollständiger Name normalisiert (lowercase, getrimmt, Mehrfach-Leerzeichen zu einem).
const fullName = (...parts) => parts.filter(Boolean).join(' ').toLowerCase().trim().replace(/\s+/g, ' ');

function kiFullName(ki) {
  const f = ki.fields;
  return fullName(f[KI.vorname], f[KI.nachname]) || fullName(f[KI.name]);
}

function findDuplicate(ki, kaeuferRecords) {
  // 1) Exakte E-Mail (zuverlässigster Match)
  const e = normEmail(ki.fields[KI.email]);
  if (e) {
    const hit = kaeuferRecords.find(k => normEmail(k.fields[KU.email]) === e);
    if (hit) return hit.id;
  }
  // 2) Exakter Vollname (verhindert z.B. Marijam Al Kadi → Omar Al Kadi)
  const name = kiFullName(ki);
  if (!name) return null;
  const hit = kaeuferRecords.find(k => fullName(k.fields[KU.name]) === name);
  return hit ? hit.id : null;
}

module.exports = { normEmail, fullName, kiFullName, findDuplicate, KI, KU };
