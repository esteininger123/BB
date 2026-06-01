/* rechenblatt.js — Excel-artige Detail-Ansicht aller Kalkulations-Zahlen.
 *
 * Zweck: Der Vertriebler kann mit dem Kunden die Zahlen Zeile für Zeile durchgehen.
 * Reine Zahlen + Berechnungs-Herkunft. KEINE Story, KEIN Verkaufstext.
 * NICHT Teil des Investitions-Reports — eigener Tab, druckbar + CSV-Download.
 *
 * Nutzt ausschließlich state.kalk (Inputs) + state.kalkResult (recalc-Output).
 * Kein Backend-Call.
 */
(function () {
  'use strict';

  // ---- Formatter ----
  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur = (v) => (v == null || !isFinite(v)) ? '—' : nf0.format(Math.round(v)) + ' €';
  const eurMo = (v) => (v == null || !isFinite(v)) ? '—' : nf0.format(Math.round(v)) + ' €/Mo';
  const pct = (v, d = 2) => (v == null || !isFinite(v)) ? '—' : (v * 100).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
  const qm = (v) => (v == null || !isFinite(v)) ? '—' : nf0.format(Math.round(v)) + ' €/m²';
  const num = (v, u = '') => (v == null || !isFinite(v)) ? '—' : nf2.format(v) + (u ? ' ' + u : '');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- Datenstruktur aufbauen ----
  function build(kunde, i, r, user) {
    i = i || {};
    r = r || {};
    const cf = Array.isArray(r.cf) ? r.cf : [];
    const verm = Array.isArray(r.vermoegen) ? r.vermoegen : [];
    const jahre = [];
    for (let y = 1; y <= 10; y++) jahre.push(y);

    const weLabel = (i._weLabel || i._weBezeichnung || (i._weId ? 'WE ' + i._weId : '')) || '';

    // Einzel-Block-Zeilen: { label, wert(formatiert), formel }
    const eingaben = [
      ['Kaufpreis Wohnung', eur(i.kaufpreis), 'notariell vereinbart'],
      ['Kaufpreis Stellplatz', eur(i.stellplatzKp), 'notariell vereinbart'],
      ['Wohnfläche', num(i.qm, 'm²'), 'aus Objektdaten'],
      ['Kaltmiete', eurMo(i.kaltmiete), 'Tag-1-Bestandsmiete (MbV)'],
      ['Stellplatzmiete', eurMo(i.stellplatzMiete), 'falls vermietet'],
      ['Zins p.a.', pct(i.zins), 'aktuelles Bank-Angebot'],
      ['Tilgung p.a.', pct(i.tilgung), 'Standard 1 %, anpassbar'],
      ['KNK mitfinanziert', i.knkMitfinanziert ? 'ja' : 'nein', 'bestimmt EK-Bedarf'],
      ['Steuersatz (Grenz)', pct(i.steuersatz), 'persönlich / aus Selbstauskunft'],
      ['AfA-Satz', pct(i.afaSatz), i.afaSatz > 0.025 ? 'Restnutzungsdauer-Gutachten' : 'Standard 2 % linear (§7 EStG)'],
      ['Wertsteigerung p.a.', pct(i.wertsteigerung), 'Vorsichts-Default 3 %'],
      ['Hausgeld', eurMo(i.hausgeld), 'aus Hausverwaltung'],
      ['Mietverwaltung', eurMo(i.mietverwaltung), 'lfd. Bewirtschaftung'],
      ['Hausverwaltung (sonst.)', eurMo(i.hausverwaltung), 'optional'],
      ['Marktmiete', qm(i.marktmieteEurQm), 'Mietspiegel-Cap (§558 BGB)'],
      ['Marktwert', qm(i.marktwertProQm), 'für Vermögensbasis'],
    ];

    const investition = [
      ['Kaufpreis gesamt', eur(r.kpGesamt), 'Wohnung + Stellplatz'],
      ['Kaufnebenkosten (KNK)', eur(r.knk), 'GrESt (Bundesland) + Notar 1,5 % + Grundbuch 0,5 %'],
      ['Gesamtinvestition', eur(r.investitionGesamt), 'Kaufpreis gesamt + KNK'],
      ['Eigenkapital-Bedarf', eur(r.ekBedarf), i.knkMitfinanziert ? '0 € — KNK mitfinanziert' : '= KNK'],
      ['Darlehen', eur(r.darlehen), i.knkMitfinanziert ? 'Gesamtinvestition' : 'Kaufpreis gesamt (100 %)'],
      ['AfA-Bemessung', eur(r.afaBemessungBetrag), 'Gebäudeanteil der Anschaffungskosten'],
      ['AfA / Jahr', eur(r.afaJahr), 'AfA-Bemessung × AfA-Satz'],
    ];

    const monatlich = [
      ['Annuität', eurMo(r.annuityMo), 'Darlehen × (Zins + Tilgung) / 12'],
      ['Belastung gesamt', eurMo(r.belastungMo), 'Annuität + Hausgeld eff.'],
      ['Hausgeld effektiv', eurMo(r.hausgeldEffMo), 'Hausgeld + Mietverwaltung + Hausverwaltung'],
      ['Mietsubvention (Summe)', eur(r.mietsubventionGesamt), 'B&B-Glättung über Subv-Phasen'],
      ['Steuervorteil Jahr 1', eurMo(r.stVorteilJ1Mo), 'steuerl. Verlust × Steuersatz / 12'],
      ['Steuervorteil Jahr 5', eurMo(r.stVorteilJ5Mo), 'sinkt mit fallenden Zinsen'],
      ['Steuervorteil Jahr 10', eurMo(r.stVorteilJ10Mo), ''],
    ];

    const kennzahlen = [
      ['IRR (Eigenkapitalrendite)', pct(r.irr), 'interner Zinsfuß auf EK-Cashflow-Reihe'],
      ['Bruttorendite', pct(r.bruttorendite), 'Tag-1-Miete inkl. Subv × 12 / Kaufpreis gesamt'],
      ['Kaufpreis €/m² (Wohnung)', qm(r.kaufpreisWohnungProQm), 'Kaufpreis Wohnung / m²'],
      ['Miete €/m²', qm(r.mieteWohnungProQm), 'Kaltmiete / m²'],
      ['Vermögen brutto Jahr 10', eur(r.vermoegenBrutto10), 'Immobilienwert − Restschuld + kum. CF'],
      ['Vermögen netto Jahr 10', eur(r.vermoegenNetto10), 'nach fiktiven Verkaufskosten'],
      ['Markteinkaufsvorteil', eur(r.markteinkaufVorteil), 'Marktwert − Kaufpreis'],
    ];

    // 10-Jahres-Projektion: Zeilen mit Werte-Array
    const projZeilen = [
      ['Miete', 'cf[y].mieteJahr', jahre.map((y) => eur(cf[y - 1] && cf[y - 1].mieteJahr))],
      ['Zinsen', 'cf[y].zinsenJahr', jahre.map((y) => eur(cf[y - 1] && cf[y - 1].zinsenJahr))],
      ['Tilgung', 'cf[y].tilgungJahr', jahre.map((y) => eur(cf[y - 1] && cf[y - 1].tilgungJahr))],
      ['Annuität', 'Zinsen + Tilgung', jahre.map((y) => eur(cf[y - 1] && cf[y - 1].annuJahr))],
      ['Hausgeld', 'cf[y].hgJahr', jahre.map((y) => eur(cf[y - 1] && cf[y - 1].hgJahr))],
      ['AfA', 'cf[y].afaJahr', jahre.map((y) => eur(cf[y - 1] && cf[y - 1].afaJahr))],
      ['Steuervorteil', 'steuerl. Verlust × Steuersatz', jahre.map((y) => eur(cf[y - 1] && cf[y - 1].stVorteilJahr))],
      ['Cashflow vor Steuer', 'Miete − Zinsen − Tilgung − Hausgeld (ohne Steuervorteil)', jahre.map((y) => { const c = cf[y - 1]; return eur(c ? (c.cfJahr - (c.stVorteilJahr || 0)) : null); })],
      ['Cashflow nach Steuer', 'Cashflow vor Steuer + Steuervorteil', jahre.map((y) => eur(cf[y - 1] && cf[y - 1].cfJahr))],
      ['Restschuld', 'Darlehen − kum. Tilgung', jahre.map((y) => eur(cf[y - 1] && cf[y - 1].restschuld))],
      ['Immobilienwert', 'Startwert × (1 + Wertsteigerung)^y', jahre.map((y) => eur(verm[y] && verm[y].wert))],
      ['Vermögen brutto', 'Wert − Restschuld + kum. CF', jahre.map((y) => eur(verm[y] && verm[y].vermoegenBrutto))],
      ['Vermögen netto', 'nach fiktiven Verkaufskosten', jahre.map((y) => eur(verm[y] && verm[y].vermoegenNetto))],
    ];

    // Monatsansicht (Team-Feedback 2026-06-01): dieselben FLUSS-Größen je Jahr ÷ 12 —
    // „so sieht ein Monat des Jahres aus". Bestandsgrößen (Restschuld, Immobilienwert,
    // Vermögen) entfallen bewusst — Stichtagswerte lassen sich nicht durch 12 teilen.
    const moVal = (v) => (v == null || !isFinite(v)) ? null : v / 12;
    const projZeilenMonat = [
      ['Miete', 'cf[y].mieteJahr ÷ 12', jahre.map((y) => eur(cf[y - 1] ? moVal(cf[y - 1].mieteJahr) : null))],
      ['Zinsen', 'cf[y].zinsenJahr ÷ 12', jahre.map((y) => eur(cf[y - 1] ? moVal(cf[y - 1].zinsenJahr) : null))],
      ['Tilgung', 'cf[y].tilgungJahr ÷ 12', jahre.map((y) => eur(cf[y - 1] ? moVal(cf[y - 1].tilgungJahr) : null))],
      ['Annuität', '(Zinsen + Tilgung) ÷ 12', jahre.map((y) => eur(cf[y - 1] ? moVal(cf[y - 1].annuJahr) : null))],
      ['Hausgeld', 'cf[y].hgJahr ÷ 12', jahre.map((y) => eur(cf[y - 1] ? moVal(cf[y - 1].hgJahr) : null))],
      ['AfA', 'cf[y].afaJahr ÷ 12', jahre.map((y) => eur(cf[y - 1] ? moVal(cf[y - 1].afaJahr) : null))],
      ['Steuervorteil', '(steuerl. Verlust × Steuersatz) ÷ 12', jahre.map((y) => eur(cf[y - 1] ? moVal(cf[y - 1].stVorteilJahr) : null))],
      ['Cashflow vor Steuer', '(Miete − Zinsen − Tilgung − Hausgeld) ÷ 12', jahre.map((y) => { const c = cf[y - 1]; return eur(c ? moVal(c.cfJahr - (c.stVorteilJahr || 0)) : null); })],
      ['Cashflow nach Steuer', 'cf[y].cfJahr ÷ 12', jahre.map((y) => eur(cf[y - 1] ? moVal(cf[y - 1].cfJahr) : null))],
    ];

    return {
      meta: {
        kunde: (kunde && (kunde.name || [kunde.vorname, kunde.nachname].filter(Boolean).join(' '))) || '—',
        we: weLabel || '—',
        vertriebler: (user && user.name) || '—',
        datum: new Date().toLocaleString('de-DE'),
        engine: r.engineVersion || '—',
      },
      bloecke: [
        { titel: 'A — Eingaben', zeilen: eingaben },
        { titel: 'B — Investition', zeilen: investition },
        { titel: 'C — Monatliche Größen', zeilen: monatlich },
        { titel: 'E — Kennzahlen', zeilen: kennzahlen },
      ],
      projektion: { jahre, zeilen: projZeilen, monat: projZeilenMonat },
    };
  }

  // ---- CSV (Semikolon, UTF-8 BOM → öffnet in deutschem Excel) ----
  function toCsv(d) {
    const sep = ';';
    const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const lines = [];
    lines.push(q('Rechenblatt — ' + d.meta.we));
    lines.push([q('Kunde'), q(d.meta.kunde)].join(sep));
    lines.push([q('Vertriebler'), q(d.meta.vertriebler)].join(sep));
    lines.push([q('Stand'), q(d.meta.datum)].join(sep));
    lines.push([q('Engine'), q(d.meta.engine)].join(sep));
    lines.push('');

    d.bloecke.forEach((b) => {
      lines.push(q(b.titel));
      lines.push([q('Position'), q('Wert'), q('Berechnung / Herkunft')].join(sep));
      b.zeilen.forEach((z) => lines.push([q(z[0]), q(z[1]), q(z[2])].join(sep)));
      lines.push('');
    });

    // Projektion
    lines.push(q('D — 10-Jahres-Projektion'));
    lines.push([q('Position'), ...d.projektion.jahre.map((y) => q('Jahr ' + y)), q('Berechnung')].join(sep));
    d.projektion.zeilen.forEach((z) => {
      lines.push([q(z[0]), ...z[2].map((v) => q(v)), q(z[1])].join(sep));
    });

    // Projektion pro Monat (Jahreswert ÷ 12)
    if (d.projektion.monat && d.projektion.monat.length) {
      lines.push('');
      lines.push(q('D2 — Projektion pro Monat (Jahreswert ÷ 12)'));
      lines.push([q('Position'), ...d.projektion.jahre.map((y) => q('Jahr ' + y)), q('Berechnung')].join(sep));
      d.projektion.monat.forEach((z) => {
        lines.push([q(z[0]), ...z[2].map((v) => q(v)), q(z[1])].join(sep));
      });
    }

    return '﻿' + lines.join('\r\n'); // BOM für Umlaute in Excel
  }

  // ---- HTML für den neuen Tab ----
  function renderHtml(d) {
    const blockHtml = (b) => `
      <section class="blk">
        <h2>${esc(b.titel)}</h2>
        <table>
          <thead><tr><th>Position</th><th class="r">Wert</th><th>Berechnung / Herkunft</th></tr></thead>
          <tbody>
            ${b.zeilen.map((z) => `<tr><td>${esc(z[0])}</td><td class="r mono">${esc(z[1])}</td><td class="f">${esc(z[2])}</td></tr>`).join('')}
          </tbody>
        </table>
      </section>`;

    const projHead = `<tr><th>Position</th>${d.projektion.jahre.map((y) => `<th class="r">J ${y}</th>`).join('')}<th>Berechnung</th></tr>`;
    const projBody = d.projektion.zeilen.map((z) => `
      <tr><td>${esc(z[0])}</td>${z[2].map((v) => `<td class="r mono">${esc(v)}</td>`).join('')}<td class="f">${esc(z[1])}</td></tr>`).join('');
    const projBodyMonat = (d.projektion.monat || []).map((z) => `
      <tr><td>${esc(z[0])}</td>${z[2].map((v) => `<td class="r mono">${esc(v)}</td>`).join('')}<td class="f">${esc(z[1])}</td></tr>`).join('');

    const csv = toCsv(d);
    const csvB64 = btoa(unescape(encodeURIComponent(csv)));
    const fname = ('Rechenblatt_' + (d.meta.we || 'WE')).replace(/[^a-zA-Z0-9_-]/g, '_') + '.csv';

    return `<!DOCTYPE html><html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rechenblatt — ${esc(d.meta.we)}</title>
<style>
  :root { --cream:#FBFAF7; --bronze:#B08A4D; --ink:#2a2a28; --soft:#6b6b63; --line:#e4ded2; }
  * { box-sizing:border-box; }
  body { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; color:#2a2a28; background:#FBFAF7; margin:0; padding:0; font-size:14px; line-height:1.45; }
  .wrap { max-width:1100px; margin:0 auto; padding:24px 20px 80px; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; border-bottom:2px solid #B08A4D; padding-bottom:14px; margin-bottom:8px; flex-wrap:wrap; }
  .head h1 { margin:0 0 4px; font-size:20px; letter-spacing:-0.01em; }
  .meta { font-size:12.5px; color:#6b6b63; }
  .meta b { color:#2a2a28; font-weight:600; }
  .toolbar { display:flex; gap:10px; }
  .btn { background:#B08A4D; color:#fff; border:none; padding:10px 16px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; display:inline-block; }
  .btn.ghost { background:#fff; color:#B08A4D; border:1px solid #B08A4D; }
  .blk { margin-top:22px; }
  .blk h2 { font-size:12px; text-transform:uppercase; letter-spacing:0.07em; color:#6b6b63; margin:0 0 8px; font-weight:700; }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #e4ded2; border-radius:8px; overflow:hidden; }
  th, td { text-align:left; padding:7px 11px; border-bottom:1px solid #f0ebe0; font-size:13px; }
  th { background:#f6f1e8; font-size:11.5px; text-transform:uppercase; letter-spacing:0.04em; color:#6b6b63; font-weight:700; }
  td.r, th.r { text-align:right; }
  td.mono { font-variant-numeric:tabular-nums; font-weight:600; white-space:nowrap; }
  td.f { color:#8a8478; font-size:12px; }
  tr:last-child td { border-bottom:none; }
  .proj { overflow-x:auto; }
  .proj table { min-width:880px; }
  .hint { margin-top:26px; font-size:11.5px; color:#9a9488; border-top:1px solid #e4ded2; padding-top:12px; }
  @media print {
    .toolbar { display:none; }
    body { background:#fff; font-size:11px; }
    .wrap { padding:0; max-width:none; }
    .blk { page-break-inside:avoid; }
    table { border-radius:0; }
  }
</style></head><body>
<div class="wrap">
  <div class="head">
    <div>
      <h1>Rechenblatt</h1>
      <div class="meta">
        <b>${esc(d.meta.we)}</b> · Kunde: <b>${esc(d.meta.kunde)}</b><br>
        Vertriebler: ${esc(d.meta.vertriebler)} · Stand: ${esc(d.meta.datum)} · Engine ${esc(d.meta.engine)}
      </div>
    </div>
    <div class="toolbar">
      <button class="btn" onclick="window.print()">Drucken / PDF</button>
      <a class="btn ghost" download="${esc(fname)}" href="data:text/csv;charset=utf-8;base64,${csvB64}">Als Excel (CSV)</a>
    </div>
  </div>

  ${blockHtml(d.bloecke[0])}
  ${blockHtml(d.bloecke[1])}
  ${blockHtml(d.bloecke[2])}

  <section class="blk proj">
    <h2>D — 10-Jahres-Projektion</h2>
    <table>
      <thead>${projHead}</thead>
      <tbody>${projBody}</tbody>
    </table>
  </section>

  <section class="blk proj">
    <h2>D2 — Projektion pro Monat <span style="text-transform:none;font-weight:400;color:#9a9488;">(Jahreswert ÷ 12)</span></h2>
    <table>
      <thead>${projHead}</thead>
      <tbody>${projBodyMonat}</tbody>
    </table>
  </section>

  ${blockHtml(d.bloecke[3])}

  <div class="hint">
    Reine Rechenübersicht zur internen Durchsicht. Keine Anlageberatung, kein Bestandteil der Investitionsanalyse.
    Alle Werte aus der aktuellen Kalkulation (Engine ${esc(d.meta.engine)}).
  </div>
</div>
</body></html>`;
  }

  // ---- Public ----
  function open(kunde, kalk, result, user) {
    if (!result || !kalk) {
      alert('Keine fertige Kalkulation — bitte erst eine Wohneinheit kalkulieren.');
      return;
    }
    const data = build(kunde, kalk, result, user);
    const html = renderHtml(data);
    const w = window.open('', '_blank');
    if (!w) {
      alert('Popup wurde blockiert. Bitte Popups für diese Seite erlauben.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  window.Rechenblatt = { open, _build: build, _toCsv: toCsv };
})();
