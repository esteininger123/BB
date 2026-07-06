# SPEC für Subagents — BB Kalkulator V2

## Airtable IDs (festgelegt)

- **Base:** `appikHUetNyeonXBX` (Objektmanagement)
- **Tabelle Kalk-Vertriebler:** `tblXG135L28XocpeY`
  - Felder:
    - Name: `fldpP5XwQr34Kh7Tx` (singleLineText, Primary)
    - Email: `fldlIpTY2ggI0GTZy` (email)
    - Telefon: `flddmFv3YXeFaOsVx` (phone)
    - Foto-URL: `fldunwY4YtlhTvmX5` (url)
    - Rolle: `fldl1WRDwDUCKQhHP` (singleSelect: Admin/Vertriebler)
    - Status: `fldVE2h9Yz2Xv598K` (singleSelect: Aktiv/Inaktiv)
    - Created: `fldeI8pitl1I2O12d` (dateTime)
- **Tabelle Kalk-Kunden:** `tbld0j0Mo7rre1Vh3`
  - Felder:
    - Name: `fldEyLcNBa1Xe3ISs` (singleLineText, Primary)
    - Vorname: `fldkRrN0cjBc7z4sx`
    - Nachname: `fldjsUvoh3caONyYa`
    - Email: `fldNXcwpC75MuGGhd`
    - Telefon: `fldaOOiGNE2FVAQA9`
    - Geburtsdatum: `fldtdW7rfAXqbIu4q` (date)
    - Owner: `fld7gmCGOLVsW5S1W` (Link → Kalk-Vertriebler)
    - Phase: `fldZIuFV6LcqodhEM` (singleSelect: Lead/Kalkulation läuft/Reservierung/Selbstauskunft/Bank-Einreichung/Notar-Termin/Beurkundet/Abgebrochen)
    - Notizen: `fldtpjO65JHIbUecZ` (multilineText)
    - Quick-Bonität-JSON: `fldwL7VkWLQwz1at8`
    - Selbstauskunft-JSON: `fldl94zd1Oeakj6pN`
    - Created: `fld9s7XunLXCfx6pa`
    - Letzte-Aktivität: `fldRghZ5CtIBw2rWn`
- **Tabelle Kalk-Snapshots:** `tbliqxbITCdSjK0ua`
  - Felder:
    - Bezeichnung: `fldc9T4R4oowvzYeJ`
    - Kunde: `fldk6jkQu6UEIFv6T` (Link → Kalk-Kunden)
    - WE-Bezeichnung: `fldCSEFLQgBmSo9ib`
    - WE-RecordID: `fldgmCTYq3iFluCQf`
    - Erstellt-von: `fldOfahUEZJOvSzUy` (Link → Kalk-Vertriebler)
    - PDF-Typ: `fldXDtsB9FyqDh6Pu` (singleSelect: Investitionsrechnung/Reservierung/Selbstauskunft)
    - Kalkulations-JSON: `fldi8yTPSesezJRYv`
    - Created: `fldGeavlVvA5feJTC`
- **Bestehende Wohneinheit-Tabelle:** Suche per Name "Wohneinheit"
  - Relevante Felder für das Tool:
    - Lage-Bezeichnung: `fldhlG1CH22gG3Ta6` (z.B. "WE 12, 2.OG Rechts, Rheinstraße 292, 50389 Wesseling")
    - Status: `fld9zBkxSrrviMw96` (singleSelect, Filter auf "Vermarktung / Im Verkauf" = `selPJowbbG6qNlPuK`)
    - Maklerfirma: `fldiwYeFDiKlf5UVX` (Lookup, Wert "B&B Immo GmbH" = `selBQCbulihCoGvRR`)
    - Kaufpreis: `fldKQ5ZpGvEzuc5qc`
    - Stellplatz-Kaufpreis: (in Projekt, nicht WE)
    - Quadratmeter: `fldzF0RSb8xjKdjDc`
    - Kaltmiete: `fldAoKLxSak5OnPao` (€/Mo)
    - Lage-Text: `fldL2xgJwlFcGDUfx` (z.B. "2.OG Rechts")
    - qm-Preis: `fldGClYivJ0IdvAyG` (berechnet)
    - WE-Nr: `fldGia0unyS8cBaE5`
    - Projekt-Link: `fld1cp8nYcq6wXZx6` (Link auf Projekt)
