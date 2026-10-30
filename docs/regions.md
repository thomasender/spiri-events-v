# Regions (multi-region epic)

**Read this when** you touch regions, region texts/routing, roles for regions,
region activation, region emails, SEO/ICS/analytics per region, or add a region.
Linked from `AGENTS.md`. Production migration and staging: [staging-migration.md](./staging-migration.md).

The platform started as "tribe Vorarlberg"; the regions epic prepares 133 regions of
Austria (9 Bundesländer), Germany (104 regions over the 400 Landkreise and kreisfreie
Städte), Switzerland (19 regions, some cantons grouped: Innerschweiz, Basel, Appenzell) and
Liechtenstein (1 region) without changing what visitors see until a second region is switched
on. Structure everywhere: country -> region -> district (Bezirk in Austria and Switzerland,
Wien: its 23 Gemeindebezirke; Landkreis in Germany, kreisfreie Städte included; Landesteil
in Liechtenstein). Regions and districts are defined ONLY by the four CSVs in
`scripts/data/regions/` (Trello QG0GR5lv).

Contents: 1 Concept · 2 Data model · 3 Roles · 4 Activation · 5 Queries and the
migration marker · 6 (moved) · 7 Emails · 8 SEO and prerender · 9 ICS feed ·
10 Analytics per region · 11 Tests · 12 Known limitations · 13 How to add a region

## 1. Concept

- **Static register + `regions/{id}` docs.** `STATIC_REGIONS` in
  `src/utils/regions.js` is the register; `regions/{id}` docs (id == slug) carry only the
  switches (`active`, `contactEmail`, `seo`, `timezone`, texts, "Über uns", Instagram name).
  Names, order and districts are never read from a doc. Only Vorarlberg is active in the
  register. `functions/src/regions.ts` uses the same generated data
  (`functions/src/regionData.ts`), guarded by `tests/lib/functionsRegions.spec.ts`.
- **Register data is generated from four CSVs.** `scripts/data/regions/oesterreich.csv`,
  `deutschland.csv`, `schweiz.csv`, `liechtenstein.csv` (UTF-8, BOM allowed, LF or CRLF, one
  row per region, the country comes from the file name) are the single truth. Two layouts,
  detected by the header:
  - `Region;Bezirke`: `;`-separated, the districts comma-separated in the second column
    (Austria, Switzerland, Liechtenstein);
  - `region, bezirk`: comma-separated, the region name followed by all its districts, one per
    column (`deutschland.csv`, as delivered by the product owner).
    A malformed row (wrong column count, empty region name or district cell, a region listed
    twice, `;` in the comma layout, unknown header) fails the build.
    `scripts/build-region-data.mjs` (pure part `scripts/lib/regionRegister.mjs`)
    writes `src/data/regionData.js` and `functions/src/regionData.ts` (prettier-formatted).
    Wording and id per region (`slug`, `inPhrase`, `forPhrase`, `demonym`) live in the `META`
    table; country settings (`subdivisionLabel` Bezirk / Landkreis / Landesteil, `timezone`) in
    `COUNTRY_SETTINGS`. The generator fails on a CSV region without META, META without CSV
    region, a duplicate / non-ASCII id, an id missing in `HISTORIC_REGION_IDS` or a district
    listed twice within one country. District names are taken 1:1 (e.g. "Eisenstadt (Stadt)",
    "1. Innere Stadt", "Stadt München", "Landkreis München", "Landkreis Lindau (Bodensee)",
    "Region Hannover", "Friesland", "Berchtesgadener Land", "Stadt Berlin"). Region order =
    `COUNTRY_FILES` order (Austria, Germany, Switzerland, Liechtenstein), then CSV row order.
    `tests/lib/regionRegisterCsv.spec.ts` re-parses the CSVs and compares them with both
    generated files, the rules list and the functions list. Re-run the generator after any CSV
    or META change; never edit the generated files.
    `HISTORIC_REGION_IDS` lists every id the register ever had (only ever add); every current
    id must be in it. Those no longer in the CSVs are generated as `RETIRED_REGION_IDS`
    (= ever existed minus current: reserved usernames, switched off by the seed / cleanup
    scripts). An old id that is a region again is therefore automatically no longer retired:
    27 ids of the former German Bundesländer / cultural regions are regions of
    `deutschland.csv` again (`allgaeu`, `kurpfalz`, `schwarzwald`, `oberschwaben`,
    `niederbayern`, `oberpfalz`, `berlin`, `bremen`, `hamburg`, `rhein-main-gebiet`,
    `mittelhessen`, `nordhessen`, `vorpommern`, `ostfriesland`, `weserbergland`, `niederrhein`,
    `bergisches-land`, `ruhrgebiet`, `muensterland`, `rheinhessen`, `pfalz`, `saarland`,
    `erzgebirge`, `vogtland`, `dresden-elbland`, `oberlausitz`, `saale-unstrut`); the other 60
    (`bayern`, `region-hannover`, `luzern`, ...) stay retired.
    Vorarlberg's old pseudo-Bezirk "Grenznahe"
    ("Umgebung") is no longer in the register: since Trello dx8dCQJc it is a read-only legacy
    entry (`LEGACY_BEZIRKE`, generated next to `REGION_DATA`), appended to Vorarlberg's list at
    runtime (`STATIC_REGIONS`, `functions/src/regions.ts`) so old events stay
    labelled, filterable (chip, ICS `bezirk=`, directory) and Instagram-grouped; the event forms
    never offer it (`selectableBezirke`, `subdivisionFor`). No migration: old events keep it until
    their Ort is changed. Vorarlberg's id, Bezirke and fallbacks are pinned by
    `tests/components/vorarlbergRegister.spec.ts`.
    District names are one namespace for the directory (`directoryRegions`, Vorarlberg's
    first): two regions with a district of the same name (e.g. "Baden" in Niederösterreich and
    Aargau) share one filter chip.
- **Region ids.** The id is the ASCII slug (lowercase, umlauts transliterated, ß -> ss, spaces
  / dots -> `-`): `vorarlberg`, `tirol`, `zuerich`, `graubuenden`, `st-gallen`,
  `innerschweiz`, `liechtenstein`, `freiburg` for the Swiss region, `region-stuttgart`,
  `schwaebische-alb`, `muenchen`, `bayerisches-oberland`, `allgaeu`, `rhein-main-gebiet`,
  `grossraum-duesseldorf`, ... (the test pins `slug === slugify(name)`; no German id collides
  with another region, a combined view or a reserved route, so no alternative was needed).
  The 104 German ids, in CSV order: `region-stuttgart`, `ostalb`, `schwaebische-alb`,
  `heilbronn-franken`, `kurpfalz`, `mittelbaden`, `ortenau`, `suedbaden`, `schwarzwald`,
  `bodensee`, `oberschwaben`, `region-ulm`, `muenchen`, `bayerisches-oberland`, `chiemgau`,
  `donauraum`, `niederbayern`, `bayerischer-wald`, `oberpfalz`, `nuernberg`,
  `westmittelfranken`, `bamberger-land`, `fichtelgebirge`, `coburger-land`, `mainfranken`,
  `bayerischer-untermain`, `region-augsburg`, `allgaeu`, `berlin`, `havelregion`, `flaeming`,
  `prignitz-oberhavel`, `uckermark`, `oderland`, `lausitz`, `bremen`, `hamburg`,
  `rhein-main-gebiet`, `wetterau-kinzigtal`, `suedhessen`, `mittelhessen`, `osthessen`,
  `nordhessen`, `westmecklenburg`, `rostock`, `mecklenburgische-seenplatte`, `vorpommern`,
  `ostfriesland`, `friesland`, `oldenburger-land`, `oldenburger-muensterland`, `emsland`,
  `osnabruecker-land`, `mittelweser`, `elbe-weser`, `heide`, `hannover`, `hildesheimer-land`,
  `braunschweiger-land`, `suedniedersachsen`, `weserbergland`, `niederrhein`,
  `grossraum-duesseldorf`, `rheinland`, `aachener-land`, `bergisches-land`, `ruhrgebiet`,
  `hellweg`, `sauerland`, `siegerland-wittgenstein`, `muensterland`, `ostwestfalen`,
  `lipperland`, `rheinhessen`, `pfalz`, `moselregion`, `eifel`, `koblenzer-region`,
  `westerwald`, `nahe-hunsrueck`, `saarland`, `erzgebirge`, `westsachsen`, `vogtland`,
  `region-leipzig`, `dresden-elbland`, `oberlausitz`, `altmark-und-jerichower-land`,
  `magdeburger-boerde`, `anhalt`, `harz`, `saale-unstrut`, `region-halle`, `mittelthueringen`,
  `ostthueringen`, `suedwestthueringen`, `nordthueringen`, `westkueste`, `flensburger-foerde`,
  `kiel-foerde`, `unterelbe`, `region-neumuenster`, `luebecker-bucht`, `lauenburg`.
  Never change an existing id. Order = switcher order: Austria, Germany, Switzerland,
  Liechtenstein (CSV order inside a country, so Burgenland comes first; places where
  Vorarlberg must lead, like the directory district list or a form's default region, put it
  first explicitly). Each region has a static `country` (`AT` / `DE` / `CH` / `LI`, not in
  `regions/{id}` docs), `name`, `inPhrase`, `forPhrase`, `demonym`, `order`, `bezirke`,
  `subdivisionLabel` ("Bezirk"; "Landkreis" in Germany; "Landesteil" in Liechtenstein) and
  `timezone` (`Europe/Vienna`, `Europe/Berlin`, `Europe/Zurich`, `Europe/Vaduz`;
  informational, all date maths uses Europe/Vienna). Former ids (the old German Bundesländer
  and cultural regions that are not in `deutschland.csv`, the cantons now grouped: `luzern`,
  `uri`, `schwyz`, `obwalden`, `nidwalden`, `zug`, `basel-stadt`, `basel-landschaft`,
  `appenzell-ausserrhoden`, `appenzell-innerrhoden`) are no longer valid region ids, have no
  alias (`LEGACY_REGION_ALIASES` is empty) and stay reserved.
