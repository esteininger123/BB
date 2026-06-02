# Backstube-Assistent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein eingebetteter KI-Chat-Assistent (Widget unten rechts) beantwortet eingeloggten Vertrieblern Fragen — kontextbewusst zur offenen Kalkulation, strikt gegroundet in der B&B-Rechenlogik.

**Architecture:** Vanilla-JS-Widget liest `window.state` (offener Kunde/WE/Kalkulation) → POST an neue Vercel-Function `api/assistent.js` → Claude Haiku 4.5 über `fetch` (Streaming + Prompt-Caching). System-Prompt = statisches Wissens-Briefing + Guardrails (gecacht); der Live-Kontext geht in die User-Nachricht.

**Tech Stack:** Vanilla JS (kein Build-Step), Vercel Serverless Functions (Node 20, global `fetch`), Anthropic Messages API (`claude-haiku-4-5`), kein neues npm-Dependency. Verifikation lokal über JavaScriptCore (`jsc`), da kein node/npm auf der Maschine.

**Konventionen aus `CLAUDE.md`:**
- Field-IDs nie hardcoden (hier irrelevant — kein Airtable-Zugriff in Phase 1).
- `main` = sofort live → **Push macht Edgar** (Auto-Mode-Klassifizierer blockt direkten Push).
- Cache-Bust `?v=NNN` in `public/index.html` bei jeder Frontend-Änderung hochsetzen (aktuell **v240**).
- JSC-Pfad: `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`.
- Engine `kalkulator.js` wird **nicht** angefasst → Snapshot-Tests nicht betroffen.

---

## File Structure

| Datei | Verantwortung | Art |
|---|---|---|
| `api/_lib/assistent-wissen.js` | Kuratiertes Wissens-Briefing (exportiert String). **Faktenquelle — Edgar-Freigabe vor Go-Live.** | Create |
| `api/_lib/assistent-prompt.js` | Reine Funktionen: Kontext formatieren + Claude-Request bauen. Testbar ohne Netz. | Create |
| `api/assistent.js` | Serverless-Endpoint: Auth, Request bauen, Claude streamen, Fehler. | Create |
| `tests/assistent-prompt.test.js` | node:test für die Pure-Funktionen. | Create |
| `public/chat-widget.js` | FAB + Panel, Kontext sammeln, Streaming-Render. | Create |
| `public/styles.css` | Widget-CSS (B&B-Branding), ans Dateiende anhängen. | Modify |
| `public/index.html` | Script-Tag für Widget + Cache-Bust v240→v241. | Modify |
| `vercel.json` | `functions`-Eintrag für `api/assistent.js` (maxDuration 30). | Modify |

---

## Task 1: Wissens-Briefing (Faktenquelle)

**Files:**
- Create: `api/_lib/assistent-wissen.js`

Reiner Inhalt, kein Test. Erstentwurf aus vorhandener Doku (2-Phasen-Subventionsmodell, Engine-Cheatsheet, Master-Referenz Berechnungslogik). **Markiert als „Entwurf — Edgar-Freigabe ausstehend".**

- [ ] **Step 1: Datei mit Briefing-Entwurf anlegen**

```javascript
// Wissens-Briefing für den Backstube-Assistenten.
// FAKTENQUELLE — der Assistent antwortet ausschließlich hieraus + dem Live-Kontext.
// STATUS: Entwurf. Vor Go-Live von Edgar fachlich freizugeben.
// Pflege: Bei Änderungen an der Engine (kalkulator.js) oder am Subventionsmodell
//         dieses Briefing nachziehen.

const WISSEN = `
# B&B Backstube — Fachwissen für den Assistenten

## Was die App ist
Interne Vertriebs-App der B&B Immo GmbH für Kapitalanlage-Wohneinheiten (KAV).
Ablauf: Kunde anlegen → Kalkulation mit Live-Stammdaten → Investitionsanalyse-PDF
→ Reservierung (PandaDoc) → Selbstauskunft → Bank.

