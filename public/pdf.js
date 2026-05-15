/* pdf.js — drei PDF-Templates: Investitionsrechnung, Reservierung, Selbstauskunft.
   Mechanismus: setzt body-Klasse `pdf-mode-X`, befüllt #pdf-template mit HTML,
   ruft window.print(). Print-CSS in styles.css blendet alles andere aus.

   Einheitliches Layout: jede Seite hat den gleichen Header (Brot & Butter Logo +
   Untertitel + ggf. Seitennummer) und Footer (B&B Immo + Vertriebler-Daten). */

// Brot & Butter Immobilien Logo als SVG — repliziert das Original-Logo (zwei B mit
// Schatten-Effekt + Schriftzug). Wiederverwendbar in allen PDFs.
function _bubLogo() {
  return `
    <svg class="bub-logo-svg" viewBox="0 0 300 80" xmlns="http://www.w3.org/2000/svg">
      <!-- Schatten-Buchstaben in Grau, leicht versetzt -->
      <text x="5" y="62" font-family="Georgia, 'Times New Roman', serif" font-size="62" font-weight="400" fill="#B8B8B8" letter-spacing="-6">B</text>
      <text x="38" y="62" font-family="Georgia, 'Times New Roman', serif" font-size="62" font-weight="400" fill="#B8B8B8" letter-spacing="-6">B</text>
      <!-- Vordergrund-Buchstaben in Schwarz, links versetzt -->
      <text x="0" y="58" font-family="Georgia, 'Times New Roman', serif" font-size="62" font-weight="600" fill="#000" letter-spacing="-6">B</text>
      <text x="33" y="58" font-family="Georgia, 'Times New Roman', serif" font-size="62" font-weight="600" fill="#000" letter-spacing="-6">B</text>
      <!-- "Brot & Butter" — leichte Schrift -->
      <text x="92" y="40" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="300" fill="#1a1a1a" letter-spacing="0.5">Brot &amp; Butter</text>
      <!-- "Immobilien" — fett -->
      <text x="92" y="65" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="#1a1a1a" letter-spacing="0.5">Immobilien</text>
    </svg>
  `;
}

// Einheitlicher Header pro Seite: Logo + Titel + Untertitel (rechts).
function _header(title, subtitle) {
  return `
    <div class="pdf-head">
      ${_bubLogo()}
      <div class="pdf-head-title">
        <div class="pdf-title">${esc(title || '')}</div>
        ${subtitle ? `<div class="pdf-subtitle">${esc(subtitle)}</div>` : ''}
      </div>
    </div>
  `;
}

