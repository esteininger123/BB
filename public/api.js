/* api.js — Fetch-Wrapper für alle Backend-Calls
   Cookie-basierte Auth (httpOnly Session-Cookie). */

async function _fetch(url, opts) {
  let resp;
  try {
    resp = await fetch(url, opts);
  } catch (e) {
    // QA-Fix 2026-05-23: Netzwerk-Fehler (offline, DNS, Timeout) sauber
    // unterscheiden von HTTP-Fehlern. Vertriebler auf flakigem 4G sieht
    // sonst nur „TypeError: Failed to fetch" — unverständlich.
    const err = new Error('Verbindung zum Server unterbrochen — bitte erneut versuchen');
    err.status = 0;
    err.network = true;
    err.cause = e;
    throw err;
  }
  if (!resp.ok) {
    let body = null;
    try { body = await resp.json(); } catch (_) {}
    const err = new Error(body && body.error ? body.error : ('HTTP ' + resp.status));
    err.status = resp.status;
    err.body = body;
    // QA-Fix 2026-05-23: 401 ist „nicht eingeloggt" — bei abgelaufener Session
    // sieht User sonst kryptisches „HTTP 401". Klarer Hinweis + Auto-Reload-Flag.
    if (resp.status === 401) {
      err.message = 'Session abgelaufen — bitte Seite neu laden und neu anmelden';
      err.needsReauth = true;
    }
    throw err;
  }
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  return null;
}

const api = {
  get(url) { return _fetch(url, { credentials: 'include' }); },
  post(url, body) {
    return _fetch(url, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  },
  put(url, body) {
    return _fetch(url, {
      method: 'PUT', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  },
  patch(url, body) {
    return _fetch(url, {
      method: 'PATCH', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  },
  delete(url) { return _fetch(url, { method: 'DELETE', credentials: 'include' }); },
};

window.api = api;