- **German district names carry their kind** ("Stadt München", "Landkreis München",
  "Rems-Murr-Kreis", "Region Hannover"; a few are bare: "Friesland", "Emsland",
  "Berchtesgadener Land"). `districtNameHasKind` (`regions.js`) drives the wording:
  `formatCityWithBezirk` shows "Garching (Lkr. München)", "Waiblingen (Rems-Murr-Kreis)",
  "Jever (Lkr. Friesland)" and does not repeat a kreisfreie Stadt ("München", "Kempten"); the
  district badge drops its "Landkreis:" prefix when the name already says it; the form example
  "z.B. <Ort>" strips "Stadt " / "Landkreis " ("z.B. Stuttgart").
- **Dark launch rule.** With only Vorarlberg active nothing visible changes:
  no chooser, no switcher, no region name in mails, no GA `region` parameter, no
  region pages in the prerender, byte-identical Vorarlberg ICS feed. Every new
  region-aware feature must keep that property (golden/byte-identical tests exist
  for prerender, mails and ICS).
- **"Wo bist du?" (place + radius, replaces the region map).** Visitors never see a map
  or a list of regions. They give a place (a city, village or region, typed with
  suggestions, or "Meinen Standort verwenden") and a radius (5 / 10 / 15 / 20 / 25 / 50 km, default
  25; a stored value that is not a step, e.g. an old 100, snaps to the nearest step, here 50), then press "Übernehmen". Components: `PlacePicker.jsx` (the two steps), `PlaceSearch.jsx`
  (WAI-ARIA combobox, search as you type), `LocateRegionButton.jsx` (opt-in location, callback
  `onLocate`), shown by `RegionChooser.jsx` (required full page "Wo suchst du?" on `/` and
  `/verzeichnis` when nothing is remembered, and `/regionen` opened on purpose with a
  "Schließen" button) and `RegionPickerModal.jsx` (pop-up behind the header button, the burger
  menu, the profile card "Ort und Umkreis" and the footer). The "Wo suchst du?" page has no
  combined-view buttons (for now; the views stay reachable by their address). The decision is
  `shouldOpenRegionChooser` in `regionRouting.js`; while the `regions` collection is still loading
  it relies on `<meta name="tribe-region-mode" content="multi">`, which the prerendered `/` carries
  only with two or more active regions, so a first-time visitor never sees the Vorarlberg calendar
  flash first (Trello eFPKzCr7). Switching a region on or off therefore rebuilds Hosting at once
  (`onRegionWriteTriggerBuild`, no debounce); until that deploy is live (about 3 to 5 minutes) the
  old `/` still carries the old hint and a first-time visitor can see the flash.
  Builds without the prerender (staging, dev) ship the plain `index.html` with `content="unknown"`:
  there a first-time visitor on `/` or `/verzeichnis` gets an empty cover (`regionChooserPending`)
  until the config has loaded, then the chooser or, with one active region, the calendar;
  the site header stays visible above it with the neutral title "Dein Kalender" and without
  the region switcher (`regionChooserOpen` in the region context). Invisible with fewer than
  two active regions.
  - **Place list, no third party.** `src/data/placeIndex.json` (33,376 places of AT / DE / CH /
    LI, 1,214 kB raw, 384 kB gzipped, loaded lazily by `src/lib/placeData.js` only when the
    picker opens or an event is saved) is generated by `scripts/build-place-index.mjs` from the
    GeoNames postal code files (CC BY 4.0, credit in Datenschutz section 17 and Impressum
    "Kartendaten / Quellen"; download commands in the script header, raw files are not
    committed). Each place has name, lat / lon, its region and, for 99.8 %, the register
    district (`DISTRICT_CATALOG` key) it lies in; districts and regions carry a centroid (mean
    of their places). Every one of the 658 districts (400 German) has places. Company
    postcodes are dropped. AT / CH / LI: the region from the GeoNames admin code via
    `ADMIN_SHAPE_REGIONS`. Germany: every GeoNames row carries the Kreis as admin3 name and
    official Kreisschlüssel; each of the 400 Kreisschlüssel is matched once to the CSV district
    by its GeoNames name(s) ("Kreisfreie Stadt Kempten" -> "Stadt Kempten (Allgäu)",
    "Landkreis Lindau" -> "Landkreis Lindau (Bodensee)", "Kreis Kleve" -> "Landkreis Kleve");
    `DE_CODES` fixes the few that differ or are ambiguous (a bare "Bamberg" is the Landkreis,
    "Landkreis Sächsische Schweiz", "Nienburg/Weser", ...), and the region is the one whose CSV
    row lists the district. Special cases in AT / CH: Wien by Gemeindebezirk (the bare name
    "Wien" is the whole city, no district), Appenzell Innerrhoden and Liechtenstein by
    Gemeinde, Appenzell Ausserrhoden as the single district "Ausserrhoden", Raron split into
    Östlich / Westlich Raron, regions with one district (Genf, Glarus, Neuenburg,
    Schaffhausen) take all their places. Without district (region only): Entlebuch (not in the
    Innerschweiz list) and the bare "Wien". The script prints districts without places,
    unmatched German Kreise and unmatched names (all 0 at the last build); extend `ALIASES` /
    `DE_CODES` there. Search, distance and radius logic
    is `src/utils/placeSearch.js` (pure; `searchPlaces`, `nearestPlace`, `eventPosition`,
    `filterEventsByRadius`); it also finds regions by name ("Innerschweiz"; centre = mean of
    its districts).
  - **Selection.** `{ label, lat, lon, radiusKm, regionId, source, updatedAt }` (pure helpers in
    `src/utils/placeSelection.js`) lives in `RegionProvider` (`placeSelection`,
    `setPlaceSelection`, `radiusFilter`), is remembered in localStorage (`tribe:placeSelection`)
    and mirrored to `users/{uid}.placeSelection` by `PlaceSelectionSync.jsx` (the newer of
    browser and profile wins on sign-in; no `users/{uid}` doc yet = browser only; rules:
    `isValidPlaceSelection`). Coordinates are those of the PLACE, rounded to 3 decimals, never
    the exact device position: a shared position is snapped to the nearest place of the list
    (within 30 km) in the browser, nothing is sent anywhere. `regionId` is worked out when the
    place is chosen: the region that holds the place's district under the current assignment
    (`regionIdForEntry`), else its Bundesland / Kanton; for a shared position `geoRegion.js`
    (outlines, see below) may override it near a border.
  - **Region and title follow the place.** `regionId` of the selection is the current region
    on `/` (it replaces `tribe:lastRegion` as the stored slug), so titles, "Über uns", mail
    wording and analytics keep following the region; choosing a place navigates to that region's
    page (a region that is not open yet leads to its coming-soon page). A region address typed
    by hand wins over the selection.
  - **Neutral pages** (`NEUTRAL_PAGE_PATHS` in `regionRouting.js`: Impressum, Datenschutz) are the
    same for every region and name none in their address. They keep the region or combined view of
    the last page that named one in this tab (`pageSlug` in the region context, sessionStorage
    `tribe:lastPageSlug`, also a not-yet-open region), so the footer's "Über uns"
    (`aboutPathFor`) leads back to that region. Only with two or more active regions. Add further
    region-independent pages to that list.
  - **Header "Kalender" / "Verzeichnis"** (`regionNavPath`, Trello gflD7CXa) keep the visitor's
    region on every page (event form, login, profile): the page's region / view, else the chosen
    place's region, else `tribe:lastRegion`. A region that is not open yet leads to its
    coming-soon page (plain `/` would show Vorarlberg). Only with two or more active regions.
  - **Events within the radius.** `radiusFilter` in the region context is non-null only with a
    selection, at least two active regions, no combined view and while the current region is the
    selection's region. Then the calendar loads the events of ALL active regions (query plan
    mode `national`) and `useRegionEvents` keeps those within the radius via
    `filterEventsByRadius`: online events always (subject to section 2b); events with a stored position by distance;
    events without a position only if they belong to the current region (so an unmigrated
    event behaves like before). Favourites ignore the radius. The directory is still filtered
    by region (profiles have no position).
  - **Bezirk / Landkreis filter vs. radius (Trello RAjDENly).** While the radius decides the
    list, the event count shows "(Ort + 25 km)" (`placeHint`, with "n Filter gesetzt" after a
    comma); a click opens "Mehr Filter" at the Bezirk / Landkreis filter. Picking a district
    (anything but "Online", `hasDistrictFilter`) lifts the radius: the calendar shows every event
    of the current region in the picked districts (`useRegionEvents(..., { ignoreRadius: true })`),
    and the district chips always count the whole region. The quick action "Alle" carries the
    region's name ("Tirol") and selects all districts; "Keine" returns to place + radius. The
    filter heading is the region's `subdivisionLabel` ("Landesteil" in Liechtenstein). One active region
    or a combined view: "Alle" and no place hint as before.
  - **The Ort decides Bezirk / Landkreis AND region (Trello dx8dCQJc).** Whatever region the
    person is in, the place of an event gives its district and the region holding it (current
    assignment): pure helpers in `src/utils/placeDistrict.js` (`assignmentForEntry` for a picked
    suggestion, `placeAssignment` for a typed name: Vorarlberg Gemeinde first, else the places of
    that name when they lie in ONE district, null when unknown / ambiguous). The forms keep it as
    `placeRegionId`, which wins over the current region when saving (a place in Liechtenstein
    now belongs to the region `liechtenstein`; while that is inactive such an event is not
    findable, like any place of an inactive region; the same now holds for German places again:
    "Lindau (Bodensee)" or "Konstanz" picked on the Vorarlberg page puts the event into the
    inactive region `bodensee`; an ambiguous name such as "Lindau" is told apart by the suggestion
    the person picks, with district / region in brackets).
  - **The Ort must be PICKED (Trello QG0GR5lv).** Free text is no longer valid: typing only
    filters the suggestions; leaving the field / Enter with typed text takes the TOP suggestion,
    and without any match the form shows "Bitte wähle einen Ort aus der Liste." and does not
    save (pure `validatePlaceChoice`, `topPlaceChoice` in `placeDistrict.js`; `CityField`
    reports `picked` and the forms keep `cityPicked`). Places outside the list (outside DACH,
    unknown villages) can therefore not be entered any more. `placeAssignment` stays for READING
    old data. **Legacy edit rule:** an event being edited whose stored Ort is in no list (old
    free text, e.g. "Ruggell", legacy "Grenznahe") opens with that Ort shown and saves
    unchanged; the rule applies only once the Ort field is changed (`original` of
    `validatePlaceChoice`). Old wizard drafts with a Gemeinde or a picked place still pass. The
    one-off staging tool `scripts/realign-event-regions.mjs` (dry run by default, `--apply`,
    `--project tribe-vbg-staging` only) re-places events by their Ort or deletes unresolvable
    ones and cleans `directoryRegionIds` / `directoryRegions` / `admin_users.regionIds`
    (planning in `src/utils/eventRealign.js`). The Ort field (`CityField`): Vorarlberg, and every
    event while only one region is active, uses the Gemeinde picker, which also suggests places
    of all regions from `placeIndex.json` (lazy `loadPlaceIndex` after two letters); in other
    regions (two or more active) it is a combobox suggesting places of all regions, the
    form's region first, next to a Bezirk / Landkreis select (not required; an offered region
    follows the picked place, the select stays editable). When the place belongs to another region
    a hint shows under the Ort: inactive -> "Dieser Ort gehört zur Region X, die noch nicht
    freigeschaltet ist. Dein Event erscheint dort ab der Freischaltung." (the event is saved there
    and is intentionally not findable until then), active -> "Dieses Event erscheint in der Region
    X." This is the one deliberate visible change of the dark launch.
  - **Event positions.** `events/{id}.lat` / `.lng` (null = unknown / online; rules
    `isValidEventPosition`). `useEvents` `addEvent` / `updateEvent` set them from `city` +
    `bezirk` (+ region) via `src/lib/eventPosition.js` (Gemeinde accuracy, never a street):
    place of that name in the event's Bezirk, else in its Bundesland, else the Bezirk centroid,
    else the Bundesland centroid; a place outside the region (old "Grenznahe" events, or no
    Bezirk at all) is found by name, the namesake nearest to the region (for "Grenznahe" only
    within 40 km of the region centre, `LEGACY_NAMESAKE_KM`: an old "Lindau" event must not
    land in Lindau ZH; it finds Lindau (Bodensee) again now that German places are back). A failed list load never blocks saving. Events written before
    need `node scripts/backfill-event-positions.mjs` (dry run, `--write`, `--all`;
    `PROJECT_ID=tribe-vbg-staging` for staging) once per project.
  - **"Meinen Standort verwenden" (ticket 567, reworked):** opt-in only: one click shows a short
    explanation, only "Standort abfragen" calls `navigator.geolocation` (never on page load, no
    retry). The position goes to `PlacePicker.onLocate` -> `locatePosition`
    (`src/utils/geoRegion.js`): an exact (or 0.2 km) hit of an AT / CH / LI outline decides the
    region and the place is the nearest one of that country; outside all outlines the nearest
    German place of the list (30 km cap) decides: its Landkreis -> region; otherwise (Italy,
    France far from Germany, outlines failed to load) the nearest place of any country and its
    region. The outlines come from a bundled file that is dynamically imported (`loadGeoShapes`):
    - **Austria / Switzerland / Liechtenstein:** `src/data/adminAtChMap.json` (about 100 kB,
      31 kB gzipped), the 9 Bundesländer, the 26 Kantone and Liechtenstein in plain lon/lat,
      keyed by ISO 3166-2 code (`AT-8`, `CH-LU`, `LI`). `ADMIN_SHAPE_REGIONS` in
      `src/utils/geoRegion.js` maps each outline onto its region (LU / SZ / OW / NW / UR / ZG ->
      `innerschweiz`, AR / AI -> `appenzell`, BS / BL -> `basel`, LI -> `liechtenstein`); the
      polygons are not merged. Generated by `scripts/build-admin-at-ch-map.mjs` (download
      commands and checksums in its header; raw downloads are not committed), which matches by
      ISO code and an explicit name list and fails if a register region has no outline or an
      outline no register region (also guarded in `tests/components/geoRegion.spec.ts`). A
      change of the register usually only needs the table, not a new download.
    - **Germany:** no outlines (the old Landkreis projection `landkreisMap.json` stays removed).
      The nearest German place gives the Landkreis and so the region. **Accuracy limit:** a
      position is put into the Landkreis of the nearest Ort (postcode centroid), so within
      roughly 1-3 km of a Landkreis border the neighbour Landkreis (and, where the border is a
      region border, the neighbour region) can come out; between two Orte the bigger one within
      4 km wins (`nearestPlace`). A position in France / Czechia / the Netherlands close to
      Germany ends up in the nearest German region (no outline says otherwise).
    - **Order:** an exact outline hit first, then the nearest outline within 0.2 km, then the
      nearest German place, then the nearest place of any country.
    - Denial, timeout, no API or no place within 30 km (Madrid): a German hint, the picker stays
      usable. Needs `geolocation=(self)` in the `Permissions-Policy` of `firebase.json` (guarded
      by `tests/lib/hostingCsp.spec.ts`).
    - **Data sources and licences:** Austria: geoBoundaries gbOpen AUT ADM1
      (AUT-ADM1-97560089, from BEV, Bundesamt für Eich- und Vermessungswesen), licence
      CC BY-SA 2.0 as stated by geoBoundaries: attribution required and
      `adminAtChMap.json` is shared under the same licence. Switzerland: geoBoundaries
      gbOpen CHE ADM1 (CHE-ADM1-70761945, from swisstopo swissBOUNDARIES3D), swisstopo OGD
      terms: free use, source "© swisstopo" must be named. Liechtenstein: Natural Earth
      1:10m (public domain; coarser than the AT/CH outlines). Attribution: `source` field of the JSON, the generator header,
      this section and Datenschutz section 17. Natural Earth admin-1 alone (public domain)
      was evaluated first and rejected: about 0.4 km median / 1.5 km p95, up to 3-5 km off
      the official borders, which put Konstanz into Thurgau and Passau into Oberösterreich.
      **Licence status: NOT independently verified.** The geoBoundaries metadata files
      (`boundaryLicense`, `licenseSource`) and the original publishers' pages (BEV, swisstopo)
      were unreachable when this was checked, so CC BY-SA 2.0 is "as stated by
      geoBoundaries" only; the original BEV licence may be CC BY 4.0 instead. The legal check
      is tracked on Trello card 581 (Abklärungen, "Rechtlich klären: Standortbestimmung und
      Kartendaten"). Until then the stricter one (BY-SA 2.0, share-alike) is applied. Notice
      file next to the data: `src/data/adminAtChMap.LICENSE.md`; public texts: Datenschutz
      section 17 and Impressum "Kartendaten / Quellen".
    - **Accuracy:** AT/CH outlines are simplified with Douglas-Peucker at 0.1 km and rounded
      to 1/1000 degree, so about 0.1-0.15 km off the official border. Checked border pairs
      (tests, `tests/components/geoRegion.spec.ts`): Kreuzlingen, Hörbranz, Lochau, Freinberg,
      Schärding, Basel, Riehen, Salzburg, Kufstein, Braunau, Rheinfelden CH, Koblenz AG,
      Feldkirch-Tisis, Buchs SG, Lustenau, St. Margrethen resolve to their region by the
      outline; the German side by the nearest German place: Konstanz and Lindau -> `bodensee`,
      Oberstaufen -> `allgaeu`, Passau -> `bayerischer-wald`, Freilassing and Kiefersfelden ->
      `chiemgau`, Simbach am Inn -> `niederbayern`, Weil am Rhein -> `suedbaden`; inland:
      München, Stuttgart, Berlin, Hamburg, Essen. Known residuals: within about 200 m of an
      AT / CH / LI border either side can come out; the Liechtenstein outline (Natural Earth) is
      coarser; inside Germany the Landkreis-border limit above.
- **Combined views** "Ganz Österreich" `/oesterreich`, "Ganz Deutschland" `/deutschland`,
  "Ganz Schweiz" `/schweiz` and the global "Alle Tribes" `/alle-tribes` (all countries incl.
  Liechtenstein) are NOT regions, only views (never stored on events/profiles). Liechtenstein
  has no view of its own (one region). `/deutschland` is a view again since `deutschland.csv`
  (it was removed while Germany had no regions). Definitions: `COMBINED_VIEWS` in
  `src/utils/regions.js` (and its copy in `functions/src/regions.ts`); logic in
  `regionRouting.js` (`isCombinedViewAvailable`, `combinedViewRegions`,
  `availableCombinedViews`, `resolveTopLevelSlug`).
  - **Availability:** a view is available with at least 2 ACTIVE regions in its scope: a
    country view those of that country, "Alle Tribes" all active regions in total (also when
    they all lie in one country). The views are reached by their address; the chooser
    page lists none (for now).
  - **Unavailable view at its URL:** exactly one active region in scope -> `replace`
    redirect to that region's page (`/` while it is Vorarlberg; `/verzeichnis` is kept);
    none -> coming-soon page ("Der Tribe Schweiz kommt bald", `noindex`). The
    coming-soon pages of Deutschland and Schweiz add a hint what is needed to go live ("Wir
    suchen gerade Events für die Landkreise in Deutschland / die Bezirke in der Schweiz ...
    sobald mindestens ein Landkreis / Bezirk genügend Events hat", `liveHint` in
    `regionTexts.js`); Österreich has none. Routes wait for the region config (`loading`) before they redirect.
  - **Data:** `RegionProvider` exposes `combinedView`, `combinedRegions` (active
    regions in scope) and `combinedViews` (available ones). Calendar, directory
    and query plans use `isNational` mode with `combinedRegions` as id list
    (`regionId in [...]`, `array-contains-any`, limit 30: with more than 30 active regions in
    scope the plan falls back to the full query and the client filter); Bezirke/Orte chips are
    the union of those regions. Favourites (`allActive`) use every active region.
  - **Texts:** `COMBINED_VIEW_TEXTS` in `regionTexts.js`: "Dein österreichischer / deutscher /
    Schweizer Kalender", "Für Österreich / Deutschland / die Schweiz und Umkreis", title
    "Kalender | The Tribe <Land>"; "Alle Tribes": "Dein
    Kalender für bewusste Events", "in allen Regionen", "Für alle Regionen", title
    "Kalender | The Tribe". The footer reads "© 2026 Alle Rechte vorbehalten" everywhere. Per-region texts
    come from `regionTexts()`; the Vorarlberg header is "Dein Vorarlberger Kalender".
  - **Create-event / profile forms** offer only concrete regions. The event forms show no
    Region field: the region is the current one, and the extra Bezirk option "Finde meinen
    Bezirk nicht" opens `EventRegionDialog` to change it.
  - **Phone:** the header dropdown is hidden below 800px; the region list sits in the burger
    menu (`RegionMenuList`). A not-yet-open region/view shows the neutral header "Dein
    Kalender für bewusste Veranstaltungen" (`comingSoon` in the region context).
- **Reserved names.** The region slugs and the combined-view slugs share the
  top-level URL space with profiles, so `username.js` reserves them, plus the ids of former
  regions (`RETIRED_REGION_IDS`: the old German Bundesländer and cultural regions not in
  `deutschland.csv`, the grouped cantons) and former views (`RETIRED_VIEW_SLUGS`, empty since
  `/deutschland` is a view again), so nobody can claim an old region address. All 133 region
  ids fit the 30-character username limit (longest: `altmark-und-jerichower-land`). The 77
  new German ids were never reserved before: an existing username equal to one of them (e.g.
  `heide`, `harz`, `anhalt`, `eifel`) keeps working for its owner (`validateUsername` with
  `currentUsername`), but the region address then shadows the profile, so run the check below
  before the merge to production.
  `scripts/check-reserved-usernames.mjs` prints and checks them (run it READ-ONLY
  against production before a merge that adds names).

## 2. Data model

- `events/{id}.regionId` and `users/{uid}/publicProfile/data.directoryRegionIds`
  (array; `users/{uid}.directoryRegionIds` mirrors it for the migration). A
  **missing** field means `vorarlberg` everywhere (`resolveRegionId`), so
  pre-migration docs keep working. The server-side queries (section 5) need the
  fields to exist, hence the migration.
- `regions/{id}`: `order`, `active`, `contactEmail`, `seo: { title, description }`,
  `timezone`, the "Über uns" fields, `instagramHandle`, `texts`, `createdAt`, `updatedAt`
  (rules whitelist). **Names, slugs, order and districts (`bezirke`) are defined only in
  code** (the generated register, section 2a); old docs may still carry `name`, `slug`,
  `bezirke` and `mappingUpdatedAt`: ignored, never required, the rules refuse client writes
  to them and a new doc must not carry them. `scripts/cleanup-region-docs.mjs` removes them
  (see staging-migration.md, "Regions rollout").
- `regions/{id}.texts` (optional, `{ examples: { place, organizer, address, contact } }`,
  plain text, max 120 characters each, more text keys can be added next to `examples`):
  the grey "z.B. ..." examples of the event forms (`EventFormWizard`, `EventForm`,
  `CityField` free variant). Edited per region in Verwaltung -> "Über uns" (section
  "Beispieltexte"; moderators of the region and Super-Admins, rules list `texts` in the
  moderator field set). `mergeRegions` sanitises it (`sanitizeTexts`). Precedence per
  field (`formExamples` in `src/utils/regionExamples.js`): stored text of the event's
  region > (Ort only) first Bezirk / Landkreis without "(Stadt)" / "1. " / "Stadt " /
  "Landkreis " ("z.B. Innsbruck", "z.B. Stuttgart")
  > neutral text ("z.B. Ortsname", ...).
  > Dark launch: with fewer than two active regions the legacy Vorarlberg strings
  > ("Lindau", "Dornbirn", "6900 Bregenz", ...) stay byte-identical and stored texts are ignored;
  > with two or more, Vorarlberg keeps the legacy strings unless it has own texts.
- `app_settings/regionMigration` = `{ complete: true }` is the migration marker.
- Online events (`isOnline`) keep their own `regionId`. With one active region they are
  visible everywhere; with two or more see 2b.
- Write paths that must set the fields: event form/wizard/duplicate
  (`pickEventRegionId`), profile form, `adminUpdateMember` (adds
  `directoryRegionIds: ['vorarlberg']` when listing a profile without one),
  approving an event without `regionId` (adds it; Super-Admins only). Anything
  that writes events or listings outside the app (scripts, console) must set
  them too, or the doc is invisible while the marker is set.

### 2a. Regions and districts: defined only in code

The register has **133 regions, 658 districts**: Austria 9 (116 Bezirke), Germany 104 (400
Landkreise and kreisfreie Städte), Switzerland 19 (140 Bezirke; Appenzell includes
"Ausserrhoden"), Liechtenstein 1 (2 Landesteile). Regions and their districts come only from the CSVs in
`scripts/data/regions/` via the generated `src/data/regionData.js`; there is no admin tool,
callable or Firestore field to change them, and no region can be created at runtime. A change
is a code change (see section 13).

- **Client:** `mergeRegions` lays only the switchable fields of the `regions/{id}` docs
  (`active`, contact, seo, texts, about, `instagramHandle`, `timezone`, `order`) over the
  register; `name` and `bezirke` of a doc are ignored. Functions do the same
  (`mergeFeedRegions`; `STATIC_REGION_BEZIRKE` for `adminSetRegionActive` and the ICS
  `bezirk=` check); `onRegionWriteBumpEventsVersion` reacts to `active` only.
- **Catalogue:** `DISTRICT_CATALOG` in `src/utils/regionMapping.js` (key `"<country>|<name>"`,
  e.g. `AT|Bregenz`, `DE|Landkreis München`, `LI|Oberland`; names are unique per country) and `currentAssignment`
  (district key -> the region of the register that lists it) are what place search and the
  Ort -> Bezirk lookup use.
  The legacy "Grenznahe" of Vorarlberg is not a district.
- **Empty regions do not exist for visitors:** `isPopulated(region)` (the register lists
  districts; every CSV region has some, the guard stays for safety). `RegionProvider` removes empty ones from `allRegions` (chooser, place search,
  routes), `RegionsTab` / `ModerationTab` do not list them, and `adminSetRegionActive`
  refuses to activate one (`no-districts`).
- **Rules:** `regionIds()` in `firestore.rules` is the only list of valid region ids (the 133;
  the rules tests stay within the expression budget with 10 `directoryRegionIds` from the end
  of the list;
  former ids are refused everywhere: events, profiles, moderators, place selection).
  `regions/{id}` allows no client write to `name`, `slug`, `bezirke` or `mappingUpdatedAt`
  (legacy keys may stay in seeded docs until the cleanup).
- **Not covered:** the per-region Instagram backend is wired by hand
  (`docs/instagram-regions.md`).

### 2b. Online events need a regional directory listing (Trello lVFp6Dvw)

- **Rule (only with two or more active regions):** an online event of a non-staff organiser
  (`createdBy`) shows in region R only if the organiser's `users/{uid}/publicProfile/data` is
  listed (`listedInDirectory`, not `directoryHidden`), has R in `directoryRegionIds` (missing =
  Vorarlberg) and names at least one Bezirk / Landkreis of R (register) in
  `directoryRegions`. The "Online" chip does not count. The event forms (`EventForm`,
  `EventFormWizard`, hook `useOnlineEventGate`) offer "Online-Event" only then; otherwise the box
  is disabled with a German hint (an event that already is online stays editable and can be
  unticked). Staff (any `admin_users` doc: Super-Admin, Regions-Moderator:in) are exempt, as
  editors in the form and as organisers in the lists; events without `createdBy` too.
- **Single region (dark launch decision):** with fewer than two active regions the rule is off
  completely: the option is always offered, nothing extra is read, no event gets
  `onlineRegionIds`, so `/api/events.json`, the calendar, prerender and the Vorarlberg ICS feed
  are byte-identical. Organisers without listing data lose nothing until a second region goes
  live; from then on the rule applies in every region, Vorarlberg included (no migration, no
  data is written).
- **Logic:** one pure helper `src/utils/onlineEventEligibility.js`; synced copy for the functions
  in `functions/src/onlineEventEligibility.ts` (guarded by `tests/lib/functionsRegions.spec.ts`).
- **Data path:** the public list never carries `createdBy`, so the server works it out:
  `publicEvents` (and the ICS feed, `functions/src/onlineEventListings.ts`) add
  `onlineRegionIds` (the active regions the event may show in) to online events of non-staff
  organisers. `useRegionEvents` (calendar; combined view: any region of the view), SimilarEvents
  (annotations from the cached public list), the prerendered region pages (Admin SDK read in
  `prerender.mjs`) and the ICS feed filter by it. **Fail open:** an online event without
  `onlineRegionIds` (Firestore fallback path, emulators, prerender without credentials) is shown
  as before. Favourites and OrganizerEvents ignore the rule.
- **Freshness:** `events.json` gets a new version on event writes, on listing changes
  (`onListingWriteBumpEventsVersion`, only the four listing fields and only with two or more
  active regions) and on `regions/{id}` changes of `active`
  (`onRegionWriteBumpEventsVersion`). Changes of `admin_users` (someone becomes staff) do not
  bump it; they show with the next version. The ICS feed caches annotations for 5 minutes.

## 3. Roles

- **Super-Admin** = `admin_users/{uid}.role == 'Admin'` (or token claim
  `role: 'Admin'`), unchanged. **Regions-Moderator:in** = `role: 'RegionModerator'`
  with `regionIds` (any of the regions).
- **Rules:** moderators get a narrow extra right via `isRegionModeratorFor()`
  (review actions, messages and trash of their regions' events, hiding directory
  listings that lie only in their regions); `isAdminOrEmulatorAdmin()` is
  untouched, so every other admin-only rule stays Super-Admin only. Matrix:
  `tests/rules/instagram.rules.spec.ts` ("region moderators").
- **"Über uns" per region:** `/<slug>/ueber-uns` (`RegionAboutRoute`; `/ueber-uns` stays
  Vorarlberg's page, the footer link follows the current region). Texts switch with the
  usual dark-launch rule (`AboutPage`). Moderators (and Super-Admins) maintain it in the
  admin tab "Über uns" (`RegionAboutTab`): header photo (`regions/{id}/` in Storage) and the
  rich text of the "Deine Heimat <Region> ruft dich." section (heading fixed), saved as
  `aboutHeaderImage` / `aboutText` on `regions/{id}` (`src/utils/regionAboutText.js`; no
  `aboutText` = default text). The rule lets a moderator update exactly those fields
  (+ `updatedAt`) of her own regions. Helpers (`helpers/*`, admin tab "Helfer") belong to one
  region via `regionId`; a doc without it is Vorarlberg's (read fallback, no migration). The tab
  is open to moderators (region picker only with more than one region to choose; Super-Admins
  get all regions). Rules: create needs a valid `regionId`, create/update/delete for Super-Admins
  or `isRegionModeratorFor(regionId)`, `regionId` never changes. `useHelpers(regionId)` queries
  `where('regionId', '==', id)`, Vorarlberg reads the whole collection and filters on the client
  (`src/utils/helperRegions.js`). "Über uns" shows the helpers of its region (national views and
  the dark launch: Vorarlberg's) and leaves the whole "Mithelfer:innen" section out while there
  are none (also while loading or on an error). `aboutHelperIds` is no longer written or read.
- **Donors per region:** `donors/*` carry a `regionId` (the "Über uns" page the donor is listed
  on); a doc without it is Vorarlberg's (read fallback, no migration). `useDonors(regionId)`
  works like `useHelpers` (Vorarlberg reads all and filters on the client,
  `src/utils/donorRegions.js`). "Über uns" lists the donors of its region (national views and
  the dark launch: Vorarlberg's), and its `DonationBlock` sends that `regionId` with the
  callable; `/spenden` uses the visitor's region (`useRegion().regionId`), the donation
  pop-up and the `/spenden` back link lead to `aboutPathFor(...)` (`#spenden`), like the
  footer. `createMolliePayment` / `createMollieSubscription` accept only a known region id
  (otherwise Vorarlberg) and put it into the Mollie metadata; the webhook writes it on the
  first write of a donor doc and keeps a stored `regionId` afterwards (`donationRegionId` in
  `functions/src/mollieWebhookLogic.ts`). Admin tab "Spender" stays Super-Admin only, with the
  same region picker as "Helfer" and a region choice in the dialog. Rules: `regionId` optional
  on create, must be a valid region when set or changed, only Super-Admins write (they may
  move a donor to another region; unlike helpers); moderators have no access.
- **Instagram-Name per region:** optional `instagramHandle` ("@name", display only) on
  `regions/{id}`. Only Super-Admins set it (`RegionAboutTab`, section "Instagram-Name der
  Region"; the moderator rule's field list does not contain it; rules check
  `^@[A-Za-z0-9._]{1,30}$` or null). There is no connect/token UI: wiring the real
  account is done manually outside the app. `regionInstagramAccount(region)`
  (`src/utils/regions.js`) returns the stored name, `@tribevorarlberg` for Vorarlberg
  when none is stored (code default, no migration), else null (wording then says "unserem
  Instagram-Kanal" without a name). Used by the event form consent box (event's region),
  the profile card, the regional "Über uns" (link, region mode only) and the Datenschutz
  section 12: generic wording plus a collapsed list "Unsere Instagram-Kanäle (n)" and one
  Impressum link per channel, all only once at least two channels of active regions exist
  (dark launch). Have the legal wording confirmed before a second channel goes live.
  Not in
  the prerender/sitemap yet.
- `admin_users` is written only via the Admin SDK: callables
  `adminSetRegionModerator` / `adminListRegionModerators` (Super-Admin only,
  audit entries in `admin_audit_log`; UI: tab "Moderation") or
  `node scripts/promote-admin.mjs <email> --role RegionModerator --regions tirol,steiermark`
  (`--emulator` for local emulators, `--project tribe-vbg-staging` for staging
  with ADC; no flag = production via `scripts/service-account.json`; any other
  `--project` is refused).
- **Client:** `useAuth()` exposes `role` and `staffRegionIds` (own `admin_users`
  doc); `getStaffAccess(role, regionIds)` / `useStaffRole()` give `isSuperAdmin`,
  `isRegionModerator`, `moderatorRegionIds`, `canModerateRegion(id)`. Admin tabs
  per role: `allowedAdminTabs()` in `src/utils/staffRoles.js`; a tab outside the
  list shows "Kein Zugriff" (`NoAccess`) also by URL; `/admin/theme-editor` is
  Super-Admin only (`SuperAdminRoute`). Moderator event lists must filter by
  region (`staffEventQuerySpecs` in `src/lib/staffEventQueries.js`), or the rules
  reject the query.
- **Members tab for moderators:** per member of her regions name, username, registration date, Instagram handle and sharing consent, directory state; never the e-mail (`toModeratorMemberRow`).
- **Coming-soon page** (`RegionComingSoonPage`): progress bar in percent of `REGION_EVENT_GOAL` (30, internal, never shown as a number; approved events of the region via `useRegionEventCount`), "Event eintragen" (events entered there get that region), invite button (share sheet or copied link), a quiet "Andere Regionen erkunden" link; no links to the active regions.
- Staff may see an inactive region's coming-soon page with a one-line note
  (`useCanPreviewRegion`); a real preview banner is a follow-up.
- **Applying as Regions-Moderator:in:** `ModeratorApplyCard` (on the "Wo suchst du?" page and on
  every coming-soon page) invites visitors with a short form: name, reply e-mail, a few lines,
  optional region and photo (shrunk in the browser by `compressImage`). The callable
  `submitModeratorApplication` (`functions/src/moderatorApplication.ts`, App Check observed,
  rate limit 3 per 30 min and client, honeypot field `website`) validates it (the photo must be
  a real JPEG/PNG/WebP by its bytes, max 2 MB) and mails it to `admin@thetribe.at` with
  Reply-To = the applicant and the photo inline (Mailgun multipart). On staging Mailgun is a
  dummy, so the form answers with an error there. Making someone a moderator stays a manual
  step in the admin tab "Moderation".
- Admin mails (feedback, Instagram alerts) go to Super-Admins only. Submission
  mails are region-aware but currently switched off (section 7).

## 4. Activation

Do not hand-edit `regions/{id}.active`. Verwaltung -> tab "Regionen"
(`RegionsTab.jsx`, Super-Admin only; moderators get "Kein Zugriff") lists every
region (grouped by country in foldable accordion sections; countries with an active region start open) with status, moderators, upcoming events, Bezirke count and `contactEmail`,
plus "Freischalten" / "Deaktivieren". Everything goes through the callables
`adminListRegionActivation` and `adminSetRegionActive({ regionId, active,
override })` (`functions/src/adminRegions.ts`; pure rules in
`functions/src/regionActivation.ts`, tests `tests/lib/regionActivation.spec.ts`).

- **Conditions** (re-checked server side): at least 1 Regions-Moderator:in
  (`admin_users` with the region in `regionIds`) and at least 15 upcoming
  approved, non-online events (`regionId`, missing = Vorarlberg; a series counts
  once; "upcoming" = last date >= today in Vienna). Unmet ->
  `failed-precondition` with `details.reason: 'conditions-unmet'` and the counts,
  unless `override: true` (the UI asks "Trotzdem freischalten" first).
- Vorarlberg can never be deactivated.
- The flag (+ `updatedAt`) and an `admin_audit_log` entry (`activateRegion` /
  `deactivateRegion`, override flag, counts) are written in one transaction. A
  missing region doc is refused (create it with `scripts/seed-regions.mjs`).
- Afterwards the client calls `refreshRegions()` (`src/hooks/useRegions.js`),
  which reloads the shared region cache for every mounted `useRegions()` caller.
- `firestore.rules` for `regions` are unchanged: Super-Admins can still write the
  doc directly (console / client SDK), which skips the conditions and the audit
  entry.
- **Switching on a second region changes the whole site** (chooser, switcher,
  region names in mails, GA `region`, region pages in the next prerender, new
  sitemap entries). Do it deliberately and after the migration ([staging-migration.md](./staging-migration.md)).

## 5. Queries and the migration marker

Firestore cannot query for a missing field, and docs from before the migration
have no `regionId` / `directoryRegionIds` (read as Vorarlberg). So:

- **Client filter always on.** `useRegionEvents` / `useRegionDirectoryEntries`
  filter on top of whatever was loaded (missing = Vorarlberg).
- **Server-side queries only with the marker.** The public lists use
  region-scoped queries only while `app_settings/regionMigration` says
  `{ complete: true }`; without it they load everything as before. The app
  listens to the marker, so open pages switch live.
- **Queries** (`src/utils/regionQueries.js`, pure; tests
  `tests/components/regionQueries.spec.ts`, hooks
  `tests/components/regionScopedQueries.spec.tsx`): calendar / similar events:
  `status == approved` + `regionId == R`, plus `status == approved` +
  `isOnline == true`; combined views and favourites: `regionId in [active
regions]` (<= 30); directory: `listedInDirectory == true` +
  `directoryRegionIds array-contains R` (combined: `array-contains-any`). A
  failing region query (e.g. index still building) falls back to the full query.
  Admin tabs (`useAllEvents()` without options), OrganizerEvents (`createdBy`) and
  staff lists (`staffEventQueries.js`, already by region for moderators) do not
  use it.
- **Indexes** (`firestore.indexes.json`, deployed by `deploy.yml` when the file
  changes): events `status+regionId`, events `status+isOnline`, collection group
  `publicProfile` `listedInDirectory+directoryRegionIds(CONTAINS)`. The emulator
  ignores missing indexes, so a new query shape needs its index added by hand.
- **Marker is written** only by `migrate-region-ids.mjs --apply`, and only when the
  control read after the writes finds 0 docs without the field and 0 invalid
  values (`decideMigrationMarker`). A re-run with nothing to migrate writes it
  too; a run that finds open/invalid docs deletes an existing marker. The dry-run
  prints the marker state and warns when a marker exists but docs miss the field
  (use it as a health check).
- **Switching back:** `migrate-region-ids.mjs --revert --apply`, or delete the
  doc (Super-Admins may delete it from a client; nobody can create or change it
  from a client, only the Admin SDK; anyone can read it, see
  `tests/rules/instagram.rules.spec.ts`). Deleting is always safe.
- The marker is not mirrored to staging (`app_settings` allowlist): after
  `mirror-prod-to-staging.mjs` run the migration on staging to get it.

## 6. Production runbook and staging

Moved to [staging-migration.md](./staging-migration.md) (migration order, backup,
revert, staging project, mirror, test accounts). Read it before touching the
production migration or deploying to staging.

## 7. Emails

- **Switched off:** `ADMIN_EVENT_EMAILS_ENABLED = false` in
  `functions/src/notifications.ts` (Trello 8ioEr9T1, saves Mailgun quota). While
  false, the "new event submitted" mail to staff is not sent at all: no
  Firestore/Auth reads, no Mailgun call (guarded by
  `tests/lib/adminEventRouting.spec.ts`). Keep it false unless the product owners
  decide otherwise; re-enabling = set it to `true` and deploy the functions.
- **Not affected by the flag:** mails to organizers (published, change request,
  back to draft, deleted) and the feedback/contact mail (Super-Admins only).
- **Routing once re-enabled** (`functions/src/adminEventRouting.ts`, pure, wired
  up in `notifications.ts`): for an event of region R the recipients are the
  Super-Admins and the shared `SUBMITTED_NOTIFICATION_INBOX`, the
  Regions-Moderator:innen whose `regionIds` contain R (email from Auth; disabled
  or email-less accounts are skipped) and `regions/{R}.contactEmail` if set.
  Deduplicated case-insensitively; no `regionId` = Vorarlberg; online events go
  by their `regionId`; moderators never get mail about other regions. If
  moderators or regions cannot be read, the mail still goes to the Super-Admins.
  Unsubscribe (`notifyOnSubmitted`) applies to everyone with an account.
- **Dark launch:** the region name appears in subject and body only while more
  than one region is active; with one active region the mail is byte-identical to
  the old one.
- **Owner mails** get the line "Rückfragen zu dieser Region: <contactEmail>" from
  `regions/{regionId}.contactEmail`, also only while more than one region is
  active and the address is valid (`resolveOwnerRegionContact`); otherwise
  byte-identical (pinned in `tests/lib/emailTemplates.spec.ts`).

## 8. SEO and prerender

The prerender (`scripts/prerender.mjs`, see [seo-prerender.md](./seo-prerender.md)) also reads the
`regions` collection (optional snapshot
`data-export/firestore-export/regions.json`, then Admin SDK / REST / client SDK on
top, written by `prerender:refresh`), merged over the static register with
`mergeRegions`. Missing/empty/unreadable means static register = Vorarlberg
only. Only public fields are kept (never `contactEmail`).

- **Dark launch:** with fewer than two active regions `/`, event pages and
  `sitemap.xml` are byte-identical (golden hashes in
  `tests/components/prerenderRegions.spec.tsx`), no region page is written.
  `/verzeichnis` was never prerendered (SPA fallback).
- **Two or more active regions:** `dist/<slug>/index.html` and
  `dist/<slug>/verzeichnis/index.html` for every active region (Hosting serves
  them before the `**` rewrite, no `firebase.json` change). Texts come from
  `regionTexts()` (title `Kalender | The Tribe <Region>`, canonical `/<slug>`,
  JSON-LD only on the calendar page). The sitemap adds `/<slug>` and
  `/<slug>/verzeichnis` of active non-default regions. Events of non-Vorarlberg
  regions get `| The Tribe <Region>` in `<title>` (canonical stays
  `/event/<slug>`).
- Inactive regions get no page and no sitemap entry; the SPA coming-soon page is
  `noindex`. Combined views are not prerendered or in the sitemap; unavailable
  ones are `noindex` (coming soon). `/` stays the Vorarlberg page (not
  region-neutral yet).
- A region only shows up in the prerender after the next build. Switching a region
  on or off (`regions/{id}.active` changes) starts that build at once
  (`onRegionWriteTriggerBuild` in `functions/src/triggerBuild.ts`, rule
  `regionActiveChanged`), so the region pages, the sitemap and the region-mode hint on
  `/` follow within one build cycle.

## 9. ICS feed

`/calendar/feed.ics?region=<slug>` (tokens: [calendar-feed.md](./calendar-feed.md)).
Default and absent = `vorarlberg`; the client never adds `region=vorarlberg`, so
the URL and output of the Vorarlberg feed stay byte-identical. Events by
`filterEventsForRegion` (own region, events without `regionId` = Vorarlberg,
online events in every region, active regions only; with two or more active regions online
events only where their organiser is listed, section 2b). `bezirk=` is checked against
the region's own Bezirke (`regions/{id}.bezirke` over the static register, 5 min
cache, `functions/src/regions.ts`). Unknown slug: `400`. Known but inactive
region: valid empty feed (`200`, cached like others). Name/PRODID/X-WR-TIMEZONE
follow the region ("Events Steiermark – thetribe.at"); Vorarlberg unchanged.

Combined views: `region=oesterreich|deutschland|schweiz|alle-tribes` (the client
sends them in a combined view; former region ids such as `bayern` are `400`). Events of the ACTIVE regions of that country (all
for `alle-tribes`), online events by their own region; no availability check (a
view without active region is a valid empty feed); `bezirk=` is checked against
the Bezirke of all regions in scope; name "Events Schweiz – thetribe.at"
(`Alle Tribes`, `Österreich`, `Deutschland` alike), default time zone. Favourites use
the default feed. The single-event `.ics` ignores regions.

## 10. Analytics per region

- **Client:** `setAnalyticsRegion()` in `src/lib/analytics.js`, driven by
  `AnalyticsRouteTracker` in `src/App.jsx`. Every event (incl. `page_view`) gets
  the event parameter `region` (slug, e.g. `steiermark`; combined views send their
  own slug, e.g. `oesterreich`). Event pages use the event's region
  (`useEventRegionContext`). **Dark launch:** only sent while at least two regions
  are active; with only Vorarlberg active the payloads are unchanged. Admins send
  nothing (existing rule). The `page_view` of an event page can still carry the
  previous region if the event loads later than the 150 ms title delay.
- **Report:** `adminAnalyticsReport` takes an optional `region` (region id or
  combined-view slug, anything else counts as "all"). With it every GA request
  gets an EXACT `dimensionFilter` on `customEvent:region`. A combined-view slug
  matches only events that were sent with that slug (not the included regions).
  Without a region the extra block `regions` (users / pageViews / sessions per
  `customEvent:region`) is added, so every region that shows up in the data
  appears in the comparison table by itself. `regions` is omitted while GA has no
  region data. Cache key `days:region`.
- **If the dimension is missing** GA answers 400 for `customEvent:region`. The
  function does not fail: the normal report is returned with `regionDimension:
'unavailable'`; with a region filter the data is empty plus
  `regionDimension: 'unavailable'`. The tab then shows the hint to create the
  dimension.

**Einmalig einrichten (Property-Bearbeiter:in in Google Analytics, nicht das
Dienstkonto):**

1. analytics.google.com öffnen, die Property der Seite (Stream `G-34TNY65VBC`) wählen.
2. Unten links _Verwalten_ (Zahnrad) → _Datenanzeige_ → _Benutzerdefinierte Definitionen_.
3. Tab _Benutzerdefinierte Dimensionen_ → _Benutzerdefinierte Dimension erstellen_.
4. Dimensionsname: `Region`. Bereich: **Ereignis**. Ereignisparameter: `region`
   (klein geschrieben, genau so). Speichern.
5. Ab jetzt zählt GA die Region mit. Das gilt **nicht rückwirkend**: ältere Daten
   haben keine Region. Bis die ersten Zahlen im Tab erscheinen, kann es bis zu 24
   Stunden dauern.
6. Neue Regionen müssen nicht extra eingerichtet werden: sobald eine Region aktiv
   ist und Besucher:innen hat, erscheint sie automatisch in „Regionen im
   Vergleich“ und im Region-Filter (Dropdown listet die aktiven Regionen).

**Annahme, bitte bestätigen:** Cookie-/Datenschutztext braucht keine Änderung.
`region` ist eine Seiten-Eigenschaft (welcher Regionsbereich der Seite angezeigt
wird), keine personenbezogene Angabe, und die Einwilligung und die Admin-Ausnahme
bleiben unverändert.

## 11. Tests

Fixtures for a second region, emulator only. Source of truth:
`scripts/seed-region-fixtures.mjs`.

- **Regions** `regions/vorarlberg` (active), `regions/tirol` (inactive by
  default; only switches, the Bezirke come from the register) and `regions/wien`
  (inactive, for visibility tests). `tests/globalSetup.ts` reconciles them on
  every Playwright run with `set(..., { merge: true })` in one batch.
- **Destructive-project rule:** two active regions show the required region
  dialog on every page, so Tirol is active only while
  `region-calendar-filtering.spec.ts` runs in the `destructive` Playwright
  project. Any spec that activates a second region must be added to
  `DESTRUCTIVE_SPECS` in `playwright.config.ts` and deactivate it again.
- **Events** are _not_ loaded by globalSetup, so no existing count/order
  assertion sees them (all titles start with `[Region-Test]`): Yoga Innsbruck (Bezirk
  "Innsbruck (Stadt)"),
  Meditation Kufstein, Online Atemreise Tirol (`isOnline`, `regionId: 'tirol'`),
  Yoga Dornbirn (explicit `regionId: 'vorarlberg'`) and Yoga Bregenz ohne Region
  (no `regionId`, i.e. "before the migration"). Ids are in `REGION_EVENT_IDS`
  (`tests/helpers/regionFixtures.ts`). A dedicated spec loads them with
  `loadRegionEventFixtures()` in `beforeAll`, or by hand:
  `node scripts/seed-region-fixtures.mjs --events`.
- **Migration marker in tests:** the existing seed events have no `regionId` and
  fall back to Vorarlberg, so the emulator never has the marker.
  `setRegionMigrationMarker(true|false)` in the same helper sets/deletes it, only
  in `destructive` specs and always removed again (while it is set every seed
  event is missing from the calendar).
- **Account** `tirol-mod@test.local` / `testpassword123` is a Regions-Moderator:in
  for Tirol: no token claim, `admin_users/{uid}` = `{ role: 'RegionModerator',
regionIds: ['tirol'] }` (reconciled by `seed-region-fixtures.mjs`). Playwright
  session: `STORAGE_STATE.regionModerator`. Scripts that need "the" admin filter
  `admin_users` by `role == 'Admin'`; never use a bare `admin_users.limit(1)`.
- **Sync tests:** `tests/lib/regionRegisterCsv.spec.ts` (both CSV layouts and their failure
  cases, CSVs <-> both generated files <-> rules <-> functions ids, META completeness, id
  shape, district uniqueness, German counts pinned loosely, reused vs retired ids),
  `tests/lib/functionsRegions.spec.ts` (`functions/src/regions.ts` vs `src/utils/regions.js`
  / `src/utils/directory.js`), `tests/components/vorarlbergRegister.spec.ts` (Vorarlberg's id,
  Bezirke, "Grenznahe", the missing-regionId fallback), `tests/components/regionDocs.spec.ts`
  (seed / cleanup plan). Rules matrix:
  `tests/rules/instagram.rules.spec.ts`.
- Logic belongs in Vitest (`tests/components/`, `tests/lib/`); see [testing.md](./testing.md)
  and AGENTS.md "Testing" for the tier policy.

## 12. Known limitations and follow-ups

- **Profile editor Bezirke:** `DirectoryListingFields` still offers the
  Vorarlberg-only `BEZIRKE` plus "Online"; profiles cannot yet pick Bezirke of
  other regions in the editor.
- **HomepagePreview** (`src/components/HomepagePreview.jsx`) has its own
  Vorarlberg-only `BEZIRKE` constant.
- **`/` is not region-neutral:** it stays the Vorarlberg page (prerender, texts,
  footer "tribe Vorarlberg").
- **`useAuth` forced token refresh** runs once per mounted instance instead of
  once per session.
- **Preview for staff:** inactive regions show only a note on the coming-soon page
  (`useCanPreviewRegion`); the preview banner (former ticket 27) is not built.
- **Admin submission mails** are off (`ADMIN_EVENT_EMAILS_ENABLED = false`);
  routing is prepared and tested.
- **Analytics:** the first `page_view` of an event page may carry the previous
  region; GA dimension `region` must be registered once (section 10), data is not
  retroactive.
- **Prerender:** activation does not trigger a rebuild; region pages appear with
  the next build.
- **Parallel worktrees:** the dev server / Playwright port 5180 is shared, so two
  worktrees cannot run Playwright at the same time.
- **Moderator lists** must always filter by region, else rules reject the query
  (`staffEventQuerySpecs`).
- **Legal texts** (Impressum, Datenschutz, AGB in `LegalPage.jsx`) still describe
  tribe Vorarlberg only.
- **Location near borders:** "Meinen Standort verwenden" resolves AT / CH / LI to the
  region of the Bundesland / Kanton / Liechtenstein outline (no Bezirk shapes); a position in
  Germany to the region of the nearest German place's Landkreis (no German outlines, so near a
  Landkreis border the neighbour can come out; see section 1).
- **District data** is only as good as the CSVs: Swiss regions with one entry (Genf, Glarus,
  Neuenburg, Schaffhausen) list the canton itself as their only "Bezirk"; Appenzell
  Ausserrhoden is one district "Ausserrhoden"; the Entlebuch has no district in the CSV (its
  places know only the region). German regions are what the product owner listed (e.g.
  "Region Neumünster" holds Segeberg and Stormarn, "Hannover" only the Region Hannover).
- **Many regions:** with 133 regions the admin lists (Regionen tab grouped by country,
  moderator region checkboxes, helper / donor region pickers) are long; the public queries
  use `regionId in [...]` only for up to 30 active regions (more: full query + client filter).

## 13. How to add a new region

Regions are added in code only (there is no admin tool for it).

1. **CSV:** add the row to the country's CSV in `scripts/data/regions/` (`Region;Bezirke`, or
   in `deutschland.csv` `Region,District 1,District 2,...`; a new country: a new CSV, plus
   `COUNTRY_FILES` / `COUNTRY_SETTINGS` in
   `scripts/lib/regionRegister.mjs`, `COUNTRIES` / `COUNTRY_LABELS` in `src/utils/regions.js`
   and, if wanted, a `COMBINED_VIEWS` entry in both `regions.js` and
   `functions/src/regions.ts`).
2. **META:** add the region to `META` in `scripts/lib/regionRegister.mjs` (`slug` by the id
   rule, `demonym`, `inPhrase` / `forPhrase` when "in <Name>" / "<Name>" do not fit) and a new
   id to `HISTORIC_REGION_IDS`. Never change an existing slug.
3. **Generate:** `node scripts/build-region-data.mjs`. Add the id to `regionIds()` in
   `firestore.rules` (same order); a new outline / canton grouping goes into
   `ADMIN_SHAPE_REGIONS` (`src/utils/geoRegion.js`). Rebuild the place list
   (`scripts/build-place-index.mjs`, extend `ALIASES` / `DE_CODES` for unmatched names).
   `npm run test` (incl. `tests/lib/regionRegisterCsv.spec.ts`) and `npm run test:rules`
   must be green. Adding a slug also requires running `check-reserved-usernames.mjs`
   read-only against production.
4. **Seed script:** `node scripts/seed-regions.mjs --project tribe-vbg-staging`, then
   `--prod` (idempotent; creates the doc inactive with only switches, keeps admin edits,
   switches off docs of regions that left the CSVs).
5. **Moderator:** appoint a Regions-Moderator:in (admin tab "Moderation" or
   `promote-admin.mjs --role RegionModerator --regions <slug>`).
6. **Contact email:** set `regions/{id}.contactEmail` (Regionen/Console); used for
   owner mails and, once re-enabled, submission mails.
7. **Content:** at least 15 upcoming approved, non-online events in the region
   (the activation condition). Check the Bezirke list with the moderator.
8. **Activation:** Verwaltung -> Regionen -> "Freischalten" (section 4). Consider
   that this turns on the chooser/switcher and region names for everyone.
9. **GA dimension:** already exists once `region` is registered (section 10);
   nothing to do per region.
10. **SEO check:** after the next build, check `dist/<slug>/index.html` (title,
    canonical, JSON-LD), the sitemap entries and that the page is indexable; check
    `/<slug>/verzeichnis`.
11. **Legal texts:** confirm Impressum / Datenschutz / AGB / footer wording with the
    product owner for the new region or country (they are Vorarlberg-specific
    today).

- **Where the region is chosen:** visitors without an account use the header button (phone:
  burger menu) and the footer; signed-in users and moderators use the card "Region" in the
  profile; Super-Admins use the footer (`RegionPickButton`). All open the same pop-up and keep
  the dark launch rule (hidden below two active regions; the profile card is then left out
  entirely).
- **Coming-soon page:** the link "Andere Regionen erkunden, z. B. <Region> (<n> Events)"
  points to the open region with the most approved events (`useLargestRegion`).

## District colours (Bezirksfarben)

Each Bezirk / Landkreis has a colour for its badge and calendar chip, stored as overrides in
`app_settings/districtColors`. A district added later (new region) gets an automatic
warm tone from a fixed palette without any setup. Details: `docs/design-tokens.md`, "Bezirksfarben".
