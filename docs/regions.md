# Regions (multi-region epic)

**Read this when** you touch regions, region texts/routing, roles for regions,
region activation, region emails, SEO/ICS/analytics per region, or add a region.
Linked from `AGENTS.md`. Production migration and staging: [staging-migration.md](./staging-migration.md).

The platform started as "tribe Vorarlberg"; the regions epic prepares all 51
regions of Austria (9 Bundesländer), Germany (16 Bundesländer) and Switzerland
(26 Kantone) without changing what visitors see until a second region is switched
on. Structure everywhere: country -> region (Bundesland / Kanton) -> Bezirk
(Austria, Switzerland) or Landkreis (Germany, incl. kreisfreie Städte).

Contents: 1 Concept · 2 Data model · 3 Roles · 4 Activation · 5 Queries and the
migration marker · 6 (moved) · 7 Emails · 8 SEO and prerender · 9 ICS feed ·
10 Analytics per region · 11 Tests · 12 Known limitations · 13 How to add a region (2c: regions created in the Verwaltung)

## 1. Concept

- **Static register + `regions/{id}` docs.** `STATIC_REGIONS` in
  `src/utils/regions.js` is the fallback whenever Firestore delivers nothing;
  `regions/{id}` docs (id == slug, also enforced by `firestore.rules`) override
  name, `bezirke`, `contactEmail`, `seo`, `active`, `timezone`. Only Vorarlberg is
  active in the register. `functions/src/regions.ts` has a synced copy of the
  register data the functions need, guarded by `tests/lib/functionsRegions.spec.ts`.
- **Register data is generated.** `scripts/build-region-data.mjs` reads
  `scripts/data/regions-countries.csv` (the product owner's list: country, region,
  Bezirk; Austria and Switzerland as given) and `scripts/data/de-kreise.json`
  (German Landkreise and kreisfreie Städte, status 31.12.2018 from the Destatis
  GV-ISys via the npm package `landkreise-deutschland`, CC-BY-4.0, Eisenach removed
  because it merged into the Wartburgkreis in 2021) and writes
  `src/data/regionData.js` and `functions/src/regionData.ts`. Wording per region
  (`inPhrase`, `forPhrase`, `demonym`) lives in the `META` table of that script.
  Re-run it after changing a CSV or the table; never edit the generated files.
  Names inside Germany that exist as city and Landkreis become "X (Stadt)" /
  "X (Landkreis)". The CSV lists only cities for Germany, so the German Bezirk
  level comes from the Kreis list instead. Vorarlberg's old pseudo-Bezirk "Grenznahe"
  ("Umgebung") is no longer in the register: since Trello dx8dCQJc it is a read-only legacy
  entry (`LEGACY_BEZIRKE`, generated next to `REGION_DATA`), appended to Vorarlberg's list at
  runtime (`STATIC_REGIONS`, `functions/src/regions.ts`, mapping fallback) so old events stay
  labelled, filterable (chip, ICS `bezirk=`, directory) and Instagram-grouped; the event forms
  never offer it (`selectableBezirke`, `subdivisionFor`). No migration: old events keep it until
  their Ort is changed.
  District names are one namespace for the directory (`directoryRegions`): two
  regions with a district of the same name (e.g. "Baden" in Niederösterreich and
  Aargau) share one filter chip.
