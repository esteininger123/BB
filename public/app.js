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

// ===== MODUL: views/auth (renderHeader + Login + Logout + Google-Sign-In) =====
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

// ===== MODUL: lib/data-loading (loadInitialData + loadKunde + makeDefaultKalkInput) =====
/* ============================== DATA LOADING ============================== */

async function loadInitialData() {
  state.loadingData = true;
  try {
    const [kunden, wes, stammAudit] = await Promise.all([
      api.get('/api/kunden').catch(() => []),
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

// ===== MODUL: views/dashboard (renderDashboard + createNewKunde + syncStammdatenInSa) =====
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

      <div class="phasen-row">
        ${['Lead','Kalkulation läuft','Reservierung','Selbstauskunft','Bank-Einreichung','Notar-Termin','Beurkundet'].map(p => `
          <div class="phase-kpi">
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
      <div class="breadcrumb"><a href="#/dashboard">Dashboard</a> &rsaquo; ${esc(displayName)}</div>

      <div class="toolbar">
        <div>
          <h1 class="page-title">${esc(displayName)}${isArchived ? ' <span class="badge archived" style="background:#7A7A72;color:#fff;font-size:12px;font-weight:600;padding:2px 8px;border-radius:3px;vertical-align:middle;">archiviert</span>' : ''}</h1>
          <div class="flex gap-12 mt-8">
            <select id="phase-select" style="max-width:220px">
              ${PHASEN.map(p => `<option value="${esc(p)}" ${p === k.phase ? 'selected' : ''}>${esc(p)}</option>`).join('')}
            </select>
            <span class="badge ${phaseBadgeClass(k.phase)}">${esc(k.phase || 'Lead')}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          ${isOwner && !isArchived ? `<button class="secondary" onclick="archiveKunde()" title="Kunde archivieren — verschwindet aus Deiner Liste, bleibt aber für Admin zugänglich.">Archivieren</button>` : ''}
          ${isOwner && isArchived ? `<button class="secondary" onclick="unarchiveKunde()" title="Archivierung aufheben — Kunde wird wieder in der normalen Liste angezeigt.">Wiederherstellen</button>` : ''}
          ${isAdmin ? `<button class="danger" onclick="deleteKunde()" title="Endgültiges Löschen — nur Admin.">Endgültig löschen</button>` : ''}
        </div>
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
  if (!confirm('Kunde ENDGÜLTIG löschen? Dies kann nicht rückgängig gemacht werden.')) return;
  try {
    await api.delete('/api/kunden/' + state.kundeId);
    state.kunden = state.kunden.filter(x => x.id !== state.kundeId);
    state.kunde = null;
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

function renderTabUebersicht() {
  const el = document.getElementById('tab-content');
  const k = state.kunde;
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Stammdaten <span class="text-tertiary text-small" style="font-weight:normal;">(Auto-Save aktiv · spiegelt sich in die Selbstauskunft)</span></div>
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
        <span id="stamm-save-status" class="text-tertiary text-small"></span>
      </div>
    </div>

    <div class="card mt-16">
      <div class="card-title">Notizen</div>
      <textarea id="f-notizen" onblur="saveNotizen()" placeholder="Frei-Notizen, Gesprächs-Stichpunkte ...">${esc(k.notizen || '')}</textarea>
      <div class="text-tertiary text-small mt-8">Auto-Save bei Klick außerhalb.</div>
    </div>
  `;
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

// ===== MODUL: views/kalkulator-tab (~1700 LoC bis Z. 2310 — größter Brocken) =====
/* ============================== KALKULATOR-TAB ============================== */

function renderTabKalkulator() {
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
    <div class="card">
      <div class="card-title">Objekt &amp; Wohneinheit</div>
      <div class="flex gap-12 mb-12" style="align-items:center;">
        <label style="text-transform:none;letter-spacing:0;display:flex;align-items:center;gap:6px;">
          <input type="radio" name="we-mode" value="single" ${!isPaket ? 'checked' : ''} onclick="setWeMode('single')"> Einzel-WE
        </label>
        <label style="text-transform:none;letter-spacing:0;display:flex;align-items:center;gap:6px;">
          <input type="radio" name="we-mode" value="paket" ${isPaket ? 'checked' : ''} onclick="setWeMode('paket')"> Paket (mehrere)
        </label>
      </div>
      <div class="grid-3">
        <div>
          <label>1. Objekt / Projekt</label>
          <select id="projekt-select">
            <option value="">— Projekt wählen —</option>
            ${projektNames.map(p => `
              <option value="${esc(p)}" ${aktivesProjekt === p ? 'selected' : ''}>${esc(p)} (${wesByProjekt[p].length} WE)</option>
            `).join('')}
          </select>
          <div class="text-tertiary text-small mt-4">${projektNames.length} Projekt${projektNames.length === 1 ? '' : 'e'} in Vermarktung</div>
        </div>
        <div>
          ${isPaket ? `
            <label>2. Wohneinheiten im Paket</label>
            <select id="we-paket-select" multiple size="8" style="height:auto;" ${!aktivesProjekt ? 'disabled' : ''}>
              ${wesImProjekt.map(w => `
                <option value="${esc(w.id)}" ${state.kalk._paketWeIds.includes(w.id) ? 'selected' : ''}>${esc(weLabel(w))}</option>
              `).join('')}
            </select>
            <div class="text-tertiary text-small mt-4">${!aktivesProjekt ? 'Erst Projekt wählen.' : 'Ctrl/Cmd + Klick für mehrere. Aktuell: ' + state.kalk._paketWeIds.length + ' WE'}</div>
          ` : `
            <label>2. Wohneinheit</label>
            <select id="we-select" ${!aktivesProjekt ? 'disabled' : ''}>
              <option value="">${aktivesProjekt ? '— WE wählen —' : '— Erst Projekt wählen —'}</option>
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
        <div>
          <label>Bonitäts-Quelle</label>
          <select id="bon-modus-select">
            <option value="quick" ${(!i.bonModus || i.bonModus === 'quick') ? 'selected' : ''}>Quick (manuelle Eingabe)</option>
            <option value="detail" ${i.bonModus === 'detail' ? 'selected' : ''}>Detail (aus Selbstauskunft)</option>
          </select>
          <div class="mt-12">
            <button class="secondary" onclick="resetKalk()">Auf Default zurücksetzen</button>
          </div>
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
      <div class="card-title">${isPaket ? 'Persönliche Eingaben · Paket' : 'Eingaben · ' + esc((i._weNr ? 'WE ' + i._weNr + ' · ' : '') + (i._weLage || ''))}</div>
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
        <button class="secondary" onclick="exportInvestPdf()">PDF Investitionsrechnung</button>
        <button class="secondary" onclick="exportReservPdf()">PDF Reservierung</button>
        <button onclick="sendReservierungForSignature()">Reservierung digital senden</button>
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
  const applyValue = (rawPct, source) => {
    let v = parseFloat(rawPct);
    if (!isFinite(v)) v = 2.5;
    v = Math.max(0, Math.min(12, v));
    state.kalk.sparZins = v / 100;
    // Beide UI-Elemente synchronisieren
    if (source !== 'range') range.value = v.toFixed(2);
    if (source !== 'num')   num.value   = v.toFixed(2);
    lbl.textContent = v.toFixed(2).replace('.', ',') + ' %';
    recalcAndRender();
  };
  // Iter 91: oninput/onblur direkt setzen statt addEventListener, weil die
  // Elemente jetzt im Annahmen-Modal leben und bei jedem Re-Render neu
  // erzeugt werden. Direktes setzen ist idempotent (überschreibt vorigen Handler).
  range.oninput = () => applyValue(range.value, 'range');
  num.oninput   = () => applyValue(num.value,   'num');
  num.onblur    = () => applyValue(num.value,   'num');
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
          const istLuecke = ['auto-mbv-fehlt','auto-kappung-fehlt','auto-modus-fehlt','auto-kein-spielraum'].includes(quelle);
          if (istLuecke) {
            const pflegeMap = {
              'auto-mbv-fehlt':       'Miete bei Verkauf',
              'auto-kappung-fehlt':   'Kappungsgrenze',
              'auto-modus-fehlt':     'Vermietungs-Modus',
              'auto-kein-spielraum':  'Marktmiete (liegt aktuell ≤ Miete bei Verkauf)',
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
              const mo = Math.max(0, Math.round((now - d) / (1000 * 60 * 60 * 24 * 30.44)));
              monateAnzeige = mo + ' Monate her';
            }
          }
          const quelle = state.kalk._letzteMietsteigerungQuelle || '';
          const quelleLabel = quelle === 'kalk-stammdaten' ? 'aus Stammdaten' :
                              quelle === 'mietvertrag-vertragsbeginn' ? 'aus Mietvertrag (Vertragsbeginn)' :
                              quelle === 'mietvertrag' ? 'aus Mietvertrag' : '';
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
  ];
  for (const k of SNAPSHOT_KEYS) delete state.kalk[k];
}

// async, weil Airtable-Stammdaten via fetch geholt werden
async function loadWeIntoKalk(weId) {
  if (!weId) {
    _resetWeSnapshotFields();
    renderTabKalkulator();
    return;
  }
  // Reset vor jedem Load — sonst rutschen Felder der vorigen WE durch,
  // wenn die neue WE ein Feld leer/null liefert (z.B. keine Vereinbarung).
  _resetWeSnapshotFields();
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
      if (sd.hgInflation !== null)           state.kalk.hgInflation = sd.hgInflation;
      // Iter 41.9 / 41.15 — Miete bei Verkauf ersetzt NUR die Wohnungs-Kaltmiete.
      // Stellplatzmiete bleibt separat in state.kalk.stellplatzMiete.
      if (sd.mieteBeiVerkauf != null && sd.mieteBeiVerkauf > 0) {
        state.kalk.kaltmiete = sd.mieteBeiVerkauf;
        state.kalk._mieteBeiVerkaufActive = true;
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
      } else if (sd.vermietungsModus === 'Bestand') {
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
    // Endpoint nicht erreichbar oder Fehler → wir bleiben beim Excel-Fallback
    console.warn('[stammdaten] Airtable-Endpoint fehlgeschlagen, nutze Fallback:', e.message);
  }

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
              hgInflation: (kalk && kalk.hgInflation) || 0.02,
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

  const markteinkauf = (marktQm > 0) ? story('01 — Markteinkauf', 'Du kaufst unter Marktpreis', `
    <div class="story-grid">
      <table class="story-table">
        <tr><td>Dein Kaufpreis / qm</td><td class="num">${Math.round(kpQm).toLocaleString('de-DE')} €/qm</td></tr>
        <tr><td>Marktpreis / qm</td><td class="num">${Math.round(marktQm).toLocaleString('de-DE')} €/qm</td></tr>
        <tr><td>Wohnfläche</td><td class="num">${(i.qm || 0).toLocaleString('de-DE')} qm</td></tr>
        <tr><td><strong>Dein Vorteil Tag 1</strong></td><td class="num pos"><strong>${fmt(r.markteinkaufVorteil)}</strong></td></tr>
      </table>
      <div class="story-explain">
        Du kaufst diese Wohnung für <strong>${Math.round(kpQm).toLocaleString('de-DE')} €/qm</strong>, der Marktpreis liegt bei <strong>${Math.round(marktQm).toLocaleString('de-DE')} €/qm</strong>. Dein Vorteil <strong>steckt im Kaufpreis</strong> und macht Deinen Vermögensaufbau ab Tag 1 belastbar — unabhängig von Wertsteigerung und Mietentwicklung.
        ${marktQuellenHinweis}
      </div>
    </div>
  `) : '';

  // Iter 41.15 (Audit-Fix #9): Miete-Aufschlüsselung in Story 02
  const kaltmieteJ1Mo = i.kaltmiete || 0;
  const stellplatzMieteJ1Mo = i.stellplatzMiete || 0;
  const subvJ1Mo = (Array.isArray(i.subventionPhasen) && i.subventionPhasen[0] && i.subventionPhasen[0].monate >= 1)
    ? i.subventionPhasen[0].mo
    : (i.subventionMo || 0);
  const mieteAufschluesselung = `
    <tr><td>· davon Deine Kaltmiete Wohnung</td><td class="num pos">+ ${fmtEurMo(kaltmieteJ1Mo)}</td></tr>
    ${stellplatzMieteJ1Mo > 0 ? `<tr><td>· davon Deine Stellplatz-/Garagenmiete</td><td class="num pos">+ ${fmtEurMo(stellplatzMieteJ1Mo)}</td></tr>` : ''}
    ${subvJ1Mo > 0 ? `<tr><td>· davon Deine Mietsubvention${(Array.isArray(i.subventionPhasen) && i.subventionPhasen.length >= 2) ? ' (Phase 1)' : ''}</td><td class="num pos">+ ${fmtEurMo(subvJ1Mo)}</td></tr>` : ''}
  `;

  const cashflowHeute = story('02 — Cashflow heute', 'Was Du Monat für Monat einplanst', `
    <div class="story-grid">
      <table class="story-table">
        <thead><tr><th>Position</th><th class="num">€/Monat</th></tr></thead>
        <tr><td><strong>Deine Mieteinnahmen gesamt Jahr 1</strong></td><td class="num pos"><strong>+ ${fmtEurMo(r.mieteJ1Mo || 0)}</strong></td></tr>
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

  el.innerHTML = (markteinkauf || markteinkaufHint) + cashflowHeute + steuervorteil + dreiHebel + exit10 + bonStory + sparenStory;
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
  const crossoverIdx = r.cf.findIndex(c => c.cfJahr > 0);
  const crossoverJahr = crossoverIdx >= 0 ? (crossoverIdx + 1) : null;
  const crossoverSatz = crossoverJahr
    ? `Ab Jahr <span class="positive">${crossoverJahr}</span> dreht die Belastung ins Plus`
    : `Über die 10 Jahre bleibt Deine Belastung im negativen Bereich`;

  const nettoCrossoverIdx = r.vermoegen.findIndex(v => v.vermoegenNetto > 0);
  const nettoCrossoverJahr = nettoCrossoverIdx >= 0 ? nettoCrossoverIdx : null;
  const nettoCrossoverSatz = nettoCrossoverJahr
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

  // KNK-Berechnung (= EK-Bedarf wenn KNK nicht mitfinanziert)
  const knk = i.knkMitfinanziert ? 0 : r.ekBedarf;

  // ===== HERO =====
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
          In zehn Jahren hast Du <span class="kalk-c-num-accent">${fmt(r.vermoegenNetto10)}</span> aufgebaut.
        </h1>
        <p class="kalk-c-hero-sub">
          ${i.qm ? 'Eine ' + i.qm.toString().replace('.', ',') + '-qm-Wohnung' : 'Eine Wohnung'} im Bestand. Die folgende Analyse zeigt Deinen Vermögensaufbau, Deine monatliche Belastung und den Vergleich zur klassischen Sparbuch-Alternative.
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
          <div class="kalk-c-objekt-row"><span class="kalk-c-k">Marktpreis je qm</span><span class="kalk-c-v">${marktQm > 0 ? Math.round(marktQm).toLocaleString('de-DE') : '—'}<span class="kalk-c-unit">€</span></span></div>
          ${r.markteinkaufVorteil ? `<div class="kalk-c-objekt-row"><span class="kalk-c-k">Markteinkauf-Vorteil</span><span class="kalk-c-v">${fmt(r.markteinkaufVorteil)}</span></div>` : ''}
          <div class="kalk-c-objekt-row"><span class="kalk-c-k">Kaltmiete</span><span class="kalk-c-v">${Math.round(i.kaltmiete || 0).toLocaleString('de-DE')}<span class="kalk-c-unit">€/Mo</span></span></div>
          <div class="kalk-c-objekt-row"><span class="kalk-c-k">Stellplatz-Miete</span><span class="kalk-c-v">${Math.round(i.stellplatzMiete || 0).toLocaleString('de-DE')}<span class="kalk-c-unit">€/Mo</span></span></div>
          <div class="kalk-c-objekt-row"><span class="kalk-c-k">Hausgeld · HV · MV</span><span class="kalk-c-v">${Math.round(i.hausgeld || 0)} / ${Math.round(i.hausverwaltung || 0)} / ${Math.round(i.mietverwaltung || 0)}<span class="kalk-c-unit">€/Mo</span></span></div>
        </div>
      </div>
      <div class="kalk-c-einsatz-block">
        <div class="kalk-c-einsatz-head">Was Du einsetzt — Dein Eintritt in den Sachwert</div>
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
          Die Kaufnebenkosten sind kein Verlust — sie sind der einmalige Eintrittspreis in den Sachwert. Mit diesem Einsatz sicherst Du Dir Zugang zu allen Vorteilen, die auf den nächsten Abschnitten folgen.
        </p>
      </div>

      ${(r.mietsubventionGesamt && r.mietsubventionGesamt > 0) ? `
      <div class="kalk-c-einsatz-block" style="margin-top:24px;background:var(--positive-bg);">
        <div class="kalk-c-einsatz-head">Was wir dazu legen — Mietsubvention vom Verkäufer</div>
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
  const SECTION_2 = `
    <section class="kalk-c-section">
      <div class="kalk-c-section-head">
        <div class="kalk-c-left">
          <div class="kalk-c-section-num">02 · Die nächsten zehn Jahre</div>
          <h2 class="kalk-c-section-title">Effektive Belastung im ersten Jahr: ${fmtEurMo(r.belastungMo)}.</h2>
        </div>
        <div class="kalk-c-right">
          Die Wohnung trägt sich nahezu selbst. Was bleibt, ist eine kalkulierte monatliche Eigenleistung, die mit der Zeit kleiner wird.
        </div>
      </div>
      <div class="kalk-c-two-col">
        <div class="kalk-c-col-chart">
          <div class="kalk-c-chart-frame"><canvas id="chart-c-belastung"></canvas></div>
          <div class="kalk-c-chart-caption">Cashflow nach Steuern, je Monat · Annuität konstant</div>
          <div class="kalk-c-modus-toggle" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border)">
            <div style="font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--text-tertiary);font-weight:500;margin-bottom:10px">Mietsteigerungs-Modus</div>
            <div class="kalk-c-modus-buttons" style="display:flex;gap:0;border:1px solid var(--border);border-radius:2px;overflow:hidden">
              ${(() => {
                const modi = [
                  {v:'sprung',  l:'Bestand · alle 3 J'},
                  {v:'staffel', l:'Staffel · jährlich'},
                  {v:'index',   l:'Index · jährlich'},
                  {v:'keine',   l:'Keine'}
                ];
                return modi.map((opt, idx) => {
                  const aktiv = i.mietsteigerungsModus === opt.v;
                  const borderR = idx < modi.length - 1 ? 'border-right:1px solid var(--border);' : '';
                  return `<button type="button" data-modus="${opt.v}" style="flex:1;padding:9px 8px;background:${aktiv ? 'var(--accent)' : 'transparent'};color:${aktiv ? 'var(--on-accent)' : 'var(--text-secondary)'};border:none;${borderR}font-family:inherit;font-size:11.5px;font-weight:${aktiv ? '500' : '400'};cursor:pointer;letter-spacing:.02em;transition:background .15s ease,color .15s ease">${opt.l}</button>`;
                }).join('');
              })()}
            </div>
            <div style="margin-top:8px;font-size:11px;color:var(--text-tertiary);line-height:1.5">
              Bestandsmiete: Sprünge alle 36 Monate (gesetzliche Kappung). Staffel/Index: jährliche Steigerung. <strong style="color:var(--text-secondary)">Aktiv:</strong> ${(() => { const m = {sprung:'Sprung alle 3 Jahre',staffel:'Staffelmiete jährlich',index:'Indexmiete jährlich',keine:'keine Steigerung'}[i.mietsteigerungsModus] || '—'; return m + (i.mietsteigerungsModus !== 'keine' ? ` · +${(((i.steigerungProz || 0) * 100).toFixed(1).replace('.', ','))} %` : ''); })()}
            </div>
          </div>
        </div>
        <div class="kalk-c-col-text">
          <p class="kalk-c-lead">Eine Annuität von ${fmtEurMo(r.annuityMo)} steht Mieteinnahmen von ${fmtEurMo(r.mieteJ1Mo)} gegenüber. Dein Steuervorteil und in den ersten Jahren eine vereinbarte Mietsubvention glätten die Anlaufphase.</p>
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
  const metaLine3 = ekIstNull
    ? `Brutto-Vermögen J10 · ${fmt(v10.vermoegenBrutto || (v10.wert - v10.restschuld))} &nbsp;·&nbsp; ohne EK-Einsatz`
    : `IRR 10 J · ${fmtPct(r.irr)} &nbsp;·&nbsp; Brutto-Vermögen J10 · ${fmt(v10.vermoegenBrutto || (v10.wert - v10.restschuld))}`;
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
        <div class="kalk-c-compare-sub">Bei 110-%-Finanzierung setzt Du kein eigenes Kapital ein. Trotzdem baust Du in 10 Jahren ${fmt(r.vermoegenNetto10)} Nettovermögen auf — getragen von Tilgung und Wertentwicklung. Der Hebel kommt aus dem Sachwert, nicht aus Deinem Sparbuch.</div>
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
        <p>Diese Analyse stützt sich auf dokumentierte Annahmen. Du kannst jeden Wert nachvollziehen — Cashflow-Reihen, Vermögensaufstellung, Bonität nach Erwerb sowie die zugrunde liegenden Rechen-Parameter.</p>
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
          <div class="kalk-c-section-num">06 · Wie es weitergeht</div>
          <h2 class="kalk-c-section-title">Sechs Schritte bis zum Notartermin.</h2>
        </div>
        <div class="kalk-c-right">
          Wir beurkunden den Kauf erst dann, wenn drei Voraussetzungen sauber erfüllt sind: Deine Finanzierung steht, die Objektunterlagen passen zu dem, was Du hier siehst, und Du hast die Wohnung besichtigt. Fehlt einer dieser Punkte — kein Notartermin.
        </div>
      </div>
      <ol class="kalk-c-weg-list">
        <li class="kalk-c-weg-step"><div class="kalk-c-weg-num">1</div><div class="kalk-c-weg-body"><div class="kalk-c-weg-title">Selbstauskunft vollständig ausfüllen</div><div class="kalk-c-weg-desc">Bonität-Grundlage für die Bank — wir helfen Dir durch jedes Feld. Dauert in der Regel 20–30 Minuten.</div></div></li>
        <li class="kalk-c-weg-step"><div class="kalk-c-weg-num">2</div><div class="kalk-c-weg-body"><div class="kalk-c-weg-title">Wohneinheit sichern</div><div class="kalk-c-weg-desc">Reservierung. Die Wohneinheiten gehen unter Marktwert weg — die Reservierung schützt Dich davor, dass sie an einen anderen Interessenten geht, während Du die nächsten Schritte gehst.</div></div></li>
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
          <div class="kalk-c-section-num">07 · Wer wir sind</div>
          <h2 class="kalk-c-section-title">Brot &amp; Butter.</h2>
        </div>
        <div class="kalk-c-right">
          Unser Name ist unser Geschäftsmodell. Wir kaufen die großen Brote und veredeln sie mit Butter — bevor wir scheibenweise an Dich weitergeben.
        </div>
      </div>
      <div class="kalk-c-bub-grid">
        <div class="kalk-c-bub-cell"><div class="kalk-c-bub-step">Brot</div><div class="kalk-c-bub-body">Wir kaufen bei großen Immobiliengesellschaften ganze Bestände zu Preisen, die für Einzelkäufer nie sichtbar werden. Volumen schafft den Einkaufsvorteil — das ist das Leibbrot.</div></div>
        <div class="kalk-c-bub-cell"><div class="kalk-c-bub-step">Teilen</div><div class="kalk-c-bub-body">Aus dem Bestand werden einzelne Scheiben — einzelne Wohneinheiten, die wir vermarktungsfähig machen. Jede Einheit bekommt ihren eigenen Pfad.</div></div>
        <div class="kalk-c-bub-cell"><div class="kalk-c-bub-step">Butter</div><div class="kalk-c-bub-body">Veredelung. Bevor eine Wohnung zu Dir kommt, machen wir den Hausverwaltungs-Wechsel, prüfen die Rücklage, setzen notwendige Maßnahmen an und begutachten den Zustand sehr genau.</div></div>
        <div class="kalk-c-bub-cell"><div class="kalk-c-bub-step">Weitergabe</div><div class="kalk-c-bub-body">Portionsgerecht. Nicht jeder kann ein Mehrfamilienhaus kaufen — eine einzelne Wohnung schon. So machen wir den Sachwert für Privatanleger zugänglich.</div></div>
      </div>
      <div class="kalk-c-bub-foot">
        <div class="kalk-c-bub-foot-item"><strong>Keine Vertriebsprovision.</strong> Du zahlst keinen Vermittler-Aufschlag. Unser Geld verdienen wir im Einkauf, nicht am Verkauf.</div>
        <div class="kalk-c-bub-foot-item"><strong>Skin in the Game.</strong> Wir behalten regelmäßig Einheiten im eigenen Bestand. Auch die Gesellschafter kaufen privat — wir investieren in das, was wir Dir anbieten.</div>
      </div>
    </section>
  `;

  // ===== CLOSING =====
  const CLOSING = `
    <footer class="kalk-c-closing">
      <div class="kalk-c-signature">
        <strong>${esc(u.name || 'Edgar Steininger')}</strong>${u.name ? '' : ' · B&amp;B Immo GmbH'}<br>
        ${esc(u.email || '')}${u.telefon ? ' · ' + esc(u.telefon) : ''}
      </div>
      <p class="kalk-c-disclaimer">
        Diese Investitionsrechnung beruht auf den dokumentierten Annahmen. Keine Anlageberatung im Sinne des WpHG. Verbindlich ist ausschließlich der notarielle Kaufvertrag. Steuerliche Aspekte sind mit Deinem Steuerberater abzustimmen.
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
        <div class="kalk-c-sub">Wirkung der Investition auf Deine monatliche Liquidität und Dein freies Eigenkapital. Die Mietsubvention wird bei richtiger Gestaltung wie Miete angesetzt (80 % anrechenbar).</div>
        <div class="kalk-c-saldo-grid">
          <div class="kalk-c-saldo-card">
            <div class="kalk-c-label">Frei verfügbares Einkommen — Bank-Sicht</div>
            <div class="kalk-c-row"><span>Vor Investment</span><span>${fmtEurMo(r.bonVor || 0)}</span></div>
            <div class="kalk-c-row"><span>+ Anrechenbare Miete (80 %)</span><span class="kalk-c-pos">+ ${fmtEurMo(r.bonMieteAnr || 0)}</span></div>
            <div class="kalk-c-row"><span>− Annuität</span><span class="kalk-c-neg">− ${fmtEurMo(r.bonAnnuMo || 0)}</span></div>
            ${r.bonModus === 'detail' ? `
            <div class="kalk-c-row"><span>− Hausgeld (bank-konservativ)</span><span class="kalk-c-neg">− ${fmtEurMo(r.hausgeldNurMo || 0)}</span></div>
            <div class="kalk-c-row"><span>− Hausverwaltung</span><span class="kalk-c-neg">− ${fmtEurMo(r.hausverwaltungMo || 0)}</span></div>` : ''}
            <div class="kalk-c-row kalk-c-total"><span>Nach Investment</span><span class="kalk-c-accent">${fmtEurMo(r.bonNach || 0)}</span></div>
          </div>
          <div class="kalk-c-saldo-card">
            <div class="kalk-c-label">Freies Eigenkapital</div>
            <div class="kalk-c-row"><span>Vor Erwerb</span><span>${fmt(r.bonVermoegen || 0)}</span></div>
            <div class="kalk-c-row"><span>Einsatz Erwerb (EK + KNK)</span><span class="kalk-c-neg">− ${fmt(r.ekBedarf)}</span></div>
            <div class="kalk-c-row kalk-c-total"><span>Nach Erwerb</span><span class="kalk-c-accent">${fmt(r.bonVermoegenVsEk || 0)}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Cashflow J1-J10
  const cashflowRows = r.cf.slice(0, 10).map((c, idx) => {
    const mo = Math.round(c.cfJahr / 12);
    const cls = mo >= 0 ? 'kalk-c-pos' : 'kalk-c-neg';
    const jahressumme = Math.round(c.cfJahr);
    const summe_cls = jahressumme >= 0 ? 'kalk-c-pos' : 'kalk-c-neg';
    return `<tr><td>${c.y}</td><td class="kalk-c-r ${cls}">${mo > 0 ? '+' : ''}${mo}</td><td class="kalk-c-r ${summe_cls}">${jahressumme > 0 ? '+' : ''}${jahressumme.toLocaleString('de-DE')}</td></tr>`;
  }).join('');
  const cfSumme = Math.round(r.cf.slice(0, 10).reduce((s, c) => s + c.cfJahr, 0));
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
  const annahmenModal = `
    <div class="kalk-c-modal-backdrop" data-kalk-c-modal-id="annahmen">
      <div class="kalk-c-modal">
        <button class="kalk-c-modal-close" data-kalk-c-close>Schließen ×</button>
        <div class="kalk-c-eyebrow">05 · Detail · Annahmen</div>
        <h3>Rechen-Parameter und Disclaimer</h3>
        <div class="kalk-c-sub">Alle Werte in der Analyse leiten sich aus den nachfolgenden Annahmen ab. Abweichungen verändern Deinen tatsächlichen Verlauf.</div>
        <div class="kalk-c-assumptions">
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Kaufpreis gesamt</span><span class="kalk-c-v">${fmt(r.kpGesamt)}</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Kaufnebenkosten</span><span class="kalk-c-v">${fmt(knk)}${i.knkMitfinanziert ? ' (mitfinanziert)' : ''}</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Eigenkapital-Einsatz</span><span class="kalk-c-v">${fmt(r.ekBedarf)}</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Annuität pro Monat</span><span class="kalk-c-v">${fmtEurMo(r.annuityMo)}</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Zinssatz Darlehen</span><span class="kalk-c-v">${fmtPct(i.zins || 0)} p.a.</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Anfangstilgung</span><span class="kalk-c-v">${fmtPct(i.tilgung || 0)} p.a.</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Wertsteigerung</span><span class="kalk-c-v">${fmtPct(i.wertsteigerung || 0.03)} p.a.</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Mietsteigerung</span><span class="kalk-c-v">${fmtPct(i.steigerungProz || 0.02)} p.a.</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Steuersatz</span><span class="kalk-c-v">${fmtPct(i.steuersatz || 0.3)}</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">AfA-Satz</span><span class="kalk-c-v">${fmtPct(i.afaSatz || 0.02)} linear</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Mietsubvention</span><span class="kalk-c-v">${subvText}</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Sparbuch-Vergleich</span><span class="kalk-c-v"><span id="spar-zins-val" style="display:inline-block;min-width:48px;text-align:right;">${((state.kalk.sparZins || 0.025) * 100).toFixed(2).replace('.',',')} %</span> p.a.</span></div>
          <div class="kalk-c-ass-row"><span class="kalk-c-k">Marktpreis je qm Ref.</span><span class="kalk-c-v">${marktQm > 0 ? Math.round(marktQm).toLocaleString('de-DE') + ' €' : '—'}</span></div>
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

  // ===== Concat + Render =====
  el.innerHTML = '<div class="kalk-c-magazine">'
    + HERO
    + SECTION_1
    + SECTION_2
    + SECTION_3
    + SECTION_4
    + SECTION_5
    + SECTION_6
    + SECTION_7
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

  // Chart 2 — Vermögen Netto + Brutto-Verkaufserlös (gestrichelt)
  const cVer = document.getElementById('chart-c-vermoegen-magazin');
  if (cVer) {
    if (_cMagazinCharts.vermoegen) _cMagazinCharts.vermoegen.destroy();
    const labels = ['J1','J2','J3','J4','J5','J6','J7','J8','J9','J10'];
    const netto = r.vermoegen.slice(1, 11).map(v => Math.round(v.vermoegenNetto || 0));
    const brutto = r.vermoegen.slice(1, 11).map(v => Math.round((v.verkaufserloes !== undefined ? v.verkaufserloes : (v.wert - v.restschuld))));
    _cMagazinCharts.vermoegen = new Chart(cVer, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Nettovermögen', data: netto,
            borderColor: accent, backgroundColor: 'rgba(176,138,77,.08)',
            borderWidth: 2.2, fill: true, tension: 0.32, pointRadius: 0, pointHoverRadius: 4
          },
          {
            label: 'Brutto-Vermögen (Verkaufserlös)', data: brutto,
            borderColor: tertiary, borderDash: [4, 4], backgroundColor: 'transparent',
            borderWidth: 1.5, fill: false, tension: 0.32, pointRadius: 0, pointHoverRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: true, position: 'bottom', labels: { color: tertiary, font: { size: 10 }, boxWidth: 12 } },
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
    _cMagazinCharts.compare = new Chart(cCmp, {
      type: 'bar',
      data: {
        labels: ['Sparbuch (2,5 % p.a.)', 'Sachwert Immobilie'],
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
      if (m) { m.classList.add('kalk-c-open'); document.body.style.overflow = 'hidden'; }
    };
  });
  const closes = document.querySelectorAll('.kalk-c-modal-backdrop [data-kalk-c-close]');
  closes.forEach(btn => {
    btn.onclick = () => _closeAllCModals();
  });
  document.querySelectorAll('.kalk-c-modal-backdrop').forEach(bk => {
    bk.onclick = (e) => { if (e.target === bk) _closeAllCModals(); };
  });
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

  // Iter 91.1: Mietsteigerungs-Modus-Toggle in Section 2 — klick wechselt
  // state.kalk.mietsteigerungsModus und löst Recalc aus. Sichtbar damit
  // Edgar sofort sieht ob Sprung-Modus (alle 3 J) oder jährlich aktiv ist.
  document.querySelectorAll('.kalk-c-modus-buttons button[data-modus]').forEach(btn => {
    btn.onclick = () => {
      const v = btn.getAttribute('data-modus');
      if (state.kalk && v) {
        state.kalk.mietsteigerungsModus = v;
        if (typeof recalcAndRender === 'function') recalcAndRender();
      }
    };
  });
}
function _closeAllCModals() {
  document.querySelectorAll('.kalk-c-modal-backdrop.kalk-c-open').forEach(m => m.classList.remove('kalk-c-open'));
  document.body.style.overflow = '';
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

async function sendReservierungForSignature() {
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

  // Modal 1: Bestätigung vor API-Call
  const userConfirmed = await openReservierungConfirmModal({ kundeName, weLabel, kundeEmail });
  if (!userConfirmed) return;

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
    toast('Fehler: ' + (e.message || 'unbekannt') + hint + detail, 'error');
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
    .reserv-modal .reserv-confirm {
      background: #1a1a1a; color: #fff;
    }
    .reserv-modal .reserv-confirm:hover { background: #000; }
    .reserv-modal a.reserv-cta {
      background: #1a1a1a; color: #fff; font-weight: 500;
    }
    .reserv-modal a.reserv-cta:hover { background: #000; }
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

async function sendSaForSignature() {
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

  const kundeName = ((a.vorname || '') + ' ' + (a.name || '')).trim() || '(ohne Name)';
  const mitName = gemeinsam ? ((m.vorname || '') + ' ' + (m.name || '')).trim() : null;

  // Modal 1: Bestätigung vor API-Call
  const userConfirmed = await openSaConfirmModal({ kundeName, kundeEmail: a.email, mitName, mitEmail: gemeinsam ? m.email : null });
  if (!userConfirmed) return;

  // HTML generieren (im Browser, mit Inline-CSS für PandaDoc)
  if (!window.PDF || typeof window.PDF.selbstauskunftHtmlForPandaDoc !== 'function') {
    toast('PDF-Modul nicht aktuell — Seite neu laden (Cache-Bust)', 'error');
    return;
  }
  // collectSaFromDOM stellt sicher, dass state._sa den aktuellen UI-Stand hat
  collectSaFromDOM();
  state.kunde.saJson = state._sa;
  const html = window.PDF.selbstauskunftHtmlForPandaDoc(state.kunde, state.user);

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
  }
}
window.sendSaForSignature = sendSaForSignature;

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
  const pflichtPro = [
    { sek: 'Person',          felder: ['vorname','name','geburtsdatum','strasse','plz','ort','staatsangehoerigkeit','telefonPrivat','email','steuerId','familienstand'] },
    { sek: 'Beruf',           felder: ['beruf','firma','beschaeftigtSeit','befristung'] },
    { sek: 'Einkommen',       felder: ['nettoMo','anzahlGehaelter'] },
    { sek: 'Fixkosten',       felder: ['mieteMo'] },
    { sek: 'Vermögen',        felder: ['bankguthaben'] },
    { sek: 'GwG-Identität',   felder: ['gwg.ausweisArt','gwg.ausweisNr','gwg.ausweisGueltig'] },
    { sek: 'PEP-Status',      felder: ['pep'] },
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
      <div class="card-title">Selbstauskunft <span class="text-tertiary text-small" style="font-weight:normal;">(Auto-Save aktiv)</span></div>

      ${/* Iter 72 (21.05.2026): Einleitung als ausklappbares <details> — Standard zu. */ ''}
      <details class="sa-intro-details" data-sec-state="sa-intro" ${isSaSectionOpen('sa-intro') ? 'open' : ''} style="background:#FAF6EE;border-left:3px solid #C9A961;padding:0;margin:8px 0 20px;border-radius:4px;font-size:14px;line-height:1.55;color:#3A2E13;">
        <summary style="padding:12px 18px;cursor:pointer;font-weight:600;font-size:15px;list-style:none;">ℹ Wie diese Selbstauskunft funktioniert <span class="text-tertiary text-small" style="font-weight:normal;">(klick zum Ausklappen)</span></summary>
        <div style="padding:0 18px 14px;">
          <p style="margin:0 0 8px;">Sie ist bewusst <strong>schlank</strong> gehalten — vier Bausteine: <strong>① Einnahmen, ② Ausgaben, ③ Vermögen, ④ Verbindlichkeiten</strong>. Pro Baustein gibt es die wichtigsten Pflichtfelder als Standard und einen <strong>Baukasten</strong> für alles Individuelle.</p>
          <p style="margin:0 0 8px;">Im Baukasten kannst Du beliebig viele Positionen mit <strong>Titel + Notiz + Betrag</strong> anlegen. Damit bläht die SA nicht mit ungenutzten Feldern auf, deckt aber jeden Sonderfall ab.</p>
          <p style="margin:0 0 8px;"><strong>Fonds-Logik (Cross-Reference):</strong> Wenn ein Fondssparplan bespart wird, leg ihn zweimal an — einmal in <em>② Ausgaben</em> mit der Mo-Rate, einmal in <em>③ Vermögen</em> mit dem aktuellen Bestand. <strong>Vergibst Du beide Mal den gleichen Titel</strong> („Fondssparplan Riester"), ist die Verknüpfung sichtbar.</p>
          <p style="margin:0;"><strong>Checklisten</strong> in jedem Block erinnern Dich, was Du beim Kunden abfragen solltest.</p>
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
      </div>
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
async function autoSaveSa() {
  // Debounce: 600ms warten und einmalig speichern
  clearTimeout(_saAutoSaveTimer);
  _saAutoSaveTimer = setTimeout(async () => {
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
    try {
      await api.put('/api/kunden/' + state.kundeId, payload);
      state.kunde.saJson = sa;
    } catch (e) {
      console.error('autoSaveSa', e);
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

  const zeile = (key, label, extraInputKey, extraPlaceholder) => {
    const istAktiv = aktiv(key);
    const extraInputHtml = extraInputKey
      ? `<input type="text" data-sa="sa.herkunftEk.${extraInputKey}" placeholder="${esc(extraPlaceholder || '')}" value="${esc(h[extraInputKey] || '')}" style="font-size:12px;padding:4px 6px;border:1px solid #D6D2C8;border-radius:2px;background:white;width:100%;">`
      : '';
    return `
      <div style="display:grid;grid-template-columns:20px 1fr ${extraInputKey ? '1.2fr' : ''} 110px;gap:8px;align-items:center;padding:4px 0;">
        <input type="checkbox" data-sa="sa.herkunftEk.${key}" ${istAktiv ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;margin:0;">
        <label style="font-size:13px;cursor:pointer;margin:0;font-weight:400;text-transform:none;letter-spacing:0;">${esc(label)}</label>
        ${extraInputKey ? `<div>${extraInputHtml}</div>` : ''}
        <div style="position:relative;">
          <input type="number" step="any" placeholder="€" data-sa="sa.herkunftEk.${key}Betrag" value="${(parseFloat(h[key + 'Betrag']) || '') || ''}" style="width:100%;text-align:right;padding:4px 22px 4px 6px;font-size:13px;border:1px solid #D6D2C8;border-radius:2px;background:white;">
          <span style="position:absolute;right:6px;top:50%;transform:translateY(-50%);color:#aaa;pointer-events:none;font-size:11px;">€</span>
        </div>
      </div>`;
  };

  return `
    <details class="sa-section" data-sec-state="sa-ek-herkunft" ${isSaSectionOpen('sa-ek-herkunft') || anyAktiv ? 'open' : ''}>
      <summary style="font-size:14px;">Eigenkapital · Herkunft <span class="text-tertiary text-small" style="font-weight:normal;">(GwG-Vorabfrage — Bank verlangt sie ohnehin)</span></summary>
      <div style="background:#FAF7F0;padding:8px 12px;border-radius:3px;margin-top:6px;">
        ${zeile('ersparnisse', 'Eigene Ersparnisse')}
        ${zeile('schenkung', 'Schenkung / Erbschaft', 'schenkGeber', 'Schenker / Erblasser')}
        ${zeile('verkauf', 'Verkaufserlös (Immobilie, Wertpapiere)', 'verkaufObjekt', 'Objekt + Jahr')}
        ${zeile('bauspar', 'Bausparvertrag (zuteilungsreif)', 'bauspKasse', 'Bausparkasse')}
        ${zeile('lv', 'Lebens-/Rentenversicherung', 'lvAnbieter', 'Versicherer')}
        ${zeile('sonstiges', 'Sonstige Quelle', 'sonstQuelle', 'z.B. AG-Darlehen, Eigenleistung')}
      </div>
      <div style="margin-top:8px;">
        <input type="text" data-sa="sa.herkunftEk.erlaeuterung" placeholder="Anmerkung (optional) — z.B. „Notarvertrag liegt vor", „Schenkung Eltern Mai 2026"" value="${esc(h.erlaeuterung || '')}" style="width:100%;font-size:13px;padding:6px 10px;border:1px solid #D6D2C8;border-radius:3px;background:#FAF7F0;">
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
  function zusatzListeInline(kategorie, subHeader, hint, variant, addLabel) {
    const liste = Array.isArray(p[kategorie]) ? p[kategorie] : [];
    const istDoppel = variant === 'mo-wert';
    const dz = (idx, feld) => `data-sa-zusatz="${prefix}.${kategorie}.${idx}.${feld}"`;
    const rows = liste.map((item, idx) => {
      let inputs;
      if (istDoppel) {
        inputs = `<input type="number" step="any" placeholder="€/Mo Belastung" ${dz(idx, 'mo')} value="${item.mo !== undefined && item.mo !== null ? item.mo : ''}" class="sa-zusatz-mo">
                  <input type="number" step="any" placeholder="€ Restsaldo" ${dz(idx, 'wert')} value="${item.wert !== undefined && item.wert !== null ? item.wert : ''}" class="sa-zusatz-wert">`;
      } else if (variant === 'mo') {
        inputs = `<input type="number" step="any" placeholder="€/Mo" ${dz(idx, 'mo')} value="${item.mo !== undefined && item.mo !== null ? item.mo : ''}" class="sa-zusatz-betrag">`;
      } else {
        inputs = `<input type="number" step="any" placeholder="€" ${dz(idx, 'wert')} value="${item.wert !== undefined && item.wert !== null ? item.wert : ''}" class="sa-zusatz-betrag">`;
      }
      return `
        <div class="sa-zusatz-row" data-zusatz-row="${prefix}.${kategorie}.${idx}" style="display:grid;grid-template-columns:1.2fr 1.5fr ${istDoppel ? '1fr 1fr' : '1fr'} auto;gap:8px;align-items:center;margin-bottom:6px;">
          <input type="text" placeholder="Titel (z.B. Fondssparplan Riester)" ${dz(idx, 'titel')} value="${esc(item.titel || '')}">
          <input type="text" placeholder="Notiz (optional)" ${dz(idx, 'notiz')} value="${esc(item.notiz || '')}">
          ${inputs}
          <button type="button" class="sa-zusatz-remove secondary" data-zusatz-remove="${prefix}.${kategorie}.${idx}" title="Position entfernen" style="padding:4px 10px;line-height:1;">−</button>
        </div>`;
    }).join('');
    return `
      <div class="sa-baukasten" style="margin-top:14px;padding-top:14px;border-top:1px dashed #D6D2C8;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
          <div style="font-weight:600;color:#3A2E13;font-size:14px;">${esc(subHeader)} <span class="text-tertiary text-small" style="font-weight:normal;">(${liste.length})</span></div>
        </div>
        ${hint ? `<div class="text-tertiary text-small mb-8">${hint}</div>` : ''}
        <div class="sa-zusatz-list">${rows || '<div class="text-tertiary text-small" style="margin-bottom:6px;">Noch keine zusätzliche Position erfasst.</div>'}</div>
        <button type="button" class="sa-zusatz-add secondary mt-8" data-zusatz-add="${prefix}.${kategorie}${istDoppel ? '|verbindlichkeit' : ''}">+ ${esc(addLabel || 'Position hinzufügen')}</button>
      </div>
    `;
  }

  // Checklisten-Infobox pro Block — erinnert den Vertriebler, was abgefragt werden sollte.
  function checklistBox(titel, items) {
    return `
      <div class="sa-checklist" style="background:#FAF6EE;border-left:3px solid #C9A961;padding:10px 14px;margin:0 0 12px;border-radius:4px;font-size:13px;">
        <div style="font-weight:600;color:#5C4922;margin-bottom:6px;">📋 Checkliste · ${esc(titel)}</div>
        <ul style="margin:0;padding-left:18px;color:#5C4922;line-height:1.5;">
          ${items.map(t => `<li>${t}</li>`).join('')}
        </ul>
      </div>`;
  }

  // Iter 72 (21.05.2026): Integrierter Block-Container — Banner + Standard-Felder + Baukasten in
  //   einem ausklappbaren <details>. Open-State wird per saSectionState gemerkt (siehe unten).
  //   typ: 'in' (grün) / 'out' (rot) / 'neutral' (gold) / 'gray' (grau)
  //   label: rechts oben — Edgar passt die Texte teilweise selbst an, daher konfigurierbar.
  function blockContainer(stateKey, nummer, titel, typ, label, inhaltHtml) {
    const palette = {
      'in':      { bg: '#E8F5E9', border: '#2E7D32', fg: '#1B5E20' },
      'out':     { bg: '#FDECEA', border: '#C62828', fg: '#8E1010' },
      'neutral': { bg: '#FAF6EE', border: '#C9A961', fg: '#5C4922' },
      'gray':    { bg: '#F0F0F0', border: '#7A7A72', fg: '#3A3A35' },
    };
    const c = palette[typ] || palette.neutral;
    const isOpen = isSaSectionOpen(stateKey);
    return `
      <details class="sa-block" data-sec-state="${esc(stateKey)}" ${isOpen ? 'open' : ''} style="margin:18px 0;border-left:6px solid ${c.border};background:${c.bg};border-radius:6px;">
        <summary style="padding:14px 18px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-size:20px;font-weight:700;color:${c.fg};letter-spacing:0.02em;list-style:none;">
          <span>${esc(nummer)} · ${esc(titel)}</span>
          ${label ? `<span style="font-size:13px;font-weight:600;color:${c.fg};text-transform:uppercase;letter-spacing:0.05em;">${esc(label)}</span>` : ''}
        </summary>
        <div style="padding:0 18px 16px;background:#FFFFFF;border-radius:0 0 4px 4px;margin:0 8px 8px;">
          ${inhaltHtml}
        </div>
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
        <div class="sa-immo-card" data-zusatz-row="${prefix}.immobilien.${idx}" style="border:1px solid #E0DCCF;border-radius:6px;padding:14px 16px;margin-bottom:12px;background:#FCFAF5;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="font-weight:600;color:#3A2E13;">Immobilie ${idx + 1}${item.art ? ' · ' + esc(item.art) : ''}${item.anschrift ? ' · ' + esc(item.anschrift) : ''}</div>
            <button type="button" class="sa-zusatz-remove secondary" data-zusatz-remove="${prefix}.immobilien.${idx}" title="Immobilie entfernen" style="padding:4px 10px;line-height:1;">− entfernen</button>
          </div>
          <div class="text-tertiary text-small" style="margin-bottom:6px;font-weight:600;">Stammdaten</div>
          <div class="grid-2" style="gap:10px;">
            <div><label>Art (Whg, Haus, Garage, Acker, Gewerbe …)</label><input type="text" ${dz(idx, 'art')} value="${esc(item.art || '')}"></div>
            <div><label>Anschrift</label><input type="text" ${dz(idx, 'anschrift')} value="${esc(item.anschrift || '')}"></div>
            <div><label>Baujahr</label><input type="number" step="1" ${dz(idx, 'baujahr')} value="${item.baujahr !== undefined && item.baujahr !== null ? item.baujahr : ''}"></div>
            <div><label>Erwerbsjahr</label><input type="number" step="1" ${dz(idx, 'erwerbsjahr')} value="${item.erwerbsjahr !== undefined && item.erwerbsjahr !== null ? item.erwerbsjahr : ''}"></div>
            <div><label>Wohnfläche (m²)</label><input type="number" step="any" ${dz(idx, 'wohnflaeche')} value="${item.wohnflaeche !== undefined && item.wohnflaeche !== null ? item.wohnflaeche : ''}"></div>
            <div><label>Verkehrswert (€)</label><input type="number" step="any" ${dz(idx, 'verkehrswert')} value="${item.verkehrswert !== undefined && item.verkehrswert !== null ? item.verkehrswert : ''}"></div>
            <div><label>Mieteinnahmen (€/Mo) <span class="text-tertiary text-small">→ fließt in ① Einnahmen</span></label><input type="number" step="any" ${dz(idx, 'mietenMo')} value="${item.mietenMo !== undefined && item.mietenMo !== null ? item.mietenMo : ''}"></div>
          </div>
          <div class="text-tertiary text-small" style="margin:14px 0 6px;font-weight:600;">Baufinanzierung <span style="font-weight:normal;">→ fließt in ④ Verbindlichkeiten</span></div>
          <div style="background:#FFF8E1;border-left:3px solid #C9A961;padding:6px 10px;margin-bottom:8px;font-size:12px;color:#5C4922;">
            ℹ Bei mehreren Darlehen für diese Immobilie: <strong>Summe</strong> hier eintragen (z.B. Bank + KfW + Bauspar zusammengerechnet).
          </div>
          <div class="grid-2" style="gap:10px;">
            <div><label>Urspr. Darlehenshöhe (€)</label><input type="number" step="any" ${dz(idx, 'baufiUrspruenglich')} value="${item.baufiUrspruenglich !== undefined && item.baufiUrspruenglich !== null ? item.baufiUrspruenglich : ''}"></div>
            <div><label>Laufzeit bis</label><input type="date" ${dz(idx, 'baufiLaufzeitBis')} value="${esc(item.baufiLaufzeitBis || '')}"></div>
            <div><label>Mtl. Belastung (€/Mo)</label><input type="number" step="any" ${dz(idx, 'baufiBelastungMo')} value="${item.baufiBelastungMo !== undefined && item.baufiBelastungMo !== null ? item.baufiBelastungMo : ''}"></div>
            <div><label>Restsaldo (€)</label><input type="number" step="any" ${dz(idx, 'baufiRestsaldo')} value="${item.baufiRestsaldo !== undefined && item.baufiRestsaldo !== null ? item.baufiRestsaldo : ''}"></div>
          </div>
        </div>`;
    }).join('');
    // Iter 72: nur Inhalt zurückgeben — Block-Container wird außen aufgesetzt
    return `
      ${checklistBox('Immobilien — was abfragen', [
        '<strong>Selbstgenutztes Eigentum</strong>: Wohnung oder Haus mit aktuellem Verkehrswert',
        '<strong>Vermietete Bestandsimmobilien</strong>: Verkehrswert + tatsächliche Mieteinnahmen pro Monat',
        '<strong>Garage / Stellplatz / Tiefgaragenplatz</strong>: auch hier eintragen, wenn Eigentum',
        '<strong>Acker, Wald, Bauplatz</strong>: als eigene Position pflegen',
        '<strong>Gewerbeimmobilien</strong>',
        '<strong>Erbpacht</strong> separat als Notiz',
        'Pro Immobilie nur <strong>eine Baufinanzierung</strong> — bei mehreren Darlehen Summe eintragen',
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
      ${s('Güterstand (nur falls verheiratet)', 'gueterstand', [
        {v:'',l:'—'},
        {v:'Zugewinngemeinschaft',l:'Zugewinngemeinschaft (Standard)'},
        {v:'Gütertrennung',l:'Gütertrennung'},
        {v:'Gütergemeinschaft',l:'Gütergemeinschaft'},
        {v:'Ehevertrag',l:'sonst. Ehevertrag'}
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
  const einnahmenInhalt = `
    ${checklistBox('Einnahmen — was abfragen', [
      '<strong>Brutto- UND Netto-Gehalt</strong> (Bank rechnet Verhältnis gegen Steuerklasse)',
      '<strong>Anzahl Gehälter</strong> (12 = nur normal · 13 = mit Weihnachtsgeld · 14 = + Urlaubsgeld)',
      '<strong>Steuerklasse</strong> (Pflicht bei gemeinsamem Antrag — III/V vs. IV/IV unterschiedlich bewertet)',
      '<strong>Unterhalt erhalten</strong> (z.B. nach Scheidung) → Baukasten',
      '<strong>Kindergeld</strong> aktuell laufend → Baukasten',
      '<strong>Renten</strong>: BU, gesetzliche Rente, BAV-Auszahlung → Baukasten',
      '<strong>Variable Vergütung / Bonus</strong> nur wenn regelmäßig (Vorjahres-Mittelwert) → Baukasten',
      '<strong>Mieteinnahmen</strong> werden pro Immobilie im <em>⑤ Immobilien-Block</em> erfasst',
    ])}
    <div class="grid-2">
      ${n('Brutto-Gehalt', 'bruttoMo', '€/Mo')}
      ${n('Netto-Gehalt', 'nettoMo', '€/Mo')}
      ${s('Steuerklasse', 'steuerklasse', [{v:'',l:'—'},{v:'I',l:'I'},{v:'II',l:'II'},{v:'III',l:'III'},{v:'IV',l:'IV'},{v:'V',l:'V'},{v:'VI',l:'VI'}])}
      ${n('Anzahl der Gehälter', 'anzahlGehaelter', '×', '0.5')}
    </div>
    ${zusatzListeInline('zusatzEinnahmen', 'Weitere Einnahmen (Baukasten)',
      `<strong>Banken-übliche Titel — bitte konsistent verwenden:</strong><br>
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Weihnachtsgeld ⌀/Mo</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Urlaubsgeld ⌀/Mo</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Variable Vergütung 2025 ⌀</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Unterhalt erhalten</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Rente gesetzlich</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">BU-Rente</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Selbst. Honorare ⌀</code>
       <br><strong>Tipp:</strong> Sonderzahlungen (Weihnachts-/Urlaubsgeld, Bonus) als monatlichen Durchschnitt eintragen — Bank rechnet so automatisch korrekt mit.`,
      'mo', 'Einnahme hinzufügen')}
  `;

  const ausgabenInhalt = `
    ${checklistBox('Ausgaben — was abfragen', [
      '<strong>Miete eigene Wohnung</strong> inkl. NK (wenn der Kunde zur Miete wohnt)',
      '<strong>Laufende Lebenshaltung</strong>: Essen, Sprit, Telefon, Strom — realistisch schätzen',
      '<strong>Unterhaltszahlungen</strong> an Ex-Partner / Kinder → Baukasten',
      '<strong>Private Krankenversicherung (PKV)</strong> → Baukasten',
      '<strong>Leasing-Raten</strong>: Auto, Möbel, Fahrrad → Baukasten',
      '<strong>Sparplan-Raten</strong> (Fondssparplan, Riester, Rürup) → Baukasten mit gleichem Titel wie in Vermögen',
      '<strong>Vereinsbeiträge, Abos, Streaming</strong> → Baukasten',
    ])}
    <div class="grid-2">
      ${n('Miete inkl. NK (eigene Whg)', 'mieteMo', '€/Mo')}
      ${n('Laufende Lebenshaltung', 'lebenshaltungMo', '€/Mo')}
    </div>
    ${zusatzListeInline('zusatzAusgaben', 'Weitere Ausgaben (Baukasten)',
      `<strong>Banken-übliche Titel — bitte konsistent verwenden:</strong><br>
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">PKV-Beitrag</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">GKV-Zusatzbeitrag</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Unterhaltszahlungen an [Name]</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Fondssparplan MSCI World</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Riester-Beitrag</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Rürup-Beitrag</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Leasing BMW X3</code>
       <br><strong>Fonds-Logik:</strong> Sparplan-Rate hier eintragen UND im Vermögen mit <strong>gleichem Titel</strong> den Bestand — Verknüpfung sichtbar.`,
      'mo', 'Ausgabe hinzufügen')}
  `;

  const vermoegenInhalt = `
    ${checklistBox('Vermögen — was abfragen', [
      '<strong>Bankguthaben</strong>: Giro-/Tagesgeld-/Sparkonten zusammengerechnet',
      '<strong>Wertpapiere</strong>: aktueller Depotwert → Baukasten',
      '<strong>Sparbücher / Festgeld</strong> → Baukasten',
      '<strong>Bausparguthaben / VWL</strong> → Baukasten',
      '<strong>Fondsgebundene Versicherungen, Riester, Rürup, BAV-Bestand</strong> → Baukasten',
      '<strong>Edelmetalle, Krypto, Oldtimer, Kunstwerke</strong> → Baukasten',
      '<strong>Lebensversicherung Rückkaufwert</strong> → Baukasten („LV Rückkauf XYZ")',
      '<strong>Bestandsimmobilien</strong> werden im <em>⑤ Immobilien-Block</em> erfasst',
    ])}
    <div class="grid-2">
      ${n('Bankguthaben', 'bankguthaben', '€')}
    </div>
    ${zusatzListeInline('zusatzVermoegen', 'Weiteres Vermögen (Baukasten)',
      `<strong>Banken-übliche Titel — bitte konsistent verwenden (PDF mappt automatisch in die Bank-Kategorien):</strong><br>
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Wertpapierdepot [Bank]</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">ETF MSCI World</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Tagesgeld [Bank]</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Sparbuch [Bank]</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Bausparvertrag LBS</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">VWL [Anbieter]</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">LV Rückkauf [Anbieter]</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Krypto BTC</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Edelmetalle</code>
       <br><strong>Mapping:</strong> Titel mit „bauspar/vwl/riester" → Bausparen-Zeile · „aktie/etf/fonds/depot/wertpapier" → Wertpapier-Zeile · „lebensvers/rentenvers/rückkauf/rürup" → LV-Zeile · sonst Sonstige Wertgegenstände.
       <br><strong>Fonds-Logik:</strong> Gleichen Titel wie bei Ausgabe verwenden, wenn die Position bespart wird.`,
      'wert', 'Vermögen hinzufügen')}
  `;

  const verbindInhalt = `
    ${checklistBox('Verbindlichkeiten — was abfragen', [
      '<strong>Baufinanzierungen für Bestandsimmobilien</strong> werden pro Immobilie im <em>⑤ Immobilien-Block</em> gepflegt — hier NICHT nochmal!',
      '<strong>Autokredit, Möbelfinanzierung</strong> → Baukasten unten',
      '<strong>Kreditkarten-Saldo, Dispo</strong> wenn dauerhaft im Minus → Baukasten',
      '<strong>Studienkredite, KfW, Förderdarlehen</strong> ohne Immobilien-Bezug → Baukasten',
      '<strong>Privatdarlehen, P2P-Kredite</strong> → Baukasten',
      '<strong>Bürgschaften</strong> als Notiz festhalten',
      '<strong>Tipp:</strong> Pro Position mtl. Belastung UND Restsaldo angeben',
    ])}
    ${zusatzListeInline('zusatzVerbindlichkeiten', 'Verbindlichkeiten (Baukasten)',
      `<strong>Banken-übliche Titel — bitte konsistent verwenden:</strong><br>
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Autokredit BMW</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Konsumkredit [Bank]</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Kreditkarte [Bank]</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Dispo [Bank]</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Studienkredit BAföG</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">KfW-Förderdarlehen</code> ·
       <code style="background:#FFF8E1;padding:1px 5px;border-radius:2px;font-size:11px;">Privatdarlehen [Name]</code>
       <br><strong>Pflicht:</strong> Pro Position monatliche Belastung <em>UND</em> Restsaldo angeben. <strong>Bürgschaften</strong> im Notizfeld festhalten (kein mtl. Betrag).`,
      'mo-wert', 'Verbindlichkeit hinzufügen')}
  `;

  const notizenInhalt = `
    <div class="text-tertiary text-small mb-8">Alles, was über die Felder oben hinausgeht: Bürgschaften, Erbpacht, geplante Karriereschritte, Sondertilgungen, anstehende Schenkungen / Erbschaften, andere Banken-relevante Hinweise.</div>
    <textarea data-sa="${prefix}.notizen" rows="5" style="width:100%;font-family:inherit;font-size:14px;padding:10px;border:1px solid #D6D2C8;border-radius:4px;background:#FAF7F0;">${esc(p.notizen || '')}</textarea>
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
  const neu = prompt('Neue Bezeichnung:', s.bezeichnung || '');
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
    // Iter 60 (20.05.2026): Alte Snapshots haben kein saSteuersatz — initialisieren
    //   aus dem damaligen `steuersatz`, damit der Detail-Modus-Slider nicht auf 0 % steht.
    if (typeof state.kalk.saSteuersatz !== 'number') {
      state.kalk.saSteuersatz = (typeof state.kalk.steuersatz === 'number') ? state.kalk.steuersatz : 0.30;
    }
    setTab('kalkulator');
    toast('Snapshot "' + (s.bezeichnung || '—') + '" geladen', 'success');
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
                    <th class="num">HG-<br>Infl.</th>
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
                        <td class="num">${sd ? pctN(sd.hgInflation) : statusBadge(null)}</td>
                        <td class="num">${sd ? pctN(sd.grEst) : statusBadge(null)}</td>
                        <td><span class="text-tertiary text-small">${esc((sd && sd.vermietungsModus) || '–')}<br>${esc((sd && sd.kappungsgrenze) || '')}</span></td>
                        <td class="num text-small">${dateN(r.vermietung && r.vermietung.letzteMietsteigerung)}<br><span class="text-tertiary" style="font-size:10px;">${esc((r.vermietung && r.vermietung.letzteMietsteigerungQuelle) || '')}</span></td>
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
