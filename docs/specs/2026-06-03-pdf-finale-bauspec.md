# PDF Finale-Bauspec (Team-Workflow-Konsolidierung, 2026-06-03)

I have everything I need. The kalkulator return object is at line 1153-1191, with `subvMo1` (line 1083) and `kaltmieteMo1` (line 1088) already computed in scope. I'll add the new field right after `mieteJ1Mo` (line 1179). Now I produce the consolidated build spec.

---

# BAUSPEC — B&B Investitionsanalyse-PDF (konsolidiert, umsetzbar)

Datei: `/Users/edgarstein/Documents/Claude-Cowork/02_BB_Immo/BB-Backstube/webapp-v2/public/pdf.js` · Engine: `/Users/edgarstein/Documents/Claude-Cowork/02_BB_Immo/BB-Backstube/webapp-v2/public/kalkulator.js`

Ziel: ein einheitliches, einfaches, überzeugendes PDF. Tag-0-Zahlen wo der Kunde "jetzt" liest, klare Projektion wo es um den Verlauf geht, zwei aufgewertete Grafiken + eine neue Cashflow-Grafik, kein tonaler Bruch.

---

## 1. Finale Seitenliste (9 Seiten statt 8)

| # | const | Sektion-Num | Headline (final) | Footer-Label | "Seite x von 9" |
|---|---|---|---|---|---|
| 1 | `seite1` | — (Cover) | "In zehn Jahren baust Du **X** Vermögen auf. So funktioniert es." | — | Seite 1 von 9 |
| 2 | `seite2` | 01 · Das Objekt & Der Plan | "Dein Plan: rund **X €/Monat** Eigenleistung — und was daraus wird." (selbsttragend: "Diese Wohnung trägt sich ab Tag 1 selbst.") | 01 · Eckdaten & Plan | Seite 2 von 9 |
| 3 | `seiteCashflow` **NEU** | 02 · Die nächsten zehn Jahre | "So entwickelt sich Deine monatliche Belastung." | 02 · Die nächsten zehn Jahre | Seite 3 von 9 |
| 4 | `seite3` | 03 · Vermögenszuwachs | "Aus Deiner monatlichen Leistung wird Vermögen: **X** in zehn Jahren." | 03 · Vermögenszuwachs | Seite 4 von 9 |
| 5 | `seite4` | 04 · Die Alternative / Der Hebel | (unverändert) | 04 · Im Vergleich / Der Hebel | Seite 5 von 9 |
| 6 | `seite5` | 05 · Im Detail | "Damit Du jede Zahl nachvollziehen kannst." | 05 · Im Detail | Seite 6 von 9 |
| 7 | `seite6` | 06 · Wie es weitergeht | "Sechs Schritte bis zum Notartermin." | 06 · Wie es weitergeht | Seite 7 von 9 |
| 8 | `seite7` | 07 · Nach dem Notartermin | "Du stehst nicht alleine da." | 07 · Nach dem Notartermin | Seite 8 von 9 |
| 9 | `seite8` | 08 · Wer wir sind | "Brot & Butter." | 08 · Brot & Butter | Seite 9 von 9 |

Assembly `pdf.js:741-742`: `… + seite2 + seiteCashflow + seite3 + seite4 + …`

`seite6_www` (`pdf.js:559`) bleibt deaktiviert (`return ''`) — nicht anfassen.

**Nummerierung mechanisch:** Statt 9 verstreute Strings zu ändern, oben in der Funktion `const TOTAL = 9;` + Helfer `const footNum = n => 'Seite ' + n + ' von ' + TOTAL;` definieren und in jedem `pdf-c-page-num` einsetzen. Cover `pdf.js:336` "Seite 1 von 8" → `footNum(1)`. Sektion-Nummern ab `seite3` alle +1 (Cashflow übernimmt die 02, Vermögen wird 03, Hebel 04, Detail 05, Weg 06, Notar 07, B&B 08). Sektion-Num steht doppelt je Seite (`pdf-c-section-num` oben + `pdf-c-page-foot` unten) — beide hochziehen.