## Kern-Rechengrößen (Engine 3.0, kalkulator.js)
- Kaltmiete: Tag-1-Bestandsmiete (MbV) der Wohneinheit.
- Marktmiete (€/qm): die realistisch erzielbare Miete (eigene Einschätzung), NICHT
  ein gesetzlicher Mietspiegel-Wert. Sie dient als Obergrenze (Cap) der
  Mietprojektion und wächst mit der Wertsteigerung p.a. mit.
- Mietsteigerung "Sprung"-Modus: Erhöhung in Schritten, max. 15 % in 3 Jahren
  (§ 558 BGB Kappungsgrenze) — das ist das Tempo der Erhöhung, nicht die Marktmiete.
- KNK (Kaufnebenkosten): GrESt (Bundesland) + Notar 1,5 % + Grundbuch 0,5 %.
- Eigenkapital-Bedarf: = KNK (Kaufpreis wird zu 100 % finanziert), außer KNK ist
  mitfinanziert → dann 0 €.
- AfA: Bemessung = Gebäudeanteil der Anschaffungskosten × AfA-Satz
  (Standard 2 % linear §7 EStG; höher nur mit Restnutzungsdauer-Gutachten).

## Mietsubvention — 2-Phasen-Modell (B&B-Kern)
- Der Käufer sieht über 6 Jahre eine konstante "End-Miete"; B&B legt die Differenz
  zur tatsächlichen Mieter-Miete drauf (Glättung).
- Phase 1 (Jahr 1–3): Mieter zahlt MbV, B&B zahlt den vollen Aufschlag.
- Phase 2 (Jahr 4–6): Mieter wird legal um eine Kappung erhöht, B&B zahlt nur den Rest.
- Ab Jahr 7: zweite Kappung, Subvention endet.
- Es gibt NIE drei Stufen.
- Die Gesamt-Subvention ist die echte Engine-Summe (geglättet), nicht der nominale
  Stammdaten-Wert.
- Subventionsregler: Trade-off Subvention ↔ Kaufpreis. Halbe Subvention ⇒ Kaufpreis
  sinkt 1:1 um den eingesparten Betrag.

## Was der Assistent NICHT tut
- Keine Steuer- oder Rechtsberatung (nur Modell-Rechnung).
- Keine Zahlen erfinden, die nicht im Live-Kontext stehen.
- Keine Aussagen über andere Kunden/WEs als die gerade offene.
`.trim();

module.exports = { WISSEN };
```

- [ ] **Step 2: Syntax-Check**

Run:
```bash
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
"$JSC" -e 'var module={exports:{}};eval(read("api/_lib/assistent-wissen.js"));if(typeof module.exports.WISSEN!=="string"||module.exports.WISSEN.length<200)throw "WISSEN leer/zu kurz";print("OK WISSEN "+module.exports.WISSEN.length+" Zeichen");'
```
Expected: `OK WISSEN <zahl> Zeichen`

- [ ] **Step 3: Commit**

```bash
git add api/_lib/assistent-wissen.js
git commit -m "feat(assistent): Wissens-Briefing (Entwurf, Faktenquelle)"
```

---

## Task 2: Prompt-Builder (reine Funktionen, TDD)

**Files:**
- Create: `api/_lib/assistent-prompt.js`
- Test: `tests/assistent-prompt.test.js`

Zwei reine Funktionen:
- `formatKontext(kontext)` → menschenlesbarer Text aus dem Live-Kontext-Objekt.
- `buildAssistentRequest({ brief, kontext, verlauf, frage })` → `{ system, messages }` für die Messages-API.

- [ ] **Step 1: Failing test schreiben**

