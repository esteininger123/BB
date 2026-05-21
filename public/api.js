/* api.js — Fetch-Wrapper für alle Backend-Calls
   Cookie-basierte Auth (httpOnly Session-Cookie). */

async function _fetch(url, opts) {
  const resp = await fetch(url, opts);
  if (!resp.ok) {
    let body = null;
    try { body = await resp.json(); } catch (_) {}
    const err = new Error(body && body.error ? body.error : ('HTTP ' + resp.status));
    err.status = resp.status;
    err.body = body;
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
