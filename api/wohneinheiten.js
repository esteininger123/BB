// GET /api/wohneinheiten — Liste freier Wohneinheiten (B&B Immo GmbH).
//
// Filter: {Status} = 'Vermarktung / Im Verkauf' UND {Maklerfirma} = 'B&B Immo GmbH'

const { verifySession, isExtern } = require('./_lib/auth');
const { externPreis, loadProvisionPct, ladeStellplatzKpSummen } = require('./_lib/extern');
const { airtable, listAll } = require('./_lib/airtable');
const { methodNotAllowed, sendError } = require('./_lib/http');
const {
  TABLES, WE_FIELDS, PROJEKT_FIELDS, PROJEKT_HEAD_FIELDS,
  KALK_STAMMDATEN_FIELDS, KALK_STATUS_AKTIV,
  weStatusSichtbarFormula, maklerFirmaFormula
} = require('./_lib/tables');
const { weRecordToApi } = require('./_lib/mappers');

// Versucht Projekt-Namen aus den verlinkten Records zu laden.
// Toleriert Fehler (z.B. wenn Projekt-Tabelle anders heißt) und liefert leeres Mapping.
// Mapping: Projekt-Code aus Airtable → kundenfreundlicher Projekt-Name.
// Mapping Projekt-Code (aus Airtable PROJEKT_HEAD.CODE) → kundenfreundliche
// Bezeichnung. Stand 18.05.2026, abgeglichen mit allen 32 Projekt-Codes in Airtable.
// Iter 41.14: zuvor waren Bezeichnungen wie "KARL_RUMM6" oder "LAHR_GÄRT20" als
// Raw-Codes im UI sichtbar, weil das Mapping nicht zu Airtable passte.
const PROJEKT_PRETTY = {
  // === In Vermarktung / aktiv im Vertrieb ===
  'BRUCH_HEID_21':            'Heidelberger Str. 21, Bruchsal',
  'WES_RHEIN 290/292':        'Wesseling, Rheinstr. 290+292',
  'SAN_NOR10':                'Sandweier, Nordring 10',
  '21. LIM_ALTST_5':          'Limeshain, Altenstädter Weg 5',
  'Wald_Theo_Heu 13-19':      'Waldkirch, Theodor-Heuss-Str. 13–19',
  'KARL_RUMM6':               'Karlsruhe, Rummelsburger Str. 6',
  'PFAFF_GEO-HIP_28':         'Pfaffenhofen, Georg-Hipp-Str. 28',
  'LAHR_GÄRT20':              'Lahr, Gärtnerstraße 20',
  'SINZ_KORN7':               'Sinzheim, Kornblumenweg 7',
  'OG_AUG-HU_4':              'Offenburg, August-Hund-Str. 4',
  'BAD_MÜHL5':                'Baden-Baden, Am Mühlwäldle 5',
  // === Übriger Bestand (für Live-Schaltung später) ===
  'MÜLL_VOG 10,12':           'Müllheim, Vogesenstraße 10+12',
  'FR-KAP_PETER_9':           'Freiburg-Kappel, Peterstal 9',
  'Rheinsh 1+3_Bruchsal':     'Rheinsheimer Str. 1+3, Bruchsal',
  'LABOE_HEIK 12-14':         'Laboe, Heikendorfer Weg 12–14',
  'GUS_WER33':                'Gusterath, Werthstraße 33',
  'OG_RAB_9-13':              'Offenburg, Rabenstraße 9–13',
  ' MARKTH_SUED_3_5_5A':      'Marktheidenfeld, Süd 3+5+5A',
  'OG_HIND6':                 'Offenburg, Hindenburgstraße 6',
  'MECK_ZUZENH_51-53':        'Meckesheim, Zuzenhauser Str. 51–53',
  'ILLIN_KURZ_STR_4':         'Illingen, Kurze Straße 4',
  'SINZ_KART80':              'Sinzheim, Kartungstraße 80',
  'KARL_SCHNEI22C':           'Karlsruhe, Schneidemühler Str. 22C',
  'DINK_HOF21':               'Dinkelsbühl, Hoffeldweg 21',
  'OG_KOLP27':                'Offenburg, Kolpingstraße 27',
  'STE_ENGEL7':               'Steinfeld, Engelstraße 7',
  'KEHL_BER6':                'Kehl, Bergstraße 6',
  'RHEIN_KRO18A':             'Rheinfelden, Kronenstraße 18A',
  'OG_TAN_23-25':             'Offenburg, Tannenweg 23–25',
  'KITZ_MOZ 4&4a':            'Kitzingen, Mozartstraße 4 + 4a',
  'FRIES_IM_BÖLD':            'Friesenheim, Im Böldele',
  'URL_RUNZ1 (Darstellung)':  'Urloffen, Runzweg 1 (Darstellung)',
};

