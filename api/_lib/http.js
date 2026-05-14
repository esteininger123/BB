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
  const msg = (err && err.message) || 'Unbekannter Fehler';
  return res.status(status).json({ error: msg });
}

module.exports = { readBody, methodNotAllowed, sendError };
