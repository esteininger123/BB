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
  try { console.error('[sendError-internal]', status, rawMsg); } catch {}

  // FS-3A (Edgar 26.05.2026): Schema-Drift explizit durchreichen.
  // Wenn ein Airtable-Field gelöscht/umbenannt wurde, war die alte Sanitize-
  // Logik aus FS-3c kontraproduktiv — der Vertriebler sah „Backend-Fehler
  // bitte später" und musste raten. Jetzt zeigen wir die Field-ID, damit
  // Edgar/Admin direkt nachpflegen kann (im internen Tool akzeptabel —
  // keine Endkunden-Sicht).
  const fieldMissing = rawMsg.match(/Could not find a field with name or ID "(fld[A-Za-z0-9]{14})"/);
  if (fieldMissing) {
    return res.status(status).json({
      error: `Airtable-Feld ${fieldMissing[1]} fehlt — wurde in Airtable gelöscht oder umbenannt, der Code referenziert es aber noch. Edgar/Admin: Field-ID aus api/_lib/tables.js entfernen.`,
      code: 'AIRTABLE_FIELD_MISSING',
      fieldId: fieldMissing[1],
    });
  }
  const tableMissing = rawMsg.match(/Could not find (?:what you are looking for|table)\b.*?(tbl[A-Za-z0-9]{14})/);
  if (tableMissing) {
    return res.status(status).json({
      error: `Airtable-Tabelle ${tableMissing[1]} fehlt — gelöscht oder umbenannt. Code referenziert sie noch.`,
      code: 'AIRTABLE_TABLE_MISSING',
      tableId: tableMissing[1],
    });
  }

  // FS-3c (Audit Backend-Security P3 25.05.2026): andere Airtable-Internals
  // (INVALID_VALUE_FOR_COLUMN etc.) weiter sanitizen — kein Information-Leak.
  if (rawMsg.includes('Airtable') || /INVALID_VALUE_FOR_COLUMN|UNKNOWN_FIELD|fld[A-Za-z0-9]{14}|tbl[A-Za-z0-9]{14}|app[A-Za-z0-9]{14}/.test(rawMsg)) {
    return res.status(status).json({ error: 'Backend-Fehler — bitte später erneut versuchen', code: status });
  }
  return res.status(status).json({ error: rawMsg });
}

module.exports = { readBody, methodNotAllowed, sendError };