---

## 2. Jahr-0-Entscheidung Seite 2 (verbindlich festgeschrieben)

**Grundsatz:** Die Monatsrechnung "So rechnet sich der Monat" + die Belastungs-Headline auf Seite 2 zeigen **Tag 1**, nicht den Jahres-Durchschnitt. Die Cashflow-Tabelle/Grafik (jetzt Seite 3) zeigt den **Jahresverlauf (Ø/Monat)** — das ist gewollt und korrekt.

**Engine-Änderung (`kalkulator.js`, im return-Objekt direkt nach `mieteJ1Mo:` Zeile 1179):**
```js
mieteTag1Mo: (kaltmieteMo1 + i.stellplatzMiete + subvMo1),
```
`kaltmieteMo1` (`kalkulator.js:1088`) und `subvMo1` (`kalkulator.js:1083`) existieren bereits im Scope — nur exposen. Das ist der echte Geldfluss in Monat 1: gekappte Kaltmiete + Stellplatz + tatsächliche Subvention Monat 1.

**Beispiel-Festlegung (Kaltmiete 750, Stellplatz 0, Subv-Monat-1 = 0):**
- Miete Tag 1 = **750 €** (Edgar sieht exakt 750).
- Ø Jahr 1 (alt, `mieteJ1Mo`) = 773 €.
- Alte Belastung (`belastungMo` = cfJahr/12) = **−5 €/Mo** (Jahres-Mittel).
- **Neue Tag-1-Belastung = −28 €/Mo** (die −23 € geringere Tag-1-Miete schlagen 1:1 durch).
- Liegt im Monat 1 eine Subvention an, ist `mieteTag1Mo > 750` und die Belastung entsprechend näher an −5.

**Headline-Wording Seite 2** (kombiniert Kunden-Klarheit + Tag-0): Kein Minus-Schock, aber Tag-1-Zahl. `pdf.js:396`:
```
<h2 class="pdf-c-section-title">Dein Plan: rund ${fmtMo(Math.abs(belastungTag1Mo))} Eigenleistung ab Tag 1 — und was daraus wird.</h2>
```
Bei `belastungTag1Mo >= 0`: "Diese Wohnung trägt sich ab Tag 1 selbst — Überschuss ${fmtMo(belastungTag1Mo)}."

Die nackte Minus-Zahl bleibt in der Monatsrechnung rechts (dort erklärt), nicht als Schock-Headline.

---

## 3. Seite-für-Seite: was sich ändert

### Seite 1 · Cover (`pdf.js:319-339`)
- **Copy** `pdf.js:331`: "In zehn Jahren baust Du nach unserer Rechnung X Nettovermögen auf." → "In zehn Jahren baust Du **X** Vermögen auf. So funktioniert es." ("nach unserer Rechnung" raus — Disclaimer S.9 trägt das; zweiter Satz führt ins Doc).
- **Footer** `pdf.js:336`: "Seite 1 von 8" → `footNum(1)`.
- Zahl: `r.vermoegenNetto10` bleibt (PROJ, korrekt).

