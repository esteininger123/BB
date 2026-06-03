// Reine Funktionen für den Assistenten — kein Netz, voll testbar.

function standortLabel(view, tab) {
  if (view === 'dashboard') return 'Dashboard / Startseite';
  if (view === 'we-liste') return 'Wohneinheiten-Liste (Vertrieb)';
  if (view === 'admin') return 'Admin-Bereich';
  if (view === 'login') return 'Login-Seite';
  if (view === 'kunde') {
    const tabs = { uebersicht: 'Übersicht', kalkulator: 'Kalkulator / Investitionsanalyse', selbstauskunft: 'Selbstauskunft', snapshots: 'gespeicherte Berechnungen (Snapshots)' };
    return 'Kundenseite · Tab: ' + (tabs[tab] || tab || 'Übersicht');
  }
  return view || 'unbekannt';
}

function formatKontext(kontext) {
  if (!kontext || typeof kontext !== 'object') {
    return 'Aktueller Bildschirm-Kontext: keiner (der Vertriebler hat gerade nichts Konkretes offen).';
  }
  const zeilen = [];
  zeilen.push(`Aktueller Bereich/Seite des Vertrieblers: ${standortLabel(kontext.view, kontext.tab)}`);
  if (kontext.kunde && kontext.kunde.name) {
    const phase = kontext.kunde.phase ? ` (Phase: ${kontext.kunde.phase})` : '';
    zeilen.push(`Offener Kunde: ${kontext.kunde.name}${phase}`);
  }
  if (kontext.kalkulation && typeof kontext.kalkulation === 'object') {
    let kalk;
    try { kalk = JSON.stringify(kontext.kalkulation); } catch { kalk = '(nicht darstellbar)'; }
    zeilen.push(`Offene Kalkulation (Eingabewerte): ${kalk}`);
  }
  if (kontext.ergebnis && typeof kontext.ergebnis === 'object') {
    let erg;
    try { erg = JSON.stringify(kontext.ergebnis); } catch { erg = '(nicht darstellbar)'; }
    zeilen.push(`Berechnete Ergebnisse (echte Zahlen — nutze diese): ${erg}`);
  }
  if (Array.isArray(kontext.cashflowProJahr)) {
    let cf;
    try { cf = JSON.stringify(kontext.cashflowProJahr); } catch { cf = '(nicht darstellbar)'; }
    zeilen.push(`Cashflow-Verlauf pro Jahr J1–J10 (€, nutze diese): ${cf}`);
  }
  if (Array.isArray(kontext.vermoegenProJahr)) {
    let vm;
    try { vm = JSON.stringify(kontext.vermoegenProJahr); } catch { vm = '(nicht darstellbar)'; }
    zeilen.push(`Vermögensentwicklung pro Jahr J0–J10 (€): ${vm}`);
  }
  if (kontext.bonitaet && typeof kontext.bonitaet === 'object') {
    let b;
    try { b = JSON.stringify(kontext.bonitaet); } catch { b = '(nicht darstellbar)'; }
    zeilen.push(`Bonität/Selbstauskunft des Kunden (ausgewertet): ${b}`);
  }
  if (kontext.weDaten && typeof kontext.weDaten === 'object') {
    let w;
    try { w = JSON.stringify(kontext.weDaten); } catch { w = '(nicht darstellbar)'; }
    zeilen.push(`Wohneinheit-Stammdaten (Klartext): ${w}`);
  }
  if (Array.isArray(kontext.snapshots) && kontext.snapshots.length) {
    let sn;
    try { sn = JSON.stringify(kontext.snapshots); } catch { sn = '(nicht darstellbar)'; }
    zeilen.push(`Frühere Snapshots dieses Kunden: ${sn}`);
  }
  if (Array.isArray(kontext.pipeline) && kontext.pipeline.length) {
    let p;
    try { p = JSON.stringify(kontext.pipeline); } catch { p = '(nicht darstellbar)'; }
    zeilen.push(`Pipeline — andere Kunden (Phase + letzte Aktivität): ${p}`);
  }
  if (kontext.notizen) zeilen.push(`Notizen/Profil zum offenen Kunden: ${kontext.notizen}`);
  if (!zeilen.length) return 'Aktueller Bildschirm-Kontext: keiner.';
  return 'Aktueller Bildschirm-Kontext:\n' + zeilen.join('\n');
}

const ROLLE = `Du heißt Zipf und bist „der Helfer in der Backstube" für die Vertriebler der B&B Immo. Nenne dich NICHT „Assistent" — du bist Zipf, ihr Helfer. Stellst du dich vor: „Ich bin Zipf, dein Helfer in der Backstube."

So antwortest du:
- ERKLÄRE SO EINFACH, dass es auch ein 14-Jähriger sofort versteht: kurze Sätze, Alltagssprache, anschauliche Vergleiche. Jeden Fachbegriff (IRR, AfA, Annuität, Cashflow, Restschuld, Bruttorendite …) in einem Halbsatz mit-erklären, nie unkommentiert stehen lassen.
- Trotzdem VOLLSTÄNDIG: betrachte das Gesamtbild und führ die Rechenlogik Schritt für Schritt nachvollziehbar vor — welche Zahl kommt woher und wie hängen sie zusammen. Lieber eine Stufe mehr erklären als eine zu wenig.
- Nutze dein Allgemeinwissen frei + das Fachwissen unten + den Live-Kontext. Sei kein Erbsenzähler, der vorschnell "weiß ich nicht" sagt.
- Für B&B-Zahlen die echten Werte aus dem Live-Kontext nehmen; fehlt eine, nachvollziehbar herleiten oder sagen, was fehlt — keine konkrete B&B-Zahl frei erfinden.
- Steuer/Recht: gern Orientierung, aber Hinweis, dass es eine Modell-Einschätzung ist, keine verbindliche Beratung.
- FORMATIERUNG schlicht und chat-tauglich (der Chat ist schmal!): kurze Absätze und einfache Aufzählungen mit "- ". KEINE Tabellen, KEINE Überschriften (## ), KEINE Zitatblöcke (> ). **Fett** nur für Schlüsselzahlen/Begriffe.
- Deutsch, Du-Form.`;

function buildAssistentRequest({ brief, kontext, verlauf, frage }) {
  const systemText = ROLLE + '\n\n# Fachwissen\n' + (brief || '');
  const system = [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }];

  const vorherige = Array.isArray(verlauf) ? verlauf.slice(-10) : [];
  const kontextText = formatKontext(kontext);
  const letzte = {
    role: 'user',
    content: `${kontextText}\n\n---\nFrage des Vertrieblers: ${frage || ''}`
  };
  return { system, messages: [...vorherige, letzte] };
}

module.exports = { formatKontext, buildAssistentRequest, ROLLE };