`tests/assistent-prompt.test.js`:
```javascript
const test = require('node:test');
const assert = require('node:assert');
const { formatKontext, buildAssistentRequest } = require('../api/_lib/assistent-prompt');

test('formatKontext bei leerem Kontext gibt Hinweis statt leer', () => {
  const t = formatKontext(null);
  assert.match(t, /kein|nichts/i);
});

test('formatKontext nennt Kundennamen und Kalkulations-Eckdaten', () => {
  const t = formatKontext({ view: 'kunde', kunde: { name: 'Marcel Huppauer', phase: 'Lead' }, kalkulation: { kaltmiete: 452, kaufpreis: 127000 } });
  assert.match(t, /Marcel Huppauer/);
  assert.match(t, /452/);
  assert.match(t, /127000|127\.000/);
});

test('buildAssistentRequest: system ist gecachtes Array mit Briefing', () => {
  const r = buildAssistentRequest({ brief: 'BRIEFING-TEXT', kontext: null, verlauf: [], frage: 'Was ist KNK?' });
  assert.ok(Array.isArray(r.system));
  assert.equal(r.system[0].type, 'text');
  assert.match(r.system[0].text, /BRIEFING-TEXT/);
  assert.deepEqual(r.system[0].cache_control, { type: 'ephemeral' });
});

test('buildAssistentRequest: letzte User-Nachricht enthält Kontext und Frage', () => {
  const r = buildAssistentRequest({ brief: 'B', kontext: { kunde: { name: 'X' } }, verlauf: [], frage: 'Warum negativ?' });
  const last = r.messages[r.messages.length - 1];
  assert.equal(last.role, 'user');
  assert.match(last.content, /X/);
  assert.match(last.content, /Warum negativ\?/);
});

test('buildAssistentRequest: Verlauf wird vorangestellt', () => {
  const verlauf = [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hallo' }];
  const r = buildAssistentRequest({ brief: 'B', kontext: null, verlauf, frage: 'weiter' });
  assert.equal(r.messages[0].content, 'Hi');
  assert.equal(r.messages[1].content, 'Hallo');
  assert.equal(r.messages.length, 3);
});
```

- [ ] **Step 2: Test "fehlschlagen" lassen (Modul fehlt noch)**

Run (lokal, da kein node/npm — über JSC-Harness, der das noch fehlende Modul lädt):
```bash
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
"$JSC" -e 'var module={exports:{}};try{eval(read("api/_lib/assistent-prompt.js"));print("MODUL DA");}catch(e){print("FAIL wie erwartet: "+e);}'
```
Expected: `FAIL wie erwartet: ...` (Datei existiert noch nicht / read-Fehler).

- [ ] **Step 3: Minimale Implementierung**

`api/_lib/assistent-prompt.js`:
```javascript
// Reine Funktionen für den Assistenten — kein Netz, voll testbar.

function formatKontext(kontext) {
  if (!kontext || typeof kontext !== 'object') {
    return 'Aktueller Bildschirm-Kontext: keiner (der Vertriebler hat gerade nichts Konkretes offen).';
  }
  const zeilen = [];
  if (kontext.view) zeilen.push(`Ansicht: ${kontext.view}`);
  if (kontext.kunde && kontext.kunde.name) {
    const phase = kontext.kunde.phase ? ` (Phase: ${kontext.kunde.phase})` : '';
    zeilen.push(`Offener Kunde: ${kontext.kunde.name}${phase}`);
  }
  if (kontext.kalkulation && typeof kontext.kalkulation === 'object') {
    let kalk;
    try { kalk = JSON.stringify(kontext.kalkulation); } catch { kalk = '(nicht darstellbar)'; }
    zeilen.push(`Offene Kalkulation (Eingabewerte): ${kalk}`);
  }
  if (!zeilen.length) return 'Aktueller Bildschirm-Kontext: keiner.';
  return 'Aktueller Bildschirm-Kontext:\n' + zeilen.join('\n');
}

const ROLLE = `Du bist der interne Assistent der B&B-Backstube-Vertriebs-App. Du hilfst Vertrieblern.
Regeln:
- Antworte AUSSCHLIESSLICH aus dem folgenden Fachwissen und dem mitgelieferten Live-Kontext.
- Erfinde KEINE Zahlen, Steuer- oder Rechtsaussagen. Steht etwas nicht in Wissen/Kontext, sage ehrlich "Das weiß ich nicht — frag Henry oder Edgar."
- Bei Steuer/Recht: weise darauf hin, dass es eine Modell-Rechnung ist, keine Steuer-/Rechtsberatung.
- Antworte kurz, klar, auf Deutsch, in der Du-Form.`;

function buildAssistentRequest({ brief, kontext, verlauf, frage }) {
  const systemText = ROLLE + '\n\n# Fachwissen\n' + (brief || '');
  const system = [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }];

  const vorherige = Array.isArray(verlauf) ? verlauf.slice(-10) : [];
  const kontextText = formatKontext(kontext);
  const letzte = {
    role: 'user',
    content: `${kontextText}\n\n---\nFrage des Vertrieblers: ${frage || ''}`
  };
  return { system, messages: [...vorherige, letzte] };
}

module.exports = { formatKontext, buildAssistentRequest, ROLLE };
```

