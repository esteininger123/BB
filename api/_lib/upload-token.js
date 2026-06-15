// Signierte Tokens für das Kunden-Upload-Portal (Baustein U).
// Stateless: JWT (HS256) mit UPLOAD_TOKEN_SECRET. Payload bindet den Token an
// den Finanzierungsfall + den Drive-Ordner (kein Login nötig, Ablauf 90 Tage).

const jwt = require('jsonwebtoken');

const MAX_AGE = 60 * 60 * 24 * 90; // 90 Tage

function getSecret() {
  const s = process.env.UPLOAD_TOKEN_SECRET;
  if (!s) throw new Error('UPLOAD_TOKEN_SECRET nicht gesetzt');
  return s;
}

// payload: { fallId, folderId, weId }
function signUploadToken(payload) {
  return jwt.sign(payload, getSecret(), { algorithm: 'HS256', expiresIn: MAX_AGE });
}

// Returns Payload oder null (abgelaufen / ungültig / Secret fehlt).
function verifyUploadToken(token) {
  try {
    return jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
  } catch (e) {
    return null;
  }
}

module.exports = { signUploadToken, verifyUploadToken };
