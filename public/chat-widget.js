// Backstube-Assistent — Chat-Widget unten rechts. Nur für eingeloggte Vertriebler.
(function () {
  'use strict';
  var verlauf = []; // {role, content} — nur im Speicher
  var offen = false;
  var streamt = false;

  function el(id) { return document.getElementById(id); }

  // Minimaler, sicherer Markdown-Renderer (fett, Listen, Absätze). Escaped HTML zuerst.
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function inlineMd(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  function renderMarkdown(text) {
    var lines = String(text).replace(/\r/g, '').split('\n');
    var out = [], i = 0, m;
    while (i < lines.length) {
      if ((m = lines[i].match(/^\s*\d+\.\s+(.*)$/))) {
        var oli = [];
        while (i < lines.length && (m = lines[i].match(/^\s*\d+\.\s+(.*)$/))) { oli.push('<li>' + inlineMd(m[1]) + '</li>'); i++; }
        out.push('<ol>' + oli.join('') + '</ol>'); continue;
      }
      if ((m = lines[i].match(/^\s*[-*]\s+(.*)$/))) {
        var uli = [];
        while (i < lines.length && (m = lines[i].match(/^\s*[-*]\s+(.*)$/))) { uli.push('<li>' + inlineMd(m[1]) + '</li>'); i++; }
        out.push('<ul>' + uli.join('') + '</ul>'); continue;
      }
      if (lines[i].trim() === '') { i++; continue; }
      var para = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^\s*\d+\.\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i])) {
        para.push(inlineMd(lines[i])); i++;
      }
      out.push('<p>' + para.join('<br>') + '</p>');
    }
    return out.join('');
  }

  function r0(x) { return (typeof x === 'number' && isFinite(x)) ? Math.round(x) : null; }
  function compactResult(res) {
    if (!res || typeof res !== 'object') return null;
    var out = {};
    Object.keys(res).forEach(function (k) {
      if (k.charAt(0) === '_') return;
      var v = res[k];
      if (typeof v === 'number' || typeof v === 'string') out[k] = v;
    });
    return out;
  }
  function sammleKontext() {
    var s = window.state || {};
    var k = s.kunde || null;
    var res = s.kalkResult || null;
    try { if (s.kalk && window.Kalk && window.Kalk.recalc) res = window.Kalk.recalc(s.kalk); } catch (e) {}
    return {
      view: s.view || null,
      tab: s.tab || null,
      kunde: k ? { name: k.name || '', phase: k.phase || '' } : null,
      kalkulation: s.kalk || null,
      ergebnis: compactResult(res),
      cashflowProJahr: (res && Array.isArray(res.cf)) ? res.cf.slice(0, 10).map(function (c, idx) {
        return { jahr: c.y || (idx + 1), cashflow: r0(c.cfJahr), kaltmieteMo: r0(c.kaltmieteMo), restschuld: r0(c.restschuld), steuervorteil: r0(c.stVorteilJahr) };
      }) : null,
      vermoegenProJahr: (res && Array.isArray(res.vermoegen)) ? res.vermoegen.map(function (v, idx) {
        return { jahr: idx, marktwert: r0(v.wert), restschuld: r0(v.restschuld), gesamtvermoegen: r0(v.vermoegenBrutto) };
      }) : null
    };
  }

  function aufbau() {
    if (el('bb-chat-root')) return;
    var root = document.createElement('div');
    root.id = 'bb-chat-root';
    root.innerHTML =
      '<button id="bb-chat-fab" title="Zipf" aria-label="Zipf öffnen"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg></button>' +
      '<div id="bb-chat-panel">' +
        '<div id="bb-chat-head"><span>Zipf · Assistent</span><button id="bb-chat-close" aria-label="Schließen">×</button></div>' +
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
    el('bb-chat-panel').classList.toggle('bb-open', offen);
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
        antwort.innerHTML = renderMarkdown(voll);
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
    if (!loggedIn) { offen = false; if (el('bb-chat-panel')) el('bb-chat-panel').classList.remove('bb-open'); }
  }

  // Leichter, isolierter Sichtbarkeits-Check (kein Eingriff in app.js-Routing).
  setInterval(sichtbarkeit, 800);
  if (document.readyState !== 'loading') sichtbarkeit();
  else document.addEventListener('DOMContentLoaded', sichtbarkeit);
})();