- [ ] **Step 4: Test "bestehen" lassen (JSC-Harness, prüft die fünf Zusicherungen)**

Run:
```bash
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
"$JSC" -e '
var module={exports:{}};eval(read("api/_lib/assistent-prompt.js"));
var P=module.exports;
function ok(c,m){if(!c)throw m;}
ok(/kein|nichts/i.test(P.formatKontext(null)),"leerer Kontext");
var t=P.formatKontext({view:"kunde",kunde:{name:"Marcel Huppauer",phase:"Lead"},kalkulation:{kaltmiete:452,kaufpreis:127000}});
ok(/Marcel Huppauer/.test(t)&&/452/.test(t)&&/127000/.test(t),"Kontext-Inhalt");
var r=P.buildAssistentRequest({brief:"BRIEFING-TEXT",kontext:null,verlauf:[],frage:"Was ist KNK?"});
ok(Array.isArray(r.system)&&r.system[0].type==="text"&&/BRIEFING-TEXT/.test(r.system[0].text),"system block");
ok(r.system[0].cache_control&&r.system[0].cache_control.type==="ephemeral","cache_control");
var r2=P.buildAssistentRequest({brief:"B",kontext:{kunde:{name:"X"}},verlauf:[],frage:"Warum negativ?"});
var last=r2.messages[r2.messages.length-1];
ok(last.role==="user"&&/X/.test(last.content)&&/Warum negativ\?/.test(last.content),"letzte msg");
var r3=P.buildAssistentRequest({brief:"B",kontext:null,verlauf:[{role:"user",content:"Hi"},{role:"assistant",content:"Hallo"}],frage:"weiter"});
ok(r3.messages[0].content==="Hi"&&r3.messages.length===3,"verlauf");
print("ALLE 5 OK");
'
```
Expected: `ALLE 5 OK`

(Hinweis: `npm test` läuft, sobald node verfügbar ist — `node --test tests/assistent-prompt.test.js`. Lokal ersetzt der JSC-Harness das.)

- [ ] **Step 5: Commit**

```bash
git add api/_lib/assistent-prompt.js tests/assistent-prompt.test.js
git commit -m "feat(assistent): Prompt-Builder + Kontext-Formatierung (TDD)"
```

---

## Task 3: Serverless-Endpoint mit Streaming

**Files:**
- Create: `api/assistent.js`
- Modify: `vercel.json` (functions-Eintrag)

Kein Unit-Test (Netz-Call). Verifikation: JSC-Syntax-Check + manueller Klick-Test in Task 5.

- [ ] **Step 1: Endpoint schreiben**

`api/assistent.js`:
```javascript
// POST /api/assistent — KI-Assistent für eingeloggte Vertriebler (Streaming).
// Nutzt Claude Haiku 4.5 über fetch (kein SDK). System-Briefing wird gecacht.

const { verifySession, requireSafeOrigin } = require('./_lib/auth');
const { readBody, methodNotAllowed } = require('./_lib/http');
const { WISSEN } = require('./_lib/assistent-wissen');
const { buildAssistentRequest } = require('./_lib/assistent-prompt');

const MODEL = 'claude-haiku-4-5';
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
```

- [ ] **Step 2: `vercel.json` — functions-Eintrag ergänzen**

