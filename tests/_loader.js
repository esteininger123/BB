// Test-Loader: lädt public/we-presets.js + public/kalkulator.js in einem
// Sandbox-Context. Liefert das `window`-Objekt zurück, sodass Tests
// `Kalk.recalc()`, `Kalk.PRESETS` etc. nutzen können.
//
// Hintergrund: public/*.js sind Browser-Skripte ohne ES-Module-Exports. Sie
// schreiben auf `window.*`. Wir simulieren `window` in einer vm-Sandbox.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC = path.join(__dirname, '..', 'public');

function loadKalk() {
  const presetsSrc = fs.readFileSync(path.join(PUBLIC, 'we-presets.js'), 'utf8');
  const kalkSrc = fs.readFileSync(path.join(PUBLIC, 'kalkulator.js'), 'utf8');

  const sandbox = {
    window: {},
    console,
    // Math, JSON, Number, parseFloat, parseInt sind global
  };
  vm.createContext(sandbox);
  vm.runInContext(presetsSrc, sandbox, { filename: 'we-presets.js' });
  vm.runInContext(kalkSrc, sandbox, { filename: 'kalkulator.js' });

  return sandbox.window;
}

module.exports = { loadKalk };
