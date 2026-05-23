// GET /api/stammdaten/:weId — kombinierte Stammdaten für eine Wohneinheit:
//   - Wohneinheit (KP, qm, Kaltmiete, Lage)
//   - Verknüpfte Stellplätze (Kaufpreis + Miete aus altem Stellplatz-Feld ODER aus Mietvertrag)
//   - Aktive Kalkulations-Stammdaten-Zeile (Status=Aktiv), falls vorhanden
//
// PUT /api/stammdaten/:weId — Update oder Create der Kalkulations-Stammdaten für diese WE
//   - Body: { status, hausverwaltung, hausgeldRuecklage, mietverwaltungDefault,
//              mietzuschuss, mietzuschussMonate, afaGutachten, wertsteigerung,
//              vermietungsModus, kappungsgrenze, indexmiete, notizen }
//   - Wenn schon ein Aktiv-Datensatz existiert: dieser wird aktualisiert.
//   - Wenn nur Entwurf existiert: dieser wird aktualisiert.
//   - Wenn keiner existiert: neuer wird angelegt mit Quelle = 'App-Edit {Datum}'.
//   - Beim Setzen von status=Aktiv wird ein anderer Aktiv-Datensatz für dieselbe WE auf Archiviert
//     gesetzt (Schutz vor Doppel-Aktiv).
//   - Nur Admins dürfen schreiben.

const { verifySession, requireSafeOrigin } = require('../_lib/auth');
const { airtable, listAll } = require('../_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const {
  TABLES,
  WE_FIELDS,
  STELLPLATZ_FIELDS,
  MIETVERTRAG_FIELDS,
  KALK_STAMMDATEN_FIELDS,
  KALK_STATUS_AKTIV,
  KALK_STATUS_ARCHIV,
} = require('../_lib/tables');

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}

function firstStringFromLink(v) {
  if (!Array.isArray(v) || v.length === 0) return null;
  const x = v[0];
  if (x && typeof x === 'object' && x.id) return x.id;
  if (typeof x === 'string') return x;
  return null;
}

// Liefert das Stellplatz-Datenobjekt für die App (kombiniert).
async function loadStellplaetzeForWE(weId) {
  try {
    // Audit-Notiz Iter 49 (19.05.2026): serverseitiger Filter über filterByFormula auf
    // RECORD_ID() des verknüpften WE-Links wäre der saubere Weg — Airtable's
    // filterByFormula referenziert Felder aber über Field-NAMEN, nicht Field-IDs.
    // Die Field-Namen werden im Code nicht geführt (würden Drift verursachen wenn umbenannt).
    // Bis ein Mapping (oder ein Reverse-Lookup auf der WE-Tabelle) ergänzt ist, bleibt der
    // clientseitige Filter. Skalierungsrisiko vermerkt im Backlog (§7/§8 QA-Report).
    const recs = await listAll(TABLES.STELLPLATZ, {
      fields: [
        STELLPLATZ_FIELDS.TITEL,
        STELLPLATZ_FIELDS.WE_LINK,
        STELLPLATZ_FIELDS.TYP,
        STELLPLATZ_FIELDS.MIETKOSTEN,
        STELLPLATZ_FIELDS.KAUFPREIS,
      ],
    }, 2000);

    const matched = recs.filter(r => {
      const link = (r.fields && r.fields[STELLPLATZ_FIELDS.WE_LINK]) || [];
      if (!Array.isArray(link)) return false;
      return link.some(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        return id === weId;
      });
    });

    return matched.map(r => {
      const f = r.fields || {};
      const typObj = f[STELLPLATZ_FIELDS.TYP];
      const typ = typObj && typeof typObj === 'object' ? typObj.name : typObj || '';
      return {
        id: r.id,
        titel: f[STELLPLATZ_FIELDS.TITEL] || '',
        typ,
        kaufpreis: num(f[STELLPLATZ_FIELDS.KAUFPREIS]) || 0,
        mieteMo: num(f[STELLPLATZ_FIELDS.MIETKOSTEN]) || 0, // alte Spalte, falls befüllt
      };
    });
  } catch (e) {
    console.error('loadStellplaetzeForWE failed:', e.message);
    return [];
  }
}

