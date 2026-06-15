// Auth-Helper: Google-Token-Validierung, Session-JWT, Cookies.

const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { airtable } = require('./airtable');
const { TABLES, VERTRIEBLER_FIELDS } = require('./tables');

const COOKIE_NAME = 'bbk_session';
// FS-3c (Audit Backend-Security P0 25.05.2026): 30 → 7 Tage. Mitigation
// gegen entlassene Mitarbeiter / kompromittierte Sessions — Status der
// Vertriebler-Whitelist wird beim Login frisch validiert, danach läuft
// das Cookie ohne Recheck. Mit 7 Tagen ist das Worst-Case-Fenster
// deutlich kürzer. Vollständiger Fix (Status-Recheck pro Request +
// tokenVersion-Counter) post-Launch.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 Tage

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

// Signiert ein Session-JWT — Lebensdauer synchron zum Cookie.
// FS-3c (Audit Backend-Security P0 25.05.2026): JWT-Expiry war 30d hardcoded,
// Cookie ist jetzt 7d. Hatte zur Folge: ein Browser ohne Cookies aber mit
// JWT in localStorage hätte 30d Zugriff — Inkonsistenz. Jetzt: JWT-Expiry
// = Cookie-Maxage exakt.
function signSession(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: COOKIE_MAX_AGE });
}

// Liest + validiert das Session-Cookie. Returns Payload oder null.
function verifySession(req) {
  try {
    const raw = req.headers && req.headers.cookie;
    if (!raw) return null;
    const cookies = cookie.parse(raw);
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    // QA-Fix 2026-05-22 (Audit-D E5): Algorithmen explizit hardcoden — schützt
    // gegen künftige Lib-Updates die andere Algos zulassen würden. jsonwebtoken
    // v9 ist zwar schon strikt, aber explicit > implicit.
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
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

// QA-Fix 2026-05-22 (Audit-D B2): synchroner Admin-Recheck gegen Airtable.
// Verhindert privilege-escalation via forged JWT — payload sagt "Admin", aber
// die DB ist die Wahrheit. Für mutierende Admin-Routes (PUT/DELETE/POST).
// Performance: 1 Airtable-Roundtrip (~80-150ms). Acceptable für selten genutzte
// Admin-Endpoints. Bei häufigem Use → 30s-In-Memory-Cache pro vertrieblerId.
async function requireAdminVerified(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return null;
  try {
    const rec = await airtable('get', TABLES.VERTRIEBLER, { recordId: session.vertrieblerId });
    if (!rec || !rec.fields) {
      res.status(403).json({ error: 'Vertriebler nicht gefunden' });
      return null;
    }
    const rolleRaw = rec.fields[VERTRIEBLER_FIELDS.ROLLE];
    const rolle = (rolleRaw && typeof rolleRaw === 'object') ? rolleRaw.name : (rolleRaw || '');
    const statusRaw = rec.fields[VERTRIEBLER_FIELDS.STATUS];
    const status = (statusRaw && typeof statusRaw === 'object') ? statusRaw.name : (statusRaw || '');
    if (rolle !== 'Admin' || status !== 'Aktiv') {
      res.status(403).json({ error: 'Admin-Rechte revoked oder Status inaktiv' });
      return null;
    }
    return session;
  } catch (e) {
    res.status(503).json({ error: 'Admin-Verify failed', detail: String(e.message || e) });
    return null;
  }
}

// Hilfsmittel für Routes: prüft, ob die env-Whitelist (ADMIN_EMAILS) eine Email enthält.
function isAdminByEmailWhitelist(email) {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(String(email).toLowerCase());
}

// QA-Fix 2026-05-23 (Audit-DD-1, CSRF-Schutz): Origin-Header-Check für
// mutierende Endpoints. SameSite=lax schützt nicht gegen
// JSON-Fetch-CSRF von gleicher Site/Subdomain. Wir prüfen Origin gegen
// Allowlist + erlauben „kein Origin" für non-Browser-Tools (curl bei
// Cron-Aufrufen). Einsatz: in jedem POST/PUT/PATCH/DELETE-Handler
// vor verifySession aufrufen — bei false direkt 403 zurückgeben.
function isSafeOrigin(req) {
  const method = (req.method || '').toUpperCase();
  // Lesen ist nie state-changing → kein CSRF-Risiko.
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const origin = (req.headers && (req.headers.origin || req.headers.referer)) || '';
  // Keine Origin (Postman, curl, server-zu-server, Vercel-Cron) → erlauben.
  // Echte Browser senden bei Cross-Origin-Fetch IMMER einen Origin.
  if (!origin) return true;
  // Allowlist aus env + Default-Production-Domain. Subdomain-Wildcard wäre
  // gefährlich; wir matchen exakt.
  const allowed = [
    'https://bb-brown-pi.vercel.app',
    // FS-3n (Re-Re-Audit P1 25.05.2026): backstube.bub-immo.de in CSRF-Allowlist
    // — vorher nur in sa-portal/generate.js. Sobald die Domain produktiv ist,
    // würden ohne diesen Fix alle mutativen App-Endpoints 403 liefern.
    'https://backstube.bub-immo.de',
    'https://bb.immo-stein.de',
    'http://localhost:3000',
    'http://localhost:5173'
  ];
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  allowed.push(...extra);
  try {
    const u = new URL(origin);
    const originRoot = `${u.protocol}//${u.host}`;
    if (allowed.includes(originRoot)) return true;
    // QA-Fix 2026-05-23 (Audit B-11): Vercel-Preview-Deploys haben URLs wie
    // `https://bb-brown-pi-git-xyz.vercel.app`.
    // SECURITY-FIX 2026-05-24 (FS-1 Pen-Tester CRITICAL):
    // Wildcard `*.vercel.app` ist CSRF-Bypass — jeder kann eigene App auf
    // attacker.vercel.app deployen. Stattdessen Projekt-Präfix matchen:
    // Production-Domain `bb-brown-pi`, Preview-Pattern `bb-brown-pi-git-*`,
    // Sub-Project (z.B. PR-Preview) `bb-brown-pi-*`. Alle anderen *.vercel.app
    // werden blockiert.
    if (u.protocol === 'https:') {
      const host = u.host;
      if (host === 'bb-brown-pi.vercel.app') return true;
      if (/^bb-brown-pi-[a-z0-9-]+\.vercel\.app$/i.test(host)) return true;
      // 2026-06-15: Vercel-Projekt-Slug ist „bb" unter dem eigenen Account-Scope
      // „esteininger123s-projects". Preview-/Branch-URLs (bb-git-<branch>-…,
      // bb-<hash>-…) eng auf genau diesen Scope begrenzt erlauben — kein
      // *.vercel.app-Wildcard, daher kein CSRF-Bypass durch fremde Deployments.
      if (/^bb-[a-z0-9-]+-esteininger123s-projects\.vercel\.app$/i.test(host)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function requireSafeOrigin(req, res) {
  if (!isSafeOrigin(req)) {
    res.status(403).json({ error: 'Cross-Origin-Request blockiert (CSRF-Schutz)', hint: 'Erwartet: Request von app-eigener Domain.' });
    return false;
  }
  return true;
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
  requireAdminVerified,
  isAdminByEmailWhitelist,
  isSafeOrigin,
  requireSafeOrigin
};