### Seite 2 · Objekt & Plan (`pdf.js:392-440`)
Lokale Tag-0-Werte direkt vor dem `seite2`-Template einfügen:
```js
const mieteTag1Mo   = (r.mieteTag1Mo != null) ? r.mieteTag1Mo : (i.kaltmiete || 0);
const stVorteilMo   = r.stVorteilJ1Mo || 0;
const verwMo        = (r.hausgeldNurMo||0)+(r.hausverwaltungMo||0)+(r.mietverwaltungMo||0);
const belastungTag1Mo = mieteTag1Mo + stVorteilMo - (r.annuityMo||0) - verwMo;
```
- `pdf.js:156` `einnahmenMo`: `(r.mieteJ1Mo…)` → `(mieteTag1Mo + r.stVorteilJ1Mo)` (für Tag-0-konsistenten `selbsttragungPct`). **Achtung:** `mieteTag1Mo` muss dafür vor Zeile 156 verfügbar sein — entweder dort direkt `(r.mieteTag1Mo != null ? r.mieteTag1Mo : r.mieteJ1Mo)` inline berechnen.
- `pdf.js:396` Headline → Tag-1-Wording (siehe Abschnitt 2). `r.belastungMo` → `belastungTag1Mo`.
- `pdf.js:397` Lead-Logik: alle drei `r.belastungMo` → `belastungTag1Mo`; `selbsttragungPct` bleibt (jetzt Tag-0-basiert).
- `pdf.js:404` "Kaltmiete (Tag 1)" / `i.kaltmiete` = 750 → **bleibt** (schon korrekt Tag 1).
- `pdf.js:420` Header "So rechnet sich der Monat (Jahr 1)" → "**(Tag 1)**".
- `pdf.js:421` Label "Mieteinnahme (Ø Jahr 1)", Wert `r.mieteJ1Mo` → Label "**Mieteinnahme (Tag 1)**", Wert `_eur0(mieteTag1Mo)`.
- `pdf.js:422-424` Steuervorteil / Annuität / Rücklage+Verwaltung → **unverändert** (alle konstant über Laufzeit, Tag-0 = Jahr-1).
- `pdf.js:425` Summenzeile `r.belastungMo` → `belastungTag1Mo` (= Summe der 4 Zeilen darüber; rechnet sauber auf).
- **Mikro-Erklärung** unter der Tabelle (neu, nach `pdf.js:425`): `<p class="narrative" style="font-size:8pt;margin-top:2mm">Effektiv = was Dich der Monat nach Miete und Steuervorteil wirklich kostet. Die 80&nbsp;%-Mietanrechnung der Bank ist hier schon berücksichtigt.</p>`
- **Cashflow-Tabelle + Crossover-Narrative entfernt** `pdf.js:426-435` (`<h4>Cashflow Jahr für Jahr</h4>` bis schließendes Narrative-`</p>`) → wandert auf Seite 3 (Cashflow). Entlastet die ohnehin enge Seite 2.
- `cashflowRows` (`pdf.js:385-391`) bleibt im Code, wird jetzt von `seiteCashflow` genutzt (siehe Seite 3).
- `pdf.js:438` Footer → `footNum(2)`.

### Seite 3 · `seiteCashflow` — NEU (zwischen seite2 und seite3 einbauen)
Aufbau (vertikal): Seitenkopf `ph()` → `02 · Die nächsten zehn Jahre` → Headline "So entwickelt sich Deine monatliche Belastung." → Lead → **Cashflow-Chart volle Breite** → Caption → Grid (Tabelle 1.5fr | Erklärtext 1fr) → Footer `footNum(3)`.

- **Chart:** neuer Helfer `_cfChartSvg(cfArr, crossoverJahr)` (SVG-Spec Abschnitt 4c). Datenquelle: `r.cf[j].cfJahr / 12` — identisch zu Tabellen-Spalte "Überschuss" und zu Seite-2-Logik. Keine Doppelberechnung des Crossovers: `crossoverJahr` (`pdf.js:143`) als zweites Argument übergeben.
- **Tabelle:** `cashflowRows` (`pdf.js:385-391`) wiederverwenden, Klasse `.pdf-c-p2-belastung-table`. Spalten Jahr · Einnahmen · Ausgaben · Überschuss (alle €/Mo). Hinweiszeile klein (`#7A7A72`) darüber: "Werte je Monat · Annuität konstant · Steuervorteil und Mietsubvention bereits enthalten".
- **Erklärtext** (rechte Spalte, 2-3 Sätze, datengetrieben aus `pdf.js:431-435`-Logik):
  - Satz 1 (immer): "Die Annuität von {fmtMo(r.annuityMo)} bleibt über die Laufzeit konstant — Miete und Tilgungsanteil wachsen, deshalb sinkt Deine monatliche Belastung Jahr für Jahr."
  - Satz 2 (3 Branches): `belastungTag1Mo >= 0` → "trägt sich ab Tag 1 selbst, Überschuss {fmtMo}"; `crossoverJahr` 1-10 → "Ab Jahr {crossoverJahr} dreht die Belastung ins Plus (im Chart markiert)"; sonst → "Innerhalb der 10 Jahre bleibt die Belastung negativ — Vermögen entsteht über Tilgung und Wertsteigerung (nächste Seite)".
