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

async function createNewKunde() {
  const vorname = prompt('Vorname?');
  if (!vorname) return;
  const nachname = prompt('Nachname?');
  if (!nachname) return;
  const email = prompt('E-Mail (optional)?') || '';
  try {
    // Stammdaten direkt auch in die Selbstauskunft übertragen → der Vertriebler tippt
    // den Kunden 1× ein, alles ist überall da.
    const saJson = {
      gemeinsam: false,
      antragsteller: {
        vorname: vorname,
        name: nachname,
        email: email,
      },
      mitantragsteller: {},
    };
    const k = await api.post('/api/kunden', {
      vorname, nachname, email, phase: 'Lead', saJson,
    });
    state.kunden.push(k);
    toast('Kunde angelegt', 'success');
    go('/kunde/' + k.id);
  } catch (e) {
    toast('Fehler: ' + e.message, 'error');
  }
}
window.createNewKunde = createNewKunde;

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
  // Nur überschreiben wenn das SA-Feld leer ist (User-Edits respektieren).
  if (!a.vorname && k.vorname) a.vorname = k.vorname;
  if (!a.name && k.nachname) a.name = k.nachname;
  if (!a.email && k.email) a.email = k.email;
  if (!a.telefonPrivat && k.telefon) a.telefonPrivat = k.telefon;
  if (!a.geburtsdatum && k.geburtsdatum) a.geburtsdatum = k.geburtsdatum;
  return sa;
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
    // Erst die Stammdaten lokal mergen, dann SA-Sync aufrufen → ein PUT mit beidem.
    Object.assign(state.kunde, body);
    const sa = syncStammdatenInSa();
    await api.put('/api/kunden/' + state.kundeId, { ...body, saJson: sa });
    state.kunde.saJson = sa;
    toast('Stammdaten gespeichert (auch in Selbstauskunft übernommen)', 'success');
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
    <div class="card mt-16">
      <div class="card-title">${isPaket ? 'Persönliche Eingaben (für das Paket)' : 'Eingaben — ' + esc((i._weNr ? 'WE ' + i._weNr + ' · ' : '') + (i._weLage || ''))}</div>
      <div class="kalk-section-grid">
        ${isPaket ? kalkInputsPaketHtml(i) : kalkInputsThemenHtml(i)}
      </div>
    </div>
    `}

    ${(!isPaket && !i._weId) ? '' : `
      <div class="kpi-grid mt-16" id="kpi-grid"></div>

      <div class="card mt-16" id="bon-card">
        <!-- Bonitäts-Anzeige (wird in recalcAndRender gefüllt) -->
      </div>

      <!-- HAUPTCHART: Vermögensaufbau (groß, 10 J) — Schere Marktwert ↔ Restschuld -->
      <div class="card mt-16">
        <div class="card-title">Dein Vermögensaufbau · 10 Jahre</div>
        <div class="text-tertiary text-small">Die Schere zwischen Marktwert und Deiner Restschuld öffnet sich Jahr für Jahr — das ist Dein Vermögensaufbau.</div>
        <div class="chart-container" style="height:420px;"><canvas id="chart-vermoegen"></canvas></div>
        <div class="chart-formula">
          <strong>Formel:</strong> Gesamtvermögen = (Marktwert × Wertsteigerung<sup>n</sup>) − Restschuld + kum. Cashflows<br>
          <strong>Vermögenszuwachs</strong> = Gesamtvermögen − eingesetztes EK (die Linie unten zeigt, was zum Start reingesteckt wurde — bleibt konstant)<br>
          <span class="text-tertiary text-small">Marktwert steigt mit Wertsteigerung. Restschuld sinkt mit Tilgung. Die Schere zwischen beiden plus die kumulierten Cashflows ist das Gesamtvermögen.</span>
        </div>
      </div>

      <!-- DARUNTER: Cashflow + Sparen-vs-Investieren nebeneinander -->
      <div class="grid-2 mt-16">
        <div class="card">
          <div class="card-title">Dein Cashflow · 10 Jahre</div>
          <div id="cf-werte-block" class="kalk-werte-block"></div>
          <div class="chart-container"><canvas id="chart-cashflow"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">Dein Eigenkapital · Anlage vs. Immobilie</div>
          <div id="spar-werte-block" class="kalk-werte-block"></div>
          <div class="chart-container"><canvas id="chart-sparen"></canvas></div>
          <div class="spar-zins-row">
            <span class="spar-zins-label">EK-Verzinsung:</span>
            <input type="range" id="spar-zins-slider" min="0" max="12" step="0.05"
                   value="${((state.kalk.sparZins || 0.025) * 100).toFixed(2)}"
                   class="spar-zins-range">
            <span id="spar-zins-val" class="spar-zins-val">
              ${((state.kalk.sparZins || 0.025) * 100).toFixed(2).replace('.',',')} %
            </span>
            <input type="number" id="spar-zins-num" min="0" max="12" step="0.05"
                   value="${((state.kalk.sparZins || 0.025) * 100).toFixed(2)}"
                   class="spar-zins-num">
          </div>
        </div>
      </div>

      <!-- Story-Sektionen (Vertriebs-Erzählung) -->
      <div class="stories mt-16" id="story-container"></div>

      <div class="toolbar mt-16">
        <button onclick="saveSnapshot()">Snapshot speichern</button>
        <button class="secondary" onclick="exportInvestPdf()">PDF Investitionsrechnung</button>
        <button class="secondary" onclick="exportReservPdf()">PDF Reservierung</button>
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
  range.addEventListener('input', () => applyValue(range.value, 'range'));
  num.addEventListener('input',   () => applyValue(num.value,   'num'));
  num.addEventListener('blur',    () => applyValue(num.value,   'num')); // bei manueller Eingabe absichern
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
        ${slider('Persönlicher Steuersatz', 'steuersatz', 25, 50, 1)}
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
        ${sliderEur('Aktuelle Kaltmiete', 'kaltmiete', 200, 2000, 10, '€/Mo')}
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
          // Slider „Monate seit letzter Mieterhöhung" durch Datum-Input ersetzt.
          // Read-only-Anzeige zeigt, wie viele Monate her das ist (live abgeleitet).
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
          return `
            <div class="slider-row">
              <label>Letzte Mieterhöhung <span class="slider-val">${esc(monateAnzeige)}${quelleLabel ? ' · ' + esc(quelleLabel) : ''}</span></label>
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

// async, weil Airtable-Stammdaten via fetch geholt werden
async function loadWeIntoKalk(weId) {
  if (!weId) {
    delete state.kalk._weId;
    delete state.kalk._weLage;
    delete state.kalk._weNr;
    delete state.kalk._projektName;
    delete state.kalk._stammdatenQuelle;
    delete state.kalk._stellplatzAnzahl;
    renderTabKalkulator();
    return;
  }
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
              gebaeudeAnteil: (kalk && kalk.gebaeudeAnteil) || 0.80,
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
  if (!grid) return;
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
    kpiCard('Dein Gesamtvermögen 10 J.', fmt(r.vermoegenBrutto10),
      'Dein Endstand nach 10 Jahren: Marktwert minus Deine Restschuld plus Deine kumulierten Cashflows. Das, was an Vermögen wirklich da ist (vor Abzug Deines eingesetzten EK).'),
    kpiCard('Dein Vermögenszuwachs 10 J.', fmt(r.vermoegenNetto10),
      'Deine ehrliche Vermögensbilanz: Gesamtvermögen 10 J. minus Dein eingesetztes Eigenkapital. Das ist Dein echter Zuwachs gegenüber Deinem Start.', 'positive'),
  ];
  const mwQm = (state.kalk && parseFloat(state.kalk.marktwertProQm)) || 0;
  if (mwQm > 0 && r.markteinkaufVorteil) {
    kpis.push(kpiCard('Dein Markteinkauf-Vorteil', fmt(r.markteinkaufVorteil),
      'Differenz zwischen Marktpreis pro qm und Deinem Kaufpreis pro qm × Wohnfläche. „Geld, das schon in Deinem Kaufpreis steckt."',
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
          if (phasen.length >= 2) {
            const p1 = phasen[0], p2 = phasen[1];
            return `<p><strong>Deine Mietsubvention gesamt: ${fmt(totalEur)}</strong>${capInfo}<br>
              · Phase 1: <strong>${fmtEurMo(p1.mo)}</strong> × ${p1.monate} Mo = ${fmt(p1.mo * p1.monate)}<br>
              · Phase 2: <strong>${fmtEurMo(p2.mo)}</strong> × ${p2.monate} Mo = ${fmt(p2.mo * p2.monate)}<br>
              ${state.kalk._subventionErlaeuterung ? `<span class="text-tertiary text-small">${esc(state.kalk._subventionErlaeuterung)}</span>` : ''}
            </p>`;
          } else if (phasen.length === 1) {
            const p = phasen[0];
            return `<p><strong>Deine Mietsubvention gesamt: ${fmt(totalEur)}</strong>${capInfo}<br>
              · ${esc(p.label || 'Phase 1')}: <strong>${fmtEurMo(p.mo)}</strong> × ${p.monate} Mo<br>
              ${state.kalk._subventionErlaeuterung ? `<span class="text-tertiary text-small">${esc(state.kalk._subventionErlaeuterung)}</span>` : ''}
            </p>`;
          } else {
            return `<p>Mietsubvention <strong>${fmtEurMo(i.subventionMo)}</strong> über <strong>${i.subventionMonate} Monate</strong> — Summe <strong>${fmt(totalEur)}</strong>. Wir fangen Deine Anlaufphase ab.</p>`;
          }
        })()}
        ${(() => {
          if (!r.ersteErhoehungMonat) return '';
          const datum = state.kalk.letzteMietsteigerung || state.kalk._letzteMietsteigerung;
          let datumLabel = '';
          if (datum) {
            const d = new Date(datum);
            if (!isNaN(d.getTime())) {
              datumLabel = ` (letzte Mieterhöhung: <strong>${('0'+(d.getMonth()+1)).slice(-2)}/${d.getFullYear()}</strong>)`;
            }
          }
          return `<p>Deine erste Mieterhöhung greift in <strong>Monat ${r.ersteErhoehungMonat}</strong> (${esc(r.ersteErhoehungJahrLabel)})${datumLabel}. Steigerung danach: <strong>${fmtPct(i.steigerungProz)}</strong>.</p>`;
        })()}
      </div>
    </div>
  `);

  const steuervorteil = story('03 — Dein Steuervorteil', 'AfA + Werbungskosten = Dein Cashflow-Hebel', `
    <div class="story-grid">
      <table class="story-table">
        <tr><td>Deine AfA-Basis (Kaufpreis × Gebäude-Anteil ${fmtPct(i.gebaeudeAnteil || 0.8, 0)})</td><td class="num">${fmt(afaBemessung)}</td></tr>
        <tr><td>AfA-Satz</td><td class="num">${fmtPct(i.afaSatz, 2)}</td></tr>
        <tr><td><strong>Deine AfA pro Jahr (konstant)</strong></td><td class="num"><strong>${fmt(afaJahr)}</strong></td></tr>
        <tr><td>+ Zinsen Jahr 1</td><td class="num">${fmt(zinsenJ1)}</td></tr>
        <tr><td>+ Mietverwaltung (SEV) Jahr 1</td><td class="num">${fmt(mvJ1)}</td></tr>
        <tr><td>+ Hausverwaltung (WEG) Jahr 1</td><td class="num">${fmt(hvJ1)}</td></tr>
        <tr><td>Dein Steuersatz</td><td class="num">${fmtPct(i.steuersatz)}</td></tr>
        <tr class="totalrow"><td><strong>Dein Steuervorteil Jahr 1</strong></td><td class="num pos"><strong>${fmt(stVorteilJ1)}</strong></td></tr>
      </table>
      <div class="story-explain">
        <strong>AfA-Satz frei wählbar</strong> — Standard 2,0 % (lineare AfA §7 Abs. 4 EStG), mit qualifiziertem Gutachten typisch 3,0–4,5 % möglich. <strong>Bemessungsgrundlage: Kaufpreis × Gebäude-Anteil</strong>.<br><br>
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
        <tr><td>Dein Startvermögen (verfügbar)</td><td class="num">${fmt(r.bonVermoegen || 0)}</td></tr>
        <tr><td>− KNK „verbrannt" beim Kauf</td><td class="num">− ${fmt(r.ekBedarf)}</td></tr>
        <tr><td>Dein EK nur anlegen (Verzinsung ${((state.kalk.sparZins || 0.025) * 100).toFixed(2).replace('.',',')} % p.a., 10 J.)</td><td class="num">${fmt(sparen10.nurSparen || 0)}</td></tr>
        <tr><td>Dein EK in Immobilie (Spar-Rest + Vermögen + Cashflow)</td><td class="num pos">${fmt(sparen10.mitImmo || 0)}</td></tr>
        <tr class="totalrow"><td><strong>Dein Vorteil durch die Immobilie</strong></td><td class="num pos"><strong>${fmt(r.sparenVsKaufenDelta)}</strong></td></tr>
      </table>
      <div class="story-explain">
        Wenn Du Dein EK <strong>nur anlegst (${((state.kalk.sparZins || 0.025) * 100).toFixed(2).replace('.',',')} % p.a.)</strong>, kommst Du nach 10 J. auf <strong>${fmt(sparen10.nurSparen || 0)}</strong>. Wenn Du denselben Betrag <strong>als EK in diese Immobilie investierst</strong>, hast Du nach 10 J. <strong>${fmt(sparen10.mitImmo || 0)}</strong> — Dein Vorteil: <strong>${fmt(r.sparenVsKaufenDelta)}</strong>.<br><br>
        <strong>Wichtig:</strong> Deine KNK sind <em>verbranntes Geld</em> (Grunderwerbsteuer, Notar, Grundbuch). Bei „KNK mitfinanziert" zahlst Du heute 0 € — dafür hast Du eine höhere Restschuld.
      </div>
    </div>
  `);

  el.innerHTML = (markteinkauf || markteinkaufHint) + cashflowHeute + steuervorteil + dreiHebel + exit10 + bonStory + sparenStory;
}

