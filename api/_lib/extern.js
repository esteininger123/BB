// Externer Vertrieb — Provisions-Preislogik (06.07.2026, Henry).
//
// Externe Vertriebler (Rolle 'Extern') sehen in der App NIE den internen Abgabepreis,
// sondern immer den Kundenpreis nach ihrem selbst gewählten Provisionssatz (0–7 %).
// Die Transformation passiert SERVERSEITIG in allen drei Preis-Endpoints
// (/api/wohneinheiten, /api/stammdaten, /api/stammdaten/[weId]) — damit sind alle
// Frontend-Stellen (Picker, WE-Liste, Kalkulator, PDF, Snapshots) automatisch konsistent.
//
// Formel (Henry, 06.07.2026):
//   Extern-Abgabepreis Wohnung = interner Wohnungs-KP × (1 − 2 %)   ← Externe kaufen 2 % günstiger ein
//                                                                     (Stellplätze/Garagen bleiben unrabattiert)
//   Basis      = Extern-Abgabepreis + Stellplatz/Garagen-KP          ← Provision rechnet auf den GESAMT-Abgabepreis
//   Aufschlag  = Satz × Basis                                        ← landet aber NUR auf dem Wohnungspreis
//   Kundenpreis Wohnung = Extern-Abgabepreis + Aufschlag
//   Beispiel: Wohnung intern 100.000 + Stellplatz 10.000, 7 %:
//             Extern-Abgabepreis 98.000 → 7 % von 108.000 = 7.560 → Wohnung 105.560, Stellplatz bleibt 10.000.
// Der 2-%-Rabatt ist rein serverseitig — Externe sehen immer nur IHREN Abgabepreis,
// nie den internen. (Der frühere 1-%-Verhandlungsspielraum wurde am 06.07.2026 auf
// Henrys Wunsch komplett entfernt — „verwirrt nur".)

const { airtable, listAll } = require('./airtable');
const { TABLES, VERTRIEBLER_FIELDS, STELLPLATZ_FIELDS, MIETVERTRAG_FIELDS, KALK_STAMMDATEN_FIELDS, WE_FIELDS } = require('./tables');
const { isExtern } = require('./auth');
const { linkIds, dedupe } = require('./stellplatz');

const PROVISION_MAX = 0.07;   // 7 % — Standard-Obergrenze des Reglers
// 11.11.2026 (Henry/Christoph Zinnbauer): Pro Vertriebler kann die Obergrenze angehoben werden (Kalk-Vertriebler
// „Provision max extern“, z. B. 0.10 = 10 %). Gilt NUR für diesen Zugang, alle anderen bleiben bei 7 %.
// PROVISION_MAX_ABSOLUT ist die harte Decke für dieses Feld (Tippfehler-Schutz, 1.0 statt 0.10).
const PROVISION_MAX_ABSOLUT = 0.15;
// 02.11.2026 (Henry): Provision Externer ist FEST 7 %. Nur Zugänge mit Kalk-Vertriebler-Haken „Provision frei
// wählbar" (Sparkasse Freiburg) dürfen den Satz 0–7 % selbst einstellen. Grund: Extern-Kundenpreise sollen
// nicht unter das Niveau der Partnerkanäle (Betongold/Immoheld) rutschen. Sonderkonditionen bleiben unberührt.
const PROVISION_FIX = 0.07;
// Provisionssatz aus dem Vertriebler-Record: fest 7 %, außer der Haken „Provision frei wählbar" ist gesetzt.
// Rückgabe { provisionFrei, provisionMax, provisionPct } — provisionMax ist die persönliche Regler-Obergrenze.
function provisionAusRecord(f) {
  const frei = !!(f || {})[VERTRIEBLER_FIELDS.PROVISION_FREI];
  const max = provisionMaxAusRecord(f);
  return { provisionFrei: frei, provisionMax: max, provisionPct: frei ? clampProvision((f || {})[VERTRIEBLER_FIELDS.PROVISION_EXTERN], max) : PROVISION_FIX };
}
// 11.11.2026: persönliche Obergrenze aus „Provision max extern“; leer/ungültig/über der harten Decke → Standard 7 %.
function provisionMaxAusRecord(f) {
  const n = parseFloat((f || {})[VERTRIEBLER_FIELDS.PROVISION_MAX]);
  if (!isFinite(n) || n <= 0 || n > PROVISION_MAX_ABSOLUT + 1e-9) return PROVISION_MAX;
  return Math.round(n * 10000) / 10000;
}
const EXTERN_RABATT = 0.02;   // 06.07.2026 (Henry): Abgabepreis Wohnung für Externe 2 % unter intern
// 04.10.2026 (Henry): Pro Einheit kann stattdessen ein eigener Abschlag gelten (Kalk-Stammdaten
// „Extern-Abschlag %"), z.B. 3,57 % = die Vertriebsleistung, die B&B beim Eigenverkauf ansetzt.
// Basis ist dann der GESAMT-Kaufpreis (Wohnung + Stellflächen) — wie bei der 3,57-%-Regel —,
// abgezogen wird er vom Wohnungspreis. Obergrenze als Tippfehler-Schutz (0,357 statt 0,0357).
const EXTERN_ABSCHLAG_MAX = 0.15;
// 29.10.2026 (Henry/Felix Sziedat): Sonderkonditionen für Exklusiv-Einheiten (Kalk-Vertriebler
// „Exklusiv-Aufschlag" / „Exklusiv-Provision"). Obergrenze als Tippfehler-Schutz (1.0 statt 0.10).
const SONDER_AUFSCHLAG_MAX = 0.25;

