// Reine Funktionen für den Assistenten — kein Netz, voll testbar.

function formatKontext(kontext) {
  if (!kontext || typeof kontext !== 'object') {
    return 'Aktueller Bildschirm-Kontext: keiner (der Vertriebler hat gerade nichts Konkretes offen).';
  }
  const zeilen = [];
  if (kontext.view) zeilen.push(`Ansicht: ${kontext.view}`);
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
  if (!zeilen.length) return 'Aktueller Bildschirm-Kontext: keiner.';
  return 'Aktueller Bildschirm-Kontext:\n' + zeilen.join('\n');
}

const ROLLE = `Du bist der Assistent der B&B-Backstube-App und hilfst Vertrieblern. Du bist klug, denkst aktiv mit und gibst hilfreiche, konkrete Antworten.
Regeln:
- Nutze dein Allgemeinwissen frei (Immobilien, Finanzierung, Steuer-Grundlagen, Vertrieb, Verhandlung) und kombiniere es mit dem B&B-Fachwissen unten und dem Live-Kontext. Sei kein Erbsenzähler, der ständig "weiß ich nicht" sagt.
- Für B&B-spezifische Zahlen nutze die Werte aus dem Live-Kontext (Eingaben + berechnete Ergebnisse). Fehlt eine konkrete Zahl, rechne/erkläre sie nachvollziehbar aus den vorhandenen Werten her oder sag, welche Angabe fehlt — aber erfinde keine konkrete B&B-Zahl frei.
- Bei Steuer/Recht: gib gern Orientierung, weise aber darauf hin, dass es eine Modell-Einschätzung ist, keine verbindliche Steuer-/Rechtsberatung.
- Antworte auf Deutsch, in der Du-Form, klar und so kurz wie möglich / so ausführlich wie nötig. Markdown (Fett, Listen) ist erlaubt.`;

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
