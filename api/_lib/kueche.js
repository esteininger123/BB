// Einbauküche im Verkauf (09.10.2026, Henry / Freiburg Spechtweg 33-37).
//
// HINTERGRUND: Bei 90+ Spechtweg-Wohnungen gehört die Einbauküche B&B (Mietvertrag
// § 1 Abs. 2 „1 Küche mit Einbauküche", Airtable WE-Feld „Küche" = Vermietereigentum).
// 23 Mieter zahlen dafür einen Küchenzuschlag (20/30/40 €/Mo, Mietvertrag § 2 Abs. 1,
// Airtable Mietvertrag „Miete für zusätzl. Bestandteile"), der NICHT in der Kaltmiete
// steckt. Der Käufer bekommt die Küche + den Zuschlag → im Kaufvertrag wird die Küche
// SEPARAT ausgewiesen (Küchen-KP; keine GrESt, AfA 10 Jahre), wie bei WE 205
// (176.275 € Wohnung + 7.000 € Einbauküche = 183.275 €).
//
// Eine Quelle für alle Pfade (Rechner, WE-Liste, PandaDoc-Reservierung, Extern-Link):
//   kueche = { eigentum, kp, mieteMo, mieteQuelle, imVerkauf, afaJahre }
const { listAll } = require('./airtable');
const { TABLES, KALK_STAMMDATEN_FIELDS, KALK_STATUS_AKTIV } = require('./tables');

const KUECHE_AFA_JAHRE = 10; // Einbauküche = einheitliches Wirtschaftsgut, 10 J (BFH IX R 14/15)

function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
function selectName(v) { return (v && typeof v === 'object') ? (v.name || '') : (v || ''); }

// Eigentum der Küche aus dem WE-Feld: 'Vermietereigentum' | 'Mietereigentum' | null.
function kuecheEigentum(weFieldValue) {
  const s = String(selectName(weFieldValue) || '').trim();
  if (/vermieter/i.test(s)) return 'Vermietereigentum';
  if (/mieter/i.test(s)) return 'Mietereigentum';
  return null;
}

// Küchen-Block für die API-Antwort.
//   stammFields     — Airtable-Felder des maßgeblichen Kalk-Stammsatzes (Aktiv bzw. Variante)
//   zusatzMieteMo   — „Miete für zusätzl. Bestandteile" des mietbestimmenden Vertrags (€/Mo)
//   vermietet       — Vermietungsstatus (leer → keine Vertrags-Küchenmiete)
//   eigentum        — Ergebnis von kuecheEigentum()
function buildKueche({ stammFields, zusatzMieteMo, vermietet, eigentum }) {
  const f = stammFields || {};
  const kp = Math.max(0, num(f[KALK_STAMMDATEN_FIELDS.KUECHE_KP]));
  const override = num(f[KALK_STAMMDATEN_FIELDS.KUECHE_MIETE_BEI_VERKAUF]);
  let mieteMo = 0, mieteQuelle = 'keine';
  if (override > 0) {
    mieteMo = override; mieteQuelle = 'kalk-stammdaten';
  } else if (vermietet && num(zusatzMieteMo) > 0) {
    mieteMo = num(zusatzMieteMo); mieteQuelle = 'mietvertrag';
  }
  return {
    eigentum: eigentum || null,
    kp,                       // € — separat im Kaufvertrag (0 = keine Küche im Verkauf)
    mieteMo,                  // €/Mo — Küchenzuschlag, den der Käufer zusätzlich erhält
    mieteQuelle,              // 'kalk-stammdaten' | 'mietvertrag' | 'keine'
    imVerkauf: kp > 0,
    afaJahre: KUECHE_AFA_JAHRE,
  };
}

// Küchen-KP für die Reservierungs-Pfade (PandaDoc + Extern-Link): der Aktiv-Stammsatz
// der WE bzw. bei einer Variante ihr eigener Satz. Fehler → 0 (Küche ist nie tödlich).
async function loadKuecheKpForWE(weId, variante) {
  try {
    if (variante && variante.rec && variante.rec.fields) {
      return Math.max(0, num(variante.rec.fields[KALK_STAMMDATEN_FIELDS.KUECHE_KP]));
    }
    const recs = await listAll(TABLES.KALK_STAMMDATEN, {
      filterByFormula: `{${KALK_STAMMDATEN_FIELDS.STATUS}}='${KALK_STATUS_AKTIV}'`,
      fields: [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT, KALK_STAMMDATEN_FIELDS.KUECHE_KP],
    }, 1000);
    const hit = recs.find(r => {
      const links = (r.fields && r.fields[KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]) || [];
      return Array.isArray(links) && links.some(x => ((x && typeof x === 'object' && x.id) ? x.id : x) === weId);
    });
    return hit ? Math.max(0, num(hit.fields[KALK_STAMMDATEN_FIELDS.KUECHE_KP])) : 0;
  } catch (e) {
    console.error('loadKuecheKpForWE failed:', e.message);
    return 0;
  }
}

module.exports = { KUECHE_AFA_JAHRE, kuecheEigentum, buildKueche, loadKuecheKpForWE };
