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
//   vermietet:        bool — laufender Mietvertrag vorhanden? Steuert NUR die Miet-Herkunft,
//                     NICHT mehr den Kaufpreis (Edgar 28.06.2026: der Kaufpreis zählt IMMER,
//                     der Käufer kauft den Stellplatz mit — auch bei Leerstand).
//   neuStellplatzIds: string[] — Stellplatz-IDs aus "NEU: Vermieteter Stellplatz" der AKTIVEN Verträge
//   altStellplatzIds: string[] — Stellplatz-IDs aus der Stellplatz->WE-Verknüpfung
//   stpById:          { [id]: { titel, typ, kaufpreis, mieteMo } } — Stellplatz-Datensätze
//   vertragMieteFallback: number — Summe alte Vertrags-Stellplatzmiete (Fallback nur bei vermietet)
//   stellplatzMieteBeiVerkauf: number — angenommene Stellplatzmiete €/Mo aus den Kalk-Stammdaten
//                     (Pendant zu "Miete bei Verkauf" der Wohnung). Wenn >0, gewinnt sie immer —
//                     bei Leerstand die einzige Mietquelle.
// Rückgabe-Form ist identisch zur bisherigen API (anzahl/garageCount/flaecheCount/kaufpreisSumme/mieteMoSumme/mieteMoQuelle/details),
// damit das Frontend unverändert bleibt.
function aggregateStellplaetze({ vermietet, neuStellplatzIds, altStellplatzIds, stpById, vertragMieteFallback, stellplatzMieteBeiVerkauf }) {
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

  // --- Miete bestimmen ---
  // Edgar 28.06.2026: Die angenommene "Stellplatz-Miete bei Verkauf" aus den Kalk-Stammdaten
  // hat IMMER Vorrang (wenn >0) — analog zu "Miete bei Verkauf" bei der Wohnung. Bei Leerstand
  // (kein laufender Vertrag) ist das die einzige Mietquelle.
  // Sonst (vermietet, kein Annahme-Feld): Stellplatz-Mietkosten haben Vorrang (= NEU-Rollup-Logik);
  // ist dort nichts gepflegt, Fallback auf die alte Vertrags-Stellplatzmiete (Iter-46-Prinzip),
  // damit während der Migration nichts auf 0 springt.
  const mbvStp = (typeof stellplatzMieteBeiVerkauf === 'number' && isFinite(stellplatzMieteBeiVerkauf) && stellplatzMieteBeiVerkauf > 0)
    ? stellplatzMieteBeiVerkauf : 0;
  const fb = (typeof vertragMieteFallback === 'number' && isFinite(vertragMieteFallback)) ? vertragMieteFallback : 0;

  let mieteMoSumme, mieteMoQuelle;
  if (mbvStp > 0 && details.length) {
    // Annahme-Miete nur, wenn überhaupt ein Stellplatz existiert (details.length>0).
    // Sonst entstünde eine Phantom-Miete auf 0 Stellplätzen (Pflegefehler: Feld gesetzt,
    // aber kein Stellplatz verlinkt) — die in Cashflow/IRR einfließt. Review-Fund 28.06.2026.
    mieteMoSumme = mbvStp;
    mieteMoQuelle = 'miete-bei-verkauf';
  } else if (vermietet) {
    mieteMoSumme = mieteStellplatz > 0 ? mieteStellplatz : fb;
    mieteMoQuelle = mieteStellplatz > 0 ? quelleBasis : (fb > 0 ? 'vertrag-alt' : 'keine');
  } else {
    // Leerstand ohne (greifende) Annahme: Kaufpreis zählt (oben), aber keine Miete.
    // details.length (= anzahl), nicht ids.length, damit die Quelle zur tatsächlich
    // gefundenen Stellplatz-Menge passt (Orphan-IDs ohne Datensatz zählen nicht).
    mieteMoSumme = 0;
    mieteMoQuelle = details.length ? 'leer-keine-miete' : 'leer';
  }

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
