// POST /api/stammdaten/refresh-all
//
// Iter-4 Auto-Refresh (22.05.2026):
//   Iteriert über alle aktiven Kalk-Stammdaten-Records, berechnet pro WE die
//   Auto-Subvention (computeAutoSubvention) und schreibt sie zurück nach Airtable
//   (maybeWriteBackAutoSubv). Damit kann Edgar/Henry alle Bruchsal-WEs mit
//   einem einzigen Klick refreshen, statt jede WE einzeln in der App zu öffnen.
//
// Nur Admin. Antwort enthält pro WE: alte vs. neue Subv-Werte.
//
// Performance: ~14 aktive WEs × (loadKalkStammdatenForWE + loadMietvertragInfoForWE
// + Stellplatz-Filter + Write-back) = ~15-30 Sek serielle Laufzeit (Airtable-IO ist
// langsam). Vercel-Serverless-Timeout ist Default 10 Sek — daher pageSize-Limit:
// erst maxRecords aktive WEs, jeder Write-back fire-and-forget.

const { verifySession } = require('../_lib/auth');
const { airtable, listAll } = require('../_lib/airtable');
const { methodNotAllowed, sendError } = require('../_lib/http');
const {
  TABLES,
  WE_FIELDS,
  STELLPLATZ_FIELDS,
  KALK_STAMMDATEN_FIELDS,
  KALK_STATUS_AKTIV,
  KALK_STATUS_ENTWURF,
} = require('../_lib/tables');

