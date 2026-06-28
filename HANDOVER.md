# HANDOVER — Backstube-Entwicklung an Henry

> **Modell: Zugriff teilen.** Henry übernimmt Entwicklung + Betrieb der Backstube (`bb-kalkulator-v2`).
> Edgar bleibt Account-Owner (GitHub/Vercel/Google) und schaut mit drauf. Kein Eigentums-Transfer.
> Stand: 2026-06-28.

---

## 1. Status der Zugänge

| Komponente | Wie Henry drankommt | Status |
|---|---|---|
| **GitHub** `esteininger123/BB` | als **Admin-Collaborator** eingeladen (`gf-beep`) | ✅ Einladung raus — **annehmen** |
| **Vercel** Team + Projekt `bb` | als **Member** eingeladen (`gf@wackersolutions.de`) | ✅ Einladung raus — **annehmen** |
| **Google Login-OAuth** (Projekt „BB Kalkulator") | `h.wacker@bub-immo.de` als IAM-**Editor** | ⏳ Edgar trägt in Cloud Console ein |
| **Airtable / HubSpot / PandaDoc / Drive** | bestehende bub-immo-Zugänge | ✅ hat Henry schon |

Sobald Henry GitHub + Vercel angenommen hat, sieht er **alle Secrets direkt in Vercel** — es muss **kein Geheimnis** per Mail/Chat übertragen werden.

---

## 2. Loslegen in 5 Schritten (Henry)

```bash
# 1. GitHub- + Vercel-Einladung annehmen (je 1 Mail).

# 2. Repo klonen
git clone git@github.com:esteininger123/BB.git
cd BB

# 3. Abhängigkeiten
npm install

# 4. Secrets aus Vercel ziehen (du bist Member → kein manuelles Eintragen)
npx vercel link              # Team "esteininger123's projects" → Projekt "bb"
npx vercel env pull .env.local

# 5. Claude Code im Ordner starten — lädt CLAUDE.md + Skills automatisch
claude
```

**Lokal testen:** `npm run dev` (= `vercel dev`, startet die Functions). **Tests:** `npm test`. **Schema-Check:** `npm run guard`.

---

## 3. Claude-Code-Setup — was automatisch da ist

**Du musst nichts einrichten.** Sobald du `claude` im Repo-Ordner startest, lädt Claude Code automatisch:

- **`CLAUDE.md`** — Projekt-Regeln, Stack, Conventions, „Was du NICHT darfst", aktueller Stand.
- **`.claude/skills/`** — 3 projektspezifische Skills, greifen automatisch über ihr Trigger-Wort:
  - **`airtable-feld-binden`** — neues Airtable-Feld atomar durch alle Schichten ziehen (verhindert die 422-Falle).
  - **`kalk-integritaet`** — Pflicht nach jeder Änderung an `public/kalkulator.js`.
  - **`vor-deploy-check`** — Pflicht vor jedem Push auf `main` (= geht **sofort live**).

**Pflicht-Lesefiles** (alle im Repo, Claude findet sie über CLAUDE.md):
`README.md` · `docs/SPEC.md` (Airtable-IDs, Auth, Routes) · `docs/KONZEPT.md` (Architektur, Datenmodell) · dieses `HANDOVER.md`.
**Rechenlogik:** `docs/2026-05-26_Master-Referenz_Berechnungslogik.html` + `docs/2026-05-25_Rechenlogik-Cheatsheet.html` + `docs/2026-05-19_Kalkulator-System-Diagramm.html`.

**Eigene globale CLAUDE.md:** Deine `~/.claude/CLAUDE.md` (dein Stil, deine Zugänge) ist deine Sache — Edgars private teilt er **nicht**. Das Projekt-Wissen steckt komplett in der Repo-`CLAUDE.md`.

---

## 4. Env-Variablen (25)

**Primärweg:** `npx vercel env pull .env.local` zieht alle Werte aus dem Vercel-Projekt. Manuelles Eintragen entfällt.
**Referenz, welche es gibt:** `.env.example` im Repo-Root (gruppiert, mit Kommentaren). Tabellen-IDs leben im Code (`api/_lib/tables.js`).

⚠️ **`UPLOAD_TOKEN_SECRET` niemals neu generieren**, solange aktive Kunden-Upload-Portal-Links laufender Finanzierungsfälle draußen sind — sonst werden die Links ungültig. Beim Zugriff-teilen-Modell unkritisch (Wert bleibt unverändert in Vercel).

---

## 5. Die drei Fallen (häufige „Bugs", die keine sind)

1. **OAuth / Preview-Login:** Branch-Previews können **nicht** zum Login genutzt werden — die OAuth-JS-Origins erlauben nur die Production-Domain. Auf `main` testen, oder die Preview-Origin in der Google Console eintragen.
2. **WE-Sichtbarkeit:** Eine Wohneinheit erscheint nur mit (1) erlaubter Firma [B&B Immo / B&B Bayern / Bärte Immo] **und** (2) aktivem Kalk-Stammdaten-Datensatz (`Status = Aktiv`). Fehlt eines → WE „verschwindet". **Nie ein Code-Bug.**
3. **Subvention „letzte Mietsteigerung":** Feld bei marktnahen Bestandsmietern **leer** lassen, sonst kippt die Subvention fälschlich auf 0 €.

---

## 6. Betrieb

- **Deploy:** Push auf `main` → Vercel baut + deployt **automatisch live**. Vorher immer Skill `vor-deploy-check`. Sicherer: Branch → Preview-URL → testen → mergen.
- **Cron:** `api/stammdaten/refresh-all` läuft 3×/Tag (05/11/16 Uhr), aus `vercel.json`.
- **Airtable:** Kunden-`Status`/`Typ` sind Auto-Formeln — **nie** manuell setzen. Field-**IDs** nutzen, nicht Namen (`tables.js`).
- **Domain:** `backstube.bub-immo.de` (Production-Alias). DNS bei bub-immo.

---

## 7. Später: voller Exit (optional, nicht jetzt)

Wenn Edgar irgendwann **ganz raus** will (nichts mehr an seinem Account):
1. GitHub-Repo in eine `bub-immo`-Org unter `info@bub-immo.de` transferieren.
2. Vercel: neues Team unter `info@bub-immo.de` (B&B-Zahlungsmethode), Repo neu importieren, `vercel env pull`/neu setzen.
3. Google-Login-OAuth-Client im bub-immo-Drive-Projekt (`info@bub-immo.de`) neu anlegen, `GOOGLE_CLIENT_ID` + Origins tauschen.
4. Domain `backstube.bub-immo.de` vom alten aufs neue Vercel-Projekt umhängen (kurzer Cut).

Bis dahin: Zugriff-teilen läuft, Edgar bleibt Anker.
