// Kaufpreis-Ermittlung für den Reservierungs-Direktlink (extern-link.js).
// 01.09.2026 (Henry): Seit der Direkt-Link auch INTERN nutzbar ist ("Reservierung
// senden (NEU)"), gibt es zwei Preiswege. Bewusst als reine Funktion ausgelagert —
// ein Fehler hier landet unbemerkt im Dokument, das der Kunde unterschreibt.
//
//   extern: Abgabepreis (interner KP − 2 %) + Provision des Externen  → externPreis()
//   intern: der echte interne Kaufpreis. Liegt ein Snapshot vor, gilt dessen
//           eingefrorener GESAMT-Kaufpreis (Wohnung + Stellplatz) — identisch zu
//           send-for-signature.js (`snapKalk.kaufpreis || wohnung + stellplatz`),
//           damit der neue Weg denselben Preis zeigt wie der PandaDoc-Weg.
//           Der Stellplatz wird separat ausgewiesen, deshalb hier abgezogen.

const { externPreis } = require('./extern');

function toNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : 0;
}

function kpWohnungFuerReservierung({ extern, kpBasis, stellplatzKp, provisionPct, snapKaufpreis }) {
  const basis = toNum(kpBasis);
  const stpl = toNum(stellplatzKp);
  if (extern) return externPreis(basis, stpl, provisionPct).kp;
  const gesamt = toNum(snapKaufpreis);
  if (gesamt > 0) return Math.max(0, gesamt - stpl);
  return basis;
}

module.exports = { kpWohnungFuerReservierung };