// Fallback: wenn der Code im Mapping fehlt, transformiere ihn lesbarer.
// Unterstriche zu Leerzeichen, bekannte Stadt-Präfixe ausschreiben.
const STADT_PRAEFIXE = {
  'BRUCH_':   'Bruchsal, ',
  'WES_':     'Wesseling, ',
  'SAN_':     'Sandweier, ',
  'LIM_':     'Limeshain, ',
  'WALDK_':   'Waldkirch, ',
  'KARL_':    'Karlsruhe, ',
  'KA_':      'Karlsruhe, ',
  'PFAFF_':   'Pfaffenhofen, ',
  'LAHR_':    'Lahr, ',
  'SINZ_':    'Sinzheim, ',
  'OG_':      'Offenburg, ',
  'BAD_':     'Baden-Baden, ',
  'MÜLL_':    'Müllheim, ',
  'GUS_':     'Gusterath, ',
  'MECK_':    'Meckesheim, ',
  'ILLIN_':   'Illingen, ',
  'DINK_':    'Dinkelsbühl, ',
  'STE_':     'Steinfeld, ',
  'KEHL_':    'Kehl, ',
  'RHEIN_':   'Rheinfelden, ',
  'KITZ_':    'Kitzingen, ',
  'FRIES_':   'Friesenheim, ',
  'URL_':     'Urloffen, ',
  'MARKTH_':  'Marktheidenfeld, ',
  'LABOE_':   'Laboe, ',
};

function beautifyProjektName(rawNameOrCode) {
  if (!rawNameOrCode) return '';
  // Akzeptiert "PR: 17, WES_RHEIN 290/292" oder direkt "WES_RHEIN 290/292"
  const stripped = String(rawNameOrCode).replace(/^PR:\s*\d+,\s*/, '').trim();
  if (PROJEKT_PRETTY[stripped]) return PROJEKT_PRETTY[stripped];
  // Fallback: bekanntes Stadt-Präfix ausschreiben, Rest als Adress-Hinweis lesbar machen
  for (const prefix in STADT_PRAEFIXE) {
    if (stripped.startsWith(prefix)) {
      const rest = stripped.slice(prefix.length).replace(/_/g, ' ').trim();
      return STADT_PRAEFIXE[prefix] + rest;
    }
  }
  return stripped;
}

