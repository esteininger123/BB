// Exklusiv-Kontingente für externe Vertriebler (04.10.2026, Henry).
// Feld „Extern exklusiv für" (Link → Kalk-Vertriebler) auf den Kalk-Stammdaten:
//   Freigabe-Haken fehlt  → kein Externer sieht die Einheit
//   Exklusiv leer         → alle Externen
//   Exklusiv gepflegt     → nur die verknüpften Vertriebler
// Geprüft wird die Regel selbst und alle Wege, über die ein Externer an eine Einheit
// kommt: /api/wohneinheiten, /api/stammdaten (Liste), Detail/Batch (buildWeDetail).
// Airtable/Auth sind über den Module-Cache gestubbt — kein Netz, kein Token nötig.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  TABLES, WE_FIELDS, KALK_STAMMDATEN_FIELDS, VERTRIEBLER_FIELDS, KALK_STATUS_AKTIV, KALK_STATUS_VARIANTE,
} = require('../api/_lib/tables');

const EXT_A = 'recExternA00000001';
const EXT_B = 'recExternB00000001';
const INTERN = 'recIntern000000001';

const WE_OFFEN   = 'recWEoffen00000001'; // freigegeben, kein Kontingent
const WE_NUR_A   = 'recWEnurA000000001'; // freigegeben, exklusiv A
const WE_GESPERRT = 'recWEgesperrt00001'; // exklusiv A, aber NICHT freigegeben
const WE_A_UND_B = 'recWEaundB00000001'; // freigegeben, exklusiv A + B
const WE_INTERN  = 'recWEintern0000001'; // gar nicht extern freigegeben
const STAMM_VAR_B = 'recStammVarB000001'; // möblierte Variante von WE_OFFEN, exklusiv B

let SESSION = null;

function stub(relPath, exports) {
  const abs = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports };
}

function weRec(id, nr) {
  return { id, fields: {
    [WE_FIELDS.WE_NR]: nr,
    [WE_FIELDS.LAGE_BEZ]: `WE: ${nr}, EG, Teststraße 1, 77652 Offenburg`,
    [WE_FIELDS.KAUFPREIS]: 150000,
    [WE_FIELDS.QM]: 50,
    [WE_FIELDS.KALTMIETE]: 500,
    [WE_FIELDS.STATUS]: { name: 'Vermarktung / Im Verkauf' },
  } };
}

function stammRec(id, weId, { frei, exklusiv, status, extra } = {}) {
  return { id, fields: Object.assign({
    [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]: [{ id: weId }],
    [KALK_STAMMDATEN_FIELDS.STATUS]: { name: status || KALK_STATUS_AKTIV },
    [KALK_STAMMDATEN_FIELDS.EXTERN_FREIGABE]: !!frei,
    // Airtable liefert Links mal als ['rec…'], mal als [{id,name}] — beides abdecken.
    [KALK_STAMMDATEN_FIELDS.EXTERN_EXKLUSIV]: exklusiv,
    [KALK_STAMMDATEN_FIELDS.MIETE_BEI_VERKAUF]: 500,
    [KALK_STAMMDATEN_FIELDS.GEBAEUDE_ANTEIL]: 0.85,
    [KALK_STAMMDATEN_FIELDS.MARKTMIETE]: 11,
    [KALK_STAMMDATEN_FIELDS.MARKTPREIS_IS]: 3500,
  }, extra || {}) };
}

const STAMM = [
  stammRec('recStammOffen00001', WE_OFFEN,   { frei: true }),
  stammRec('recStammNurA000001', WE_NUR_A,   { frei: true,  exklusiv: [EXT_A],
    extra: { [KALK_STAMMDATEN_FIELDS.EXTERN_ABSCHLAG]: 0.0357 } }), // Kontingent mit eigenem Abgabepreis
  stammRec('recStammGesperrt01', WE_GESPERRT, { frei: false, exklusiv: [EXT_A] }),
  stammRec('recStammAundB00001', WE_A_UND_B, { frei: true,  exklusiv: [{ id: EXT_A, name: 'A' }, { id: EXT_B, name: 'B' }] }),
  stammRec('recStammIntern0001', WE_INTERN,  { frei: false }),
  stammRec(STAMM_VAR_B, WE_OFFEN, { frei: true, exklusiv: [EXT_B], status: KALK_STATUS_VARIANTE,
    extra: { [KALK_STAMMDATEN_FIELDS.VARIANTE_LABEL]: 'möbliert', [KALK_STAMMDATEN_FIELDS.VARIANTE_PAKET]: 10000 } }),
];
const WES = [
  weRec(WE_OFFEN, '1'), weRec(WE_NUR_A, '2'), weRec(WE_GESPERRT, '3'), weRec(WE_A_UND_B, '4'), weRec(WE_INTERN, '5'),
];
const statusName = (r) => r.fields[KALK_STAMMDATEN_FIELDS.STATUS].name;