- **Tabelle App-Konfiguration:** `tbl044p3Vg6zsFAqy` (Key/Value-Store, 1 Record je Key — 2026-06-19)
  - Felder:
    - Key: `fldJWAcW1pYcjds16` (singleLineText, Primary — z.B. `konditionen`)
    - JSON: `fldZQ2hCOQOpqGerL` (multilineText — Config-Blob)
    - Aktualisiert: `fldlZgqDjhUmxAnMr` (multilineText — ISO-Zeitstempel + Editor-Email)
  - Aktueller Key `konditionen`: Finanzierungs-Konditionen (Zins/Tilgung je Kaufpreis-Band × KNK). Leer/kaputt → Code-Defaults aus `kalkulator.js` (`KONDITIONEN_DEFAULTS`).

## Initial-Vertriebler (bereits angelegt)

- Edgar Steininger (Admin) — recBZlIN5rkjXkM1V — `e.steininger@immo-stein.de`
- Henry Wacker (Admin) — rec6FfU0o4Iew0M1p — `henry@wackersolutions.de`
- Laurin Zimmerer (Vertriebler) — recRIrHMWPHGCNnEL — Mail-Platzhalter: `laurin@bub-immo.de`
- Attilla Dizman (Vertriebler) — recdDz70Juli2FHlt — Mail-Platzhalter: `attilla@bub-immo.de`

## Auth-Flow

1. Frontend lädt Google Identity Services (GSI)
2. User klickt "Mit Google anmelden" → GSI öffnet Popup
3. Erfolgreicher Login: Frontend bekommt ID-Token (JWT)
4. Frontend POSTet Token an `/api/auth/google`
5. Backend:
   - Validiert JWT gegen Google-Public-Keys (Library: `google-auth-library`)
   - Liest `email` aus dem Token-Payload
   - Sucht in `Kalk-Vertriebler` Record mit `Email = email` UND `Status = Aktiv`
   - Wenn nicht gefunden: 403 "Kein Zugriff"
   - Wenn gefunden: signiert eigenen JWT-Session-Token (30 Tage gültig), setzt httpOnly Cookie `bbk_session`
6. Frontend leitet auf `/dashboard` weiter
7. Alle weiteren API-Calls senden Cookie automatisch mit, Backend prüft Session-JWT

## API-Routes

### `POST /api/auth/google`
- Body: `{ token: "google-id-token" }`
- Validiert Token + Whitelist-Check
- Setzt httpOnly Cookie
- Returns: `{ ok: true, vertriebler: {id, name, email, telefon, rolle, fotoUrl} }`

### `POST /api/auth/logout`
- Löscht Cookie
- Returns: `{ ok: true }`

### `GET /api/me`
- Liest Session-Cookie
- Returns: Vertriebler-Profile

### `GET /api/konditionen`
- Auth: jeder eingeloggte User (der Kalkulator braucht die Werte)
- Returns: Finanzierungs-Konditionen `{version, schwelleKaufpreis, baender:{klein,gross}:{ohneKnk,mitKnk}:{zins,tilgung}, _aktualisiert}`
- Resilienz: kein Record / Parse-Fehler / Airtable-Timeout → Code-Defaults mit `200` (Rechner blockiert nie)

### `PUT /api/konditionen`
- Auth: **nur Admin** (`requireAdminVerified`, sonst 403)
- Body: gleiche Struktur wie GET (ohne `_aktualisiert`)
- Validierung: `schwelleKaufpreis > 0`; jede `zins ∈ [0, 0.20]`; jede `tilgung ∈ [0, 0.10]`; Struktur vollständig → sonst `400`
- Upsert in Airtable App-Konfig (Key `konditionen`), setzt `Aktualisiert` (ISO + Editor-Email)
- Returns: gespeicherte, normalisierte Konditionen

### `GET /api/kunden`
- Vertriebler: nur eigene (Owner = self)
- Admin: alle
- Returns: Liste Kunden mit `{id, name, vorname, nachname, email, telefon, phase, ownerId, ownerName, lastActivity}`