Modify `vercel.json`, im `"functions"`-Objekt diesen Eintrag hinzufügen (nach dem `pandadoc/webhook.js`-Eintrag, vor der schließenden `}` des functions-Blocks):
```json
    "api/assistent.js": {
      "maxDuration": 30
    }
```
(Komma-Hygiene beachten: der vorherige Eintrag braucht ein nachfolgendes Komma.)

- [ ] **Step 3: Syntax-Check beider Dateien**

Run:
```bash
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
"$JSC" -e 'new Function(read("api/assistent.js"));print("OK assistent.js");'
python3 -c "import json;json.load(open('vercel.json'));print('OK vercel.json valide')"
```
Expected: `OK assistent.js` und `OK vercel.json valide`

- [ ] **Step 4: Commit**

```bash
git add api/assistent.js vercel.json
git commit -m "feat(assistent): Streaming-Endpoint /api/assistent (Claude Haiku 4.5)"
```

---

## Task 4: Chat-Widget (Frontend)

**Files:**
- Create: `public/chat-widget.js`
- Modify: `public/styles.css` (anhängen)
- Modify: `public/index.html` (Script-Tag + Cache-Bust)

- [ ] **Step 1: Widget-Script schreiben**

`public/chat-widget.js`:
```javascript
// Backstube-Assistent — Chat-Widget unten rechts. Nur für eingeloggte Vertriebler.
(function () {
  'use strict';
  var verlauf = []; // {role, content} — nur im Speicher
  var offen = false;
  var streamt = false;

  function el(id) { return document.getElementById(id); }

  function sammleKontext() {
    var s = window.state || {};
    var k = s.kunde || null;
    return {
      view: s.view || null,
      kunde: k ? { name: k.name || '', phase: k.phase || '' } : null,
      kalkulation: s.kalk || null
    };
  }

  function aufbau() {
    if (el('bb-chat-root')) return;
    var root = document.createElement('div');
    root.id = 'bb-chat-root';
    root.innerHTML =
      '<button id="bb-chat-fab" title="Backstube-Assistent" aria-label="Assistent öffnen">💬</button>' +
      '<div id="bb-chat-panel" hidden>' +
        '<div id="bb-chat-head"><span>Backstube-Assistent</span><button id="bb-chat-close" aria-label="Schließen">×</button></div>' +
        '<div id="bb-chat-msgs"></div>' +
        '<form id="bb-chat-form"><input id="bb-chat-input" type="text" autocomplete="off" placeholder="Frag mich etwas…" /><button type="submit">Senden</button></form>' +
      '</div>';
    document.body.appendChild(root);
    el('bb-chat-fab').addEventListener('click', toggle);
    el('bb-chat-close').addEventListener('click', toggle);
    el('bb-chat-form').addEventListener('submit', onSubmit);
  }

  function toggle() {
    offen = !offen;
    el('bb-chat-panel').hidden = !offen;
    if (offen) el('bb-chat-input').focus();
  }

  function bubble(role, text) {
    var d = document.createElement('div');
    d.className = 'bb-chat-msg bb-chat-' + role;
    d.textContent = text;
    el('bb-chat-msgs').appendChild(d);
    el('bb-chat-msgs').scrollTop = el('bb-chat-msgs').scrollHeight;
    return d;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (streamt) return;
    var input = el('bb-chat-input');
    var frage = (input.value || '').trim();
    if (!frage) return;
    input.value = '';
    bubble('user', frage);
    var antwort = bubble('bot', '');
    antwort.textContent = '…';
    streamt = true;

    try {
      var resp = await fetch('/api/assistent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frage: frage, verlauf: verlauf, kontext: sammleKontext() })
      });
      if (!resp.ok || !resp.body) {
        var err = await resp.json().catch(function () { return {}; });
        antwort.textContent = err.error || 'Assistent gerade nicht verfügbar.';
        streamt = false; return;
      }
      var reader = resp.body.getReader();
      var dec = new TextDecoder();
      var voll = '';
      antwort.textContent = '';
      while (true) {
        var r = await reader.read();
        if (r.done) break;
        voll += dec.decode(r.value, { stream: true });
        antwort.textContent = voll;
        el('bb-chat-msgs').scrollTop = el('bb-chat-msgs').scrollHeight;
      }
      verlauf.push({ role: 'user', content: frage });
      verlauf.push({ role: 'assistant', content: voll });
    } catch (e2) {
      antwort.textContent = 'Verbindung unterbrochen — bitte nochmal.';
    }
    streamt = false;
  }

  function sichtbarkeit() {
    var loggedIn = !!(window.state && window.state.user);
    var root = el('bb-chat-root');
    if (loggedIn && !root) aufbau();
    if (el('bb-chat-root')) el('bb-chat-root').style.display = loggedIn ? '' : 'none';
    if (!loggedIn) { offen = false; if (el('bb-chat-panel')) el('bb-chat-panel').hidden = true; }
  }

  // Leichter, isolierter Sichtbarkeits-Check (kein Eingriff in app.js-Routing).
  setInterval(sichtbarkeit, 800);
  if (document.readyState !== 'loading') sichtbarkeit();
  else document.addEventListener('DOMContentLoaded', sichtbarkeit);
})();
```