- **Grid-CSS** (neu): `.pdf-c-cf-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:12mm;margin-top:5mm}`.

### Seite 4 · Vermögenszuwachs (`pdf.js:442-468`, alt seite3)
- `pdf.js:451` Sektion-Num "02 ·" → "**03 ·**".
- `pdf.js:452` Headline "In zehn Jahren: X Nettovermögen." → "**Aus Deiner monatlichen Leistung wird Vermögen: X in zehn Jahren.**" (anderer Winkel als Cover, keine Copy-Paste-Redundanz).
- `pdf.js:453` Lead: ergänzen um den garantierten Tilgungs-Hebel: "… **Ein Teil entsteht garantiert — durch die Tilgung, die die Restschuld mit jeder Rate senkt. Der andere Teil hängt am Markt: wir rechnen mit {fmtPct(i.wertsteigerung)} Wertsteigerung pro Jahr.**" (macht das Versprechen skeptiker-fest).
- `pdf.js:454` `_vermChartSvg(r.vermoegen)` → SVG-Aufwertung (Abschnitt 4b).
- `pdf.js:456` Spalte "Netto kumuliert" → "**Vermögen gesamt**" (Fachsprache raus).
- `pdf.js:460` "Modellwert J10" → "**Wohnungswert nach 10 J.**", kleiner Zusatz `<span class="unit">rechnerisch</span>`.
- `pdf.js:463` "Interner Zinsfuß" → "**Rendite p.a. (alles eingerechnet)**".
- `pdf.js:466` Footer "02 · Aussicht" + "Seite 3 von 8" → "03 · Vermögenszuwachs" + `footNum(4)`.

### Seite 5 · Alternative/Hebel (`pdf.js:470-503`, seite4)
- `pdf.js:483` "03 · Der Hebel" → "**04 · Der Hebel**"; `pdf.js:495` "03 · Die Alternative" → "**04 · Die Alternative**".
- `pdf.js:497` `_sparChartSvg(...)` → SVG-Neubau (Abschnitt 4a). Wrapper auf volle Breite: `<div style="width:100%;margin:6mm 0 5mm;">` statt der zentrierten Flex-Breite — sonst skaliert die Grafik nicht auf 178mm.
- **Fairness-Satz** unter dem Chart (neu, nach `pdf.js:499`, nur im Sparbuch-Branch): `<p class="pdf-c-p4-sub" style="font-size:9pt;color:#7A7A72">Fair gerechnet: Beim Sparbuch ist die Abgeltungssteuer noch nicht abgezogen — der echte Abstand ist also eher größer.</p>`
- `pdf.js:489/501` Footer "03 ·" → "04 ·", "Seite 4 von 8" → `footNum(5)`.

### Seite 6 · Detail (`pdf.js:506-554`, seite5)
- `pdf.js:509` "04 · Im Detail" → "**05 · Im Detail**".
- **Rahmen-Satz** nach `pdf.js:510` (neu): `<p class="pdf-c-lead" style="max-width:60ch;font-size:9.5pt;color:#7A7A72">Diese Seite ist für Dich und Deinen Steuerberater — Du musst sie nicht verstehen, um die Entscheidung zu treffen.</p>` (nimmt dem Laien den Druck).
- **Mietsubvention-Erklärung** an `pdf.js:545` ergänzen, falls `subvText !== '—'`: kleiner Zusatz "*Mietsubvention = wir stocken Deine Miete für eine Anfangsphase auf.*"
- `pdf.js:552` Footer "04 ·" + "Seite 5 von 8" → "05 ·" + `footNum(6)`.

