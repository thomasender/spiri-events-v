// Pure part of the region register generator (scripts/build-region-data.mjs): reads the
// country CSVs in scripts/data/regions/ and turns them into the register entries. Imported by
// the generator and by tests/lib/regionRegisterCsv.spec.ts (which regenerates and compares).
//
// The CSVs are the ONLY source of regions and districts. UTF-8 (BOM allowed), LF or CRLF, one
// row per region. Two layouts are accepted (detected by the header):
//   `Region;Bezirke`   `;`-separated, the districts comma-separated in the second column
//                      (oesterreich.csv, schweiz.csv, liechtenstein.csv)
//   `region, bezirk`   comma-separated, the region name followed by all its districts, one
//                      per column (deutschland.csv)
// The country comes from the file name (COUNTRY_FILES). Region order = file order of
// COUNTRY_FILES, then row order. District names are taken 1:1 (must be unique per country).
// Wording per region (id, inPhrase, forPhrase, demonym) lives in META below; a CSV region
// without META or a META entry without CSV row fails the build.
import { existsSync, readFileSync } from 'node:fs';

export const REGION_CSV_DIR = 'scripts/data/regions';

// Country -> CSV file, in switcher order (Austria, Germany, Switzerland, Liechtenstein). A
// country whose file does not exist is skipped.
export const COUNTRY_FILES = [
  ['AT', 'oesterreich.csv'],
  ['DE', 'deutschland.csv'],
  ['CH', 'schweiz.csv'],
  ['LI', 'liechtenstein.csv'],
];

export const COUNTRY_SETTINGS = {
  AT: { subdivisionLabel: 'Bezirk', timezone: 'Europe/Vienna' },
  CH: { subdivisionLabel: 'Bezirk', timezone: 'Europe/Zurich' },
  // Informational only (all date maths uses Europe/Vienna); same offset all year.
  LI: { subdivisionLabel: 'Landesteil', timezone: 'Europe/Vaduz' },
  DE: { subdivisionLabel: 'Landkreis', timezone: 'Europe/Berlin' },
};

