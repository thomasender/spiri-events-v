# Plan: Weekly carousel and daily stories for Bodensee

**Type:** Feature (backend, Cloud Functions). Settled with Thomas; no Trello ticket.

## Context

The weekly carousel (`instagramCarousel.ts`, `instagramWeeklyCarousel.ts`) and the 05:00
overview stories (`instagramStory.ts`, `instagramStories.ts`) only run for Vorarlberg: the
Bezirk list `CAROUSEL_BEZIRKE` and the secrets `IG_ACCESS_TOKEN` / `IG_USER_ID` are
hardcoded. The feed post already supports regional accounts
(`instagram_private/region_{id}`, `resolveCredentialsForRegion`). `@tribebodensee` has such an
account and should get the same carousels and stories, with exactly the same layouts.

## Decisions (settled)

- Explicit per-region config (`instagram/instagramRegionConfig.ts`): Bezirk list, wording
  (label, "in/im ..." phrases, cover phrase, hashtag) and site domain. Only `vorarlberg` and
  `bodensee` are switched on (`INSTAGRAM_SCHEDULED_REGION_IDS`).
- Vorarlberg: `CAROUSEL_BEZIRKE` incl. `Grenznahe`, legacy secrets, unchanged post ids,
  captions, images, Firestore records (no new field on Vorarlberg records).
- Bodensee: Bezirke from the register (`Landkreis Konstanz`, `Bodenseekreis`,
  `Landkreis Lindau (Bodensee)`), account from `instagram_private/region_bodensee`.
  Wording "im Landkreis Konstanz", "im Bodenseekreis", "im Landkreis Lindau".
- Eligibility also checks the region (`resolveRegionId(event) === regionId`) besides the
  Bezirk, so regions never mix.
- Post ids via the existing `regionId` param of `carouselPostId` / `storyPostId`
  (`carousel_bodensee_landkreiskonstanz_2026-11-30`). Non-Vorarlberg records also carry
  `regionId` so the admin retry picks the right account and grouping.
- Same layouts for every region. Only domain (`siteDomainForRegion`) and the Bezirk text
  differ. The images contain no region name, handle or region-specific colour (cover and
  story backgrounds are fixed brand colours, category colours are per category).
- Schedules unchanged (Sun 10:00 carousel, 05:00 stories, Europe/Vienna). Inside, the
  kill switch is checked once, then each active region runs sequentially: no usable account
  -> skipped quietly (no post docs); a crash in one region is logged and the next runs.
- Admin callables (`adminPreviewWeeklyCarousels`, `adminPostWeeklyCarousels`,
  `adminPostDailyStory`) take an optional `regionId` (default `vorarlberg`), validated
  against the active list; `bezirk` is validated against that region's Bezirke. Carousel
  retry uses the record's `regionId`.
- Token refresh untouched.

## Steps

1. `instagramRegionConfig.ts`: config, phrase helpers, `runForRegions` (pure, tested).
2. Carousel: `regionId` through eligibility, grouping, ids, cover, caption, preview, run.
3. Story: same for `groupStories`, `buildStoryModel`, `runDailyStories`.
4. Wrappers: scheduled functions iterate regions; deps built per region with
   `resolveCredentialsForRegion`; events listed once per run.
5. Admin callables + retry.
6. Vitest: extend `tests/lib/instagramCarousel.spec.ts`, `instagramStory.spec.ts`,
   `instagramAdmin.spec.ts`; new pure config spec only if it does not fit there.
7. Docs: `docs/instagram-regions.md`. Functions deploy stays manual.

## Out of scope

- Admin UI (InstagramTab) region selector: callables default to Vorarlberg, so the UI keeps
  working unchanged. A Bodensee preview needs the callable with `{ regionId: 'bodensee' }`.
- More regions: add the id to `INSTAGRAM_SCHEDULED_REGION_IDS` (and check its wording).