// Liefert alle Mietvertrag-relevanten Infos für eine WE in einem Pass:
//   - Stellplatzmiete-Summe (aggregiert über verknüpfte Mietverträge)
//   - Vermietungs-Status (vermietet=true, wenn mind. 1 Vertrag mit dieser WE existiert,
//     der nicht offensichtlich archiviert ist)
//   - Letzte Mietsteigerung (Datum) — nimmt das jüngste VERTRAGSBEGINN-Datum,
//     fallback auf das jüngste GUELTIG_AB-Datum (Iter 41.13).
//     Begründung: Stichprobe 18.05.2026 — Vertragsbeginn zu 97,9 % gefüllt,
//     'Anpassung gültig ab' nur zu 58 %. Bei jeder Erhöhung wird laut SOP-E §3.3
//     ein neuer Vertragsdatensatz mit entsprechendem Vertragsbeginn angelegt.
//
// Iter 44 (19.05.2026): Stellplatzmiete pro-rata zur Stellplatz-Verknüpfung.
// Wenn der zweite Parameter `weStpIds` (Array von Stellplatz-Record-IDs der WE)
// übergeben wird, prüfen wir pro Mietvertrag, wie viele der vertraglich verlinkten
// Stellplätze noch zur WE gehören. Beispiel Wess 5: Vertrag = 100 € für [stp1, stp2],
// WE hat nur noch stp1 → Anteil 1/2, effektive Stellplatzmiete = 50 €.
async function loadMietvertragInfoForWE(weId, weStpIds) {
  try {
    const recs = await listAll(TABLES.MIETVERTRAG, {
      fields: [
        MIETVERTRAG_FIELDS.WE_LINK,
        MIETVERTRAG_FIELDS.STELLPLATZ_LINK,
        MIETVERTRAG_FIELDS.KALTMIETE,
        MIETVERTRAG_FIELDS.STELLPLATZMIETE,
        MIETVERTRAG_FIELDS.STATUS_LOOKUP,
        MIETVERTRAG_FIELDS.VERTRAGSBEGINN,
        MIETVERTRAG_FIELDS.GUELTIG_AB,
        MIETVERTRAG_FIELDS.VERTRAGSART,
      ],
    }, 5000);

    let stplMietsummeNominal = 0; // Summe ohne Filter — für Debug/Diff (Backward-Compat)
    let vertraegeMitStellplatz = 0;
    let jungsteMietsteigerung = null; // YYYY-MM-DD — letzte vergangene/aktuelle Erhöhung
    let jungsterVertragsbeginn = null; // YYYY-MM-DD — letzter vergangener Vertragsbeginn
    let aktuelleKaltmiete = null; // €/Mo — aus Vertrag mit jüngstem Datum ≤ heute
    let aktuelleKaltmieteDatum = null; // YYYY-MM-DD — zugehöriges Datum
    let vertragVorhanden = false;
    const zukunftsvertraege = []; // [{ datum, kaltmiete, quelle }] mit Datum > heute
    const useProRata = Array.isArray(weStpIds);
    const heuteISO = new Date().toISOString().slice(0, 10);

    // Iter-4 Fix (Henry-Bug WE4, 21.05.2026): Stellplatzmiete wurde bisher über
    // ALLE aktiven Mietverträge der WE aufaddiert. Bei einer typischen Mieter-
    // Geschichte (Erstvertrag 2018 → Erhöhungsvertrag 2024) lagen damit zwei
    // Stellplatzmieten zur selben Garage im Aggregat → Summe doppelt. Henry hat
    // das manuell durch Löschen der alten Stellplatzmiete gefixt; jetzt im Code:
    // pro Stellplatz-Record gewinnt der jüngste Vertrag. Pro-rata-Logik (mehrere
    // Stellplätze im selben Vertrag) bleibt erhalten.
    //
    // Datenstruktur: stpId → { miete: €/Mo, datum: YYYY-MM-DD, vertragId }
    const jungsteStplMieteByPlatz = new Map();

    recs.forEach(r => {
      const f = r.fields || {};
      const weLink = f[MIETVERTRAG_FIELDS.WE_LINK] || [];
      const linked = Array.isArray(weLink) && weLink.some(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        return id === weId;
      });
      if (!linked) return;

      const statusLookup = f[MIETVERTRAG_FIELDS.STATUS_LOOKUP];
      const statusName = Array.isArray(statusLookup)
        ? (statusLookup[0] && typeof statusLookup[0] === 'object' ? statusLookup[0].name : statusLookup[0])
        : (statusLookup && typeof statusLookup === 'object' ? statusLookup.name : statusLookup);
      const istArchiviert = typeof statusName === 'string' && /archiv/i.test(statusName);

      vertragVorhanden = true;
      const stpl = f[MIETVERTRAG_FIELDS.STELLPLATZ_LINK];
      const stplMiete = num(f[MIETVERTRAG_FIELDS.STELLPLATZMIETE]) || 0;
      const gueltigRaw = f[MIETVERTRAG_FIELDS.GUELTIG_AB] || null;
      const beginnRaw  = f[MIETVERTRAG_FIELDS.VERTRAGSBEGINN] || null;
      const datumFuerStpl = gueltigRaw || beginnRaw || '0000-00-00';

      if (stpl && stplMiete > 0 && !istArchiviert) {
        const stplArr = Array.isArray(stpl) ? stpl : [];
        const vertragStpIds = stplArr.map(x => (x && typeof x === 'object' && x.id) ? x.id : x);
        // Bei Pro-rata: nur Stellplätze, die noch zur WE verknüpft sind.
        const relevanteStpIds = useProRata && vertragStpIds.length > 0
          ? vertragStpIds.filter(id => weStpIds.includes(id))
          : vertragStpIds;

        if (relevanteStpIds.length > 0) {
          // Anteilige Miete pro Stellplatz im Vertrag (volle Stellplatzmiete
          // / Anzahl im Vertrag — egal ob noch zur WE oder nicht). So bleibt
          // die Pro-rata-Mathematik konsistent zum alten Verhalten.
          const proStpMiete = stplMiete / vertragStpIds.length;
          relevanteStpIds.forEach(stpId => {
            const cur = jungsteStplMieteByPlatz.get(stpId);
            if (!cur || datumFuerStpl > cur.datum) {
              jungsteStplMieteByPlatz.set(stpId, {
                miete: proStpMiete,
                datum: datumFuerStpl,
                vertragId: r.id,
              });
            }
          });
        }
        stplMietsummeNominal += stplMiete;
        vertraegeMitStellplatz += 1;
      }
      const gueltig = f[MIETVERTRAG_FIELDS.GUELTIG_AB] || null;
      const beginn = f[MIETVERTRAG_FIELDS.VERTRAGSBEGINN] || null;
      const kaltmiete = num(f[MIETVERTRAG_FIELDS.KALTMIETE]);
      // Iter 76 (21.05.2026): Schenki legt bei einer einvernehmlich vereinbarten
      // Mieterhöhung einen neuen Mietvertrag-Datensatz mit GUELTIG_AB (oder
      // VERTRAGSBEGINN) in der Zukunft an. Wir trennen daher zwischen
      //  - vergangenen/aktuellen Verträgen → tragen zu jungsteMietsteigerung +
      //    aktuelleKaltmiete bei
      //  - zukünftigen Verträgen → werden als geplante Erhöhung gesammelt.
      const datumPrimary = gueltig || beginn; // GUELTIG_AB hat Vorrang
      if (istArchiviert) {
        return; // archivierte Verträge nicht für Datums-/Kaltmiete-Erkennung
      }
      if (datumPrimary && datumPrimary > heuteISO) {
        // Zukünftiger Vertrag → potenziell geplante Erhöhung
        if (kaltmiete && kaltmiete > 0) {
          zukunftsvertraege.push({
            datum: datumPrimary,
            kaltmiete,
            quelle: gueltig ? 'gueltig-ab' : 'vertragsbeginn',
          });
        }
      } else {
        // Vergangener/aktueller Vertrag
        if (gueltig && gueltig <= heuteISO && (!jungsteMietsteigerung || gueltig > jungsteMietsteigerung)) {
          jungsteMietsteigerung = gueltig;
        }
        if (beginn && beginn <= heuteISO && (!jungsterVertragsbeginn || beginn > jungsterVertragsbeginn)) {
          jungsterVertragsbeginn = beginn;
        }
        // Aktuelle Kaltmiete = die mit dem jüngsten Datum ≤ heute
        if (datumPrimary && kaltmiete && kaltmiete > 0
            && (!aktuelleKaltmieteDatum || datumPrimary > aktuelleKaltmieteDatum)) {
          aktuelleKaltmiete = kaltmiete;
          aktuelleKaltmieteDatum = datumPrimary;
        }
      }
    });

    // Iter 76: Geplante Erhöhung = frühestes zukünftiges Datum (wenn mehrere
    // gepflegt, ist das die nächste, die greift). Kaltmiete muss > aktuelle
    // Kaltmiete sein, sonst Pflegelücke / Tippfehler.
    zukunftsvertraege.sort((a, b) => a.datum.localeCompare(b.datum));
    let geplanteErhoehung = null;
    if (zukunftsvertraege.length > 0) {
      const naechste = zukunftsvertraege[0];
      const referenzMiete = aktuelleKaltmiete || 0;
      if (naechste.kaltmiete > referenzMiete + 0.01) {
        geplanteErhoehung = {
          datum: naechste.datum,
          kaltmiete: naechste.kaltmiete,
          quelle: 'mietvertrag-' + naechste.quelle,
        };
      }
    }

    // Iter-4 Fix (WE4-Bug): Stellplatzmiete-Summe nur aus dem jeweils JÜNGSTEN
    // Mietvertrag pro Stellplatz. Bei einer typischen WE mit nur einem aktiven
    // Vertrag identisch zum alten Verhalten. Bei zwei Verträgen (alt + neu) auf
    // denselben Stellplatz greift jetzt der jüngere — kein Aufaddieren mehr.
    const stplMietsumme = Array.from(jungsteStplMieteByPlatz.values())
      .reduce((s, x) => s + x.miete, 0);

    // QA-Fix 2026-05-23 (Edgar-Doc Bug 6+7+8): Vorher hatte jungsterVertragsbeginn
    // Vorrang vor jungsteMietsteigerung. ROOT-CAUSE: Bei einem Bestandsmieter
    // mit Vertragsbeginn 2025 und KEINER dokumentierten Erhöhung wurde
    // letzteMietsteigerung = 2025 → monateSeit = 0 → Chart zeigt nächste
    // Erhöhung erst in 3 Jahren. Edgar's Beobachtung „in vielen Fällen
    // bei Bruchsal".
    // Jetzt: echte Anpassung (jungsteMietsteigerung) hat ABSOLUTEN Vorrang.
    // Vertragsbeginn ist NUR Vermutung wenn er > 3 Jahre zurückliegt — dann
    // ist es plausibel dass „letzte Erhöhung war damals". Bei neuerem Vertrag
    // ohne dokumentierte Anpassung: letzteMietsteigerung = null → Frontend
    // setzt monateSeit = 36 (sofort Sprung möglich) statt 0.
    const heute = new Date();
    const drei = new Date(heute.getFullYear() - 3, heute.getMonth(), heute.getDate()).toISOString().slice(0, 10);
    const beginnPlausibel = jungsterVertragsbeginn && jungsterVertragsbeginn < drei;
    const letzteEchte = jungsteMietsteigerung || (beginnPlausibel ? jungsterVertragsbeginn : null);
    return {
      stellplatzMietsumme: stplMietsumme,
      stellplatzMietsummeNominal: stplMietsummeNominal,
      stellplatzMieteProRata: useProRata && stplMietsummeNominal !== stplMietsumme,
      stellplatzMieteJuengsterCount: jungsteStplMieteByPlatz.size,
      vertraegeMitStellplatz,
      vertragVorhanden,
      letzteMietsteigerung: letzteEchte,
      letzteMietsteigerungIstAnpassung: !!jungsteMietsteigerung,
      letzteMietsteigerungIstVertragsbeginn: !jungsteMietsteigerung && beginnPlausibel,
      jungsterVertragsbeginn,
      jungsteMietsteigerung,
      aktuelleKaltmiete,
      aktuelleKaltmieteDatum,
      geplanteErhoehung,
      zukunftsvertraegeCount: zukunftsvertraege.length,
    };
  } catch (e) {
    console.error('loadMietvertragInfoForWE failed:', e.message);
    return {
      stellplatzMietsumme: 0,
      stellplatzMietsummeNominal: 0,
      stellplatzMieteProRata: false,
      vertraegeMitStellplatz: 0,
      vertragVorhanden: false,
      letzteMietsteigerung: null,
      jungsterVertragsbeginn: null,
      aktuelleKaltmiete: null,
      aktuelleKaltmieteDatum: null,
      geplanteErhoehung: null,
      zukunftsvertraegeCount: 0,
    };
  }
}

// Findet die Kalkulations-Stammdaten-Zeile für eine WE.
// Priorität: erst aktiv, dann entwurf, dann keinen.
async function loadKalkStammdatenForWE(weId) {
  try {
    const recs = await listAll(TABLES.KALK_STAMMDATEN, {
      fields: Object.values(KALK_STAMMDATEN_FIELDS),
    }, 1000);

    const matched = recs.filter(r => {
      const link = (r.fields && r.fields[KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]) || [];
      if (!Array.isArray(link)) return false;
      return link.some(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        return id === weId;
      });
    });

    if (matched.length === 0) return null;

    // Priorisierung: erst Aktiv, dann Entwurf, dann Archiviert.
    const byStatus = { Aktiv: [], Entwurf: [], Archiviert: [] };
    matched.forEach(r => {
      const s = r.fields && r.fields[KALK_STAMMDATEN_FIELDS.STATUS];
      const name = s && typeof s === 'object' ? s.name : s || '';
      if (byStatus[name]) byStatus[name].push(r);
    });
    const pick = byStatus.Aktiv[0] || byStatus.Entwurf[0] || byStatus.Archiviert[0];
    return pick;
  } catch (e) {
    console.error('loadKalkStammdatenForWE failed:', e.message);
    return null;
  }
}