stub('api/_lib/auth.js', {
  verifySession: () => SESSION,
  isExtern: (s) => !!(s && s.rolle === 'Extern'),
  requireSafeOrigin: () => true,
});
stub('api/_lib/airtable.js', {
  airtable: async () => ({ fields: {} }), // Provisionssatz → 0
  listAll: async (table, opts) => {
    if (table === TABLES.KALK_STAMMDATEN) {
      const f = (opts && opts.filterByFormula) || '';
      if (f.includes(`'${KALK_STATUS_VARIANTE}'`)) return STAMM.filter(r => statusName(r) === KALK_STATUS_VARIANTE);
      if (f.includes(`'${KALK_STATUS_AKTIV}'`)) return STAMM.filter(r => statusName(r) === KALK_STATUS_AKTIV);
      return STAMM;
    }
    if (table === TABLES.WOHNEINHEIT) {
      const f = (opts && opts.filterByFormula) || '';
      const ids = f.match(/RECORD_ID\(\)='(rec[A-Za-z0-9]+)'/g);
      if (!ids) return WES;
      return WES.filter(w => ids.some(x => x.includes(`'${w.id}'`)));
    }
    if (table === TABLES.VERTRIEBLER) {
      return [
        { id: EXT_A, fields: { [VERTRIEBLER_FIELDS.NAME]: 'Anna Extern' } },
        { id: EXT_B, fields: { [VERTRIEBLER_FIELDS.NAME]: 'Bernd Extern' } },
      ];
    }
    return []; // Stellplätze, Mietverträge, Projekte — für die Sichtbarkeit irrelevant
  },
  escapeFormulaString: (s) => String(s),
});

const { externDarfSehen, externExklusivIds, hatExklusivKontingent } = require('../api/_lib/extern');
const wohneinheiten = require('../api/wohneinheiten.js');
const stammListe = require('../api/stammdaten/index.js');
const detail = require(path.join('..', 'api', 'stammdaten', '[weId].js'));

const SESS_A = { email: 'a@extern.de', rolle: 'Extern', vertrieblerId: EXT_A };
const SESS_B = { email: 'b@extern.de', rolle: 'Extern', vertrieblerId: EXT_B };
const SESS_INTERN = { email: 'intern@bub-immo.de', rolle: 'Vertriebler', vertrieblerId: INTERN };

async function call(handler, session) {
  SESSION = session;
  let payload = null;
  const res = {
    statusCode: 0,
    setHeader() {},
    status(c) { this.statusCode = c; return this; },
    json(b) { payload = b; return this; },
  };
  await handler({ method: 'GET', query: {}, headers: {} }, res);
  assert.strictEqual(res.statusCode, 200);
  return payload;
}