### Seite 7 · Der Weg (`pdf.js:652-670`, seite6)
- `pdf.js:655` "05 ·" → "**06 ·**".
- `pdf.js:658` Lead positiv rahmen statt 3× Hürde: voranstellen "**Diese sechs Schritte schützen Dich — Du unterschreibst beim Notar erst, wenn alles für Dich passt.** Wir beurkunden den Kauf, wenn drei Voraussetzungen erfüllt sind: …". Die "kein Notartermin"-Wiederholung in Schritt 6 (`pdf.js:666`) kann bleiben (einmal ist ok), Lead trägt jetzt den positiven Frame.
- `pdf.js:668` Footer "05 ·" + "Seite 6 von 8" → "06 ·" + `footNum(7)`.

### Seite 8 · Nach Notar (`pdf.js:676-715`, seite7)
- `pdf.js:679` "06 ·" → "**07 ·**".
- `pdf.js:713` Footer "06 ·" + "Seite 7 von 8" → "07 ·" + `footNum(8)`.
- Inhalt sonst unverändert (stark).

### Seite 9 · Brot & Butter (`pdf.js:718-739`, seite8)
- `pdf.js:721` "07 ·" → "**08 ·**".
- `pdf.js:737` Footer "07 ·" + "Seite 8 von 8" → "08 ·" + `footNum(9)`.
- Disclaimer `pdf.js:734-736` unverändert (trägt Brutto-Sparbuch, Modellwert, 80%-Anrechnung).

---

## 4. SVG-Vorgaben (konkret, ein Entwickler baut 1:1)

**Skalierungs-Grundregel (verbindlich, als Kommentar über die Helfer):** Print-Nutzbreite = 210−32 = **178 mm**. Bei `style="width:100%"` gilt: `reale mm = SVG-Einheit × 178 / viewBox-Breite`. **Alle drei Helfer auf viewBox-Breite 440** → Faktor 0,405 mm/Einheit → `reale pt ≈ SVG-font × 0,73`. Damit ist eine SVG-`font-size` von 12 ≈ 8,7 pt, von 20 ≈ 14,6 pt. Schrift `font-family="'Inter',Helvetica,Arial,sans-serif"` explizit setzen (SVG erbt Print-Font nicht zuverlässig).

Farb-Set (vereinheitlicht): Accent `#B08A4D`, Positiv/Grün `#2D6E47`, Negativ/Rot `#9A3E33`, Tinte `#1A1A17`, Grau-Beschriftung `#7A7A72`, Grau-Sub `#9a958b`, Border `#E8E6DD`.

### (a) `_sparChartSvg` — Neubau (`pdf.js:364-383`)
- **viewBox `0 0 440 250`** (statt 560×205). Signatur erweitern: `_sparChartSvg(ek, sparEnd, immoEnd, deltaPos)` — `deltaPos` = `_spDeltaPos` mitgeben.
- **Balken:** `bw=130`, `x1=45`, `x2=245`. Padding `padT=22`, `padB=40`. Balkenhöhe-Basis `H−padT−padB = 188` Einheiten.
- **Boden-Achse:** durchgehende Linie bei `y=H−padB`, `stroke=rgba(40,36,30,.25)` width 0,6.
- **EK-Sockel:** unterer grauer Block je Balken (`#7A7A72` opacity .26) bleibt, einmal dezent beschriftet "Eigenkapital-Einsatz".
- **EK-Baseline** (gestrichelt, `pdf.js:378`): bleibt, Label font-size 9 (`#9a958b`).
- **Font-Größen:** Balkensumme **20** (weight 500, `#1A1A17`), Balken-Label (Sparbuch/Immobilie) **12** (weight 600, uppercase, letter-spacing .08em), Sub-Zeile **9** (`#9a958b`).
- **Mehrgewinn in die Grafik:** vertikale Klammer im Korridor bei `x≈190` von `yTopSparbuch` bis `yTopImmo`, kleine Querstriche oben/unten, Inline-Label font-size **17** Akzent `#B08A4D` (bzw. `#9A3E33` wenn `deltaPos===false`, Pfeil abwärts): `{deltaPos?'+ ':''}{delta} € Sachwert-Vorteil`. Die separate `.pdf-c-p4-delta`-Zahl unter dem Chart (`pdf.js:498`) bleibt als bewusster Echo-Anker.
- Strichstärken: Boden 0,6 / Klammer 1,0.