// Per country: CSV region name -> { slug, demonym, inPhrase?, forPhrase? }.
// `slug` is the region id (internal, also the URL `/tirol`): ASCII, lowercase, umlauts
// transliterated, spaces / dots -> "-". NEVER change an existing slug (stored on events,
// profiles, moderators). Missing inPhrase -> "in <name>", missing forPhrase -> <name>.
// `demonym` is the complete token for "Dein <demonym> Kalender".
export const META = {
  AT: {
    Burgenland: {
      slug: 'burgenland',
      demonym: 'burgenländischer',
      inPhrase: 'im Burgenland',
      forPhrase: 'das Burgenland',
    },
    Kärnten: { slug: 'kaernten', demonym: 'Kärntner' },
    Niederösterreich: { slug: 'niederoesterreich', demonym: 'niederösterreichischer' },
    Oberösterreich: { slug: 'oberoesterreich', demonym: 'oberösterreichischer' },
    Salzburg: { slug: 'salzburg', demonym: 'Salzburger' },
    Steiermark: {
      slug: 'steiermark',
      demonym: 'steirischer',
      inPhrase: 'in der Steiermark',
      forPhrase: 'die Steiermark',
    },
    Tirol: { slug: 'tirol', demonym: 'Tiroler' },
    Vorarlberg: { slug: 'vorarlberg', demonym: 'Vorarlberger' },
    Wien: { slug: 'wien', demonym: 'Wiener' },
  },
  DE: {
    'Region Stuttgart': { slug: 'region-stuttgart', demonym: 'Stuttgarter', inPhrase: 'in der Region Stuttgart', forPhrase: 'die Region Stuttgart' },
    Ostalb: { slug: 'ostalb', demonym: 'Ostälbler', inPhrase: 'auf der Ostalb', forPhrase: 'die Ostalb' },
    'Schwäbische Alb': { slug: 'schwaebische-alb', demonym: 'Älbler', inPhrase: 'auf der Schwäbischen Alb', forPhrase: 'die Schwäbische Alb' },
    'Heilbronn Franken': { slug: 'heilbronn-franken', demonym: 'Heilbronner', inPhrase: 'in Heilbronn-Franken', forPhrase: 'Heilbronn-Franken' },
    Kurpfalz: { slug: 'kurpfalz', demonym: 'kurpfälzischer', inPhrase: 'in der Kurpfalz', forPhrase: 'die Kurpfalz' },
    Mittelbaden: { slug: 'mittelbaden', demonym: 'mittelbadischer' },
    Ortenau: { slug: 'ortenau', demonym: 'Ortenauer', inPhrase: 'in der Ortenau', forPhrase: 'die Ortenau' },
    Südbaden: { slug: 'suedbaden', demonym: 'südbadischer' },
    Schwarzwald: { slug: 'schwarzwald', demonym: 'Schwarzwälder', inPhrase: 'im Schwarzwald', forPhrase: 'den Schwarzwald' },
    Bodensee: { slug: 'bodensee', demonym: 'Bodensee', inPhrase: 'am Bodensee', forPhrase: 'den Bodensee' },
    Oberschwaben: { slug: 'oberschwaben', demonym: 'oberschwäbischer' },
    'Region Ulm': { slug: 'region-ulm', demonym: 'Ulmer', inPhrase: 'in der Region Ulm', forPhrase: 'die Region Ulm' },
    München: { slug: 'muenchen', demonym: 'Münchner' },
    'Bayerisches Oberland': { slug: 'bayerisches-oberland', demonym: 'Oberländer', inPhrase: 'im Bayerischen Oberland', forPhrase: 'das Bayerische Oberland' },
    Chiemgau: { slug: 'chiemgau', demonym: 'Chiemgauer', inPhrase: 'im Chiemgau', forPhrase: 'den Chiemgau' },
    Donauraum: { slug: 'donauraum', demonym: 'Donauraum', inPhrase: 'im Donauraum', forPhrase: 'den Donauraum' },
    Niederbayern: { slug: 'niederbayern', demonym: 'niederbayerischer' },
    'Bayerischer Wald': { slug: 'bayerischer-wald', demonym: 'Bayerwald', inPhrase: 'im Bayerischen Wald', forPhrase: 'den Bayerischen Wald' },
    Oberpfalz: { slug: 'oberpfalz', demonym: 'Oberpfälzer', inPhrase: 'in der Oberpfalz', forPhrase: 'die Oberpfalz' },
    Nürnberg: { slug: 'nuernberg', demonym: 'Nürnberger' },
    Westmittelfranken: { slug: 'westmittelfranken', demonym: 'westmittelfränkischer' },
    'Bamberger Land': { slug: 'bamberger-land', demonym: 'Bamberger', inPhrase: 'im Bamberger Land', forPhrase: 'das Bamberger Land' },
    Fichtelgebirge: { slug: 'fichtelgebirge', demonym: 'Fichtelgebirge', inPhrase: 'im Fichtelgebirge', forPhrase: 'das Fichtelgebirge' },
    'Coburger Land': { slug: 'coburger-land', demonym: 'Coburger', inPhrase: 'im Coburger Land', forPhrase: 'das Coburger Land' },
    Mainfranken: { slug: 'mainfranken', demonym: 'mainfränkischer' },
    'Bayerischer Untermain': { slug: 'bayerischer-untermain', demonym: 'Untermain', inPhrase: 'am Bayerischen Untermain', forPhrase: 'den Bayerischen Untermain' },
    'Region Augsburg': { slug: 'region-augsburg', demonym: 'Augsburger', inPhrase: 'in der Region Augsburg', forPhrase: 'die Region Augsburg' },
    Allgäu: { slug: 'allgaeu', demonym: 'Allgäuer', inPhrase: 'im Allgäu', forPhrase: 'das Allgäu' },
    Berlin: { slug: 'berlin', demonym: 'Berliner' },
    Havelregion: { slug: 'havelregion', demonym: 'Havelländer', inPhrase: 'in der Havelregion', forPhrase: 'die Havelregion' },
    Fläming: { slug: 'flaeming', demonym: 'Fläming', inPhrase: 'im Fläming', forPhrase: 'den Fläming' },
    'Prignitz-Oberhavel': { slug: 'prignitz-oberhavel', demonym: 'Prignitz-Oberhavel' },
    Uckermark: { slug: 'uckermark', demonym: 'Uckermärker', inPhrase: 'in der Uckermark', forPhrase: 'die Uckermark' },
    Oderland: { slug: 'oderland', demonym: 'Oderländer', inPhrase: 'im Oderland', forPhrase: 'das Oderland' },
    Lausitz: { slug: 'lausitz', demonym: 'Lausitzer', inPhrase: 'in der Lausitz', forPhrase: 'die Lausitz' },
    Bremen: { slug: 'bremen', demonym: 'Bremer' },
    Hamburg: { slug: 'hamburg', demonym: 'Hamburger' },
    'Rhein-Main-Gebiet': { slug: 'rhein-main-gebiet', demonym: 'Rhein-Main', inPhrase: 'im Rhein-Main-Gebiet', forPhrase: 'das Rhein-Main-Gebiet' },
    'Wetterau-Kinzigtal': { slug: 'wetterau-kinzigtal', demonym: 'Wetterau-Kinzigtal' },
    Südhessen: { slug: 'suedhessen', demonym: 'südhessischer' },
    Mittelhessen: { slug: 'mittelhessen', demonym: 'mittelhessischer' },
    Osthessen: { slug: 'osthessen', demonym: 'osthessischer' },
    Nordhessen: { slug: 'nordhessen', demonym: 'nordhessischer' },
    Westmecklenburg: { slug: 'westmecklenburg', demonym: 'westmecklenburgischer' },
    Rostock: { slug: 'rostock', demonym: 'Rostocker' },
    'Mecklenburgische Seenplatte': { slug: 'mecklenburgische-seenplatte', demonym: 'Seenplatte', inPhrase: 'an der Mecklenburgischen Seenplatte', forPhrase: 'die Mecklenburgische Seenplatte' },
    Vorpommern: { slug: 'vorpommern', demonym: 'vorpommerscher' },
    Ostfriesland: { slug: 'ostfriesland', demonym: 'ostfriesischer' },
    Friesland: { slug: 'friesland', demonym: 'friesischer' },
    'Oldenburger Land': { slug: 'oldenburger-land', demonym: 'Oldenburger', inPhrase: 'im Oldenburger Land', forPhrase: 'das Oldenburger Land' },
    'Oldenburger Münsterland': { slug: 'oldenburger-muensterland', demonym: 'Oldenburger Münsterland', inPhrase: 'im Oldenburger Münsterland', forPhrase: 'das Oldenburger Münsterland' },
    Emsland: { slug: 'emsland', demonym: 'Emsländer', inPhrase: 'im Emsland', forPhrase: 'das Emsland' },
    'Osnabrücker Land': { slug: 'osnabruecker-land', demonym: 'Osnabrücker', inPhrase: 'im Osnabrücker Land', forPhrase: 'das Osnabrücker Land' },
    Mittelweser: { slug: 'mittelweser', demonym: 'Mittelweser', inPhrase: 'an der Mittelweser', forPhrase: 'die Mittelweser' },
    'Elbe-Weser': { slug: 'elbe-weser', demonym: 'Elbe-Weser', inPhrase: 'im Elbe-Weser-Dreieck', forPhrase: 'das Elbe-Weser-Dreieck' },
    Heide: { slug: 'heide', demonym: 'Heide', inPhrase: 'in der Heide', forPhrase: 'die Heide' },
    Hannover: { slug: 'hannover', demonym: 'Hannoveraner' },
    'Hildesheimer Land': { slug: 'hildesheimer-land', demonym: 'Hildesheimer', inPhrase: 'im Hildesheimer Land', forPhrase: 'das Hildesheimer Land' },
    'Braunschweiger Land': { slug: 'braunschweiger-land', demonym: 'Braunschweiger', inPhrase: 'im Braunschweiger Land', forPhrase: 'das Braunschweiger Land' },
    Südniedersachsen: { slug: 'suedniedersachsen', demonym: 'südniedersächsischer' },
    Weserbergland: { slug: 'weserbergland', demonym: 'Weserbergland', inPhrase: 'im Weserbergland', forPhrase: 'das Weserbergland' },
    Niederrhein: { slug: 'niederrhein', demonym: 'niederrheinischer', inPhrase: 'am Niederrhein', forPhrase: 'den Niederrhein' },
    'Großraum Düsseldorf': { slug: 'grossraum-duesseldorf', demonym: 'Düsseldorfer', inPhrase: 'im Großraum Düsseldorf', forPhrase: 'den Großraum Düsseldorf' },
    Rheinland: { slug: 'rheinland', demonym: 'rheinischer', inPhrase: 'im Rheinland', forPhrase: 'das Rheinland' },
    'Aachener Land': { slug: 'aachener-land', demonym: 'Aachener', inPhrase: 'im Aachener Land', forPhrase: 'das Aachener Land' },
    'Bergisches Land': { slug: 'bergisches-land', demonym: 'bergischer', inPhrase: 'im Bergischen Land', forPhrase: 'das Bergische Land' },
    Ruhrgebiet: { slug: 'ruhrgebiet', demonym: 'Ruhrgebiet', inPhrase: 'im Ruhrgebiet', forPhrase: 'das Ruhrgebiet' },
    Hellweg: { slug: 'hellweg', demonym: 'Hellweg', inPhrase: 'am Hellweg', forPhrase: 'den Hellweg' },
    Sauerland: { slug: 'sauerland', demonym: 'Sauerländer', inPhrase: 'im Sauerland', forPhrase: 'das Sauerland' },
    'Siegerland-Wittgenstein': { slug: 'siegerland-wittgenstein', demonym: 'Siegerländer', inPhrase: 'im Siegerland-Wittgenstein', forPhrase: 'das Siegerland-Wittgenstein' },
    Münsterland: { slug: 'muensterland', demonym: 'Münsterländer', inPhrase: 'im Münsterland', forPhrase: 'das Münsterland' },
    Ostwestfalen: { slug: 'ostwestfalen', demonym: 'ostwestfälischer' },
    Lipperland: { slug: 'lipperland', demonym: 'lippischer', inPhrase: 'im Lipperland', forPhrase: 'das Lipperland' },
    Rheinhessen: { slug: 'rheinhessen', demonym: 'rheinhessischer' },
    Pfalz: { slug: 'pfalz', demonym: 'Pfälzer', inPhrase: 'in der Pfalz', forPhrase: 'die Pfalz' },
    Moselregion: { slug: 'moselregion', demonym: 'Mosel', inPhrase: 'in der Moselregion', forPhrase: 'die Moselregion' },
    Eifel: { slug: 'eifel', demonym: 'Eifeler', inPhrase: 'in der Eifel', forPhrase: 'die Eifel' },
    'Koblenzer Region': { slug: 'koblenzer-region', demonym: 'Koblenzer', inPhrase: 'in der Koblenzer Region', forPhrase: 'die Koblenzer Region' },
    Westerwald: { slug: 'westerwald', demonym: 'Westerwälder', inPhrase: 'im Westerwald', forPhrase: 'den Westerwald' },
    'Nahe-Hunsrück': { slug: 'nahe-hunsrueck', demonym: 'Nahe-Hunsrück', inPhrase: 'an der Nahe und im Hunsrück', forPhrase: 'Nahe und Hunsrück' },
    Saarland: { slug: 'saarland', demonym: 'saarländischer', inPhrase: 'im Saarland', forPhrase: 'das Saarland' },
    Erzgebirge: { slug: 'erzgebirge', demonym: 'erzgebirgischer', inPhrase: 'im Erzgebirge', forPhrase: 'das Erzgebirge' },
    Westsachsen: { slug: 'westsachsen', demonym: 'westsächsischer' },
    Vogtland: { slug: 'vogtland', demonym: 'vogtländischer', inPhrase: 'im Vogtland', forPhrase: 'das Vogtland' },
    'Region Leipzig': { slug: 'region-leipzig', demonym: 'Leipziger', inPhrase: 'in der Region Leipzig', forPhrase: 'die Region Leipzig' },
    'Dresden-Elbland': { slug: 'dresden-elbland', demonym: 'Dresdner', inPhrase: 'in Dresden und im Elbland', forPhrase: 'Dresden und das Elbland' },
    Oberlausitz: { slug: 'oberlausitz', demonym: 'Oberlausitzer', inPhrase: 'in der Oberlausitz', forPhrase: 'die Oberlausitz' },
    'Altmark und Jerichower Land': { slug: 'altmark-und-jerichower-land', demonym: 'Altmärker', inPhrase: 'in der Altmark und im Jerichower Land', forPhrase: 'die Altmark und das Jerichower Land' },
    'Magdeburger Börde': { slug: 'magdeburger-boerde', demonym: 'Magdeburger', inPhrase: 'in der Magdeburger Börde', forPhrase: 'die Magdeburger Börde' },
    Anhalt: { slug: 'anhalt', demonym: 'anhaltischer' },
    Harz: { slug: 'harz', demonym: 'Harzer', inPhrase: 'im Harz', forPhrase: 'den Harz' },
    'Saale-Unstrut': { slug: 'saale-unstrut', demonym: 'Saale-Unstrut', inPhrase: 'an Saale und Unstrut' },
    'Region Halle': { slug: 'region-halle', demonym: 'Hallenser', inPhrase: 'in der Region Halle', forPhrase: 'die Region Halle' },
    Mittelthüringen: { slug: 'mittelthueringen', demonym: 'Mittelthüringer' },
    Ostthüringen: { slug: 'ostthueringen', demonym: 'Ostthüringer' },
    Südwestthüringen: { slug: 'suedwestthueringen', demonym: 'Südwestthüringer' },
    Nordthüringen: { slug: 'nordthueringen', demonym: 'Nordthüringer' },
    Westküste: { slug: 'westkueste', demonym: 'Westküste', inPhrase: 'an der Westküste', forPhrase: 'die Westküste' },
    'Flensburger Förde': { slug: 'flensburger-foerde', demonym: 'Flensburger', inPhrase: 'an der Flensburger Förde', forPhrase: 'die Flensburger Förde' },
    'Kiel-Förde': { slug: 'kiel-foerde', demonym: 'Kieler', inPhrase: 'an der Kieler Förde', forPhrase: 'die Kieler Förde' },
    Unterelbe: { slug: 'unterelbe', demonym: 'Unterelbe', inPhrase: 'an der Unterelbe', forPhrase: 'die Unterelbe' },
    'Region Neumünster': { slug: 'region-neumuenster', demonym: 'Neumünsteraner', inPhrase: 'in der Region Neumünster', forPhrase: 'die Region Neumünster' },
    'Lübecker Bucht': { slug: 'luebecker-bucht', demonym: 'Lübecker', inPhrase: 'an der Lübecker Bucht', forPhrase: 'die Lübecker Bucht' },
    Lauenburg: { slug: 'lauenburg', demonym: 'Lauenburger', inPhrase: 'im Herzogtum Lauenburg', forPhrase: 'das Herzogtum Lauenburg' },
  },
  CH: {
    Aargau: { slug: 'aargau', demonym: 'Aargauer', inPhrase: 'im Aargau', forPhrase: 'den Aargau' },
    Appenzell: {
      slug: 'appenzell',
      demonym: 'Appenzeller',
      inPhrase: 'im Appenzellerland',
      forPhrase: 'das Appenzellerland',
    },
    Basel: { slug: 'basel', demonym: 'Basler' },
    Bern: { slug: 'bern', demonym: 'Berner' },
    Freiburg: { slug: 'freiburg', demonym: 'Freiburger' },
    Genf: { slug: 'genf', demonym: 'Genfer' },
    Glarus: { slug: 'glarus', demonym: 'Glarner' },
    Graubünden: { slug: 'graubuenden', demonym: 'Bündner' },
    Innerschweiz: {
      slug: 'innerschweiz',
      demonym: 'Innerschweizer',
      inPhrase: 'in der Innerschweiz',
      forPhrase: 'die Innerschweiz',
    },
    Jura: { slug: 'jura', demonym: 'Jurassischer', inPhrase: 'im Jura', forPhrase: 'den Jura' },
    Neuenburg: { slug: 'neuenburg', demonym: 'Neuenburger' },
    Schaffhausen: { slug: 'schaffhausen', demonym: 'Schaffhauser' },
    Solothurn: { slug: 'solothurn', demonym: 'Solothurner' },
    'St. Gallen': { slug: 'st-gallen', demonym: 'St. Galler' },
    Tessin: { slug: 'tessin', demonym: 'Tessiner', inPhrase: 'im Tessin', forPhrase: 'das Tessin' },
    Thurgau: {
      slug: 'thurgau',
      demonym: 'Thurgauer',
      inPhrase: 'im Thurgau',
      forPhrase: 'den Thurgau',
    },
    Waadt: {
      slug: 'waadt',
      demonym: 'Waadtländer',
      inPhrase: 'in der Waadt',
      forPhrase: 'die Waadt',
    },
    Wallis: { slug: 'wallis', demonym: 'Walliser', inPhrase: 'im Wallis', forPhrase: 'das Wallis' },
    Zürich: { slug: 'zuerich', demonym: 'Zürcher' },
  },
  LI: {
    Liechtenstein: { slug: 'liechtenstein', demonym: 'Liechtensteiner' },
  },
};