function _footer(user) {
  const u = user || {};
  const datum = new Date().toLocaleDateString('de-DE');
  return `
    <div class="pdf-footer">
      <div><strong>B&amp;B Immo GmbH</strong> &middot; Burdastraße 23, 77746 Schutterwald</div>
      <div>${esc(u.name || '')}${u.email ? ' · ' + esc(u.email) : ''}${u.telefon ? ' · ' + esc(u.telefon) : ''} · ${esc(datum)}</div>
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

  const datum = new Date().toLocaleDateString('de-DE');
  // ===== SEITE 1: Kennzahlen + Bonität (Verkaufs-Story) =====
  const seite1 = `
    <div class="pdf-page">
      ${_header('Investitionsrechnung', datum + ' · für ' + displayName)}
      <div class="pdf-objekt-info">
        <strong>Objekt:</strong> ${esc(we)} &middot; <strong>Kaufpreis:</strong> ${fmt(r.kpGesamt)} &middot; <strong>${esc(kalkInputs.qm)} m²</strong>
      </div>

      <h2 class="pdf-section-h">Kennzahlen auf einen Blick</h2>
      <div class="kpi-grid-pdf">
        <div class="kpi-pdf"><div class="label">Eigenkapital-Bedarf</div><div class="value">${fmt(r.ekBedarf)}</div></div>
        <div class="kpi-pdf ${r.belastungMo < 0 ? 'neg' : 'pos'}"><div class="label">Belastung Jahr 1 mtl.</div><div class="value">${fmtMo(r.belastungMo)}</div></div>
        <div class="kpi-pdf"><div class="label">EK-Rendite (IRR) 10 J.</div><div class="value">${fmtPct(r.irr)}</div></div>
        <div class="kpi-pdf"><div class="label">Vermögen brutto 10 J.</div><div class="value">${fmt(r.vermoegenBrutto10)}</div></div>
        <div class="kpi-pdf pos"><div class="label">Vermögen netto 10 J.</div><div class="value">${fmt(r.vermoegenNetto10)}</div></div>
        ${r.markteinkaufVorteil ? `<div class="kpi-pdf pos"><div class="label">Markteinkauf-Vorteil</div><div class="value">${fmt(r.markteinkaufVorteil)}</div></div>` : ''}
      </div>

      <h2 class="pdf-section-h">Bonität (Bank-Sicht)</h2>
      <div class="kpi-grid-pdf kpi-grid-4">
        <div class="kpi-pdf ${r.bonVor >= 0 ? 'pos' : 'neg'}"><div class="label">Einkommen frei vor Invest.</div><div class="value">${fmtMo(r.bonVor || 0)}</div></div>
        <div class="kpi-pdf ${r.bonNach >= 0 ? 'pos' : 'neg'}"><div class="label">Einkommen frei nach Invest.</div><div class="value">${fmtMo(r.bonNach || 0)}</div></div>
        <div class="kpi-pdf"><div class="label">Eigenkapital vor Invest.</div><div class="value">${fmt(r.bonVermoegen || 0)}</div></div>
        <div class="kpi-pdf ${r.bonVermoegenVsEk >= 0 ? 'pos' : 'neg'}"><div class="label">Eigenkapital nach Invest.</div><div class="value">${fmt(r.bonVermoegenVsEk || 0)}</div></div>
      </div>

      <h2 class="pdf-section-h">Vertriebs-Argumente</h2>
      <div class="argument-grid">
        ${r.markteinkaufVorteil ? `<div class="arg-box"><div class="arg-h">Markteinkauf-Vorteil</div><div class="arg-v">${fmt(r.markteinkaufVorteil)}</div><div class="arg-d">unter Marktpreis eingekauft</div></div>` : ''}
        <div class="arg-box"><div class="arg-h">Mietsubvention gesamt</div><div class="arg-v">${fmt(r.mietsubventionGesamt)}</div><div class="arg-d">Anlaufphase abgefedert</div></div>
        <div class="arg-box"><div class="arg-h">Vorteil ggü. Sparen</div><div class="arg-v">${fmt(r.sparenVsKaufenDelta)}</div><div class="arg-d">über 10 Jahre</div></div>
      </div>
      ${_footer(user)}
    </div>
  `;

  const cf = `
    <div class="pdf-page">
      ${_header('Cashflow & Vermögensaufbau', displayName + ' · ' + esc(we))}
      <h2 class="pdf-section-h">Cashflow Jahr 1 – 10</h2>
      <p style="font-size:10.5px;color:#777;margin:0 0 6px 0;">Jahres-Werte. Cashflow positiv = Überschuss; negativ = Eigenleistung pro Jahr.</p>
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
      ${_header('Vermögensaufbau & Sparen vs. Investieren', displayName + ' · ' + esc(we))}
      <h2 class="pdf-section-h">Vermögensaufbau 10 Jahre</h2>
      <p style="font-size:10.5px;color:#777;margin:0 0 6px 0;">Brutto = Immobilien-Wert − Restschuld. Netto = Brutto − eingesetztes EK + kumulierter Cashflow (ehrliche Vergleichsgröße).</p>
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

      <h2 class="pdf-section-h">Sparen vs. Investieren (10 Jahre)</h2>
      <p style="font-size:10.5px;color:#777;margin:0 0 6px 0;">Vergleich: alles Geld auf Tagesgeld lassen (Annahme ${((kalkInputs.sparZins || 0.025) * 100).toFixed(2).replace('.',',')} % p.a.) vs. Immobilien-Investment inkl. Cashflow.</p>
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

  // Bonitäts-Detail-Seite — zeigt Saldo-Rechnung für die Bank
  const bon = `
    <div class="pdf-page">
      ${_header('Bonitäts-Effekt', displayName + ' · Bank-Sicht')}
      <p style="font-size:10.5px;color:#777;margin:0 0 8px 0;">Quelle: ${r.bonModus === 'detail' ? 'Selbstauskunft' : 'manuelle Quick-Eingabe'}. Banken rechnen die Miete pauschal mit 80 % an (Leerstands-/Mietausfallsreserve).</p>

      <h2 class="pdf-section-h">Saldo-Rechnung</h2>
      <table class="invest-table">
        <tr><td>Einnahmen / Monat</td><td class="num pos">+ ${fmtMo(r.bonEinnahmen || 0)}</td></tr>
        <tr><td>Ausgaben / Monat</td><td class="num neg">− ${fmtMo(r.bonAusgaben || 0)}</td></tr>
        <tr class="totalrow"><td><strong>Saldo vor Kauf</strong></td><td class="num"><strong>${fmtMo(r.bonVor || 0)}</strong></td></tr>
        <tr><td>+ Anrechenbare Miete (80 %)</td><td class="num pos">+ ${fmtMo(r.bonMieteAnr || 0)}</td></tr>
        <tr><td>− Annuität Bank</td><td class="num neg">− ${fmtMo(r.bonAnnuMo || 0)}</td></tr>
        ${r.bonModus === 'detail' ? `
        <tr><td>− Hausgeld (bank-konservativ)</td><td class="num neg">− ${fmtMo(r.hausgeldNurMo || 0)}</td></tr>
        <tr><td>− Hausverwaltung</td><td class="num neg">− ${fmtMo(r.hausverwaltungMo || 0)}</td></tr>
        ` : ''}
        <tr class="totalrow"><td><strong>Saldo nach Kauf</strong></td><td class="num"><strong>${fmtMo(r.bonNach || 0)}</strong></td></tr>
        <tr><td>Saldo-Delta aus dieser WE</td><td class="num"><strong>${fmtMo(r.bonDelta || 0)}</strong></td></tr>
      </table>

      <h2 class="pdf-section-h">Vermögen aus Bank-Sicht</h2>
      <table class="invest-table">
        <tr><td>Verfügbares Eigenkapital</td><td class="num">${fmt(r.bonVermoegen || 0)}</td></tr>
        <tr><td>− Eigenkapital-Bedarf</td><td class="num neg">− ${fmt(r.ekBedarf)}</td></tr>
        <tr class="totalrow"><td><strong>EK nach Investment</strong></td><td class="num ${r.bonVermoegenVsEk >= 0 ? 'pos' : 'neg'}"><strong>${fmt(r.bonVermoegenVsEk || 0)}</strong></td></tr>
      </table>

      <div class="pdf-hint">
        Nur <em>liquide oder leicht beleihbare Werte</em> zählen für die Bank (Sparbuch, Tagesgeld, Aktien, ETFs, Rückkaufwert Lebensversicherung). Nicht: Eigenheim oder Bestandsimmobilien.
      </div>
      ${_footer(user)}
    </div>
  `;

  const annahmen = `
    <div class="pdf-page">
      ${_header('Annahmen & Hinweise', displayName + ' · ' + esc(we))}
      <table class="invest-table">
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
        Diese Investitionsrechnung beruht auf den oben dokumentierten Annahmen. Sie ist
        keine Anlageberatung im Sinne des WpHG. Tatsächliche Mieten, Zinssätze, Steuersätze
        und Wertentwicklungen können abweichen. Verbindlich ist ausschließlich der notarielle
        Kaufvertrag. Steuerliche Aspekte sind mit dem Steuerberater abzustimmen.
      </div>
      ${_footer(user)}
    </div>
  `;

  _doPrint(seite1 + bon + cf + vermPage + annahmen, 'invest');
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
      ${_header('Kaufabsichtserklärung & Reservierungsvereinbarung', 'B&B Immo GmbH')}

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
   SELBSTAUSKUNFT (Hypovision-Layout mit B&B-Branding, form-fillable)
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

  // ----- Form-Field-Helper: rendert <input>-Elemente (form-fillable) oder
  //       wenn Wert vorhanden, den Wert als Text in einem bordered Field-Look. -----
  function fld(value) {
    // Leerer Wert → leeres Input-Feld (im Browser-Print zur PDF-Form). Wert → Text.
    const v = (value === null || value === undefined || value === '') ? '' : String(value);
    if (v === '') {
      return `<input type="text" class="sa-fld" value="">`;
    }
    return `<span class="sa-fld sa-fld-filled">${esc(v)}</span>`;
  }
  function row(label, valA, valM) {
    return `<tr><td class="sa-label">${esc(label)}</td><td>${fld(valA)}</td><td>${gemeinsam ? fld(valM) : ''}</td></tr>`;
  }
  function rowChk(label, opts, valA, valM) {
    const fmtOpt = (v) => {
      return opts.map(o => (o === v ? `<span class="sa-chk on">☑</span> ${esc(o)}` : `<span class="sa-chk">☐</span> ${esc(o)}`)).join('&nbsp;&nbsp;');
    };
    return `<tr><td class="sa-label">${esc(label)}</td><td>${fmtOpt(valA)}</td><td>${gemeinsam ? fmtOpt(valM) : ''}</td></tr>`;
  }
  function darlBlock(p, key, label) {
    const d = p[key] || {};
    return `
      <tr>
        <td class="sa-label">${esc(label)}</td>
        <td>urspr.: ${fld(fmtNum(d.urspruenglich))} &middot; bis: ${fld(dt(d.laufzeitBis))}<br>mtl.: ${fld(fmtNum(d.belastungMo))} &middot; Rest: ${fld(fmtNum(d.restsaldo))}</td>
        <td></td>
      </tr>
    `;
  }

  const versA = a.vers || {};

  // === SEITE 1: PERSÖNLICHE VERHÄLTNISSE + EINKOMMEN + FIXKOSTEN ===
  const seite1 = `
    <div class="pdf-page sa-page">
      ${_header('Selbstauskunft – Vertraulich', 'Seite 1 · Persönliche Verhältnisse & Einkommen')}
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
      ${_header('Selbstauskunft – Vertraulich', 'Seite 2 · Vermögen & Verbindlichkeiten')}
      <table class="sa-table">
        <thead><tr><th class="sa-section-h">VERMÖGEN</th><th>ANTRAGSTELLER</th><th>${gemeinsam ? 'MITANTRAGSTELLER' : ''}</th></tr></thead>
        <tbody>
          ${row('Bankguthaben', fmtNum(a.bankguthaben), fmtNum(m.bankguthaben))}
          ${row('Wertpapiere (Kurswert)', fmtNum(a.wertpapiere), fmtNum(m.wertpapiere))}
          ${row('Sparbücher', fmtNum(a.sparbuecher), fmtNum(m.sparbuecher))}
          ${row('Bauspar / VWL', fmtNum(a.bausparen), fmtNum(m.bausparen))}
          ${row('Sonstige Vermögen', fmtNum(a.sonstigeVermoegen), fmtNum(m.sonstigeVermoegen))}
          <tr><td class="sa-label">Versicherung — Art</td><td>${fld(versA.art || '')}</td><td></td></tr>
          <tr><td class="sa-label">Beginn / Ende</td><td>${fld(dt(versA.beginn))} &nbsp;/&nbsp; ${fld(dt(versA.ende))}</td><td></td></tr>
          <tr><td class="sa-label">Versicherungssumme</td><td>${fld(fmtNum(versA.summe))}</td><td></td></tr>
          <tr><td class="sa-label">mtl. Beitrag / Rückkaufwert</td><td>${fld(fmtNum(versA.belastungMo))} &nbsp;/&nbsp; ${fld(fmtNum(versA.rueckkauf))}</td><td></td></tr>
        </tbody>
        <thead><tr><th class="sa-section-h">IMMOBILIENVERMÖGEN</th><th>Immobilie 1</th><th>Immobilie 2</th></tr></thead>
        <tbody>
          <tr><td class="sa-label">Art des Objekts</td><td>${fld((a.immo1 && a.immo1.art) || '')}</td><td>${fld((a.immo2 && a.immo2.art) || '')}</td></tr>
          <tr><td class="sa-label">Anschrift</td><td>${fld((a.immo1 && a.immo1.anschrift) || '')}</td><td>${fld((a.immo2 && a.immo2.anschrift) || '')}</td></tr>
          <tr><td class="sa-label">Baujahr</td><td>${fld((a.immo1 && a.immo1.baujahr) || '')}</td><td>${fld((a.immo2 && a.immo2.baujahr) || '')}</td></tr>
          <tr><td class="sa-label">Erwerbsjahr</td><td>${fld((a.immo1 && a.immo1.erwerbsjahr) || '')}</td><td>${fld((a.immo2 && a.immo2.erwerbsjahr) || '')}</td></tr>
          <tr><td class="sa-label">Wohnfläche (m²)</td><td>${fld((a.immo1 && a.immo1.wohnflaeche) || '')}</td><td>${fld((a.immo2 && a.immo2.wohnflaeche) || '')}</td></tr>
          <tr><td class="sa-label">Verkehrswert</td><td>${fld(fmtNum(a.immo1 && a.immo1.verkehrswert))}</td><td>${fld(fmtNum(a.immo2 && a.immo2.verkehrswert))}</td></tr>
          <tr><td class="sa-label">Hypotheken & Grundschulden</td><td>${fld(fmtNum(a.immo1 && a.immo1.hypotheken))}</td><td>${fld(fmtNum(a.immo2 && a.immo2.hypotheken))}</td></tr>
          <tr><td class="sa-label">Mieteinnahmen / Monat</td><td>${fld(fmtNum(a.immo1 && a.immo1.mietenMo))}</td><td>${fld(fmtNum(a.immo2 && a.immo2.mietenMo))}</td></tr>
        </tbody>
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
      ${_header('Selbstauskunft – Bonitäts-Auswertung', 'Seite 3 · Bank-Sicht')}
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

  // === SEITE 4 + 5: DATENSCHUTZ & EINWILLIGUNGEN (1:1-Wortlaut aus Hypovision) ===
  const seite4 = `
    <div class="pdf-page sa-page sa-legal">
      ${_header('Selbstauskunft – Datenschutz & Einwilligungen', 'Seite 4 · Erklärungen des Antragstellers')}
      <h2 class="legal-h">I. Hinweis zur Darlehensvermittlung</h2>
      <p class="legal-p">
        Die B&amp;B Immo GmbH tritt im Rahmen der Finanzierungsvermittlung ausschließlich als unabhängiger Darlehensvermittler
        gemäß § 34c GewO auf. Sie ist berechtigt, Selbstauskünfte, Bonitätsunterlagen sowie die zur Bearbeitung einer
        Finanzierungsanfrage notwendigen Daten an potenzielle Darlehensgeber (Banken, Bausparkassen, Versicherungen) zu
        übermitteln. Die Auswahl der Darlehensgeber erfolgt im Interesse des Antragstellers und ohne dauerhafte Bindung
        an ein bestimmtes Institut.
      </p>
      <h2 class="legal-h">II. Einwilligung SCHUFA &amp; Creditreform</h2>
      <p class="legal-p">
        Ich willige/Wir willigen ein, dass die B&amp;B Immo GmbH sowie die mit ihr zusammenarbeitenden kreditgebenden
        Institute Daten über die Aufnahme, die Durchführung und Beendigung dieser Geschäftsverbindung sowie Daten über
        nicht vertragsgemäßes Verhalten oder betrügerisches Verhalten an die SCHUFA Holding AG (Kormoranweg 5, 65201
        Wiesbaden) und die Creditreform Boniversum GmbH (Hellersbergstraße 11, 41460 Neuss) übermitteln. Die SCHUFA bzw.
        Creditreform speichert und übermittelt diese Daten an ihre Vertragspartner im EWR-Raum sowie in der Schweiz, um
        diesen Informationen zur Beurteilung der Kreditwürdigkeit von natürlichen Personen zu geben. Weitere Informationen
        zur SCHUFA-Tätigkeit sind unter <em>www.schufa.de</em> bzw. <em>www.boniversum.de</em> abrufbar.
      </p>
      <h2 class="legal-h">III. Datenschutz im Rahmen der Finanzierungsanfrage</h2>
      <p class="legal-p">
        Die personenbezogenen Daten aus dieser Selbstauskunft werden gemäß Art. 6 Abs. 1 lit. b DS-GVO zur Anbahnung und
        Durchführung des Vermittlungsverhältnisses verarbeitet. Eine Weitergabe an Dritte erfolgt nur, soweit dies zur
        Erfüllung der Vermittlungsleistung erforderlich ist (insb. an die zur Auswahl stehenden Darlehensgeber und
        an Notare im Rahmen einer ggf. nachfolgenden Beurkundung). Die Daten werden so lange gespeichert, wie dies für
        die Geschäftsbeziehung erforderlich ist, mindestens jedoch entsprechend der gesetzlichen Aufbewahrungsfristen
        (§ 257 HGB, § 147 AO). Die Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
        Datenübertragbarkeit und Widerspruch nach Art. 15 ff. DS-GVO bleiben unberührt. Beschwerden können an die
        zuständige Aufsichtsbehörde (LfDI Baden-Württemberg, Königstraße 10a, 70173 Stuttgart) gerichtet werden.
      </p>
      ${_footer(user)}
    </div>
  `;

  const seite5 = `
    <div class="pdf-page sa-page sa-legal">
      ${_header('Selbstauskunft – Datenschutz & Einwilligungen', 'Seite 5 · Mitwirkungspflichten')}
      <h2 class="legal-h">IV. Mitwirkungspflicht Steuer-Identifikationsnummer</h2>
      <p class="legal-p">
        Nach § 154 Abgabenordnung (AO) i.V.m. § 24c Kreditwesengesetz (KWG) sind kreditgebende Institute verpflichtet,
        bei der Aufnahme einer Geschäftsverbindung die Steueridentifikationsnummer des Vertragspartners zu erheben und
        zu speichern. Mit Abgabe dieser Selbstauskunft erkläre/n ich/wir mich/uns bereit, der finanzierenden Bank meine/unsere
        Steueridentifikationsnummer mitzuteilen, sofern diese im Rahmen der Antragstellung nicht bereits hier vermerkt ist.
      </p>
      <h2 class="legal-h">V. Einwilligung in das automatisierte Grundbuch-Abrufverfahren</h2>
      <p class="legal-p">
        Ich willige/Wir willigen ein, dass die finanzierende Bank zum Zweck der Bonitäts- und Sicherheitenprüfung
        Auskünfte aus dem Grundbuch im automatisierten Abrufverfahren nach § 133 Grundbuchordnung (GBO) einholt, soweit
        ein berechtigtes Interesse vorliegt. Dies betrifft sowohl die zu finanzierende Immobilie als auch von mir/uns
        in dieser Selbstauskunft angegebene Bestandsimmobilien.
      </p>
      <h2 class="legal-h">VI. Vollständigkeits- und Wahrheitserklärung</h2>
      <p class="legal-p">
        Ich versichere/Wir versichern, dass die obigen Angaben nach bestem Wissen vollständig und wahrheitsgemäß gemacht
        wurden. Mir/Uns ist bekannt, dass falsche oder unvollständige Angaben zur Vertragsaufhebung sowie zur
        strafrechtlichen Verfolgung wegen Kreditbetrugs (§ 265b StGB) führen können. Wesentliche Änderungen der wirtschaftlichen
        Verhältnisse zwischen Abgabe der Selbstauskunft und Auszahlung des Darlehens werde/n ich/wir unverzüglich mitteilen.
      </p>
      <div style="margin-top:18mm; display:grid; grid-template-columns:1fr 1fr; gap:22mm;">
        <div>
          <div style="height:18mm; border-bottom:1px solid #000;"></div>
          <div style="font-size:10px; margin-top:2mm;">Ort, Datum &middot; Unterschrift Antragsteller</div>
        </div>
        ${gemeinsam ? `
        <div>
          <div style="height:18mm; border-bottom:1px solid #000;"></div>
          <div style="font-size:10px; margin-top:2mm;">Ort, Datum &middot; Unterschrift Mit-Antragsteller</div>
        </div>` : '<div></div>'}
      </div>
      ${_footer(user)}
    </div>
  `;

  _doPrint(seite1 + seite2 + seite3 + seite4 + seite5, 'sa');
}

window.PDF = { investitionsrechnung, reservierung, selbstauskunft };