// Gültiger Einheiten-Abschlag als Dezimalwert oder null (= Standard-Rabatt greift).
function clampAbschlag(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  // 24.10.2026 (Henry/Kitzingen): explizit 0 % in Airtable = KEIN Extern-Rabatt (Abgabepreis = interner
  // Kaufpreis, z. B. Kitzingen: Vertriebsliste 3.000/3.300 €/m² soll nicht um 2 % unterschritten werden).
  // Leeres Feld (undefined/NaN) bleibt null = Standard-Rabatt EXTERN_RABATT.
  if (!isFinite(n) || n < 0 || n > EXTERN_ABSCHLAG_MAX) return null;
  return n;
}

// Normalisiert einen Provisionssatz: Dezimalwert 0…max (Standard 0.07), auf 4 Nachkommastellen
// (= 0,01-%-Punkte) gerundet. Ungültiges → 0 (= Abgabepreis, sicherster Fall).
// 11.11.2026: max = persönliche Obergrenze des Vertrieblers (provisionMaxAusRecord), nie über PROVISION_MAX_ABSOLUT.
function clampProvision(v, max) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!isFinite(n) || n <= 0) return 0;
  const m = (typeof max === 'number' && isFinite(max) && max > 0) ? Math.min(max, PROVISION_MAX_ABSOLUT) : PROVISION_MAX;
  return Math.min(Math.round(n * 10000) / 10000, m);
}

// 29.10.2026 (Henry/Felix Sziedat): Sonderkonditionen eines Externen aus seinem Kalk-Vertriebler-Record.
// Gültig nur mit Aufschlag > 0. Die angezeigte Provision ist nie höher als der Aufschlag; fehlt sie,
// wird der Aufschlag als Provision angezeigt. Rückgabe { aufschlag, provisionPct } oder null.
function sonderKonditionen(vertrieblerFields) {
  const f = vertrieblerFields || {};
  const a = parseFloat(f[VERTRIEBLER_FIELDS.EXKLUSIV_AUFSCHLAG]);
  if (!isFinite(a) || a <= 0 || a > SONDER_AUFSCHLAG_MAX) return null;
  const aufschlag = Math.round(a * 10000) / 10000;
  const p = parseFloat(f[VERTRIEBLER_FIELDS.EXKLUSIV_PROVISION]);
  const provisionPct = (isFinite(p) && p >= 0) ? Math.min(Math.round(p * 10000) / 10000, aufschlag) : aufschlag;
  return { aufschlag, provisionPct };
}

// true, wenn die Einheit zum EIGENEN Exklusiv-Kontingent des Externen gehört und er Sonderkonditionen hat.
function istSonderEinheit(stammFields, session, sonder) {
  if (!sonder || !session || !session.vertrieblerId) return false;
  return externExklusivIds(stammFields).includes(session.vertrieblerId);
}

