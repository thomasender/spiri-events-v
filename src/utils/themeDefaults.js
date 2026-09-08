// Default values + curated metadata for every admin-editable CSS color
// variable. Mirroring `:root` in `src/index.css` keeps the static fallback
// in sync with the live values pushed from Firestore — admins can reset any
// token to the exact same shade that ships with the bundle, even if the
// design later changes.
//
// `usedIn` is a hand-curated plain-German list of where each variable is
// referenced. It powers the info popup so admins don't have to grep the
// repo to understand the blast radius of a change. Variables flagged with
// `unused: true` are defined in `:root` but not currently consumed via
// `var(...)` anywhere in the codebase — they're kept here so the design
// system stays complete and the token can be wired up later without a
// separate admin schema migration.

export const THEME_VARIABLES = [
  // ── Surfaces ───────────────────────────────────────────────────────
  {
    name: '--bg-primary',
    label: 'Hintergrund (Hauptfläche)',
    group: 'Surfaces',
    defaultValue: '#f4f2f0',
    usedIn: [
      'Body-Hintergrund der gesamten App',
      'Footer-Hintergrund auf Profilseite und Kalender',
      'Hero-Slider-Textfarbe (Kontrast zu Waldgrün)',
    ],
  },
  {
    name: '--bg-secondary',
    label: 'Hintergrund (Karten / Sektionen)',
    group: 'Surfaces',
    defaultValue: '#eae7e2',
    usedIn: [
      'Cards, Info-Boxen und Sektionen-Background',
      'Sekundär-Button-Füllung',
      'Modal-Close-Hover und Scrollbar-Track',
    ],
  },
  {
    name: '--bg-calendar',
    label: 'Hintergrund (Kalender / Formulare)',
    group: 'Surfaces',
    defaultValue: '#ffffff',
    usedIn: [
      'Kalender-Zellen, Tages- und Wochen-Ansicht',
      'Modal-Inhalte (Event-Details, Edit-Dialog, Confirm-Dialog)',
      'Input- und Textarea-Hintergrund in Formularen',
    ],
  },

  // ── Brand / Akzente ────────────────────────────────────────────────
  {
    name: '--heading-color',
    label: 'Überschriften-Farbe',
    group: 'Brand',
    defaultValue: '#a6a487',
    usedIn: [
      'Standard-Farbe für h1–h6 in der gesamten App',
      'Leere-Status-Überschriften (z. B. im Kategorien-Tab)',
    ],
  },
  {
    name: '--accent-secondary',
    label: 'Akzent Sekundär (Waldgrün)',
    group: 'Brand',
    defaultValue: '#667c62',
    usedIn: [
      'Hero-Features-Slider auf der Kalender-Seite (Hintergrund)',
      'Sekundäre Banner und Akzentflächen',
    ],
  },
  {
    name: '--accent-primary',
    label: 'Akzent Primär (Terracotta)',
    group: 'Brand',
    defaultValue: '#c48e6a',
    usedIn: [
      'Primäre Buttons und Buttons-Hover',
      'Links und Link-Hover',
      'Input-Focus-Border und Spinner-Top',
    ],
  },
  {
    name: '--accent-primary-hover',
    label: 'Akzent Primär Hover (dunkles Terracotta)',
    group: 'Brand',
    defaultValue: '#9a5f38',
    usedIn: ['Hover-Zustand für Buttons und Links (WCAG-AA-Kontrast zu Weiß)'],
  },
  {
    name: '--accent-primary-strong',
    label: 'Akzent Primär Strong (Text auf Soft-Fills)',
    group: 'Brand',
    defaultValue: '#9a5f38',
    usedIn: [
      'Textfarbe auf weichen Terracotta-Füllungen (EventCards, EventListRows, Rich-Text-Editor-Markierungen)',
    ],
  },
  {
    name: '--accent-soft',
    label: 'Akzent Soft (Terracotta-Tönung)',
    group: 'Brand',
    defaultValue: 'rgba(196, 142, 106, 0.14)',
    usedIn: [
      'Focus-Ring um Inputs, Buttons und Editor-Felder',
      'Weiche Füllungen für ausgewählte / hervorgehobene UI-Elemente',
    ],
  },

  // ── Text ───────────────────────────────────────────────────────────
  {
    name: '--text-primary',
    label: 'Text Primär (Haupttextfarbe)',
    group: 'Text',
    defaultValue: '#161819',
    usedIn: [
      'Standard-Textfarbe der gesamten App',
      'Button-Labels und Input-Werte',
      'Modale Überschriften und Inhalte',
    ],
  },
  {
    name: '--text-secondary',
    label: 'Text Sekundär (Fliesstext)',
    group: 'Text',
    defaultValue: '#605e5e',
    usedIn: ['Labels, Hilfstexte und Beschreibungen', 'Fliesstext in Event-Details'],
  },
  {
    name: '--text-light',
    label: 'Text Hell (warmes Grau)',
    group: 'Text',
    defaultValue: '#938d87',
    usedIn: [
      'Eyebrow-Labels und kleine Überschriften',
      'Scrollbar-Thumb-Hover',
      'Modal-Close-Icon',
    ],
  },

  // ── UI Primitives ──────────────────────────────────────────────────
  {
    name: '--border',
    label: 'Border (Standardrahmen)',
    group: 'UI',
    defaultValue: '#e2dcd2',
    usedIn: [
      'Input- und Textarea-Borders',
      'Sekundär-Button-Border',
      'Scrollbar-Thumb und Kategorien-Reihen-Rahmen',
    ],
  },
  {
    name: '--error',
    label: 'Fehlerfarbe (Terracotta-Rot)',
    group: 'UI',
    defaultValue: '#bf5b4e',
    usedIn: ['Fehlertexte in Formularen', 'btn-danger und Lösch-Aktionen'],
  },
  {
    name: '--error-hover',
    label: 'Fehlerfarbe Hover',
    group: 'UI',
    defaultValue: '#a94a3e',
    usedIn: ['Hover-Zustand für btn-danger und Profil-Account-Löschen-Button'],
  },

  // ── Signals (Status-Badges) ────────────────────────────────────────
  {
    name: '--chip-bg',
    label: 'Chip Hintergrund',
    group: 'Signals',
    defaultValue: 'rgba(196, 142, 106, 0.14)',
    usedIn: ['Standard-Category-Chip-Hintergrund auf Event-Detailseite'],
  },
  {
    name: '--chip-text',
    label: 'Chip Text',
    group: 'Signals',
    defaultValue: '#9a5f38',
    usedIn: ['Standard-Category-Chip-Textfarbe auf Event-Detailseite'],
  },
  {
    name: '--free-text',
    label: 'Kostenlos-Badge Textfarbe',
    group: 'Signals',
    defaultValue: '#5c6b3f',
    usedIn: ['„Kostenlos"-Badge auf Event-Karten, Event-Detail, Event-Modal, Kalender und Profil'],
  },
  {
    name: '--fee-text',
    label: 'Kostenpflichtig-Badge Textfarbe',
    group: 'Signals',
    defaultValue: '#9a5f38',
    usedIn: ['„Kostenpflichtig"-Badge auf Event-Karten, Event-Modal und Kalender'],
  },
  {
    name: '--donation-text',
    label: 'Spende-Badge Textfarbe',
    group: 'Signals',
    defaultValue: '#6b568b',
    usedIn: ['„Freie Spende"-Badge auf Event-Karten, Event-Detail, Event-Modal und Kalender'],
  },
  {
    name: '--pending-text',
    label: 'Ausstehend-Badge Textfarbe',
    group: 'Signals',
    defaultValue: '#8a6d2f',
    usedIn: ['„Ausstehend"-Statusbadge in der Event-Liste und im StatusBadge-Component'],
  },

  // ── Signale: aktuell ungenutzte Tokens ─────────────────────────────
  // (definiert in :root, aber noch nicht via var(...) im Code verwendet —
  // vorgesehen für kommende Badge-Hintergründe und Kategorie-Slots)
  {
    name: '--free-bg',
    label: 'Kostenlos-Badge Hintergrund',
    group: 'Signals',
    defaultValue: 'rgba(122, 138, 95, 0.16)',
    usedIn: ['Aktuell nicht in Verwendung — reserviert für Badge-Hintergründe.'],
    unused: true,
  },
  {
    name: '--fee-bg',
    label: 'Kostenpflichtig-Badge Hintergrund',
    group: 'Signals',
    defaultValue: 'rgba(196, 142, 106, 0.16)',
    usedIn: ['Aktuell nicht in Verwendung — reserviert für Badge-Hintergründe.'],
    unused: true,
  },
  {
    name: '--donation-bg',
    label: 'Spende-Badge Hintergrund',
    group: 'Signals',
    defaultValue: 'rgba(140, 120, 180, 0.16)',
    usedIn: ['Aktuell nicht in Verwendung — reserviert für Badge-Hintergründe.'],
    unused: true,
  },
  {
    name: '--pending-bg',
    label: 'Ausstehend-Badge Hintergrund',
    group: 'Signals',
    defaultValue: 'rgba(198, 160, 92, 0.18)',
    usedIn: ['Aktuell nicht in Verwendung — reserviert für Badge-Hintergründe.'],
    unused: true,
  },
  {
    name: '--sound-healing',
    label: 'Soundhealing Kategorie-Akzent',
    group: 'Signals',
    defaultValue: '#6b568b',
    usedIn: ['Aktuell nicht in Verwendung — reserviert für Soundhealing-Kategorie.'],
    unused: true,
  },
  {
    name: '--category-teal',
    label: 'Kategorie-Teal (Fallback)',
    group: 'Signals',
    defaultValue: '#4a7572',
    usedIn: [
      'Aktuell nicht in Verwendung — reserviert als Fallback-Farbe für neu angelegte Kategorien.',
    ],
    unused: true,
  },
];

export const THEME_DOC_PATH = ['app_settings', 'theme'];
export const THEME_DOC_ID = 'theme';

export const THEME_GROUPS = Array.from(new Set(THEME_VARIABLES.map((v) => v.group)));

// Build a flat { name: defaultValue } map for callers that just need the
// fallbacks (e.g. the seeder, the prerender :root generator).
export const THEME_DEFAULTS = Object.fromEntries(
  THEME_VARIABLES.map((v) => [v.name, v.defaultValue])
);

// Same as THEME_VARIABLES but keyed by variable name for O(1) lookup.
export const THEME_VARIABLES_BY_NAME = Object.fromEntries(THEME_VARIABLES.map((v) => [v.name, v]));

// True for any hex `#RRGGBB` string. Alpha-channel rgba() values are not
// considered "valid colors" by the color picker — admins edit those via
// the hex textbox only.
export const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
