/* pdf.js — drei PDF-Templates: Investitionsrechnung, Reservierung, Selbstauskunft.
   Mechanismus: setzt body-Klasse `pdf-mode-X`, befüllt #pdf-template mit HTML,
   ruft window.print(). Print-CSS in styles.css blendet alles andere aus.

   Einheitliches Layout: jede Seite hat den gleichen Header (Brot & Butter Logo +
   Untertitel + ggf. Seitennummer) und Footer (B&B Immo + Vertriebler-Daten). */

// Brot & Butter Immobilien Logo — nur Schriftzug, ohne die zwei B's.
// Inline-SVG für maximale Print-Schärfe; kein File-Loader mehr.
// Schmale moderne Sans-Serif (font-weight: 200), zweizeilig wie das Original.
function _bubLogo(extraClass) {
  extraClass = extraClass || '';
  return `<svg class="bub-logo-svg ${esc(extraClass)}" viewBox="0 0 500 130" xmlns="http://www.w3.org/2000/svg" aria-label="Brot & Butter Immobilien">
    <text x="0" y="55" font-family="'Helvetica Neue','Inter',Helvetica,Arial,sans-serif" font-size="50" font-weight="200" fill="#1a1a1a" letter-spacing="-0.5">Brot &amp; Butter</text>
    <text x="0" y="115" font-family="'Helvetica Neue','Inter',Helvetica,Arial,sans-serif" font-size="50" font-weight="200" fill="#1a1a1a" letter-spacing="-0.5">Immobilien</text>
  </svg>`;
}