// Every region id the register ever had (51 Bundesländer / Kantone of AT/DE/CH, 60 cultural
// regions of Germany, the Allgäu pilot, the regions of deutschland.csv). Every current id must
// be listed here (the generator fails otherwise). Ids that are no longer in the CSVs become
// RETIRED_REGION_IDS: still reserved as usernames (nobody may claim an old region URL) and
// switched off by scripts/seed-regions.mjs / scripts/cleanup-region-docs.mjs.
// Only ever ADD to this list.
export const HISTORIC_REGION_IDS = Object.freeze([
  'allgaeu',
  'vorarlberg', 'tirol', 'salzburg', 'kaernten', 'steiermark', 'oberoesterreich',
  'niederoesterreich', 'wien', 'burgenland', 'baden-wuerttemberg', 'bayern', 'berlin',
  'brandenburg', 'bremen', 'hamburg', 'hessen', 'mecklenburg-vorpommern', 'niedersachsen',
  'nordrhein-westfalen', 'rheinland-pfalz', 'saarland', 'sachsen', 'sachsen-anhalt',
  'schleswig-holstein', 'thueringen', 'zuerich', 'bern', 'luzern', 'uri', 'schwyz', 'obwalden',
  'nidwalden', 'glarus', 'zug', 'freiburg', 'solothurn', 'basel-stadt', 'basel-landschaft',
  'schaffhausen', 'appenzell-ausserrhoden', 'appenzell-innerrhoden', 'st-gallen', 'graubuenden',
  'aargau', 'thurgau', 'tessin', 'waadt', 'wallis', 'neuenburg', 'genf', 'jura',
  'schwaben-wuerttemberg', 'kurpfalz', 'suedbaden-markgraeflerland', 'schwarzwald',
  'oberschwaben', 'tauberfranken', 'oberbayern', 'niederbayern', 'oberpfalz', 'franken',
  'bayerisch-schwaben-allgaeu', 'niederrhein', 'koeln-bonn-eifel', 'bergisches-land',
  'ruhrgebiet', 'muensterland', 'sauerland-siegerland', 'ostwestfalen-lippe', 'ostfriesland',
  'oldenburger-land-emsland', 'lueneburger-heide', 'weserbergland', 'region-hannover',
  'braunschweiger-land-harz', 'nordhessen', 'mittelhessen', 'odenwald-rhoen',
  'rhein-main-gebiet', 'rheingau', 'erzgebirge', 'vogtland', 'leipzig-region', 'dresden-elbland',
  'oberlausitz', 'pfalz', 'rheinhessen', 'mosel-saar-ruwer', 'eifel-westerwald', 'hunsrueck',
  'thueringer-wald-rennsteig', 'suedthueringen', 'klassikerregion', 'eichsfeld', 'nordfriesland',
  'dithmarschen', 'schleswig-angeln', 'holstein', 'prignitz-uckermark', 'havelland-potsdam',
  'spreewald', 'niederlausitz', 'mecklenburg', 'vorpommern', 'altmark', 'harz-harzvorland',
  'anhalt-dessau', 'saale-unstrut', 'saarlouis-umgebung', 'saarbruecken-warndt',
  'hochwald-bliesgau',
  // Regions of the first CSV register (Trello QG0GR5lv).
  'innerschweiz', 'basel', 'appenzell', 'liechtenstein',
  // Germany from deutschland.csv (Trello QG0GR5lv, 2026-10-30; ids above that came back are reused).
  'region-stuttgart', 'ostalb', 'schwaebische-alb', 'heilbronn-franken', 'mittelbaden',
  'ortenau', 'suedbaden', 'bodensee', 'region-ulm', 'muenchen', 'bayerisches-oberland',
  'chiemgau', 'donauraum', 'bayerischer-wald', 'nuernberg', 'westmittelfranken',
  'bamberger-land', 'fichtelgebirge', 'coburger-land', 'mainfranken', 'bayerischer-untermain',
  'region-augsburg', 'havelregion', 'flaeming', 'prignitz-oberhavel', 'uckermark', 'oderland',
  'lausitz', 'wetterau-kinzigtal', 'suedhessen', 'osthessen', 'westmecklenburg', 'rostock',
  'mecklenburgische-seenplatte', 'friesland', 'oldenburger-land', 'oldenburger-muensterland',
  'emsland', 'osnabruecker-land', 'mittelweser', 'elbe-weser', 'heide', 'hannover',
  'hildesheimer-land', 'braunschweiger-land', 'suedniedersachsen', 'grossraum-duesseldorf',
  'rheinland', 'aachener-land', 'hellweg', 'sauerland', 'siegerland-wittgenstein',
  'ostwestfalen', 'lipperland', 'moselregion', 'eifel', 'koblenzer-region', 'westerwald',
  'nahe-hunsrueck', 'westsachsen', 'region-leipzig', 'altmark-und-jerichower-land',
  'magdeburger-boerde', 'anhalt', 'harz', 'region-halle', 'mittelthueringen', 'ostthueringen',
  'suedwestthueringen', 'nordthueringen', 'westkueste', 'flensburger-foerde', 'kiel-foerde',
  'unterelbe', 'region-neumuenster', 'luebecker-bucht', 'lauenburg',
]);