- [ ] **Step 2: CSS ans Ende von `public/styles.css` anhängen**

```css
/* ===== Backstube-Assistent (Chat-Widget) ===== */
#bb-chat-root { position: fixed; right: 20px; bottom: 20px; z-index: 9000; }
#bb-chat-fab {
  width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--bronze, #B08A4D); color: #fff; font-size: 24px;
  box-shadow: 0 4px 14px rgba(0,0,0,.25);
}
#bb-chat-panel {
  position: absolute; right: 0; bottom: 68px; width: 340px; max-width: 90vw;
  height: 460px; max-height: 70vh; display: flex; flex-direction: column;
  background: var(--cream, #FBFAF7); border: 1px solid rgba(0,0,0,.12);
  border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.22); overflow: hidden;
}
#bb-chat-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background: var(--wald, #2D6E47); color: #fff; font-weight: 600;
}
#bb-chat-head button { background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; }
#bb-chat-msgs { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.bb-chat-msg { padding: 8px 11px; border-radius: 10px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; max-width: 85%; }
.bb-chat-user { align-self: flex-end; background: var(--bronze, #B08A4D); color: #fff; }
.bb-chat-bot { align-self: flex-start; background: #fff; border: 1px solid rgba(0,0,0,.10); color: #222; }
#bb-chat-form { display: flex; gap: 6px; padding: 10px; border-top: 1px solid rgba(0,0,0,.10); }
#bb-chat-input { flex: 1; padding: 9px 11px; border: 1px solid rgba(0,0,0,.18); border-radius: 8px; font-size: 14px; }
#bb-chat-form button { padding: 9px 14px; border: none; border-radius: 8px; background: var(--wald, #2D6E47); color: #fff; cursor: pointer; }
@media print { #bb-chat-root { display: none !important; } }
```

- [ ] **Step 3: `public/index.html` — Script-Tag + Cache-Bust**

Nach der Zeile `<script src="/app.js?v=240"></script>` (Z52) einfügen:
```html
<script src="/chat-widget.js?v=241"></script>
```
Dann **alle** `?v=240` → `?v=241` setzen:
```bash
sed -i '' 's/?v=240/?v=241/g' public/index.html
```
(Das hebt auch das neue chat-widget-Tag mit an — danach steht überall v241.)

- [ ] **Step 4: Syntax-Check + Cache-Bust prüfen**

Run:
```bash
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
"$JSC" -e 'new Function(read("public/chat-widget.js"));print("OK chat-widget.js");'
grep -c '?v=241' public/index.html   # erwartet: 13 (12 alt + 1 neues Tag)
grep -c '?v=240' public/index.html   # erwartet: 0
```
Expected: `OK chat-widget.js`, dann `13`, dann `0`.

- [ ] **Step 5: Commit**

```bash
git add public/chat-widget.js public/styles.css public/index.html
git commit -m "feat(assistent): Chat-Widget unten rechts + CSS + Cache v241"
```

---

## Task 5: Go-Live-Vorbereitung & manueller Test

