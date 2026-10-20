# Instagram Canva kit

**Read this when** you change an Instagram image layout in `functions/src/instagram/instagramImage.ts`
or want to rebuild the Instagram templates in Canva.

The Instagram images (feed post, carousel slides, cover, stories) are rendered
in `functions/src/instagram/instagramImage.ts`. To rebuild those templates by
hand in Canva there is a kit that renders every template once with example
text and once as text-free layers (gradient, logo, pill, coloured bars):

```bash
npm --prefix functions run build
node scripts/instagram-canva-kit.mjs [outDir]   # default: ./tmp-canva-kit (gitignored)
```

It writes `<template>_beispiel.jpg` and `<template>_ohne-text.png` per template,
uses `public/hero.jpeg` as sample photo and reads/posts nothing. The code lives
in `functions/src/instagram/instagramCanvaKit.ts`; it is not exported from
`index.ts`, so it is not a Cloud Function and never runs in production.

When you change a layout in `instagramImage.ts` (new element, spacing, colours),
update the matching template in `instagramCanvaKit.ts` too, otherwise the Canva
templates drift from what the app posts. A new template needs an entry in
`KIT_TEMPLATES`.