// Legacy pseudo-Bezirke: no real district, never offered for new events, kept only so events
// stored with them stay readable and filterable (Vorarlberg's "Grenznahe", shown as "Umgebung",
// retired for new events by Trello dx8dCQJc). Appended to the region's list at runtime.
export const LEGACY_BEZIRKE = { vorarlberg: ['Grenznahe'] };

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "St. Gallen" -> "st-gallen", "Graubünden" -> "graubuenden" (the id rule of META). */
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[\s.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const cells = (line, sep) => line.split(sep).map((c) => c.trim());

/**
 * One CSV file -> [{ name, bezirke }] in file order, either layout (see the file header).
 * Throws on a malformed file: unknown header, wrong column count, empty region name, empty
 * district cell, a region without districts, a region listed twice.
 */
export function parseRegionCsv(text, label = 'csv') {
  const lines = String(text)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const [header, ...rows] = lines;
  const semicolon = header ? cells(header, ';').join(';') === 'Region;Bezirke' : false;
  const comma = header ? cells(header, ',').map((h) => h.toLowerCase()).join(',') === 'region,bezirk' : false;
  if (!semicolon && !comma) {
    throw new Error(`${label}: header must be "Region;Bezirke" or "region, bezirk"`);
  }
  const seen = new Set();
  return rows.map((line, i) => {
    const row = i + 2;
    let name;
    let bezirke;
    if (semicolon) {
      const parts = line.split(';');
      if (parts.length !== 2) throw new Error(`${label}: row ${row} needs exactly 2 columns`);
      name = parts[0].trim();
      bezirke = cells(parts[1], ',').filter(Boolean);
    } else {
      if (line.includes(';')) throw new Error(`${label}: row ${row} contains ";" (comma layout)`);
      [name, ...bezirke] = cells(line, ',');
      if (bezirke.some((b) => !b)) throw new Error(`${label}: row ${row} has an empty district`);
    }
    if (!name) throw new Error(`${label}: row ${row} has no region name`);
    if (bezirke.length === 0) throw new Error(`${label}: region "${name}" has no districts`);
    if (seen.has(name)) throw new Error(`${label}: region "${name}" listed twice`);
    seen.add(name);
    return { name, bezirke };
  });
}

/** Reads the CSVs of `root` (repo root, ending in "/") -> { country: rows }. */
export function readRegionCsvs(root) {
  const out = {};
  for (const [country, file] of COUNTRY_FILES) {
    const path = `${root}${REGION_CSV_DIR}/${file}`;
    if (!existsSync(path)) continue;
    out[country] = parseRegionCsv(readFileSync(path, 'utf8'), file);
  }
  return out;
}

/**
 * CSV rows per country -> register entries (order = COUNTRY_FILES, then row order).
 * Fails loudly on: a region without META, META without a CSV region, a duplicate or
 * malformed slug, a district listed twice within one country.
 */
export function buildRegister(csvByCountry) {
  const problems = [];
  const regions = [];
  for (const [country] of COUNTRY_FILES) {
    const rows = csvByCountry[country];
    const meta = META[country] ?? {};
    if (!rows) {
      if (Object.keys(meta).length) problems.push(`META ${country} has no CSV file`);
      continue;
    }
    const settings = COUNTRY_SETTINGS[country];
    if (!settings) problems.push(`no COUNTRY_SETTINGS for ${country}`);
    const names = new Set(rows.map((r) => r.name));
    for (const name of Object.keys(meta)) {
      if (!names.has(name)) problems.push(`META ${country}|${name} has no CSV region`);
    }
    const seenDistricts = new Map();
    for (const { name, bezirke } of rows) {
      const m = meta[name];
      if (!m) {
        problems.push(`CSV region ${country}|${name} has no META entry`);
        continue;
      }
      for (const b of bezirke) {
        if (seenDistricts.has(b)) {
          problems.push(`district "${b}" twice in ${country} (${seenDistricts.get(b)}, ${name})`);
        }
        seenDistricts.set(b, name);
      }
      regions.push({
        slug: m.slug,
        name,
        inPhrase: m.inPhrase ?? `in ${name}`,
        forPhrase: m.forPhrase ?? name,
        demonym: m.demonym,
        country,
        subdivisionLabel: settings?.subdivisionLabel ?? 'Bezirk',
        timezone: settings?.timezone ?? 'Europe/Vienna',
        bezirke: bezirke,
      });
    }
  }
  const slugs = regions.map((r) => r.slug);
  for (const s of slugs) {
    if (!SLUG_PATTERN.test(s)) problems.push(`slug "${s}" is not an ASCII slug`);
  }
  if (new Set(slugs).size !== slugs.length) problems.push('duplicate region slug');
  if (!slugs.includes('vorarlberg')) problems.push('vorarlberg must stay in the register');
  for (const s of slugs) {
    if (!HISTORIC_REGION_IDS.includes(s)) problems.push(`slug "${s}" missing in HISTORIC_REGION_IDS`);
  }
  if (problems.length) throw new Error(`Region register:\n  ${problems.join('\n  ')}`);
  return regions;
}

/** Old ids that are no longer regions (reserved, switched off). */
export function retiredRegionIds(regions) {
  const live = new Set(regions.map((r) => r.slug));
  return HISTORIC_REGION_IDS.filter((id) => !live.has(id));
}

const HEADER = `// GENERATED by scripts/build-region-data.mjs from scripts/data/regions/*.csv. Do not edit by hand.\n`;
const LEGACY_DOC = `// Legacy pseudo-Bezirke per region (stored on old events only, never offered for new ones).\n`;
const RETIRED_DOC = `// Ids of former regions: no longer regions, but still reserved (usernames) and switched off.\n`;

/** File contents of src/data/regionData.js and functions/src/regionData.ts. */
export function renderRegisterFiles(regions) {
  const json = JSON.stringify(regions, null, 2);
  const legacyJson = JSON.stringify(LEGACY_BEZIRKE, null, 2);
  const retiredJson = JSON.stringify(retiredRegionIds(regions));
  const countries = [...new Set(regions.map((r) => r.country))];
  const client =
    `${HEADER}// Static register entries (see src/utils/regions.js). Countries: ${countries.join(', ')}.\n` +
    `export const REGION_DATA = ${json};\n\n` +
    `${LEGACY_DOC}export const LEGACY_BEZIRKE = ${legacyJson};\n\n` +
    `${RETIRED_DOC}export const RETIRED_REGION_IDS = ${retiredJson};\n`;
  const functions =
    `${HEADER}export interface RegionDatum {\n  slug: string;\n  name: string;\n  inPhrase: string;\n` +
    `  forPhrase: string;\n  demonym: string;\n  country: string;\n  subdivisionLabel: string;\n` +
    `  timezone: string;\n  bezirke: string[];\n}\n\n` +
    `export const REGION_DATA: readonly RegionDatum[] = ${json};\n\n` +
    `${LEGACY_DOC}export const LEGACY_BEZIRKE: Readonly<Record<string, readonly string[]>> = ${legacyJson};\n\n` +
    `${RETIRED_DOC}export const RETIRED_REGION_IDS: readonly string[] = ${retiredJson};\n`;
  return { 'src/data/regionData.js': client, 'functions/src/regionData.ts': functions };
}