function kalkStammRecordToApi(rec) {
  if (!rec) return null;
  const f = rec.fields || {};
  const statusObj = f[KALK_STAMMDATEN_FIELDS.STATUS];
  const status = statusObj && typeof statusObj === 'object' ? statusObj.name : statusObj || null;
  const vermObj = f[KALK_STAMMDATEN_FIELDS.VERMIETUNGS_MODUS];
  const vermietungsModus = vermObj && typeof vermObj === 'object' ? vermObj.name : vermObj || null;
  const kappObj = f[KALK_STAMMDATEN_FIELDS.KAPPUNGSGRENZE];
  const kappungsgrenze = kappObj && typeof kappObj === 'object' ? kappObj.name : kappObj || null;
  return {
    id: rec.id,
    status,
    bezeichnung:           f[KALK_STAMMDATEN_FIELDS.BEZEICHNUNG] || null,
    hausverwaltung:        num(f[KALK_STAMMDATEN_FIELDS.HAUSVERWALTUNG]),
    hausgeldRuecklage:     num(f[KALK_STAMMDATEN_FIELDS.HAUSGELD_RUECKLAGE]),
    mietverwaltungDefault: num(f[KALK_STAMMDATEN_FIELDS.MIETVERWALTUNG_DEF]),
    mietzuschuss:          num(f[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS]),
    mietzuschussMonate:    num(f[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS_MONATE]),
    afaGutachten:          num(f[KALK_STAMMDATEN_FIELDS.AFA_GUTACHTEN]),
    wertsteigerung:        num(f[KALK_STAMMDATEN_FIELDS.WERTSTEIGERUNG]),
    vermietungsModus,
    kappungsgrenze,
    indexmiete:            num(f[KALK_STAMMDATEN_FIELDS.INDEXMIETE]),
    letzteMietsteigerung:  f[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG] || null,
    grEst:                 num(f[KALK_STAMMDATEN_FIELDS.GRESt]),
    gebaeudeAnteil:        num(f[KALK_STAMMDATEN_FIELDS.GEBAEUDE_ANTEIL]),
    hgInflation:           num(f[KALK_STAMMDATEN_FIELDS.HG_INFLATION]),
    notizen:               f[KALK_STAMMDATEN_FIELDS.NOTIZEN] || '',
    quelle:                f[KALK_STAMMDATEN_FIELDS.QUELLE] || '',
    // Iter 41.9 — Henry-Feedback 17.05.2026:
    mieteBeiVerkauf:       num(f[KALK_STAMMDATEN_FIELDS.MIETE_BEI_VERKAUF]),
    marktpreisImmoscout:   num(f[KALK_STAMMDATEN_FIELDS.MARKTPREIS_IS]),
    marktpreisHomeday:     num(f[KALK_STAMMDATEN_FIELDS.MARKTPREIS_HD]),
    marktmiete:            num(f[KALK_STAMMDATEN_FIELDS.MARKTMIETE]),
    // Iter 41.17 — Lookup „Miet-status (ist)" aus WE. Roher Wert wird in
    // resolveVermietungsstatus() normalisiert.
    weVermietungsstatusRaw: f[KALK_STAMMDATEN_FIELDS.WE_VERMIETUNGSSTATUS] || null,
    // Iter 70 (21.05.2026) — Einvernehmliche Mieterhöhung vor Übergabe (siehe tables.js).
    geplanteErhoehungDatum:     f[KALK_STAMMDATEN_FIELDS.GEPLANTE_ERHOEHUNG_DATUM] || null,
    geplanteErhoehungKaltmiete: num(f[KALK_STAMMDATEN_FIELDS.GEPLANTE_ERHOEHUNG_KALTMIETE]),
    // Iter-4 (21.05.2026) — vom Backend zurückgeschriebene Auto-Subv (Vergleichswerte
    // für Idempotenz-Check beim Write-back).
    autoSubvMo:    num(f[KALK_STAMMDATEN_FIELDS.AUTO_SUBV_MO]),
    autoSubvTotal: num(f[KALK_STAMMDATEN_FIELDS.AUTO_SUBV_TOTAL]),
  };
}

// Iter-4 (21.05.2026) — Write-back der Auto-Subv-Werte nach Airtable.
//
// Hintergrund: Die Airtable-KP-Vorschlag-Formel kann nur auf gespeicherte Felder
// zugreifen. Bisher kannte sie nur den manuellen `Mietzuschuss` — die per
// computeAutoSubvention() im Backend errechnete Story war für Airtable unsichtbar.
// Henrys Beobachtung: „Alle Einheiten mit Mietsubvention haben nicht gepasst" — weil
// der KP-Vorschlag die Subv-Story nicht eingepreist hat.
//
// Lösung: Nach jeder Subv-Berechnung schreibt das Backend Phase-1-Rate und Total
// in zwei dedizierte Airtable-Felder. Die KP-Vorschlag-Formel kann sie dann nutzen.
//
// Idempotenz: Wir schreiben nur, wenn sich Werte signifikant geändert haben
// (>5 €/Mo bei Mo-Wert ODER >50 € beim Total), um Schreiboperationen bei jedem
// Endpoint-Aufruf zu vermeiden. Fire-and-forget — die Response wartet nicht drauf,
// Fehler werden geloggt aber nicht hochgereicht.
function maybeWriteBackAutoSubv(kalkApi, subv) {
  if (!kalkApi || !kalkApi.id) return; // kein Stammdaten-Record vorhanden
  // Bei "kein-spielraum" / "leer" / "unter-mindestschwelle" → 0 schreiben, wenn nicht schon 0
  const neuMo    = (subv && typeof subv.mo === 'number' && isFinite(subv.mo))           ? Math.round(subv.mo * 100) / 100        : 0;
  const neuTotal = (subv && typeof subv.totalEur === 'number' && isFinite(subv.totalEur)) ? Math.round(subv.totalEur * 100) / 100 : 0;
  const altMo    = kalkApi.autoSubvMo    || 0;
  const altTotal = kalkApi.autoSubvTotal || 0;
  const moDiff    = Math.abs(neuMo - altMo);
  const totalDiff = Math.abs(neuTotal - altTotal);
  // Schwellen: 5 €/Mo bzw. 50 € Total. Wenn beide unter Schwelle → nicht schreiben.
  if (moDiff < 5 && totalDiff < 50) return;
  // Fire-and-forget: kein await, kein throw nach oben.
  airtable('update', TABLES.KALK_STAMMDATEN, {
    recordId: kalkApi.id,
    fields: {
      [KALK_STAMMDATEN_FIELDS.AUTO_SUBV_MO]:    neuMo,
      [KALK_STAMMDATEN_FIELDS.AUTO_SUBV_TOTAL]: neuTotal,
    }
  }).catch(e => {
    console.warn(`[stammdaten] Auto-Subv-Writeback fehlgeschlagen für ${kalkApi.id}: ${e.message}`);
  });
}

// Iter 41.17 (18.05.2026) — Vermietungs-Status aus dem WE-Lookup ableiten.
// Erwartete Werte aus der Wohneinheit-Tabelle: "vermietet" oder "leerstehend"
// (bzw. Varianten wie "leer", "frei"). Lookups kommen aus Airtable typischerweise
// als Array; Single-Selects (auch via Lookup) werden vom airtable-Wrapper bereits
// auf .name reduziert. Wir nehmen den ersten nicht-leeren Eintrag.
// Rückgabe: 'vermietet' | 'leer' | null (wenn Lookup leer/unklar → Fallback).
function resolveVermietungsstatusFromLookup(rawVal) {
  if (rawVal == null) return null;
  let v = rawVal;
  if (Array.isArray(v)) v = v.find(x => x != null && x !== '') || null;
  if (v == null) return null;
  if (typeof v === 'object' && v.name) v = v.name;
  const s = String(v).toLowerCase().trim();
  if (!s) return null;
  if (s.startsWith('vermiet')) return 'vermietet';
  if (s.startsWith('leer') || s.startsWith('frei') || s.includes('leerstehend')) return 'leer';
  return null;
}

// --- Iter 41.10: 2-Phasen-Mietsubvention (Edgar/Henry-Modell 18.05.2026) ---
// --- Iter 62/63 (20.05.2026): Marktmiete-Cap statt P2-Streichung + Tag-1-Erhöhung ---
//
// Logik:
// - Käufer sieht ab Tag 1 die konstante Käufer-Miete = MbV + X über bis zu 6 Jahre.
// - X = Käufer-Aufschlag pro Monat. Ideal: X = MbV × ((1+Kapp)² − 1), gedeckelt durch
//   die Marktmiete (rechtl. Erhöhungslimit) und durch den Subv-Cap (€).
// - Phase 1 läuft (36 − Mo seit letzter Erhöhung) Monate. Subv P1/Mo = X.
//   (Mieter zahlt MbV; B&B legt X drauf, sodass Käufer MbV + X sieht.)
// - Phase 2 läuft 36 Monate, sofern es überhaupt legalen Markt-Spielraum gibt
//   (Marktmiete > MbV). Iter 62: Die alte 10-%-Schwelle, die Phase 2 strich, wenn
//   die Käufer-Miete nach P1 zu nah an Markt war, wurde entfernt. Stattdessen wird
//   die Mieter-Erhöhung in Phase 2 auf min(MbV × (1+Kapp), Marktmiete) gedeckelt
//   und die Subv für Phase 2 entsprechend reduziert. Das hält die Käufer-Miete
//   über die vollen 72 Monate konstant auf MbV + X.
//   (Mieter wird in P2 legal erhöht; Subv P2/Mo = X − (Mieter-Erhöhung).)
// - Cap = max(5.000 €, qm × 150 €/qm). Override per Stammdaten möglich (heute nicht).
// - Wenn (P1-Subv + P2-Subv) > Cap, wird X so reduziert, dass die Summe genau dem
//   Cap entspricht. Käufer-Miete bleibt 6 Jahre konstant, nur niedriger als ideal.
// - Iter 63: Wenn die letzte Mietsteigerung > 36 Monate her ist und keine Erhöhung
//   vor Verkauf gemacht wurde, wird die erste Erhöhung beim Käufer ab Tag 1
//   eingerechnet — d.h. der Mieter zahlt ab Tag 1 schon MbV × (1+Kapp) (durch
//   Marktmiete gedeckelt). Danach laufen die 2 regulären Subv-Zyklen (72 Mo). Der
//   neue Mieter-Tag-1-Wert wird im Output als `kaltmieteAdjustiert` zurückgegeben.
// - Manueller Mietzuschuss in Stammdaten hat Vorrang vor der Auto-Berechnung
//   (wird als einzige Phase ausgewiesen).
// - Vermietungsmodus ≠ 'Bestand' (Neuvermietung, Index, leer) → keine Subvention.
function parseKappPct(kappRaw) {
  if (typeof kappRaw === 'string') {
    const m = kappRaw.match(/(\d+([.,]\d+)?)/);
    if (m) return parseFloat(m[1].replace(',', '.')) / 100;
  }
  if (typeof kappRaw === 'number') {
    return kappRaw > 1 ? kappRaw / 100 : kappRaw;
  }
  return 0;
}

