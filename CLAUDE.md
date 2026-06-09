# CLAUDE.md — BB Kalkulator V2 (webapp-v2)

> **Du arbeitest am App-Code der B&B-Backstube.** Das ist eine **Code-Session**, kein Cowork-Cockpit. Fokus: Frontend/Backend/Deploy/Tests. Cowork-Bereichs-Material (SOPs, Phase, Tagesbriefing) ist hier irrelevant — außer Edgar fragt explizit.

## Was das Projekt ist

`bb-kalkulator-v2` — Multi-User-Web-App für den internen B&B-Vertrieb von Kapitalanlagen-Wohneinheiten.

- **Live:** Vercel Auto-Deploy aus `main`, Custom-Domain `backstube.bub-immo.de` (DNS-CNAME pending bei lah-a.de, Task #134)
- **User:** interne Vertriebler (Edgar, Henry, Laurin, Attilla) + Admin (Edgar/Henry)
- **Reife:** Iter 90+, Pricing-Modell konsolidiert (2026-05-26), Pre-Go-Live-Sweep durch (FS-3)

## Stack

| Layer | Technologie |
|---|---|
| Frontend | Vanilla JS SPA — **kein Build-Step** (`public/`) |
| Backend | Vercel Serverless Functions, Node 20.x (`api/`) |
| Auth | Google Identity Services + Server-Side JWT (HS256), httpOnly Cookie `bbk_session` |
| Datenbank | Airtable Base `appikHUetNyeonXBX` (Objektmanagement) |
| PDF | Native `window.print()` mit `@media print` CSS |
| PandaDoc | Webhook-Validation via HMAC-SHA256 (Selbstauskunft-Flow) |
| Deps | `google-auth-library`, `jsonwebtoken`, `cookie`, `puppeteer-core`, `@sparticuz/chromium-min` |

## Pflicht-Lesefiles bei Session-Start

1. **`README.md`** — App-Übersicht, Datei-Struktur, Stand
2. **`docs/SPEC.md`** — Airtable-IDs (Base, Tabellen, Felder), Auth-Flow, API-Routes
3. **`docs/KONZEPT.md`** — Architektur, Datenmodell, User-Flows
4. **`SETUP.md`** — falls Setup-/Deploy-/Env-Fragen
5. **`FIX_VERCEL_DEPLOY.md`** — falls Deploy-Probleme

Bei Fragen zur **Berechnungslogik** (Cashflow, IRR, Steuer, Sensitivität) → `../docs/` (Container-Level), insbesondere:
- `../docs/2026-05-26_Master-Referenz_Berechnungslogik.html`
- `../docs/2026-05-25_Rechenlogik-Cheatsheet.html`

## Code-Struktur (Kern)

```
webapp-v2/
├── api/                   — Vercel Functions
│   ├── _lib/              — airtable.js, auth.js, tables.js, http.js, mappers.js
│   ├── auth/              — google.js (Login), logout.js
│   ├── admin/stats.js
│   ├── kunden.js / kunden/[id].js
│   ├── snapshots.js, wohneinheiten.js, config.js, me.js
├── public/
│   ├── index.html         — SPA-Skeleton
│   ├── app.js             — State + Routing + Views
│   ├── api.js             — Fetch-Wrapper
│   ├── kalkulator.js      — Berechnungslogik (1:1 aus V1, alle Formeln dokumentiert)
│   ├── pdf.js             — 3 PDF-Templates (Investitionsrechnung, Reservierung, Selbstauskunft)
│   └── styles.css         — B&B-Branding
├── tests/                 — Node-Native-Tests (`node --test tests/*.test.js`)
├── docs/                  — SPEC.md, KONZEPT.md
├── package.json, vercel.json
```

## Befehle

```bash
# Lokal entwickeln (Vercel-Sandbox mit Functions)
npm run dev                # = vercel dev

# Tests
npm test                   # = node --test tests/*.test.js

# Deploy (manuell — normalerweise via git push auf main)
npm run deploy             # = vercel deploy --prod

# Schema-Guard (Airtable-Field-IDs gegen echte Base prüfen)
npm run guard

# Sicherer Workflow: Preview statt direkt auf main
npm run guard && npm test                        # Schema + Tests grün?
git checkout -b feature/xyz                       # Branch statt direkt main
git add . && git commit -m "..." && git push -u origin feature/xyz
#   → Vercel baut automatisch eine Preview-URL für den Branch → am Handy testen
git checkout main && git merge feature/xyz && git push   # erst dann live
```

**Syntax-Check für Frontend-JS ohne Browser** (für Pre-Push-Validation): JavaScriptCore aus dem System-Framework wird benutzt — Befehle stehen in `.claude/settings.local.json` als Allow-Liste.

## Conventions

- **Vanilla JS only** — kein Build-Step, kein Bundler, kein Framework. Wenn du einen Helper brauchst, schreib ihn inline.
- **Keine localStorage/sessionStorage** für Session-Daten (Auth läuft über httpOnly Cookie).
- **Airtable-Field-IDs**, nicht Field-Names — Names können sich ändern, IDs sind stabil. Siehe `api/_lib/tables.js`.
- **Mapper-Pattern**: Airtable-Records ↔ App-JSON nur über `api/_lib/mappers.js`. Nie direkt.
- **Berechnungslogik** lebt in `public/kalkulator.js`. Jede Änderung an einer Formel: Master-Referenz-HTML in `../docs/` mit-aktualisieren.
- **PDF-Templates**: Print-CSS in `styles.css` (`@media print`), Templates in `pdf.js`. Browser-native, kein Headless-Chrome-Aufruf außer für serverseitiges Rendering (puppeteer-core ist als Backup-Path drin).
- **Commits**: kurz und sachlich, deutsch oder englisch egal, kein Co-Author-Footer.

## Lokale Skills (`.claude/skills/`)

Projektspezifische Skills, in Code-Sessions automatisch verfügbar (Trigger über ihr `description`-Feld):

- **`airtable-feld-binden`** — neues Airtable-Feld atomar durch alle Schichten ziehen (`tables.js` → `mappers.js` beide Richtungen → ggf. Snapshot-Klartext → API → Frontend → Test). Verhindert stille Field-Name-Fehler und die 422-Falle bei verwaisten IDs.
- **`vor-deploy-check`** — vor jedem `git push`: JSC-Syntax-Check + `npm test` + Klick-Liste aus dem Diff + wiederkehrende Fallen. `main` geht direkt live.
- **`kalk-integritaet`** — nach jeder Änderung an `public/kalkulator.js`: Snapshot-Tests bewusst entscheiden, Steuersatz-Synchronität prüfen, Master-Referenz-Doku nachziehen.

## Was du NICHT darfst

- **`webapp-v2/` umbenennen** — git-Repo + Vercel-Deploy + interne Pfade hängen daran.
- **`BB-Backstube/` (Container) umbenennen** ohne gleichzeitiges `sed` in `SETUP.md`, `FIX_VERCEL_DEPLOY.md`, `.claude/settings.local.json`.
- **B&B-Inhalte in die Stein-App kopieren** (`../../../03_Unternehmen/Stein_Consulting/stein-app/`). Andere Welt, andere Kunden, andere Sprache.
- **Airtable-Field-IDs hardcoden außerhalb von `api/_lib/tables.js`** — eine Quelle der Wahrheit.
- **Geld bewegen / Bestellungen auslösen** — auch wenn Tools es technisch könnten.

## Aktueller Stand

| Was | Status |
|---|---|
| Vercel-Deploy | ✅ aktiv (Auto aus `main`) |
| Custom-Domain `backstube.bub-immo.de` | ⏳ DNS-CNAME pending |
| Pricing-Modell | ✅ konsolidiert 2026-05-26 |
| Berechnungs-Engine | ✅ stabil (Iter 90+) |
| Multi-Persona-Audit + Pre-Go-Live | ✅ 2026-05-25 |
| Phase 2 (E-Signatur, HubSpot-Sync, PWA, etc.) | offen |

## Wenn die Session vorher abgestürzt ist

```bash
claude --resume     # Picker mit allen früheren Sessions in diesem Ordner
claude --continue   # direkt in die zuletzt genutzte Session
```

Mehr: `~/Documents/Claude-Cowork/00_Kontext/Claude-Code-Playbook.md`

---

*Stand: 2026-05-28 — initial. Bei strukturellen Änderungen (neue Tabellen in Airtable, neue API-Routes, Stack-Wechsel): diese Datei updaten.*