### `GET /api/kunden/:id`
- Returns: kompletter Kunde inkl. Quick-Bonität-JSON, Selbstauskunft-JSON, Notizen

### `POST /api/kunden`
- Body: `{vorname, nachname, email, telefon, geburtsdatum, phase, notizen, quickBonJson, saJson}`
- Setzt Owner = current user
- Setzt Letzte-Aktivität = jetzt
- Returns: `{id, ...}`

### `PUT /api/kunden/:id`
- Vertriebler: nur eigene
- Admin: alle
- Body: gleich wie POST
- Returns: `{ok: true}`

### `DELETE /api/kunden/:id`
- Vertriebler: nur eigene
- Admin: NICHT — sonst Chaos. Stattdessen Phase auf "Abgebrochen"
- Returns: `{ok: true}`

### `GET /api/wohneinheiten`
- Filter: Status = "Vermarktung / Im Verkauf" UND Maklerfirma = "B&B Immo GmbH"
- Returns: Liste mit `{id, lage, projekt, kaufpreis, qm, kaltmiete, qmPreis, weNr, projektName, defaults: {...optional aus Airtable...}}`
- WICHTIG: Liest **bestehende Wohneinheit-Tabelle**. Für Kalk-Defaults (AfA, Subvention etc.) gilt: wenn Airtable-Felder existieren, nimm sie. Sonst Pauschal-Defaults aus dem Frontend.

### `POST /api/snapshots`
- Body: `{kundeId, weId, weBezeichnung, pdfTyp, kalkJson, bezeichnung}`
- Setzt Erstellt-von = current user
- Returns: `{id, ...}`

### `GET /api/snapshots?kundeId=xxx`
- Returns: Liste Snapshots zum Kunden

### Admin-Only Routes

### `GET /api/admin/stats`
- Returns: Vertriebler-Liste mit Anzahl Kunden je Phase, Gesamt-Statistik

## Frontend-Struktur

```
public/
  index.html          — Login + alles in einer SPA mit JS-Routing (hash-based: #/dashboard, #/kunde/:id, #/admin)
  app.js              — Hauptlogik (State, Routing, Render)
  kalkulator.js       — Berechnungslogik übernommen aus V1 BB_Kalkulator.html
  pdf.js              — PDF-Generierung (Browser-Print mit Templates)
  api.js              — API-Wrapper (fetch mit credentials: 'include')
  styles.css          — komplettes B&B-Branding (Cream/Bronze/etc.)
  ...
```

Bei Vercel: alle Dateien in `public/` sind static assets.

## Env-Variablen (Vercel)

- `GOOGLE_CLIENT_ID` — Google OAuth Client ID (öffentlich, im Frontend nutzbar)
- `AIRTABLE_TOKEN` — Personal Access Token mit Scope auf Base appikHUetNyeonXBX
- `AIRTABLE_BASE_ID` — `appikHUetNyeonXBX`
- `JWT_SECRET` — Random 64-byte hex string für Session-JWT
- `ADMIN_EMAILS` — kommagetrennte Whitelist als Fallback (nicht in Airtable gepflegt)

## Berechnungslogik (aus V1 übernehmen)

Die komplette `recalc()`-Funktion aus `BB_Kalkulator.html` (v1.11 / Iter 13). Speichern in `kalkulator.js` als ES-Module-Export.

Inputs/Outputs identisch. Erweitern um:
- `state.kundeId` — welcher Kunde geladen
- `state.weId` — welche WE aktiv

PDF-Templates wie V1, aber mit Vertriebler-Footer.

## Branding

- Farben wie V1 (Cream `#FBFAF7`, Bronze `#B08A4D`, Wald-Grün `#2D6E47`, Terracotta `#9A3E33`)
- Font: Inter (Google Fonts CDN)
- B&B-Logo oben links
- Vertriebler-Info im Header rechts (Name + Dropdown mit Logout)

## Externer Vertrieb (Rolle 'Extern') — 06.07.2026

Externe Vertriebspartner loggen sich wie interne ein (Whitelist Kalk-Vertriebler,
Rolle-Choice **Extern**), sehen aber serverseitig transformierte **Kundenpreise**
statt der internen Abgabepreise.

