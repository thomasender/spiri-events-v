# Design tokens

Spacing, font sizes and colours are CSS custom properties. Designers change them
in the **Design-Modus** (admin, on the live page) or in `/admin/theme-editor`;
developers use them instead of raw values.

## Where things live

| What                                                         | File                         |
| ------------------------------------------------------------ | ---------------------------- |
| Spacing scale (`--space-*`), font-size scale (`--text-*`)    | `src/styles/tokens.css`      |
| Brand colours, radius, shadows, `--fs-hero` … `--fs-eyebrow` | `src/index.css` (`:root`)    |
| Editor metadata (label, group, default, min/max, usedIn)     | `src/utils/themeDefaults.js` |

## Scales

- **Spacing** — 4px base. Name = px / 4, `-` for the decimal point:
  `--space-1` = 4px, `--space-1-5` = 6px, `--space-4` = 16px, `--space-6` = 24px.
- **Font size** — name = percent of 16px: `--text-85` = 0.85rem, `--text-100` = 1rem.
  Several steps are near-duplicates left over from the old CSS (80/81/85/88/90/95).
  They stay separate on purpose so the migration changed no pixel; merge them by
  giving two of them the same value in the editor.

## Writing new CSS

Use a token for `padding`, `margin`, `gap` and `font-size`. Values that are not on
the scale (3px, 5px, 22px, negative margins, `calc()`) may stay raw — but ask
first whether the design really needs them.

`node scripts/tokenize-css.mjs` lists raw values that are one token away from the
scale; `--write` rewrites exact matches (it never snaps, so the render is unchanged).

## What does _not_ change

Breakpoints stay hard-coded: CSS variables do not work inside `@media`.