- **Region ids.** The id is the ASCII slug (`vorarlberg`, `tirol`, `bayern`,
  `zuerich`, `graubuenden`, `freiburg` for the Swiss canton, ...). Order = switcher
  order: Austria, Germany, Switzerland. Each region has a static `country`
  (`AT` / `DE` / `CH`, not in `regions/{id}` docs: the rules whitelist does not
  include it), `name`, `inPhrase`, `forPhrase`, `demonym`, `order`, `bezirke`,
  `subdivisionLabel` ("Bezirk"; "Landkreis" in Germany) and `timezone`
  (`Europe/Vienna`, `Europe/Berlin`, `Europe/Zurich`; informational, all date
  maths uses Europe/Vienna). The old pilot region `allgaeu` no longer exists:
  stored `allgaeu` ids are read as `bayern` (`LEGACY_REGION_ALIASES`, the name
  stays reserved); the Allgäu Landkreise are Bavarian Landkreise now.
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
  - **Place list, no third party.** `src/data/placeIndex.json` (about 33,000 places of AT / DE /
    CH, 380 kB gzipped, loaded lazily by `src/lib/placeData.js` only when the picker opens or an
    event is saved) is generated by `scripts/build-place-index.mjs` from the GeoNames postal
    code files (CC BY 4.0, credit in Datenschutz section 17 and Impressum "Kartendaten /
    Quellen"; download commands in the script header, raw files are not committed). Each place
    has name, lat / lon, Bundesland / Kanton and, for about 99 %, the register district
    (`DISTRICT_CATALOG` key) it lies in; districts and states carry a centroid (mean of their
    places). Company postcodes are dropped. The script prints districts without places and
    unmatched names; extend `ALIASES` / `STATE_ALIASES` there. Search, distance and radius logic
    is `src/utils/placeSearch.js` (pure; `searchPlaces`, `nearestPlace`, `eventPosition`,
    `filterEventsByRadius`); it also finds regions by name ("Allgäu"; centre = mean of its
    districts under the current assignment).
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
    region's name ("Allgäu") and selects all districts; "Keine" returns to place + radius. The
    filter heading is the region's `subdivisionLabel` ("Landkreis" in Germany). One active region
    or a combined view: "Alle" and no place hint as before.
  - **The Ort decides Bezirk / Landkreis AND region (Trello dx8dCQJc).** Whatever region the
    person is in, the place of an event gives its district and the region holding it (current
    assignment): pure helpers in `src/utils/placeDistrict.js` (`assignmentForEntry` for a picked
    suggestion, `placeAssignment` for a typed name: Vorarlberg Gemeinde first, else the places of
    that name when they lie in ONE district, null when unknown / ambiguous). The forms keep it as
    `placeRegionId`, which wins over the current region when saving. Unknown places (Liechtenstein,
    outside DACH, free text) stay in the current region with an EMPTY Bezirk (allowed; no
    "Umgebung" any more). The Ort field (`CityField`): Vorarlberg, and every event while only one
    region is active, uses the Gemeinde picker, which also suggests places of all regions from
    `placeIndex.json` (lazy `loadPlaceIndex` after two letters) and takes other text over as typed;
    in other regions (two or more active) it is a combobox suggesting places of all regions, the
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
    Bezirk at all) is found by name, the namesake nearest to the region. A failed list load never blocks saving. Events written before
    need `node scripts/backfill-event-positions.mjs` (dry run, `--write`, `--all`;
    `PROJECT_ID=tribe-vbg-staging` for staging) once per project.
  - **"Meinen Standort verwenden" (ticket 567, reworked):** opt-in only: one click shows a short
    explanation, only "Standort abfragen" calls `navigator.geolocation` (never on page load, no
    retry). The position goes to `PlacePicker.onLocate`: nearest place of the list, region by
    `src/utils/geoRegion.js` from two bundled files that are dynamically imported (`loadGeoShapes`):
    - **Austria / Switzerland:** `src/data/adminAtChMap.json` (about 100 kB, 31 kB gzipped),
      the 9 Bundesländer and 26 Kantone in plain lon/lat (plus Liechtenstein as "no
      region"). Generated by `scripts/build-admin-at-ch-map.mjs` (download commands and
      checksums in its header; raw downloads are not committed), which matches by ISO 3166-2
      code and an explicit name list and fails if a register region has no polygon or vice
      versa (also guarded in `tests/components/geoRegion.spec.ts`).
    - **Germany:** projects lat/lon into the SVG of `landkreisMap.json` (equirectangular,
      constants `GEO_PROJECTION` fitted on 54 cities, about 2-3 km), finds the Landkreis and
      the region via `currentAssignment` (no holder: its Bundesland).
    - **Order:** exact hit in AT/CH/LI first, then an exact Landkreis hit; only without any
      exact hit the nearest shape within its tolerance (AT/CH 0.2 km, German shapes 2 units,
      about 2.5 km).
    - Denial, timeout, no API or no place within 30 km (Madrid): a German hint, the picker stays
      usable. Needs `geolocation=(self)` in the `Permissions-Policy` of `firebase.json` (guarded
      by `tests/lib/hostingCsp.spec.ts`).
    - **Data sources and licences:** Austria: geoBoundaries gbOpen AUT ADM1
      (AUT-ADM1-97560089, from BEV, Bundesamt für Eich- und Vermessungswesen), licence
      CC BY-SA 2.0 as stated by geoBoundaries: attribution required and
      `adminAtChMap.json` is shared under the same licence. Switzerland: geoBoundaries
      gbOpen CHE ADM1 (CHE-ADM1-70761945, from swisstopo swissBOUNDARIES3D), swisstopo OGD
      terms: free use, source "© swisstopo" must be named. Liechtenstein: Natural Earth
      1:10m (public domain). Attribution: `source` field of the JSON, the generator header,
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
      to 1/1000 degree, so about 0.1-0.15 km off the official border. The German side stays
      the weak part (2-3 km projection error): checked border pairs (tests) all resolve
      correctly: Konstanz / Kreuzlingen, Lindau / Bregenz, Lochau, Hörbranz, Passau /
      Schärding, Freinberg, Basel, Riehen / Weil am Rhein, Lörrach, Grenzach-Wyhlen,
      Salzburg / Freilassing, Kufstein / Kiefersfelden, Braunau / Simbach, Rheinfelden
      DE / CH, Waldshut / Koblenz AG, Vaduz, Schaan, Triesen / Buchs, Feldkirch-Tisis.
      Known residuals: within about 200 m of an AT/CH border either side can come out
      (e.g. right on the Rhine at Laufenburg, Konstanz-Paradies -> Thurgau); France next to
      Basel (Saint-Louis) snaps to Landkreis Lörrach through the German tolerance; the
      German exclave Büsingen gets no region.
