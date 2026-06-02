// POST /api/assistent — KI-Assistent für eingeloggte Vertriebler (Streaming).
// Nutzt Claude Haiku 4.5 über fetch (kein SDK). System-Briefing wird gecacht.

const { verifySession, requireSafeOrigin } = require('./_lib/auth');
const { readBody, methodNotAllowed } = require('./_lib/http');
const { WISSEN } = require('./_lib/assistent-wissen');
const { buildAssistentRequest } = require('./_lib/assistent-prompt');

const MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireSafeOrigin(req, res)) return; // CSRF
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'Assistent ist nicht konfiguriert.' });

  const body = await readBody(req);
  const frage = (body && typeof body.frage === 'string') ? body.frage.slice(0, 4000) : '';
  if (!frage.trim()) return res.status(400).json({ error: 'Keine Frage übergeben.' });
  const verlauf = Array.isArray(body.verlauf) ? body.verlauf : [];
  const kontext = (body && typeof body.kontext === 'object') ? body.kontext : null;

  const { system, messages } = buildAssistentRequest({ brief: WISSEN, kontext, verlauf, frage });

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages, stream: true })
    });
  } catch (e) {
    return res.status(502).json({ error: 'Assistent gerade nicht erreichbar.' });
  }
  if (!upstream.ok || !upstream.body) {
    return res.status(502).json({ error: 'Assistent gerade nicht erreichbar.' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // letzte (evtl. unvollständige) Zeile behalten
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const json = s.slice(5).trim();
        if (!json || json === '[DONE]') continue;
        try {
          const evt = JSON.parse(json);
          if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') {
            res.write(evt.delta.text);
          }
        } catch { /* unvollständig — ignorieren */ }
      }
    }
  } catch (e) {
    // Stream brach ab — sauber beenden, Client hat Teiltext.
  }
  res.end();
};
