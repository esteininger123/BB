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
  else if (state.tab === 'snapshots') renderTabSnapshots();
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

  el.innerHTML = `
    <div class="card">
      <div class="card-title">Wohneinheit auswählen</div>
      <div class="grid-3">
        <div>
          <label>WE aus Airtable</label>
          <select id="we-select">
            <option value="">— Eigene Eingabe / Default —</option>
            ${wes.map(w => `<option value="${esc(w.id)}">${esc(w.lage || w.weNr || w.id)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Profil</label>
          <select id="profil-select">
            <option value="standard">Standard (30 %)</option>
            <option value="premium">Premium (35 %)</option>
            <option value="spitze">Spitze (42 %)</option>
          </select>
        </div>
        <div>
          <label>&nbsp;</label>
          <button class="secondary" onclick="resetKalk()">Auf Stammdaten zurücksetzen</button>
        </div>
      </div>
    </div>

    <div class="card mt-16">
      <div class="card-title">Eingaben</div>
      <div class="grid-3" id="kalk-inputs">
        ${kalkInputsHtml(i)}
      </div>
    </div>

    <div class="kpi-grid mt-16" id="kpi-grid"></div>

    <div class="grid-2 mt-16">
      <div class="card">
        <div class="card-title">Vermögensentwicklung (10 J)</div>
        <div class="chart-container"><canvas id="chart-vermoegen"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Cashflow (30 J)</div>
        <div class="chart-container"><canvas id="chart-cashflow"></canvas></div>
      </div>
    </div>
    <div class="card mt-16">
      <div class="card-title">Sparen vs. Investieren (10 J)</div>
      <div class="chart-container"><canvas id="chart-sparen"></canvas></div>
    </div>

    <div class="toolbar mt-16">
      <button onclick="saveSnapshot()">Snapshot speichern</button>
      <button class="secondary" onclick="exportInvestPdf()">PDF Investitionsrechnung</button>
      <button class="secondary" onclick="exportReservPdf()">PDF Reservierung</button>
    </div>
  `;

  // Listeners
  document.getElementById('we-select').onchange = (e) => loadWeIntoKalk(e.target.value);
  document.getElementById('profil-select').onchange = (e) => applyProfil(e.target.value);
  bindKalkInputs();
  recalcAndRender();
}

function kalkInputsHtml(i) {
  const f = (label, key, suffix, step) => `
    <div>
      <label>${label}${suffix ? ' (' + suffix + ')' : ''}</label>
      <input data-kalk="${key}" type="number" step="${step || 'any'}" value="${i[key] === undefined || i[key] === null ? '' : i[key]}">
    </div>`;
  return [
    f('Kaufpreis', 'kaufpreis', '€'),
    f('Stellplatz-KP', 'stellplatzKp', '€'),
    f('Quadratmeter', 'qm', 'm²'),
    f('Kaltmiete', 'kaltmiete', '€/Mo'),
    f('Stellplatz-Miete', 'stellplatzMiete', '€/Mo'),
    f('Hausgeld', 'hausgeld', '€/Mo'),
    f('Mietverwaltung', 'mietverwaltung', '€/Mo'),
    f('Hausverwaltung', 'hausverwaltung', '€/Mo'),
    f('Subvention', 'subventionMo', '€/Mo'),
    f('Subv-Monate', 'subventionMonate', 'Mo'),
    f('Zins', 'zins', 'Dezimal', '0.001'),
    f('Tilgung', 'tilgung', 'Dezimal', '0.001'),
    f('AfA-Satz', 'afaSatz', 'Dezimal', '0.001'),
    f('Gebäude-Anteil', 'gebaeudeAnteil', 'Dezimal', '0.01'),
    f('Wertsteigerung', 'wertsteigerung', 'Dezimal', '0.001'),
    f('Steuersatz', 'steuersatz', 'Dezimal', '0.01'),
    f('Mietsteigerung %', 'steigerungProz', 'Dezimal', '0.001'),
    `<div><label>Mietsteig.-Modus</label>
       <select data-kalk="mietsteigerungsModus">
         <option value="sprung" ${i.mietsteigerungsModus==='sprung'?'selected':''}>Sprung (alle 3 J)</option>
         <option value="index" ${i.mietsteigerungsModus==='index'?'selected':''}>Index (jährlich)</option>
         <option value="keine" ${i.mietsteigerungsModus==='keine'?'selected':''}>Keine</option>
       </select>
     </div>`,
    `<div><label>KNK mitfinanziert</label>
       <select data-kalk="knkMitfinanziert">
         <option value="false" ${!i.knkMitfinanziert?'selected':''}>Nein</option>
         <option value="true" ${i.knkMitfinanziert?'selected':''}>Ja</option>
       </select>
     </div>`,
  ].join('');
}

function bindKalkInputs() {
  document.querySelectorAll('[data-kalk]').forEach(inp => {
    inp.addEventListener('input', () => {
      const k = inp.dataset.kalk;
      let v = inp.value;
      if (inp.type === 'number') v = parseFloat(v);
      if (v === 'true') v = true;
      if (v === 'false') v = false;
      state.kalk[k] = v;
      recalcAndRender();
    });
    inp.addEventListener('change', () => {
      const k = inp.dataset.kalk;
      let v = inp.value;
      if (inp.type === 'number') v = parseFloat(v);
      if (v === 'true') v = true;
      if (v === 'false') v = false;
      state.kalk[k] = v;
      recalcAndRender();
    });
  });
}

function applyProfil(name) {
  const P = window.Kalk.PROFILES[name];
  if (!P) return;
  Object.assign(state.kalk, JSON.parse(JSON.stringify(P)));
  renderTabKalkulator();
}
window.applyProfil = applyProfil;

function loadWeIntoKalk(weId) {
  if (!weId) return;
  const w = state.wohneinheiten.find(x => x.id === weId);
  if (!w) return;
  state.kalk.kaufpreis = w.kaufpreis || state.kalk.kaufpreis;
  state.kalk.qm = w.qm || state.kalk.qm;
  state.kalk.kaltmiete = w.kaltmiete || state.kalk.kaltmiete;
  state.kalk._weId = weId;
  state.kalk._weLage = w.lage || w.weNr;
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
  let r;
  try { r = window.Kalk.recalc(state.kalk); }
  catch (e) { console.error('recalc', e); return; }
  state.kalkResult = r;

  // KPIs
  const fmt = window.Kalk.fmtEur;
  const fmtPct = window.Kalk.fmtPct;
  const fmtEurMo = window.Kalk.fmtEurMo;
  const grid = document.getElementById('kpi-grid');
  if (!grid) return;
  const cls = (v) => v > 0 ? 'positive' : (v < 0 ? 'negative' : '');
  grid.innerHTML = `
    <div class="kpi"><div class="label">Eigenkapital-Bedarf</div><div class="value">${fmt(r.ekBedarf)}</div></div>
    <div class="kpi ${cls(r.belastungMo)}"><div class="label">Belastung Jahr 1</div><div class="value">${fmtEurMo(r.belastungMo)}</div></div>
    <div class="kpi positive"><div class="label">Vermögen brutto Jahr 10</div><div class="value">${fmt(r.vermoegenBrutto10)}</div></div>
    <div class="kpi"><div class="label">IRR (10 J)</div><div class="value">${fmtPct(r.irr)}</div></div>
    <div class="kpi"><div class="label">Darlehen</div><div class="value">${fmt(r.darlehen)}</div></div>
  `;

  // Charts
  drawCharts(r);
}

function drawCharts(r) {
  if (!window.Chart) return;
  const years = r.vermoegen.map(v => 'J' + v.y);
  const verm = r.vermoegen.map(v => Math.round(v.vermoegenBrutto));
  const cfYears = r.cf.map(c => 'J' + c.y);
  const cfVals = r.cf.map(c => Math.round(c.cfJahr));
  const sparenLbls = r.sparen.map(s => 'J' + s.y);
  const sparenNur = r.sparen.map(s => Math.round(s.nurSparen));
  const sparenMit = r.sparen.map(s => Math.round(s.mitImmo));

  if (chartV) chartV.destroy();
  chartV = new Chart(document.getElementById('chart-vermoegen'), {
    type: 'line',
    data: { labels: years, datasets: [{
      label: 'Vermögen brutto', data: verm,
      borderColor: '#B08A4D', backgroundColor: 'rgba(176,138,77,0.15)',
      tension: 0.3, fill: true,
    }] },
    options: { responsive: true, maintainAspectRatio: false }
  });

  if (chartC) chartC.destroy();
  chartC = new Chart(document.getElementById('chart-cashflow'), {
    type: 'bar',
    data: { labels: cfYears, datasets: [{
      label: 'Cashflow', data: cfVals,
      backgroundColor: cfVals.map(v => v >= 0 ? 'rgba(45,110,71,0.7)' : 'rgba(154,62,51,0.7)'),
    }] },
    options: { responsive: true, maintainAspectRatio: false }
  });

  if (chartS) chartS.destroy();
  chartS = new Chart(document.getElementById('chart-sparen'), {
    type: 'line',
    data: { labels: sparenLbls, datasets: [
      { label: 'Nur Sparen', data: sparenNur, borderColor: '#7A7A72', tension: 0.3 },
      { label: 'Mit Immobilie', data: sparenMit, borderColor: '#B08A4D', tension: 0.3 },
    ] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

async function saveSnapshot() {
  const bez = prompt('Bezeichnung für Snapshot?', 'Kalk ' + new Date().toLocaleDateString('de-DE'));
  if (!bez) return;
  try {
    const snap = await api.post('/api/snapshots', {
      kundeId: state.kundeId,
      weId: state.kalk._weId || null,
      weBezeichnung: state.kalk._weLage || '',
      pdfTyp: 'Investitionsrechnung',
      kalkJson: JSON.stringify(state.kalk),
      bezeichnung: bez,
    });
    state.snapshots.unshift(snap);
    toast('Snapshot gespeichert', 'success');
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
  let sa = {};
  try { sa = k.selbstauskunftJson ? JSON.parse(k.selbstauskunftJson) : {}; } catch(e) {}
  if (!sa.antragsteller) sa.antragsteller = {};
  if (!sa.mitantragsteller) sa.mitantragsteller = {};
  state._sa = sa;

  el.innerHTML = `
    <div class="card">
      <div class="card-title">Selbstauskunft</div>
      <div class="flex gap-12 mb-16">
        <label class="flex gap-8" style="display:flex;align-items:center;text-transform:none;letter-spacing:0;">
          <input type="checkbox" id="sa-gemeinsam" ${sa.gemeinsam !== false ? 'checked':''} style="width:auto;">
          Gemeinsamer Antrag mit Mit-Antragsteller
        </label>
      </div>
      <div class="grid-2">
        <div>
          <h3 class="section-title">Antragsteller 1</h3>
          ${saPersonHtml('a', sa.antragsteller)}
        </div>
        <div id="sa-mit-wrap">
          <h3 class="section-title">Antragsteller 2</h3>
          ${saPersonHtml('m', sa.mitantragsteller)}
        </div>
      </div>
      <div class="toolbar mt-16">
        <button onclick="saveSelbstauskunft()">Speichern</button>
        <button class="secondary" onclick="exportSaPdf()">PDF Selbstauskunft</button>
      </div>
    </div>
  `;
  document.getElementById('sa-gemeinsam').onchange = (e) => {
    sa.gemeinsam = e.target.checked;
    document.getElementById('sa-mit-wrap').style.display = e.target.checked ? '' : 'none';
  };
}

function saPersonHtml(prefix, p) {
  p = p || {};
  const f = (label, key, suffix) => `
    <div>
      <label>${label}${suffix ? ' (' + suffix + ')' : ''}</label>
      <input data-sa="${prefix}.${key}" type="number" step="any" value="${p[key] || ''}">
    </div>`;
  return `
    <div class="grid-2">
      ${f('Netto / Monat', 'nettoMo', '€')}
      ${f('Anzahl Gehälter', 'anzahlGehaelter')}
      ${f('Vermietung', 'vermietungMo', '€/Mo')}
      ${f('Sonstige Einkommen', 'sonstigeMo', '€/Mo')}
      ${f('Unterhalt erhalten', 'unterhaltMo', '€/Mo')}
      ${f('Kindergeld', 'kindergeldMo', '€/Mo')}
      ${f('Kinder Anzahl', 'kinderAnzahl')}
      ${f('Eigene Miete', 'mieteMo', '€/Mo')}
      ${f('Unterhalt gezahlt', 'unterhaltZahlungMo', '€/Mo')}
      ${f('PKV', 'pkvMo', '€/Mo')}
      ${f('Bankguthaben', 'bankguthaben', '€')}
      ${f('Wertpapiere', 'wertpapiere', '€')}
      ${f('Sparbücher', 'sparbuecher', '€')}
      ${f('Bausparen', 'bausparen', '€')}
      ${f('Sonst. Vermögen', 'sonstigeVermoegen', '€')}
    </div>
  `;
}

async function saveSelbstauskunft() {
  const sa = state._sa || { antragsteller: {}, mitantragsteller: {} };
  sa.gemeinsam = document.getElementById('sa-gemeinsam').checked;
  document.querySelectorAll('[data-sa]').forEach(inp => {
    const [prefix, key] = inp.dataset.sa.split('.');
    const target = prefix === 'a' ? 'antragsteller' : 'mitantragsteller';
    if (!sa[target]) sa[target] = {};
    sa[target][key] = inp.value === '' ? null : parseFloat(inp.value);
  });
  try {
    await api.put('/api/kunden/' + state.kundeId, {
      saJson: JSON.stringify(sa),
    });
    state.kunde.selbstauskunftJson = JSON.stringify(sa);
    toast('Selbstauskunft gespeichert', 'success');
  } catch (e) { toast('Fehler: ' + e.message, 'error'); }
}
window.saveSelbstauskunft = saveSelbstauskunft;

/* ============================== SNAPSHOTS-TAB ============================== */

function renderTabSnapshots() {
  const el = document.getElementById('tab-content');
  const ss = state.snapshots || [];
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Gespeicherte Snapshots</div>
      ${ss.length === 0 ? `
        <div class="empty-state">Noch keine Snapshots gespeichert.</div>
      ` : `
        <table class="table">
          <thead>
            <tr><th>Bezeichnung</th><th>WE</th><th>Typ</th><th>Erstellt</th><th></th></tr>
          </thead>
          <tbody>
            ${ss.map(s => `
              <tr>
                <td><strong>${esc(s.bezeichnung || '—')}</strong></td>
                <td class="text-tertiary">${esc(s.weBezeichnung || '—')}</td>
                <td>${esc(s.pdfTyp || '—')}</td>
                <td class="text-tertiary">${esc(fmtDate(s.created))}</td>
                <td><button class="secondary" onclick="loadSnapshot('${esc(s.id)}')">Laden</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

function loadSnapshot(id) {
  const s = state.snapshots.find(x => x.id === id);
  if (!s) return;
  try {
    state.kalk = JSON.parse(s.kalkulationsJson || s.kalkJson || '{}');
    setTab('kalkulator');
    toast('Snapshot geladen', 'success');
  } catch (e) { toast('Snapshot konnte nicht geladen werden.', 'error'); }
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