test('Regel: Freigabe ist Voraussetzung, Exklusiv schränkt auf die verknüpften Vertriebler ein', () => {
  const f = (frei, exklusiv) => stammRec('recX', 'recY', { frei, exklusiv }).fields;
  assert.strictEqual(externDarfSehen(f(true, undefined), SESS_A), true, 'leer = alle Externen');
  assert.strictEqual(externDarfSehen(f(true, []), SESS_A), true);
  assert.strictEqual(externDarfSehen(f(true, [EXT_A]), SESS_A), true);
  assert.strictEqual(externDarfSehen(f(true, [EXT_A]), SESS_B), false, 'fremdes Kontingent');
  assert.strictEqual(externDarfSehen(f(true, [{ id: EXT_A }, { id: EXT_B }]), SESS_B), true, 'geteiltes Kontingent');
  assert.strictEqual(externDarfSehen(f(false, [EXT_A]), SESS_A), false, 'ohne Freigabe-Haken auch der Inhaber nicht');
  assert.strictEqual(externDarfSehen(f(false, undefined), SESS_A), false);
  assert.strictEqual(externDarfSehen(f(true, [EXT_A]), { rolle: 'Extern' }), false, 'Session ohne vertrieblerId');
  assert.strictEqual(externDarfSehen(null, SESS_A), false);
  assert.deepStrictEqual(externExklusivIds(f(true, [EXT_A, EXT_A, { id: EXT_B }])), [EXT_A, EXT_B]);
  assert.strictEqual(hatExklusivKontingent(f(true, [EXT_A])), true);
  assert.strictEqual(hatExklusivKontingent(f(false, [EXT_A])), false);
  assert.strictEqual(hatExklusivKontingent(f(true, [])), false);
});

test('/api/wohneinheiten: Extern A sieht offene + eigene Kontingent-Einheiten, nichts Fremdes', async () => {
  const liste = await call(wohneinheiten, SESS_A);
  assert.deepStrictEqual(liste.map(w => w.id).sort(), [WE_OFFEN, WE_NUR_A, WE_A_UND_B].sort());
  const byId = Object.fromEntries(liste.map(w => [w.id, w]));
  assert.strictEqual(byId[WE_NUR_A].externExklusiv, true);
  assert.strictEqual(byId[WE_A_UND_B].externExklusiv, true);
  assert.strictEqual(byId[WE_OFFEN].externExklusiv, undefined);
});

test('/api/wohneinheiten: Extern B sieht A-Kontingent nicht, dafür seine exklusive Variante', async () => {
  const liste = await call(wohneinheiten, SESS_B);
  const ids = liste.map(w => w.id);
  assert.deepStrictEqual(ids.slice().sort(), [WE_OFFEN, `${WE_OFFEN}~${STAMM_VAR_B}`, WE_A_UND_B].sort());
  assert.strictEqual(ids.includes(WE_NUR_A), false);
  assert.strictEqual(liste.find(w => w.id === `${WE_OFFEN}~${STAMM_VAR_B}`).externExklusiv, true);
});

test('/api/wohneinheiten: Interne sehen weiterhin alles, Kontingente nur als Kennzeichen', async () => {
  const liste = await call(wohneinheiten, SESS_INTERN);
  assert.strictEqual(liste.length, 6); // 5 Wohnungen + 1 Variante
  const byId = Object.fromEntries(liste.map(w => [w.id, w]));
  assert.strictEqual(byId[WE_NUR_A].externExklusiv, true);
  assert.strictEqual(byId[WE_GESPERRT].externExklusiv, undefined, 'ohne Freigabe kein Exklusiv-Kennzeichen');
  assert.strictEqual(byId[WE_INTERN].externExklusiv, undefined);
});

test('/api/stammdaten (Liste): Extern bekommt nur ein Flag, nie fremde Vertriebler-IDs', async () => {
  const a = await call(stammListe, SESS_A);
  assert.deepStrictEqual(a.map(r => r.we.id).sort(), [WE_OFFEN, WE_NUR_A, WE_A_UND_B].sort());
  a.forEach(r => {
    assert.strictEqual(r.stammdaten.externExklusiv, undefined, 'IDs dürfen den Server nicht verlassen');
    assert.strictEqual(r.stammdaten.externExklusivNamen, undefined);
  });
  const byId = Object.fromEntries(a.map(r => [r.we.id, r]));
  assert.strictEqual(byId[WE_NUR_A].stammdaten.externExklusivFuerMich, true);
  assert.strictEqual(byId[WE_OFFEN].stammdaten.externExklusivFuerMich, false);
  assert.strictEqual(JSON.stringify(a).includes(EXT_B), false, 'kein Hinweis auf den zweiten Kontingent-Inhaber');

  const b = await call(stammListe, SESS_B);
  assert.deepStrictEqual(b.map(r => r.we.id).sort(), [WE_OFFEN, WE_A_UND_B].sort());
});

