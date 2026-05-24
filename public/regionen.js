/* regionen.js — Deutsche Bundesländer + Landkreise/kreisfreie Städte.
 * Quelle: DESTATIS-Verwaltungsgliederung Stand 2025. Hardcoded, keine API.
 *
 * Zweck (Edgar-Feedback 24.05.2026): Kunden-Wunschregionen — Vertriebler kann
 * pro Kunde Bundesland + Landkreise/Städte hinterlegen. Speicherung erfolgt
 * im Kunden-Notizen-Feld als spezieller Block (analog KAV-Tracker),
 * damit kein neues Airtable-Feld nötig ist.
 *
 * Schlüssel-Schema: 'BL-KEY' → BL-Name + Array von Kreisen
 * BL-Keys: ISO-3166-2:DE-Codes (BW, BY, BE, BB, HB, HH, HE, MV, NI, NW, RP, SL, SN, ST, SH, TH)
 */
window.REGIONEN = {
  'BW': {
    name: 'Baden-Württemberg',
    kreise: [
      // Stadtkreise
      'Baden-Baden (SK)', 'Freiburg im Breisgau (SK)', 'Heidelberg (SK)', 'Heilbronn (SK)',
      'Karlsruhe (SK)', 'Mannheim (SK)', 'Pforzheim (SK)', 'Stuttgart (SK)', 'Ulm (SK)',
      // Landkreise
      'Alb-Donau-Kreis', 'Biberach', 'Böblingen', 'Bodenseekreis', 'Breisgau-Hochschwarzwald',
      'Calw', 'Emmendingen', 'Enzkreis', 'Esslingen', 'Freudenstadt', 'Göppingen',
      'Heidenheim', 'Heilbronn (Lkr)', 'Hohenlohekreis', 'Karlsruhe (Lkr)', 'Konstanz',
      'Lörrach', 'Ludwigsburg', 'Main-Tauber-Kreis', 'Neckar-Odenwald-Kreis',
      'Ortenaukreis', 'Ostalbkreis', 'Rastatt', 'Ravensburg', 'Rems-Murr-Kreis',
      'Reutlingen', 'Rhein-Neckar-Kreis', 'Rottweil', 'Schwäbisch Hall',
      'Schwarzwald-Baar-Kreis', 'Sigmaringen', 'Tübingen', 'Tuttlingen', 'Waldshut',
      'Zollernalbkreis'
    ]
  },
  'BY': {
    name: 'Bayern',
    kreise: [
      'Amberg (SK)', 'Ansbach (SK)', 'Aschaffenburg (SK)', 'Augsburg (SK)', 'Bamberg (SK)',
      'Bayreuth (SK)', 'Coburg (SK)', 'Erlangen (SK)', 'Fürth (SK)', 'Hof (SK)',
      'Ingolstadt (SK)', 'Kaufbeuren (SK)', 'Kempten (Allgäu) (SK)', 'Landshut (SK)',
      'Memmingen (SK)', 'München (SK)', 'Nürnberg (SK)', 'Passau (SK)', 'Regensburg (SK)',
      'Rosenheim (SK)', 'Schwabach (SK)', 'Schweinfurt (SK)', 'Straubing (SK)',
      'Weiden in der Oberpfalz (SK)', 'Würzburg (SK)',
      'Aichach-Friedberg', 'Altötting', 'Amberg-Sulzbach', 'Ansbach (Lkr)',
      'Aschaffenburg (Lkr)', 'Augsburg (Lkr)', 'Bad Kissingen', 'Bad Tölz-Wolfratshausen',
      'Bamberg (Lkr)', 'Bayreuth (Lkr)', 'Berchtesgadener Land', 'Cham', 'Coburg (Lkr)',
      'Dachau', 'Deggendorf', 'Dillingen an der Donau', 'Dingolfing-Landau', 'Donau-Ries',
      'Ebersberg', 'Eichstätt', 'Erding', 'Erlangen-Höchstadt', 'Forchheim',
      'Freising', 'Freyung-Grafenau', 'Fürstenfeldbruck', 'Fürth (Lkr)', 'Garmisch-Partenkirchen',
      'Günzburg', 'Haßberge', 'Hof (Lkr)', 'Kelheim', 'Kitzingen', 'Kronach', 'Kulmbach',
      'Landsberg am Lech', 'Landshut (Lkr)', 'Lichtenfels', 'Lindau (Bodensee)',
      'Main-Spessart', 'Miesbach', 'Miltenberg', 'Mühldorf am Inn', 'München (Lkr)',
      'Neuburg-Schrobenhausen', 'Neumarkt in der Oberpfalz', 'Neustadt an der Aisch-Bad Windsheim',
      'Neustadt an der Waldnaab', 'Neu-Ulm', 'Nürnberger Land', 'Oberallgäu', 'Ostallgäu',
      'Passau (Lkr)', 'Pfaffenhofen an der Ilm', 'Regen', 'Regensburg (Lkr)',
      'Rhön-Grabfeld', 'Rosenheim (Lkr)', 'Roth', 'Rottal-Inn', 'Schwandorf',
      'Schweinfurt (Lkr)', 'Starnberg', 'Straubing-Bogen', 'Tirschenreuth', 'Traunstein',
      'Unterallgäu', 'Weilheim-Schongau', 'Weißenburg-Gunzenhausen', 'Wunsiedel im Fichtelgebirge',
      'Würzburg (Lkr)'
    ]
  },
  'BE': {
    name: 'Berlin',
    kreise: ['Berlin (gesamt)', 'Charlottenburg-Wilmersdorf', 'Friedrichshain-Kreuzberg',
      'Lichtenberg', 'Marzahn-Hellersdorf', 'Mitte', 'Neukölln', 'Pankow', 'Reinickendorf',
      'Spandau', 'Steglitz-Zehlendorf', 'Tempelhof-Schöneberg', 'Treptow-Köpenick']
  },
  'BB': {
    name: 'Brandenburg',
    kreise: [
      'Brandenburg an der Havel (SK)', 'Cottbus (SK)', 'Frankfurt (Oder) (SK)', 'Potsdam (SK)',
      'Barnim', 'Dahme-Spreewald', 'Elbe-Elster', 'Havelland', 'Märkisch-Oderland',
      'Oberhavel', 'Oberspreewald-Lausitz', 'Oder-Spree', 'Ostprignitz-Ruppin',
      'Potsdam-Mittelmark', 'Prignitz', 'Spree-Neiße', 'Teltow-Fläming', 'Uckermark'
    ]
  },
  'HB': {
    name: 'Bremen',
    kreise: ['Bremen (SK)', 'Bremerhaven (SK)']
  },
  'HH': {
    name: 'Hamburg',
    kreise: ['Hamburg (gesamt)', 'Altona', 'Bergedorf', 'Eimsbüttel', 'Hamburg-Mitte',
      'Hamburg-Nord', 'Harburg', 'Wandsbek']
  },
  'HE': {
    name: 'Hessen',
    kreise: [
      'Darmstadt (SK)', 'Frankfurt am Main (SK)', 'Kassel (SK)', 'Offenbach am Main (SK)', 'Wiesbaden (SK)',
      'Bergstraße', 'Darmstadt-Dieburg', 'Fulda', 'Gießen', 'Groß-Gerau',
      'Hersfeld-Rotenburg', 'Hochtaunuskreis', 'Kassel (Lkr)', 'Lahn-Dill-Kreis', 'Limburg-Weilburg',
      'Main-Kinzig-Kreis', 'Main-Taunus-Kreis', 'Marburg-Biedenkopf', 'Odenwaldkreis',
      'Offenbach (Lkr)', 'Rheingau-Taunus-Kreis', 'Schwalm-Eder-Kreis', 'Vogelsbergkreis',
      'Waldeck-Frankenberg', 'Werra-Meißner-Kreis', 'Wetteraukreis'
    ]
  },
  'MV': {
    name: 'Mecklenburg-Vorpommern',
    kreise: [
      'Rostock (SK)', 'Schwerin (SK)',
      'Ludwigslust-Parchim', 'Mecklenburgische Seenplatte', 'Nordwestmecklenburg',
      'Rostock (Lkr)', 'Vorpommern-Greifswald', 'Vorpommern-Rügen'
    ]
  },
  'NI': {
    name: 'Niedersachsen',
    kreise: [
      'Braunschweig (SK)', 'Delmenhorst (SK)', 'Emden (SK)', 'Hannover (Region)',
      'Oldenburg (Oldb) (SK)', 'Osnabrück (SK)', 'Salzgitter (SK)', 'Wilhelmshaven (SK)', 'Wolfsburg (SK)',
      'Ammerland', 'Aurich', 'Celle', 'Cloppenburg', 'Cuxhaven', 'Diepholz', 'Emsland',
      'Friesland', 'Gifhorn', 'Goslar', 'Göttingen', 'Grafschaft Bentheim', 'Hameln-Pyrmont',
      'Harburg', 'Heidekreis', 'Helmstedt', 'Hildesheim', 'Holzminden', 'Leer', 'Lüchow-Dannenberg',
      'Lüneburg', 'Nienburg/Weser', 'Northeim', 'Oldenburg (Lkr)', 'Osnabrück (Lkr)', 'Osterholz',
      'Osterode am Harz', 'Peine', 'Rotenburg (Wümme)', 'Schaumburg', 'Stade', 'Uelzen',
      'Vechta', 'Verden', 'Wesermarsch', 'Wittmund', 'Wolfenbüttel'
    ]
  },
  'NW': {
    name: 'Nordrhein-Westfalen',
    kreise: [
      'Aachen (StädteRegion)', 'Bielefeld (SK)', 'Bochum (SK)', 'Bonn (SK)', 'Bottrop (SK)',
      'Dortmund (SK)', 'Duisburg (SK)', 'Düsseldorf (SK)', 'Essen (SK)', 'Gelsenkirchen (SK)',
      'Hagen (SK)', 'Hamm (SK)', 'Herne (SK)', 'Köln (SK)', 'Krefeld (SK)', 'Leverkusen (SK)',
      'Mönchengladbach (SK)', 'Mülheim an der Ruhr (SK)', 'Münster (SK)', 'Oberhausen (SK)',
      'Remscheid (SK)', 'Solingen (SK)', 'Wuppertal (SK)',
      'Borken', 'Coesfeld', 'Düren', 'Ennepe-Ruhr-Kreis', 'Euskirchen', 'Gütersloh',
      'Heinsberg', 'Herford', 'Hochsauerlandkreis', 'Höxter', 'Kleve', 'Lippe',
      'Märkischer Kreis', 'Mettmann', 'Minden-Lübbecke', 'Oberbergischer Kreis', 'Olpe',
      'Paderborn', 'Recklinghausen', 'Rhein-Erft-Kreis', 'Rheinisch-Bergischer Kreis',
      'Rhein-Kreis Neuss', 'Rhein-Sieg-Kreis', 'Siegen-Wittgenstein', 'Soest',
      'Steinfurt', 'Unna', 'Viersen', 'Warendorf', 'Wesel'
    ]
  },
  'RP': {
    name: 'Rheinland-Pfalz',
    kreise: [
      'Frankenthal (Pfalz) (SK)', 'Kaiserslautern (SK)', 'Koblenz (SK)', 'Landau in der Pfalz (SK)',
      'Ludwigshafen am Rhein (SK)', 'Mainz (SK)', 'Neustadt an der Weinstraße (SK)',
      'Pirmasens (SK)', 'Speyer (SK)', 'Trier (SK)', 'Worms (SK)', 'Zweibrücken (SK)',
      'Ahrweiler', 'Altenkirchen (Westerwald)', 'Alzey-Worms', 'Bad Dürkheim', 'Bad Kreuznach',
      'Bernkastel-Wittlich', 'Birkenfeld', 'Cochem-Zell', 'Donnersbergkreis',
      'Eifelkreis Bitburg-Prüm', 'Germersheim', 'Kaiserslautern (Lkr)', 'Kusel',
      'Mainz-Bingen', 'Mayen-Koblenz', 'Neuwied', 'Rhein-Hunsrück-Kreis', 'Rhein-Lahn-Kreis',
      'Rhein-Pfalz-Kreis', 'Südliche Weinstraße', 'Südwestpfalz', 'Trier-Saarburg',
      'Vulkaneifel', 'Westerwaldkreis'
    ]
  },
  'SL': {
    name: 'Saarland',
    kreise: ['Saarbrücken (Regionalverband)', 'Merzig-Wadern', 'Neunkirchen', 'Saarlouis',
      'Saarpfalz-Kreis', 'St. Wendel']
  },
  'SN': {
    name: 'Sachsen',
    kreise: [
      'Chemnitz (SK)', 'Dresden (SK)', 'Leipzig (SK)',
      'Bautzen', 'Erzgebirgskreis', 'Görlitz', 'Leipzig (Lkr)', 'Meißen', 'Mittelsachsen',
      'Nordsachsen', 'Sächsische Schweiz-Osterzgebirge', 'Vogtlandkreis', 'Zwickau'
    ]
  },
  'ST': {
    name: 'Sachsen-Anhalt',
    kreise: [
      'Dessau-Roßlau (SK)', 'Halle (Saale) (SK)', 'Magdeburg (SK)',
      'Altmarkkreis Salzwedel', 'Anhalt-Bitterfeld', 'Börde', 'Burgenlandkreis',
      'Harz', 'Jerichower Land', 'Mansfeld-Südharz', 'Saalekreis', 'Salzlandkreis',
      'Stendal', 'Wittenberg'
    ]
  },
  'SH': {
    name: 'Schleswig-Holstein',
    kreise: [
      'Flensburg (SK)', 'Kiel (SK)', 'Lübeck (SK)', 'Neumünster (SK)',
      'Dithmarschen', 'Herzogtum Lauenburg', 'Nordfriesland', 'Ostholstein',
      'Pinneberg', 'Plön', 'Rendsburg-Eckernförde', 'Schleswig-Flensburg',
      'Segeberg', 'Steinburg', 'Stormarn'
    ]
  },
  'TH': {
    name: 'Thüringen',
    kreise: [
      'Erfurt (SK)', 'Gera (SK)', 'Jena (SK)', 'Suhl (SK)', 'Weimar (SK)', 'Eisenach (SK)',
      'Altenburger Land', 'Eichsfeld', 'Gotha', 'Greiz', 'Hildburghausen', 'Ilm-Kreis',
      'Kyffhäuserkreis', 'Nordhausen', 'Saale-Holzland-Kreis', 'Saale-Orla-Kreis',
      'Saalfeld-Rudolstadt', 'Schmalkalden-Meiningen', 'Sömmerda', 'Sonneberg',
      'Unstrut-Hainich-Kreis', 'Wartburgkreis', 'Weimarer Land'
    ]
  }
};

// Helper: Liste der Bundesland-Codes in Anzeige-Reihenfolge (alphabetisch nach Name)
window.REGIONEN_BL_KEYS = Object.keys(window.REGIONEN).sort((a, b) =>
  window.REGIONEN[a].name.localeCompare(window.REGIONEN[b].name, 'de')
);

// Helper: bekommt 'BW:Ortenaukreis' → { bl: 'BW', kreis: 'Ortenaukreis' }
window.parseRegionKey = function(s) {
  if (!s || typeof s !== 'string') return null;
  const idx = s.indexOf(':');
  if (idx <= 0) return null;
  return { bl: s.substring(0, idx), kreis: s.substring(idx + 1) };
};

// Helper: serialisiert Liste von { bl, kreis } in Komma-Liste
window.stringifyRegions = function(arr) {
  if (!Array.isArray(arr)) return '';
  return arr.map(r => `${r.bl}:${r.kreis}`).join(',');
};
window.parseRegions = function(s) {
  if (!s || typeof s !== 'string') return [];
  return s.split(',').map(p => window.parseRegionKey(p.trim())).filter(Boolean);
};