function computeAutoSubvention(kalkApi, vermietung, weQm) {
  const empty = { phasen: [], totalEur: 0, mo: 0, monate: 0, quelle: 'keine', erlaeuterung: '' };

  if (!kalkApi) return Object.assign({}, empty, { quelle: 'keine-stammdaten' });

  // Manueller Override → eine Phase
  // QA-Fix 2026-05-23 (Audit-BB-1): Vorher reichte nur Monate > 0, um eine
  // Subv-Phase mit mo=0 zu erzeugen. Resultat: PDF zeigte „0 €/Mo über X Monate"
  // als Subv-Story — sinnlos und unseriös im Live-Verkauf. Jetzt: BEIDE Werte
  // müssen > 0 sein, sonst fällt es in den Auto-Pfad.
  const manMo  = kalkApi.mietzuschuss;
  const manMon = kalkApi.mietzuschussMonate;
  if (manMo != null && manMo > 0 && manMon != null && manMon > 0) {
    return {
      phasen: [{ mo: manMo, monate: manMon, label: 'Manuell (Override)' }],
      totalEur: Math.round(manMo * manMon),
      mo: manMo, monate: manMon, quelle: 'manuell',
      erlaeuterung: 'Manuell gepflegter Mietzuschuss in Stammdaten hat Vorrang.'
    };
  }
  // Pflegelücke: nur Höhe ODER nur Monate gepflegt → klare Warnung, keine Phase.
  if ((manMo != null && manMo > 0) || (manMon != null && manMon > 0)) {
    return Object.assign({}, empty, {
      quelle: 'manuell-unvollstaendig',
      erlaeuterung: 'Mietzuschuss in Stammdaten unvollständig — beide Felder (Höhe + Monate) müssen gepflegt sein.'
    });
  }

  // Vermietungsmodus checken
  const modus = (kalkApi.vermietungsModus || '').toLowerCase();
  if (modus !== 'bestand') {
    // Iter 41.16: Quelle-Label klarer differenziert
    let quelleLabel = 'auto-neuvermietung';
    let erlText = 'Keine Mietsubvention bei Neuvermietung — Du übernimmst einen frischen Mietvertrag zur aktuellen Marktmiete.';
    if (modus.includes('leer') || modus.includes('frei')) {
      quelleLabel = 'auto-leerstand';
      erlText = 'Keine Mietsubvention bei Leerstand — wir vermieten die Wohnung für Dich frisch, bevor Du sie übernimmst.';
    } else if (!modus) {
      quelleLabel = 'auto-modus-fehlt';
      erlText = 'Vermietungs-Modus in Stammdaten nicht gepflegt — keine Subvention berechnet.';
    }
    return Object.assign({}, empty, {
      quelle: quelleLabel,
      erlaeuterung: erlText,
    });
  }

  const mbvRaw = kalkApi.mieteBeiVerkauf;
  if (!mbvRaw || mbvRaw <= 0) return Object.assign({}, empty, { quelle: 'auto-mbv-fehlt', erlaeuterung: 'Miete bei Verkauf in Stammdaten fehlt.' });

  const kappPct = parseKappPct(kalkApi.kappungsgrenze);
  if (!kappPct || kappPct <= 0) return Object.assign({}, empty, { quelle: 'auto-kappung-fehlt', erlaeuterung: 'Kappungsgrenze in Stammdaten fehlt.' });

  // Iter 65 (20.05.2026): kalkApi.marktmiete enthält jetzt €/qm, nicht mehr €/Mo
  // absolut. Für die Subv-Berechnung wird der absolute Wert (€/Mo) gebraucht
  // → mit WE.qm multiplizieren.
  const marktmieteEurQm = kalkApi.marktmiete || 0;
  const marktmiete = marktmieteEurQm > 0 && weQm > 0 ? marktmieteEurQm * weQm : 0;

  // Iter-2 Fix (21.05.2026, SK1): Edge-Case „MbV gepflegt, Marktmiete fehlt".
  // Vorher lief der Code mit marktmiete=0 ungekappt durch — xMaxMarkt fiel auf
  // xIdealOhneMarkt zurück, Phase 2 rechnete mit voller MbV×Kapp²-Steigerung und
  // erzeugte eine optimistische Subv-Story, die rechtlich nicht belastbar war.
  // Ab jetzt: Ohne gepflegte Marktmiete keine Subv-Berechnung — Status-Card warnt
  // („Marktmiete pflegen"), und die Phase-2-Story bleibt aus. Der Vertriebler
  // wird nicht mehr ungewollt zu einem Reservierungs-Klick verführt, der auf
  // einer Pflegelücke beruht.
  if (marktmiete <= 0) {
    return Object.assign({}, empty, {
      quelle: 'auto-marktmiete-fehlt',
      erlaeuterung: 'Marktmiete in Stammdaten fehlt — ohne Marktanker keine seriöse Subventions-Story berechenbar. Bitte Marktmiete (€/qm) pflegen.',
    });
  }

  // Phase-1-Laufzeit aus letzter Mietsteigerung
  const letzte = (vermietung && vermietung.letzteMietsteigerung) || kalkApi.letzteMietsteigerung;
  let monateSeitRaw = null; // null = unbekannt → konservativ 0 Mo verstrichen
  if (letzte) {
    const datum = new Date(letzte);
    const heute = new Date();
    monateSeitRaw = Math.max(0, (heute.getFullYear() - datum.getFullYear()) * 12 + (heute.getMonth() - datum.getMonth()));
  }

  // --- Iter 63 (20.05.2026): Tag-1-Erhöhung wenn letzte Mietsteigerung > 36 Monate ---
  // Wenn die letzte Erhöhung mehr als 3 Jahre her ist und vor Verkauf nichts mehr
  // angepasst wurde, hebt B&B die Mieter-Miete schon vor Übergabe auf MbV × (1+Kapp)
  // (durch Marktmiete gedeckelt). Der Mieter zahlt diesen Wert ab Tag 1. Danach läuft
  // der reguläre 2-Phasen-Zyklus (72 Monate) gegen die neue Basis.
  //
  // --- Iter 70 (21.05.2026): Vereinbarte Mieterhöhung hat Vorrang ---
  // Wenn in den Stammdaten eine bereits einvernehmlich mit dem Mieter abgeschlossene
  // Erhöhung gepflegt ist (Felder „Vereinbarte Erhöhung — gültig ab" + „— neue Kaltmiete"),
  // und das Datum max. 12 Monate in der Zukunft oder bis zu 1 Monat in der Vergangenheit
  // liegt, ersetzt diese die rechnerische Iter-63-Annahme. Wir simulieren die Vereinbarung
  // als „ab Tag 1 wirksam" — pragmatische Vereinfachung, weil die Übergabe typischerweise
  // in diesem Zeitfenster stattfindet. Bei Datum > 12 Mo in der Zukunft: nur Notiz, keine
  // rechnerische Wirkung (Verkäufer trägt das Risiko der Lücke).
  let mbv = mbvRaw;
  let monateSeit = monateSeitRaw;
  let tag1Erhoehung = false;
  let tag1Anhebung = 0; // €/Mo, um den die Mieter-Miete vor Verkauf erhöht wird
  let tag1Quelle = null; // 'iter63-annahme' | 'vereinbarung'
  let vereinbarungInfo = null; // { datum, monateBisErhoehung, kaltmiete, anwendbar }

  // (1) Vereinbarung prüfen — Quellen-Priorität:
  //   (a) Stammdaten-Override (Felder „Vereinbarte Erhöhung — gültig ab / neue Kaltmiete"):
  //       Edgar kann manuell überschreiben.
  //   (b) Mietvertrag (Schenki legt bei unterschriebener Erhöhung einen neuen
  //       Mietvertrag mit GUELTIG_AB in der Zukunft an — Default-Workflow).
  //   Wenn (a) gepflegt: schlägt (b).
  let geplDatumRaw = null;
  let geplKaltmiete = null;
  let geplQuelle = null; // 'stammdaten-override' | 'mietvertrag'
  if (kalkApi.geplanteErhoehungDatum && kalkApi.geplanteErhoehungKaltmiete && kalkApi.geplanteErhoehungKaltmiete > 0) {
    geplDatumRaw = kalkApi.geplanteErhoehungDatum;
    geplKaltmiete = kalkApi.geplanteErhoehungKaltmiete;
    geplQuelle = 'stammdaten-override';
  } else if (vermietung && vermietung.geplanteErhoehung) {
    geplDatumRaw = vermietung.geplanteErhoehung.datum;
    geplKaltmiete = vermietung.geplanteErhoehung.kaltmiete;
    geplQuelle = 'mietvertrag';
  }

  if (geplDatumRaw && geplKaltmiete && geplKaltmiete > 0) {
    const geplDate = new Date(geplDatumRaw);
    if (!isNaN(geplDate.getTime())) {
      const heute = new Date();
      // Monate bis zur Erhöhung (negativ = Vergangenheit)
      const monateBisErhoehung = (geplDate.getFullYear() - heute.getFullYear()) * 12
        + (geplDate.getMonth() - heute.getMonth());
      // Iter-4 Fix (21.05.2026, WE7-Bug): Bedingung war "geplKaltmiete > mbvRaw + 0.01".
      // Das war zu strikt: Henry pflegt häufig MbV = die geplante Erhöhungsmiete (die,
      // die der Käufer langfristig kriegt). Wenn dann der Mietvertrag mit gleicher
      // Kaltmiete als zukünftige Erhöhung gepflegt ist (z.B. WE7: MbV=740, MV=740 ab
      // 1.8.26), liefen beide Werte exakt parallel — Code sagte „nicht anwendbar" und
      // fiel auf Tag-1-Annahme zurück (Mieter angeblich auf 846 €/Mo) — falsch.
      // Lösung: ≥ statt > (mit Toleranz). Wenn Henrys MbV die geplante Erhöhung ist,
      // ist die Vereinbarung anwendbar — Tag-1-Annahme bleibt aus.
      const anwendbar = monateBisErhoehung >= -1 && monateBisErhoehung <= 12
        && geplKaltmiete >= mbvRaw - 0.01;
      vereinbarungInfo = {
        datum: geplDatumRaw,
        monateBisErhoehung,
        kaltmiete: geplKaltmiete,
        quelle: geplQuelle, // 'stammdaten-override' | 'mietvertrag'
        anwendbar,
      };
      if (anwendbar) {
        tag1Erhoehung = true;
        tag1Anhebung = geplKaltmiete - mbvRaw;
        mbv = geplKaltmiete;
        monateSeit = 0;
        tag1Quelle = 'vereinbarung';
      }
    }
  }

  // (2) Wenn keine Vereinbarung greift: Iter-63-Annahme fällt zurück.
  if (!tag1Erhoehung && monateSeitRaw !== null && monateSeitRaw > 36) {
    const mieterErhoehung = mbvRaw * kappPct;
    const mbvNeu = marktmiete > 0
      ? Math.min(mbvRaw + mieterErhoehung, marktmiete)
      : mbvRaw + mieterErhoehung;
    if (mbvNeu > mbvRaw + 0.01) {
      tag1Erhoehung = true;
      tag1Anhebung = mbvNeu - mbvRaw;
      mbv = mbvNeu;          // ab hier rechnet alles mit dem neuen MbV
      monateSeit = 0;        // Phase 1 läuft volle 36 Monate ab Übergabe
      tag1Quelle = 'iter63-annahme';
    }
  }

  const p1Monate = monateSeit !== null ? Math.max(0, 36 - monateSeit) : 36;
  const p2Monate = 36;

  // X_ideal = MbV × ((1+Kapp)² − 1)   (= 2 Erhöhungsstufen drauf)
  // Markt-Deckelung: X kann max. (Marktmiete − MbV) sein, sonst rechtl. nicht haltbar.
  const xIdealOhneMarkt = mbv * ((1 + kappPct) * (1 + kappPct) - 1);
  const xMaxMarkt = marktmiete > 0 ? Math.max(0, marktmiete - mbv) : xIdealOhneMarkt;
  let xFinal = Math.min(xIdealOhneMarkt, xMaxMarkt);

  if (xFinal <= 0) {
    // Iter 70 (21.05.2026): Erläuterung + Audit-Felder differenziert nach Quelle.
    let erl;
    if (tag1Quelle === 'vereinbarung' && vereinbarungInfo) {
      const d = new Date(vereinbarungInfo.datum);
      const datumStr = isNaN(d.getTime()) ? vereinbarungInfo.datum
        : `${('0'+d.getDate()).slice(-2)}.${('0'+(d.getMonth()+1)).slice(-2)}.${d.getFullYear()}`;
      erl = `Mit dem Mieter ist eine Mieterhöhung auf ${Math.round(mbv)} €/Mo ab ${datumStr} vereinbart — danach kein weiterer legaler Spielraum bis zur Marktmiete. Käufer-Miete bleibt durch den Marktmiete-Cap konstant.`;
    } else if (tag1Erhoehung) {
      erl = `Letzte Mietsteigerung war ${monateSeitRaw} Mo her — Mieter wird vor Verkauf auf ${Math.round(mbv)} €/Mo angehoben. Danach kein weiterer legaler Spielraum bis zur Marktmiete.`;
    } else if (vereinbarungInfo && !vereinbarungInfo.anwendbar) {
      const d = new Date(vereinbarungInfo.datum);
      const datumStr = isNaN(d.getTime()) ? vereinbarungInfo.datum
        : `${('0'+d.getDate()).slice(-2)}.${('0'+(d.getMonth()+1)).slice(-2)}.${d.getFullYear()}`;
      erl = `Miete bei Verkauf ≥ Marktmiete — keine legale Erhöhung möglich. Hinweis: Mit dem Mieter ist eine Erhöhung auf ${Math.round(vereinbarungInfo.kaltmiete)} €/Mo ab ${datumStr} (${vereinbarungInfo.monateBisErhoehung} Mo Vorlauf) vereinbart, aber wegen langer Vorlaufzeit nicht in die Kalkulation übernommen.`;
    } else {
      erl = 'Miete bei Verkauf ≥ Marktmiete — keine legale Erhöhung möglich.';
    }
    return Object.assign({}, empty, {
      quelle: tag1Quelle === 'vereinbarung' ? 'auto-vereinbart' : 'auto-kein-spielraum',
      erlaeuterung: erl,
      tag1Erhoehung,
      tag1Anhebung: Math.round(tag1Anhebung * 100) / 100,
      tag1Quelle,
      kaltmieteAdjustiert: tag1Erhoehung ? Math.round(mbv * 100) / 100 : null,
      vereinbarung: vereinbarungInfo,
      // Iter 65: Marktmiete-Felder damit Frontend-Cap konsistent läuft
      marktmieteEurQm,
      marktmieteAbs: Math.round(marktmiete * 100) / 100,
    });
  }

  // Iter 62 (20.05.2026): Phase 2 läuft IMMER, solange es legalen Markt-Spielraum gibt
  // (xMaxMarkt > 0). Die alte 10-%-Schwelle ist weg. Wenn die kapp-Erhöhung des Mieters
  // in Phase 2 die Marktmiete übersteigen würde, wird der Mieter nur auf Marktmiete
  // erhöht — die Subv in Phase 2 reduziert sich entsprechend, läuft aber volle 36 Monate.
  const p2Aktiv = xMaxMarkt > 0.01;

  // Mieter-Erhöhung in Phase 2 — gedeckelt durch Marktmiete (rechtlich)
  const mieterErhoehungP2 = p2Aktiv
    ? Math.min(mbv * kappPct, marktmiete > 0 ? (marktmiete - mbv) : (mbv * kappPct))
    : 0;
  // Iter 62: marktCapGreift = wahr, sobald die Markt-Deckelung eine der beiden
  // Größen reduziert: entweder den Käufer-Aufschlag X (xFinal < xIdealOhneMarkt)
  // oder die Mieter-Erhöhung in Phase 2 (mieterErhoehungP2 < mbv * kappPct).
  const marktCapGreift = p2Aktiv && marktmiete > 0 && (
    xFinal < xIdealOhneMarkt - 0.01 ||
    mieterErhoehungP2 < mbv * kappPct - 0.01
  );

  // Iter 47/48: Effektivmiete bleibt für den Käufer über alle Phasen konstant.
  // Phase 1: B&B legt vollen Aufschlag (xFinal) drauf — Mieter zahlt noch MbV.
  // Phase 2: Mieter wird auf MbV + mieterErhoehungP2 erhöht. B&B legt nur noch
  //          (xFinal − mieterErhoehungP2) drauf — Käufer sieht weiter MbV + xFinal.
  let p1Mo = xFinal;
  let p2Mo = p2Aktiv ? Math.max(0, xFinal - mieterErhoehungP2) : 0;

  let p1Eur = p1Mo * p1Monate;
  let p2Eur = p2Aktiv ? p2Mo * p2Monate : 0;
  let totalEurRaw = p1Eur + p2Eur;

  // Cap auf den echten Subv-Abfluss
  // Iter-4 (22.05.2026): Cap erweitert auf qm × 200 (vorher 150) + MbV × 18.
  // Vorher deckelte qm × 150 die Subv-Story bei grossen WEs zu früh:
  // z.B. WE10 (83,74 qm) hatte Cap 12.561 €, obwohl der rechtliche Markt-Spielraum
  // 16.421 € hergegeben hätte. qm × 200 hebt den Cap auf 16.748 € → volle
  // Story möglich. Bei kleinen WEs (53-66 qm) wirkt der Cap eh nicht, weil die
  // Subv-Story dort schon natürlich klein ist (kein Cap-Bruch).
  // MbV × 18 als zusätzliche Obergrenze für WEs mit hoher Miete + kleiner Fläche.
  // Edgar-Bestätigung 22.05.2026.
  const cap = Math.max(5000, (weQm || 0) * 200, mbvRaw * 18);
  let capGreift = false;
  let capDetail = '';

  if (totalEurRaw > cap && cap > 0) {
    capGreift = true;
    // Cap: X so kürzen, dass X×p1 + (X − mieterErhoehungP2)×p2 = Cap
    // → X = (Cap + p2Monate × mieterErhoehungP2) / (p1Monate + p2Monate)
    const denom = p1Monate + (p2Aktiv ? p2Monate : 0);
    if (denom > 0) {
      const xNew = (cap + (p2Aktiv ? p2Monate * mieterErhoehungP2 : 0)) / denom;
      xFinal = Math.max(0, xNew);
      p1Mo = xFinal;
      p2Mo = p2Aktiv ? Math.max(0, xFinal - mieterErhoehungP2) : 0;
      p1Eur = p1Mo * p1Monate;
      p2Eur = p2Aktiv ? p2Mo * p2Monate : 0;
      totalEurRaw = p1Eur + p2Eur;
      capDetail = `Maximal-Subvention ${Math.round(cap).toLocaleString('de-DE')} € erreicht. Monatlicher Aufschlag auf ${Math.round(xFinal)} €/Mo angepasst.`;
    }
  }

  // Iter-4 (22.05.2026, Henry/Edgar-Vorgabe): Mindestschwelle 1.000 € Total.
  // Subventionen unter 1.000 € werden NICHT als Vermarktungs-Story angezeigt —
  // sie wirken im Verkauf unprofessionell ("4 €/Mo aufgestockt" liest sich
  // schlechter als gar keine Subv-Story). Henrys WE11 mit 156 € Subv-Total
  // war der Auslöser. Tag-1-Anhebung / Vereinbarung bleiben informativ erhalten,
  // aber phasen + totalEur werden 0 zurückgegeben.
  const SUBV_MINDESTSCHWELLE_EUR = 1000;
  if (totalEurRaw < SUBV_MINDESTSCHWELLE_EUR) {
    return Object.assign({}, empty, {
      quelle: 'auto-unter-mindestschwelle',
      erlaeuterung: tag1Erhoehung
        ? `Käufer übernimmt mit ${Math.round(mbv)} €/Mo (Vereinbarung wirksam ab Übergabe). Subv-Story unter 1.000 € Total — kein nennenswerter Vermarktungs-Hebel.`
        : `Miete bei Verkauf liegt nahe an der Marktmiete (${Math.round(marktmiete)} €/Mo) — rechnerische Subv-Story unter 1.000 € Total, nicht ausgewiesen.`,
      tag1Erhoehung,
      tag1Anhebung: Math.round(tag1Anhebung * 100) / 100,
      tag1Quelle,
      kaltmieteAdjustiert: tag1Erhoehung ? Math.round(mbv * 100) / 100 : null,
      vereinbarung: vereinbarungInfo,
      marktmieteEurQm,
      marktmieteAbs: Math.round(marktmiete * 100) / 100,
    });
  }

  const phasen = [];
  if (p1Monate > 0 && p1Mo > 0) {
    phasen.push({
      mo: Math.round(p1Mo * 100) / 100,
      monate: p1Monate,
      label: 'Phase 1 (bis zur 1. Mieterhöhung)'
    });
  }
  if (p2Aktiv && p2Monate > 0 && p2Mo > 0) {
    phasen.push({
      mo: Math.round(p2Mo * 100) / 100,
      monate: p2Monate,
      label: 'Phase 2 (nach 1. Mieterhöhung)'
    });
  }

  // Erläuterung an Dich (Du-Form, direkt an Endkunde).
  const hinweise = [];
  if (tag1Erhoehung) {
    if (tag1Quelle === 'vereinbarung' && vereinbarungInfo) {
      // Iter 70: Echte Vereinbarung mit dem Mieter — pflegen wird konkret zitiert.
      const datumStr = (() => {
        const d = new Date(vereinbarungInfo.datum);
        if (isNaN(d.getTime())) return vereinbarungInfo.datum;
        return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
      })();
      const vorlaufHinweis = vereinbarungInfo.monateBisErhoehung > 1
        ? ` (greift in ${vereinbarungInfo.monateBisErhoehung} Mo — wir rechnen vereinfachend ab Tag 1 mit der neuen Miete)`
        : '';
      hinweise.push(`Mit dem Mieter ist eine Mieterhöhung auf ${Math.round(mbv)} €/Mo ab ${datumStr} vereinbart${vorlaufHinweis}. Danach laufen die regulären 2 Subv-Zyklen über 72 Monate.`);
    } else {
      hinweise.push(`Letzte Mietsteigerung war ${monateSeitRaw} Monate her — wir heben die Miete vor Übergabe um ${Math.round(tag1Anhebung)} €/Mo auf ${Math.round(mbv)} €/Mo an. Danach laufen die regulären 2 Subv-Zyklen über 72 Monate.`);
    }
  } else if (vereinbarungInfo && !vereinbarungInfo.anwendbar) {
    // Iter 70: Vereinbarung gepflegt aber nicht (mehr) anwendbar — als Notiz zeigen.
    const datumStr = (() => {
      const d = new Date(vereinbarungInfo.datum);
      if (isNaN(d.getTime())) return vereinbarungInfo.datum;
      return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
    })();
    if (vereinbarungInfo.monateBisErhoehung > 12) {
      hinweise.push(`Hinweis: Mit dem Mieter ist eine Erhöhung auf ${Math.round(vereinbarungInfo.kaltmiete)} €/Mo ab ${datumStr} vereinbart (${vereinbarungInfo.monateBisErhoehung} Mo Vorlauf) — wegen langer Vorlaufzeit nicht in die Kalkulation übernommen.`);
    } else if (vereinbarungInfo.kaltmiete <= mbvRaw + 0.01) {
      hinweise.push(`Hinweis: Die gepflegte „Vereinbarte Erhöhung" (${Math.round(vereinbarungInfo.kaltmiete)} €/Mo) liegt nicht über der aktuellen Miete bei Verkauf — Pflege prüfen.`);
    }
  }
  if (marktCapGreift) {
    // Iter 65 (20.05.2026): Marktmiete jetzt als €/qm gepflegt — für den Hinweis
    //   den umgerechneten €/Mo-Wert zeigen, plus die €/qm-Basis.
    const mmBasis = (marktmieteEurQm > 0 && weQm > 0)
      ? ` (${marktmieteEurQm.toFixed(2).replace('.', ',')} €/qm × ${weQm} qm = ${Math.round(marktmiete)} €/Mo)`
      : ` (${Math.round(marktmiete)} €/Mo)`;
    hinweise.push(`Die rechnerische 2. Mieterhöhung würde die Marktmiete${mmBasis} überschreiten — wir cappen die Mieter-Erhöhung in Phase 2 auf Marktmiete-Niveau und halten die Käufer-Miete trotzdem über alle 72 Monate konstant.`);
  }
  const gesamtMonate = p1Monate + (p2Aktiv ? p2Monate : 0);
  const gesamtJahre = Math.round(gesamtMonate / 12 * 10) / 10;
  if (p2Aktiv && phasen.length === 2) {
    hinweise.push(`Deine Mieteinnahme bleibt ${Math.round(mbv + xFinal)} €/Mo konstant über ${gesamtJahre} Jahre — auch wenn sich die Mietzahlung Deines Mieters durch die gesetzliche Erhöhung anpasst.`);
  } else if (phasen.length === 1) {
    hinweise.push(`Wir stocken Deine Mieteinnahme um ${Math.round(p1Mo)} €/Mo auf, über ${p1Monate} Monate.`);
  }
  if (capDetail) hinweise.unshift(capDetail);
  const erlaeuterung = hinweise.join(' ');

  // Für Backward-Compat: mo + monate als Durchschnitt aus beiden Phasen.
  const totalMo = (phasen.reduce((s, p) => s + p.monate, 0)) || 0;
  const totalEur = Math.round(totalEurRaw);
  const moDurchschnitt = totalMo > 0 ? Math.round(totalEur / totalMo * 100) / 100 : 0;

  // Quelle-Label für Frontend-Anzeige
  let quelleLabel;
  if (capGreift) quelleLabel = 'auto-cap';
  else if (tag1Quelle === 'vereinbarung') quelleLabel = 'auto-vereinbart';
  else if (tag1Erhoehung) quelleLabel = 'auto-tag1-erhoehung';
  else if (marktCapGreift) quelleLabel = 'auto-marktcap-p2';
  else if (p2Aktiv) quelleLabel = 'auto-2-phasen';
  else quelleLabel = 'auto-1-phase';

  return {
    phasen,
    totalEur,
    mo: moDurchschnitt,
    monate: totalMo,
    capEur: Math.round(cap),
    capGreift,
    quelle: quelleLabel,
    erlaeuterung,
    // Iter 63: Tag-1-Erhöhung-Output für das Frontend
    tag1Erhoehung,
    tag1Anhebung: Math.round(tag1Anhebung * 100) / 100,
    kaltmieteAdjustiert: tag1Erhoehung ? Math.round(mbv * 100) / 100 : null,
    // Iter 62: Cap-Indikatoren
    marktCapGreift,
    // Iter 65: Marktmiete als €/qm + umgerechnet €/Mo für UI-Anzeige
    marktmieteEurQm,
    marktmieteAbs: Math.round(marktmiete * 100) / 100,
    // Iter 70: Vereinbarte Mieterhöhung (für UI-Hinweis + Audit)
    tag1Quelle, // null | 'vereinbarung' | 'iter63-annahme'
    vereinbarung: vereinbarungInfo,
  };
}

