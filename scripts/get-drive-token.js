// Einmal-Script: holt einen Google-Drive Refresh-Token (OAuth Desktop-App-Flow).
//
// Start:  node scripts/get-drive-token.js
//
// Ablauf: Du wirst nach dem Client-Secret gefragt (Eingabe bleibt unsichtbar),
// dann öffnet sich der Browser. Dort mit dem B&B-Konto anmelden, das die Drive-
// Ordner besitzen soll, und "Zulassen" klicken. Am Ende steht der Refresh-Token
// im Terminal — den setzen wir in Vercel als GOOGLE_OAUTH_REFRESH_TOKEN.
//
// Voraussetzung: im Projektordner ausführen (braucht node_modules/google-auth-library;
// falls nicht da: vorher `npm install`).

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const { OAuth2Client } = require('google-auth-library');

// Client-ID ist nicht geheim (im OAuth-Flow ohnehin sichtbar).
const CLIENT_ID = '370108766380-lb4s1sc2329rkhh36uv7mlkpnddnoktv.apps.googleusercontent.com';
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/drive';

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let input = '';
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '') {
        stdin.setRawMode(false); stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n'); resolve(input);
      } else if (ch === '') { process.exit(1); }       // Ctrl-C
      else if (ch === '' || ch === '\b') { input = input.slice(0, -1); } // Backspace
      else { input += ch; }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET
    || await askHidden('Client-Secret (Eingabe bleibt unsichtbar): ')).trim();
  if (!clientSecret) { console.error('Kein Secret eingegeben.'); process.exit(1); }

  const oauth = new OAuth2Client(CLIENT_ID, clientSecret, REDIRECT);
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = oauth.generateAuthUrl({
    access_type: 'offline',   // damit ein refresh_token kommt
    prompt: 'consent',        // erzwingt refresh_token auch bei wiederholter Autorisierung
    scope: SCOPE,
    state,
  });

  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, REDIRECT);
      if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
      if (u.searchParams.get('state') !== state) { res.writeHead(400); res.end('state-Mismatch'); return; }
      const code = u.searchParams.get('code');
      if (!code) { res.writeHead(400); res.end('Kein Code erhalten'); return; }
      const { tokens } = await oauth.getToken(code);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2 style="font-family:sans-serif">Fertig — Fenster schliessen und zurueck zum Terminal.</h2>');
      if (tokens.refresh_token) {
        require('fs').writeFileSync(__dirname + '/.drive-token.txt', tokens.refresh_token, { mode: 0o600 });
        console.log('\n✓ Refresh-Token erhalten und in scripts/.drive-token.txt gespeichert.');
      } else {
        console.log('\n✗ KEIN refresh_token erhalten (meist: Konto hat die App schon autorisiert).');
        console.log('Fix: https://myaccount.google.com/permissions → "BB Backstube Drive" entfernen → Script erneut.');
      }
      server.close(); process.exit(tokens.refresh_token ? 0 : 1);
    } catch (e) {
      res.writeHead(500); res.end('Fehler: ' + e.message);
      console.error('\nFehler beim Token-Tausch:', e.message);
      server.close(); process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log('\nBrowser öffnet sich. Mit dem B&B-Konto anmelden, das die Ordner besitzen soll → "Zulassen".');
    console.log('Falls der Browser nicht aufgeht, diesen Link manuell öffnen:\n\n' + authUrl + '\n');
    const opener = process.platform === 'darwin' ? 'open' : (process.platform === 'win32' ? 'start ""' : 'xdg-open');
    exec(`${opener} "${authUrl}"`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