**Files:** keine Code-Änderung — Verifikation + Übergabe.

- [ ] **Step 1: Env-Var dokumentieren (Edgar-Aufgabe vor Live)**

In Vercel (Projekt `bb`) Environment-Variable setzen: `ANTHROPIC_API_KEY` = (Anthropic-Console-Key). Lokal optional in `.env-secrets.txt`. **Ohne den Key liefert der Endpoint bewusst 503 „nicht konfiguriert" — kein Absturz.**

- [ ] **Step 2: Voller Syntax-/Integritäts-Check (vor-deploy-check, manuell)**

Run:
```bash
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
for f in api/assistent.js api/_lib/assistent-prompt.js api/_lib/assistent-wissen.js public/chat-widget.js; do
  "$JSC" -e "new Function(read('$f'));print('OK $f');" || echo "FEHLER $f"
done
git status --short
git diff --stat HEAD~4   # die vier Feature-Commits
```
Expected: 4× `OK …`, kein Engine-File (`kalkulator.js`) im Diff.

- [ ] **Step 3: Manuelle Klick-Liste (nach Edgar-Push live, mit gesetztem Key)**

Auf [bb-brown-pi.vercel.app](https://bb-brown-pi.vercel.app/):
- [ ] Eingeloggt: FAB unten rechts sichtbar; ausgeloggt: nicht sichtbar.
- [ ] Klick öffnet Panel; × schließt.
- [ ] Kunde + Kalkulation offen → Frage „Erklär mir diese Kalkulation" → Antwort streamt Wort für Wort und bezieht sich auf den offenen Kunden.
- [ ] Frage außerhalb des Wissens („Wie wird das Wetter?") → ehrliches „weiß ich nicht".
- [ ] Mobile: Panel passt in den Viewport (`max-width:90vw`, `max-height:70vh`).
- [ ] Druck/PDF: Widget erscheint nicht (`@media print`).

- [ ] **Step 4: Übergabe an Edgar**
Push auf `main` macht Edgar (`git push origin main`). Danach Live-Verifikation, dass `?v=241` ausgeliefert wird und das Widget lädt.

---

## Self-Review (gegen die Spec)

**1. Spec-Abdeckung:**
- Widget unten rechts, nur eingeloggt → Task 4 (`sichtbarkeit()` + CSS). ✅
- Kontextbewusst (offener Kunde/WE/Kalkulation) → `sammleKontext()` (Task 4) + `formatKontext()` (Task 2). ✅
- Strikt gegroundet, „weiß ich nicht" → `ROLLE` (Task 2) + Briefing (Task 1). ✅
- Streaming, Haiku 4.5 → Task 3 (`stream:true`, Forwarding) + Task 4 (Reader). ✅
- Auth/CSRF → Task 3 (`verifySession` + `requireSafeOrigin`). ✅
- Prompt-Caching → Task 2 (`cache_control: ephemeral`). ✅
- Fehlerfälle (Key fehlt/Claude-Fehler/nicht eingeloggt) → Task 3 (503/502/401) + Task 4 (Fehler-Bubble). ✅
- Tests → Task 2 (node:test + JSC-Harness). ✅
- Engine unberührt → kein `kalkulator.js` angefasst. ✅
- Datenschutz/AVV → Pre-Go-Live (Spec §8, Task 5 Step 1) — bewusst NICHT im Code, Edgar-Aufgabe. ✅

**2. Placeholder-Scan:** Kein „TBD/TODO"; jeder Code-Step enthält vollständigen Code. ✅

**3. Typ-Konsistenz:** `buildAssistentRequest({brief,kontext,verlauf,frage})` und `formatKontext(kontext)` identisch in Task 2 (Def), Task 3 (Aufruf) und Tests. `kontext`-Form `{view,kunde:{name,phase},kalkulation}` identisch in `sammleKontext` (Task 4) und `formatKontext` (Task 2). ✅

**Offen (kein Code-Blocker, Edgar):** Wissens-Briefing fachlich freigeben; `ANTHROPIC_API_KEY` setzen; Anthropic-AVV/EU klären.
