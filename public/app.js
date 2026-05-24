/* app.js — SPA-Hauptlogik, hash-basiertes Routing.
   State + Render-Funktionen für: Login, Dashboard, Kunde-Detail (4 Tabs), Admin.
   Setzt globales window.__onGoogleAuth für Google-Sign-In.

   ─────────────────────────────────────────────────────────────────────────
   MODUL-MAP (Stand 19.05.2026 — physisches Zerschneiden für Iter 2 geplant)

   Aktuelle Datei: ~3120 LoC. Pragmatiker-Veto in diesem Lauf:
   Refactor-Aufwand parallel zu Audit-Fixes erhöht Bug-Risiko. Stattdessen
   dokumentierte Boundaries via `// ===== MODUL: <name> =====` (siehe unten).
   Iter 2 zieht die Module in eigene Files, index.html lädt sie in der
   gleichen Reihenfolge wie aktuell deklariert.

   Geplante physische Module:
     1. lib/state.js          — globaler State + PHASEN + AIRTABLE_LINKS
     2. lib/helpers.js        — esc/initialen/fmtDate/toast/route/go
     3. lib/render-helpers.js — kpiCard, sliderEur, slider, select
     4. views/auth.js         — renderLogin + initGoogleButton + __onGoogleAuth
     5. views/dashboard.js    — renderDashboard + createNewKunde + sync
     6. views/kunde.js        — renderKunde + renderTab + setTab + deleteKunde
     7. views/kalkulator-tab.js — alles ab `function renderTabKalkulator` bis
                                  inkl. Charts + Stories (~1200 LoC der größte
                                  Brocken — eigenes File rechtfertigt sich)
     8. views/selbstauskunft-tab.js — saAuswertungHtml + saPersonHtml + collect
     9. views/snapshots-tab.js — renderTabSnapshots + loadSnapshot
    10. views/admin.js        — renderAdmin + renderAdminStammdatenAudit
    11. bootstrap.js          — render() + window.addEventListener('load')

   Dependencies fließen einseitig: state → helpers → render-helpers → views.
   Kein Modul lädt umgekehrt — sonst Zirkular-Risiko ohne Build-Tool.

   Wenn du zwischen Sektionen springst, halte dich an die Header — sie sind
   die Modul-Grenze für Iter 2.
   ───────────────────────────────────────────────────────────────────────── */

// ===== MODUL: lib/state =====
const state = {
  user: null,                // {id, name, email, telefon, rolle, fotoUrl}
  view: 'login',             // 'login' | 'dashboard' | 'kunde' | 'admin'
  kundeId: null,
  tab: 'uebersicht',         // 'uebersicht' | 'kalkulator' | 'selbstauskunft' | 'snapshots'
  kunden: [],
  wohneinheiten: [],
  kunde: null,               // aktiver Kunde (volle Daten)
  snapshots: [],
  kalk: null,                // aktiver Kalkulator-State (Inputs)
  adminStats: null,
  googleClientId: null,
  loadingData: false,
  lastError: null,
};
// FS-2f BLOCKER (24.05.2026 Edgar 14:30 — Bug-Sweep BUG-1): state als window.state
// exportieren. Sonst greift stringifyKavTracker-Fallback auf undefined →
// Wunsch-Profil wird bei jedem nachfolgenden saveNotizen/Activity-Save GELÖSCHT.
// Das war Edgar's „bei anderen Kunden klickbar"-Symptom.
window.state = state;

const PHASEN = ['Lead','Kalkulation läuft','Reservierung','Selbstauskunft','Bank-Einreichung','Notar-Termin','Beurkundet','Abgebrochen'];

// Audit-Fix Iter 49 (19.05.2026): Airtable-Direktlinks zentralisiert. Wenn die Base
// umzieht oder eine Tabelle verschoben wird, nur hier anpassen.
const AIRTABLE_BASE_ID = 'appikHUetNyeonXBX';
const AIRTABLE_LINKS = {
  KALK_STAMMDATEN: `https://airtable.com/${AIRTABLE_BASE_ID}/tblz5KNtzkLSLHHFo`,
  WOHNEINHEIT:     `https://airtable.com/${AIRTABLE_BASE_ID}/tblAV81mX1MaxqVQi`,
};

// ===== MODUL: lib/helpers (Routing + Toast + esc/initialen/fmtDate) =====
/* ============================== ROUTING ============================== */

function route() {
  const hash = (window.location.hash || '#/').replace(/^#/, '');
  if (!state.user) { state.view = 'login'; return; }
  if (hash === '/' || hash === '/dashboard' || hash === '') {
    state.view = 'dashboard';
  } else if (hash.startsWith('/kunde/')) {
    state.view = 'kunde';
    const parts = hash.split('/').filter(Boolean); // kunde, :id, [tab]
    state.kundeId = parts[1] || null;
    state.tab = parts[2] || 'uebersicht';
  } else if (hash === '/admin') {
    state.view = (state.user.rolle === 'Admin') ? 'admin' : 'dashboard';
  } else if (hash === '/we-liste' || hash === '/aktive-we' || hash === '/vertrieb') {
    state.view = 'we-liste';
  } else {
    state.view = 'dashboard';
  }
}

function go(hash) {
  window.location.hash = hash;
}

/* ============================== TOAST ============================== */

function toast(msg, type) {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  // QA-Fix 2026-05-22: warning + info Typen ergänzt für Snapshot-Aktualitäts-Hinweis.
  // Warning bleibt 8s sichtbar (statt 3.5s), damit Vertriebler die Info erfasst.
  if (type === 'error')   el.style.background = 'var(--negative)';
  if (type === 'success') el.style.background = 'var(--positive)';
  if (type === 'warning') { el.style.background = '#B08A4D'; el.style.color = '#fff'; }
  if (type === 'info')    { el.style.background = '#3A3A35'; el.style.color = '#fff'; }
  el.textContent = msg;
  c.appendChild(el);
  const lifeMs = (type === 'warning' || type === 'info') ? 8000 : 3500;
  setTimeout(() => el.remove(), lifeMs);
}

/* ============================== HELPERS ============================== */

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function initialen(name) {
  if (!name) return '?';
  return name.split(/\s+/).map(p => p[0] || '').slice(0,2).join('').toUpperCase();
}
function phaseBadgeClass(phase) {
  if (!phase) return '';
  const p = phase.toLowerCase();
  if (p.startsWith('lead')) return 'lead';
  if (p.startsWith('kalk')) return 'kalkulation';
  if (p.startsWith('reserv')) return 'reservierung';
  if (p.startsWith('selbst')) return 'selbstauskunft';
  if (p.startsWith('bank')) return 'bank';
  if (p.startsWith('notar')) return 'notar';
  if (p.startsWith('beurk')) return 'beurkundet';
  if (p.startsWith('abge')) return 'abgebrochen';
  return '';
}
function fmtDate(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    // QA-Fix 2026-05-23 (Audit-X12): `new Date('foo').toLocaleDateString()` wirft
    // KEINEN Fehler, sondern liefert "Invalid Date". Vorher rutschte das in die UI.
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('de-DE');
  } catch(e) {
    return '—';
  }
}

// ===== MODUL: views/auth (renderHeader + Login + Logout + Google-Sign-In) =====
/* ============================== HEADER ============================== */

function renderHeader() {
  const h = document.getElementById('app-header');
  if (!state.user) { h.classList.add('hidden'); return; }
  h.classList.remove('hidden');
  const um = document.getElementById('user-menu');
  const isAdmin = state.user.rolle === 'Admin';
  // QA-Fix 2026-05-23 (Audit D-1): Active-State pro Nav-Link. User sieht
  // wo er ist (Dashboard vs Aktive WEs vs Admin).
  const active = (view) => state.view === view ? ' nav-link-active' : '';
  um.innerHTML = `
    <a href="#/dashboard" class="nav-link${active('dashboard')}" title="Deine Kunden + Pipeline">Meine Kunden</a>
    <a href="#/we-liste" class="nav-link${active('we-liste')}" title="Alle Wohnungen in aktiver Vermarktung mit Kennzahlen">Wohnungen</a>
    ${isAdmin ? `<a href="#/admin" class="nav-link${active('admin')}">Admin</a>` : ''}
    <button type="button" class="bbk-help-btn" onclick="startTour()" title="Tour starten — wie funktioniert das Tool?">?</button>
    <div class="user-name">${esc(state.user.name)}</div>
    <div class="avatar">${esc(initialen(state.user.name))}</div>
    <button class="secondary" onclick="doLogout()" title="Abmelden">Logout</button>
  `;
}

async function doLogout() {
  try { await api.post('/api/auth/logout', {}); } catch(e) {}
  state.user = null;
  state.view = 'login';
  go('/');
  render();
}
window.doLogout = doLogout;

/* ============================== LOGIN ============================== */

async function loadGoogleConfig() {
  if (state.googleClientId) return state.googleClientId;
  try {
    const cfg = await api.get('/api/config');
    state.googleClientId = cfg.googleClientId;
  } catch (e) {
    console.warn('Config-Endpoint nicht erreichbar', e);
    state.googleClientId = null;
  }
  return state.googleClientId;
}

function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-box">
        <div class="bub-brand" style="margin-bottom:18px;">
          <span class="bub-brand-main">B&amp;B Backstube</span>
          <span class="bub-brand-sub">Jetzt wird gebacken!</span>
        </div>

        ${state.lastError ? `<div class="error-banner">${esc(state.lastError)}</div>` : ''}

        <div class="gbtn-wrap" id="gbtn-mount">
          <div class="text-tertiary text-small">Google-Sign-In wird geladen…</div>
        </div>

        <div class="footer-note">
          Nur freigeschaltete Vertriebler haben Zugriff.<br>
          Fragen? <a href="mailto:e.steininger@immo-stein.de">Edgar Steininger</a>
        </div>
      </div>
    </div>
  `;

  // Google-Sign-In setup
  loadGoogleConfig().then(clientId => {
    if (!clientId) {
      document.getElementById('gbtn-mount').innerHTML =
        '<div class="error-banner">Google Client ID nicht konfiguriert. Edgar muss <code>GOOGLE_CLIENT_ID</code> in Vercel setzen.</div>';
      return;
    }
    initGoogleButton(clientId);
  });
}

function initGoogleButton(clientId) {
  // GSI wartet asynchron — Polling
  let tries = 0;
  const iv = setInterval(() => {
    tries++;
    if (window.google && window.google.accounts && window.google.accounts.id) {
      clearInterval(iv);
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleResponse,
      });
      const mount = document.getElementById('gbtn-mount');
      if (mount) {
        mount.innerHTML = '';
        window.google.accounts.id.renderButton(mount, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          locale: 'de',
        });
      }
    }
    if (tries > 50) clearInterval(iv);
  }, 100);
}

window.__onGoogleAuth = async function(response) {
  try {
    const result = await api.post('/api/auth/google', { token: response.credential });
    state.user = result.vertriebler;
    state.lastError = null;
    await loadInitialData();
    go('/dashboard');
    render();
  } catch (e) {
    state.lastError = (e.body && e.body.error) || 'Login fehlgeschlagen. Bist du in der Vertriebler-Liste?';
    render();
  }
};

// ===== MODUL: lib/data-loading (loadInitialData + loadKunde + makeDefaultKalkInput) =====
/* ============================== DATA LOADING ============================== */

async function loadInitialData() {
  state.loadingData = true;
  try {
    const [kunden, wes, stammAudit] = await Promise.all([
      api.get('/api/kunden?mineOnly=1').catch(() => []),
      api.get('/api/wohneinheiten').catch(() => []),
      api.get('/api/stammdaten').catch(() => []),
    ]);
    state.kunden = Array.isArray(kunden) ? kunden : [];
    state.wohneinheiten = Array.isArray(wes) ? wes : [];
    // Iter 45: Stammdaten-Cache für Paket-Modus (Pro-rata-Stellplatz-Daten).
    // Sammel-Endpoint liefert pro WE die echte mieteMoSumme + kaufpreisSumme aus
    // Mietverträgen — sonst wäre der Paket-Modus mit Stellplatz=0 unterwegs.
    state.stammdatenByWe = {};
    if (Array.isArray(stammAudit)) {
      stammAudit.forEach(s => {
        if (s && s.we && s.we.id) state.stammdatenByWe[s.we.id] = s;
      });
    }
  } finally {
    state.loadingData = false;
  }
}

async function loadKunde(id) {
  try {
    // FS-2f BLOCKER (24.05.2026 Bug-Sweep BUG-6): Queue beim Kunden-Wechsel
    // resetten. Sonst hängen alle Notizen-Mutations bei Kunde B in der Queue
    // hinter einem evtl. blockierten Save von Kunde A → „Buttons reagieren nicht".
    _kavSaveQueue = Promise.resolve();
    const k = await api.get('/api/kunden/' + id);
    state.kunde = k;
    state.snapshots = await api.get('/api/snapshots?kundeId=' + id).catch(() => []);
    // Kalk-State aus selbstauskunft-JSON oder Default
    state.kalk = makeDefaultKalkInput();
    clearKalkDirty();
  } catch (e) {
    toast('Kunde konnte nicht geladen werden: ' + e.message, 'error');
    state.kunde = null;
  }
}

function makeDefaultKalkInput() {
  // Defaults aus V1 (Wesseling WE 6 + Standard-Anleger)
  if (window.Kalk && window.Kalk.getDefaults) return window.Kalk.getDefaults();
  return {};
}

// ===== MODUL: views/dashboard (renderDashboard + createNewKunde + syncStammdatenInSa) =====
/* ============================== DASHBOARD ============================== */

function renderDashboard() {
  const app = document.getElementById('app');
  const meine = state.kunden;

  // QA-Sprint 2026-05-23 (CRM-Redesign): KAV-Phase aus Tracker (statt altem Phase-Feld).
  // Stats: pro Phase Anzahl + Wiedervorlagen-Status (overdue / today / soon).
  const phasenCounts = { phase1: 0, phase2: 0, phase3: 0, abgeschlossen: 0 };
  const wvOverdue = [];
  const wvToday = [];
  const wvSoon = [];
  meine.forEach(k => {
    const tracker = getKavTracker(k);
    const phId = kavCurrentPhase(tracker);
    if (phasenCounts[phId] !== undefined) phasenCounts[phId]++;
    const wv = kavWiedervorlageStatus(tracker);
    if (wv.status === 'overdue') wvOverdue.push({ k, wv });
    else if (wv.status === 'today') wvToday.push({ k, wv });
    else if (wv.status === 'soon') wvSoon.push({ k, wv });
  });

  // Wiedervorlagen-Karte oben (nur wenn was zu zeigen ist)
  const wiedervorlagenCard = (wvOverdue.length + wvToday.length + wvSoon.length > 0) ? `
    <div class="card wv-card">
      <div class="card-title" style="display:flex;align-items:center;gap:10px;">
        <span>🔔 Wiedervorlagen</span>
        <span class="text-tertiary text-small" style="font-weight:normal;">${wvOverdue.length + wvToday.length} aktiv${wvSoon.length > 0 ? ' · ' + wvSoon.length + ' demnächst' : ''}</span>
      </div>
      <div class="wv-rows">
        ${wvOverdue.map(({k, wv}) => `
          <div class="wv-row overdue" onclick="go('/kunde/${esc(k.id)}')">
            <div class="wv-row-status">⚠ ${wv.tageUeber}d überfällig</div>
            <div class="wv-row-main"><strong>${esc(k.name || (k.vorname + ' ' + k.nachname) || '—')}</strong>${wv.notiz ? ' · <span class="text-tertiary">' + esc(wv.notiz) + '</span>' : ''}</div>
            <div class="wv-row-date">${esc(fmtDate(wv.datum))}</div>
          </div>
        `).join('')}
        ${wvToday.map(({k, wv}) => `
          <div class="wv-row today" onclick="go('/kunde/${esc(k.id)}')">
            <div class="wv-row-status">🔔 heute</div>
            <div class="wv-row-main"><strong>${esc(k.name || (k.vorname + ' ' + k.nachname) || '—')}</strong>${wv.notiz ? ' · <span class="text-tertiary">' + esc(wv.notiz) + '</span>' : ''}</div>
            <div class="wv-row-date">${esc(fmtDate(wv.datum))}</div>
          </div>
        `).join('')}
        ${wvSoon.map(({k, wv}) => `
          <div class="wv-row soon" onclick="go('/kunde/${esc(k.id)}')">
            <div class="wv-row-status">in ${wv.tage}d</div>
            <div class="wv-row-main"><strong>${esc(k.name || (k.vorname + ' ' + k.nachname) || '—')}</strong>${wv.notiz ? ' · <span class="text-tertiary">' + esc(wv.notiz) + '</span>' : ''}</div>
            <div class="wv-row-date">${esc(fmtDate(wv.datum))}</div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  app.innerHTML = `
    <div class="main">
      <div class="toolbar">
        <div>
          <h1 class="page-title">Hallo ${esc(state.user.name.split(' ')[0])}</h1>
          <p class="page-subtitle">${meine.length} Kunden in Bearbeitung</p>
        </div>
        <button onclick="createNewKunde()">+ Neuer Kunde</button>
      </div>

      ${meine.length === 0 ? '' : `
      ${(() => {
        // FS-1 (24.05.2026): Filter nach Dashboard-Render re-applien
        setTimeout(() => {
          if (typeof applyKundenFilter === 'function' && document.getElementById('kunden-tbl')) {
            applyKundenFilter();
          }
        }, 0);
        return '';
      })()}
      <div class="phasen-row kav-phasen-row">
        ${KAV_PHASES.map(ph => `
          <div class="phase-kpi kav-phase-kpi" style="--kav-accent:${ph.accent};">
            <div class="label">Phase ${ph.nr} · ${esc(ph.label)}</div>
            <div class="value">${phasenCounts[ph.id] || 0}</div>
            <div class="sub">${esc(ph.sub)}</div>
          </div>
        `).join('')}
        <div class="phase-kpi kav-phase-kpi kav-done-kpi">
          <div class="label">✓ Abgeschlossen</div>
          <div class="value">${phasenCounts.abgeschlossen || 0}</div>
          <div class="sub">Beurkundet</div>
        </div>
      </div>`}

      ${wiedervorlagenCard}

      <div class="card">
        <div class="card-title">
          <span>Meine Kunden ${meine.length > 0 ? `<span class="text-tertiary text-small" style="font-weight:normal;">· ${meine.length}</span>` : ''}</span>
        </div>

        ${meine.length === 0 ? `
          <div class="empty-state">
            Noch keine Kunden. Klick auf <strong>"+ Neuer Kunde"</strong>.
          </div>
        ` : `
          <table class="table kunden-tbl" id="kunden-tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phase · Aufgaben</th>
                <th class="num">EK frei</th>
                <th class="num">Einkommen frei/Mo</th>
                <th>Wunschregionen</th>
                <th>Letzte Aktivität</th>
              </tr>
              ${meine.length >= 3 ? `<tr class="kf-row">
                <th><input type="text" id="kf-search" placeholder="Suche…" value="${esc(_kfState.q || '')}" oninput="applyKundenFilter()"></th>
                <th><span class="kf-count" id="kf-count">${meine.length}</span></th>
                <th><input type="number" id="kf-ek" placeholder="min €" min="0" step="1000" value="${_kfState.ekMin || ''}" oninput="applyKundenFilter()"></th>
                <th><input type="number" id="kf-eink" placeholder="min €/Mo" min="0" step="50" value="${_kfState.einkMin || ''}" oninput="applyKundenFilter()"></th>
                <th>${_kfBlDropdownHtml(meine)}</th>
                <th><button onclick="_kfReset()" class="kf-reset" title="Filter zurücksetzen">↺</button></th>
              </tr>` : ''}
            </thead>
            <tbody>
              ${meine.map(k => _renderKundeRow(k)).join('')}
            </tbody>
          </table>
          <div id="kunden-tbl-empty" class="empty-state" style="display:none;padding:24px;text-align:center;color:var(--text-tertiary);">
            Kein Kunde matched die Filter.
          </div>
        `}
      </div>
    </div>
  `;
}

// Welle Filter (24.05.2026): Helper — extrahiert Bonität + Wunsch-Profil pro Kunde
// FS-1 (Tech-Architekt H-5): Memo-Cache. computeBonitaetDetailed ist nicht billig
// (~5-10 ms pro Kunde mit SA). Bei 100 Kunden × mehreren Aufrufen pro Render
// wird das spürbar. Cache pro (kundeId, saJson-Hash, notizen-Hash).
const _kfDataCache = new Map();
function _kundeFilterData(k) {
  if (!k || !k.id) {
    // Defensiv: ohne ID kein Cache, einfach rechnen
    return _computeKundeFilterData(k);
  }
  // Cache-Key: kundeId + Längen-Hash der saJson und notizen (billig, kollisionsarm
  // für sich nicht änderndes Volumen)
  const saStr = k.saJson ? JSON.stringify(k.saJson) : '';
  const notStr = k.notizen || '';
  const key = k.id + ':' + saStr.length + ':' + notStr.length + ':' + (saStr.length > 0 ? saStr.charCodeAt(saStr.length - 1) : 0) + ':' + (notStr.length > 0 ? notStr.charCodeAt(notStr.length - 1) : 0);
  if (_kfDataCache.has(key)) return _kfDataCache.get(key);
  const fd = _computeKundeFilterData(k);
  // Cache-Größe begrenzen (alte Einträge raus wenn > 500)
  if (_kfDataCache.size > 500) {
    const firstKey = _kfDataCache.keys().next().value;
    _kfDataCache.delete(firstKey);
  }
  _kfDataCache.set(key, fd);
  return fd;
}

function _computeKundeFilterData(k) {
  let liquid = 0, ueber = 0;
  if (k && k.saJson && typeof window.Kalk !== 'undefined' && window.Kalk.computeBonitaetDetailed) {
    try {
      const bd = window.Kalk.computeBonitaetDetailed(k.saJson, true);
      if (bd) {
        liquid = bd.liquidesVermoegen || 0;
        ueber = bd.ueberschussMo || 0;
      }
    } catch {}
  }
  const wp = (typeof parseWunschProfil === 'function') ? parseWunschProfil((k && k.notizen) || '') : { regionen: [] };
  const blSet = new Set();
  const kreisSet = new Set();
  (wp.regionen || []).forEach(r => {
    const p = (typeof parseRegionKey === 'function') ? parseRegionKey(r) : null;
    if (p) {
      blSet.add(p.bl);
      if (p.kreis !== '*') kreisSet.add(r);
    }
  });
  return { liquid, ueber, wp, blSet, kreisSet };
}

function _renderKundeRow(k) {
  const fd = _kundeFilterData(k);
  const REG = window.REGIONEN || {};
  // Anzeige Wunschregionen: Bundesland-Namen + Kreis-Anzahl
  const regCells = [...fd.blSet].map(bl => {
    const krCount = [...fd.kreisSet].filter(key => key.startsWith(bl + ':')).length;
    const blName = (REG[bl] && REG[bl].name) ? REG[bl].name : bl;
    return `<span class="wp-bl-pill active" style="font-size:10.5px;padding:2px 8px;cursor:default;">${esc(blName)}${krCount > 0 ? ` · ${krCount}` : ''}</span>`;
  }).join('');
  const blsCsv = [...fd.blSet].join(',');
  const kreisCsv = [...fd.kreisSet].join('|');
  return `
    <tr data-search="${esc(((k.name || (k.vorname + ' ' + k.nachname) || '') + ' ' + (k.email || '')).toLowerCase())}"
        data-ek="${Math.round(fd.liquid)}"
        data-eink="${Math.round(fd.ueber)}"
        data-bls="${esc(blsCsv)}"
        data-kreise="${esc(kreisCsv)}"
        onclick="go('/kunde/${esc(k.id)}')">
      <td><strong>${esc(k.name || (k.vorname + ' ' + k.nachname) || '—')}</strong>${k.email ? `<div class="text-tertiary text-small">${esc(k.email)}</div>` : ''}</td>
      <td>${kavListeBadges(k)}</td>
      <td class="num">${fd.liquid > 0 ? Math.round(fd.liquid).toLocaleString('de-DE') + ' €' : '<span class="text-tertiary">–</span>'}</td>
      <td class="num">${fd.ueber !== 0 ? `<span style="color:${fd.ueber > 0 ? 'var(--positive)' : 'var(--negative)'}">${Math.round(fd.ueber).toLocaleString('de-DE')} €</span>` : '<span class="text-tertiary">–</span>'}</td>
      <td>${regCells || '<span class="text-tertiary text-small">—</span>'}</td>
      <td class="text-tertiary">${esc(fmtDate(k.lastActivity))}</td>
    </tr>
  `;
}

// Filter v3 (Edgar 24.05.2026): kompakter Header-Filter direkt unter den
// Spalten-Headers. BL als Dropdown mit Checkboxen. Kein Kreis-Filter mehr
// im Header (zu komplex) — wenn benötigt: Kunde im Detail öffnen.
// FS-1 Vertriebler-Audit HARD-BLOCKER C1+C2 (2026-05-24 11:00): Filter-State
// muss beim Kunden-Wechsel + Re-Render erhalten bleiben. Persistiert in
// sessionStorage (per Session, nicht über Browser-Close hinaus).
const _KF_LS_KEY = 'bbk_kf_state';
const _kfState = (() => {
  try {
    const raw = sessionStorage.getItem(_KF_LS_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      return {
        q: o.q || '',
        ekMin: o.ekMin || 0,
        einkMin: o.einkMin || 0,
        bls: new Set(Array.isArray(o.bls) ? o.bls : []),
        kreise: new Set(Array.isArray(o.kreise) ? o.kreise : []),
      };
    }
  } catch {}
  return { q: '', ekMin: 0, einkMin: 0, bls: new Set(), kreise: new Set() };
})();
function _kfPersist() {
  try {
    sessionStorage.setItem(_KF_LS_KEY, JSON.stringify({
      q: _kfState.q, ekMin: _kfState.ekMin, einkMin: _kfState.einkMin,
      bls: [..._kfState.bls], kreise: [..._kfState.kreise]
    }));
  } catch {}
}

// Custom Multi-Select-Dropdown für Bundesländer im Tabellen-Header.
// Trigger-Button + Popup, click-outside zum Schließen.
function _kfBlDropdownHtml(meine) {
  const BL = (window.REGIONEN_BL_KEYS || []);
  const REG = window.REGIONEN || {};
  const usedBls = new Set();
  meine.forEach(k => {
    const fd = _kundeFilterData(k);
    fd.blSet.forEach(bl => usedBls.add(bl));
  });
  const showBls = (usedBls.size > 0 ? [...usedBls] : BL).sort((a,b)=>REG[a].name.localeCompare(REG[b].name,'de'));
  const selCount = _kfState.bls.size;
  const triggerLabel = selCount === 0
    ? 'Alle BL'
    : selCount === 1
      ? esc(REG[[..._kfState.bls][0]].name)
      : `${selCount} BL`;
  const opts = showBls.map(bl => `
    <label class="kf-bl-opt">
      <input type="checkbox" ${_kfState.bls.has(bl) ? 'checked' : ''} onchange="_kfBlCheck('${bl}', this.checked)">
      <span>${esc(REG[bl].name)}</span>
    </label>
  `).join('');
  return `
    <div class="kf-bl-dd">
      <button type="button" class="kf-bl-trigger${selCount > 0 ? ' active' : ''}" onclick="_kfBlOpen(event)">${triggerLabel} <span class="kf-bl-arrow">▾</span></button>
      <div class="kf-bl-popup" id="kf-bl-popup" hidden>
        <div class="kf-bl-popup-head">
          <button type="button" onclick="_kfBlAllInPopup(true)" class="kf-bl-mini">Alle</button>
          <button type="button" onclick="_kfBlAllInPopup(false)" class="kf-bl-mini">Keine</button>
          <button type="button" onclick="_kfBlClose()" class="kf-bl-mini kf-bl-close">✕</button>
        </div>
        ${opts || '<div style="padding:8px;color:var(--text-tertiary);font-size:11px;">Keine Wunschregionen gepflegt</div>'}
      </div>
    </div>
  `;
}
window._kfBlDropdownHtml = _kfBlDropdownHtml;

// FS-1 (24.05.2026, Tech-Architekt H-2): Single-Listener-Pattern.
// Vorher konnte jeder Open-Click einen zusätzlichen document-Listener registrieren
// (Memory-Leak + Mehrfach-Calls). Jetzt: alter Listener vor neuem Bind killen.
let _kfBlPopupListener = null;
function _kfBlOpen(ev) {
  if (ev) ev.stopPropagation();
  const pop = document.getElementById('kf-bl-popup');
  if (!pop) return;
  pop.hidden = !pop.hidden;
  if (pop.hidden) {
    if (_kfBlPopupListener) {
      document.removeEventListener('click', _kfBlPopupListener);
      _kfBlPopupListener = null;
    }
    return;
  }
  // Bei Open: alten Listener killen + neuen registrieren
  if (_kfBlPopupListener) {
    document.removeEventListener('click', _kfBlPopupListener);
    _kfBlPopupListener = null;
  }
  setTimeout(() => {
    _kfBlPopupListener = (e) => {
      if (!pop.contains(e.target) && !e.target.classList.contains('kf-bl-trigger')) {
        _kfBlClose();
      }
    };
    document.addEventListener('click', _kfBlPopupListener);
  }, 50);
}
window._kfBlOpen = _kfBlOpen;
function _kfBlClose() {
  const pop = document.getElementById('kf-bl-popup');
  if (pop) pop.hidden = true;
  if (_kfBlPopupListener) {
    document.removeEventListener('click', _kfBlPopupListener);
    _kfBlPopupListener = null;
  }
}
window._kfBlClose = _kfBlClose;
function _kfBlCheck(bl, checked) {
  if (checked) _kfState.bls.add(bl);
  else _kfState.bls.delete(bl);
  _kfPersist();
  // Trigger-Label updaten ohne Popup zu schließen
  _kfRefreshDropdownTrigger();
  applyKundenFilter();
}
window._kfBlCheck = _kfBlCheck;
function _kfBlAllInPopup(aktivieren) {
  const REG = window.REGIONEN || {};
  const usedBls = new Set();
  (state.kunden || []).forEach(k => {
    const fd = _kundeFilterData(k);
    fd.blSet.forEach(bl => usedBls.add(bl));
  });
  const BL = (window.REGIONEN_BL_KEYS || []);
  const showBls = usedBls.size > 0 ? [...usedBls] : BL;
  if (aktivieren) showBls.forEach(bl => _kfState.bls.add(bl));
  else _kfState.bls.clear();
  // Checkboxen im Popup updaten + Trigger-Label
  document.querySelectorAll('#kf-bl-popup .kf-bl-opt input[type=checkbox]').forEach(cb => {
    const lbl = cb.parentElement && cb.parentElement.querySelector('span');
    if (!lbl) return;
    const name = lbl.textContent;
    const bl = Object.keys(REG).find(k => REG[k].name === name);
    if (bl) cb.checked = _kfState.bls.has(bl);
  });
  _kfRefreshDropdownTrigger();
  applyKundenFilter();
}
window._kfBlAllInPopup = _kfBlAllInPopup;
function _kfRefreshDropdownTrigger() {
  const trigger = document.querySelector('.kf-bl-trigger');
  if (!trigger) return;
  const REG = window.REGIONEN || {};
  const selCount = _kfState.bls.size;
  const triggerLabel = selCount === 0
    ? 'Alle BL'
    : selCount === 1
      ? REG[[..._kfState.bls][0]].name
      : `${selCount} BL`;
  trigger.innerHTML = `${esc(triggerLabel)} <span class="kf-bl-arrow">▾</span>`;
  trigger.classList.toggle('active', selCount > 0);
}

function _kfReset() {
  ['kf-search','kf-ek','kf-eink'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  _kfState.q = '';
  _kfState.ekMin = 0;
  _kfState.einkMin = 0;
  _kfState.bls.clear();
  _kfState.kreise.clear();
  _kfPersist();
  document.querySelectorAll('#kf-bl-popup .kf-bl-opt input[type=checkbox]').forEach(cb => cb.checked = false);
  _kfRefreshDropdownTrigger();
  applyKundenFilter();
}
window._kfReset = _kfReset;

function applyKundenFilter() {
  const q = (document.getElementById('kf-search')?.value || '').toLowerCase().trim();
  const ekMin = parseFloat(document.getElementById('kf-ek')?.value) || 0;
  const einkMin = parseFloat(document.getElementById('kf-eink')?.value) || 0;
  // FS-1 (24.05.2026): State persistieren für Re-Renders
  _kfState.q = q;
  _kfState.ekMin = ekMin;
  _kfState.einkMin = einkMin;
  _kfPersist();
  const rows = document.querySelectorAll('#kunden-tbl tbody tr');
  let visible = 0;
  rows.forEach(r => {
    const text = r.dataset.search || '';
    const ek = parseFloat(r.dataset.ek) || 0;
    const eink = parseFloat(r.dataset.eink) || 0;
    const bls = (r.dataset.bls || '').split(',').filter(Boolean);
    const kreise = (r.dataset.kreise || '').split('|').filter(Boolean);
    let match = true;
    if (q && !text.includes(q)) match = false;
    if (ekMin > 0 && ek < ekMin) match = false;
    if (einkMin > 0 && eink < einkMin) match = false;
    // Multi-BL: Kunde matched wenn EINER seiner BLs in der Filter-Auswahl ist
    if (_kfState.bls.size > 0) {
      const blMatch = bls.some(bl => _kfState.bls.has(bl));
      if (!blMatch) match = false;
    }
    // Multi-Kreis: Kunde matched wenn EINER seiner Kreise in der Filter-Auswahl ist
    // (Kreis-Filter implizit innerhalb der BL-Filter — wenn Kreise gesetzt, müssen sie matchen)
    if (_kfState.kreise.size > 0) {
      // Wenn der BL des Kreises insgesamt aktiv ist UND keine Kreise diesem BL gefiltert,
      // gilt der Kunde als „BL-weite Auswahl" und matched.
      const krMatch = kreise.some(k => _kfState.kreise.has(k))
        || bls.some(bl => _kfState.bls.has(bl) && ![..._kfState.kreise].some(k => k.startsWith(bl + ':')));
      if (!krMatch) match = false;
    }
    r.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  const empty = document.getElementById('kunden-tbl-empty');
  if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
  const cnt = document.getElementById('kf-count');
  if (cnt) cnt.textContent = `${visible} von ${rows.length} Kunden`;
}
window.applyKundenFilter = applyKundenFilter;

// QA-Fix 2026-05-23 (Audit-EE-3): Live-Suche auf Dashboard. Backward-Compat —
// ruft jetzt den neuen applyKundenFilter mit übersetztem Wert auf.
function filterKundenListe(query) {
  const inp = document.getElementById('kf-search');
  if (inp) { inp.value = query || ''; applyKundenFilter(); return; }
  // Fallback (wenn Filter-Bar nicht gerendert wurde)
  const q = (query || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#kunden-tbl tbody tr');
  let visible = 0;
  rows.forEach(r => {
    const text = r.dataset.search || '';
    const match = !q || text.includes(q);
    r.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  const empty = document.getElementById('kunden-tbl-empty');
  if (empty) empty.style.display = visible === 0 && q ? 'block' : 'none';
}
window.filterKundenListe = filterKundenListe;

// Iter 61 (20.05.2026): Drei sequenzielle `prompt()`-Dialoge durch ein
// einzelnes Modal ersetzt. Grund: prompt() hat keinen Format-Check, blockiert
// den UI-Thread, und wenn die Zwischenablage gefüllt war, landeten identische
// Strings in allen drei Feldern (Vorname == Nachname == E-Mail). Das Modal
// nutzt denselben Style wie die Reservierungs-Modals (DRY).
async function createNewKunde() {
  const data = await openNeuerKundeModal();
  if (!data) return;
  const { vorname, nachname, email, telefon } = data;
  try {
    // Stammdaten direkt auch in die Selbstauskunft übertragen → der Vertriebler tippt
    // den Kunden 1× ein, alles ist überall da.
    const saJson = {
      gemeinsam: false,
      antragsteller: {
        vorname,
        name: nachname,
        email: email || '',
        telefonPrivat: telefon || '',
      },
      mitantragsteller: {},
    };
    const k = await api.post('/api/kunden', {
      vorname, nachname, email: email || '', telefon: telefon || '', phase: 'Lead', saJson,
    });
    state.kunden.push(k);
    toast('Kunde angelegt', 'success');
    go('/kunde/' + k.id);
  } catch (e) {
    toast('Fehler: ' + e.message, 'error');
  }
}
window.createNewKunde = createNewKunde;

// Neuer-Kunde-Modal — gibt {vorname, nachname, email, telefon} zurück oder null bei Abbruch.
// Nutzt die Reservierungs-Modal-Styles wieder (gleicher visueller Stil, kein Duplikat).
function openNeuerKundeModal() {
  _reservEnsureStyles();
  _neuerKundeEnsureStyles();
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'reserv-modal-overlay';
    m.innerHTML =
      '<div class="reserv-modal nk-modal">' +
        '<h2>Neuen Kunden anlegen</h2>' +
        '<div class="reserv-modal-body">' +
          '<div class="nk-grid">' +
            '<label class="nk-field">' +
              '<span class="nk-label">Vorname <span class="nk-req">*</span></span>' +
              '<input type="text" id="nk-vorname" autocomplete="given-name" />' +
            '</label>' +
            '<label class="nk-field">' +
              '<span class="nk-label">Nachname <span class="nk-req">*</span></span>' +
              '<input type="text" id="nk-nachname" autocomplete="family-name" />' +
            '</label>' +
            '<label class="nk-field nk-full">' +
              '<span class="nk-label">E-Mail</span>' +
              '<input type="email" id="nk-email" autocomplete="email" placeholder="optional" />' +
            '</label>' +
            '<label class="nk-field nk-full">' +
              '<span class="nk-label">Telefon</span>' +
              '<input type="tel" id="nk-telefon" autocomplete="tel" placeholder="optional" />' +
            '</label>' +
          '</div>' +
          '<div id="nk-error" class="nk-error" hidden></div>' +
        '</div>' +
        '<div class="reserv-modal-actions">' +
          '<button class="reserv-cancel" id="nk-cancel-btn">Abbrechen</button>' +
          '<button class="reserv-confirm" id="nk-save-btn">Anlegen</button>' +
        '</div>' +
      '</div>';
    const $ = (id) => m.querySelector('#' + id);
    const errEl = $('nk-error');
    const showError = (msg) => { errEl.textContent = msg; errEl.hidden = false; };
    const hideError = () => { errEl.hidden = true; };

    const close = (val) => { m.remove(); document.removeEventListener('keydown', onKey); resolve(val); };

    const trySave = () => {
      const vorname  = $('nk-vorname').value.trim();
      const nachname = $('nk-nachname').value.trim();
      const email    = $('nk-email').value.trim();
      const telefon  = $('nk-telefon').value.trim();

      if (!vorname)  return showError('Vorname fehlt.');
      if (!nachname) return showError('Nachname fehlt.');
      // Vorname und Nachname dürfen nicht identisch sein (typischer Copy-Paste-Fehler).
      if (vorname.toLowerCase() === nachname.toLowerCase()) {
        return showError('Vorname und Nachname sind identisch — bitte prüfen.');
      }
      // Vorname mit @ ist fast immer eine versehentlich ins falsche Feld gepastete E-Mail.
      if (vorname.includes('@') || nachname.includes('@')) {
        return showError('Name enthält "@" — sieht aus wie eine E-Mail im falschen Feld.');
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return showError('E-Mail-Format ungültig.');
      }
      hideError();
      close({ vorname, nachname, email, telefon });
    };

    $('nk-cancel-btn').onclick = () => close(null);
    $('nk-save-btn').onclick = trySave;
    m.onclick = (e) => { if (e.target === m) close(null); };

    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      else if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
        e.preventDefault();
        trySave();
      }
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(m);
    setTimeout(() => { $('nk-vorname').focus(); }, 50);
  });
}

function _neuerKundeEnsureStyles() {
  if (document.getElementById('nk-modal-styles')) return;
  const s = document.createElement('style');
  s.id = 'nk-modal-styles';
  s.textContent = `
    .nk-modal { max-width: 480px; }
    .nk-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px 14px;
    }
    .nk-field { display: flex; flex-direction: column; gap: 4px; }
    .nk-field.nk-full { grid-column: 1 / -1; }
    .nk-label { font-size: 0.85em; color: #6b6b6b; }
    .nk-req { color: #c44; }
    .nk-field input {
      padding: 9px 11px; border: 1px solid #d4d0ca; border-radius: 6px;
      background: #fff; font-family: inherit; font-size: 0.95em;
      transition: border-color 0.12s;
    }
    .nk-field input:focus {
      outline: none; border-color: #1a1a1a; box-shadow: 0 0 0 2px rgba(26,26,26,0.08);
    }
    .nk-error {
      margin-top: 12px; padding: 9px 12px; background: #fbe9e9; color: #8a1f1f;
      border-left: 3px solid #c44; border-radius: 4px; font-size: 0.88em;
    }
  `;
  document.head.appendChild(s);
}

// Synchronisiert die Stammdaten in die saJson.antragsteller-Sektion (Name, Vorname,
// Email, Telefon, Geburtsdatum). Nicht-überschreibend wenn der User die SA-Felder
// bereits gefüllt hat.
function syncStammdatenInSa() {
  const k = state.kunde;
  if (!k) return;
  let sa = k.saJson;
  if (typeof sa === 'string') { try { sa = JSON.parse(sa); } catch(e) { sa = null; } }
  if (!sa || typeof sa !== 'object') sa = { gemeinsam: false, antragsteller: {}, mitantragsteller: {} };
  if (!sa.antragsteller) sa.antragsteller = {};
  const a = sa.antragsteller;
  // Iter 68 (21.05.2026): Stammdaten = Master für die fünf gemeinsamen Felder.
  //   Edgar-Vorgabe: „Stammdaten des Kunden automatisch mit der Selbstauskunft gespiegelt".
  //   Bei jedem Stammdaten-Save (auch Auto-Save) werden die SA-Antragsteller-Felder
  //   überschrieben — keine „leer-respektieren"-Logik mehr, sonst driften die beiden
  //   Seiten auseinander.
  if (k.vorname !== undefined) a.vorname = k.vorname || '';
  if (k.nachname !== undefined) a.name = k.nachname || '';
  if (k.email !== undefined) a.email = k.email || '';
  if (k.telefon !== undefined) a.telefonPrivat = k.telefon || '';
  if (k.geburtsdatum !== undefined) a.geburtsdatum = k.geburtsdatum || '';
  return sa;
}

// Iter 68: Rückwärts-Spiegel — SA-Antragsteller-Felder ins Stammdaten-Objekt
// (state.kunde) ziehen. Wird beim SA-Auto-Save aufgerufen, sobald der Vertriebler
// in der SA z.B. den Namen oder das Geburtsdatum ändert.
function syncSaToStammdaten() {
  const k = state.kunde;
  const sa = state._sa;
  if (!k || !sa || !sa.antragsteller) return false;
  const a = sa.antragsteller;
  let changed = false;
  const setIfDiff = (kField, val) => {
    const norm = (val === undefined || val === null) ? '' : String(val);
    const cur  = (k[kField] === undefined || k[kField] === null) ? '' : String(k[kField]);
    if (norm !== cur) { k[kField] = norm; changed = true; }
  };
  setIfDiff('vorname', a.vorname);
  setIfDiff('nachname', a.name);
  setIfDiff('email', a.email);
  setIfDiff('telefon', a.telefonPrivat);
  setIfDiff('geburtsdatum', a.geburtsdatum);
  return changed;
}
window.go = go;

// ===== MODUL: views/kunde (renderKunde + Tab-Routing + renderTabUebersicht) =====
/* ============================== KUNDE-DETAIL ============================== */

async function renderKunde() {
  const app = document.getElementById('app');
  if (!state.kunde || state.kunde.id !== state.kundeId) {
    app.innerHTML = '<div class="main"><div class="empty-state">Lade Kunden…</div></div>';
    await loadKunde(state.kundeId);
  }
  const k = state.kunde;
  if (!k) {
    app.innerHTML = '<div class="main"><div class="error-banner">Kunde nicht gefunden.</div></div>';
    return;
  }
  const displayName = k.name || ((k.vorname || '') + ' ' + (k.nachname || '')).trim() || 'Kunde';
  const isOwner = (k.ownerId === state.user.id) || state.user.rolle === 'Admin';
  const isAdmin = state.user.rolle === 'Admin';
  const isArchived = !!k.archiviert;

  app.innerHTML = `
    <div class="main">
      <div class="breadcrumb"><a href="#/dashboard">Meine Kunden</a> &rsaquo; ${esc(displayName)}</div>

      <div class="toolbar kav-toolbar">
        <div>
          <h1 class="page-title">${esc(displayName)}${isArchived ? ' <span class="kav-archive-pill">archiviert</span>' : ''}</h1>
          <div class="text-tertiary text-small" style="margin-top:6px;">${esc(k.email || '')}${k.telefon ? ' · ' + esc(k.telefon) : ''}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-start;">
          ${isOwner && !isArchived ? `<button class="secondary" onclick="archiveKunde()" title="Kunde archivieren — verschwindet aus Deiner Liste, bleibt aber für Admin zugänglich.">Archivieren</button>` : ''}
          ${isOwner && isArchived ? `<button class="secondary" onclick="unarchiveKunde()" title="Archivierung aufheben — Kunde wird wieder in der normalen Liste angezeigt.">Wiederherstellen</button>` : ''}
          ${isAdmin ? `<button class="danger" onclick="deleteKunde()" title="Endgültiges Löschen — nur Admin.">Löschen</button>` : ''}
        </div>
      </div>

      <div class="tabs">
        ${['uebersicht','kalkulator','selbstauskunft','snapshots'].map(t => `
          <button class="tab ${state.tab === t ? 'active' : ''}" data-tab="${t}"
                  onclick="setTab('${t}')">
            ${t === 'uebersicht' ? 'Übersicht' :
              t === 'kalkulator' ? 'Kalkulator' :
              t === 'selbstauskunft' ? 'Selbstauskunft' : 'SA-Snapshots'}
          </button>
        `).join('')}
      </div>

      <div id="tab-content"></div>
    </div>
  `;

  // QA-Sprint 2026-05-23: Phase-Dropdown ersetzt durch KAV-Cockpit (renderKavCockpit).
  // Phase wird jetzt automatisch aus den erledigten Aufgaben abgeleitet — kein
  // manuelles Dropdown mehr.

  renderTab();
}

function setTab(t) {
  // FS-1 (24.05.2026, Tech-Architekt H-1): Chart.js-Instanzen vor Tab-Wechsel
  // destroyen, sonst halten die toten Charts ihre Canvas-Refs und sammeln sich
  // an (Memory-Leak nach 20+ Tab-Wechseln).
  _destroyAllKalkCharts();
  state.tab = t;
  history.replaceState(null, '', '#/kunde/' + state.kundeId + '/' + t);
  renderKunde();
  // QA-Fix 2026-05-23: Tour live re-rendern wenn der Tab wechselt — replaceState
  // löst keinen hashchange aus, daher manuell triggern. Sonst sieht der Vertriebler
  // einen falschen „Element nicht sichtbar"-Hinweis obwohl er den richtigen Tab hat.
  if (typeof _tourRerender === 'function') _tourRerender();
}
window.setTab = setTab;

function _destroyAllKalkCharts() {
  try { if (chartV) { chartV.destroy(); chartV = null; } } catch {}
  try { if (chartC) { chartC.destroy(); chartC = null; } } catch {}
  try { if (chartS) { chartS.destroy(); chartS = null; } } catch {}
  if (_cMagazinCharts) {
    ['belastung','vermoegen','compare'].forEach(k => {
      try { if (_cMagazinCharts[k]) { _cMagazinCharts[k].destroy(); _cMagazinCharts[k] = null; } } catch {}
    });
  }
}

async function deleteKunde() {
  if (!confirm('Kunde ENDGÜLTIG löschen? Dies kann nicht rückgängig gemacht werden.')) return;
  try {
    await api.delete('/api/kunden/' + state.kundeId);
    state.kunden = state.kunden.filter(x => x.id !== state.kundeId);
    state.kunde = null;
    state.kundeId = null; // QA-Fix 2026-05-23 (UW-2): konsistent mit archiveKunde.
    toast('Kunde endgültig gelöscht', 'success');
    go('/dashboard');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}
window.deleteKunde = deleteKunde;

// Iter 52: Archivieren — Kunde verschwindet aus Vertriebs-Liste, bleibt für Admin sichtbar.
async function archiveKunde() {
  if (!confirm('Kunde archivieren? Er verschwindet aus Deiner Kundenliste — der Admin kann ihn weiterhin einsehen.')) return;
  try {
    await api.put('/api/kunden/' + state.kundeId, { archiviert: true });
    state.kunden = state.kunden.filter(x => x.id !== state.kundeId);
    state.kunde = null;
    // QA-Fix 2026-05-23 (Audit-UW-2/T3-4): state.kundeId nach Archivierung nullen,
    // damit Tour-Jump-Links nicht auf einen nicht-mehr-existierenden Kunden zeigen.
    state.kundeId = null;
    toast('Kunde archiviert', 'success');
    go('/dashboard');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}
window.archiveKunde = archiveKunde;

async function unarchiveKunde() {
  try {
    await api.put('/api/kunden/' + state.kundeId, { archiviert: false });
    if (state.kunde) state.kunde.archiviert = false;
    toast('Kunde wiederhergestellt', 'success');
    renderKunde();
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}
window.unarchiveKunde = unarchiveKunde;

function renderTab() {
  if (state.tab === 'uebersicht') renderTabUebersicht();
  else if (state.tab === 'kalkulator') renderTabKalkulator();
  else if (state.tab === 'selbstauskunft') renderTabSelbstauskunft();
  else if (state.tab === 'snapshots') {
    // Immer frisch vom Backend laden — sonst sieht Edgar nach Save manchmal alte Daten.
    renderTabSnapshots();
    if (state.kundeId) {
      api.get('/api/snapshots?kundeId=' + state.kundeId)
        .then(list => {
          if (Array.isArray(list)) {
            state.snapshots = list;
            if (state.tab === 'snapshots') renderTabSnapshots();
          }
        })
        .catch(() => { /* leise — alter state bleibt */ });
    }
  }
}

// Welle Filter v2 (Edgar-Feedback 24.05.2026): Wunsch-Profil-Karte —
//   - collapsible (default: zu, weil nach Anlegen selten geändert)
//   - SA-Werte als Default in den Min-Feldern (Vertriebler überschreibt nur
//     wenn Kunde explizit weniger einsetzen will)
//   - BL-Klick aktiviert ALLE Kreise dieses BL automatisch
//   - Alle/Keine-Buttons pro Kreis-Block
function renderWunschProfilCard(k) {
  const wp = parseWunschProfil(k.notizen || '');
  // Sentinel "*" zählt nicht als ausgewählter Kreis
  const regSet = new Set((wp.regionen || []).filter(r => !r.endsWith(':*')));
  const BL = (window.REGIONEN_BL_KEYS || []);
  const REG = window.REGIONEN || {};

  // Bonitäts-Zusammenfassung aus SA + SA-Werte als Default
  let saLiquid = 0, saUeber = 0;
  let bonInfo = '';
  if (k.saJson && typeof window.Kalk !== 'undefined' && window.Kalk.computeBonitaetDetailed) {
    try {
      const bd = window.Kalk.computeBonitaetDetailed(k.saJson, true);
      if (bd) {
        saLiquid = bd.liquidesVermoegen || 0;
        saUeber = bd.ueberschussMo || 0;
        bonInfo = `
          <div style="margin-top:14px;padding:10px 14px;background:var(--bg-cream-subtle);border-radius:6px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">
            <div><div class="text-tertiary text-small">Einsetzbares EK (liquide aus SA)</div><div style="font-size:16px;font-weight:600;color:#2D6E47;">${Math.round(saLiquid).toLocaleString('de-DE')} €</div></div>
            <div><div class="text-tertiary text-small">Freies Einkommen / Mo (aus SA)</div><div style="font-size:16px;font-weight:600;color:${saUeber > 0 ? '#2D6E47' : '#9A3E33'};">${Math.round(saUeber).toLocaleString('de-DE')} €</div></div>
            <div><div class="text-tertiary text-small">Immo-Vermögen</div><div style="font-size:16px;font-weight:600;color:var(--text-primary);">${Math.round(bd.immobilienVermoegen || 0).toLocaleString('de-DE')} €</div></div>
          </div>
        `;
      }
    } catch (e) {}
  } else {
    bonInfo = `<div class="text-tertiary text-small" style="margin-top:10px;font-style:italic;">Bonitäts-Zusammenfassung erscheint sobald die Selbstauskunft ausgefüllt ist.</div>`;
  }
  // Default-Schwellen: SA-Wert wenn nicht explizit gesetzt
  const ekDefault = wp.ekMin > 0 ? wp.ekMin : Math.round(saLiquid);
  const einkDefault = wp.einkommenMin > 0 ? wp.einkommenMin : Math.round(Math.max(0, saUeber));

  // Bundesland-Pills
  const blPills = BL.map(bl => {
    const hasAny = (wp.regionen || []).some(r => r.startsWith(bl + ':'));
    return `<button type="button" onclick="window._wpToggleBl('${bl}')" class="wp-bl-pill${hasAny ? ' active' : ''}" data-bl="${bl}">${esc(REG[bl].name)}</button>`;
  }).join('');

  // Kreis-Auswahl: nur für ausgewählte BL anzeigen
  const blsMitKreisen = BL.filter(bl => (wp.regionen || []).some(r => r.startsWith(bl + ':')));
  const kreisGruppen = blsMitKreisen.map(bl => {
    const kreise = REG[bl].kreise || [];
    const aktiveAnzahl = kreise.filter(kr => regSet.has(bl + ':' + kr)).length;
    const alleAktiv = aktiveAnzahl === kreise.length;
    const cells = kreise.map(kr => {
      const key = bl + ':' + kr;
      const checked = regSet.has(key);
      return `<label class="wp-kreis-chip${checked ? ' active' : ''}"><input type="checkbox" ${checked ? 'checked' : ''} onchange="window._wpToggleKreis('${bl}', '${esc(kr).replace(/'/g, "\\'")}')" style="display:none;">${esc(kr)}</label>`;
    }).join('');
    return `<div class="wp-kreis-block">
      <div class="wp-kreis-block-head">
        <span>${esc(REG[bl].name)} <span class="text-tertiary text-small">${aktiveAnzahl}/${kreise.length}</span></span>
        <div style="display:flex;gap:6px;">
          <button type="button" onclick="window._wpAllKreise('${bl}', true)" class="secondary" style="padding:2px 8px;font-size:10px;${alleAktiv ? 'opacity:.4;' : ''}" ${alleAktiv ? 'disabled' : ''}>Alle</button>
          <button type="button" onclick="window._wpAllKreise('${bl}', false)" class="secondary" style="padding:2px 8px;font-size:10px;${aktiveAnzahl === 0 ? 'opacity:.4;' : ''}" ${aktiveAnzahl === 0 ? 'disabled' : ''}>Keine</button>
        </div>
      </div>
      <div class="wp-kreis-cells">${cells}</div>
    </div>`;
  }).join('');

  // Collapsible: default geöffnet wenn KEINE Auswahl (Anlegen), sonst zugeklappt
  const hasAnyData = (wp.regionen || []).length > 0 || wp.ekMin > 0 || wp.einkommenMin > 0;
  const openAttr = hasAnyData ? '' : 'open';
  const summaryText = hasAnyData
    ? `${[...new Set((wp.regionen || []).map(r => r.split(':')[0]))].length} BL · ${regSet.size} Kreise · EK ${ekDefault.toLocaleString('de-DE')}€ · Einkommen ${einkDefault.toLocaleString('de-DE')}€/Mo`
    : '— noch leer (Klick zum Ausfüllen)';
  return `
    <details class="card mt-16 wp-card" ${openAttr}>
      <summary style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;list-style:none;">
        <div>
          <div class="card-title" style="margin:0;">Wunsch-Profil <span class="text-tertiary text-small" style="font-weight:normal;">· wo &amp; wie viel Kunde investieren möchte</span></div>
          <div class="text-tertiary text-small" style="margin-top:2px;">${esc(summaryText)}</div>
        </div>
        <span class="wp-toggle" style="font-size:13px;color:var(--text-tertiary);">▾</span>
      </summary>
      <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div>
          <label class="text-tertiary text-small" for="wp-ek-min">Min. einsetzbares EK ${wp.ekMin > 0 ? '<span style="color:var(--accent-dark);font-size:10px;">(Override)</span>' : '<span style="color:var(--text-tertiary);font-size:10px;">(Default = SA-Wert)</span>'}</label>
          <input type="number" id="wp-ek-min" value="${ekDefault}" placeholder="${Math.round(saLiquid) || 'z.B. 20000'}" min="0" step="1000" style="width:100%;padding:8px 12px;font-size:14px;border:1px solid var(--border);border-radius:4px;" onblur="window._wpSaveSchwellen()">
        </div>
        <div>
          <label class="text-tertiary text-small" for="wp-eink-min">Min. freies Einkommen / Mo ${wp.einkommenMin > 0 ? '<span style="color:var(--accent-dark);font-size:10px;">(Override)</span>' : '<span style="color:var(--text-tertiary);font-size:10px;">(Default = SA-Wert)</span>'}</label>
          <input type="number" id="wp-eink-min" value="${einkDefault}" placeholder="${Math.round(Math.max(0,saUeber)) || 'z.B. 500'}" min="0" step="50" style="width:100%;padding:8px 12px;font-size:14px;border:1px solid var(--border);border-radius:4px;" onblur="window._wpSaveSchwellen()">
        </div>
      </div>
      ${bonInfo}
      <div style="margin-top:18px;">
        <div class="text-tertiary text-small" style="margin-bottom:6px;">Bundesländer auswählen (Klick toggelt — alle Kreise werden automatisch aktiv, lassen sich einzeln rausnehmen)</div>
        <div class="wp-bl-pills">${blPills}</div>
      </div>
      ${blsMitKreisen.length > 0 ? `
        <div style="margin-top:14px;">
          <div class="text-tertiary text-small" style="margin-bottom:6px;">Landkreise / Städte</div>
          <div class="wp-kreis-groups">${kreisGruppen}</div>
          <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="text-tertiary text-small">${regSet.size} Kreise insgesamt ausgewählt</span>
            <button type="button" onclick="window._wpClearAll()" class="secondary" style="padding:4px 10px;font-size:11px;">Komplett zurücksetzen</button>
          </div>
        </div>
      ` : '<div style="margin-top:12px;color:var(--text-tertiary);font-size:12px;">Wähle ein Bundesland aus, um die Kreise zu sehen.</div>'}
    </details>
  `;
}

// === Wunsch-Profil-Handler v3 (Edgar 24.05.2026 10:30) ===
// FIX: Klick auf BL/Kreis darf das collapsible-details NICHT schließen.
// Lösung: nur die Wunsch-Profil-Karte neu rendern, nicht ganzen Tab.
function _wpRender() {
  if (!state.kunde) return;
  const oldCard = document.querySelector('.wp-card');
  if (!oldCard) return; // falls Tab gewechselt wurde, ignorieren
  // open-State VOR dem Re-Render lesen
  const wasOpen = oldCard.hasAttribute('open');
  // Neue HTML rendern (in temp-Container)
  const tmp = document.createElement('div');
  tmp.innerHTML = renderWunschProfilCard(state.kunde);
  const newCard = tmp.firstElementChild;
  if (!newCard) return;
  // open-State auf neue Karte übertragen (override Default)
  if (wasOpen) newCard.setAttribute('open', '');
  else newCard.removeAttribute('open');
  oldCard.replaceWith(newCard);
}

// FS-2f BLOCKER (24.05.2026 Bug-Sweep BUG-9): EK + Einkommens-Eingaben aus
// dem DOM einsammeln BEVOR sie durch _wpRender verschwinden. Sonst tippt
// User „25000" → klickt BL-Pill → Input weg ohne blur → Wert verloren.
function _wpCaptureSchwellen(wp) {
  const ekEl = document.getElementById('wp-ek-min');
  const einkEl = document.getElementById('wp-eink-min');
  if (ekEl && document.activeElement === ekEl) {
    wp.ekMin = parseFloat(ekEl.value) || 0;
  }
  if (einkEl && document.activeElement === einkEl) {
    wp.einkommenMin = parseFloat(einkEl.value) || 0;
  }
  return wp;
}

async function _wpToggleBl(bl) {
  if (!state.kunde) return;
  const wp = _wpCaptureSchwellen(parseWunschProfil(state.kunde.notizen || ''));
  const reg = (window.REGIONEN || {})[bl];
  if (!reg) return;
  const hasAny = (wp.regionen || []).some(r => r.startsWith(bl + ':'));
  if (hasAny) {
    wp.regionen = (wp.regionen || []).filter(r => !r.startsWith(bl + ':'));
  } else {
    const newEntries = (reg.kreise || []).map(kr => bl + ':' + kr);
    wp.regionen = [...(wp.regionen || []), ...newEntries];
  }
  await saveWunschProfil(wp);
  _wpRender(); // nur Karte, kein Tab-Re-Render
}
window._wpToggleBl = _wpToggleBl;

async function _wpAllKreise(bl, aktivieren) {
  if (!state.kunde) return;
  const wp = _wpCaptureSchwellen(parseWunschProfil(state.kunde.notizen || ''));
  const reg = (window.REGIONEN || {})[bl];
  if (!reg) return;
  wp.regionen = (wp.regionen || []).filter(r => !r.startsWith(bl + ':'));
  if (aktivieren) {
    const newEntries = (reg.kreise || []).map(kr => bl + ':' + kr);
    wp.regionen.push(...newEntries);
  } else {
    wp.regionen.push(bl + ':*');
  }
  await saveWunschProfil(wp);
  _wpRender();
}
window._wpAllKreise = _wpAllKreise;

async function _wpToggleKreis(bl, kreis) {
  if (!state.kunde) return;
  const wp = _wpCaptureSchwellen(parseWunschProfil(state.kunde.notizen || ''));
  const key = bl + ':' + kreis;
  const list = (wp.regionen || []).filter(r => r !== bl + ':*');
  if (list.includes(key)) {
    wp.regionen = list.filter(r => r !== key);
    if (!wp.regionen.some(r => r.startsWith(bl + ':'))) {
      wp.regionen.push(bl + ':*');
    }
  } else {
    wp.regionen = [...list, key];
  }
  await saveWunschProfil(wp);
  _wpRender();
}
window._wpToggleKreis = _wpToggleKreis;

async function _wpSaveSchwellen() {
  if (!state.kunde) return;
  const ekEl = document.getElementById('wp-ek-min');
  const einkEl = document.getElementById('wp-eink-min');
  const wp = parseWunschProfil(state.kunde.notizen || '');
  const oldEk = wp.ekMin || 0, oldEink = wp.einkommenMin || 0;
  wp.ekMin = parseFloat(ekEl && ekEl.value) || 0;
  wp.einkommenMin = parseFloat(einkEl && einkEl.value) || 0;
  // FS-1 (24.05.2026, Vertriebler A2): nur speichern wenn wirklich Änderung,
  // dann Save-Toast als Bestätigung damit Vertriebler weiß "gespeichert".
  if (wp.ekMin === oldEk && wp.einkommenMin === oldEink) return;
  await saveWunschProfil(wp);
  if (typeof toast === 'function') toast('Wunsch-Profil gespeichert', 'success');
}
window._wpSaveSchwellen = _wpSaveSchwellen;

async function _wpClearAll() {
  if (!state.kunde) return;
  if (!confirm('Alle Wunschregionen für diesen Kunden löschen?')) return;
  const wp = parseWunschProfil(state.kunde.notizen || '');
  wp.regionen = [];
  await saveWunschProfil(wp);
  _wpRender();
}
window._wpClearAll = _wpClearAll;

function renderTabUebersicht() {
  const el = document.getElementById('tab-content');
  const k = state.kunde;

  // FS-2i (Edgar 24.05.2026): Reihenfolge umgedreht für Telefon-Workflow.
  // Aktivitäten zuerst (was haben wir besprochen), dann Notizen (Stichworte),
  // dann Wunsch-Profil (Bedarf), dann Stammdaten (collapsed, statisch).
  const stammCard = `
    <details class="card mt-16">
      <summary style="cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;">
        <span class="card-title" style="margin:0;border-bottom:none;padding-bottom:0;">Stammdaten <span class="text-tertiary text-small" style="font-weight:normal;">· Klick zum Bearbeiten</span></span>
        <span style="font-size:12px;color:var(--text-tertiary);">${esc((k.email || ''))}${k.telefon ? ' · ' + esc(k.telefon) : ''}</span>
      </summary>
      <div style="margin-top:14px;">
        <div class="grid-2">
          <div>
            <label>Vorname</label>
            <input id="f-vorname" data-stamm="vorname" value="${esc(k.vorname || '')}">
          </div>
          <div>
            <label>Nachname</label>
            <input id="f-nachname" data-stamm="nachname" value="${esc(k.nachname || '')}">
          </div>
          <div>
            <label>E-Mail</label>
            <input id="f-email" data-stamm="email" type="email" value="${esc(k.email || '')}">
          </div>
          <div>
            <label>Telefon</label>
            <input id="f-telefon" data-stamm="telefon" value="${esc(k.telefon || '')}">
          </div>
          <div>
            <label>Geburtsdatum</label>
            <input id="f-geburtsdatum" data-stamm="geburtsdatum" type="date" value="${esc(k.geburtsdatum || '')}">
          </div>
        </div>
        <div class="mt-16">
          <span id="stamm-save-status" class="text-tertiary text-small">Auto-Save aktiv · spiegelt sich in die Selbstauskunft</span>
        </div>
      </div>
    </details>
  `;

  // Parse Notizen für Activities + Notes split
  const parsed = (typeof parseKavTracker === 'function')
    ? parseKavTracker(k.notizen || '')
    : { tracker: null, freeNotes: k.notizen || '' };
  const split = _splitNotesAndActivities(parsed.freeNotes);
  const sortedActs = split.activities.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));

  // 1. AKTIVITÄTEN-Karte (zuerst — was war zuletzt?)
  const aktivitaetenCard = `
    <div class="card activity-card">
      <div class="card-title">Aktivitäten-Historie <span class="text-tertiary text-small" style="font-weight:normal;">· ${sortedActs.length} Einträge</span></div>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <input type="text" id="activity-new-input" placeholder="Neue Aktivität / Notiz mit Datum festhalten …" style="flex:1;padding:8px 12px;font-size:13px;border:1px solid var(--border);border-radius:4px;font-family:inherit;" onkeydown="if(event.key==='Enter'){event.preventDefault();addActivityEntry();}">
        <button type="button" onclick="addActivityEntry()" class="secondary" style="padding:6px 14px;font-size:12px;white-space:nowrap;">+ Eintrag</button>
      </div>
      ${sortedActs.length > 0 ? `
        <div class="activity-list">
          ${sortedActs.map(a => `
            <div class="activity-row">
              <div class="activity-ts">${esc(a.ts)}</div>
              <div class="activity-text">${esc(a.text)}</div>
            </div>
          `).join('')}
        </div>
      ` : '<div class="text-tertiary text-small" style="padding:14px 0;">Noch keine Einträge. Aktivitäten von PandaDoc, Snapshot-Speichern oder Reservierungen landen hier automatisch — manuelle Einträge oben ergänzen.</div>'}
    </div>
  `;

  // 2. NOTIZEN-Karte (Scratchpad)
  const notizenCard = `
    <div class="card mt-16">
      <div class="card-title">Notizen <span class="text-tertiary text-small" style="font-weight:normal;">· Scratchpad für laufende Stichpunkte</span></div>
      <textarea id="f-notizen" onblur="saveNotizen()" placeholder="Frei-Notizen, Gesprächs-Stichpunkte … Klick „An Historie senden" um sie dauerhaft mit Datum zu speichern.">${esc(split.notes)}</textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:8px;flex-wrap:wrap;">
        <span class="text-tertiary text-small">Auto-Save bei Klick außerhalb.</span>
        <button type="button" onclick="sendNotizToHistory()" class="secondary" style="padding:6px 14px;font-size:12px;">→ An Historie senden</button>
      </div>
    </div>
  `;

  // FS-2j (Edgar 24.05.2026 18:50): Phasen-Tracker ist jetzt das oberste
  // Element im Übersicht-Tab — nicht mehr global über allen Tabs. Vermeidet
  // visuelle Wiederholung im Kalkulator/SA/Snapshots.
  el.innerHTML = renderKavCockpit(k) + aktivitaetenCard + notizenCard + renderWunschProfilCard(k) + stammCard;
  // Iter 68 (21.05.2026): Auto-Save für Stammdaten — gleiche Logik wie SA-Auto-Save.
  //   Bei jedem `input` wird state.kunde lokal aktualisiert, debounced 600 ms später
  //   das PUT abgesetzt. saveStammdaten ruft syncStammdatenInSa auf, damit die
  //   gemeinsamen Felder gleichzeitig in der Selbstauskunft erscheinen.
  document.querySelectorAll('[data-stamm]').forEach(inp => {
    const apply = () => {
      const key = inp.dataset.stamm;
      state.kunde[key] = inp.value;
      autoSaveStammdaten();
    };
    inp.addEventListener('input', apply);
    inp.addEventListener('blur', apply);
    inp.addEventListener('change', apply);
  });
}

let _stammAutoSaveTimer = null;
async function autoSaveStammdaten() {
  clearTimeout(_stammAutoSaveTimer);
  const statusEl = document.getElementById('stamm-save-status');
  if (statusEl) statusEl.textContent = '… wird gespeichert';
  _stammAutoSaveTimer = setTimeout(async () => {
    await saveStammdaten({ silent: true });
    if (statusEl) {
      statusEl.textContent = '✓ gespeichert ' + new Date().toLocaleTimeString('de-DE');
      setTimeout(() => { if (statusEl.textContent.startsWith('✓')) statusEl.textContent = ''; }, 3000);
    }
  }, 600);
}
window.autoSaveStammdaten = autoSaveStammdaten;

async function saveStammdaten(opts) {
  opts = opts || {};
  const get = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : (state.kunde[id.replace('f-', '')] || '');
  };
  const body = {
    vorname: get('f-vorname'),
    nachname: get('f-nachname'),
    email: get('f-email'),
    telefon: get('f-telefon'),
    geburtsdatum: get('f-geburtsdatum'),
  };
  // QA-Fix 2026-05-23 (Audit-Z-6): Rollback bei Save-Fehler. Vorher applied
  // Object.assign(state.kunde, body) optimistisch vor dem PUT — bei 5xx blieb
  // state.kunde mit den geänderten Daten zurück, obwohl Airtable den alten Stand
  // hat. Folgeklicks (PDF-Export, Snapshot) nutzten dann den nie-gespeicherten
  // Wert. Jetzt: alte Werte sichern, optimistisch updaten, bei Fehler rollback.
  const _prevKunde = {
    vorname: state.kunde.vorname,
    nachname: state.kunde.nachname,
    email: state.kunde.email,
    telefon: state.kunde.telefon,
    geburtsdatum: state.kunde.geburtsdatum,
  };
  try {
    Object.assign(state.kunde, body);
    const sa = syncStammdatenInSa();
    await api.put('/api/kunden/' + state.kundeId, { ...body, saJson: sa });
    state.kunde.saJson = sa;
    // Wenn der SA-Tab gerade offen ist, _sa-Cache aktualisieren, damit die
    // gespiegelten Felder beim nächsten Render bzw. Auswertung sichtbar sind.
    if (state._sa && state._sa.antragsteller) {
      state._sa.antragsteller.vorname = body.vorname;
      state._sa.antragsteller.name = body.nachname;
      state._sa.antragsteller.email = body.email;
      state._sa.antragsteller.telefonPrivat = body.telefon;
      state._sa.antragsteller.geburtsdatum = body.geburtsdatum;
    }
    if (!opts.silent) toast('Stammdaten gespeichert (auch in Selbstauskunft übernommen)', 'success');
  } catch (e) {
    // Rollback: state.kunde auf alten Stand zurück, damit Folgeklicks nicht
    // mit Phantom-Daten arbeiten.
    Object.assign(state.kunde, _prevKunde);
    toast('Fehler beim Speichern — Änderungen wurden zurückgesetzt: ' + e.message, 'error');
  }
}
window.saveStammdaten = saveStammdaten;

// FS-1 (24.05.2026): saveNotizen über notizenQueueMutation —
// verhindert Race mit KAV-Saves und parallelen Activity-Logs.
async function saveNotizen() {
  const ta = document.getElementById('f-notizen');
  if (!ta) return;
  const userFreeText = ta.value;
  return notizenQueueMutation((oldNotizen) => {
    const parsed = typeof parseKavTracker === 'function'
      ? parseKavTracker(oldNotizen)
      : { tracker: null, freeNotes: oldNotizen || '' };
    const split = _splitNotesAndActivities(parsed.freeNotes);
    if (userFreeText.trim() === split.notes.trim()) return oldNotizen; // No-Op
    const activitiesText = split.activities
      .map(a => `[${a.ts}] ${a.text}`)
      .join('\n');
    const combinedFree = [userFreeText.trim(), activitiesText.trim()].filter(Boolean).join('\n\n');
    const tracker = parsed.tracker;
    return (typeof stringifyKavTracker === 'function' && tracker)
      ? stringifyKavTracker(combinedFree, tracker)
      : combinedFree;
  }, { successToast: 'Notizen gespeichert', errorPrefix: 'Notizen-Fehler: ' });
}
window.saveNotizen = saveNotizen;

// QA-Fix 2026-05-24 (Edgar): Notizen-Text als Activity-Eintrag in die Historie
// schicken — Notizen-Feld wird geleert, neuer Activity-Entry mit Datum.
async function sendNotizToHistory() {
  const ta = document.getElementById('f-notizen');
  if (!ta) return;
  const text = (ta.value || '').trim();
  if (!text) {
    toast('Notiz ist leer', 'warning');
    return;
  }
  await _appendActivityToNotizen(text);
  ta.value = '';
  // saveNotizen schreibt mit leerem Text → User-Notes-Anteil wird komplett
  // ersetzt durch leer. Aber unsere Activity wird in _appendActivity gespeichert.
  await saveNotizen();
  toast('Notiz an Historie gesendet', 'success');
  // Re-render Kunde-Tab damit Activity-Card sich aktualisiert.
  renderKunde();
}
window.sendNotizToHistory = sendNotizToHistory;

// Manueller Aktivität-Eintrag aus dem Input in der Activity-Card.
async function addActivityEntry() {
  const inp = document.getElementById('activity-new-input');
  if (!inp) return;
  const text = (inp.value || '').trim();
  if (!text) {
    toast('Eintrag ist leer', 'warning');
    return;
  }
  await _appendActivityToNotizen(text);
  inp.value = '';
  toast('Aktivität gespeichert', 'success');
  renderKunde();
}
window.addActivityEntry = addActivityEntry;

// Hilfsfunktion: hängt einen Activity-Eintrag [YYYY-MM-DD HH:MM] {text} an
// die freeNotes-Region an (vor dem KAV-Block, damit der Block am Ende bleibt).
// FS-1 (24.05.2026, BLOCKER B-4): jetzt über notizenQueueMutation — verhindert
// dass ein Activity-Eintrag verloren geht wenn parallel KAV-Save oder
// Wunsch-Profil-Save läuft.
async function _appendActivityToNotizen(text) {
  if (!state.kunde) return;
  const now = new Date();
  const pad = (n) => ('0' + n).slice(-2);
  const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const newLine = `[${ts}] ${text.replace(/[\r\n]+/g, ' ').trim()}`;
  return notizenQueueMutation((oldNotizen) => {
    const parsed = (typeof parseKavTracker === 'function')
      ? parseKavTracker(oldNotizen)
      : { tracker: null, freeNotes: oldNotizen || '' };
    const free = parsed.freeNotes || '';
    const newFree = free.trim() ? `${newLine}\n${free}` : newLine;
    // stringifyKavTracker erhält wunschProfil via state.kunde.notizen-Fallback,
    // ABER da wir hier in der Queue NACH einem Re-Read sind, ist state.kunde.notizen
    // bereits aktualisiert auf den letzten Stand. Wunsch-Profil bleibt erhalten.
    return (typeof stringifyKavTracker === 'function' && parsed.tracker)
      ? stringifyKavTracker(newFree, parsed.tracker)
      : newFree;
  });
}

// ===== MODUL: views/kalkulator-tab (~1700 LoC bis Z. 2310 — größter Brocken) =====
/* ============================== KALKULATOR-TAB ============================== */

function renderTabKalkulator() {
  // QA-Sprint 2026-05-23 (Audit-J B3): Auto-Start der Tour bei erstem Kalkulator-Aufruf.
  // localStorage-Key checkt — wenn noch nicht gesehen, startet Tour nach kurzem Delay.
  // Vorher lief Tour beim Login, aber Steps 5-9 brauchen Kalkulator-DOM.
  if (typeof maybeStartTourOnFirstLogin === 'function') maybeStartTourOnFirstLogin();
  // QA-Fix 2026-05-23 (Audit-U4): Pending-WE aus WE-Liste-Klick (vor Kunden-Auswahl)
  // jetzt auto-laden, sobald Kunde geöffnet wird.
  try {
    const pendingWe = sessionStorage.getItem('bbk_pending_we');
    if (pendingWe && state.kundeId && (!state.kalk || state.kalk._weId !== pendingWe)) {
      sessionStorage.removeItem('bbk_pending_we');
      setTimeout(() => { if (typeof loadWeIntoKalk === 'function') loadWeIntoKalk(pendingWe); }, 300);
    }
  } catch (e) {}

  const el = document.getElementById('tab-content');
  const wes = state.wohneinheiten;
  const i = state.kalk || makeDefaultKalkInput();
  state.kalk = i;
  if (!Array.isArray(state.kalk._paketWeIds)) state.kalk._paketWeIds = [];
  // Defensive Default für die EK-Verzinsung (Sparen-vs-Investieren-Vergleich).
  // Wird bei WE-Wechsel nicht aus den Stammdaten überschrieben — bleibt persistent.
  if (state.kalk.sparZins === undefined || state.kalk.sparZins === null) {
    state.kalk.sparZins = 0.025; // 2,5 % p.a. Default
  }
  // Iter 60 (20.05.2026): Defensive Default für SA-Steuersatz, falls noch nicht gesetzt
  //   (alte Kunden ohne Snapshot, frisch geladene States). Initialisierung aus dem
  //   Quick-Wert oder aus dem Profil-Default (0,30).
  if (typeof state.kalk.saSteuersatz !== 'number' || !isFinite(state.kalk.saSteuersatz)) {
    state.kalk.saSteuersatz = (typeof state.kalk.steuersatz === 'number') ? state.kalk.steuersatz : 0.30;
  }
  const isPaket = state.kalk._isPaket === true;

  const currentProfil = detectProfil(i);
  // Airtable-Titel ("WE: 1, EG Links, Heidelberger Straße 21, 76646 Bruchsal") als Label.
  // KP optional hinten dran, damit Edgar Preisspanne sieht.
  const weLabel = (w) => {
    const titel = w.lage || w.lageText || w.id;
    const kp = (w.kp || 0) > 0 ? ' — ' + Math.round(w.kp).toLocaleString('de-DE') + ' €' : '';
    return titel + kp;
  };
  // WEs nach Projekt gruppieren + innerhalb des Projekts nach WE-Nummer sortieren.
  const wesByProjekt = {};
  wes.forEach(w => {
    const key = w.projektName || 'Sonstige';
    if (!wesByProjekt[key]) wesByProjekt[key] = [];
    wesByProjekt[key].push(w);
  });
  Object.keys(wesByProjekt).forEach(p => {
    wesByProjekt[p].sort((a, b) => {
      const aNr = parseInt(a.weNr, 10);
      const bNr = parseInt(b.weNr, 10);
      if (isFinite(aNr) && isFinite(bNr)) return aNr - bNr;
      return (a.lage || '').localeCompare(b.lage || '');
    });
  });
  const projektNames = Object.keys(wesByProjekt).sort();
  // Zweistufige Auswahl: erst Projekt, dann Wohneinheit.
  // Aktives Projekt: aus state.kalk._projektFilter ODER aus dem aktuell gewählten WE ableiten.
  let aktivesProjekt = state.kalk._projektFilter || '';
  if (!aktivesProjekt && !isPaket && i._weId) {
    const sel = wes.find(x => x.id === i._weId);
    if (sel) aktivesProjekt = sel.projektName || '';
  }
  if (!aktivesProjekt && projektNames.length === 1) aktivesProjekt = projektNames[0];
  const wesImProjekt = aktivesProjekt && wesByProjekt[aktivesProjekt] ? wesByProjekt[aktivesProjekt] : [];

  el.innerHTML = `
    <div class="card kalk-input-minimal we-picker">
      <div class="card-title">${isPaket ? 'Welches Paket darf es sein?' : 'Welche Wohnung darf es sein?'}</div>
      <div class="we-picker-mode" style="display:flex;gap:6px;margin-bottom:24px;border:1px solid var(--border);border-radius:2px;overflow:hidden;width:fit-content">
        <label class="we-picker-mode-btn" style="padding:8px 18px;background:${!isPaket ? 'var(--accent)' : 'transparent'};color:${!isPaket ? 'var(--on-accent)' : 'var(--text-secondary)'};cursor:pointer;font-size:12px;font-weight:${!isPaket ? '500' : '400'};letter-spacing:.04em;transition:all .15s ease;border-right:1px solid var(--border);text-transform:none;margin:0;">
          <input type="radio" name="we-mode" value="single" ${!isPaket ? 'checked' : ''} onclick="setWeMode('single')" style="display:none"> Einzelne Wohnung
        </label>
        <label class="we-picker-mode-btn" style="padding:8px 18px;background:${isPaket ? 'var(--accent)' : 'transparent'};color:${isPaket ? 'var(--on-accent)' : 'var(--text-secondary)'};cursor:pointer;font-size:12px;font-weight:${isPaket ? '500' : '400'};letter-spacing:.04em;transition:all .15s ease;text-transform:none;margin:0;">
          <input type="radio" name="we-mode" value="paket" ${isPaket ? 'checked' : ''} onclick="setWeMode('paket')" style="display:none"> Paket aus mehreren
        </label>
      </div>
      <div class="grid-3 we-picker-grid">
        <div class="we-picker-step">
          <span class="we-picker-step-num">01</span>
          <label>Objekt</label>
          <select id="projekt-select">
            <option value="">Projekt wählen</option>
            ${projektNames.map(p => `
              <option value="${esc(p)}" ${aktivesProjekt === p ? 'selected' : ''}>${esc(p)} · ${wesByProjekt[p].length} WE</option>
            `).join('')}
          </select>
          <div class="we-picker-hint">${projektNames.length} ${projektNames.length === 1 ? 'Projekt' : 'Projekte'} aktuell in Vermarktung</div>
        </div>
        <div class="we-picker-step">
          <span class="we-picker-step-num">02</span>
          ${isPaket ? `
            <label>Wohneinheiten im Paket</label>
            <select id="we-paket-select" multiple size="8" style="height:auto;" ${!aktivesProjekt ? 'disabled' : ''}>
              ${wesImProjekt.map(w => `
                <option value="${esc(w.id)}" ${state.kalk._paketWeIds.includes(w.id) ? 'selected' : ''}>${esc(weLabel(w))}</option>
              `).join('')}
            </select>
            <div class="we-picker-hint">${!aktivesProjekt ? 'Erst ein Projekt wählen.' : 'Ctrl/Cmd + Klick für mehrere · aktuell ' + state.kalk._paketWeIds.length + ' ausgewählt'}</div>
          ` : `
            <label>Wohneinheit</label>
            <select id="we-select" ${!aktivesProjekt ? 'disabled' : ''}>
              <option value="">${aktivesProjekt ? 'Wohneinheit wählen' : 'Erst ein Projekt wählen'}</option>
              ${wesImProjekt.map(w => `
                <option value="${esc(w.id)}" ${i._weId === w.id ? 'selected' : ''}>${esc(weLabel(w))}</option>
              `).join('')}
            </select>
            ${i._weId ? `
              <div class="we-meta-row text-small text-tertiary">
                ${i._vermietungsStatus === 'vermietet' ? `
                  <span class="we-status-pill vermietet">● vermietet</span>
                ` : i._vermietungsStatus === 'leer' ? `
                  <span class="we-status-pill leer">○ leer — neu vermietet vor Verkauf</span>
                ` : ''}
                ${i._objektvorstellungLink ? `
                  <a href="${esc(i._objektvorstellungLink)}" target="_blank" rel="noopener" class="we-meta-link">
                    Objektvorstellung <span aria-hidden="true">↗</span>
                  </a>
                ` : ''}
              </div>
              ${i._stellplatzAnzahl > 0 ? `
                <div class="we-stellplatz-info">
                  <strong>${(() => {
                    const g = i._stellplatzGarageCount || 0;
                    const f = i._stellplatzFlaecheCount || 0;
                    if (g > 0 && f > 0) return `+ ${g} Garage${g > 1 ? 'n' : ''} + ${f} Stellplatz${f > 1 ? 'e' : ''}`;
                    if (g > 0) return `+ ${g} Garage${g > 1 ? 'n' : ''}`;
                    if (f > 0) return `+ ${f} Stellplatz${f > 1 ? 'e' : ''}`;
                    return `+ ${i._stellplatzAnzahl} Stellplatz${i._stellplatzAnzahl > 1 ? 'e' : ''}`;
                  })()}</strong>
                  ${i._stellplatzKp > 0 ? ' · KP ' + Math.round(i._stellplatzKp).toLocaleString('de-DE') + ' €' : ''}
                  ${i._stellplatzMiete > 0 ? ' · Miete ' + Math.round(i._stellplatzMiete) + ' €/Mo (' + esc(i._stellplatzMieteQuelle || '') + ')' : ''}
                </div>
              ` : ''}
              ${(() => {
                // Iter 67 (20.05.2026): €/qm-Anker für den Vertriebler — sieht KP/qm, Miete/qm
                // und Subv/qm auf einen Blick, damit er die Wohnung schnell ins Markt-Niveau
                // einordnen kann. Bezieht sich nur auf die Wohnung (ohne Stellplatz).
                const qm = parseFloat(i.qm) || 0;
                if (qm <= 0) return '';
                const kp = parseFloat(i.kaufpreis) || 0;
                const mi = parseFloat(i.kaltmiete) || 0;
                const sv = (Array.isArray(i.subventionPhasen) && i.subventionPhasen[0])
                  ? (i.subventionPhasen[0].mo || 0)
                  : (i.subventionMo || 0);
                const fmtQm = (v) => v.toFixed(2).replace('.', ',');
                const teile = [];
                if (kp > 0) teile.push(`KP <strong>${fmtQm(kp / qm)} €/qm</strong>`);
                if (mi > 0) teile.push(`Miete <strong>${fmtQm(mi / qm)} €/qm</strong>`);
                if (sv > 0) teile.push(`Subv <strong>${fmtQm(sv / qm)} €/qm</strong>`);
                if (teile.length === 0) return '';
                return `<div class="we-qm-info text-small text-tertiary" style="margin-top:4px;letter-spacing:0.02em;">${teile.join(' · ')}</div>`;
              })()}
              ${(() => {
                // Iter 54: Nur noch Warnungen anzeigen — der „aktiv"-Fall ist der Normalfall
                // und braucht keine Pille. Tech-Hinweis „aus Airtable" raus aus Endkunden-Sicht.
                if (!i._stammdatenQuelle || i._stammdatenQuelle === 'airtable-aktiv') return '';
                const labelMap = {
                  'airtable-entwurf-defaults': { txt: '⚠ Stammdaten nur als Entwurf — Kalkulation läuft mit Defaults', cls: 'warn' },
                  'airtable-fehlt-defaults':   { txt: '⚠ Keine Stammdaten gepflegt — Kalkulation läuft mit Defaults', cls: 'warn' },
                  'airtable-load':             { txt: '… Stammdaten werden geladen',                   cls: 'loading' },
                };
                const info = labelMap[i._stammdatenQuelle];
                if (!info) return '';
                return `<div class="stammdaten-hint ${info.cls}">${esc(info.txt)}</div>`;
              })()}
            ` : ''}
          `}
        </div>
        <div class="we-picker-step">
          <span class="we-picker-step-num">03</span>
          <label>Bonitäts-Quelle</label>
          <div class="we-picker-bon-row">
            <select id="bon-modus-select" class="we-picker-bon-select">
              <option value="quick" ${(!i.bonModus || i.bonModus === 'quick') ? 'selected' : ''}>Quick (manuelle Eingabe)</option>
              <option value="detail" ${i.bonModus === 'detail' ? 'selected' : ''}>Detail (aus Selbstauskunft)</option>
            </select>
            <button class="we-picker-reset-btn" onclick="resetKalk()" title="Auf Default zurücksetzen" aria-label="Auf Default zurücksetzen" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path></svg>
            </button>
          </div>
          <div class="we-picker-hint">${i.bonModus === 'detail' ? 'Aus Selbstauskunft' : 'Schnell-Eingabe ohne SA'}</div>
        </div>
      </div>
    </div>

    ${(!isPaket && !i._weId) ? `
    <div class="card mt-16">
      <div class="empty-state" style="padding: 24px; text-align: center;">
        <p style="font-size:15px; margin: 0 0 6px 0; color: var(--text-secondary);"><strong>Erst Projekt &amp; Wohneinheit oben wählen</strong></p>
        <p class="text-tertiary text-small" style="margin: 0;">Alle Eingabewerte (Kaufpreis, qm, Miete, Hausgeld, AfA, Subvention) laden sich dann automatisch aus den hinterlegten Vorlagen.</p>
      </div>
    </div>
    ` : `
    <div class="card kalk-input-minimal mt-16">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <span>${isPaket ? 'Persönliche Eingaben · Paket' : 'Eingaben · ' + esc((i._weNr ? 'WE ' + i._weNr + ' · ' : '') + (i._weLage || ''))}</span>
        <!-- QA-Sprint 2026-05-23 (Edgar-Doc Bug-5): Käufer-Profil-Switcher entfernt.
             Steuersatz wird über den Quick-Rechner / Detail-SA gesetzt. Profil-
             Dropdown verwirrte mehr als es half. PROFILES bleiben als Backend-
             Defaults — werden nur intern beim Paket-Modus oder Snapshot-Bridge
             genutzt. -->
      </div>
      <div class="kalk-section-grid">
        ${isPaket ? kalkInputsPaketHtml(i) : kalkInputsThemenHtml(i)}
      </div>
    </div>
    `}

    ${(!isPaket && !i._weId) ? '' : `
      <!-- Iter 91 (22.05.2026): Power-User-Strip oben entfernt — KPIs, Bonität,
           Hauptcharts und Cashflow/Sparen-Charts sind alle in die Magazin-Story
           integriert (renderStoryPremium). Der Vertriebler checkt Daten links,
           beginnt direkt unten mit der Story.
           Spar-Zins-Slider wandert in den Annahmen-Modal der Magazin-View. -->

      <!-- Story-Sektionen (Magazin-Vertriebsstory) -->
      <div class="stories mt-16" id="story-container"></div>

      <div class="toolbar mt-16">
        <button onclick="saveSnapshot()">Snapshot speichern</button>
        <button class="secondary" onclick="openInvestDocModal()">Investitions-Doc senden / herunterladen</button>
        ${state.kalk && state.kalk._isPaket
          ? `<button disabled title="Bei Paket-Auswahl noch nicht unterstützt — bitte einzelne WE wählen" style="opacity:0.45;cursor:not-allowed;">Reservierung digital senden (nur Einzel-WE)</button>`
          : `<button onclick="sendReservierungForSignature()">Reservierung digital senden</button>`}
      </div>
    `}
  `;

  // Listeners
  const projektSel = document.getElementById('projekt-select');
  if (projektSel) projektSel.onchange = (e) => {
    state.kalk._projektFilter = e.target.value;
    // Beim Projekt-Wechsel die aktive WE-Auswahl zurücksetzen (Einzel + Paket).
    if (state.kalk._weId) {
      const sel = state.wohneinheiten.find(x => x.id === state.kalk._weId);
      if (!sel || sel.projektName !== e.target.value) loadWeIntoKalk('');
    }
    state.kalk._paketWeIds = (state.kalk._paketWeIds || []).filter(wid => {
      const w = state.wohneinheiten.find(x => x.id === wid);
      return w && w.projektName === e.target.value;
    });
    renderTabKalkulator();
  };
  const weSel = document.getElementById('we-select');
  if (weSel) weSel.onchange = (e) => loadWeIntoKalk(e.target.value);
  const wePaketSel = document.getElementById('we-paket-select');
  if (wePaketSel) wePaketSel.onchange = (e) => {
    state.kalk._paketWeIds = Array.from(e.target.selectedOptions).map(o => o.value);
    // Vollrender, damit Counter "Aktuell: N WE" + abhängige Bereiche aktuell bleiben.
    renderTabKalkulator();
  };
  const bonSel = document.getElementById('bon-modus-select');
  if (bonSel) bonSel.onchange = (e) => {
    state.kalk.bonModus = e.target.value;
    renderTabKalkulator();
  };
  bindKalkInputs();
  bindSparZinsSlider();
  recalcAndRender();
}

// Inline-Slider am Sparen-vs-Investieren-Chart. Eigener Binder, weil das Layout
// vom generischen Slider-System (data-slider/data-kalk) abweicht.
function bindSparZinsSlider() {
  const range = document.getElementById('spar-zins-slider');
  const num   = document.getElementById('spar-zins-num');
  const lbl   = document.getElementById('spar-zins-val');
  if (!range || !num || !lbl) return;
  // Iter 91.4 (22.05.2026): zwei getrennte Update-Pfade.
  //   - liveDisplay: nur die UI-Werte (Label + Sync zwischen Range und Num)
  //     spiegeln. KEIN recalc. Wird auf input getriggert während des Drags.
  //   - applyAndRecalc: erst beim Loslassen (change/blur) den State + Recalc.
  // Vorher: jede Slider-Bewegung triggerte recalcAndRender → die ganze Story
  // wurde neu gerendert → der Modal-DOM (inkl. dieser Slider) wurde zerstört
  // → User verlor Mouse-Tracking + Modal schloss sich. Edgar-Befund 22.05.
  const liveDisplay = (rawPct, source) => {
    let v = parseFloat(rawPct);
    if (!isFinite(v)) v = 2.5;
    v = Math.max(0, Math.min(12, v));
    if (source !== 'range') range.value = v.toFixed(2);
    if (source !== 'num')   num.value   = v.toFixed(2);
    lbl.textContent = v.toFixed(2).replace('.', ',') + ' %';
  };
  const applyAndRecalc = (rawPct) => {
    let v = parseFloat(rawPct);
    if (!isFinite(v)) v = 2.5;
    v = Math.max(0, Math.min(12, v));
    state.kalk.sparZins = v / 100;
    range.value = v.toFixed(2);
    num.value   = v.toFixed(2);
    lbl.textContent = v.toFixed(2).replace('.', ',') + ' %';
    recalcAndRender();
  };
  range.oninput  = () => liveDisplay(range.value, 'range');
  range.onchange = () => applyAndRecalc(range.value);
  num.oninput    = () => liveDisplay(num.value,   'num');
  num.onchange   = () => applyAndRecalc(num.value);
  num.onblur     = () => applyAndRecalc(num.value);
}

function setWeMode(mode) {
  state.kalk._isPaket = (mode === 'paket');
  renderTabKalkulator();
}
window.setWeMode = setWeMode;

// Merkt sich, welche Eingabe-Sektionen offen sind — überlebt WE-Wechsel + Bon-Wechsel.
function toggleKalkSection(id, detailsEl) {
  if (!state.kalk._openSec) state.kalk._openSec = {};
  state.kalk._openSec[id] = detailsEl.open;
}
window.toggleKalkSection = toggleKalkSection;

// KPI-Info-Box auf-/zuklappen (klick auf das "i"-Icon)
function toggleKpiInfo(btn) {
  const kpi = btn.closest('.kpi');
  if (!kpi) return;
  const box = kpi.querySelector('.kpi-info-box');
  if (!box) return;
  box.hidden = !box.hidden;
  btn.classList.toggle('open', !box.hidden);
}
window.toggleKpiInfo = toggleKpiInfo;

// Themen-Gruppierung mit <details>-Sektionen und Slider für Prozent-Werte.
// Paket-Modus: nur Person-Settings (Finanzierung, Steuer, Bonität) — die Objekt-Werte
// kommen aus den ausgewählten WEs (jeweils mit Preset aus we-presets.js).
function kalkInputsPaketHtml(i) {
  const slider = (label, key, minPct, maxPct, stepPct) => {
    const valPct = (i[key] || 0) * 100;
    return `
      <div class="slider-row">
        <label>${esc(label)} <span class="slider-val" data-slider-val="${key}">${valPct.toFixed(2)} %</span></label>
        <input type="range" data-slider="${key}" min="${minPct}" max="${maxPct}" step="${stepPct}" value="${valPct.toFixed(4)}">
        <input data-kalk="${key}" type="number" step="${stepPct / 100}" min="${minPct / 100}" max="${maxPct / 100}" value="${i[key] === undefined || i[key] === null ? '' : i[key]}" class="slider-num">
      </div>`;
  };
  const sliderEur = (label, key, min, max, step, unit) => {
    const u = unit === undefined ? '€' : unit;
    const val = i[key] || 0;
    const isInt = step >= 1;
    const valStr = isInt ? Math.round(val).toLocaleString('de-DE') : val.toLocaleString('de-DE');
    return `
      <div class="slider-row">
        <label>${esc(label)} <span class="slider-val" data-slider-val="${key}">${valStr}${u ? ' ' + u : ''}</span></label>
        <input type="range" data-slider="${key}" data-slider-fmt="eur" data-slider-unit="${esc(u)}" min="${min}" max="${max}" step="${step}" value="${val}">
        <input data-kalk="${key}" type="number" step="${step}" min="${min}" value="${i[key] === undefined || i[key] === null ? '' : i[key]}" class="slider-num">
      </div>`;
  };
  const select = (label, key, opts) => `
    <div>
      <label>${esc(label)}</label>
      <select data-kalk="${key}">
        ${opts.map(o => `<option value="${esc(o.v)}" ${String(i[key]) === String(o.v) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
      </select>
    </div>`;
  const isQuick = !i.bonModus || i.bonModus === 'quick';
  if (!state.kalk._openSec) state.kalk._openSec = {};
  const sec = (id) => state.kalk._openSec[id] ? 'open' : '';
  return `
    <details class="kalk-section" ${sec('pmarkt')} data-sec="pmarkt" ontoggle="toggleKalkSection('pmarkt', this)">
      <summary>1 · Marktpreis &amp; Wertentwicklung</summary>
      <div class="grid-1">
        ${sliderEur('Marktpreis €/qm (Ø ImmoScout + Homeday aus Airtable)', 'marktwertProQm', 0, 8000, 50, '€/qm')}
        ${slider('Wertsteigerung p.a.', 'wertsteigerung', 0, 6, 0.25)}
      </div>
      <div style="padding: 4px 14px 14px;">
        <p class="text-tertiary text-small">Marktpreis gilt für <strong>alle WEs im Paket</strong> — der Markteinkauf-Vorteil wird aggregiert berechnet (Σ Marktpreis × qm − Σ Kaufpreise).</p>
      </div>
    </details>
    <details class="kalk-section" ${sec('pfin')} data-sec="pfin" ontoggle="toggleKalkSection('pfin', this)">
      <summary>2 · Finanzierung</summary>
      <div class="grid-1">
        ${slider('Zinssatz', 'zins', 2, 8, 0.05)}
        ${slider('Anfängliche Tilgung', 'tilgung', 0.5, 5, 0.25)}
        ${select('Kaufnebenkosten mitfinanziert?', 'knkMitfinanziert', [
          {v:'false', l:'Nein'}, {v:'true', l:'Ja'}
        ])}
      </div>
    </details>
    <details class="kalk-section" ${sec('pst')} data-sec="pst" ontoggle="toggleKalkSection('pst', this)">
      <summary>3 · Steuer</summary>
      <div class="grid-1">
        ${isQuick
          ? slider('Persönlicher Steuersatz', 'steuersatz', 25, 50, 1)
          : slider('Persönlicher Steuersatz (aus Selbstauskunft)', 'saSteuersatz', 25, 50, 1)
        }
      </div>
    </details>
    ${isQuick ? `
    <details class="kalk-section" ${sec('pbon')} data-sec="pbon" ontoggle="toggleKalkSection('pbon', this)">
      <summary>4 · Bonität (Quick)</summary>
      <div class="grid-1">
        ${sliderEur('Monatliche Einnahmen', 'bonEinnahmen', 1500, 30000, 100, '€/Mo')}
        ${sliderEur('Monatliche Ausgaben', 'bonAusgaben', 800, 15000, 50, '€/Mo')}
        ${sliderEur('Verfügbares Eigenkapital (ohne Immobilien)', 'bonVermoegen', 0, 1000000, 1000)}
      </div>
    </details>
    ` : ''}
    <details class="kalk-section">
      <summary>Hinweis</summary>
      <div style="padding: 4px 14px 14px;">
        <p class="text-tertiary text-small">Im Paket-Modus werden die Objekt-Werte (Kaufpreis, qm, Miete, Hausgeld, AfA, Subvention) pro WE aus den gepflegten Vorlagen gezogen. Hier oben werden die <strong>gemeinsamen Settings</strong> (Marktpreis, Finanzierung, Steuer, Bonität) für das Paket eingestellt.</p>
      </div>
    </details>
  `;
}

function kalkInputsThemenHtml(i) {
  // Plain Number-Input
  // QA-Fix 2026-05-23 (Audit-X8): min="0" als Default. Negative Werte sind in
  // KEINEM Baukasten-Feld sinnvoll (KP, Miete, HG, HV, Zins, Tilgung, EK …).
  // Vorher konnte ein versehentliches Minus die Kalkulation in negative Cashflows
  // kippen, ohne dass der User es sofort sah.
  const num = (label, key, suffix, step) => `
    <div>
      <label>${esc(label)}${suffix ? ' (' + suffix + ')' : ''}</label>
      <input data-kalk="${key}" type="number" min="0" step="${step || 'any'}" value="${i[key] === undefined || i[key] === null ? '' : i[key]}">
    </div>`;
  // Slider + Number-Input gekoppelt (Prozent-Wert wird in Dezimal gespeichert)
  const slider = (label, key, minPct, maxPct, stepPct) => {
    const valPct = (i[key] || 0) * 100;
    return `
      <div class="slider-row">
        <label>${esc(label)} <span class="slider-val" data-slider-val="${key}">${valPct.toFixed(2)} %</span></label>
        <input type="range" data-slider="${key}" min="${minPct}" max="${maxPct}" step="${stepPct}" value="${valPct.toFixed(4)}">
        <input data-kalk="${key}" type="number" step="${stepPct / 100}" min="${minPct / 100}" max="${maxPct / 100}" value="${i[key] === undefined || i[key] === null ? '' : i[key]}" class="slider-num">
      </div>`;
  };
  // Slider für absolute Werte (Euro, qm, Monate). unit-Suffix konfigurierbar.
  const sliderEur = (label, key, min, max, step, unit) => {
    const u = unit === undefined ? '€' : unit;
    const val = i[key] || 0;
    const isInt = step >= 1;
    const valStr = isInt ? Math.round(val).toLocaleString('de-DE') : val.toLocaleString('de-DE');
    return `
      <div class="slider-row">
        <label>${esc(label)} <span class="slider-val" data-slider-val="${key}">${valStr}${u ? ' ' + u : ''}</span></label>
        <input type="range" data-slider="${key}" data-slider-fmt="eur" data-slider-unit="${esc(u)}" min="${min}" max="${max}" step="${step}" value="${val}">
        <input data-kalk="${key}" type="number" step="${step}" min="${min}" value="${i[key] === undefined || i[key] === null ? '' : i[key]}" class="slider-num">
      </div>`;
  };
  const select = (label, key, opts) => `
    <div>
      <label>${esc(label)}</label>
      <select data-kalk="${key}">
        ${opts.map(o => `<option value="${esc(o.v)}" ${String(i[key]) === String(o.v) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
      </select>
    </div>`;

  const isQuick = !i.bonModus || i.bonModus === 'quick';

  // Akkordeon-State pro Sektion in state.kalk._openSec speichern. Default: alle zu.
  if (!state.kalk._openSec) state.kalk._openSec = {};
  const sec = (id) => state.kalk._openSec[id] ? 'open' : '';
  return `
    <details class="kalk-section" ${sec('stamm')} data-sec="stamm" ontoggle="toggleKalkSection('stamm', this)">
      <summary>1 · Stammdaten</summary>
      <div class="grid-1">
        ${sliderEur('Kaufpreis Wohnung', 'kaufpreis', 30000, 500000, 500)}
        ${sliderEur('Stellplatz / Garage KP', 'stellplatzKp', 0, 30000, 500)}
        ${sliderEur('Quadratmeter', 'qm', 20, 200, 0.5, 'm²')}
        ${sliderEur('Marktwert €/qm (Ø ImmoScout + Homeday aus Airtable)', 'marktwertProQm', 0, 8000, 50, '€/qm')}
        ${slider('Inflation / Wertsteigerung p.a.', 'wertsteigerung', 0, 6, 0.25)}
      </div>
    </details>

    <details class="kalk-section" ${sec('miete')} data-sec="miete" ontoggle="toggleKalkSection('miete', this)">
      <summary>2 · Miete</summary>
      <div class="grid-1">
        ${sliderEur('Kaltmiete', 'kaltmiete', 200, 2000, 10, '€/Mo')}
        ${sliderEur('Stellplatz-Miete', 'stellplatzMiete', 0, 200, 5, '€/Mo')}
        ${(() => {
          // Iter 49 (Audit-Fix H4, 19.05.2026): Subventions-Status-Card —
          // bei fehlenden Stammdaten (Marktmiete, MbV, Kappung etc.) zeigt der
          // Vertriebler jetzt eine deutliche „warum greift das 2-Phasen-Modell nicht"-
          // Erklärung. Vorher: stiller Inline-Block, der CC2-Story-Lücken kaschiert hat.
          const phasen = Array.isArray(state.kalk.subventionPhasen) ? state.kalk.subventionPhasen : [];
          const totalEur = state.kalk._subventionTotalEur || 0;
          const erlaut = state.kalk._subventionErlaeuterung || '';
          const quelle = state.kalk._subventionQuelle || '';
          const fmt = (v) => Math.round(v).toLocaleString('de-DE');

          // Pflege-Lücken-Quellen: explizit warnen.
          // Iter 50 (Audit-Fix B-50.1, 19.05.2026): vorher griff `endsWith('-fehlt')`
          // nicht bei `auto-kein-spielraum` — obwohl der Fall in der pflegeMap drin ist.
          // Jetzt explizit alle gepflegt-Pflege-Quellen prüfen.
          // QA-Fix 2026-05-22 (Prüfer-2 B1): `auto-marktmiete-fehlt` (Backend Z.524)
          // fehlte hier — Folge: Vertriebler sah neutrale graue Card „Keine Mietsubvention"
          // statt roter Warn-Card. Glaubwürdigkeits-Falle (Henry: „keine Subv" sagt er
          // dem Kunden, später kommt raus dass Marktmiete einfach nicht gepflegt war).
          const istLuecke = ['auto-mbv-fehlt','auto-kappung-fehlt','auto-modus-fehlt','auto-kein-spielraum','auto-marktmiete-fehlt'].includes(quelle);
          if (istLuecke) {
            const pflegeMap = {
              'auto-mbv-fehlt':         'Miete bei Verkauf',
              'auto-kappung-fehlt':     'Kappungsgrenze',
              'auto-modus-fehlt':       'Vermietungs-Modus',
              'auto-kein-spielraum':    'Marktmiete (liegt aktuell ≤ Miete bei Verkauf)',
              'auto-marktmiete-fehlt':  'Marktmiete (€/qm)',
            };
            const fehlend = pflegeMap[quelle] || quelle;
            return `
              <div class="subv-status-card warn">
                <div class="title">Mietsubventions-Story aktuell nicht aktiv</div>
                <div class="hint">${esc(erlaut || 'Stammdaten unvollständig.')}</div>
                <ul>
                  <li>Fehlt: <strong>${esc(fehlend)}</strong> (Kalk-Stammdaten)</li>
                  <li>Wirkung: Käufer sieht reine Bestandsmiete ohne B&amp;B-Aufschlag — kein konstanter Cashflow über 6 Jahre.</li>
                  <li>Fix in Airtable: <a href="${AIRTABLE_LINKS.KALK_STAMMDATEN}" target="_blank" rel="noopener">Stammdaten-Tabelle öffnen</a></li>
                </ul>
              </div>`;
          }

          if (phasen.length === 0 && !state.kalk.subventionMonate) {
            // Kein Bestandsmodus (z.B. Neuvermietung/Leerstand) → das ist legitim, nicht alarmieren.
            return `<div class="subv-status-card">
              <div class="title">Keine Mietsubvention</div>
              <div class="hint">${esc(erlaut || 'aus Stammdaten berechnet')}</div>
            </div>`;
          }
          const phasenList = phasen.length > 0 ? phasen : [{ mo: state.kalk.subventionMo, monate: state.kalk.subventionMonate, label: 'Mietsubvention' }];
          const zeilen = phasenList.map((p, idx) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:13px;">
              <span class="text-tertiary">${phasenList.length > 1 ? 'Phase ' + (idx + 1) : 'Dein Aufschlag'}</span>
              <span><strong>${fmt(p.mo)} €</strong>/Mo &middot; <strong>${p.monate}</strong> Mo</span>
            </div>`).join('');
          return `
            <div class="subv-status-card">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="text-transform:uppercase;letter-spacing:0.05em;font-size:11px;font-weight:600;color:var(--text-tertiary);">Deine Mietsubvention</span>
                <span style="font-weight:700;color:var(--positive);font-size:14px;">Gesamt ${fmt(totalEur)} €</span>
              </div>
              ${zeilen}
              ${erlaut ? `<div class="text-tertiary text-small" style="margin-top:4px;font-size:11.5px;line-height:1.4;">${esc(erlaut)}</div>` : ''}
            </div>`;
        })()}
        ${select('Mietsteigerungs-Modus', 'mietsteigerungsModus', [
          {v:'sprung',  l:'Bestand · Vergleichsmiete-Sprünge alle 3 J'},
          {v:'staffel', l:'Neuvermietung · Staffelmiete linear p.a.'},
          {v:'index',   l:'Altvertrag · Indexmiete (exponentiell)'},
          {v:'keine',   l:'Keine'}
        ])}
        ${slider('Steigerung pro Sprung / Jahr', 'steigerungProz', 0, 25, 0.5)}
        ${(() => {
          // Iter 41.16 (Audit-Fix #6): Datum statt Slider.
          // Iter 78 (21.05.2026): Bei Tag-1-Override Hinweis im Label, damit der Vertriebler
          //   sieht warum das Input-Feld leer ist (Datum wurde bewusst auf null gesetzt,
          //   damit Phase 1 volle 36 Mo läuft).
          const datum = i.letzteMietsteigerung || '';
          let monateAnzeige = '—';
          if (datum) {
            const d = new Date(datum);
            if (!isNaN(d.getTime())) {
              const now = new Date();
              const diffMs = now - d;
              if (diffMs >= 0) {
                const mo = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44));
                monateAnzeige = mo + ' Monate her';
              } else {
                // QA-Fix 2026-05-23 (Edgar-Doc Bug 6+7): zukünftiges Datum
                // korrekt anzeigen (vorher Math.max(0,…) clamped auf „0 Mo her").
                const moFuture = Math.round(-diffMs / (1000 * 60 * 60 * 24 * 30.44));
                monateAnzeige = `in ${moFuture} Monaten geplant`;
              }
            }
          }
          const quelle = state.kalk._letzteMietsteigerungQuelle || '';
          // QA-Fix 2026-05-23 (Edgar-Doc Bug 6+7+8): Quellen-Label klarer:
          // mietvertrag-anpassung = echte Anpassung (gepflegt)
          // mietvertrag-vertragsbeginn-alt = nur Vertragsbeginn, > 3J alt (Vermutung)
          // unbekannt = nichts gepflegt
          const quelleLabel = quelle === 'kalk-stammdaten' ? 'aus Stammdaten (manuell)' :
                              quelle === 'mietvertrag-anpassung' ? 'aus Mietvertrag (echte Anpassung)' :
                              quelle === 'mietvertrag-vertragsbeginn-alt' ? '⚠ aus Vertragsbeginn (keine Anpassung dokumentiert)' :
                              quelle === 'mietvertrag-vertragsbeginn' ? '⚠ aus Vertragsbeginn' :
                              quelle === 'mietvertrag' ? 'aus Mietvertrag' :
                              quelle === 'leerstand-keine' ? '(Leerstand)' :
                              quelle === 'unbekannt' ? '⚠ nicht gepflegt' : '';
          // Iter 78: Tag-1-Override-Hinweis (Vereinbarung oder Iter63-Annahme)
          let tag1Hint = '';
          if (state.kalk._subventionTag1Erhoehung) {
            const altDate = state.kalk._letzteMietsteigerung;
            const altStr = altDate ? (() => {
              const d = new Date(altDate);
              return isNaN(d.getTime()) ? '' : `${('0'+(d.getMonth()+1)).slice(-2)}/${d.getFullYear()}`;
            })() : '';
            const altSuffix = altStr ? ` · Original: ${altStr}` : '';
            tag1Hint = state.kalk._subventionTag1Quelle === 'vereinbarung'
              ? ` · <span style="color:#0f5132;">↑ Tag-1-Anhebung aus Vereinbarung${altSuffix}</span>`
              : ` · <span style="color:#664d03;">↑ Tag-1-Anhebung (Annahme${altSuffix})</span>`;
          }
          return `
            <div class="slider-row">
              <label>Letzte Mieterhöhung <span class="slider-val">${esc(monateAnzeige)}${quelleLabel ? ' · ' + esc(quelleLabel) : ''}${tag1Hint}</span></label>
              <input data-kalk="letzteMietsteigerung" type="date" value="${esc(datum || '')}" style="padding:6px 10px; font-size:14px;">
            </div>
          `;
        })()}
      </div>
    </details>

    <details class="kalk-section" ${sec('hg')} data-sec="hg" ontoggle="toggleKalkSection('hg', this)">
      <summary>3 · Hausgeld &amp; Verwaltung</summary>
      <div class="grid-1">
        ${sliderEur('Hausgeld inkl. Rücklage', 'hausgeld', 0, 500, 5, '€/Mo')}
        ${sliderEur('Mietverwaltung (SEV)', 'mietverwaltung', 0, 100, 5, '€/Mo')}
        ${sliderEur('Hausverwaltung (WEG)', 'hausverwaltung', 0, 100, 1, '€/Mo')}
      </div>
    </details>

    <details class="kalk-section" ${sec('afa')} data-sec="afa" ontoggle="toggleKalkSection('afa', this)">
      <summary>4 · Steuern &amp; AfA</summary>
      <div class="grid-1">
        ${slider('Gebäude-Anteil', 'gebaeudeAnteil', 60, 95, 1)}
        ${slider('AfA-Satz (frei wählbar)', 'afaSatz', 1, 6, 0.05)}
      </div>
    </details>

    <div class="input-group-divider">
      <div class="input-group-label">Personenbezogene Eingaben</div>
    </div>

    <details class="kalk-section" ${sec('fin')} data-sec="fin" ontoggle="toggleKalkSection('fin', this)">
      <summary>5 · Finanzierung</summary>
      <div class="grid-1">
        ${slider('Zinssatz', 'zins', 2, 8, 0.05)}
        ${slider('Anfängliche Tilgung', 'tilgung', 0.5, 5, 0.25)}
        ${select('Kaufnebenkosten mitfinanziert?', 'knkMitfinanziert', [
          {v:'false', l:'Nein'}, {v:'true', l:'Ja'}
        ])}
      </div>
    </details>

    ${isQuick ? `
    <details class="kalk-section" ${sec('bon')} data-sec="bon" ontoggle="toggleKalkSection('bon', this)">
      <summary>6 · Persönliche Bonität (Quick)</summary>
      <div class="text-tertiary text-small mb-12">Direkt eingeben. Für Banken: Selbstauskunft-Tab + Bonität auf "Detail".</div>
      <div class="grid-1">
        ${sliderEur('Monatliche Einnahmen', 'bonEinnahmen', 1500, 20000, 100, '€/Mo')}
        ${sliderEur('Monatliche Ausgaben', 'bonAusgaben', 800, 10000, 50, '€/Mo')}
        ${sliderEur('Verfügbares Eigenkapital (ohne Immobilien)', 'bonVermoegen', 0, 500000, 1000)}
        ${slider('Persönlicher Steuersatz', 'steuersatz', 25, 50, 1)}
      </div>
    </details>
    ` : `
    <details class="kalk-section" ${sec('sast')} data-sec="sast" ontoggle="toggleKalkSection('sast', this)">
      <summary>6 · Persönlicher Steuersatz (Selbstauskunft)</summary>
      <div class="text-tertiary text-small mb-12">Im Detail-Modus wird Bonität aus der Selbstauskunft gezogen — den Steuersatz stellst Du hier separat ein. Der Quick-Wert wird nicht mehr übernommen.</div>
      <div class="grid-1">
        ${slider('Persönlicher Steuersatz', 'saSteuersatz', 25, 50, 1)}
      </div>
    </details>
    `}
  `;
}

// QA-Fix 2026-05-23 (Audit-EE-1, Datenverlust-Blocker): Wenn der User
// Kalkulator-Werte geändert hat und ungespeichert F5/Tab-Close drückt,
// vorher kommentarlos Verlust. Jetzt: beforeunload-Warning. Dirty-Flag
// wird in bindKalkInputs/Snapshot-Save sauber gemanagt.
let _kalkDirty = false;
function markKalkDirty() { _kalkDirty = true; }
function clearKalkDirty() { _kalkDirty = false; }
window.addEventListener('beforeunload', (e) => {
  if (_kalkDirty) {
    e.preventDefault();
    e.returnValue = ''; // Chrome-Pflicht
    return '';
  }
});

function bindKalkInputs() {
  // Slider <input type="range"> — schreiben in Dezimal (Prozent/100), oder bei Euro-Slidern als Roh-Wert.
  document.querySelectorAll('[data-slider]').forEach(slider => {
    slider.addEventListener('input', () => {
      const k = slider.dataset.slider;
      const isEur = slider.dataset.sliderFmt === 'eur';
      const unit = slider.dataset.sliderUnit || (isEur ? '€' : '');
      const step = parseFloat(slider.step) || 1;
      const isInt = step >= 1;
      const raw = parseFloat(slider.value);
      const v = isEur ? raw : (raw / 100); // Prozent → Dezimal
      state.kalk[k] = v;
      markKalkDirty();
      // Iter 41.15 (Audit-Fix #5): Manuelle Subv-Slider-Verstellung deaktiviert das
      // 2-Phasen-Modell, damit der Slider-Wert wirklich Effekt hat.
      if ((k === 'subventionMo' || k === 'subventionMonate') &&
          Array.isArray(state.kalk.subventionPhasen) && state.kalk.subventionPhasen.length > 0) {
        state.kalk.subventionPhasen = [];
        state.kalk._subventionQuelle = 'manuell-slider';
      }
      // Begleitendes Number-Input + Label synchronisieren
      const num = document.querySelector(`input[data-kalk="${k}"]`);
      if (num) num.value = isEur ? v : v.toFixed(4);
      const lbl = document.querySelector(`[data-slider-val="${k}"]`);
      if (lbl) {
        if (isEur) {
          const valStr = isInt ? Math.round(v).toLocaleString('de-DE') : v.toLocaleString('de-DE');
          lbl.textContent = valStr + (unit ? ' ' + unit : '');
        } else {
          lbl.textContent = raw.toFixed(2) + ' %';
        }
      }
      recalcAndRender();
    });
  });

  // Number-Inputs (alle anderen Eingaben)
  document.querySelectorAll('[data-kalk]').forEach(inp => {
    const apply = () => {
      const k = inp.dataset.kalk;
      let v = inp.value;
      if (inp.type === 'number') v = parseFloat(v);
      // Iter 41.16: Date-Inputs als String belassen (z.B. letzteMietsteigerung)
      if (inp.type === 'date') v = v || null;
      if (v === 'true') v = true;
      if (v === 'false') v = false;
      // NaN → null (für leere Number-Felder)
      if (typeof v === 'number' && !isFinite(v)) v = null;
      state.kalk[k] = v;
      markKalkDirty();
      // Iter 41.15 (Audit-Fix #5): Wenn 2-Phasen-Subv aktiv ist und der Vertriebler
      // den Subv-Slider manuell verstellt → Phasen-Array zurücksetzen, damit recalc
      // ab jetzt mit dem Slider-Wert rechnet (statt das Phasen-Array zu nutzen).
      if ((k === 'subventionMo' || k === 'subventionMonate') &&
          Array.isArray(state.kalk.subventionPhasen) && state.kalk.subventionPhasen.length > 0) {
        state.kalk.subventionPhasen = [];
        state.kalk._subventionQuelle = 'manuell-slider';
      }
      // Iter 60 (20.05.2026): KNK-Toggle schaltet den Default-Zins um.
      //   - KNK NICHT mitfinanziert → 4,5 % Zins
      //   - KNK mitfinanziert       → 4,8 % Zins
      //   Tilgung bleibt unverändert (1 % Default aus Profil). User kann den
      //   Wert danach manuell überschreiben.
      if (k === 'knkMitfinanziert') {
        state.kalk.zins = (v === true) ? 0.048 : 0.045;
        renderTabKalkulator();
        return;
      }
      // Begleitenden Slider mitziehen, falls vorhanden
      const slider = document.querySelector(`input[type="range"][data-slider="${k}"]`);
      if (slider && typeof v === 'number') {
        const isEur = slider.dataset.sliderFmt === 'eur';
        slider.value = isEur ? v : (v * 100);
        const lbl = document.querySelector(`[data-slider-val="${k}"]`);
        if (lbl) lbl.textContent = isEur
          ? Math.round(v).toLocaleString('de-DE') + ' €'
          : ((v * 100).toFixed(2) + ' %');
      }
      recalcAndRender();
    };
    inp.addEventListener('input', apply);
    inp.addEventListener('change', apply);
  });
}

function applyProfil(name) {
  const P = window.Kalk.PROFILES[name];
  if (!P) return;
  Object.assign(state.kalk, JSON.parse(JSON.stringify(P)));
  // Profil-Tag merken (für Snapshot-Bezeichnung + UI-Anzeige nach Reload)
  state.kalk._profil = name;
  renderTabKalkulator();
}
window.applyProfil = applyProfil;

// Erkennt das aktuelle Profil basierend auf den Steuersatz/Bonität-Werten.
// Wenn _profil bereits gesetzt ist, wird das verwendet.
function detectProfil(k) {
  if (k && k._profil && window.Kalk.PROFILES[k._profil]) return k._profil;
  if (!k || !window.Kalk || !window.Kalk.PROFILES) return 'standard';
  const profiles = window.Kalk.PROFILES;
  for (const name of Object.keys(profiles)) {
    const p = profiles[name];
    if (Math.abs((k.steuersatz || 0) - p.steuersatz) < 0.001 &&
        (k.bonEinnahmen || 0) === p.bonEinnahmen) return name;
  }
  return 'standard';
}

// Iter-4 (22.05.2026, Audit-Fix): Zentrale Reset-Helper für WE-Snapshot-Felder.
// Vorher gab `loadWeIntoKalk('')` nur 6 Felder frei, ~15 Snapshot-Felder rutschten
// beim WE-Wechsel durch (z.B. Tag-1-Badges der vorigen WE). Symptom war Iter-78-artig.
// UI-State-Felder (_isPaket, _paketWeIds, _projektFilter, _openSec, _profil) bleiben
// erhalten — der Wechsel löscht nur die WE-bezogenen Felder.
function _resetWeSnapshotFields() {
  const SNAPSHOT_KEYS = [
    '_weId', '_weLage', '_weNr', '_projektName', '_objektvorstellungLink',
    '_stammdatenId', '_stammdatenQuelle', '_stammdatenStatus',
    '_stellplatzAnzahl', '_stellplatzGarageCount', '_stellplatzFlaecheCount',
    '_stellplatzKp', '_stellplatzMiete', '_stellplatzMieteQuelle',
    '_wohnungsKaltmiete',
    '_vermietungsStatus', '_vermietungsStatusQuelle', '_vermietungsModus',
    '_vertragVorhanden', '_letzteMietsteigerung', '_letzteMietsteigerungQuelle',
    '_subventionQuelle', '_subventionTotalEur', '_subventionCapEur',
    '_subventionCapGreift', '_subventionErlaeuterung',
    '_subventionMarktCapGreift', '_subventionKaltmieteAdjustiert',
    '_subventionTag1Erhoehung', '_subventionTag1Anhebung', '_subventionTag1Quelle',
    '_vereinbarung',
    '_marktmieteEurQm', '_marktmieteAbs',
    '_marktpreisHD', '_marktpreisIS', '_marktpreisQuelle',
    '_indexmiete', '_kappungsgrenze',
    '_leerstand', '_mieteBeiVerkaufActive',
    // QA-Sprint 2026-05-23 (Audit-K B-K4): echte Stammdaten-Felder (ohne underscore)
    // wurden bei sticky-Werten nicht zurückgesetzt — bei Stammdaten-Lade-Fehler oder
    // leeren Feldern blieb der Wert der vorigen WE in der Engine. Speziell
    // marktmieteEurQm: bei Wesseling WE 3 (=0 in Airtable) blieb der Heidelberger-Wert
    // sticky → Marktmiete-Cap falsch.
    'marktmieteEurQm', 'marktwertProQm',
    'mietsteigerungsModus', 'kappungsgrenze', 'indexmiete',
    'subventionPhasen', 'subventionMo', 'subventionMonate',
    'wertsteigerung', 'hgInflation', 'gebaeudeAnteil', 'afaSatz',
    'hausgeld', 'hausverwaltung', 'mietverwaltung', 'grEstPct',
    'kaufpreis', 'qm', 'kaltmiete', 'stellplatzKp', 'stellplatzMiete',
    'letzteMietsteigerung',
    // FS-1 (24.05.2026, Tech-Architekt H-6): monateSeitMieterhoehung wurde
    // bisher beim WE-Wechsel nicht zurückgesetzt — Altwert der vorigen WE
    // konnte in die neue Kalkulation rutschen wenn die neue WE kein
    // letzteMietsteigerung-Datum hatte.
    'monateSeitMieterhoehung',
  ];
  for (const k of SNAPSHOT_KEYS) delete state.kalk[k];
}

// async, weil Airtable-Stammdaten via fetch geholt werden
// QA-Sprint 2026-05-23 (Audit-K B-K1): Token-Pattern gegen Race-Condition. Wenn der
// User schnell 2 WEs hintereinander klickt (langsamer Stammdaten-Endpoint), könnte
// der späte Response der ersten WE die State der zweiten überschreiben. Token-Check
// vor jedem state.kalk-Write bricht den überholten Branch ab.
let _loadWeToken = 0;
async function loadWeIntoKalk(weId) {
  if (!weId) {
    _resetWeSnapshotFields();
    renderTabKalkulator();
    return;
  }
  // Reset vor jedem Load — sonst rutschen Felder der vorigen WE durch,
  // wenn die neue WE ein Feld leer/null liefert (z.B. keine Vereinbarung).
  _resetWeSnapshotFields();
  const myToken = ++_loadWeToken;
  const w = state.wohneinheiten.find(x => x.id === weId);
  if (!w) return;

  // 1) WE-Metadata immer aus Airtable (Lage-Text, Projekt-Name, Objektvorstellungs-Link)
  state.kalk._weId = weId;
  state.kalk._weLage = w.lageText || w.lage || w.weNr || '';
  state.kalk._weNr = w.weNr || '';
  state.kalk._projektName = w.projektName || '';
  state.kalk._objektvorstellungLink = w.objektvorstellungLink || '';

  // 2) Defaults zurücksetzen aus getDefaults() — falls Airtable Lücken hat,
  //    haben wir wenigstens vernünftige Standardwerte (Wertsteigerung 3 % etc.).
  //    Iter 41.2 (16.05.2026): KEIN Fallback mehr auf we-stammdaten.js — Airtable
  //    ist Single Source of Truth. Wenn Airtable Status != Aktiv → Warnung im UI.
  const def = (window.Kalk && window.Kalk.getDefaults) ? window.Kalk.getDefaults() : {};
  Object.keys(def).forEach(k => {
    if (k === 'sparZins') return; // sparZins nicht überschreiben (UI-Slider-State)
    state.kalk[k] = def[k];
  });
  // WE-Basis aus Airtable
  state.kalk.kaufpreis = w.kp || w.kaufpreis || 0;
  state.kalk.qm = w.qm || 0;
  state.kalk.kaltmiete = w.kaltmiete || 0;

  // 3) Live-Airtable-Stammdaten holen — Airtable ist Wahrheit (siehe SOP-E).
  state.kalk._stammdatenQuelle = 'airtable-load';
  try {
    const resp = await api.get('/api/stammdaten/' + encodeURIComponent(weId));
    // QA-Sprint 2026-05-23 (Audit-K B-K1): Race-Condition-Check. Wenn der User in der
    // Zwischenzeit eine andere WE gewählt hat, ist myToken < _loadWeToken → wir brechen
    // ab statt den state mit obsoleten Werten zu überschreiben.
    if (myToken !== _loadWeToken) return;
    if (resp && resp.we) {
      // Iter 41.15 (18.05.2026, Audit-Fix): Stellplatz/Garage SAUBER GETRENNT von der Wohnung.
      // Vorher wurden KP und Miete aggregiert ins kaufpreis/kaltmiete-Feld gemixt → Slider zeigte 0,
      // Stellplatzmiete wuchs mit Wohnungs-Kappung statt mit Inflation, PDF zeigte Garage nicht.
      // Jetzt: separate State-Felder für Wohnung vs. Stellplatz. Header zeigt weiterhin Aggregat.
      const stplKp    = (resp.stellplaetze && resp.stellplaetze.kaufpreisSumme) || 0;
      const stplMiete = (resp.stellplaetze && resp.stellplaetze.mieteMoSumme) || 0;
      state.kalk.kaufpreis = resp.we.kp || 0;          // NUR Wohnung
      state.kalk.qm = resp.we.qm || state.kalk.qm;
      state.kalk.kaltmiete = resp.we.kaltmiete || 0;   // NUR Wohnung
      state.kalk.stellplatzKp    = stplKp;             // separat in den Kalkulator-Input
      state.kalk.stellplatzMiete = stplMiete;          // separat (wird mit Inflation, nicht Kappung gewachsen)
      // Tracking für UI-Header-Anzeige (Aggregat-Zeile)
      state.kalk._stellplatzAnzahl = (resp.stellplaetze && resp.stellplaetze.anzahl) || 0;
      state.kalk._stellplatzGarageCount  = (resp.stellplaetze && resp.stellplaetze.garageCount) || 0;
      state.kalk._stellplatzFlaecheCount = (resp.stellplaetze && resp.stellplaetze.flaecheCount) || 0;
      state.kalk._stellplatzKp = stplKp;
      state.kalk._stellplatzMiete = stplMiete;
      state.kalk._stellplatzMieteQuelle = (resp.stellplaetze && resp.stellplaetze.mieteMoQuelle) || 'keine';
      // Wohnungs-Kaltmiete (ohne Stellplatz) — wird für Mietsteigerungs-Logik gebraucht
      state.kalk._wohnungsKaltmiete = resp.we.kaltmiete || 0;
    }
    // Vermietungs-Status + letzte Mietsteigerung
    if (resp && resp.vermietung) {
      state.kalk._vermietungsStatus = resp.vermietung.status;            // 'vermietet' | 'leer'
      state.kalk._vermietungsStatusQuelle = resp.vermietung.statusQuelle; // 'we-lookup' | 'fallback-...'
      state.kalk._vertragVorhanden  = resp.vermietung.vertragVorhanden;
      state.kalk._letzteMietsteigerung = resp.vermietung.letzteMietsteigerung;  // YYYY-MM-DD oder null
      state.kalk._letzteMietsteigerungQuelle = resp.vermietung.letzteMietsteigerungQuelle;

      // Iter 41.17 (18.05.2026, Edgar-Fix): Leerstand sauber behandeln.
      // Wenn die WE leersteht (laut Lookup „Miet-status (ist)" autoritativ),
      // darf KEIN alter Vertragsbeginn als „letzte Mieterhöhung" reinrutschen —
      // sonst sperrt die Kalkulation die Mietsteigerung ~24 Monate (M1=24 statt 1).
      // Backend liefert in dem Fall letzteMietsteigerung=null. Wir setzen zusätzlich
      // monateSeitMieterhoehung=36 → M1=1, d.h. Staffel greift sofort ab Monat 1,
      // passend zum Neuvermietungs-Szenario (B&B vermietet vor Verkauf neu).
      if (resp.vermietung.status === 'leer') {
        state.kalk.letzteMietsteigerung = null;
        state.kalk.monateSeitMieterhoehung = 36;
      } else if (resp.vermietung.letzteMietsteigerung) {
        // Iter 41.16 (Audit-Fix #6): Datum als primärer State, monateSeit wird in recalc live abgeleitet.
        state.kalk.letzteMietsteigerung = resp.vermietung.letzteMietsteigerung;
        const lastDate = new Date(resp.vermietung.letzteMietsteigerung);
        const now = new Date();
        const monate = Math.max(0, Math.round((now - lastDate) / (1000 * 60 * 60 * 24 * 30.44)));
        state.kalk.monateSeitMieterhoehung = monate;
      } else {
        // Vermietet, aber kein Datum gepflegt → konservativ: ab Monat 1 erhöhen
        state.kalk.letzteMietsteigerung = null;
        state.kalk.monateSeitMieterhoehung = 36;
      }
    }
    if (resp && resp.kalkStammdaten && resp.kalkStammdaten.status === 'Aktiv') {
      const sd = resp.kalkStammdaten;
      const derived = resp.derived || {};
      // Airtable überschreibt Excel-Fallback (nur wenn Status=Aktiv)
      if (sd.hausverwaltung !== null)        state.kalk.hausverwaltung = sd.hausverwaltung;
      if (sd.hausgeldRuecklage !== null)     state.kalk.hausgeld = sd.hausgeldRuecklage;
      if (sd.mietverwaltungDefault !== null) state.kalk.mietverwaltung = sd.mietverwaltungDefault;
      // Iter 41.10 — 2-Phasen-Modell. Backend liefert phasen[]; Kalkulator nutzt die.
      // mo + monate bleiben als Aggregat für Backward-Compat (z.B. alte UI-Bereiche).
      state.kalk.subventionPhasen   = derived.subventionPhasen || [];
      state.kalk.subventionMo       = (derived.subventionMo     != null) ? derived.subventionMo     : (sd.mietzuschuss        || 0);
      state.kalk.subventionMonate   = (derived.subventionMonate != null) ? derived.subventionMonate : (sd.mietzuschussMonate  || 0);
      state.kalk._subventionQuelle  = derived.subventionQuelle || 'unbekannt';
      state.kalk._subventionTotalEur     = derived.subventionTotalEur || 0;
      state.kalk._subventionCapEur       = derived.subventionCapEur || 0;
      state.kalk._subventionCapGreift    = !!derived.subventionCapGreift;
      state.kalk._subventionErlaeuterung = derived.subventionErlaeuterung || '';
      // Iter 62/63 (20.05.2026): zusätzliche Subv-Indikatoren für die UI
      state.kalk._subventionTag1Erhoehung    = !!derived.subventionTag1Erhoehung;
      state.kalk._subventionTag1Anhebung     = derived.subventionTag1Anhebung || 0;
      state.kalk._subventionMarktCapGreift   = !!derived.subventionMarktCapGreift;
      state.kalk._subventionKaltmieteAdjustiert = derived.subventionKaltmieteAdjustiert || null;
      // Iter 70 (21.05.2026): Vereinbarte Mieterhöhung (echte Vereinbarung mit Mieter).
      state.kalk._subventionTag1Quelle       = derived.subventionTag1Quelle || null; // 'vereinbarung' | 'iter63-annahme' | null
      state.kalk._vereinbarung               = derived.vereinbarung || null; // { datum, monateBisErhoehung, kaltmiete, anwendbar }
      // Iter 65 (20.05.2026): Marktmiete jetzt als €/qm in Airtable gepflegt;
      //   das Backend liefert €/qm + umgerechneten €/Mo-Wert, damit die UI beides zeigen kann.
      state.kalk._marktmieteEurQm = derived.marktmieteEurQm || 0;
      state.kalk._marktmieteAbs   = derived.marktmieteAbs || 0;
      // Iter 70 (21.05.2026): Marktmiete-Cap zurück in der Kaltmiete-Projektion (kalkulator.js).
      //   Wir spiegeln den Wert in den Top-Level-State, damit recalc() ihn direkt sieht.
      state.kalk.marktmieteEurQm = derived.marktmieteEurQm || 0;
      if (sd.afaGutachten !== null)          state.kalk.afaSatz = sd.afaGutachten;
      if (sd.wertsteigerung !== null)        state.kalk.wertsteigerung = sd.wertsteigerung;
      if (sd.grEst !== null)                 state.kalk.grEstPct = sd.grEst;
      if (sd.gebaeudeAnteil !== null)        state.kalk.gebaeudeAnteil = sd.gebaeudeAnteil;
      // QA-Fix 2026-05-24 (Edgar): hgInflation komplett ignoriert — immer 0.
      state.kalk.hgInflation = 0;
      // Iter 41.9 / 41.15 — Miete bei Verkauf ersetzt NUR die Wohnungs-Kaltmiete.
      // Stellplatzmiete bleibt separat in state.kalk.stellplatzMiete.
      if (sd.mieteBeiVerkauf != null && sd.mieteBeiVerkauf > 0) {
        state.kalk.kaltmiete = sd.mieteBeiVerkauf;
        state.kalk._mieteBeiVerkaufActive = true;
      } else {
        // QA-Fix 2026-05-23 (Audit-Phase2 Konstellation 2): Wenn Neuvermietung/Leer
        // UND kaltmiete=0 UND MBV nicht gepflegt → Engine läuft 30 Jahre mit 0€
        // Kaltmiete, Vermögen-J10 + Cashflow völlig unrealistisch. Fallback auf
        // marktmiete × qm als geschätzter Mietansatz, mit klarem Hinweis-Flag.
        const modusLowerEarly = (sd.vermietungsModus || '').toLowerCase();
        const istNeu = modusLowerEarly.includes('neuvermietung') || modusLowerEarly.includes('staffel') || modusLowerEarly.includes('leer') || modusLowerEarly.includes('frei');
        const aktKM = parseFloat(state.kalk.kaltmiete) || 0;
        if (istNeu && aktKM <= 0 && sd.marktmiete > 0 && resp.we && resp.we.qm > 0) {
          state.kalk.kaltmiete = sd.marktmiete * resp.we.qm;
          state.kalk._mieteBeiVerkaufActive = true;
          state.kalk._kaltmieteGeschaetztAusMarktmiete = true; // UI kann darauf reagieren
        }
      }
      // Iter 63 (20.05.2026): Wenn das Backend signalisiert, dass die letzte
      //   Mietsteigerung > 3 Jahre her ist und die erste Erhöhung beim Käufer
      //   ab Tag 1 eingerechnet wird, überschreiben wir die Tag-1-Mieter-Miete
      //   mit dem angepassten Wert. Subv-Phasen rechnen dann gegen diese neue Basis.
      // Iter 70 (21.05.2026): Bug-Fix — wir müssen zusätzlich `letzteMietsteigerung`
      //   und `monateSeitMieterhoehung` resetten, sonst rechnet kalkulator.js mit
      //   dem alten Vertragsbeginn-Datum (z.B. 116 Mo her) weiter, M1 fällt auf 1,
      //   und die nächste Sprung-Erhöhung greift schon in Monat 1 statt Monat 36.
      //   Folge bisher: Käufer-Miete springt in Jahr 4 ungebremst um 20 % nach oben,
      //   und der versprochene konstante CF über 72 Mo war faktisch nicht eingehalten.
      if (state.kalk._subventionTag1Erhoehung && state.kalk._subventionKaltmieteAdjustiert) {
        state.kalk.kaltmiete = state.kalk._subventionKaltmieteAdjustiert;
        state.kalk._mieteBeiVerkaufActive = true;
        // Tag-1-Erhöhung gilt als „gerade gemacht" → Phase 1 läuft volle 36 Mo ab jetzt.
        state.kalk.letzteMietsteigerung = null;
        state.kalk.monateSeitMieterhoehung = 0;
      }
      // Iter 41.9 — Markt-Schnitt (IS + HD)
      if (derived.marktpreisGemittelt && derived.marktpreisGemittelt > 0) {
        state.kalk.marktwertProQm = derived.marktpreisGemittelt;
        state.kalk._marktpreisQuelle = derived.marktpreisGemitteltQuelle;
      }
      state.kalk._marktpreisIS = sd.marktpreisImmoscout;
      state.kalk._marktpreisHD = sd.marktpreisHomeday;
      // Mieterhöhungs-Logik → mappen auf bestehende kalkulator.js-Felder
      state.kalk._vermietungsModus = sd.vermietungsModus;
      state.kalk._kappungsgrenze = sd.kappungsgrenze;
      state.kalk._indexmiete = sd.indexmiete;
      // Iter 41.11 (18.05.2026) — Edgar-Policy: Neuvermietung = Staffelmiete 3 % p.a. (LINEAR).
      // Altbestand hat keine Indexverträge (Edgar 18.05.: "Altbestand haben wir nie neu vermietet mit Index").
      // sd.indexmiete = Staffelmiete % (Feld in Airtable seit 18.05. umbenannt zu 'Staffelmiete %').
      //
      // Iter 41.17 (18.05.2026, Edgar-Fix): WE-Lookup-Status hat Vorrang vor dem
      // Kalk-Stammdaten-Vermietungsmodus. Wenn die WE tatsächlich leersteht, gilt
      // immer Neuvermietungs-Logik (Staffel, 3 % default), unabhängig davon,
      // was im Kalk-Stammdaten-Vermietungsmodus eingetragen ist.
      const modusLower = (sd.vermietungsModus || '').toLowerCase();
      if (state.kalk._vermietungsStatus === 'leer') {
        // Autoritativ aus WE-Lookup „Miet-status (ist)" — Käufer übernimmt
        // frisch neu vermietete WE, also Staffel ab Monat 1.
        state.kalk.mietsteigerungsModus = 'staffel';
        state.kalk.steigerungProz = (sd.indexmiete !== null && sd.indexmiete !== undefined && sd.indexmiete > 0)
          ? sd.indexmiete
          : 0.03;
        state.kalk._leerstand = true;
      } else if (modusLower.includes('neuvermietung')) {
        state.kalk.mietsteigerungsModus = 'staffel'; // linear: Startmiete × (1 + n × %)
        state.kalk.steigerungProz = (sd.indexmiete !== null && sd.indexmiete !== undefined && sd.indexmiete > 0)
          ? sd.indexmiete
          : 0.03; // 3 % Default
      } else if (modusLower.includes('bestand')) {
        // Iter 91.2 (22.05.2026): vorher `=== 'Bestand'` (strikter String-Match).
        // Wenn Airtable den Wert mit Suffix/Whitespace führt ('Bestand vermietet',
        // 'Bestand · Vergleichsmiete', ' Bestand'), fiel die WE durch in den
        // Else-Branch und blieb beim Staffel-Default → jährliche Steigerung
        // statt Sprung alle 3 Jahre. Edgar-Befund WE 1 Heidelberger.
        state.kalk.mietsteigerungsModus = 'sprung';
        if (sd.kappungsgrenze === '20 % alle 3 Jahre') {
          state.kalk.steigerungProz = 0.20;
        } else {
          state.kalk.steigerungProz = 0.15; // Default 15 %
        }
      } else if (modusLower.includes('leer') || modusLower.includes('frei')) {
        // Iter 41.16 (Audit-Fix #15): Leerstand laut Kalk-Stammdaten-Modus (legacy).
        // Wird nur erreicht, wenn WE-Lookup oben NICHT 'leer' war (sonst hätte der
        // erste Zweig schon gegriffen). Reserve für inkonsistente Pflege.
        state.kalk.mietsteigerungsModus = 'staffel';
        state.kalk.steigerungProz = 0.03;
        state.kalk._leerstand = true;
      }
      state.kalk._stammdatenQuelle = 'airtable-aktiv';
      state.kalk._stammdatenId = sd.id;
      state.kalk._stammdatenStatus = sd.status;
    } else if (resp && resp.kalkStammdaten) {
      // Entwurf existiert, aber nicht aktiv — wir nutzen die getDefaults()-Werte
      // (Wertsteigerung 3 %, etc.), aber zeigen klar im UI „Daten nicht aktiv".
      state.kalk._stammdatenQuelle = 'airtable-entwurf-defaults';
      state.kalk._stammdatenId = resp.kalkStammdaten.id;
      state.kalk._stammdatenStatus = resp.kalkStammdaten.status;
    } else {
      // Gar kein Datensatz in Airtable → Defaults
      state.kalk._stammdatenQuelle = 'airtable-fehlt-defaults';
      state.kalk._stammdatenStatus = 'fehlt';
    }

    // Iter 41.17 (18.05.2026, Edgar-Fix) — Leerstands-Override greift auch dann,
    // wenn die Kalk-Stammdaten NICHT auf 'Aktiv' stehen. Sonst würde eine WE
    // mit Entwurf-Stammdaten + Leerstand weiter mit Default-Sprungmodus rechnen.
    if (state.kalk._vermietungsStatus === 'leer' && !state.kalk._leerstand) {
      state.kalk.mietsteigerungsModus = 'staffel';
      state.kalk.steigerungProz = 0.03;
      state.kalk._leerstand = true;
    }
  } catch (e) {
    // QA-Sprint 2026-05-23 (Audit-K B-K4): Network-Fehler ist nicht mehr silent —
    // Vertriebler braucht einen sichtbaren Hinweis. Token-Check verhindert race-spam.
    if (myToken === _loadWeToken) {
      toast('Stammdaten konnten nicht geladen werden — Defaults werden genutzt: ' + (e.message || 'Netzwerk-Fehler'), 'error');
    }
    console.warn('[stammdaten] Airtable-Endpoint fehlgeschlagen, nutze Fallback:', e.message);
  }

  // QA-Sprint 2026-05-23 (Audit-K B-K1): nicht rendern, wenn der User schon
  // eine andere WE gewählt hat — sonst Re-Render mit obsoleten Daten.
  if (myToken !== _loadWeToken) return;
  renderTabKalkulator();
  // FS-1 (24.05.2026, Vertriebler B1): nach WE-Wechsel scrollTo top, damit
  // im Screen-Share-Termin der Käufer den Header der neuen WE sieht statt
  // der alten Renov-Story. smooth-scroll für sichtbaren Transition-Effekt.
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
  // QA-Fix 2026-05-23 (Edgar-Doc Bug-4): Tour re-rendern für detectCompleted
  // (Projekt-/WE-Wahl).
  if (typeof _tourRerender === 'function') _tourRerender();
}
window.loadWeIntoKalk = loadWeIntoKalk;

function resetKalk() {
  state.kalk = makeDefaultKalkInput();
  renderTabKalkulator();
}
window.resetKalk = resetKalk;

let chartV = null, chartC = null, chartS = null;

function recalcAndRender() {
  // Wenn Bonitäts-Modus = 'detail' → Selbstauskunft aus dem Kunden ziehen.
  if (state.kalk && state.kalk.bonModus === 'detail' && state.kunde) {
    let sa = state.kunde.saJson;
    if (typeof sa === 'string') { try { sa = JSON.parse(sa); } catch(e) { sa = null; } }
    if (sa && typeof sa === 'object') {
      state.kalk.selbstauskunft = sa;
      state.kalk.saAntragGemeinsam = sa.gemeinsam !== false;
    }
  }
  let r;
  try {
    if (state.kalk._isPaket && Array.isArray(state.kalk._paketWeIds) && state.kalk._paketWeIds.length > 0) {
      // Paket-Modus: jede WE aus Airtable ziehen, recalcPaket aufrufen.
      // Falls für die WE ein gepflegtes Preset in we-presets.js existiert → das nutzen.
      // Sonst Default-Preset aus Airtable-Werten + Faustregeln.
      // Gemeinsamer Marktpreis aus dem Paket-UI: überschreibt Per-WE-Werte wenn gesetzt.
      const paketMarktwert = parseFloat(state.kalk.marktwertProQm) || 0;
      const paketWertsteigerung = (typeof state.kalk.wertsteigerung === 'number')
        ? state.kalk.wertsteigerung : null;
      const weInputs = state.kalk._paketWeIds.map(wid => {
        const w = state.wohneinheiten.find(x => x.id === wid);
        if (!w) return null;
        // Iter 45: Pro-rata-Stellplatzdaten + Kalk-Stammdaten aus Cache
        const stamm = (state.stammdatenByWe || {})[wid];
        const stellplatzKpFromAirtable = stamm && stamm.stellplaetze ? (stamm.stellplaetze.kaufpreisSumme || 0) : 0;
        const stellplatzMieteFromAirtable = stamm && stamm.stellplaetze ? (stamm.stellplaetze.mieteMoSumme || 0) : 0;
        const kalk = stamm && stamm.stammdaten ? stamm.stammdaten : null;
        const preset = (window.WE_PRESETS_BY_RECID || {})[wid];
        const base = preset
          ? JSON.parse(JSON.stringify(preset))
          : {
              kaufpreis: w.kp || 0,
              stellplatzKp: stellplatzKpFromAirtable,
              qm: w.qm || 0,
              marktwertProQm: 0,
              kaltmiete: w.kaltmiete || 0,
              stellplatzMiete: stellplatzMieteFromAirtable,
              subventionMo: kalk && kalk.mietzuschuss ? kalk.mietzuschuss : 0,
              subventionMonate: kalk && kalk.mietzuschussMonate ? kalk.mietzuschussMonate : 0,
              mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
              hausgeld: (kalk && kalk.hausgeldRuecklage) || Math.round((w.qm || 0)),
              hgInflation: 0, // QA-Fix 2026-05-24 (Edgar): immer 0
              mietverwaltung: (kalk && kalk.mietverwaltungDefault) || 0,
              hausverwaltung: (kalk && kalk.hausverwaltung) || 30,
              afaSatz: (kalk && kalk.afaGutachten) || 0.02,
              gebaeudeAnteil: (kalk && kalk.gebaeudeAnteil) || 0.85,
              afaBemessung: 'kaufpreis',
              wertsteigerung: (kalk && kalk.wertsteigerung) || 0.03,
            };
        // Wenn Preset vorhanden, Stellplatz aus Airtable trotzdem nachziehen (Live-Daten haben Vorrang)
        if (preset && stellplatzMieteFromAirtable >= 0) base.stellplatzMiete = stellplatzMieteFromAirtable;
        if (preset && stellplatzKpFromAirtable >= 0)   base.stellplatzKp    = stellplatzKpFromAirtable;
        // Paket-weite Overrides: Marktpreis + Wertsteigerung
        if (paketMarktwert > 0) base.marktwertProQm = paketMarktwert;
        if (paketWertsteigerung !== null) base.wertsteigerung = paketWertsteigerung;
        return Object.assign(base, {
          _weId: w.id, _weLage: w.lageText || w.lage, _weNr: w.weNr, _projektName: w.projektName,
        });
      }).filter(Boolean);
      if (weInputs.length === 0) {
        document.getElementById('kpi-grid').innerHTML = '<div class="empty-state">Wähle mindestens eine WE.</div>';
        return;
      }
      const personSettings = {
        zins: state.kalk.zins, tilgung: state.kalk.tilgung, knkMitfinanziert: state.kalk.knkMitfinanziert,
        steuersatz: state.kalk.steuersatz,
        // Iter 60 (20.05.2026): saSteuersatz separat ans Paket-Recalc — der greift
        // nur, wenn bonModus === 'detail' (siehe recalc() in kalkulator.js).
        saSteuersatz: state.kalk.saSteuersatz,
        bonEinnahmen: state.kalk.bonEinnahmen, bonAusgaben: state.kalk.bonAusgaben, bonVermoegen: state.kalk.bonVermoegen,
        bonModus: state.kalk.bonModus,
        selbstauskunft: state.kalk.selbstauskunft, saAntragGemeinsam: state.kalk.saAntragGemeinsam,
        sparZins: state.kalk.sparZins,
      };
      r = window.Kalk.recalcPaket(weInputs, personSettings);
    } else {
      r = window.Kalk.recalc(state.kalk);
    }
  }
  catch (e) {
    // Iter 50 (Audit-Fix B-50.3, 19.05.2026): vorher stiller catch — Edgar bekam
    // gar nichts mit, KPI-Grid blieb mit alten Werten stehen. Jetzt: User-Toast
    // + leeres KPI-Grid mit Fehler-Hinweis, damit der Zustand klar wird.
    console.error('recalc', e);
    toast('Berechnung fehlgeschlagen: ' + (e.message || 'unbekannter Fehler'), 'error');
    const errGrid = document.getElementById('kpi-grid');
    if (errGrid) errGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;color:var(--negative);"><strong>Berechnung fehlgeschlagen.</strong> Prüf die Eingabewerte oder lade die Seite neu.</div>`;
    return;
  }
  // QA-Fix 2026-05-23 (Audit E-1): recalc returnt jetzt null wenn kaufpreis=0.
  // Frontend muss das defensiv handhaben, sonst crasht jeder folgende Zugriff.
  if (r == null) {
    state.kalkResult = null;
    const errGrid = document.getElementById('kpi-grid');
    if (errGrid) errGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;color:var(--text-tertiary);"><strong>Kein Kaufpreis</strong> — Eckdaten der WE in Stammdaten pflegen.</div>`;
    const storyEl = document.getElementById('story-container');
    if (storyEl) storyEl.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;">Kaufpreis fehlt — keine Kalkulation möglich.</div>';
    return;
  }
  state.kalkResult = r;

  // KPIs
  const fmt = window.Kalk.fmtEur;
  const fmtPct = window.Kalk.fmtPct;
  const fmtEurMo = window.Kalk.fmtEurMo;
  const grid = document.getElementById('kpi-grid');
  // Iter 91: kein Early-Return mehr — Power-User-KPI-Strip ist entfernt,
  // KPIs leben jetzt im Magazin (renderStoryPremium). Wenn grid noch
  // existiert (Legacy), füllen wir es. Sonst: KPI-Render skippen, Story rendern.
  const cls = (v) => v > 0 ? 'positive' : (v < 0 ? 'negative' : '');
  // Kern-KPIs wie V1 — 5 Standard + optional Markteinkauf-Vorteil. Mit klickbaren Info-Boxen.
  const kpiCard = (label, value, info, extraClass) => `
    <div class="kpi ${extraClass || ''}">
      <div class="label">${esc(label)}<button class="kpi-info" onclick="toggleKpiInfo(this)" title="Erklärung anzeigen">i</button></div>
      <div class="value">${value}</div>
      <div class="kpi-info-box" hidden>${esc(info)}</div>
    </div>`;
  const kpis = [
    kpiCard('Dein EK-Bedarf', fmt(r.ekBedarf),
      (() => {
        const grEstPct = (state.kalk && parseFloat(state.kalk.grEstPct)) || 0.05;
        const totalPct = grEstPct + 0.015 + 0.005;
        const grEstStr = (grEstPct * 100).toFixed(grEstPct === 0.065 ? 1 : 1) + ' %';
        const totalStr = (totalPct * 100).toFixed(1) + ' %';
        return `Dein Eigenkapital beim Kauf: Kaufnebenkosten (GrESt ${grEstStr} + Notar 1,5 % + Grundbuch 0,5 % = ${totalStr} vom Kaufpreis). Wenn Du die KNK mitfinanzierst: 0 €.`;
      })()),
    kpiCard('Deine Belastung / Monat', fmtEurMo(r.belastungMo),
      'Was Dir monatlich in Jahr 1 aus der Tasche geht oder bleibt. Deine Mieten + Subvention − Annuität − Hausgeld − Hausverwaltung − Mietverwaltung + Dein Steuervorteil. Positiv = Cashflow positiv für Dich.', cls(r.belastungMo)),
    kpiCard('Deine EK-Rendite (IRR) 10 J.', fmtPct(r.irr),
      'Interner Zinsfuß auf Dein eingesetztes EK über 10 Jahre inkl. Exit-Erlös. Berücksichtigt: Dein eingesetztes EK, Deine jährlichen Cashflows, Dein Verkaufserlös nach §23-EStG-Frist.'),
    // Iter 67 (20.05.2026): „Gesamtvermögen 10 J." raus, stattdessen Bruttorendite.
    //   Formel: Käufer-Brutto-Mieteinnahme Jahr 1 (Kaltmiete + Stellplatzmiete + Subv-Aufschlag)
    //   × 12 / Gesamtkaufpreis. Das ist die anfängliche Brutto-Rendite, die der Käufer in Jahr 1
    //   sieht — inkl. der von B&B geleisteten Subventions-Aufstockung.
    kpiCard('Deine Bruttorendite (Jahr 1)', fmtPct(r.bruttorendite || 0),
      'Brutto-Mietrendite im ersten Jahr: (Deine Kaltmiete + Stellplatzmiete + B&B-Subvention) × 12 ÷ Gesamtkaufpreis. Bezieht die Mietsubvention voll ein — so wie Du sie wirklich kassierst.'),
    kpiCard('Dein Vermögenszuwachs 10 J.', fmt(r.vermoegenNetto10),
      'Deine ehrliche Vermögensbilanz: Gesamtvermögen 10 J. minus Dein eingesetztes Eigenkapital. Das ist Dein echter Zuwachs gegenüber Deinem Start.', 'positive'),
  ];
  const mwQm = (state.kalk && parseFloat(state.kalk.marktwertProQm)) || 0;
  if (mwQm > 0 && r.markteinkaufVorteil) {
    kpis.push(kpiCard('Dein Markteinkauf-Vorteil', fmt(r.markteinkaufVorteil),
      'Differenz zwischen Marktpreis pro qm und Deinem Kaufpreis pro qm × Wohnfläche. „Geld, das schon in Deinem Kaufpreis steckt."',
      cls(r.markteinkaufVorteil)));
  }
  if (grid) grid.innerHTML = kpis.join('');

  // Bonität-Card — 4 KPIs: Einkommen vor/nach + EK vor/nach
  const bonEl = document.getElementById('bon-card');
  if (bonEl) {
    const detail = r.bonModus === 'detail';
    const ein = r.bonEinnahmen || 0;
    const aus = r.bonAusgaben || 0;
    const einkommenVor = ein - aus;
    const einkommenNach = einkommenVor + (r.bonDelta || 0);
    const ekVor = r.bonVermoegen || 0;
    const ekNach = ekVor - r.ekBedarf;
    const okFarbe = (v) => v >= 0 ? 'positive' : 'negative';

    bonEl.innerHTML = `
      <div class="card-title">Bonität ${detail ? '(aus Selbstauskunft)' : '(Quick)'}</div>
      <div class="kpi-grid">
        <div class="kpi ${okFarbe(einkommenVor)}"><div class="label">Einkommen frei vor Invest.</div><div class="value">${fmtEurMo(einkommenVor)}</div></div>
        <div class="kpi ${okFarbe(einkommenNach)}"><div class="label">Einkommen frei nach Invest.</div><div class="value">${fmtEurMo(einkommenNach)}</div></div>
        <div class="kpi ${okFarbe(ekVor)}"><div class="label">Eigenkapital vor Invest.</div><div class="value">${fmt(ekVor)}</div></div>
        <div class="kpi ${okFarbe(ekNach)}"><div class="label">Eigenkapital nach Invest.</div><div class="value">${fmt(ekNach)}</div></div>
      </div>
    `;
  }

  // Charts
  drawCharts(r);

  // Story-Sektionen — Iter 89: Premium-Reduktion Magazin-View (Variante C).
  // Alte renderStories(r) bleibt im Code als Sicherheits-Anker für schnellen Rollback.
  renderStoryPremium(r);
}

// Rendert 7 Story-Sektionen mit ausführlichen Erklärungen — Vertriebs-Story der Kalkulation.
function renderStories(r) {
  const el = document.getElementById('story-container');
  if (!el) return;
  const fmt = window.Kalk.fmtEur;
  const fmtPct = window.Kalk.fmtPct;
  const fmtEurMo = window.Kalk.fmtEurMo;
  const i = state.kalk || {};

  // Daten aus dem Result + Inputs ableiten
  const cf1 = r.cf[0] || {};
  const cf5 = r.cf[4] || {};
  const cf10 = r.cf[9] || {};
  const v10 = r.vermoegen[10] || {};
  const wert10 = v10.wert || 0;
  const restschuld10 = v10.restschuld || 0;
  const kumCf10 = v10.kumCf || 0;
  const kpQm = r.kaufpreisProQm || 0;
  const marktQm = parseFloat(i.marktwertProQm) || 0;
  const afaJahr = r.afaJahr || 0;
  const afaBemessung = r.afaBemessungBetrag || 0;
  const zinsenJ1 = cf1.zinsenJahr || 0;
  const tilgungJ1 = cf1.tilgungJahr || 0;
  const mvJ1 = (i.mietverwaltung || 0) * 12;
  const hvJ1 = (i.hausverwaltung || 0) * 12;
  const stVorteilJ1 = cf1.stVorteilJahr || 0;
  const stVorteilJ10 = cf10.stVorteilJahr || 0;
  const sparen10 = r.sparen[10] || {};

  const story = (tag, title, body) => `
    <div class="story-card">
      <div class="story-tag">${esc(tag)}</div>
      <h3 class="story-h">${esc(title)}</h3>
      ${body}
    </div>`;

  // Hint-Story falls Marktwert nicht gesetzt — animiert User dazu, ihn auszufüllen.
  const markteinkaufHint = (marktQm <= 0) ? `
    <div class="story-card" style="border:1px dashed var(--border); background: var(--bg-cream-subtle, #fafaf6);">
      <div class="story-tag">01 — Markteinkauf</div>
      <h3 class="story-h">Marktpreis fehlt — Vorteil ist noch nicht sichtbar</h3>
      <p class="story-explain">Sobald in den Stammdaten ein <strong>Marktpreis €/qm</strong> &gt; 0 hinterlegt ist, erscheint hier Dein „Du kaufst unter Marktpreis"-Vorteil ab Tag 1.</p>
    </div>
  ` : '';

  // Markt-Schnitt-Hinweis (Iter 41.9): IS + HD Werte transparent ausweisen
  const isPrice = state.kalk._marktpreisIS;
  const hdPrice = state.kalk._marktpreisHD;
  const marktSrc = state.kalk._marktpreisQuelle;
  const marktQuellenHinweis = (isPrice || hdPrice) ? `
    <div class="text-tertiary text-small" style="margin-top:8px;">
      Markt-Schnitt aus
      ${isPrice ? `<strong>ImmoScout ${Math.round(isPrice).toLocaleString('de-DE')} €/qm</strong>` : 'ImmoScout —'}
      ${' · '}
      ${hdPrice ? `<strong>Homeday ${Math.round(hdPrice).toLocaleString('de-DE')} €/qm</strong>` : 'Homeday —'}
      ${marktSrc === 'schnitt' ? ' (Schnitt beider)' : (marktSrc === 'nur-is' ? ' (nur IS verfügbar)' : (marktSrc === 'nur-hd' ? ' (nur HD verfügbar)' : ''))}
    </div>
  ` : '';

  // QA-Fix 2026-05-22 (Phase-3c K1): bei KP > Markt das Vorzeichen erkennen und Wording
  // umdrehen. Vorher: „Du kaufst unter Marktpreis" mit negativer Zahl — irreführend.
  const _vorteilPositiv = (r.markteinkaufVorteil || 0) > 0;
  const _meHeadline = _vorteilPositiv ? 'Du kaufst unter Marktpreis' : 'Du kaufst über Marktpreis';
  const _meVorteilLabel = _vorteilPositiv ? 'Dein Vorteil Tag 1' : 'Dein Aufschlag Tag 1';
  const _meExplain = _vorteilPositiv
    ? `Du kaufst diese Wohnung für <strong>${Math.round(kpQm).toLocaleString('de-DE')} €/qm</strong>, der Marktpreis liegt bei <strong>${Math.round(marktQm).toLocaleString('de-DE')} €/qm</strong>. Dein Vorteil <strong>steckt im Kaufpreis</strong> und macht Deinen Vermögensaufbau ab Tag 1 belastbar — unabhängig von Wertsteigerung und Mietentwicklung.`
    : `Du kaufst diese Wohnung für <strong>${Math.round(kpQm).toLocaleString('de-DE')} €/qm</strong>, der Marktpreis liegt bei <strong>${Math.round(marktQm).toLocaleString('de-DE')} €/qm</strong> — also <strong>über Markt</strong>. Der Aufschlag muss durch zukünftige Wertentwicklung oder besondere Lage-/Substanz-Vorteile gerechtfertigt sein.`;
  const markteinkauf = (marktQm > 0) ? story('01 — Markteinkauf', _meHeadline, `
    <div class="story-grid">
      <table class="story-table">
        <tr><td>Dein Kaufpreis / qm</td><td class="num">${Math.round(kpQm).toLocaleString('de-DE')} €/qm</td></tr>
        <tr><td>Marktpreis / qm</td><td class="num">${Math.round(marktQm).toLocaleString('de-DE')} €/qm</td></tr>
        <tr><td>Wohnfläche</td><td class="num">${(i.qm || 0).toLocaleString('de-DE')} qm</td></tr>
        <tr><td><strong>${_meVorteilLabel}</strong></td><td class="num ${_vorteilPositiv ? 'pos' : 'neg'}"><strong>${fmt(r.markteinkaufVorteil)}</strong></td></tr>
      </table>
      <div class="story-explain">
        ${_meExplain}
        ${marktQuellenHinweis}
      </div>
    </div>
  `) : '';

  // Iter 41.15 (Audit-Fix #9): Miete-Aufschlüsselung in Story 02
  // QA-Fix 2026-05-23 (Audit-AA-4): davon-Zeilen sind Tag-1-Werte, Total ist
  // Jahres-Mittel inkl. Subv-Glättung. Bei Phase-1 < 12 Mo oder Mietsteigerung
  // in J1 stimmten die Summen nicht überein → Maurice rechnet im Kopf und sieht
  // Drift. Jetzt: Label-Hinweis „Tag-1-Aufschlüsselung" macht Erwartung klar.
  const kaltmieteJ1Mo = i.kaltmiete || 0;
  const stellplatzMieteJ1Mo = i.stellplatzMiete || 0;
  const subvJ1Mo = (Array.isArray(i.subventionPhasen) && i.subventionPhasen[0] && i.subventionPhasen[0].monate >= 1)
    ? i.subventionPhasen[0].mo
    : (i.subventionMo || 0);
  const tag1Sum = kaltmieteJ1Mo + stellplatzMieteJ1Mo + subvJ1Mo;
  const j1Mean = r.mieteJ1Mo || 0;
  const hatDrift = Math.abs(tag1Sum - j1Mean) > 1; // > 1 € Drift → Hinweis zeigen
  const driftHint = hatDrift
    ? ` <span class="text-tertiary text-small" title="Tag-1-Summe ${fmtEurMo(tag1Sum)}/Mo. Total = Jahres-Mittel inkl. Subv-Glättung über Phasen-Monate.">(Tag 1)</span>`
    : '';
  const mieteAufschluesselung = `
    <tr><td>· davon Deine Kaltmiete Wohnung${driftHint}</td><td class="num pos">+ ${fmtEurMo(kaltmieteJ1Mo)}</td></tr>
    ${stellplatzMieteJ1Mo > 0 ? `<tr><td>· davon Deine Stellplatz-/Garagenmiete</td><td class="num pos">+ ${fmtEurMo(stellplatzMieteJ1Mo)}</td></tr>` : ''}
    ${subvJ1Mo > 0 ? `<tr><td>· davon Deine Mietsubvention${(Array.isArray(i.subventionPhasen) && i.subventionPhasen.length >= 2) ? ' (Phase 1)' : ''}</td><td class="num pos">+ ${fmtEurMo(subvJ1Mo)}</td></tr>` : ''}
  `;

  const cashflowHeute = story('02 — Cashflow heute', 'Was Du Monat für Monat einplanst', `
    <div class="story-grid">
      <table class="story-table">
        <thead><tr><th>Position</th><th class="num">€/Monat</th></tr></thead>
        <tr><td><strong>Deine Mieteinnahmen gesamt Jahr 1</strong>${hatDrift ? ' <span class="text-tertiary text-small" title="Jahres-Durchschnitt aus 12 Monaten — Subv-Phasen sind über die Vereinbarungs-Monate geglättet">(Ø Jahres-Mittel)</span>' : ''}</td><td class="num pos"><strong>+ ${fmtEurMo(j1Mean)}</strong></td></tr>
        ${mieteAufschluesselung}
        <tr><td>Deine Annuität an die Bank</td><td class="num neg">− ${fmtEurMo(r.annuityMo || 0)}</td></tr>
        <tr><td>Hausgeld inkl. Rücklage</td><td class="num neg">− ${fmtEurMo(r.hausgeldNurMo || 0)}</td></tr>
        <tr><td>Mietverwaltung (SEV)</td><td class="num neg">− ${fmtEurMo(r.mietverwaltungMo || 0)}</td></tr>
        <tr><td>Hausverwaltung (WEG)</td><td class="num neg">− ${fmtEurMo(r.hausverwaltungMo || 0)}</td></tr>
        <tr><td>Dein Steuervorteil (AfA + Zinsen + MV + HV)</td><td class="num pos">+ ${fmtEurMo(r.stVorteilJ1Mo || 0)}</td></tr>
        <tr class="totalrow"><td><strong>Deine effektive Belastung Jahr 1</strong></td><td class="num"><strong>${fmtEurMo(r.belastungMo)}</strong></td></tr>
      </table>
      <div class="story-explain">
        Die <strong>ehrliche monatliche Zahl</strong>, die Du einplanst (oder die Dir bleibt, wenn positiv).
        ${(() => {
          // Mietsubvention 2-Phasen — Du-Form
          const phasen = Array.isArray(i.subventionPhasen) ? i.subventionPhasen : [];
          if (phasen.length === 0 && !i.subventionMonate) return '';
          const totalEur = r.mietsubventionGesamt || 0;
          const capInfo = state.kalk._subventionCapGreift ? ` <span style="color:var(--badge-mittelphase-fg);">(Maximal-Subvention erreicht — max ${fmt(state.kalk._subventionCapEur)})</span>` : '';
          // Iter 62/63 (20.05.2026): Hinweis-Badges für Vertriebler — Tag-1-Erhöhung
          // und Marktmiete-Cap auf Phase 2. Das macht für den Vertriebler sichtbar,
          // welche Sonderlogik gerade greift, ohne dass er die Backend-Erläuterung
          // entziffern muss.
          const hinweise = [];
          if (state.kalk._subventionTag1Erhoehung) {
            const anhebung = Math.round(state.kalk._subventionTag1Anhebung || 0);
            // Iter 70 (21.05.2026): zwei Quellen unterscheiden — echte Vereinbarung mit
            // Mieter (gepflegt in Stammdaten) vs. Iter-63-Annahme (rechnerisch).
            if (state.kalk._subventionTag1Quelle === 'vereinbarung' && state.kalk._vereinbarung) {
              const v = state.kalk._vereinbarung;
              const datumStr = (() => {
                const d = new Date(v.datum);
                if (isNaN(d.getTime())) return v.datum;
                return `${('0'+d.getDate()).slice(-2)}.${('0'+(d.getMonth()+1)).slice(-2)}.${d.getFullYear()}`;
              })();
              const vorlauf = v.monateBisErhoehung > 1
                ? ` — greift offiziell in ${v.monateBisErhoehung} Mo, in der Kalkulation ab Tag 1`
                : '';
              // Iter 76: Quelle-Suffix zeigen, damit der Vertriebler weiß, woher der Wert kommt.
              const quelleSuffix = v.quelle === 'mietvertrag' ? ' (aus Mietvertrag)'
                : v.quelle === 'stammdaten-override' ? ' (Override in Stammdaten)'
                : '';
              // Iter-Audit (22.05.2026): alte Miete im Badge sichtbar machen — der Sprung
              // wird konkret („von 706 auf 800") statt nur das Ziel zu zeigen.
              const altMiete = Math.round((state.kalk._subventionKaltmieteAdjustiert || 0) - (state.kalk._subventionTag1Anhebung || 0));
              hinweise.push(`<span class="subv-hinweis" style="display:inline-block;background:#d1e7dd;border-left:3px solid #198754;padding:6px 10px;margin-top:6px;color:#0f5132;font-size:13px;">✓ <strong>Vereinbarung mit Mieter${quelleSuffix}:</strong> Erhöhung von ${altMiete} €/Mo auf ${Math.round(state.kalk._subventionKaltmieteAdjustiert || 0)} €/Mo ab ${datumStr} (+${anhebung} €/Mo)${vorlauf}. Danach 2 reguläre Subv-Zyklen (72 Mo).</span>`);
            } else {
              // Iter-Audit (22.05.2026): konkretes Datum + Monatszahl statt vage
              // „> 3 Jahre her" — das echte Vertrags-Datum ist in _letzteMietsteigerung.
              const dRaw = state.kalk._letzteMietsteigerung;
              let dInfo = 'war > 3 Jahre her';
              if (dRaw) {
                const d = new Date(dRaw);
                if (!isNaN(d.getTime())) {
                  const heute = new Date();
                  const mo = (heute.getFullYear() - d.getFullYear()) * 12 + (heute.getMonth() - d.getMonth());
                  const monStr = `${('0'+(d.getMonth()+1)).slice(-2)}/${d.getFullYear()}`;
                  dInfo = `war vor ${mo} Monaten (${monStr})`;
                }
              }
              hinweise.push(`<span class="subv-hinweis" style="display:inline-block;background:#fff3cd;border-left:3px solid #d39e00;padding:6px 10px;margin-top:6px;color:#664d03;font-size:13px;">⚠ <strong>Tag-1-Erhöhung aktiv (rechnerisch):</strong> Die letzte echte Mietsteigerung ${dInfo}. Wir heben den Mieter vor Übergabe um ${anhebung} €/Mo an — Käufer bekommt die schon erhöhte Miete ab Tag 1, danach 2 reguläre Subv-Zyklen (72 Mo).</span>`);
            }
          } else if (state.kalk._vereinbarung && !state.kalk._vereinbarung.anwendbar) {
            // Iter 70: Vereinbarung gepflegt aber wegen Vorlaufzeit/Wert nicht angewendet.
            const v = state.kalk._vereinbarung;
            const datumStr = (() => {
              const d = new Date(v.datum);
              if (isNaN(d.getTime())) return v.datum;
              return `${('0'+d.getDate()).slice(-2)}.${('0'+(d.getMonth()+1)).slice(-2)}.${d.getFullYear()}`;
            })();
            hinweise.push(`<span class="subv-hinweis" style="display:inline-block;background:#e2e3e5;border-left:3px solid #6c757d;padding:6px 10px;margin-top:6px;color:#41464b;font-size:13px;">ℹ <strong>Vereinbarung gepflegt, nicht in Kalkulation:</strong> Erhöhung auf ${Math.round(v.kaltmiete)} €/Mo ab ${datumStr} (${v.monateBisErhoehung} Mo Vorlauf) — wegen langer Vorlaufzeit nicht eingerechnet.</span>`);
          }
          if (state.kalk._subventionMarktCapGreift) {
            // Iter 65 (20.05.2026): Marktmiete als €/qm × qm = €/Mo zur Klarheit
            const mmQm = state.kalk._marktmieteEurQm || 0;
            const mmAbs = state.kalk._marktmieteAbs || 0;
            const qm = i.qm || 0;
            const mmText = (mmQm > 0 && qm > 0)
              ? ` (Marktmiete ${mmQm.toFixed(2).replace('.', ',')} €/qm × ${qm.toFixed(2).replace('.', ',')} qm = ${Math.round(mmAbs)} €/Mo)`
              : (mmAbs > 0 ? ` (Marktmiete ${Math.round(mmAbs)} €/Mo)` : '');
            hinweise.push(`<span class="subv-hinweis" style="display:inline-block;background:#cfe2ff;border-left:3px solid #0d6efd;padding:6px 10px;margin-top:6px;color:#084298;font-size:13px;">ℹ <strong>Marktmiete-Cap auf Phase 2:</strong> Die rechnerische 2. Mieterhöhung würde die Marktmiete überschreiten — wir cappen die Mieter-Erhöhung auf Marktmiete-Niveau${mmText}. Die Käufer-Miete bleibt trotzdem volle 72 Monate konstant.</span>`);
          }
          const hinweisHtml = hinweise.join('<br>');
          if (phasen.length >= 2) {
            const p1 = phasen[0], p2 = phasen[1];
            return `<p><strong>Deine Mietsubvention gesamt: ${fmt(totalEur)}</strong>${capInfo}<br>
              · Phase 1: <strong>${fmtEurMo(p1.mo)}</strong> × ${p1.monate} Mo = ${fmt(p1.mo * p1.monate)}<br>
              · Phase 2: <strong>${fmtEurMo(p2.mo)}</strong> × ${p2.monate} Mo = ${fmt(p2.mo * p2.monate)}<br>
              ${state.kalk._subventionErlaeuterung ? `<span class="text-tertiary text-small">${esc(state.kalk._subventionErlaeuterung)}</span>` : ''}
              ${hinweisHtml}
            </p>`;
          } else if (phasen.length === 1) {
            const p = phasen[0];
            return `<p><strong>Deine Mietsubvention gesamt: ${fmt(totalEur)}</strong>${capInfo}<br>
              · ${esc(p.label || 'Phase 1')}: <strong>${fmtEurMo(p.mo)}</strong> × ${p.monate} Mo<br>
              ${state.kalk._subventionErlaeuterung ? `<span class="text-tertiary text-small">${esc(state.kalk._subventionErlaeuterung)}</span>` : ''}
              ${hinweisHtml}
            </p>`;
          } else {
            return `<p>Mietsubvention <strong>${fmtEurMo(i.subventionMo)}</strong> über <strong>${i.subventionMonate} Monate</strong> — Summe <strong>${fmt(totalEur)}</strong>. Wir fangen Deine Anlaufphase ab.${hinweisHtml ? '<br>' + hinweisHtml : ''}</p>`;
          }
        })()}
        ${(() => {
          if (!r.ersteErhoehungMonat) return '';
          // Iter 78 (21.05.2026): Text fallunterscheiden, sonst widerspricht er sich.
          //   - Bei Tag-1-Erhöhung (Vereinbarung): Text zeigt nicht das alte Datum,
          //     sondern verweist auf die Anhebung im Subv-Hinweis-Badge oberhalb.
          //   - Bei Tag-1-Erhöhung (Iter63-Annahme): Text macht die Logik transparent
          //     („nächste Erhöhung in Mo 36, weil letzte > 3 Jahre her war").
          //   - Standard: wie bisher, aber OHNE Fallback auf _letzteMietsteigerung —
          //     das war Ursache des Bugs „letzte Mietsteigerung: 03/2022" trotz Tag-1-Reset.
          const tag1   = !!state.kalk._subventionTag1Erhoehung;
          const quelle = state.kalk._subventionTag1Quelle;
          const dStr = (raw) => {
            if (!raw) return '';
            const d = new Date(raw);
            return isNaN(d.getTime()) ? '' : `${('0'+(d.getMonth()+1)).slice(-2)}/${d.getFullYear()}`;
          };
          if (tag1 && quelle === 'vereinbarung' && state.kalk._vereinbarung) {
            return `<p>Nach der vereinbarten Anhebung (siehe Hinweis oben) greift die <strong>nächste</strong> Mieterhöhung in <strong>Monat ${r.ersteErhoehungMonat}</strong> (${esc(r.ersteErhoehungJahrLabel)}). Steigerung danach: <strong>${fmtPct(i.steigerungProz)}</strong>.</p>`;
          }
          if (tag1) {
            const altStr = dStr(state.kalk._letzteMietsteigerung);
            const altInfo = altStr ? ` — die letzte echte Mietsteigerung war <strong>${altStr}</strong> (&gt; 3 Jahre her, daher Tag-1-Anhebung angenommen)` : '';
            return `<p>Nach der Tag-1-Anhebung greift die <strong>nächste</strong> Mieterhöhung in <strong>Monat ${r.ersteErhoehungMonat}</strong> (${esc(r.ersteErhoehungJahrLabel)})${altInfo}. Steigerung danach: <strong>${fmtPct(i.steigerungProz)}</strong>.</p>`;
          }
          // Standard-Fall — kein Tag-1-Override aktiv. Datum nur zeigen wenn tatsächlich gesetzt.
          const datumStr = dStr(state.kalk.letzteMietsteigerung);
          const datumLabel = datumStr ? ` (letzte Mieterhöhung: <strong>${datumStr}</strong>)` : '';
          return `<p>Deine erste Mieterhöhung greift in <strong>Monat ${r.ersteErhoehungMonat}</strong> (${esc(r.ersteErhoehungJahrLabel)})${datumLabel}. Steigerung danach: <strong>${fmtPct(i.steigerungProz)}</strong>.</p>`;
        })()}
      </div>
    </div>
  `);

  // Iter 79 (21.05.2026): AfA-Bemessung jetzt inkl. Kaufnebenkosten (steuerrechtlich korrekt
  //   gem. §7 EStG / §6 EStG). Aufschlüsselung in der Tabelle gemacht, damit der Vertriebler
  //   und der Kunde sehen, woraus sich die AfA-Basis ergibt.
  const gebAnteilPct = i.gebaeudeAnteil || 0.85;
  const ankBetrag = r.anschaffungskosten || (r.kpGesamt + r.knk);
  const steuervorteil = story('03 — Dein Steuervorteil', 'AfA + Werbungskosten = Dein Cashflow-Hebel', `
    <div class="story-grid">
      <table class="story-table">
        <tr><td>Kaufpreis (inkl. Stellplatz)</td><td class="num">${fmt(r.kpGesamt)}</td></tr>
        <tr><td>+ Kaufnebenkosten (GrESt + Notar + Grundbuch)</td><td class="num">${fmt(r.knk)}</td></tr>
        <tr><td><strong>= Deine Anschaffungskosten</strong></td><td class="num"><strong>${fmt(ankBetrag)}</strong></td></tr>
        <tr><td>× Gebäude-Anteil ${fmtPct(gebAnteilPct, 0)} (Grund &amp; Boden nicht abnutzbar)</td><td class="num">${fmt(afaBemessung)}</td></tr>
        <tr><td>× AfA-Satz ${fmtPct(i.afaSatz, 2)}</td><td class="num"></td></tr>
        <tr class="totalrow"><td><strong>= Deine AfA pro Jahr (konstant über die Haltedauer)</strong></td><td class="num"><strong>${fmt(afaJahr)}</strong></td></tr>
        <tr><td>+ Zinsen Jahr 1</td><td class="num">${fmt(zinsenJ1)}</td></tr>
        <tr><td>+ Mietverwaltung (SEV) Jahr 1</td><td class="num">${fmt(mvJ1)}</td></tr>
        <tr><td>+ Hausverwaltung (WEG) Jahr 1</td><td class="num">${fmt(hvJ1)}</td></tr>
        <tr><td>Dein Steuersatz</td><td class="num">${fmtPct(i.steuersatz)}</td></tr>
        <tr class="totalrow"><td><strong>Dein Steuervorteil Jahr 1</strong></td><td class="num pos"><strong>${fmt(stVorteilJ1)}</strong></td></tr>
      </table>
      <div class="story-explain">
        <strong>Bemessungsgrundlage der AfA</strong> = Anschaffungskosten = <strong>Kaufpreis + Kaufnebenkosten</strong>, multipliziert mit dem Gebäudeanteil (§7 EStG, §6 EStG). Grund und Boden ist nicht abnutzbar — wird vor der AfA herausgerechnet.<br><br>
        <strong>AfA-Satz frei wählbar</strong> — Standard 2,0 % (lineare AfA §7 Abs. 4 EStG, Wohngebäude bis Baujahr 2022), 3,0 % ab Baujahr 2023 (§7 Abs. 4 Satz 1 Nr. 2a EStG), mit qualifiziertem Restnutzungsdauer-Gutachten typisch 3,0–4,5 % möglich.<br><br>
        <strong>Dein Steuervorteil sinkt über die Jahre</strong>: Zinsen sinken (Annuitäten-Mathematik), Mieten steigen, AfA bleibt konstant. Im Jahr 10: <strong>${fmt(stVorteilJ10)}</strong> (Jahr 1: ${fmt(stVorteilJ1)}).
      </div>
    </div>
  `);

  const dreiHebel = story('04 — Dein Vermögensaufbau', 'Drei Hebel arbeiten für Dich parallel', `
    <div class="stat-trio">
      <div class="stat-item"><div class="stat-lbl">Hebel 1 · Inflation</div><div class="stat-val">${fmtPct(i.wertsteigerung)} p.a.</div></div>
      <div class="stat-item"><div class="stat-lbl">Hebel 2 · Tilgung Jahr 1</div><div class="stat-val">${fmt(tilgungJ1)}</div></div>
      <div class="stat-item"><div class="stat-lbl">Hebel 3 · Markteinkauf</div><div class="stat-val">${fmt(r.markteinkaufVorteil || 0)}</div></div>
    </div>
    <p class="story-explain">Nach 10 Jahren hast Du: <strong>Gesamtvermögen ${fmt(r.vermoegenBrutto10)}</strong> (= Marktwert ${fmt(wert10)} − Restschuld ${fmt(restschuld10)} + Deine kumulierten Cashflows ${fmt(kumCf10)}). Abzüglich Deines eingesetzten Eigenkapitals ${fmt(r.ekBedarf)} bleibt Dir als echter <strong>Vermögenszuwachs ${fmt(r.vermoegenNetto10)}</strong>.</p>
  `);

  const exit10 = story('05 — Dein Exit nach 10 Jahren', 'Du verkaufst steuerfrei (§23 EStG)', `
    <div class="story-grid">
      <table class="story-table">
        <tr><td>Geschätzter Marktwert Jahr 10</td><td class="num">${fmt(wert10)}</td></tr>
        <tr><td>− Deine Restschuld Jahr 10</td><td class="num">− ${fmt(restschuld10)}</td></tr>
        <tr><td><strong>= Dein Verkaufserlös (steuerfrei nach §23)</strong></td><td class="num"><strong>${fmt(wert10 - restschuld10)}</strong></td></tr>
        <tr><td>+ Dein kumulierter Cashflow Jahr 1-10</td><td class="num">${fmt(kumCf10)}</td></tr>
        <tr><td><strong>= Dein Gesamtvermögen nach 10 J.</strong></td><td class="num pos"><strong>${fmt(r.vermoegenBrutto10)}</strong></td></tr>
        <tr><td>− Dein eingesetztes EK</td><td class="num">− ${fmt(r.ekBedarf)}</td></tr>
        <tr class="totalrow"><td><strong>= Dein Vermögenszuwachs (echter Reinerlös)</strong></td><td class="num pos"><strong>${fmt(r.vermoegenNetto10)}</strong></td></tr>
        <tr><td>Deine IRR über 10 Jahre</td><td class="num"><strong>${fmtPct(r.irr)}</strong></td></tr>
      </table>
      <div class="story-explain">
        Nach Ablauf der <strong>Spekulationsfrist (10 Jahre)</strong> ist Dein Veräußerungsgewinn steuerfrei — vorausgesetzt, Du überschreitest die Drei-Objekt-Grenze nicht. Deine <strong>IRR (Eigenkapitalrendite)</strong> zeigt, was Dein eingesetztes Kapital über 10 Jahre wirklich gebracht hat.
      </div>
    </div>
  `);

  const bonStory = story('06 — Dein Bonitätseffekt', 'Was die Bank von Dir hält', `
    <div class="story-grid">
      <table class="story-table">
        <tr><td>Deine Einnahmen / Mo</td><td class="num">+ ${fmtEurMo(r.bonEinnahmen || 0)}</td></tr>
        <tr><td>Deine Ausgaben / Mo</td><td class="num">− ${fmtEurMo(r.bonAusgaben || 0)}</td></tr>
        <tr><td><strong>Dein Saldo vor Kauf</strong></td><td class="num"><strong>${fmtEurMo(r.bonVor || 0)}</strong></td></tr>
        <tr><td>+ Anrechenbare Miete (80 %)</td><td class="num pos">+ ${fmtEurMo(r.bonMieteAnr || 0)}</td></tr>
        <tr><td>− Annuität Bank</td><td class="num neg">− ${fmtEurMo(r.bonAnnuMo || 0)}</td></tr>
        <tr><td><strong>Dein Saldo nach Kauf</strong></td><td class="num"><strong>${fmtEurMo(r.bonNach || 0)}</strong></td></tr>
        <tr><td>Saldo-Delta aus dieser WE</td><td class="num"><strong>${fmtEurMo(r.bonDelta || 0)}</strong></td></tr>
        <tr><td>Dein verfügbares Vermögen</td><td class="num">${fmt(r.bonVermoegen || 0)}</td></tr>
        <tr><td>Dein EK-Bedarf</td><td class="num">${fmt(r.ekBedarf)}</td></tr>
      </table>
      <div class="story-explain">
        Banken rechnen Deine Miete pauschal mit <strong>80 %</strong> an (Leerstands-/Mietausfallreserve). Positives <strong>Saldo nach Kauf</strong> = die Wohnung erhöht Deine Kreditfähigkeit für die nächste WE. Negativ = die Wohnung frisst Deine Bonität.<br><br>
        <strong>Vermögen aus Bank-Sicht:</strong> Nur Deine <em>liquiden oder leicht beleihbaren Werte</em> (Sparbuch, Tagesgeld, Aktien, ETFs, Rückkaufwert LV). Nicht: Dein Eigenheim oder Deine Bestandsimmobilien.
      </div>
    </div>
  `);

  const sparenStory = story('07 — Dein Vergleich · Anlage vs. Immobilie', 'Dein Vermögen läuft mit Immobilie stärker', `
    <div class="story-grid">
      <table class="story-table">
        <tr><td>Dein eingesetztes EK (Tag 0)</td><td class="num">${fmt(r.ekBedarf)}</td></tr>
        <tr><td>Dein EK nur anlegen (Verzinsung ${((state.kalk.sparZins || 0.025) * 100).toFixed(2).replace('.',',')} % p.a., 10 J.)</td><td class="num">${fmt(sparen10.nurSparen || 0)}</td></tr>
        <tr><td>Dein EK in Immobilie (Verkaufserlös + verzinster CF, 10 J.)</td><td class="num pos">${fmt(sparen10.mitImmo || 0)}</td></tr>
        <tr class="totalrow"><td><strong>Dein Vorteil durch die Immobilie</strong></td><td class="num pos"><strong>${fmt(r.sparenVsKaufenDelta)}</strong></td></tr>
      </table>
      <div class="story-explain">
        1:1-Vergleich Deines in die Immobilie eingebrachten EK (= Kaufnebenkosten): Wenn Du es <strong>nur anlegst (${((state.kalk.sparZins || 0.025) * 100).toFixed(2).replace('.',',')} % p.a.)</strong>, hast Du nach 10 J. <strong>${fmt(sparen10.nurSparen || 0)}</strong>. Wenn Du denselben Betrag <strong>als EK in diese Immobilie steckst</strong> (KNK weg, dafür 100 % fremdfinanzierte Wohnung), stehst Du nach 10 J. bei <strong>${fmt(sparen10.mitImmo || 0)}</strong> — Dein Vorteil: <strong>${fmt(r.sparenVsKaufenDelta)}</strong>.<br><br>
        <strong>Wichtig:</strong> Im Immo-Pfad ist das EK als Kaufnebenkosten weg (Grunderwerbsteuer, Notar, Grundbuch). Der Hebel auf den vollen Kaufpreis macht den Unterschied.
      </div>
    </div>
  `);

  // QA-Fix 2026-05-23 (Edgar-Doc Bug-3 R-1): VORHER hier eingebaut, aber
  // renderStories() ist seit Iter 89 tot. Der echte Block lebt jetzt in
  // renderStoryPremium als SECTION_8. Hier nur Stub damit kein leerer Block-
  // Verweis im concat hängt.
  const brotUndButter = story('08 — Nach dem Notartermin (DEPRECATED — siehe renderStoryPremium)', 'Wird nicht mehr aus dieser Funktion gerendert', `
    <div class="story-explain" style="grid-column:1/-1;">
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.55;color:var(--text-primary);">
        Mieterhöhungen, Steuerformulare, Übergaben, Handwerker — das übernehmen wir. Du hast einen WhatsApp-Direktdraht zu uns: für die Fragen, die jetzt schon da sind, und für die, die später kommen.
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-bottom:20px;">
        <div style="padding:14px 16px;background:#FBFAF7;border-left:3px solid #8E6E3D;border-radius:4px;">
          <strong style="display:block;margin-bottom:4px;">Mietsubvention bankentauglich</strong>
          <span class="text-tertiary text-small">Wir richten sie so ein, dass die Bank sie als Einkommen anrechnet — positiver Bonitäts-Effekt für Folge-Käufe.</span>
        </div>
        <div style="padding:14px 16px;background:#FBFAF7;border-left:3px solid #8E6E3D;border-radius:4px;">
          <strong style="display:block;margin-bottom:4px;">Steuereffekt monatlich</strong>
          <span class="text-tertiary text-small">Wir reichen die Lohnsteuerermäßigung beim Finanzamt ein, damit Dein Steuervorteil Monat für Monat direkt auf dem Konto landet — nicht erst nach der Steuererklärung.</span>
        </div>
        <div style="padding:14px 16px;background:#FBFAF7;border-left:3px solid #8E6E3D;border-radius:4px;">
          <strong style="display:block;margin-bottom:4px;">Restnutzungsdauer-Gutachten</strong>
          <span class="text-tertiary text-small">Wir bereiten es so vor, dass es üblicherweise vom Finanzamt anerkannt wird — höhere AfA, mehr Steuervorteil. Letzte Entscheidung trifft das zuständige Finanzamt.</span>
        </div>
        <div style="padding:14px 16px;background:#FBFAF7;border-left:3px solid #8E6E3D;border-radius:4px;">
          <strong style="display:block;margin-bottom:4px;">Übergabe &amp; WEG-Integration</strong>
          <span class="text-tertiary text-small">Wohnungs-Übergabeprotokoll, Ummeldungen Versorger, Mitteilung an die Hausverwaltung — alles in unserer Hand.</span>
        </div>
        <div style="padding:14px 16px;background:#FBFAF7;border-left:3px solid #8E6E3D;border-radius:4px;">
          <strong style="display:block;margin-bottom:4px;">Neuvermietung &amp; Renovierung</strong>
          <span class="text-tertiary text-small">Wenn die Wohnung leer ist: die erste Neuvermietung machen wir umsonst. Bei Renovierung: passende Dienstleister + Angebots-Prüfung.</span>
        </div>
        <div style="padding:14px 16px;background:#EFF6F1;border-left:3px solid #2D6E47;border-radius:4px;">
          <strong style="display:block;margin-bottom:4px;">WhatsApp-Direktdraht</strong>
          <span class="text-tertiary text-small">Eine WhatsApp-Gruppe mit B&amp;B — für Fragen, die jetzt schon da sind, und für die, die später kommen.</span>
        </div>
      </div>
      <p style="margin:0;font-size:13.5px;line-height:1.55;color:var(--text-secondary);background:#F5F2EA;padding:14px 18px;border-radius:4px;">
        <strong>Maßgeschneidert:</strong> Wir betrachten Dein Investment aus 3 Perspektiven — <em>steuerlich, wirtschaftlich, Aufwand</em>. Als Anfänger musst Du keine komplexen Fälle lösen oder Deinem Steuerberater nichts erklären. Als Fortgeschrittener bekommst Du alles in die Hand, was Du selbst steuern willst.
      </p>
    </div>
  `);

  el.innerHTML = (markteinkauf || markteinkaufHint) + cashflowHeute + steuervorteil + dreiHebel + exit10 + bonStory + sparenStory + brotUndButter;
}

/* ============================================================
   Iter 89: Premium-Reduktion Magazin-View (Variante C)
   ============================================================
   Rendert in #story-container den Magazin-Flow:
   Hero · Section 1 (Objekt+Einsatz) · Section 2 (Plan) ·
   Section 3 (Aussicht) · Section 4 (Vergleich) · Section 5
   (Drilldowns mit Modals) · Section 6 (Weg) · Section 7 (B&B).

   Math-Engine wird NICHT angefasst — alle Werte aus r und i.
   Alte renderStories() bleibt im Code als Sicherheits-Anker.
   Aktiviert über renderStoryPremium-Aufruf in recalcAndRender().
   ============================================================ */
let _cMagazinCharts = { belastung: null, vermoegen: null, compare: null };

function renderStoryPremium(r) {
  const el = document.getElementById('story-container');
  if (!el) return;
  const fmt = window.Kalk.fmtEur;
  const fmtPct = window.Kalk.fmtPct;
  const fmtEurMo = window.Kalk.fmtEurMo;
  const i = state.kalk || {};
  const k = state.kunde || {};
  const u = state.user || {};

  // Daten-Anker
  const v10 = r.vermoegen[10] || {};
  const sparen10 = r.sparen[10] || {};
  const kpQm = r.kaufpreisProQm || 0;
  const marktQm = parseFloat(i.marktwertProQm) || 0;
  const heute = new Date().toLocaleDateString('de-DE');

  // Personalisierung
  const displayName = k.name || ((k.vorname || '') + ' ' + (k.nachname || '')).trim() || '—';

  // Adresse-Anker
  const adresseZeile = (state.kalk._projektName ? esc(state.kalk._projektName) + ' · ' : '')
    + (state.kalk._weNr ? 'Wohneinheit ' + esc(state.kalk._weNr) : esc(state.kalk._weLage || ''));

  // Dynamische Texte
  // QA-Fix 2026-05-22 (Audit-E B3): bei crossoverJahr > 10 (z.B. WE 11 über-markt, Crossover
  // erst ab J13) sagte der Text „Ab Jahr 13 dreht ins Plus" — aber der Chart darüber zeigt
  // nur J1-J10. Kunde fragt: „Sind die Zahlen schöngerechnet?" Jetzt: Crossover-Text
  // konditional auf den sichtbaren Horizont.
  // QA-Fix 2026-05-22 (Audit-E E6): bei oszillierendem CF (z.B. WE 1 zwischen +7/+2/+3
  // €/Mo) ist „Ab Jahr 4 dreht ins Plus" semantisch dünn. Robust-Definition: erst dauer-
  // hafter Crossover, wenn das Jahr UND alle Folgejahre im sichtbaren 10-J-Fenster auch
  // positiv sind. Sonst null → „bleibt im negativen Bereich". Falls echter Crossover-Punkt
  // erst später kommt, wird das oben durch crossoverJahr > 10 Branch abgefangen.
  const crossoverIdx = r.cf.findIndex((c, idx) => {
    if (!c || c.cfJahr <= 0) return false;
    const end = Math.min(10, r.cf.length);
    for (let k = idx + 1; k < end; k++) {
      if (!r.cf[k] || r.cf[k].cfJahr <= 0) return false;
    }
    return true;
  });
  const crossoverJahr = crossoverIdx >= 0 ? (crossoverIdx + 1) : null;
  const crossoverSatz = crossoverJahr
    ? (crossoverJahr <= 10
      ? `Ab Jahr <span class="positive">${crossoverJahr}</span> dreht die Belastung ins Plus`
      : `Innerhalb der nächsten 10 Jahre bleibt die Belastung im negativen Bereich — der Crossover folgt voraussichtlich erst um Jahr <span class="positive">${crossoverJahr}</span>`)
    : `Über die 10 Jahre bleibt Deine Belastung im negativen Bereich`;

  // QA-Fix 2026-05-22 (Audit-E B4/B8): wenn findIndex = 0 (vermoegenNetto bereits zum
  // Start positiv, z.B. WE 1 mit Markt > Darlehen+EK), wurde `nettoCrossoverJahr` zu 0
  // → der truthy-Check kippte in den „mehr als 10 Jahre"-Branch, OBWOHL die Vermögens-
  // Tabelle desselben WE J1..J10 alle positiv zeigte. Widerspruch in einer Section.
  // Jetzt: 3 Branches — bereits positiv (idx=0), Crossover in J1-10, oder > J10.
  const nettoCrossoverIdx = r.vermoegen.findIndex(v => v.vermoegenNetto > 0);
  const nettoCrossoverJahr = nettoCrossoverIdx > 0 ? nettoCrossoverIdx : null;
  const nettoPositivAbStart = nettoCrossoverIdx === 0;
  const nettoCrossoverSatz = nettoPositivAbStart
    ? `Dein Nettovermögen ist bereits zum Start positiv — Marktwert übersteigt den Eigenkapital-Einsatz`
    : nettoCrossoverJahr
      ? `Aus zunächst negativem Nettovermögen wird ab Jahr ${nettoCrossoverJahr} der Pfad nach oben sichtbar`
      : `Der Pfad zum positiven Nettovermögen braucht in diesem Profil mehr als 10 Jahre`;

  // Selbsttragung: Wie viel Prozent der gesamten laufenden Kosten
  // (Annuität + HG + HV + MV) deckst Du aus Miete + Steuervorteil?
  // Iter 90: vorher gegen Annuität allein gerechnet → konnte > 100 % zeigen,
  // obwohl Belastung negativ war. Jetzt gegen alle laufenden Kosten.
  const laufendeKostenMo = (r.annuityMo || 0) + (r.hausgeldNurMo || 0)
    + (r.hausverwaltungMo || 0) + (r.mietverwaltungMo || 0);
  const einnahmenMo = (r.mieteJ1Mo || 0) + (r.stVorteilJ1Mo || 0);
  const selbsttragungPct = laufendeKostenMo > 0
    ? Math.min(100, Math.round(einnahmenMo / laufendeKostenMo * 100))
    : 0;

  // QA-Fix 2026-05-22 (Phase-3a K1): KNK-Anzeige zeigt jetzt den echten KNK-Betrag
  // auch bei mitfinanziert (Engine: r.knk). Vorher wurde "0 €" angezeigt, was den
  // realen Kostenblock unsichtbar gemacht hat. Hinweis "(mitfinanziert)" steht am
  // Subtitel (Z.2410, Z.2766 schon korrekt).
  const knk = (r.knk != null && isFinite(r.knk)) ? r.knk : (i.knkMitfinanziert ? 0 : r.ekBedarf);

  // ===== HERO =====
  // QA-Fix 2026-05-22 (Audit-E B6): Hero-Subtitle „im Bestand" war hardcoded — bei
  // Neuvermietung/Staffel (z.B. Wesseling WE 3) erschien trotzdem „im Bestand". Jetzt
  // modus-abhängig aus i.mietsteigerungsModus.
  const _modusHeroSubtitle = (() => {
    const m = i.mietsteigerungsModus || 'sprung';
    if (m === 'staffel') return ', neu vermietet mit Staffelmiete';
    if (m === 'index')   return ' mit Indexmietvertrag';
    if (m === 'keine')   return '';
    return ' im Bestand';
  })();
  const HERO = `
    <header class="kalk-c-hero">
      <div class="kalk-c-hero-top">
        <div class="kalk-c-hero-meta">
          <div><span class="kalk-c-label">Investitionsanalyse</span></div>
          <div>${esc(heute)}</div>
          <div>für ${esc(displayName)}</div>
        </div>
      </div>
      <div class="kalk-c-hero-body">
        <div class="kalk-c-hero-address">${adresseZeile}</div>
        <h1 class="kalk-c-hero-headline">
          In zehn Jahren baust Du nach unserer Rechnung <span class="kalk-c-num-accent">${fmt(r.vermoegenNetto10)}</span> Nettovermögen auf.
        </h1>
        <p class="kalk-c-hero-sub">
          ${i.qm ? 'Eine ' + i.qm.toString().replace('.', ',') + '-qm-Wohnung' : 'Eine Wohnung'}${_modusHeroSubtitle}. Die folgende Analyse zeigt Deinen Vermögensaufbau, Deine monatliche Belastung und den Vergleich zur klassischen Sparbuch-Alternative.
        </p>
        <div class="kalk-c-hero-strip">
          <div class="kalk-c-strip-cell">
            <div class="kalk-c-strip-label">Wohnfläche</div>
            <div class="kalk-c-strip-value">${(i.qm || 0).toLocaleString('de-DE')}<span class="kalk-c-unit">qm</span></div>
          </div>
          <div class="kalk-c-strip-cell">
            <div class="kalk-c-strip-label">Gesamtinvestition</div>
            <div class="kalk-c-strip-value">${Math.round(r.kpGesamt).toLocaleString('de-DE')}<span class="kalk-c-unit">€</span></div>
          </div>
          <div class="kalk-c-strip-cell">
            <div class="kalk-c-strip-label">Miete kalt</div>
            <div class="kalk-c-strip-value">${Math.round(r.mieteJ1Mo || 0).toLocaleString('de-DE')}<span class="kalk-c-unit">€/Mo</span></div>
          </div>
        </div>
        <!-- QA-Fix 2026-05-22 (Audit-G G-B2): PDF/Snapshot Quick-Actions direkt im Hero,
             damit der Vertriebler nicht 9× zur Section 5 scrollen muss. -->
        <div class="kalk-c-hero-actions" style="margin-top:32px;display:flex;gap:12px;flex-wrap:wrap;">
          <button type="button" onclick="openInvestDocModal()" style="background:var(--accent-dark);color:#fff;border:none;font-family:inherit;font-size:13px;letter-spacing:.06em;padding:11px 22px;border-radius:22px;cursor:pointer;font-weight:500;">Investitions-Doc</button>
          <button type="button" onclick="saveSnapshot()" style="background:transparent;color:var(--text-primary);border:1px solid var(--border);font-family:inherit;font-size:13px;letter-spacing:.06em;padding:11px 22px;border-radius:22px;cursor:pointer;font-weight:500;">Snapshot speichern</button>
        </div>
      </div>
    </header>
    <hr class="kalk-c-rule" />
  `;

  // ===== SECTION 1 · Objekt + Einsatz =====
  const SECTION_1 = `
    <section class="kalk-c-section">
      <div class="kalk-c-section-head">
        <div class="kalk-c-left">
          <div class="kalk-c-section-num">01 · Das Objekt</div>
          <h2 class="kalk-c-section-title">Eckdaten und Markt-Anker.</h2>
        </div>
        <div class="kalk-c-right">
          Bestandswohnung in vermarktungsfähigem Zustand. Verkaufsmiete, Hausgeld und Verwaltungs-Setup sind unten aufgeschlüsselt — der Markt-Anker zeigt den Einkaufsvorteil zu Tag 1.
        </div>
      </div>
      <div class="kalk-c-objekt-list">
        <div>
          <div class="kalk-c-objekt-row"><span class="kalk-c-k">Adresse</span><span class="kalk-c-v">${esc(state.kalk._projektName || state.kalk._weLage || '—')}</span></div>
          <div class="kalk-c-objekt-row"><span class="kalk-c-k">Wohneinheit</span><span class="kalk-c-v">${esc(state.kalk._weNr || '—')}</span></div>
          <div class="kalk-c-objekt-row"><span class="kalk-c-k">Wohnfläche</span><span class="kalk-c-v">${(i.qm || 0).toLocaleString('de-DE')}<span class="kalk-c-unit">qm</span></span></div>
          <div class="kalk-c-objekt-row"><span class="kalk-c-k">Kaufpreis Wohnung</span><span class="kalk-c-v">${Math.round(i.kaufpreis || 0).toLocaleString('de-DE')}<span class="kalk-c-unit">€</span></span></div>
          <div class="kalk-c-objekt-row"><span class="kalk-c-k">Stellplatz</span><span class="kalk-c-v">${Math.round(i.stellplatzKp || 0).toLocaleString('de-DE')}<span class="kalk-c-unit">€</span></span></div>
        </div>
        <div>
          <div class="kalk-c-objekt-row"><span class="kalk-c-k">Kaufpreis je qm</span><span class="kalk-c-v">${Math.round(kpQm).toLocaleString('de-DE')}<span class="kalk-c-unit">€</span></span></div>
          <div class="kalk-c-objekt-row" title="${(() => {
            const is = state.kalk._marktpreisIS;
            const hd = state.kalk._marktpreisHD;
            const src = state.kalk._marktpreisQuelle;
            const parts = [];
            if (is) parts.push('ImmoScout: ' + Math.round(is).toLocaleString('de-DE') + ' €/qm');
            if (hd) parts.push('Homeday: ' + Math.round(hd).toLocaleString('de-DE') + ' €/qm');
            const srcText = src === 'schnitt' ? ' · Anzeige: Schnitt beider' : src === 'nur-is' ? ' · Anzeige: nur ImmoScout' : src === 'nur-hd' ? ' · Anzeige: nur Homeday' : '';
            return parts.length ? parts.join(' · ') + srcText : 'Marktpreis aus Stammdaten';
          })()}"><span class="kalk-c-k">Marktpreis je qm</span><span class="kalk-c-v">${marktQm > 0 ? Math.round(marktQm).toLocaleString('de-DE') : '—'}<span class="kalk-c-unit">€</span></span></div>
          ${r.markteinkaufVorteil ? `<div class="kalk-c-objekt-row"><span class="kalk-c-k">${r.markteinkaufVorteil > 0 ? 'Markteinkauf-Vorteil' : 'Markt-Aufschlag'}</span><span class="kalk-c-v ${r.markteinkaufVorteil > 0 ? '' : 'kalk-c-neg'}">${fmt(Math.abs(r.markteinkaufVorteil))}${r.markteinkaufVorteil > 0 ? '' : ' über Markt'}</span></div>` : ''}
          <div class="kalk-c-objekt-row"><span class="kalk-c-k">Kaltmiete</span><span class="kalk-c-v">${Math.round(i.kaltmiete || 0).toLocaleString('de-DE')}<span class="kalk-c-unit">€/Mo</span></span></div>
          <div class="kalk-c-objekt-row"><span class="kalk-c-k">Stellplatz-Miete</span><span class="kalk-c-v">${Math.round(i.stellplatzMiete || 0).toLocaleString('de-DE')}<span class="kalk-c-unit">€/Mo</span></span></div>
          <div class="kalk-c-objekt-row"><span class="kalk-c-k">Hausgeld · HV · MV</span><span class="kalk-c-v">${Math.round(i.hausgeld || 0)} / ${Math.round(i.hausverwaltung || 0)} / ${Math.round(i.mietverwaltung || 0)}<span class="kalk-c-unit">€/Mo</span></span></div>
        </div>
      </div>
      <div class="kalk-c-einsatz-block">
        <div class="kalk-c-einsatz-head">Was Du beim Notar bezahlst</div>
        <div class="kalk-c-einsatz-grid">
          <div class="kalk-c-einsatz-cell">
            <div class="kalk-c-einsatz-label">Kaufpreis gesamt</div>
            <div class="kalk-c-einsatz-value">${Math.round(r.kpGesamt).toLocaleString('de-DE')}<span class="kalk-c-unit">€</span></div>
            <div class="kalk-c-einsatz-sub">über das Darlehen finanziert</div>
          </div>
          <div class="kalk-c-einsatz-cell">
            <div class="kalk-c-einsatz-label">Kaufnebenkosten</div>
            <div class="kalk-c-einsatz-value">${Math.round(knk).toLocaleString('de-DE')}<span class="kalk-c-unit">€</span></div>
            <div class="kalk-c-einsatz-sub">Grunderwerbsteuer · Notar · Grundbuch${i.knkMitfinanziert ? ' (mitfinanziert)' : ''}</div>
          </div>
          <div class="kalk-c-einsatz-cell">
            <div class="kalk-c-einsatz-label">Dein Eigenkapital-Einsatz</div>
            <div class="kalk-c-einsatz-value kalk-c-accent-color">${Math.round(r.ekBedarf).toLocaleString('de-DE')}<span class="kalk-c-unit">€</span></div>
            <div class="kalk-c-einsatz-sub">${i.knkMitfinanziert ? 'KNK ist im Darlehen enthalten' : 'deckt die Nebenkosten · Kaufpreis voll finanziert'}</div>
          </div>
        </div>
        <p class="kalk-c-einsatz-note">
          Die Kaufnebenkosten — Grunderwerbsteuer, Notar, Grundbuch — fallen einmalig an. Sie gehen nicht in den Marktwert ein und kommen beim späteren Verkauf nicht zurück.
        </p>
      </div>

      ${(r.mietsubventionGesamt && r.mietsubventionGesamt > 0) ? `
      <div class="kalk-c-einsatz-block" style="margin-top:24px;background:var(--positive-bg);">
        <div class="kalk-c-einsatz-head">Mietsubvention vom Verkäufer (B&amp;B)</div>
        <div class="kalk-c-einsatz-grid">
          <div class="kalk-c-einsatz-cell">
            <div class="kalk-c-einsatz-label">Subvention gesamt</div>
            <div class="kalk-c-einsatz-value kalk-c-accent-color">${Math.round(r.mietsubventionGesamt).toLocaleString('de-DE')}<span class="kalk-c-unit">€</span></div>
            <div class="kalk-c-einsatz-sub">${(() => {
              const p = Array.isArray(i.subventionPhasen) ? i.subventionPhasen : [];
              if (p.length >= 2) return `${p[0].monate} + ${p[1].monate} Mo (2 Phasen)`;
              if (p.length === 1) return `${p[0].monate} Mo`;
              if (i.subventionMonate) return `${i.subventionMonate} Mo`;
              return 'wirkt in der Anlaufphase';
            })()}</div>
          </div>
          ${(() => {
            const p = Array.isArray(i.subventionPhasen) ? i.subventionPhasen : [];
            if (p.length >= 2) {
              return `
                <div class="kalk-c-einsatz-cell">
                  <div class="kalk-c-einsatz-label">Phase 1</div>
                  <div class="kalk-c-einsatz-value">${Math.round(p[0].mo).toLocaleString('de-DE')}<span class="kalk-c-unit">€/Mo</span></div>
                  <div class="kalk-c-einsatz-sub">${p[0].monate} Monate · sichert die Anlaufphase</div>
                </div>
                <div class="kalk-c-einsatz-cell">
                  <div class="kalk-c-einsatz-label">Phase 2</div>
                  <div class="kalk-c-einsatz-value">${Math.round(p[1].mo).toLocaleString('de-DE')}<span class="kalk-c-unit">€/Mo</span></div>
                  <div class="kalk-c-einsatz-sub">${p[1].monate} Monate · Übergang zur Marktmiete</div>
                </div>`;
            } else if (p.length === 1) {
              return `
                <div class="kalk-c-einsatz-cell">
                  <div class="kalk-c-einsatz-label">Pro Monat</div>
                  <div class="kalk-c-einsatz-value">${Math.round(p[0].mo).toLocaleString('de-DE')}<span class="kalk-c-unit">€/Mo</span></div>
                  <div class="kalk-c-einsatz-sub">${p[0].monate} Monate · sichert die Anlaufphase</div>
                </div>
                <div class="kalk-c-einsatz-cell"></div>`;
            } else if (i.subventionMo > 0) {
              return `
                <div class="kalk-c-einsatz-cell">
                  <div class="kalk-c-einsatz-label">Pro Monat</div>
                  <div class="kalk-c-einsatz-value">${Math.round(i.subventionMo).toLocaleString('de-DE')}<span class="kalk-c-unit">€/Mo</span></div>
                  <div class="kalk-c-einsatz-sub">${i.subventionMonate || 0} Monate</div>
                </div>
                <div class="kalk-c-einsatz-cell"></div>`;
            }
            return '<div class="kalk-c-einsatz-cell"></div><div class="kalk-c-einsatz-cell"></div>';
          })()}
        </div>
        <p class="kalk-c-einsatz-note">
          Die Mietsubvention ist Teil unseres Brot-&amp;-Butter-Konzepts: Wir fangen Deine Anlaufphase ab und glätten die Belastung über die ersten Jahre. Sie ist in den Cashflow-Werten unten bereits enthalten — und wird für die Bank wie Miete angerechnet.
        </p>
      </div>` : ''}
    </section>
    <hr class="kalk-c-rule" />
  `;

  // ===== SECTION 2 · Der Plan =====
  // QA-Fix 2026-05-22 (Phase-3c W): Chart-Caption-Mietsteigerungs-Modus dynamisch
  // statt hardcoded "Mietsprünge alle 3 Jahre" (war bei Staffel/Index/Leerstand falsch).
  const _modus = i.mietsteigerungsModus || 'sprung';
  const _modusCaption = _modus === 'staffel' ? 'Staffelmiete jährlich'
    : _modus === 'index' ? 'Indexmiete jährlich'
    : _modus === 'keine' ? 'Miete konstant'
    : 'Mietsprünge alle 3 Jahre';
  const SECTION_2 = `
    <section class="kalk-c-section">
      <div class="kalk-c-section-head">
        <div class="kalk-c-left">
          <div class="kalk-c-section-num">02 · Die nächsten zehn Jahre</div>
          <h2 class="kalk-c-section-title">Effektive Belastung im ersten Jahr: ${fmtEurMo(r.belastungMo)}.</h2>
        </div>
        <div class="kalk-c-right">
          ${r.belastungMo >= 0
            ? 'Die Wohnung trägt sich bereits ab Tag 1 vollständig selbst. Was bleibt, ist ein monatlicher Überschuss.'
            : (selbsttragungPct >= 95
              ? `Die Wohnung trägt sich zu rund ${selbsttragungPct} % selbst — die fehlenden ${100 - selbsttragungPct} % leistest Du als monatliche Eigenleistung von ${fmtEurMo(Math.abs(r.belastungMo))}, die mit jedem Jahr kleiner wird.`
              : 'Die Wohnung trägt einen Teil der laufenden Kosten selbst. Die verbleibende monatliche Eigenleistung schrumpft Jahr für Jahr durch Mietsteigerung und Tilgung.')}
        </div>
      </div>
      <div class="kalk-c-two-col">
        <div class="kalk-c-col-chart">
          <div class="kalk-c-chart-frame"><canvas id="chart-c-belastung"></canvas></div>
          <div class="kalk-c-chart-caption">Cashflow nach Steuern, je Monat · Annuität konstant · ${_modusCaption}</div>
        </div>
        <div class="kalk-c-col-text">
          <p class="kalk-c-lead">Eine Annuität von ${fmtEurMo(r.annuityMo)} steht Mieteinnahmen von ${fmtEurMo(r.mieteJ1Mo)} gegenüber. Dein Steuervorteil${(r.mietsubventionGesamt && r.mietsubventionGesamt > 0) ? ' und in den ersten Jahren eine vereinbarte Mietsubvention glätten' : ' glättet'} die Anlaufphase.</p>
          <p>${r.belastungMo >= 0
            ? `Die Wohnung trägt sich bereits ab Tag 1 vollständig selbst — Miete und Steuervorteil decken alle laufenden Kosten und liefern einen monatlichen Überschuss von ${fmtEurMo(r.belastungMo)}.`
            : `Die Wohnung trägt sich zu rund ${selbsttragungPct} % selbst — Miete plus Steuervorteil decken den Großteil der laufenden Kosten (Annuität + Hausgeld + Verwaltung). Den Rest leistest Du als monatliche Eigenleistung.`}</p>
          ${r.belastungMo < 0 ? `<p>${crossoverSatz}: Die Wohnung beginnt, einen monatlichen Überschuss zu liefern, während Deine Annuität konstant bleibt.</p>` : ''}
          <div class="kalk-c-meta-line">Annuität ${fmtEurMo(r.annuityMo)} · Steuervorteil ${fmtEurMo(r.stVorteilJ1Mo)}</div>
        </div>
      </div>
    </section>
    <hr class="kalk-c-rule" />
  `;

  // ===== SECTION 3 · Aussicht =====
  // Iter 90: bei 110%-Finanzierung (EK=0) IRR nicht zeigen — mathematisch undefiniert.
  const ekIstNull = !r.ekBedarf || r.ekBedarf <= 100;
  const ekHeadline = ekIstNull
    ? `In zehn Jahren baust Du <span style="color:var(--accent-dark)">${fmt(r.vermoegenNetto10)}</span> Nettovermögen auf — ohne Eigenkapital-Einsatz.`
    : `Aus ${fmt(r.ekBedarf)} Eigenkapital werden ${fmt(r.vermoegenNetto10)} Nettovermögen.`;
  const renditeSatz = ekIstNull
    ? `Da Du kein eigenes Kapital einsetzt, gibt es keine klassische Eigenkapital-Rendite — der gesamte Vermögenszuwachs entsteht aus Restschuld-Abbau und Wertsteigerung.`
    : `Dein Nettowert — Marktwert abzüglich Restschuld und kumulierter Eigenleistung — erreicht im Jahr 10 die genannten ${fmt(r.vermoegenNetto10)}. Das ist nach 10 Jahren ein interner Zinsfuß von <strong>${fmtPct(r.irr)}</strong>.`;
  // QA-Fix 2026-05-22 (Audit-F B-1): „Brutto-Vermögen J10" und PDF-„Markt-Vermögen J10"
  // zeigten unter ähnlich klingenden Labels verschiedene Größen — Magazin: Eigenanteil
  // (verkaufserloes + kumCf), PDF: Bruttomarktwert (= v10.wert). Diff 124-294k €.
  // Klare Labels: „Mein Anteil J10" (= vermoegenBrutto) vs. „Marktwert J10" (= v10.wert).
  const metaLine3 = ekIstNull
    ? `Mein Anteil J10 · ${fmt(v10.vermoegenBrutto || (v10.wert - v10.restschuld))} &nbsp;·&nbsp; ohne EK-Einsatz`
    : `IRR 10 J · ${fmtPct(r.irr)} &nbsp;·&nbsp; Mein Anteil J10 · ${fmt(v10.vermoegenBrutto || (v10.wert - v10.restschuld))}`;
  const SECTION_3 = `
    <section class="kalk-c-section">
      <div class="kalk-c-section-head">
        <div class="kalk-c-left">
          <div class="kalk-c-section-num">03 · Vermögenszuwachs</div>
          <h2 class="kalk-c-section-title">${ekHeadline}</h2>
        </div>
        <div class="kalk-c-right">
          Dein Vermögensaufbau speist sich aus zwei Quellen: dem laufenden Tilgungsanteil Deiner Annuität und einer moderat gerechneten Wertsteigerung des Sachwerts.
        </div>
      </div>
      <div class="kalk-c-two-col kalk-c-reverse">
        <div class="kalk-c-col-text">
          <p class="kalk-c-lead">${nettoCrossoverSatz} — getragen von zwei Kräften: Restschuld-Abbau und Wertentwicklung.</p>
          <p>Der Bruttomarktwert Deiner Wohnung wächst nach konservativer Rechnung auf rund ${fmt(v10.wert)} im Jahr 10. Parallel sinkt Deine Restschuld auf ${fmt(v10.restschuld)}.</p>
          <p>${renditeSatz}</p>
          <div class="kalk-c-meta-line">${metaLine3}</div>
        </div>
        <div class="kalk-c-col-chart">
          <div class="kalk-c-chart-frame"><canvas id="chart-c-vermoegen-magazin"></canvas></div>
          <div class="kalk-c-chart-caption">Nettovermögen kumuliert · Wertsteigerung ${fmtPct(i.wertsteigerung || 0.03)} p.a.</div>
          <div class="kalk-c-vermoegen-toggle" style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
            <button type="button" data-vermoegen-line="restschuld" aria-pressed="false" style="background:transparent;border:1px solid var(--border);color:var(--text-tertiary);font-family:inherit;font-size:11px;letter-spacing:.04em;padding:6px 12px;border-radius:14px;cursor:pointer;transition:all .15s ease">+ Restschuld einblenden</button>
            <button type="button" data-vermoegen-line="brutto" aria-pressed="false" style="background:transparent;border:1px solid var(--border);color:var(--text-tertiary);font-family:inherit;font-size:11px;letter-spacing:.04em;padding:6px 12px;border-radius:14px;cursor:pointer;transition:all .15s ease">+ Immobilienwert einblenden</button>
          </div>
        </div>
      </div>
    </section>
    <hr class="kalk-c-rule" />
  `;

  // ===== SECTION 4 · Vergleich =====
  // Iter 90: bei 110%-Finanzierung (EK=0) den Sparbuch-Vergleich umformulieren —
  // "0 € auf 0 € gewachsen" macht keinen Sinn. Stattdessen die reine Sachwert-Story.
  const SECTION_4 = ekIstNull ? `
    <section class="kalk-c-section">
      <div class="kalk-c-section-head" style="justify-content:center;text-align:center;flex-direction:column;align-items:center;gap:0;margin-bottom:48px">
        <div class="kalk-c-left" style="text-align:center">
          <div class="kalk-c-section-num">04 · Der Hebel</div>
          <h2 class="kalk-c-section-title" style="max-width:24ch;margin:14px auto 0">Ohne Eigenkapital-Einsatz zum Sachwert.</h2>
        </div>
      </div>
      <div class="kalk-c-compare">
        <div class="kalk-c-compare-headline"><span class="kalk-c-delta">${fmt(r.vermoegenNetto10)}</span> &nbsp;Vermögensaufbau</div>
        <div class="kalk-c-compare-sub">Bei 110-%-Finanzierung setzt Du kein eigenes Kapital ein. Trotzdem baust Du in 10 Jahren ${fmt(r.vermoegenNetto10)} Nettovermögen auf — getragen von Tilgung und Wertentwicklung. Der Hebel kommt aus dem Sachwert, nicht aus Deinem Sparbuch.<br><br><em style="font-size:13px;color:var(--text-tertiary)">Ein klassischer Sparbuch-Vergleich entfällt: ohne Eigenkapital-Einsatz wäre auch das Sparbuch-Ergebnis 0 €. Die Belastung über die Laufzeit ist Deine einzige Eigenleistung.</em></div>
      </div>
    </section>
    <hr class="kalk-c-rule" />
  ` : `
    <section class="kalk-c-section">
      <div class="kalk-c-section-head" style="justify-content:center;text-align:center;flex-direction:column;align-items:center;gap:0;margin-bottom:48px">
        <div class="kalk-c-left" style="text-align:center">
          <div class="kalk-c-section-num">04 · Die Alternative</div>
          <h2 class="kalk-c-section-title" style="max-width:24ch;margin:14px auto 0">Wäre Dein Eigenkapital auf einem Sparbuch geblieben.</h2>
        </div>
      </div>
      <div class="kalk-c-compare">
        <div class="kalk-c-compare-headline">+ <span class="kalk-c-delta">${fmt(r.sparenVsKaufenDelta)}</span> &nbsp;Mehrgewinn</div>
        <div class="kalk-c-compare-sub">${fmt(r.ekBedarf)} auf einem Sparbuch zu ${((state.kalk.sparZins || 0.025) * 100).toFixed(2).replace('.',',')} % p.a. wären in zehn Jahren auf etwa ${fmt(sparen10.nurSparen)} gewachsen. Dasselbe Eigenkapital im Sachwert Immobilie kommt auf ${fmt(sparen10.mitImmo)} — die Differenz von ${fmt(r.sparenVsKaufenDelta)} ist der reine Sachwert-Vorteil.</div>
        <div class="kalk-c-compare-chart-wrap"><canvas id="chart-c-compare"></canvas></div>
      </div>
    </section>
    <hr class="kalk-c-rule" />
  `;

  // ===== SECTION 5 · Drilldowns (Trigger) =====
  const SECTION_5 = `
    <section class="kalk-c-drill-section">
      <div class="kalk-c-drill-head">
        <div class="kalk-c-section-num">05 · Detail</div>
        <h2>Wenn Du tiefer schauen willst.</h2>
        <p>Du kannst jeden Wert dieser Analyse nachvollziehen — Cashflow-Reihen, Vermögensaufstellung, Bonität nach Erwerb und alle Rechen-Annahmen.</p>
      </div>
      <div class="kalk-c-drill-links">
        <button type="button" class="kalk-c-drill-link" data-kalk-c-modal="bonitaet">Bonitäts-Saldo<span class="kalk-c-arrow">Vor &amp; nach Erwerb</span></button>
        <button type="button" class="kalk-c-drill-link" data-kalk-c-modal="cashflow">Cashflow J1–J10<span class="kalk-c-arrow">Monat · Jahr</span></button>
        <button type="button" class="kalk-c-drill-link" data-kalk-c-modal="vermoegen">Vermögen J1–J10<span class="kalk-c-arrow">Brutto · netto</span></button>
        <button type="button" class="kalk-c-drill-link" data-kalk-c-modal="annahmen">Annahmen<span class="kalk-c-arrow">Parameter &amp; Disclaimer</span></button>
      </div>
    </section>
    <hr class="kalk-c-rule" />
  `;

  // ===== SECTION 6 · Der Weg =====
  const SECTION_6 = `
    <section class="kalk-c-section">
      <div class="kalk-c-section-head">
        <div class="kalk-c-left">
          <div class="kalk-c-section-num">07 · Wie es weitergeht</div>
          <h2 class="kalk-c-section-title">Sechs Schritte bis zum Notartermin.</h2>
        </div>
        <div class="kalk-c-right">
          Wir beurkunden den Kauf erst dann, wenn drei Voraussetzungen sauber erfüllt sind: Deine Finanzierung steht, die Objektunterlagen passen zu dem, was Du hier siehst, und Du hast die Wohnung besichtigt. Fehlt einer dieser Punkte — kein Notartermin.
        </div>
      </div>
      <ol class="kalk-c-weg-list">
        <li class="kalk-c-weg-step"><div class="kalk-c-weg-num">1</div><div class="kalk-c-weg-body"><div class="kalk-c-weg-title">Selbstauskunft vollständig ausfüllen</div><div class="kalk-c-weg-desc">Bonität-Grundlage für die Bank — wir helfen Dir durch jedes Feld. Dauert in der Regel 20–30 Minuten.</div></div></li>
        <li class="kalk-c-weg-step"><div class="kalk-c-weg-num">2</div><div class="kalk-c-weg-body"><div class="kalk-c-weg-title">Wohneinheit sichern</div><div class="kalk-c-weg-desc">Reservierung. Wir verkaufen Wohnungen mit Markteinkauf-Vorteil — die Reservierung schützt Dich davor, dass eine andere Interessenten-Anfrage Dich überholt, während Du die nächsten Schritte gehst.</div></div></li>
        <li class="kalk-c-weg-step"><div class="kalk-c-weg-num">3</div><div class="kalk-c-weg-body"><div class="kalk-c-weg-title">Objektunterlagen prüfen</div><div class="kalk-c-weg-desc">Du bekommst Teilungserklärung, Protokolle, Wirtschaftsplan, Energieausweis. Damit prüfst Du selbst — oder mit Deinem Berater — dass die Unterlagen exakt das wiedergeben, was wir Dir hier gezeigt haben.</div></div></li>
        <li class="kalk-c-weg-step"><div class="kalk-c-weg-num">4</div><div class="kalk-c-weg-body"><div class="kalk-c-weg-title">Finanzierungszusage erhalten</div><div class="kalk-c-weg-desc">Mit der vollständigen Selbstauskunft und den Objektunterlagen geht es zur Bank. Sobald die schriftliche Finanzierungszusage da ist, schaltet die nächste Stufe frei.</div></div></li>
        <li class="kalk-c-weg-step"><div class="kalk-c-weg-num">5</div><div class="kalk-c-weg-body"><div class="kalk-c-weg-title">Besichtigung vor Ort</div><div class="kalk-c-weg-desc">Du siehst die Wohnung mit eigenen Augen — Lage, Substanz, Treppenhaus, Umfeld. Erst wenn das passt, machen wir den letzten Schritt.</div></div></li>
        <li class="kalk-c-weg-step"><div class="kalk-c-weg-num">6</div><div class="kalk-c-weg-body"><div class="kalk-c-weg-title">Notartermin</div><div class="kalk-c-weg-desc">Beurkundung des Kaufvertrags. Wir beurkunden nur, wenn die drei Voraussetzungen Finanzierung, Objektunterlagen und Besichtigung sauber erfüllt sind.</div></div></li>
      </ol>
    </section>
    <hr class="kalk-c-rule" />
  `;

  // ===== SECTION 7 · Brot & Butter =====
  const SECTION_7 = `
    <section class="kalk-c-section kalk-c-bub-section">
      <div class="kalk-c-section-head">
        <div class="kalk-c-left">
          <div class="kalk-c-section-num">09 · Wer wir sind</div>
          <h2 class="kalk-c-section-title">Brot &amp; Butter.</h2>
        </div>
        <div class="kalk-c-right">
          Unser Name ist unser Geschäftsmodell. Wir kaufen die großen Brote und veredeln sie mit Butter — bevor wir scheibenweise an Dich weitergeben.
        </div>
      </div>
      <div class="kalk-c-bub-grid">
        <div class="kalk-c-bub-cell"><div class="kalk-c-bub-step">Brot kaufen</div><div class="kalk-c-bub-body">Wir kaufen bei großen Immobiliengesellschaften ganze Bestände — zu Volumen-Preisen, die für Einzelkäufer nie sichtbar werden.</div></div>
        <div class="kalk-c-bub-cell"><div class="kalk-c-bub-step">Butter veredeln</div><div class="kalk-c-bub-body">Bevor eine Wohnung zu Dir kommt: Hausverwaltungs-Wechsel, Rücklage-Prüfung, Substanz-Check, notwendige Maßnahmen. Veredelung vor Weitergabe.</div></div>
        <div class="kalk-c-bub-cell"><div class="kalk-c-bub-step">Scheibenweise weitergeben</div><div class="kalk-c-bub-body">Aus dem Bestand werden einzelne Wohnungen — portionsgerecht für Privatanleger. So machen wir den Sachwert zugänglich.</div></div>
      </div>
      <div class="kalk-c-bub-foot">
        <div class="kalk-c-bub-foot-item"><strong>Keine zusätzliche Vermittlungs-Provision.</strong> Du zahlst keinen Aufschlag oben drauf. Unsere Marge kalkulieren wir transparent in den Einkaufs-Verkauf-Spread — auf Wunsch erklären wir Dir das Modell konkret im Termin.</div>
        <div class="kalk-c-bub-foot-item"><strong>Eigeninvestments.</strong> Die Gesellschafter behalten regelmäßig Einheiten im Privatbestand. Konkrete Beispiele aus den letzten Quartalen zeigen wir gerne im persönlichen Termin.</div>
      </div>
    </section>
  `;

  // ===== SECTION_8 — Nach dem Notartermin (Edgar-Doc Bug-3 R-1) =====
  // Edgar's Vorgabe: Käufer soll wissen, dass er nach Notar nicht alleine
  // dasteht. Was B&B konkret für ihn übernimmt — minimalistisch, einfach,
  // visuell. Re-uses kalk-c-section + kalk-c-bub-grid Klassen für Konsistenz
  // mit SECTION_7 (Brot & Butter Konzept).
  const SECTION_8 = `
    <section class="kalk-c-section kalk-c-bub-section">
      <div class="kalk-c-section-head">
        <div class="kalk-c-left">
          <div class="kalk-c-section-num">08 · Nach dem Notartermin</div>
          <h2 class="kalk-c-section-title">Du stehst nicht alleine da.</h2>
        </div>
        <div class="kalk-c-right">
          Mieterhöhungen, Steuerformulare, Übergaben, Handwerker — das übernehmen wir. Du hast einen WhatsApp-Direktdraht zu uns: für die Fragen, die jetzt schon da sind, und für die, die später kommen.
        </div>
      </div>
      <div class="kalk-c-bub-grid" style="grid-template-columns:repeat(3,1fr);">
        <div class="kalk-c-bub-cell">
          <div class="kalk-c-bub-step">Mietsubvention bankentauglich</div>
          <div class="kalk-c-bub-body">Wir richten sie so ein, dass die Bank sie als Einkommen anrechnet — positiver Bonitäts-Effekt für Folge-Käufe.</div>
        </div>
        <div class="kalk-c-bub-cell">
          <div class="kalk-c-bub-step">Steuereffekt monatlich</div>
          <div class="kalk-c-bub-body">Wir reichen die Lohnsteuerermäßigung beim Finanzamt ein, damit Dein Steuervorteil Monat für Monat direkt auf dem Konto landet — nicht erst mit der Steuererklärung.</div>
        </div>
        <div class="kalk-c-bub-cell">
          <div class="kalk-c-bub-step">Restnutzungsdauer-Gutachten</div>
          <div class="kalk-c-bub-body">Wir beauftragen Sprengnetter — Marktführer mit hoher Durchsetzungs-Quote beim Finanzamt. Ergebnis: höhere AfA über die Laufzeit. Letzte Entscheidung trifft das zuständige Finanzamt.</div>
        </div>
        <div class="kalk-c-bub-cell">
          <div class="kalk-c-bub-step">Übergabe &amp; WEG-Integration</div>
          <div class="kalk-c-bub-body">Wohnungs-Übergabeprotokoll, Ummeldungen Versorger, Mitteilung an die Hausverwaltung — alles in unserer Hand.</div>
        </div>
        <div class="kalk-c-bub-cell">
          <div class="kalk-c-bub-step">Neuvermietung &amp; Renovierung</div>
          <div class="kalk-c-bub-body">Wenn die Wohnung leer ist: die erste Neuvermietung machen wir umsonst. Bei Renovierung: passende Dienstleister-Empfehlung + Angebots-Prüfung.</div>
        </div>
        <div class="kalk-c-bub-cell" style="border-color:var(--positive);">
          <div class="kalk-c-bub-step" style="color:var(--positive);">WhatsApp-Direktdraht</div>
          <div class="kalk-c-bub-body">Eine WhatsApp-Gruppe mit B&amp;B — für Fragen die jetzt schon da sind, und für die die später kommen.</div>
        </div>
      </div>
      <div class="kalk-c-bub-foot">
        <div class="kalk-c-bub-foot-item"><strong>Maßgeschneidert.</strong> Wir betrachten Dein Investment aus drei Perspektiven — steuerlich, wirtschaftlich, Aufwand. Anfänger müssen keine Komplexität verstehen; Fortgeschrittene bekommen alles in die Hand was sie selbst steuern wollen.</div>
      </div>
    </section>
  `;

  // ===== SECTION_9 — Was wäre wenn (vereinfacht v3, Edgar 24.05.2026 14:30)
  // 3 klare Szenario-Karten + kurzer Renov-Block. Statt 5×4-Matrix die für
  // Käufer überfordernd war.
  const SECTION_9 = (() => {
    if (!window.Kalk || !window.Kalk.recalc || !r.inputs) return '';
    // Basis (heute) + Normal-Wind + Sturm rechnen
    const base = r; // schon vorhanden
    let wind = null, sturm = null;
    try {
      // Wind: Zins +1%, 1 Mo/J Leerstand
      const inputsWind = Object.assign({}, r.inputs, {
        zins: (r.inputs.zins || 0.045) + 0.01,
        kaltmiete: (r.inputs.kaltmiete || 0) * 11/12,
        stellplatzMiete: (r.inputs.stellplatzMiete || 0) * 11/12,
      });
      wind = window.Kalk.recalc(inputsWind);
      // Sturm: Zins +2%, 3 Mo/J Leerstand + 0,5% Mietausfall
      const sturmFaktor = 9/12 * 0.995;
      const inputsSturm = Object.assign({}, r.inputs, {
        zins: (r.inputs.zins || 0.045) + 0.02,
        kaltmiete: (r.inputs.kaltmiete || 0) * sturmFaktor,
        stellplatzMiete: (r.inputs.stellplatzMiete || 0) * sturmFaktor,
      });
      sturm = window.Kalk.recalc(inputsSturm);
    } catch (e) { return ''; }
    if (!base || !wind || !sturm) return '';

    const fmtIRR = (x) => x !== null && isFinite(x) ? (x * 100).toFixed(1).replace('.', ',') + ' %' : 'n.v.';
    const fmtEUR = (x) => Math.round(x).toLocaleString('de-DE') + ' €';

    // Renov-Story: kompakt
    // FS-2g (24.05.2026 Edgar 15:50): Renov 5.000 € ist Erhaltungsaufwand
    // (§ 9 EStG, sofort als Werbungskosten abzugsfähig) — nicht AfA-verteilt.
    // BFH-Schwelle „anschaffungsnah" greift erst bei > 15 % der Gebäude-AK
    // (= ca. 25.500 € bei 200k-Wohnung). 5.000 € weit darunter.
    const stSatz = (r.inputs.steuersatz || 0.30);
    const zins = (r.inputs.zins || 0.045);
    const tilg = (r.inputs.tilgung || 0.01);
    const renovBetrag = 5000;
    const renovStErstattung = Math.round(renovBetrag * stSatz);
    const renovEffektivEK = renovBetrag - renovStErstattung;
    const renovMonatlichBrutto = Math.round(renovBetrag * (zins + tilg) / 12);
    const renovMonatlichNetto = Math.round(renovMonatlichBrutto * (1 - stSatz * 0.5));

    const szenarioCard = (titel, sub, accent, irr, belastung, vermoegen) => `
      <div style="background:${accent.bg};border:1px solid ${accent.border};border-radius:8px;padding:16px 18px;">
        <div style="font-size:11px;color:${accent.text};text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">${titel}</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:10px;">${sub}</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;">Rendite (IRR)</div><div style="font-size:22px;font-weight:600;color:${accent.text};">${fmtIRR(irr)}</div></div>
          <div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;">Belastung €/Mo</div><div style="font-size:14px;font-weight:500;color:var(--text-primary);">${fmtEUR(belastung)}</div></div>
          <div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;">Vermögen nach 10 J</div><div style="font-size:14px;font-weight:500;color:var(--text-primary);">${fmtEUR(vermoegen)}</div></div>
        </div>
      </div>
    `;

    const accents = {
      base:  { bg: 'rgba(45,110,71,.07)',  border: 'rgba(45,110,71,.25)',  text: '#2D6E47' },
      wind:  { bg: 'rgba(176,138,77,.07)', border: 'rgba(176,138,77,.25)', text: '#8E6E3D' },
      sturm: { bg: 'rgba(154,62,51,.06)',  border: 'rgba(154,62,51,.25)',  text: '#9A3E33' },
    };

    return `
    <section class="kalk-c-section">
      <div class="kalk-c-section-head">
        <div class="kalk-c-left">
          <div class="kalk-c-section-num">06 · Was wäre wenn</div>
          <h2 class="kalk-c-section-title">Drei Szenarien — Basis bis Stress-Test.</h2>
        </div>
        <div class="kalk-c-right">
          Wir zeigen Dir nicht nur die schöne Sicht. Hier siehst Du, wie sich Deine Rendite verändert, wenn Zinsen steigen oder die Wohnung mal leer steht. Jede Karte ist eine eigene Berechnung über 10 Jahre.
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px;">
        ${szenarioCard('Basis — heutige Annahmen', 'Die Zahlen aus dieser Berechnung', accents.base, base.irr, base.belastungMo, base.vermoegenNetto10)}
        ${szenarioCard('Konservativ', 'Zins +1 %, 1 Mo/Jahr Leerstand', accents.wind, wind.irr, wind.belastungMo, wind.vermoegenNetto10)}
        ${szenarioCard('Stress-Test', 'Zins +2 %, 3 Mo/Jahr Leerstand', accents.sturm, sturm.irr, sturm.belastungMo, sturm.vermoegenNetto10)}
      </div>

      <div style="margin-top:22px;padding-top:18px;border-top:1px solid var(--border);">
        <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">Und wenn die Wohnung mal Renovierung braucht?</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:14px;">
          Sagen wir, Du steckst irgendwann <strong>${fmtEUR(renovBetrag)}</strong> in die Wohnung. Zwei Wege — beide funktionieren:
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div style="background:${accents.base.bg};border:1px solid ${accents.base.border};border-radius:6px;padding:12px 14px;font-size:13px;line-height:1.6;color:var(--text-secondary);">
            <strong style="color:${accents.base.text};">Aus Eigenkapital:</strong> ${fmtEUR(renovBetrag)} vom Konto, voll als Werbungskosten in der nächsten Steuererklärung → Erstattung vom Finanzamt ca. <strong>${fmtEUR(renovStErstattung)}</strong> → effektiv <strong>${fmtEUR(renovEffektivEK)}</strong>.
          </div>
          <div style="background:${accents.wind.bg};border:1px solid ${accents.wind.border};border-radius:6px;padding:12px 14px;font-size:13px;line-height:1.6;color:var(--text-secondary);">
            <strong style="color:${accents.wind.text};">Aus Finanzierung:</strong> Darlehen um ${fmtEUR(renovBetrag)} aufstocken → ca. <strong>${fmtEUR(renovMonatlichNetto)}/Mo</strong> Netto-Mehrbelastung. Konto bleibt voll.
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-tertiary);line-height:1.6;">
          Die Wohnung trägt diesen Mehrwert. <em>Welcher Weg für Dich besser passt, besprechen wir wenn es soweit ist.</em>
        </div>
      </div>

      <div style="margin-top:14px;font-size:11px;color:var(--text-tertiary);line-height:1.55;font-style:italic;">
        Die Szenarien variieren nur Zins + Leerstand. Andere Annahmen bleiben wie in der Hauptkalkulation.
      </div>
    </section>
    `;
  })();

  // ===== CLOSING (FS-2i, Edgar 24.05.2026): CTA-Block vor Disclaimer =====
  // Käufer hat 9 Sektionen gelesen — letzter Aufruf zum Handeln.
  const _ctaPhone = u.telefon ? esc(u.telefon).replace(/[^0-9+]/g, '') : '';
  const _ctaWhatsApp = _ctaPhone ? `https://wa.me/${_ctaPhone.replace(/^00/, '').replace(/^\+/, '')}` : '';
  const _ctaMail = u.email ? `mailto:${esc(u.email)}?subject=${encodeURIComponent('Termin / Rückfrage zur Wohnung')}` : '';
  const CLOSING = `
    <section class="kalk-c-cta-section">
      <div class="kalk-c-cta-inner">
        <h2 class="kalk-c-cta-title">Bereit für den nächsten Schritt?</h2>
        <p class="kalk-c-cta-sub">Termin vereinbaren · Rückfragen klären · oder direkt die Wohnung reservieren — wir sind erreichbar.</p>
        <div class="kalk-c-cta-buttons">
          ${_ctaWhatsApp ? `<a href="${_ctaWhatsApp}" target="_blank" rel="noopener" class="kalk-c-cta-btn kalk-c-cta-btn-primary">WhatsApp Direktdraht</a>` : ''}
          ${_ctaMail ? `<a href="${_ctaMail}" target="_blank" rel="noopener" class="kalk-c-cta-btn kalk-c-cta-btn-secondary">Termin / Rückfrage per Mail</a>` : ''}
        </div>
      </div>
    </section>
    <footer class="kalk-c-closing">
      <div class="kalk-c-signature">
        <strong>${esc(u.name || 'Edgar Steininger')}</strong>${u.name ? '' : ' · B&amp;B Immo GmbH'}<br>
        ${esc(u.email || '')}${u.telefon ? ' · ' + esc(u.telefon) : ''}
      </div>
      <p class="kalk-c-disclaimer">
        Diese Rechnung beruht auf den Annahmen aus dieser Analyse. Keine Anlageberatung im Sinne des WpHG. Vermittlung im Rahmen einer Erlaubnis nach § 34c GewO. Verbindlich ist ausschließlich der notarielle Kaufvertrag. Steuerliche Aspekte mit Deinem Steuerberater abstimmen.
      </p>
    </footer>
  `;

  // ===== Modals =====
  // Bonitäts-Saldo (mit Anrechenbarer Miete + Subv)
  const bonModal = `
    <div class="kalk-c-modal-backdrop" data-kalk-c-modal-id="bonitaet">
      <div class="kalk-c-modal">
        <button class="kalk-c-modal-close" data-kalk-c-close>Schließen ×</button>
        <div class="kalk-c-eyebrow">05 · Detail · Bonitäts-Saldo</div>
        <h3>So rechnet die Bank das durch</h3>
        <div class="kalk-c-sub">So verändert sich Deine monatliche Liquidität und Dein freies Eigenkapital.${(r.mietsubventionGesamt && r.mietsubventionGesamt > 0) ? ' Wir setzen die Mietsubvention bei der Bank als anrechenbare Miete an — das funktioniert mit unseren Partnerbanken zu 80 %.' : ' Die Bank rechnet 80 % der vereinbarten Miete als Einkommen.'}</div>
        <div class="kalk-c-saldo-grid">
          <div class="kalk-c-saldo-card">
            <div class="kalk-c-label">Frei verfügbares Einkommen — Bank-Sicht</div>
            <div class="kalk-c-row"><span>Vor Investment</span><span>${fmtEurMo(r.bonVor || 0)}</span></div>
            <div class="kalk-c-row"><span>+ Anrechenbare Miete (80 %)</span><span class="kalk-c-pos">+ ${fmtEurMo(r.bonMieteAnr || 0)}</span></div>
            <div class="kalk-c-row"><span>− Annuität</span><span class="kalk-c-neg">− ${fmtEurMo(r.bonAnnuMo || 0)}</span></div>
            ${r.bonModus === 'detail' ? `
            <div class="kalk-c-row"><span>− Hausgeld (bank-konservativ)</span><span class="kalk-c-neg">− ${fmtEurMo(r.hausgeldNurMo || 0)}</span></div>
            <div class="kalk-c-row"><span>− Hausverwaltung</span><span class="kalk-c-neg">− ${fmtEurMo(r.hausverwaltungMo || 0)}</span></div>` : ''}
            <div class="kalk-c-row kalk-c-total"><span>Nach Investment</span><span class="${(r.bonNach || 0) < 0 ? 'kalk-c-neg' : 'kalk-c-accent'}">${fmtEurMo(r.bonNach || 0)}</span></div>
          </div>
          <div class="kalk-c-saldo-card">
            <div class="kalk-c-label">Freies Eigenkapital</div>
            <div class="kalk-c-row"><span>Vor Erwerb</span><span>${fmt(r.bonVermoegen || 0)}</span></div>
            <div class="kalk-c-row"><span>Einsatz Erwerb (EK + KNK)</span><span class="kalk-c-neg">− ${fmt(r.ekBedarf)}</span></div>
            <div class="kalk-c-row kalk-c-total"><span>Nach Erwerb</span><span class="${(r.bonVermoegenVsEk || 0) < 0 ? 'kalk-c-neg' : 'kalk-c-accent'}">${fmt(r.bonVermoegenVsEk || 0)}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Cashflow J1-J10
  // QA-Fix 2026-05-23 (Audit-AA-8): Summe aus den ANGEZEIGTEN (gerundeten)
  // Jahres-Werten bilden, nicht aus den raw cfJahr. Vorher konnte der Kunde
  // mit dem Bleistift addieren und ~5 € Drift gegen die Summen-Zeile finden.
  let _cfSummeDisplayed = 0;
  const cashflowRows = r.cf.slice(0, 10).map((c, idx) => {
    const mo = Math.round(c.cfJahr / 12);
    const cls = mo >= 0 ? 'kalk-c-pos' : 'kalk-c-neg';
    const jahressumme = Math.round(c.cfJahr);
    _cfSummeDisplayed += jahressumme;
    const summe_cls = jahressumme >= 0 ? 'kalk-c-pos' : 'kalk-c-neg';
    return `<tr><td>${c.y}</td><td class="kalk-c-r ${cls}">${mo > 0 ? '+' : ''}${mo}</td><td class="kalk-c-r ${summe_cls}">${jahressumme > 0 ? '+' : ''}${jahressumme.toLocaleString('de-DE')}</td></tr>`;
  }).join('');
  const cfSumme = _cfSummeDisplayed;
  const cashflowModal = `
    <div class="kalk-c-modal-backdrop" data-kalk-c-modal-id="cashflow">
      <div class="kalk-c-modal">
        <button class="kalk-c-modal-close" data-kalk-c-close>Schließen ×</button>
        <div class="kalk-c-eyebrow">05 · Detail · Cashflow</div>
        <h3>Monatlicher Saldo, Jahr 1 bis Jahr 10</h3>
        <div class="kalk-c-sub">Effektive Belastung je Monat nach Miete, Hausgeld, Annuität, Steuervorteil und in der Anlaufphase Mietsubvention.</div>
        <table>
          <thead><tr><th>Jahr</th><th class="kalk-c-r">Belastung €/Mo</th><th class="kalk-c-r">Jahres-Summe €</th></tr></thead>
          <tbody>
            ${cashflowRows}
            <tr class="kalk-c-total"><td>Summe</td><td class="kalk-c-r"></td><td class="kalk-c-r kalk-c-accent">${cfSumme > 0 ? '+' : ''}${cfSumme.toLocaleString('de-DE')}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Vermögen J1-J10
  const vermoegenRows = r.vermoegen.slice(1, 11).map(v => {
    const netto = Math.round(v.vermoegenNetto || 0);
    const netto_cls = netto >= 0 ? 'kalk-c-pos' : 'kalk-c-neg';
    return `<tr><td>${v.y}</td><td class="kalk-c-r">${Math.round(v.wert).toLocaleString('de-DE')}</td><td class="kalk-c-r">${Math.round(v.restschuld).toLocaleString('de-DE')}</td><td class="kalk-c-r ${netto_cls}">${netto > 0 ? '+' : ''}${netto.toLocaleString('de-DE')}</td></tr>`;
  }).join('');
  const vermoegenModal = `
    <div class="kalk-c-modal-backdrop" data-kalk-c-modal-id="vermoegen">
      <div class="kalk-c-modal">
        <button class="kalk-c-modal-close" data-kalk-c-close>Schließen ×</button>
        <div class="kalk-c-eyebrow">05 · Detail · Vermögen</div>
        <h3>Brutto- und Nettovermögen, Jahr 1 bis Jahr 10</h3>
        <div class="kalk-c-sub">Marktwert, Restschuld und Nettovermögen kumuliert. Wertsteigerung ${fmtPct(i.wertsteigerung || 0.03)} p.a. konservativ angesetzt.</div>
        <table>
          <thead><tr><th>Jahr</th><th class="kalk-c-r">Marktwert</th><th class="kalk-c-r">Restschuld</th><th class="kalk-c-r">Netto kumuliert</th></tr></thead>
          <tbody>${vermoegenRows}</tbody>
        </table>
      </div>
    </div>
  `;

  // Annahmen
  // Subv-Phasen-Anzeige (aus pdf.js-Logik portiert)
  let subvText = '—';
  const phasen = Array.isArray(i.subventionPhasen) ? i.subventionPhasen : [];
  if (phasen.length >= 2) {
    subvText = `Phase 1: ${fmtEurMo(phasen[0].mo)} × ${phasen[0].monate} Mo · Phase 2: ${fmtEurMo(phasen[1].mo)} × ${phasen[1].monate} Mo · gesamt ${fmt(r.mietsubventionGesamt || 0)}`;
  } else if (phasen.length === 1) {
    subvText = `${fmtEurMo(phasen[0].mo)} × ${phasen[0].monate} Mo · gesamt ${fmt(r.mietsubventionGesamt || 0)}`;
  } else if (i.subventionMo > 0) {
    subvText = `${fmtEurMo(i.subventionMo)} × ${i.subventionMonate} Mo · gesamt ${fmt(r.mietsubventionGesamt || 0)}`;
  }
  // Welle 3 (2026-05-24): Quellen-Hinweise pro Annahme — Maurice's „Vertrauen
  // entsteht durch Transparenz". Wenn eine Annahme aus Stammdaten kommt (z.B.
  // AfA-Gutachten) sagen wir das auch. Wenn es ein Vorsichts-Default ist, auch.
  // Pure-Funktion, keine Engine-Änderung.
  const quelle = (key) => {
    const sd = (state.kalk && state.kalk._stammdatenQuelle) || '';
    switch (key) {
      case 'kp': return 'Notarvertraglich — verbindlich';
      case 'knk': return 'GrESt (Bundesland) + Notar 1,5 % + Grundbuch 0,5 %';
      case 'ek': return i.knkMitfinanziert ? '0 € — KNK aus Kaufpreis mitfinanziert' : 'EK = KNK; Kaufpreis 100 % finanziert';
      case 'zins': return 'Aktuelles Bank-Angebot — wird vor Notar nochmal bestätigt';
      case 'tilg': return 'Standard 1 % — kann auf Wunsch nach oben angepasst werden';
      case 'wert': return 'Vorsichts-Default 3 % p.a. (Bulwiengesa-Median 2010-2024 lag bei ~4 %)';
      case 'miete': return '§ 558 BGB: max. 15 % in 3 Jahren bei Bestand. Bei Neuvermietung: Mietspiegel-Konformität';
      case 'st': return 'Persönlicher Grenzsteuersatz — aus Selbstauskunft oder Annahme';
      case 'afa': return (i.afaSatz > 0.025) ? 'Restnutzungsdauer-Gutachten (Sprengnetter — Marktführer, gute Durchsetzungs-Quote beim Finanzamt)' : 'Standard 2 % linear nach § 7 EStG';
      case 'subv': return 'B&B-Glättungs-Modell — Phase 1 absichern Marktmiete-Cap (§ 558 BGB)';
      case 'spar': return 'Tagesgeld-Vergleichszins — frei wählbar';
      case 'markt': return 'Aus Immoscout/Homeday-Vergleichswerten (Stand letzter Marktanker)';
      default: return '';
    }
  };
  const annahmenModal = `
    <div class="kalk-c-modal-backdrop" data-kalk-c-modal-id="annahmen">
      <div class="kalk-c-modal">
        <button class="kalk-c-modal-close" data-kalk-c-close>Schließen ×</button>
        <div class="kalk-c-eyebrow">05 · Detail · Annahmen</div>
        <h3>Rechen-Parameter und Quellen</h3>
        <div class="kalk-c-sub">Alle Werte in der Analyse leiten sich aus den nachfolgenden Annahmen ab. Jeder Parameter hat eine Quelle — Du kannst nachfragen, wenn etwas unstimmig wirkt.</div>
        <div class="kalk-c-assumptions">
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Kaufpreis gesamt<br><span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">${quelle('kp')}</span></span><span class="kalk-c-v">${fmt(r.kpGesamt)}</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Kaufnebenkosten<br><span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">${quelle('knk')}</span></span><span class="kalk-c-v">${fmt(knk)}${i.knkMitfinanziert ? ' (mitfinanziert)' : ''}</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Eigenkapital-Einsatz<br><span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">${quelle('ek')}</span></span><span class="kalk-c-v">${fmt(r.ekBedarf)}</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Annuität pro Monat<br><span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">Errechnet aus Zins + Tilgung × Darlehen</span></span><span class="kalk-c-v">${fmtEurMo(r.annuityMo)}</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Zinssatz Darlehen<br><span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">${quelle('zins')}</span></span><span class="kalk-c-v">${fmtPct(i.zins || 0)} p.a.</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Anfangstilgung<br><span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">${quelle('tilg')}</span></span><span class="kalk-c-v">${fmtPct(i.tilgung || 0)} p.a.</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Wertsteigerung<br><span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">${quelle('wert')}</span></span><span class="kalk-c-v">${fmtPct(i.wertsteigerung || 0.03)} p.a.</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Mietsteigerung</span><span class="kalk-c-v">${(() => {
            // QA-Fix 2026-05-22 (Audit-H H7): bei sprung-Modus war ".. % · alle 3 Jahre" zwar
            // korrekt, aber Banker liest „p.a." in den Foren. Wording sauber: „je Sprung" +
            // BGB-Referenz für Bank-Tauglichkeit.
            const pct = ((i.steigerungProz || 0.15) * 100).toFixed(1).replace('.', ',');
            const m = i.mietsteigerungsModus || 'sprung';
            if (m === 'sprung')  return pct + ' % je Sprung · alle 3 Jahre (§ 558 BGB)';
            if (m === 'staffel') return pct + ' % p.a. · Staffelmietvertrag';
            if (m === 'index')   return pct + ' % p.a. · Indexmietvertrag';
            if (m === 'keine')   return 'keine';
            return pct + ' % · ' + _modusCaption;
          })()}</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Steuersatz<br><span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">${quelle('st')}</span></span><span class="kalk-c-v">${fmtPct(i.steuersatz || 0.3)}</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">AfA-Satz<br><span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">${quelle('afa')}</span></span><span class="kalk-c-v">${fmtPct(i.afaSatz || 0.02)} linear</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Mietsubvention<br><span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">${quelle('subv')}</span></span><span class="kalk-c-v">${subvText}</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Sparbuch-Vergleich<br><span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">${quelle('spar')}</span></span><span class="kalk-c-v"><span id="spar-zins-val" style="display:inline-block;min-width:48px;text-align:right;">${((state.kalk.sparZins || 0.025) * 100).toFixed(2).replace('.',',')} %</span> p.a.</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Marktpreis je qm Ref.<br><span style="font-size:11px;color:var(--text-tertiary);font-weight:400;">${quelle('markt')}</span></span><span class="kalk-c-v">${marktQm > 0 ? Math.round(marktQm).toLocaleString('de-DE') + ' €' : '—'}</span></div>
        </div>
        <div style="margin-top:18px;padding:14px 16px;background:rgba(176,138,77,.07);border-radius:6px;font-size:12px;color:var(--text-secondary);line-height:1.55;">
          <strong style="color:var(--text-primary);">Berechnet mit Engine v${(window.Kalk && window.Kalk.ENGINE_VERSION) || '?'} · Stand: ${new Date().toLocaleDateString('de-DE')}.</strong><br>
          Diese Berechnung ist eine Modell-Rechnung auf Basis dokumentierter Annahmen — kein verbindliches Angebot, keine Anlageberatung. Steuerliche Konstrukte unter Vorbehalt der Klärung mit Deinem Steuerberater. Bei Fragen zu einzelnen Annahmen: ruf uns an oder schreib auf WhatsApp.
        </div>
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);display:flex;align-items:center;gap:14px;font-size:13px;color:var(--text-secondary)">
          <span style="flex:0 0 auto;color:var(--text-tertiary);">EK-Verzinsung Sparbuch:</span>
          <input type="range" id="spar-zins-slider" min="0" max="12" step="0.05"
                 value="${((state.kalk.sparZins || 0.025) * 100).toFixed(2)}"
                 class="spar-zins-range" style="flex:1;">
          <input type="number" id="spar-zins-num" min="0" max="12" step="0.05"
                 value="${((state.kalk.sparZins || 0.025) * 100).toFixed(2)}"
                 class="spar-zins-num" style="width:72px;text-align:right;">
          <span style="color:var(--text-tertiary);">%</span>
        </div>
      </div>
    </div>
  `;

  // FS-2g (24.05.2026, Edgar 14:30 + Story-Architekt):
  // Chronologie: 1 Objekt → 2 Cashflow → 3 Vermögen → 4 Vergleich → 5 Detail
  // → 6 Was-wäre-wenn (vor Aktionsmodus) → 7 Wie weitergeht → 8 Nach Notartermin
  // → 9 Brot & Butter (am Ende). Identische Chronologie in PDF.
  el.innerHTML = '<div class="kalk-c-magazine">'
    + HERO
    + SECTION_1   // 01 Objekt
    + SECTION_2   // 02 Cashflow J1
    + SECTION_3   // 03 Vermögen J10
    + SECTION_4   // 04 Vergleich (Sparbuch/Hebel)
    + SECTION_5   // 05 Im Detail
    + SECTION_9   // 06 Was wäre wenn (NEU verschoben — vor Aktionsmodus)
    + SECTION_6   // 07 Wie es weitergeht (vor Notar)
    + SECTION_8   // 08 Nach dem Notartermin
    + SECTION_7   // 09 Brot & Butter (NEU am ENDE)
    + CLOSING
    + '</div>'
    + bonModal
    + cashflowModal
    + vermoegenModal
    + annahmenModal;

  // Charts rendern (async-frei wegen animation: false)
  _drawCMagazinCharts(r);

  // Modal-Bindings (idempotent — onclick statt addEventListener)
  _bindCPremiumInteractions();
}

/* Hilfsfunktion: Magazin-Charts rendern */
function _drawCMagazinCharts(r) {
  if (!window.Chart) return;

  const accent = '#B08A4D';
  const accentDark = '#8E6E3D';
  const tertiary = '#7A7A72';
  const positive = '#2D6E47';
  const negative = '#9A3E33';
  const border = '#E8E6DD';
  const bgPrimary = '#FBFAF7';

  // Chart 1 — Belastung €/Mo über 10 J
  const cBel = document.getElementById('chart-c-belastung');
  if (cBel) {
    if (_cMagazinCharts.belastung) _cMagazinCharts.belastung.destroy();
    const belastungJe = r.cf.slice(0, 10).map(c => Math.round(c.cfJahr / 12));
    _cMagazinCharts.belastung = new Chart(cBel, {
      type: 'line',
      data: {
        labels: ['J1','J2','J3','J4','J5','J6','J7','J8','J9','J10'],
        datasets: [{
          label: 'Belastung €/Mo',
          data: belastungJe,
          borderColor: accent,
          backgroundColor: 'rgba(176,138,77,.08)',
          borderWidth: 2,
          fill: true,
          pointBackgroundColor: belastungJe.map(v => v >= 0 ? positive : negative),
          pointBorderColor: bgPrimary,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.32
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: ctx => (ctx.parsed.y > 0 ? '+' : '') + ctx.parsed.y + ' €/Mo' }
        }},
        scales: {
          x: { ticks: { color: tertiary, font: { size: 10 } }, grid: { display: false } },
          y: {
            ticks: { color: tertiary, font: { size: 10 }, callback: v => (v > 0 ? '+' : '') + v + ' €' },
            grid: { color: ctx => ctx.tick.value === 0 ? '#1A1A17' : border, lineWidth: ctx => ctx.tick.value === 0 ? 1.2 : 1 }
          }
        }
      }
    });
  }

  // Chart 2 — Vermögen Netto (default sichtbar) + Restschuld + Brutto (default hidden, via Toggle)
  // Iter 91.2: Edgar-Wunsch: standardmäßig nur Nettovermögen-Linie.
  // Schulden + Immobilienwert per Klick auf Toggle-Pills einblenden.
  const cVer = document.getElementById('chart-c-vermoegen-magazin');
  if (cVer) {
    if (_cMagazinCharts.vermoegen) _cMagazinCharts.vermoegen.destroy();
    const labels = ['J1','J2','J3','J4','J5','J6','J7','J8','J9','J10'];
    const netto = r.vermoegen.slice(1, 11).map(v => Math.round(v.vermoegenNetto || 0));
    const restschuld = r.vermoegen.slice(1, 11).map(v => Math.round(v.restschuld || 0));
    const brutto = r.vermoegen.slice(1, 11).map(v => Math.round(v.wert || (v.verkaufserloes ? v.verkaufserloes + (v.restschuld || 0) : 0)));
    _cMagazinCharts.vermoegen = new Chart(cVer, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Nettovermögen', data: netto,
            borderColor: accent, backgroundColor: 'rgba(176,138,77,.08)',
            borderWidth: 2.2, fill: true, tension: 0.32, pointRadius: 0, pointHoverRadius: 4,
            hidden: false
          },
          {
            label: 'Restschuld (Schulden)', data: restschuld,
            borderColor: '#9A3E33', borderDash: [4, 3], backgroundColor: 'transparent',
            borderWidth: 1.5, fill: false, tension: 0.32, pointRadius: 0, pointHoverRadius: 4,
            hidden: !(_cMagazinCharts._vermoegenShow && _cMagazinCharts._vermoegenShow.restschuld)
          },
          {
            label: 'Immobilienwert (Marktwert)', data: brutto,
            borderColor: '#2D6E47', borderDash: [2, 4], backgroundColor: 'transparent',
            borderWidth: 1.5, fill: false, tension: 0.32, pointRadius: 0, pointHoverRadius: 4,
            hidden: !(_cMagazinCharts._vermoegenShow && _cMagazinCharts._vermoegenShow.brutto)
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString('de-DE') + ' €' } }
        },
        scales: {
          x: { ticks: { color: tertiary, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: tertiary, font: { size: 10 }, callback: v => v.toLocaleString('de-DE') + ' €' }, grid: { color: border } }
        }
      }
    });
  }

  // Chart 3 — Compare Sparen vs. Immo
  const cCmp = document.getElementById('chart-c-compare');
  if (cCmp) {
    if (_cMagazinCharts.compare) _cMagazinCharts.compare.destroy();
    const sparen10 = r.sparen[10] || {};
    // QA-Fix 2026-05-22 (Phase-3a W3 / 3c W): Sparbuch-Label dynamisch aus sparZins-State.
    // Vorher hardcoded "2,5 % p.a." — driftete bei Slider-Änderung im Annahmen-Modal vs.
    // Compare-Headline (Z.2580 nutzte schon den dynamischen Wert).
    const _sparZinsPct = ((state.kalk.sparZins || 0.025) * 100).toFixed(2).replace('.', ',');
    _cMagazinCharts.compare = new Chart(cCmp, {
      type: 'bar',
      data: {
        labels: [`Sparbuch (${_sparZinsPct} % p.a.)`, 'Sachwert Immobilie'],
        datasets: [{
          data: [Math.round(sparen10.nurSparen || 0), Math.round(sparen10.mitImmo || 0)],
          backgroundColor: [tertiary, accentDark],
          borderRadius: 3,
          barPercentage: 0.55
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: ctx => ctx.parsed.y.toLocaleString('de-DE') + ' €' }
        }},
        scales: {
          x: { ticks: { color: tertiary, font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { color: tertiary, font: { size: 10 }, callback: v => v.toLocaleString('de-DE') + ' €' }, grid: { color: border } }
        }
      }
    });
  }
}

/* Hilfsfunktion: Modal-Open/Close + ESC + Backdrop-Klick (idempotent) */
function _bindCPremiumInteractions() {
  const triggers = document.querySelectorAll('.kalk-c-drill-link[data-kalk-c-modal]');
  triggers.forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-kalk-c-modal');
      const m = document.querySelector('.kalk-c-modal-backdrop[data-kalk-c-modal-id="' + id + '"]');
      if (m) {
        m.classList.add('kalk-c-open');
        document.body.style.overflow = 'hidden';
        window._cOpenModal = id; // Iter 91.4: persistieren
      }
    };
  });
  const closes = document.querySelectorAll('.kalk-c-modal-backdrop [data-kalk-c-close]');
  closes.forEach(btn => {
    btn.onclick = () => _closeAllCModals();
  });
  document.querySelectorAll('.kalk-c-modal-backdrop').forEach(bk => {
    bk.onclick = (e) => { if (e.target === bk) _closeAllCModals(); };
  });

  // Iter 91.4: Wenn vor einem Re-Render ein Modal offen war, öffne es wieder.
  // Sonst schließt sich der Annahmen-Modal nach jedem Slider-change, weil
  // renderStoryPremium den ganzen Inhalt neu setzt.
  if (window._cOpenModal) {
    const m = document.querySelector('.kalk-c-modal-backdrop[data-kalk-c-modal-id="' + window._cOpenModal + '"]');
    if (m) { m.classList.add('kalk-c-open'); document.body.style.overflow = 'hidden'; }
  }
  // ESC: einmalig binden (global)
  if (!window._cPremiumEscBound) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') _closeAllCModals();
    });
    window._cPremiumEscBound = true;
  }

  // Iter 91: Spar-Zins-Slider lebt jetzt im Annahmen-Modal — wir binden ihn
  // hier neu nach jedem renderStoryPremium-Aufruf, weil der Modal-HTML
  // bei jedem Re-Render neu erzeugt wird.
  if (typeof bindSparZinsSlider === 'function') bindSparZinsSlider();

  // Iter 91.7: Mietsteigerungs-Modus-Toggle aus der Magazin-View entfernt.
  // Magazin zeigt immer 3-Jahres-Sprung-Logik. Der querySelectorAll bleibt
  // defensiv für eventuell verbleibende DOM-Reste — leere NodeList = no-op.

  // Iter 91.2: Vermögens-Chart Toggle (Restschuld / Immobilienwert einblenden).
  // State persistiert in _cMagazinCharts._vermoegenShow damit Re-Renders die
  // Sichtbarkeit beibehalten.
  if (!_cMagazinCharts._vermoegenShow) _cMagazinCharts._vermoegenShow = { restschuld: false, brutto: false };
  document.querySelectorAll('.kalk-c-vermoegen-toggle button[data-vermoegen-line]').forEach(btn => {
    const key = btn.getAttribute('data-vermoegen-line');
    // Initial-Style nach State
    const setStyle = (on) => {
      btn.style.background = on ? 'var(--accent)' : 'transparent';
      btn.style.color = on ? 'var(--on-accent)' : 'var(--text-tertiary)';
      btn.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = (on ? '✓ ' : '+ ') + (key === 'restschuld' ? 'Restschuld' : 'Immobilienwert') + (on ? ' ausblenden' : ' einblenden');
    };
    setStyle(_cMagazinCharts._vermoegenShow[key]);
    btn.onclick = () => {
      _cMagazinCharts._vermoegenShow[key] = !_cMagazinCharts._vermoegenShow[key];
      const on = _cMagazinCharts._vermoegenShow[key];
      setStyle(on);
      // Im Chart das passende Dataset (Index 1 = Restschuld, Index 2 = Brutto) zeigen/verstecken.
      const chart = _cMagazinCharts.vermoegen;
      if (chart) {
        const idx = (key === 'restschuld') ? 1 : 2;
        chart.data.datasets[idx].hidden = !on;
        chart.update('none');
      }
    };
  });
}
function _closeAllCModals() {
  document.querySelectorAll('.kalk-c-modal-backdrop.kalk-c-open').forEach(m => m.classList.remove('kalk-c-open'));
  document.body.style.overflow = '';
  window._cOpenModal = null; // Iter 91.4: State leeren
}

function drawCharts(r) {
  if (!window.Chart) return;
  if (!document.getElementById('chart-vermoegen')) return;

  // --- Daten vorbereiten ---
  // Vermögensaufbau: nur 10 Jahre (r.vermoegen ist 0..10)
  const years = r.vermoegen.map(v => 'J' + v.y);
  const marktwert        = r.vermoegen.map(v => Math.round(v.wert));
  const restschuld       = r.vermoegen.map(v => Math.round(v.restschuld));
  const vermoegensaufbau = r.vermoegen.map(v => Math.round(v.vermoegenNetto || 0)); // Gewinn vs. Tag-1-Einsatz

  // Cashflow: 10 Jahre (r.cf hat 30 Jahre — wir nehmen die ersten 10)
  const cf10        = r.cf.slice(0, 10);
  const cfYears     = cf10.map(c => 'J' + c.y);
  const cfOperativ  = cf10.map(c => Math.round((c.cfJahr || 0) - (c.stVorteilJahr || 0))); // vor Steuer
  const cfStVorteil = cf10.map(c => Math.round(c.stVorteilJahr || 0));                      // nur Steuervorteil
  const cfNachSt    = cf10.map(c => Math.round(c.cfJahr || 0));                              // gesamt = operativ + Steuervorteil

  // Iter 75 (21.05.2026, Edgar-Bug J10): Chart liest jetzt aus r.cf[y] (Jahresdaten),
  //   identisch zur KPI-Quelle. Vorher cfMonate-Aggregation → für J10 driftete der
  //   Wert ~200 €/Mo gegen die KPI ab (Balken fehlte, Linie schoss auf +37 statt -137).
  //   cfMonate bleibt nur für Tooltip-Monatsdetail erhalten.
  const cfMo        = Array.isArray(r.cfMonate) ? r.cfMonate : [];
  const MONATSKURZ = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const cfBarData = []; // 10 Einträge — je 1 pro Jahr
  for (let y = 1; y <= 10; y++) {
    const monatsBlock = cfMo.slice((y - 1) * 12, y * 12);
    const c = r.cf[y - 1] || {};
    const operativJahr = (c.cfJahr || 0) - (c.stVorteilJahr || 0);
    const stVorteilJahr = c.stVorteilJahr || 0;
    const cfJahr = c.cfJahr || 0;
    cfBarData.push({
      label: 'J' + y,
      operativ: Math.round(operativJahr / 12),
      stVorteil: Math.round(stVorteilJahr / 12),
      nachSt: Math.round(cfJahr / 12),
      yearIdx: y,
      jahresSumme: Math.round(cfJahr),
      monatsBlock,
    });
  }
  const cfBarLabels    = cfBarData.map(d => d.label);
  const cfBarOperativ  = cfBarData.map(d => d.operativ);
  const cfBarStVorteil = cfBarData.map(d => d.stVorteil);
  const cfBarNachSt    = cfBarData.map(d => d.nachSt);

  // --- Drei Karten Monatswerte für Jahr 1 + Jahr 10 ---
  // Iter 51 (19.05.2026, Edgar-Wunsch): vorher Jahr 1 vs. Jahr 2 — der Diff war
  // wegen Mietsteigerungs-Sprung-Logik fast 0. Jahr 1 vs. Jahr 10 zeigt den vollen
  // Cashflow-Sprung über die Haltedauer und ist deutlich vertriebsstärker.
  const werteBlock = document.getElementById('cf-werte-block');
  if (werteBlock && cf10.length > 1) {
    const opJ1    = cfOperativ[0] / 12;
    const opJ10   = cfOperativ[9] / 12;
    const stVJ1   = cfStVorteil[0] / 12;
    const stVJ10  = cfStVorteil[9] / 12;
    const nachJ1  = cfNachSt[0] / 12;
    const nachJ10 = cfNachSt[9] / 12;
    const fmtMo = (v) => (v >= 0 ? '+' : '−') + ' ' + Math.abs(Math.round(v)).toLocaleString('de-DE') + ' €/Mo';
    const cls   = (v) => v >= 0 ? 'positive' : 'negative';
    const infoBtn = (title, body) =>
      `<button type="button" class="info-btn"
               data-info-title="${esc(title)}"
               data-info-body="${esc(body)}"
               aria-label="Info zu ${esc(title)}">i</button>`;
    const card = (title, j1, j10, hervorgehoben, infoTitle, infoBody) => `
      <div class="cf-detail-card${hervorgehoben ? ' primary' : ''}">
        <div class="cf-detail-title">
          <span>${esc(title)}</span>
          ${infoBtn(infoTitle, infoBody)}
        </div>
        <div class="cf-detail-row">
          <span class="text-tertiary">Jahr 1</span><span class="${cls(j1)}">${fmtMo(j1)}</span>
        </div>
        <div class="cf-detail-row">
          <span class="text-tertiary">Jahr 10</span><span class="${cls(j10)}">${fmtMo(j10)}</span>
        </div>
      </div>`;
    werteBlock.innerHTML =
      card('Dein operativer CF', opJ1, opJ10, false,
        'Operativer Cashflow',
        'Was monatlich aus der Immobilie übrig bleibt — VOR Steuern.\n\nFormel: Kaltmiete (inkl. Mietsubvention) − Annuität (Zins + Tilgung) − Hausgeld − Hausverwaltung − Mietverwaltung (SEV)\n\nStartet meist im Minus (Belastung > Miete), kippt über die Jahre ins Plus, sobald Mieten steigen und der Zinsanteil der Annuität sinkt.') +
      card('Dein Steuervorteil', stVJ1, stVJ10, false,
        'Steuervorteil',
        'Wie viel Steuern Du Dir pro Monat sparst, weil die Immobilie steuerlich Verluste produziert.\n\nFormel: (Zinsanteil + AfA + Werbungskosten − Mieteinnahmen) × Dein Grenzsteuersatz\n\nAfA-Bemessung (§7 EStG): (Kaufpreis + Kaufnebenkosten) × Gebäudeanteil. Grund und Boden ist nicht abnutzbar.\n\nSchrumpft über die Zeit: Zinsanteil sinkt mit Tilgung, Mieten steigen — der steuerliche Verlust wird kleiner, irgendwann kippt es ins Plus (= Du zahlst Steuern auf die Mieteinnahmen).') +
      card('★ Dein CF nach Steuern', nachJ1, nachJ10, true,
        'CF nach Steuern',
        'Die wichtigste Zahl: was real auf Deinem Konto landet — nach allen Kosten UND nach Steuern.\n\nFormel: operativer CF + Steuervorteil\n\nIn den ersten Jahren oft leicht negativ oder bei Null. Steigt über 10 Jahre deutlich — durch Mietsteigerung + sinkenden Zinsanteil. Im Tooltip pro Bar siehst Du den Monatsverlauf des Jahres.');
  }

  // Sparen vs. Investieren: bleibt wie gehabt
  const sparenLbls = r.sparen.map(s => 'J' + s.y);
  const sparenNur  = r.sparen.map(s => Math.round(s.nurSparen));
  const sparenMit  = r.sparen.map(s => Math.round(s.mitImmo));

  // --- Helper / Optionen ---
  const eurTooltip = {
    callbacks: {
      label: (ctx) => {
        const v = ctx.parsed.y;
        const lbl = ctx.dataset.label || '';
        return lbl + ': ' + (typeof v === 'number' ? Math.round(v).toLocaleString('de-DE') + ' €' : v);
      }
    }
  };
  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { tooltip: eurTooltip, legend: { position: 'top' } },
    scales: {
      y: {
        ticks: {
          callback: (v) => (typeof v === 'number' && Math.abs(v) >= 1000)
            ? Math.round(v / 1000) + 'k €'
            : v + ' €'
        }
      }
    }
  };

  // ============================================================
  // HAUPTCHART: Vermögensaufbau — drei Linien, schlicht.
  //   [0] Marktwert (Immobilie) — grün, füllt nach unten zur Restschuld (= Schere)
  //   [1] Restschuld (Darlehen) — rot, gestrichelt
  //   [2] Vermögensaufbau (= Gewinn vs. Tag-1-Einsatz) — gold/braun, kräftig
  // Legende aus — die Linien werden über die Info-Chips über dem Chart erklärt.
  // ============================================================
  if (chartV) chartV.destroy();
  chartV = new Chart(document.getElementById('chart-vermoegen'), {
    type: 'line',
    data: {
      labels: years,
      datasets: [
        // [0] Marktwert oben — gefüllter Bereich nach unten zur Restschuld → die Schere
        {
          label: 'Marktwert (Immobilie)',
          data: marktwert,
          borderColor: '#2D6E47',
          backgroundColor: 'rgba(45,110,71,0.10)',
          borderWidth: 3,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          fill: '+1',
          order: 2,
        },
        // [1] Restschuld — Unterkante der Schere
        {
          label: 'Restschuld (Darlehen)',
          data: restschuld,
          borderColor: '#9A3E33',
          backgroundColor: 'rgba(154,62,51,0)',
          borderWidth: 2.5,
          borderDash: [6, 3],
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          fill: false,
          order: 2,
        },
        // [2] Vermögensaufbau (= Gewinn vs. eingesetztes EK)
        {
          label: 'Vermögensaufbau',
          data: vermoegensaufbau,
          borderColor: '#B08A4D',
          backgroundColor: 'rgba(176,138,77,0)',
          borderWidth: 3.5,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 7,
          fill: false,
          order: 1,
        },
      ],
    },
    options: Object.assign({}, baseOpts, {
      plugins: Object.assign({}, baseOpts.plugins, {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y;
              const lbl = ctx.dataset.label || '';
              return lbl + ': ' + (typeof v === 'number' ? Math.round(v).toLocaleString('de-DE') + ' €' : v);
            }
          }
        }
      })
    })
  });

  // ============================================================
  // CASHFLOW: 10 Jahresbalken Ø €/Mo (Iter 43)
  // Stacked Bars: Operativer CF + Steuervorteil. CF nach Steuern als
  // hervorgehobene Linie obendrauf. Tooltip mit Monatsdetails.
  // ============================================================
  const fmtEUR = (v) => (v >= 0 ? '+' : '−') + ' ' + Math.abs(Math.round(v)).toLocaleString('de-DE') + ' €';
  if (chartC) chartC.destroy();
  chartC = new Chart(document.getElementById('chart-cashflow'), {
    type: 'bar',
    data: {
      labels: cfBarLabels,
      datasets: [
        {
          type: 'bar',
          label: 'Operativer CF (vor Steuer)',
          data: cfBarOperativ,
          backgroundColor: 'rgba(122,122,114,0.55)',
          borderColor: 'rgba(122,122,114,0.7)',
          borderWidth: 1,
          stack: 'cf',
          order: 3,
        },
        {
          type: 'bar',
          label: 'Steuervorteil',
          data: cfBarStVorteil,
          backgroundColor: 'rgba(122,122,114,0.25)',
          borderColor: 'rgba(122,122,114,0.4)',
          borderWidth: 1,
          stack: 'cf',
          order: 2,
        },
        {
          type: 'line',
          label: '★ CF nach Steuern',
          data: cfBarNachSt,
          borderColor: '#2D6E47',
          backgroundColor: '#2D6E47',
          borderWidth: 3,
          pointRadius: 6,
          pointHoverRadius: 9,
          pointStyle: 'circle',
          pointBackgroundColor: '#2D6E47',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.25,
          fill: false,
          order: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { stacked: true, ticks: { font: { size: 11 } }, grid: { display: false } },
        y: {
          stacked: true,
          ticks: {
            callback: (v) => (typeof v === 'number' && Math.abs(v) >= 1000)
              ? Math.round(v / 1000) + 'k €/Mo'
              : Math.round(v) + ' €/Mo'
          },
        },
      },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 14, padding: 12, font: { size: 11 } } },
        tooltip: {
          mode: 'index',
          intersect: false,
          position: 'nearest',
          backgroundColor: 'rgba(33,33,28,0.94)',
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 11 },
          padding: 10,
          callbacks: {
            title: (items) => {
              if (!items.length) return '';
              const d = cfBarData[items[0].dataIndex];
              return d ? 'Jahr ' + d.yearIdx + ' (Ø Monat)' : '';
            },
            label: (ctx) => {
              const v = ctx.parsed.y;
              const lbl = ctx.dataset.label || '';
              return lbl + ': ' + fmtEUR(v) + '/Mo';
            },
            // Iter 67: kompakter Footer — nur Spanne CF nach Steuern (min/max)
            // statt aller 12 Monate. Vorher überdeckte der Tooltip halb den Chart.
            afterBody: (items) => {
              if (!items.length) return [];
              const d = cfBarData[items[0].dataIndex];
              if (!d || !d.monatsBlock || !d.monatsBlock.length) return [];
              const vals = d.monatsBlock.map(m => m.cfNachStM);
              const min  = Math.min(...vals);
              const max  = Math.max(...vals);
              if (Math.abs(max - min) < 1) return []; // konstant → keine Spanne nötig
              return ['', 'Spanne im Jahr: ' + fmtEUR(min) + '/Mo … ' + fmtEUR(max) + '/Mo'];
            },
          }
        }
      }
    }
  });

  // ============================================================
  // EIGENKAPITAL · ANLAGE vs. IMMOBILIE (Iter 46)
  // Bündig zu Cashflow: 3 Karten oben (Start-EK, Anlage-Pfad 10J, Immobilie 10J),
  // Bar-Chart mit 2 Bars pro Jahr (Anlage hellgrau, Immobilie hervorgehoben grün).
  // ============================================================
  const sparWerteBlock = document.getElementById('spar-werte-block');
  if (sparWerteBlock) {
    const startEk    = Math.round(sparenNur[0] || 0);
    const anlage10   = Math.round(sparenNur[10] || 0);
    const immobil10  = Math.round(sparenMit[10] || 0);
    const delta      = immobil10 - anlage10;
    const fmtBig = (v) => (v >= 0 ? '' : '−') + Math.abs(Math.round(v)).toLocaleString('de-DE') + ' €';
    // Iter 50 Polish: Hex → CSS-Vars über `.spar-card`-Klasse (analog cf-detail-card).
    const infoBtnS = (title, body) =>
      `<button type="button" class="info-btn"
               data-info-title="${esc(title)}"
               data-info-body="${esc(body)}"
               aria-label="Info zu ${esc(title)}">i</button>`;
    const cardS = (title, value, sub, hervorgehoben, infoTitle, infoBody) => `
      <div class="spar-card${hervorgehoben ? ' primary' : ''}">
        <div class="spar-card-title">
          <span>${esc(title)}</span>
          ${infoBtnS(infoTitle, infoBody)}
        </div>
        <div class="spar-card-value">${fmtBig(value)}</div>
        <div class="spar-card-sub">${esc(sub)}</div>
      </div>`;
    sparWerteBlock.innerHTML =
      cardS('Dein eingesetztes EK', startEk, 'Start', false,
        'Eingesetztes EK',
        'Das Geld, das Du am Tag 0 selbst aus der Tasche zahlst: die Kaufnebenkosten (Grunderwerbsteuer + Notar + Grundbuch).\n\nDer Kaufpreis selbst läuft komplett über die Bank. Wenn Du die KNK mitfinanzierst, ist hier 0.') +
      cardS('Dein EK nur anlegen · 10 J', anlage10, 'EK × Zinsen p.a.', false,
        'EK nur anlegen',
        'Was aus Deinem eingesetzten EK geworden wäre, wenn Du es stattdessen nur angelegt hättest.\n\nFormel: eingesetztes EK × (1 + EK-Verzinsung)^10\n\nDen Zinssatz unten am Slider kannst Du frei wählen.') +
      cardS('★ Dein EK in Immobilie · 10 J', immobil10, (delta >= 0 ? '+ ' : '− ') + fmtBig(Math.abs(delta)).replace(' €','') + ' € ggü. Anlage', true,
        'EK in Immobilie',
        'Was Dein eingesetztes EK über die Immobilie für Dich gearbeitet hat: der Verkaufserlös nach 10 J. (Marktwert − Restschuld) plus die Summe Deiner Cashflows aus der Mieteinnahme, ebenfalls mit dem Anlage-Zinssatz verzinst.\n\nFormel: (Marktwert − Restschuld) + verzinster kumulierter CF\n\nDas EK selbst ist als Kaufnebenkosten weg — der Hebel macht den Unterschied.');
  }
  if (chartS) chartS.destroy();
  chartS = new Chart(document.getElementById('chart-sparen'), {
    type: 'line',
    data: {
      labels: sparenLbls,
      datasets: [
        {
          label: 'EK nur anlegen',
          data: sparenNur,
          borderColor: 'rgba(122,122,114,0.6)',
          backgroundColor: 'rgba(122,122,114,0.08)',
          borderWidth: 1.5,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
          fill: 'origin',
          order: 2,
        },
        {
          label: '★ EK in Immobilie',
          data: sparenMit,
          borderColor: '#2D6E47',
          backgroundColor: 'rgba(34,84,61,0.18)',
          borderWidth: 3,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#2D6E47',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          fill: 'origin',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { font: { size: 11 } }, grid: { display: false } },
        y: {
          ticks: {
            callback: (v) => (typeof v === 'number' && Math.abs(v) >= 1000)
              ? Math.round(v / 1000) + 'k €'
              : Math.round(v) + ' €'
          },
        },
      },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 14, padding: 12, font: { size: 11 } } },
        tooltip: {
          mode: 'index', intersect: false,
          backgroundColor: 'rgba(33,33,28,0.94)',
          callbacks: {
            label: (ctx) => ctx.dataset.label + ': ' + Math.round(ctx.parsed.y).toLocaleString('de-DE') + ' €',
          }
        }
      }
    }
  });
}

async function saveSnapshot() {
  // WE-Bezeichnung mit Projekt-Kontext zusammenbauen (Edgar's Wunsch: Projekt im WE-Feld).
  const fmtWeBez = (w) => {
    if (!w) return '';
    const projekt = w.projektName || '';
    const lage = w.lageText || w.lage || (w.weNr ? 'WE ' + w.weNr : '');
    return [projekt, lage].filter(Boolean).join(' — ') || w.id;
  };
  // Bezeichnung & WE-Label kontextbezogen erzeugen (Einzel vs. Paket)
  let weBez, defaultBez;
  // QA-Fix 2026-05-23 (Audit PD-7): Default-Name mit HH:MM, damit mehrere
  // Snapshots am gleichen Tag nicht denselben Namen kollidieren. Datum vorne
  // (sortier-freundlich), dann WE-Bez. Edgar findet so später schneller wieder.
  const now = new Date();
  const heuteStr = now.toLocaleDateString('de-DE');
  const uhrStr = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
  const dtStr = heuteStr + ' ' + uhrStr;
  if (state.kalk._isPaket && Array.isArray(state.kalk._paketWeIds) && state.kalk._paketWeIds.length > 0) {
    const labels = state.kalk._paketWeIds.map(wid => {
      const w = (state.wohneinheiten || []).find(x => x.id === wid);
      return fmtWeBez(w) || wid;
    });
    weBez = 'Paket: ' + labels.join(' + ');
    defaultBez = `${dtStr} — Paket (${state.kalk._paketWeIds.length} WE)`;
  } else {
    const w = (state.wohneinheiten || []).find(x => x.id === state.kalk._weId);
    weBez = fmtWeBez(w) || state.kalk._weLage || '';
    defaultBez = weBez ? `${dtStr} — ${weBez}` : dtStr;
  }
  // QA-Sprint 2026-05-23 (Audit-G G-B3): Snapshot-Bezeichnung jetzt via Modal statt
  // window.prompt — anti-2003-Optik. Async-Wrapper damit's wie ein normaler Modal-Flow
  // läuft. Bei „Abbrechen" → Promise resolved zu null.
  // QA-Fix 2026-05-23 (Audit-EE-5): Bei silent abort durch Esc/X → null = wirklich
  // Abbruch. Wenn Modal mit leerer Bezeichnung „bestätigt" wird (User löscht
  // Default-Text und klickt Speichern) → openSnapshotNameModal liefert null
  // statt "" — wir können das also nicht unterscheiden. Workaround: das Modal
  // selbst verhindert leere Eingabe via OK-Button (siehe openSnapshotNameModal).
  // Hier explizit defensiv: wenn null → Toast, dass der User wahrscheinlich
  // den Default gelöscht hat, und mit Default fallback erneut anfragen.
  const bez = await openSnapshotNameModal(defaultBez);
  if (!bez) return; // Echter Abbruch (Cancel-Button / Esc / Klick außerhalb).
  try {
    const snap = await api.post('/api/snapshots', {
      kundeId: state.kundeId,
      weId: state.kalk._weId || null,
      weBezeichnung: weBez,
      pdfTyp: 'Investitionsrechnung',
      kalkJson: state.kalk,
      bezeichnung: bez,
    });
    // POST-Response ist schon der gemappte Snapshot, aber Sicherheit halber gleich
    // vom Backend neu laden, damit die Liste immer aktuell ist (auch nach Reload).
    // Snapshot ist gespeichert → Dirty-Flag clearen (EE-1).
    clearKalkDirty();
    try {
      const reloaded = await api.get('/api/snapshots?kundeId=' + state.kundeId);
      state.snapshots = Array.isArray(reloaded) ? reloaded : [snap];
    } catch (_) {
      // Fallback: nur den neuen lokal vorn anhängen
      state.snapshots.unshift(snap);
    }
    toast('Snapshot "' + bez + '" gespeichert', 'success');
    // Welle 5 (2026-05-24): Audit-Log — Snapshot-Erstellung in Aktivitäten loggen.
    // Macht Plan-vs-Ist-Vergleich später nachvollziehbar (Maurice's „welche Annahmen
    // gab's beim Pitch"). Fire-and-forget, nicht warten.
    try { _appendActivityToNotizen(`Snapshot „${bez}" erstellt${weBez ? ' für ' + weBez : ''}`); } catch {}
    // Wenn wir gerade im Snapshots-Tab sind, sofort neu rendern.
    if (state.tab === 'snapshots') renderTabSnapshots();
    // QA-Fix 2026-05-23 (Edgar-Doc Bug-4): Tour re-rendern damit detectCompleted
    // für „Snapshot speichern" greift und automatisch zum nächsten Step springt.
    if (typeof _tourRerender === 'function') _tourRerender();
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}
window.saveSnapshot = saveSnapshot;

// QA-Sprint 2026-05-23 (Audit-K B-K3): Debounce gegen PDF-Doppelklick. Vorher löste
// 3× schnelles Klicken 3× Toast + 3× _doPrint aus. Lock dauert 3s — danach wieder
// klickbar. Reicht für Browser-Print-Dialog zum Öffnen.
let _pdfExportLock = 0;
function _pdfExportGuard() {
  const now = Date.now();
  if (now - _pdfExportLock < 3000) {
    toast('PDF wird gerade erstellt — bitte kurz warten', 'warning');
    return false;
  }
  _pdfExportLock = now;
  return true;
}
// QA-Fix 2026-05-23 (Audit-EE-9): während PDF-Erstellung Buttons visuell
// disabled + Text „PDF wird erstellt…". Vorher klickte man, nichts passierte
// sofort, User klickte erneut → Lock-Toast. Jetzt sofort eindeutiges Feedback.
function _pdfButtonBusy(matchOnclick, label) {
  const btns = Array.from(document.querySelectorAll(`button[onclick*="${matchOnclick}"]`));
  btns.forEach(b => {
    if (!b.dataset.prevText) b.dataset.prevText = b.textContent;
    b.disabled = true;
    b.textContent = label;
  });
  return btns;
}
function _pdfButtonRelease(btns) {
  btns.forEach(b => {
    if (b.dataset.prevText) {
      b.textContent = b.dataset.prevText;
      delete b.dataset.prevText;
    }
    b.disabled = false;
  });
}
function exportInvestPdf() {
  if (!_pdfExportGuard()) return;
  if (window.PDF && window.PDF.investitionsrechnung) {
    toast('PDF wird erstellt — Druckdialog öffnet sich', 'info');
    const btns = _pdfButtonBusy('exportInvestPdf', 'PDF wird erstellt…');
    setTimeout(() => {
      try {
        window.PDF.investitionsrechnung(state.kunde, state.kalk, state.kalkResult, state.user);
        // Audit-Log: PDF-Export in Aktivitäten-Historie loggen (Edgar-Feedback 24.05.2026).
        // Wird nicht bei jedem Druckdialog-Abbruch geloggt — wir registrieren den Trigger.
        try {
          const w = state.kalk && state.kalk._weId ? (state.wohneinheiten || []).find(x => x.id === state.kalk._weId) : null;
          const label = w ? ((w.projektName ? w.projektName + ' · ' : '') + (w.lageText || 'WE ' + w.weNr)) : '';
          _appendActivityToNotizen(`Investitions-PDF erstellt${label ? ' für ' + label : ''}`);
        } catch {}
      }
      finally { setTimeout(() => _pdfButtonRelease(btns), 2500); }
    }, 100);
  } else { alert('PDF-Modul nicht geladen.'); }
}
function exportReservPdf() {
  if (!_pdfExportGuard()) return;
  if (window.PDF && window.PDF.reservierung) {
    toast('Reservierungs-PDF wird erstellt', 'info');
    const btns = _pdfButtonBusy('exportReservPdf', 'PDF wird erstellt…');
    setTimeout(() => {
      try { window.PDF.reservierung(state.kunde, state.kalk, state.user); }
      finally { setTimeout(() => _pdfButtonRelease(btns), 2500); }
    }, 100);
  }
}
function exportSaPdf() {
  if (!_pdfExportGuard()) return;
  if (window.PDF && window.PDF.selbstauskunft) {
    toast('Selbstauskunft-PDF wird erstellt', 'info');
    const btns = _pdfButtonBusy('exportSaPdf', 'PDF wird erstellt…');
    setTimeout(() => {
      try { window.PDF.selbstauskunft(state.kunde, state.user); }
      finally { setTimeout(() => _pdfButtonRelease(btns), 2500); }
    }, 100);
  }
}
window.exportInvestPdf = exportInvestPdf;
window.exportReservPdf = exportReservPdf;
window.exportSaPdf = exportSaPdf;

// QA-Fix 2026-05-23 (Edgar-Doc Bug-10): Modal für Invest-Doc — wählen zwischen
// Per Mail an Kunden senden oder als PDF herunterladen.
function openInvestDocModal() {
  if (!state.kunde || !state.kundeId) {
    toast('Erst einen Kunden auswählen', 'warning');
    return;
  }
  if (!state.kalk || !state.kalk._weId) {
    toast('Erst eine Wohneinheit im Kalkulator wählen', 'warning');
    return;
  }
  _reservEnsureStyles();
  const existing = document.getElementById('bbk-invest-modal');
  if (existing) existing.remove();
  const ov = document.createElement('div');
  ov.id = 'bbk-invest-modal';
  ov.className = 'reserv-modal-overlay';
  const kEmail = state.kunde.email || '';
  const kName = (state.kunde.vorname || '') + ' ' + (state.kunde.nachname || '');
  ov.innerHTML = `
    <div class="reserv-modal">
      <h2>Investitions-Doc</h2>
      <div class="reserv-modal-body">
        <p style="margin:0 0 16px 0;line-height:1.5;">Wähle wie Du die Investitions-Doc weitergeben willst:</p>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <button type="button" class="reserv-confirm" id="invest-download-btn" style="width:100%;text-align:left;padding:14px 18px;">
            ⬇ Als PDF herunterladen
            <div style="font-size:11px;font-weight:normal;margin-top:4px;opacity:0.85;">Browser-Druckdialog → „Als PDF speichern". Empfohlen — Du kannst die PDF dann anschauen und selbst per Mail/WhatsApp weitergeben.</div>
          </button>
          <button type="button" class="reserv-confirm" id="invest-mail-btn" ${kEmail ? '' : 'disabled title="Kunde hat keine E-Mail in Airtable"'} style="width:100%;text-align:left;padding:14px 18px;background:#fff;color:#1A1A17;border:1px solid var(--accent);">
            ✉ Mail-Vorlage öffnen
            <div style="font-size:11px;font-weight:normal;margin-top:4px;opacity:0.7;">Empfänger: ${esc(kEmail || '(keine E-Mail)')}. Öffnet Dein Mail-Programm mit vorgefülltem Text — Du wählst, was Du anhängst (z.B. das vorher heruntergeladene PDF).</div>
          </button>
        </div>
      </div>
      <div class="reserv-modal-actions">
        <button class="reserv-cancel" id="invest-cancel-btn">Abbrechen</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.onclick = (e) => { if (e.target === ov) close(); };
  document.getElementById('invest-cancel-btn').onclick = close;
  document.getElementById('invest-download-btn').onclick = () => {
    close();
    exportInvestPdf();
  };
  const mailBtn = document.getElementById('invest-mail-btn');
  if (mailBtn) mailBtn.onclick = async () => {
    close();
    sendInvestDocMail();
  };
}
window.openInvestDocModal = openInvestDocModal;

// QA-Fix 2026-05-23 (Edgar-Doc Bug-10): Mail-Versand pragmatisch — Backend-
// Endpoint kommt in Phase 2 (braucht SMTP/SendGrid-Setup). Für heute:
// PDF-Generation + Mailto mit Vorlage + Hinweis dass User PDF anhängen muss.
function sendInvestDocMail() {
  if (!state.kunde || !state.kunde.email) {
    toast('Kunde hat keine E-Mail in Airtable', 'error');
    return;
  }
  if (!state.kalk || !state.kalk._weId) {
    toast('Bitte erst eine WE wählen', 'error');
    return;
  }
  const kundeName = ((state.kunde.vorname || '') + ' ' + (state.kunde.nachname || '')).trim() || 'Investor';
  const w = (state.wohneinheiten || []).find(x => x.id === state.kalk._weId);
  const weLabel = w ? ((w.projektName ? w.projektName + ' · ' : '') + (w.lageText || ('WE ' + w.weNr))) : 'unsere besprochene Wohneinheit';
  const senderName = (state.user && state.user.name) || 'B&B Immo';
  // Mailto-Body — Edgar's Stil: direkt, kein Floskeln-Marathon.
  const subject = `Investitionsanalyse · ${weLabel}`;
  const body = [
    `Hallo ${state.kunde.vorname || ''},`,
    '',
    `anbei wie besprochen die Investitionsanalyse für ${weLabel}.`,
    '',
    'Die Analyse zeigt Vermögensaufbau, Cashflow und Bonität auf 7 Seiten. Bei Fragen melde Dich jederzeit — wir sprechen die Zahlen gerne im Detail durch.',
    '',
    'Beste Grüße',
    senderName,
    '',
    '— B&B Immo GmbH · Burdastraße 33 · 77746 Schutterwald · HRB 727 814 (Freiburg)',
  ].join('\n');
  const mailtoUrl = `mailto:${encodeURIComponent(state.kunde.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  // FS-1 (24.05.2026, Vertriebler HARD-BLOCKER B4): Im Live-Termin war
  // PDF+Mailto gleichzeitig zu chaotisch (Druckdialog + Mailclient öffnen sich).
  // Jetzt: NUR Mailto öffnen. Vertriebler kann vorher (bewusste Entscheidung)
  // PDF separat herunterladen und anhängen. Cleaner Workflow für Screen-Sharing.
  try {
    const w = window.open(mailtoUrl, '_blank');
    if (!w) {
      const a = document.createElement('a');
      a.href = mailtoUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 100);
    }
  } catch {}
  toast('Mail-Vorlage geöffnet — bitte PDF separat über „Als PDF herunterladen" erzeugen und anhängen', 'info');
  // Audit-Log: Mail-Versand
  try {
    _appendActivityToNotizen(`Investitions-Doc-Mail-Vorlage an ${state.kunde.email} geöffnet${weLabel ? ' (' + weLabel + ')' : ''}`);
  } catch {}
}
window.sendInvestDocMail = sendInvestDocMail;

// QA-Fix 2026-05-23 (Audit-X4): Doppelklick-Schutz. Vorher erzeugte ein versehentlicher
// 2. Klick einen zweiten PandaDoc-Vorgang → 2 Docs, doppelte Reservierung, Verwirrung
// beim Kunden. Jetzt: bool-Lock + Button-Disable für die Dauer des Calls.
let _sendReservLock = false;
async function sendReservierungForSignature() {
  if (_sendReservLock) {
    toast('Vorgang läuft bereits — bitte warten', 'info');
    return;
  }
  // Voraussetzungen prüfen (klare Fehlermeldungen statt stiller Disabled-Button)
  if (!state.kundeId) {
    toast('Erst Kunde auswählen', 'error');
    return;
  }
  const weId = state.kalk && state.kalk._weId;
  if (!weId) {
    toast('Erst eine Einzel-Wohnung auswählen (Pakete werden noch nicht unterstützt)', 'error');
    return;
  }
  if (state.kalk._isPaket) {
    toast('Pakete werden bei der digitalen Reservierung noch nicht unterstützt — bitte einzelne WE auswählen', 'error');
    return;
  }
  const kundeEmail = state.kunde && state.kunde.email;
  if (!kundeEmail) {
    toast('Kunde hat keine E-Mail-Adresse in Airtable — bitte ergänzen', 'error');
    return;
  }

  // Kontext für Modal
  const w = (state.wohneinheiten || []).find(x => x.id === weId);
  const weLabel = (w && (w.projektName ? w.projektName + ' — ' : '') + (w.lageText || w.lage || ('WE ' + w.weNr))) || 'die ausgewählte WE';
  const kundeName = (((state.kunde && state.kunde.vorname) || '') + ' ' + ((state.kunde && state.kunde.nachname) || '')).trim() || '(unbekannt)';

  // QA-Fix 2026-05-23 (Audit-Z-1, DSGVO-Blocker): Kunde-Snapshot VOR Modal-Await.
  // Wenn Vertriebler Modal öffnet, dann via Sidebar zu anderem Kunden wechselt
  // und dann bestätigt → Backend bekam neue kundeId aber WE/Modal-Kontext vom
  // alten Kunden. Worst-Case: PandaDoc-Doc an falsche E-Mail. Hier abfangen.
  const _frozenKundeId = state.kundeId;
  const _frozenKundeEmail = kundeEmail;
  const _frozenWeId = weId;

  // Modal 1: Bestätigung vor API-Call
  const userConfirmed = await openReservierungConfirmModal({ kundeName, weLabel, kundeEmail });
  if (!userConfirmed) return;

  // Race-Check: Hat sich der aktive Kunde während Modal-Offen geändert?
  if (state.kundeId !== _frozenKundeId || (state.kalk && state.kalk._weId !== _frozenWeId)) {
    toast('Kunde oder WE wurde während Bestätigung gewechselt — Vorgang abgebrochen. Bitte nochmal starten.', 'warning');
    return;
  }

  // Falls ein Snapshot für diese WE existiert, den jüngsten als Quelle für den Kaufpreis mitschicken.
  let snapshotId = null;
  if (Array.isArray(state.snapshots)) {
    const fitting = state.snapshots
      // API liefert das WE-Feld als `weRecordId` (siehe mappers.js → snapshotRecordToApi).
      // Älterer Code suchte hier nach `s.weRecId` — matched nie → snapshotId blieb null
      // → Backend bekam keinen Snapshot → Mietsubvention fehlte im Doc.
      .filter(s => s && s.weRecordId === weId)
      .sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
    if (fitting[0]) snapshotId = fitting[0].id;
  }

  _sendReservLock = true;
  // Alle „Reservierung digital senden"-Buttons disablen, damit der Click nicht
  // mehrfach ausgelöst werden kann auch wenn der User schnell klickt.
  const _resBtns = Array.from(document.querySelectorAll('button[onclick*="sendReservierungForSignature"]'));
  _resBtns.forEach(b => { b.disabled = true; b.dataset.prevText = b.textContent; b.textContent = 'Sende…'; });
  toast('Erstelle Dokument in PandaDoc…', 'info');
  try {
    const resp = await api.post('/api/reservierung/send-for-signature', {
      kundeId: state.kundeId,
      weId: weId,
      snapshotId: snapshotId
    });
    if (resp && resp.ok && resp.editorUrl) {
      // Modal 2: Doc erstellt → großer Link zum finalen Send
      openReservierungFinalModal({
        editorUrl: resp.editorUrl,
        kundeName,
        weLabel,
        kundeEmail,
        ablauffrist: resp.ablauffrist || ''
      });
    } else if (resp && resp.message) {
      toast(resp.message, 'info');
      if (resp.editorUrl) {
        openReservierungFinalModal({
          editorUrl: resp.editorUrl,
          kundeName,
          weLabel,
          kundeEmail,
          ablauffrist: resp.ablauffrist || '',
          warnung: resp.message
        });
      }
    }
  } catch (e) {
    const hint = e.body && e.body.hint ? ' — ' + e.body.hint : '';
    const detail = e.body && e.body.detail ? ' (' + String(e.body.detail).substring(0, 120) + ')' : '';
    // QA-Fix 2026-05-23 (Audit-EE-8): Bei Network-Fehler nach Doc-Erstellung kann
    // das Doc in PandaDoc trotzdem entstanden sein (Response verloren). Klarer
    // Hinweis, damit Edgar das selbst prüft → kein Doppelversand.
    const pandadocHint = (e.network || e.status === 0 || e.status >= 500)
      ? '\n\n⚠ Bitte in PandaDoc-Drafts prüfen — das Doc könnte trotzdem angelegt worden sein. Sonst Doppelversand riskiert.'
      : '';
    toast('Fehler: ' + (e.message || 'unbekannt') + hint + detail + pandadocHint, 'error');
  } finally {
    _sendReservLock = false;
    _resBtns.forEach(b => { b.disabled = false; if (b.dataset.prevText) { b.textContent = b.dataset.prevText; delete b.dataset.prevText; } });
  }
}
window.sendReservierungForSignature = sendReservierungForSignature;

// --- Modal-Helpers für die Reservierungs-Flow ---

function _reservEscapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function _reservEnsureStyles() {
  if (document.getElementById('reserv-modal-styles')) return;
  const s = document.createElement('style');
  s.id = 'reserv-modal-styles';
  s.textContent = `
    .reserv-modal-overlay {
      position: fixed; inset: 0; background: rgba(33,33,28,0.55);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999; padding: 20px; backdrop-filter: blur(2px);
      animation: reservFadeIn 0.15s ease-out;
    }
    @keyframes reservFadeIn { from { opacity: 0; } to { opacity: 1; } }
    .reserv-modal {
      background: #fbf9f4; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.3);
      max-width: 520px; width: 100%; padding: 28px; font-family: inherit;
      color: #1a1a1a; animation: reservSlideUp 0.2s ease-out;
    }
    @keyframes reservSlideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .reserv-modal h2 { margin: 0 0 16px 0; font-size: 1.4em; font-weight: 600; }
    .reserv-modal .reserv-modal-body { line-height: 1.5; font-size: 0.97em; }
    .reserv-modal .reserv-modal-body p { margin: 6px 0; }
    .reserv-modal .reserv-info-row { display: flex; padding: 6px 0; border-bottom: 1px solid #eae6df; }
    .reserv-modal .reserv-info-row:last-of-type { border-bottom: none; }
    .reserv-modal .reserv-info-label { width: 140px; color: #6b6b6b; font-size: 0.9em; }
    .reserv-modal .reserv-info-value { flex: 1; }
    .reserv-modal .reserv-modal-actions {
      display: flex; gap: 10px; margin-top: 22px; justify-content: flex-end; align-items: center;
    }
    .reserv-modal .reserv-modal-actions button,
    .reserv-modal .reserv-modal-actions a.reserv-cta {
      padding: 10px 18px; border-radius: 6px; cursor: pointer; font-size: 0.95em;
      border: none; font-family: inherit; text-decoration: none; display: inline-block;
    }
    .reserv-modal .reserv-cancel {
      background: transparent; color: #6b6b6b; border: 1px solid #d4d0ca;
    }
    .reserv-modal .reserv-cancel:hover { background: #f0ece5; }
    /* FS-1 (24.05.2026, UX-Designer BLOCKER #2): Schwarz/Weiß-Buttons auf
       Bronze-Accent umgestellt — vorher fremde Marken-Identität im Reserv-Modal. */
    .reserv-modal .reserv-confirm {
      background: #B08A4D; color: #fff;
    }
    .reserv-modal .reserv-confirm:hover { background: #8E6E3D; }
    .reserv-modal a.reserv-cta {
      background: #B08A4D; color: #fff; font-weight: 500;
    }
    .reserv-modal a.reserv-cta:hover { background: #8E6E3D; }
    .reserv-modal .reserv-hint {
      margin-top: 14px; padding: 10px 12px; background: #fff5e1; border-left: 3px solid #d9a200;
      font-size: 0.88em; color: #6b5400; border-radius: 4px;
    }
    .reserv-modal .reserv-success { color: #2d7a3e; font-weight: 500; }
    .reserv-modal .reserv-checkbox-row {
      margin-top: 18px; padding: 14px; background: #f0ece5; border-radius: 8px;
      border: 1px solid #e0dac9;
    }
    .reserv-modal .reserv-checkbox-label {
      display: flex; gap: 12px; align-items: flex-start; cursor: pointer;
    }
    .reserv-modal .reserv-checkbox-label input[type="checkbox"] {
      margin-top: 3px; width: 18px; height: 18px; cursor: pointer; flex-shrink: 0;
      accent-color: #1a1a1a;
    }
    .reserv-modal .reserv-checkbox-text { flex: 1; }
    .reserv-modal .reserv-checkbox-hint {
      margin-top: 4px; font-size: 0.85em; color: #6b6b6b; line-height: 1.4;
    }
    .reserv-modal .reserv-confirm:disabled {
      background: #d4d0ca; color: #8a8a85; cursor: not-allowed;
    }
    .reserv-modal .reserv-confirm:disabled:hover { background: #d4d0ca; }
  `;
  document.head.appendChild(s);
}

function openReservierungConfirmModal({ kundeName, weLabel, kundeEmail }) {
  _reservEnsureStyles();
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'reserv-modal-overlay';
    m.innerHTML =
      '<div class="reserv-modal">' +
        '<h2>Reservierung vorbereiten</h2>' +
        '<div class="reserv-modal-body">' +
          '<div class="reserv-info-row"><div class="reserv-info-label">Käufer</div><div class="reserv-info-value">' + _reservEscapeHtml(kundeName) + '</div></div>' +
          '<div class="reserv-info-row"><div class="reserv-info-label">Wohnung</div><div class="reserv-info-value">' + _reservEscapeHtml(weLabel) + '</div></div>' +
          '<div class="reserv-info-row"><div class="reserv-info-label">E-Mail Käufer</div><div class="reserv-info-value">' + _reservEscapeHtml(kundeEmail) + '</div></div>' +
          '<p style="margin-top:14px; color:#555;">Das Dokument wird in PandaDoc mit allen Daten erstellt. Danach kannst du es direkt aufrufen und versenden.</p>' +
          '<div class="reserv-checkbox-row">' +
            '<label class="reserv-checkbox-label">' +
              '<input type="checkbox" id="reserv-snapshot-check" />' +
              '<div class="reserv-checkbox-text">' +
                '<strong>Ich habe einen aktuellen Snapshot der Kalkulation gespeichert.</strong>' +
                '<div class="reserv-checkbox-hint">Der Snapshot friert Kaufpreis, Mietsubvention und alle Berechnungen ein — diese Werte landen 1:1 im Reservierungsdokument. Ohne Snapshot fehlen Subventions-Daten im Doc.</div>' +
              '</div>' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div class="reserv-modal-actions">' +
          '<button class="reserv-cancel" id="reserv-cancel-btn">Abbrechen</button>' +
          '<button class="reserv-confirm" id="reserv-confirm-btn" disabled>Dokument erstellen</button>' +
        '</div>' +
      '</div>';
    const close = (ok) => { m.remove(); resolve(ok); };
    const btn = m.querySelector('#reserv-confirm-btn');
    const chk = m.querySelector('#reserv-snapshot-check');
    chk.onchange = () => { btn.disabled = !chk.checked; };
    m.querySelector('#reserv-cancel-btn').onclick = () => close(false);
    btn.onclick = () => { if (!btn.disabled) close(true); };
    m.onclick = (e) => { if (e.target === m) close(false); };
    document.body.appendChild(m);
    setTimeout(() => { chk.focus(); }, 50);
  });
}

function openReservierungFinalModal({ editorUrl, kundeName, weLabel, kundeEmail, ablauffrist, warnung }) {
  _reservEnsureStyles();
  const m = document.createElement('div');
  m.className = 'reserv-modal-overlay';
  m.innerHTML =
    '<div class="reserv-modal">' +
      '<h2><span class="reserv-success">✓</span> Reservierung steht bereit</h2>' +
      '<div class="reserv-modal-body">' +
        '<p>Das Dokument für <strong>' + _reservEscapeHtml(kundeName) + '</strong> ist in PandaDoc vorbereitet und vollständig ausgefüllt.</p>' +
        '<div class="reserv-info-row" style="margin-top:12px;"><div class="reserv-info-label">Wohnung</div><div class="reserv-info-value">' + _reservEscapeHtml(weLabel) + '</div></div>' +
        '<div class="reserv-info-row"><div class="reserv-info-label">E-Mail Käufer</div><div class="reserv-info-value">' + _reservEscapeHtml(kundeEmail) + '</div></div>' +
        (ablauffrist ? '<div class="reserv-info-row"><div class="reserv-info-label">Reservierung bis</div><div class="reserv-info-value">' + _reservEscapeHtml(ablauffrist) + '</div></div>' : '') +
        '<div class="reserv-hint">Klick auf den Button unten öffnet PandaDoc direkt am Doc. Dort prüfst du kurz, säuberst ggf. den Doc-Namen (z.B. „[DEV]" entfernen) und klickst oben rechts auf <strong>„Dokument senden"</strong>.</div>' +
        (warnung ? '<p style="margin-top:10px;color:#a35200;font-size:0.9em;">' + _reservEscapeHtml(warnung) + '</p>' : '') +
      '</div>' +
      '<div class="reserv-modal-actions">' +
        '<button class="reserv-cancel" id="reserv-close-btn">Schließen</button>' +
        '<a class="reserv-cta" href="' + _reservEscapeHtml(editorUrl) + '" target="_blank" rel="noopener" id="reserv-cta-link">→ Reservierung final senden</a>' +
      '</div>' +
    '</div>';
  const close = () => m.remove();
  m.querySelector('#reserv-close-btn').onclick = close;
  m.querySelector('#reserv-cta-link').addEventListener('click', () => { setTimeout(close, 300); });
  m.onclick = (e) => { if (e.target === m) close(); };
  document.body.appendChild(m);
  setTimeout(() => { const a = m.querySelector('#reserv-cta-link'); if (a) a.focus(); }, 50);
}

// ===== SA via PandaDoc — Versand-Workflow (Iter 84, 22.05.2026) =====
// Analog zur Reservierung: Bestätigungs-Modal → API-Call → Editor-Link.
// Frontend generiert das HTML via PDF.selbstauskunftHtmlForPandaDoc() und schickt
// es an /api/sa/send-for-signature. Backend rendert via Puppeteer zu PDF und
// uploaded zu PandaDoc mit parse_form_fields:true → Field-Tags werden erkannt.

// QA-Fix 2026-05-23 (Audit-X4): Lock auch für SA-Versand (gleiches Risiko).
let _sendSaLock = false;
async function sendSaForSignature() {
  if (_sendSaLock) {
    toast('Vorgang läuft bereits — bitte warten', 'info');
    return;
  }
  if (!state.kundeId) {
    toast('Erst Kunde auswählen', 'error');
    return;
  }
  if (!state.kunde) {
    toast('Kunde nicht geladen — Tab neu laden', 'error');
    return;
  }
  // saJson aus state oder Kunde
  let sa = state._sa || state.kunde.saJson;
  if (typeof sa === 'string') { try { sa = JSON.parse(sa); } catch { sa = null; } }
  if (!sa || !sa.antragsteller) {
    toast('Selbstauskunft ist leer — bitte erst ausfüllen und speichern', 'error');
    return;
  }
  const a = sa.antragsteller || {};
  const m = sa.mitantragsteller || {};
  const gemeinsam = sa.gemeinsam === true;

  if (!a.email) {
    toast('E-Mail des Antragstellers fehlt in der SA', 'error');
    return;
  }
  if (gemeinsam && !m.email) {
    toast('E-Mail des Mitantragstellers fehlt in der SA', 'error');
    return;
  }

  // QA-Sprint 2026-05-23 (Audit-K B-K2): Bank-Pflichtfeld-Check vor PandaDoc-Send.
  // Audit-H hatte aufgedeckt: halb-leere SAs waren absendbar. Bank-Sachbearbeiter
  // schickte sie zurück. Jetzt: Liste der fehlenden Pflichtfelder zeigen statt
  // blind absenden. Vertriebler bestätigt explizit, wenn er trotzdem senden will.
  function _pflichtfehlend(p) {
    const fehlt = [];
    if (!p.vorname || !p.name) fehlt.push('Vor-/Nachname');
    if (!p.geburtsdatum) fehlt.push('Geburtsdatum');
    if (!p.strasse || !p.plz || !p.ort) fehlt.push('Anschrift');
    if (!p.steuerId && !p.steuerid) fehlt.push('Steuer-ID');
    if (!p.iban) fehlt.push('IBAN');
    if (!p.bruttoMo && !p.brutto) fehlt.push('Brutto-Einkommen');
    if (!p.steuerklasse) fehlt.push('Steuerklasse');
    return fehlt;
  }
  const fehlA = _pflichtfehlend(a);
  const fehlM = gemeinsam ? _pflichtfehlend(m) : [];
  if (fehlA.length || fehlM.length) {
    const parts = [];
    if (fehlA.length) parts.push('Antragsteller: ' + fehlA.join(', '));
    if (fehlM.length) parts.push('Mitantragsteller: ' + fehlM.join(', '));
    const msg = 'Bank-Pflichtfelder fehlen — die Bank wird die SA zurückschicken:\n\n' + parts.join('\n\n') + '\n\nTrotzdem senden? (Nicht empfohlen.)';
    if (!window.confirm(msg)) {
      toast('SA-Versand abgebrochen — bitte Pflichtfelder ergänzen', 'warning');
      return;
    }
  }

  const kundeName = ((a.vorname || '') + ' ' + (a.name || '')).trim() || '(ohne Name)';
  const mitName = gemeinsam ? ((m.vorname || '') + ' ' + (m.name || '')).trim() : null;

  // QA-Fix 2026-05-23 (Audit-Z-1, DSGVO-Blocker): siehe sendReservierungForSignature.
  const _frozenKundeId = state.kundeId;

  // Modal 1: Bestätigung vor API-Call
  const userConfirmed = await openSaConfirmModal({ kundeName, kundeEmail: a.email, mitName, mitEmail: gemeinsam ? m.email : null });
  if (!userConfirmed) return;

  if (state.kundeId !== _frozenKundeId) {
    toast('Kunde wurde während Bestätigung gewechselt — SA-Versand abgebrochen. Bitte nochmal starten.', 'warning');
    return;
  }

  // HTML generieren (im Browser, mit Inline-CSS für PandaDoc)
  if (!window.PDF || typeof window.PDF.selbstauskunftHtmlForPandaDoc !== 'function') {
    toast('PDF-Modul nicht aktuell — Seite neu laden (Cache-Bust)', 'error');
    return;
  }
  // collectSaFromDOM stellt sicher, dass state._sa den aktuellen UI-Stand hat
  collectSaFromDOM();
  state.kunde.saJson = state._sa;
  const html = window.PDF.selbstauskunftHtmlForPandaDoc(state.kunde, state.user);

  _sendSaLock = true;
  const _saBtns = Array.from(document.querySelectorAll('button[onclick*="sendSaForSignature"]'));
  _saBtns.forEach(b => { b.disabled = true; b.dataset.prevText = b.textContent; b.textContent = 'Sende…'; });
  toast('Erstelle Dokument in PandaDoc… (kann 10-15 Sek dauern)', 'info');
  try {
    const resp = await api.post('/api/sa/send-for-signature', {
      kundeId: state.kundeId,
      html,
    });
    if (resp && resp.ok && resp.editorUrl) {
      openSaFinalModal({
        editorUrl: resp.editorUrl,
        kundeName,
        kundeEmail: a.email,
        mitName,
        mitEmail: gemeinsam ? m.email : null,
        message: resp.message,
      });
    } else if (resp && resp.message) {
      toast(resp.message, 'info');
      if (resp.editorUrl) {
        openSaFinalModal({
          editorUrl: resp.editorUrl,
          kundeName,
          kundeEmail: a.email,
          mitName,
          mitEmail: gemeinsam ? m.email : null,
          message: resp.message,
          warnung: resp.message,
        });
      }
    } else {
      toast('Unerwartete Antwort vom Server', 'error');
    }
  } catch (e) {
    toast('Fehler: ' + (e && e.message ? e.message : 'Unbekannt'), 'error');
  } finally {
    _sendSaLock = false;
    _saBtns.forEach(b => { b.disabled = false; if (b.dataset.prevText) { b.textContent = b.dataset.prevText; delete b.dataset.prevText; } });
  }
}
window.sendSaForSignature = sendSaForSignature;

// Welle SA-Portal (Edgar 24.05.2026): Link erzeugen + Modal mit Copy-Button + Mail-Vorlage.
// Kunde klickt Link → öffnet sa-portal.html mit Token → füllt SA selbst aus → speichert direkt
// in die Kunden-saJson. Vertriebler bekommt Aktivitäts-Log-Eintrag.
async function generateSaPortalLink() {
  if (!state.kundeId) { toast('Bitte erst Kunde wählen', 'error'); return; }
  try {
    const data = await api.post('/api/sa-portal/generate', { kundeId: state.kundeId });
    if (!data || !data.url) { toast('Keine URL zurückbekommen', 'error'); return; }
    _showSaPortalLinkModal(data.url, data.expiresAt);
    // Aktivitäts-Log
    try { _appendActivityToNotizen(`SA-Portal-Link für Kunden erzeugt (gültig bis ${new Date(data.expiresAt).toLocaleDateString('de-DE')})`); } catch {}
  } catch (e) {
    toast('Fehler beim Erzeugen: ' + (e.message || ''), 'error');
  }
}
window.generateSaPortalLink = generateSaPortalLink;

function _showSaPortalLinkModal(url, expiresAt) {
  const expDate = new Date(expiresAt).toLocaleDateString('de-DE');
  const kunde = state.kunde || {};
  const kundeName = ((kunde.vorname || '') + ' ' + (kunde.nachname || '')).trim() || 'Kunde';
  const senderName = (state.user && state.user.name) || 'B&B Immo';
  const mailBody = [
    `Hallo ${kunde.vorname || ''},`,
    '',
    'wie besprochen — hier der Link, mit dem Du die Selbstauskunft online ausfüllen kannst:',
    '',
    url,
    '',
    `Der Link ist 14 Tage gültig (bis ${expDate}). Du kannst zwischendurch zwischenspeichern und später weitermachen — die Daten landen direkt bei uns.`,
    '',
    'Bei Fragen melde Dich jederzeit.',
    '',
    'Beste Grüße',
    senderName,
  ].join('\n');
  const subject = `Selbstauskunft online ausfüllen — B&B Immo`;
  const mailtoUrl = `mailto:${encodeURIComponent(kunde.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`;

  let modalEl = document.getElementById('sa-portal-modal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'sa-portal-modal';
    document.body.appendChild(modalEl);
  }
  modalEl.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(26,26,23,.55);z-index:140;display:flex;align-items:center;justify-content:center;padding:24px;" onclick="if(event.target===this)window._saPortalClose()">
      <div style="background:#FBFAF7;border-radius:12px;max-width:640px;width:100%;box-shadow:0 24px 64px rgba(26,26,23,.32);overflow:hidden;">
        <div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:start;justify-content:space-between;gap:14px;">
          <div>
            <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;">SA-Portal-Link</div>
            <div style="font-size:17px;font-weight:600;color:var(--text-primary);margin-top:2px;">Für ${esc(kundeName)} erzeugt</div>
          </div>
          <button onclick="window._saPortalClose()" style="background:transparent;border:1px solid var(--border);padding:4px 10px;font-size:13px;border-radius:6px;cursor:pointer;font-family:inherit;">✕</button>
        </div>
        <div style="padding:20px 22px;">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">Der Kunde klickt diesen Link → öffnet eine vereinfachte SA-Maske → füllt aus → speichert. Du siehst das Ergebnis direkt im SA-Tab.</div>
          <div style="display:flex;gap:8px;margin:10px 0 16px;">
            <input type="text" readonly value="${esc(url)}" id="sa-portal-url" style="flex:1;padding:8px 12px;font-size:12px;border:1px solid var(--border);border-radius:5px;font-family:ui-monospace,monospace;background:var(--bg-cream-subtle);" onclick="this.select()">
            <button onclick="window._saPortalCopy()" id="sa-portal-copy-btn" class="secondary" style="padding:6px 14px;font-size:12px;white-space:nowrap;">Link kopieren</button>
          </div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:14px;">Gültig bis <strong>${expDate}</strong> · danach ist der Link automatisch ungültig.</div>
          <div style="border-top:1px solid var(--border);padding-top:14px;">
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">Per Mail an den Kunden:</div>
            <div style="display:flex;gap:8px;">
              ${kunde.email ? `<a href="${esc(mailtoUrl)}" target="_blank" rel="noopener" class="btn" style="display:inline-block;text-decoration:none;background:var(--accent);color:#fff;padding:8px 16px;font-size:13px;border-radius:5px;">→ Mail-Vorlage öffnen (${esc(kunde.email)})</a>` : '<span class="text-tertiary text-small">⚠ Kunde hat keine E-Mail in Airtable</span>'}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
window._saPortalClose = function() { const m = document.getElementById('sa-portal-modal'); if (m) m.remove(); };
window._saPortalCopy = async function() {
  const inp = document.getElementById('sa-portal-url');
  if (!inp) return;
  try {
    await navigator.clipboard.writeText(inp.value);
    const btn = document.getElementById('sa-portal-copy-btn');
    if (btn) { const o = btn.textContent; btn.textContent = '✓ Kopiert'; setTimeout(() => { btn.textContent = o; }, 1500); }
  } catch (e) {
    inp.select();
    document.execCommand('copy');
    toast('Link kopiert (Fallback)', 'success');
  }
};

function openSaConfirmModal({ kundeName, kundeEmail, mitName, mitEmail }) {
  _reservEnsureStyles();  // gleiches CSS wie Reservierungs-Modal
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'reserv-modal-overlay';
    m.innerHTML =
      '<div class="reserv-modal">' +
        '<h2>Selbstauskunft via PandaDoc</h2>' +
        '<div class="reserv-modal-body">' +
          '<div class="reserv-info-row"><div class="reserv-info-label">Antragsteller</div><div class="reserv-info-value">' + _reservEscapeHtml(kundeName) + '</div></div>' +
          '<div class="reserv-info-row"><div class="reserv-info-label">E-Mail</div><div class="reserv-info-value">' + _reservEscapeHtml(kundeEmail) + '</div></div>' +
          (mitName ? '<div class="reserv-info-row"><div class="reserv-info-label">Mit-Antragsteller</div><div class="reserv-info-value">' + _reservEscapeHtml(mitName) + '</div></div>' : '') +
          (mitEmail ? '<div class="reserv-info-row"><div class="reserv-info-label">E-Mail (Mit)</div><div class="reserv-info-value">' + _reservEscapeHtml(mitEmail) + '</div></div>' : '') +
          '<p style="margin-top:14px; color:#555;">Die Selbstauskunft wird als PDF in PandaDoc hochgeladen. Field-Tags für Signatur und Datum werden automatisch erkannt. Danach kannst du das Doc prüfen und versenden.</p>' +
          '<p style="margin-top:8px; color:#a35200; font-size:0.9em;">Voraussetzung: SA muss vollständig ausgefüllt + gespeichert sein. Field-Tags in PandaDoc-Workspace müssen aktiviert sein (Settings → Workspace → Field Tags).</p>' +
        '</div>' +
        '<div class="reserv-modal-actions">' +
          '<button class="reserv-cancel" id="sa-cancel-btn">Abbrechen</button>' +
          '<button class="reserv-confirm" id="sa-confirm-btn">Dokument erstellen</button>' +
        '</div>' +
      '</div>';
    const close = (ok) => { m.remove(); resolve(ok); };
    m.querySelector('#sa-cancel-btn').onclick = () => close(false);
    m.querySelector('#sa-confirm-btn').onclick = () => close(true);
    m.onclick = (e) => { if (e.target === m) close(false); };
    document.body.appendChild(m);
    setTimeout(() => { const b = m.querySelector('#sa-confirm-btn'); if (b) b.focus(); }, 50);
  });
}

function openSaFinalModal({ editorUrl, kundeName, kundeEmail, mitName, mitEmail, message, warnung }) {
  _reservEnsureStyles();
  const m = document.createElement('div');
  m.className = 'reserv-modal-overlay';
  m.innerHTML =
    '<div class="reserv-modal">' +
      '<h2><span class="reserv-success">✓</span> Selbstauskunft steht bereit</h2>' +
      '<div class="reserv-modal-body">' +
        '<p>Das Dokument für <strong>' + _reservEscapeHtml(kundeName) + '</strong>' + (mitName ? ' + <strong>' + _reservEscapeHtml(mitName) + '</strong>' : '') + ' ist in PandaDoc vorbereitet.</p>' +
        '<div class="reserv-info-row" style="margin-top:12px;"><div class="reserv-info-label">E-Mail Antragsteller</div><div class="reserv-info-value">' + _reservEscapeHtml(kundeEmail) + '</div></div>' +
        (mitEmail ? '<div class="reserv-info-row"><div class="reserv-info-label">E-Mail Mit-Antragsteller</div><div class="reserv-info-value">' + _reservEscapeHtml(mitEmail) + '</div></div>' : '') +
        '<div class="reserv-hint">Klick auf den Button öffnet PandaDoc direkt am Doc. Dort prüfst du kurz die Signaturfeld-Positionen (sollten an den korrekten Stellen automatisch erkannt sein), passt ggf. den Doc-Namen an und klickst oben rechts auf <strong>„Dokument senden"</strong>.</div>' +
        (warnung ? '<p style="margin-top:10px;color:#a35200;font-size:0.9em;">' + _reservEscapeHtml(warnung) + '</p>' : '') +
      '</div>' +
      '<div class="reserv-modal-actions">' +
        '<button class="reserv-cancel" id="sa-close-btn">Schließen</button>' +
        '<a class="reserv-cta" href="' + _reservEscapeHtml(editorUrl) + '" target="_blank" rel="noopener" id="sa-cta-link">→ In PandaDoc öffnen &amp; senden</a>' +
      '</div>' +
    '</div>';
  const close = () => m.remove();
  m.querySelector('#sa-close-btn').onclick = close;
  m.querySelector('#sa-cta-link').addEventListener('click', () => { setTimeout(close, 300); });
  m.onclick = (e) => { if (e.target === m) close(); };
  document.body.appendChild(m);
  setTimeout(() => { const a = m.querySelector('#sa-cta-link'); if (a) a.focus(); }, 50);
}

// ===== MODUL: views/selbstauskunft-tab (SA-Form + Auswertung + Auto-Save) =====
/* ============================== SELBSTAUSKUNFT-TAB ============================== */

// Feature F-2 (Audit-Iter 49, 19.05.2026): SA-Pflichtfelder-Coverage für Bank-Bonität.
// Vertriebs-Win — Edgar / Henry sehen pro Antragsteller, was die Bank noch braucht,
// bevor sie den Bogen einreichen. Sortiert nach Sektion.
function saCoverage(sa, gemeinsam) {
  if (!sa) return { pct: 0, sektionen: [] };
  // Pflichtfelder pro Person — daraus baut sich die Coverage. Auswahl basiert auf
  // dem typischen Hypovision-Bogen + GwG-Pflicht + Banken-Erfahrungswerten.
  // SA-Redesign (22.05.2026): bruttoMo + steuerklasse rein (Bank rechnet Brutto gegen
  //   Steuerklasse für Netto-Plausibilisierung). probezeit + vorAnschrift waren bisher
  //   nur im PDF erfassbar — Frontend↔PDF-Drift geschlossen.
  // QA-Fix 2026-05-23 (Audit SA-5): IBAN war Pflicht im PandaDoc-Send-Check,
  // aber NICHT in der Coverage-Box → User sah 100 % grün und drückte Senden,
  // dann hagelte Confirm-Dialog rein. Jetzt: IBAN in Coverage drin.
  const pflichtPro = [
    { sek: 'Person',          felder: ['vorname','name','geburtsdatum','strasse','plz','ort','staatsangehoerigkeit','telefonPrivat','email','steuerId','familienstand'] },
    { sek: 'Beruf',           felder: ['beruf','firma','beschaeftigtSeit','befristung','probezeit'] },
    { sek: 'Einkommen',       felder: ['bruttoMo','nettoMo','steuerklasse','anzahlGehaelter'] },
    { sek: 'Bankverbindung',  felder: ['iban'] },
    { sek: 'Fixkosten',       felder: ['mieteMo'] },
    { sek: 'Vermögen',        felder: ['bankguthaben'] },
    { sek: 'GwG-Identität',   felder: ['gwg.ausweisArt','gwg.ausweisNr','gwg.ausweisGueltig'] },
    { sek: 'PEP-Status',      felder: ['pep'] },
    { sek: 'Wohnsituation',   felder: ['wohnsituation'] },
  ];
  const personen = gemeinsam ? [['Antragsteller 1', sa.antragsteller || {}], ['Antragsteller 2', sa.mitantragsteller || {}]]
                              : [['Antragsteller',  sa.antragsteller || {}]];
  function read(obj, path) {
    const parts = path.split('.');
    let v = obj;
    for (const p of parts) { if (v == null) return null; v = v[p]; }
    if (v === '' || v === undefined) return null;
    return v;
  }
  const sektionen = [];
  let totalGesetzt = 0, totalPflicht = 0;
  personen.forEach(([rolle, p]) => {
    pflichtPro.forEach(({ sek, felder }) => {
      const fehlt = [];
      let gesetzt = 0;
      felder.forEach(f => {
        const v = read(p, f);
        if (v == null) fehlt.push(f.split('.').pop()); else gesetzt++;
      });
      sektionen.push({ rolle, sek, gesetzt, gesamt: felder.length, fehlt });
      totalGesetzt += gesetzt;
      totalPflicht += felder.length;
    });
  });
  // sa-weite Pflicht: Herkunft EK mindestens einer markiert
  const ekKeys = ['ersparnisse','wertpapier','erbe','schenkung','immobilien','sonstiges'];
  const ekObj = sa.herkunftEk || {};
  const ekGesetzt = ekKeys.some(k => ekObj[k]) ? 1 : 0;
  sektionen.push({ rolle: 'Gemeinsam', sek: 'Herkunft EK', gesetzt: ekGesetzt, gesamt: 1, fehlt: ekGesetzt ? [] : ['mindestens-1-quelle'] });
  totalGesetzt += ekGesetzt;
  totalPflicht += 1;
  const pct = totalPflicht > 0 ? Math.round((totalGesetzt / totalPflicht) * 100) : 0;
  return { pct, sektionen, totalGesetzt, totalPflicht };
}

function saCoverageHtml() {
  const sa = state._sa || {};
  const cov = saCoverage(sa, sa.gemeinsam === true);
  const ampelKlasse = cov.pct >= 90 ? 'kpi-positive' : cov.pct >= 60 ? 'kpi-primary' : 'kpi-negative';
  const barKlasse   = cov.pct >= 90 ? 'good' : cov.pct >= 60 ? 'mid' : 'low';

  // Gruppieren nach Rolle, dann Sektion
  const byRolle = {};
  cov.sektionen.forEach(s => {
    if (!byRolle[s.rolle]) byRolle[s.rolle] = [];
    byRolle[s.rolle].push(s);
  });

  // Iter 50 Polish: erweiterte Label-Map für alle Pflichtfeld-Pfade,
  // damit „fehlt:"-Liste keine raw Property-Pfade mehr zeigt.
  const labelMap = {
    'vorname': 'Vorname', 'name': 'Nachname', 'geburtsdatum': 'Geburtsdatum',
    'strasse': 'Straße', 'plz': 'PLZ', 'ort': 'Ort',
    'staatsangehoerigkeit': 'Staatsangehörigkeit',
    'telefonPrivat': 'Telefon privat', 'email': 'E-Mail',
    'steuerId': 'Steuer-ID', 'familienstand': 'Familienstand',
    'beruf': 'Beruf', 'firma': 'Arbeitgeber',
    'beschaeftigtSeit': 'Beschäftigt seit', 'befristung': 'Befristung',
    'nettoMo': 'Netto/Mo', 'anzahlGehaelter': 'Anzahl Gehälter',
    'mieteMo': 'Miete eig. Whg', 'pkvMo': 'PKV-Beitrag',
    'bankguthaben': 'Bankguthaben',
    'ausweisArt': 'Ausweisart', 'ausweisNr': 'Ausweis-Nr',
    'ausweisGueltig': 'Ausweis gültig bis',
    'pep': 'PEP-Erklärung',
    'mindestens-1-quelle': 'mindestens eine Quelle ankreuzen',
  };
  const lbl = (f) => labelMap[f] || f;

  const rollenHtml = Object.entries(byRolle).map(([rolle, sekt]) => {
    const rolleGesetzt = sekt.reduce((s, x) => s + x.gesetzt, 0);
    const rolleGesamt  = sekt.reduce((s, x) => s + x.gesamt, 0);
    const istLeer = rolleGesetzt === 0 && rolle !== 'Gemeinsam';
    const items = sekt.map(s => {
      const ok = s.fehlt.length === 0;
      return `<li>
        <strong>${esc(s.sek)}:</strong>
        ${ok
          ? `<span class="audit-pill aktiv size-sm">vollständig</span>`
          : `<span class="audit-pill fehlt size-sm">${s.gesetzt}/${s.gesamt}</span>
             <span class="text-tertiary text-small"> — fehlt: ${s.fehlt.map(f => esc(lbl(f))).join(', ')}</span>`}
      </li>`;
    }).join('');
    const statCls = (rolleGesetzt < rolleGesamt) ? 'rolle-stat warn' : 'rolle-stat';
    return `
      <div class="sa-coverage-rolle${istLeer ? ' leer-hint' : ''}">
        <div class="sa-coverage-rolle-head">
          <span>${esc(rolle)}${istLeer ? ' — komplett leer' : ''}</span>
          <span class="${statCls}">${rolleGesetzt}/${rolleGesamt} Pflichtfelder</span>
        </div>
        ${istLeer
          ? `<div class="text-small">„Gemeinsamer Antrag" ist aktiv, aber dieser Antragsteller hat keine Eingaben. Häkchen oben entfernen oder Daten erfassen.</div>`
          : `<ul class="sa-coverage-list">${items}</ul>`}
      </div>`;
  }).join('');

  return `
    <div class="card sa-auswertung-card mb-16">
      <div class="card-title">SA-Vollständigkeit <span class="text-tertiary text-small" style="font-weight:normal;">(${cov.totalGesetzt} / ${cov.totalPflicht} Pflichtfelder)</span></div>
      <div class="kpi-box ${ampelKlasse}" style="margin-top:8px;">
        <div class="kpi-label">Bank-tauglich</div>
        <div class="kpi-value">${cov.pct} %</div>
        <div class="sa-coverage-progress">
          <div class="sa-coverage-progress-fill ${barKlasse}" style="width:${Math.max(2, cov.pct)}%;"></div>
        </div>
        <div class="kpi-hint">Vollständigkeit der Pflichtangaben über alle Antragsteller. Ziel: 100 % vor Einreichung.</div>
      </div>
      <details class="sa-aufschluss" ${cov.pct < 100 ? 'open' : ''}>
        <summary>${cov.pct < 100 ? 'Was fehlt der Bank noch?' : 'Detail-Coverage anzeigen'}</summary>
        ${rollenHtml}
      </details>
    </div>
  `;
}

function renderTabSelbstauskunft() {
  const el = document.getElementById('tab-content');
  const k = state.kunde;
  // Backend liefert saJson über Mapper bereits als Object (oder null).
  let sa = k.saJson;
  if (typeof sa === 'string') { try { sa = JSON.parse(sa); } catch(e) { sa = null; } }
  if (!sa || typeof sa !== 'object') sa = {};
  if (!sa.antragsteller) sa.antragsteller = {};
  if (!sa.mitantragsteller) sa.mitantragsteller = {};
  if (sa.gemeinsam === undefined) sa.gemeinsam = false;
  state._sa = sa;

  // Stammdaten initial in SA mergen (nicht-überschreibend) — falls Kunde älter ist
  // und die Stammdaten noch nicht in der SA stehen.
  const synced = syncStammdatenInSa();
  if (synced) { sa = synced; state._sa = sa; }
  const istGemeinsam = sa.gemeinsam === true;
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Selbstauskunft <span id="sa-save-badge" class="sa-save-badge"><span class="sa-save-idle">Auto-Save aktiv</span></span></div>

      ${/* SA-Redesign (22.05.2026): Intro auf 4 Zeilen verschlankt, keine Meta-Erklärungen mehr, Fonds-Logik wandert zum Vermögen-Block. */ ''}
      <details class="sa-intro" data-sec-state="sa-intro" ${isSaSectionOpen('sa-intro') ? 'open' : ''}>
        <summary>ℹ So füllst Du die SA aus</summary>
        <div class="sa-intro-body">
          <p>6 Blöcke pro Antragsteller: <strong>Stammdaten · ① Einnahmen · ② Ausgaben · ③ Vermögen · ④ Verbindlichkeiten · ⑤ Immobilien · ⑥ Notizen.</strong></p>
          <p>Pflichtfelder oben, Baukasten unten für alles Individuelle (Titel + Notiz + Betrag).</p>
          <p>Mieten und Baufi gehören in <strong>⑤ Immobilien</strong> — der Block schiebt sie automatisch in ① und ④.</p>
          <p>Auto-Save aktiv. Coverage zeigt, was der Bank noch fehlt.</p>
        </div>
      </details>

      <div class="flex gap-12 mb-16">
        <label for="sa-gemeinsam" class="sa-gemeinsam-toggle">
          <input type="checkbox" id="sa-gemeinsam" ${istGemeinsam ? 'checked' : ''}>
          <span>Gemeinsamer Antrag mit Mit-Antragsteller</span>
        </label>
      </div>
      <div class="${istGemeinsam ? 'grid-2' : 'grid-1'}">
        <div>
          ${istGemeinsam ? '<h3 class="section-title">Antragsteller 1</h3>' : ''}
          ${saPersonHtml('a', sa.antragsteller)}
        </div>
        <div id="sa-mit-wrap" style="${istGemeinsam ? '' : 'display:none;'}">
          <h3 class="section-title">Antragsteller 2 (Mit-Antragsteller)</h3>
          ${saPersonHtml('m', sa.mitantragsteller)}
        </div>
      </div>
      <div class="mt-16">${saHerkunftEkHtml(sa.herkunftEk || {})}</div>
      <div id="sa-coverage-wrap" class="mt-16">${saCoverageHtml()}</div>
      <div id="sa-auswertung-wrap" class="mt-16">${saAuswertungHtml()}</div>
      <div class="toolbar mt-16">
        <button onclick="saveSelbstauskunft()">Speichern</button>
        <button class="secondary" onclick="exportSaPdf()">PDF Selbstauskunft (Druck)</button>
        <button onclick="sendSaForSignature()">→ Selbstauskunft via PandaDoc senden</button>
        <button class="secondary" onclick="generateSaPortalLink()" title="Erzeugt einen 14-Tage-Link, mit dem der Kunde die SA selbst ausfüllt — Inhalt landet automatisch hier.">📋 Link für Selbst-Ausfüllen erzeugen</button>
      </div>
      ${/* SA-Redesign (22.05.2026): Datalists mit Banken-üblichen Titeln — Vertriebler
            bekommt Autocomplete beim Tippen, ersetzt die langen Inline-Code-Listen. */ ''}
      <datalist id="sa-titel-einnahmen">
        <option value="Weihnachtsgeld ⌀/Mo"><option value="Urlaubsgeld ⌀/Mo"><option value="Variable Vergütung 2025 ⌀">
        <option value="Bonus ⌀/Mo"><option value="Unterhalt erhalten"><option value="Kindergeld">
        <option value="Rente gesetzlich"><option value="BU-Rente"><option value="BAV-Auszahlung">
        <option value="Selbst. Honorare ⌀">
      </datalist>
      <datalist id="sa-titel-ausgaben">
        <!-- QA-Fix 2026-05-23 (Audit-T2): PKV-Beitrag / Leasing / Unterhaltszahlungen
             aus der Baukasten-Auswahl ENTFERNT — diese drei sind seit B6/P3 wieder
             Pflichtfelder mit eigenem Input. Sonst doppelte Eingabe + doppelte
             Anrechnung (Maurice-Doppelzähl-Falle). -->
        <option value="GKV-Zusatzbeitrag">
        <option value="Fondssparplan MSCI World"><option value="Riester-Beitrag"><option value="Rürup-Beitrag">
        <option value="Vereinsbeiträge"><option value="Abos / Streaming">
      </datalist>
      <datalist id="sa-titel-vermoegen">
        <option value="Wertpapierdepot"><option value="ETF MSCI World"><option value="Tagesgeld">
        <option value="Sparbuch"><option value="Bausparvertrag LBS"><option value="VWL">
        <option value="LV Rückkauf"><option value="Riester-Bestand"><option value="Rürup-Bestand">
        <option value="Krypto BTC"><option value="Edelmetalle"><option value="Oldtimer">
      </datalist>
      <datalist id="sa-titel-verbindlichkeiten">
        <option value="Autokredit"><option value="Konsumkredit"><option value="Kreditkarte">
        <option value="Dispo"><option value="Studienkredit BAföG"><option value="KfW-Förderdarlehen">
        <option value="Privatdarlehen">
      </datalist>
    </div>
  `;
  // Häkchen-Wechsel: neu rendern, damit Layout (1 vs. 2 Spalten) + Header sich anpassen
  document.getElementById('sa-gemeinsam').onchange = (e) => {
    sa.gemeinsam = e.target.checked;
    // Vor Re-Render aktuelle Werte aus DOM in state._sa zurückschreiben.
    collectSaFromDOM();
    state._sa.gemeinsam = e.target.checked;
    renderTabSelbstauskunft();
    autoSaveSa();
  };
  // Auto-Save: bei jedem Verlassen eines SA-Felds wird gespeichert.
  // Zusätzlich: Live-Recalc der Auswertung am Ende der Form (sofort, ohne Debounce).
  document.querySelectorAll('[data-sa]').forEach(inp => {
    inp.addEventListener('blur', () => autoSaveSa());
    inp.addEventListener('change', () => autoSaveSa());
    inp.addEventListener('input', () => recalcSaAuswertung());
  });
  // Iter 66 (20.05.2026): Baukasten-Inputs (data-sa-zusatz) → gleiche Auto-Save-Logik
  // plus Plus/Minus-Buttons für Zeilen hinzufügen/entfernen.
  document.querySelectorAll('[data-sa-zusatz]').forEach(inp => {
    inp.addEventListener('blur', () => autoSaveSa());
    inp.addEventListener('change', () => autoSaveSa());
    inp.addEventListener('input', () => recalcSaAuswertung());
  });
  document.querySelectorAll('[data-zusatz-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      // Vor Re-Render aktuelle DOM-Werte einlesen
      collectSaFromDOM();
      const raw = btn.dataset.zusatzAdd; // "prefix.kategorie" oder "prefix.kategorie|variant"
      const [pfadStr] = raw.split('|');
      const [prefix, kategorie] = pfadStr.split('.');
      const target = prefix === 'a' ? 'antragsteller' : 'mitantragsteller';
      if (!state._sa[target]) state._sa[target] = {};
      if (!Array.isArray(state._sa[target][kategorie])) state._sa[target][kategorie] = [];
      // Iter 70: einheitliches Schema { titel, notiz, mo, wert } — Varianten benutzen
      //   nur jeweils die relevanten Felder (mo oder wert oder beide).
      state._sa[target][kategorie].push({ titel: '', notiz: '', mo: null, wert: null });
      renderTabSelbstauskunft();
      autoSaveSa();
    });
  });
  document.querySelectorAll('[data-zusatz-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      collectSaFromDOM();
      const [prefix, kategorie, idxStr] = btn.dataset.zusatzRemove.split('.');
      const target = prefix === 'a' ? 'antragsteller' : 'mitantragsteller';
      const idx = parseInt(idxStr, 10);
      if (state._sa[target] && Array.isArray(state._sa[target][kategorie])) {
        state._sa[target][kategorie].splice(idx, 1);
      }
      renderTabSelbstauskunft();
      autoSaveSa();
    });
  });
  // Iter 72 (21.05.2026): Open/Closed-State pro Sektion in localStorage persistieren.
  document.querySelectorAll('[data-sec-state]').forEach(det => {
    det.addEventListener('toggle', () => {
      setSaSectionOpen(det.dataset.secState, det.open);
    });
  });
  // Initial Auswertung rendern (Werte aus state._sa)
  recalcSaAuswertung();
}

/* ============================== SA-AUSWERTUNG ============================== */
// Live-Block am Ende der Selbstauskunft: zeigt Überschuss, Gesamtvermögen,
// und "Einsetzbar für neue Immobilie" (nur liquides Vermögen — Bank-Sicht).

function saAuswertungHtml() {
  const sa = state._sa || {};
  const gem = sa.gemeinsam === true;
  let bon = null;
  if (window.Kalk && typeof window.Kalk.computeBonitaetDetailed === 'function') {
    try { bon = window.Kalk.computeBonitaetDetailed(sa, gem); } catch(e) { bon = null; }
  }
  const eur = (v) => {
    if (v === null || v === undefined || !isFinite(v)) return '–';
    return Math.round(v).toLocaleString('de-DE') + ' €';
  };
  const ueberschuss   = bon ? bon.ueberschussMo : null;
  const liquideBackend = bon ? bon.liquidesVermoegen : null;
  const einkAnr       = bon ? bon.einkommenAnrechenbarMo : null;
  const ausg          = bon ? bon.ausgabenGesamtMo : null;
  const haushalt      = bon ? bon.haushaltPauschale : null;
  const fix           = bon ? bon.fixkostenMo : null;
  const verbMo        = bon ? bon.verbindlichkeitenMo : null;

  // Iter 77 (21.05.2026): Aufschlüsselung VOR der KPI-Box berechnen, damit die
  //   KPI-Werte direkt aus der Bilanz-Aggregation kommen. Backend-asymmetrischer
  //   gesamtVermoegen (ignoriert zusatzVerbindlichkeit-Salden) wird damit
  //   überstimmt — Edgar's Bilanz-Optik (③ − ④) ist die wahre Vermögenslage.
  //   Backend selbst bleibt unangetastet (kein Risiko für IRR/Bonität/Tests).
  const aufschluss = (() => {
        // Iter 72 (21.05.2026): Volle Aufschlüsselung der 4 Bereiche — jede Position einzeln
        //   sichtbar, damit der Vertriebler nachvollziehen kann, woher die Summen kommen.
        // Iter 77 (21.05.2026, Edgar-Vorgabe): Bilanz-Optik konsistent gemacht.
        //   - Immobilie steht jetzt mit VOLLEM Verkehrswert in ③ Vermögen (statt Netto).
        //   - Baufi-Restsaldo steht eigenständig in ④ Verbindlichkeiten (Saldo).
        //   - Annuität/Mo-Rate der Verbindlichkeiten steht sichtbar in ② Ausgaben
        //     (war schon Backend-Logik, aber UI-seitig versteckt → Drift zwischen
        //      KPI-Box 1.217 € und Ausgaben-Summe 1.450 €). Jetzt: ① − ② = KPI.
        //   - Zwei neue „Ergebnis"-Zeilen: ① − ② (Überschuss/Mo) und ③ − ④ (Gesamtvermögen).
        //   - Footer zeigt explizit, wie „Einsetzbar für Immobilie" entsteht.
        const personen = sa.gemeinsam === true
          ? [['Antragsteller', sa.antragsteller || {}], ['Mit-Antragsteller', sa.mitantragsteller || {}]]
          : [['Antragsteller', sa.antragsteller || {}]];
        const eurNum = (v) => (v === null || v === undefined || !isFinite(v) || v === 0) ? '' : Math.round(v).toLocaleString('de-DE') + ' €';
        const eurForce = (v) => (v === null || v === undefined || !isFinite(v)) ? '–' : Math.round(v).toLocaleString('de-DE') + ' €';
        const row = (label, val, klasse) => `<tr${klasse ? ' class="' + klasse + '"' : ''}><td>${label}</td><td class="num">${eurNum(val)}</td></tr>`;

        // ----- EINNAHMEN -----
        const einnahmenRows = [];
        let einSum = 0;
        personen.forEach(([rolle, p]) => {
          const prefix = personen.length > 1 ? `<span class="text-tertiary text-small">[${esc(rolle.charAt(0))}]</span> ` : '';
          const netto = (parseFloat(p.nettoMo) || 0);
          const geh = parseFloat(p.anzahlGehaelter || 12) || 12;
          const nettoMo = netto * geh / 12;
          if (nettoMo > 0) {
            einnahmenRows.push(`<tr><td>${prefix}Netto-Gehalt (${netto.toLocaleString('de-DE')} × ${String(geh).replace('.',',')}/12)</td><td class="num">${eurNum(nettoMo)}</td></tr>`);
            einSum += nettoMo;
          }
          (Array.isArray(p.zusatzEinnahmen) ? p.zusatzEinnahmen : []).forEach(it => {
            const v = parseFloat(it && it.mo) || 0;
            if (v > 0) { einnahmenRows.push(`<tr><td>${prefix}${esc((it && it.titel) || 'Einnahme')}</td><td class="num">${eurNum(v)}</td></tr>`); einSum += v; }
          });
          // Immobilien-Mieten (80 % Anrechnung)
          (Array.isArray(p.immobilien) ? p.immobilien : []).forEach(immo => {
            const v = parseFloat(immo && immo.mietenMo) || 0;
            if (v > 0) {
              const anr = v * 0.8;
              einnahmenRows.push(`<tr><td>${prefix}Miete · ${esc(immo.art || 'Immobilie')}${immo.anschrift ? ', ' + esc(immo.anschrift) : ''} <span class="text-tertiary text-small">(${v.toLocaleString('de-DE')} × 80 %)</span></td><td class="num">${eurNum(anr)}</td></tr>`);
              einSum += anr;
            }
          });
          // Iter 73 (21.05.2026): Unterhalt + Kindergeld werden weiterhin als Pflichtfelder
          //   gezählt (auch wenn nicht mehr in der UI sichtbar) — gehört zum Einkommen.
          //   Legacy vermietungMo wurde rausgeschmissen, war Quelle der Doppelzählung.
          ['unterhaltMo','kindergeldMo'].forEach(k => {
            const v = parseFloat(p[k]) || 0;
            const label = k === 'unterhaltMo' ? 'Unterhalt erhalten' : 'Kindergeld';
            if (v > 0) { einnahmenRows.push(`<tr><td>${prefix}${esc(label)}</td><td class="num">${eurNum(v)}</td></tr>`); einSum += v; }
          });
        });

        // ----- AUSGABEN -----
        // Iter 77: Annuitäten (Baufi-Belastung + Verbindlichkeits-Raten) explizit
        //   in den Ausgaben-Block. Sind im Backend (verbindlichkeitenMo) Teil von
        //   ausgabenGesamtMo — Sichtbarmachen schließt die Drift zwischen
        //   KPI „Überschuss" und Ausgaben-Summe.
        const ausgabenRows = [];
        let ausSum = 0;
        let annuitaetSum = 0; // separat getrackt für Footer-Hinweis
        personen.forEach(([rolle, p]) => {
          const prefix = personen.length > 1 ? `<span class="text-tertiary text-small">[${esc(rolle.charAt(0))}]</span> ` : '';
          [['Miete eigene Whg','mieteMo'],['Laufende Lebenshaltung','lebenshaltungMo']].forEach(([label, k]) => {
            const v = parseFloat(p[k]) || 0;
            if (v > 0) { ausgabenRows.push(`<tr><td>${prefix}${esc(label)}</td><td class="num">${eurNum(v)}</td></tr>`); ausSum += v; }
          });
          (Array.isArray(p.zusatzAusgaben) ? p.zusatzAusgaben : []).forEach(it => {
            const v = parseFloat(it && it.mo) || 0;
            if (v > 0) { ausgabenRows.push(`<tr><td>${prefix}${esc((it && it.titel) || 'Ausgabe')}</td><td class="num">${eurNum(v)}</td></tr>`); ausSum += v; }
          });
          // Annuität Baufinanzierungen (pro Immobilie) — fließt in Ausgaben
          (Array.isArray(p.immobilien) ? p.immobilien : []).forEach(immo => {
            const mo = parseFloat(immo && immo.baufiBelastungMo) || 0;
            if (mo > 0) {
              ausgabenRows.push(`<tr><td>${prefix}Annuität · Baufi ${esc(immo.art || 'Immobilie')}${immo.anschrift ? ', ' + esc(immo.anschrift) : ''} <span class="text-tertiary text-small">(Zins + Tilgung)</span></td><td class="num">${eurNum(mo)}</td></tr>`);
              ausSum += mo; annuitaetSum += mo;
            }
          });
          // Raten sonstiger Verbindlichkeiten (Konsumkredit, Leasing etc.)
          (Array.isArray(p.zusatzVerbindlichkeiten) ? p.zusatzVerbindlichkeiten : []).forEach(it => {
            const mo = parseFloat(it && it.mo) || 0;
            if (mo > 0) {
              ausgabenRows.push(`<tr><td>${prefix}Rate · ${esc((it && it.titel) || 'Verbindlichkeit')}</td><td class="num">${eurNum(mo)}</td></tr>`);
              ausSum += mo; annuitaetSum += mo;
            }
          });
        });

        // ----- VERMÖGEN -----
        // Iter 77: Immobilien jetzt mit vollem Verkehrswert (statt Netto). Restsaldo
        //   landet eigenständig in ④. Differenz ③ − ④ = gesamtVermoegen (unverändert).
        const vermoegenRows = [];
        let vermSum = 0;
        let liquideUiSum = 0;       // Vermögen ohne Bestandsimmobilien — zeigt „Einsetzbar"
        let immoVerkehrSum = 0;     // nur Verkehrswerte der Bestandsimmobilien
        personen.forEach(([rolle, p]) => {
          const prefix = personen.length > 1 ? `<span class="text-tertiary text-small">[${esc(rolle.charAt(0))}]</span> ` : '';
          const v = parseFloat(p.bankguthaben) || 0;
          if (v > 0) { vermoegenRows.push(`<tr><td>${prefix}Bankguthaben</td><td class="num">${eurNum(v)}</td></tr>`); vermSum += v; liquideUiSum += v; }
          (Array.isArray(p.zusatzVermoegen) ? p.zusatzVermoegen : []).forEach(it => {
            const w = parseFloat(it && it.wert) || 0;
            if (w > 0) { vermoegenRows.push(`<tr><td>${prefix}${esc((it && it.titel) || 'Vermögen')}</td><td class="num">${eurNum(w)}</td></tr>`); vermSum += w; liquideUiSum += w; }
          });
          // Iter 77: Immobilie als Vollwert (Verkehrswert). Schulden separat in ④.
          (Array.isArray(p.immobilien) ? p.immobilien : []).forEach(immo => {
            const vk = parseFloat(immo && immo.verkehrswert) || 0;
            if (vk > 0) {
              vermoegenRows.push(`<tr><td>${prefix}Immobilie · ${esc(immo.art || 'Immobilie')}${immo.anschrift ? ', ' + esc(immo.anschrift) : ''} <span class="text-tertiary text-small">(Verkehrswert)</span></td><td class="num">${eurNum(vk)}</td></tr>`);
              vermSum += vk; immoVerkehrSum += vk;
            }
          });
        });

        // ----- VERBINDLICHKEITEN -----
        // Iter 77: Nur Salden in ④ — Mo-Raten sind in ② Ausgaben. Damit ist
        //   ③ − ④ = Gesamtvermögen direkt ablesbar.
        const verbRows = [];
        let verbRestSum = 0;
        personen.forEach(([rolle, p]) => {
          const prefix = personen.length > 1 ? `<span class="text-tertiary text-small">[${esc(rolle.charAt(0))}]</span> ` : '';
          (Array.isArray(p.zusatzVerbindlichkeiten) ? p.zusatzVerbindlichkeiten : []).forEach(it => {
            const mo = parseFloat(it && it.mo) || 0;
            const w = parseFloat(it && it.wert) || 0;
            if (w > 0) {
              const moHint = mo > 0 ? ` <span class="text-tertiary text-small">(Rate ${eurNum(mo)}/Mo in ②)</span>` : '';
              verbRows.push(`<tr><td>${prefix}${esc((it && it.titel) || 'Verbindlichkeit')}${moHint}</td><td class="num">${eurNum(w)}</td></tr>`);
              verbRestSum += w;
            }
          });
          // Immobilien-Baufi — Restsaldo
          (Array.isArray(p.immobilien) ? p.immobilien : []).forEach(immo => {
            const mo = parseFloat(immo && immo.baufiBelastungMo) || 0;
            const w = parseFloat(immo && immo.baufiRestsaldo) || 0;
            if (w > 0) {
              const moHint = mo > 0 ? ` <span class="text-tertiary text-small">(Annuität ${eurNum(mo)}/Mo in ②)</span>` : '';
              verbRows.push(`<tr><td>${prefix}Baufi · ${esc(immo.art || 'Immobilie')}${immo.anschrift ? ', ' + esc(immo.anschrift) : ''}${moHint}</td><td class="num">${eurNum(w)}</td></tr>`);
              verbRestSum += w;
            }
          });
        });

        // ----- ABLEITUNGEN -----
        const ueberschussCalc = einSum - ausSum;   // sollte == bon.ueberschussMo sein
        const vermoegenSaldo  = vermSum - verbRestSum; // sollte == bon.gesamtVermoegen sein
        const ueberCls = ueberschussCalc < 0 ? 'pos-neg' : 'pos-pos';
        const vermCls  = vermoegenSaldo  < 0 ? 'pos-neg' : 'pos-pos';
        const ueberColor = ueberschussCalc < 0 ? '#8E1010' : '#1B5E20';
        const vermColor  = vermoegenSaldo  < 0 ? '#8E1010' : '#1B5E20';
        const einsetzbarHerleitung = immoVerkehrSum > 0
          ? `${eurForce(vermSum)} (③ Summe) − ${eurForce(immoVerkehrSum)} (Bestandsimmobilien) = <strong>${eurForce(liquideUiSum)}</strong>`
          : `Liquide Positionen aus ③: <strong>${eurForce(liquideUiSum)}</strong>`;

        const html = `
        <details class="sa-aufschluss" open>
          <summary>Aufschlüsselung — woher kommen die Werte?</summary>
          <div class="grid-2 mt-12" style="gap:24px;">
            <div>
              <div style="font-weight:600;margin:8px 0 6px;color:#1B5E20;">↘ ① Einnahmen anrechenbar (Mo)</div>
              <table class="sa-aufschluss-table">
                ${einnahmenRows.join('') || '<tr><td colspan="2" class="text-tertiary text-small">Keine Einnahmen erfasst.</td></tr>'}
                <tr class="row-sum"><td>Summe ①</td><td class="num">${eurNum(einSum)}</td></tr>
              </table>

              <div style="font-weight:600;margin:18px 0 6px;color:#8E1010;">↗ ② Ausgaben (Mo) <span class="text-tertiary text-small" style="font-weight:normal;">inkl. Annuitäten</span></div>
              <table class="sa-aufschluss-table">
                ${ausgabenRows.join('') || '<tr><td colspan="2" class="text-tertiary text-small">Keine Ausgaben erfasst.</td></tr>'}
                <tr class="row-sum"><td>Summe ②</td><td class="num">${eurNum(ausSum)}</td></tr>
              </table>

              <table class="sa-aufschluss-table sa-aufschluss-result" style="margin-top:8px;border-top:2px solid ${ueberColor};">
                <tr><td style="padding-top:8px;"><strong>= Anrechenbarer Überschuss (① − ②)</strong></td><td class="num" style="padding-top:8px;color:${ueberColor};font-weight:700;font-size:15px;">${eurForce(ueberschussCalc)} <span style="font-size:12px;font-weight:400;color:var(--text-tertiary);">/ Monat</span></td></tr>
              </table>
            </div>
            <div>
              <div style="font-weight:600;margin:8px 0 6px;color:#1B5E20;">↘ ③ Vermögen <span class="text-tertiary text-small" style="font-weight:normal;">Verkehrswerte brutto</span></div>
              <table class="sa-aufschluss-table">
                ${vermoegenRows.join('') || '<tr><td colspan="2" class="text-tertiary text-small">Kein Vermögen erfasst.</td></tr>'}
                <tr class="row-sum"><td>Summe ③</td><td class="num">${eurNum(vermSum)}</td></tr>
              </table>

              <div style="font-weight:600;margin:18px 0 6px;color:#8E1010;">↗ ④ Verbindlichkeiten <span class="text-tertiary text-small" style="font-weight:normal;">Restsalden</span></div>
              <table class="sa-aufschluss-table">
                ${verbRows.join('') || '<tr><td colspan="2" class="text-tertiary text-small">Keine Verbindlichkeiten erfasst.</td></tr>'}
                <tr class="row-sum"><td>Summe ④</td><td class="num">${eurNum(verbRestSum)}</td></tr>
              </table>

              <table class="sa-aufschluss-table sa-aufschluss-result" style="margin-top:8px;border-top:2px solid ${vermColor};">
                <tr><td style="padding-top:8px;"><strong>= Gesamtvermögen (③ − ④)</strong></td><td class="num" style="padding-top:8px;color:${vermColor};font-weight:700;font-size:15px;">${eurForce(vermoegenSaldo)}</td></tr>
              </table>
            </div>
          </div>
          <div class="footer-note">
            <div style="margin-bottom:6px;"><strong>Einsetzbar für Immobilie</strong> = ${einsetzbarHerleitung}</div>
            <div style="margin-bottom:6px;">Bestandsimmobilien zählen <em>nicht</em> als Eigenkapital für eine neue Finanzierung — der Beleihungsauslauf der bestehenden Baufi bindet den Wert. Verkehrswert und Restsaldo stehen deshalb separat in ③/④, fließen aber nicht in „Einsetzbar".</div>
            <div><strong>Mieteinnahmen aus Immobilien</strong> werden zu 80 % angerechnet (Bank-Standard: Leerstands-/Mietausfallreserve). <strong>Annuitäten</strong> (Zins + Tilgung) der Baufinanzierungen erscheinen in ② Ausgaben — der Restsaldo eigenständig in ④. Doppelzählung ist ausgeschlossen, weil Ausgaben (Mo) und Vermögensbilanz (€) auf unterschiedlichen Ebenen rechnen.</div>
          </div>
        </details>`;
        return { html, einSum, ausSum, ueberschussCalc, vermSum, verbRestSum, vermoegenSaldo, liquideUiSum, immoVerkehrSum };
      })();

  // KPI-Box-Werte aus der UI-Bilanz statt vom Backend — Backend ist asymmetrisch
  //   (gesamtVermoegen ignoriert zusatzVerbindlichkeit-Salden). Einsetzbar bleibt
  //   Backend-Wert (computeBonitaetDetailed ist konsistent für liquide).
  const gesamtVerm = aufschluss.vermoegenSaldo;
  const liquide    = aufschluss.liquideUiSum != null ? aufschluss.liquideUiSum : liquideBackend;
  const ueberschussCls = (ueberschuss !== null && ueberschuss < 0) ? 'kpi-negative' : 'kpi-positive';
  const vermCls    = (gesamtVerm !== null && gesamtVerm < 0) ? 'kpi-negative' : '';

  return `
    <div class="card sa-auswertung-card">
      <div class="card-title">Auswertung Selbstauskunft <span class="text-tertiary text-small" style="font-weight:normal;">(Bank-Sicht, live)</span></div>

      <div class="grid-3 mt-16">
        <div class="kpi-box ${ueberschussCls}">
          <div class="kpi-label">Anrechenbarer Überschuss</div>
          <div class="kpi-value">${eur(ueberschuss)} <span style="font-size:13px;font-weight:400;color:var(--text-tertiary);">/ Monat</span></div>
          <div class="kpi-hint">① Einnahmen anrechenbar − ② Ausgaben (inkl. Annuitäten). Mieteinnahmen zu 80 % (Bank-Standard).</div>
        </div>
        <div class="kpi-box ${vermCls}">
          <div class="kpi-label">Gesamtvermögen</div>
          <div class="kpi-value">${eur(gesamtVerm)}</div>
          <div class="kpi-hint">③ Vermögen (Verkehrswerte brutto) − ④ Verbindlichkeiten (Restsalden). Auch negativ möglich (underwater).</div>
        </div>
        <div class="kpi-box kpi-primary">
          <div class="kpi-label">Einsetzbar für Immobilie</div>
          <div class="kpi-value">${eur(liquide)}</div>
          <div class="kpi-hint"><strong>Nur liquide Assets</strong> aus ③ — Bestandsimmobilien zählen nicht (Beleihungsauslauf gebunden).</div>
        </div>
      </div>

      ${aufschluss.html}
    </div>
  `;
}

function recalcSaAuswertung() {
  collectSaFromDOM();
  const wrap = document.getElementById('sa-auswertung-wrap');
  if (wrap) wrap.innerHTML = saAuswertungHtml();
  // F-2: Coverage parallel zum Auswertungsblock aktualisieren
  const cov = document.getElementById('sa-coverage-wrap');
  if (cov) cov.innerHTML = saCoverageHtml();
}

// Liest alle SA-Felder aus dem DOM und schreibt sie in state._sa.
// Prefix-Konvention:
//   'a.xxx[.yyy]'  → antragsteller.xxx[.yyy]
//   'm.xxx[.yyy]'  → mitantragsteller.xxx[.yyy]
//   'sa.xxx[.yyy]' → sa.xxx[.yyy]  (sa-weite Felder, z.B. herkunftEk)
function collectSaFromDOM() {
  const sa = state._sa || { antragsteller: {}, mitantragsteller: {} };
  document.querySelectorAll('[data-sa]').forEach(inp => {
    const parts = inp.dataset.sa.split('.');
    const prefix = parts[0];
    let v;
    if (inp.type === 'checkbox') {
      v = inp.checked;
    } else if (inp.value === '' || inp.value === null) {
      v = null;
    } else if (inp.type === 'number') {
      v = parseFloat(inp.value); if (!isFinite(v)) v = null;
    } else {
      v = inp.value;
    }
    if (prefix === 'sa') {
      // sa-weite Felder: sa.<key>[.<sub>]
      if (parts.length === 2) {
        sa[parts[1]] = v;
      } else if (parts.length === 3) {
        if (!sa[parts[1]] || typeof sa[parts[1]] !== 'object') sa[parts[1]] = {};
        sa[parts[1]][parts[2]] = v;
      }
      return;
    }
    const target = prefix === 'a' ? 'antragsteller' : 'mitantragsteller';
    if (!sa[target]) sa[target] = {};
    if (parts.length === 2) {
      sa[target][parts[1]] = v;
    } else if (parts.length === 3) {
      if (!sa[target][parts[1]] || typeof sa[target][parts[1]] !== 'object') sa[target][parts[1]] = {};
      sa[target][parts[1]][parts[2]] = v;
    }
  });
  // Iter 66 (20.05.2026): Baukasten-Inputs lesen — Schema prefix.kategorie.idx.feld
  document.querySelectorAll('[data-sa-zusatz]').forEach(inp => {
    const parts = inp.dataset.saZusatz.split('.');
    if (parts.length !== 4) return;
    const [prefix, kategorie, idxStr, feld] = parts;
    const idx = parseInt(idxStr, 10);
    if (!isFinite(idx)) return;
    let v;
    if (inp.value === '' || inp.value === null) {
      v = null;
    } else if (inp.type === 'number') {
      v = parseFloat(inp.value); if (!isFinite(v)) v = null;
    } else {
      v = inp.value;
    }
    const target = prefix === 'a' ? 'antragsteller' : 'mitantragsteller';
    if (!sa[target]) sa[target] = {};
    if (!Array.isArray(sa[target][kategorie])) sa[target][kategorie] = [];
    while (sa[target][kategorie].length <= idx) sa[target][kategorie].push({ titel: '', notiz: '', mo: null, wert: null });
    sa[target][kategorie][idx][feld] = v;
  });
  state._sa = sa;
  return sa;
}

// Iter 73 (21.05.2026): Legacy-Felder beim Save aus dem SA-JSON entfernen — sonst tauchen
//   sie nach jedem Lese-/Schreibzyklus wieder auf und führen perspektivisch zu Bugs
//   (Doppelzählung bei Marcel). Wir löschen sie aktiv on save.
const SA_LEGACY_FIELDS = [
  'vermietungMo','sonstigeMo','immo1','immo2',
  'pkvMo','leasingMo','unterhaltZahlungMo','sonstigeAusgabenMo',
  'wertpapiere','sparbuecher','bausparen',
  'bf1','bf2','kd1','kd2','kd3','kd4','vers',
  'zusatzSparplaene','zusatzSchulden',
];
function cleanupLegacyFields(sa) {
  if (!sa) return sa;
  ['antragsteller','mitantragsteller'].forEach(rolle => {
    const p = sa[rolle];
    if (!p) return;
    SA_LEGACY_FIELDS.forEach(k => { if (p.hasOwnProperty(k)) delete p[k]; });
  });
  return sa;
}

let _saAutoSaveTimer = null;
// SA-Redesign (22.05.2026): Auto-Save-State sichtbar als Badge im Card-Title.
//   States: idle / saving / saved / error. Mit Live-Zeitstempel "vor X Sek".
let _saSaveLastSuccessTs = null;
let _saSaveTimestampInterval = null;
function _saUpdateSaveBadge(state, errMsg) {
  const badge = document.getElementById('sa-save-badge');
  if (!badge) return;
  let html = '';
  if (state === 'idle')        html = '<span class="sa-save-idle">Auto-Save aktiv</span>';
  else if (state === 'saving') html = '<span class="sa-save-saving">speichere …</span>';
  else if (state === 'saved') {
    _saSaveLastSuccessTs = Date.now();
    html = '<span class="sa-save-saved">✓ gespeichert · gerade eben</span>';
  } else if (state === 'error') {
    html = `<span class="sa-save-error">⚠ nicht gespeichert${errMsg ? ' · ' + errMsg : ''}</span>`;
  }
  badge.innerHTML = html;
}
// Live-Timestamp aktualisieren: "vor 3 Sek", "vor 1 Min", …
function _saTickSaveTimestamp() {
  if (!_saSaveLastSuccessTs) return;
  const badge = document.getElementById('sa-save-badge');
  if (!badge) return;
  const successSpan = badge.querySelector('.sa-save-saved');
  if (!successSpan) return;
  const diffSec = Math.round((Date.now() - _saSaveLastSuccessTs) / 1000);
  let label;
  if (diffSec < 5)        label = 'gerade eben';
  else if (diffSec < 60)  label = `vor ${diffSec} Sek`;
  else if (diffSec < 3600) label = `vor ${Math.floor(diffSec / 60)} Min`;
  else                    label = `vor ${Math.floor(diffSec / 3600)} Std`;
  successSpan.textContent = `✓ gespeichert · ${label}`;
}
function _saStartTimestampTicker() {
  if (_saSaveTimestampInterval) return;
  _saSaveTimestampInterval = setInterval(_saTickSaveTimestamp, 5000);
}

async function autoSaveSa() {
  // QA-Fix 2026-05-23 (Audit-Z-3, DSGVO-Blocker): KundeId zum TRIGGER-Zeitpunkt
  // einfrieren. Vorher las der setTimeout-Closure state.kundeId nach 600ms — wenn
  // der Vertriebler in dem Fenster zum nächsten Kunden wechselte, schrieb der
  // Save SA-Daten von Kunde X in Kunde Y. Jetzt: ID einfrieren + bei Fire prüfen,
  // dass wir noch beim gleichen Kunden sind. Sonst Drop ohne Schreibvorgang.
  const _triggerKundeId = state.kundeId;
  // Debounce: 600ms warten und einmalig speichern
  clearTimeout(_saAutoSaveTimer);
  _saAutoSaveTimer = setTimeout(async () => {
    if (state.kundeId !== _triggerKundeId) {
      // Kunde wurde gewechselt → nicht speichern. Der Save für den neuen Kunden
      // wird durch dessen eigenen Input-Trigger ohnehin angestoßen.
      console.warn('[autoSaveSa] Kunde gewechselt während Debounce — Save übersprungen für', _triggerKundeId);
      return;
    }
    const sa = collectSaFromDOM();
    cleanupLegacyFields(sa); // Iter 73: alte Felder mit jedem Save mitlöschen
    sa.gemeinsam = document.getElementById('sa-gemeinsam') ? document.getElementById('sa-gemeinsam').checked : (sa.gemeinsam === true);
    // Iter 68 (21.05.2026): Bidirektionaler Mirror — wenn der Vertriebler in der SA
    //   die Antragsteller-Stammdaten ändert (Vorname, Name, E-Mail, Telefon,
    //   Geburtsdatum), übernehmen wir sie zurück in state.kunde und schicken sie
    //   im selben PUT mit. So bleiben Stammdaten-Tab und SA-Tab synchron.
    const stammChanged = syncSaToStammdaten();
    const payload = { saJson: sa };
    if (stammChanged) {
      payload.vorname = state.kunde.vorname || '';
      payload.nachname = state.kunde.nachname || '';
      payload.email = state.kunde.email || '';
      payload.telefon = state.kunde.telefon || '';
      payload.geburtsdatum = state.kunde.geburtsdatum || '';
    }
    _saUpdateSaveBadge('saving');
    try {
      await api.put('/api/kunden/' + _triggerKundeId, payload);
      // Nur lokal mergen wenn der aktive Kunde noch derselbe ist.
      if (state.kundeId === _triggerKundeId && state.kunde) {
        state.kunde.saJson = sa;
      }
      _saUpdateSaveBadge('saved');
      _saStartTimestampTicker();
    } catch (e) {
      console.error('autoSaveSa', e);
      _saUpdateSaveBadge('error', e && e.message ? e.message.slice(0, 40) : '');
    }
  }, 600);
}

// Sa-weite Sektion: Herkunft des Eigenkapitals. Banken-Pflichtfrage bei
// jeder Immobilienfinanzierung. Multi-Select + freie Erläuterung.
function saHerkunftEkHtml(h) {
  h = h || {};
  // Iter 82 (22.05.2026): Radikal kompakter — Edgar-Vorgabe „nicht so Wichtigste in der App,
  //   kleine Frage". Eine Zeile pro Quelle (Checkbox · Label · Betrag · ggf. Inline-Anbieter).
  //   Default zugeklappt. Nur 5 Standard-Quellen sichtbar, „weitere anzeigen"-Toggle für den Rest.
  const aktiv = (key) => !!h[key] || (parseFloat(h[key + 'Betrag']) || 0) > 0;
  const anyAktiv = ['ersparnisse','schenkung','verkauf','bauspar','lv','wertpapier','immobilien','erbe','eigenleistung','darlehen','sonstiges'].some(aktiv);

  // QA-Fix 2026-05-24 (Edgar): Inline-Styles → CSS-Klassen (.sa-ek-* siehe styles.css)
  // → konsistent zum restlichen System.
  const zeile = (key, label, extraInputKey, extraPlaceholder) => {
    const istAktiv = aktiv(key);
    const extraInputHtml = extraInputKey
      ? `<input type="text" data-sa="sa.herkunftEk.${extraInputKey}" placeholder="${esc(extraPlaceholder || '')}" value="${esc(h[extraInputKey] || '')}" class="sa-ek-extra">`
      : '';
    return `
      <div class="sa-ek-row${extraInputKey ? ' has-extra' : ''}">
        <input type="checkbox" data-sa="sa.herkunftEk.${key}" ${istAktiv ? 'checked' : ''}>
        <label>${esc(label)}</label>
        ${extraInputKey ? `<div>${extraInputHtml}</div>` : ''}
        <div class="sa-ek-betrag-wrap">
          <input type="number" step="any" placeholder="€" data-sa="sa.herkunftEk.${key}Betrag" value="${(parseFloat(h[key + 'Betrag']) || '') || ''}" class="sa-ek-betrag">
        </div>
      </div>`;
  };

  return `
    <details class="sa-section" data-sec-state="sa-ek-herkunft" ${isSaSectionOpen('sa-ek-herkunft') || anyAktiv ? 'open' : ''}>
      <summary>Eigenkapital · Herkunft <span class="text-tertiary text-small" style="font-weight:normal;">(GwG-Vorabfrage — Bank verlangt sie ohnehin)</span></summary>
      <div class="sa-ek-list">
        ${zeile('ersparnisse', 'Eigene Ersparnisse')}
        ${zeile('schenkung', 'Schenkung / Erbschaft', 'schenkGeber', 'Schenker / Erblasser')}
        ${zeile('verkauf', 'Verkaufserlös (Immobilie, Wertpapiere)', 'verkaufObjekt', 'Objekt + Jahr')}
        ${zeile('bauspar', 'Bausparvertrag (zuteilungsreif)', 'bauspKasse', 'Bausparkasse')}
        ${zeile('lv', 'Lebens-/Rentenversicherung', 'lvAnbieter', 'Versicherer')}
        ${zeile('sonstiges', 'Sonstige Quelle', 'sonstQuelle', 'z.B. AG-Darlehen, Eigenleistung')}
      </div>
      <div class="sa-ek-erlauterung">
        <input type="text" data-sa="sa.herkunftEk.erlaeuterung" placeholder="Anmerkung (optional) — z.B. „Notarvertrag liegt vor"" value="${esc(h.erlaeuterung || '')}">
      </div>
    </details>
  `;
}

// Iter 72 (21.05.2026): Open/Closed-State pro Sektion im localStorage merken — pro Kunde.
//   Beim ersten Öffnen der SA für einen Kunden ist alles zu (Default false). Sobald der
//   Vertriebler eine Sektion öffnet/schließt, wird der Zustand persistiert und beim
//   nächsten Mal wiederhergestellt.
function saSectionStateKey() {
  return 'sa-section-state-' + (state.kundeId || 'default');
}
function loadSaSectionState() {
  try {
    const raw = localStorage.getItem(saSectionStateKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) { return {}; }
}
function saveSaSectionState(state_) {
  try { localStorage.setItem(saSectionStateKey(), JSON.stringify(state_ || {})); } catch (e) {}
}
function isSaSectionOpen(key) {
  const st = loadSaSectionState();
  return st[key] === true;
}
function setSaSectionOpen(key, open) {
  const st = loadSaSectionState();
  st[key] = !!open;
  saveSaSectionState(st);
}

function saPersonHtml(prefix, p) {
  p = p || {};

  // Iter 72 (21.05.2026): Inline-Baukasten — kein eigenes <details>-Wrapper mehr, sondern
  //   wird direkt in den Block-Container integriert. Visuell durch Trennlinie + Sub-Header
  //   vom Standard-Bereich abgesetzt.
  // SA-Redesign (22.05.2026): Titel-Input nutzt <datalist> mit Banken-üblichen Vorschlägen
  //   pro Kategorie — der Vertriebler bekommt Autocomplete statt langer Inline-Erklär-Texte.
  function zusatzListeInline(kategorie, subHeader, hint, variant, addLabel, datalistKey) {
    const liste = Array.isArray(p[kategorie]) ? p[kategorie] : [];
    const istDoppel = variant === 'mo-wert';
    const dz = (idx, feld) => `data-sa-zusatz="${prefix}.${kategorie}.${idx}.${feld}"`;
    const dlAttr = datalistKey ? ` list="sa-titel-${esc(datalistKey)}"` : '';
    const rows = liste.map((item, idx) => {
      let inputs;
      if (istDoppel) {
        inputs = `<input type="number" step="any" inputmode="decimal" placeholder="€/Mo Belastung" ${dz(idx, 'mo')} value="${item.mo !== undefined && item.mo !== null ? item.mo : ''}" class="sa-zusatz-mo">
                  <input type="number" step="any" inputmode="decimal" placeholder="€ Restsaldo" ${dz(idx, 'wert')} value="${item.wert !== undefined && item.wert !== null ? item.wert : ''}" class="sa-zusatz-wert">`;
      } else if (variant === 'mo') {
        inputs = `<input type="number" step="any" inputmode="decimal" placeholder="€/Mo" ${dz(idx, 'mo')} value="${item.mo !== undefined && item.mo !== null ? item.mo : ''}" class="sa-zusatz-betrag">`;
      } else {
        inputs = `<input type="number" step="any" inputmode="decimal" placeholder="€" ${dz(idx, 'wert')} value="${item.wert !== undefined && item.wert !== null ? item.wert : ''}" class="sa-zusatz-betrag">`;
      }
      return `
        <div class="sa-zusatz-row${istDoppel ? ' is-doppel' : ''}" data-zusatz-row="${prefix}.${kategorie}.${idx}">
          <input type="text" placeholder="Titel (z.B. Fondssparplan Riester)" ${dz(idx, 'titel')} value="${esc(item.titel || '')}"${dlAttr}>
          <input type="text" placeholder="Notiz (optional)" ${dz(idx, 'notiz')} value="${esc(item.notiz || '')}">
          ${inputs}
          <button type="button" class="sa-zusatz-remove" data-zusatz-remove="${prefix}.${kategorie}.${idx}" title="Position entfernen">−</button>
        </div>`;
    }).join('');
    return `
      <div class="sa-baukasten">
        <div class="sa-baukasten-head">
          <div class="sa-baukasten-title">${esc(subHeader)} <span class="text-tertiary text-small">(${liste.length})</span></div>
        </div>
        ${hint ? `<div class="text-tertiary text-small mb-8">${hint}</div>` : ''}
        <div class="sa-zusatz-list">${rows || '<div class="sa-zusatz-empty">Noch keine Position erfasst.</div>'}</div>
        <button type="button" class="sa-zusatz-add" data-zusatz-add="${prefix}.${kategorie}${istDoppel ? '|verbindlichkeit' : ''}">+ ${esc(addLabel || 'Position hinzufügen')}</button>
      </div>
    `;
  }

  // Checklisten-Infobox pro Block — erinnert den Vertriebler, was abgefragt werden sollte.
  // SA-Redesign (22.05.2026): Inline-Styles raus, CSS-Klassen in styles.css.
  function checklistBox(titel, items) {
    return `
      <div class="sa-checklist">
        <div class="sa-checklist-title">Checkliste · ${esc(titel)}</div>
        <ul>
          ${items.map(t => `<li>${t}</li>`).join('')}
        </ul>
      </div>`;
  }

  // SA-Redesign (22.05.2026): Block-Container tonal statt Material-Ampel.
  //   typ: 'in' (positive-Token) / 'out' (negative-Token) / 'neutral' (Bronze) / 'gray' (border-strong)
  //   Visuelle Logik:  weiße Karte + 4px-Border-Left in tonal-passender Brand-Farbe.
  //   label: dezenter Sub-Text rechts oben, kein UPPERCASE-Caps mehr.
  function blockContainer(stateKey, nummer, titel, typ, label, inhaltHtml) {
    const isOpen = isSaSectionOpen(stateKey);
    const typClass = ['in','out','neutral','gray'].includes(typ) ? `is-${typ}` : 'is-neutral';
    return `
      <details class="sa-block ${typClass}" data-sec-state="${esc(stateKey)}" ${isOpen ? 'open' : ''}>
        <summary>
          <span class="sa-block-num">${esc(nummer)}</span>
          <span class="sa-block-title">${esc(titel)}</span>
          ${label ? `<span class="sa-block-sub">${esc(label)}</span>` : ''}
        </summary>
        <div class="sa-block-body">${inhaltHtml}</div>
      </details>`;
  }

  // Iter 71: Immobilien-Baukasten — ein Eintrag bündelt Stammdaten + Mieteinnahmen + Baufinanzierung.
  //   Datenmodell: p.immobilien[] = [{ art, anschrift, baujahr, erwerbsjahr, wohnflaeche,
  //     verkehrswert, mietenMo, baufiUrspruenglich, baufiLaufzeitBis, baufiBelastungMo, baufiRestsaldo }, ...]
  //   Pro Immobilie nur 1 Finanzierung — bei mehreren Darlehen werden die Werte in Summe eingetragen.
  function immobilienBaukastenHtml() {
    const liste = Array.isArray(p.immobilien) ? p.immobilien : [];
    const dz = (idx, feld) => `data-sa-zusatz="${prefix}.immobilien.${idx}.${feld}"`;
    const rows = liste.map((item, idx) => {
      item = item || {};
      return `
        <div class="sa-immo-card" data-zusatz-row="${prefix}.immobilien.${idx}">
          <div class="sa-immo-card-head">
            <div class="sa-immo-card-title">Immobilie ${idx + 1}${item.art ? ' · ' + esc(item.art) : ''}${item.anschrift ? ' · ' + esc(item.anschrift) : ''}</div>
            <button type="button" class="sa-zusatz-remove" data-zusatz-remove="${prefix}.immobilien.${idx}" title="Immobilie entfernen">− entfernen</button>
          </div>
          <div class="sa-immo-section-label">Stammdaten</div>
          <div class="grid-2" style="gap:10px;">
            <div><label>Art (Whg, Haus, Garage, Acker, Gewerbe …)</label><input type="text" ${dz(idx, 'art')} value="${esc(item.art || '')}"></div>
            <div><label>Anschrift</label><input type="text" ${dz(idx, 'anschrift')} value="${esc(item.anschrift || '')}"></div>
            <div><label>Baujahr</label><input type="number" step="1" inputmode="numeric" ${dz(idx, 'baujahr')} value="${item.baujahr !== undefined && item.baujahr !== null ? item.baujahr : ''}"></div>
            <div><label>Erwerbsjahr</label><input type="number" step="1" inputmode="numeric" ${dz(idx, 'erwerbsjahr')} value="${item.erwerbsjahr !== undefined && item.erwerbsjahr !== null ? item.erwerbsjahr : ''}"></div>
            <div><label>Wohnfläche (m²)</label><input type="number" step="any" inputmode="decimal" ${dz(idx, 'wohnflaeche')} value="${item.wohnflaeche !== undefined && item.wohnflaeche !== null ? item.wohnflaeche : ''}"></div>
            <div><label>Verkehrswert (€)</label><input type="number" step="any" inputmode="decimal" ${dz(idx, 'verkehrswert')} value="${item.verkehrswert !== undefined && item.verkehrswert !== null ? item.verkehrswert : ''}"></div>
            <div><label>Mieteinnahmen (€/Mo) <span class="text-tertiary text-small">→ fließt in ① Einnahmen</span></label><input type="number" step="any" inputmode="decimal" ${dz(idx, 'mietenMo')} value="${item.mietenMo !== undefined && item.mietenMo !== null ? item.mietenMo : ''}"></div>
          </div>
          <div class="sa-immo-section-label" style="margin-top:14px;">Baufinanzierung <span style="font-weight:normal;">→ fließt in ④ Verbindlichkeiten</span></div>
          <div class="sa-immo-hint-banner">
            ℹ Bei mehreren Darlehen: <strong>Summe</strong> hier eintragen (Bank + KfW + Bauspar zusammen).
          </div>
          <div class="grid-2" style="gap:10px;">
            <div><label>Urspr. Darlehenshöhe (€)</label><input type="number" step="any" inputmode="decimal" ${dz(idx, 'baufiUrspruenglich')} value="${item.baufiUrspruenglich !== undefined && item.baufiUrspruenglich !== null ? item.baufiUrspruenglich : ''}"></div>
            <div><label>Laufzeit bis</label><input type="date" ${dz(idx, 'baufiLaufzeitBis')} value="${esc(item.baufiLaufzeitBis || '')}"></div>
            <div><label>Mtl. Belastung (€/Mo)</label><input type="number" step="any" inputmode="decimal" ${dz(idx, 'baufiBelastungMo')} value="${item.baufiBelastungMo !== undefined && item.baufiBelastungMo !== null ? item.baufiBelastungMo : ''}"></div>
            <div><label>Restsaldo (€)</label><input type="number" step="any" inputmode="decimal" ${dz(idx, 'baufiRestsaldo')} value="${item.baufiRestsaldo !== undefined && item.baufiRestsaldo !== null ? item.baufiRestsaldo : ''}"></div>
          </div>
        </div>`;
    }).join('');
    // Iter 72: nur Inhalt zurückgeben — Block-Container wird außen aufgesetzt
    return `
      ${checklistBox('Immobilien — was abfragen', [
        'Jede Eigentums-Position als eigener Eintrag (Whg, Haus, Garage, Acker, Gewerbe, …)',
        '<strong>Verkehrswert + Mieteinnahmen + Baufi</strong> pro Immobilie',
        'Erbpacht oder Besonderheiten → Notiz-Feld der Immobilie',
      ])}
      <div class="sa-immo-list">${rows || '<div class="text-tertiary text-small">Noch keine Immobilie erfasst.</div>'}</div>
      <button type="button" class="sa-zusatz-add secondary mt-8" data-zusatz-add="${prefix}.immobilien">+ Immobilie hinzufügen</button>
    `;
  }
  // Text-Feld
  const t = (label, key) => `
    <div>
      <label>${esc(label)}</label>
      <input data-sa="${prefix}.${key}" type="text" value="${esc(p[key] || '')}">
    </div>`;
  // Zahl-Feld
  // QA-Fix 2026-05-23 (Audit-X8): min="0" — Einkünfte, Belastungen, Vermögen
  // sind nie negativ in der SA (Schulden sind eigene Felder).
  const n = (label, key, suffix, step) => `
    <div>
      <label>${esc(label)}${suffix ? ' (' + suffix + ')' : ''}</label>
      <input data-sa="${prefix}.${key}" type="number" min="0" step="${step || 'any'}" value="${p[key] !== undefined && p[key] !== null ? p[key] : ''}">
    </div>`;
  // Datum-Feld
  const d = (label, key) => `
    <div>
      <label>${esc(label)}</label>
      <input data-sa="${prefix}.${key}" type="date" value="${esc(p[key] || '')}">
    </div>`;
  // Select-Feld
  const s = (label, key, options) => `
    <div>
      <label>${esc(label)}</label>
      <select data-sa="${prefix}.${key}">
        ${options.map(o => `<option value="${esc(o.v)}" ${p[key] === o.v ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
      </select>
    </div>`;

  // Verschachtelte Felder (z.B. immo1.verkehrswert)
  const sub = (parentKey, subKey, type, label, suffix, step) => {
    const sub_p = p[parentKey] || {};
    const fullKey = `${prefix}.${parentKey}.${subKey}`;
    const val = sub_p[subKey];
    if (type === 'date') {
      return `<div><label>${esc(label)}</label><input data-sa="${fullKey}" type="date" value="${esc(val || '')}"></div>`;
    }
    if (type === 'text') {
      return `<div><label>${esc(label)}</label><input data-sa="${fullKey}" type="text" value="${esc(val || '')}"></div>`;
    }
    return `<div><label>${esc(label)}${suffix ? ' (' + suffix + ')' : ''}</label><input data-sa="${fullKey}" type="number" min="0" step="${step || 'any'}" value="${val !== undefined && val !== null ? val : ''}"></div>`;
  };

  // Iter 72 (21.05.2026): Stammdaten in einem zusammenfassenden Container — abgegrenzt
  //   vom Finanz-Abschnitt durch eigenes Banner + Trennlinie.
  const stammdatenInhalt = `
    <div style="font-weight:600;color:#3A2E13;font-size:14px;margin-bottom:8px;">Persönliche Verhältnisse</div>
    <div class="grid-2">
      ${t('Name', 'name')}
      ${t('Geburtsname', 'geburtsname')}
      ${t('Vorname', 'vorname')}
      ${d('Geburtsdatum', 'geburtsdatum')}
      ${t('Geburtsort', 'geburtsort')}
      ${t('Staatsangehörigkeit', 'staatsangehoerigkeit')}
      ${t('Straße', 'strasse')}
      ${t('PLZ', 'plz')}
      ${t('Ort', 'ort')}
      ${t('Wohnhaft seit (MM/JJJJ)', 'wohnhaftSeit')}
      ${t('Vor-Anschrift (falls < 3 Jahre)', 'vorAnschrift')}
      ${s('Wohnsituation', 'wohnsituation', [{v:'',l:'—'},{v:'eigentum',l:'Eigentum'},{v:'miete',l:'zur Miete'},{v:'mietfrei',l:'mietfrei (bei Eltern u. ä.)'}])}
      ${t('Vermieter (Name, falls zur Miete)', 'vermieter')}
      ${t('Telefon privat', 'telefonPrivat')}
      ${t('Telefon geschäftlich', 'telefonGeschaeftlich')}
      ${t('E-Mail', 'email')}
      ${t('Steuer-ID', 'steuerId')}
      ${t('Ausgeübter Beruf', 'beruf')}
      ${t('Beschäftigt bei Firma', 'firma')}
      ${d('Beschäftigt seit', 'beschaeftigtSeit')}
      ${s('Befristung', 'befristung', [{v:'unbefristet',l:'unbefristet'},{v:'befristet',l:'befristet'}])}
      ${s('Probezeit', 'probezeit', [{v:'',l:'—'},{v:'nein',l:'nein'},{v:'ja',l:'ja'}])}
      ${n('Unterhaltspflichtige Personen', 'unterhaltspflichtig')}
      ${s('Familienstand', 'familienstand', [
        {v:'ledig',l:'ledig'},{v:'verheiratet',l:'verheiratet'},
        {v:'geschieden',l:'geschieden'},{v:'verwitwet',l:'verwitwet'}
      ])}
      ${s('Güterstand (nur falls verheiratet)', 'gueterstand', [
        {v:'',l:'—'},
        {v:'Zugewinngemeinschaft',l:'Zugewinngemeinschaft (Standard)'},
        {v:'Gütertrennung',l:'Gütertrennung'},
        {v:'Gütergemeinschaft',l:'Gütergemeinschaft'},
        {v:'Ehevertrag',l:'sonst. Ehevertrag'}
      ])}
      ${n('Kinder im Haushalt', 'kinderAnzahl')}
      ${t('Kinder Alter (Kommasep.)', 'kinderAlter')}
      ${/* SA-Redesign (22.05.2026): kirchensteuer raus (Bank ermittelt via Steuer-ID), kfzAnzahl raus (nicht Bank-relevant). kinderPlanung bleibt als Berater-interne Notiz, NICHT im PDF. */ ''}
      ${s('Kinder geplant (interne Notiz, nicht im PDF)', 'kinderPlanung', [{v:'',l:'—'},{v:'nein',l:'nein'},{v:'ja',l:'ja, in den nächsten 2 Jahren'}])}
      ${t('Hausbank', 'bank')}
      ${t('IBAN', 'iban')}
      ${t('BIC', 'bic')}
    </div>

    <div style="margin-top:18px;padding-top:14px;border-top:1px dashed #D6D2C8;">
      <div style="font-weight:600;color:#3A2E13;font-size:14px;margin-bottom:8px;">Identifikation &amp; Compliance</div>
      <div class="text-tertiary text-small mb-12">
        Pflicht nach §10 GwG (Geldwäschegesetz) bei jeder Immobilienfinanzierung. Die Bank überprüft die Identität
        zusätzlich per PostIdent/VideoIdent — die Angaben hier dienen der Vorprüfung.
      </div>
      <div class="grid-2">
        <div>
          <label>Ausweisart</label>
          <select data-sa="${prefix}.gwg.ausweisArt">
            ${[
              {v:'',l:'—'},
              {v:'Personalausweis',l:'Personalausweis'},
              {v:'Reisepass',l:'Reisepass'},
              {v:'Sonstiges',l:'Sonstiges'}
            ].map(o => `<option value="${esc(o.v)}" ${((p.gwg||{}).ausweisArt || '') === o.v ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
          </select>
        </div>
        ${sub('gwg', 'ausweisNr', 'text', 'Ausweis-Nummer')}
        ${sub('gwg', 'ausweisBehoerde', 'text', 'Ausstellende Behörde')}
        ${sub('gwg', 'ausweisAusgestellt', 'date', 'Ausgestellt am')}
        ${sub('gwg', 'ausweisGueltig', 'date', 'Gültig bis')}
      </div>
      <div class="sa-pep-warning" style="margin-top:14px;">
        <div style="font-weight:600;margin-bottom:8px;">PEP-Erklärung (politisch exponierte Person)</div>
        <div class="text-tertiary text-small mb-8">
          PEP = Person mit hochrangigem öffentlichem Amt oder Familienangehörige/nahestehende Personen einer solchen
          (§1 Abs. 12&ndash;14 GwG). Pflichtangabe.
        </div>
        ${s('Status', 'pep', [
          {v:'',l:'—'},
          {v:'nein',l:'Nein — ich bin keine PEP'},
          {v:'ja',l:'Ja — ich bin PEP (bitte erläutern)'}
        ])}
        ${t('Erläuterung (nur falls PEP)', 'pepDetails')}
      </div>
    </div>
  `;

  // Block-Inhalte als Strings — werden in blockContainer eingehängt.
  // SA-Redesign (22.05.2026): Checklisten auf 3 prägnante Bullets reduziert,
  // Banken-Code-Inline-Listen ersetzt durch <datalist> auf den Titel-Inputs (s. zusatzListeInline).
  // Fonds-Logik wandert in den Vermögen-Block (einziger Ort der Aktion).
  const einnahmenInhalt = `
    ${checklistBox('Einnahmen — was abfragen', [
      '<strong>Brutto + Netto + Steuerklasse + Anzahl Gehälter</strong> (Pflichtfelder)',
      'Boni / Weihnachts- / Urlaubsgeld als <strong>Mo-Durchschnitt</strong> → Baukasten',
      'Renten, Unterhalt, Kindergeld, sonstige laufende Einnahmen → Baukasten',
    ])}
    <div class="grid-2">
      ${n('Brutto-Gehalt', 'bruttoMo', '€/Mo')}
      ${n('Netto-Gehalt', 'nettoMo', '€/Mo')}
      ${s('Steuerklasse', 'steuerklasse', [{v:'',l:'—'},{v:'I',l:'I'},{v:'II',l:'II'},{v:'III',l:'III'},{v:'IV',l:'IV'},{v:'V',l:'V'},{v:'VI',l:'VI'}])}
      ${n('Anzahl der Gehälter', 'anzahlGehaelter', '×', '0.5')}
    </div>
    ${zusatzListeInline('zusatzEinnahmen', 'Weitere Einnahmen (Baukasten)', '',
      'mo', 'Einnahme hinzufügen', 'einnahmen')}
  `;

  const ausgabenInhalt = `
    ${checklistBox('Ausgaben — was abfragen', [
      '<strong>Miete eigene Wohnung + Lebenshaltung</strong> (Pflichtfelder)',
      'PKV, Leasing, Unterhaltszahlungen → Baukasten',
      'Sparplan-Raten → Baukasten (gleicher Titel wie im Vermögen)',
    ])}
    <div class="grid-2">
      ${n('Miete inkl. NK (eigene Whg)', 'mieteMo', '€/Mo')}
      ${n('Laufende Lebenshaltung', 'lebenshaltungMo', '€/Mo')}
    </div>
    ${zusatzListeInline('zusatzAusgaben', 'Weitere Ausgaben (Baukasten)', '',
      'mo', 'Ausgabe hinzufügen', 'ausgaben')}
  `;

  const vermoegenInhalt = `
    ${checklistBox('Vermögen — was abfragen', [
      '<strong>Bankguthaben</strong> (Pflichtfeld)',
      'Depots, Sparbücher, Bauspar, VWL, LV-Rückkauf, Krypto, Edelmetalle → Baukasten',
      'Bei besparten Positionen: <strong>gleicher Titel wie in ② Ausgaben</strong> (Sparplan + Bestand werden so verknüpft)',
    ])}
    <div class="grid-2">
      ${n('Bankguthaben', 'bankguthaben', '€')}
    </div>
    ${zusatzListeInline('zusatzVermoegen', 'Weiteres Vermögen (Baukasten)',
      `<strong>Mapping ins PDF:</strong> Titel mit „bauspar/vwl/riester" → Bausparen · „aktie/etf/fonds/depot/wertpapier" → Wertpapier · „lebensvers/rentenvers/rückkauf/rürup" → LV · sonst Sonstige.`,
      'wert', 'Vermögen hinzufügen', 'vermoegen')}
  `;

  const verbindInhalt = `
    ${checklistBox('Verbindlichkeiten — was abfragen', [
      'Baufi für Bestandsimmobilien → kommt aus <em>⑤ Immobilien</em>, hier <strong>nicht nochmal</strong>',
      'Autokredit, Konsumkredit, Leasing, KfW ohne Immobilien-Bezug → Baukasten',
      '<strong>Pflicht:</strong> Pro Position mtl. Belastung UND Restsaldo',
    ])}
    ${zusatzListeInline('zusatzVerbindlichkeiten', 'Verbindlichkeiten (Baukasten)',
      `<strong>Bürgschaften</strong> nur im Notizfeld festhalten (kein mtl. Betrag).`,
      'mo-wert', 'Verbindlichkeit hinzufügen', 'verbindlichkeiten')}
  `;

  const notizenInhalt = `
    <div class="text-tertiary text-small mb-8">Bürgschaften, Erbpacht, geplante Karriereschritte, Sondertilgungen, anstehende Schenkungen / Erbschaften — alles Banken-relevante, was kein eigenes Feld hat.</div>
    <textarea data-sa="${prefix}.notizen" rows="5" class="sa-notizen-textarea">${esc(p.notizen || '')}</textarea>
  `;

  return `
    <!-- ============ ABSCHNITT 1 · STAMMDATEN ============ -->
    ${blockContainer(`${prefix}.stammdaten`, '👤', 'Stammdaten · Person & Compliance', 'gray', '', stammdatenInhalt)}

    <!-- Visueller Trenner zwischen Stammdaten und Finanz-Daten -->
    <div style="display:flex;align-items:center;gap:14px;margin:32px 0 18px;">
      <div style="flex:1;height:2px;background:linear-gradient(to right, transparent, #C9A961, transparent);"></div>
      <div style="font-size:13px;font-weight:700;color:#5C4922;text-transform:uppercase;letter-spacing:0.08em;">Finanzielle Verhältnisse</div>
      <div style="flex:1;height:2px;background:linear-gradient(to right, transparent, #C9A961, transparent);"></div>
    </div>

    <!-- ============ ABSCHNITT 2 · FINANZIELLE VERHÄLTNISSE ============ -->
    ${blockContainer(`${prefix}.einnahmen`,     '①', 'Einnahmen (monatlich)', 'in',  '↘ kommt rein',  einnahmenInhalt)}
    ${blockContainer(`${prefix}.ausgaben`,      '②', 'Ausgaben (monatlich)',  'out', '↗ geht raus',   ausgabenInhalt)}
    ${blockContainer(`${prefix}.vermoegen`,     '③', 'Vermögen',              'in',  '↘ ist drin',    vermoegenInhalt)}
    ${blockContainer(`${prefix}.verbindlich`,   '④', 'Verbindlichkeiten',     'out', '↗ ist draußen', verbindInhalt)}
    ${blockContainer(`${prefix}.immobilien`,    '⑤', 'Immobilien', 'neutral', 'Mieten → ① · Baufi → ④', immobilienBaukastenHtml())}
    ${blockContainer(`${prefix}.notizen`,       '⑥', 'Notizen', 'gray', '', notizenInhalt)}
  `;
}

async function saveSelbstauskunft() {
  // collectSaFromDOM() liest a.*, m.* UND sa.* Felder (inkl. Checkboxes für Herkunft EK)
  // und schreibt nach state._sa. Wir verwenden bewusst die gleiche Funktion wie der
  // Auto-Save, damit es nur eine Quelle der Wahrheit gibt.
  const sa = collectSaFromDOM();
  sa.gemeinsam = document.getElementById('sa-gemeinsam').checked;
  cleanupLegacyFields(sa); // Iter 73: alte Felder auch beim manuellen Speichern mitlöschen (Audit-Fix 22.05.2026)
  try {
    await api.put('/api/kunden/' + state.kundeId, { saJson: sa });
    state.kunde.saJson = sa;
    toast('Selbstauskunft gespeichert', 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}
window.saveSelbstauskunft = saveSelbstauskunft;

// ===== MODUL: views/snapshots-tab (renderTabSnapshots + loadSnapshot) =====
/* ============================== SNAPSHOTS-TAB ============================== */

function renderTabSnapshots() {
  const el = document.getElementById('tab-content');
  const ss = state.snapshots || [];
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Gespeicherte Snapshots <span class="text-tertiary text-small">(${ss.length})</span></div>
      ${ss.length === 0 ? `
        <div class="empty-state">Noch keine Snapshots gespeichert.</div>
      ` : `
        <table class="table">
          <thead>
            <tr><th>Bezeichnung / ID</th><th>WE</th><th>Typ</th><th>Erstellt</th><th></th></tr>
          </thead>
          <tbody>
            ${ss.map(s => {
              const labelHtml = s.bezeichnung
                ? '<strong>' + esc(s.bezeichnung) + '</strong>'
                : '<span class="text-tertiary text-small">ohne Bezeichnung — ' + esc(s.id) + '</span>';
              const hasKalk = s.kalkJson && typeof s.kalkJson === 'object' && Object.keys(s.kalkJson).length > 0;
              return `
                <tr>
                  <td>${labelHtml}</td>
                  <td class="text-tertiary">${esc(s.weBezeichnung || '—')}</td>
                  <td>${esc(s.pdfTyp || '—')}</td>
                  <td class="text-tertiary">${esc(fmtDate(s.created))}</td>
                  <td style="white-space:nowrap; display:flex; gap:6px; justify-content:flex-end;">
                    <button class="secondary" onclick="loadSnapshot('${esc(s.id)}')" ${hasKalk ? '' : 'disabled title="Keine Kalkulations-Daten in diesem Snapshot"'}>Laden</button>
                    <button class="secondary" onclick="renameSnapshot('${esc(s.id)}')" title="Bezeichnung umbenennen">Umbenennen</button>
                    <button class="secondary" onclick="deleteSnapshot('${esc(s.id)}')" title="Snapshot löschen" style="color:#c00;">Löschen</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

async function renameSnapshot(id) {
  const s = (state.snapshots || []).find(x => x.id === id);
  if (!s) {
    toast('Snapshot nicht in Liste — bitte Seite aktualisieren', 'error');
    return;
  }
  const neu = await openSnapshotNameModal(s.bezeichnung || '', 'Snapshot umbenennen');
  if (neu === null) return;                       // Cancel
  const trimmed = String(neu).trim();
  if (trimmed === (s.bezeichnung || '').trim()) return;  // unverändert
  try {
    const updated = await api.patch('/api/snapshots', { id, bezeichnung: trimmed });
    // Lokale Liste aktualisieren
    const idx = state.snapshots.findIndex(x => x.id === id);
    if (idx >= 0) state.snapshots[idx] = updated;
    if (state.tab === 'snapshots') renderTabSnapshots();
    toast('Bezeichnung aktualisiert', 'success');
  } catch (e) {
    toast('Fehler beim Umbenennen: ' + (e.message || 'unbekannt'), 'error');
  }
}
window.renameSnapshot = renameSnapshot;

async function deleteSnapshot(id) {
  const s = (state.snapshots || []).find(x => x.id === id);
  const label = s && s.bezeichnung ? s.bezeichnung : id;
  if (!confirm('Snapshot "' + label + '" wirklich löschen? Das kann nicht rückgängig gemacht werden.')) {
    return;
  }
  try {
    await api.delete('/api/snapshots?id=' + encodeURIComponent(id));
    state.snapshots = (state.snapshots || []).filter(x => x.id !== id);
    if (state.tab === 'snapshots') renderTabSnapshots();
    toast('Snapshot gelöscht', 'success');
  } catch (e) {
    toast('Fehler beim Löschen: ' + (e.message || 'unbekannt'), 'error');
  }
}
window.deleteSnapshot = deleteSnapshot;

function loadSnapshot(id) {
  const s = state.snapshots.find(x => x.id === id);
  if (!s) {
    toast('Snapshot nicht in Liste gefunden — bitte Seite aktualisieren', 'error');
    return;
  }
  try {
    // Backend hat das Feld bereits via parseJsonField() geparst.
    // Defensiv: doppel-parse falls noch String (alte Snapshots aus Bug-Zeit).
    let kalk = s.kalkJson;
    let attempts = 0;
    while (typeof kalk === 'string' && attempts < 3) {
      try { kalk = JSON.parse(kalk); } catch(e) { break; }
      attempts++;
    }
    if (!kalk || typeof kalk !== 'object' || Object.keys(kalk).length === 0) {
      toast('Snapshot "' + (s.bezeichnung || '—') + '" enthält keine Kalkulations-Daten. Bitte neuen Snapshot speichern.', 'error');
      return;
    }
    // Wichtig: state.kalk komplett ersetzen (kein Object.assign, sonst bleiben alte Felder)
    state.kalk = kalk;
    clearKalkDirty(); // Frischer Snapshot-Load → noch nichts geändert
    // Iter 60 (20.05.2026): Alte Snapshots haben kein saSteuersatz — initialisieren
    //   aus dem damaligen `steuersatz`, damit der Detail-Modus-Slider nicht auf 0 % steht.
    if (typeof state.kalk.saSteuersatz !== 'number') {
      state.kalk.saSteuersatz = (typeof state.kalk.steuersatz === 'number') ? state.kalk.steuersatz : 0.30;
    }
    // QA-Fix 2026-05-22 (Audit-A B1): gebaeudeAnteil-Auto-Promote bei alten Snapshots.
    // Default wurde 20.05.2026 von 0.80 auf 0.85 angehoben (Iter 61, Henry-Durchgang).
    // 26/30 Live-Snapshots haben noch 0.80 eingefroren — Engine rechnet dann mit dem
    // alten Wert und der Vertriebler sieht ~6 % zu niedrige AfA-Bemessung im Vergleich
    // zur Neu-Rechnung. Wir promoten beim Load automatisch + zeigen Hinweis.
    let _promoted = false;
    if (typeof state.kalk.gebaeudeAnteil === 'number' && state.kalk.gebaeudeAnteil < 0.85) {
      const old = state.kalk.gebaeudeAnteil;
      state.kalk.gebaeudeAnteil = 0.85;
      state.kalk._gebaeudeAnteilOld = old;
      _promoted = true;
    }
    setTab('kalkulator');
    // QA-Fix 2026-05-22 (Audit-A B2): Aktualitäts-Hinweis. Snapshots sind eingefrorene
    // Konserven (Marktmiete, Subv-Phasen, Stammdaten zum Speicher-Zeitpunkt). Vertriebler
    // soll wissen: "vorsicht, das ist eine alte Rechnung". Wenn er Live-Stammdaten will,
    // muss er die WE neu aus dem Dropdown laden.
    const datumStr = s.createdAt ? fmtDate(s.createdAt) : null;
    if (_promoted && datumStr) {
      toast('Snapshot vom ' + datumStr + ' geladen — Gebäude-Anteil auto-angepasst (0,80→0,85, Iter 61). Stammdaten sind eingefroren; für Live-Werte WE neu wählen.', 'warning');
    } else if (datumStr) {
      toast('Snapshot vom ' + datumStr + ' geladen — Werte sind eingefroren. Für aktuelle Stammdaten WE neu aus Dropdown wählen.', 'info');
    } else {
      toast('Snapshot "' + (s.bezeichnung || '—') + '" geladen', 'success');
    }
  } catch (e) {
    console.error('loadSnapshot error:', e, 'snapshot:', s);
    toast('Snapshot konnte nicht geladen werden: ' + e.message, 'error');
  }
}
window.loadSnapshot = loadSnapshot;

// ===== MODUL: views/admin (renderAdmin + renderAdminStammdatenAudit) =====
/* ============================== ADMIN ============================== */

async function renderAdmin() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="main"><h1 class="page-title">Admin</h1><div class="empty-state">Lade…</div></div>`;
  try {
    // Stats + Wohneinheiten (alle Vermarktung, auch nicht-aktiv) + Stammdaten-Audit parallel
    // Iter 53: Admin sieht mit ?all=1 auch potenziell aktivierbare WEs
    const [stats, wohneinheiten, audit] = await Promise.all([
      api.get('/api/admin/stats'),
      api.get('/api/wohneinheiten?all=1'),
      api.get('/api/stammdaten').catch(() => []),
    ]);
    state.adminStats = stats;
    state.adminWohneinheiten = wohneinheiten || [];
    state.adminStammAudit = Array.isArray(audit) ? audit : [];
  } catch (e) {
    app.innerHTML = `<div class="main"><div class="error-banner">${esc(e.message)}</div></div>`;
    return;
  }
  const s = state.adminStats || {};
  const wes = state.adminWohneinheiten || [];

  // Wohneinheiten nach Projekt gruppieren — getrennt nach Aktiv-Status (Iter 53)
  const wesAktiv = wes.filter(w => w.inStammdatenAktiv);
  const wesPotenziell = wes.filter(w => !w.inStammdatenAktiv);
  function groupByProjekt(list) {
    const map = {};
    list.forEach(we => {
      const pn = we.projektName || '— ohne Projekt —';
      if (!map[pn]) map[pn] = [];
      map[pn].push(we);
    });
    return map;
  }
  const wesAktivByProjekt = groupByProjekt(wesAktiv);
  const wesPotenziellByProjekt = groupByProjekt(wesPotenziell);
  const wesByProjekt = groupByProjekt(wes); // kombiniert für Stammdaten-Audit
  const projektKeys = Object.keys(wesByProjekt).sort();

  // Summen pro Projekt (für Header-Info)
  function projektSumme(arr) {
    let kp = 0, qm = 0, miete = 0;
    arr.forEach(w => { kp += w.kp || 0; qm += w.qm || 0; miete += w.kaltmiete || 0; });
    return { kp, qm, miete, count: arr.length };
  }
  // Helfer für €/Zahl-Anzeige
  const eur = (v) => (v === null || v === undefined || !isFinite(v)) ? '–' : Math.round(v).toLocaleString('de-DE') + ' €';
  const num = (v, d) => (v === null || v === undefined || !isFinite(v)) ? '–' : v.toLocaleString('de-DE', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });

  app.innerHTML = `
    <div class="main">
      <h1 class="page-title">Admin</h1>
      <p class="page-subtitle">Statistik, Kunden &amp; WE-Stammdaten</p>

      ${(() => {
        const aktivWes = wes.filter(w => w.inStammdatenAktiv);
        const potenzielleWes = wes.filter(w => !w.inStammdatenAktiv);
        return `
          <div class="kpi-grid">
            <div class="kpi"><div class="label">Gesamt Kunden</div><div class="value">${s.totalKunden || 0}</div></div>
            <div class="kpi"><div class="label">Vertriebler</div><div class="value">${(s.vertriebler || []).length}</div></div>
            <div class="kpi positive"><div class="label">Beurkundet</div><div class="value">${(s.byPhase && s.byPhase['Beurkundet']) || 0}</div></div>
            <div class="kpi"><div class="label">Aktive WEs im Vertrieb</div><div class="value">${aktivWes.length}<span style="font-size:12px;color:#7A7A72;font-weight:normal;"> &nbsp;+ ${potenzielleWes.length} potenziell</span></div></div>
          </div>`;
      })()}

      <div class="card">
        <div class="card-title">Vertriebler <span class="text-tertiary text-small" style="font-weight:normal;">(Pipeline pro Person)</span></div>
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rolle</th>
              <th class="num">Kunden gesamt</th>
              <th class="num">In Bearbeitung</th>
              <th class="num">Reserviert</th>
              <th class="num">Notar-Termin</th>
              <th class="num">Beurkundet</th>
            </tr>
          </thead>
          <tbody>
            ${(s.vertriebler || []).map(v => `
              <tr>
                <td><strong>${esc(v.name)}</strong></td>
                <td>${esc(v.rolle)}</td>
                <td class="num">${v.kundenGesamt || 0}</td>
                <td class="num">${v.inBearbeitung || 0}</td>
                <td class="num ${(v.reserviert||0)>0 ? 'stats-cell warn' : ''}">${v.reserviert || 0}</td>
                <td class="num ${(v.notarTermin||0)>0 ? 'stats-cell notar' : ''}">${v.notarTermin || 0}</td>
                <td class="num pos">${v.beurkundet || 0}</td>
              </tr>
            `).join('')}
            ${(s.vertriebler || []).length > 1 ? `
              <tr class="stats-row-summary">
                <td>Summe</td><td></td>
                <td class="num">${(s.vertriebler || []).reduce((a,v) => a + (v.kundenGesamt||0), 0)}</td>
                <td class="num">${(s.vertriebler || []).reduce((a,v) => a + (v.inBearbeitung||0), 0)}</td>
                <td class="num">${(s.vertriebler || []).reduce((a,v) => a + (v.reserviert||0), 0)}</td>
                <td class="num">${(s.vertriebler || []).reduce((a,v) => a + (v.notarTermin||0), 0)}</td>
                <td class="num pos">${(s.vertriebler || []).reduce((a,v) => a + (v.beurkundet||0), 0)}</td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>

      ${(() => {
        // Iter 52: Aktive Kunden + Archivierte separat darstellen (Admin-only)
        const alle = s.alleKunden || [];
        const aktiv = alle.filter(k => !k.archiviert);
        const archiv = alle.filter(k => !!k.archiviert);
        const kundenRow = (k) => {
          const displayName = k.name
            || ((k.vorname || '') + ' ' + (k.nachname || '')).trim()
            || k.email
            || ('Kunde ' + (k.id || '').slice(-6));
          return `
            <tr onclick="go('/kunde/${esc(k.id)}')" style="cursor:pointer;">
              <td><strong>${esc(displayName)}</strong></td>
              <td class="text-tertiary">${esc(k.email || '—')}</td>
              <td class="text-tertiary">${esc(k.ownerName || '—')}</td>
              <td><span class="badge ${phaseBadgeClass(k.phase)}">${esc(k.phase || '—')}</span></td>
              <td class="text-tertiary">${esc(fmtDate(k.lastActivity))}</td>
            </tr>
          `;
        };
        return `
          <div class="card mt-16">
            <div class="card-title">Aktive Kunden <span class="text-tertiary text-small" style="font-weight:normal;">(${aktiv.length})</span></div>
            ${aktiv.length === 0 ? `
              <div class="empty-state">Keine aktiven Kunden.</div>
            ` : `
              <table class="table">
                <thead><tr><th>Name</th><th>E-Mail</th><th>Owner</th><th>Phase</th><th>Letzte Aktivität</th></tr></thead>
                <tbody>${aktiv.map(kundenRow).join('')}</tbody>
              </table>
            `}
          </div>
          ${archiv.length > 0 ? `
            <details class="card mt-16" style="background:#f7f7f4;">
              <summary style="cursor:pointer;font-weight:600;color:#7A7A72;padding:6px 0;list-style:none;">
                <span style="font-size:14px;">📦 Archivierte Kunden (${archiv.length}) — vom Vertrieb ausgeblendet</span>
              </summary>
              <div style="margin-top:12px;">
                <table class="table">
                  <thead><tr><th>Name</th><th>E-Mail</th><th>Owner</th><th>Phase</th><th>Letzte Aktivität</th></tr></thead>
                  <tbody>${archiv.map(kundenRow).join('')}</tbody>
                </table>
              </div>
            </details>
          ` : ''}
        `;
      })()}

      ${wesPotenziell.length > 0 ? `
        <div class="card mt-16" style="border-left:3px solid #B08A4D;">
          <div class="card-title">⚙ Potenziell aktivierbare Wohneinheiten <span class="text-tertiary text-small" style="font-weight:normal;">(${wesPotenziell.length} in Vermarktung, ohne Aktiv-Stammdaten)</span></div>
          <p class="text-tertiary text-small" style="margin:0 0 12px;">Diese WEs sind aktuell in Vermarktung bei B&amp;B Immo, haben aber noch keine Kalk-Stammdaten auf „Aktiv". Domi/Henry können diese aktivieren, sobald MbV + Marktmiete + Marktpreis IS/HD + Vermietungs-Modus gepflegt sind.</p>
          <table class="table">
            <thead><tr><th>Projekt</th><th>WE</th><th class="num">Kaufpreis</th><th class="num">qm</th><th class="num">Kaltmiete</th></tr></thead>
            <tbody>
              ${Object.keys(wesPotenziellByProjekt).sort().flatMap(pn =>
                wesPotenziellByProjekt[pn].map(we => `
                  <tr>
                    <td class="text-tertiary text-small">${esc(pn)}</td>
                    <td><strong>${esc(we.weNr ? 'WE ' + we.weNr : '')}</strong> ${esc(we.lageText || we.lage || '')}</td>
                    <td class="num">${eur(we.kp)}</td>
                    <td class="num">${num(we.qm, 2)}</td>
                    <td class="num">${eur(we.kaltmiete)}</td>
                  </tr>
                `)
              ).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      ${renderAdminStammdatenAudit(state.adminStammAudit || [])}
    </div>
  `;
}

async function reloadAdminWohneinheiten() {
  try {
    toast('Lade Wohneinheiten neu aus Airtable…', 'info');
    state.adminWohneinheiten = await api.get('/api/wohneinheiten');
    state.adminStammAudit = await api.get('/api/stammdaten').catch(() => []);
    state.wohneinheiten = null;
    renderAdmin();
    toast('Wohneinheiten neu geladen', 'success');
  } catch (e) {
    toast('Fehler beim Neuladen: ' + e.message, 'error');
  }
}
window.reloadAdminWohneinheiten = reloadAdminWohneinheiten;

// Stammdaten-Audit-Tabelle: zeigt pro WE alle kalkulationsrelevanten Felder + Status
// Sortiert nach Projekt (aus WE-Titel abgeleitet). Markiert fehlende Werte rot.
function renderAdminStammdatenAudit(audit) {
  // Audit-Fix Iter 49 (19.05.2026): Inline-Hex-Farben → CSS-Klassen (siehe styles.css `.audit-pill`).
  const missing = '<span class="audit-cell-missing">–</span>';
  const eurN  = (v) => (v === null || v === undefined || !isFinite(v)) ? missing : Math.round(v).toLocaleString('de-DE') + ' €';
  const pctN  = (v) => (v === null || v === undefined || !isFinite(v)) ? missing : (v * 100).toFixed(2).replace('.', ',') + ' %';
  const numN  = (v) => (v === null || v === undefined || !isFinite(v)) ? missing : Math.round(v).toLocaleString('de-DE');
  const dateN = (v) => v ? new Date(v).toLocaleDateString('de-DE') : missing;
  const statusBadge = (s) => {
    if (s === 'Aktiv')      return '<span class="audit-pill aktiv">Aktiv</span>';
    if (s === 'Entwurf')    return '<span class="audit-pill entwurf">Entwurf</span>';
    if (s === 'Archiviert') return '<span class="audit-pill archiv">Archiv</span>';
    return '<span class="audit-pill fehlt">fehlt</span>';
  };
  const vermBadge = (s) => {
    if (s === 'vermietet') return '<span class="audit-pill size-sm vermietet">vermietet</span>';
    if (s === 'leer')      return '<span class="audit-pill size-sm leer">leer</span>';
    return '';
  };

  // Nach Projekt gruppieren (Projektname aus Titel ableiten — alles nach „, "  vom Ende — Adresse/PLZ-Ort)
  const projektAus = (titel) => {
    // Titel-Form: "WE: 1, EG Links, Heidelberger Straße 21, 76646 Bruchsal"
    const parts = (titel || '').split(',').map(s => s.trim());
    if (parts.length < 4) return parts.slice(2).join(', ') || 'unbekannt';
    return parts.slice(2).join(', ');
  };
  const byProjekt = {};
  audit.forEach(row => {
    const titel = (row.we && row.we.titel) || '';
    const p = projektAus(titel);
    if (!byProjekt[p]) byProjekt[p] = [];
    byProjekt[p].push(row);
  });
  const projektKeys = Object.keys(byProjekt).sort();

  // Statistik: wie viele Aktiv / Entwurf / Fehlt
  const counts = audit.reduce((a, r) => {
    const st = (r.stammdaten && r.stammdaten.status) || 'fehlt';
    a[st] = (a[st] || 0) + 1;
    return a;
  }, {});

  return `
    <div class="card mt-16">
      <div class="card-title">
        Kalkulations-Stammdaten-Audit
        <span class="text-tertiary text-small" style="font-weight:normal;">(live aus Airtable · zeigt alle WEs in Vermarktung · markiert Lücken rot)</span>
        <button class="secondary" style="float:right;font-size:13px;" onclick="reloadAdminWohneinheiten()">⟳ Neu laden</button>
      </div>
      <div class="text-tertiary text-small mb-12">
        <strong>${audit.length} WEs</strong> · ${counts['Aktiv'] || 0} Aktiv (App nutzt direkt) · ${counts['Entwurf'] || 0} Entwurf · ${counts['fehlt'] || 0} ohne Stammdaten-Eintrag.
        Nur „Aktiv" wird im Kalkulator als verbindliche Wahrheit übernommen — bei „Entwurf" oder „fehlt" laufen Default-Annahmen (Wertsteigerung 3 %, AfA 2 %, Hausgeld 1 €/m²).
      </div>
      ${audit.length === 0 ? `<div class="empty-state">Keine Stammdaten-Datensätze gefunden — Endpoint prüfen.</div>` : projektKeys.map(pn => {
        const arr = byProjekt[pn].sort((a, b) => {
          const an = parseInt(a.we.weNr) || 0; const bn = parseInt(b.we.weNr) || 0;
          return an - bn;
        });
        const aktiv = arr.filter(r => r.stammdaten && r.stammdaten.status === 'Aktiv').length;
        return `
          <details open style="margin-top:12px;">
            <summary class="admin-audit-summary-bar">
              ${esc(pn)} <span class="text-tertiary text-small" style="font-weight:normal;margin-left:8px;">${arr.length} WEs · ${aktiv} Aktiv</span>
            </summary>
            <div style="overflow-x:auto;">
              <table class="table mt-8 admin-audit-table">
                <thead>
                  <tr>
                    <th>WE</th>
                    <th>Status</th>
                    <th>Vermietung</th>
                    <th class="num">Kaufpreis</th>
                    <th class="num">m²</th>
                    <th class="num">Kaltmiete</th>
                    <th class="num">+Stellpl.<br>KP / Miete</th>
                    <th class="num">Hausgeld<br>+Rücklage</th>
                    <th class="num">Hausverw.</th>
                    <th class="num">Mietzu-<br>schuss / Mo</th>
                    <th class="num">AfA<br>Gut.</th>
                    <th class="num">Geb.-<br>Anteil</th>
                    <th class="num">Wertst.<br>p.a.</th>
                    <th class="num">GrESt</th>
                    <th>Mieterh.<br>Modus</th>
                    <th class="num">Letzte<br>Mieterh.</th>
                    <th>Quelle / Notiz</th>
                  </tr>
                </thead>
                <tbody>
                  ${arr.map(r => {
                    const sd = r.stammdaten;
                    const we = r.we;
                    const lageText = (we.titel || '').split(',').slice(1, 2).join(',').trim();
                    return `
                      <tr class="${sd && sd.status === 'Aktiv' ? '' : 'row-inactive'}">
                        <td><strong>WE ${esc(we.weNr || '?')}</strong><br><span class="text-tertiary text-small">${esc(lageText)}</span></td>
                        <td>${statusBadge(sd && sd.status)}</td>
                        <td>${vermBadge(r.vermietung && r.vermietung.status)}</td>
                        <td class="num">${eurN(we.kp)}</td>
                        <td class="num">${numN(we.qm)}</td>
                        <td class="num">${eurN(we.kaltmiete)}</td>
                        <td class="num">${r.stellplaetze && r.stellplaetze.anzahl > 0 ? eurN(r.stellplaetze.kaufpreisSumme) + '<br>' + eurN(r.stellplaetze.mieteMoSumme) : '<span class="text-tertiary">–</span>'}</td>
                        <td class="num">${sd ? eurN(sd.hausgeldRuecklage) : statusBadge(null)}</td>
                        <td class="num">${sd ? eurN(sd.hausverwaltung) : statusBadge(null)}</td>
                        <td class="num">${sd && sd.mietzuschuss > 0 ? eurN(sd.mietzuschuss) + '<br>' + (sd.mietzuschussMonate || 0) + ' Mo' : '<span class="text-tertiary">–</span>'}</td>
                        <td class="num">${sd ? pctN(sd.afaGutachten) : statusBadge(null)}</td>
                        <td class="num">${sd ? pctN(sd.gebaeudeAnteil) : statusBadge(null)}</td>
                        <td class="num">${sd ? pctN(sd.wertsteigerung) : statusBadge(null)}</td>
                        <td class="num">${sd ? pctN(sd.grEst) : statusBadge(null)}</td>
                        <td><span class="text-tertiary text-small">${esc((sd && sd.vermietungsModus) || '–')}<br>${esc((sd && sd.kappungsgrenze) || '')}</span></td>
                        <td class="num text-small">${dateN(r.vermietung && r.vermietung.letzteMietsteigerung)}<br><span class="text-tertiary" style="font-size:10px;">${(() => {
                          // QA-Fix 2026-05-23 (Audit R-8): deutsche Labels statt Slug.
                          const q = (r.vermietung && r.vermietung.letzteMietsteigerungQuelle) || '';
                          return esc(
                            q === 'kalk-stammdaten' ? 'manuell' :
                            q === 'mietvertrag-anpassung' ? 'Anpassung' :
                            q === 'mietvertrag-vertragsbeginn-alt' ? '⚠ Vertragsbeginn >3J' :
                            q === 'mietvertrag-vertragsbeginn' ? '⚠ Vertragsbeginn' :
                            q === 'mietvertrag' ? 'Mietvertrag' :
                            q === 'leerstand-keine' ? 'leer' :
                            q === 'unbekannt' ? '⚠ nicht gepflegt' : q
                          );
                        })()}</span></td>
                        <td class="text-tertiary text-small">${esc((sd && sd.quelle) || '–')}${sd && sd.notizen ? '<br><em>' + esc((sd.notizen || '').slice(0, 80)) + '…</em>' : ''}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </details>
        `;
      }).join('')}
      <div class="text-tertiary text-small mt-12" style="font-style:italic;">
        Bearbeitung läuft in Airtable. Direktlink: <a href="${AIRTABLE_LINKS.KALK_STAMMDATEN}" target="_blank" rel="noopener">Kalkulations-Stammdaten-Tabelle</a> bzw. <a href="${AIRTABLE_LINKS.WOHNEINHEIT}" target="_blank" rel="noopener">Wohneinheit-Tabelle</a>.
      </div>
    </div>
  `;
}

// ===== MODUL: bootstrap (render-Dispatch + Boot-Handler) =====
/* ============================== RENDER DISPATCH ============================== */

/* ============================== WE-LISTE (Vertriebs-Übersicht) ==============================
   QA-Sprint 2026-05-23: Edgar-Auftrag — Vertrieb braucht eine Live-Liste aller aktiven WEs
   mit den wichtigsten Kennzahlen (KP, Garage, Subv, Vermietung, Rendite, CF J1, Vermögen J10).
   Pro Projekt sortiert. Klick auf eine WE öffnet die Kalkulation mit dieser WE vorausgewählt.

   Datenquelle: /api/stammdaten (Admin-Audit-Endpoint, liefert pro WE: we, stellplaetze,
   vermietung, stammdaten). Vertriebs-KPIs werden client-side mit Kalk.recalc() berechnet,
   damit wir nicht extra Backend-Logik bauen müssen.
*/

let _weListeCache = null;
// Welle 2 (2026-05-24): Vergleichs-Auswahl. Set<weId>. Multi-Projekt erlaubt.
// Persistiert NICHT in localStorage — pro Session.
const _weVergleichSel = new Set();
// QA-Sprint 2026-05-23 (Edgar live): Default ist „30% StSatz · 4,5% Zins · KP ohne KNK".
// QA-Fix 2026-05-23 (Audit-P-2): Auswahl in localStorage persistieren.
// 2026-05-23 Edgar-Korrektur: 6er-Matrix statt 12er — KNK koppelt sich an
// den Zins (mit=4,8%, ohne=4,5%). Naming-Schema s{StSatz}{ohne|knk}.
const _WE_LISTE_PROFIL_LS_KEY = 'bbk_we_liste_profil';
let _weListeProfil = (() => {
  try {
    const saved = localStorage.getItem(_WE_LISTE_PROFIL_LS_KEY);
    if (saved && /^s\d{2}(ohne|knk)$/.test(saved)) return saved;
    // Migration: alte 12er-Slugs (s30z45ohne etc.) → neue 6er-Slugs
    if (saved && /^s\d{2}z\d{2}(ohne|knk)$/.test(saved)) {
      const m = saved.match(/^s(\d{2})z\d{2}(ohne|knk)$/);
      if (m) return `s${m[1]}${m[2]}`;
    }
  } catch {}
  return 's30ohne';
})();

async function renderWeListe() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="main">
      <div class="we-liste-head" style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;margin-bottom:18px;">
        <div>
          <h1 class="page-title" style="margin:0 0 6px;">Aktive Wohneinheiten</h1>
          <div class="text-tertiary text-small">Live-Liste aller in Vermarktung — pro Projekt sortiert. Klick auf eine WE öffnet die Kalkulation.</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <label class="text-tertiary text-small" for="we-liste-profil" style="white-space:nowrap;">Kennzahlen für Profil</label>
          <select id="we-liste-profil" onchange="window._weListeSetProfil(this.value)" style="padding:6px 10px;font-size:13px;min-width:340px;">
            ${(() => {
              // QA-Sprint 2026-05-23 (Edgar-Korrektur): 6er-Matrix — pro StSatz
              // nur 2 Varianten. KNK koppelt automatisch den Zins:
              //   ohne KNK → 4,5 % Zins (Standard-KP-Finanzierung)
              //   mit KNK  → 4,8 % Zins (Bank-Aufschlag bei höherem Beleihungsauslauf)
              const stSaetze = [30, 35, 42];
              const varianten = [
                { key: 'ohne', label: 'KP ohne KNK (4,5 % Zins)' },
                { key: 'knk',  label: 'KP + KNK finanziert (4,8 % Zins)' },
              ];
              return stSaetze.map(st => {
                const groupOpts = varianten.map(v => {
                  const val = `s${st}${v.key}`;
                  return `<option value="${val}"${_weListeProfil === val ? ' selected' : ''}>${v.label}</option>`;
                }).join('');
                return `<optgroup label="${st} % Steuersatz · 1 % Tilgung">${groupOpts}</optgroup>`;
              }).join('');
            })()}
          </select>
          <button class="secondary" onclick="window._weListeReload()" style="font-size:13px;">⟳ Neu laden</button>
        </div>
      </div>
      <div id="we-liste-content">
        <div class="empty-state" style="padding:48px;text-align:center;color:var(--text-tertiary);">Lade Wohneinheiten + Stammdaten …</div>
      </div>
    </div>
  `;
  // Daten laden + rendern
  try {
    if (!_weListeCache) {
      // QA-Fix 2026-05-23 (B2/B3 Edgar-Doc): WE-Liste rechnete mit reduzierten Inputs
      // (nur Stammdaten-Audit-Endpoint) → Cashflow J1 wich erheblich von App ab, weil
      // 2-Phasen-Subv und Tag-1-Vereinbarung (Mietvertrag-Zukunft) fehlten.
      // Lösung: pro WE den individuellen Stammdaten-Endpoint nutzen (liefert
      // derived.subventionPhasen + derived.subventionKaltmieteAdjustiert +
      // vermietung.letzteMietsteigerung). Parallel-Calls via Promise.all.
      const auditList = await api.get('/api/stammdaten');
      const activeRows = auditList.filter(row => row.stammdaten && row.stammdaten.status === 'Aktiv');
      // Pro aktive WE parallel den Detail-Endpoint holen
      const detailById = {};
      await Promise.all(activeRows.map(async row => {
        const weId = row.we && row.we.id;
        if (!weId) return;
        try {
          const detail = await api.get('/api/stammdaten/' + encodeURIComponent(weId));
          detailById[weId] = detail;
        } catch (e) {
          // einzelne Fehler nicht-tödlich — Fallback auf Audit-Daten
          detailById[weId] = null;
        }
      }));
      _weListeCache = { auditList, detailById };
    }
    _renderWeListeContent();
  } catch (e) {
    document.getElementById('we-liste-content').innerHTML = `
      <div class="empty-state" style="padding:48px;text-align:center;color:var(--negative);">Fehler beim Laden: ${esc(e.message || 'unbekannt')}</div>
    `;
  }
}

function _weListeReload() {
  _weListeCache = null;
  renderWeListe();
}
window._weListeReload = _weListeReload;

function _weListeSetProfil(p) {
  _weListeProfil = p;
  // QA-Fix 2026-05-23 (Audit-P-2): in localStorage persistieren.
  try { localStorage.setItem(_WE_LISTE_PROFIL_LS_KEY, p); } catch {}
  _renderWeListeContent();
}
window._weListeSetProfil = _weListeSetProfil;

function _renderWeListeContent() {
  const el = document.getElementById('we-liste-content');
  if (!el || !_weListeCache) return;

  // Nur aktive Stammdaten zeigen — der Vertrieb braucht keine Entwurf-/Fehlt-WEs
  const audit = (_weListeCache.auditList || []).filter(row => row.stammdaten && row.stammdaten.status === 'Aktiv');
  const detailById = _weListeCache.detailById || {};

  // Nach Projekt gruppieren (aus WE-Titel ableiten)
  const projektAus = (titel) => {
    const parts = (titel || '').split(',').map(s => s.trim());
    if (parts.length < 4) return parts.slice(2).join(', ') || 'unbekannt';
    return parts.slice(2).join(', ');
  };
  const byProjekt = {};
  audit.forEach(row => {
    const t = (row.we && row.we.titel) || '';
    const p = projektAus(t);
    if (!byProjekt[p]) byProjekt[p] = [];
    byProjekt[p].push(row);
  });
  const projekte = Object.keys(byProjekt).sort();

  if (audit.length === 0) {
    // QA-Fix 2026-05-23 (Audit-EE-2): nicht nur Text, sondern Reload-Action +
    // Hinweis an wen sich der Vertriebler wenden soll.
    el.innerHTML = `
      <div class="empty-state" style="padding:48px;text-align:center;color:var(--text-tertiary);">
        <div style="font-size:15px;margin-bottom:8px;">Keine aktiven Wohneinheiten gefunden.</div>
        <div style="font-size:12px;margin-bottom:20px;">Heißt: Es gibt aktuell keine WE im Status „Vermarktung / Im Verkauf" mit aktiven Stammdaten.</div>
        <button onclick="renderWeListe()" style="font-family:inherit;font-size:13px;padding:8px 18px;border:1px solid #C9A572;background:#fff;border-radius:18px;cursor:pointer;">⟳ Neu laden</button>
        <div style="font-size:11px;margin-top:14px;color:var(--text-tertiary);">Bleibt das Ergebnis leer → Domi/Henry pingen, Stammdaten-Pflege checken.</div>
      </div>`;
    return;
  }

  const fmtEur = (v) => (v == null || !isFinite(v)) ? '–' : Math.round(v).toLocaleString('de-DE') + ' €';
  const fmtEurMo = (v) => (v == null || !isFinite(v)) ? '–' : Math.round(v).toLocaleString('de-DE') + ' €/Mo';
  const fmtPct  = (v) => (v == null || !isFinite(v)) ? '–' : (v * 100).toFixed(1).replace('.', ',') + ' %';
  // QA-Sprint 2026-05-23 (Edgar-Doc Bug-1): €/qm + qm im WE-Liste anzeigen.
  const fmtQm = (v) => (v == null || !isFinite(v) || v <= 0) ? '–' : v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' qm';
  const fmtEurPerQm = (kp, qm) => (qm > 0 && kp > 0) ? Math.round(kp / qm).toLocaleString('de-DE') + ' €/qm' : '';

  // Pro Zeile: Engine durchrechnen
  function _berechne(row) {
    if (!window.Kalk || !window.Kalk.recalc) return null;
    try {
      const sd = row.stammdaten || {};
      const we = row.we || {};
      const stpl = row.stellplaetze || {};
      const verm = row.vermietung || {};

      // QA-Fix 2026-05-23 (B2/B3 Edgar-Doc): Detail-Endpoint-Daten nutzen wenn vorhanden.
      // Liefert derived.subventionPhasen (2 Phasen), Tag-1-Vereinbarung (subventionKaltmieteAdjustiert),
      // korrekte vermietung.letzteMietsteigerung. Vorher war Cashflow J1 in der WE-Liste deutlich
      // negativer als in der App, weil 2-Phasen-Subv + Tag-1-Anhebung fehlten.
      const detail = (detailById && detailById[we.id]) || null;
      const derived = (detail && detail.derived) || null;
      const detailVerm = (detail && detail.vermietung) || verm;
      const detailStpl = (detail && detail.stellplaetze) || stpl;
      const detailWe = (detail && detail.we) || we;
      const detailKalk = (detail && detail.kalkStammdaten) || sd;

      const base = window.Kalk.getDefaults ? window.Kalk.getDefaults() : {};
      const profile = (window.Kalk.PROFILES && window.Kalk.PROFILES[_weListeProfil]) || {};

      // Vermietungs-Modus aus Stammdaten (Edgar-Feedback: nicht den WE-IST-Status nehmen —
      // eine WE kann technisch noch „vermietet" sein aber als Neuvermietung verkauft werden.
      // Stammdaten-Modus ist die Vertriebs-Wahrheit).
      const modusRaw = String(detailKalk.vermietungsModus || sd.vermietungsModus || '').toLowerCase();
      let modus = 'sprung';
      if (modusRaw.includes('neuvermietung') || modusRaw.includes('staffel')) modus = 'staffel';
      else if (modusRaw.includes('bestand')) modus = 'sprung';
      else if (modusRaw.includes('index')) modus = 'index';
      else if (modusRaw.includes('leer') || modusRaw.includes('frei')) modus = 'staffel';

      // Subventions-Phasen: aus derived (echtes 2-Phasen-Modell mit Auto-Subv + Tag-1) oder
      // Fallback auf manuellen Mietzuschuss.
      let subventionPhasen = [];
      let subvMoPhase1 = 0;
      let subvMonatePhase1 = 0;
      if (derived && Array.isArray(derived.subventionPhasen) && derived.subventionPhasen.length > 0) {
        subventionPhasen = derived.subventionPhasen;
        subvMoPhase1 = subventionPhasen[0] && subventionPhasen[0].mo || 0;
        subvMonatePhase1 = subventionPhasen[0] && subventionPhasen[0].monate || 0;
      } else if (sd.mietzuschuss != null && sd.mietzuschuss > 0) {
        subvMoPhase1 = sd.mietzuschuss;
        subvMonatePhase1 = sd.mietzuschussMonate || 36;
        subventionPhasen = [{ mo: subvMoPhase1, monate: subvMonatePhase1 }];
      } else if (sd.autoSubvMo != null && sd.autoSubvMo > 0) {
        subvMoPhase1 = sd.autoSubvMo;
        subvMonatePhase1 = sd.mietzuschussMonate || 36;
        subventionPhasen = [{ mo: subvMoPhase1, monate: subvMonatePhase1 }];
      }

      // QA-Fix 2026-05-23 (Audit-O1 / Edgar-Doc B2): Tag-1-Vereinbarung = Mieter-Anhebung
      // wurde gerade gerade vereinbart → letzte Erhöhung effektiv heute → monateSeit=0,
      // damit nächster Sprung NICHT sofort in Monat 1 nochmal greift (Doppel-Anhebung).
      // App-Live in loadWeIntoKalk:1791 setzt exakt diesen Wert.
      // Plus (Audit-N1): Bei Neuvermietung WE.kaltmiete=0 → nutze MBV (mieteBeiVerkauf)
      // aus Stammdaten als geplante Käufer-Miete. Sonst rechnet die Engine mit 0 €
      // Miete → −400 €/Mo Belastung statt realistischer ~−25 €/Mo.
      let effKaltmiete = detailWe.kaltmiete || we.kaltmiete || 0;
      const istNeuvermietung = modus === 'staffel';
      const mbv = detailKalk.mieteBeiVerkauf || sd.mieteBeiVerkauf || 0;
      if (istNeuvermietung) {
        // QA-Fix 2026-05-23 (Edgar P2): Bei Neuvermietung IMMER MBV nutzen — die
        // alte Kaltmiete (z.B. von einem Vor-Mieter der ausgezogen ist) ist NICHT
        // die Miete die der neue Mieter zahlen wird. MBV = vertraglich vereinbarte
        // neue Miete. Vorher: Fallback nur bei kaltmiete<100 → bei WE 5 mit alter
        // Kaltmiete > 100 zeigte WE-Liste die alte Miete obwohl der Käufer die MBV
        // kassieren wird.
        if (mbv > 0) {
          effKaltmiete = mbv;
        } else if (effKaltmiete < 100) {
          // Beide null → unkalkulierbar (z.B. Wesseling WE 4 Pflege-Lücke).
          return { incomplete: true, reason: 'Kaltmiete und MBV fehlen — Pflege in Stammdaten' };
        }
        // Falls effKaltmiete vorhanden aber MBV fehlt: zumindest mit alter Miete
        // rechnen + ⚠-Hinweis (sd.mieteBeiVerkauf Pflege-Empfehlung).
      }
      let monateSeit = null;
      if (derived && derived.subventionKaltmieteAdjustiert && derived.subventionKaltmieteAdjustiert > 0) {
        effKaltmiete = derived.subventionKaltmieteAdjustiert;
        monateSeit = 0; // Tag-1 gilt als „gerade gemacht" — nächster Sprung in 36 Mo
      } else if (istNeuvermietung) {
        // Neuvermietung ab Tag 1 → Staffel sofort
        monateSeit = 36;
      } else if (detailVerm.letzteMietsteigerung) {
        const lastDate = new Date(detailVerm.letzteMietsteigerung);
        const now = new Date();
        monateSeit = Math.max(0, Math.round((now - lastDate) / (1000*60*60*24*30.44)));
      }

      // Marktpreis-Schnitt aus derived (sicher) oder selbst rechnen
      let marktwertProQm = (derived && derived.marktpreisGemittelt) || 0;
      if (!marktwertProQm) {
        const isP = detailKalk.marktpreisImmoscout || sd.marktpreisImmoscout || 0;
        const hdP = detailKalk.marktpreisHomeday || sd.marktpreisHomeday || 0;
        if (isP > 0 && hdP > 0) marktwertProQm = (isP + hdP) / 2;
        else if (isP > 0) marktwertProQm = isP;
        else if (hdP > 0) marktwertProQm = hdP;
      }

      // Marktmiete €/qm aus derived (mit Tag-1-Logik) oder Stammdaten
      const marktmieteEurQm = (derived && derived.marktmieteEurQm) || detailKalk.marktmiete || sd.marktmiete || 0;

      const inputs = Object.assign({}, base, profile, {
        kaufpreis: detailWe.kp || we.kp || 0,
        qm: detailWe.qm || we.qm || 0,
        kaltmiete: effKaltmiete,
        stellplatzKp: (detailStpl.kaufpreisSumme || stpl.kaufpreisSumme || 0),
        stellplatzMiete: (detailStpl.mieteMoSumme || stpl.mieteMoSumme || 0),
        marktwertProQm,
        marktmieteEurQm,
        hausgeld: detailKalk.hausgeldRuecklage != null ? detailKalk.hausgeldRuecklage : sd.hausgeldRuecklage,
        hausverwaltung: detailKalk.hausverwaltung != null ? detailKalk.hausverwaltung : sd.hausverwaltung,
        mietverwaltung: detailKalk.mietverwaltungDefault != null ? detailKalk.mietverwaltungDefault : sd.mietverwaltungDefault,
        afaSatz: (detailKalk.afaGutachten || sd.afaGutachten) || base.afaSatz || 0.02,
        gebaeudeAnteil: (detailKalk.gebaeudeAnteil || sd.gebaeudeAnteil) || base.gebaeudeAnteil || 0.85,
        wertsteigerung: (detailKalk.wertsteigerung || sd.wertsteigerung) || base.wertsteigerung || 0.03,
        hgInflation: 0, // QA-Fix 2026-05-24 (Edgar): immer 0
        steigerungProz: derived && derived.steigerungProz ? derived.steigerungProz
                        : (modus === 'sprung' ? 0.20 : 0.03),
        kappungsgrenze: detailKalk.kappungsgrenze || sd.kappungsgrenze || 0.20,
        indexmiete: (detailKalk.indexmiete || sd.indexmiete) || 0.03,
        mietsteigerungsModus: modus,
        subventionPhasen,
        subventionMo: subvMoPhase1,
        subventionMonate: subvMonatePhase1,
        // QA-Fix 2026-05-23 (Audit-S3): bei Tag-1-Vereinbarung letzteMietsteigerung
        // auf null forcen, sonst überschreibt die Engine in Z.674 unser monateSeit=0
        // aus dem Datum-Lookup → Sprung springt wieder sofort in Monat 1. App-Live
        // macht das gleich in loadWeIntoKalk:1790.
        letzteMietsteigerung: (derived && derived.subventionKaltmieteAdjustiert > 0)
          ? null
          : (detailVerm.letzteMietsteigerung || verm.letzteMietsteigerung || null),
        // QA-Fix 2026-05-23 (Audit R-3): wenn KEINE letzteMietsteigerung gepflegt
        // ist (auch nicht via Backend-Fallback), konservativ 36 statt 0 — sonst
        // Bruchsal-3-Jahre-Bug. Spiegelt loadWeIntoKalk-Logic (Z.1899).
        monateSeitMieterhoehung: monateSeit != null ? monateSeit : (modus === 'sprung' ? 36 : 0),
      });
      const r = window.Kalk.recalc(inputs);
      // QA-Fix 2026-05-23 (Audit E-1): null bei kaufpreis=0 sauber handhaben.
      if (r == null) return { incomplete: true, reason: 'Kaufpreis nicht gepflegt' };
      // Brutto-Rendite Tag 1 = (Effektive Kaltmiete + Stellplatz + Subv-Phase-1) × 12 / KpGesamt
      // effKaltmiete enthält bereits Tag-1-Anhebung wenn vorhanden.
      const mieteMo = effKaltmiete + ((detailStpl.mieteMoSumme || stpl.mieteMoSumme) || 0) + subvMoPhase1;
      const bruttoRendite = (r.kpGesamt > 0) ? (mieteMo * 12 / r.kpGesamt) : null;
      return {
        belastungMo: r.belastungMo,
        irr: r.irr,
        vermoegenNetto10: r.vermoegenNetto10,
        bruttoRendite,
        subvMoPhase1,
        subvMonatePhase1,
        subvGesamt: r.mietsubventionGesamt || (subvMoPhase1 * subvMonatePhase1),
        modus,
        tag1Aktiv: !!(derived && derived.subventionKaltmieteAdjustiert > 0),
      };
    } catch (e) { return null; }
  }

  const sections = projekte.map(pn => {
    const rows = byProjekt[pn].sort((a, b) => (parseInt(a.we.weNr) || 0) - (parseInt(b.we.weNr) || 0));
    const trs = rows.map(row => {
      const we = row.we || {};
      const sd = row.stammdaten || {};
      const stpl = row.stellplaetze || {};
      const verm = row.vermietung || {};
      const calc = _berechne(row) || {};
      // Vermietungs-MODUS aus Stammdaten (Vertriebs-Wahrheit). Edgar:
      // "Eine WE könnte technisch noch auf Vermietung stehen, wird aber als
      // Neuvermietung verkauft — geh auf die Stammdaten."
      const modusRaw = String(sd.vermietungsModus || '').trim();
      let modusBadge;
      if (/neuvermietung|staffel/i.test(modusRaw)) {
        modusBadge = '<span class="audit-pill size-sm leer">Neuvermietung</span>';
      } else if (/bestand/i.test(modusRaw)) {
        modusBadge = '<span class="audit-pill size-sm vermietet">Bestand</span>';
      } else if (/index/i.test(modusRaw)) {
        modusBadge = '<span class="audit-pill size-sm vermietet">Index</span>';
      } else if (/leer|frei/i.test(modusRaw)) {
        modusBadge = '<span class="audit-pill size-sm leer">Leerstand</span>';
      } else {
        modusBadge = '<span class="audit-pill size-sm fehlt" title="Vermietungs-Modus in Stammdaten nicht gepflegt">offen</span>';
      }
      // Welle 4 (2026-05-24): Pflegelücken-Detail-Modal. Schenki spart sich
      // den Klärungs-Call wenn der Vertriebler die fehlenden Felder direkt sieht
      // + weiß wer's pflegen sollte (SOP-A-Rollen).
      // Pflicht-Felder: ohne die kann der Vertriebler nicht sauber rechnen.
      const lueckenDetails = [
        { feld: 'Miete bei Verkauf (MBV)', value: sd.mieteBeiVerkauf, rolle: 'Domi · Verkaufsdaten', pflicht: true },
        { feld: 'Marktmiete (Vergleich)', value: sd.marktmiete, rolle: 'Nico · Marktdaten', pflicht: true },
        { feld: 'Marktpreis (Immoscout/Homeday)', value: sd.marktpreisImmoscout || sd.marktpreisHomeday, rolle: 'Nico · Marktdaten', pflicht: true },
        { feld: 'Vermietungs-Modus', value: sd.vermietungsModus, rolle: 'Viktor · Objektpflege', pflicht: true },
        { feld: 'Gebäude-Anteil', value: sd.gebaeudeAnteil, rolle: 'Viktor · Objektpflege', pflicht: true },
        { feld: 'AfA-Gutachten-Satz', value: sd.afaGutachten, rolle: 'Viktor · Objektpflege', pflicht: false },
        { feld: 'Hausgeld', value: sd.hausgeldRuecklage, rolle: 'Viktor · Objektpflege', pflicht: false },
        { feld: 'Hausverwaltung', value: sd.hausverwaltung, rolle: 'Viktor · Objektpflege', pflicht: false },
      ];
      const lueckenLeer = lueckenDetails.filter(d => d.value == null || d.value === 0 || d.value === '');
      const lueckenAnzahl = lueckenLeer.filter(d => d.pflicht).length;
      // Datenspeichern auf Window-Ebene, damit Modal-Klick die Details findet
      if (lueckenAnzahl > 0 || lueckenLeer.length > 0) {
        window._weLuckenCache = window._weLuckenCache || {};
        window._weLuckenCache[we.id] = { lueckenLeer, weNr: we.weNr, projekt: pn };
      }
      const luckenIcon = lueckenAnzahl > 0
        ? ` <span onclick="event.stopPropagation();window._weLuckenShow('${esc(we.id || '')}')" title="${lueckenAnzahl} Pflichtfeld${lueckenAnzahl === 1 ? '' : 'er'} leer — Klick für Details" style="color:#9A3E33;cursor:pointer;font-size:11px;background:rgba(154,62,51,.1);padding:1px 6px;border-radius:8px;font-weight:600;">⚠ ${lueckenAnzahl}</span>`
        : (lueckenLeer.length > 0 ? ` <span onclick="event.stopPropagation();window._weLuckenShow('${esc(we.id || '')}')" title="${lueckenLeer.length} optionale Felder leer — Klick für Details" style="color:var(--text-tertiary);cursor:pointer;font-size:11px;">○ ${lueckenLeer.length}</span>` : '');
      // Mietsubvention: Wert aus der Engine (Phase-1 €/Mo × Mo · Gesamt). Edgar:
      // „Werte aus der Kalkulation selbst, nicht nur manuelle Stammdaten".
      const subvCell = calc.subvMoPhase1 > 0
        ? `<div>${fmtEurMo(calc.subvMoPhase1)} × ${calc.subvMonatePhase1} Mo</div><div class="text-tertiary text-small">Gesamt ${fmtEur(calc.subvGesamt)}</div>`
        : '<span class="audit-cell-missing">–</span>';
      // Welle 2 (2026-05-24): Vergleichs-Checkbox als erste Spalte. Klick stoppt
      // Row-Onclick, damit nicht direkt in die WE navigiert wird.
      const checked = _weVergleichSel.has(we.id) ? 'checked' : '';
      const checkboxCell = `<td style="width:32px;padding:6px 4px;" onclick="event.stopPropagation();">
        <input type="checkbox" ${checked} onchange="window._weVergleichToggle('${esc(we.id || '')}')" style="cursor:pointer;width:16px;height:16px;" title="Zum Vergleich auswählen" />
      </td>`;
      // Incomplete-Marker für unkalkulierbare WEs (kein Kaltmiete + kein MBV)
      if (calc && calc.incomplete) {
        return `
          <tr class="we-liste-row" onclick="window._weListeOpenWe('${esc(we.id || '')}')" style="opacity:0.55;">
            ${checkboxCell}
            <td><strong>${esc(we.weNr ? 'WE ' + we.weNr : '—')}</strong>${luckenIcon}<div class="text-tertiary text-small">${esc(we.lageText || we.lage || '')}${we.qm > 0 ? ' · ' + fmtQm(we.qm) : ''}</div></td>
            <td>${modusBadge}</td>
            <td class="num">${fmtEur(we.kp)}<div class="text-tertiary text-small">${fmtEurPerQm(we.kp, we.qm)}</div></td>
            <td colspan="8" style="text-align:center;color:var(--negative);font-style:italic;font-size:13px;">⚠ ${esc(calc.reason || 'unkalkulierbar')}</td>
          </tr>
        `;
      }
      return `
        <tr class="we-liste-row" onclick="window._weListeOpenWe('${esc(we.id || '')}')">
          ${checkboxCell}
          <td><strong>${esc(we.weNr ? 'WE ' + we.weNr : '—')}</strong>${luckenIcon}<div class="text-tertiary text-small">${esc(we.lageText || we.lage || '')}${we.qm > 0 ? ' · ' + fmtQm(we.qm) : ''}</div></td>
          <td>${modusBadge}</td>
          <td class="num">${fmtEur(we.kp)}<div class="text-tertiary text-small">${fmtEurPerQm(we.kp, we.qm)}</div></td>
          <td class="num">${(() => {
            // QA-Fix 2026-05-23 (P2): Effektive Kaltmiete = was der Käufer ab Tag 1 kassiert.
            //  - Bestand mit Tag-1-Vereinbarung → subventionKaltmieteAdjustiert (angehoben)
            //  - Neuvermietung → MBV (zukünftige Miete, alte ist irrelevant)
            //  - Bestand ohne Vereinbarung → aktuelle Kaltmiete
            const det = detailById && detailById[we.id];
            const adj = det && det.derived && det.derived.subventionKaltmieteAdjustiert;
            const sdLocal = (det && det.kalkStammdaten) || sd;
            const mbvLocal = sdLocal.mieteBeiVerkauf || 0;
            const modusLocal = String(sdLocal.vermietungsModus || '').toLowerCase();
            const istNeuLocal = modusLocal.includes('neuvermietung') || modusLocal.includes('staffel') || modusLocal.includes('leer');
            if (adj > 0) {
              return fmtEurMo(adj) + '<div class="text-tertiary text-small">Tag-1 (vorher ' + Math.round(we.kaltmiete || 0).toLocaleString('de-DE') + ' €)</div>';
            }
            if (istNeuLocal && mbvLocal > 0) {
              const vorher = we.kaltmiete > 0 ? Math.round(we.kaltmiete).toLocaleString('de-DE') + ' € alt' : 'leer';
              return fmtEurMo(mbvLocal) + '<div class="text-tertiary text-small">Neuvermietung (vorher ' + vorher + ')</div>';
            }
            return we.kaltmiete > 0 ? fmtEurMo(we.kaltmiete) : '–';
          })()}</td>
          <td class="num">${(stpl.anzahl > 0) ? fmtEur(stpl.kaufpreisSumme) : '–'}</td>
          <td class="num">${(stpl.anzahl > 0 && stpl.mieteMoSumme > 0) ? fmtEurMo(stpl.mieteMoSumme) : '–'}</td>
          <td class="num">${subvCell}</td>
          <td class="num">${fmtPct(calc.bruttoRendite)}</td>
          <td class="num ${calc.belastungMo < 0 ? 'cell-neg' : 'cell-pos'}">${fmtEurMo(calc.belastungMo)}</td>
          <td class="num">${fmtEur(calc.vermoegenNetto10)}</td>
          <td class="num"><strong>${fmtPct(calc.irr)}</strong></td>
        </tr>
      `;
    }).join('');
    return `
      <details open style="margin-top:16px;">
        <summary class="admin-audit-summary-bar"><strong>${esc(pn)}</strong> <span class="text-tertiary text-small" style="font-weight:normal;margin-left:8px;">${rows.length} WEs</span></summary>
        <div style="overflow-x:auto;">
          <table class="table mt-8 we-liste-table">
            <thead>
              <tr>
                <th style="width:32px;padding:6px 4px;" title="Zum Vergleich auswählen"></th>
                <th style="min-width:170px;">Wohneinheit</th>
                <th>Vermietungs-Modus</th>
                <th class="num">Kaufpreis WHG</th>
                <th class="num">Kaltmiete WHG</th>
                <th class="num">Garage KP</th>
                <th class="num">Garage Miete</th>
                <th class="num">Mietsubvention</th>
                <th class="num">Brutto-Rendite</th>
                <th class="num">Cashflow J1 n. St.</th>
                <th class="num">Vermögen J10</th>
                <th class="num">IRR 10 J</th>
              </tr>
            </thead>
            <tbody>${trs}</tbody>
          </table>
        </div>
      </details>
    `;
  }).join('');

  // QA-Sprint 2026-05-23 (Edgar live): Profil-Label aus Profil-Daten ableiten
  // statt nur den Slug-Key zu zeigen.
  // QA-Fix 2026-05-23 (Audit-P-5): Guard gegen unbekanntes/leeres Profil — sonst
  // crash bei zins=undefined.toFixed. Plus (Audit-P-4): Schreibweise „KP + KNK
  // finanziert" mit Spaces, einheitlich zum Dropdown.
  const profilObj = (window.Kalk && window.Kalk.PROFILES && window.Kalk.PROFILES[_weListeProfil]) || null;
  const profilLabel = profilObj
    ? `${Math.round((profilObj.steuersatz || 0) * 100)} % StSatz · ${((profilObj.zins || 0) * 100).toFixed(1).replace('.', ',')} % Zins · ${Math.round((profilObj.tilgung || 0) * 100)} % Tilg. · ${profilObj.knkMitfinanziert ? 'KP + KNK finanziert' : 'KP ohne KNK'}`
    : '(unbekannt)';
  // QA-Fix 2026-05-23 (Audit-P-3): bei KNK-finanziert greift ekBedarf=0 → IRR
  // ist mathematisch undefined (kein Initial-Investment für die Rendite-Rechnung).
  // Vertriebler sieht „—" und ist verwirrt. Klarer Hinweis im Footer.
  const irrHint = (profilObj && profilObj.knkMitfinanziert)
    ? ' · <span title="Bei 100 %-Finanzierung gibt es kein initiales Eigenkapital — daher ist die klassische IRR-Berechnung mathematisch nicht definiert.">IRR-Spalte „—" bei 100 %-Finanzierung (kein EK)</span>'
    : '';
  // Welle 2 (2026-05-24): Floating Compare-FAB unten rechts wenn 1+ ausgewählt.
  const selCount = _weVergleichSel.size;
  const compareFab = selCount > 0 ? `
    <div id="we-vergleich-fab" style="position:fixed;bottom:24px;right:24px;z-index:80;display:flex;gap:10px;align-items:center;background:var(--accent);color:#fff;padding:10px 16px 10px 18px;border-radius:28px;box-shadow:0 8px 24px rgba(176,138,77,.32);font-family:inherit;">
      <span style="font-size:13px;">${selCount} ${selCount === 1 ? 'WE' : 'WEs'} markiert</span>
      <button onclick="window._weVergleichClear()" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);padding:4px 10px;font-size:12px;border-radius:14px;cursor:pointer;font-family:inherit;" title="Auswahl leeren">✕</button>
      <button onclick="window._weVergleichOpen()" ${selCount < 2 ? 'disabled style="opacity:.45;cursor:not-allowed;background:#fff;color:var(--accent-dark);border:none;padding:6px 14px;font-size:13px;border-radius:14px;font-weight:600;font-family:inherit;"' : 'style="background:#fff;color:var(--accent-dark);border:none;padding:6px 14px;font-size:13px;border-radius:14px;cursor:pointer;font-weight:600;font-family:inherit;"'}>
        Vergleichen →
      </button>
    </div>
  ` : '';

  el.innerHTML = `
    <div class="text-tertiary text-small" style="margin:0 0 8px;">
      <strong>${audit.length} aktive WEs</strong> über ${projekte.length} ${projekte.length === 1 ? 'Projekt' : 'Projekte'} ·
      Profil: <strong>${esc(profilLabel)}</strong> · Wertsteigerung 3 %/a, AfA aus Stammdaten.${irrHint}
    </div>
    ${sections}
    ${compareFab}
  `;
}

// Welle 2 (2026-05-24): Multi-Select-Vergleich.
function _weVergleichToggle(weId) {
  if (!weId) return;
  if (_weVergleichSel.has(weId)) _weVergleichSel.delete(weId);
  else _weVergleichSel.add(weId);
  _renderWeListeContent(); // Re-render damit FAB-Count aktualisiert
}
window._weVergleichToggle = _weVergleichToggle;
function _weVergleichClear() {
  _weVergleichSel.clear();
  _renderWeListeContent();
}
window._weVergleichClear = _weVergleichClear;
function _weVergleichOpen() {
  if (_weVergleichSel.size < 2) {
    toast('Wähle mindestens 2 WEs zum Vergleichen', 'info');
    return;
  }
  _renderWeVergleichModal();
}
window._weVergleichOpen = _weVergleichOpen;

function _renderWeVergleichModal() {
  if (!_weListeCache || !window.Kalk) return;
  const audit = (_weListeCache.auditList || []).filter(r => _weVergleichSel.has(r.we && r.we.id));
  const detailById = _weListeCache.detailById || {};
  if (audit.length === 0) return;

  // Pro WE: berechnen mit aktuellem Profil
  const calcByWeId = {};
  for (const row of audit) {
    try {
      const sd = (detailById[row.we.id] && detailById[row.we.id].kalkStammdaten) || row.stammdaten || {};
      const detail = detailById[row.we.id] || {};
      const we = (detail.we) || row.we || {};
      const stpl = (detail.stellplaetze) || row.stellplaetze || {};
      const derived = (detail.derived) || {};
      const profile = (window.Kalk.PROFILES && window.Kalk.PROFILES[_weListeProfil]) || {};

      let effKaltmiete = derived.subventionKaltmieteAdjustiert
        || (sd.mieteBeiVerkauf > 0 && /neuvermietung|staffel|leer/i.test(String(sd.vermietungsModus || '')) ? sd.mieteBeiVerkauf : we.kaltmiete) || 0;

      let subventionPhasen = [];
      if (Array.isArray(derived.subventionPhasen) && derived.subventionPhasen.length > 0) {
        subventionPhasen = derived.subventionPhasen;
      } else if (sd.mietzuschuss > 0) {
        subventionPhasen = [{ mo: sd.mietzuschuss, monate: sd.mietzuschussMonate || 36 }];
      }

      const inputs = Object.assign({
        kaufpreis: we.kp || 0, stellplatzKp: stpl.kaufpreisSumme || 0, qm: we.qm || 0,
        kaltmiete: effKaltmiete, stellplatzMiete: stpl.mieteMoSumme || 0,
        subventionMo: subventionPhasen[0] ? subventionPhasen[0].mo : 0,
        subventionMonate: subventionPhasen[0] ? subventionPhasen[0].monate : 0,
        subventionPhasen,
        mietsteigerungsModus: /neuvermietung|staffel/i.test(String(sd.vermietungsModus || '')) ? 'staffel' : 'sprung',
        steigerungProz: 0.15, monateSeitMieterhoehung: 0,
        hausgeld: sd.hausgeld || 60, hgInflation: 0,
        mietverwaltung: sd.mietverwaltung || 0, hausverwaltung: sd.hausverwaltung || 30,
        afaSatz: (sd.afaSatz || 0.02), gebaeudeAnteil: (sd.gebaeudeAnteil || 0.85), afaBemessung: 'kaufpreis',
        wertsteigerung: 0.03, marktwertProQm: sd.marktpreisImmoscout || sd.marktpreisHomeday || 0,
        grEstPct: sd.grEstPct || 0.05,
      }, profile);
      calcByWeId[row.we.id] = window.Kalk.recalc(inputs);
    } catch (e) {
      calcByWeId[row.we.id] = null;
    }
  }

  const fmtEur = (v) => (v == null || !isFinite(v)) ? '–' : Math.round(v).toLocaleString('de-DE') + ' €';
  const fmtEurMo = (v) => (v == null || !isFinite(v)) ? '–' : Math.round(v).toLocaleString('de-DE') + ' €/Mo';
  const fmtPct  = (v) => (v == null || !isFinite(v)) ? '–' : (v * 100).toFixed(1).replace('.', ',') + ' %';

  // Spalten = WEs. Zeilen = Kennzahlen. Best-Value pro Zeile bekommt eine Hervorhebung.
  const weCols = audit.map(row => {
    const we = row.we || {};
    const calc = calcByWeId[we.id];
    return { we, calc, projekt: row.stammdaten && row.stammdaten.projektName || '' };
  });

  const metrics = [
    { label: 'Kaufpreis (WHG)', get: c => c && c.inputs ? (c.inputs.kaufpreis || 0) : null, fmt: fmtEur, best: 'min' },
    { label: '€/qm Wohnung',    get: c => c ? c.kaufpreisWohnungProQm : null, fmt: v => v ? Math.round(v).toLocaleString('de-DE') + ' €/qm' : '–', best: 'min' },
    { label: 'Brutto-Rendite',  get: c => c ? c.bruttorendite : null, fmt: fmtPct, best: 'max' },
    { label: 'Cashflow J1 n. St.', get: c => c && c.cf && c.cf[0] ? c.cf[0].cfJahr : null, fmt: fmtEur, best: 'max' },
    { label: 'Belastung €/Mo',  get: c => c ? c.belastungMo : null, fmt: fmtEurMo, best: 'max' },
    { label: 'Cashflow J10',    get: c => c && c.cf && c.cf[9] ? c.cf[9].cfJahr : null, fmt: fmtEur, best: 'max' },
    { label: 'Vermögen J10 (Netto)', get: c => c ? c.vermoegenNetto10 : null, fmt: fmtEur, best: 'max' },
    { label: 'IRR 10 J',         get: c => c ? c.irr : null, fmt: fmtPct, best: 'max' },
  ];

  // Pro Metric: Best-Value finden für Highlight
  const bestById = {};
  metrics.forEach((m, mi) => {
    const vals = weCols.map((col, ci) => ({ ci, v: m.get(col.calc) }));
    const valid = vals.filter(x => x.v !== null && isFinite(x.v));
    if (valid.length === 0) return;
    if (m.best === 'max') valid.sort((a, b) => b.v - a.v);
    else valid.sort((a, b) => a.v - b.v);
    bestById[mi] = valid[0].ci;
  });

  const headerHtml = weCols.map(col => `
    <th style="padding:12px 14px;background:var(--bg-cream-subtle);border-bottom:2px solid var(--accent);text-align:left;min-width:170px;">
      <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;">${esc(col.projekt || '–')}</div>
      <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-top:2px;">WE ${esc(String(col.we.weNr || '?'))}</div>
      <div style="font-size:11px;color:var(--text-tertiary);">${esc(col.we.lageText || col.we.lage || '')}${col.we.qm > 0 ? ' · ' + (col.we.qm + ' qm') : ''}</div>
    </th>
  `).join('');

  const rowsHtml = metrics.map((m, mi) => `
    <tr>
      <td style="padding:10px 14px;color:var(--text-secondary);font-size:12px;border-bottom:1px solid var(--border);background:var(--bg-primary);">${m.label}</td>
      ${weCols.map((col, ci) => {
        const v = m.get(col.calc);
        const isBest = bestById[mi] === ci && weCols.length > 1;
        const txt = v === null ? '–' : m.fmt(v);
        return `<td style="padding:10px 14px;font-size:14px;font-weight:${isBest ? '700' : '500'};color:${isBest ? '#2D6E47' : 'var(--text-primary)'};border-bottom:1px solid var(--border);${isBest ? 'background:rgba(45,110,71,.06);' : ''}">${txt}${isBest ? ' <span title="bestes Resultat" style="color:#2D6E47;font-size:10px;">●</span>' : ''}</td>`;
      }).join('')}
    </tr>
  `).join('');

  // Profil-Label für den Header (vor Template-String definieren)
  const profilLabel = (() => {
    const p = (window.Kalk && window.Kalk.PROFILES && window.Kalk.PROFILES[_weListeProfil]) || null;
    return p ? `${Math.round((p.steuersatz || 0) * 100)} % StSatz · ${((p.zins || 0) * 100).toFixed(1).replace('.', ',')} % Zins · ${p.knkMitfinanziert ? 'KP + KNK finanziert' : 'KP ohne KNK'}` : '(unbekannt)';
  })();

  // Modal anzeigen
  let modalEl = document.getElementById('we-vergleich-modal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'we-vergleich-modal';
    document.body.appendChild(modalEl);
  }
  modalEl.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(26,26,23,.55);z-index:120;display:flex;align-items:center;justify-content:center;padding:24px;" onclick="if(event.target===this)window._weVergleichClose()">
      <div style="background:#FBFAF7;border-radius:12px;max-width:1100px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 24px 64px rgba(26,26,23,.32);">
        <div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;">Vergleich</div>
            <div style="font-size:17px;font-weight:600;color:var(--text-primary);margin-top:2px;">${weCols.length} Wohneinheiten · Profil <strong>${esc(profilLabel)}</strong></div>
          </div>
          <button onclick="window._weVergleichClose()" style="background:transparent;border:1px solid var(--border);padding:6px 12px;font-size:13px;border-radius:6px;cursor:pointer;font-family:inherit;">✕ Schließen</button>
        </div>
        <div style="padding:20px 22px;overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr><th style="background:var(--bg-cream-subtle);border-bottom:2px solid var(--accent);padding:12px 14px;text-align:left;min-width:160px;font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;">Kennzahl</th>${headerHtml}</tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div style="margin-top:14px;font-size:11px;color:var(--text-tertiary);">
            ● = bestes Resultat dieser Kennzahl. Alle Werte mit dem Profil <strong>${esc(profilLabel)}</strong> gerechnet. Bei Wechsel des Profils oben links → Vergleich neu öffnen.
          </div>
        </div>
      </div>
    </div>
  `;
}
function _weVergleichClose() {
  const m = document.getElementById('we-vergleich-modal');
  if (m) m.remove();
}
window._weVergleichClose = _weVergleichClose;

// Welle 4 (2026-05-24): Pflegelücken-Detail-Modal. Schenki-Pain-Reducer.
function _weLuckenShow(weId) {
  const data = (window._weLuckenCache || {})[weId];
  if (!data) return;
  const pflicht = data.lueckenLeer.filter(d => d.pflicht);
  const optional = data.lueckenLeer.filter(d => !d.pflicht);

  // Pro Rolle gruppieren — Vertriebler sieht „Domi pingen" mit allen Feldern auf einmal
  const groupByRolle = (arr) => {
    const g = {};
    arr.forEach(d => { (g[d.rolle] = g[d.rolle] || []).push(d.feld); });
    return g;
  };
  const pflichtByRolle = groupByRolle(pflicht);
  const optByRolle = groupByRolle(optional);

  const renderGroup = (group, kind) => {
    const keys = Object.keys(group);
    if (keys.length === 0) return '';
    return keys.map(rolle => `
      <div style="margin-bottom:10px;padding:10px 12px;background:${kind === 'pflicht' ? 'rgba(154,62,51,.04)' : 'var(--bg-cream-subtle)'};border-left:3px solid ${kind === 'pflicht' ? '#9A3E33' : '#B08A4D'};border-radius:0 4px 4px 0;">
        <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Pflegen: ${esc(rolle)}</div>
        <ul style="margin:0;padding-left:18px;font-size:13px;color:var(--text-primary);line-height:1.5;">
          ${group[rolle].map(f => `<li>${esc(f)}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  };

  let modalEl = document.getElementById('we-lucken-modal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'we-lucken-modal';
    document.body.appendChild(modalEl);
  }
  modalEl.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(26,26,23,.55);z-index:130;display:flex;align-items:center;justify-content:center;padding:24px;" onclick="if(event.target===this)window._weLuckenClose()">
      <div style="background:#FBFAF7;border-radius:12px;max-width:560px;width:100%;max-height:85vh;overflow:auto;box-shadow:0 24px 64px rgba(26,26,23,.32);">
        <div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:start;justify-content:space-between;gap:14px;">
          <div>
            <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;">Datenpflege-Lücken</div>
            <div style="font-size:17px;font-weight:600;color:var(--text-primary);margin-top:2px;">WE ${esc(String(data.weNr || '?'))} · ${esc(data.projekt || '')}</div>
          </div>
          <button onclick="window._weLuckenClose()" style="background:transparent;border:1px solid var(--border);padding:4px 10px;font-size:13px;border-radius:6px;cursor:pointer;font-family:inherit;">✕</button>
        </div>
        <div style="padding:18px 22px;">
          ${pflicht.length > 0 ? `
            <div style="font-size:13px;color:#9A3E33;font-weight:600;margin-bottom:10px;">⚠ ${pflicht.length} Pflichtfeld${pflicht.length === 1 ? '' : 'er'} fehlt — bevor Du dem Kunden Zahlen zeigst, sollte das gepflegt sein.</div>
            ${renderGroup(pflichtByRolle, 'pflicht')}
          ` : ''}
          ${optional.length > 0 ? `
            <div style="font-size:12px;color:var(--text-tertiary);margin:14px 0 8px;">Optional (Qualitäts-Verbesserer, nicht blockierend):</div>
            ${renderGroup(optByRolle, 'optional')}
          ` : ''}
          ${pflicht.length === 0 && optional.length === 0 ? `<div style="color:#2D6E47;font-size:13px;">✓ Vollständig gepflegt.</div>` : ''}
          <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:11px;color:var(--text-tertiary);">
            Rollen-Vorgaben nach SOP-A „Datenpflege" (Stand 2026-04-27). Im Zweifel: Schenki pingen — sie koordiniert.
          </div>
        </div>
      </div>
    </div>
  `;
}
window._weLuckenShow = _weLuckenShow;
function _weLuckenClose() {
  const m = document.getElementById('we-lucken-modal');
  if (m) m.remove();
}
window._weLuckenClose = _weLuckenClose;

function _weListeOpenWe(weId) {
  if (!weId) return;
  // QA-Fix 2026-05-23 (Audit-U4): Ohne ausgewählten Kunden → speichere WE-Wunsch im
  // sessionStorage und gehe ins Dashboard. Wenn der User dann einen Kunden öffnet,
  // wird die WE auto-geladen. Vorher war das eine Sackgasse (Toast + Redirect → User
  // verliert die Klick-Intention).
  if (!state.kundeId) {
    try { sessionStorage.setItem('bbk_pending_we', weId); } catch (e) {}
    toast('Wähle erst einen Kunden — die WE wird dann automatisch geladen', 'info');
    go('/dashboard');
    return;
  }
  go('/kunde/' + state.kundeId + '/kalkulator');
  setTimeout(() => { if (typeof loadWeIntoKalk === 'function') loadWeIntoKalk(weId); }, 200);
}
window._weListeOpenWe = _weListeOpenWe;

function render() {
  renderHeader();
  if (state.view === 'login') renderLogin();
  else if (state.view === 'dashboard') {
    renderDashboard();
    // QA-Fix 2026-05-23 (Audit-EE-4): Tour auch im Dashboard triggern, sonst
    // sieht ein Vertriebler ohne Kunden die Tour NIE (Kalkulator-Tab nicht
    // erreichbar). Step 0-3 sind kalkulator-unabhängig.
    if (typeof maybeStartTourOnFirstLogin === 'function') {
      try { maybeStartTourOnFirstLogin(); } catch {}
    }
  }
  else if (state.view === 'kunde') renderKunde();
  else if (state.view === 'admin') renderAdmin();
  else if (state.view === 'we-liste') renderWeListe();
}

/* ============================== BOOT ============================== */

window.addEventListener('hashchange', () => { route(); render(); });
window.addEventListener('load', async () => {
  try {
    state.user = await api.get('/api/me');
    await loadInitialData();
  } catch (e) {
    state.user = null;
  }
  route();
  render();
});

// ===== Info-Chips & Info-Buttons (Vermögensaufbau-, Cashflow-, Sparen-Charts) =====
// Event-Delegation auf document, damit Re-Renders das Verhalten nicht zerstören.
// Mehrfach nutzbar: jedes .card kann ein eigenes .chart-info-popover enthalten.
(function () {
  function closeAllInfoPopovers() {
    document.querySelectorAll('.chart-info-popover.open').forEach(p => {
      p.classList.remove('open');
      p.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('.chart-info-chip.active, .info-btn.active').forEach(b => b.classList.remove('active'));
  }

  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.chart-info-chip, .info-btn');

    // Außerhalb geklickt → schließen
    if (!chip) {
      if (!e.target.closest('.chart-info-popover')) closeAllInfoPopovers();
      return;
    }
    e.preventDefault();

    const card = chip.closest('.card');
    const pop  = card && card.querySelector('.chart-info-popover');
    if (!pop) return;

    // Gleicher Chip nochmal → toggle zu
    if (chip.classList.contains('active')) {
      closeAllInfoPopovers();
      return;
    }

    closeAllInfoPopovers();

    // Inhalt setzen
    const titleEl = pop.querySelector('.chart-info-popover-title');
    const bodyEl  = pop.querySelector('.chart-info-popover-body');
    if (titleEl) titleEl.textContent = chip.dataset.infoTitle || '';
    if (bodyEl)  bodyEl.textContent  = chip.dataset.infoBody  || '';

    chip.classList.add('active');

    // Position relativ zum Chip im Card (position: absolute)
    const cardRect = card.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const left = chipRect.left - cardRect.left + chipRect.width / 2;
    const top  = chipRect.bottom - cardRect.top + 8;
    pop.style.left = left + 'px';
    pop.style.top  = top + 'px';

    pop.classList.add('open');
    pop.setAttribute('aria-hidden', 'false');
  });

  // ESC schließt
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllInfoPopovers();
  });
})();

/* ============================== VERTRIEBLER-TOUR ============================== */
/* QA-Sprint 2026-05-23: Interaktive Tour-Erklärung. Edgar's Auftrag aus dem
   Anfänger-Audit — neue Vertriebler brauchen eine Hand am Anfang. Tour erscheint
   automatisch beim ersten Login (localStorage-Key `bbk_tour_v1_seen`) und kann
   jederzeit via Help-Button im Header wieder gestartet werden.

   Design: schlankes Overlay mit Backdrop, Schritt-Card oben rechts, Target-
   Highlight via Bronze-Ring um das angesprochene Element. 10 Schritte, jederzeit
   überspringbar.
*/

// FS-2l (Edgar 24.05.2026 19:45): Tour komplett neu — „Selbst-Test durch die
// Backstube". Vertriebler legt SICH SELBST als Kunde an (echte E-Mail), backt
// einmal alles durch: Übersicht, Kalkulator, SA, eigene Mail empfangen, SA-Portal
// als Kunde, Reservierung an sich selbst, PandaDoc-Unterschrift, Webhook-Status
// in der Aktivität, WE-Match.
// Bump auf v3 — alle User sehen die neue Tour automatisch beim nächsten Login.
const TOUR_VERSION = 'v3';
// Loom-Intro-Video von Edgar (24.05.2026 22:15) — kurze Einführung in die
// Backstube, läuft als allererster Schritt der Tour als klickbarer Button.
const TOUR_LOOM_URL = 'https://www.loom.com/share/cac666dbd7bb4d2ca4244baa40f6ecf9';

// QA-Fix 2026-05-23 (Audit-EE-12): User-Email in den Storage-Key, damit auf einem
// shared-Browser (Büro-PC, 2 Vertriebler) jeder seine Tour separat sieht.
// Funktion statt const, weil state.user beim Modul-Laden noch nicht da ist.
function tourStorageKey() {
  const email = (state && state.user && state.user.email) || 'anon';
  return 'bbk_tour_' + TOUR_VERSION + '_' + email + '_seen';
}

// Jeder Schritt:
//   - title:           Kurzname „Schritt N — Aufgabe"
//   - action:          Konkreter Aufruf was JETZT zu tun ist (1-2 Sätze, imperativ)
//   - tip:             optionale Hintergrund-Erklärung warum / nützlich
//   - target:          CSS-Selector des UI-Elements das gehighlightet wird (Spotlight)
//   - needsView:       erwartete state.view ('dashboard'|'kunde'|'we-liste'). Wenn die
//                      aktuelle View nicht matched, zeigt Tour einen „Hinbringen"-Button
//                      und blockiert das Weiter bis der User dort ist.
//   - needsTab:        wenn needsView 'kunde': erwarteter Tab ('uebersicht'|'kalkulator'|...).
//   - detectCompleted: optionaler () => bool für Auto-Advance.
const TOUR_STEPS = [
  // ============== TEIL 1: WILLKOMMEN + LOOM-INTRO ==============
  {
    title: 'Willkommen in der B&B Backstube 🥨',
    action: TOUR_LOOM_URL
      ? `Schau Dir erst Edgars 5-Minuten-Loom an, dann gehen wir das Werkzeug zusammen durch.<br><br><a href="${TOUR_LOOM_URL}" target="_blank" rel="noopener" style="display:inline-block;background:#1A1A17;color:#FBFAF7;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500;">▶ Loom-Intro öffnen</a><br><br>Dann legst Du Dich selbst als Test-Kunde an und backst einmal alles durch — vom Erstgespräch bis zur unterschriebenen Reservierung.`
      : 'Wir backen jetzt einmal Dein eigenes Probe-Stück: Du legst Dich selbst als Test-Kunde an und gehst einmal komplett durch — vom Erstgespräch bis zur unterschriebenen Reservierung. So lernst Du jeden Hebel von beiden Seiten kennen (Vertriebler-Sicht UND Kunden-Sicht).',
    actionHtml: !!TOUR_LOOM_URL, // raw HTML nur wenn Loom-Link da
    tip: 'Dauer ca. 20-30 Minuten. Du brauchst Zugriff auf Dein E-Mail-Postfach (gleicher PC). Den Test-Kunden archivierst Du am Ende. Tour jederzeit über „?" oben rechts wieder startbar.',
    target: null,
    needsView: 'dashboard',
  },

  // ============== TEIL 2: KUNDE ANLEGEN ==============
  {
    title: 'Schritt 1 — Dich selbst als Test-Kunde anlegen',
    action: 'Klick oben rechts auf „+ Neuer Kunde". Trage DEINEN echten Vor- und Nachnamen ein und DEINE echte E-Mail-Adresse (du wirst gleich Mails an dich selbst schicken).',
    tip: 'Pflichtfelder: Vorname, Nachname, E-Mail. Geburtsdatum hilft später bei der Bonität — trag Dein echtes ein, damit Du gleich auch die Bonitäts-Story aus Kunden-Sicht siehst.',
    target: 'button[onclick*="createNewKunde"]',
    needsView: 'dashboard',
    detectCompleted: () => !!state.kundeId,
  },

  // ============== TEIL 3: ÜBERSICHT-TAB (zuerst, der Vertriebler-Cockpit) ==============
  {
    title: 'Schritt 2 — Das Cockpit oben: Phasen-Tracker',
    action: 'Du landest automatisch im Übersicht-Tab. Ganz oben siehst Du das Phasen-Cockpit: Strategie → Abwicklung → Notar. So weißt Du immer wo der Kunde gerade steht.',
    tip: 'Die aktuelle Phase wird automatisch aus den abgehakten Aufgaben abgeleitet — kein manuelles Dropdown mehr nötig. Phase wechselt automatisch, sobald alle Pflicht-Aufgaben der Phase erledigt sind.',
    target: '.kav-cockpit',
    needsView: 'kunde',
    needsTab: 'uebersicht',
  },
  {
    title: 'Schritt 3 — Wiedervorlage setzen',
    action: 'Im Cockpit oben rechts ist der „+ Wiedervorlage"-Button (oder ein Badge falls schon gesetzt). Klick drauf und setz die Wiedervorlage auf morgen.',
    tip: 'Wiedervorlage steuert wann der Kunde wieder oben in „Meine Kunden" auftaucht. Überfällige WV werden rot markiert — Dein Tages-Cockpit-Schalter.',
    target: '.kav-wv-badge',
    needsView: 'kunde',
    needsTab: 'uebersicht',
  },
  {
    title: 'Schritt 4 — Eine Phasen-Aufgabe abhaken',
    action: 'Klick im Phasen-Cockpit auf „Strategie" um die Aufgaben aufzuklappen. Hak „Bedarfsanalyse-Gespräch" ab.',
    tip: 'Aufgaben tragen automatisch in die Aktivitäten-Historie ein (mit Datum + Wer-hat-was). Erledigte Aufgaben werden mit Strikethrough markiert.',
    target: '.kav-phases-details',
    needsView: 'kunde',
    needsTab: 'uebersicht',
  },
  {
    title: 'Schritt 5 — Aktivität festhalten',
    action: 'Scroll runter zur „Aktivitäten-Historie"-Karte. Trag „Erstkontakt: spannender Lead, will Q3 kaufen" ein und drück Enter.',
    tip: 'Aktivitäten sind die Telefonat-/Mail-/Termin-Chronik. Jeder Eintrag mit Datum + Wer. Mail-Send, PDF-Download und KAV-Mutationen werden auch automatisch hier protokolliert.',
    target: '#activity-new-input',
    needsView: 'kunde',
    needsTab: 'uebersicht',
  },
  {
    title: 'Schritt 6 — Notiz schreiben',
    action: 'Direkt unter Aktivitäten ist die „Notizen"-Karte. Trag eine kurze Notiz ein, z.B. „Mag ruhige Lage, max. 250k". Auto-Save beim Blur (Klick ins Leere).',
    tip: 'Notizen sind Dein Scratchpad für freie Stichworte. Anders als Aktivitäten ohne Datum/Zeit — alles was Du persistieren willst, aber kein zeitliches Event ist.',
    target: '#f-notizen',
    needsView: 'kunde',
    needsTab: 'uebersicht',
  },
  {
    title: 'Schritt 7 — Wunsch-Profil ausfüllen',
    action: 'Scroll weiter zur „Wunsch-Profil"-Karte. Wähl 2-3 Bundesländer in Deiner Nähe + ein paar Kreise. Trag auch grobe Schwellen ein (max. EK, max. Investitionssumme).',
    tip: 'Wunsch-Profil filtert später die „Wohnungen"-Liste nach passenden WEs für diesen Kunden. Pflege das früh — spart Dir später viel Klick-Arbeit.',
    target: '.wp-card, [data-card="wunschprofil"]',
    needsView: 'kunde',
    needsTab: 'uebersicht',
  },
  {
    title: 'Schritt 8 — Stammdaten checken',
    action: 'Ganz unten ist die collapsed „Stammdaten"-Karte. Klick drauf zum Aufklappen, ergänze Telefonnummer + Geburtsdatum.',
    tip: 'Stammdaten werden automatisch in die Selbstauskunft gespiegelt (Vor/Nachname, E-Mail, Telefon, Geburtsdatum). Spart Doppel-Eingabe.',
    target: 'details.card',
    needsView: 'kunde',
    needsTab: 'uebersicht',
  },

  // ============== TEIL 4: KALKULATOR ==============
  {
    title: 'Schritt 9 — Zum Kalkulator wechseln',
    action: 'Klick oben auf den Tab „Kalkulator". Hier baust Du die Pitch-Kalkulation für eine konkrete Wohneinheit.',
    tip: 'Der Kalkulator ist das Herzstück der Backstube. Hier kommen Stammdaten (Airtable) und Person-Settings (Bonität, Steuersatz) zusammen.',
    target: '.tab[data-tab="kalkulator"]',
    needsView: 'kunde',
    detectCompleted: () => state.tab === 'kalkulator',
  },
  {
    title: 'Schritt 10 — Projekt wählen',
    action: 'Im Cream-Bereich oben ist das Projekt-Dropdown. Wähl eines aus — am besten ein Projekt in Deiner Wunsch-Region.',
    tip: 'Es erscheinen nur Projekte mit aktiven Wohneinheiten in Vermarktung (Status=Aktiv in Kalk-Stammdaten). Falls leer → Domi/Henry pingen wegen Stammdaten-Pflege.',
    target: '#projekt-select',
    needsView: 'kunde',
    needsTab: 'kalkulator',
    detectCompleted: () => !!(state.kalk && (state.kalk._projektFilter || state.kalk._weId)),
  },
  {
    title: 'Schritt 11 — Wohneinheit wählen',
    action: 'Wähl jetzt eine konkrete Wohneinheit im zweiten Dropdown. Die Berechnung lädt automatisch.',
    tip: 'Die Status-Pille zeigt vermietet/leer. Stellplätze (Garagen/Außenstellplätze) werden automatisch dazugeladen, wenn welche zur WE gehören.',
    target: '#we-select',
    needsView: 'kunde',
    needsTab: 'kalkulator',
    detectCompleted: () => !!(state.kalk && state.kalk._weId),
  },
  {
    title: 'Schritt 12 — Standort + Eckdaten anschauen',
    action: 'Scroll runter zur Sektion „01 · Das Objekt". Hier siehst Du die Adresse, qm, Baujahr, Lage-Kategorie — die Grundlage für jeden Pitch.',
    tip: 'Adresse + Stadtteil kommen aus dem Wohneinheit-Datensatz in Airtable. Wenn was fehlt: rechts neben jeder Annahme ist ein Quelle-Tooltip — der zeigt Dir woher die Zahl kommt.',
    target: '.kalk-c-section',
    needsView: 'kunde',
    needsTab: 'kalkulator',
  },
  {
    title: 'Schritt 13 — Hero-Headline: die wichtigste Zahl',
    action: 'Direkt oben in der Magazin-Story siehst Du die Hero-Headline: „In zehn Jahren baust Du nach unserer Rechnung X € Nettovermögen auf." Das ist Dein Pitch-Anker.',
    tip: 'Daneben drei Strip-Cells: Wohnfläche, Gesamtinvestition, Miete kalt. Alles ist verlinkt mit den darunter liegenden Sektionen — der Kunde kann durchscrollen wie ein Magazin.',
    target: '.kalk-c-hero-headline',
    needsView: 'kunde',
    needsTab: 'kalkulator',
  },
  {
    title: 'Schritt 14 — Annahmen-Modal: Wo kommen die Zahlen her?',
    action: 'Jede Zahl im Magazin hat einen Quelle-Tooltip (kleines (?)-Icon). Probier eines an, z.B. neben dem AfA-Wert. Das öffnet eine Erklärung mit Quelle (Gutachter, Airtable-Feld, Formel).',
    tip: 'Das ist Dein Banker-Modus: jede Zahl ist nachvollziehbar, jede Annahme dokumentiert. Wenn der Kunde fragt „woher kommt das?" — Klick auf den Tooltip, fertig.',
    target: '.kalk-c-section',
    needsView: 'kunde',
    needsTab: 'kalkulator',
  },
  {
    title: 'Schritt 15 — Was-wäre-wenn (Sensitivität)',
    action: 'Scroll weiter zur Sektion „06 · Was wäre wenn". Drei Szenarien als Karten: Basis (grün), Konservativ (Zins +1 %, 1 Mo Leerstand), Stress-Test (Zins +2 %, 3 Mo Leerstand).',
    tip: 'Bank-Sprache statt Wetter-Metaphorik. Das ist Deine Antwort wenn der Kunde fragt „und wenn die Zinsen steigen?" — die Kalkulation ist robust gerechnet.',
    target: '.kalk-c-section',
    needsView: 'kunde',
    needsTab: 'kalkulator',
  },
  {
    title: 'Schritt 16 — Snapshot speichern',
    action: 'Scroll ganz nach unten zur Toolbar und klick „Snapshot speichern". Vergib eine Bezeichnung, z.B. „Pitch 1 — Erstgespräch".',
    tip: 'Snapshots sind eingefrorene Zwischenstände — ändern sich nicht mehr, auch wenn Stammdaten oder Person-Settings sich ändern. Beim Reload zeigt ein Toast „Werte eingefroren".',
    target: '.toolbar button[onclick*="saveSnapshot"]',
    needsView: 'kunde',
    needsTab: 'kalkulator',
    detectCompleted: () => Array.isArray(state.snapshots) && state.snapshots.length > 0,
  },
  {
    title: 'Schritt 17 — Investitions-Doc als PDF runterladen + lesen',
    action: 'In der Toolbar klick auf „Investitions-Doc". Wähl „Als PDF herunterladen". Öffne das PDF und schau es Dir AUS KUNDEN-SICHT durch (9 Seiten).',
    tip: 'Das PDF ist Dein Standard-Pitch: Cover mit Kundenname, 9 Seiten Magazin-Story, am Ende ein CTA-Block. Beim Mail-Send geht es direkt an die Kunden-E-Mail mit kurzem Begleittext.',
    target: '.toolbar button[onclick*="openInvestDocModal"]',
    needsView: 'kunde',
    needsTab: 'kalkulator',
    detectCompleted: () => false,
  },

  // ============== TEIL 5: SELBSTAUSKUNFT — DU FÜLLST DEINE EIGENE AUS ==============
  {
    title: 'Schritt 18 — Selbstauskunft öffnen',
    action: 'Wechsel oben auf den Tab „Selbstauskunft". Du siehst das SA-Formular für Antragsteller (+ optional Mit-Antragsteller).',
    tip: 'Auto-Save aktiv — jede Änderung wird sofort gespeichert. Pflichtfelder (Brutto, Steuerklasse, IBAN, Steuer-ID) werden vor dem digitalen Send geprüft.',
    target: '.tab[data-tab="selbstauskunft"]',
    needsView: 'kunde',
    detectCompleted: () => state.tab === 'selbstauskunft',
  },
  {
    title: 'Schritt 19 — Deine eigene Bonität eintragen',
    action: 'Trag DEINE echten Bonitätsdaten ein: Bruttogehalt, Steuerklasse, KFZ-Ausgaben, Sparrate, Eigenkapital. So siehst Du gleich Deinen eigenen Cashflow-Saldo aus Bank-Sicht.',
    tip: 'Bonitäts-Box oben (Einnahmen / Ausgaben / Saldo) wird live aktualisiert — das ist genau was der Banker sieht wenn er die SA aufschlägt.',
    target: null,
    needsView: 'kunde',
    needsTab: 'selbstauskunft',
  },
  {
    title: 'Schritt 20 — SA digital an Dich selbst senden',
    action: 'Klick „SA-Link an Kunde senden". Eine Mail geht an die E-Mail aus den Stammdaten (= Deine eigene E-Mail).',
    tip: 'Magic-Link mit JWT, 14 Tage gültig. Kunde sieht das SA-Portal als eigene URL, kann zwischenspeichern, später weitermachen. Du siehst den Status in der Aktivitäten-Historie.',
    target: 'button[onclick*="generateSaPortalLink"], button[onclick*="sendSaForSignature"]',
    needsView: 'kunde',
    needsTab: 'selbstauskunft',
    detectCompleted: () => false,
  },
  {
    title: 'Schritt 21 — Mail im eigenen Posteingang öffnen',
    action: 'Öffne Dein E-Mail-Postfach (in einem anderen Tab). Du hast eine Mail von „B&B Immo" → klick den Magic-Link in der Mail.',
    tip: 'Falls Mail nicht angekommen ist: Spam-Ordner checken. Dauert üblicherweise 30 Sekunden bis 2 Minuten. Edgar hat alle Auth-Domains verifiziert.',
    target: null,
    needsView: 'kunde',
    needsTab: 'selbstauskunft',
  },
  {
    title: 'Schritt 22 — Das SA-Portal aus Kunden-Sicht',
    action: 'Du bist jetzt im SA-Portal — das was der Kunde sieht. Schau Dich um: gleiche Brot & Butter-Logo, vereinfachte Form, Auto-Save unten. Trag was ein, klick „Speichern".',
    tip: 'Das SA-Portal ist eine eigene HTML (sa-portal.html) — schlanker als die App. Kein Login nötig, läuft via JWT-Token in der URL. Kunde kann hin- und herwechseln zwischen Antragsteller 1 und 2.',
    target: null,
    needsView: 'kunde',
  },
  {
    title: 'Schritt 23 — Zurück in die Backstube: Webhook-Status',
    action: 'Geh zurück in den App-Tab. Wechsel auf den Übersicht-Tab. In der Aktivitäten-Historie steht jetzt ein neuer Eintrag: „SA gespeichert von Kunde" — der Webhook hat funktioniert.',
    tip: 'PandaDoc + SA-Portal nutzen Webhooks: sobald der Kunde was speichert, postet der Server an /api/sa/webhook. Der Webhook trägt in die Aktivität ein und passt den Phasen-Tracker an.',
    target: '.activity-list',
    needsView: 'kunde',
    needsTab: 'uebersicht',
  },
  {
    title: 'Schritt 24 — SA-Snapshots-Tab',
    action: 'Klick auf den Tab „SA-Snapshots". Hier siehst Du alle versionierten SA-Stände. Jede Speicherung erzeugt einen Snapshot.',
    tip: 'Sinn: Banker bekommt immer den vom Kunden VERSCHICKTEN Stand. Du kannst alte SAs zurückladen, vergleichen, oder einfach archivieren. PandaDoc bekommt den letzten Snapshot.',
    target: '.tab[data-tab="snapshots"]',
    needsView: 'kunde',
    detectCompleted: () => state.tab === 'snapshots',
  },

  // ============== TEIL 6: RESERVIERUNG — DU UNTERSCHREIBST DEINE EIGENE ==============
  {
    title: 'Schritt 25 — Reservierung digital an Dich senden',
    action: 'Wechsel zurück zum Kalkulator-Tab. In der Toolbar ganz unten ist „Reservierung digital senden" — klick drauf. Die Reservierung geht via PandaDoc an Deine E-Mail.',
    tip: 'PandaDoc-Doc wird automatisch befüllt: Käufer (Du), Verkäufer (B&B), Objekt-Daten aus Airtable, Frist 30 Tage. Status landet automatisch in der Aktivitäten-Historie via Webhook.',
    target: '.toolbar button[onclick*="sendReservierungForSignature"]',
    needsView: 'kunde',
    needsTab: 'kalkulator',
    detectCompleted: () => false,
  },
  {
    title: 'Schritt 26 — PandaDoc-Mail öffnen + selbst unterschreiben',
    action: 'Wieder Mail-Postfach. PandaDoc-Mail mit „Reservierungsvereinbarung — bitte unterschreiben". Klick den Link, gehe durch das PandaDoc-Doc, unterschreib digital.',
    tip: 'Du siehst genau was der Kunde sieht. Felder die der Käufer ausfüllen muss sind farblich markiert. Am Ende klick „Fertigstellen" — Du bekommst eine Kopie per Mail.',
    target: null,
    needsView: 'kunde',
  },
  {
    title: 'Schritt 27 — Webhook bestätigt: Reservierung signiert',
    action: 'Zurück in die Backstube, Übersicht-Tab. In der Aktivitäten-Historie steht jetzt: „Reservierung signiert von Test-Kunde". Der Phasen-Tracker springt auf „Abwicklung".',
    tip: 'PandaDoc-Webhook + HMAC-Signatur — manipulationssicher. Bei jedem Status-Event (Sent → Viewed → Signed → Completed) kommt ein neuer Aktivitäts-Eintrag.',
    target: '.activity-list',
    needsView: 'kunde',
    needsTab: 'uebersicht',
  },

  // ============== TEIL 7: WOHNUNGEN-LISTE + MATCH ==============
  {
    title: 'Schritt 28 — Wohnungen-Liste öffnen',
    action: 'Klick oben in der Navigation auf „Wohnungen". Du siehst alle WEs in Vermarktung, pro Projekt gruppiert, mit Kennzahlen.',
    tip: 'Profil-Dropdown oben rechts wechselt zwischen 6 Bank-Szenarien (3 Steuersätze × KNK ohne/mit). KNK „mit" = 4,8 % Zins (Bank-Aufschlag), „ohne" = 4,5 %. Jede WE-Zeile ist klickbar — direkt zur Kalkulation.',
    target: 'a[href="#/we-liste"]',
    needsView: null,
    detectCompleted: () => state.view === 'we-liste',
  },
  {
    title: 'Schritt 29 — WE filtern: was passt zu Dir?',
    action: 'Probier die Filter aus: Bundesland → wähl Dein eigenes. Investitionsbedarf → setz Dein eigenes Eigenkapital. Du siehst nur noch WEs die zu Deiner Bonität passen.',
    tip: 'Filter werden in sessionStorage gespeichert — bleiben über Page-Reloads erhalten, aber nur in dieser Browser-Session. Multi-Select für Bundesland + Kreis.',
    target: '.filter-bar, .we-filter-bar',
    needsView: 'we-liste',
  },
  {
    title: 'Schritt 30 — Zurück zu Meine Kunden, Filter nutzen',
    action: 'Klick oben links auf „Meine Kunden". Probier die Filter-Bar: nach Phase, nach Wunsch-Region, nach offenen WV. Sortier nach „Wiedervorlage" — die fälligsten Kunden zuerst.',
    tip: 'Das ist Dein Tages-Cockpit: alle Kunden mit offener Wiedervorlage, gefiltert nach was Du gerade brauchst. Spalten zeigen Phase, Wunsch-Region, EK, Einkommen, Investitionsschwelle.',
    target: 'a[href="#/dashboard"]',
    needsView: null,
    detectCompleted: () => state.view === 'dashboard',
  },

  // ============== TEIL 8: AUFRÄUMEN + ABSCHLUSS ==============
  {
    title: 'Schritt 31 — Test-Kunde archivieren',
    action: 'Klick in „Meine Kunden" auf Dich selbst (Test-Kunde). Im Header der Kundenseite ist der Button „Archivieren" — klick ihn an.',
    tip: 'Vertrieb darf nicht endgültig löschen, nur archivieren. Edgar als Admin kann später echte Löschungen durchführen. Damit fliegt der Test-Kunde aus Deiner Liste raus.',
    target: 'button[onclick*="archiveKunde"]',
    needsView: 'kunde',
  },
  {
    title: '🎉 Fertig! Du bist startklar — die Backstube ist offen',
    action: 'Du hast jetzt einmal alles gebacken: Kunde anlegen → Übersicht-Cockpit → Kalkulation → Snapshot → PDF → SA aus Vertriebler-Sicht UND Kunden-Sicht → Reservierung-Unterschrift → Wohnungs-Match. Du bist startklar.',
    tip: 'Tour jederzeit über „?" oben rechts wieder startbar. Bei Fragen → Edgar pingen. Jetzt schnapp Dir einen echten Lead und backe sein Probe-Stück. 🥨',
    target: null,
    needsView: null,
  },
];

let _tourActive = false;
let _tourStep = 0;
// QA-Fix 2026-05-23 (Audit R-5): _tourStartedAt verhindert stilles Auto-
// Skip von Steps deren Zustand SCHON beim Tour-Start erfüllt war (z.B.
// User hat schon eine WE gewählt und startet die Tour danach via ?).
// Wir merken den Step-1-Start-Zustand pro detectCompleted.
let _tourStepEnteredStates = {};

function startTour(opts) {
  // QA-Fix 2026-05-23 (Audit-F-1): Wenn die Tour schon läuft und der User
  // den ?-Button erneut klickt — KEIN Reset auf Step 0 (das würde 8 Schritte
  // Fortschritt zerstören). Stattdessen einfach re-rendern.
  if (_tourActive) {
    _renderTour();
    return;
  }
  _tourStep = (opts && typeof opts.step === 'number') ? opts.step : 0;
  _tourActive = true;
  _tourStepEnteredStates = {}; // QA-Fix R-5: Reset für neue Tour-Session
  _renderTour();
  document.addEventListener('keydown', _tourKeyHandler);
  window.addEventListener('hashchange', _tourRerender);
  window.addEventListener('resize', _tourRerender);
  // QA-Fix 2026-05-23 (Audit-UW-1): Modal-Open auch detektieren (nicht nur
  // -close), damit Tour-Card sofort versteckt wird sobald ein Modal aufgeht.
  _ensureModalOpenObserver();
}

// Permanenter Body-Observer der bei JEDER Body-Child-Mutation prüft ob
// Tour-Card+Modal-Status neu gerendert werden muss. Wird in startTour
// aktiviert und in endTour disconnectet.
let _tourBodyObserver = null;
function _ensureModalOpenObserver() {
  if (_tourBodyObserver) return;
  _tourBodyObserver = new MutationObserver((mutations) => {
    if (!_tourActive) return;
    // Nur reagieren wenn ein Modal-Knoten hinzugefügt oder entfernt wurde —
    // sonst spammen Toasts/Chart-Tooltips.
    const relevant = mutations.some(m => {
      for (const n of [...(m.addedNodes||[]), ...(m.removedNodes||[])]) {
        if (n.nodeType !== 1) continue;
        if (n.matches && n.matches('.reserv-modal-overlay, #bbk-snapshot-modal, #bbk-wv-modal, .modal, [role="dialog"]')) return true;
        if (n.querySelector && n.querySelector('.reserv-modal-overlay, #bbk-snapshot-modal, #bbk-wv-modal, .modal, [role="dialog"]')) return true;
      }
      return false;
    });
    if (relevant) _tourRerender();
  });
  _tourBodyObserver.observe(document.body, { childList: true, subtree: false });
}
window.startTour = startTour;

function endTour(markSeen) {
  _tourActive = false;
  // QA-Fix 2026-05-23 (Audit-T-Code-1): pending rerender-Timer canceln,
  // damit kein Zombie-Render NACH endTour eine neue Card erzeugt.
  if (_tourRerenderTimer) { clearTimeout(_tourRerenderTimer); _tourRerenderTimer = null; }
  if (_tourModalObserver) { _tourModalObserver.disconnect(); _tourModalObserver = null; }
  if (_tourBodyObserver) { _tourBodyObserver.disconnect(); _tourBodyObserver = null; }
  const ov = document.getElementById('bbk-tour-overlay');
  if (ov) ov.remove();
  const card = document.getElementById('bbk-tour-card');
  if (card) card.remove();
  document.querySelectorAll('.bbk-tour-highlight').forEach(el => el.classList.remove('bbk-tour-highlight', 'bbk-tour-highlight-soft'));
  document.removeEventListener('keydown', _tourKeyHandler);
  window.removeEventListener('hashchange', _tourRerender);
  window.removeEventListener('resize', _tourRerender);
  if (markSeen) {
    try { localStorage.setItem(tourStorageKey(), '1'); } catch (e) {}
  }
}
// QA-Sprint 2026-05-23 (Edgar live): Tour neu rendern wenn der User die
// Seite wechselt — so wird der View-Match-Hinweis live aktualisiert sobald
// der User auf den richtigen Tab klickt.
// QA-Fix 2026-05-23 (Audit-T-Code-2): Debounce gegen Resize-Burst (60 Events/s).
// Pending Timer wird vor neuem schedule gecanceled — nur 1 Re-Render pro Burst.
let _tourRerenderTimer = null;
function _tourRerender() {
  if (!_tourActive) return;
  if (_tourRerenderTimer) clearTimeout(_tourRerenderTimer);
  _tourRerenderTimer = setTimeout(() => {
    _tourRerenderTimer = null;
    if (_tourActive) _renderTour();
  }, 80);
}

// QA-Fix 2026-05-23 (Audit-T-8 + T3-1 + T3-2): MutationObserver triggert
// _tourRerender wenn ein Modal aus dem DOM verschwindet — Tour-Card kommt
// automatisch wieder. subtree:true damit verschachtelte Modal-Strukturen
// erkannt werden. Wird NUR während ein Modal offen ist aktiviert (T3-2),
// sonst spammen Toasts/Charts den Observer.
let _tourModalObserver = null;
function _ensureModalCloseObserver() {
  if (_tourModalObserver) return;
  _tourModalObserver = new MutationObserver(() => {
    if (!_tourActive) return;
    const stillOpen = !!document.querySelector(
      '.reserv-modal-overlay, #bbk-snapshot-modal, #bbk-wv-modal, .modal, [role="dialog"]'
    );
    if (!stillOpen) {
      // Modal weg → Observer abschalten (wird beim nächsten Modal-open
      // wieder via _ensureModalCloseObserver aktiviert).
      _tourModalObserver.disconnect();
      _tourModalObserver = null;
      _tourRerender();
    }
  });
  _tourModalObserver.observe(document.body, { childList: true, subtree: true });
}
window.endTour = endTour;

function _tourKeyHandler(e) {
  if (!_tourActive) return;
  if (e.key === 'Escape') { endTour(true); return; }
  if (e.key === 'ArrowRight') { _tourNext(); return; }
  if (e.key === 'ArrowLeft')  { _tourPrev(); return; }
}

function _tourNext() {
  if (_tourStep < TOUR_STEPS.length - 1) {
    _tourStep++;
    _renderTour();
  } else {
    endTour(true);
  }
}

function _tourPrev() {
  if (_tourStep > 0) {
    _tourStep--;
    _renderTour();
  }
}

// QA-Fix 2026-05-23 (Audit-UW-2/UW-4): Direkt zu spezifischem Step springen.
function _tourGotoStep(idx) {
  if (!_tourActive) return;
  if (idx < 0 || idx >= TOUR_STEPS.length) return;
  _tourStep = idx;
  _renderTour();
}
window._tourGotoStep = _tourGotoStep;

// QA-Fix 2026-05-23 (Audit-F): Hinbringen-Button mit Safety-Net-Re-Render —
// triggert _tourRerender selbst wenn der hash unverändert bleibt (kein
// hashchange-Event von go(currentHash) → Tour blieb sonst stuck).
function _tourJumpTo(hash) {
  const cleaned = (hash || '').replace(/^#/, '');
  if (window.location.hash === '#' + cleaned || window.location.hash === cleaned) {
    // Schon dort → direkt re-rendern statt warten auf nicht-feuernden hashchange
    _tourRerender();
  } else {
    window.location.hash = cleaned;
    // Safety-Net: hashchange feuert üblicherweise, aber bei race nochmal
    setTimeout(() => _tourRerender(), 120);
  }
}
window._tourJumpTo = _tourJumpTo;

function _renderTour() {
  // QA-Sprint 2026-05-23 (Edgar live): komplett umgebaut.
  //  - Spotlight via box-shadow auf das Target → Element bleibt voll sichtbar,
  //    alles drumherum kommt dunkel.
  //  - View-Check: wenn der Step eine bestimmte view braucht (dashboard/kunde),
  //    bietet die Tour einen „Hinbringen"-Button statt nur Hinweis-Toast.
  //  - Card-Position dynamisch (oben/unten je nach Target-Position).

  // Highlight altes Target entfernen, falls noch da
  document.querySelectorAll('.bbk-tour-highlight').forEach(el => el.classList.remove('bbk-tour-highlight', 'bbk-tour-highlight-soft'));

  // Tour-Card-Element holen oder neu anlegen
  let card = document.getElementById('bbk-tour-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'bbk-tour-card';
    card.className = 'bbk-tour-card';
    document.body.appendChild(card);
  }

  // QA-Fix 2026-05-23 (Audit-T-8): Wenn ein Modal offen ist (Reservierung,
  // Snapshot-Name, Wiedervorlage, Kunde-Anlegen), Tour-Card und Overlay
  // temporär verstecken — sonst überlagern sie das Modal. MutationObserver
  // unten reagiert auf Modal-Schließen und rendert die Tour neu.
  const modalOffen = !!document.querySelector(
    '.reserv-modal-overlay, #bbk-snapshot-modal, #bbk-wv-modal, .modal, [role="dialog"]'
  );
  if (modalOffen) {
    card.style.display = 'none';
    const ovHide = document.getElementById('bbk-tour-overlay');
    if (ovHide) ovHide.style.display = 'none';
    _ensureModalCloseObserver();
    return; // restliches Rendering überspringen
  } else {
    card.style.display = '';
    const ovShow = document.getElementById('bbk-tour-overlay');
    if (ovShow) ovShow.style.display = '';
  }

  const step = TOUR_STEPS[_tourStep];
  const last = _tourStep === TOUR_STEPS.length - 1;
  const first = _tourStep === 0;

  // View-Check: aktuelle state.view passt zur needsView?
  const needsView = step.needsView || null;
  const needsTab  = step.needsTab  || null;
  const viewMatches = !needsView || state.view === needsView;
  const tabMatches  = !needsTab  || state.tab  === needsTab;

  // QA-Fix 2026-05-23 (Walkthrough-Test): Auto-Advance wenn aktueller Step
  // nicht mehr matched ABER der nächste Step EXPLIZIT eine View/Tab vorgibt
  // die genau zur aktuellen Lage passt. Beispiel: Step 1 ist „Test-Kunde
  // anlegen" (Dashboard), User klickt + Neuer Kunde → Modal → Anlegen →
  // automatische Navigation zu '/kunde/X' → state.view = 'kunde'.
  // Vorher zeigte Card „Du bist nicht auf der richtigen Seite" obwohl der
  // User genau das gemacht hat was die Tour wollte. Jetzt: springt direkt
  // zum nächsten Step der zu state.view='kunde' passt.
  // WICHTIG: nur auto-advance wenn nextStep EXPLIZIT needsView/needsTab hat
  // und es matched — sonst skippen wir Steps mit needsView:null (die immer
  // matchen würden).
  if ((!viewMatches || !tabMatches) && _tourStep < TOUR_STEPS.length - 1) {
    const nextStep = TOUR_STEPS[_tourStep + 1];
    const nextHasExplicit = !!(nextStep.needsView || nextStep.needsTab);
    const nextViewMatches = !nextStep.needsView || state.view === nextStep.needsView;
    const nextTabMatches  = !nextStep.needsTab  || state.tab  === nextStep.needsTab;
    if (nextHasExplicit && nextViewMatches && nextTabMatches) {
      _tourStep++;
      _renderTour();
      return;
    }
  }

  // QA-Fix 2026-05-23 (Edgar-Doc Bug-4): Auto-Advance wenn der aktuelle Step
  // erkennbar erledigt ist (detectCompleted true). Beispiel: Step 6 ist
  // „Snapshot speichern" — sobald state.snapshots.length > 0, weiter zu Step 7.
  // QA-Fix 2026-05-23 (Audit R-5): NICHT auto-skippen wenn der Zustand SCHON
  // beim Step-Eintritt erfüllt war. Sonst springt die Tour stumm Step 2-4
  // wenn der User die Tour MITTEN in einer Session via ? startet und schon
  // einen Kunden/Tab/WE gewählt hat. Lerneffekt = weg.
  if (typeof step.detectCompleted === 'function') {
    try {
      const completed = step.detectCompleted();
      const stepKey = '_step' + _tourStep;
      // Bei erstmaligem Render dieses Steps: Anfangs-Zustand speichern
      if (_tourStepEnteredStates[stepKey] === undefined) {
        _tourStepEnteredStates[stepKey] = completed;
      }
      // Auto-Advance NUR wenn beim Step-Eintritt false war und JETZT true
      // (= User hat den Step aktiv abgeschlossen)
      if (_tourStep < TOUR_STEPS.length - 1
          && completed
          && _tourStepEnteredStates[stepKey] === false) {
        _tourStep++;
        _renderTour();
        return;
      }
    } catch (e) { /* detectCompleted darf nicht crashen — Tour läuft normal weiter */ }
  }
  const viewLabel = { dashboard: 'Meine Kunden', kunde: 'Kunde-Detail-Seite', 'we-liste': 'Wohnungen', admin: 'Admin' }[needsView] || needsView;
  const viewHref = { dashboard: '#/dashboard', kunde: state.kundeId ? ('#/kunde/' + state.kundeId) : '#/dashboard', 'we-liste': '#/we-liste', admin: '#/admin' }[needsView] || '#/dashboard';
  const tabLabel = { uebersicht: 'Übersicht', kalkulator: 'Kalkulator', selbstauskunft: 'Selbstauskunft', snapshots: 'Snapshots' }[needsTab] || needsTab;

  const targetEl = (viewMatches && tabMatches && step.target) ? document.querySelector(step.target) : null;

  // Bei View-Mismatch: klarer Block + Auto-Hinbringen
  let viewMismatchBlock = '';
  if (!viewMatches && last) {
    // QA-Fix 2026-05-23 (Walkthrough): letzter Step + Mismatch heißt meist
    // „User hat den Schritt erfolgreich abgeschlossen und ist weiter navigiert"
    // (z.B. Archivieren → Dashboard). Statt Hinbringen-Button: Fertig-Hinweis.
    viewMismatchBlock = `<div class="bbk-tour-warn">
         <strong>🎉 Tour abgeschlossen!</strong>
         Klick rechts auf „Fertig ✓" und leg los. Wieder aufrufbar über das „?"-Symbol oben rechts.
       </div>`;
  } else if (!viewMatches && needsView === 'kunde' && !state.kundeId) {
    // QA-Fix 2026-05-23 (Audit-UW-2/UW-4): Tour-Step braucht Kunde aber keiner
    // ausgewählt — kein sinnvoller Sprung-Link möglich, „Dorthin springen"
    // führte sonst auf Dashboard (Dead-End-Schleife). Stattdessen: zurück
    // zu Step 1 (Kunde anlegen) erzwingen.
    viewMismatchBlock = `<div class="bbk-tour-warn">
         <strong>Erst einen Kunden anlegen.</strong>
         Dieser Schritt braucht einen geöffneten Kunden. Geh zurück zu Schritt 1
         und leg einen Test-Kunden an.
         <div style="margin-top:10px;">
           <button type="button" class="bbk-tour-jumpbtn" onclick="window._tourGotoStep(1)">← Zurück zu Schritt 1</button>
         </div>
       </div>`;
  } else if (!viewMatches) {
    // QA-Fix 2026-05-23 (Audit-F): Button statt <a href> — wenn User schon auf
    // gleichem Hash ist (z.B. /dashboard und Tour will /dashboard), triggert
    // <a href> KEINEN hashchange → Tour bleibt mismatched. Mit Button + JS
    // setzen wir hash UND triggern _tourRerender explizit als Safety-Net.
    viewMismatchBlock = `<div class="bbk-tour-warn">
         <strong>Du bist nicht auf der richtigen Seite.</strong>
         Dieser Schritt ist auf der Seite „${esc(viewLabel)}".
         <div style="margin-top:10px;">
           <button type="button" class="bbk-tour-jumpbtn" onclick="window._tourJumpTo('${esc(viewHref)}')">→ Dorthin springen</button>
         </div>
       </div>`;
  } else if (!tabMatches) {
    // View OK aber falscher Tab → Tab-Wechsel-Button
    viewMismatchBlock = `<div class="bbk-tour-warn">
         <strong>Falscher Tab.</strong>
         Dieser Schritt ist im Tab „${esc(tabLabel)}".
         <div style="margin-top:10px;">
           <button type="button" class="bbk-tour-jumpbtn" onclick="setTab('${esc(needsTab)}')">→ Tab wechseln</button>
         </div>
       </div>`;
  }

  // Bei View+Tab-Match aber Element fehlt: Hinweis (z.B. Conditional Rendering)
  const targetMissingBlock = (viewMatches && tabMatches && step.target && !targetEl)
    ? `<div class="bbk-tour-warn">
         <strong>Element gerade nicht sichtbar.</strong>
         Vielleicht musst Du etwas scrollen oder eine WE auswählen. Die Tour läuft trotzdem weiter.
       </div>`
    : '';

  // QA-Fix 2026-05-23 (Audit-T3-16): Step 1 (Test-Kunde anlegen) für
  // existierende User mit Kundenliste angepasst — „Test-Kunde anlegen ODER
  // einen bestehenden öffnen" wirkt weniger befremdlich als zwanghafter
  // Test-Kunde bei 15 echten Kunden.
  let _actionText = step.action || '';

  card.innerHTML = `
    <div class="bbk-tour-card-inner">
      <div class="bbk-tour-card-head">
        <span class="bbk-tour-eyebrow">Tour — Schritt ${_tourStep + 1} / ${TOUR_STEPS.length}</span>
        <button type="button" class="bbk-tour-skip" onclick="endTour(true)">Überspringen ×</button>
      </div>
      <h3 class="bbk-tour-title">${esc(step.title)}</h3>
      <p class="bbk-tour-action">${step.actionHtml ? _actionText : esc(_actionText)}</p>
      ${step.tip ? `<p class="bbk-tour-tip">${esc(step.tip)}</p>` : ''}
      ${viewMismatchBlock}
      ${targetMissingBlock}
      <div class="bbk-tour-foot">
        <button type="button" class="bbk-tour-nav-btn bbk-tour-prev" onclick="window._tourPrev()" ${first ? 'disabled' : ''}>← Zurück</button>
        <div class="bbk-tour-dots">
          ${TOUR_STEPS.map((_, idx) => `<span class="bbk-tour-dot${idx === _tourStep ? ' active' : ''}"></span>`).join('')}
        </div>
        <button type="button" class="bbk-tour-nav-btn bbk-tour-next" onclick="window._tourNext()">${last ? 'Fertig ✓' : 'Weiter →'}</button>
      </div>
    </div>
  `;

  // Backdrop-Overlay (transparent, pointer-events:none, damit der User mit der App
  // interagieren kann — der Spotlight kommt durch das box-shadow auf dem Target).
  let ov = document.getElementById('bbk-tour-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'bbk-tour-overlay';
    ov.className = 'bbk-tour-overlay';
    document.body.appendChild(ov);
  }
  // Bei nicht-passender View ODER ohne Target: kompletter dunkler Backdrop
  // (kein Spotlight möglich, also den ganzen Screen abdunkeln).
  ov.classList.toggle('bbk-tour-overlay-full', !targetEl);

  // Spotlight + Scroll
  if (targetEl) {
    targetEl.classList.add('bbk-tour-highlight');
    // QA-Fix 2026-05-23 (Audit-T3-17): Für Tab-Buttons und Nav-Links
    // sanften Highlight ohne 9999px-Spotlight — sonst werden Schwester-
    // Tabs komplett dunkel und User verliert Orientierung.
    const isTab = step.target && (
      step.target.includes('data-tab=') ||
      step.target.includes('#/we-liste') ||
      step.target.includes('#/dashboard')
    );
    if (isTab) targetEl.classList.add('bbk-tour-highlight-soft');
    // Smooth-Scroll, sodass das Element gut sichtbar ist
    try {
      const rect = targetEl.getBoundingClientRect();
      const targetY = window.scrollY + rect.top - 140;
      window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    } catch (e) {
      try { targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    }
    // Card-Position relativ zum Target: wenn Target oben in der Seite, Card unten und
    // umgekehrt, damit sich die nicht überlagern.
    setTimeout(() => _positionTourCard(targetEl, card), 350);
  } else {
    // Kein Target → Card mittig
    // QA-Fix 2026-05-23 (Audit-T3-8): card.style.width zurücksetzen, sonst bleibt
    // die Pixel-Breite vom vorherigen Step gesetzt.
    card.style.top  = '50%';
    card.style.left = '50%';
    card.style.transform = 'translate(-50%, -50%)';
    card.style.right = 'auto';
    card.style.bottom = 'auto';
    card.style.width = '';
  }
}

// Hilfsfunktion: positioniert die Tour-Card so, dass sie das Target nicht verdeckt.
function _positionTourCard(targetEl, card) {
  if (!targetEl || !card) return;
  // QA-Fix 2026-05-23 (Audit-T-Code-3): Element könnte zwischen Render und
  // setTimeout-Callback aus dem DOM entfernt worden sein (z.B. tab-Wechsel).
  // getBoundingClientRect liefert dann {0,0,0,0} → Card landet links-oben.
  if (!document.body.contains(targetEl)) return;
  const tRect = targetEl.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const cardW = Math.min(420, vw - 40);
  const cardH = card.offsetHeight || 320;
  const margin = 24;

  // Target nimmt obere oder untere Hälfte ein?
  const targetMid = tRect.top + tRect.height / 2;
  const placeBelow = targetMid < vh / 2; // Target oben → Card unten
  let top, left;
  if (placeBelow) {
    top  = Math.min(tRect.bottom + margin, vh - cardH - margin);
    left = Math.max(margin, Math.min(vw - cardW - margin, tRect.left + tRect.width / 2 - cardW / 2));
  } else {
    top  = Math.max(margin, tRect.top - cardH - margin);
    left = Math.max(margin, Math.min(vw - cardW - margin, tRect.left + tRect.width / 2 - cardW / 2));
  }
  card.style.top    = top + 'px';
  card.style.left   = left + 'px';
  card.style.right  = 'auto';
  card.style.bottom = 'auto';
  card.style.transform = 'none';
  card.style.width  = cardW + 'px';
}
window._tourNext = _tourNext;
window._tourPrev = _tourPrev;

// Auto-Start beim ersten Login (wenn noch nicht gesehen)
function maybeStartTourOnFirstLogin() {
  try {
    const seen = localStorage.getItem(tourStorageKey());
    if (!seen) {
      setTimeout(() => startTour(), 1200);
    }
  } catch (e) { /* localStorage disabled — skip */ }
}
window.maybeStartTourOnFirstLogin = maybeStartTourOnFirstLogin;

/* ============================== SNAPSHOT-MODAL ============================== */
/* QA-Sprint 2026-05-23 (Audit-G G-B3): ersetzt window.prompt() für die
   Snapshot-Bezeichnung. Promise-basiert, gleiche Optik wie die anderen Modals. */

function openSnapshotNameModal(defaultValue, title) {
  return new Promise((resolve) => {
    const existing = document.getElementById('bbk-snapshot-modal');
    if (existing) existing.remove();
    const ov = document.createElement('div');
    ov.id = 'bbk-snapshot-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(26,26,23,0.5);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px;font-family:inherit;';
    ov.innerHTML = `
      <div style="background:#FBFAF7;border-radius:14px;max-width:520px;width:100%;padding:28px 32px;box-shadow:0 30px 80px rgba(0,0,0,0.25);border:1px solid #C9A572;">
        <div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8E6E3D;font-weight:600;margin-bottom:8px;">${title || 'Snapshot speichern'}</div>
        <h3 style="font-size:20px;font-weight:300;letter-spacing:-.01em;margin:0 0 18px 0;color:#1A1A17;">Bezeichnung für den Snapshot</h3>
        <input id="bbk-snap-input" type="text" value="${esc(defaultValue || '')}" style="width:100%;padding:12px 14px;font-size:15px;border:1px solid #C9A572;border-radius:4px;background:#fff;font-family:inherit;box-sizing:border-box;" placeholder="z.B. Henry Wacker — H21 WE 6 — Premium-Profil">
        <p style="font-size:12px;color:#7A7A72;margin:10px 0 22px;line-height:1.5;">Snapshots sind eingefrorene Zwischenstände — beim Laden eines Snapshots werden Stammdaten NICHT neu aus Airtable gezogen. Tipp: Profil + Datum im Namen.</p>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button type="button" id="bbk-snap-cancel" style="background:transparent;border:1px solid #E8E6DD;color:#1A1A17;font-family:inherit;font-size:13px;padding:9px 18px;border-radius:18px;cursor:pointer;">Abbrechen</button>
          <button type="button" id="bbk-snap-ok" style="background:#8E6E3D;color:#fff;border:none;font-family:inherit;font-size:13px;padding:9px 20px;border-radius:18px;cursor:pointer;font-weight:500;">Speichern</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
    const input = ov.querySelector('#bbk-snap-input');
    input.focus();
    input.select();
    function close(val) {
      ov.remove();
      document.removeEventListener('keydown', keyHandler);
      resolve(val);
    }
    // QA-Fix 2026-05-23 (Audit-EE-5): OK mit leerem Input zeigt Fehler IM Modal
    // statt silent abort. Vorher konnte der User den Default löschen, „Speichern"
    // klicken und dachte er hätte gespeichert.
    function confirmOk() {
      const v = (input.value || '').trim();
      if (!v) {
        input.style.borderColor = '#C04A2E';
        input.focus();
        let warn = ov.querySelector('.bbk-snap-warn');
        if (!warn) {
          warn = document.createElement('div');
          warn.className = 'bbk-snap-warn';
          warn.style.cssText = 'color:#C04A2E;font-size:12px;margin-top:8px;';
          warn.textContent = 'Bezeichnung darf nicht leer sein — bitte Namen eingeben oder Abbrechen.';
          input.parentNode.insertBefore(warn, input.nextSibling);
        }
        return;
      }
      close(v);
    }
    function keyHandler(e) {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') confirmOk();
    }
    ov.querySelector('#bbk-snap-cancel').onclick = () => close(null);
    ov.querySelector('#bbk-snap-ok').onclick = confirmOk;
    ov.onclick = (e) => { if (e.target === ov) close(null); };
    document.addEventListener('keydown', keyHandler);
  });
}
window.openSnapshotNameModal = openSnapshotNameModal;

/* ============================== PROFIL-SWITCHER ============================== */
/* QA-Sprint 2026-05-23 (Audit-G G-B4): Aktiver Wechsel zwischen Standard/Premium/Spitze.
   Nutzt window.Kalk.PROFILES — überträgt steuersatz, saSteuersatz, bonEinnahmen,
   bonAusgaben, bonVermoegen. WE-/Stammdaten-Felder bleiben unangetastet. */

function applyKalkProfil(profilKey) {
  if (!window.Kalk || !window.Kalk.PROFILES) return;
  const p = window.Kalk.PROFILES[profilKey];
  if (!p) return;

  // QA-Fix 2026-05-23 (Audit-EE-6): Wenn der User manuell-veränderte Werte hat,
  // die das Profil überschreiben würde, vorher fragen. Vorher konnte der User
  // den Käufer-Steuersatz 38% mühsam eintippen und dann durch Profil-Wechsel
  // verlieren.
  const manuellGeaendert = [];
  if (state.kalk._profil && state.kalk._profil !== profilKey) {
    const cur = window.Kalk.PROFILES[state.kalk._profil];
    if (cur) {
      if (Math.abs((state.kalk.steuersatz || 0) - cur.steuersatz) > 1e-4) manuellGeaendert.push(`Steuersatz (${(state.kalk.steuersatz*100).toFixed(0)} % → ${(p.steuersatz*100).toFixed(0)} %)`);
      if (Math.abs((state.kalk.bonEinnahmen || 0) - cur.bonEinnahmen) > 1) manuellGeaendert.push('Bonität-Einnahmen');
      if (Math.abs((state.kalk.bonAusgaben || 0) - cur.bonAusgaben) > 1) manuellGeaendert.push('Bonität-Ausgaben');
      if (Math.abs((state.kalk.bonVermoegen || 0) - cur.bonVermoegen) > 1) manuellGeaendert.push('Bonität-Vermögen');
    }
  }
  if (manuellGeaendert.length > 0) {
    const ok = window.confirm(
      `Profil-Wechsel überschreibt deine manuellen Werte:\n\n• ${manuellGeaendert.join('\n• ')}\n\nFortfahren?`
    );
    if (!ok) {
      // Dropdown auf alten Wert zurücksetzen
      const sel = document.getElementById('kalk-profil-select');
      if (sel && state.kalk._profil) sel.value = state.kalk._profil;
      return;
    }
  }

  // Wir kopieren die persönlichen Profil-Felder direkt rein. Zins/Tilgung übernehmen
  // wir auch — aber NICHT überschreiben, wenn der User sie manuell geändert hat
  // (heuristik: 4,5/1,0 ist Default — wenn etwas anderes, behalten).
  const isDefaultZins = Math.abs((state.kalk.zins || 0) - 0.045) < 1e-4;
  const isDefaultTilg = Math.abs((state.kalk.tilgung || 0) - 0.01) < 1e-4;
  state.kalk.steuersatz   = p.steuersatz;
  state.kalk.saSteuersatz = p.saSteuersatz || p.steuersatz;
  state.kalk.bonEinnahmen = p.bonEinnahmen;
  state.kalk.bonAusgaben  = p.bonAusgaben;
  state.kalk.bonVermoegen = p.bonVermoegen;
  if (isDefaultZins) state.kalk.zins = p.zins;
  if (isDefaultTilg) state.kalk.tilgung = p.tilgung;
  // QA-Fix 2026-05-23 (Audit-S1+S2): _profil-Marker persistieren — Snapshot-Reload
  // soll das richtige Profil im Dropdown zeigen, auch bei Misch-Werten (z.B. User
  // hat Steuersatz manuell 31% gesetzt). Vorher: Detect-Heuristik per Range war
  // unzuverlässig bei Snapshots.
  state.kalk._profil = profilKey;
  markKalkDirty();
  toast('Käufer-Profil auf "' + profilKey + '" gesetzt (Steuersatz ' + (p.steuersatz * 100).toFixed(0) + ' %)', 'info');
  renderTabKalkulator();
  // QA-Fix 2026-05-23 (Audit-T-5/T-6): nach renderTabKalkulator ist das alte
  // highlighted Element aus dem DOM — Tour neu rendern damit Spotlight zurück kommt.
  if (typeof _tourRerender === 'function') _tourRerender();
}
window.applyKalkProfil = applyKalkProfil;

/* ============================== KAV-CRM-TRACKER ============================== */
/* QA-Sprint 2026-05-23 (Edgar-Auftrag CRM-Redesign):
   3-Phasen-Modell mit Aufgaben-Checklisten. Wiedervorlagen mit Markierung.
   "Was-fehlt"-Anzeige. Auto-Phase-Übergang.

   Datenmodell speichert in NOTIZEN-Feld als JSON-Block (kein Airtable-Schema-Eingriff
   nötig). Vor dem Block stehen die Free-Text-Notizen des Vertrieblers, der JSON-Block
   am ENDE der Notizen. So bleiben User-Notizen frei editierbar.

   Persona-Konsens (KAV-Experte / Vertriebs-Coach / Workflow / Orchestrierer):
   - Phase 1 = Strategie/Akquise: 3 Strategiegespräche, SA eingeholt, Reservierung
   - Phase 2 = Abwicklung: Bank-Einreichung, Finanzierung, Besichtigung, Notar org
   - Phase 3 = Notar/Closing: Beurkundung
   - Wiedervorlage = optional, Bell-Icon + überfällig-Markierung
*/

const KAV_PHASES = [
  {
    id: 'phase1', nr: '1', label: 'Strategie',
    accent: '#B08A4D',
    sub: 'Bedarf · Kalkulation · Entscheidung',
    tasks: [
      { id: 'strat_1',     label: 'Strategiegespräch 1', hint: 'Bedarfsanalyse · Profil' },
      { id: 'strat_2',     label: 'Strategiegespräch 2', hint: 'Konkrete WE · Kalkulation' },
      { id: 'strat_3',     label: 'Strategiegespräch 3', hint: 'Entscheidung · Reservierung anstoßen' },
      { id: 'sa_eingeholt',           label: 'Selbstauskunft eingeholt',     hint: 'SA komplett ausgefüllt', critical: true },
      { id: 'reservierung_signed',    label: 'Reservierung unterschrieben',   hint: 'KAV via PandaDoc',       critical: true },
    ],
  },
  {
    id: 'phase2', nr: '2', label: 'Abwicklung',
    accent: '#8E6E3D',
    sub: 'Bank · Finanzierung · Notar-Termin',
    tasks: [
      { id: 'sa_an_bank',          label: 'SA an Bank gesendet',          hint: 'PandaDoc-Send oder Bank-Mail' },
      { id: 'unterlagen_komplett', label: 'Unterlagen-Bundle komplett',   hint: 'Personalausweis, Lohnzettel, Schufa' },
      { id: 'finanzierungszusage', label: 'Finanzierungszusage erhalten', hint: 'Schriftlich von der Bank',   critical: true },
      { id: 'besichtigung',        label: 'Besichtigung vor Notar-Termin', hint: 'Pflicht-Vor-Ort-Termin' },
      { id: 'notartermin_org',     label: 'Notartermin organisiert',       hint: 'Datum + Notar bestätigt',   critical: true },
    ],
  },
  {
    id: 'phase3', nr: '3', label: 'Notar',
    accent: '#2D6E47',
    sub: 'Beurkundung · Closing',
    tasks: [
      { id: 'notartermin_durch', label: 'Notartermin durchgeführt', hint: 'Beurkundung erfolgt' },
      { id: 'beurkundet',        label: 'Beurkundet & abgeschlossen', hint: 'Vertrag final',         critical: true },
    ],
  },
];

const KAV_BLOCK_START = '[KAV-TRACKER]';
const KAV_BLOCK_END   = '[/KAV-TRACKER]';

// QA-Fix 2026-05-23 (Edgar-Doc Bug-9): freeNotes-Text in zwei Buckets aufteilen:
//   - notes: alle Zeilen die der User selbst geschrieben hat (Frei-Text)
//   - activities: Zeilen die durch Auto-Events entstanden sind (Pattern:
//     `[YYYY-MM-DD HH:MM] <Quelle> ...`). Diese werden separat als
//     Aktivitäten-Historie angezeigt, damit die Notizen sauber bleiben.
function _splitNotesAndActivities(text) {
  const out = { notes: '', activities: [] };
  if (!text || typeof text !== 'string') return out;
  const lines = text.split('\n');
  const notesLines = [];
  // Activity-Pattern: beginnt mit [YYYY-MM-DD HH:MM] gefolgt von erkennbarem Source.
  // Quellen die wir erkennen: PandaDoc, Reservierung, Selbstauskunft, Snapshot,
  // Doc-Erstellung, alle vom Backend automatisch geschrieben.
  const activityRegex = /^\[(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}(?::\d{2})?)\]\s*(.+)$/;
  for (const line of lines) {
    const m = line.match(activityRegex);
    if (m) {
      out.activities.push({ ts: m[1].replace('T', ' '), text: m[2].trim() });
    } else {
      notesLines.push(line);
    }
  }
  out.notes = notesLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

function parseKavTracker(notesRaw) {
  const notes = String(notesRaw || '');
  const startIdx = notes.indexOf(KAV_BLOCK_START);
  const endIdx   = notes.indexOf(KAV_BLOCK_END);
  let data = { tasks: {}, wiedervorlage: null };
  let cleanNotes = notes;
  if (startIdx >= 0 && endIdx > startIdx) {
    const jsonStr = notes.substring(startIdx + KAV_BLOCK_START.length, endIdx).trim();
    try { data = Object.assign({ tasks: {}, wiedervorlage: null }, JSON.parse(jsonStr)); } catch (e) {}
    cleanNotes = (notes.substring(0, startIdx) + notes.substring(endIdx + KAV_BLOCK_END.length)).trim();
  }
  // Welle Filter (24.05.2026): Wunsch-Profil-Block aus freeNotes raus, damit
  // er in den UI-Notizen nicht doppelt erscheint.
  cleanNotes = _stripWunschProfilBlock(cleanNotes);
  return { tracker: data, freeNotes: cleanNotes };
}

function stringifyKavTracker(freeNotes, tracker, wunschProfil) {
  const json = JSON.stringify(tracker || { tasks: {}, wiedervorlage: null });
  const free = (freeNotes || '').trim();
  let out = (free ? free + '\n\n' : '') + KAV_BLOCK_START + '\n' + json + '\n' + KAV_BLOCK_END;
  // Wunsch-Profil-Block (Welle Filter): nach KAV-Block, nur wenn vorhanden.
  // Wenn nicht übergeben → bestehenden Block aus den freeNotes wiederherstellen.
  let wp = wunschProfil;
  if (wp === undefined) {
    // Backward-Compat: alte Aufrufer übergeben kein wunschProfil → wir lesen
    // es aus den ursprünglichen Notizen (state.kunde.notizen) wieder ein.
    try {
      const fromState = (window.state && window.state.kunde && window.state.kunde.notizen) || '';
      wp = parseWunschProfil(fromState);
    } catch { wp = null; }
  }
  if (wp && (Array.isArray(wp.regionen) && wp.regionen.length > 0 || wp.ekMin > 0 || wp.einkommenMin > 0)) {
    out += '\n' + WUNSCH_BLOCK_START + '\n' + JSON.stringify(wp) + '\n' + WUNSCH_BLOCK_END;
  }
  return out;
}

// === Wunsch-Profil-Block (Welle Filter, 24.05.2026) ===
// Vertriebler trägt pro Kunde Wunschregionen + EK/Einkommens-Schwellen ein.
// Wird im Notizen-Field als JSON-Block gespeichert, damit kein neues
// Airtable-Feld nötig ist (Edgar-Vorgabe 24.05.2026).
const WUNSCH_BLOCK_START = '[WUNSCH-PROFIL]';
const WUNSCH_BLOCK_END   = '[/WUNSCH-PROFIL]';

function parseWunschProfil(notesRaw) {
  const notes = String(notesRaw || '');
  const startIdx = notes.indexOf(WUNSCH_BLOCK_START);
  const endIdx   = notes.indexOf(WUNSCH_BLOCK_END);
  if (startIdx < 0 || endIdx <= startIdx) return { regionen: [], ekMin: 0, einkommenMin: 0 };
  const jsonStr = notes.substring(startIdx + WUNSCH_BLOCK_START.length, endIdx).trim();
  try {
    const obj = JSON.parse(jsonStr);
    return {
      regionen: Array.isArray(obj.regionen) ? obj.regionen : [],
      ekMin: parseFloat(obj.ekMin) || 0,
      einkommenMin: parseFloat(obj.einkommenMin) || 0,
    };
  } catch (e) {
    return { regionen: [], ekMin: 0, einkommenMin: 0 };
  }
}

function _stripWunschProfilBlock(notes) {
  const startIdx = notes.indexOf(WUNSCH_BLOCK_START);
  const endIdx   = notes.indexOf(WUNSCH_BLOCK_END);
  if (startIdx < 0 || endIdx <= startIdx) return notes;
  return (notes.substring(0, startIdx) + notes.substring(endIdx + WUNSCH_BLOCK_END.length)).trim();
}

// Speichert Wunsch-Profil zurück nach Airtable (Notizen-Field, JSON-Block).
// FS-1 (24.05.2026, BLOCKER B-1): jetzt über notizenQueueMutation — verhindert
// Race-Conditions vs. parallele KAV-Saves oder Activity-Logs.
async function saveWunschProfil(wunschProfil) {
  if (!state.kunde) return;
  return notizenQueueMutation((oldNotizen) => {
    const parsed = parseKavTracker(oldNotizen);
    return stringifyKavTracker(parsed.freeNotes, parsed.tracker, wunschProfil);
  });
}
window.parseWunschProfil = parseWunschProfil;
window.saveWunschProfil = saveWunschProfil;

function kavCurrentPhase(tracker) {
  // QA-Fix 2026-05-23 (Edgar live Elin): Vorher „aktuelle Phase = erste
  // Phase ohne alle critical done". Edgar's Mental-Model passt nicht: Elin
  // Duven hat in P2 schon Aufgaben gemacht (SA an Bank, Unterlagen), aber
  // formal in P1 fehlt noch „Reservierung unterschrieben" (Notiz läuft
  // noch in PandaDoc). System zeigte P1, Edgar erwartet P2.
  //
  // Neue Logic: Phase = HÖCHSTE Phase, in der mindestens eine Task erledigt
  // ist. Wenn jemand in P3 schon eine Task hat → P3, auch wenn P1/P2 nicht
  // 100 % final. Wenn alle critical von P3 done → 'abgeschlossen'.
  const tasks = tracker.tasks || {};
  // Phase 3 abgeschlossen?
  const p3 = KAV_PHASES[2];
  if (p3) {
    const p3Crit = p3.tasks.filter(t => t.critical);
    if (p3Crit.length > 0 && p3Crit.every(t => !!tasks[t.id])) return 'abgeschlossen';
  }
  // Höchste Phase mit mindestens einer erledigten Task
  for (let i = KAV_PHASES.length - 1; i >= 0; i--) {
    const ph = KAV_PHASES[i];
    const hasActivity = ph.tasks.some(t => !!tasks[t.id]);
    if (hasActivity) return ph.id;
  }
  // Noch gar nichts gemacht → Phase 1
  return KAV_PHASES[0].id;
}

function kavTaskCount(tracker, phaseId) {
  const ph = KAV_PHASES.find(p => p.id === phaseId);
  if (!ph) return { done: 0, total: 0 };
  const done = ph.tasks.filter(t => !!(tracker.tasks || {})[t.id]).length;
  return { done, total: ph.tasks.length };
}

function kavOpenTasksAcrossAll(tracker) {
  const open = [];
  for (const ph of KAV_PHASES) {
    for (const t of ph.tasks) {
      if (!(tracker.tasks || {})[t.id]) open.push({ phaseId: ph.id, phaseNr: ph.nr, phaseLabel: ph.label, ...t });
    }
  }
  return open;
}

function kavNextTask(tracker) {
  // Erste offene kritische in der aktuellen Phase, sonst erste offene Task der aktuellen Phase
  const currentPhId = kavCurrentPhase(tracker);
  if (currentPhId === 'abgeschlossen') return null;
  const ph = KAV_PHASES.find(p => p.id === currentPhId);
  if (!ph) return null;
  const openCrit = ph.tasks.find(t => t.critical && !(tracker.tasks || {})[t.id]);
  if (openCrit) return { ...openCrit, phaseLabel: ph.label, phaseNr: ph.nr };
  const open = ph.tasks.find(t => !(tracker.tasks || {})[t.id]);
  if (open) return { ...open, phaseLabel: ph.label, phaseNr: ph.nr };
  return null;
}

function kavWiedervorlageStatus(tracker) {
  const wv = tracker && tracker.wiedervorlage;
  if (!wv || !wv.datum) return { status: 'none' };
  const target = new Date(wv.datum);
  // QA-Fix 2026-05-23: bei kaputtem Datum-String (z.B. „demnächst") nicht crashen.
  if (isNaN(target.getTime())) return { status: 'none' };
  const now = new Date();
  target.setHours(0,0,0,0); now.setHours(0,0,0,0);
  const diffDays = Math.round((target - now) / (1000*60*60*24));
  if (diffDays < 0) return { status: 'overdue', tageUeber: -diffDays, datum: wv.datum, notiz: wv.notiz || '' };
  if (diffDays === 0) return { status: 'today', datum: wv.datum, notiz: wv.notiz || '' };
  if (diffDays <= 3) return { status: 'soon', tage: diffDays, datum: wv.datum, notiz: wv.notiz || '' };
  return { status: 'future', tage: diffDays, datum: wv.datum, notiz: wv.notiz || '' };
}

function getKavTracker(kunde) {
  if (!kunde) return { tasks: {}, wiedervorlage: null, freeNotes: '' };
  const parsed = parseKavTracker(kunde.notizen || '');
  return Object.assign({}, parsed.tracker, { freeNotes: parsed.freeNotes });
}

async function saveKavTracker(kundeId, freeNotes, tracker) {
  const notizen = stringifyKavTracker(freeNotes, tracker);
  await api.put('/api/kunden/' + kundeId, { notizen });
  if (state.kunde && state.kunde.id === kundeId) state.kunde.notizen = notizen;
  // Liste-Cache invalidieren — kunden ist arrayindiziert
  if (Array.isArray(state.kunden)) {
    const idx = state.kunden.findIndex(x => x.id === kundeId);
    if (idx >= 0) state.kunden[idx].notizen = notizen;
  }
}

// QA-Fix 2026-05-23 (Audit-Z-2, Lost-Update-Blocker): KAV-Saves serialisieren.
// Vorher konnte ein schneller 3-fach-Klick auf Aufgaben A/B/C alle 3 mit dem
// gleichen Snapshot starten, last-wins → A und B verloren. Jetzt: jeder Save
// wartet auf den vorigen, liest danach den frischen state.kunde.notizen und
// applied seine eigene Mutation NEU darauf. Funktioniert für Tasks UND
// Wiedervorlage und alle künftigen KAV-Operationen über kavQueueMutation().
//
// FS-1 (24.05.2026, Tech-Architekt BLOCKER B-1/B-4): Queue jetzt GEMEINSAM
// für alle Notizen-Mutationen (KAV + Wunsch-Profil + Notes + Activity).
// Damit verhindern wir Konflikte zwischen verschiedenen Schreibwegen, die
// vorher aneinander vorbei das gleiche Field überschreiben konnten.
let _kavSaveQueue = Promise.resolve();

/**
 * Generische Notizen-Mutation in derselben Queue wie kavQueueMutation.
 * applyFn: (oldNotizen: string) => newNotizen: string
 * opts: { successToast, errorPrefix }
 */
function notizenQueueMutation(applyFn, opts) {
  const kundeId = state.kunde && state.kunde.id;
  if (!kundeId) return Promise.resolve();
  const _opts = opts || {};
  // FS-2f-Bug (24.05.2026 Edgar 14:30): Wunsch-Profil-Buttons bei
  // anderen Kunden tot — Ursache: Queue blieb in rejected-State
  // hängen nach erstem Fehler → alle nachfolgenden Saves silent abgebrochen.
  // Fix: dem then() ein .catch() anhängen, das die Queue als resolved fortführt.
  // Errors werden weiterhin im Inner-try/catch behandelt + dem Caller geworfen.
  const nextStep = _kavSaveQueue.then(async () => {
    if (!state.kunde || state.kunde.id !== kundeId) return;
    const oldNotizen = state.kunde.notizen || '';
    let newNotizen;
    try { newNotizen = applyFn(oldNotizen); }
    catch (e) {
      console.warn('[notizenQueue applyFn]', e && e.message);
      return;
    }
    if (typeof newNotizen !== 'string' || newNotizen === oldNotizen) return;
    const prev = state.kunde.notizen;
    state.kunde.notizen = newNotizen;
    if (Array.isArray(state.kunden)) {
      const idx = state.kunden.findIndex(x => x.id === kundeId);
      if (idx >= 0) state.kunden[idx].notizen = newNotizen;
    }
    try {
      await api.put('/api/kunden/' + kundeId, { notizen: newNotizen });
      if (_opts.successToast) toast(_opts.successToast, _opts.successType || 'success');
    } catch (e) {
      state.kunde.notizen = prev;
      if (Array.isArray(state.kunden)) {
        const idx = state.kunden.findIndex(x => x.id === kundeId);
        if (idx >= 0) state.kunden[idx].notizen = prev;
      }
      toast((_opts.errorPrefix || 'Fehler beim Speichern: ') + (e.message || ''), 'error');
    }
  });
  // Queue NIE rejecten lassen — sonst sind alle Folge-Mutations tot
  _kavSaveQueue = nextStep.catch(e => {
    console.warn('[notizenQueue tail-catch]', e && e.message);
  });
  return nextStep;
}
window.notizenQueueMutation = notizenQueueMutation;
function kavQueueMutation(applyMutation, opts) {
  // applyMutation: (tracker) → void. Wird mit dem FRISCHEN Tracker aufgerufen.
  // opts: { successToast: 'msg', successType: 'success'|'info', errorPrefix: 'Fehler: ' }
  const kundeId = state.kunde && state.kunde.id;
  if (!kundeId) return Promise.resolve();
  const _opts = opts || {};
  const nextStep = _kavSaveQueue.then(async () => {
    if (!state.kunde || state.kunde.id !== kundeId) return;
    const tracker = getKavTracker(state.kunde);
    if (!tracker.tasks) tracker.tasks = {};
    const freeNotes = tracker.freeNotes || '';
    delete tracker.freeNotes;
    try {
      applyMutation(tracker);
      await saveKavTracker(kundeId, freeNotes, tracker);
      if (_opts.successToast) toast(_opts.successToast, _opts.successType || 'success');
      // FS-2k (Edgar 24.05.2026 19:30): Nur Tab-Content re-rendern, nicht
      // den ganzen Kunde-Layout. Spart Header/Tabs-Re-Mount + behält Input-Focus.
      if (state.kunde && state.kunde.id === kundeId) {
        if (state.tab === 'uebersicht') renderTabUebersicht();
        else renderKunde();
      }
    } catch (e) {
      toast((_opts.errorPrefix || 'Fehler: ') + (e && e.message ? e.message : 'unbekannt'), 'error');
      if (state.kunde && state.kunde.id === kundeId) {
        if (state.tab === 'uebersicht') renderTabUebersicht();
        else renderKunde();
      }
    }
  });
  // FS-2f (24.05.2026 Edgar 14:30): Queue-Tail-Catch — sonst hängt die Queue
  // nach erstem Fehler und alle nachfolgenden KAV-Toggles sind tot.
  _kavSaveQueue = nextStep.catch(e => {
    console.warn('[kavQueue tail-catch]', e && e.message);
  });
  return nextStep;
}

async function kavToggleTask(taskId) {
  if (!state.kunde) return;
  // Optimistisches Feedback berechnen BEVOR die Queue läuft — sonst sieht
  // der User bei 3-fach-Klick gar keine Reaktion.
  const peekTracker = getKavTracker(state.kunde);
  const wasDone = !!(peekTracker.tasks || {})[taskId];
  kavQueueMutation((tracker) => {
    tracker.tasks[taskId] = wasDone ? null : new Date().toISOString().split('T')[0];
  }, {
    successToast: wasDone ? 'Aufgabe wieder offen' : '✓ Aufgabe erledigt',
    successType: wasDone ? 'info' : 'success',
    errorPrefix: 'Fehler beim Speichern: '
  });
}
window.kavToggleTask = kavToggleTask;

async function kavSetWiedervorlage() {
  if (!state.kunde) return;
  const tracker = getKavTracker(state.kunde);
  const aktuell = tracker.wiedervorlage || {};
  const datum = await openWiedervorlageModal(aktuell.datum || '', aktuell.notiz || '');
  if (datum === null) return; // Cancel
  kavQueueMutation((t) => {
    t.wiedervorlage = datum.datum ? { datum: datum.datum, notiz: datum.notiz || '' } : null;
  }, {
    successToast: datum.datum ? 'Wiedervorlage gesetzt' : 'Wiedervorlage gelöscht',
    successType: 'success'
  });
}
window.kavSetWiedervorlage = kavSetWiedervorlage;

function openWiedervorlageModal(curDatum, curNotiz) {
  return new Promise((resolve) => {
    const existing = document.getElementById('bbk-wv-modal');
    if (existing) existing.remove();
    const ov = document.createElement('div');
    ov.id = 'bbk-wv-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(26,26,23,0.5);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px;font-family:inherit;';
    ov.innerHTML = `
      <div style="background:#FBFAF7;border-radius:14px;max-width:480px;width:100%;padding:28px 32px;box-shadow:0 30px 80px rgba(0,0,0,0.25);border:1px solid #C9A572;">
        <div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8E6E3D;font-weight:600;margin-bottom:8px;">Wiedervorlage</div>
        <h3 style="font-size:20px;font-weight:300;letter-spacing:-.01em;margin:0 0 16px 0;color:#1A1A17;">Wann willst Du diesen Kunden wieder vornehmen?</h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <input type="date" id="bbk-wv-datum" value="${esc(curDatum || '')}" style="padding:10px 12px;font-size:14px;border:1px solid #C9A572;border-radius:4px;background:#fff;font-family:inherit;box-sizing:border-box;">
          <textarea id="bbk-wv-notiz" placeholder="Notiz (optional): z.B. 'Henry ruft an, Bank-Termin klären'" rows="3" style="padding:10px 12px;font-size:14px;border:1px solid var(--border);border-radius:4px;background:#fff;font-family:inherit;box-sizing:border-box;resize:vertical;">${esc(curNotiz || '')}</textarea>
          <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--text-tertiary);">
            <span>Schnellwahl:</span>
            <a href="#" data-days="1" class="bbk-wv-quick" style="color:var(--accent-dark);text-decoration:none;">morgen</a>
            <a href="#" data-days="3" class="bbk-wv-quick" style="color:var(--accent-dark);text-decoration:none;">+3 Tage</a>
            <a href="#" data-days="7" class="bbk-wv-quick" style="color:var(--accent-dark);text-decoration:none;">+1 Woche</a>
            <a href="#" data-days="14" class="bbk-wv-quick" style="color:var(--accent-dark);text-decoration:none;">+2 Wochen</a>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:22px;">
          ${curDatum ? `<button type="button" id="bbk-wv-clear" style="background:transparent;border:1px solid rgba(154,62,51,0.35);color:var(--negative);font-family:inherit;font-size:12px;padding:7px 14px;border-radius:18px;cursor:pointer;">Wiedervorlage löschen</button>` : '<span></span>'}
          <div style="display:flex;gap:10px;">
            <button type="button" id="bbk-wv-cancel" style="background:transparent;border:1px solid #E8E6DD;color:#1A1A17;font-family:inherit;font-size:13px;padding:9px 18px;border-radius:18px;cursor:pointer;">Abbrechen</button>
            <button type="button" id="bbk-wv-ok" style="background:#8E6E3D;color:#fff;border:none;font-family:inherit;font-size:13px;padding:9px 20px;border-radius:18px;cursor:pointer;font-weight:500;">Speichern</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
    const datumInput = ov.querySelector('#bbk-wv-datum');
    const notizInput = ov.querySelector('#bbk-wv-notiz');
    datumInput.focus();
    function close(val) {
      ov.remove();
      document.removeEventListener('keydown', keyHandler);
      resolve(val);
    }
    function keyHandler(e) {
      if (e.key === 'Escape') close(null);
    }
    ov.querySelectorAll('.bbk-wv-quick').forEach(a => {
      a.onclick = (e) => {
        e.preventDefault();
        const d = new Date();
        d.setDate(d.getDate() + parseInt(a.dataset.days, 10));
        datumInput.value = d.toISOString().split('T')[0];
      };
    });
    ov.querySelector('#bbk-wv-cancel').onclick = () => close(null);
    ov.querySelector('#bbk-wv-ok').onclick = () => close({ datum: datumInput.value || '', notiz: notizInput.value || '' });
    const clearBtn = ov.querySelector('#bbk-wv-clear');
    if (clearBtn) clearBtn.onclick = () => close({ datum: '', notiz: '' });
    ov.onclick = (e) => { if (e.target === ov) close(null); };
    document.addEventListener('keydown', keyHandler);
  });
}
window.openWiedervorlageModal = openWiedervorlageModal;

// ===== RENDER FUNCTIONS =====

function renderKavCockpit(k) {
  const tracker = getKavTracker(k);
  const currentPhId = kavCurrentPhase(tracker);
  const allDone = currentPhId === 'abgeschlossen';
  const nextTask = kavNextTask(tracker);
  const wvStatus = kavWiedervorlageStatus(tracker);

  // Stepper
  const steps = KAV_PHASES.map(ph => {
    const counts = kavTaskCount(tracker, ph.id);
    const isCurrent = ph.id === currentPhId;
    const critTasks = ph.tasks.filter(t => t.critical);
    const allCritDone = critTasks.length > 0 && critTasks.every(t => !!(tracker.tasks || {})[t.id]);
    const cls = allCritDone ? 'done' : (isCurrent ? 'current' : 'pending');
    return `
      <div class="kav-step kav-step-${cls}" style="--kav-accent:${ph.accent};">
        <div class="kav-step-num">${ph.nr}</div>
        <div class="kav-step-body">
          <div class="kav-step-label">${esc(ph.label)}</div>
          <div class="kav-step-sub">${esc(ph.sub)} · ${counts.done}/${counts.total}</div>
        </div>
      </div>
    `;
  }).join('<div class="kav-step-arrow">›</div>');

  // Wiedervorlage-Badge
  let wvBadge = '';
  if (wvStatus.status === 'overdue') {
    wvBadge = `<button class="kav-wv-badge overdue" onclick="kavSetWiedervorlage()" title="Wiedervorlage überfällig — klick zum Anpassen">⚠ ${wvStatus.tageUeber}d überfällig</button>`;
  } else if (wvStatus.status === 'today') {
    wvBadge = `<button class="kav-wv-badge today" onclick="kavSetWiedervorlage()">🔔 heute fällig</button>`;
  } else if (wvStatus.status === 'soon') {
    wvBadge = `<button class="kav-wv-badge soon" onclick="kavSetWiedervorlage()">🔔 in ${wvStatus.tage}d</button>`;
  } else if (wvStatus.status === 'future') {
    wvBadge = `<button class="kav-wv-badge future" onclick="kavSetWiedervorlage()">🔔 ${fmtDate(wvStatus.datum)}</button>`;
  } else {
    wvBadge = `<button class="kav-wv-badge none" onclick="kavSetWiedervorlage()">+ Wiedervorlage</button>`;
  }

  // Next-Action-Hint
  // FS-2f (24.05.2026 Edgar 14:30): „Nächste Aufgabe"-Block raus — nimmt
  // zu viel Platz oben weg. Wenn alle Pflicht-Aufgaben erledigt, nur dezenter
  // Badge. Sonst nichts (nextTask sieht der User in den Phasen-Cards).
  const nextHint = allDone
    ? '<div class="kav-next-action done">🎉 Alle Pflicht-Aufgaben erledigt</div>'
    : '';

  // Aufgaben-Liste der aktuellen Phase (collapsed andere)
  const allPhasesHtml = KAV_PHASES.map(ph => {
    const isCurrent = ph.id === currentPhId;
    const counts = kavTaskCount(tracker, ph.id);
    const items = ph.tasks.map(t => {
      const done = !!(tracker.tasks || {})[t.id];
      // QA-Fix 2026-05-23 (Audit-X12): fmtDate fängt "Invalid Date" sauber ab → '—'.
      const dateStr = done ? (tracker.tasks[t.id] && tracker.tasks[t.id] !== true ? fmtDate(tracker.tasks[t.id]) : '') : '';
      return `
        <label class="kav-task ${done ? 'done' : ''} ${t.critical ? 'critical' : ''}">
          <input type="checkbox" ${done ? 'checked' : ''} onchange="kavToggleTask('${t.id}')" />
          <span class="kav-task-label">${esc(t.label)}${t.critical ? ' <span class="kav-pflicht">Pflicht</span>' : ''}</span>
          <span class="kav-task-hint">${esc(t.hint || '')}${dateStr ? ' · ' + dateStr : ''}</span>
        </label>
      `;
    }).join('');
    // FS-1 (24.05.2026, Vertriebler A1): open-State pro Phase aus DOM lesen
    // damit Re-Render nach kavToggleTask die User-Auswahl preserved. Wenn
    // User in P2 mehrere Tasks abhakt, bleibt P2 offen statt nach jedem
    // Klick zuzugehen.
    const prevPhaseDetails = document.querySelector(`details.kav-phase-${ph.id}`);
    const wasOpen = prevPhaseDetails && prevPhaseDetails.hasAttribute('open');
    const openAttr = (wasOpen || isCurrent) ? 'open' : '';
    return `
      <details class="kav-phase-card kav-phase-${ph.id} ${isCurrent ? 'is-current' : ''}" style="--kav-accent:${ph.accent};" ${openAttr}>
        <summary>
          <span class="kav-phase-num">${ph.nr}</span>
          <span class="kav-phase-name">${esc(ph.label)}</span>
          <span class="kav-phase-counts">${counts.done}/${counts.total}</span>
        </summary>
        <div class="kav-tasks">${items}</div>
      </details>
    `;
  }).join('');

  // Edgar 24.05.2026: Cockpit nicht mehr sticky (Screen-Sharing).
  // Detail-Phasen-Cards (mit Tasks-Checkboxen) standardmäßig zugeklappt, Toggle-Button.
  // FS-1 (24.05.2026): open-State des Details-Wrappers über Re-Renders preservieren.
  const prevPhasesDetails = document.getElementById('kav-phases-details');
  const phasesWasOpen = prevPhasesDetails && prevPhasesDetails.hasAttribute('open');
  return `
    <section class="kav-cockpit">
      <div class="kav-cockpit-head">
        <div class="kav-stepper">${steps}</div>
        <div class="kav-cockpit-meta">${wvBadge}</div>
      </div>
      ${nextHint}
      <details class="kav-phases-details" id="kav-phases-details" ${phasesWasOpen ? 'open' : ''}>
        <summary class="kav-phases-toggle">
          <span class="kav-phases-toggle-label">Aufgaben &amp; Checklisten</span>
          <span class="kav-phases-toggle-hint">— Klick zum Aufklappen</span>
        </summary>
        <div class="kav-phases-grid">${allPhasesHtml}</div>
      </details>
    </section>
  `;
}
window.renderKavCockpit = renderKavCockpit;

// Liste-Kunde: kompakte Phase + Wiedervorlage-Anzeige
function kavListeBadges(kunde) {
  const tracker = getKavTracker(kunde);
  const currentPhId = kavCurrentPhase(tracker);
  const ph = KAV_PHASES.find(p => p.id === currentPhId);
  const wv = kavWiedervorlageStatus(tracker);
  const counts = ph ? kavTaskCount(tracker, ph.id) : { done: 0, total: 0 };
  // QA-Fix 2026-05-23 (Edgar): Phase-spezifische CSS-Klasse für klare visuelle
  // Unterscheidung P1/P2/P3.
  const phaseChip = ph
    ? `<span class="kav-mini-phase kav-phase-p${ph.nr}" style="--kav-accent:${ph.accent};">P${ph.nr} · ${esc(ph.label)} <span class="kav-mini-counts">${counts.done}/${counts.total}</span></span>`
    : `<span class="kav-mini-phase kav-mini-done">✓ Abgeschlossen</span>`;
  let wvChip = '';
  if (wv.status === 'overdue') wvChip = `<span class="kav-mini-wv overdue" title="Wiedervorlage überfällig">⚠ ${wv.tageUeber}d</span>`;
  else if (wv.status === 'today') wvChip = `<span class="kav-mini-wv today" title="heute fällig">🔔 heute</span>`;
  else if (wv.status === 'soon') wvChip = `<span class="kav-mini-wv soon">🔔 ${wv.tage}d</span>`;
  return phaseChip + wvChip;
}
window.kavListeBadges = kavListeBadges;