// Rechnet den Extern-Kundenpreis für eine WE. Reine Funktion, keine IO.
// kpWohnung = INTERNER Abgabepreis der Wohnung — der 2-%-Extern-Rabatt wird hier abgezogen.
// abschlagPct (optional) = Einheiten-Abschlag aus den Kalk-Stammdaten: ersetzt die 2 % durch
// abschlag × (Wohnung + Stellplatz), abgezogen vom Wohnungspreis.
// sonder (optional, 29.10.2026) = Sonderkonditionen für die eigene Exklusiv-Einheit: der Kundenpreis
// steigt um sonder.aufschlag × Basis (statt um den Regler-Satz), `aufschlag` in der Rückgabe ist dann
// die ANGEZEIGTE Provision in € (sonder.provisionPct × Basis) — der volle Aufschlag wird nicht ausgegeben.
function externPreis(kpWohnung, stellplatzKp, provisionPct, abschlagPct, sonder) {
  const kpIntern = (typeof kpWohnung === 'number' && isFinite(kpWohnung)) ? kpWohnung : 0;
  const stpl = (typeof stellplatzKp === 'number' && isFinite(stellplatzKp)) ? stellplatzKp : 0;
  const abschlag = clampAbschlag(abschlagPct);
  // Abgabepreis für Externe (der Stellplatzpreis selbst bleibt immer unverändert)
  const kpExtern = abschlag != null
    ? Math.max(0, Math.round(kpIntern - abschlag * (kpIntern + stpl)))
    : Math.round(kpIntern * (1 - EXTERN_RABATT));
  const basis = kpExtern + stpl;
  if (sonder && isFinite(sonder.aufschlag) && sonder.aufschlag > 0) {
    const preisAufschlag = Math.round(sonder.aufschlag * basis);
    return {
      provisionPct: sonder.provisionPct,
      aufschlag: Math.round(sonder.provisionPct * basis), // angezeigte Provision in €
      kp: kpExtern + preisAufschlag,                      // Kundenpreis NUR Wohnung
      sonder: true,
    };
  }
  // 11.11.2026: Der Satz kommt immer schon pro Vertriebler gekappt an (provisionAusRecord / PATCH /api/me);
  // hier gilt nur noch die harte Decke, damit ein 10-%-Zugang nicht wieder auf 7 % zurückfällt.
  const prov = clampProvision(provisionPct, PROVISION_MAX_ABSOLUT);
  const aufschlag = Math.round(prov * basis);      // = Brutto-Provision des Externen in €
  return {
    provisionPct: prov,
    aufschlag,
    kp: kpExtern + aufschlag,                      // Kundenpreis NUR Wohnung
  };
}

// 29.10.2026: Provisionssatz + Sonderkonditionen des eingeloggten Externen in EINEM Airtable-Zugriff.
// Wird pro Request in der Session gecacht (ladeExternProfil füllt denselben Cache) — nicht über
// Requests hinweg, die DB bleibt die Wahrheit. Nicht-Externe / Fehler → { 0, null }.
async function loadExternKonditionen(session) {
  const leer = { provisionPct: PROVISION_FIX, provisionFrei: false, provisionMax: PROVISION_MAX, sonder: null }; // 02.11.2026: Fehlerfall = 7 %, nie Abgabepreis
  if (!isExtern(session) || !session.vertrieblerId) return leer;
  if (session._konditionen) return session._konditionen;
  try {
    const rec = await airtable('get', TABLES.VERTRIEBLER, { recordId: session.vertrieblerId });
    const f = (rec && rec.fields) || {};
    session._konditionen = Object.assign(provisionAusRecord(f), { sonder: sonderKonditionen(f) }); // 02.11.2026: fest 7 % außer „frei wählbar"
    return session._konditionen;
  } catch (e) {
    return leer;
  }
}

// Lädt den gespeicherten Provisionssatz des eingeloggten Externen aus Airtable.
// Nicht-Externe / Fehler → 0 (= Abgabepreis; den kennt der Externe ohnehin als 0-%-Preis).
async function loadProvisionPct(session) {
  return (await loadExternKonditionen(session)).provisionPct;
}