// Header für die Selbstauskunft-PDF.
// Format: B&B-Logo links · "SELBSTAUSKUNFT – VERTRAULICH" rechts + "Seite X / N" darunter.
// Logo prominent als Briefkopf — kein Watermark mehr.
function _saHeader(seite, total) {
  return `
    <div class="sa-head">
      ${_bubLogo('sa-logo')}
      <div class="sa-title-block">
        <div class="sa-title">SELBSTAUSKUNFT <span class="sa-title-sub">– VERTRAULICH</span></div>
        <div class="sa-page-num">Seite ${esc(String(seite))} / ${esc(String(total || 4))}</div>
      </div>
    </div>
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
  const vertriebler = [esc(u.name || ''), u.email ? esc(u.email) : '', u.telefon ? esc(u.telefon) : ''].filter(Boolean).join(' · ');
  return `
    <div class="pdf-footer">
      <div class="pdf-footer-l">B&amp;B Immo GmbH &middot; Burdastraße 23 &middot; 77746 Schutterwald &middot; HRB 727 814 (Freiburg)</div>
      <div class="pdf-footer-c">${vertriebler}</div>
      <div class="pdf-footer-r">${esc(datum)}</div>
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
        <div class="kpi-pdf"><div class="label">Gesamtvermögen 10 J.</div><div class="value">${fmt(r.vermoegenBrutto10)}</div></div>
        <div class="kpi-pdf pos"><div class="label">Vermögenszuwachs 10 J.</div><div class="value">${fmt(r.vermoegenNetto10)}</div></div>
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
      <p style="font-size:10.5px;color:#777;margin:0 0 6px 0;">Verkaufserlös = Marktwert − Restschuld. Gesamtvermögen = Verkaufserlös + kumulierte Cashflows. Vermögenszuwachs = Gesamtvermögen − eingesetztes EK (echter Reinerlös).</p>
      <table>
        <thead>
          <tr><th>Jahr</th><th class="num">Marktwert</th><th class="num">Restschuld</th><th class="num">Verkaufserlös</th><th class="num">kum. CF</th><th class="num">Gesamtvermögen</th><th class="num">Zuwachs</th></tr>
        </thead>
        <tbody>
          ${r.vermoegen.map(v => `
            <tr>
              <td>J${v.y}</td>
              <td class="num">${fmt(v.wert)}</td>
              <td class="num">${fmt(v.restschuld)}</td>
              <td class="num">${fmt(v.verkaufserloes || (v.wert - v.restschuld))}</td>
              <td class="num">${fmt(v.kumCf)}</td>
              <td class="num">${fmt(v.vermoegenBrutto)}</td>
              <td class="num"><strong>${fmt(v.vermoegenNetto)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h2 class="pdf-section-h">Sparen vs. Investieren (10 Jahre)</h2>
      <p style="font-size:10.5px;color:#777;margin:0 0 6px 0;">Vergleich: Eigenkapital nur anlegen (Verzinsung ${((kalkInputs.sparZins || 0.025) * 100).toFixed(2).replace('.',',')} % p.a.) vs. Eigenkapital als Immobilien-Investment inkl. Cashflow.</p>
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
        ${(() => {
          // Iter 41.15: Mietsubvention 2-Phasen-Modell sauber im PDF ausweisen
          // Iter 45: Gesamt-Summe nutzt den echten Liquiditätsabfluss aus dem recalc-Result
          //          (r.mietsubventionGesamt) — konsistent zur Subv-Glättung.
          const phasen = Array.isArray(kalkInputs.subventionPhasen) ? kalkInputs.subventionPhasen : [];
          const totalGeglättet = (r && typeof r.mietsubventionGesamt === 'number')
            ? r.mietsubventionGesamt
            : null;
          if (phasen.length >= 2) {
            const p1 = phasen[0], p2 = phasen[1];
            const totalNominal = (p1.mo * p1.monate) + (p2.mo * p2.monate);
            const totalShow = totalGeglättet !== null ? totalGeglättet : totalNominal;
            return `
              <tr><td>Mietsubvention Phase 1</td><td class="num">${fmt(p1.mo)} / Mo × ${p1.monate} Mo</td></tr>
              <tr><td>Mietsubvention Phase 2</td><td class="num">${fmt(p2.mo)} / Mo × ${p2.monate} Mo</td></tr>
              <tr><td>Mietsubvention gesamt</td><td class="num"><strong>${fmt(totalShow)}</strong></td></tr>
            `;
          } else if (phasen.length === 1) {
            const p = phasen[0];
            return `<tr><td>Mietsubvention</td><td class="num">${fmt(p.mo)} / Mo × ${p.monate} Mo</td></tr>`;
          }
          const total1Show = totalGeglättet !== null ? totalGeglättet : ((kalkInputs.subventionMo || 0) * (kalkInputs.subventionMonate || 0));
          return `<tr><td>Mietsubvention</td><td class="num">${fmt(kalkInputs.subventionMo)} / Mo × ${esc(kalkInputs.subventionMonate)} Mo (gesamt <strong>${fmt(total1Show)}</strong>)</td></tr>`;
        })()}
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
   SELBSTAUSKUNFT — Hypovision-Struktur 1:1, B&B-Branding
   ====================================================================
   4 Seiten:
     1) Persönliche Verhältnisse + Einkommen + Fixkosten
     2) Vermögen + Immobilien + Verbindlichkeiten
     3) Erklärungen I–III (Darlehensvermittlung, SCHUFA/Creditreform, DSGVO)
     4) Erklärungen IV–VI (Steuer-ID, Grundbuch, Wahrheit) + EINE Unterschrift
   GwG/PEP/Herkunft-EK sind im Frontend-Form vorhanden (CRM-Zweck), aber
   NICHT mehr im Banker-PDF — Hypovision-Original hat das auch nicht.
   ==================================================================== */
function selbstauskunft(kunde, user) {
  const k = kunde || {};
  let sa = k.saJson;
  if (typeof sa === 'string') { try { sa = JSON.parse(sa); } catch(e) { sa = null; } }
  if (!sa || typeof sa !== 'object') sa = {};
  const a = sa.antragsteller || {};
  const m = sa.mitantragsteller || {};
  const gemeinsam = sa.gemeinsam === true;

  const fmtNum = (v) => (v === null || v === undefined || v === '') ? '' : (typeof v === 'number' ? Math.round(v).toLocaleString('de-DE') + ' €' : v);
  const dt = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? new Date(v).toLocaleDateString('de-DE') : (v || '');

  // Form-Field-Helper: leer → <input>, gefüllt → Text. Beides ohne sichtbaren Rand.
  function fld(value) {
    const v = (value === null || value === undefined || value === '') ? '' : String(value);
    if (v === '') return `<input type="text" class="sa-fld" value="">`;
    return `<span class="sa-fld sa-fld-filled">${esc(v)}</span>`;
  }
  function row(label, valA, valM) {
    return `<tr><td class="sa-label">${esc(label)}</td><td>${fld(valA)}</td><td>${gemeinsam ? fld(valM) : ''}</td></tr>`;
  }
  function rowChk(label, opts, valA, valM) {
    const fmtOpt = (v) => opts.map(o => (o === v
      ? `<span class="sa-chk on">☑</span> ${esc(o)}`
      : `<span class="sa-chk">☐</span> ${esc(o)}`)).join('&nbsp;&nbsp;');
    return `<tr><td class="sa-label">${esc(label)}</td><td>${fmtOpt(valA)}</td><td>${gemeinsam ? fmtOpt(valM) : ''}</td></tr>`;
  }
  // Baufinanzierungen: 1 Zeile pro Datenfeld, je 2 Spalten (Baufi 1 / Baufi 2).
  // Daten gehören typischerweise beiden Antragstellern gemeinsam → keine Person-Trennung.
  function baufiRow(label, key) {
    const v1 = (a.bf1 || {})[key];
    const v2 = (a.bf2 || {})[key];
    const fmt = (key === 'laufzeitBis') ? dt : (v => typeof v === 'number' ? fmtNum(v) : v);
    return `<tr><td class="sa-label">${esc(label)}</td><td>${fld(fmt(v1))}</td><td>${fld(fmt(v2))}</td></tr>`;
  }

  // Sonstige Verbindlichkeiten: Spalten Zweck | urspr. Höhe | Laufzeit bis | mtl. | Restsaldo.
  // 4 Slots (kd1–kd4) — wenn alle leer, bleiben die Zeilen als beschreibbare Form.
  function sonstVerbRow(key, idx) {
    const d = a[key] || {};
    return `<tr>
      <td>${fld(d.zweck || '')}</td>
      <td>${fld(fmtNum(d.urspruenglich))}</td>
      <td>${fld(dt(d.laufzeitBis))}</td>
      <td>${fld(fmtNum(d.belastungMo))}</td>
      <td>${fld(fmtNum(d.restsaldo))}</td>
    </tr>`;
  }

  const versA = a.vers || {};

  // === SEITE 1: PERSÖNLICHE VERHÄLTNISSE + EINKOMMEN + FIXKOSTEN ===
  const seite1 = `
    <div class="pdf-page sa-page">
      ${_saHeader(1, 4)}
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
          ${(() => {
            const sumA = (a.nettoMo || 0) + (a.vermietungMo || 0) + (a.sonstigeMo || 0) + (a.unterhaltMo || 0) + (a.kindergeldMo || 0);
            const sumM = (m.nettoMo || 0) + (m.vermietungMo || 0) + (m.sonstigeMo || 0) + (m.unterhaltMo || 0) + (m.kindergeldMo || 0);
            return `<tr><td class="sa-label" style="font-weight:600;">Gesamt</td><td style="font-weight:600;">${sumA > 0 ? fld(fmtNum(sumA)) : fld('')}</td><td style="font-weight:600;">${gemeinsam && sumM > 0 ? fld(fmtNum(sumM)) : (gemeinsam ? fld('') : '')}</td></tr>`;
          })()}
          ${row('Zu versteuerndes Einkommen / Jahr', fmtNum(a.zveJahr), fmtNum(m.zveJahr))}
          ${rowChk('Kirchensteuerpflicht', ['ja','nein'], a.kirchensteuer, m.kirchensteuer)}
        </tbody>
        <thead><tr><th class="sa-section-h">MONATLICHE FIXKOSTEN</th><th>ANTRAGSTELLER</th><th>${gemeinsam ? 'MITANTRAGSTELLER' : ''}</th></tr></thead>
        <tbody>
          ${row('Miete inkl. NK', fmtNum(a.mieteMo), fmtNum(m.mieteMo))}
          ${row('Unterhaltszahlungen', fmtNum(a.unterhaltZahlungMo), fmtNum(m.unterhaltZahlungMo))}
          ${row('Beitrag private Krankenversicherung', fmtNum(a.pkvMo), fmtNum(m.pkvMo))}
          ${/* Iter 64 (20.05.2026) */ ''}
          ${row('Laufende Lebenshaltung', fmtNum(a.lebenshaltungMo), fmtNum(m.lebenshaltungMo))}
          ${row('Leasing-Raten', fmtNum(a.leasingMo), fmtNum(m.leasingMo))}
          ${row('Sonstige Ausgaben', fmtNum(a.sonstigeAusgabenMo), fmtNum(m.sonstigeAusgabenMo))}
        </tbody>
      </table>
      ${_footer(user)}
    </div>
  `;

  // === SEITE 2: VERMÖGEN + IMMOBILIEN + VERBINDLICHKEITEN ===
  const seite2 = `
    <div class="pdf-page sa-page">
      ${_saHeader(2, 4)}
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
          <tr><td class="sa-label">Baujahr / Erwerbsjahr</td><td>${fld((a.immo1 && a.immo1.baujahr) || '')} / ${fld((a.immo1 && a.immo1.erwerbsjahr) || '')}</td><td>${fld((a.immo2 && a.immo2.baujahr) || '')} / ${fld((a.immo2 && a.immo2.erwerbsjahr) || '')}</td></tr>
          <tr><td class="sa-label">Wohnfläche (m²)</td><td>${fld((a.immo1 && a.immo1.wohnflaeche) || '')}</td><td>${fld((a.immo2 && a.immo2.wohnflaeche) || '')}</td></tr>
          <tr><td class="sa-label">Verkehrswert</td><td>${fld(fmtNum(a.immo1 && a.immo1.verkehrswert))}</td><td>${fld(fmtNum(a.immo2 && a.immo2.verkehrswert))}</td></tr>
          <tr><td class="sa-label">Hypotheken & Grundschulden</td><td>${fld(fmtNum(a.immo1 && a.immo1.hypotheken))}</td><td>${fld(fmtNum(a.immo2 && a.immo2.hypotheken))}</td></tr>
          <tr><td class="sa-label">Mieteinnahmen pro Monat</td><td>${fld(fmtNum(a.immo1 && a.immo1.mietenMo))}</td><td>${fld(fmtNum(a.immo2 && a.immo2.mietenMo))}</td></tr>
        </tbody>
        <thead><tr><th class="sa-section-h">BAUFINANZIERUNGEN</th><th>BAUFINANZIERUNG 1</th><th>BAUFINANZIERUNG 2</th></tr></thead>
        <tbody>
          ${baufiRow('urspr. Darlehenshöhe', 'urspruenglich')}
          ${baufiRow('Laufzeit bis', 'laufzeitBis')}
          ${baufiRow('mtl. Belastung', 'belastungMo')}
          ${baufiRow('Restsaldo', 'restsaldo')}
        </tbody>
      </table>
      <table class="sa-table sa-verb-table" style="margin-top:3mm;">
        <thead><tr><th>SONSTIGE VERBINDLICHKEITEN</th><th>URSPR. HÖHE</th><th>LAUFZEIT BIS</th><th>MTL. BELASTUNG</th><th>RESTSALDO</th></tr></thead>
        <tbody>
          ${sonstVerbRow('kd1', 1)}
          ${sonstVerbRow('kd2', 2)}
          ${sonstVerbRow('kd3', 3)}
          ${sonstVerbRow('kd4', 4)}
        </tbody>
      </table>
      <div style="font-size:7.5px; color:#666; margin-top:1mm; font-style:italic;">Weitere Immobilien bzw. Verbindlichkeiten bitte als Anlage beifügen.</div>
      ${_footer(user)}
    </div>
  `;

  // === SEITE 3: ERKLÄRUNGEN I–III (1:1 aus Hypovision, B&B-Wortlaut) ===
  const seite3 = `
    <div class="pdf-page sa-page sa-legal">
      ${_saHeader(3, 4)}
      <div style="font-size:11px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:4mm;">Erklärung der Darlehensnehmer · Einwilligungserklärungen</div>
      <h2 class="legal-h">I. Darlehensvermittlung und Anschlussbetreuung</h2>
      <p class="legal-p">
        Hiermit beauftrage/n ich/wir die <strong>B&amp;B Immo GmbH</strong> mit der Vermittlung eines Darlehens zur
        Immobilienfinanzierung sowie damit in Zusammenhang stehender Finanzdienstleistungen und Betreuung während
        der Auszahlung dieses Darlehens. Ich/wir bevollmächtige/n die B&amp;B Immo GmbH, alle hierfür erforderlichen
        Unterlagen (Darlehensantrag, Objekt- und Bonitätsunterlagen etc.) an einen zur Finanzierung vorgesehenen
        Darlehensgeber weiterzuleiten, Konditionsangebote bei dem Darlehensgeber einzuholen und sämtlichen mit der
        Finanzierung zusammenhängenden Schriftverkehr für mich/uns entgegenzunehmen. Mir/uns ist bekannt, dass eine
        verbindliche Darlehenszusage nur von einem Darlehensgeber selbst gegeben werden kann und dass Darlehenszusagen
        von Darlehensgebern jederzeit widerrufen werden können, insbesondere wenn sich Abweichungen zu den von mir/uns
        gemachten Angaben herausstellen. Ich versichere/wir versichern, dass gegen mich/uns bisher keine Zwangsmaßnahmen
        (z.B. Gehaltspfändung, Zwangsversteigerung, Insolvenzverfahren) eingeleitet wurden und dass ich/wir meinen/unseren
        Zahlungsverpflichtungen in der Vergangenheit immer ordnungsgemäß nachgekommen bin/sind. Ich handle/wir handeln
        im eigenen wirtschaftlichen Interesse und nicht auf fremde Veranlassung (insbesondere nicht als Treuhänder).
      </p>
      <h2 class="legal-h">II. Datenübermittlung an die SCHUFA und Befreiung vom Bankgeheimnis</h2>
      <p class="legal-p">
        Der Vertragspartner (Darlehensgeber/Bank/Sparkasse) übermittelt im Rahmen dieses Vertragsverhältnisses
        erhobene personenbezogene Daten über die Beantragung, die Durchführung und Beendigung dieser
        Geschäftsbeziehung sowie Daten über nicht vertragsgemäßes Verhalten oder betrügerisches Verhalten an die
        SCHUFA Holding AG, Kormoranweg 5, 65201 Wiesbaden. Rechtsgrundlagen dieser Übermittlungen sind Artikel
        6 Absatz 1 lit. b und Artikel 6 Absatz 1 lit. f der Datenschutz-Grundverordnung (DS-GVO). Übermittlungen
        auf der Grundlage von Artikel 6 Absatz 1 lit. f DS-GVO dürfen nur erfolgen, soweit dies zur Wahrung
        berechtigter Interessen der Bank/Sparkasse oder Dritter erforderlich ist und nicht die Interessen oder
        Grundrechte und Grundfreiheiten der betroffenen Person, die den Schutz personenbezogener Daten erfordern,
        überwiegen. Der Datenaustausch mit der SCHUFA dient auch der Erfüllung gesetzlicher Pflichten zur
        Durchführung von Kreditwürdigkeitsprüfungen von Kunden (§ 505a BGB, § 18a KWG). Der Kunde befreit den
        Vertragspartner insoweit auch vom Bankgeheimnis. Die SCHUFA verarbeitet die erhaltenen Daten und
        verwendet sie auch zum Zwecke der Profilbildung (Scoring), um ihren Vertragspartnern im Europäischen
        Wirtschaftsraum und in der Schweiz sowie ggf. weiteren Drittländern Informationen unter anderem zur
        Beurteilung der Kreditwürdigkeit von natürlichen Personen zu geben. Nähere Informationen zur Tätigkeit der
        SCHUFA können dem SCHUFA-Informationsblatt nach Art. 14 DS-GVO entnommen oder online unter
        <em>www.schufa.de/datenschutz</em> eingesehen werden.
      </p>
      <h2 class="legal-h">III. Datenübermittlung an Creditreform (Freiberufler &amp; Selbständige)</h2>
      <p class="legal-p">
        Der Darlehensgeber übermittelt der Wirtschaftsauskunftei Creditreform Boniversum GmbH, Hellersbergstraße
        11, 41460 Neuss im Rahmen der Beantragung bonitärer Leistungen Daten (Name, Adresse, Geburtsdatum, ggf.
        Voranschrift sowie Anfragegrund) zum Zweck der Bonitätsprüfung. Rechtsgrundlagen sind Art. 6 Abs. 1 lit. b
        und Art. 6 Abs. 1 lit. f DS-GVO. Der Datenaustausch dient auch der Erfüllung gesetzlicher Pflichten zur
        Durchführung von Kreditwürdigkeitsprüfungen (§ 505a BGB, § 18a KWG). Der Kunde befreit den Darlehensgeber
        insoweit auch vom Bankgeheimnis. Weitere Informationen zur Datenverarbeitung bei Creditreform sind unter
        <em>https://www.creditreform.de/EU-DSGVO/</em> abrufbar.
      </p>
      ${_footer(user)}
    </div>
  `;

  // === SEITE 4: ERKLÄRUNGEN IV–VI + UNTERSCHRIFT ===
  const seite4 = `
    <div class="pdf-page sa-page sa-legal">
      ${_saHeader(4, 4)}
      <h2 class="legal-h">IV. Mitwirkungspflicht Steuer-Identifikationsnummer (Steuer-ID)</h2>
      <p class="legal-p">
        Mir/uns ist bekannt, dass ich/wir verpflichtet bin/sind, gemäß § 154 Abs. 2a der Abgabenordnung meine/unsere
        steuerliche Identifikation bekannt zu geben. Sofern die Steuer-ID bis zum Vertragsschluss nicht mitgeteilt
        wurde, teile/n ich/wir diese dem betreffenden Kreditinstitut spätestens 14 Tage nach Vertragsabschluss
        schriftlich mit (Mitwirkungspflicht). Kreditinstitute sind ab dem 01.01.2018 gesetzlich dazu verpflichtet,
        die Steuer-ID für jeden Kontoinhaber sowie jeden anderen Verfügungsberechtigten zu erheben und aufzuzeichnen.
        Bei Missachtung der Mitwirkungspflicht muss die Bank im Wege des maschinellen Anfrageverfahrens die Steuer-ID
        beim Bundeszentralamt für Steuern (BZSt) erfragen und ist bei unzureichender Mitwirkung verpflichtet, dies
        festzuhalten und dem BZSt mitzuteilen.
      </p>
      <h2 class="legal-h">V. Nutzung des automatisierten Grundbuch-Abrufverfahrens</h2>
      <p class="legal-p">
        Der Darlehensgeber kann das automatisierte Verfahren zur Übermittlung von Daten aus dem maschinell geführten
        Grundbuch zur Prüfung von Darlehensanträgen nutzen. Dies gilt auch für die Übermittlung von Anträgen auf
        Auskunft aus dem Grundbuch gemäß § 133 Abs. 4 Grundbuchordnung. Der Darlehensgeber kann die übermittelten
        Daten nur dann nutzen, wenn der Kunde bereits (Mit-)Eigentümer bzw. Erbbauberechtigter des betroffenen
        Grundstücks ist. Die Datennutzung bezieht sich auf sämtliche Grundbücher, in die der Kunde als
        (Mit-)Eigentümer bzw. Erbbauberechtigter eingetragen ist oder wird.
      </p>
      <h2 class="legal-h">VI. Vollständigkeits- und Wahrheitserklärung</h2>
      <p class="legal-p">
        Ich versichere/wir versichern, alle vorstehenden Angaben nach bestem Wissen vollständig und wahrheitsgemäß
        gemacht zu haben. Falsche oder unvollständige Angaben können zur Vertragsaufhebung sowie zur strafrechtlichen
        Verfolgung wegen Kreditbetrugs (§ 265b StGB) führen. Wesentliche Änderungen der wirtschaftlichen
        Verhältnisse zwischen Abgabe der Selbstauskunft und Auszahlung des Darlehens werde/n ich/wir unverzüglich
        mitteilen.
      </p>
      <p class="legal-p" style="margin-top:5mm;">
        Mit meiner/unserer Unterschrift stimme/n ich/wir den obigen Versicherungen sowie der Nutzung des
        automatisierten Grundbuch-Abrufverfahrens (Ziffer V) zu. Die Datenschutzhinweise der Auskunfteien haben
        wir zur Kenntnis genommen.
      </p>
      <div class="sa-sigblock">
        <div class="sig-col">
          <div class="sig-line"><span class="sig-tag">{{Signature1}}</span></div>
          <div class="sig-meta">Ort, Datum &middot; Unterschrift Antragsteller</div>
          <div class="sig-meta sig-tag" style="margin-top:1mm;">{{Date1}}</div>
        </div>
        ${gemeinsam ? `
        <div class="sig-col">
          <div class="sig-line"><span class="sig-tag">{{Signature2}}</span></div>
          <div class="sig-meta">Ort, Datum &middot; Unterschrift Mitantragsteller</div>
          <div class="sig-meta sig-tag" style="margin-top:1mm;">{{Date2}}</div>
        </div>` : '<div></div>'}
      </div>
      ${_footer(user)}
    </div>
  `;

  _doPrint(seite1 + seite2 + seite3 + seite4, 'sa');
}

window.PDF = { investitionsrechnung, reservierung, selbstauskunft };
