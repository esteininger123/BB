#!/bin/bash
# BB Kalkulator V2 — Lokales Setup-Script (v2, ohne Node-Pflicht)
# Ausführen mit: bash setup-local.sh

set -e
cd "$(dirname "$0")"

echo ""
echo "============================================="
echo "  BB Kalkulator V2 — Lokales Setup"
echo "============================================="
echo ""

# ---- 1. Cleanup
echo "→ Cleanup: lösche Test-Reste + defekte .git-Reste..."
rm -f public/test.txt zzz_test_*.txt 2>/dev/null
rm -rf .git 2>/dev/null
echo "  ✓ aufgeräumt"
echo ""

# ---- 2. Node-Version prüfen (optional)
echo "→ Node-Version prüfen..."
if command -v node &> /dev/null; then
  NODE_VER=$(node --version)
  echo "  ✓ Node $NODE_VER (lokal installiert — npm install läuft gleich)"
  HAS_NODE=1
else
  echo "  ⚠ Node.js NICHT lokal installiert"
  echo "    → Ist OK! Vercel installiert die Dependencies beim Deploy selbst."
  echo "    → Falls du später lokal testen willst: brew install node oder"
  echo "      https://nodejs.org → LTS-Version (.pkg)"
  HAS_NODE=0
fi
echo ""

# ---- 3. npm install (nur wenn Node da)
if [ "$HAS_NODE" = "1" ]; then
  echo "→ npm install (Dependencies für Vercel-Build)..."
  npm install --silent 2>&1 | tail -5
  echo "  ✓ Dependencies installiert (node_modules/)"
else
  echo "→ npm install übersprungen (kein Node lokal)"
  echo "  Vercel macht das beim Deploy automatisch."
fi
echo ""

# ---- 4. Git initialisieren
echo "→ Git-Repo initialisieren..."
git init -b main -q
git config user.email "e.steininger@immo-stein.de"
git config user.name "Edgar Steininger"
git add -A
git commit -m "Initial commit — BB Kalkulator V2 (Iter 14)" -q
echo "  ✓ Repo initialisiert, erster Commit erstellt"
echo ""

# ---- 5. JWT_SECRET generieren
echo "→ JWT_SECRET generieren (für Vercel-Env-Variable)..."
if command -v node &> /dev/null; then
  JWT=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
else
  # Fallback: openssl (immer auf macOS verfügbar)
  JWT=$(openssl rand -hex 64)
fi
echo "$JWT" > .jwt-secret.txt
echo "  ✓ JWT_SECRET generiert (gespeichert in .jwt-secret.txt)"
echo ""

echo "============================================="
echo "  LOKAL FERTIG"
echo "============================================="
echo ""
echo "Jetzt ausführen (sollte schon im Command-Block stehen):"
echo "  git remote add origin https://github.com/esteininger123/BB.git"
echo "  git branch -M main"
echo "  git push -u origin main"
echo ""
