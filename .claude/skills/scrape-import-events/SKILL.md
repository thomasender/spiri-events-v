---
name: scrape-import-events
description: Find events of organizers in a region (Zürich, Tirol, Berlin, ...) on their own websites, check them against the live pages and import them as candidates into the Import tab (Verwaltung -> Regionen -> Import) of thetribe.at. Done manually together with Thomas every few days. Use when asked to "scrape events", "neue Events für <Region> importieren", "Import-Lauf", "Scraping", or similar.
---

# Scrape and import events (manual run with Thomas)

Goal: fill the Import tab with **candidates** (facts + link + verbatim date quote) for the inactive
regions. Nothing becomes public: a candidate only turns into a (pending) event when Thomas accepts it,
and an event only goes live after the organizer consented (preview link, outreach mail). Read
`docs/event-import.md` once ("Ingest", "Consent states", "Outreach mail"); this skill is the routine
around it. There is no crawler in the product (Trello ticket 12, later), so **you** do the reading.

Talk to Thomas in German. Peter is not involved (no Trello comments to him from this skill).

## Rules (legal baseline from Trello ticket 0, Thomas' decisions)

- **Sources, in this order:** (1) the organizer's own website or feed with structured data (iCal, schema.org
  JSON-LD, WordPress "The Events Calendar" `?ical=1`, Bookwhen), (2) the organizer's event pages read as text,
  (3) regional directories and tourism calendars **only as a lead list** (to find organizers, not as event
  source), (4) Eventfrog / Meetup only through their official APIs (not available: skip).
- **Never:** Eversports (its terms forbid it), Facebook, Instagram, Eventbrite search, anything behind a login,
  anything robots.txt forbids, any circumvention. **Stop at the first 403 or 429 of a host**, do not retry.