// Helper-Imports aus dem [weId]-Endpoint (Iter-4-exports).
const weEndpoint = require('./[weId]');
const {
  computeAutoSubvention,
  loadMietvertragInfoForWE,
  kalkStammRecordToApi,
  resolveVermietungsstatusFromLookup,
  maybeWriteBackAutoSubv,
} = weEndpoint;

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return methodNotAllowed(res, ['POST', 'GET']);
  }

  // Iter-4 (22.05.2026): Zwei Auth-Wege.
  //  1. Admin-Session-Cookie (manueller Aufruf via Browser)
  //  2. Vercel-Cron — entweder Bearer-Token CRON_SECRET oder Header x-vercel-cron
  //
  // QA-Fix 2026-05-22 (Audit-D B4): Vercel-Cron sendet automatisch
  // `Authorization: Bearer <CRON_SECRET>` NUR wenn CRON_SECRET als Env-Var
  // gesetzt ist. Außerdem sendet Vercel den Header `x-vercel-cron: 1` IMMER
  // bei Cron-getriggerten Calls (Vercel-internal, nicht von außen setzbar).
  // Vorher: ohne CRON_SECRET liefen die Cron-Calls in den Session-Pfad und
  // failten mit 401 → die 3× tägliche Auto-Subv-Refresh lief faktisch nicht.
  // FS-3c (Audit Backend-Security P2 25.05.2026): wenn CRON_SECRET gesetzt ist,
  // MUSS der Bearer das matchen — Header allein reicht dann nicht (Header
  // theoretisch spoofbar über Vercel-Edge). Nur wenn CRON_SECRET nicht gesetzt
  // ist, fallback auf Header-only (Dev/lokal).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = (req.headers && req.headers.authorization) || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const istCronBySecret = cronSecret && bearerMatch && bearerMatch[1] === cronSecret;
  const istCronByHeader = !!(req.headers && (req.headers['x-vercel-cron'] === '1' || req.headers['x-vercel-cron'] === 1));
  const istCron = cronSecret ? istCronBySecret : istCronByHeader;

  if (!istCron) {
    const session = verifySession(req);
    if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
    if (session.rolle !== 'Admin') {
      return res.status(403).json({ error: 'Nur Admins dürfen alle WEs neu berechnen.' });
    }
  }

  // Leer-Flag (Edgar 04.06.2026): Aktive Kalk-Stammdaten, deren WE inzwischen LEER ist
  // (Mietvertrag nicht mehr aktiv → Vermietung/Stellplatz fallen aus der Kalkulation),
  // werden gemeldet. Erst-Lauf = nur Liste (report-only). Mit ?flagLeer=1 wird der Status
  // zusätzlich auf Entwurf gesetzt + Notiz geschrieben — Re-Flag ausgeschlossen, weil die
  // Zeile danach nicht mehr 'Aktiv' ist und somit nicht mehr in `aktive` landet.
  const flagLeerSchreiben = !!(req.query && (req.query.flagLeer === '1' || req.query.flagLeer === 1));

  try {
    // Iter-4: nur aktive Stammdaten neu berechnen (Vermarktungs-Liste).
    const stammRecs = await listAll(TABLES.KALK_STAMMDATEN, {
      fields: Object.values(KALK_STAMMDATEN_FIELDS),
    }, 2000);

    const aktive = stammRecs.filter(r => {
      const s = r.fields && r.fields[KALK_STAMMDATEN_FIELDS.STATUS];
      const name = s && typeof s === 'object' ? s.name : s || '';
      return name === KALK_STATUS_AKTIV;
    });

    if (aktive.length === 0) {
      return res.status(200).json({ ok: true, anzahl: 0, ergebnisse: [], message: 'Keine aktiven Stammdaten gefunden.' });
    }

    // Pro aktivem Stammdaten-Record: WE + Stellplätze + Mietverträge laden + Subv-Berechnung + Write-back.
    // Wir laden die nötigen Bulk-Daten einmal (Stellplätze, Mietverträge), filtern dann clientseitig pro WE.
    const [stplRecs] = await Promise.all([
      listAll(TABLES.STELLPLATZ, {
        fields: [STELLPLATZ_FIELDS.WE_LINK, STELLPLATZ_FIELDS.KAUFPREIS, STELLPLATZ_FIELDS.MIETKOSTEN, STELLPLATZ_FIELDS.TYP],
      }, 2000),
    ]);

    const ergebnisse = [];
    const leerFlags = []; // aktive Stammdaten, deren WE inzwischen leer ist

    // Sequenziell durchgehen (parallel würde Airtable-Rate-Limit reißen).
    for (const stammRec of aktive) {
      const kalkApi = kalkStammRecordToApi(stammRec);
      if (!kalkApi || !kalkApi.id) continue;

      // WE-Link aus Stammdaten holen
      const weLink = (stammRec.fields && stammRec.fields[KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]) || [];
      const weIdRaw = Array.isArray(weLink) && weLink.length > 0
        ? (typeof weLink[0] === 'object' ? weLink[0].id : weLink[0])
        : null;
      if (!weIdRaw) {
        ergebnisse.push({ kalkId: kalkApi.id, bezeichnung: kalkApi.bezeichnung, ok: false, reason: 'keine WE-Verlinkung' });
        continue;
      }

      try {
        // WE-Record laden (für qm, Status)
        const weRec = await airtable('get', TABLES.WOHNEINHEIT, { recordId: weIdRaw });
        const weQm = num((weRec.fields || {})[WE_FIELDS.QM]) || 0;

        // Stellplätze zu dieser WE (für Pro-rata)
        const weStpIds = stplRecs
          .filter(r => {
            const link = (r.fields && r.fields[STELLPLATZ_FIELDS.WE_LINK]) || [];
            return Array.isArray(link) && link.some(x => {
              const id = (x && typeof x === 'object' && x.id) ? x.id : x;
              return id === weIdRaw;
            });
          })
          .map(r => r.id);

        // Mietvertrag-Info (für Vermietungs-Status, geplante Erhöhung, Stellplatzmiete)
        const vertragInfo = await loadMietvertragInfoForWE(weIdRaw, weStpIds);

        // Vermietungs-Status aus Lookup (oder Fallback)
        const lookupStatus = resolveVermietungsstatusFromLookup(kalkApi.weVermietungsstatusRaw);
        let statusFinal;
        if (lookupStatus === 'vermietet') statusFinal = 'vermietet';
        else if (lookupStatus === 'leer') statusFinal = 'leer';
        else statusFinal = vertragInfo.vertragVorhanden ? 'vermietet' : 'leer';

        const vermietungObj = {
          status:                 statusFinal,
          vertragVorhanden:       vertragInfo.vertragVorhanden,
          letzteMietsteigerung:   vertragInfo.letzteMietsteigerung,
          geplanteErhoehung:      vertragInfo.geplanteErhoehung || null,
          aktuelleKaltmiete:      vertragInfo.aktuelleKaltmiete || null,
        };

        // Subv berechnen
        const subv = computeAutoSubvention(kalkApi, vermietungObj, weQm);

        // Write-back (fire-and-forget, intern in maybeWriteBackAutoSubv)
        maybeWriteBackAutoSubv(kalkApi, subv);

        // Leer-Flag: aktive Stammdaten-Zeile, aber WE ist jetzt leer (Mietvertrag nicht mehr aktiv).
        if (statusFinal === 'leer') {
          const flagEintrag = { kalkId: kalkApi.id, weId: weIdRaw, bezeichnung: kalkApi.bezeichnung, geflaggt: false };
          if (flagLeerSchreiben) {
            try {
              const prevNotiz = (stammRec.fields || {})[KALK_STAMMDATEN_FIELDS.NOTIZEN] || '';
              const marker = `[Auto ${new Date().toISOString().slice(0, 10)}] Auf Entwurf gesetzt: Vermietung/Stellplatz entfallen (Mietvertrag nicht mehr aktiv) — bitte prüfen.`;
              await airtable('update', TABLES.KALK_STAMMDATEN, {
                recordId: kalkApi.id,
                fields: {
                  [KALK_STAMMDATEN_FIELDS.STATUS]: KALK_STATUS_ENTWURF,
                  [KALK_STAMMDATEN_FIELDS.NOTIZEN]: prevNotiz ? (marker + '\n' + prevNotiz) : marker,
                },
              });
              flagEintrag.geflaggt = true;
            } catch (e) {
              flagEintrag.flagFehler = e.message;
            }
          }
          leerFlags.push(flagEintrag);
        }

        ergebnisse.push({
          kalkId: kalkApi.id,
          weId: weIdRaw,
          bezeichnung: kalkApi.bezeichnung,
          ok: true,
          alteSubvMo:    kalkApi.autoSubvMo || 0,
          alteSubvTotal: kalkApi.autoSubvTotal || 0,
          neueSubvMo:    Math.round((subv.mo || 0) * 100) / 100,
          neueSubvTotal: Math.round((subv.totalEur || 0) * 100) / 100,
          quelle:        subv.quelle,
        });
      } catch (e) {
        ergebnisse.push({
          kalkId: kalkApi.id,
          weId: weIdRaw,
          bezeichnung: kalkApi.bezeichnung,
          ok: false,
          reason: e.message,
        });
      }
    }

    const erfolg = ergebnisse.filter(e => e.ok).length;
    const fehler = ergebnisse.length - erfolg;
    const veraendert = ergebnisse.filter(e => e.ok && (
      Math.abs((e.neueSubvMo || 0) - (e.alteSubvMo || 0)) > 0.5 ||
      Math.abs((e.neueSubvTotal || 0) - (e.alteSubvTotal || 0)) > 5
    )).length;

    return res.status(200).json({
      ok: true,
      anzahl: aktive.length,
      erfolg,
      fehler,
      veraendert,
      // Leer-Flag-Report: WEs, die auf 'Aktiv' stehen, aber leer sind (Mietvertrag nicht mehr aktiv).
      leerFlagsAnzahl: leerFlags.length,
      leerFlagGeschrieben: flagLeerSchreiben, // true = Status wurde auf Entwurf gesetzt; false = nur gemeldet
      leerFlags,
      hinweis: 'Write-back ist fire-and-forget — die Airtable-Updates können bis zu 1-2 Sek nach dieser Response abgeschlossen sein. Leer-Flag: ohne ?flagLeer=1 nur Report, mit ?flagLeer=1 wird Status auf Entwurf gesetzt.',
      ergebnisse,
    });
  } catch (e) {
    return sendError(res, e);
  }
};
