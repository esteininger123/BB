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
        <div class="kpi-pdf"><div class="label">Vermögensaufbau netto J10</div><div class="value">${fmt(r.vermoegenNetto10)}</div></div>
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
      <h1>Cashflow-Detail (10 Jahre)</h1>
      <p style="font-size:11px;color:var(--text-tertiary)">Jahres-Werte. Cashflow positiv = Überschuss; negativ = Eigenleistung.</p>
      <table>
        <thead>
          <tr><th>Jahr</th><th class="num">Miete</th><th class="num">Zinsen</th><th class="num">Tilgung</th><th class="num">HG</th><th class="num">St-Vorteil</th><th class="num">Cashflow</th><th class="num">Restschuld</th></tr>
        </thead>
        <tbody>
          ${r.cf.slice(0,10).map(c => `
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

  // Vermögensaufbau pro Jahr (10 J)
  const vermPage = `
    <div class="pdf-page">
      <h1>Vermögensaufbau (10 Jahre)</h1>
      <p style="font-size:11px;color:var(--text-tertiary)">Brutto = Immobilien-Wert minus Restschuld. Netto = Brutto minus eingesetztes EK plus kumulierter Cashflow (ehrliche Vergleichsgröße).</p>
      <table>
        <thead>
          <tr><th>Jahr</th><th class="num">Wert</th><th class="num">Restschuld</th><th class="num">kum. CF</th><th class="num">Brutto</th><th class="num">Netto</th></tr>
        </thead>
        <tbody>
          ${r.vermoegen.map(v => `
            <tr>
              <td>J${v.y}</td>
              <td class="num">${fmt(v.wert)}</td>
              <td class="num">${fmt(v.restschuld)}</td>
              <td class="num">${fmt(v.kumCf)}</td>
              <td class="num">${fmt(v.vermoegenBrutto)}</td>
              <td class="num"><strong>${fmt(v.vermoegenNetto)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h2>Sparen vs. Investieren (10 Jahre)</h2>
      <p style="font-size:11px;color:var(--text-tertiary)">Vergleich: alles Geld auf Tagesgeld lassen vs. Immobilien-Investment inkl. Cashflow.</p>
      <table>
        <thead>
          <tr><th>Jahr</th><th class="num">Nur Sparen</th><th class="num">Mit Immobilie</th><th class="num">Delta</th></tr>
        </thead>
        <tbody>
          ${r.sparen.map(s => `
            <tr>
              <td>J${s.y}</td>
              <td class="num">${fmt(s.nurSparen)}</td>
              <td class="num">${fmt(s.mitImmo)}</td>
              <td class="num"><strong>${fmt(s.delta)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${_footer(user)}
    </div>
  `;

  // Bonität-Seite
  const bon = `
    <div class="pdf-page">
      <h1>Bonität (Bank-Sicht)</h1>
      <p style="font-size:11px;color:var(--text-tertiary)">Quelle: ${r.bonModus === 'detail' ? 'Selbstauskunft' : 'Profil-Defaults'}.</p>
      <div class="kpi-grid-pdf">
        <div class="kpi-pdf"><div class="label">Einkommen anrechenbar</div><div class="value">${fmtMo(r.bonEinnahmen)}</div></div>
        <div class="kpi-pdf"><div class="label">Ausgaben gesamt</div><div class="value">${fmtMo(r.bonAusgaben)}</div></div>
        <div class="kpi-pdf"><div class="label">Frei vor Investment</div><div class="value">${fmtMo(r.bonVor)}</div></div>
        <div class="kpi-pdf"><div class="label">Frei nach Investment</div><div class="value">${fmtMo(r.bonNach)}</div></div>
        <div class="kpi-pdf"><div class="label">Freies Vermögen</div><div class="value">${fmt(r.bonVermoegen)}</div></div>
        <div class="kpi-pdf"><div class="label">Vermögen − EK-Bedarf</div><div class="value">${fmt(r.bonVermoegenVsEk)}</div></div>
      </div>

      <h2>Investment-Delta (mtl.)</h2>
      <table>
        <tr><td>Miete anrechenbar (80%)</td><td class="num">${fmtMo(r.bonMieteAnr)}</td></tr>
        <tr><td>Annuität (Zins + Tilgung)</td><td class="num">${fmtMo(r.bonAnnuMo)}</td></tr>
        ${r.bonModus === 'detail' ? `
        <tr><td>Hausgeld (Bank-konservativ)</td><td class="num">${fmtMo(r.hausgeldNurMo || 0)}</td></tr>
        <tr><td>Hausverwaltung</td><td class="num">${fmtMo(r.hausverwaltungMo || 0)}</td></tr>
        ` : ''}
        <tr><td><strong>Delta Bonität (Investment)</strong></td><td class="num"><strong>${fmtMo(r.bonDelta)}</strong></td></tr>
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

  _doPrint(cover + kpis + cf + vermPage + bon + annahmen, 'invest');
}

/* ====================================================================
   RESERVIERUNG
   ==================================================================== */
function reservierung(kunde, kalkInputs, user) {
  const k = kunde || {};
  const u = user || {};
  const sa = (k.saJson && typeof k.saJson === 'object') ? k.saJson : {};
  const A = sa.antragsteller || {};

  // Käufer-Daten (Vor- / Nachname aus Stammdaten, Adresse aus Selbstauskunft)
  const kaeuferName = ((k.vorname || '') + ' ' + (k.nachname || '')).trim() || k.name || '';
  const kaeuferStr  = A.strasse || '';
  const kaeuferPlz  = (A.plz || '') + (A.plz && A.ort ? ' ' : '') + (A.ort || '');
  const kaeuferOrt  = A.ort || '';

  // Objekt-Daten: Lage + Wohnungs-Nr aus kalkInputs (WE-Auswahl), QM, KP, Stellplatz
  const lage    = (kalkInputs && kalkInputs._weLage)   || '';
  const weNr    = (kalkInputs && kalkInputs._weNr)     || '';
  const qm      = (kalkInputs && kalkInputs.qm)        || 0;
  const kp      = (kalkInputs && kalkInputs.kaufpreis) || 0;
  const spKp    = (kalkInputs && kalkInputs.stellplatzKp) || 0;
  const fmt     = window.Kalk.fmtEur;
  const fmtQm   = (v) => (v || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' qm';

  // Reservierungs- + Unterschriftsdatum (default: heute / heute+30T)
  const heute   = new Date();
  const reservBis = new Date(heute.getTime() + 30 * 24 * 3600 * 1000);
  const dtDe = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Verkäufer fest: B&B Immo GmbH, Edgar als Unterzeichner (kann durch user.name überschrieben werden).
  const verkaeuferName = u.name || 'Edgar Steininger';

  // Objekt-Block: "PLZ Ort, Straße mit Wohnung X mit Y qm zum Kaufpreis von Z € plus W € für eine Garage."
  const garageText = spKp > 0 ? ` plus ${fmt(spKp)} für einen Stellplatz/Garage` : '';
  const wohnungText = weNr ? ` mit Wohnung ${weNr}` : '';
  const qmText = qm > 0 ? ` mit ${fmtQm(qm)}` : '';
  const objektZeile = `${esc(lage)}${esc(wohnungText)}${esc(qmText)} zum Kaufpreis von ${fmt(kp)}${esc(garageText)}.`;

  const html = `
    <div class="pdf-page reservierung-page">
      <div class="reserv-head">
        <div class="reserv-title"><strong>Kaufabsichtserklärung und Reservierungsvereinbarung</strong></div>
        <div class="reserv-logo">
          <div class="bub-logo">
            <div class="bub-mark">B&amp;B</div>
            <div class="bub-text">Brot &amp; Butter<br><span>Immobilien</span></div>
          </div>
        </div>
      </div>

      <div class="reserv-parties">
        <p><strong>ZWISCHEN</strong></p>
        <p class="party-block">
          Verkäufer: ${esc(verkaeuferName)}<br>
          B&amp;B Immo GmbH<br>
          Burdastraße 23<br>
          77746 Schutterwald
        </p>
        <p><strong>UND</strong></p>
        <p class="party-block">
          Kaufinteressent/-in:<br>
          ${esc(kaeuferName || '—')}<br>
          ${esc(kaeuferStr || '—')}<br>
          ${esc(kaeuferPlz || '—')}
        </p>
      </div>

      <div class="reserv-body">
        <p><strong>Kaufabsichtserklärung</strong></p>

        <p>Die Vertragsparteien vereinbaren die Reservierung des Objekts bis zum <strong>${dtDe(reservBis)}</strong>.</p>
        <p>Der Notartermin wird innerhalb dieses Zeitraums in Absprache zwischen beiden Parteien festgelegt.</p>

        <p>
          <strong>Objekt:</strong><br>
          ${objektZeile}
        </p>

        <p>Die Vertragsparteien sind sich einig, einen notariellen Kaufvertrag gemäß den oben genannten Angaben und den persönlichen Daten bei einem ortsnahen Notar zu erstellen.</p>

        <p>Reservierung unter dem Vorbehalt einer ordnungsgemäßen Einsicht in die vollständige Dokumentation, der Besichtigung und Finanzierung.</p>
      </div>

      <div class="reserv-signatures">
        <div class="sig-col">
          <div class="sig-line"></div>
          <div class="sig-meta">Schutterwald, den ${dtDe(heute)}</div>
          <div class="sig-meta">Verkäufer: ${esc(verkaeuferName)}</div>
          <div class="sig-meta">B&amp;B Immo GmbH</div>
        </div>
        <div class="sig-col">
          <div class="sig-line"></div>
          <div class="sig-meta">${esc(kaeuferOrt || 'Ort')}, den ${dtDe(heute)}</div>
          <div class="sig-meta">Kaufinteressent/-in:</div>
          <div class="sig-meta">${esc(kaeuferName || '—')}</div>
        </div>
      </div>
    </div>
  `;
  _doPrint(html, 'reservierung');
}

/* ====================================================================
   SELBSTAUSKUNFT (Hypovision-Form, 3 Seiten)
   ==================================================================== */
function selbstauskunft(kunde, user) {
  const k = kunde || {};
  // Backend liefert saJson bereits geparsed (Object oder null).
  let sa = k.saJson;
  if (typeof sa === 'string') { try { sa = JSON.parse(sa); } catch(e) { sa = null; } }
  if (!sa || typeof sa !== 'object') sa = {};
  const a = sa.antragsteller || {};
  const m = sa.mitantragsteller || {};
  const gemeinsam = sa.gemeinsam === true;

  const fmt = window.Kalk.fmtEur;
  const fmtNum = (v) => (v === null || v === undefined || v === '') ? '' : (typeof v === 'number' ? Math.round(v).toLocaleString('de-DE') + ' €' : v);
  const dt = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? new Date(v).toLocaleDateString('de-DE') : (v || '');

  function row(label, valA, valM) {
    return `<tr><td class="sa-label">${esc(label)}</td><td>${esc(valA || '')}</td><td>${esc(gemeinsam ? (valM || '') : '')}</td></tr>`;
  }
  function rowChk(label, opts, valA, valM) {
    const fmtOpt = (v) => {
      if (!v) return '';
      return opts.map(o => (o === v ? `☑ ${o}` : `☐ ${o}`)).join('  ');
    };
    return `<tr><td class="sa-label">${esc(label)}</td><td>${esc(fmtOpt(valA))}</td><td>${gemeinsam ? esc(fmtOpt(valM)) : ''}</td></tr>`;
  }
  function darlBlock(p, key, label) {
    const d = p[key] || {};
    if (!d.urspruenglich && !d.belastungMo && !d.restsaldo) return '';
    return `
      <tr>
        <td class="sa-label">${esc(label)}</td>
        <td>urspr.: ${esc(fmtNum(d.urspruenglich))}<br>bis: ${esc(dt(d.laufzeitBis))}<br>mtl.: ${esc(fmtNum(d.belastungMo))}<br>Rest: ${esc(fmtNum(d.restsaldo))}</td>
        <td></td>
      </tr>
    `;
  }

  const versA = a.vers || {};

  // === SEITE 1: PERSÖNLICHE VERHÄLTNISSE + EINKOMMEN + FIXKOSTEN ===
  const seite1 = `
    <div class="pdf-page sa-page">
      <div class="sa-head">
        <div class="sa-title"><strong>SELBSTAUSKUNFT</strong> – VERTRAULICH</div>
        <div class="sa-page-num">SEITE 1</div>
      </div>
      <table class="sa-table">
        <thead><tr><th class="sa-section-h">PERSÖNLICHE VERHÄLTNISSE</th><th>ANTRAGSTELLER</th><th>${gemeinsam ? 'MITANTRAGSTELLER / EHEPARTNER' : ''}</th></tr></thead>
        <tbody>
          ${row('Name', a.name, m.name)}
          ${row('Geburtsname', a.geburtsname, m.geburtsname)}
          ${row('Vorname', a.vorname, m.vorname)}
          ${row('Straße', a.strasse, m.strasse)}
          ${row('PLZ/Ort', (a.plz || '') + (a.plz && a.ort ? ' ' : '') + (a.ort || ''), (m.plz || '') + (m.plz && m.ort ? ' ' : '') + (m.ort || ''))}
          ${row('Telefon privat', a.telefonPrivat, m.telefonPrivat)}
          ${row('Telefon geschäftlich', a.telefonGeschaeftlich, m.telefonGeschaeftlich)}
          ${row('E-Mail', a.email, m.email)}
          ${row('Geburtsdatum', dt(a.geburtsdatum), dt(m.geburtsdatum))}
          ${row('Staatsangehörigkeit', a.staatsangehoerigkeit, m.staatsangehoerigkeit)}
          ${row('ausgeübter Beruf', a.beruf, m.beruf)}
          ${row('beschäftigt bei Firma', a.firma, m.firma)}
          ${row('beschäftigt seit', dt(a.beschaeftigtSeit), dt(m.beschaeftigtSeit))}
          ${rowChk('Befristung', ['unbefristet','befristet'], a.befristung, m.befristung)}
          ${row('Steuer-ID', a.steuerId, m.steuerId)}
          ${rowChk('Familienstand', ['ledig','verheiratet','geschieden','verwitwet'], a.familienstand, m.familienstand)}
          ${row('Kinder im Haushalt', a.kinderAnzahl !== undefined && a.kinderAnzahl !== null ? `Anzahl: ${a.kinderAnzahl}${a.kinderAlter ? ' / Alter: ' + a.kinderAlter : ''}` : '', m.kinderAnzahl !== undefined && m.kinderAnzahl !== null ? `Anzahl: ${m.kinderAnzahl}${m.kinderAlter ? ' / Alter: ' + m.kinderAlter : ''}` : '')}
          ${rowChk('Kinder in Planung', ['ja','nein'], a.kinderPlanung, m.kinderPlanung)}
          ${row('KFZ Anzahl', a.kfzAnzahl, m.kfzAnzahl)}
          ${row('Bank', a.bank, m.bank)}
          ${row('IBAN', a.iban, m.iban)}
          ${row('BIC', a.bic, m.bic)}
        </tbody>
        <thead><tr><th class="sa-section-h">EINKOMMEN</th><th>ANTRAGSTELLER</th><th>${gemeinsam ? 'MITANTRAGSTELLER' : ''}</th></tr></thead>
        <tbody>
          ${row('Netto-Gehalt', fmtNum(a.nettoMo), fmtNum(m.nettoMo))}
          ${rowChk('Anzahl Gehälter', ['12','12,5','13','14'], a.anzahlGehaelter ? String(a.anzahlGehaelter).replace('.',',') : '', m.anzahlGehaelter ? String(m.anzahlGehaelter).replace('.',',') : '')}
          ${row('Vermietung & Verpachtung', fmtNum(a.vermietungMo), fmtNum(m.vermietungMo))}
          ${row('Sonstige Einkommen', fmtNum(a.sonstigeMo), fmtNum(m.sonstigeMo))}
          ${row('Unterhalt', fmtNum(a.unterhaltMo), fmtNum(m.unterhaltMo))}
          ${row('Kindergeld', fmtNum(a.kindergeldMo), fmtNum(m.kindergeldMo))}
          ${row('Zu versteuerndes Einkommen / Jahr', fmtNum(a.zveJahr), fmtNum(m.zveJahr))}
          ${rowChk('Kirchensteuerpflicht', ['ja','nein'], a.kirchensteuer, m.kirchensteuer)}
        </tbody>
        <thead><tr><th class="sa-section-h">MONATLICHE FIXKOSTEN</th><th>ANTRAGSTELLER</th><th>${gemeinsam ? 'MITANTRAGSTELLER' : ''}</th></tr></thead>
        <tbody>
          ${row('Miete inkl. NK', fmtNum(a.mieteMo), fmtNum(m.mieteMo))}
          ${row('Unterhaltszahlungen', fmtNum(a.unterhaltZahlungMo), fmtNum(m.unterhaltZahlungMo))}
          ${row('Beitrag private Krankenversicherung', fmtNum(a.pkvMo), fmtNum(m.pkvMo))}
        </tbody>
      </table>
      ${_footer(user)}
    </div>
  `;

  // === SEITE 2: VERMÖGEN + IMMOBILIEN + VERBINDLICHKEITEN ===
  const seite2 = `
    <div class="pdf-page sa-page">
      <div class="sa-head">
        <div class="sa-title"><strong>SELBSTAUSKUNFT</strong> – VERTRAULICH</div>
        <div class="sa-page-num">SEITE 2</div>
      </div>
      <table class="sa-table">
        <thead><tr><th class="sa-section-h">VERMÖGEN</th><th>ANTRAGSTELLER</th><th>${gemeinsam ? 'MITANTRAGSTELLER' : ''}</th></tr></thead>
        <tbody>
          ${row('Bankguthaben', fmtNum(a.bankguthaben), fmtNum(m.bankguthaben))}
          ${row('Wertpapiere (Kurswert)', fmtNum(a.wertpapiere), fmtNum(m.wertpapiere))}
          ${row('Sparbücher', fmtNum(a.sparbuecher), fmtNum(m.sparbuecher))}
          ${row('Bauspar / VWL', fmtNum(a.bausparen), fmtNum(m.bausparen))}
          ${row('Sonstige Vermögen', fmtNum(a.sonstigeVermoegen), fmtNum(m.sonstigeVermoegen))}
          ${versA.art || versA.summe ? `
            <tr><td class="sa-label">Guthaben in Versicherungen<br>Art / Beginn / Ende</td>
                <td>${esc(versA.art || '')} / ${esc(dt(versA.beginn))} / ${esc(dt(versA.ende))}</td>
                <td></td></tr>
            <tr><td class="sa-label">Versicherungssumme / Beitrag / Rückkaufwert</td>
                <td>${esc(fmtNum(versA.summe))} / ${esc(fmtNum(versA.belastungMo))} / ${esc(fmtNum(versA.rueckkauf))}</td>
                <td></td></tr>
          ` : ''}
        </tbody>
        ${(a.immo1 && (a.immo1.art || a.immo1.anschrift)) || (a.immo2 && (a.immo2.art || a.immo2.anschrift)) ? `
          <thead><tr><th class="sa-section-h">IMMOBILIENVERMÖGEN</th><th>Immobilie 1</th><th>Immobilie 2</th></tr></thead>
          <tbody>
            <tr><td class="sa-label">Art des Objekts</td><td>${esc((a.immo1 && a.immo1.art) || '')}</td><td>${esc((a.immo2 && a.immo2.art) || '')}</td></tr>
            <tr><td class="sa-label">Anschrift</td><td>${esc((a.immo1 && a.immo1.anschrift) || '')}</td><td>${esc((a.immo2 && a.immo2.anschrift) || '')}</td></tr>
            <tr><td class="sa-label">Baujahr / Erwerbsjahr</td><td>${esc((a.immo1 && a.immo1.baujahr) || '')}</td><td>${esc((a.immo2 && a.immo2.baujahr) || '')}</td></tr>
            <tr><td class="sa-label">Wohnfläche</td><td>${esc((a.immo1 && a.immo1.wohnflaeche) ? a.immo1.wohnflaeche + ' m²' : '')}</td><td>${esc((a.immo2 && a.immo2.wohnflaeche) ? a.immo2.wohnflaeche + ' m²' : '')}</td></tr>
            <tr><td class="sa-label">Verkehrswert</td><td>${esc(fmtNum(a.immo1 && a.immo1.verkehrswert))}</td><td>${esc(fmtNum(a.immo2 && a.immo2.verkehrswert))}</td></tr>
            <tr><td class="sa-label">Hypotheken & Grundschulden</td><td>${esc(fmtNum(a.immo1 && a.immo1.hypotheken))}</td><td>${esc(fmtNum(a.immo2 && a.immo2.hypotheken))}</td></tr>
            <tr><td class="sa-label">Mieteinnahmen / Monat</td><td>${esc(fmtNum(a.immo1 && a.immo1.mietenMo))}</td><td>${esc(fmtNum(a.immo2 && a.immo2.mietenMo))}</td></tr>
          </tbody>
        ` : ''}
        <thead><tr><th class="sa-section-h">VERBINDLICHKEITEN</th><th>ANTRAGSTELLER</th><th>${gemeinsam ? 'MITANTRAGSTELLER' : ''}</th></tr></thead>
        <tbody>
          ${darlBlock(a, 'bf1', 'Baufinanzierung 1')}
          ${darlBlock(a, 'bf2', 'Baufinanzierung 2')}
          ${darlBlock(a, 'kd1', 'Konsumentendarlehen 1')}
          ${darlBlock(a, 'kd2', 'Konsumentendarlehen 2')}
          ${gemeinsam ? darlBlock(m, 'bf1', 'Baufinanzierung 1 (Mit)') : ''}
          ${gemeinsam ? darlBlock(m, 'bf2', 'Baufinanzierung 2 (Mit)') : ''}
          ${gemeinsam ? darlBlock(m, 'kd1', 'Konsumentendarlehen 1 (Mit)') : ''}
          ${gemeinsam ? darlBlock(m, 'kd2', 'Konsumentendarlehen 2 (Mit)') : ''}
        </tbody>
      </table>
      ${_footer(user)}
    </div>
  `;

  // === SEITE 3: Bonität + Unterschrift ===
  let bonDetail = null;
  if (window.Kalk && window.Kalk.computeBonitaetDetailed) {
    bonDetail = window.Kalk.computeBonitaetDetailed(sa, gemeinsam);
  }
  const seite3 = `
    <div class="pdf-page sa-page">
      <div class="sa-head">
        <div class="sa-title"><strong>SELBSTAUSKUNFT</strong> – Bonitäts-Auswertung</div>
        <div class="sa-page-num">SEITE 3</div>
      </div>
      ${bonDetail ? `
      <h2 style="margin-top:0;">Anrechenbares Einkommen</h2>
      <table>
        <tr><td>Netto-Gehalt (anrechenbar)</td><td class="num">${fmt((bonDetail.einkommenA.netto || 0) + (bonDetail.einkommenM.netto || 0))}</td></tr>
        <tr><td>Vermietung (80% Anrechnung)</td><td class="num">${fmt((bonDetail.einkommenA.vermAnr || 0) + (bonDetail.einkommenM.vermAnr || 0))}</td></tr>
        <tr><td>Sonstige (Unterhalt, Kindergeld, Sonstige)</td><td class="num">${fmt((bonDetail.einkommenA.sonstigeAnr || 0) + (bonDetail.einkommenM.sonstigeAnr || 0))}</td></tr>
        <tr><td><strong>Summe / Monat</strong></td><td class="num"><strong>${fmt(bonDetail.einkommenAnrechenbarMo)}</strong></td></tr>
      </table>
      <h2>Ausgaben (Bank-Sicht)</h2>
      <table>
        <tr><td>Haushaltspauschale (${bonDetail.erwachsene} Erw. + ${bonDetail.kinder} Kinder)</td><td class="num">${fmt(bonDetail.haushaltPauschale)}</td></tr>
        <tr><td>Fixkosten (Miete + Unterhalt + PKV)</td><td class="num">${fmt(bonDetail.fixkostenMo)}</td></tr>
        <tr><td>Verbindlichkeiten mtl. (Baufi + Konsum + Vers.)</td><td class="num">${fmt(bonDetail.verbindlichkeitenMo)}</td></tr>
        <tr><td><strong>Summe / Monat</strong></td><td class="num"><strong>${fmt(bonDetail.ausgabenGesamtMo)}</strong></td></tr>
      </table>
      <h2>Frei verfügbar &amp; Vermögen</h2>
      <table>
        <tr><td>Frei vor Investment / Monat</td><td class="num"><strong>${fmt(bonDetail.einkommenAnrechenbarMo - bonDetail.ausgabenGesamtMo)}</strong></td></tr>
        <tr><td>Freies Vermögen (Bank-Sicht)</td><td class="num"><strong>${fmt(bonDetail.freiesVermoegen)}</strong></td></tr>
        <tr><td>Verbindlichkeiten gesamt</td><td class="num">${fmt(bonDetail.verbindlichkeitenGesamt)}</td></tr>
      </table>
      ` : '<p>Keine Selbstauskunft-Daten erfasst.</p>'}
      <div class="pdf-disclaimer">
        Ich versichere/Wir versichern, dass die obigen Angaben nach bestem Wissen, vollständig und wahrheitsgemäß
        gemacht wurden. Mir/uns ist bekannt, dass falsche Angaben zur Vertragsaufhebung führen können.
        Hiermit stimme/n ich/wir der Übermittlung der Daten an die kreditgebende Bank sowie an SCHUFA und Creditreform
        gemäß DS-GVO zu.
      </div>
      <div style="margin-top:20mm; display:grid; grid-template-columns:1fr 1fr; gap:22mm;">
        <div>
          <div style="height:20mm; border-bottom:1px solid #000;"></div>
          <div style="font-size:10px; margin-top:2mm;">Ort, Datum &middot; Antragsteller</div>
        </div>
        ${gemeinsam ? `
        <div>
          <div style="height:20mm; border-bottom:1px solid #000;"></div>
          <div style="font-size:10px; margin-top:2mm;">Ort, Datum &middot; Mitantragsteller</div>
        </div>` : '<div></div>'}
      </div>
      ${_footer(user)}
    </div>
  `;

  _doPrint(seite1 + seite2 + seite3, 'sa');
}

window.PDF = { investitionsrechnung, reservierung, selbstauskunft };