- Facts: title, date, time, place, price (with its note), link, the source page and the verbatim date quote. The
  **description is taken over as the organizer wrote it** (Thomas' decision, 2026-11-24): copy the event's own
  description paragraph from the page word for word, shortened at a sentence end if it is very long. **No own
  wording, no summaries, no translations**, whatever the language. Publication only ever happens after the
  organizer consented in the preview, which shows the description and names it in the consent text. No personal
  names of private persons, **no images** (leave `imageUrl` empty; it is only allowed if it is a URL on the
  organizer's own domain, and we never copy it).
- Organizer record: name, website, `legalForm` (`company` | `verein` | `individual` | `unknown`; sole traders and
  yoga teachers working alone are `individual`, they are excluded from the pilot), and **only a functional
  contact address** (info@, kontakt@, hello@ from the Impressum or contact page). No personal addresses. No
  address found: leave `contactEmail` empty (no mail can go there, the candidate is still fine).
- One request per 6 s per host, robots.txt first, generic User-Agent `TribeEventBot/1.0`: all of this is built into
  `scripts/import-scrape/fetch.mjs`. **Fetch pages only with it** (not with curl or WebFetch): WebFetch returns a
  summary, so quotes and iCal/JSON-LD cannot be checked.
- **Do not put any e-mail address into the User-Agent or into a request yourself.** The tool sends a contact
  address only if the person running it sets the environment variable `SCRAPE_CONTACT`. Ask Thomas first if you
  think a site needs one; he sets it himself.
- Do not commit discovery files (they hold contact addresses of organizers). Keep them in the scratchpad.

## Constants

- Regions (ids in the file's `"region"`): `zuerich` (CH, prices in CHF), `tirol` (AT), `berlin` (DE), any other id
  from `scripts/data/regions/*.csv`. Currency: `CHF` for CH, `EUR` otherwise.
- Production project `spirieventsvbg` (needs `--allow-prod`), staging `tribe-vbg-staging`. Imports for the real
  run go to **production** (candidates are visible to Super-Admins only); use staging for tests.
- Thomas' Super-Admin login for the Import tab is a Bitwarden item, see the memory note
  `thomas-super-admin-account`.

## Routine

1. **Scope.** Ask Thomas which regions (default: all three) and whether it is a fresh search or a re-check.
   The ingest is idempotent: the same event twice does not create a second candidate, and the dry run with
   `--remote` (step 6) says how many are duplicates of what already exists.
2. **Leads.** For each region search by niche + city (Breathwork, Kirtan, Sound, Zen, Meditation, Yoga, Kakao,
   Tanz, Achtsamkeit, Retreat, Frauenkreis ...), open the organizer's own site, look for an events page, an iCal
   feed (`?ical=1`, `/events.ics`, `/feed/ical`) or JSON-LD. Skip organizers that only publish on Eversports,
   Facebook or Instagram. Aim for organizers with several upcoming events.
3. **Read** (always through the tool):
   ```
   node scripts/import-scrape/fetch.mjs <url> --structured   # iCal + schema.org events, try this first
   node scripts/import-scrape/fetch.mjs <url>                # visible text, first 6000 chars (--full for all)
   ```
   Exit code 3 = blocked by robots.txt, 4 = forbidden / rate limited: note the host and leave it alone.
4. **Write the discovery file** `<scratchpad>/discovery/<region>.json` (format of the ingest script):
   ```json
   {
     "region": "zuerich",
     "organizers": [
       {
         "key": "yoga-haus-dubs",
         "name": "...",
         "website": "https://...",
         "legalForm": "company",
         "contactEmail": "info@...",
         "sourceUrls": ["https://.../events"]
       }
     ],
     "candidates": [
       {
         "organizerKey": "yoga-haus-dubs",
         "title": "...",
         "date": "2026-12-18",
         "time": "19:00",
         "endTime": "17:00",
         "endDate": "",
         "place": "Yoga Haus Dubs, Malzstrasse 19a",
         "city": "Zürich",
         "contribution": "fee",
         "fee": 90,
         "currency": "CHF",
         "description": "the organizer's own description, verbatim from the page",
         "link": "https://... (the event page)",
         "categoryGuess": "Breathwork",
         "sourceUrl": "https://... (the page you read)",
         "sourceType": "ical|jsonld|llm",
         "dateQuote": "Friday, December 18 | 19:00 – 21:30",
         "confidence": 0.8
       }
     ]
   }
   ```
   - `dateQuote` is the **verbatim** text of the date/time from the page (at least a dozen characters). It is
     checked against the live page in step 5 and shown to Thomas in the Import tab.
   - Future events only (the script drops past dates). If the page shows no year, derive it from the weekday
     (18. Dezember is a Friday in 2026) and lower `confidence`.
   - `contribution`: `free`, `donation` (only when the page says so: "Spende", "Dana", "auf Spendenbasis", "freiwilliger
     Beitrag"), `fee` (+ `fee`, `currency`; reduced prices and notes in the event's price note) or `unknown`. Never
     guess: an unknown price becomes **"Keine Angabe"** in the event (a price option that exists only for imported
     events), not "free" and not "donation". Look for the price on the organizer's linked pages first (course pages,
     price lists). A price that is stated for one date does not automatically hold for the other dates.
     `sourceType`: `ical` or `jsonld` when read from structured data, else `llm`.
   - `categoryGuess`: the closest of our categories; the reviewer corrects it.
   - Follow the links on the page that matter (course pages, "Kurstermine", price lists): they often carry the price,
     the end time (`endTime`), a multi-day span (`endDate`) and more dates.
   - A restriction that decides who may come (prior course needed, sold out) belongs in the description.
5. **Verify** against the live pages (drops what is not on the page, keeps unreadable ones for a manual look):
   ```
   node scripts/import-scrape/verify.mjs <region>.json --out <region>.verified.json --keep-unreachable
   ```
   Look at every `NOT ON PAGE` and `UNREACHABLE` line, fix or drop. Never import a candidate whose quote you
   could not find.
6. **Dry run**, then show Thomas the numbers per region (new organizers, candidates accepted, duplicates,
   individuals, dropped past dates):
   ```
   node scripts/import-curated-events.mjs --file <region>.verified.json --dry-run --remote --project spirieventsvbg --allow-prod
   ```
7. **Apply** only after Thomas says go (same command with `--apply` instead of `--dry-run --remote`). Then
   tell him where to look: Verwaltung -> Regionen -> Import -> Kandidaten (filter: region).
8. **Hand over.** Thomas accepts / rejects candidates in the Import tab. Sending the outreach mail is a separate
   step with its own switch and daily limit (Veranstalter tab); never send mails from this skill.

## Wrap-up for Thomas

Short German summary: per region the number of organizers and candidates found, verified, imported, what was
skipped and why (Eversports, robots.txt, 403, no functional address, individuals), and which sources were
especially good (feeds) so the next run can start there. Mention hosts that blocked us.

## Known limits

- The bot has no public info page yet (ticket 12 builds `/bot`).
- Duplicates across runs are caught by the fingerprint (source URL + date + title) and the fuzzy dedupe; a changed
  title or date on the page appears as a new candidate: reject the old one.
- Sync of changes / cancellations is ticket 8; until then a re-check only adds new candidates.
