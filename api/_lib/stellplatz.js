// Stellplatz-Aggregat nach der NEU-Logik (Review/Edgar 04.06.2026).
//
// Quelle der Wahrheit = der STELLPLATZ-Datensatz selbst (Kaufpreis + Mietkosten).
// Verknüpfung primär über den aktiven Mietvertrag ("NEU: Vermieteter Stellplatz"),
// Fallback auf die alte Stellplatz->WE-Verknüpfung (solange noch nicht migriert).
// Leer (kein aktiver Mietvertrag) => KEIN Stellplatz in der Kalkulation.
//
// Diese Datei hält die Logik EINMAL — beide Endpoints (stammdaten/index.js = Liste,
// stammdaten/[weId].js = Detail) rufen sie auf, damit sie nicht auseinanderlaufen.

// Extrahiert Record-IDs aus einem Airtable-Link/Lookup-Feldwert. Robust gegen die
// drei Formen, die die API liefern kann: ["recXXX"], [{id,name}], {linkedRecordIds:[...]}.
function linkIds(v) {
  if (!v) return [];
  let arr = v;
  if (!Array.isArray(v) && typeof v === 'object' && Array.isArray(v.linkedRecordIds)) arr = v.linkedRecordIds;
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => (x && typeof x === 'object' && x.id) ? x.id : x).filter(Boolean);
}

function dedupe(arr) { return Array.from(new Set(arr || [])); }

// Aggregiert die Stellplätze einer WE.
//   vermietet:        bool — false => leer => keine Stellplätze (Edgar-Entscheidung)
//   neuStellplatzIds: string[] — Stellplatz-IDs aus "NEU: Vermieteter Stellplatz" der AKTIVEN Verträge
//   altStellplatzIds: string[] — Stellplatz-IDs aus der alten Stellplatz->WE-Verknüpfung (Fallback)
//   stpById:          { [id]: { titel, typ, kaufpreis, mieteMo } } — Stellplatz-Datensätze
//   vertragMieteFallback: number — Summe alte Vertrags-Stellplatzmiete (nur wenn keine Stellplatz-Mietkosten gepflegt)
// Rückgabe-Form ist identisch zur bisherigen API (anzahl/garageCount/flaecheCount/kaufpreisSumme/mieteMoSumme/mieteMoQuelle/details),
// damit das Frontend unverändert bleibt.
function aggregateStellplaetze({ vermietet, neuStellplatzIds, altStellplatzIds, stpById, vertragMieteFallback }) {
  if (!vermietet) {
    return { anzahl: 0, garageCount: 0, flaecheCount: 0, kaufpreisSumme: 0, mieteMoSumme: 0, mieteMoQuelle: 'leer', details: [] };
  }
  // Henry-Bug 28.06.2026 (Marktheidenfeld 5A): VEREINIGUNG statt Entweder/Oder.
  // Vorher: `neu.length ? neu : alt` — sobald EIN Stellplatz im Mietvertrag-NEU-Feld
  // hing (typisch: die migrierte Garage), wurde die komplette alte WE-Verknüpfung
  // ignoriert. Folge: ein zusätzlich über die WE verlinkter Stellplatz (Henrys neue
  // "Fläche") wurde verschluckt — aber NUR bei Einheiten, die schon eine Garage im
  // NEU-Feld hatten. Einheiten ohne Garage zeigten die Fläche korrekt (alt-Fallback),
  // genau das Muster aus Henrys Meldung. dedupe() verhindert, dass ein in BEIDEN
  // Feldern hängender Stellplatz doppelt zählt.
  const neu = dedupe(neuStellplatzIds);
  const alt = dedupe(altStellplatzIds);
  const ids = dedupe(neu.concat(alt));
  const quelleBasis = neu.length ? (alt.some((id) => !neu.includes(id)) ? 'mietvertrag-neu+we-link' : 'mietvertrag-neu') : 'we-link-alt';

  let kaufpreisSumme = 0, mieteStellplatz = 0, garageCount = 0, flaecheCount = 0;
  const details = [];
  ids.forEach((id) => {
    const s = stpById && stpById[id];
    if (!s) return;
    const kp = (typeof s.kaufpreis === 'number' && isFinite(s.kaufpreis)) ? s.kaufpreis : 0;
    const mk = (typeof s.mieteMo === 'number' && isFinite(s.mieteMo)) ? s.mieteMo : 0;
    kaufpreisSumme += kp;
    mieteStellplatz += mk;
    if (/garage/i.test(s.typ || '')) garageCount++; else flaecheCount++;
    details.push({ id, titel: s.titel || '', typ: s.typ || '', kaufpreis: kp, mieteMo: mk });
  });

  // Miete: Stellplatz-Mietkosten haben Vorrang (= NEU-Rollup-Logik). Wenn dort GAR NICHTS
  // gepflegt ist, fällt es auf die alte Vertrags-Stellplatzmiete zurück, damit während der
  // Migration nichts auf 0 springt (Iter-46-Prinzip, jetzt auf die NEU-Stellplatzmenge bezogen).
  const fb = (typeof vertragMieteFallback === 'number' && isFinite(vertragMieteFallback)) ? vertragMieteFallback : 0;
  const mieteMoSumme = mieteStellplatz > 0 ? mieteStellplatz : fb;
  const mieteMoQuelle = mieteStellplatz > 0 ? quelleBasis : (fb > 0 ? 'vertrag-alt' : 'keine');

  return {
    anzahl: details.length,
    garageCount,
    flaecheCount,
    kaufpreisSumme,
    mieteMoSumme,
    mieteMoQuelle,
    details,
  };
}

module.exports = { aggregateStellplaetze, linkIds, dedupe };
