// Wissens-Briefing für den Backstube-Assistenten.
// FAKTENQUELLE — der Assistent antwortet ausschließlich hieraus + dem Live-Kontext.
// STATUS: Entwurf. Vor Go-Live von Edgar fachlich freizugeben.
// Pflege: Bei Änderungen an der Engine (kalkulator.js) oder am Subventionsmodell
//         dieses Briefing nachziehen.

const WISSEN = `
# B&B Backstube — Fachwissen für den Assistenten

## Was die App ist
Interne Vertriebs-App der B&B Immo GmbH für Kapitalanlage-Wohneinheiten (KAV).
Ablauf: Kunde anlegen → Kalkulation mit Live-Stammdaten → Investitionsanalyse-PDF
→ Reservierung (PandaDoc) → Selbstauskunft → Bank.

## Kern-Rechengrößen (Engine 3.0, kalkulator.js)
- Kaltmiete: Tag-1-Bestandsmiete (MbV) der Wohneinheit.
- Marktmiete (€/qm): die realistisch erzielbare Miete (eigene Einschätzung), NICHT
  ein gesetzlicher Mietspiegel-Wert. Sie dient als Obergrenze (Cap) der
  Mietprojektion und wächst mit der Wertsteigerung p.a. mit.
- Mietsteigerung "Sprung"-Modus: Erhöhung in Schritten, max. 15 % in 3 Jahren
  (§ 558 BGB Kappungsgrenze) — das ist das Tempo der Erhöhung, nicht die Marktmiete.
- KNK (Kaufnebenkosten): GrESt (Bundesland) + Notar 1,5 % + Grundbuch 0,5 %.
- Eigenkapital-Bedarf: = KNK (Kaufpreis wird zu 100 % finanziert), außer KNK ist
  mitfinanziert → dann 0 €.
- AfA: Bemessung = Gebäudeanteil der Anschaffungskosten × AfA-Satz
  (Standard 2 % linear §7 EStG; höher nur mit Restnutzungsdauer-Gutachten).

## Mietsubvention — 2-Phasen-Modell (B&B-Kern)
- Der Käufer sieht über 6 Jahre eine konstante "End-Miete"; B&B legt die Differenz
  zur tatsächlichen Mieter-Miete drauf (Glättung).
- Phase 1 (Jahr 1–3): Mieter zahlt MbV, B&B zahlt den vollen Aufschlag.
- Phase 2 (Jahr 4–6): Mieter wird legal um eine Kappung erhöht, B&B zahlt nur den Rest.
- Ab Jahr 7: zweite Kappung, Subvention endet.
- Es gibt NIE drei Stufen.
- Die Gesamt-Subvention ist die echte Engine-Summe (geglättet), nicht der nominale
  Stammdaten-Wert.
- Subventionsregler: Trade-off Subvention ↔ Kaufpreis. Halbe Subvention ⇒ Kaufpreis
  sinkt 1:1 um den eingesparten Betrag.

## Was der Assistent NICHT tut
- Keine Steuer- oder Rechtsberatung (nur Modell-Rechnung).
- Keine Zahlen erfinden, die nicht im Live-Kontext stehen.
- Keine Aussagen über andere Kunden/WEs als die gerade offene.
`.trim();

module.exports = { WISSEN };
