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

function _doPrint(html, mode, filenameHint) {
  // QA-Fix 2026-05-23 (Audit PD-1): document.title kontrolliert den Default-
  // Dateinamen im Browser-Druckdialog. Vorher landete jede PDF als
  // „B&B Kalkulator.pdf" → User-Download-Chaos. Jetzt: kontextspezifischer
  // Name mit Kunde + WE + Datum. Nach Print zurück auf Original.
  const origTitle = document.title;
  if (filenameHint) document.title = filenameHint;
  const tpl = document.getElementById('pdf-template');
  tpl.innerHTML = html;
  document.body.classList.add('pdf-mode');
  document.body.classList.add('pdf-mode-' + mode);
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('pdf-mode');
      document.body.classList.remove('pdf-mode-' + mode);
      if (filenameHint) document.title = origTitle;
    }, 500);
  }, 100);
}

// Helper: baut einen sauberen Dateinamen-Hint aus Kontextdaten.
function _filenameHint(kind, kunde, weMeta) {
  const heute = new Date();
  const dStr = `${('0'+heute.getDate()).slice(-2)}.${('0'+(heute.getMonth()+1)).slice(-2)}.${heute.getFullYear()}`;
  const kundeName = ((kunde && (kunde.vorname || '')) + ' ' + (kunde && (kunde.nachname || ''))).trim() || 'Kunde';
  const weTag = (weMeta && weMeta.weNr) ? ('WE' + weMeta.weNr) : '';
  const projTag = (weMeta && weMeta.projektKurz) ? weMeta.projektKurz : '';
  // Sonderzeichen weg, Spaces zu Bindestrich für Browser-Safety
  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '').trim();
  return [kind, safe(kundeName), safe([projTag, weTag].filter(Boolean).join(' ')), dStr]
    .filter(Boolean).join(' - ');
}

/* ====================================================================
   INVESTITIONSRECHNUNG — Iter 89: Premium-Reduktion (Variante C)
   ====================================================================
   7 A4-Seiten: Cover · Eckdaten+Plan · Aussicht · Vergleich · Detail
   · Wie es weitergeht · Brot & Butter.
   Math-Engine bleibt unverändert — alle Werte aus kalkResult und
   kalkInputs.
   ==================================================================== */