// Stellplatz/Garagen-KP-Summe pro WE für die LISTE (/api/wohneinheiten), die selbst
// keine Stellplatz-Daten lädt. Gleiche Verknüpfungslogik wie stammdaten/index.js:
// Vereinigung aus NEU-Feld der nicht-archivierten Mietverträge + alter WE-Verknüpfung,
// dedupe gegen Doppelzählung. Kaufpreis zählt IMMER (auch Leerstand, Edgar 28.06.2026).
async function ladeStellplatzKpSummen() {
  const [stplRecs, vertragRecs] = await Promise.all([
    listAll(TABLES.STELLPLATZ, {
      fields: [STELLPLATZ_FIELDS.WE_LINK, STELLPLATZ_FIELDS.KAUFPREIS],
    }, 5000),
    listAll(TABLES.MIETVERTRAG, {
      fields: [MIETVERTRAG_FIELDS.WE_LINK, MIETVERTRAG_FIELDS.NEU_VERMIETETER_STELLPLATZ, MIETVERTRAG_FIELDS.STATUS_LOOKUP],
    }, 5000),
  ]);

  const kpById = {};
  const altByWe = {};
  stplRecs.forEach(r => {
    const f = r.fields || {};
    const kp = parseFloat(f[STELLPLATZ_FIELDS.KAUFPREIS]);
    kpById[r.id] = isFinite(kp) ? kp : 0;
    linkIds(f[STELLPLATZ_FIELDS.WE_LINK]).forEach(weId => {
      (altByWe[weId] = altByWe[weId] || []).push(r.id);
    });
  });

  const neuByWe = {};
  vertragRecs.forEach(r => {
    const f = r.fields || {};
    const sl = f[MIETVERTRAG_FIELDS.STATUS_LOOKUP];
    const slName = Array.isArray(sl) ? ((sl[0] && sl[0].name) || sl[0]) : ((sl && sl.name) || sl);
    if (typeof slName === 'string' && /archiv/i.test(slName)) return;
    const stpIds = linkIds(f[MIETVERTRAG_FIELDS.NEU_VERMIETETER_STELLPLATZ]);
    if (!stpIds.length) return;
    linkIds(f[MIETVERTRAG_FIELDS.WE_LINK]).forEach(weId => {
      (neuByWe[weId] = neuByWe[weId] || []).push(...stpIds);
    });
  });

  const summen = {};
  new Set(Object.keys(altByWe).concat(Object.keys(neuByWe))).forEach(weId => {
    const ids = dedupe((neuByWe[weId] || []).concat(altByWe[weId] || []));
    // Orphan-IDs ohne Stellplatz-Datensatz zählen 0 — identisch zu aggregateStellplaetze.
    summen[weId] = ids.reduce((s, id) => s + (kpById[id] || 0), 0);
  });
  return summen;
}

// 04.10.2026 (Henry) — Exklusiv-Kontingente für Externe.
// Sichtbarkeitsregel einer Einheit (Kalk-Stammdatensatz, auch Varianten) für die Rolle Extern:
//   1. Haken „Extern freigegeben" fehlt            → niemand Externes sieht sie
//   2. „Extern exklusiv für" leer                  → alle Externen sehen sie
//   3. „Extern exklusiv für" gepflegt              → nur die verknüpften Vertriebler
// Alle Extern-Filter (Liste, Detail, Batch, Reservierung) laufen über externDarfSehen(),
// damit die Regel nirgends auseinanderläuft.
function externExklusivIds(stammFields) {
  return dedupe(linkIds((stammFields || {})[KALK_STAMMDATEN_FIELDS.EXTERN_EXKLUSIV]));
}

// 28.10.2026 (Henry/Sparkasse Freiburg): Kalk-Vertriebler „Nur Exklusiv-Einheiten" (session.nurExklusiv)
//   → dieser Externe sieht ausschließlich Einheiten, bei denen er in „Extern exklusiv für" steht;
//     allgemein freigegebene Einheiten (Exklusiv leer) bleiben für ihn unsichtbar.
//   Das Flag kommt aus dem Login-JWT und wird pro Request über ladeExternProfil() aus Airtable
//   aufgefrischt (DB = Wahrheit, nicht das 7-Tage-Cookie).
function externDarfSehen(stammFields, session) {
  const f = stammFields || {};
  if (!f[KALK_STAMMDATEN_FIELDS.EXTERN_FREIGABE]) return false;
  if (session && session.externKontrolle) return true; // 28.10.2026: Kontroll-Account sieht alles Freigegebene
  const exklusiv = externExklusivIds(f);
  if (exklusiv.length === 0) return !(session && session.nurExklusiv);
  return !!(session && session.vertrieblerId && exklusiv.includes(session.vertrieblerId));
}