// --- Iter 41.9: Markteinkauf-Hebel Schnitt aus IS+HD ---
function computeMarktpreisGemittelt(kalkApi) {
  if (!kalkApi) return { wert: 0, quelle: 'keine' };
  const is = kalkApi.marktpreisImmoscout;
  const hd = kalkApi.marktpreisHomeday;
  const hasIs = is != null && is > 0;
  const hasHd = hd != null && hd > 0;
  if (hasIs && hasHd) return { wert: Math.round((is + hd) / 2), quelle: 'schnitt' };
  if (hasIs) return { wert: is, quelle: 'nur-is' };
  if (hasHd) return { wert: hd, quelle: 'nur-hd' };
  return { wert: 0, quelle: 'keine' };
}

module.exports = async (req, res) => {
  // QA-Fix 2026-05-23 (Audit-DD-1): CSRF-Schutz für PUT (Stammdaten-Edit).
  if (!requireSafeOrigin(req, res)) return;

  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const weId = req.query && req.query.weId;
  if (!weId || !weId.startsWith('rec')) return res.status(400).json({ error: 'weId fehlt oder ungültig' });

  try {
    if (req.method === 'GET') {
      // --- 1) Wohneinheit-Datensatz lesen ---
      const weResp = await airtable('get', TABLES.WOHNEINHEIT, { recordId: weId });
      if (!weResp || !weResp.fields) return res.status(404).json({ error: 'WE nicht gefunden' });
      const wf = weResp.fields || {};
      const we = {
        id: weResp.id,
        weNr:      wf[WE_FIELDS.WE_NR] || '',
        lage:      (Array.isArray(wf[WE_FIELDS.LAGE_BEZ]) ? wf[WE_FIELDS.LAGE_BEZ][0] : wf[WE_FIELDS.LAGE_BEZ]) || '',
        lageText:  (Array.isArray(wf[WE_FIELDS.LAGE_TEXT]) ? wf[WE_FIELDS.LAGE_TEXT][0] : wf[WE_FIELDS.LAGE_TEXT]) || '',
        kp:        num(wf[WE_FIELDS.KAUFPREIS]),
        qm:        num(wf[WE_FIELDS.QM]),
        kaltmiete: num(wf[WE_FIELDS.KALTMIETE]),
        qmPreis:   num(wf[WE_FIELDS.QM_PREIS]),
      };

      // --- 2) Stellplätze zuerst (für Pro-rata-Mietberechnung), dann Mietvertrag + Kalk parallel ---
      // Iter 44: Stellplatz-IDs werden an loadMietvertragInfoForWE übergeben, damit
      // die Stellplatzmiete proportional zur aktuellen WE-Verknüpfung berechnet wird.
      const stellplaetze = await loadStellplaetzeForWE(weId);
      const weStpIds = stellplaetze.map(s => s.id);
      const [vertragInfo, kalkRec] = await Promise.all([
        loadMietvertragInfoForWE(weId, weStpIds),
        loadKalkStammdatenForWE(weId),
      ]);

      // Stellplatz-Aggregat: Kaufpreis-Summe + Miete
      // Iter 46: Stellplatz-Tabelle hat Vorrang vor Mietvertrag-Pauschale, sobald sie
      // gepflegt ist (mind. 1 Stellplatz mit Miete > 0). Damit kann Vivien pro Stellplatz
      // pflegen, und beim Entfernen eines Stellplatzes aus der WE sinkt die Summe
      // automatisch. Wess 5: 1 Garage à 50 € statt 100 € Vertragspauschale.
      const stpKaufpreisSumme = stellplaetze.reduce((s, x) => s + (x.kaufpreis || 0), 0);
      const stpAlteMieteSumme = stellplaetze.reduce((s, x) => s + (x.mieteMo || 0), 0);
      const stpMieteEffektiv = stpAlteMieteSumme > 0
        ? stpAlteMieteSumme
        : vertragInfo.stellplatzMietsumme;

      // --- Vermietungs-Status bestimmen (Iter 41.17, 18.05.2026) ---
      // Single Source of Truth: Lookup „Miet-status (ist)" aus WE-Tabelle, gespiegelt
      // in Kalk-Stammdaten. Edgar 18.05.: vorher leitete die App aus „Vertrag + Kaltmiete>0"
      // ab — bei leerstehenden Einheiten mit Excel-Altmiete > 0 war das falsch.
      // Reihenfolge:
      //  1) Lookup-Wert (autoritativ, wenn vorhanden)
      //  2) Heuristik „Vertrag vorhanden ODER Kaltmiete>0" (Fallback)
      const kalkApi = kalkStammRecordToApi(kalkRec);
      const statusVomLookup = resolveVermietungsstatusFromLookup(kalkApi && kalkApi.weVermietungsstatusRaw);
      let statusFinal, statusQuelle;
      if (statusVomLookup) {
        statusFinal = statusVomLookup;
        statusQuelle = 'we-lookup';
      } else {
        // Audit-Fix Iter 49 (19.05.2026): Heuristik konservativer — `we.kaltmiete > 0`
        // ist UNZUVERLÄSSIG (leerstehende WEs behalten die alte Bestandsmiete im Feld).
        // Nur ein echter Mietvertragsdatensatz gilt als Vermietungs-Beweis.
        statusFinal = vertragInfo.vertragVorhanden ? 'vermietet' : 'leer';
        statusQuelle = vertragInfo.vertragVorhanden ? 'fallback-mietvertrag' : 'fallback-keine-daten';
      }

      // Letzte Mietsteigerung — Quelle-Klärung (Edgar-Doc Bug 6+7+8):
      // - status='vermietet' → erst Kalk-Stammdaten (Edgar manuell gepflegt),
      //                        sonst Mietvertrags-Anpassung (jungsteMietsteigerung),
      //                        sonst Vertragsbeginn nur wenn > 3 Jahre alt,
      //                        sonst null (Pflegelücke).
      // - status='leer'      → IMMER null.
      const kalkLetzte = (kalkRec && kalkRec.fields && kalkRec.fields[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG]) || null;
      let letzteMietsteigerung, letzteMietsteigerungQuelle;
      if (statusFinal === 'leer') {
        letzteMietsteigerung = null;
        letzteMietsteigerungQuelle = 'leerstand-keine';
      } else if (kalkLetzte) {
        letzteMietsteigerung = kalkLetzte;
        letzteMietsteigerungQuelle = 'kalk-stammdaten';
      } else if (vertragInfo.letzteMietsteigerung) {
        letzteMietsteigerung = vertragInfo.letzteMietsteigerung;
        // jetzt zwischen echter Anpassung und Vertragsbeginn-Fallback unterscheiden
        if (vertragInfo.letzteMietsteigerungIstAnpassung) {
          letzteMietsteigerungQuelle = 'mietvertrag-anpassung';
        } else if (vertragInfo.letzteMietsteigerungIstVertragsbeginn) {
          letzteMietsteigerungQuelle = 'mietvertrag-vertragsbeginn-alt';
        } else {
          letzteMietsteigerungQuelle = 'mietvertrag';
        }
      } else {
        letzteMietsteigerung = null;
        letzteMietsteigerungQuelle = 'unbekannt';
      }

      // Stellplatz-Typ-Aufteilung (Garage vs. Fläche/Stellplatz)
      const garageCount  = stellplaetze.filter(s => /garage/i.test(s.typ)).length;
      const flaecheCount = stellplaetze.length - garageCount;

      const vermietungObj = {
        status:                 statusFinal,
        statusQuelle,           // 'we-lookup' | 'fallback-...'
        vertragVorhanden:       vertragInfo.vertragVorhanden,
        letzteMietsteigerung,
        letzteMietsteigerungQuelle,
        // Iter 76 (21.05.2026): Geplante Erhöhung aus Mietvertrag (Schenki pflegt
        // bei einer unterschriebenen Vereinbarung einen neuen Mietvertrag mit
        // zukünftigem GUELTIG_AB an).
        geplanteErhoehung:      vertragInfo.geplanteErhoehung || null,
        aktuelleKaltmiete:      vertragInfo.aktuelleKaltmiete || null,
      };

      // Subvention auto + Markt-Schnitt direkt vom Backend liefern
      const subv = computeAutoSubvention(kalkApi, vermietungObj, we.qm);
      const marktSchnitt = computeMarktpreisGemittelt(kalkApi);

      // Iter-4 (21.05.2026): Auto-Subv zurück nach Airtable, damit die
      // KP-Vorschlag-Formel sie einbeziehen kann. Fire-and-forget — die Response
      // wartet nicht. Nur bei signifikanter Änderung (>5 €/Mo oder >50 € Total),
      // siehe maybeWriteBackAutoSubv. Wenn manueller Mietzuschuss gepflegt ist,
      // hat der Vorrang (computeAutoSubvention liefert dann subv.mo = manueller
      // Wert) — wir schreiben dann den manuellen Wert in die Auto-Felder, was
      // ein No-op für die Formel ist (die nutzt entweder/oder, siehe Airtable-
      // Formel-Vorlage in §IT-4 der Doku).
      maybeWriteBackAutoSubv(kalkApi, subv);

      return res.status(200).json({
        we,
        stellplaetze: {
          anzahl:        stellplaetze.length,
          garageCount,
          flaecheCount,
          kaufpreisSumme: stpKaufpreisSumme,
          mieteMoSumme:   stpMieteEffektiv,
          mieteMoQuelle:  vertragInfo.stellplatzMietsumme > 0 ? 'mietvertrag' : (stpAlteMieteSumme > 0 ? 'stellplatz-alt' : 'keine'),
          details:        stellplaetze,
        },
        vermietung: vermietungObj,
        kalkStammdaten: kalkApi,
        // Abgeleitete Werte:
        derived: {
          // Backward-Compat (Iter 41.9): Aggregat-Werte für alte Pfade
          subventionMo:     subv.mo,
          subventionMonate: subv.monate,
          subventionQuelle: subv.quelle,
          // Iter 41.10: 2-Phasen-Modell
          subventionPhasen:      subv.phasen || [],
          subventionTotalEur:    subv.totalEur || 0,
          subventionCapEur:      subv.capEur,
          subventionCapGreift:   subv.capGreift,
          subventionErlaeuterung: subv.erlaeuterung || '',
          // Iter 62/63 (20.05.2026)
          subventionTag1Erhoehung:    subv.tag1Erhoehung || false,
          subventionTag1Anhebung:     subv.tag1Anhebung || 0,
          subventionKaltmieteAdjustiert: subv.kaltmieteAdjustiert || null,
          subventionMarktCapGreift:   subv.marktCapGreift || false,
          // Iter 65 (20.05.2026): Marktmiete €/qm + umgerechnet €/Mo
          marktmieteEurQm:            subv.marktmieteEurQm || 0,
          marktmieteAbs:              subv.marktmieteAbs || 0,
          marktpreisGemittelt:        marktSchnitt.wert,
          marktpreisGemitteltQuelle:  marktSchnitt.quelle,
          // Iter 70 (21.05.2026): Vereinbarte Mieterhöhung
          subventionTag1Quelle:       subv.tag1Quelle || null, // null | 'vereinbarung' | 'iter63-annahme'
          vereinbarung:               subv.vereinbarung || null, // { datum, monateBisErhoehung, kaltmiete, anwendbar } | null
        },
      });
    }

    if (req.method === 'PUT') {
      // Schreibrechte: nur Admin
      if (session.rolle !== 'Admin') {
        return res.status(403).json({ error: 'Nur Admins dürfen Stammdaten ändern.' });
      }
      const body = await readBody(req);
      if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body fehlt' });

      // QA-Fix 2026-05-23 (Audit-BB-4): Range-Validation für sensitive Felder.
      // Vorher konnte ein Tippfehler in Airtable-UI (0,15 statt 0,85 → AfA bricht
      // zusammen, 5,0 statt 0,05 → Inflation 500%) unbemerkt durchrutschen. Jetzt:
      // klare 400-Antwort, kein Save mit absurden Werten.
      const rangeChecks = [
        { key: 'gebaeudeAnteil',   min: 0.50, max: 1.00, label: 'Gebäude-Anteil' },
        { key: 'wertsteigerung',   min: -0.05, max: 0.10, label: 'Wertsteigerung (Inflation)' },
        { key: 'hgInflation',      min: -0.05, max: 0.10, label: 'Hausgeld-Inflation' },
        { key: 'indexmiete',       min: 0,     max: 0.20, label: 'Indexmiete' },
        { key: 'mietzuschuss',     min: 0,     max: 5000, label: 'Mietzuschuss €/Mo' },
        { key: 'mietzuschussMonate', min: 0,   max: 120,  label: 'Mietzuschuss Monate' },
        { key: 'grEst',            min: 0,     max: 0.10, label: 'Grunderwerbsteuer' },
      ];
      for (const chk of rangeChecks) {
        if (body[chk.key] !== undefined && body[chk.key] !== null && body[chk.key] !== '') {
          const v = num(body[chk.key]);
          if (v != null && (v < chk.min || v > chk.max)) {
            return res.status(400).json({
              error: `${chk.label} außerhalb plausibler Range`,
              hint: `Erwartet ${chk.min} bis ${chk.max}, erhalten ${v}. Wenn das beabsichtigt ist, bitte beim Admin melden.`
            });
          }
        }
      }
      // QA-Fix 2026-05-23 (Audit-BB-9): letzteMietsteigerung darf nicht in der
      // Zukunft liegen. Tippfehler (2030 statt 2024) verfälscht monateSeit → 0
      // → Engine erwartet erste Erhöhung erst Jahr 4. Plausibilitäts-Check.
      if (body.letzteMietsteigerung) {
        const d = new Date(body.letzteMietsteigerung);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ error: 'Letzte Mietsteigerung — Datums-Format ungültig (YYYY-MM-DD erwartet)' });
        }
        const heute = new Date();
        if (d.getTime() > heute.getTime() + 24*60*60*1000) {
          return res.status(400).json({
            error: 'Letzte Mietsteigerung darf nicht in der Zukunft liegen',
            hint: `Erhalten: ${body.letzteMietsteigerung}. Erwartet: ein Datum aus der Vergangenheit.`
          });
        }
        // Plausibilitäts-Untergrenze: 30 Jahre zurück
        const minDate = new Date(heute.getFullYear() - 30, heute.getMonth(), heute.getDate());
        if (d.getTime() < minDate.getTime()) {
          return res.status(400).json({
            error: 'Letzte Mietsteigerung liegt > 30 Jahre zurück — vermutlich Tippfehler',
            hint: `Erhalten: ${body.letzteMietsteigerung}. Wenn beabsichtigt, bitte beim Admin melden.`
          });
        }
      }

      // Existierenden Datensatz finden (egal welcher Status)
      const existing = await loadKalkStammdatenForWE(weId);

      // Body → Airtable-Field-IDs (nur gesetzte Felder)
      // Iter 45 (19.05.2026): Reihenfolge gefixt — fields VOR Aktiv-Validierung, sonst ReferenceError.
      const fields = {};
      if (body.status !== undefined)                fields[KALK_STAMMDATEN_FIELDS.STATUS]               = body.status;
      if (body.hausverwaltung !== undefined)        fields[KALK_STAMMDATEN_FIELDS.HAUSVERWALTUNG]       = num(body.hausverwaltung);
      if (body.hausgeldRuecklage !== undefined)     fields[KALK_STAMMDATEN_FIELDS.HAUSGELD_RUECKLAGE]   = num(body.hausgeldRuecklage);
      if (body.mietverwaltungDefault !== undefined) fields[KALK_STAMMDATEN_FIELDS.MIETVERWALTUNG_DEF]   = num(body.mietverwaltungDefault);
      if (body.mietzuschuss !== undefined)          fields[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS]         = num(body.mietzuschuss);
      if (body.mietzuschussMonate !== undefined)    fields[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS_MONATE]  = num(body.mietzuschussMonate);
      if (body.afaGutachten !== undefined)          fields[KALK_STAMMDATEN_FIELDS.AFA_GUTACHTEN]        = num(body.afaGutachten);
      if (body.wertsteigerung !== undefined)        fields[KALK_STAMMDATEN_FIELDS.WERTSTEIGERUNG]       = num(body.wertsteigerung);
      if (body.vermietungsModus !== undefined)      fields[KALK_STAMMDATEN_FIELDS.VERMIETUNGS_MODUS]    = body.vermietungsModus;
      if (body.kappungsgrenze !== undefined)        fields[KALK_STAMMDATEN_FIELDS.KAPPUNGSGRENZE]       = body.kappungsgrenze;
      if (body.indexmiete !== undefined)            fields[KALK_STAMMDATEN_FIELDS.INDEXMIETE]           = num(body.indexmiete);
      if (body.letzteMietsteigerung !== undefined)  fields[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG] = body.letzteMietsteigerung || null;
      if (body.grEst !== undefined)                 fields[KALK_STAMMDATEN_FIELDS.GRESt]                = num(body.grEst);
      if (body.gebaeudeAnteil !== undefined)        fields[KALK_STAMMDATEN_FIELDS.GEBAEUDE_ANTEIL]      = num(body.gebaeudeAnteil);
      if (body.hgInflation !== undefined)           fields[KALK_STAMMDATEN_FIELDS.HG_INFLATION]         = num(body.hgInflation);
      if (body.notizen !== undefined)               fields[KALK_STAMMDATEN_FIELDS.NOTIZEN]              = body.notizen || '';
      // Iter 41.9 — neue Felder
      if (body.mieteBeiVerkauf !== undefined)       fields[KALK_STAMMDATEN_FIELDS.MIETE_BEI_VERKAUF]    = num(body.mieteBeiVerkauf);
      if (body.marktpreisImmoscout !== undefined)   fields[KALK_STAMMDATEN_FIELDS.MARKTPREIS_IS]        = num(body.marktpreisImmoscout);
      if (body.marktpreisHomeday !== undefined)     fields[KALK_STAMMDATEN_FIELDS.MARKTPREIS_HD]        = num(body.marktpreisHomeday);
      // Iter 41.10
      if (body.marktmiete !== undefined)            fields[KALK_STAMMDATEN_FIELDS.MARKTMIETE]           = num(body.marktmiete);

      // Iter 41.16 (Audit-Fix #14): Pflichtfeld-Validierung beim Aktiv-Setzen.
      // Eine WE darf nur dann auf Status=Aktiv gesetzt werden, wenn die für den
      // Vertriebs-Pitch zwingend benötigten Felder gepflegt sind.
      if (body.status === KALK_STATUS_AKTIV) {
        const merged = Object.assign({}, existing ? (existing.fields || {}) : {}, fields);
        const missing = [];
        const mbv = num(merged[KALK_STAMMDATEN_FIELDS.MIETE_BEI_VERKAUF]);
        const marktmiete = num(merged[KALK_STAMMDATEN_FIELDS.MARKTMIETE]);
        const marktIs = num(merged[KALK_STAMMDATEN_FIELDS.MARKTPREIS_IS]);
        const marktHd = num(merged[KALK_STAMMDATEN_FIELDS.MARKTPREIS_HD]);
        const vermObj = merged[KALK_STAMMDATEN_FIELDS.VERMIETUNGS_MODUS];
        const vermietungsModusName = vermObj && typeof vermObj === 'object' ? vermObj.name : vermObj;
        const letzteMietsteig = merged[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG];

        if (!mbv || mbv <= 0) missing.push('Miete bei Verkauf');
        if (!marktmiete || marktmiete <= 0) missing.push('Marktmiete');
        if ((!marktIs || marktIs <= 0) && (!marktHd || marktHd <= 0))
          missing.push('Marktpreis (ImmoScout oder Homeday — mindestens einer)');
        if (!vermietungsModusName) missing.push('Vermietungs-Modus');
        if (vermietungsModusName === 'Bestand' && !letzteMietsteig)
          missing.push('Letzte Mietsteigerung (Pflicht bei Modus Bestand)');

        if (missing.length > 0) {
          return res.status(400).json({
            error: 'Pflichtfelder fehlen — die WE darf nicht auf Aktiv gesetzt werden',
            missingFields: missing,
            hint: 'Bitte fehlende Felder in Airtable pflegen und erneut speichern.',
          });
        }
      }

      // Quelle automatisch setzen: "App-Edit {VertrieblerName} {YYYY-MM-DD}"
      const datum = new Date().toISOString().slice(0, 10);
      fields[KALK_STAMMDATEN_FIELDS.QUELLE] = `App-Edit ${session.email || 'unbekannt'} ${datum}`;

      let updatedRec;
      if (existing) {
        if (body.status === KALK_STATUS_AKTIV) {
          await archiveOtherAktivForWE(weId, existing.id);
        }
        updatedRec = await airtable('update', TABLES.KALK_STAMMDATEN, { recordId: existing.id, fields });
      } else {
        // Neu anlegen — wenn keiner existiert
        if (body.status === KALK_STATUS_AKTIV) {
          await archiveOtherAktivForWE(weId, null);
        }
        const createFields = Object.assign({}, fields, {
          [KALK_STAMMDATEN_FIELDS.BEZEICHNUNG]: body.bezeichnung || `WE ${weId.slice(-6)}`,
          [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]: [weId],
        });
        updatedRec = await airtable('create', TABLES.KALK_STAMMDATEN, { fields: createFields });
      }
      return res.status(200).json({ ok: true, kalkStammdaten: kalkStammRecordToApi(updatedRec) });
    }

    return methodNotAllowed(res, ['GET', 'PUT']);
  } catch (e) {
    return sendError(res, e);
  }
};