### (b) `_vermChartSvg` — Aufwertung (`pdf.js:344-363`)
- **viewBox `0 0 480 210`** (statt 560×188). `padT=16, padB=22, padL=4, padR=4`.
- **Font-Größen:** Achsen-Labels J0…J10 **10** (statt 7, `#7A7A72`); Linien-Endlabels **11,5** weight 600.
- **3 Gridlines** (0 / Mitte / max) `#E8E6DD` stroke 0,4, rechtsbündig je ein Wert (z.B. "300 T€") font 9 `#9a958b`. Baseline bei Wert 0 durchziehen.
- **Netto-Fläche benennen:** Polygon-Opacity 0,08 → **0,12**; ein Label mittig in der Fläche font 11 `#2D6E47` weight 500 "Nettovermögen".
- **Linien:** Marktwert stroke-width 1,6 → **2,0** `#2D6E47`; Restschuld gestrichelt 1,2 `#7A7A72` (statt `#9a958b`).
- **Endpunkt-Marker:** gefüllte Kreise r=3 auf Marktwert- und Restschuld-Endpunkt bei J10, in Linienfarbe.

### (c) `_cfChartSvg(cfArr, crossoverJahr)` — NEU (neben den anderen, `pdf.js:~383`)
- **viewBox `0 0 440 230`**, `style="width:100%;height:auto"`. `padT=16, padB=20, padL=4, padR=4`.
- **Daten:** `m = cfArr.slice(0, min(10,len)).map(c => Math.round(c.cfJahr/12))`; `vals = [m[0]].concat(m)` → 11 Punkte (J0=J1-Wert).
- **Y-Skala mit Null:** `lo=Math.min(0,...vals)`, `hi=Math.max(0,...vals)`, `pad=(hi-lo)*0.12||1`, `max=hi+pad`, `min=lo-pad`. `y(v)=padT+(1−(v−min)/(max−min))·(H−padT−padB)`.
- **Null-Linie:** horizontal über volle Breite bei `y(0)`, `stroke=#1A1A17` width 1 opacity .55, Label "0 €" font 9 `#9a958b` am linken Rand.
- **Fläche:** ein Polygon Kurve→Null-Linie, `fill="rgba(176,138,77,.08)"` (Accent-Grau, schneller sauberer Default).
- **Linie:** `polyline` über alle Punkte, `stroke=#B08A4D` width 1,8 `stroke-linejoin:round`.
- **X-Labels:** J0,J2,J4,J6,J8,J10 unten font 9 `#7A7A72`.
- **Crossover-Marker** (nur wenn `crossoverJahr` 1-10): vertikale Hilfslinie `#2D6E47` dash 3 3 opacity .5 von Null-Linie zur Kurve; Kreis r=4 fill `#2D6E47` Rand `#FBFAF7` width 1,5; Label darüber "Jahr {crossoverJahr}: erster Überschuss" font 9 weight 600 `#2D6E47`, am Rand auf start/end clampen.
- **Endpunkt-Label** rechts: "J10 {±}{wert} €/Mo" font 9 weight 600, Farbe nach Vorzeichen (`#2D6E47` / `#9A3E33`).

