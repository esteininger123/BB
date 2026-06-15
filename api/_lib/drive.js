// Google-Drive-Anbindung über OAuth (Refresh-Token eines B&B-Funktionskontos).
// Genutzt von Baustein D (Auto-Ordner bei Übergabe) und später Baustein U (Upload/Listing).
//
// Env-Vars (in Vercel gesetzt):
//   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN
//   DRIVE_ROOT_FOLDER_ID  — Eltern-Ordner für die Kunden-Finanzierungs-Ordner

const { OAuth2Client } = require('google-auth-library');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

let _client = null;
function getOAuthClient() {
  if (_client) return _client;
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refresh = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!id || !secret || !refresh) {
    throw new Error('Google-OAuth-Env-Vars fehlen (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN)');
  }
  _client = new OAuth2Client(id, secret);
  _client.setCredentials({ refresh_token: refresh });
  return _client;
}

// Holt (und cached intern via Lib) einen gültigen Access-Token.
async function getAccessToken() {
  const c = getOAuthClient();
  const { token } = await c.getAccessToken();
  if (!token) throw new Error('Konnte keinen Drive-Access-Token holen');
  return token;
}

async function driveFetch(path, opts = {}, accessToken) {
  const token = accessToken || await getAccessToken();
  const res = await fetch(DRIVE_API + path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let body;
    try { body = await res.json(); } catch { body = await res.text(); }
    const msg = (body && body.error && body.error.message) || (typeof body === 'string' ? body : JSON.stringify(body));
    const err = new Error(`Drive ${opts.method || 'GET'} ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return {};
  return res.json();
}

// Escaped einen Wert für die Drive-Query-Syntax (q-Parameter).
function escQ(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Legt einen Unterordner an — idempotent: existiert schon ein Ordner gleichen
// Namens im Parent, wird der zurückgegeben (kein Duplikat bei erneuter Übergabe).
// Rückgabe: { id, webViewLink }.
async function ensureFolder(name, parentId) {
  const token = await getAccessToken();
  // Idempotenz (best effort): existierenden Ordner gleichen Namens suchen.
  // Schlägt die Suche fehl, wird einfach neu angelegt (Duplikat-Risiko in Kauf).
  try {
    const q = `name='${escQ(name)}' and '${escQ(parentId)}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const search = await driveFetch(
      `/files?q=${encodeURIComponent(q)}&fields=files(id,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
      {}, token
    );
    if (search.files && search.files.length) return search.files[0];
  } catch (e) {
    console.error('[drive] Ordner-Suche fehlgeschlagen, lege neu an:', e && e.message);
  }

  return driveFetch(`/files?fields=id,webViewLink&supportsAllDrives=true`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  }, token);
}

module.exports = { getAccessToken, driveFetch, ensureFolder };