- **Provisionssatz:** Feld `Provision Extern` (`fldSlpQyhjrxfPbm8`, percent) auf
  Kalk-Vertriebler (`tblXG135L28XocpeY`). Dezimalwert 0–0.07. Gepflegt vom Externen
  selbst über die Startseite (`#/start`) → `PATCH /api/me { provisionPct }`
  (nur eigenes Record, nur Rolle Extern, Server kappt hart auf 7 %).
- **Preisformel** (`api/_lib/extern.js`, Tests in `tests/extern-preis.test.js`):
  `Aufschlag = Satz × (Wohnungs-KP + Stellplatz/Garagen-KP)`; der Aufschlag landet
  **nur auf dem Wohnungspreis**, Stellplätze bleiben unverändert (marktüblich eingepreist).
  (Der 1-%-Verhandlungsspielraum wurde am 06.07.2026 wieder entfernt.)
- **Transformierte Endpoints** (nur bei `isExtern(session)`, jeweils `Cache-Control: no-store`):
  `GET /api/wohneinheiten` (lädt dafür Stellplatz-KP-Summen nach),
  `GET /api/stammdaten` (Zeile bekommt `extern`-Block),
  `GET /api/stammdaten/[weId]` (Response-Feld `extern: {provisionPct, aufschlag}`).
- **Frontend:** Externe landen nach Login auf `#/start` (Erklärseite + Provisions-Slider,
  Nav-Link „Start & Provision", eigene 10-Schritte-Kurztour); Kalkulator-Picker und WE-Liste zeigen Provisions-Hinweise.
- Bestehende Extern-Sperre bleibt: keine HubSpot-Lead-Suche (`api/hubspot/contacts.js`).

## Marktwert-Quelle (06.07.2026)

Der Marktwert €/qm einer WE ist der **höhere** Wert aus den Kalk-Stammdaten-Feldern
Marktpreis ImmoScout / Marktpreis Homeday (vorher: Schnitt). Quelle der Wahrheit:
`computeMarktpreisGemittelt()` in `api/stammdaten/[weId].js` (Name historisch),
`derived.marktpreisGemitteltQuelle` = `'immoscout' | 'homeday' | 'keine'`.
Die UI (Kalkulator, Annahmen-Tooltip, Markteinkauf-Story, PDFs) zeigt hinter dem
Wert „(laut ImmoScout)" bzw. „(laut Homeday)" — Label-Helfer `marktQuelleLabel()`
in `public/app.js`.

## Extern-Reservierung ohne PandaDoc (06.07.2026)

Externe Vertriebler reservieren über einen eigenen Muster-Flow:
- `POST /api/reservierung/extern-link` (nur Rolle Extern, Owner-Check): friert die
  „Kaufabsichtserklärung und Reservierungsvereinbarung" in `kunde.saJson.reservierungExtern`
  ein (Preise rechnet der SERVER: Abgabepreis + Provisionsaufschlag; Subvention/RenoBudget
  aus dem Kalkulator-State des Externen), speichert die Kundenadresse in
  `saJson.antragsteller.{strasse,plz,ort}` und liefert einen 14-Tage-JWT-Link
  (`kind: 'reserv-sign'`) auf `/reservierung?token=…`.
- `public/reservierung.html`: kundenseitige Seite (kein Login) — vorausgefülltes Dokument
  (Wohnungs-/Stellplatzpreis, Gesamtkaufpreis, Mietsubvention je Phase, RenoBudget,
  Exposé-Prämisse: Zustand bei Besichtigung am Notartermin-Tag muss dem Exposé entsprechen)
  + Canvas-Unterschrift. Verkäufer-Signatur: `public/assets/unterschrift-hw.png`.
- `GET/POST /api/reservierung/portal/[token]`: Daten lesen / Unterschrift (PNG-data-URL)
  einmalig speichern → `saJson.reservierungExtern.signiert` + Aktivitäts-Zeile am Kunden.
- Frontend-Flow (nur Extern): Kurz-SA-Pflicht → Adress-Modal → Link-Modal (kopieren/mailto).
  KEIN Snapshot-Zwang, KEIN PandaDoc. Reservierungsfrist: heute + RESERV_FRIST_TAGE (14).
