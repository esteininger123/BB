// Passwort-Hashing für den E-Mail+Passwort-Login — 06.07.2026 (Henry).
//
// Zusätzlich zum Google-Login (v.a. für externe Vertriebler ohne Google-Konto).
// Node-Bordmittel statt bcrypt-Native-Dependency: crypto.scrypt mit per-User-Salt,
// Format `s2$<salt-hex>$<hash-hex>` im Airtable-Feld VERTRIEBLER_FIELDS.PASSWORT_HASH.
// Der Hash verlässt das Backend NIE (kein Mapper liefert ihn aus).

const crypto = require('crypto');

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;
const MIN_LAENGE = 8;

function hashPasswort(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, KEYLEN, SCRYPT_OPTS).toString('hex');
  return `s2$${salt}$${hash}`;
}

function verifyPasswort(pw, stored) {
  if (!pw || !stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 's2' || !parts[1] || !parts[2]) return false;
  try {
    const hash = crypto.scryptSync(String(pw), parts[1], KEYLEN, SCRYPT_OPTS);
    const ref = Buffer.from(parts[2], 'hex');
    if (hash.length !== ref.length) return false;
    return crypto.timingSafeEqual(hash, ref);
  } catch (e) {
    return false;
  }
}

// Mindest-Regeln (bewusst schlank): >= 8 Zeichen, nicht nur Leerzeichen.
function passwortRegelFehler(pw) {
  if (typeof pw !== 'string' || pw.trim().length < MIN_LAENGE) {
    return `Passwort muss mindestens ${MIN_LAENGE} Zeichen haben.`;
  }
  return null;
}

module.exports = { hashPasswort, verifyPasswort, passwortRegelFehler, MIN_LAENGE };