function investitionsrechnung(kunde, kalkInputs, kalkResult, user) {
  if (!kalkResult) {
    try { kalkResult = window.Kalk.recalc(kalkInputs); }
    catch (e) { alert('Berechnung fehlgeschlagen: ' + e.message); return; }
  }
  const r = kalkResult;
  const k = kunde || {};
  const i = kalkInputs || {};
  const u = user || {};
  const displayName = k.name || ((k.vorname || '') + ' ' + (k.nachname || '')).trim() || '—';
  const fmt = window.Kalk.fmtEur, fmtPct = window.Kalk.fmtPct, fmtMo = window.Kalk.fmtEurMo;
  const datum = new Date().toLocaleDateString('de-DE');

  // Adresse-Zeile
  const projekt = i._projektName || '';
  const weBez = i._weNr ? 'Wohneinheit ' + i._weNr : (i._weLage || '');
  const adresseZeile = projekt ? (projekt + ' · ' + weBez) : weBez;

  // KNK
  // QA-Fix 2026-05-22 (Phase-3b K1): zeigt jetzt echten KNK auch bei mitfinanziert.
  // Vorher: 0 € → Kostenblock im PDF unsichtbar.
  const knk = (r.knk != null && isFinite(r.knk)) ? r.knk : (i.knkMitfinanziert ? 0 : r.ekBedarf);

  // Dynamische Texte
  // QA-Fix 2026-05-22 (Audit-E E6): bei oszillierendem CF — Crossover erst, wenn alle
  // Folgejahre im 10-J-Fenster positiv sind.
  const crossoverIdx = r.cf.findIndex((c, idx) => {
    if (!c || c.cfJahr <= 0) return false;
    const end = Math.min(10, r.cf.length);
    for (let k = idx + 1; k < end; k++) {
      if (!r.cf[k] || r.cf[k].cfJahr <= 0) return false;
    }
    return true;
  });
  const crossoverJahr = crossoverIdx >= 0 ? (crossoverIdx + 1) : null;
  // QA-Fix 2026-05-22 (Audit-E B4/B8): identischer Fix wie app.js — Truthy-Bug bei
  // findIndex=0 (vermoegenNetto schon bei J0 positiv) löste den „mehr als 10 Jahre"-
  // Branch aus, obwohl Tabelle alle Jahre positiv zeigte.
  const nettoCrossoverIdx = r.vermoegen.findIndex(v => v.vermoegenNetto > 0);
  const nettoCrossoverJahr = nettoCrossoverIdx > 0 ? nettoCrossoverIdx : null;
  const nettoPositivAbStart = nettoCrossoverIdx === 0;
  const v10 = r.vermoegen[10] || {};
  const sparen10 = r.sparen[10] || {};
  // Iter 91.2: Selbsttragung gegen ALLE laufenden Kosten (Annuität + HG + HV + MV),
  // gecappt auf 100 % — vorher konnte > 100 % zeigen obwohl Belastung negativ war.
  const laufendeKostenMo = (r.annuityMo || 0) + (r.hausgeldNurMo || 0)
    + (r.hausverwaltungMo || 0) + (r.mietverwaltungMo || 0);
  const einnahmenMo = (r.mieteJ1Mo || 0) + (r.stVorteilJ1Mo || 0);
  const selbsttragungPct = laufendeKostenMo > 0
    ? Math.min(100, Math.round(einnahmenMo / laufendeKostenMo * 100))
    : 0;
  const marktQm = parseFloat(i.marktwertProQm) || 0;
  const kpQm = r.kaufpreisProQm || 0;

  // Subv-Phasen-Text
  // QA-Fix 2026-05-23 (Audit-R1): Engine glättet die Effektivmiete über alle
  // Subv-Phasen konstant (Iter 47/48) — nominale Phasen-Werte können den Käufer
  // verwirren, wenn die Gesamt-Summe nicht (phase1Mo*monate + phase2Mo*monate)
  // entspricht. Lösung: Phasen-Laufzeiten zeigen, aber Subv-Werte als
  // "geglättet" markieren wenn die nominale Summe von r.mietsubventionGesamt
  // mehr als 5 % abweicht.
  let subvText = '—';
  const phasen = Array.isArray(i.subventionPhasen) ? i.subventionPhasen : [];
  const nominalSum = phasen.reduce((s, p) => s + ((p && p.mo) || 0) * ((p && p.monate) || 0), 0);
  const istGeglaettet = (nominalSum > 0 && r.mietsubventionGesamt && Math.abs(r.mietsubventionGesamt - nominalSum) / nominalSum > 0.05);
  const glaettungsHinweis = istGeglaettet ? ' (über Phasen geglättet)' : '';
  if (phasen.length >= 2) {
    subvText = `Phase 1 ${fmtMo(phasen[0].mo)} × ${phasen[0].monate} Mo · Phase 2 ${fmtMo(phasen[1].mo)} × ${phasen[1].monate} Mo · gesamt ${fmt(r.mietsubventionGesamt || 0)}${glaettungsHinweis}`;
  } else if (phasen.length === 1) {
    subvText = `${fmtMo(phasen[0].mo)} × ${phasen[0].monate} Mo · gesamt ${fmt(r.mietsubventionGesamt || 0)}`;
  } else if (i.subventionMo > 0) {
    subvText = `${fmtMo(i.subventionMo)} × ${i.subventionMonate} Mo · gesamt ${fmt(r.mietsubventionGesamt || 0)}`;
  }

  // Vertriebler-Block für Cover/Footer
  const vertrieblerBlock = `${esc(u.name || 'Edgar Steininger')} · B&amp;B Immo GmbH<br>${esc(u.email || '')}${u.telefon ? ' · ' + esc(u.telefon) : ''}`;

  // Gemeinsamer kleiner Seitenkopf
  const ph = (pageNum, totalPages) => `
    <div class="pdf-c-ph">
      ${_bubLogo('pdf-c-logo')}
      <div class="pdf-c-ph-meta">
        ${esc(adresseZeile || '—')}<br>
        für ${esc(displayName)} · ${esc(datum)}
      </div>
    </div>
  `;

  const pdfCStyle = `
    <style>
      /* Iter 90 (22.05.2026): @page-Margin auf 0 + Padding voll in der Page.
         Verhindert die leere Folge-Seite, die durch
         @page-Margin + min-height: 297mm + Padding entstand (Summe > 297mm). */
      @media print { @page { size: A4; margin: 0; } }
      .pdf-c-page{position:relative;page-break-after:always;page-break-inside:avoid;background:#FBFAF7;color:#1A1A17;font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;padding:16mm 16mm 22mm 16mm;height:297mm;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden}
      .pdf-c-page:last-child{page-break-after:auto}
      .pdf-c-page *{box-sizing:border-box}
      .pdf-c-num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
      .pdf-c-ph{display:flex;justify-content:space-between;align-items:center;padding-bottom:6mm;border-bottom:.5px solid #B08A4D;margin-bottom:10mm}
      .pdf-c-logo{width:110px;height:auto;display:block}
      .pdf-c-ph-meta{font-size:8.5pt;letter-spacing:.14em;text-transform:uppercase;color:#7A7A72;font-weight:500;text-align:right;line-height:1.55}
      .pdf-c-section-num{font-size:8.5pt;letter-spacing:.22em;text-transform:uppercase;color:#8E6E3D;font-weight:500}
      .pdf-c-section-title{font-size:22pt;font-weight:200;letter-spacing:-.015em;line-height:1.15;margin-top:4mm;color:#1A1A17;max-width:18ch}
      .pdf-c-lead{font-size:11.5pt;line-height:1.65;color:#3A3A35;font-weight:400;margin-top:4mm}
      .pdf-c-page-foot{position:absolute;bottom:8mm;left:16mm;right:16mm;display:flex;justify-content:space-between;font-size:7.5pt;letter-spacing:.18em;text-transform:uppercase;color:#7A7A72;font-weight:500}
      .pdf-c-page-num{color:#7A7A72}
      .pdf-c-pos{color:#2D6E47}
      .pdf-c-neg{color:#9A3E33}
      .pdf-c-accent{color:#8E6E3D}

      /* Cover */
      .pdf-c-cover{padding:0;display:flex;flex-direction:column;justify-content:space-between;height:297mm;overflow:hidden}
      .pdf-c-cover-top{padding:24mm 16mm 0 16mm;display:flex;justify-content:space-between;align-items:flex-start}
      .pdf-c-cover-logo{width:180px}
      .pdf-c-cover-meta{font-size:9pt;letter-spacing:.16em;text-transform:uppercase;color:#7A7A72;text-align:right;line-height:1.7;font-weight:500}
      .pdf-c-cover-meta strong{color:#1A1A17;font-weight:500}
      .pdf-c-cover-middle{padding:0 16mm;margin:auto 0}
      .pdf-c-cover-kicker{font-size:10pt;letter-spacing:.28em;text-transform:uppercase;color:#8E6E3D;font-weight:500;margin-bottom:8mm}
      .pdf-c-cover-address{font-size:16pt;font-weight:300;letter-spacing:-.005em;color:#3A3A35;line-height:1.4;margin-bottom:12mm}
      .pdf-c-cover-headline{font-size:38pt;font-weight:200;letter-spacing:-.025em;line-height:1.05;color:#1A1A17;max-width:14ch}
      .pdf-c-cover-headline .pdf-c-num-accent{color:#8E6E3D;font-weight:300}
      .pdf-c-cover-bottom{padding:0 16mm 22mm 16mm;border-top:.5px solid #B08A4D;padding-top:6mm;display:flex;justify-content:space-between;align-items:flex-end}
      .pdf-c-cover-bottom .meta{font-size:9pt;letter-spacing:.14em;text-transform:uppercase;color:#7A7A72;font-weight:500;line-height:1.8}
      .pdf-c-cover-bottom .meta strong{color:#1A1A17;font-weight:500}
      .pdf-c-cover-bottom .date{font-size:9pt;letter-spacing:.14em;text-transform:uppercase;color:#7A7A72;font-weight:500;text-align:right}

      /* Page 2 grid */
      .pdf-c-p2-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:14mm;margin-top:6mm;flex:1}
      .pdf-c-obj h4{font-size:8pt;letter-spacing:.2em;text-transform:uppercase;color:#7A7A72;font-weight:500;margin:5mm 0 2mm 0}
      .pdf-c-obj h4:first-child{margin-top:0}
      .pdf-c-obj-row{display:flex;justify-content:space-between;align-items:baseline;padding:2mm 0;border-bottom:.4px solid #E8E6DD;font-size:10pt;font-variant-numeric:tabular-nums}
      .pdf-c-obj-row .k{color:#7A7A72;font-weight:400}
      .pdf-c-obj-row .v{color:#1A1A17;font-weight:400}
      .pdf-c-obj-row .v .unit{font-size:8pt;color:#7A7A72;margin-left:3px}
      .pdf-c-p2-right .hero-line{font-size:14pt;font-weight:300;letter-spacing:-.005em;line-height:1.4;color:#1A1A17;margin-bottom:5mm}
      .pdf-c-p2-right .narrative{font-size:10pt;line-height:1.65;color:#3A3A35;font-weight:400;margin-bottom:4mm}
      .pdf-c-p2-belastung-table{width:100%;border-collapse:collapse;font-size:9pt;font-variant-numeric:tabular-nums;margin-top:4mm}
      .pdf-c-p2-belastung-table th{padding:2mm 1mm;font-size:7.5pt;letter-spacing:.16em;text-transform:uppercase;color:#7A7A72;font-weight:500;text-align:left;border-bottom:.5px solid #E8E6DD}
      .pdf-c-p2-belastung-table th.r{text-align:right}
      .pdf-c-p2-belastung-table td{padding:2mm 1mm;border-bottom:.4px solid #E8E6DD}
      .pdf-c-p2-belastung-table td.r{text-align:right}

      /* Page 3 */
      .pdf-c-p3-bottom{display:grid;grid-template-columns:repeat(3,1fr);gap:10mm;margin-top:6mm;border-top:.5px solid #B08A4D;padding-top:6mm}
      .pdf-c-p3-bottom .cell .label{font-size:8pt;letter-spacing:.2em;text-transform:uppercase;color:#7A7A72;font-weight:500}
      .pdf-c-p3-bottom .cell .v{font-size:17pt;font-weight:300;color:#1A1A17;font-variant-numeric:tabular-nums;margin-top:2mm}
      .pdf-c-p3-bottom .cell .v .unit{font-size:9pt;color:#7A7A72;margin-left:3px;font-weight:400}
      .pdf-c-p3-vermoegen-table{width:100%;border-collapse:collapse;font-size:9pt;font-variant-numeric:tabular-nums;margin-top:6mm}
      .pdf-c-p3-vermoegen-table th{padding:2mm;font-size:7.5pt;letter-spacing:.16em;text-transform:uppercase;color:#7A7A72;font-weight:500;text-align:left;border-bottom:.5px solid #E8E6DD}
      .pdf-c-p3-vermoegen-table th.r{text-align:right}
      .pdf-c-p3-vermoegen-table td{padding:2mm;border-bottom:.4px solid #E8E6DD}
      .pdf-c-p3-vermoegen-table td.r{text-align:right}
      .pdf-c-p3-vermoegen-table tr.total td{border-top:.5px solid #B08A4D;font-weight:500;color:#8E6E3D}

      /* Page 4 */
      .pdf-c-p4-center{display:flex;flex-direction:column;justify-content:center;align-items:center;flex:1;text-align:center;padding-top:30mm}
      .pdf-c-p4-headline{font-size:24pt;font-weight:200;letter-spacing:-.02em;line-height:1.15;margin-top:6mm;max-width:22ch}
      .pdf-c-p4-delta{font-size:48pt;font-weight:200;letter-spacing:-.03em;line-height:1;margin-top:14mm;color:#1A1A17}
      .pdf-c-p4-delta .num{color:#8E6E3D;font-weight:300}
      .pdf-c-p4-sub{font-size:11pt;line-height:1.7;color:#3A3A35;max-width:62ch;margin-top:8mm}

      /* Page 5 — Detail */
      .pdf-c-p5-grid{display:grid;grid-template-columns:1fr 1fr;gap:8mm 12mm;margin-top:4mm}
      .pdf-c-p5-block h4{font-size:8pt;letter-spacing:.2em;text-transform:uppercase;color:#8E6E3D;font-weight:500;margin-bottom:3mm}
      .pdf-c-p5-block h5{font-size:8pt;letter-spacing:.18em;text-transform:uppercase;color:#7A7A72;font-weight:500;margin:4mm 0 2mm 0}
      .pdf-c-saldo-row{display:flex;justify-content:space-between;padding:1.6mm 0;border-bottom:.4px solid #E8E6DD;font-size:9.5pt;font-variant-numeric:tabular-nums}
      .pdf-c-saldo-row.tot{border-bottom:none;border-top:.5px solid #B08A4D;padding-top:2.5mm;margin-top:1.5mm;font-weight:500;color:#8E6E3D}
      .pdf-c-ass-row{display:flex;justify-content:space-between;padding:1.4mm 0;border-bottom:.4px dotted #E8E6DD;font-size:9pt;font-variant-numeric:tabular-nums}
      .pdf-c-ass-row .k{color:#7A7A72}
      .pdf-c-ass-row .v{color:#1A1A17}
      .pdf-c-p5-cashflow{width:100%;border-collapse:collapse;font-size:8.5pt;font-variant-numeric:tabular-nums;margin-top:2mm}
      .pdf-c-p5-cashflow th{padding:1.6mm 1mm;font-size:7pt;letter-spacing:.16em;text-transform:uppercase;color:#7A7A72;font-weight:500;text-align:left;border-bottom:.4px solid #E8E6DD}
      .pdf-c-p5-cashflow th.r{text-align:right}
      .pdf-c-p5-cashflow td{padding:1.4mm 1mm;border-bottom:.3px solid #E8E6DD}
      .pdf-c-p5-cashflow td.r{text-align:right}

      /* Page 6 — Weg */
      .pdf-c-weg{list-style:none;padding:0;margin:6mm 0 0 0;display:flex;flex-direction:column;gap:0}
      .pdf-c-weg li{display:flex;gap:6mm;padding:4mm 0;border-bottom:.4px solid #E8E6DD}
      .pdf-c-weg li:last-child{border-bottom:none}
      .pdf-c-weg-num{flex:0 0 13mm;font-size:22pt;font-weight:200;letter-spacing:-.02em;color:#8E6E3D;line-height:1;font-variant-numeric:tabular-nums}
      .pdf-c-weg-body{font-size:10pt;line-height:1.65;color:#3A3A35;padding-top:1.5mm}
      .pdf-c-weg-body strong{color:#1A1A17;font-weight:500;font-size:12pt;line-height:1.3;display:block;margin-bottom:1.5mm}

      /* Page 7 — B&B */
      .pdf-c-bub-grid{display:grid;grid-template-columns:1fr 1fr;gap:8mm 12mm;margin-top:8mm}
      .pdf-c-bub-cell{display:flex;flex-direction:column;gap:3mm}
      .pdf-c-bub-step{font-size:16pt;font-weight:300;letter-spacing:-.005em;color:#8E6E3D;padding-bottom:2.5mm;border-bottom:.4px solid #C9A572}
      .pdf-c-bub-text{font-size:9.5pt;line-height:1.7;color:#3A3A35;font-weight:400}
      .pdf-c-bub-foot{margin-top:8mm;padding-top:5mm;border-top:.5px solid #B08A4D;display:grid;grid-template-columns:1fr 1fr;gap:10mm}
      .pdf-c-bub-foot-item{font-size:9.5pt;line-height:1.7;color:#3A3A35}
      .pdf-c-bub-foot-item strong{color:#1A1A17;font-weight:500;display:block;margin-bottom:1.5mm}
      .pdf-c-bub-sig{margin-top:8mm;padding-top:5mm;border-top:.4px solid #E8E6DD;font-size:9pt;color:#3A3A35;line-height:1.7}
      .pdf-c-bub-sig strong{color:#1A1A17;font-weight:500}

      .pdf-c-disclaimer{margin-top:6mm;padding-top:4mm;border-top:.4px solid #B08A4D;font-size:7.5pt;line-height:1.65;color:#7A7A72;letter-spacing:.01em}
    </style>
  `;

  // ===== SEITE 1 · COVER =====
  // QA-Fix 2026-05-22 (Audit-H H1): Cover trägt jetzt volle B&B-Identifikation
  // (HRB + Geschäftsführer + Adresse) UND Kunden-Adresse aus der SA. Bank-Sachbearbeiter
  // braucht das ohne S.2 aufschlagen zu müssen.
  const _saAddr = (k.saJson && k.saJson.antragsteller) || {};
  const _kundeAdr = [_saAddr.strasse, [_saAddr.plz, _saAddr.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const seite1 = `
    <div class="pdf-page pdf-c-page pdf-c-cover">
      <div class="pdf-c-cover-top">
        <div class="pdf-c-cover-logo">${_bubLogo()}</div>
        <div class="pdf-c-cover-meta">
          Investitions-<br>analyse<br>—<br>für<br><strong>${esc(displayName)}</strong>${_kundeAdr ? '<br><span style="font-weight:400;font-size:8.5pt;letter-spacing:.1em;text-transform:none;color:#7A7A72;">' + esc(_kundeAdr) + '</span>' : ''}
        </div>
      </div>
      <div class="pdf-c-cover-middle">
        <div class="pdf-c-cover-kicker">B&amp;B Investitionsanalyse · ${esc(new Date().getFullYear().toString())}</div>
        <div class="pdf-c-cover-address">${esc(projekt || '—')}${weBez ? '<br>' + esc(weBez) : ''}</div>
        <div class="pdf-c-cover-headline">
          In zehn Jahren hast Du <span class="pdf-c-num-accent">${fmt(r.vermoegenNetto10)}</span> aufgebaut.
        </div>
      </div>
      <div class="pdf-c-cover-bottom">
        <div class="meta">${vertrieblerBlock}<br><span style="font-weight:400;font-size:7.5pt;letter-spacing:.1em;text-transform:none;color:#7A7A72;">B&amp;B Immo GmbH · Burdastraße 23 · 77746 Schutterwald · HRB 727 814 (Amtsgericht Freiburg) · Geschäftsführer laut Handelsregister</span></div>
        <div class="date">${esc(datum)}</div>
      </div>
    </div>
  `;

  // ===== SEITE 2 · ECKDATEN + PLAN =====
  const belastungJ110 = r.cf.slice(0, 10).map((c, idx) => {
    const mo = Math.round(c.cfJahr / 12);
    const cls = mo >= 0 ? 'pdf-c-pos' : 'pdf-c-neg';
    return `<tr><td>${c.y}</td><td class="r ${cls}">${mo > 0 ? '+' : ''}${mo} €</td></tr>`;
  }).join('');
  const seite2 = `
    <div class="pdf-page pdf-c-page">
      ${ph()}
      <div class="pdf-c-section-num">01 · Das Objekt &nbsp;·&nbsp; 02 · Der Plan</div>
      <h2 class="pdf-c-section-title">Effektive Belastung im ersten Jahr: ${fmtMo(r.belastungMo)}.</h2>
      <p class="pdf-c-lead" style="max-width:48ch">${i.qm ? 'Eine ' + i.qm.toString().replace('.', ',') + '-qm-Wohnung' : 'Eine Wohnung'}${(() => { const m = i.mietsteigerungsModus || 'sprung'; if (m === 'staffel') return ', neu vermietet mit Staffelmiete'; if (m === 'index') return ' mit Indexmietvertrag'; if (m === 'keine') return ''; return ' im Bestand'; })()}. ${r.belastungMo >= 0 ? 'Die Wohnung trägt sich bereits ab Tag 1 vollständig selbst.' : (selbsttragungPct >= 95 ? 'Die Wohnung trägt sich nahezu selbst; was bleibt, ist eine kalkulierte monatliche Eigenleistung.' : 'Die Wohnung trägt einen Teil der laufenden Kosten selbst; die verbleibende Eigenleistung schrumpft Jahr für Jahr.')}</p>
      <div class="pdf-c-p2-grid">
        <div class="pdf-c-obj">
          <h4>Objekt</h4>
          <div class="pdf-c-obj-row"><span class="k">Adresse</span><span class="v">${esc(projekt || i._weLage || '—')}</span></div>
          ${i._weNr ? `<div class="pdf-c-obj-row"><span class="k">Wohneinheit</span><span class="v">${esc(i._weNr)}</span></div>` : ''}
          <div class="pdf-c-obj-row"><span class="k">Wohnfläche</span><span class="v">${(i.qm || 0).toLocaleString('de-DE')}<span class="unit">qm</span></span></div>

          <h4>Kaufpreis</h4>
          <div class="pdf-c-obj-row"><span class="k">Wohnung</span><span class="v">${Math.round(i.kaufpreis || 0).toLocaleString('de-DE')}<span class="unit">€</span></span></div>
          ${i.stellplatzKp > 0 ? `<div class="pdf-c-obj-row"><span class="k">Stellplatz</span><span class="v">${Math.round(i.stellplatzKp).toLocaleString('de-DE')}<span class="unit">€</span></span></div>` : ''}
          <div class="pdf-c-obj-row"><span class="k">Gesamt</span><span class="v">${Math.round(r.kpGesamt).toLocaleString('de-DE')}<span class="unit">€</span></span></div>
          <div class="pdf-c-obj-row"><span class="k">KP je qm</span><span class="v">${Math.round(kpQm).toLocaleString('de-DE')}<span class="unit">€</span></span></div>
          ${marktQm > 0 ? `<div class="pdf-c-obj-row"><span class="k">Markt je qm</span><span class="v">${Math.round(marktQm).toLocaleString('de-DE')}<span class="unit">€</span></span></div>` : ''}

          <h4>Dein Einsatz</h4>
          <div class="pdf-c-obj-row"><span class="k">Kaufnebenkosten</span><span class="v">${Math.round(knk).toLocaleString('de-DE')}<span class="unit">€${i.knkMitfinanziert ? ' · mitfinanziert' : ''}</span></span></div>
          <div class="pdf-c-obj-row"><span class="k">Eigenkapital</span><span class="v">${Math.round(r.ekBedarf).toLocaleString('de-DE')}<span class="unit">€</span></span></div>
          <div class="pdf-c-obj-row"><span class="k">Darlehenshöhe</span><span class="v">${Math.round((r.darlehen != null ? r.darlehen : (i.knkMitfinanziert ? r.kpGesamt + knk : r.kpGesamt))).toLocaleString('de-DE')}<span class="unit">€${i.knkMitfinanziert ? ' · inkl. KNK' : ''}</span></span></div>
        </div>
        <div class="pdf-c-p2-right">
          <div class="hero-line">Annuität <span class="pdf-c-num">${fmtMo(r.annuityMo)}</span> &nbsp;·&nbsp; Miete <span class="pdf-c-num">${fmtMo(r.mieteJ1Mo)}</span> &nbsp;·&nbsp; HG+HV+MV <span class="pdf-c-num">${fmtMo((r.hausgeldNurMo||0) + (r.hausverwaltungMo||0) + (r.mietverwaltungMo||0))}</span> &nbsp;·&nbsp; Steuervorteil <span class="pdf-c-num">${fmtMo(r.stVorteilJ1Mo)}</span></div>
          <p class="narrative">${r.belastungMo >= 0
            ? `Die Wohnung trägt sich bereits ab Tag 1 vollständig selbst — Miete und Steuervorteil decken alle laufenden Kosten und liefern einen monatlichen Überschuss von ${fmtMo(r.belastungMo)}.`
            : `Die Wohnung trägt sich aus laufender Miete und Steuervorteil zu rund ${selbsttragungPct} % selbst. Den Rest leistest Du als Eigenleistung — Jahr für Jahr kleiner werdend.`}</p>
          <table class="pdf-c-p2-belastung-table">
            <thead><tr><th>Jahr</th><th class="r">Belastung €/Mo</th></tr></thead>
            <tbody>${belastungJ110}</tbody>
          </table>
          ${crossoverJahr
            ? (crossoverJahr <= 10
              ? `<p class="narrative" style="margin-top:5mm">Ab Jahr ${crossoverJahr} dreht die Belastung ins Plus — die Wohnung beginnt, einen monatlichen Überschuss zu liefern, während die Annuität konstant bleibt.</p>`
              : `<p class="narrative" style="margin-top:5mm">Innerhalb der hier dargestellten 10 Jahre bleibt die Belastung im negativen Bereich — der Crossover folgt voraussichtlich erst um Jahr ${crossoverJahr}. Der Vermögenseffekt in den ersten 10 Jahren entsteht aus Tilgung und Wertsteigerung.</p>`)
            : '<p class="narrative" style="margin-top:5mm">Über die 10 Jahre bleibt die Belastung im negativen Bereich — der Vermögenseffekt entsteht über die Tilgung und Wertsteigerung.</p>'}
        </div>
      </div>
      <div class="pdf-c-page-foot"><div>02 · Eckdaten &amp; Plan</div><div class="pdf-c-page-num">Seite 2 von 7</div></div>
    </div>
  `;

  // ===== SEITE 3 · AUSSICHT =====
  const vermoegenRows = r.vermoegen.slice(1, 11).map(v => {
    const netto = Math.round(v.vermoegenNetto || 0);
    const cls = netto >= 0 ? 'pdf-c-pos' : 'pdf-c-neg';
    return `<tr><td>${v.y}</td><td class="r">${Math.round(v.wert).toLocaleString('de-DE')} €</td><td class="r">${Math.round(v.restschuld).toLocaleString('de-DE')} €</td><td class="r ${cls}">${netto > 0 ? '+' : ''}${netto.toLocaleString('de-DE')} €</td></tr>`;
  }).join('');
  const seite3 = `
    <div class="pdf-page pdf-c-page">
      ${ph()}
      <div class="pdf-c-section-num">03 · Vermögenszuwachs</div>
      <h2 class="pdf-c-section-title">In zehn Jahren: <span class="pdf-c-accent" style="font-weight:300">${fmt(r.vermoegenNetto10)}</span> Nettovermögen.</h2>
      <p class="pdf-c-lead" style="max-width:56ch">${nettoPositivAbStart ? 'Dein Nettovermögen ist bereits zum Start positiv — Marktwert übersteigt den Eigenkapital-Einsatz' : (nettoCrossoverJahr ? 'Aus zunächst negativem Nettovermögen wird ab Jahr ' + nettoCrossoverJahr + ' der Pfad nach oben sichtbar' : 'Der Pfad zum positiven Nettovermögen braucht in diesem Profil mehr als 10 Jahre')} — getragen vom Restschuld-Abbau durch die Annuität und einer moderat gerechneten Wertentwicklung.</p>
      <table class="pdf-c-p3-vermoegen-table">
        <thead><tr><th>Jahr</th><th class="r">Marktwert</th><th class="r">Restschuld</th><th class="r">Netto kumuliert</th></tr></thead>
        <tbody>${vermoegenRows}</tbody>
      </table>
      <div class="pdf-c-p3-bottom">
        <div class="cell"><div class="label">Modellwert J10</div><div class="v">${Math.round(v10.wert || 0).toLocaleString('de-DE')}<span class="unit">€</span></div></div>
        <div class="cell"><div class="label">Restschuld J10</div><div class="v">${Math.round(v10.restschuld || 0).toLocaleString('de-DE')}<span class="unit">€</span></div></div>
        ${(r.irr != null && isFinite(r.irr))
          ? `<div class="cell"><div class="label">Interner Zinsfuß</div><div class="v">${(r.irr * 100).toFixed(1).replace('.',',')}<span class="unit">% p.a.</span></div></div>`
          : `<div class="cell"><div class="label">Vermögenszuwachs</div><div class="v">${Math.round(r.vermoegenNetto10 || 0).toLocaleString('de-DE')}<span class="unit">€</span></div></div>`}
      </div>
      <div class="pdf-c-page-foot"><div>03 · Aussicht</div><div class="pdf-c-page-num">Seite 3 von 7</div></div>
    </div>
  `;

  // ===== SEITE 4 · VERGLEICH =====
  // QA-Fix 2026-05-22 (Phase-3b K2 / 3c K2): EK=0-Branch parallel zur App-Logik
  // (app.js Z.2556+). Vorher: PDF rechnete "0 € auf einem Sparbuch wären auf 0 €
  // gewachsen" — sinnloser Vergleich bei 110%-Finanzierung.
  const ekIstNullPdf = !r.ekBedarf || r.ekBedarf <= 100;
  // Bonus-Fix (Phase-3b W2): bei negativem sparenVsKaufenDelta "+Mehrgewinn"-Wording falsch.
  const _spDeltaPos = (r.sparenVsKaufenDelta || 0) >= 0;
  const _spDeltaLabel = _spDeltaPos ? 'Mehrgewinn über 10 Jahre' : 'Mehrverlust über 10 Jahre (Sparbuch besser)';
  const _spDeltaVz = _spDeltaPos ? '+ ' : '';
  const seite4 = ekIstNullPdf ? `
    <div class="pdf-page pdf-c-page">
      ${ph()}
      <div class="pdf-c-p4-center">
        <div class="pdf-c-section-num">04 · Der Hebel</div>
        <h2 class="pdf-c-p4-headline">Ohne Eigenkapital-Einsatz zum Sachwert.</h2>
        <div class="pdf-c-p4-delta"><span class="num">${fmt(r.vermoegenNetto10)}</span><br><span style="font-size:11pt;letter-spacing:.18em;text-transform:uppercase;color:#7A7A72;font-weight:500;display:inline-block;margin-top:4mm">Vermögensaufbau über 10 Jahre</span></div>
        <p class="pdf-c-p4-sub">Bei 110-%-Finanzierung setzt Du kein eigenes Kapital ein. Trotzdem baust Du in zehn Jahren ${fmt(r.vermoegenNetto10)} Nettovermögen auf — getragen von Tilgung und Wertentwicklung. Der Hebel kommt aus dem Sachwert, nicht aus Deinem Sparbuch.</p>
        <p class="pdf-c-p4-sub" style="margin-top:6mm;font-size:10pt;color:#7A7A72;font-style:italic">Ein klassischer Sparbuch-Vergleich entfällt: ohne Eigenkapital-Einsatz wäre auch das Sparbuch-Ergebnis 0 €. Die monatliche Belastung über die Laufzeit ist die einzige Eigenleistung.</p>
      </div>
      <div class="pdf-c-page-foot"><div>04 · Der Hebel</div><div class="pdf-c-page-num">Seite 4 von 7</div></div>
    </div>
  ` : `
    <div class="pdf-page pdf-c-page">
      ${ph()}
      <div class="pdf-c-p4-center">
        <div class="pdf-c-section-num">04 · Die Alternative</div>
        <h2 class="pdf-c-p4-headline">Wäre Dein Eigenkapital auf einem Sparbuch geblieben.</h2>
        <div class="pdf-c-p4-delta">${_spDeltaVz}<span class="num">${fmt(r.sparenVsKaufenDelta)}</span><br><span style="font-size:11pt;letter-spacing:.18em;text-transform:uppercase;color:#7A7A72;font-weight:500;display:inline-block;margin-top:4mm">${_spDeltaLabel}</span></div>
        <p class="pdf-c-p4-sub">${fmt(r.ekBedarf)} auf einem Sparbuch zu ${((i.sparZins || 0.025) * 100).toFixed(2).replace('.', ',')} % p.a. wären in zehn Jahren auf rund ${fmt(sparen10.nurSparen)} gewachsen. Dasselbe Eigenkapital, in den Sachwert Immobilie investiert, kommt auf ${fmt(sparen10.mitImmo)}. Die Differenz von ${fmt(r.sparenVsKaufenDelta)} ${_spDeltaPos ? 'ist der reine Sachwert-Vorteil' : 'zeigt, dass dieses Szenario unter Sparbuch-Niveau bleibt — Wertsteigerungs- oder Mietsteigerungs-Annahmen prüfen'}.</p>
      </div>
      <div class="pdf-c-page-foot"><div>04 · Im Vergleich</div><div class="pdf-c-page-num">Seite 4 von 7</div></div>
    </div>
  `;

  // ===== SEITE 5 · DETAIL =====
  const cfRowsP5 = r.cf.slice(0, 10).map(c => {
    const mo = Math.round(c.cfJahr / 12);
    const cls = mo >= 0 ? 'pdf-c-pos' : 'pdf-c-neg';
    return `<tr><td>${c.y}</td><td class="r ${cls}">${mo > 0 ? '+' : ''}${mo}</td><td class="r">${Math.round(c.cfJahr).toLocaleString('de-DE')}</td></tr>`;
  }).join('');
  const seite5 = `
    <div class="pdf-page pdf-c-page">
      ${ph()}
      <div class="pdf-c-section-num">05 · Im Detail</div>
      <h2 class="pdf-c-section-title">Damit Du jede Zahl nachvollziehen kannst.</h2>
      <div class="pdf-c-p5-grid">
        <div class="pdf-c-p5-block">
          <h4>Bonität · So rechnet die Bank das durch</h4>
          <div class="pdf-c-saldo-row"><span>Freies Einkommen vor Investment</span><span class="pdf-c-pos">${fmtMo(r.bonVor || 0)}</span></div>
          <div class="pdf-c-saldo-row"><span>+ Anrechenbare Miete (80 %)</span><span class="pdf-c-pos">+ ${fmtMo(r.bonMieteAnr || 0)}</span></div>
          <div class="pdf-c-saldo-row"><span>− Annuität</span><span class="pdf-c-neg">− ${fmtMo(r.bonAnnuMo || 0)}</span></div>
          ${r.bonModus === 'detail' ? `
          <div class="pdf-c-saldo-row"><span>− Hausgeld (konservativ)</span><span class="pdf-c-neg">− ${fmtMo(r.hausgeldNurMo || 0)}</span></div>
          <div class="pdf-c-saldo-row"><span>− Hausverwaltung</span><span class="pdf-c-neg">− ${fmtMo(r.hausverwaltungMo || 0)}</span></div>` : ''}
          <div class="pdf-c-saldo-row tot"><span>Nach Investment</span><span class="${(r.bonNach || 0) < 0 ? 'pdf-c-neg' : ''}">${fmtMo(r.bonNach || 0)}</span></div>
          <h5>Freies Eigenkapital</h5>
          <div class="pdf-c-saldo-row"><span>Vor Erwerb</span><span>${fmt(r.bonVermoegen || 0)}</span></div>
          <div class="pdf-c-saldo-row"><span>Einsatz Erwerb (EK + KNK)</span><span class="pdf-c-neg">− ${fmt(r.ekBedarf)}</span></div>
          <div class="pdf-c-saldo-row tot"><span>Nach Erwerb</span><span class="${(r.bonVermoegenVsEk || 0) < 0 ? 'pdf-c-neg' : ''}">${fmt(r.bonVermoegenVsEk || 0)}</span></div>
          <p style="font-size:7.5pt;color:#7A7A72;margin-top:3mm;line-height:1.55">${(r.mietsubventionGesamt && r.mietsubventionGesamt > 0) ? 'Die Mietsubvention wird bei richtiger Gestaltung wie Miete angesetzt — sie geht zu 80 % in die anrechenbare Miete ein.' : 'Die Bank rechnet 80 % der vereinbarten Miete als zusätzliches Einkommen.'}</p>
        </div>

        <div class="pdf-c-p5-block">
          <h4>Rechen-Annahmen</h4>
          <div class="pdf-c-ass-row"><span class="k">Kaufpreis gesamt</span><span class="v">${fmt(r.kpGesamt)}</span></div>
          <div class="pdf-c-ass-row"><span class="k">Kaufnebenkosten</span><span class="v">${fmt(knk)}${i.knkMitfinanziert ? ' (mitfinanziert)' : ''}</span></div>
          <div class="pdf-c-ass-row"><span class="k">Eigenkapital-Einsatz</span><span class="v">${fmt(r.ekBedarf)}</span></div>
          <div class="pdf-c-ass-row"><span class="k">Annuität pro Monat</span><span class="v">${fmtMo(r.annuityMo)}</span></div>
          <div class="pdf-c-ass-row"><span class="k">Zinssatz Darlehen</span><span class="v">${fmtPct(i.zins || 0)} p.a.</span></div>
          <div class="pdf-c-ass-row"><span class="k">Anfangstilgung</span><span class="v">${fmtPct(i.tilgung || 0)} p.a.</span></div>
          <div class="pdf-c-ass-row"><span class="k">Wertsteigerung</span><span class="v">${fmtPct(i.wertsteigerung || 0)} p.a.</span></div>
          <div class="pdf-c-ass-row"><span class="k">Mietsteigerung</span><span class="v">${(() => {
            // QA-Fix 2026-05-22 (Audit-H H7): bei sprung-Modus war "20 % p.a." UWG-relevant —
            // es ist EIN Sprung um 20 % alle 3 Jahre, nicht jährliche Steigerung. Wording
            // modus-abhängig setzen.
            const m = i.mietsteigerungsModus || 'sprung';
            const pct = fmtPct(i.steigerungProz || 0);
            if (m === 'sprung')  return pct + ' je Sprung · alle 3 Jahre (§ 558 BGB Kappungsgrenze)';
            if (m === 'staffel') return pct + ' p.a. · Staffelmietvertrag';
            if (m === 'index')   return pct + ' p.a. · Indexmietvertrag';
            if (m === 'keine')   return 'keine';
            return pct + ' p.a.';
          })()}</span></div>
          <div class="pdf-c-ass-row"><span class="k">Steuersatz</span><span class="v">${fmtPct(i.steuersatz || 0)}</span></div>
          <div class="pdf-c-ass-row"><span class="k">AfA-Satz</span><span class="v">${fmtPct(i.afaSatz || 0)} linear${(() => {
            // QA-Fix 2026-05-22 (Audit-H H5): AfA-Rechtsgrundlage anzeigen statt nackten Prozentsatz.
            // Banker fragt: welcher §? Hier Indikation aus dem Satz — Käufer/Steuerberater prüft Detail.
            const s = i.afaSatz || 0;
            if (s >= 0.044 && s <= 0.046) return ' · § 7b EStG (Sonder-AfA Neubau)';
            if (s >= 0.036 && s <= 0.038) return ' · § 7h/i EStG (Sanierung) — Bescheinigung erforderlich';
            if (s >= 0.029 && s <= 0.031) return ' · § 7 Abs. 4 Nr. 2 a EStG (Neubau ab 2023)';
            if (s >= 0.024 && s <= 0.026) return ' · § 7 Abs. 5 a EStG (Altbau vor 1925)';
            if (s >= 0.019 && s <= 0.021) return ' · § 7 Abs. 4 Nr. 1 EStG (Bestand ab 1925)';
            return ' · Rechtsgrundlage prüfen';
          })()}</span></div>
          <div class="pdf-c-ass-row"><span class="k">Mietsubvention</span><span class="v">${subvText}</span></div>
          <div class="pdf-c-ass-row"><span class="k">Sparbuch-Vergleich</span><span class="v">${((i.sparZins || 0.025) * 100).toFixed(2).replace('.',',')} % p.a.</span></div>
        </div>

        <div class="pdf-c-p5-block" style="grid-column:1/-1">
          <h4>Cashflow Jahr 1 bis Jahr 10</h4>
          <table class="pdf-c-p5-cashflow">
            <thead><tr><th>Jahr</th><th class="r">Belastung €/Mo</th><th class="r">Jahres-Summe €</th></tr></thead>
            <tbody>${cfRowsP5}</tbody>
          </table>
        </div>
      </div>
      <!-- QA-Fix 2026-05-23 (Edgar P3): Disclaimer von Seite 5 entfernt — durch B5
           war er 5× länger und Seite 5 (Annahmen + Cashflow-Tabelle) lief in
           overflow:hidden über. Disclaimer jetzt auf Seite 7. -->
      <div class="pdf-c-page-foot"><div>05 · Im Detail</div><div class="pdf-c-page-num">Seite 5 von 7</div></div>
    </div>
  `;

  // ===== SEITE 6 · DER WEG =====
  const seite6 = `
    <div class="pdf-page pdf-c-page">
      ${ph()}
      <div class="pdf-c-section-num">06 · Wie es weitergeht</div>
      <h2 class="pdf-c-section-title">Sechs Schritte bis zum Notartermin.</h2>
      <p class="pdf-c-lead" style="max-width:60ch">
        Wir beurkunden den Kauf erst dann, wenn drei Voraussetzungen sauber erfüllt sind: Deine Finanzierung steht, die Objektunterlagen passen zu dem, was Du hier siehst, und Du hast die Wohnung besichtigt. Fehlt einer dieser Punkte — kein Notartermin.
      </p>
      <ol class="pdf-c-weg">
        <li><span class="pdf-c-weg-num">1</span><div class="pdf-c-weg-body"><strong>Selbstauskunft vollständig ausfüllen.</strong>Bonität-Grundlage für die Bank — wir helfen Dir durch jedes Feld. Dauert in der Regel 20–30 Minuten.</div></li>
        <li><span class="pdf-c-weg-num">2</span><div class="pdf-c-weg-body"><strong>Wohneinheit sichern.</strong>Reservierung. Die Wohneinheiten gehen unter Marktwert weg — die Reservierung schützt Dich davor, dass sie an einen anderen Interessenten geht, während Du die nächsten Schritte gehst.</div></li>
        <li><span class="pdf-c-weg-num">3</span><div class="pdf-c-weg-body"><strong>Objektunterlagen prüfen.</strong>Du bekommst Teilungserklärung, Protokolle, Wirtschaftsplan, Energieausweis. Damit prüfst Du selbst — oder mit Deinem Berater — dass die Unterlagen exakt das wiedergeben, was wir Dir hier gezeigt haben.</div></li>
        <li><span class="pdf-c-weg-num">4</span><div class="pdf-c-weg-body"><strong>Finanzierungszusage erhalten.</strong>Mit der vollständigen Selbstauskunft und den Objektunterlagen geht es zur Bank. Sobald die schriftliche Finanzierungszusage da ist, schaltet die nächste Stufe frei.</div></li>
        <li><span class="pdf-c-weg-num">5</span><div class="pdf-c-weg-body"><strong>Besichtigung vor Ort.</strong>Du siehst die Wohnung mit eigenen Augen — Lage, Substanz, Treppenhaus, Umfeld. Erst wenn das passt, machen wir den letzten Schritt.</div></li>
        <li><span class="pdf-c-weg-num">6</span><div class="pdf-c-weg-body"><strong>Notartermin.</strong>Beurkundung des Kaufvertrags. Wir beurkunden nur, wenn die drei Voraussetzungen Finanzierung, Objektunterlagen und Besichtigung sauber erfüllt sind.</div></li>
      </ol>
      <div class="pdf-c-page-foot"><div>06 · Wie es weitergeht</div><div class="pdf-c-page-num">Seite 6 von 7</div></div>
    </div>
  `;

  // ===== SEITE 7 · BROT & BUTTER =====
  const seite7 = `
    <div class="pdf-page pdf-c-page">
      ${ph()}
      <div class="pdf-c-section-num">07 · Wer wir sind</div>
      <h2 class="pdf-c-section-title">Brot &amp; Butter.</h2>
      <p class="pdf-c-lead" style="max-width:60ch">Unser Name ist unser Geschäftsmodell. Wir kaufen die großen Brote und veredeln sie mit Butter — bevor wir scheibenweise an Dich weitergeben.</p>
      <div class="pdf-c-bub-grid">
        <div class="pdf-c-bub-cell"><div class="pdf-c-bub-step">Brot</div><div class="pdf-c-bub-text">Wir kaufen bei großen Immobiliengesellschaften ganze Bestände zu Preisen, die für Einzelkäufer nie sichtbar werden. Volumen schafft den Einkaufsvorteil — das ist das Leibbrot.</div></div>
        <div class="pdf-c-bub-cell"><div class="pdf-c-bub-step">Teilen</div><div class="pdf-c-bub-text">Aus dem Bestand werden einzelne Scheiben — einzelne Wohneinheiten, die wir vermarktungsfähig machen. Jede Einheit bekommt ihren eigenen Pfad.</div></div>
        <div class="pdf-c-bub-cell"><div class="pdf-c-bub-step">Butter</div><div class="pdf-c-bub-text">Veredelung. Bevor eine Wohnung zu Dir kommt, machen wir den Hausverwaltungs-Wechsel, prüfen die Rücklage, setzen notwendige Maßnahmen an und begutachten den Zustand sehr genau.</div></div>
        <div class="pdf-c-bub-cell"><div class="pdf-c-bub-step">Weitergabe</div><div class="pdf-c-bub-text">Portionsgerecht. Nicht jeder kann ein Mehrfamilienhaus kaufen — eine einzelne Wohnung schon. So machen wir den Sachwert für Privatanleger zugänglich.</div></div>
      </div>
      <div class="pdf-c-bub-foot">
        <div class="pdf-c-bub-foot-item"><strong>Keine Vertriebsprovision.</strong>Du zahlst keinen Vermittler-Aufschlag. Unser Geld verdienen wir im Einkauf, nicht am Verkauf.</div>
        <div class="pdf-c-bub-foot-item"><strong>Skin in the Game.</strong>Wir behalten regelmäßig Einheiten im eigenen Bestand. Auch die Gesellschafter kaufen privat — wir investieren in das, was wir Dir anbieten.</div>
      </div>
      <div class="pdf-c-bub-sig">${vertrieblerBlock}</div>
      <p class="pdf-c-disclaimer" style="font-size:7pt;line-height:1.45;margin-top:6mm;">
        Diese Investitionsrechnung beruht auf den dokumentierten Annahmen. Keine Anlageberatung im Sinne des WpHG. Vermittlung im Rahmen einer Erlaubnis nach § 34c GewO. Verbindlich ist ausschließlich der notarielle Kaufvertrag. Steuerliche Aspekte (insb. AfA-Rechtsgrundlage und ‑Bemessung) sind mit Deinem Steuerberater abzustimmen. Wertsteigerung und Mietsteigerung sind langfristige Modell-Annahmen; tatsächliche Werte können abweichen. „Modellwert J10" ist eine rechnerische Hochrechnung (Kaufpreis × Wertsteigerung) und kein gutachterlicher Verkehrswert i.S.d. § 194 BauGB. Der Sparbuch-Vergleich rechnet Brutto-Renditen (vor Abgeltungssteuer); die Immobilien-Rendite enthält den persönlichen Steuervorteil. Für die Finanzierungs-Vermittlung berechnen wir Dir keine Provision; eventuelle Bank-Vermittlungs-Provisionen fließen in die Kondition ein. Die 80&nbsp;%-Mietanrechnung entspricht dem Standard unserer Partnerbanken; andere Banken können abweichen.
      </p>
      <div class="pdf-c-page-foot"><div>07 · Brot &amp; Butter</div><div class="pdf-c-page-num">Seite 7 von 7</div></div>
    </div>
  `;

  _doPrint(
    pdfCStyle + seite1 + seite2 + seite3 + seite4 + seite5 + seite6 + seite7,
    'invest',
    _filenameHint('Investitions-Doc', kunde, {
      weNr: kalkInputs && kalkInputs._weNr,
      projektKurz: kalkInputs && kalkInputs._projektName,
    })
  );
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
  // QA-Fix 2026-05-23 (Audit-AA-3): Stellplatz-Bezeichnung nach Anzahl + Typ.
  const spAnz   = (kalkInputs && kalkInputs._stellplatzAnzahl) || 0;
  const spGar   = (kalkInputs && kalkInputs._stellplatzGarageCount) || 0;
  const spFla   = (kalkInputs && kalkInputs._stellplatzFlaecheCount) || 0;
  const fmt     = window.Kalk.fmtEur;
  const fmtQm   = (v) => (v || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' qm';

  // Reservierungs- + Unterschriftsdatum (default: heute / heute+30T)
  const heute   = new Date();
  const reservBis = new Date(heute.getTime() + 30 * 24 * 3600 * 1000);
  const dtDe = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Verkäufer fest: B&B Immo GmbH, Edgar als Unterzeichner (kann durch user.name überschrieben werden).
  const verkaeuferName = u.name || 'Edgar Steininger';

  // Objekt-Block: "PLZ Ort, Straße mit Wohnung X mit Y qm zum Kaufpreis von Z € plus W € für eine Garage."
  // QA-Fix 2026-05-22 (Prüfer-3 B1): bei leerer Lage entsteht kein doppeltes Leerzeichen
  // mehr ("  mit Wohnung 5 ..."). Wenn auch lage leer ist, beginnt der Satz mit
  // "Wohnung X" oder "Objekt" als Fallback.
  // QA-Fix 2026-05-23 (Audit-AA-3): Plural + Typ-Bezeichnung dynamisch.
  // Vorher hartkodiert „einen Stellplatz/Garage" auch bei 2 Stellplätzen.
  let stplLabel;
  if (spAnz <= 1) {
    stplLabel = spGar > 0 ? 'eine Garage' : (spFla > 0 ? 'einen Stellplatz' : 'einen Stellplatz/Garage');
  } else {
    if (spGar > 0 && spFla > 0) stplLabel = `${spGar} Garage${spGar > 1 ? 'n' : ''} und ${spFla} Stellplatz${spFla > 1 ? 'plätze' : ''}`;
    else if (spGar > 0)         stplLabel = `${spGar} Garagen`;
    else if (spFla > 0)         stplLabel = `${spFla} Stellplätze`;
    else                        stplLabel = `${spAnz} Stellplätze`;
  }
  // QA-Fix 2026-05-23 (Audit-BB-5): Wenn Stellplatz vorhanden aber KP=0
  // (Geschenk-Stellplatz), Stellplatz trotzdem im Reservierungs-Doc nennen.
  // Vorher: PDF verschluckte den Stellplatz komplett → Käufer fragt sich,
  // warum WE-Liste „+ 1 Garage" zeigt und PDF nichts.
  const garageText = spKp > 0
    ? ` plus ${fmt(spKp)} für ${stplLabel}`
    : (spAnz > 0 ? ` (inklusive ${stplLabel}, ohne Aufpreis)` : '');
  const lageEsc = esc(lage || '');
  const wohnungSuffix = weNr ? `Wohnung ${esc(weNr)}` : '';
  const qmText = qm > 0 ? ` mit ${fmtQm(qm)}` : '';
  let objektPrefix;
  if (lageEsc && wohnungSuffix) {
    objektPrefix = `${lageEsc} mit ${wohnungSuffix}`;
  } else if (lageEsc) {
    objektPrefix = lageEsc;
  } else if (wohnungSuffix) {
    objektPrefix = wohnungSuffix;
  } else {
    objektPrefix = 'Objekt (Adresse separat angegeben)';
  }
  const objektZeile = `${objektPrefix}${esc(qmText)} zum Kaufpreis von ${fmt(kp)}${esc(garageText)}.`;

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
  _doPrint(html, 'reservierung', _filenameHint('Reservierung', kunde, {
    weNr: kalkInputs && kalkInputs._weNr,
    projektKurz: kalkInputs && kalkInputs._projektName,
  }));
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
function _buildSelbstauskunftBody(kunde, user) {
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

  // Iter 66 (20.05.2026): Baukasten-Zusatzpositionen — pro Antragsteller eigene
  //   Listen (zusatzEinnahmen, zusatzAusgaben, zusatzVermoegen, zusatzSchulden,
  //   zusatzSparplaene). Jede Position wird als eigene Zeile gezeigt — Titel + Notiz
  //   in der Label-Spalte, Wert in A oder M (je nach Person), die andere Spalte leer.
  //   Nur Zeilen mit Wert werden gerendert, sonst wäre das PDF aufgebläht.
  function zusatzRows(kategorie, feld) {
    let html = '';
    const renderPerson = (liste, spalte) => {
      if (!Array.isArray(liste)) return;
      liste.forEach(item => {
        if (!item) return;
        const wert = parseFloat(item[feld]);
        if (!isFinite(wert) || wert === 0) return; // leere Zeilen nicht ins PDF
        const titel = item.titel || 'Zusatz-Position';
        const notiz = item.notiz ? ` <span style="color:#777;font-size:9px;">— ${esc(item.notiz)}</span>` : '';
        const valHtml = fld(fmtNum(wert));
        const cellA = spalte === 'A' ? valHtml : '';
        const cellM = spalte === 'M' && gemeinsam ? valHtml : (gemeinsam ? '' : '');
        html += `<tr><td class="sa-label">${esc(titel)}${notiz}</td><td>${cellA}</td><td>${cellM}</td></tr>`;
      });
    };
    renderPerson(a[kategorie], 'A');
    if (gemeinsam) renderPerson(m[kategorie], 'M');
    return html;
  }

  const versA = a.vers || {};

  // QA-Fix 2026-05-23 (Edgar live Marcel): SA-Bonitäts-Box („Einnahmen anr. Mo /
  // Ausgaben Mo / Saldo Mo") komplett entfernt. Edgar's Vorgabe: „Die Bank kann
  // selbst zusammenrechnen." Vorteil: kein Konsistenz-Risiko zwischen unserer
  // Hochrechnung und dem, was die Bank selbst rechnen würde (z.B. Anzahl-
  // Gehälter-Skalierung 14/12, 80%-Mietanrechnung, PKV/Leasing/Unterhalt im
  // Saldo). Die Bank bekommt unten alle Rohwerte und rechnet ihre eigene
  // Bonität wie sie es immer macht.
  const bonitaetBoxHtml = '';

  // === SEITE 1: PERSÖNLICHE VERHÄLTNISSE + EINKOMMEN + FIXKOSTEN ===
  const seite1 = `
    <div class="pdf-page sa-page">
      ${_saHeader(1, 5)}
      <table class="sa-table">
        <thead><tr><th class="sa-section-h">PERSÖNLICHE VERHÄLTNISSE</th><th>ANTRAGSTELLER</th><th>${gemeinsam ? 'MITANTRAGSTELLER / EHEPARTNER' : ''}</th></tr></thead>
        <tbody>
          ${row('Name', a.name, m.name)}
          ${row('Geburtsname', a.geburtsname, m.geburtsname)}
          ${row('Vorname', a.vorname, m.vorname)}
          ${row('Straße', a.strasse, m.strasse)}
          ${row('PLZ/Ort', (a.plz || '') + (a.plz && a.ort ? ' ' : '') + (a.ort || ''), (m.plz || '') + (m.plz && m.ort ? ' ' : '') + (m.ort || ''))}
          ${row('Wohnhaft seit (Monat/Jahr)', a.wohnhaftSeit, m.wohnhaftSeit)}
          ${row('Vor-Anschrift (falls < 3 Jahre)', a.vorAnschrift, m.vorAnschrift)}
          ${row('Telefon privat', a.telefonPrivat, m.telefonPrivat)}
          ${row('Telefon geschäftlich', a.telefonGeschaeftlich, m.telefonGeschaeftlich)}
          ${row('E-Mail', a.email, m.email)}
          ${row('Geburtsdatum', dt(a.geburtsdatum), dt(m.geburtsdatum))}
          ${row('Geburtsort', a.geburtsort, m.geburtsort)}
          ${row('Staatsangehörigkeit', a.staatsangehoerigkeit, m.staatsangehoerigkeit)}
          ${row('ausgeübter Beruf', a.beruf, m.beruf)}
          ${row('beschäftigt bei Firma', a.firma, m.firma)}
          ${row('beschäftigt seit', dt(a.beschaeftigtSeit), dt(m.beschaeftigtSeit))}
          ${rowChk('Befristung', ['unbefristet','befristet'], a.befristung, m.befristung)}
          ${rowChk('Probezeit', ['nein','ja'], a.probezeit, m.probezeit)}
          ${row('Steuer-ID', a.steuerId, m.steuerId)}
          ${rowChk('Familienstand', ['ledig','verheiratet','geschieden','verwitwet'], a.familienstand, m.familienstand)}
          ${rowChk('Güterstand (bei verheiratet)', ['Zugewinngemeinschaft','Gütertrennung','Gütergemeinschaft','Ehevertrag'], a.gueterstand, m.gueterstand)}
          ${row('Kinder im Haushalt', a.kinderAnzahl !== undefined && a.kinderAnzahl !== null ? `Anzahl: ${a.kinderAnzahl}${a.kinderAlter ? ' / Alter: ' + a.kinderAlter : ''}` : '', m.kinderAnzahl !== undefined && m.kinderAnzahl !== null ? `Anzahl: ${m.kinderAnzahl}${m.kinderAlter ? ' / Alter: ' + m.kinderAlter : ''}` : '')}
          ${row('Davon unterhaltspflichtig', a.unterhaltspflichtig, m.unterhaltspflichtig)}
          ${/* SA-Redesign (22.05.2026): kinderPlanung raus (DSGVO-Risiko), kfzAnzahl raus (nicht Bank-relevant), kirchensteuer raus (Bank ermittelt via Steuer-ID) */ ''}
          ${row('Wohnsituation', a.wohnsituation ? (a.wohnsituation === 'eigentum' ? 'Eigentum' : a.wohnsituation === 'miete' ? 'zur Miete' : 'mietfrei') : '', m.wohnsituation ? (m.wohnsituation === 'eigentum' ? 'Eigentum' : m.wohnsituation === 'miete' ? 'zur Miete' : 'mietfrei') : '')}
          ${(a.wohnsituation === 'miete' || m.wohnsituation === 'miete') ? row('Vermieter', a.vermieter, m.vermieter) : ''}
          ${(a.vorAnschrift || m.vorAnschrift) ? row('Vor-Anschrift (<3 J)', a.vorAnschrift, m.vorAnschrift) : ''}
          ${row('Bank', a.bank, m.bank)}
          ${row('IBAN', a.iban, m.iban)}
          ${row('BIC', a.bic, m.bic)}
        </tbody>
        <thead><tr><th class="sa-section-h">EINKOMMEN <span style="font-weight:normal;font-size:9px;">(monatlich, falls nicht anders angegeben)</span></th><th>ANTRAGSTELLER</th><th>${gemeinsam ? 'MITANTRAGSTELLER' : ''}</th></tr></thead>
        <tbody>
          ${row('Brutto-Gehalt', fmtNum(a.bruttoMo), fmtNum(m.bruttoMo))}
          ${row('Netto-Gehalt', fmtNum(a.nettoMo), fmtNum(m.nettoMo))}
          ${rowChk('Steuerklasse', ['I','II','III','IV','V','VI'], a.steuerklasse, m.steuerklasse)}
          ${rowChk('Anzahl Gehälter', ['12','12,5','13','14'], a.anzahlGehaelter ? String(a.anzahlGehaelter).replace('.',',') : '', m.anzahlGehaelter ? String(m.anzahlGehaelter).replace('.',',') : '')}
          ${(parseFloat(a.weihnachtsgeld)||0) > 0 || (parseFloat(m.weihnachtsgeld)||0) > 0 ? row('Weihnachtsgeld (p.a., einmalig)', fmtNum(a.weihnachtsgeld), fmtNum(m.weihnachtsgeld)) : ''}
          ${(parseFloat(a.urlaubsgeld)||0) > 0 || (parseFloat(m.urlaubsgeld)||0) > 0 ? row('Urlaubsgeld (p.a., einmalig)', fmtNum(a.urlaubsgeld), fmtNum(m.urlaubsgeld)) : ''}
          ${(parseFloat(a.variableMo)||0) > 0 || (parseFloat(m.variableMo)||0) > 0 ? row('Variable Vergütung / Boni (p.a.)', fmtNum(a.variableMo), fmtNum(m.variableMo)) : ''}
          ${(parseFloat(a.unterhaltMo)||0) > 0 || (parseFloat(m.unterhaltMo)||0) > 0 ? row('Unterhalt', fmtNum(a.unterhaltMo), fmtNum(m.unterhaltMo)) : ''}
          ${row('Kindergeld', fmtNum(a.kindergeldMo), fmtNum(m.kindergeldMo))}
          ${zusatzRows('zusatzEinnahmen', 'mo')}
          ${/* Iter 71 (21.05.2026): Mieteinnahmen aus Immobilien-Baukasten → eigene Zeilen */ ''}
          ${(() => {
            const renderImmoMieten = (liste, spalte) => {
              if (!Array.isArray(liste)) return '';
              let html = '';
              liste.forEach(immo => {
                if (!immo) return;
                const mo = parseFloat(immo.mietenMo) || 0;
                if (mo <= 0) return;
                const titel = `Miete · ${immo.art || 'Immobilie'}${immo.anschrift ? ', ' + immo.anschrift : ''}`;
                const cellA = spalte === 'A' ? fld(fmtNum(mo)) : '';
                const cellM = spalte === 'M' && gemeinsam ? fld(fmtNum(mo)) : (gemeinsam ? '' : '');
                html += `<tr><td class="sa-label">${esc(titel)}</td><td>${cellA}</td><td>${cellM}</td></tr>`;
              });
              return html;
            };
            return renderImmoMieten(a.immobilien, 'A') + (gemeinsam ? renderImmoMieten(m.immobilien, 'M') : '');
          })()}
        </tbody>
        <thead><tr><th class="sa-section-h">MONATLICHE AUSGABEN</th><th>ANTRAGSTELLER</th><th>${gemeinsam ? 'MITANTRAGSTELLER' : ''}</th></tr></thead>
        <tbody>
          ${row('Miete inkl. NK', fmtNum(a.mieteMo), fmtNum(m.mieteMo))}
          ${row('Laufende Lebenshaltung', fmtNum(a.lebenshaltungMo), fmtNum(m.lebenshaltungMo))}
          ${/* Iter 71: PKV / Leasing / Unterhaltszahlungen als Pflichtfelder raus — kommen aus Baukasten, wenn relevant */ ''}
          ${a.pkvMo || m.pkvMo ? row('Beitrag private Krankenversicherung', fmtNum(a.pkvMo), fmtNum(m.pkvMo)) : ''}
          ${a.leasingMo || m.leasingMo ? row('Leasing-Raten', fmtNum(a.leasingMo), fmtNum(m.leasingMo)) : ''}
          ${a.unterhaltZahlungMo || m.unterhaltZahlungMo ? row('Unterhaltszahlungen', fmtNum(a.unterhaltZahlungMo), fmtNum(m.unterhaltZahlungMo)) : ''}
          ${zusatzRows('zusatzAusgaben', 'mo')}
          ${zusatzRows('zusatzSparplaene', 'mo')}
        </tbody>
      </table>
      ${_footer(user)}
    </div>
  `;

  // === SEITE 2: VERMÖGEN → VERBINDLICHKEITEN → IMMOBILIEN ===
  // Iter 81 (21.05.2026): Edgar-Feedback umgesetzt.
  //   - Reihenfolge geändert: Vermögen → Verbindlichkeiten → Immobilien-Detail.
  //     Banker sieht erst die Bilanz-Übersicht, dann das Detail pro Immobilie.
  //   - Vermögens-Kategorien jetzt conditional: nur sichtbar wenn Wert > 0 ODER
  //     Baukasten-Match. Pflicht bleibt nur Bankguthaben (jeder hat ein Konto).
  //   - Doppelung Baufi/Verbindlichkeiten beseitigt: Verbindlichkeits-Tabelle zeigt
  //     NUR zusatzVerbindlichkeiten (Konsumkredite). Baufi steht im Immobilien-Block.
  const seite2 = `
    <div class="pdf-page sa-page${gemeinsam ? '' : ' single-applicant'}">
      ${_saHeader(2, 5)}
      ${bonitaetBoxHtml}
      ${(() => {
        // Klassifikation der Baukasten-Positionen nach Titel-Heuristik.
        const isBauspar = (t) => /bauspar|vwl|riester|wohn[\- ]?riester/i.test(t || '');
        const isWertpapier = (t) => /aktie|etf|fonds|depot|wertpapier|portfolio/i.test(t || '');
        const isLV = (t) => /lebensvers|rentenvers|risiko[\- ]?lv|rürup|kapitallv|ru?ckkauf/i.test(t || '');
        const isSparbuch = (t) => /sparbuch|festgeld|tagesgeld/i.test(t || '');
        const sumByPredicate = (p, pred) => {
          if (!p) return 0;
          let s = 0;
          (Array.isArray(p.zusatzVermoegen) ? p.zusatzVermoegen : []).forEach(it => {
            if (!it) return;
            const w = parseFloat(it.wert) || 0;
            if (w > 0 && pred(it.titel)) s += w;
          });
          (Array.isArray(p.zusatzSparplaene) ? p.zusatzSparplaene : []).forEach(it => {
            if (!it) return;
            const w = parseFloat(it.wert) || 0;
            if (w > 0 && pred(it.titel)) s += w;
          });
          return s;
        };
        const sonstigeListe = (p) => {
          if (!p) return [];
          const out = [];
          [...(Array.isArray(p.zusatzVermoegen) ? p.zusatzVermoegen : []),
           ...(Array.isArray(p.zusatzSparplaene) ? p.zusatzSparplaene : [])].forEach(it => {
            if (!it) return;
            const w = parseFloat(it.wert) || 0;
            if (w <= 0) return;
            const t = it.titel || '';
            if (isBauspar(t) || isWertpapier(t) || isLV(t) || isSparbuch(t)) return;
            out.push({ titel: t || 'Wertgegenstand', notiz: it.notiz, wert: w });
          });
          return out;
        };
        // Aggregierte Werte pro Kategorie (Pflichtfeld + Baukasten-Summe)
        const wpA = (parseFloat(a.wertpapiere) || 0) + sumByPredicate(a, isWertpapier);
        const wpM = (parseFloat(m.wertpapiere) || 0) + sumByPredicate(m, isWertpapier);
        const sbA = (parseFloat(a.sparbuecher) || 0) + sumByPredicate(a, isSparbuch);
        const sbM = (parseFloat(m.sparbuecher) || 0) + sumByPredicate(m, isSparbuch);
        const bsA = (parseFloat(a.bausparen) || 0) + sumByPredicate(a, isBauspar);
        const bsM = (parseFloat(m.bausparen) || 0) + sumByPredicate(m, isBauspar);
        const lvA = (parseFloat(a.lvRueckkauf) || 0) + sumByPredicate(a, isLV);
        const lvM = (parseFloat(m.lvRueckkauf) || 0) + sumByPredicate(m, isLV);
        const sonstA = sonstigeListe(a);
        const sonstM = gemeinsam ? sonstigeListe(m) : [];

        // Sonstige als Einzelzeilen rendern — Banker sieht jede Position
        const sonstRows = [];
        sonstA.forEach(it => {
          const notiz = it.notiz ? ` <span style="color:#777;font-size:9px;">— ${esc(it.notiz)}</span>` : '';
          sonstRows.push(`<tr><td class="sa-label">${esc(it.titel)}${notiz}</td><td>${fld(fmtNum(it.wert))}</td><td>${gemeinsam ? '' : ''}</td></tr>`);
        });
        if (gemeinsam) sonstM.forEach(it => {
          const notiz = it.notiz ? ` <span style="color:#777;font-size:9px;">— ${esc(it.notiz)}</span>` : '';
          sonstRows.push(`<tr><td class="sa-label">${esc(it.titel)}${notiz}</td><td></td><td>${fld(fmtNum(it.wert))}</td></tr>`);
        });

        // Iter 81: Conditional rendering — nur Kategorien zeigen, die einen Wert haben.
        const hasSparbuch = sbA > 0 || sbM > 0;
        const hasWertpapier = wpA > 0 || wpM > 0;
        const hasBauspar = bsA > 0 || bsM > 0;
        const hasLv = lvA > 0 || lvM > 0;
        const hasSonst = sonstRows.length > 0;

        return `
      <table class="sa-table">
        <thead><tr><th class="sa-section-h">VERMÖGEN</th><th>ANTRAGSTELLER</th><th>${gemeinsam ? 'MITANTRAGSTELLER' : ''}</th></tr></thead>
        <tbody>
          ${row('Bankguthaben (Giro/Tagesgeld)', fmtNum(a.bankguthaben), fmtNum(m.bankguthaben))}
          ${hasSparbuch ? row('Sparbücher / Festgeld', fmtNum(sbA || ''), fmtNum(sbM || '')) : ''}
          ${hasWertpapier ? row('Wertpapiere / Depots (Kurswert)', fmtNum(wpA || ''), fmtNum(wpM || '')) : ''}
          ${hasBauspar ? row('Bausparguthaben / VWL', fmtNum(bsA || ''), fmtNum(bsM || '')) : ''}
          ${hasLv ? row('Lebens-/Rentenvers. (Rückkaufswert)', fmtNum(lvA || ''), fmtNum(lvM || '')) : ''}
          ${hasLv && (a.lvLaufzeitBis || m.lvLaufzeitBis) ? row('— Ablauf/Auslauf', dt(a.lvLaufzeitBis), dt(m.lvLaufzeitBis)) : ''}
          ${hasSonst ? '<tr><td class="sa-label" style="font-weight:600;padding-top:6px;">Sonstige Wertgegenstände</td><td colspan="2"></td></tr>' + sonstRows.join('') : ''}
        </tbody>
      </table>`;
      })()}
      ${(() => {
        // Iter 81: NUR sonstige Verbindlichkeiten (Konsumkredite, Leasing, etc.).
        //   Immobilien-Baufi steht im Immobilien-Block darunter — keine Doppelung mehr.
        // Iter 82 (22.05.2026): Block IMMER anzeigen, auch wenn leer. Wenn keine Einträge:
        //   einzeilige Bestätigung "Keine Verbindlichkeiten erfasst" — damit der Banker
        //   sieht, dass wir die Sektion bewusst durchgegangen sind, nicht vergessen haben.
        const verbZeilen = [];
        const collect = (rolle, person) => {
          if (!person) return;
          if (Array.isArray(person.zusatzVerbindlichkeiten)) {
            person.zusatzVerbindlichkeiten.forEach(item => {
              if (!item) return;
              const mo = parseFloat(item.mo) || 0;
              const w = parseFloat(item.wert) || 0;
              if (mo === 0 && w === 0) return;
              verbZeilen.push({ rolle, titel: item.titel || 'Verbindlichkeit', notiz: item.notiz, mo, w });
            });
          }
        };
        collect('A', a);
        if (gemeinsam) collect('M', m);
        const rowsHtml = verbZeilen.length === 0
          ? `<tr><td class="sa-label" style="color:#777;font-style:italic;">Keine Konsumkredite, Leasing-Verträge oder sonstige Schulden erfasst.</td><td></td><td>${gemeinsam ? '' : ''}</td></tr>`
          : verbZeilen.map(z => {
              const notiz = z.notiz ? ` <span style="color:#777;font-size:9px;">— ${esc(z.notiz)}</span>` : '';
              const moHtml = z.mo > 0 ? fmtNum(z.mo) + '/Mo' : '';
              const wertHtml = z.w > 0 ? fmtNum(z.w) : '';
              const combined = [moHtml, wertHtml].filter(Boolean).join(' · ');
              const cellA = z.rolle === 'A' ? fld(combined) : '';
              const cellM = z.rolle === 'M' && gemeinsam ? fld(combined) : (gemeinsam ? '' : '');
              return `<tr><td class="sa-label">${esc(z.titel)}${notiz}</td><td>${cellA}</td><td>${cellM}</td></tr>`;
            }).join('');
        return `<table class="sa-table" style="margin-top:3mm;">
          <thead><tr><th class="sa-section-h">VERBINDLICHKEITEN <span style="font-weight:normal;font-size:9px;">(Konsumkredite / sonstige Schulden — Immobilien-Baufi siehe Immobilien-Block)</span></th><th>ANTRAGSTELLER</th><th>${gemeinsam ? 'MITANTRAGSTELLER' : ''}</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
      })()}
      ${(() => {
        // Iter 81 (21.05.2026): Immobilien-Detail jetzt NACH Verbindlichkeiten — Banker liest
        //   erst die Bilanz-Übersicht, dann das Detail pro Immobilie (inkl. Baufi-Block,
        //   der für jede Immobilie 1:1 sichtbar ist — also keine Doppelung zur Verbind-Liste).
        const renderImmoListe = (liste, rolle) => {
          if (!Array.isArray(liste) || liste.length === 0) return '';
          return liste.map((immo, idx) => {
            if (!immo) return '';
            const baufiVorhanden = parseFloat(immo.baufiBelastungMo) > 0 || parseFloat(immo.baufiRestsaldo) > 0 || parseFloat(immo.baufiUrspruenglich) > 0;
            return `
              <table class="sa-table" style="margin-top:3mm;">
                <thead><tr><th class="sa-section-h">IMMOBILIE ${idx + 1}${gemeinsam ? ' · ' + esc(rolle) : ''}</th><th colspan="2">${esc(immo.art || '')}${immo.anschrift ? ' · ' + esc(immo.anschrift) : ''}</th></tr></thead>
                <tbody>
                  <tr><td class="sa-label">Anschrift</td><td colspan="2">${fld(immo.anschrift || '')}</td></tr>
                  <tr><td class="sa-label">Baujahr / Erwerbsjahr</td><td colspan="2" style="white-space:nowrap;"><span style="display:inline-block;min-width:90px;">${fld(immo.baujahr || '')}</span> &nbsp;/&nbsp; <span style="display:inline-block;min-width:90px;">${fld(immo.erwerbsjahr || '')}</span></td></tr>
                  <tr><td class="sa-label">Wohnfläche (m²)</td><td colspan="2">${fld(immo.wohnflaeche || '')}</td></tr>
                  <tr><td class="sa-label">Verkehrswert</td><td colspan="2">${fld(fmtNum(immo.verkehrswert))}</td></tr>
                  <tr><td class="sa-label">Mieteinnahmen pro Monat</td><td colspan="2">${fld(fmtNum(immo.mietenMo))}</td></tr>
                  ${baufiVorhanden ? `
                    <tr><td class="sa-label" style="font-weight:600;padding-top:6px;">Baufinanzierung</td><td colspan="2"></td></tr>
                    <tr><td class="sa-label">— urspr. Darlehenshöhe</td><td colspan="2">${fld(fmtNum(immo.baufiUrspruenglich))}</td></tr>
                    <tr><td class="sa-label">— Laufzeit bis</td><td colspan="2">${fld(dt(immo.baufiLaufzeitBis))}</td></tr>
                    <tr><td class="sa-label">— mtl. Belastung</td><td colspan="2">${fld(fmtNum(immo.baufiBelastungMo))}</td></tr>
                    <tr><td class="sa-label">— Restsaldo</td><td colspan="2">${fld(fmtNum(immo.baufiRestsaldo))}</td></tr>
                  ` : ''}
                </tbody>
              </table>`;
          }).join('');
        };
        return renderImmoListe(a.immobilien, 'Antragsteller') + (gemeinsam ? renderImmoListe(m.immobilien, 'Mit-Antragsteller') : '');
      })()}
      ${(() => {
        // Iter 71: Allgemeines Notizfeld am Ende — nur rendern wenn gefüllt.
        const notA = (a.notizen || '').trim();
        const notM = gemeinsam ? (m.notizen || '').trim() : '';
        if (!notA && !notM) return '';
        return `<table class="sa-table" style="margin-top:3mm;">
          <thead><tr><th class="sa-section-h">NOTIZEN</th><th>ANTRAGSTELLER</th><th>${gemeinsam ? 'MITANTRAGSTELLER' : ''}</th></tr></thead>
          <tbody>
            <tr><td class="sa-label">Allgemein</td><td style="white-space:pre-wrap;font-size:10px;">${esc(notA)}</td><td style="white-space:pre-wrap;font-size:10px;">${gemeinsam ? esc(notM) : ''}</td></tr>
          </tbody>
        </table>`;
      })()}
      <div style="font-size:7.5px; color:#666; margin-top:1mm; font-style:italic;">Weitere Immobilien bzw. Verbindlichkeiten bitte als Anlage beifügen.</div>
      ${_footer(user)}
    </div>
  `;

  // === SEITE 3: EIGENKAPITAL FÜR DIE FINANZIERUNG ===
  // Iter 82 (22.05.2026): UI auf 6 Quellen vereinfacht (Edgar: „nicht so Wichtigste in der App").
  //   PDF zeigt entsprechend nur die 6 — alte 10er-Variante (wertpapier/immobilien/erbe/eigenleistung/darlehen)
  //   bleibt als Backward-Compat im Render, falls Altdaten existieren.
  const ek = sa.herkunftEk || {};
  const ekQuellen = [
    { k: 'ersparnisse', label: 'Eigene Ersparnisse', beleg: 'Giro / Tagesgeld / Festgeld — Kontoauszüge' },
    { k: 'schenkung', label: 'Schenkung / Erbschaft', beleg: ek.schenkGeber ? `Schenker / Erblasser: ${esc(ek.schenkGeber)}` : 'Notariell beglaubigte Urkunde / Erbschein' },
    { k: 'verkauf', label: 'Verkaufserlös (Immobilie / Wertpapiere)', beleg: ek.verkaufObjekt ? `Objekt: ${esc(ek.verkaufObjekt)}` : 'Notarieller Kaufvertrag / Verkaufsabrechnung' },
    { k: 'bauspar', label: 'Bausparvertrag (zuteilungsreif)', beleg: ek.bauspKasse ? `Kasse: ${esc(ek.bauspKasse)}` : 'Zuteilungsbescheinigung' },
    { k: 'lv', label: 'Lebens-/Rentenversicherung', beleg: ek.lvAnbieter ? `Versicherer: ${esc(ek.lvAnbieter)}` : 'Auszahlungs-/Rückkaufs-Bescheinigung' },
    { k: 'sonstiges', label: 'Sonstige Quelle', beleg: ek.sonstQuelle ? esc(ek.sonstQuelle) : 'siehe Anmerkung' },
    // Backward-Compat: Altdaten-Keys werden weiterhin gerendert, wenn gepflegt
    { k: 'wertpapier', label: 'Wertpapier-/Depot-Verkauf', beleg: 'Verkaufsabrechnung Bank/Broker' },
    { k: 'immobilien', label: 'Immobilienverkauf', beleg: 'Notarieller Kaufvertrag' },
    { k: 'erbe', label: 'Erbschaft', beleg: 'Erbschein / Testaments-Eröffnung' },
    { k: 'eigenleistung', label: 'Eigenleistung / Muskelhypothek', beleg: 'Stunden-Kalkulation als Anlage' },
    { k: 'darlehen', label: 'Arbeitgeber-/Familien-Darlehen', beleg: `Darlehensgeber: ${esc(ek.darlehGeber || '—')}` },
  ];
  // Nur aktive Quellen (Checkbox gesetzt ODER Betrag > 0)
  const aktiveQuellen = ekQuellen.filter(q =>
    ek[q.k] === true || ek[q.k] === 'ja' || (parseFloat(ek[q.k + 'Betrag']) || 0) > 0
  );
  const ekGesamt = aktiveQuellen.reduce((s, q) => s + (parseFloat(ek[q.k + 'Betrag']) || 0), 0);

  let seite3InhaltHtml;
  if (aktiveQuellen.length === 0) {
    // Fallback: kompakter Hinweis-Block mit 3 leeren handschriftlich-ausfüllbaren Zeilen
    seite3InhaltHtml = `
      <table class="sa-table">
        <thead><tr><th class="sa-section-h">EIGENKAPITAL FÜR DIE FINANZIERUNG <span style="font-weight:normal;font-size:9px;">(noch zu ergänzen)</span></th><th>QUELLE</th><th>BETRAG (€)</th></tr></thead>
        <tbody>
          <tr><td class="sa-label">${fld('')}</td><td>${fld('')}</td><td>${fld('')}</td></tr>
          <tr><td class="sa-label">${fld('')}</td><td>${fld('')}</td><td>${fld('')}</td></tr>
          <tr><td class="sa-label">${fld('')}</td><td>${fld('')}</td><td>${fld('')}</td></tr>
          <tr style="background:#FAF7F0;"><td class="sa-label" style="font-weight:700;">Gesamtes Eigenkapital</td><td style="color:#777;font-size:9px;">Summe aller Quellen</td><td>${fld('')}</td></tr>
        </tbody>
      </table>
      <div style="margin-top:4mm;font-size:9.5px;color:#777;font-style:italic;">
        Diese Sektion ist noch nicht ausgefüllt. Bitte vor Versand an die Bank ergänzen — Quellen z.B. Eigene Ersparnisse,
        Schenkung, Verkaufserlös, Bausparvertrag, Lebensversicherung, Eigenleistung.
      </div>`;
  } else {
    seite3InhaltHtml = `
      <table class="sa-table">
        <thead><tr><th class="sa-section-h">EIGENKAPITAL FÜR DIE FINANZIERUNG <span style="font-weight:normal;font-size:9px;">(Mittelherkunft nach § 8 GwG)</span></th><th>QUELLE / BELEG</th><th>BETRAG (€)</th></tr></thead>
        <tbody>
          ${aktiveQuellen.map(q =>
            `<tr><td class="sa-label">${esc(q.label)}</td><td><span class="sa-chk on">☑</span> ${q.beleg}</td><td>${fld(fmtNum(parseFloat(ek[q.k + 'Betrag']) || ''))}</td></tr>`
          ).join('')}
          <tr style="background:#FAF7F0;"><td class="sa-label" style="font-weight:700;">Gesamtes Eigenkapital</td><td style="color:#777;font-size:9px;">Summe aller Quellen</td><td style="font-weight:700;">${ekGesamt > 0 ? fmtNum(ekGesamt) : fld('')}</td></tr>
        </tbody>
      </table>`;
  }

  const seite3 = `
    <div class="pdf-page sa-page">
      ${_saHeader(3, 5)}
      ${seite3InhaltHtml}

      <div style="margin-top:5mm;font-size:10.5px;line-height:1.5;">
        <strong>Anmerkungen zur Mittelherkunft</strong> <span style="color:#777;font-size:9px;">(z.B. Schenker, Verkaufsobjekt, Verkaufsjahr, Erbsfall-Datum, andere Banken-relevante Hinweise)</span>:
      </div>
      <div style="border:1px solid #999;min-height:18mm;margin-top:2mm;padding:3mm;font-size:10.5px;white-space:pre-wrap;">${esc(ek.erlaeuterung || '')}</div>

      <div style="margin-top:6mm;font-size:9.5px;color:#555;line-height:1.45;">
        <strong>Hinweis:</strong> Banken/Sparkassen sind nach § 8 i.V.m. § 10 GwG (Geldwäschegesetz) verpflichtet, die Herkunft des
        eingesetzten Eigenkapitals zu prüfen. Die hier gemachten Angaben dienen der Vor-Identifizierung;
        die finanzierende Bank kann ergänzende Belege (Kontoauszüge, Verträge, Steuerbescheide) anfordern.
        Mit Unterschrift unter dieser Selbstauskunft (Seite 5) versichere ich/versichern wir, dass die Mittel
        legal erworben wurden und nicht aus illegalen Quellen stammen.
      </div>
      ${_footer(user)}
    </div>
  `;

  // === SEITE 4: ERKLÄRUNGEN I–III (1:1 aus Hypovision, B&B-Wortlaut) ===
  const seite4_legal_I_III = `
    <div class="pdf-page sa-page sa-legal">
      ${_saHeader(4, 5)}
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

  // === SEITE 5: ERKLÄRUNGEN IV–VI + UNTERSCHRIFT ===
  const seite5_legal_IV_VI = `
    <div class="pdf-page sa-page sa-legal">
      ${_saHeader(5, 5)}
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
          <div class="sig-line"><span class="sig-tag">[signature:Antragsteller____]</span></div>
          <div class="sig-meta">Ort, Datum &middot; Unterschrift Antragsteller</div>
          <div class="sig-meta sig-tag" style="margin-top:1mm;">[date:Antragsteller____]</div>
        </div>
        ${gemeinsam ? `
        <div class="sig-col">
          <div class="sig-line"><span class="sig-tag">[signature:Mitantragsteller____]</span></div>
          <div class="sig-meta">Ort, Datum &middot; Unterschrift Mitantragsteller</div>
          <div class="sig-meta sig-tag" style="margin-top:1mm;">[date:Mitantragsteller____]</div>
        </div>` : '<div></div>'}
      </div>
      ${_footer(user)}
    </div>
  `;

  // Iter 84 (22.05.2026): Body-Builder gibt den Concat-HTML-String zurück.
  //   - selbstauskunft(kunde, user) ist der Browser-Print-Wrapper (siehe unten)
  //   - selbstauskunftHtmlForPandaDoc(kunde, user) liefert ein komplettes HTML-Doc
  //     mit Inline-CSS für PandaDoc-Upload via Puppeteer.
  return seite1 + seite2 + seite3 + seite4_legal_I_III + seite5_legal_IV_VI;
}

// Browser-Print-Wrapper — behält die bestehende API window.PDF.selbstauskunft().
function selbstauskunft(kunde, user) {
  const body = _buildSelbstauskunftBody(kunde, user);
  _doPrint(body, 'sa', _filenameHint('Selbstauskunft', kunde, {}));
}

// PandaDoc-HTML-Builder: kompletter HTML-Document mit Inline-CSS, fertig zum Upload.
// Wird vom Backend-Endpoint /api/sa/send-for-signature an Puppeteer übergeben.
function selbstauskunftHtmlForPandaDoc(kunde, user) {
  const body = _buildSelbstauskunftBody(kunde, user);
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Selbstauskunft</title>
<style>${_SA_INLINE_CSS}</style>
</head>
<body class="pdf-mode pdf-mode-sa">
<div id="pdf-template" class="pdf-template">${body}</div>
</body>
</html>`;
}

// Inline-CSS für PandaDoc-Render. Untermenge aus styles.css — alle Regeln die für
// die SA-PDF-Darstellung wirklich gebraucht werden. Wird beim Backend-Upload ins HTML
// eingebettet, weil PandaDoc kein externes CSS fetched.
// SA-Redesign (22.05.2026):
//  - Schwarzer Header-Streifen → Cream-Background + Bronze-Border-Top, schwarzer Text
//  - Header-Underline → Bronze 1.5px statt Schwarz 0.3px
//  - Tabellen-Borders 0.3px → 0.5px (Print-Sicherheit auf SW-Laser bei 600dpi)
//  - Footer auf JEDER Seite (war: nur letzte)
//  - Bei Einzel-Antragsteller: .single-applicant ↦ leere M-Spalte ausblenden
//  - Bonitäts-Box auf Seite 2 oben (3 Zellen: Einnahmen / Ausgaben / Saldo)
const _SA_INLINE_CSS = `
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1B1B1B; margin: 0; padding: 0; background: #fff; }
  .pdf-template { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #fff; color: #1B1B1B; font-size: 11px; line-height: 1.4; }
  .pdf-page.sa-page { padding: 14mm 12mm 14mm 12mm; position: relative; page-break-after: auto; }
  .pdf-page.sa-page.sa-legal { page-break-before: always; }
  /* Iter 85: page-break-inside: avoid für sa-table ENTFERNT — Persönliche-Verhältnisse-Tabelle ist größer als A4. */
  .sa-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 7mm; padding-bottom: 4mm; border-bottom: 1.5px solid #B08A4D; }
  .sa-head .sa-logo { height: 10mm !important; width: auto !important; max-width: 55mm; display: block; }
  .sa-head .sa-title-block { text-align: right; line-height: 1.15; }
  .sa-title { font-size: 12px; font-weight: 500; letter-spacing: 2px; color: #1B1B1B; text-transform: uppercase; }
  .sa-title .sa-title-sub { font-weight: 300; font-size: 9px; letter-spacing: 2.5px; margin-left: 2mm; color: #B08A4D; }
  .sa-page-num { font-size: 8px; font-weight: 300; color: #888; letter-spacing: 1.5px; margin-top: 2mm; text-transform: uppercase; }
  .sa-table { width: 100%; border-collapse: collapse; margin: 0; }
  .sa-table thead tr th { background: #FAF7F0; color: #1B1B1B; padding: 3.5mm 3mm 3mm 3mm; font-size: 9.5px; font-weight: 600; text-align: left; letter-spacing: 1.5px; text-transform: uppercase; border-top: 1.5px solid #B08A4D; border-bottom: 0.5px solid #1B1B1B; }
  .sa-table thead tr th .section-sub { font-weight: 400; font-size: 8.5px; color: #777; letter-spacing: 0.3px; text-transform: none; margin-left: 2mm; }
  .sa-table tbody tr td { padding: 2.5mm 3mm; font-size: 10px; border-bottom: 0.5px solid #D6D6D6; vertical-align: top; }
  .sa-table tbody tr td.sa-label { color: #555; width: 32%; font-weight: 400; }
  .sa-table tbody tr:last-child td { border-bottom: none; }
  .sa-section-h { font-weight: 700; }
  /* Einzel-Antragsteller: leere Mit-Spalte ausblenden, mehr Platz für A-Spalte */
  .pdf-page.sa-page.single-applicant .sa-table tbody tr td.sa-label { width: 38%; }
  .pdf-page.sa-page.single-applicant .sa-table tbody tr td:nth-child(2) { width: 62%; }
  .pdf-page.sa-page.single-applicant .sa-table tbody tr td:nth-child(3),
  .pdf-page.sa-page.single-applicant .sa-table thead tr th:nth-child(3) { display: none; }
  .sa-fld { display: inline-block; min-width: 40mm; padding: 0; border: 0; }
  .sa-fld-filled { font-weight: 500; color: #1B1B1B; }
  input.sa-fld { border-bottom: 0.5px solid #1B1B1B; }
  .sa-chk { display: inline-block; font-size: 11px; line-height: 1; }
  .sa-chk.on { font-weight: 700; }
  /* Bonitäts-Box (NEU, oben Seite 2) — Banker findet seinen Saldo sofort */
  .sa-bonitaet-box { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; background: #FAF7F0; border-left: 3px solid #B08A4D; padding: 4mm 5mm; margin-bottom: 4mm; }
  .sa-bonitaet-cell { display: flex; flex-direction: column; gap: 1mm; }
  .sa-bonitaet-label { font-size: 8px; text-transform: uppercase; letter-spacing: 1.2px; color: #777; font-weight: 500; }
  .sa-bonitaet-value { font-size: 14px; font-weight: 600; color: #1B1B1B; letter-spacing: -0.2px; }
  .sa-bonitaet-value.saldo-positiv { color: #1B1B1B; }
  .sa-bonitaet-value.saldo-negativ { color: #8E2C2C; }
  .sa-bonitaet-note { font-size: 8px; color: #888; margin-bottom: 6mm; font-style: italic; letter-spacing: 0.2px; }
  .footer-note { font-size: 9px; color: #777; margin-top: 4mm; line-height: 1.4; }
  /* Footer: auf JEDER Seite — Banker erwartet Vertriebler + Datum auf jedem Blatt */
  .pdf-footer { padding: 4mm 12mm 3mm 12mm; border-top: 0.5px solid #B08A4D; font-size: 7px; font-weight: 300; color: #777; letter-spacing: 0.2px; display: grid; grid-template-columns: 1fr auto 1fr; gap: 8mm; align-items: center; background: #fff; margin-top: 8mm; }
  .pdf-footer .pdf-footer-l { text-align: left; }
  .pdf-footer .pdf-footer-c { text-align: center; }
  .pdf-footer .pdf-footer-r { text-align: right; }
  .sa-page .pdf-footer { display: grid; }
  .legal-h { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 5mm 0 2mm; color: #1B1B1B; }
  .legal-h .roman { color: #B08A4D; font-weight: 700; margin-right: 2mm; }
  .legal-p { font-size: 9px; line-height: 1.45; text-align: justify; margin: 0 0 3mm; color: #1B1B1B; }
  .sa-sigblock { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 14mm; }
  .sa-sigblock .sig-col { display: flex; flex-direction: column; }
  .sa-sigblock .sig-line { border-bottom: 0.5px solid #000; min-height: 10mm; padding: 2mm 0; }
  .sa-sigblock .sig-meta { font-size: 8.5px; color: #555; margin-top: 1mm; }
  /* Iter 87 (22.05.2026): Tag-Farbe = Hintergrund-Weiß (unsichtbar im finalen Doc). */
  .sa-sigblock .sig-tag { color: #ffffff; font-size: 9px; user-select: none; }
`;

window.PDF = { investitionsrechnung, reservierung, selbstauskunft, selbstauskunftHtmlForPandaDoc };
