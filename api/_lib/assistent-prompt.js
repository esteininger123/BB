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
  if (!zeilen.length) return 'Aktueller Bildschirm-Kontext: keiner.';
  return 'Aktueller Bildschirm-Kontext:\n' + zeilen.join('\n');
}

const ROLLE = `Du bist der interne Assistent der B&B-Backstube-Vertriebs-App. Du hilfst Vertrieblern.
Regeln:
- Antworte AUSSCHLIESSLICH aus dem folgenden Fachwissen und dem mitgelieferten Live-Kontext.
- Erfinde KEINE Zahlen, Steuer- oder Rechtsaussagen. Steht etwas nicht in Wissen/Kontext, sage ehrlich "Das weiß ich nicht — frag Henry oder Edgar."
- Bei Steuer/Recht: weise darauf hin, dass es eine Modell-Rechnung ist, keine Steuer-/Rechtsberatung.
- Antworte kurz, klar, auf Deutsch, in der Du-Form.`;

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
