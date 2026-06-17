// Google-Drive-Anbindung über OAuth (Refresh-Token eines B&B-Funktionskontos).
// Genutzt von Baustein D (Auto-Ordner bei Übergabe) und später Baustein U (Upload/Listing).
//
// Env-Vars (in Vercel gesetzt):
//   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN
//   DRIVE_ROOT_FOLDER_ID  — Eltern-Ordner für die Kunden-Finanzierungs-Ordner

const crypto = require('crypto');
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

// Extrahiert die Drive-Ordner-ID aus einer Drive-URL (…/folders/<id> oder ?id=<id>).
function folderIdFromUrl(url) {
  if (!url) return '';
  const m = String(url).match(/\/folders\/([a-zA-Z0-9_-]+)/) || String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}

// Listet die Dateien (keine Ordner) in einem Ordner — natürlich sortiert (1,2,…10).
// Rückgabe: [{ id, name, mimeType, size, modifiedTime, webViewLink, appProperties }]
async function listFiles(folderId) {
  if (!folderId) return [];
  const token = await getAccessToken();
  const q = `'${escQ(folderId)}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
  const out = await driveFetch(
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,appProperties)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives&pageSize=200`,
    {}, token
  );
  const files = out.files || [];
  files.sort((a, b) => String(a.name).localeCompare(String(b.name), 'de', { numeric: true, sensitivity: 'base' }));
  return files;
}

// Kopiert eine Datei in einen Ziel-Ordner (für Objektunterlagen → Kunden-Unterordner).
async function copyFile(fileId, name, parentId) {
  return driveFetch(`/files/${encodeURIComponent(fileId)}/copy?fields=id,name&supportsAllDrives=true`, {
    method: 'POST',
    body: JSON.stringify({ name, parents: [parentId] }),
  });
}

// Legt eine Verknüpfung (Shortcut) auf einen Ziel-Ordner/-Datei an — immer aktuell,
// keine Kopie. Idempotent: existiert schon ein Shortcut gleichen Namens, kein Duplikat.
async function ensureShortcut(name, targetId, parentId) {
  const token = await getAccessToken();
  try {
    const q = `name='${escQ(name)}' and '${escQ(parentId)}' in parents and mimeType='application/vnd.google-apps.shortcut' and trashed=false`;
    const found = await driveFetch(
      `/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
      {}, token
    );
    if (found.files && found.files.length) return found.files[0];
  } catch (e) { /* Suche best effort */ }
  return driveFetch(`/files?fields=id,name&supportsAllDrives=true`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.shortcut',
      parents: [parentId],
      shortcutDetails: { targetId },
    }),
  }, token);
}

// Liest Metadaten einer Datei (für die Lösch-Absicherung: gehört die Datei in den
// Kundenordner dieses Tokens?). Rückgabe: { id, name, parents, appProperties }.
async function getFileMeta(fileId, fields = 'id,name,parents,appProperties,trashed') {
  if (!fileId) return null;
  return driveFetch(
    `/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`
  );
}

// Verschiebt eine Datei in den Papierkorb (reversibel, 30 Tage). Aus listFiles
// (trashed=false) verschwindet sie sofort. Rückgabe: { id, trashed }.
async function trashFile(fileId) {
  return driveFetch(
    `/files/${encodeURIComponent(fileId)}?fields=id,trashed&supportsAllDrives=true`,
    { method: 'PATCH', body: JSON.stringify({ trashed: true }) }
  );
}

// Lädt den Datei-Inhalt (Bytes) herunter — für die Portal-Vorschau: das Backend
// streamt die Datei token-autorisiert an den Kunden, ohne Drive-Login. Rückgabe: Buffer.
async function downloadFile(fileId) {
  const token = await getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const err = new Error(`Drive download ${res.status}: ${t}`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

// Liest die appProperties eines Ordners (genutzt für das Portal-Profil: welche
// situativen Dokumente der Kunde braucht — über Tage/Geräte stabil gespeichert).
async function getFolderAppProps(folderId) {
  if (!folderId) return {};
  const r = await driveFetch(
    `/files/${encodeURIComponent(folderId)}?fields=appProperties&supportsAllDrives=true`
  ).catch(() => ({}));
  return (r && r.appProperties) || {};
}

// Schreibt/merged appProperties auf einen Ordner. Drive merged: ein Wert null löscht
// die Property. Werte müssen Strings sein (max ~124 Bytes je key+value).
async function setFolderAppProps(folderId, props) {
  if (!folderId) return {};
  return driveFetch(
    `/files/${encodeURIComponent(folderId)}?fields=appProperties&supportsAllDrives=true`,
    { method: 'PATCH', body: JSON.stringify({ appProperties: props }) }
  );
}

// Lädt eine Datei (Buffer) in einen Ordner hoch. Rückgabe: { id, name, webViewLink }.
async function uploadFile(folderId, name, mimeType, buffer, appProperties) {
  const token = await getAccessToken();
  const boundary = 'bbk-' + crypto.randomBytes(8).toString('hex');
  const meta = { name, parents: [folderId] };
  if (appProperties && typeof appProperties === 'object') meta.appProperties = appProperties;
  const metadata = JSON.stringify(meta);
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`, 'utf8');
  const post = Buffer.from(`\r\n--${boundary}--`, 'utf8');
  const body = Buffer.concat([pre, buffer, post]);
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) {
    let b; try { b = await res.json(); } catch { b = await res.text(); }
    const msg = (b && b.error && b.error.message) || (typeof b === 'string' ? b : JSON.stringify(b));
    const err = new Error(`Drive upload ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

module.exports = { getAccessToken, driveFetch, ensureFolder, folderIdFromUrl, listFiles, uploadFile, copyFile, ensureShortcut, getFolderAppProps, setFolderAppProps, getFileMeta, trashFile, downloadFile };
