# Design tokens and the Design-Modus

> Read this when you write CSS (spacing, font sizes, radii), or touch the Design-Modus,
> `src/utils/layoutTokens.js`, `app_settings/layout` or `layout_history`.

Spacing, font sizes, radii and line heights are CSS custom properties. Admins
(Jana, Peter) change them **on the live page** in the **Design-Modus**; colours
stay in `/admin/theme-editor`. Developers use the tokens instead of raw values.

## For designers (short version)

1. Log in as Admin. Bottom left: **Design-Modus**.
2. Hover any element: green = inner spacing, orange = outer spacing. Chips show the
   token name and value.
3. Click a chip, move the slider. The page changes **for you only**.
4. **Alle Regler** lists every token (search, scales). **Verwerfen** drops the draft.
5. **Veröffentlichen** shows what changes, takes a short note and goes live for
   everybody. **Verlauf** lists every publish; "Als Entwurf laden" restores an old
   state (you still have to publish it).

The draft lives in the browser's localStorage and is only painted while the
Design-Modus is on, so it never reaches visitors.

## Where things live

| What                                                          | File                                        |
| ------------------------------------------------------------- | ------------------------------------------- |
| Scales (`--space-*`, `--text-*`) and semantic layout defaults | `src/styles/tokens.css`                     |
| Brand colours, radius, shadows, `--fs-*`                      | `src/index.css` (`:root`)                   |
| Catalogue: label, group, bounds, default, validation          | `src/utils/layoutTokens.js`                 |
| Draft + published state, painting `:root`                     | `src/lib/layoutStore.js`                    |
| Firestore sync, publish, history                              | `src/hooks/useLayoutSettings.js`            |
| Stylesheet reader (which token controls which side)           | `src/utils/designInspector.js`              |
| Overlay geometry (bands, chips)                               | `src/utils/designOverlayModel.js`           |
| UI                                                            | `src/components/design/` (lazy, admin-only) |

`tests/components/layoutTokens.spec.ts` fails if a catalogue default differs from
the stylesheet, so "Standard" can never drift from the CSS.

## Data and security

- `app_settings/layout` — the live overrides (flat `--token: value`, only values that
  differ from the default). Public read, admin write, ≤ 200 keys, `updatedBy == uid`.
- `layout_history/{id}` — one append-only entry per publish (values, changes, note,
  author), written in the same batch. Admin read/create only; never edited or deleted.
- The rules do **not** whitelist token names (unlike the colour theme). The client
  drops unknown or out-of-range values (`sanitizeLayoutOverrides`), so a bad write
  cannot break the site. Rules tests: `tests/rules/instagram.rules.spec.ts`.
- Returning visitors get the last published values from localStorage before React
  renders (`initLayoutFromCache` in `main.jsx`), so there is no layout jump.

## Scales

- **Spacing** — 4px base. Name = px / 4, `-` for the decimal point:
  `--space-1` = 4px, `--space-1-5` = 6px, `--space-4` = 16px, `--space-6` = 24px.
- **Font size** — name = percent of 16px: `--text-85` = 0.85rem, `--text-100` = 1rem.
  Several steps are near-duplicates left over from the old CSS (80/81/85/88/90/95).
  They stay separate so the migration changed no pixel; merge two by giving them the
  same value in the Design-Modus.
- **Semantic tokens** (`--card-padding`, `--grid-gap`, `--btn-padding-x` …) have
  literal defaults, not `var(--space-*)`, so editing a scale step never moves them.

## Writing new CSS

Use a token for `padding`, `margin`, `gap` and `font-size`. Values off the scale (3px,
5px, negative margins, `calc()`) may stay raw — ask first whether the design needs them.
Raw values are invisible to the Design-Modus.

`node scripts/tokenize-css.mjs` lists raw values and, with `--write`, rewrites exact
matches (it never snaps, so the render is unchanged). Re-run it after merging old
branches that still use raw values.

## Adding a semantic token

1. Add the entry to `SEMANTIC` in `layoutTokens.js` (label, bounds, default, description).
2. Declare the same default in `tokens.css` (or `index.css` if it lives there).
3. Use `var(--your-token)` in the CSS. Done: it shows up as a chip and in "Alle Regler".

## Known limits

- Breakpoints stay hard-coded: CSS variables do not work inside `@media`.
- The prerendered HTML does not contain published layout values (colours are baked in,
  layout is not). First-time visitors get the defaults until Firestore answers; returning
  visitors are fine thanks to the localStorage cache.
- The overlay reads the page's stylesheets, so it only sees what is written with tokens.
- Design-Modus is not offered on mobile (viewport <= 800px): too buggy there for now.
- Presence: while in the Design-Modus each admin writes a heartbeat doc `design_sessions/{uid}` (30 s, stale after 90 s, removed on exit). Other admins in the mode see a warning with the names, so they can agree before publishing. It only warns; it does not lock anything.
- No mobile preview frame: narrow the browser window to see mobile rules (the overlay
  recompiles on resize).