function drawCharts(r) {
  if (!window.Chart) return;
  if (!document.getElementById('chart-vermoegen')) return;

  // --- Daten vorbereiten ---
  // Vermögensaufbau: nur 10 Jahre (r.vermoegen ist 0..10)
  const years = r.vermoegen.map(v => 'J' + v.y);
  const marktwert    = r.vermoegen.map(v => Math.round(v.wert));
  const restschuld   = r.vermoegen.map(v => Math.round(v.restschuld));
  const kumCf        = r.vermoegen.map(v => Math.round(v.kumCf || 0));
  const gesamtVerm   = r.vermoegen.map(v => Math.round(v.vermoegenBrutto)); // = Gesamtvermögen neu
  const ekBedarf     = Math.round(r.ekBedarf || 0);
  const ekLinie      = years.map(() => ekBedarf); // konstante Linie für eingesetztes EK

  // Cashflow: 10 Jahre (r.cf hat 30 Jahre — wir nehmen die ersten 10)
  const cf10        = r.cf.slice(0, 10);
  const cfYears     = cf10.map(c => 'J' + c.y);
  const cfOperativ  = cf10.map(c => Math.round((c.cfJahr || 0) - (c.stVorteilJahr || 0))); // vor Steuer
  const cfStVorteil = cf10.map(c => Math.round(c.stVorteilJahr || 0));                      // nur Steuervorteil
  const cfNachSt    = cf10.map(c => Math.round(c.cfJahr || 0));                              // gesamt = operativ + Steuervorteil

  // Iter 43 (19.05.2026): 10 Jahresbalken — alle in €/Mo-Ø zur visuellen Vergleichbarkeit.
  // Tooltip zeigt die 12 Monatsdetails (CF nach Steuern pro Monat im Jahr).
  const cfMo        = Array.isArray(r.cfMonate) ? r.cfMonate : [];
  const MONATSKURZ = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const cfBarData = []; // 10 Einträge — je 1 pro Jahr
  for (let y = 1; y <= 10; y++) {
    const monatsBlock = cfMo.slice((y - 1) * 12, y * 12);
    const sumNachSt   = monatsBlock.reduce((s, p) => s + (p.cfNachStM   || 0), 0);
    const sumOperativ = monatsBlock.reduce((s, p) => s + (p.cfOperativM || 0), 0);
    const sumStV      = monatsBlock.reduce((s, p) => s + (p.stVorteilM  || 0), 0);
    cfBarData.push({
      label: 'J' + y,
      operativ: Math.round(sumOperativ / 12),
      stVorteil: Math.round(sumStV / 12),
      nachSt: Math.round(sumNachSt / 12),
      yearIdx: y,
      jahresSumme: Math.round(sumNachSt),
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
    const card = (title, j1, j10, hervorgehoben) => `
      <div class="cf-detail-card${hervorgehoben ? ' primary' : ''}">
        <div class="cf-detail-title">${esc(title)}</div>
        <div class="cf-detail-row">
          <span class="text-tertiary">Jahr 1</span><span class="${cls(j1)}">${fmtMo(j1)}</span>
        </div>
        <div class="cf-detail-row">
          <span class="text-tertiary">Jahr 10</span><span class="${cls(j10)}">${fmtMo(j10)}</span>
        </div>
      </div>`;
    werteBlock.innerHTML =
      card('Dein operativer CF',     opJ1,   opJ10,   false) +
      card('Dein Steuervorteil',     stVJ1,  stVJ10,  false) +
      card('★ Dein CF nach Steuern', nachJ1, nachJ10, true);
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
  // HAUPTCHART: Vermögensaufbau — Schere Marktwert↔Restschuld,
  // PLUS gefüllte Gewinn-Zone zwischen EK und Gesamtvermögen
  // ============================================================
  if (chartV) chartV.destroy();
  chartV = new Chart(document.getElementById('chart-vermoegen'), {
    type: 'line',
    data: {
      labels: years,
      datasets: [
        // [0] Marktwert oben — gefüllter Bereich nach unten zur Restschuld
        {
          label: 'Marktwert (Immobilie)',
          data: marktwert,
          borderColor: '#2D6E47',
          backgroundColor: 'rgba(45,110,71,0.08)',
          borderWidth: 2.5,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          fill: '+1',   // füllt bis Restschuld → Schere
          order: 3,
        },
        // [1] Restschuld — Unterkante der Schere
        {
          label: 'Restschuld (Darlehen)',
          data: restschuld,
          borderColor: '#9A3E33',
          backgroundColor: 'rgba(154,62,51,0.05)',
          borderWidth: 2.5,
          borderDash: [6, 3],
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          fill: false,
          order: 3,
        },
        // [2] Gesamtvermögen — Haupt-Linie. Füllung von hier nach unten bis EK-Linie [4]
        //     → der gefüllte Bereich IST der Vermögenszuwachs / Gewinn.
        {
          label: 'Gesamtvermögen',
          data: gesamtVerm,
          borderColor: '#B08A4D',
          backgroundColor: 'rgba(176,138,77,0.35)',
          borderWidth: 3.5,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 7,
          fill: { target: 4, above: 'rgba(176,138,77,0.30)', below: 'rgba(154,62,51,0.20)' },
          order: 1,
        },
        // [3] Kumulierter Cashflow — Hilfslinie
        {
          label: 'Kumulierter Cashflow',
          data: kumCf,
          borderColor: '#7A7A72',
          backgroundColor: 'rgba(122,122,114,0)',
          borderWidth: 1.5,
          borderDash: [2, 4],
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
          fill: false,
          order: 4,
        },
        // [4] Eingesetztes Eigenkapital — konstante horizontale Linie (Boden für Gewinn-Zone)
        // Iter 50 Polish: war Material-Blau (#2c5282) — einziges Nicht-B&B-Hex im Chart.
        // Auf text-secondary (#3A3A35) umgestellt: neutrale dunkle Linie, klar abgesetzt
        // von den drei Werte-Linien (Marktwert/Restschuld/Vermögen) ohne Brand-Bruch.
        {
          label: 'Eingesetztes EK (KNK)',
          data: ekLinie,
          borderColor: '#3A3A35',
          backgroundColor: 'rgba(58,58,53,0)',
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: false,
          order: 2,
        },
        // [5] Vermögenszuwachs — eigene Linie zwischen EK und Gesamtvermögen,
        //     macht den „Gewinn" als zusätzliche Größe lesbar
        {
          label: '★ Vermögenszuwachs (= Gewinn)',
          data: r.vermoegen.map(v => Math.round(v.vermoegenNetto || 0)),
          borderColor: '#2D6E47',
          backgroundColor: 'rgba(34,84,61,0)',
          borderWidth: 2,
          borderDash: [],
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointStyle: 'rectRot',
          fill: false,
          order: 0,
        },
      ],
    },
    options: Object.assign({}, baseOpts, {
      plugins: Object.assign({}, baseOpts.plugins, {
        legend: { position: 'top', labels: { boxWidth: 16, padding: 10, font: { size: 11 } } },
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
          backgroundColor: 'rgba(33,33,28,0.94)',
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 11 },
          padding: 12,
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
            afterBody: (items) => {
              if (!items.length) return [];
              const d = cfBarData[items[0].dataIndex];
              if (!d) return [];
              const lines = ['', 'Monatsverlauf CF nach Steuern:'];
              d.monatsBlock.forEach((md, idx) => {
                lines.push('  ' + MONATSKURZ[idx] + '  ' + fmtEUR(md.cfNachStM) + '/Mo');
              });
              return lines;
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
    const cardS = (title, value, sub, hervorgehoben) => `
      <div class="spar-card${hervorgehoben ? ' primary' : ''}">
        <div class="spar-card-title">${esc(title)}</div>
        <div class="spar-card-value">${fmtBig(value)}</div>
        <div class="spar-card-sub">${esc(sub)}</div>
      </div>`;
    sparWerteBlock.innerHTML =
      cardS('Dein eingesetztes EK',         startEk,  'Start', false) +
      cardS('Dein EK nur anlegen · 10 J',   anlage10, 'EK × Zinsen p.a.', false) +
      cardS('★ Dein EK in Immobilie · 10 J', immobil10, (delta >= 0 ? '+ ' : '− ') + fmtBig(Math.abs(delta)).replace(' €','') + ' € ggü. Anlage', true);
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
    { sek: 'Fixkosten',       felder: ['mieteMo','pkvMo'] },
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
        <button class="secondary" onclick="exportSaPdf()">PDF Selbstauskunft</button>
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
  const gesamtVerm    = bon ? bon.gesamtVermoegen : null;
  const liquide       = bon ? bon.liquidesVermoegen : null;
  const immo          = bon ? bon.immobilienVermoegen : null;
  const einkAnr       = bon ? bon.einkommenAnrechenbarMo : null;
  const ausg          = bon ? bon.ausgabenGesamtMo : null;
  const haushalt      = bon ? bon.haushaltPauschale : null;
  const fix           = bon ? bon.fixkostenMo : null;
  const verbMo        = bon ? bon.verbindlichkeitenMo : null;
  const verbGes       = bon ? bon.verbindlichkeitenGesamt : null;

  const ueberschussCls = (ueberschuss !== null && ueberschuss < 0) ? 'kpi-negative' : 'kpi-positive';

  return `
    <div class="card sa-auswertung-card">
      <div class="card-title">Auswertung Selbstauskunft <span class="text-tertiary text-small" style="font-weight:normal;">(Bank-Sicht, live)</span></div>

      <div class="grid-3 mt-16">
        <div class="kpi-box ${ueberschussCls}">
          <div class="kpi-label">Anrechenbarer Überschuss</div>
          <div class="kpi-value">${eur(ueberschuss)} <span style="font-size:13px;font-weight:400;color:var(--text-tertiary);">/ Monat</span></div>
          <div class="kpi-hint">Einkommen anrechenbar (80% Miete) minus Haushaltspauschale, Fixkosten und Verbindlichkeiten</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">Gesamtvermögen</div>
          <div class="kpi-value">${eur(gesamtVerm)}</div>
          <div class="kpi-hint">Liquide + Immobilien-Netto (Verkehrswert minus Hypotheken)</div>
        </div>
        <div class="kpi-box kpi-primary">
          <div class="kpi-label">Einsetzbar für Immobilie</div>
          <div class="kpi-value">${eur(liquide)}</div>
          <div class="kpi-hint"><strong>Nur liquide Assets</strong> — Bestandsimmobilien zählen nicht (Beleihungsauslauf gebunden)</div>
        </div>
      </div>

      <details class="sa-aufschluss">
        <summary>Aufschlüsselung anzeigen</summary>
        <div class="grid-2 mt-12" style="gap:24px;">
          <div>
            <div style="font-weight:600;margin-bottom:8px;">Einnahmen-Seite</div>
            <table class="sa-aufschluss-table">
              <tr><td>Einkommen anrechenbar (Mo)</td><td class="num" style="font-weight:600;">${eur(einkAnr)}</td></tr>
            </table>
            <div style="font-weight:600;margin:16px 0 8px;">Ausgaben-Seite (Bank-Sicht)</div>
            <table class="sa-aufschluss-table">
              <tr><td>Haushaltspauschale</td><td class="num">${eur(haushalt)}</td></tr>
              <tr><td>Fixkosten (Miete/Unterhalt/PKV)</td><td class="num">${eur(fix)}</td></tr>
              <tr><td>Verbindlichkeiten (mtl.)</td><td class="num">${eur(verbMo)}</td></tr>
              <tr class="row-sum"><td>Summe Ausgaben</td><td class="num">${eur(ausg)}</td></tr>
            </table>
          </div>
          <div>
            <div style="font-weight:600;margin-bottom:8px;">Vermögens-Seite</div>
            <table class="sa-aufschluss-table">
              <tr><td>Liquides Vermögen (Bank/WP/Sparen/RKW)</td><td class="num primary">${eur(liquide)}</td></tr>
              <tr><td>Immobilien netto (VK − Hypotheken)</td><td class="num">${eur(immo)}</td></tr>
              <tr class="row-sum"><td>Gesamtvermögen</td><td class="num">${eur(gesamtVerm)}</td></tr>
            </table>
            <div style="font-weight:600;margin:16px 0 8px;">Verbindlichkeiten</div>
            <table class="sa-aufschluss-table">
              <tr><td>Restsaldo gesamt</td><td class="num">${eur(verbGes)}</td></tr>
              <tr><td>Mtl. Belastung</td><td class="num">${eur(verbMo)}</td></tr>
            </table>
          </div>
        </div>
        <div class="footer-note">
          Hinweis: "Einsetzbar für neue Immobilie" rechnet bewusst nur mit liquidem Vermögen.
          Eigenkapital aus Bestandsimmobilien gilt in der Bankenbewertung als gebunden und
          fließt nicht in den EK-Einsatz für eine neue Finanzierung ein.
        </div>
      </details>
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
  state._sa = sa;
  return sa;
}

let _saAutoSaveTimer = null;
async function autoSaveSa() {
  // Debounce: 600ms warten und einmalig speichern
  clearTimeout(_saAutoSaveTimer);
  _saAutoSaveTimer = setTimeout(async () => {
    const sa = collectSaFromDOM();
    sa.gemeinsam = document.getElementById('sa-gemeinsam') ? document.getElementById('sa-gemeinsam').checked : (sa.gemeinsam === true);
    try {
      await api.put('/api/kunden/' + state.kundeId, { saJson: sa });
      state.kunde.saJson = sa;
      // Kleiner stiller Indikator: kurzer Toast erst bei "manuellem" Speichern
    } catch (e) {
      console.error('autoSaveSa', e);
    }
  }, 600);
}

// Sa-weite Sektion: Herkunft des Eigenkapitals. Banken-Pflichtfrage bei
// jeder Immobilienfinanzierung. Multi-Select + freie Erläuterung.
function saHerkunftEkHtml(h) {
  h = h || {};
  const chk = (key, label) => `
    <label style="display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0;cursor:pointer;user-select:none;font-weight:400;">
      <input type="checkbox" data-sa="sa.herkunftEk.${key}" ${h[key] ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;">
      <span>${esc(label)}</span>
    </label>`;
  return `
    <details class="sa-section" open>
      <summary>Herkunft Eigenkapital (Bank-Pflichtfrage)</summary>
      <div class="text-tertiary text-small mb-12">
        Die finanzierende Bank fragt bei jeder Immobilienfinanzierung nach der Herkunft des eingesetzten Eigenkapitals.
        Mehrfachauswahl möglich. Bei "Schenkung" oder "Erbe" verlangt die Bank in der Regel eine zusätzliche Schenkungs- bzw. Erbschaftsbescheinigung.
      </div>
      <div class="grid-3" style="gap:8px 24px;">
        ${chk('ersparnisse', 'Eigene Ersparnisse')}
        ${chk('wertpapier', 'Wertpapier-/Depot-Verkauf')}
        ${chk('erbe', 'Erbschaft')}
        ${chk('schenkung', 'Schenkung')}
        ${chk('immobilien', 'Immobilienverkauf')}
        ${chk('sonstiges', 'Sonstiges')}
      </div>
      <div class="mt-12">
        <label>Erläuterung (z.B. Schenker, Verkaufsobjekt, Verkaufsjahr)</label>
        <input type="text" data-sa="sa.herkunftEk.erlaeuterung" value="${esc(h.erlaeuterung || '')}">
      </div>
    </details>
  `;
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
      <summary>Identifikation & Compliance</summary>
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
      <div class="sa-pep-warning">
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
        ${sub('immo1', 'baujahr', 'number', 'Baujahr', 'Jahr')}
        ${sub('immo1', 'erwerbsjahr', 'number', 'Erwerbsjahr', 'Jahr')}
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
        ${sub('immo2', 'baujahr', 'number', 'Baujahr', 'Jahr')}
        ${sub('immo2', 'erwerbsjahr', 'number', 'Erwerbsjahr', 'Jahr')}
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
      <summary>Sonstige Verbindlichkeit 1 (optional)</summary>
      <div class="grid-2">
        ${sub('kd1', 'zweck', 'text', 'Zweck (z.B. Autokredit, Möbel)')}
        ${sub('kd1', 'urspruenglich', 'number', 'urspr. Höhe', '€')}
        ${sub('kd1', 'laufzeitBis', 'date', 'Laufzeit bis')}
        ${sub('kd1', 'belastungMo', 'number', 'mtl. Belastung', '€/Mo')}
        ${sub('kd1', 'restsaldo', 'number', 'Restsaldo', '€')}
      </div>
    </details>

    <details class="sa-section">
      <summary>Sonstige Verbindlichkeit 2 (optional)</summary>
      <div class="grid-2">
        ${sub('kd2', 'zweck', 'text', 'Zweck (z.B. Kreditkarte, Dispo)')}
        ${sub('kd2', 'urspruenglich', 'number', 'urspr. Höhe', '€')}
        ${sub('kd2', 'laufzeitBis', 'date', 'Laufzeit bis')}
        ${sub('kd2', 'belastungMo', 'number', 'mtl. Belastung', '€/Mo')}
        ${sub('kd2', 'restsaldo', 'number', 'Restsaldo', '€')}
      </div>
    </details>

    <details class="sa-section">
      <summary>Sonstige Verbindlichkeit 3 (optional)</summary>
      <div class="grid-2">
        ${sub('kd3', 'zweck', 'text', 'Zweck')}
        ${sub('kd3', 'urspruenglich', 'number', 'urspr. Höhe', '€')}
        ${sub('kd3', 'laufzeitBis', 'date', 'Laufzeit bis')}
        ${sub('kd3', 'belastungMo', 'number', 'mtl. Belastung', '€/Mo')}
        ${sub('kd3', 'restsaldo', 'number', 'Restsaldo', '€')}
      </div>
    </details>

    <details class="sa-section">
      <summary>Sonstige Verbindlichkeit 4 (optional)</summary>
      <div class="grid-2">
        ${sub('kd4', 'zweck', 'text', 'Zweck')}
        ${sub('kd4', 'urspruenglich', 'number', 'urspr. Höhe', '€')}
        ${sub('kd4', 'laufzeitBis', 'date', 'Laufzeit bis')}
        ${sub('kd4', 'belastungMo', 'number', 'mtl. Belastung', '€/Mo')}
        ${sub('kd4', 'restsaldo', 'number', 'Restsaldo', '€')}
      </div>
    </details>
  `;
}

async function saveSelbstauskunft() {
  // collectSaFromDOM() liest a.*, m.* UND sa.* Felder (inkl. Checkboxes für Herkunft EK)
  // und schreibt nach state._sa. Wir verwenden bewusst die gleiche Funktion wie der
  // Auto-Save, damit es nur eine Quelle der Wahrheit gibt.
  const sa = collectSaFromDOM();
  sa.gemeinsam = document.getElementById('sa-gemeinsam').checked;
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