- **Combined views** "Ganz Österreich" `/oesterreich`, "Ganz Deutschland"
  `/deutschland`, "Ganz Schweiz" `/schweiz` and the global "Alle Tribes"
  `/alle-tribes` are NOT regions, only views (never stored on events/profiles).
  Definitions: `COMBINED_VIEWS` in `src/utils/regions.js`; logic in
  `regionRouting.js` (`isCombinedViewAvailable`, `combinedViewRegions`,
  `availableCombinedViews`, `resolveTopLevelSlug`).
  - **Availability:** a view is available with at least 2 ACTIVE regions in its scope: a
    country view those of that country, "Alle Tribes" all active regions in total (also when
    they all lie in one country). The views are reached by their address; the chooser
    page lists none (for now).
  - **Unavailable view at its URL:** exactly one active region in scope -> `replace`
    redirect to that region's page (`/` while it is Vorarlberg; `/verzeichnis` is kept);
    none -> coming-soon page ("The Tribe – Deutschland kommt bald", `noindex`). The
    coming-soon pages of Deutschland and Schweiz add a hint what is needed to go live
    ("Wir suchen gerade Events für die Landkreise / Bezirke ... sobald mindestens ein
    Landkreis / Bezirk genügend Events hat", `liveHint` in `regionTexts.js`); Österreich has
    none. Routes wait for the region config (`loading`) before they redirect.
  - **Data:** `RegionProvider` exposes `combinedView`, `combinedRegions` (active
    regions in scope) and `combinedViews` (available ones). Calendar, directory
    and query plans use `isNational` mode with `combinedRegions` as id list
    (`regionId in [...]`, `array-contains-any`, limit 30); Bezirke/Orte chips are
    the union of those regions. Favourites (`allActive`) use every active region.
  - **Texts:** `COMBINED_VIEW_TEXTS` in `regionTexts.js`: "Dein österreichischer /
    deutscher / Schweizer Kalender", "Für Österreich / Deutschland / die Schweiz
    und Umkreis", title "Kalender | The Tribe <Land>"; "Alle Tribes": "Dein
    Kalender für bewusste Events", "in allen Regionen", "Für alle Regionen", title
    "Kalender | The Tribe". The footer reads "© 2026 Alle Rechte vorbehalten" everywhere. Per-region texts
    come from `regionTexts()`; the Vorarlberg header is "Dein Vorarlberger Kalender".
  - **Create-event / profile forms** offer only concrete regions. The event forms show no
    Region field: the region is the current one, and the extra Bezirk option "Finde meinen
    Bezirk nicht" opens `EventRegionDialog` to change it.
  - **Phone:** the header dropdown is hidden below 800px; the region list sits in the burger
    menu (`RegionMenuList`). A not-yet-open region/view shows the neutral header "Dein
    Kalender für bewusste Veranstaltungen" (`comingSoon` in the region context).
- **Reserved names.** The region slugs and the four combined-view slugs share the
  top-level URL space with profiles, so `username.js` reserves them.
  `scripts/check-reserved-usernames.mjs` prints and checks them (run it READ-ONLY
  against production before a merge that adds names).

## 2. Data model

- `events/{id}.regionId` and `users/{uid}/publicProfile/data.directoryRegionIds`
  (array; `users/{uid}.directoryRegionIds` mirrors it for the migration). A
  **missing** field means `vorarlberg` everywhere (`resolveRegionId`), so
  pre-migration docs keep working. The server-side queries (section 5) need the
  fields to exist, hence the migration.
- `regions/{id}`: `name`, `slug`, `order`, `active`, `bezirke`, `contactEmail`,
  `seo: { title, description }`, `timezone`, `createdAt`, `updatedAt` (rules
  whitelist; no `country`).
- `regions/{id}.texts` (optional, `{ examples: { place, organizer, address, contact } }`,
  plain text, max 120 characters each, more text keys can be added next to `examples`):
  the grey "z.B. ..." examples of the event forms (`EventFormWizard`, `EventForm`,
  `CityField` free variant). Edited per region in Verwaltung -> "Über uns" (section
  "Beispieltexte"; moderators of the region and Super-Admins, rules list `texts` in the
  moderator field set). `mergeRegions` sanitises it (`sanitizeTexts`). Precedence per
  field (`formExamples` in `src/utils/regionExamples.js`): stored text of the event's
  region > (Ort only) first Bezirk / Landkreis > neutral text ("z.B. Ortsname", ...).
  Dark launch: with fewer than two active regions the legacy Vorarlberg strings
  ("Lindau", "Dornbirn", "6900 Bregenz", ...) stay byte-identical and stored texts are ignored;
  with two or more, Vorarlberg keeps the legacy strings unless it has own texts.
- `app_settings/regionMigration` = `{ complete: true }` is the migration marker.
- Online events (`isOnline`) keep their own `regionId`. With one active region they are
  visible everywhere; with two or more see 2b.
- Write paths that must set the fields: event form/wizard/duplicate
  (`pickEventRegionId`), profile form, `adminUpdateMember` (adds
  `directoryRegionIds: ['vorarlberg']` when listing a profile without one),
  approving an event without `regionId` (adds it; Super-Admins only). Anything
  that writes events or listings outside the app (scripts, console) must set
  them too, or the doc is invisible while the marker is set.

### 2a. Landkreis / Bezirk -> region mapping ("Zuordnung")

The register has **111 regions**: the 51 Bundesländer / Kantone (`home: true`, the
**backend structure**) and **60 cultural regions of Germany** (`home: false`, `macro` =
one of the six Großregionen) from the product owner's list. Cultural regions start
**empty**; all Landkreise first belong to their Bundesland. In Verwaltung -> "Zuordnung"
(Super-Admin only, `RegionMappingTab.jsx`) the product owner moves districts between the
regions of one country; the lists are saved in `regions/{id}.bezirke` (+ `mappingUpdatedAt`).

- **Phone flow (ticket 559):** drag and drop does not work on phones, so everything also works by tapping: tap entries (checkbox or the chips of "Noch ohne Region"), then tap the target region tile; "Aus der Region nehmen" puts the selection back to its Bundesland. Drag and drop stays for desktop.
- **Germany, Austria, Switzerland (ticket 599):** the tab has a country switcher (Deutschland is the default). Germany works as described here. Austria and Switzerland use the same flow, but no built-in cultural regions exist there, so the regions are the Bundesländer / Kantone themselves (plus any region created in this tab) and the districts are the Bezirke: pick a Bundesland / Kanton, add Bezirke from elsewhere in the country or take them out again (a Bezirk taken out returns to the Bundesland / Kanton it belongs to by origin; a region's own Bezirke have no "take out" button). No rename (the names are the register's), no "Vorschlag laden", no "Noch ohne Region". The callable already accepted AT / CH moves; nothing changed server side. The map is `src/data/bezirkMapAtCh.json` (`scripts/build-atch-bezirk-map.mjs <html>`, from the product owner's map "Österreich, Schweiz und Liechtenstein – Bundesländer, Kantone und Bezirke", not committed; guarded by `tests/components/bezirkMapAtCh.spec.ts`). The register is NOT changed to fit the map: Wien (23 Gemeindebezirke), Bern "Oberland" (2 Verwaltungskreise) and Schaffhausen (old Bezirke) are drawn as one district each. Open gaps: four map shapes have no register Bezirk (Küssnacht SZ, la Veveyse FR, Dorneck SO, Solothurn SO); they are drawn grey and cannot be clicked. Liechtenstein (11 Gemeinden) is in the map file but not in the register (no country, no region), so it is not drawn or assignable. New regions for AT / CH are created by the Super-Admin in this tab ("Neue Region anlegen", section 2c).
- **Fixed vs editable:** the districts themselves (`DISTRICT_CATALOG` in
  `src/utils/regionMapping.js`, built from the `home` regions; key `"<country>|<name>"`,
  names are unique per country) are never editable, nor is the country of a district.
  Only the assignment is. Every district belongs to exactly one region of its country
  (`checkMapping`). The legacy "Grenznahe" of Vorarlberg is not a district and never moves.
- **Empty regions do not exist for visitors:** `isPopulated(region)` (has districts).
  `RegionProvider` removes empty ones from `allRegions` (chooser, place search, routes),
  `RegionsTab` / `ModerationTab` do not list them, and `adminSetRegionActive` refuses to
  activate one (`no-districts`). The mapping tab still lists them as targets.
  An empty `bezirke` list only counts when `mappingUpdatedAt` is set (older docs seeded
  with `[]` fall back to the register); `seed-regions.mjs` never refills such a list.
- **Server:** callables `adminGetRegionMappingLocks` and `adminSaveRegionMapping`
  (`functions/src/adminRegionMapping.ts`, pure logic `functions/src/regionMapping.ts` =
  synced copy of `regionMapping.js`, guarded by `tests/lib/functionsRegionMapping.spec.ts`).
  Super-Admin only; validates district keys, country, active-region-keeps-a-district and
  writes the region docs + an `admin_audit_log` entry (`saveRegionMapping`) in one batch.
- **No event migration, by design:** events keep their `regionId` and `bezirk`. A district
  that still has events (counted per region that holds it) is **locked** and cannot leave
  its region (`events-in-district`); moving INTO a region is always allowed. So the mapping
  is meant to be arranged BEFORE a region gets events. Directory profiles (`directoryRegionIds`
  / `directoryRegions`) are not checked; there are none outside Vorarlberg before launch.
- **Prefill, drag and drop, rename:** "Vorschlag laden" stages the prepared assignment
  `src/data/regionSuggestion.js` (region slug -> Landkreis names, generated from the product
  owner's map, see below, guarded by `regionSuggestion.spec.ts`) as a normal draft, locked districts skipped; rows and the
  "Noch ohne Region" chips (districts still in their Bundesland) can be dragged onto a region
  in the "Regionen" panel. "Region umbenennen" writes only `regions/{id}.name` (client `setDoc`
  merge, allowed by `isValidRegion`); slug and wording tables stay.
- **Adding a region (Super-Admin, no developer step):** Verwaltung -> "Zuordnung" ->
  "Neue Region anlegen" creates a region in the country that is selected above (AT, DE, CH):
  name plus an optional phrase for texts ("im Allgäu"). It is a **custom region**, see
  section 2c. Built-in regions (the 51 Bundesländer / Kantone and the 60 cultural regions of
  Germany) stay generated from `scripts/build-region-data.mjs`.
- **Map and search of the cultural regions:** the top of the "Zuordnung" tab has a map of all
  400 Landkreise / kreisfreie Städte (`CultureRegionPicker.jsx`, shapes in
  `src/data/landkreisMap.json`, keyed by `DISTRICT_CATALOG` key, loaded on demand) and a search
  with autocomplete (region names and the districts they hold now,
  `src/utils/cultureRegionSearch.js`). Every Landkreis is coloured by the cultural region that
  holds it **with the draft applied** (moving one recolours it), unsaved moves are marked
  orange, the picked region gets a wide border, Landkreise in no cultural region (Bundesland
  fallback, e.g. Berlin, Hamburg, Bremen) are grey. Picking a region (search, or a click on one
  of its Landkreise while none is picked) opens a panel with its name (rename), its districts
  (take out) and an input to add a district; a click on a Landkreis with a region picked adds it
  to that region. Add and remove only stage the move in the normal draft; saving, locks and
  checks are unchanged (a locked Landkreis cannot be clicked out of its region).
- **Map data source:** `scripts/build-landkreis-map.mjs <html>` reads the product owner's map
  "Neu Kulturregionen Deutschlands mit Landkreisen und Städten" (not committed) as text, matches
  its names to the catalog (rules + `ALIASES`; Osterode am Harz is drawn as part of Göttingen,
  Eisenach as part of the Wartburgkreis; geometry about 2015), writes `landkreisMap.json`
  (paths re-encoded relative, lossless) and regenerates `src/data/regionSuggestion.js` from the
  map's assignment (the map is the current source for "Vorschlag laden"). Guarded by
  `tests/components/landkreisMap.spec.ts`. Coordinates are SVG units of the 539.7 x 720.8
  viewBox, not lat/lon.

### 2c. Regions created in the Verwaltung (custom regions)

A Super-Admin creates a region in "Zuordnung" -> "Neue Region anlegen" (Germany, Austria,
Switzerland). Nothing in the code has to change for that; everything below makes it work
like a built-in region.

- **Callable** `adminCreateRegion({ name, country, inPhrase? })` (`functions/src/adminCreateRegion.ts`,
  Super-Admin only). The slug is derived from the name (`slugifyRegionName`: umlauts
  transliterated, `Allgäu` -> `allgaeu`). It is refused (`slug-reserved`) when it is a region
  id, the retired `allgaeu`, a combined view, an app route (`RESERVED_ROUTES`, synced with
  `username.js`, guarded by `tests/lib/adminCreateRegion.spec.ts`) or the username of an
  existing profile; `name-taken` when another region has the same name. In one batch it writes
  - `regions/{slug}`: `custom: true`, `country`, `inPhrase`, `forPhrase` (= name), `demonym`
    (empty: the header reads "Dein Kalender"), `subdivisionLabel` (Landkreis in DE, else
    Bezirk), `timezone`, `active: false`, `bezirke: []` + `mappingUpdatedAt`, `order` (behind
    every region of its country, fractional);
  - `app_settings/customRegions` `{ ids }` (see rules below);
  - an `admin_audit_log` entry `createRegion`.
- **Lifecycle is the normal one:** the region starts empty and inactive, so visitors do not
  see it (`isPopulated`); districts are assigned in the same tab (all moves work for AT / CH
  / DE regions, a district taken out returns to the Bundesland / Kanton it belongs to by
  origin); activation, moderators ("Moderation"), "Über uns", coming-soon page, place
  search, event forms, emails, ICS, prerender work as for any region. Renaming is allowed
  (name only, the slug stays). There is no delete and no slug change (an id is stored on
  events and profiles).
- **Client register:** `mergeRegions` appends valid custom docs (`customRegionFromDoc`:
  `custom === true`, slug pattern, not a static id, name, country AT/DE/CH) and
  `registerCustomRegions` adds their slugs IN PLACE to `REGION_SLUGS` (`STATIC_REGION_SLUGS`
  is the generated, fixed part). So `isRegionSlug`, `isReservedUsername`, the moderator
  region lists and the region queries need no extra code. The slugs only exist after the
  region config loaded: `RegionRoutes` waits for it (`UnknownSlugOrWait`) before it shows a
  profile or a 404 for an unknown first path segment. The map colours a custom region by a
  hue derived from its slug.
- **Functions:** `REGION_IDS` / `isRegionId` in `functions/src/regions.ts` are extended in
  place by `registerCustomRegionDocs`. `customRegions.ts` (`ensureCustomRegions`, cached 30 s)
  loads them; it is called by `readRoleDoc` (every role check, so moderators of a created region
  keep their rights) and by the callables / triggers that validate region ids without a role
  check (members, moderator application, Mollie webhook, analytics report, event mails).
  `mergeFeedRegions` (public events, ICS feed) registers and appends them; the mapping
  callables read them through `buildMappingRegisters`. **Any new server code that validates
  a region id must make sure the custom regions are loaded first.**
- **Rules:** `regionIds()` stays the static list. `isValidRegionId` and the `hasOnly` checks on
  `directoryRegionIds` / moderator lists additionally accept ids in
  `app_settings/customRegions.ids` (`customRegionIds()`, only looked up for ids that are not
  static; only the Admin SDK writes the doc, clients cannot). `regions/{id}` allows the extra
  keys (`custom`, `country`, `inPhrase`, `forPhrase`, `demonym`, `subdivisionLabel`), validated
  on Super-Admin writes only to stay inside the 1000-expression budget of the moderator path.
  Lists are joined with `.concat()` (`+` does not work on lists). Tests:
  `tests/rules/regions.rules.spec.ts` (own emulator project id, the other spec files wipe
  `demo-rules`).
- **Prerender:** `sanitizeRegionDoc` keeps the custom keys, `mergeRegions` registers the region,
  active custom regions get `/<slug>` and `/<slug>/verzeichnis` like the others.
- **Not covered:** the per-region Instagram backend (still wired by hand,
  `docs/instagram-regions.md`), `scripts/seed-regions.mjs` (only the generated register; custom
  docs are never touched), the German "Großregion" (`macro`) of the map page, a polygon on the
  AT/CH/DE maps (the districts of a custom region are coloured on the existing district map).

### 2b. Online events need a regional directory listing (Trello lVFp6Dvw)

- **Rule (only with two or more active regions):** an online event of a non-staff organiser
  (`createdBy`) shows in region R only if the organiser's `users/{uid}/publicProfile/data` is
  listed (`listedInDirectory`, not `directoryHidden`), has R in `directoryRegionIds` (missing =
  Vorarlberg) and names at least one Bezirk / Landkreis of R (current Zuordnung) in
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
  active regions) and on `regions/{id}` changes of `active` / `bezirke`
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
sends them in a combined view). Events of the ACTIVE regions of that country (all
for `alle-tribes`), online events by their own region; no availability check (a
view without active region is a valid empty feed); `bezirk=` is checked against
the Bezirke of all regions in scope; name "Events Deutschland – thetribe.at"
(`Alle Tribes`, `Österreich`, `Schweiz` alike), default time zone. Favourites use
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
  default; Bezirke Innsbruck, Kufstein, Imst, Lienz) and `regions/wien`
  (inactive, for visibility tests). `tests/globalSetup.ts` reconciles them on
  every Playwright run with `set(..., { merge: true })` in one batch.
