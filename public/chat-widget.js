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
