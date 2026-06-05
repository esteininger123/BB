# Reservierte (+ Notartermin) Einheiten sichtbar — Design

**Datum:** 2026-06-05 · **Autor:** Edgar (Wunsch) / Umsetzung Claude
**Status:** freigegeben (Edgar 05.06.2026)

## Ziel
Reservierte und im Notartermin befindliche Wohneinheiten sollen in der Backstube-App **sichtbar und durchrechenbar** bleiben — heute fallen sie aus jeder Liste, weil hart auf Status `Vermarktung / Im Verkauf` gefiltert wird. Anlass: eine reservierte Einheit war nach der (korrekten) Status-Umstellung in Airtable nicht mehr auffindbar, obwohl sie für einen Kunden nochmal gerechnet werden sollte. **Wichtig: unmissverständlich als reserviert markiert.**

## Scope / Sichtbarkeits-Logik
- Sichtbar in der WE-/Rechen-Liste sind ab jetzt die Status: **`Vermarktung / Im Verkauf` · `Reserviert` · `Notartermin`**.
- Ab **`Beurkundet`** (und allem danach: Kaufpreis gezahlt, Betreuung) → **raus** (faktisch verkauft).
- Reservierte/Notartermin-WEs sind **voll rechenbar** (kein Read-only) — eine Reservierung kann platzen.

## Nicht-Ziele / Garantien
- **Keine Airtable-Änderung.** Rein lesend: nur die Filter-Formel ändert sich + der Status wird mitgeliefert. Keine Schreibzugriffe, keine neuen Felder, keine Status-Mutation. Das Team pflegt Status wie bisher.
- Kein Eingriff in die Vermarktungs-WEs (Verhalten unverändert).

## Architektur / Änderungen
1. **`api/_lib/tables.js`** — zentrale Liste `WE_STATUS_SICHTBAR = ['Vermarktung / Im Verkauf', 'Reserviert', 'Notartermin']` + Helfer `weStatusSichtbarFormula()` (baut die `OR({Status}='…')`-Klausel). Single Source, kein Hardcoding.
2. **`api/wohneinheiten.js`** (WE-Picker/Liste) — Filter `{Status}='Vermarktung…'` → `weStatusSichtbarFormula()` (2 Stellen). WE-Status-Feld laden **und im Response-Objekt mitliefern** (`status`).
3. **`api/stammdaten/index.js`** (Audit/Liste) — gleicher Filter-Tausch; `status` im `we`-Objekt mitliefern.
4. **`public/app.js`** — Markierung „ganz klar reserviert":
   - WE-Dropdown: reservierte/Notartermin-WEs bekommen einen Marker ins Options-Label (z. B. „… · RESERVIERT").
   - Gewählte WE: deutlicher Status-Pill oben (gelb `RESERVIERT` / orange `NOTARTERMIN — Verkauf läuft`), analog zu den vorhandenen `we-status-pill`-Pills (vermietet/leer).
   - „Wohnungen"-Liste (we-liste): dieselbe Badge-Logik.
5. **`public/styles.css`** — `.we-status-pill.reserviert` (amber) + `.we-status-pill.notartermin` (orange), Airtable-Farben.
6. **`public/index.html`** — Cache-Bump (`?v=NNN`).

## Datenfluss
Airtable WE.Status → Endpoint-Filter (3 Status durch) + `status` in Response → Frontend rendert Badge je `status`. Rechnen läuft unverändert (Status beeinflusst nur Sichtbarkeit + Markierung, nicht die Engine).

## Test / Verifikation
- JSC-Syntax-Check aller geänderten JS-Dateien.
- `weStatusSichtbarFormula()` erzeugt die korrekte `OR(...)`-Formel (3 Status).
- Manuell (Edgar nach Deploy): eine reservierte WE erscheint in der Auswahl, klar markiert, und ist rechenbar; eine beurkundete WE erscheint NICHT.
