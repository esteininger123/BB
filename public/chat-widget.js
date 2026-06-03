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
  function splitRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
  }
  function isBlockStart(line) {
    return /^\s*#{1,4}\s+/.test(line) || /^\s*([-*_])\1{2,}\s*$/.test(line) ||
           /^\s*\d+\.\s+/.test(line) || /^\s*[-*]\s+/.test(line) ||
           /^\s*>\s?/.test(line) || /^\s*\|.*\|\s*$/.test(line);
  }
  function renderMarkdown(text) {
    var lines = String(text).replace(/\r/g, '').split('\n');
    var out = [], i = 0, m;
    while (i < lines.length) {
      var line = lines[i];
      // Trennlinie
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      // Überschrift
      if ((m = line.match(/^\s*#{1,4}\s+(.*)$/))) { out.push('<div class="bb-md-h">' + inlineMd(m[1]) + '</div>'); i++; continue; }
      // Tabelle (Kopf-Zeile + Trenn-Zeile |---|)
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /-/.test(lines[i + 1]) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
        var header = splitRow(line); i += 2;
        var body = '';
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          body += '<tr>' + splitRow(lines[i]).map(function (c) { return '<td>' + inlineMd(c) + '</td>'; }).join('') + '</tr>'; i++;
        }
        out.push('<table class="bb-md-tbl"><thead><tr>' + header.map(function (c) { return '<th>' + inlineMd(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + body + '</tbody></table>');
        continue;
      }
      // Zitat
      if (/^\s*>\s?/.test(line)) {
        var q = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(inlineMd(lines[i].replace(/^\s*>\s?/, ''))); i++; }
        out.push('<blockquote>' + q.join('<br>') + '</blockquote>'); continue;
      }
      // nummerierte Liste
      if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
        var oli = [];
        while (i < lines.length && (m = lines[i].match(/^\s*\d+\.\s+(.*)$/))) { oli.push('<li>' + inlineMd(m[1]) + '</li>'); i++; }
        out.push('<ol>' + oli.join('') + '</ol>'); continue;
      }
      // Aufzählung
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
        var uli = [];
        while (i < lines.length && (m = lines[i].match(/^\s*[-*]\s+(.*)$/))) { uli.push('<li>' + inlineMd(m[1]) + '</li>'); i++; }
        out.push('<ul>' + uli.join('') + '</ul>'); continue;
      }
      if (line.trim() === '') { i++; continue; }
      // Absatz
      var startI = i, para = [];
      while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) { para.push(inlineMd(lines[i])); i++; }
      // Schutz gegen Nicht-Fortschritt: hat die Schleife keine Zeile konsumiert (z.B. eine Pipe-Zeile,
      // die isBlockStart als Block wertet, aber mangels Trennzeile kein Tabellenkopf ist), die Zeile
      // trotzdem als Text ausgeben und i zwingend erhöhen — sonst Endlosschleife → Browser friert ein.
      if (i === startI) { out.push('<p>' + inlineMd(lines[i]) + '</p>'); i++; continue; }
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
  function kompaktPipeline(s) {
    if (!Array.isArray(s.kunden)) return null;
    return s.kunden.slice(0, 80).map(function (x) {
      return { name: x.name || '', phase: x.phase || '', letzteAktivitaet: x.lastActivity || null };
    });
  }
  function kompaktSnapshots(s) {
    if (!Array.isArray(s.snapshots)) return null;
    return s.snapshots.slice(0, 30).map(function (x) {
      return { bezeichnung: x.bezeichnung || '', we: x.weBezeichnung || '', erstellt: x.created || null };
    });
  }
  function bonitaetDetail(s) {
    try {
      if (window.Kalk && window.Kalk.computeBonitaetDetailed && s.kunde && s.kunde.saJson) {
        return compactResult(window.Kalk.computeBonitaetDetailed(s.kunde.saJson, true));
      }
    } catch (e) {}
    return null;
  }
  function weMeta(kalk) {
    if (!kalk || typeof kalk !== 'object') return null;
    var keys = ['_adresse', 'adresse', '_lage', 'lage', '_projekt', 'projekt', '_weNr', 'weNr', '_stammdatenQuelle', '_excelTitel', '_baujahr', 'baujahr', '_zustand', 'zustand', '_kappungsgrenze', 'kappungsgrenze', '_vermietungsModus', 'vermietungsModus'];
    var out = {};
    keys.forEach(function (key) {
      var v = kalk[key];
      if (v != null && (typeof v === 'string' || typeof v === 'number')) out[key.replace(/^_/, '')] = v;
    });
    return Object.keys(out).length ? out : null;
  }
  function sammleKontext() {
    var s = window.state || {};
    var k = s.kunde || null;
    var res = s.kalkResult || null;
    // recalc nur im echten Kunden-Kontext (Kunde offen + Kalk vorhanden). Sonst die bereits
    // gerenderte state.kalkResult nehmen. Verhindert, dass auf Dashboard/WE-Liste/Admin eine
    // Default-Kalkulation als "echte Zahlen" an Zipf gehängt wird — und spart die Berechnung dort.
    try { if (s.view === 'kunde' && s.kalk && window.Kalk && window.Kalk.recalc) { var fresh = window.Kalk.recalc(s.kalk); if (fresh) res = fresh; } } catch (e) {}
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
      }) : null,
      bonitaet: bonitaetDetail(s),
      weDaten: weMeta(s.kalk),
      snapshots: kompaktSnapshots(s),
      pipeline: kompaktPipeline(s),
      notizen: (k && k.notizen) ? String(k.notizen).slice(0, 1200) : null
    };
  }

  function aufbau() {
    if (el('bb-chat-root')) return;
    var root = document.createElement('div');
    root.id = 'bb-chat-root';
    root.innerHTML =
      '<button id="bb-chat-fab" title="Zipf — Dein Helfer in der Backstube" aria-label="Zipf öffnen"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg></button>' +
      '<div id="bb-chat-panel">' +
        '<div id="bb-chat-head"><div class="bb-chat-id"><span class="bb-chat-name">Zipf</span><span class="bb-chat-tag">Dein Helfer in der Backstube</span></div><button id="bb-chat-close" aria-label="Schließen">×</button></div>' +
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
    var frageEl = bubble('user', frage);
    var antwort = bubble('bot', '');
    antwort.textContent = '…';
    var msgsEl = el('bb-chat-msgs');
    // Frage nach oben holen → man liest von Anfang an mit, während Zipf unten weiterschreibt
    msgsEl.scrollTop = frageEl.offsetTop - 8;
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
        // nur mitscrollen, wenn der Nutzer ohnehin unten ist — sonst in Ruhe lesen lassen
        var atBottom = (msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight) < 60;
        voll += dec.decode(r.value, { stream: true });
        antwort.innerHTML = renderMarkdown(voll.replace(/␞/g, ''));
        if (atBottom) msgsEl.scrollTop = msgsEl.scrollHeight;
      }
      // Server hängt bei abgebrochenem Upstream-Stream ␞ (U+241E) an. Dann ist die Antwort
      // unvollständig: Hinweis zeigen und NICHT in den Verlauf aufnehmen (sonst verfälschter Kontext).
      var abgebrochen = voll.indexOf('␞') !== -1;
      voll = voll.replace(/␞/g, '');
      antwort.innerHTML = renderMarkdown(voll) +
        (abgebrochen ? '<div style="opacity:.6;font-size:12px;margin-top:6px;">… Antwort wurde unterbrochen. Frag gern nochmal.</div>' : '');
      if (!abgebrochen && voll.trim()) {
        verlauf.push({ role: 'user', content: frage });
        verlauf.push({ role: 'assistant', content: voll });
      }
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