// Frischt session.nurExklusiv aus dem Kalk-Vertriebler-Record auf (nur Rolle Extern). Bei Airtable-
// Fehler bleibt der Wert aus dem JWT stehen. Gibt die Session zurück (mutiert in place).
async function ladeExternProfil(session) {
  if (!isExtern(session) || !session.vertrieblerId) return session;
  try {
    const rec = await airtable('get', TABLES.VERTRIEBLER, { recordId: session.vertrieblerId });
    if (rec && rec.fields) {
      session.nurExklusiv = !!rec.fields[VERTRIEBLER_FIELDS.NUR_EXKLUSIV];
      session.externKontrolle = !!rec.fields[VERTRIEBLER_FIELDS.EXTERN_KONTROLLE];
      session.nurObjekte = dedupe(linkIds(rec.fields[VERTRIEBLER_FIELDS.NUR_OBJEKTE])); // 02.11.2026: Objekt-Filter
      session.nurEinheiten = dedupe(linkIds(rec.fields[VERTRIEBLER_FIELDS.NUR_EINHEITEN])); // 11.11.2026: Einheiten-Filter
      // 29.10.2026: Provision + Sonderkonditionen gleich mitnehmen (spart den zweiten Airtable-Get)
      session._konditionen = Object.assign(provisionAusRecord(rec.fields), { sonder: sonderKonditionen(rec.fields) }); // 02.11.2026
    }
  } catch (e) { /* JWT-Wert bleibt */ }
  return session;
}

// 02.11.2026 (Henry): Objekt-Filter des Externen („Nur Objekte" im Kalk-Vertriebler, über ladeExternProfil in
// session.nurObjekte). Leer = alles erlaubt; sonst muss das Objekt der WE (WE_FIELDS.PROJEKT) in der Liste stehen.
// 11.11.2026 (Henry/Christoph Zinnbauer): plus Einheiten-Filter („Nur Einheiten", session.nurEinheiten, WE-Record-IDs).
// Gesetzt → nur diese WEs; ohne übergebene weId kann nicht geprüft werden → gesperrt (sicherer Fall). Beide Filter
// schränken nur den EIGENEN Blick ein — andere Externe sehen die Einheiten weiterhin (anders als „Extern exklusiv für").
function externDarfObjekt(weFields, session, weId) {
  if (!isExtern(session)) return true;
  const nur = (session && session.nurObjekte) || [];
  if (nur.length > 0 && !linkIds((weFields || {})[WE_FIELDS.PROJEKT]).some(id => nur.includes(id))) return false;
  const nurWe = (session && session.nurEinheiten) || [];
  if (nurWe.length > 0 && !(weId && nurWe.includes(weId))) return false;
  return true;
}

// true, wenn die Einheit extern freigegeben UND einem Exklusiv-Kontingent zugeordnet ist
// (Kennzeichnung „exklusiv" in Listen — ohne Freigabe sieht sie extern ohnehin niemand).
function hatExklusivKontingent(stammFields) {
  const f = stammFields || {};
  return !!f[KALK_STAMMDATEN_FIELDS.EXTERN_FREIGABE] && externExklusivIds(f).length > 0;
}

// Namen der Vertriebler zu einer ID-Liste (für den internen „Exklusiv: …"-Hinweis).
// Fehler → leere Map (der Hinweis zeigt dann nur „Exklusiv" ohne Namen).
async function ladeVertrieblerNamen(ids) {
  const liste = dedupe(ids || []);
  if (liste.length === 0) return {};
  try {
    const recs = await listAll(TABLES.VERTRIEBLER, { fields: [VERTRIEBLER_FIELDS.NAME] }, 500);
    const namen = {};
    recs.forEach(r => { if (liste.includes(r.id)) namen[r.id] = (r.fields && r.fields[VERTRIEBLER_FIELDS.NAME]) || ''; });
    return namen;
  } catch (e) {
    return {};
  }
}

module.exports = {
  PROVISION_MAX, PROVISION_MAX_ABSOLUT, PROVISION_FIX, provisionAusRecord, provisionMaxAusRecord, EXTERN_RABATT, EXTERN_ABSCHLAG_MAX, clampProvision, clampAbschlag, externPreis, loadProvisionPct, ladeStellplatzKpSummen,
  externExklusivIds, externDarfSehen, hatExklusivKontingent, ladeVertrieblerNamen, ladeExternProfil,
  SONDER_AUFSCHLAG_MAX, sonderKonditionen, istSonderEinheit, loadExternKonditionen, externDarfObjekt,
};
