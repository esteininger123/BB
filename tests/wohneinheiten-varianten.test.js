// Integrationstest für GET /api/wohneinheiten mit möblierten Varianten (07.09.2026).
// Airtable/Auth werden über den Module-Cache gestubbt — kein Netz, kein Token nötig.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  TABLES, WE_FIELDS, KALK_STAMMDATEN_FIELDS, KALK_STATUS_AKTIV, KALK_STATUS_VARIANTE,
} = require('../api/_lib/tables');

const WE_205 = 'recOVuIsot18BpO75';
const WE_219 = 'recuvsnjoFYQY08IE';
const STAMM_V205 = 'rec4h53kvjaD9SCMx';
const STAMM_V219 = 'recO1qE1Cmahc6oMY';
const OBJEKT = 'recmZ8PLkrGsyr8DX';

function stub(relPath, exports) {
  const abs = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports };
}

function weRec(id, nr, kp) {
  return {
    id,
    fields: {
      [WE_FIELDS.WE_NR]: nr,
      [WE_FIELDS.LAGE_BEZ]: `WE: ${nr}, EG, Spechtweg 35, 79110 Freiburg`,
      [WE_FIELDS.KAUFPREIS]: kp,
      [WE_FIELDS.QM]: 41.18,
      [WE_FIELDS.KALTMIETE]: 0,
      [WE_FIELDS.PROJEKT]: [OBJEKT],
      [WE_FIELDS.STATUS]: { name: 'Vermarktung / Im Verkauf' },
    },
  };
}

function stammRec(id, weId, status, extra = {}) {
  return {
    id,
    fields: Object.assign({
      [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]: [{ id: weId }],
      [KALK_STAMMDATEN_FIELDS.STATUS]: { name: status },
    }, extra),
  };
}

// Datenlage wie in Airtable am 07.09.2026: zwei Wohnungen, dazu je ein Varianten-Satz.
const DATEN = {
  stammdaten: [
    stammRec('recStamm205', WE_205, KALK_STATUS_AKTIV),
    stammRec('recStamm219', WE_219, KALK_STATUS_AKTIV),
    stammRec(STAMM_V205, WE_205, KALK_STATUS_VARIANTE, {
      [KALK_STAMMDATEN_FIELDS.VARIANTE_LABEL]: 'möbliert',
      [KALK_STAMMDATEN_FIELDS.VARIANTE_PAKET]: 20000,
    }),
    stammRec(STAMM_V219, WE_219, KALK_STATUS_VARIANTE, {
      [KALK_STAMMDATEN_FIELDS.VARIANTE_LABEL]: 'möbliert',
      [KALK_STAMMDATEN_FIELDS.VARIANTE_BASIS_KP]: 176275,
      [KALK_STAMMDATEN_FIELDS.VARIANTE_PAKET]: 15000,
    }),
  ],
  wes: [weRec(WE_205, '205', 176275), weRec(WE_219, '219', 178977)],
};

function installStubs() {
  stub('api/_lib/auth.js', {
    verifySession: () => ({ email: 'henry@bub-immo.de', rolle: 'Vertrieb', vertrieblerId: 'recVertrieb00001' }),
    isExtern: () => false,
    requireSafeOrigin: () => true,
  });
  stub('api/_lib/extern.js', {
    externPreis: (kp) => ({ kp, provisionPct: 0, aufschlag: 0 }),
    loadProvisionPct: async () => 0,
    ladeStellplatzKpSummen: async () => ({}),
  });
  stub('api/_lib/airtable.js', {
    airtable: async () => ({ fields: {} }),
    listAll: async (table, opts) => {
      if (table === TABLES.KALK_STAMMDATEN) {
        const f = (opts && opts.filterByFormula) || '';
        const wanted = f.includes(KALK_STATUS_VARIANTE) ? KALK_STATUS_VARIANTE : KALK_STATUS_AKTIV;
        return DATEN.stammdaten.filter(r => r.fields[KALK_STAMMDATEN_FIELDS.STATUS].name === wanted);
      }
      if (table === TABLES.WOHNEINHEIT) return DATEN.wes;
      return []; // Objekt-/Projekt-Tabelle → kein Name, für den Test irrelevant
    },
  });
}

async function ladeListe() {
  installStubs();
  delete require.cache[require.resolve('../api/wohneinheiten.js')];
  delete require.cache[require.resolve('../api/_lib/we-variante.js')];
  const handler = require('../api/wohneinheiten.js');
  let payload = null;
  const res = {
    statusCode: 0,
    setHeader() {},
    status(c) { this.statusCode = c; return this; },
    json(b) { payload = b; return this; },
  };
  await handler({ method: 'GET', query: {}, headers: {} }, res);
  assert.strictEqual(res.statusCode, 200, 'WE-Liste muss 200 liefern');
  return payload;
}

test('WE-Liste: je Wohnung eine Karte + Varianten-Karte direkt dahinter', async () => {
  const liste = await ladeListe();
  assert.deepStrictEqual(liste.map(w => w.id), [
    WE_205, `${WE_205}~${STAMM_V205}`,
    WE_219, `${WE_219}~${STAMM_V219}`,
  ]);
  assert.deepStrictEqual(liste.map(w => w.weNr), [
    '205', '205 (möbliert)', '219', '219 (möbliert)',
  ]);
});

test('WE-Liste: Varianten-Preise (Paket-Aufschlag bzw. Basis-Override)', async () => {
  const liste = await ladeListe();
  const byId = Object.fromEntries(liste.map(w => [w.id, w]));
  assert.strictEqual(byId[WE_205].kp, 176275, 'unmöblierte 205 bleibt unverändert');
  assert.strictEqual(byId[`${WE_205}~${STAMM_V205}`].kp, 196275); // 176.275 + 20.000
  assert.strictEqual(byId[WE_219].kp, 178977, 'unmöblierte 219 bleibt unverändert');
  assert.strictEqual(byId[`${WE_219}~${STAMM_V219}`].kp, 191275); // 176.275 + 15.000
});

test('WE-Liste: Varianten-Karte trägt Label und Basis-WE (für Stellplatz/Links)', async () => {
  const liste = await ladeListe();
  const v = liste.find(w => w.id === `${WE_219}~${STAMM_V219}`);
  assert.deepStrictEqual(v.variante, { label: 'möbliert', paket: 15000, basisWeId: WE_219 });
  assert.strictEqual(v.status, 'Vermarktung / Im Verkauf');
  assert.strictEqual(v.inStammdatenAktiv, true);
});

test('Ohne Varianten-Datensätze bleibt die Liste exakt wie vorher', async () => {
  const alle = DATEN.stammdaten;
  DATEN.stammdaten = alle.filter(r => r.fields[KALK_STAMMDATEN_FIELDS.STATUS].name === KALK_STATUS_AKTIV);
  try {
    const liste = await ladeListe();
    assert.deepStrictEqual(liste.map(w => w.id), [WE_205, WE_219]);
    assert.strictEqual(liste.every(w => w.variante === undefined), true);
  } finally {
    DATEN.stammdaten = alle;
  }
});