### (d) Konsistenz über alle Seiten
- Goldlinie (`#B08A4D` 0,5px) **unter jeder Grafik** (wie `.pdf-c-p3-bottom`) — Chart + Tabelle als visuelle Einheit.
- Grafik-Außenabstände einheitlich `margin:6mm 0 5mm` (Seite 4 `pdf.js:454`, Seite 5 Wrapper, Cashflow-Chart).
- Hilfslinien min. stroke 0,6 (= 0,24mm, druckfest), Hauptkurven 2,0-2,2.
- Tote CSS-Regel `tr.total` der `.pdf-c-p3-vermoegen-table` (`styles.css` ~Z.265): entweder J10-Summenzeile mit Goldlinie rendern oder Regel entfernen. **Entscheidung: entfernen** (Tabelle endet sauber, keine zusätzliche Komplexität).

---

## 5. Reihenfolge der Umsetzung

1. **Engine-Feld** `mieteTag1Mo` in `kalkulator.js:1179` ergänzen + `npm test` (Snapshot bewusst entscheiden via `kalk-integritaet`-Skill) + `npm run guard`. Fundament für alles Weitere.
2. **Seite-2 Tag-0-Umbau** (`pdf.js:156`, `396`, `397`, `420`, `421`, `425` + Mikro-Erklärung). Headline-Wording final. Hier sitzt Edgars Hauptschmerz (Minus-Schock + 750-vs-773).
3. **`_cfChartSvg` + `seiteCashflow`** bauen, Cashflow-Tabelle/Narrative aus Seite 2 (`pdf.js:426-435`) dorthin verlagern, in Assembly `pdf.js:742` einfügen.
4. **Nummerierung** umstellen: `const TOTAL=9` + `footNum()`-Helfer, alle Sektion-Nummern ab seite3 +1, Cover-Footer. (Erst jetzt, weil die neue Seite schon drin sein muss.)
5. **SVG-Aufwertung** `_sparChartSvg` (a) + `_vermChartSvg` (b) + Seite-5-Wrapper auf volle Breite + Goldlinien (d).
6. **Copy-Fixes** Cover (`331`), Seite 4 Headline/Lead/Labels (`452/453/456/460/463`), Seite 5 Fairness-Satz, Seite 6 Rahmen-Satz + Mietsubv-Erklärung, Seite 7 positiver Frame.
7. **Verifikation:** `npm run guard && npm test`, JSC-Syntaxcheck, dann PDF im Browser drucken — prüfen dass keine Seite (v.a. neue Seite 3 mit Chart H=230 + 10-Zeilen-Tabelle) in `overflow:hidden` abschneidet. Bei Overflow Cashflow-Chart auf viewBox-Höhe 205 reduzieren.

---

## Konsistenz-Garantien (gegen "Schöngerechnet"-Verdacht)
- Seite-2-Summenzeile (`belastungTag1Mo`) = Summe ihrer 4 angezeigten Zeilen — rechnet sich auf.
- Cashflow-Chart-Y, Tabellen-Spalte "Überschuss" und alte `belastungMo`-Logik stammen alle aus `cf[j].cfJahr/12` — identisch.
- Bewusster, dokumentierter Unterschied: Seite 2 = **Tag 1** (−28), Seite 3 Tabelle Zeile J1 = **Ø Jahr 1** (−5). Tabellenkopf-Hinweis "(Ø/Monat)" entschärft das.
- Crossover-Logik überall = `crossoverIdx` (`pdf.js:135-143`).

Dateien:
- [pdf.js](file:///Users/edgarstein/Documents/Claude-Cowork/02_BB_Immo/BB-Backstube/webapp-v2/public/pdf.js)
- [kalkulator.js](file:///Users/edgarstein/Documents/Claude-Cowork/02_BB_Immo/BB-Backstube/webapp-v2/public/kalkulator.js)
- [styles.css](file:///Users/edgarstein/Documents/Claude-Cowork/02_BB_Immo/BB-Backstube/webapp-v2/public/styles.css)