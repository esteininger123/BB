// Kleine HTTP-Helper.

// JSON-Body lesen (Vercel parsed normalerweise automatisch — falls nicht, fallback).
async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return {}; }
    }
    return req.body;
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return res.status(405).json({ error: 'Method Not Allowed' });
}

function sendError(res, err) {
  const status = (err && err.status) || 500;
  const rawMsg = (err && err.message) || 'Unbekannter Fehler';
  // FS-3c (Audit Backend-Security P3 25.05.2026): sanitize Airtable-Internals
  // bevor sie an den Client gehen — sonst leaken Field-IDs, Table-Namen etc.
  // bei 4xx/5xx-Errors. Server-Log behält den vollen Original-Text.
  if (rawMsg.includes('Airtable') || /INVALID_VALUE_FOR_COLUMN|UNKNOWN_FIELD|fld[A-Za-z0-9]{14}|tbl[A-Za-z0-9]{14}|app[A-Za-z0-9]{14}/.test(rawMsg)) {
    try { console.error('[sendError-internal]', status, rawMsg); } catch {}
    return res.status(status).json({ error: 'Backend-Fehler — bitte später erneut versuchen', code: status });
  }
  return res.status(status).json({ error: rawMsg });
}

module.exports = { readBody, methodNotAllowed, sendError };