- **Destructive-project rule:** two active regions show the required region
  dialog on every page, so Tirol is active only while
  `region-calendar-filtering.spec.ts` runs in the `destructive` Playwright
  project. Any spec that activates a second region must be added to
  `DESTRUCTIVE_SPECS` in `playwright.config.ts` and deactivate it again.
- **Events** are _not_ loaded by globalSetup, so no existing count/order
  assertion sees them (all titles start with `[Region-Test]`): Yoga Innsbruck,
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
- **Sync test:** `tests/lib/functionsRegions.spec.ts` keeps
  `functions/src/regions.ts` (slugs, countries, `DIRECTORY_REGIONS`) in step with
  `src/utils/regions.js` / `src/utils/directory.js`. Rules matrix:
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
- **Location near borders:** "Meinen Standort verwenden" resolves AT / CH to the
  Bundesland / Kanton (no Bezirk shapes, not needed since the Bezirke are fixed inside
  them); next to the German border the German projection (2-3 km) is the limit, see the
  accuracy note in the chooser section.
- **District data** is only as good as the lists in `scripts/data/`: German Landkreise are
  from 2018 (re-check before going live in Germany), Swiss cantons with one entry list
  the canton itself as its only "Bezirk".

## 13. How to add a new region

**Preferred: as Super-Admin in Verwaltung -> "Zuordnung" -> "Neue Region anlegen"** (section 2c);
this replaces steps 1-2 below, steps 3-9 apply unchanged. The developer steps below are only for
a region that should ship with the generated register. A region outside AT/DE/CH needs the
generator table (`scripts/build-region-data.mjs`) and a `COMBINED_VIEWS` entry first.

