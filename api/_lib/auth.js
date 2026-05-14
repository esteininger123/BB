// Auth-Helper: Google-Token-Validierung, Session-JWT, Cookies.

const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const COOKIE_NAME = 'bbk_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 Tage

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET nicht gesetzt');
  return s;
}

function getGoogleClientId() {
  const cid = process.env.GOOGLE_CLIENT_ID;
  if (!cid) throw new Error('GOOGLE_CLIENT_ID nicht gesetzt');
  return cid;
}

let _googleClient = null;
function getGoogleClient() {
  if (!_googleClient) {
    _googleClient = new OAuth2Client(getGoogleClientId());
  }
  return _googleClient;
}

// Validiert ein Google-ID-Token, gibt {email, name, picture, sub} oder null zurück.
async function verifyGoogleToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  try {
    const client = getGoogleClient();
    const ticket = await client.verifyIdToken({
      idToken,
      audience: getGoogleClientId()
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) return null;
    if (payload.email_verified === false) return null;
    return {
      email: String(payload.email).toLowerCase().trim(),
      name: payload.name || '',
      picture: payload.picture || '',
      sub: payload.sub
    };
  } catch (e) {
    return null;
  }
}

// Signiert ein Session-JWT (30 Tage).
function signSession(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '30d' });
}

// Liest + validiert das Session-Cookie. Returns Payload oder null.
function verifySession(req) {
  try {
    const raw = req.headers && req.headers.cookie;
    if (!raw) return null;
    const cookies = cookie.parse(raw);
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    const decoded = jwt.verify(token, getJwtSecret());
    if (!decoded || !decoded.vertrieblerId) return null;
    return decoded;
  } catch (e) {
    return null;
  }
}

// Setzt das Session-Cookie auf der Response.
function setSessionCookie(res, token) {
  const c = cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE
  });
  res.setHeader('Set-Cookie', c);
}

// Löscht das Session-Cookie.
function clearSessionCookie(res) {
  const c = cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  res.setHeader('Set-Cookie', c);
}

// Wirft mit res.status(401), wenn keine Session — returns Session oder null falls bereits beantwortet.
function requireAuth(req, res) {
  const session = verifySession(req);
  if (!session) {
    res.status(401).json({ error: 'Nicht eingeloggt' });
    return null;
  }
  return session;
}

// Wirft mit res.status(403), wenn kein Admin — returns Session oder null falls bereits beantwortet.
function requireAdmin(req, res) {
  const session = requireAuth(req, res);
  if (!session) return null;
  if (session.rolle !== 'Admin') {
    res.status(403).json({ error: 'Nur Admins' });
    return null;
  }
  return session;
}

// Hilfsmittel für Routes: prüft, ob die env-Whitelist (ADMIN_EMAILS) eine Email enthält.
function isAdminByEmailWhitelist(email) {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(String(email).toLowerCase());
}

module.exports = {
  COOKIE_NAME,
  verifyGoogleToken,
  signSession,
  verifySession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireAdmin,
  isAdminByEmailWhitelist
};