// Mapping Objekt-ID → Projekt-Name.
// Schritt 1: Objekte laden → für jedes Objekt die Projekt-IDs sammeln (Linked-Records sind
//            in der Airtable-REST-API reine String-IDs).
// Schritt 2: Projekte aus PROJEKT_HEAD-Tabelle laden → Code-Field zu lesbarem Namen mappen.
// Schritt 3: Objekt-ID → Projekt-Name verbinden.
async function loadProjektNames(objektIds) {
  const ids = [...new Set(objektIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const objektTable = process.env.PROJEKT_TABLE_ID || TABLES.PROJEKT;
  if (!objektTable) return {};
  try {
    // --- Schritt 1: Objekt-Records → Projekt-Link-ID ---
    const objektFormula = 'OR(' + ids.map(id => `RECORD_ID()='${id}'`).join(',') + ')';
    const objektRecords = await listAll(objektTable, {
      filterByFormula: objektFormula,
      fields: [PROJEKT_FIELDS.PROJEKT_LINK],
      maxRecords: ids.length
    }, ids.length);

    const objektToProjektId = {};
    const projektIds = new Set();
    objektRecords.forEach(r => {
      const f = r.fields || {};
      const projektLink = f[PROJEKT_FIELDS.PROJEKT_LINK];
      let pid = null;
      if (Array.isArray(projektLink) && projektLink.length > 0) {
        const first = projektLink[0];
        // REST-API: String-ID. MCP-Variante: {id, name}-Object → defensiv beides.
        pid = (first && typeof first === 'object' && first.id) ? first.id
            : (typeof first === 'string' ? first : null);
      }
      if (pid) {
        objektToProjektId[r.id] = pid;
        projektIds.add(pid);
      }
    });

    if (projektIds.size === 0) return {};

    // --- Schritt 2: Projekte aus PROJEKT_HEAD laden ---
    const pidArr = Array.from(projektIds);
    const projektFormula = 'OR(' + pidArr.map(id => `RECORD_ID()='${id}'`).join(',') + ')';
    const projektRecords = await listAll(TABLES.PROJEKT_HEAD, {
      filterByFormula: projektFormula,
      fields: [PROJEKT_HEAD_FIELDS.CODE, PROJEKT_HEAD_FIELDS.PRIMARY],
      maxRecords: pidArr.length
    }, pidArr.length);

    const projektIdToName = {};
    projektRecords.forEach(r => {
      const f = r.fields || {};
      const raw = f[PROJEKT_HEAD_FIELDS.CODE] || f[PROJEKT_HEAD_FIELDS.PRIMARY] || '';
      projektIdToName[r.id] = beautifyProjektName(raw);
    });

    // --- Schritt 3: Objekt-ID → Projekt-Name ---
    const map = {};
    Object.keys(objektToProjektId).forEach(objektId => {
      const pid = objektToProjektId[objektId];
      map[objektId] = projektIdToName[pid] || '';
    });
    return map;
  } catch (e) {
    console.error('loadProjektNames failed:', e.message);
    return {};
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  try {
    // Iter 41.9 (17.05.2026) — Henry-Feedback:
    // Datenquelle des Kalkulators war zu breit (Makler-Einheiten + Eigennutzer-Verkäufe
    // erschienen mit). Neuer Filter: nur WEs, für die in Kalkulations-Stammdaten ein
    // Datensatz mit Status=Aktiv existiert. So entscheidet Henry pro WE explizit, ob
    // sie im KAV gezeigt wird.
    //
    // Step 1: Alle aktiven Stammdaten-Records laden → daraus die verlinkten WE-IDs sammeln.
    // Step 2: WE-Tabelle abfragen mit Vermarktung + Firma=B&B Immo + WE-ID in der Aktiv-Liste.

    // --- Step 1: aktive Stammdaten holen ---
    // Iter 53: Admin kann mit ?all=1 alle Vermarktungs-WEs sehen (auch ohne Aktiv-Stammdaten).
    // Pro WE wird ein Flag `inStammdatenAktiv` mitgeliefert.
    const showAll = (req.query && (req.query.all === '1' || req.query.all === 'true')) && session.rolle === 'Admin';
    const stammdatenRecords = await listAll(TABLES.KALK_STAMMDATEN, {
      filterByFormula: `{${KALK_STAMMDATEN_FIELDS.STATUS}}='${KALK_STATUS_AKTIV}'`,
      fields: [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT, KALK_STAMMDATEN_FIELDS.EXTERN_FREIGABE],
      pageSize: 100
    }, 1000);

    const aktiveWeIds = new Set();
    stammdatenRecords.forEach(r => {
      // 06.07.2026 (Henry): Externe sehen nur explizit freigegebene Einheiten
      // (Checkbox „Extern freigegeben" in den Kalk-Stammdaten, Admin-Bereich).
      if (isExtern(session) && !(r.fields || {})[KALK_STAMMDATEN_FIELDS.EXTERN_FREIGABE]) return;
      const links = (r.fields || {})[KALK_STAMMDATEN_FIELDS.WOHNEINHEIT] || [];
      if (!Array.isArray(links)) return;
      links.forEach(link => {
        const id = (link && typeof link === 'object' && link.id) ? link.id : (typeof link === 'string' ? link : null);
        if (id) aktiveWeIds.add(id);
      });
    });

    // Wenn keine WE auf Aktiv UND nicht showAll → leeres Array zurückgeben
    if (aktiveWeIds.size === 0 && !showAll) {
      return res.status(200).json([]);
    }

    // Status ist Single-Select → exakter Vergleich.
    // Firma-Feld auf der Wohneinheit ist ein Lookup vom Projekt → "Firma (from Projekt) (from Objekt)".
    // Lookups geben Arrays zurück → FIND() + ARRAYJOIN(). Auch Trailing-Spaces wie
    // "B&B Immo GmbH  " sind dank FIND() unproblematisch.
    //
    // Wenn doch ein Filter nötig ist (z.B. Demo-Modus), kann WOHNEINHEIT_OBJEKT_FILTER
    // als Env-Var gesetzt werden — kommagetrennte Substring-Liste auf {Titel}.
    const objektFilterRaw = process.env.WOHNEINHEIT_OBJEKT_FILTER || '';
    const objektTokens = objektFilterRaw.split(',').map(s => s.trim()).filter(Boolean);
    const objektFormula = objektTokens.length === 1
      ? `FIND('${objektTokens[0]}', {Titel})>0`
      : objektTokens.length > 1
        ? 'OR(' + objektTokens.map(t => `FIND('${t}', {Titel})>0`).join(', ') + ')'
        : 'TRUE()';

    // WE-ID-Filter aus aktiven Stammdaten (nur wenn nicht showAll)
    // Iter 53: showAll Admin-Modus → keinen WE-ID-Filter, dafür alle Vermarktungs-WEs
    const weIdArr = Array.from(aktiveWeIds);
    let formula;
    if (showAll) {
      formula = `AND(${weStatusSichtbarFormula()}, ${maklerFirmaFormula()}, ${objektFormula})`;
    } else {
      const weIdFormula = 'OR(' + weIdArr.map(id => `RECORD_ID()='${id}'`).join(', ') + ')';
      formula = `AND(${weStatusSichtbarFormula()}, ${maklerFirmaFormula()}, ${objektFormula}, ${weIdFormula})`;
    }

    const fields = [
      WE_FIELDS.LAGE_BEZ,
      WE_FIELDS.WE_NR,
      WE_FIELDS.LAGE_TEXT,
      WE_FIELDS.KAUFPREIS,
      WE_FIELDS.QM,
      WE_FIELDS.KALTMIETE,
      WE_FIELDS.QM_PREIS,
      WE_FIELDS.PROJEKT,
      WE_FIELDS.OBJEKTVORSTELLUNG, // Iter 51 — Link für Vertriebler
      WE_FIELDS.STATUS,            // 05.06.2026 — für Reserviert/Notartermin-Markierung im Frontend
    ];

    const records = await listAll(TABLES.WOHNEINHEIT, {
      filterByFormula: formula,
      fields,
      pageSize: 100
    }, 2000);

    // Linked-Records kommen als String-IDs ODER als [{id, name}]-Objects — beides flatten.
    const projektIds = records.flatMap(r => {
      const links = (r.fields && r.fields[WE_FIELDS.PROJEKT]) || [];
      if (!Array.isArray(links)) return [];
      return links.map(x => (x && typeof x === 'object' && x.id) ? x.id : x).filter(Boolean);
    });
    const projektMap = await loadProjektNames(projektIds);

    // Iter 53: pro WE Flag inStammdatenAktiv für die Admin-Trennung in 2 Tabellen
    const out = records.map(r => {
      const mapped = weRecordToApi(r, projektMap);
      mapped.inStammdatenAktiv = aktiveWeIds.has(r.id);
      // WE-Status mitliefern (singleSelect → {name} oder String) für die Reserviert/Notartermin-Markierung.
      const st = r.fields && r.fields[WE_FIELDS.STATUS];
      mapped.status = (st && typeof st === 'object') ? st.name : (st || null);
      return mapped;
    });

    // 06.07.2026 (Henry) — Externer Vertrieb: Kundenpreis statt Abgabepreis.
    // Die Liste selbst lädt keine Stellplätze, die Provisions-Basis ist aber
    // Wohnung + Stellplatz → KP-Summen separat holen (nur für Extern-Sessions).
    if (isExtern(session)) {
      const [prov, stplKpByWe] = await Promise.all([
        loadProvisionPct(session),
        ladeStellplatzKpSummen(),
      ]);
      out.forEach(w => {
        const e = externPreis(w.kp, stplKpByWe[w.id] || 0, prov);
        w.kp = e.kp;
        if (w.qm > 0) w.qmPreis = Math.round((e.kp / w.qm) * 100) / 100;
        w.extern = { provisionPct: e.provisionPct, aufschlag: e.aufschlag };
      });
      // Preis hängt am jederzeit änderbaren Provisionssatz → nicht cachen.
      res.setHeader('Cache-Control', 'no-store');
    }
    return res.status(200).json(out);
  } catch (e) {
    return sendError(res, e);
  }
};
