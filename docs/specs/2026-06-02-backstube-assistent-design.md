# Backstube-Assistent — Design (Phase 1)

- **Datum:** 2026-06-02
- **Status:** Entwurf zur Freigabe
- **Projekt:** BB Kalkulator V2 (`webapp-v2`)

## 1. Ziel & Kontext

KI-Chat-Assistent, eingebettet **unten rechts** in der Backstube-App. Beantwortet eingeloggten Vertrieblern Fragen — **kontextbewusst** zur gerade offenen Kalkulation/Kunde und **strikt gegroundet** in der echten B&B-Rechenlogik/Doku.

Größere Vision (Edgar): zusätzlich proaktive Hinweise, welcher Kunde Potenzial hat („Vertriebs-Radar"). Das ist **Phase 2** und hier bewusst ausgeklammert.

## 2. Scope

**In Scope (Phase 1 / MVP):**
- Chat-Widget unten rechts, nur für eingeloggte Vertriebler.
- Frage-Antwort, kontextbewusst (offener Kunde / WE / Kalkulation).
- Strikt gegroundet: Wissens-Briefing + Live-Kontext, kein Halluzinieren.
- Streaming-Antworten (Wort für Wort). Modell: Claude **Haiku 4.5**.

**Out of Scope (Phase 2+):**
- Proaktives Lead-/Potenzial-Scoring („Radar").
- Selbstständiges Nachschlagen in den APIs (Tool-Use).
- Verlaufs-Persistenz, Multi-Device-Threads, RAG-Vektorindex.

## 3. Getroffene Entscheidungen

| Frage | Entscheidung |
|---|---|
| MVP-Kern | Assistent zuerst, Radar = Phase 2 |
| Kontext | Kontextbewusst (sieht offenen Kunden/WE/Kalkulation) |
| Genauigkeit | Strikt aus eurer Logik/Doku; bei Unklarheit „weiß ich nicht" |
| Bau-Ansatz | A — Briefing + Live-Kontext (kein Tool-Use, kein RAG) |
| Modell | Claude Haiku 4.5 (`claude-haiku-4-5`); Upgrade-Pfad auf Sonnet offen |
| Antwort-UX | Streaming |

## 4. Architektur

```
Vertriebler  ──►  Chat-Widget (Frontend)  ──►  api/assistent.js  ──►  Claude (Haiku 4.5, Streaming)
                       ▲  Live-Kontext aus state         │  System = Wissens-Briefing (cached) + Guardrails
                       └──────────  Stream zurück  ◄──────┘
```

- **Frontend:** Vanilla-JS-Widget in der bestehenden SPA, kein Build-Step.
- **Backend:** neue Vercel Serverless Function `api/assistent.js` (Node 20).
- **Auth:** nur eingeloggt — Session-Cookie `bbk_session` über `api/_lib/auth.js` verifizieren (gleiche Mechanik wie die übrigen Endpunkte).
- **KI:** Claude über die Messages-API (SDK oder fetch) mit **Streaming** + **Prompt-Caching** auf dem Wissens-Briefing.
- **Secret:** `ANTHROPIC_API_KEY` als Vercel-Env-Var (+ lokal in `.env-secrets.txt`).

## 5. Komponenten

1. `public/chat-widget.js` — FAB unten rechts + ausklappbares Panel, Nachrichtenliste, Eingabe, Streaming-Renderer, Kontext-Sammler. Verlauf nur im Speicher der Seite.
2. `public/styles.css` (Ergänzung) — Widget im B&B-Branding (Cream/Bronze/Wald), `@media print` neutral.
3. `public/index.html` — Widget-Script-Tag + Cache-Bust-Bump (`?v=NNN`).
4. `api/assistent.js` — Auth-Check, Prompt-Aufbau, Claude-Streaming-Call, Fehlerbehandlung.
5. `api/_lib/assistent-wissen.md` (oder `.js`-Export) — **kuratiertes Wissens-Briefing**. Inhalt aus: 2-Phasen-Subventionsmodell, Engine-Cheatsheet, Master-Referenz Berechnungslogik, Bedienungs-Basics, Einwand-Basics. **Edgar-Freigabe vor Go-Live** (das ist die Faktenquelle).
6. `api/_lib/assistent-prompt.js` — Prompt-Aufbau als **reine Funktion** (testbar, ohne Netz).

## 6. Datenfluss

1. Vertriebler öffnet Widget, tippt Frage.
2. Widget sammelt **kompakten Live-Kontext** aus `state` (offener Kunde-ID/Name, WE, Eckdaten der Kalkulation: Kaltmiete, KP, IRR, Cashflow, Subvention …) — gezielt, **nicht** die ganze DB.
3. POST `/api/assistent` mit Cookie + `{verlauf, frage, kontext}`.
4. Function: Session prüfen → System-Prompt = `[Wissens-Briefing (cached)]` + `[Rolle/Guardrails]` → Messages = `Kontext + Verlauf + Frage` → Claude (Haiku 4.5, stream).
5. Antwort wird gestreamt zurück → Widget rendert Wort für Wort.

## 7. Verlässlichkeit / Guardrails

- System-Prompt zwingt: **nur** aus Briefing + Live-Kontext antworten; keine Zahlen/Steuer-/Rechtsaussagen erfinden; bei Unklarheit ehrlich „weiß ich nicht — frag Henry/Edgar".
- Steuer/Recht: Standard-Hinweis „Modell-Rechnung, keine Steuer-/Rechtsberatung, im Zweifel Steuerberater" (wie im bestehenden Annahmen-Modal).
- **Reiner Lese-/Antwort-Assistent** — keine Aktionen, keine Schreibzugriffe.

## 8. Datenschutz (Pre-Go-Live)

- Live-Kontext enthält echte Kundendaten → vor Echteinsatz: Anthropic **EU-Datenverarbeitung + AVV/DPA**, kein Training (API-Default), ggf. Zero-Retention prüfen.
- Nur eingeloggte Vertriebler; Übertragung über HTTPS; **keine** serverseitige Speicherung des Verlaufs.
- Abwägung: Kundenname mitsenden (Vertriebler braucht ihn) vs. minimieren. MVP: mitsenden unter AVV.

## 9. Fehlerfälle

- Key fehlt / Claude-Fehler / Timeout → freundliche Fehlermeldung im Chat, kein Absturz.
- Nicht eingeloggt → Widget rendert nicht; Endpoint antwortet 401.
- Anthropic-Rate-Limit → abgefangen, „kurz nochmal versuchen".

## 10. Tests

- `tests/assistent-prompt.test.js` — Prompt-Aufbau (Kontext rein → erwarteter Prompt), Claude gemockt.
- JSC-Syntax-Check für `chat-widget.js` + `api/assistent.js`.
- Manuelle Klick-Liste (vor-deploy-check): Widget auf/zu, Frage, Streaming, Fehlerfall, eingeloggt/ausgeloggt.
- Engine `kalkulator.js` **unberührt** → Snapshot-Tests nicht betroffen.

## 11. Kosten

- Haiku 4.5 + Prompt-Caching auf dem Briefing → Kosten pro Nachricht gering. Monitoring empfohlen; harte Caps erst bei Bedarf.

## 12. Phase 2 — Vertriebs-Radar (Ausblick, nicht jetzt)

- Bot bekommt (über Tool-Use oder Vorab-Aggregation) Zugriff auf Kundenliste + Snapshots → Potenzial-Hinweise.
- Braucht: Definition „Potenzial" (Kriterien), Daten-Absicherung pro Vertriebler, Datenschutz-Erweiterung.
- Ansatz A ist so gebaut, dass B (Tool-Use) andockbar ist.

## 13. Offene Punkte / vor Go-Live

- [ ] Wissens-Briefing von Edgar freigegeben.
- [ ] Anthropic AVV / EU-Datenverarbeitung geklärt.
- [ ] `ANTHROPIC_API_KEY` in Vercel gesetzt.
- [ ] „Potenzial"-Definition (erst für Phase 2 relevant).