// Archiviert alle Aktiv-Datensätze für eine WE außer dem aktuellen.
async function archiveOtherAktivForWE(weId, exceptId) {
  try {
    const recs = await listAll(TABLES.KALK_STAMMDATEN, {
      fields: [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT, KALK_STAMMDATEN_FIELDS.STATUS],
    }, 1000);
    const others = recs.filter(r => {
      if (r.id === exceptId) return false;
      const s = r.fields && r.fields[KALK_STAMMDATEN_FIELDS.STATUS];
      const name = s && typeof s === 'object' ? s.name : s || '';
      if (name !== KALK_STATUS_AKTIV) return false;
      const link = (r.fields && r.fields[KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]) || [];
      return Array.isArray(link) && link.some(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        return id === weId;
      });
    });
    for (const r of others) {
      await airtable('update', TABLES.KALK_STAMMDATEN, {
        recordId: r.id,
        fields: { [KALK_STAMMDATEN_FIELDS.STATUS]: KALK_STATUS_ARCHIV },
      });
    }
  } catch (e) {
    console.error('archiveOtherAktivForWE failed:', e.message);
  }
}

// Iter-4 (22.05.2026): Exports für refresh-all-Endpoint.
// Vercel-Serverless-Pattern: module.exports ist die Handler-Function, aber wir
// hängen die internen Helper als Properties dran, damit api/stammdaten/refresh-all.js
// sie wiederverwenden kann — ohne Code-Dup.
module.exports.computeAutoSubvention      = computeAutoSubvention;
module.exports.loadKalkStammdatenForWE    = loadKalkStammdatenForWE;
module.exports.loadMietvertragInfoForWE   = loadMietvertragInfoForWE;
module.exports.kalkStammRecordToApi       = kalkStammRecordToApi;
module.exports.resolveVermietungsstatusFromLookup = resolveVermietungsstatusFromLookup;
module.exports.maybeWriteBackAutoSubv     = maybeWriteBackAutoSubv;
module.exports.computeMarktpreisGemittelt = computeMarktpreisGemittelt;