test('/api/stammdaten (Liste): Interne bekommen IDs + Namen der Kontingent-Inhaber', async () => {
  const liste = await call(stammListe, SESS_INTERN);
  assert.strictEqual(liste.length, 5);
  const byId = Object.fromEntries(liste.map(r => [r.we.id, r]));
  assert.deepStrictEqual(byId[WE_NUR_A].stammdaten.externExklusiv, [EXT_A]);
  assert.deepStrictEqual(byId[WE_NUR_A].stammdaten.externExklusivNamen, ['Anna Extern']);
  assert.deepStrictEqual(byId[WE_A_UND_B].stammdaten.externExklusivNamen, ['Anna Extern', 'Bernd Extern']);
  assert.deepStrictEqual(byId[WE_OFFEN].stammdaten.externExklusiv, []);
  assert.strictEqual(byId[WE_OFFEN].stammdaten.externExklusivNamen, undefined);
});

function detailFuer(weId, session) {
  return detail.buildWeDetail({
    weId, weIdRaw: weId, variante: null, session,
    pre: { weRec: WES.find(w => w.id === weId), stplRecs: [], mvRecs: [], kalkRecs: STAMM.filter(r => statusName(r) === KALK_STATUS_AKTIV), provisionPct: 0, skipWriteBack: true },
  });
}

test('Detail/Batch: fremdes Kontingent → 404 (auch per Deep-Link), eigenes → 200 mit Flag', async () => {
  const fremd = await detailFuer(WE_NUR_A, SESS_B);
  assert.strictEqual(fremd.status, 404);

  const eigen = await detailFuer(WE_NUR_A, SESS_A);
  assert.strictEqual(eigen.status, 200);
  assert.strictEqual(eigen.body.kalkStammdaten.externExklusivFuerMich, true);
  assert.strictEqual(eigen.body.kalkStammdaten.externExklusiv, undefined);

  const gesperrt = await detailFuer(WE_GESPERRT, SESS_A);
  assert.strictEqual(gesperrt.status, 404, 'Kontingent ohne Freigabe-Haken bleibt unsichtbar');

  const offen = await detailFuer(WE_OFFEN, SESS_B);
  assert.strictEqual(offen.status, 200);
  assert.strictEqual(offen.body.kalkStammdaten.externExklusivFuerMich, false);

  const intern = await detailFuer(WE_NUR_A, SESS_INTERN);
  assert.strictEqual(intern.status, 200);
  assert.deepStrictEqual(intern.body.kalkStammdaten.externExklusiv, [EXT_A]);
});

test('Einheiten-Abschlag: Liste, Stammdaten-Liste und Detail zeigen dem Externen denselben Preis', async () => {
  // Intern 150.000 €, kein Stellplatz, Provision 0 (Stub) → 3,57 % Abschlag = 144.645 €; Standard 2 % = 147.000 €.
  const liste = await call(wohneinheiten, SESS_A);
  const audit = await call(stammListe, SESS_A);
  const det = await detailFuer(WE_NUR_A, SESS_A);
  assert.strictEqual(liste.find(w => w.id === WE_NUR_A).kp, 144645);
  assert.strictEqual(audit.find(r => r.we.id === WE_NUR_A).we.kp, 144645);
  assert.strictEqual(det.body.we.kp, 144645);
  assert.strictEqual(liste.find(w => w.id === WE_OFFEN).kp, 147000, 'ohne Abschlag-Feld bleibt der Standard-Rabatt');
  assert.strictEqual(audit.find(r => r.we.id === WE_OFFEN).we.kp, 147000);
  // Der Abschlag-Satz selbst verlässt den Server für Externe nicht (interner Preis wäre rückrechenbar).
  assert.strictEqual(JSON.stringify([liste, audit, det.body]).includes('externAbschlag'), false);
});

test('Einheiten-Abschlag: Interne sehen unverändert den internen Preis', async () => {
  const liste = await call(wohneinheiten, SESS_INTERN);
  assert.strictEqual(liste.find(w => w.id === WE_NUR_A).kp, 150000);
  const audit = await call(stammListe, SESS_INTERN);
  const row = audit.find(r => r.we.id === WE_NUR_A);
  assert.strictEqual(row.we.kp, 150000);
  assert.strictEqual(row.stammdaten.externAbschlag, 0.0357);
});