1. **Register entry** (`src/utils/regions.js`, only if the slug is new): add the
   slug to `REGION_SLUGS` (this also reserves the URL via `username.js`), and fill
   `REGION_NAMES`, `REGION_IN_PHRASES` ("in der …" when the name takes an
   article), `REGION_FOR_PHRASES` ("die …" accusative), `REGION_DEMONYMS` (the
   complete adjective token), `REGION_COUNTRIES` (when not `AT`),
   `REGION_BEZIRKE` and `REGION_SUBDIVISION_LABELS` (if different),
   `REGION_TIMEZONES`. A new country also needs a `COMBINED_VIEWS` entry. Mirror
   slugs/country/districts in `functions/src/regions.ts` and in `firestore.rules`
   (region id list); `tests/lib/functionsRegions.spec.ts` and
   `tests/components/regions.spec.ts` catch drift. Adding a slug also requires
   running `check-reserved-usernames.mjs` read-only against production.
2. **Seed script:** `node scripts/seed-regions.mjs --prod` (idempotent; creates
   the doc inactive, keeps admin edits). Test it on staging first.
3. **Moderator:** appoint a Regions-Moderator:in (admin tab "Moderation" or
   `promote-admin.mjs --role RegionModerator --regions <slug>`).
4. **Contact email:** set `regions/{id}.contactEmail` (Regionen/Console); used for
   owner mails and, once re-enabled, submission mails.
5. **Content:** at least 15 upcoming approved, non-online events in the region
   (the activation condition). Check the Bezirke list with the moderator.
6. **Activation:** Verwaltung -> Regionen -> "Freischalten" (section 4). Consider
   that this turns on the chooser/switcher and region names for everyone.
7. **GA dimension:** already exists once `region` is registered (section 10);
   nothing to do per region.
8. **SEO check:** after the next build, check `dist/<slug>/index.html` (title,
   canonical, JSON-LD), the sitemap entries and that the page is indexable; check
   `/<slug>/verzeichnis`.
9. **Legal texts:** confirm Impressum / Datenschutz / AGB / footer wording with the
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
`app_settings/districtColors`. A district added later (new region, Zuordnung) gets an automatic
warm tone from a fixed palette without any setup. Details: `docs/design-tokens.md`, "Bezirksfarben".
