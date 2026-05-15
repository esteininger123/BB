/* app.js — SPA-Hauptlogik, hash-basiertes Routing.
   State + Render-Funktionen für: Login, Dashboard, Kunde-Detail (4 Tabs), Admin.
   Setzt globales window.__onGoogleAuth für Google-Sign-In. */

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

const PHASEN = ['Lead','Kalkulation läuft','Reservierung','Selbstauskunft','Bank-Einreichung','Notar-Termin','Beurkundet','Abgebrochen'];

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
  if (type === 'error') el.style.background = 'var(--negative)';
  if (type === 'success') el.style.background = 'var(--positive)';
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
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
  try { return new Date(d).toLocaleDateString('de-DE'); } catch(e) { return d; }
}

/* ============================== HEADER ============================== */

function renderHeader() {
  const h = document.getElementById('app-header');
  if (!state.user) { h.classList.add('hidden'); return; }
  h.classList.remove('hidden');
  const um = document.getElementById('user-menu');
  const isAdmin = state.user.rolle === 'Admin';
  um.innerHTML = `
    <a href="#/dashboard" style="font-size:14px;color:var(--text-secondary);">Dashboard</a>
    ${isAdmin ? '<a href="#/admin" style="font-size:14px;color:var(--text-secondary);">Admin</a>' : ''}
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
        <div class="brand">B&amp;B <span class="accent">Kalkulator</span></div>
        <div class="tagline">Kapitalanlage-Kalkulator für Vertriebler</div>

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

/* ============================== DATA LOADING ============================== */

async function loadInitialData() {
  state.loadingData = true;
  try {
    const [kunden, wes] = await Promise.all([
      api.get('/api/kunden').catch(() => []),
      api.get('/api/wohneinheiten').catch(() => []),
    ]);
    state.kunden = Array.isArray(kunden) ? kunden : [];
    state.wohneinheiten = Array.isArray(wes) ? wes : [];
  } finally {
    state.loadingData = false;
  }
}

async function loadKunde(id) {
  try {
    const k = await api.get('/api/kunden/' + id);
    state.kunde = k;
    state.snapshots = await api.get('/api/snapshots?kundeId=' + id).catch(() => []);
    // Kalk-State aus selbstauskunft-JSON oder Default
    state.kalk = makeDefaultKalkInput();
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

/* ============================== DASHBOARD ============================== */

function renderDashboard() {
  const app = document.getElementById('app');
  const meine = state.kunden;

  // Stats per Phase
  const counts = {};
  PHASEN.forEach(p => counts[p] = 0);
  meine.forEach(k => { if (counts[k.phase] !== undefined) counts[k.phase]++; });

  app.innerHTML = `
    <div class="main">
      <div class="toolbar">
        <div>
          <h1 class="page-title">Hallo ${esc(state.user.name.split(' ')[0])}</h1>
          <p class="page-subtitle">${meine.length} Kunden in Bearbeitung</p>
        </div>
        <button onclick="createNewKunde()">+ Neuer Kunde</button>
      </div>

      <div class="kpi-grid">
        ${['Lead','Kalkulation läuft','Reservierung','Notar-Termin','Beurkundet'].map(p => `
          <div class="kpi">
            <div class="label">${esc(p)}</div>
            <div class="value">${counts[p] || 0}</div>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <div class="card-title">Meine Kunden</div>
        ${meine.length === 0 ? `
          <div class="empty-state">
            Noch keine Kunden. Klick auf <strong>"+ Neuer Kunde"</strong>.
          </div>
        ` : `
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phase</th>
                <th>E-Mail</th>
                <th>Letzte Aktivität</th>
              </tr>
            </thead>
            <tbody>
              ${meine.map(k => `
                <tr onclick="go('/kunde/${esc(k.id)}')">
                  <td><strong>${esc(k.name || (k.vorname + ' ' + k.nachname) || '—')}</strong></td>
                  <td><span class="badge ${phaseBadgeClass(k.phase)}">${esc(k.phase || 'Lead')}</span></td>
                  <td class="text-tertiary">${esc(k.email || '—')}</td>
                  <td class="text-tertiary">${esc(fmtDate(k.lastActivity))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `;
}

async function createNewKunde() {
  const vorname = prompt('Vorname?');
  if (!vorname) return;
  const nachname = prompt('Nachname?');
  if (!nachname) return;
  const email = prompt('E-Mail (optional)?') || '';
  try {
    const k = await api.post('/api/kunden', {
      vorname, nachname, email, phase: 'Lead'
    });
    state.kunden.push(k);
    toast('Kunde angelegt', 'success');
    go('/kunde/' + k.id);
  } catch (e) {
    toast('Fehler: ' + e.message, 'error');
  }
}
window.createNewKunde = createNewKunde;
window.go = go;

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

  app.innerHTML = `
    <div class="main">
      <div class="breadcrumb"><a href="#/dashboard">Dashboard</a> &rsaquo; ${esc(displayName)}</div>

      <div class="toolbar">
        <div>
          <h1 class="page-title">${esc(displayName)}</h1>
          <div class="flex gap-12 mt-8">
            <select id="phase-select" style="max-width:220px">
              ${PHASEN.map(p => `<option value="${esc(p)}" ${p === k.phase ? 'selected' : ''}>${esc(p)}</option>`).join('')}
            </select>
            <span class="badge ${phaseBadgeClass(k.phase)}">${esc(k.phase || 'Lead')}</span>
          </div>
        </div>
        ${isOwner ? `<button class="danger" onclick="deleteKunde()">Löschen</button>` : ''}
      </div>

      <div class="tabs">
        ${['uebersicht','kalkulator','selbstauskunft','snapshots'].map(t => `
          <button class="tab ${state.tab === t ? 'active' : ''}"
                  onclick="setTab('${t}')">
            ${t === 'uebersicht' ? 'Übersicht' :
              t === 'kalkulator' ? 'Kalkulator' :
              t === 'selbstauskunft' ? 'Selbstauskunft' : 'Snapshots'}
          </button>
        `).join('')}
      </div>

      <div id="tab-content"></div>
    </div>
  `;

  // Phase-Change-Handler
  document.getElementById('phase-select').onchange = async (e) => {
    const newPhase = e.target.value;
    try {
      await api.put('/api/kunden/' + k.id, { phase: newPhase });
      k.phase = newPhase;
      toast('Phase: ' + newPhase, 'success');
      renderKunde();
    } catch (err) { toast('Fehler: ' + err.message, 'error'); }
  };

  renderTab();
}

function setTab(t) {
  state.tab = t;
  history.replaceState(null, '', '#/kunde/' + state.kundeId + '/' + t);
  renderKunde();
}
window.setTab = setTab;

async function deleteKunde() {
  if (!confirm('Kunde wirklich löschen?')) return;
  try {
    await api.delete('/api/kunden/' + state.kundeId);
    state.kunden = state.kunden.filter(x => x.id !== state.kundeId);
    state.kunde = null;
    toast('Kunde gelöscht', 'success');
    go('/dashboard');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}
window.deleteKunde = deleteKunde;

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

function renderTabUebersicht() {
  const el = document.getElementById('tab-content');
  const k = state.kunde;
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Stammdaten</div>
      <div class="grid-2">
        <div>
          <label>Vorname</label>
          <input id="f-vorname" value="${esc(k.vorname || '')}">
        </div>
        <div>
          <label>Nachname</label>
          <input id="f-nachname" value="${esc(k.nachname || '')}">
        </div>
        <div>
          <label>E-Mail</label>
          <input id="f-email" type="email" value="${esc(k.email || '')}">
        </div>
        <div>
          <label>Telefon</label>
          <input id="f-telefon" value="${esc(k.telefon || '')}">
        </div>
        <div>
          <label>Geburtsdatum</label>
          <input id="f-geburtsdatum" type="date" value="${esc(k.geburtsdatum || '')}">
        </div>
      </div>
      <div class="mt-16">
        <button onclick="saveStammdaten()">Speichern</button>
      </div>
    </div>

    <div class="card mt-16">
      <div class="card-title">Notizen</div>
      <textarea id="f-notizen" onblur="saveNotizen()" placeholder="Frei-Notizen, Gesprächs-Stichpunkte ...">${esc(k.notizen || '')}</textarea>
      <div class="text-tertiary text-small mt-8">Auto-Save bei Klick außerhalb.</div>
    </div>
  `;
}

async function saveStammdaten() {
  const body = {
    vorname: document.getElementById('f-vorname').value,
    nachname: document.getElementById('f-nachname').value,
    email: document.getElementById('f-email').value,
    telefon: document.getElementById('f-telefon').value,
    geburtsdatum: document.getElementById('f-geburtsdatum').value,
  };
  try {
    await api.put('/api/kunden/' + state.kundeId, body);
    Object.assign(state.kunde, body);
    toast('Stammdaten gespeichert', 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}
window.saveStammdaten = saveStammdaten;

async function saveNotizen() {
  const notizen = document.getElementById('f-notizen').value;
  if (notizen === state.kunde.notizen) return;
  try {
    await api.put('/api/kunden/' + state.kundeId, { notizen });
    state.kunde.notizen = notizen;
    toast('Notizen gespeichert');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}
window.saveNotizen = saveNotizen;

/* ============================== KALKULATOR-TAB ============================== */

function renderTabKalkulator() {
  const el = document.getElementById('tab-content');
  const wes = state.wohneinheiten;
  const i = state.kalk || makeDefaultKalkInput();
  state.kalk = i;
  if (!Array.isArray(state.kalk._paketWeIds)) state.kalk._paketWeIds = [];
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

  el.innerHTML = `
    <div class="card">
      <div class="card-title">Wohneinheit</div>
      <div class="flex gap-12 mb-12" style="align-items:center;">
        <label style="text-transform:none;letter-spacing:0;display:flex;align-items:center;gap:6px;">
          <input type="radio" name="we-mode" value="single" ${!isPaket ? 'checked' : ''} onclick="setWeMode('single')"> Einzel-WE
        </label>
        <label style="text-transform:none;letter-spacing:0;display:flex;align-items:center;gap:6px;">
          <input type="radio" name="we-mode" value="paket" ${isPaket ? 'checked' : ''} onclick="setWeMode('paket')"> Paket (mehrere)
        </label>
      </div>
      <div class="grid-2">
        <div>
          ${isPaket ? `
            <label>Wohneinheiten im Paket</label>
            <select id="we-paket-select" multiple size="8" style="height:auto;">
              ${Object.keys(wesByProjekt).sort().map(proj => `
                <optgroup label="${esc(proj)}">
                  ${wesByProjekt[proj].map(w => `
                    <option value="${esc(w.id)}" ${state.kalk._paketWeIds.includes(w.id) ? 'selected' : ''}>${esc(weLabel(w))}</option>
                  `).join('')}
                </optgroup>
              `).join('')}
            </select>
            <div class="text-tertiary text-small mt-4">Ctrl/Cmd + Klick für mehrere. Aktuell: ${state.kalk._paketWeIds.length} WE${state.kalk._paketWeIds.length === 1 ? '' : 's'}.</div>
          ` : `
            <label>Wohneinheit aus Airtable (${wes.length} verfügbar)</label>
            <select id="we-select">
              <option value="">— Eigene Eingabe / Default —</option>
              ${Object.keys(wesByProjekt).sort().map(proj => `
                <optgroup label="${esc(proj)}">
                  ${wesByProjekt[proj].map(w => `
                    <option value="${esc(w.id)}" ${i._weId === w.id ? 'selected' : ''}>${esc(weLabel(w))}</option>
                  `).join('')}
                </optgroup>
              `).join('')}
            </select>
            ${i._weLage ? `<div class="text-tertiary text-small mt-4">Aktiv: ${esc(i._weLage)}</div>` : ''}
          `}
        </div>
        <div>
          <label>Bonitäts-Quelle</label>
          <select id="bon-modus-select">
            <option value="quick" ${(!i.bonModus || i.bonModus === 'quick') ? 'selected' : ''}>Quick (manuelle Eingabe)</option>
            <option value="detail" ${i.bonModus === 'detail' ? 'selected' : ''}>Detail (aus Selbstauskunft)</option>
          </select>
          <div class="text-tertiary text-small mt-4">Quick = du gibst Einkommen/Ausgaben/Vermögen direkt ein. Detail = aus dem Selbstauskunft-Tab.</div>
          <div class="mt-12">
            <button class="secondary" onclick="resetKalk()">Auf Default zurücksetzen</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card mt-16">
      <div class="card-title">${isPaket ? 'Persönliche Eingaben (für das Paket)' : 'Eingaben'}</div>
      <div class="kalk-section-grid">
        ${isPaket ? kalkInputsPaketHtml(i) : kalkInputsThemenHtml(i)}
      </div>
    </div>

    <div class="kpi-grid mt-16" id="kpi-grid"></div>

    <div class="card mt-16" id="bon-card">
      <!-- Bonitäts-Anzeige (wird in recalcAndRender gefüllt) -->
    </div>

    <div class="grid-2 mt-16">
      <div class="card">
        <div class="card-title">Vermögensaufbau netto (10 J)</div>
        <div class="text-tertiary text-small">Wert minus Restschuld minus eingesetztes EK plus kumulierter Cashflow.</div>
        <div class="chart-container"><canvas id="chart-vermoegen"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Cashflow (30 J)</div>
        <div class="text-tertiary text-small">Jahres-Cashflow nach Steuern. Negative Jahre = Eigenleistung.</div>
        <div class="chart-container"><canvas id="chart-cashflow"></canvas></div>
      </div>
    </div>
    <div class="card mt-16">
      <div class="card-title">Sparen vs. Investieren (10 J)</div>
      <div class="text-tertiary text-small">Nur sparen mit Tagesgeldzins vs. Immobilien-Investment inkl. CF.</div>
      <div class="chart-container"><canvas id="chart-sparen"></canvas></div>
    </div>

    <!-- Story-Sektionen (Vertriebs-Erzählung) -->
    <div class="stories mt-16" id="story-container"></div>

    <div class="toolbar mt-16">
      <button onclick="saveSnapshot()">Snapshot speichern</button>
      <button class="secondary" onclick="exportInvestPdf()">PDF Investitionsrechnung</button>
      <button class="secondary" onclick="exportReservPdf()">PDF Reservierung</button>
    </div>
  `;

  // Listeners
  const weSel = document.getElementById('we-select');
  if (weSel) weSel.onchange = (e) => loadWeIntoKalk(e.target.value);
  const wePaketSel = document.getElementById('we-paket-select');
  if (wePaketSel) wePaketSel.onchange = (e) => {
    state.kalk._paketWeIds = Array.from(e.target.selectedOptions).map(o => o.value);
    recalcAndRender();
  };
  const bonSel = document.getElementById('bon-modus-select');
  if (bonSel) bonSel.onchange = (e) => {
    state.kalk.bonModus = e.target.value;
    renderTabKalkulator();
  };
  bindKalkInputs();
  recalcAndRender();
}

function setWeMode(mode) {
  state.kalk._isPaket = (mode === 'paket');
  renderTabKalkulator();
}
window.setWeMode = setWeMode;

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
  return `
    <details class="kalk-section" open>
      <summary>Finanzierung</summary>
      <div class="grid-1">
        ${slider('Zinssatz', 'zins', 2, 8, 0.05)}
        ${slider('Anfängliche Tilgung', 'tilgung', 0.5, 5, 0.25)}
        ${select('Kaufnebenkosten mitfinanziert?', 'knkMitfinanziert', [
          {v:'false', l:'Nein'}, {v:'true', l:'Ja'}
        ])}
      </div>
    </details>
    <details class="kalk-section" open>
      <summary>Steuer</summary>
      <div class="grid-1">
        ${slider('Persönlicher Steuersatz', 'steuersatz', 25, 50, 1)}
      </div>
    </details>
    ${isQuick ? `
    <details class="kalk-section" open>
      <summary>Bonität (Quick)</summary>
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
        <p class="text-tertiary text-small">Im Paket-Modus werden die Objekt-Werte (Kaufpreis, qm, Miete, Hausgeld, AfA, Subvention etc.) automatisch pro WE aus den gepflegten Vorlagen gezogen. Hier oben nur die <strong>persönlichen Settings</strong> einstellen.</p>
      </div>
    </details>
  `;
}

function kalkInputsThemenHtml(i) {
  // Plain Number-Input
  const num = (label, key, suffix, step) => `
    <div>
      <label>${esc(label)}${suffix ? ' (' + suffix + ')' : ''}</label>
      <input data-kalk="${key}" type="number" step="${step || 'any'}" value="${i[key] === undefined || i[key] === null ? '' : i[key]}">
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

  return `
    <details class="kalk-section" open>
      <summary>1 · Stammdaten</summary>
      <div class="grid-1">
        ${sliderEur('Kaufpreis Wohnung', 'kaufpreis', 30000, 500000, 500)}
        ${sliderEur('Stellplatz / Garage KP', 'stellplatzKp', 0, 30000, 500)}
        ${sliderEur('Quadratmeter', 'qm', 20, 200, 0.5, 'm²')}
        ${sliderEur('Marktwert €/qm (optional, 0 = aus)', 'marktwertProQm', 0, 8000, 50, '€/qm')}
        ${slider('Inflation / Wertsteigerung p.a.', 'wertsteigerung', 0, 6, 0.25)}
      </div>
    </details>

    <details class="kalk-section" open>
      <summary>2 · Miete</summary>
      <div class="grid-1">
        ${sliderEur('Aktuelle Kaltmiete', 'kaltmiete', 200, 2000, 10, '€/Mo')}
        ${sliderEur('Stellplatz-Miete', 'stellplatzMiete', 0, 200, 5, '€/Mo')}
        ${sliderEur('Mietsubvention', 'subventionMo', 0, 300, 10, '€/Mo')}
        ${sliderEur('Subventions-Laufzeit', 'subventionMonate', 0, 60, 1, 'Monate')}
        ${select('Mietsteigerungs-Modus', 'mietsteigerungsModus', [
          {v:'sprung', l:'Vergleichsmiete-Sprünge 3J'},
          {v:'index', l:'Indexmiete jährlich'},
          {v:'keine', l:'Keine'}
        ])}
        ${slider('Steigerung pro Sprung / Jahr', 'steigerungProz', 0, 25, 0.5)}
        ${sliderEur('Monate seit letzter Mieterhöhung', 'monateSeitMieterhoehung', 0, 36, 1, 'Monate')}
      </div>
    </details>

    <details class="kalk-section" open>
      <summary>3 · Hausgeld &amp; Verwaltung</summary>
      <div class="grid-1">
        ${sliderEur('Hausgeld inkl. Rücklage', 'hausgeld', 0, 500, 5, '€/Mo')}
        ${slider('Hausgeld-Inflation p.a.', 'hgInflation', 0, 5, 0.25)}
        ${sliderEur('Mietverwaltung (SEV)', 'mietverwaltung', 0, 100, 5, '€/Mo')}
        ${sliderEur('Hausverwaltung (WEG)', 'hausverwaltung', 0, 100, 1, '€/Mo')}
      </div>
    </details>

    <details class="kalk-section" open>
      <summary>4 · Steuern &amp; AfA</summary>
      <div class="grid-1">
        ${slider('Gebäude-Anteil', 'gebaeudeAnteil', 60, 95, 1)}
        ${slider('AfA-Satz (frei wählbar)', 'afaSatz', 1, 6, 0.05)}
      </div>
    </details>

    <div class="input-group-divider">
      <div class="input-group-label">Personenbezogene Eingaben</div>
    </div>

    <details class="kalk-section" open>
      <summary>6 · Finanzierung</summary>
      <div class="grid-1">
        ${slider('Zinssatz', 'zins', 2, 8, 0.05)}
        ${slider('Anfängliche Tilgung', 'tilgung', 0.5, 5, 0.25)}
        ${select('Kaufnebenkosten mitfinanziert?', 'knkMitfinanziert', [
          {v:'false', l:'Nein'}, {v:'true', l:'Ja'}
        ])}
      </div>
    </details>

    ${isQuick ? `
    <details class="kalk-section" open>
      <summary>7 · Persönliche Bonität (Quick)</summary>
      <div class="text-tertiary text-small mb-12">Direkt eingeben. Für Banken: Selbstauskunft-Tab + Bonität auf "Detail".</div>
      <div class="grid-1">
        ${sliderEur('Monatliche Einnahmen', 'bonEinnahmen', 1500, 20000, 100, '€/Mo')}
        ${sliderEur('Monatliche Ausgaben', 'bonAusgaben', 800, 10000, 50, '€/Mo')}
        ${sliderEur('Verfügbares Eigenkapital (ohne Immobilien)', 'bonVermoegen', 0, 500000, 1000)}
        ${slider('Persönlicher Steuersatz', 'steuersatz', 25, 50, 1)}
      </div>
    </details>
    ` : ''}
  `;
}

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
      if (v === 'true') v = true;
      if (v === 'false') v = false;
      // NaN → null (für leere Number-Felder)
      if (typeof v === 'number' && !isFinite(v)) v = null;
      state.kalk[k] = v;
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

function loadWeIntoKalk(weId) {
  if (!weId) {
    delete state.kalk._weId;
    delete state.kalk._weLage;
    delete state.kalk._weNr;
    delete state.kalk._projektName;
    renderTabKalkulator();
    return;
  }
  const w = state.wohneinheiten.find(x => x.id === weId);
  if (!w) return;

  // 1) Default-Werte aus we-presets.js (pro Record-ID gepflegt aus Excel + Standards)
  //    Diese Werte sind die VERBINDLICHE Quelle — Airtable ergänzt nur was abweicht.
  const preset = (window.WE_PRESETS_BY_RECID || {})[weId];
  if (preset) {
    // Komplettes Preset übernehmen (Hausgeld, Subvention, AfA, Wertsteigerung, ...)
    Object.assign(state.kalk, JSON.parse(JSON.stringify(preset)));
  } else {
    // Fallback: nur die Airtable-Basics + Hausgeld-Faustregel.
    state.kalk.kaufpreis = w.kp || w.kaufpreis || state.kalk.kaufpreis;
    state.kalk.qm = w.qm || state.kalk.qm;
    state.kalk.kaltmiete = w.kaltmiete || state.kalk.kaltmiete;
    if (w.qm) state.kalk.hausgeld = Math.round(w.qm);
  }

  // 2) WE-Metadata immer aus Airtable (Lage-Text, Projekt-Name)
  state.kalk._weId = weId;
  state.kalk._weLage = w.lageText || w.lage || w.weNr || '';
  state.kalk._weNr = w.weNr || '';
  state.kalk._projektName = w.projektName || '';
  renderTabKalkulator();
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
      const weInputs = state.kalk._paketWeIds.map(wid => {
        const w = state.wohneinheiten.find(x => x.id === wid);
        if (!w) return null;
        const preset = (window.WE_PRESETS_BY_RECID || {})[wid];
        if (preset) {
          return Object.assign({}, JSON.parse(JSON.stringify(preset)), {
            _weId: w.id, _weLage: w.lageText || w.lage, _weNr: w.weNr, _projektName: w.projektName,
          });
        }
        // Fallback ohne Preset (sollte nicht passieren bei Heidelberger/Wesseling)
        return {
          kaufpreis: w.kp || 0, stellplatzKp: 0, qm: w.qm || 0, marktwertProQm: 0,
          kaltmiete: w.kaltmiete || 0, stellplatzMiete: 0,
          subventionMo: 0, subventionMonate: 0,
          mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
          hausgeld: Math.round((w.qm || 0)),
          hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
          afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
          wertsteigerung: 0.03,
          _weId: w.id, _weLage: w.lageText || w.lage, _weNr: w.weNr, _projektName: w.projektName,
        };
      }).filter(Boolean);
      if (weInputs.length === 0) {
        document.getElementById('kpi-grid').innerHTML = '<div class="empty-state">Wähle mindestens eine WE.</div>';
        return;
      }
      const personSettings = {
        zins: state.kalk.zins, tilgung: state.kalk.tilgung, knkMitfinanziert: state.kalk.knkMitfinanziert,
        steuersatz: state.kalk.steuersatz,
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
  catch (e) { console.error('recalc', e); return; }
  state.kalkResult = r;

  // KPIs
  const fmt = window.Kalk.fmtEur;
  const fmtPct = window.Kalk.fmtPct;
  const fmtEurMo = window.Kalk.fmtEurMo;
  const grid = document.getElementById('kpi-grid');
  if (!grid) return;
  const cls = (v) => v > 0 ? 'positive' : (v < 0 ? 'negative' : '');
  // Kern-KPIs wie V1 — 5 Standard + optional Markteinkauf-Vorteil. Mit Info-Tooltips.
  const kpiCard = (label, value, info, extraClass) => `
    <div class="kpi ${extraClass || ''}">
      <div class="label">${esc(label)}<button class="kpi-info" title="${esc(info)}">i</button></div>
      <div class="value">${value}</div>
    </div>`;
  const kpis = [
    kpiCard('EK-Bedarf', fmt(r.ekBedarf),
      'Eigenkapital beim Kauf: Kaufnebenkosten (Grunderwerbsteuer + Notar + Grundbuch ≈ 8,5 % vom Kaufpreis). Bei „KNK mitfinanziert: Ja" = 0 €.'),
    kpiCard('Belastung / Monat', fmtEurMo(r.belastungMo),
      'Was monatlich aus deiner Tasche geht in Jahr 1. Mieten + Subvention − Annuität − Hausgeld − Hausverwaltung − Mietverwaltung + Steuervorteil. Positiv = Cashflow positiv.', cls(r.belastungMo)),
    kpiCard('EK-Rendite (IRR) 10 J.', fmtPct(r.irr),
      'Interner Zinsfuß über tatsächliche Cashflow-Reihe inkl. Exit-Erlös. Berücksichtigt: eingesetztes EK, jährliche Cashflows, Verkaufserlös nach §23-EStG-Frist.'),
    kpiCard('Vermögen brutto 10 J.', fmt(r.vermoegenBrutto10),
      'Immobilienwert nach 10 J. minus Restschuld. Wertentwicklung mit Inflation (Default 3 % p.a.). NICHT enthalten: eingesetztes EK + Cashflows.'),
    kpiCard('Vermögen netto 10 J.', fmt(r.vermoegenNetto10),
      'Ehrliche Vermögensbilanz: Vermögen brutto − eingesetztes EK + kumulierte Cashflows.', 'positive'),
  ];
  // Markteinkauf-Vorteil nur wenn marktwertProQm > 0 gesetzt
  const mwQm = (state.kalk && parseFloat(state.kalk.marktwertProQm)) || 0;
  if (mwQm > 0 && r.markteinkaufVorteil) {
    kpis.push(kpiCard('Markteinkauf-Vorteil', fmt(r.markteinkaufVorteil),
      'Differenz zwischen Marktpreis pro qm und Kaufpreis pro qm × Wohnfläche. „Geld, das schon im Kaufpreis steckt."',
      cls(r.markteinkaufVorteil)));
  }
  grid.innerHTML = kpis.join('');

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

  // Story-Sektionen
  renderStories(r);
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

  const markteinkauf = (marktQm > 0) ? story('01 — Markteinkauf', 'Eingekauft unter Marktpreis', `
    <div class="story-grid">
      <table class="story-table">
        <tr><td>Kaufpreis / qm</td><td class="num">${Math.round(kpQm).toLocaleString('de-DE')} €/qm</td></tr>
        <tr><td>Marktpreis / qm</td><td class="num">${Math.round(marktQm).toLocaleString('de-DE')} €/qm</td></tr>
        <tr><td>Wohnfläche</td><td class="num">${(i.qm || 0).toLocaleString('de-DE')} qm</td></tr>
        <tr><td><strong>Vorteil Tag 1</strong></td><td class="num pos"><strong>${fmt(r.markteinkaufVorteil)}</strong></td></tr>
      </table>
      <div class="story-explain">
        Diese Wohnung wird mit <strong>${Math.round(kpQm).toLocaleString('de-DE')} €/qm</strong> gekauft, der Marktpreis liegt bei <strong>${Math.round(marktQm).toLocaleString('de-DE')} €/qm</strong>. Der Vorteil <strong>steckt im Kaufpreis</strong> und macht den Vermögensaufbau ab Tag 1 belastbar — unabhängig von Wertsteigerung und Mietentwicklung.
      </div>
    </div>
  `) : '';

  const cashflowHeute = story('02 — Cashflow heute', 'Was der Kunde Monat für Monat mitbringt', `
    <div class="story-grid">
      <table class="story-table">
        <thead><tr><th>Position</th><th class="num">€/Monat</th></tr></thead>
        <tr><td>Mieteinnahmen (Kalt + Stellplatz + Subv.)</td><td class="num pos">+ ${fmtEurMo(r.mieteJ1Mo || 0)}</td></tr>
        <tr><td>Annuität Bank</td><td class="num neg">− ${fmtEurMo(r.annuityMo || 0)}</td></tr>
        <tr><td>Hausgeld inkl. Rücklage</td><td class="num neg">− ${fmtEurMo(r.hausgeldNurMo || 0)}</td></tr>
        <tr><td>Mietverwaltung (SEV)</td><td class="num neg">− ${fmtEurMo(r.mietverwaltungMo || 0)}</td></tr>
        <tr><td>Hausverwaltung (WEG)</td><td class="num neg">− ${fmtEurMo(r.hausverwaltungMo || 0)}</td></tr>
        <tr><td>Steuervorteil (AfA + Zinsen + MV + HV)</td><td class="num pos">+ ${fmtEurMo(r.stVorteilJ1Mo || 0)}</td></tr>
        <tr class="totalrow"><td><strong>Effektive Belastung Jahr 1</strong></td><td class="num"><strong>${fmtEurMo(r.belastungMo)}</strong></td></tr>
      </table>
      <div class="story-explain">
        Die <strong>ehrliche monatliche Zahl</strong>, die der Käufer mitbringt (oder die ihm bleibt, wenn positiv).
        ${i.subventionMonate ? `<p>Mietsubvention <strong>${fmtEurMo(i.subventionMo)}</strong> über <strong>${i.subventionMonate} Monate</strong> — Summe <strong>${fmt(r.mietsubventionGesamt)}</strong>. Fängt die Anlaufphase ab.</p>` : ''}
        ${r.ersteErhoehungMonat ? `<p>Erste Mieterhöhung in <strong>Monat ${r.ersteErhoehungMonat}</strong> (${esc(r.ersteErhoehungJahrLabel)}). Mietsteigerung danach: ${fmtPct(i.steigerungProz)}.</p>` : ''}
      </div>
    </div>
  `);

  const steuervorteil = story('03 — Steuervorteil', 'AfA + Werbungskosten = Cashflow-Hebel', `
    <div class="story-grid">
      <table class="story-table">
        <tr><td>AfA-Basis (Kaufpreis × Gebäude-Anteil)</td><td class="num">${fmt(afaBemessung)}</td></tr>
        <tr><td>AfA-Satz</td><td class="num">${fmtPct(i.afaSatz)}</td></tr>
        <tr><td><strong>AfA pro Jahr (konstant)</strong></td><td class="num"><strong>${fmt(afaJahr)}</strong></td></tr>
        <tr><td>+ Zinsen Jahr 1</td><td class="num">${fmt(zinsenJ1)}</td></tr>
        <tr><td>+ Mietverwaltung (SEV) Jahr 1</td><td class="num">${fmt(mvJ1)}</td></tr>
        <tr><td>+ Hausverwaltung (WEG) Jahr 1</td><td class="num">${fmt(hvJ1)}</td></tr>
        <tr><td>Steuersatz</td><td class="num">${fmtPct(i.steuersatz)}</td></tr>
        <tr class="totalrow"><td><strong>Steuervorteil Jahr 1</strong></td><td class="num pos"><strong>${fmt(stVorteilJ1)}</strong></td></tr>
      </table>
      <div class="story-explain">
        <strong>AfA-Satz frei wählbar</strong> — Standard 2,0 % (lineare AfA §7 Abs. 4 EStG), mit qualifiziertem Gutachten typisch 3,0–4,5 % möglich. <strong>Bemessungsgrundlage: Kaufpreis × Gebäude-Anteil</strong>.<br><br>
        <strong>Steuervorteil sinkt über die Jahre</strong>: Zinsen sinken (Annuitäten-Mathematik), Mieten steigen, AfA bleibt konstant. Im Jahr 10: <strong>${fmt(stVorteilJ10)}</strong> (Jahr 1: ${fmt(stVorteilJ1)}).
      </div>
    </div>
  `);

  const dreiHebel = story('04 — Vermögensaufbau', 'Drei Hebel arbeiten parallel', `
    <div class="stat-trio">
      <div class="stat-item"><div class="stat-lbl">Hebel 1 · Inflation</div><div class="stat-val">${fmtPct(i.wertsteigerung)} p.a.</div></div>
      <div class="stat-item"><div class="stat-lbl">Hebel 2 · Tilgung Jahr 1</div><div class="stat-val">${fmt(tilgungJ1)}</div></div>
      <div class="stat-item"><div class="stat-lbl">Hebel 3 · Markteinkauf</div><div class="stat-val">${fmt(r.markteinkaufVorteil || 0)}</div></div>
    </div>
    <p class="story-explain">Nach 10 Jahren: Vermögen <strong>brutto</strong> ${fmt(r.vermoegenBrutto10)} (= Wert ${fmt(wert10)} − Restschuld ${fmt(restschuld10)}). <strong>Netto</strong> — nach Abzug eingesetztes EK + kumulierter Cashflow — bleibt <strong>${fmt(r.vermoegenNetto10)}</strong>.</p>
  `);

  const exit10 = story('05 — Exit nach 10 Jahren', 'Steuerfrei verkaufen (§23 EStG)', `
    <div class="story-grid">
      <table class="story-table">
        <tr><td>Geschätzter Wert Jahr 10</td><td class="num">${fmt(wert10)}</td></tr>
        <tr><td>Restschuld Jahr 10</td><td class="num">− ${fmt(restschuld10)}</td></tr>
        <tr><td><strong>Vermögen brutto (Verkaufserlös vor Steuer)</strong></td><td class="num pos"><strong>${fmt(r.vermoegenBrutto10)}</strong></td></tr>
        <tr><td>Eingesetztes EK</td><td class="num">− ${fmt(r.ekBedarf)}</td></tr>
        <tr><td>Kumulierter Cashflow Jahr 1-10</td><td class="num">${fmt(kumCf10)}</td></tr>
        <tr><td><strong>Vermögen netto (ehrliche Bilanz)</strong></td><td class="num"><strong>${fmt(r.vermoegenNetto10)}</strong></td></tr>
        <tr><td>IRR über 10 Jahre</td><td class="num"><strong>${fmtPct(r.irr)}</strong></td></tr>
      </table>
      <div class="story-explain">
        Nach Ablauf der <strong>Spekulationsfrist (10 Jahre)</strong> ist der Veräußerungsgewinn steuerfrei — vorausgesetzt, die Drei-Objekt-Grenze wird nicht überschritten. Die <strong>IRR (Eigenkapitalrendite)</strong> zeigt, was das EK über 10 Jahre wirklich gebracht hat.
      </div>
    </div>
  `);

  const bonStory = story('06 — Bonitätseffekt', 'Was die Bank davon hält', `
    <div class="story-grid">
      <table class="story-table">
        <tr><td>Einnahmen / Mo</td><td class="num">+ ${fmtEurMo(r.bonEinnahmen || 0)}</td></tr>
        <tr><td>Ausgaben / Mo</td><td class="num">− ${fmtEurMo(r.bonAusgaben || 0)}</td></tr>
        <tr><td><strong>Saldo vor Kauf</strong></td><td class="num"><strong>${fmtEurMo(r.bonVor || 0)}</strong></td></tr>
        <tr><td>+ Anrechenbare Miete (80 %)</td><td class="num pos">+ ${fmtEurMo(r.bonMieteAnr || 0)}</td></tr>
        <tr><td>− Annuität Bank</td><td class="num neg">− ${fmtEurMo(r.bonAnnuMo || 0)}</td></tr>
        <tr><td><strong>Saldo nach Kauf</strong></td><td class="num"><strong>${fmtEurMo(r.bonNach || 0)}</strong></td></tr>
        <tr><td>Saldo-Delta aus dieser WE</td><td class="num"><strong>${fmtEurMo(r.bonDelta || 0)}</strong></td></tr>
        <tr><td>Verfügbares Vermögen</td><td class="num">${fmt(r.bonVermoegen || 0)}</td></tr>
        <tr><td>EK-Bedarf</td><td class="num">${fmt(r.ekBedarf)}</td></tr>
      </table>
      <div class="story-explain">
        Banken rechnen Miete pauschal mit <strong>80 %</strong> an (Leerstands-/Mietausfallreserve). Positiver <strong>Saldo nach Kauf</strong> = Wohnung erhöht die Kreditfähigkeit für die nächste WE. Negativ = Wohnung frisst Bonität.<br><br>
        <strong>Vermögen aus Bank-Sicht:</strong> Nur <em>liquide oder leicht beleihbare Werte</em> (Sparbuch, Tagesgeld, Aktien, ETFs, Rückkaufwert LV). Nicht: Eigenheim oder Bestandsimmobilien.
      </div>
    </div>
  `);

  const sparenStory = story('07 — Sparen vs. Investieren', 'Das Vermögen läuft beim Investieren stärker', `
    <div class="story-grid">
      <table class="story-table">
        <tr><td>Startvermögen (verfügbar)</td><td class="num">${fmt(r.bonVermoegen || 0)}</td></tr>
        <tr><td>− KNK „verbrannt"</td><td class="num">− ${fmt(r.ekBedarf)}</td></tr>
        <tr><td>Nur sparen (Tagesgeld, 10 J.)</td><td class="num">${fmt(sparen10.nurSparen || 0)}</td></tr>
        <tr><td>Mit Immobilie (Spar-Rest + Vermögen + kum. CF)</td><td class="num pos">${fmt(sparen10.mitImmo || 0)}</td></tr>
        <tr class="totalrow"><td><strong>Vorteil durch Immobilie</strong></td><td class="num pos"><strong>${fmt(r.sparenVsKaufenDelta)}</strong></td></tr>
      </table>
      <div class="story-explain">
        Wer sein EK <strong>nur auf dem Tagesgeld spart</strong>, kommt nach 10 J. auf <strong>${fmt(sparen10.nurSparen || 0)}</strong>. Wer denselben Betrag <strong>als EK in diese Immobilie investiert</strong>, hat nach 10 J. <strong>${fmt(sparen10.mitImmo || 0)}</strong> — Vorteil: <strong>${fmt(r.sparenVsKaufenDelta)}</strong>.<br><br>
        <strong>Wichtig:</strong> Die KNK sind <em>verbranntes Geld</em> (Grunderwerbsteuer, Notar, Grundbuch). Bei KNK mitfinanziert = 0 €, dafür höhere Restschuld.
      </div>
    </div>
  `);

  el.innerHTML = markteinkauf + cashflowHeute + steuervorteil + dreiHebel + exit10 + bonStory + sparenStory;
}

function drawCharts(r) {
  if (!window.Chart) return;
  const years = r.vermoegen.map(v => 'J' + v.y);
  const verm = r.vermoegen.map(v => Math.round(v.vermoegenNetto));
  const cfYears = r.cf.map(c => 'J' + c.y);
  const cfVals = r.cf.map(c => Math.round(c.cfJahr));
  const sparenLbls = r.sparen.map(s => 'J' + s.y);
  const sparenNur = r.sparen.map(s => Math.round(s.nurSparen));
  const sparenMit = r.sparen.map(s => Math.round(s.mitImmo));

  // Gemeinsame Chart-Optionen: Index-Mode für tolerantes Hovern,
  // intersect=false damit Tooltip auch ohne Punkt-Treffer kommt,
  // Euro-Formatierung auf Tooltip + Y-Achse.
  const eurTooltip = {
    callbacks: {
      label: (ctx) => {
        const v = ctx.parsed.y;
        const lbl = ctx.dataset.label || '';
        return lbl + ': ' + (typeof v === 'number' ? v.toLocaleString('de-DE') + ' €' : v);
      }
    }
  };
  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { tooltip: eurTooltip },
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

  if (chartV) chartV.destroy();
  chartV = new Chart(document.getElementById('chart-vermoegen'), {
    type: 'line',
    data: { labels: years, datasets: [{
      label: 'Vermögensaufbau netto', data: verm,
      borderColor: '#B08A4D', backgroundColor: 'rgba(176,138,77,0.15)',
      tension: 0.3, fill: true, pointRadius: 3, pointHoverRadius: 6,
    }] },
    options: baseOpts
  });

  if (chartC) chartC.destroy();
  chartC = new Chart(document.getElementById('chart-cashflow'), {
    type: 'bar',
    data: { labels: cfYears, datasets: [{
      label: 'Cashflow', data: cfVals,
      backgroundColor: cfVals.map(v => v >= 0 ? 'rgba(45,110,71,0.7)' : 'rgba(154,62,51,0.7)'),
    }] },
    options: baseOpts
  });

  if (chartS) chartS.destroy();
  chartS = new Chart(document.getElementById('chart-sparen'), {
    type: 'line',
    data: { labels: sparenLbls, datasets: [
      { label: 'Nur Sparen', data: sparenNur, borderColor: '#7A7A72', tension: 0.3, pointRadius: 2, pointHoverRadius: 5 },
      { label: 'Mit Immobilie', data: sparenMit, borderColor: '#B08A4D', tension: 0.3, pointRadius: 2, pointHoverRadius: 5 },
    ] },
    options: baseOpts
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
  if (state.kalk._isPaket && Array.isArray(state.kalk._paketWeIds) && state.kalk._paketWeIds.length > 0) {
    const labels = state.kalk._paketWeIds.map(wid => {
      const w = (state.wohneinheiten || []).find(x => x.id === wid);
      return fmtWeBez(w) || wid;
    });
    weBez = 'Paket: ' + labels.join(' + ');
    defaultBez = 'Paket (' + state.kalk._paketWeIds.length + ' WE) — ' +
                 new Date().toLocaleDateString('de-DE');
  } else {
    const w = (state.wohneinheiten || []).find(x => x.id === state.kalk._weId);
    weBez = fmtWeBez(w) || state.kalk._weLage || '';
    defaultBez = (weBez ? weBez + ' — ' : '') + new Date().toLocaleDateString('de-DE');
  }
  const bez = prompt('Bezeichnung für Snapshot?', defaultBez);
  if (!bez) return;
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
    try {
      const reloaded = await api.get('/api/snapshots?kundeId=' + state.kundeId);
      state.snapshots = Array.isArray(reloaded) ? reloaded : [snap];
    } catch (_) {
      // Fallback: nur den neuen lokal vorn anhängen
      state.snapshots.unshift(snap);
    }
    toast('Snapshot "' + bez + '" gespeichert', 'success');
    // Wenn wir gerade im Snapshots-Tab sind, sofort neu rendern.
    if (state.tab === 'snapshots') renderTabSnapshots();
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}
window.saveSnapshot = saveSnapshot;

function exportInvestPdf() {
  if (window.PDF && window.PDF.investitionsrechnung) {
    window.PDF.investitionsrechnung(state.kunde, state.kalk, state.kalkResult, state.user);
  } else { alert('PDF-Modul nicht geladen.'); }
}
function exportReservPdf() {
  if (window.PDF && window.PDF.reservierung) {
    window.PDF.reservierung(state.kunde, state.kalk, state.user);
  }
}
function exportSaPdf() {
  if (window.PDF && window.PDF.selbstauskunft) {
    window.PDF.selbstauskunft(state.kunde, state.user);
  }
}
window.exportInvestPdf = exportInvestPdf;
window.exportReservPdf = exportReservPdf;
window.exportSaPdf = exportSaPdf;

/* ============================== SELBSTAUSKUNFT-TAB ============================== */

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

  const istGemeinsam = sa.gemeinsam === true;
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Selbstauskunft</div>
      <div class="flex gap-12 mb-16">
        <label class="flex gap-8" style="display:flex;align-items:center;text-transform:none;letter-spacing:0;">
          <input type="checkbox" id="sa-gemeinsam" ${istGemeinsam ? 'checked' : ''} style="width:auto;">
          Gemeinsamer Antrag mit Mit-Antragsteller
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
      <div class="toolbar mt-16">
        <button onclick="saveSelbstauskunft()">Speichern</button>
        <button class="secondary" onclick="exportSaPdf()">PDF Selbstauskunft</button>
      </div>
    </div>
  `;
  // Häkchen-Wechsel: neu rendern, damit Layout (1 vs. 2 Spalten) + Header sich anpassen
  document.getElementById('sa-gemeinsam').onchange = (e) => {
    sa.gemeinsam = e.target.checked;
    renderTabSelbstauskunft();
  };
}

function saPersonHtml(prefix, p) {
  p = p || {};
  // Text-Feld
  const t = (label, key) => `
    <div>
      <label>${esc(label)}</label>
      <input data-sa="${prefix}.${key}" type="text" value="${esc(p[key] || '')}">
    </div>`;
  // Zahl-Feld
  const n = (label, key, suffix, step) => `
    <div>
      <label>${esc(label)}${suffix ? ' (' + suffix + ')' : ''}</label>
      <input data-sa="${prefix}.${key}" type="number" step="${step || 'any'}" value="${p[key] !== undefined && p[key] !== null ? p[key] : ''}">
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
    return `<div><label>${esc(label)}${suffix ? ' (' + suffix + ')' : ''}</label><input data-sa="${fullKey}" type="number" step="${step || 'any'}" value="${val !== undefined && val !== null ? val : ''}"></div>`;
  };

  return `
    <details class="sa-section" open>
      <summary>Persönliche Verhältnisse</summary>
      <div class="grid-2">
        ${t('Name', 'name')}
        ${t('Geburtsname', 'geburtsname')}
        ${t('Vorname', 'vorname')}
        ${d('Geburtsdatum', 'geburtsdatum')}
        ${t('Straße', 'strasse')}
        ${t('PLZ', 'plz')}
        ${t('Ort', 'ort')}
        ${t('Staatsangehörigkeit', 'staatsangehoerigkeit')}
        ${t('Telefon privat', 'telefonPrivat')}
        ${t('Telefon geschäftlich', 'telefonGeschaeftlich')}
        ${t('E-Mail', 'email')}
        ${t('Steuer-ID', 'steuerId')}
        ${t('Ausgeübter Beruf', 'beruf')}
        ${t('Beschäftigt bei Firma', 'firma')}
        ${d('Beschäftigt seit', 'beschaeftigtSeit')}
        ${s('Befristung', 'befristung', [{v:'unbefristet',l:'unbefristet'},{v:'befristet',l:'befristet'}])}
        ${s('Familienstand', 'familienstand', [
          {v:'ledig',l:'ledig'},{v:'verheiratet',l:'verheiratet'},
          {v:'geschieden',l:'geschieden'},{v:'verwitwet',l:'verwitwet'}
        ])}
        ${n('Kinder im Haushalt', 'kinderAnzahl')}
        ${t('Kinder Alter (Kommasep.)', 'kinderAlter')}
        ${s('Kinder in Planung', 'kinderPlanung', [{v:'',l:'—'},{v:'nein',l:'nein'},{v:'ja',l:'ja, in den nächsten 2 Jahren'}])}
        ${s('Kirchensteuerpflicht', 'kirchensteuer', [{v:'',l:'—'},{v:'nein',l:'nein'},{v:'ja',l:'ja'}])}
        ${n('KFZ Anzahl', 'kfzAnzahl')}
        ${t('Hausbank', 'bank')}
        ${t('IBAN', 'iban')}
        ${t('BIC', 'bic')}
      </div>
    </details>

    <details class="sa-section" open>
      <summary>Einkommen (monatlich)</summary>
      <div class="grid-2">
        ${n('Netto-Gehalt', 'nettoMo', '€/Mo')}
        ${n('Anzahl der Gehälter', 'anzahlGehaelter', '×', '0.5')}
        ${n('Vermietung & Verpachtung', 'vermietungMo', '€/Mo')}
        ${n('Sonstige Einkommen', 'sonstigeMo', '€/Mo')}
        ${n('Unterhalt erhalten', 'unterhaltMo', '€/Mo')}
        ${n('Kindergeld', 'kindergeldMo', '€/Mo')}
        ${n('Zu versteuerndes Einkommen', 'zveJahr', '€/Jahr')}
      </div>
    </details>

    <details class="sa-section" open>
      <summary>Monatliche Fixkosten</summary>
      <div class="grid-2">
        ${n('Miete inkl. NK (eigene Whg)', 'mieteMo', '€/Mo')}
        ${n('Unterhaltszahlungen', 'unterhaltZahlungMo', '€/Mo')}
        ${n('Beitrag private Krankenversicherung', 'pkvMo', '€/Mo')}
      </div>
    </details>

    <details class="sa-section" open>
      <summary>Vermögen</summary>
      <div class="grid-2">
        ${n('Bankguthaben', 'bankguthaben', '€')}
        ${n('Wertpapiere (Kurswert)', 'wertpapiere', '€')}
        ${n('Sparbücher', 'sparbuecher', '€')}
        ${n('Bausparguthaben / VWL', 'bausparen', '€')}
        ${n('Sonstige Vermögen', 'sonstigeVermoegen', '€')}
      </div>
    </details>

    <details class="sa-section">
      <summary>Versicherungs-Guthaben (optional)</summary>
      <div class="grid-2">
        ${sub('vers', 'art', 'text', 'Art (z.B. LV/RV)')}
        ${sub('vers', 'beginn', 'date', 'Beginn')}
        ${sub('vers', 'ende', 'date', 'Ende')}
        ${sub('vers', 'summe', 'number', 'Versicherungssumme', '€')}
        ${sub('vers', 'belastungMo', 'number', 'mtl. Belastung', '€/Mo')}
        ${sub('vers', 'rueckkauf', 'number', 'Rückkaufwert', '€')}
      </div>
    </details>

    <details class="sa-section">
      <summary>Immobilienvermögen — Immobilie 1 (optional)</summary>
      <div class="grid-2">
        ${sub('immo1', 'art', 'text', 'Art des Objekts')}
        ${sub('immo1', 'anschrift', 'text', 'Anschrift')}
        ${sub('immo1', 'baujahr', 'number', 'Baujahr/Erwerbsjahr', 'Jahr')}
        ${sub('immo1', 'wohnflaeche', 'number', 'Wohnfläche', 'm²')}
        ${sub('immo1', 'verkehrswert', 'number', 'Verkehrswert', '€')}
        ${sub('immo1', 'hypotheken', 'number', 'Hypotheken & Grundschulden', '€')}
        ${sub('immo1', 'mietenMo', 'number', 'Mieteinnahmen', '€/Mo')}
      </div>
    </details>

    <details class="sa-section">
      <summary>Immobilienvermögen — Immobilie 2 (optional)</summary>
      <div class="grid-2">
        ${sub('immo2', 'art', 'text', 'Art des Objekts')}
        ${sub('immo2', 'anschrift', 'text', 'Anschrift')}
        ${sub('immo2', 'baujahr', 'number', 'Baujahr/Erwerbsjahr', 'Jahr')}
        ${sub('immo2', 'wohnflaeche', 'number', 'Wohnfläche', 'm²')}
        ${sub('immo2', 'verkehrswert', 'number', 'Verkehrswert', '€')}
        ${sub('immo2', 'hypotheken', 'number', 'Hypotheken & Grundschulden', '€')}
        ${sub('immo2', 'mietenMo', 'number', 'Mieteinnahmen', '€/Mo')}
      </div>
    </details>

    <details class="sa-section">
      <summary>Verbindlichkeiten — Baufinanzierung 1 (optional)</summary>
      <div class="grid-2">
        ${sub('bf1', 'urspruenglich', 'number', 'urspr. Darlehenshöhe', '€')}
        ${sub('bf1', 'laufzeitBis', 'date', 'Laufzeit bis')}
        ${sub('bf1', 'belastungMo', 'number', 'mtl. Belastung', '€/Mo')}
        ${sub('bf1', 'restsaldo', 'number', 'Restsaldo', '€')}
      </div>
    </details>

    <details class="sa-section">
      <summary>Verbindlichkeiten — Baufinanzierung 2 (optional)</summary>
      <div class="grid-2">
        ${sub('bf2', 'urspruenglich', 'number', 'urspr. Darlehenshöhe', '€')}
        ${sub('bf2', 'laufzeitBis', 'date', 'Laufzeit bis')}
        ${sub('bf2', 'belastungMo', 'number', 'mtl. Belastung', '€/Mo')}
        ${sub('bf2', 'restsaldo', 'number', 'Restsaldo', '€')}
      </div>
    </details>

    <details class="sa-section">
      <summary>Verbindlichkeiten — Konsumentendarlehen 1 (optional)</summary>
      <div class="grid-2">
        ${sub('kd1', 'urspruenglich', 'number', 'urspr. Darlehenshöhe', '€')}
        ${sub('kd1', 'laufzeitBis', 'date', 'Laufzeit bis')}
        ${sub('kd1', 'belastungMo', 'number', 'mtl. Belastung', '€/Mo')}
        ${sub('kd1', 'restsaldo', 'number', 'Restsaldo', '€')}
      </div>
    </details>

    <details class="sa-section">
      <summary>Verbindlichkeiten — Konsumentendarlehen 2 (optional)</summary>
      <div class="grid-2">
        ${sub('kd2', 'urspruenglich', 'number', 'urspr. Darlehenshöhe', '€')}
        ${sub('kd2', 'laufzeitBis', 'date', 'Laufzeit bis')}
        ${sub('kd2', 'belastungMo', 'number', 'mtl. Belastung', '€/Mo')}
        ${sub('kd2', 'restsaldo', 'number', 'Restsaldo', '€')}
      </div>
    </details>
  `;
}

async function saveSelbstauskunft() {
  const sa = state._sa || { antragsteller: {}, mitantragsteller: {} };
  sa.gemeinsam = document.getElementById('sa-gemeinsam').checked;
  document.querySelectorAll('[data-sa]').forEach(inp => {
    const parts = inp.dataset.sa.split('.');
    const prefix = parts[0]; // 'a' oder 'm'
    const target = prefix === 'a' ? 'antragsteller' : 'mitantragsteller';
    if (!sa[target]) sa[target] = {};

    // Wert typisieren: bei type=number → Float (außer leer)
    let v;
    if (inp.value === '' || inp.value === null) {
      v = null;
    } else if (inp.type === 'number') {
      v = parseFloat(inp.value);
      if (!isFinite(v)) v = null;
    } else {
      v = inp.value;
    }

    if (parts.length === 2) {
      // "a.nettoMo" → sa.antragsteller.nettoMo
      sa[target][parts[1]] = v;
    } else if (parts.length === 3) {
      // "a.immo1.verkehrswert" → sa.antragsteller.immo1.verkehrswert
      const sub = parts[1];
      const key = parts[2];
      if (!sa[target][sub] || typeof sa[target][sub] !== 'object') sa[target][sub] = {};
      sa[target][sub][key] = v;
    }
  });
  try {
    await api.put('/api/kunden/' + state.kundeId, { saJson: sa });
    state.kunde.saJson = sa;
    toast('Selbstauskunft gespeichert', 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}
window.saveSelbstauskunft = saveSelbstauskunft;

/* ============================== SNAPSHOTS-TAB ============================== */

function renderTabSnapshots() {
  const el = document.getElementById('tab-content');
  const ss = state.snapshots || [];
  console.log('[snapshots] state.snapshots:', ss);
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
                  <td>
                    <button class="secondary" onclick="loadSnapshot('${esc(s.id)}')" ${hasKalk ? '' : 'disabled title="Keine Kalkulations-Daten in diesem Snapshot"'}>Laden</button>
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
    console.log('[loadSnapshot]', s.bezeichnung, 'kalk:', kalk);
    if (!kalk || typeof kalk !== 'object' || Object.keys(kalk).length === 0) {
      toast('Snapshot "' + (s.bezeichnung || '—') + '" enthält keine Kalkulations-Daten. Bitte neuen Snapshot speichern.', 'error');
      return;
    }
    // Wichtig: state.kalk komplett ersetzen (kein Object.assign, sonst bleiben alte Felder)
    state.kalk = kalk;
    setTab('kalkulator');
    toast('Snapshot "' + (s.bezeichnung || '—') + '" geladen', 'success');
  } catch (e) {
    console.error('loadSnapshot error:', e, 'snapshot:', s);
    toast('Snapshot konnte nicht geladen werden: ' + e.message, 'error');
  }
}
window.loadSnapshot = loadSnapshot;

/* ============================== ADMIN ============================== */

async function renderAdmin() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="main"><h1 class="page-title">Admin</h1><div class="empty-state">Lade…</div></div>`;
  try {
    state.adminStats = await api.get('/api/admin/stats');
  } catch (e) {
    app.innerHTML = `<div class="main"><div class="error-banner">${esc(e.message)}</div></div>`;
    return;
  }
  const s = state.adminStats || {};
  app.innerHTML = `
    <div class="main">
      <h1 class="page-title">Admin</h1>
      <p class="page-subtitle">Statistik &amp; alle Kunden im Workspace</p>

      <div class="kpi-grid">
        <div class="kpi"><div class="label">Gesamt Kunden</div><div class="value">${s.totalKunden || 0}</div></div>
        <div class="kpi"><div class="label">Vertriebler</div><div class="value">${(s.vertriebler || []).length}</div></div>
        <div class="kpi positive"><div class="label">Beurkundet</div><div class="value">${(s.byPhase && s.byPhase['Beurkundet']) || 0}</div></div>
        <div class="kpi"><div class="label">In Bearbeitung</div><div class="value">${s.inBearbeitung || 0}</div></div>
      </div>

      <div class="card">
        <div class="card-title">Vertriebler</div>
        <table class="table">
          <thead><tr><th>Name</th><th>Rolle</th><th>Kunden gesamt</th><th>Beurkundet</th></tr></thead>
          <tbody>
            ${(s.vertriebler || []).map(v => `
              <tr>
                <td><strong>${esc(v.name)}</strong></td>
                <td>${esc(v.rolle)}</td>
                <td class="num">${v.kundenGesamt || 0}</td>
                <td class="num pos">${v.beurkundet || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="card mt-16">
        <div class="card-title">Alle Kunden</div>
        ${!s.alleKunden || s.alleKunden.length === 0 ? `
          <div class="empty-state">Keine Kunden im System.</div>
        ` : `
          <table class="table">
            <thead><tr><th>Name</th><th>Owner</th><th>Phase</th><th>Letzte Aktivität</th></tr></thead>
            <tbody>
              ${s.alleKunden.map(k => `
                <tr onclick="go('/kunde/${esc(k.id)}')">
                  <td><strong>${esc(k.name)}</strong></td>
                  <td class="text-tertiary">${esc(k.ownerName || '—')}</td>
                  <td><span class="badge ${phaseBadgeClass(k.phase)}">${esc(k.phase)}</span></td>
                  <td class="text-tertiary">${esc(fmtDate(k.lastActivity))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>
  `;
}

/* ============================== RENDER DISPATCH ============================== */

function render() {
  renderHeader();
  if (state.view === 'login') renderLogin();
  else if (state.view === 'dashboard') renderDashboard();
  else if (state.view === 'kunde') renderKunde();
  else if (state.view === 'admin') renderAdmin();
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
