/* pdf.js — drei PDF-Templates: Investitionsrechnung, Reservierung, Selbstauskunft.
   Mechanismus: setzt body-Klasse `pdf-mode-X`, befüllt #pdf-template mit HTML,
   ruft window.print(). Print-CSS in styles.css blendet alles andere aus. */

function _footer(user) {
  const u = user || {};
  return `
    <div class="pdf-footer">
      <div><strong>B&amp;B Immo GmbH</strong></div>
      <div>${esc(u.name || '')} &middot; ${esc(u.email || '')} &middot; ${esc(u.telefon || '')}</div>
    </div>
  `;
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function _doPrint(html, mode) {
  const tpl = document.getElementById('pdf-template');
  tpl.innerHTML = html;
  document.body.classList.add('pdf-mode');
  document.body.classList.add('pdf-mode-' + mode);
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('pdf-mode');
      document.body.classList.remove('pdf-mode-' + mode);
    }, 500);
  }, 100);
}

/* ====================================================================
   INVESTITIONSRECHNUNG
   ==================================================================== */
function investitionsrechnung(kunde, kalkInputs, kalkResult, user) {
  if (!kalkResult) {
    try { kalkResult = window.Kalk.recalc(kalkInputs); }
    catch (e) { alert('Berechnung fehlgeschlagen: ' + e.message); return; }
  }
  const r = kalkResult;
  const k = kunde || {};
  const displayName = k.name || ((k.vorname || '') + ' ' + (k.nachname || '')).trim() || '—';
  const we = kalkInputs._weLage || '—';
  const fmt = window.Kalk.fmtEur, fmtPct = window.Kalk.fmtPct, fmtMo = window.Kalk.fmtEurMo;

  const cover = `
    <div class="pdf-page">
      <div class="pdf-cover">
        <div class="brand">B&amp;B <span class="accent">Immo</span></div>
        <h1>Investitionsrechnung</h1>
        <div style="margin-top:18mm; font-size:14px;">
          Für: <strong>${esc(displayName)}</strong><br>
          Objekt: <strong>${esc(we)}</strong><br>
          Datum: ${new Date().toLocaleDateString('de-DE')}
        </div>
      </div>
      ${_footer(user)}
    </div>
  `;

  const kpis = `
    <div class="pdf-page">
      <h1>Kennzahlen auf einen Blick</h1>
      <p style="font-size:11px;color:var(--text-tertiary)">Objekt: ${esc(we)}</p>
      <div class="kpi-grid-pdf">
        <div class="kpi-pdf"><div class="label">Kaufpreis gesamt</div><div class="value">${fmt(r.kpGesamt)}</div></div>
        <div class="kpi-pdf"><div class="label">Eigenkapital-Bedarf</div><div class="value">${fmt(r.ekBedarf)}</div></div>
        <div class="kpi-pdf"><div class="label">Darlehen</div><div class="value">${fmt(r.darlehen)}</div></div>
        <div class="kpi-pdf"><div class="label">Belastung Jahr 1 mtl.</div><div class="value">${fmtMo(r.belastungMo)}</div></div>
        <div class="kpi-pdf"><div class="label">Vermögen brutto J10</div><div class="value">${fmt(r.vermoegenBrutto10)}</div></div>
        <div class="kpi-pdf"><div class="label">IRR (10 J)</div><div class="value">${fmtPct(r.irr)}</div></div>
      </div>

      <h2>Mietsubvention &amp; Marktvorteil</h2>
      <table>
        <tr><td>Mietsubvention gesamt</td><td class="num">${fmt(r.mietsubventionGesamt)}</td></tr>
        <tr><td>Markteinkauf-Vorteil</td><td class="num">${fmt(r.markteinkaufVorteil)}</td></tr>
        <tr><td>Sparen-vs-Investieren Delta J10</td><td class="num">${fmt(r.sparenVsKaufenDelta)}</td></tr>
      </table>
      ${_footer(user)}
    </div>
  `;

  const cf = `
    <div class="pdf-page">
      <h1>Detail-Cashflow</h1>
      <table>
        <thead>
          <tr><th>Jahr</th><th class="num">Miete</th><th class="num">Zinsen</th><th class="num">Tilgung</th><th class="num">HG</th><th class="num">St-Vorteil</th><th class="num">Cashflow</th><th class="num">Restschuld</th></tr>
        </thead>
        <tbody>
          ${r.cf.slice(0,15).map(c => `
            <tr>
              <td>J${c.y}</td>
              <td class="num">${fmt(c.mieteJahr)}</td>
              <td class="num">${fmt(c.zinsenJahr)}</td>
              <td class="num">${fmt(c.tilgungJahr)}</td>
              <td class="num">${fmt(c.hgJahr)}</td>
              <td class="num">${fmt(c.stVorteilJahr)}</td>
              <td class="num"><strong>${fmt(c.cfJahr)}</strong></td>
              <td class="num">${fmt(c.restschuld)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${_footer(user)}
    </div>
  `;

  const annahmen = `
    <div class="pdf-page">
      <h1>Annahmen &amp; Hinweise</h1>
      <table>
        <tr><td>Kaufpreis Wohnung</td><td class="num">${fmt(kalkInputs.kaufpreis)}</td></tr>
        <tr><td>Stellplatz-KP</td><td class="num">${fmt(kalkInputs.stellplatzKp)}</td></tr>
        <tr><td>Quadratmeter</td><td class="num">${esc(kalkInputs.qm)} m²</td></tr>
        <tr><td>Kaltmiete</td><td class="num">${fmt(kalkInputs.kaltmiete)} / Mo</td></tr>
        <tr><td>Stellplatzmiete</td><td class="num">${fmt(kalkInputs.stellplatzMiete)} / Mo</td></tr>
        <tr><td>Hausgeld</td><td class="num">${fmt(kalkInputs.hausgeld)} / Mo</td></tr>
        <tr><td>Hausverwaltung</td><td class="num">${fmt(kalkInputs.hausverwaltung)} / Mo</td></tr>
        <tr><td>Mietverwaltung</td><td class="num">${fmt(kalkInputs.mietverwaltung)} / Mo</td></tr>
        <tr><td>Subvention</td><td class="num">${fmt(kalkInputs.subventionMo)} × ${esc(kalkInputs.subventionMonate)} Mo</td></tr>
        <tr><td>Zins</td><td class="num">${fmtPct(kalkInputs.zins)}</td></tr>
        <tr><td>Tilgung</td><td class="num">${fmtPct(kalkInputs.tilgung)}</td></tr>
        <tr><td>AfA-Satz</td><td class="num">${fmtPct(kalkInputs.afaSatz)}</td></tr>
        <tr><td>Wertsteigerung p.a.</td><td class="num">${fmtPct(kalkInputs.wertsteigerung)}</td></tr>
        <tr><td>Mietsteigerung</td><td class="num">${fmtPct(kalkInputs.steigerungProz)} (${esc(kalkInputs.mietsteigerungsModus)})</td></tr>
        <tr><td>Steuersatz</td><td class="num">${fmtPct(kalkInputs.steuersatz)}</td></tr>
        <tr><td>KNK mitfinanziert</td><td class="num">${kalkInputs.knkMitfinanziert ? 'Ja' : 'Nein'}</td></tr>
      </table>

      <div class="pdf-disclaimer">
        Diese Investitionsrechnung beruht auf den oben dokumentierten Annahmen.
        Sie ist keine Anlageberatung im Sinne des WpHG. Tatsächliche Mieten,
        Zinssätze, Steuersätze und Wertentwicklungen können abweichen.
        Verbindlich ist ausschließlich der notarielle Kaufvertrag. Steuerliche
        Aspekte sind mit dem Steuerberater abzustimmen.
      </div>
      ${_footer(user)}
    </div>
  `;

  _doPrint(cover + kpis + cf + annahmen, 'invest');
}

/* ====================================================================
   RESERVIERUNG
   ==================================================================== */
function reservierung(kunde, kalkInputs, user) {
  const k = kunde || {};
  const displayName = k.name || ((k.vorname || '') + ' ' + (k.nachname || '')).trim() || '—';
  const we = (kalkInputs && kalkInputs._weLage) || '—';
  const kp = (kalkInputs && kalkInputs.kaufpreis) || 0;
  const spKp = (kalkInputs && kalkInputs.stellplatzKp) || 0;
  const fmt = window.Kalk.fmtEur;

  const html = `
    <div class="pdf-page">
      <h1>Reservierungsformular</h1>
      <p style="font-size:11px;color:var(--text-tertiary)">B&amp;B Immo GmbH &middot; Schutterwald/Offenburg</p>

      <h2>Reservierungs-Kunde</h2>
      <table>
        <tr><td>Name</td><td>${esc(displayName)}</td></tr>
        <tr><td>E-Mail</td><td>${esc(k.email || '—')}</td></tr>
        <tr><td>Telefon</td><td>${esc(k.telefon || '—')}</td></tr>
        <tr><td>Geburtsdatum</td><td>${esc(k.geburtsdatum || '—')}</td></tr>
      </table>

      <h2>Reservierte Wohneinheit</h2>
      <table>
        <tr><td>Objekt / Lage</td><td>${esc(we)}</td></tr>
        <tr><td>Kaufpreis Wohnung</td><td class="num">${fmt(kp)}</td></tr>
        <tr><td>Stellplatz-KP</td><td class="num">${fmt(spKp)}</td></tr>
        <tr><td>Gesamt</td><td class="num"><strong>${fmt(kp + spKp)}</strong></td></tr>
      </table>

      <h2>Reservierungs-Bedingungen</h2>
      <ul style="font-size:11px;">
        <li>Die Reservierung ist 14 Tage gültig und kostenfrei.</li>
        <li>Innerhalb der Reservierungsfrist verpflichtet sich der Kunde, eine
            vollständige Bonitätsprüfung über die kreditgebende Bank zu erlauben
            und die nötigen Unterlagen (Selbstauskunft, Einkommensnachweise) bereitzustellen.</li>
        <li>Die Reservierung wird mit dem Notartermin in einen verbindlichen Kaufvertrag überführt.</li>
        <li>Reservierungs-Gebühr: 0 € (kostenfrei).</li>
      </ul>

      <div style="margin-top:30mm; display:grid; grid-template-columns:1fr 1fr; gap:24mm;">
        <div>
          <div style="border-top:1px solid var(--text-primary); padding-top:4px; font-size:10px;">
            Ort, Datum &middot; Unterschrift Kunde
          </div>
        </div>
        <div>
          <div style="border-top:1px solid var(--text-primary); padding-top:4px; font-size:10px;">
            Unterschrift Vertriebler (${esc(user && user.name || '')})
          </div>
        </div>
      </div>

      ${_footer(user)}
    </div>
  `;
  _doPrint(html, 'reservierung');
}

/* ====================================================================
   SELBSTAUSKUNFT (Hypovision-ähnlich)
   ==================================================================== */
function selbstauskunft(kunde, user) {
  const k = kunde || {};
  let sa = {};
  try { sa = k.selbstauskunftJson ? JSON.parse(k.selbstauskunftJson) : {}; } catch(e) {}
  const a = sa.antragsteller || {};
  const m = sa.mitantragsteller || {};
  const gemeinsam = sa.gemeinsam !== false;

  const displayName = k.name || ((k.vorname || '') + ' ' + (k.nachname || '')).trim() || '—';

  function personBlock(p, label) {
    const f = (l, v, suffix) => `<tr><td>${esc(l)}</td><td class="num">${esc(v === null || v === undefined ? '—' : v)}${suffix ? ' ' + suffix : ''}</td></tr>`;
    return `
      <h3>${label}</h3>
      <table>
        ${f('Netto / Monat', p.nettoMo, '€')}
        ${f('Anzahl Gehälter', p.anzahlGehaelter)}
        ${f('Vermietung', p.vermietungMo, '€')}
        ${f('Sonstige Einkommen', p.sonstigeMo, '€')}
        ${f('Unterhalt erhalten', p.unterhaltMo, '€')}
        ${f('Kindergeld', p.kindergeldMo, '€')}
        ${f('Kinder Anzahl', p.kinderAnzahl)}
        ${f('Eigene Miete', p.mieteMo, '€')}
        ${f('Unterhalt gezahlt', p.unterhaltZahlungMo, '€')}
        ${f('PKV', p.pkvMo, '€')}
        ${f('Bankguthaben', p.bankguthaben, '€')}
        ${f('Wertpapiere', p.wertpapiere, '€')}
        ${f('Sparbücher', p.sparbuecher, '€')}
        ${f('Bausparen', p.bausparen, '€')}
        ${f('Sonstiges Vermögen', p.sonstigeVermoegen, '€')}
      </table>
    `;
  }

  let bonDetail = null;
  if (window.Kalk && window.Kalk.computeBonitaetDetailed) {
    bonDetail = window.Kalk.computeBonitaetDetailed(sa, gemeinsam);
  }
  const fmt = window.Kalk.fmtEur;

  const cover = `
    <div class="pdf-page">
      <h1>Selbstauskunft</h1>
      <p style="font-size:11px;color:var(--text-tertiary)">Stand: ${new Date().toLocaleDateString('de-DE')}</p>
      <table>
        <tr><td>Name</td><td>${esc(displayName)}</td></tr>
        <tr><td>E-Mail</td><td>${esc(k.email || '—')}</td></tr>
        <tr><td>Telefon</td><td>${esc(k.telefon || '—')}</td></tr>
        <tr><td>Geburtsdatum</td><td>${esc(k.geburtsdatum || '—')}</td></tr>
        <tr><td>Antragsmodus</td><td>${gemeinsam ? 'Gemeinsam (2 Antragsteller)' : 'Einzeln'}</td></tr>
      </table>
      ${_footer(user)}
    </div>
  `;

  const detail1 = `
    <div class="pdf-page">
      ${personBlock(a, 'Antragsteller 1')}
      ${_footer(user)}
    </div>
  `;

  const detail2 = gemeinsam ? `
    <div class="pdf-page">
      ${personBlock(m, 'Antragsteller 2')}
      ${_footer(user)}
    </div>
  ` : '';

  const summary = bonDetail ? `
    <div class="pdf-page">
      <h1>Bonitäts-Zusammenfassung</h1>
      <table>
        <tr><td>Anrechenbares Einkommen / Monat</td><td class="num"><strong>${fmt(bonDetail.einkommenAnrechenbarMo)}</strong></td></tr>
        <tr><td>Haushaltspauschale</td><td class="num">${fmt(bonDetail.haushaltPauschale)}</td></tr>
        <tr><td>Fixkosten</td><td class="num">${fmt(bonDetail.fixkostenMo)}</td></tr>
        <tr><td>Verbindlichkeiten mtl.</td><td class="num">${fmt(bonDetail.verbindlichkeitenMo)}</td></tr>
        <tr><td>Ausgaben gesamt / Mo</td><td class="num">${fmt(bonDetail.ausgabenGesamtMo)}</td></tr>
        <tr><td>Freies Vermögen</td><td class="num"><strong>${fmt(bonDetail.freiesVermoegen)}</strong></td></tr>
      </table>
      <div class="pdf-disclaimer">
        Die Angaben in dieser Selbstauskunft sind nach bestem Wissen erfolgt.
        Die Bank ist berechtigt, die Angaben zu prüfen.
      </div>
      ${_footer(user)}
    </div>
  ` : '';

  _doPrint(cover + detail1 + detail2 + summary, 'sa');
}

window.PDF = { investitionsrechnung, reservierung, selbstauskunft };
