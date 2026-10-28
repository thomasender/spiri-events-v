// Catalogue of every layout token a designer may change in the Design-Modus
// (spacing, font sizes, radii, line heights). Colours are a separate system:
// see `themeDefaults.js`.
//
// This file is the single source of truth for labels, bounds and validation.
// `default` must equal the value declared in `src/styles/tokens.css` /
// `src/index.css` — `tests/components/layoutTokens.spec.ts` enforces that, so
// "Auf Standard zurücksetzen" and the stylesheet can never drift apart.

export const LAYOUT_DOC_PATH = ['app_settings', 'layout'];
export const LAYOUT_HISTORY_COLLECTION = 'layout_history';

export const LAYOUT_GROUPS = [
  'Seite & Raster',
  'Karten & Listen',
  'Navigation & Buttons',
  'Dialoge & Footer',
  'Schrift',
  'Rundungen',
  'Skala: Abstände',
  'Skala: Schriftgrößen',
];

// Groups that change many places at once. The UI collapses them and warns.
export const ADVANCED_GROUPS = new Set(['Skala: Abstände', 'Skala: Schriftgrößen']);

function length(name, label, group, def, unit, min, max, step, description) {
  return {
    name,
    label,
    group,
    type: 'length',
    unit,
    default: `${def}${unit}`,
    min,
    max,
    step,
    description,
  };
}

const px = (name, label, group, def, min, max, description) =>
  length(name, label, group, def, 'px', min, max, 1, description);
const rem = (name, label, group, def, min, max, description) =>
  length(name, label, group, def, 'rem', min, max, 0.025, description);

function fluid(name, label, group, def, lo, hi, description) {
  return {
    name,
    label,
    group,
    type: 'fluid',
    unit: 'rem',
    default: def,
    min: lo,
    max: hi,
    description,
  };
}

function number(name, label, group, def, min, max, step, description) {
  return {
    name,
    label,
    group,
    type: 'number',
    unit: '',
    default: String(def),
    min,
    max,
    step,
    description,
  };
}

const G_PAGE = 'Seite & Raster';
const G_CARD = 'Karten & Listen';
const G_NAV = 'Navigation & Buttons';
const G_DLG = 'Dialoge & Footer';
const G_TYPE = 'Schrift';
const G_RAD = 'Rundungen';

// px scale — must match tokens.css.
const SPACE_SCALE = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 64];
const spaceName = (v) => `--space-${String(v / 4).replace('.', '-')}`;

// rem scale — must match tokens.css. Name = percent of the 16px base.
const TEXT_SCALE = [
  0.7, 0.75, 0.8, 0.8125, 0.85, 0.875, 0.9, 0.92, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35,
  1.4, 1.5, 1.6, 1.75, 1.8, 2, 2.5,
];
const textName = (v) => `--text-${Math.round(v * 100)}`;

const SEMANTIC = [
  // ── Seite & Raster ─────────────────────────────────────────────
  px(
    '--page-max-width',
    'Maximale Seitenbreite',
    G_PAGE,
    1200,
    800,
    1600,
    'Wie breit der Inhalt auf großen Bildschirmen höchstens wird (Header, Footer, Kalender).'
  ),
  px(
    '--page-gutter',
    'Seitenrand links/rechts',
    G_PAGE,
    24,
    8,
    64,
    'Abstand zwischen Bildschirmrand und Inhalt in Header, Footer und Inhaltsseiten.'
  ),
  px(
    '--layout-column-gap',
    'Abstand Hauptspalte ↔ Seitenleiste',
    G_PAGE,
    32,
    8,
    80,
    'Lücke zwischen Eventliste und der Seitenleiste mit Filter und Kalender.'
  ),
  px(
    '--page-bottom-space',
    'Platz unter dem Kalender-Inhalt',
    G_PAGE,
    48,
    0,
    160,
    'Leerraum zwischen Kalender-Inhalt und Footer.'
  ),
  px(
    '--sidebar-gap',
    'Abstand in der Seitenleiste',
    G_PAGE,
    16,
    0,
    48,
    'Lücke zwischen den Blöcken der Seitenleiste.'
  ),
  px(
    '--filter-panel-padding',
    'Innenabstand Filter-Block',
    G_PAGE,
    20,
    8,
    48,
    'Innenabstand im Filter-Kasten.'
  ),

  // ── Karten & Listen ────────────────────────────────────────────
  px(
    '--grid-gap',
    'Abstand zwischen Event-Karten',
    G_CARD,
    20,
    4,
    64,
    'Lücke zwischen den Karten im Kartenraster.'
  ),
  px(
    '--card-padding',
    'Innenabstand Event-Karte',
    G_CARD,
    16,
    8,
    40,
    'Abstand zwischen Kartenrand und Text.'
  ),
  px(
    '--card-gap',
    'Abstand der Zeilen in der Karte',
    G_CARD,
    6,
    0,
    24,
    'Lücke zwischen Datum, Titel und Ort in der Karte.'
  ),
  px(
    '--card-image-height',
    'Höhe Kartenbild',
    G_CARD,
    160,
    100,
    320,
    'Höhe des Bildes oben auf der Event-Karte.'
  ),
  px(
    '--row-padding',
    'Innenabstand Listenzeile',
    G_CARD,
    16,
    4,
    40,
    'Innenabstand einer Eventzeile in der Listenansicht.'
  ),
  px(
    '--row-gap',
    'Abstand in der Listenzeile',
    G_CARD,
    16,
    4,
    40,
    'Lücke zwischen Datum, Bild und Text in der Listenzeile.'
  ),

  // ── Navigation & Buttons ───────────────────────────────────────
  px(
    '--nav-link-padding-y',
    'Menü-Link: Innenabstand oben/unten',
    G_NAV,
    10,
    2,
    24,
    'Vertikaler Innenabstand der Links in der Kopfzeile.'
  ),
  px(
    '--nav-link-padding-x',
    'Menü-Link: Innenabstand links/rechts',
    G_NAV,
    16,
    4,
    40,
    'Horizontaler Innenabstand der Links in der Kopfzeile.'
  ),
  px(
    '--btn-padding-y',
    'Button: Innenabstand oben/unten',
    G_NAV,
    12,
    4,
    28,
    'Höhe der Standard-Buttons.'
  ),
  px(
    '--btn-padding-x',
    'Button: Innenabstand links/rechts',
    G_NAV,
    24,
    8,
    56,
    'Breite der Standard-Buttons.'
  ),
  px(
    '--btn-gap',
    'Button: Abstand Icon ↔ Text',
    G_NAV,
    8,
    0,
    20,
    'Lücke zwischen Icon und Beschriftung im Button.'
  ),

  // ── Dialoge & Footer ───────────────────────────────────────────
  px(
    '--modal-padding-x',
    'Dialog: Innenabstand links/rechts',
    G_DLG,
    32,
    12,
    64,
    'Seitlicher Innenabstand in Event-Dialogen.'
  ),
  px(
    '--footer-padding-y',
    'Footer: Innenabstand oben/unten',
    G_DLG,
    24,
    8,
    80,
    'Höhe des Footers.'
  ),

  // ── Schrift ────────────────────────────────────────────────────
  fluid(
    '--fs-hero',
    'Hero-Überschrift (H1)',
    G_TYPE,
    'clamp(2.5rem, 5vw + 1rem, 4.75rem)',
    1.5,
    7,
    'Größte Überschrift (z. B. „Über uns“). Min = Handy, Max = großer Bildschirm.'
  ),
  fluid(
    '--fs-hero-title',
    'Titel im Kalender-Kopfbereich',
    G_TYPE,
    'clamp(1.75rem, 1.8vw + 1.1rem, 3.5rem)',
    1.2,
    5,
    'Überschrift ganz oben auf der Startseite.'
  ),
  fluid(
    '--fs-section',
    'Abschnitts-Überschrift (H2)',
    G_TYPE,
    'clamp(1.75rem, 2.5vw + 1rem, 3rem)',
    1.2,
    4.5,
    'Überschriften der Abschnitte und Unterseiten.'
  ),
  fluid(
    '--fs-event-title',
    'Event-Titel (H3)',
    G_TYPE,
    'clamp(1.35rem, 1.5vw + 1rem, 2rem)',
    1,
    3,
    'Titel von Events in Detailansichten.'
  ),
  rem(
    '--fs-intro',
    'Einleitungstext',
    G_TYPE,
    1.25,
    0.9,
    2,
    'Größe von Einleitungs- und Untertiteln.'
  ),
  rem('--fs-nav', 'Navigation & Suchfeld', G_TYPE, 1.125, 0.8, 1.6, 'Schriftgröße der Navigation.'),
  rem('--fs-body', 'Fließtext & Buttons', G_TYPE, 1, 0.8, 1.4, 'Grundschriftgröße der Seite.'),
  rem('--fs-eventinfo', 'Eventinfos', G_TYPE, 1, 0.8, 1.4, 'Datum, Ort und Preis in Event-Infos.'),
  rem(
    '--fs-badge',
    'Kategorien & Badges',
    G_TYPE,
    0.8125,
    0.6,
    1.2,
    'Kategorie- und Status-Labels.'
  ),
  rem(
    '--fs-eyebrow',
    'Kleine Überschriften (Eyebrow)',
    G_TYPE,
    0.75,
    0.6,
    1.2,
    'Kleine Großbuchstaben-Zeilen über Überschriften.'
  ),
  number(
    '--lh-body',
    'Zeilenhöhe Fließtext',
    G_TYPE,
    1.6,
    1.2,
    2,
    0.05,
    'Abstand zwischen den Textzeilen (1.6 = 160 % der Schriftgröße).'
  ),
  number(
    '--lh-heading',
    'Zeilenhöhe Überschriften',
    G_TYPE,
    1.3,
    1,
    1.8,
    0.05,
    'Zeilenabstand mehrzeiliger Überschriften.'
  ),

  // ── Rundungen ──────────────────────────────────────────────────
  px('--radius-sm', 'Rundung klein', G_RAD, 8, 0, 32, 'Buttons, Eingabefelder, kleine Elemente.'),
  px('--radius-md', 'Rundung mittel', G_RAD, 12, 0, 40, 'Karten, Panels, Dialoge.'),
  px('--radius-lg', 'Rundung groß', G_RAD, 20, 0, 48, 'Große Flächen wie der Kopfbereich.'),
];

const SPACE_TOKENS = SPACE_SCALE.map((v) => ({
  ...px(
    spaceName(v),
    `Abstand ${v} px`,
    'Skala: Abstände',
    v,
    0,
    128,
    'Skalenwert: gilt überall dort, wo diese Stufe direkt verwendet wird.'
  ),
}));

const TEXT_TOKENS = TEXT_SCALE.map((v) => ({
  ...rem(
    textName(v),
    `Schriftgröße ${Math.round(v * 16 * 100) / 100} px`,
    'Skala: Schriftgrößen',
    v,
    0.5,
    4,
    'Skalenwert: gilt überall dort, wo diese Stufe direkt verwendet wird. Zwei Stufen auf denselben Wert setzen = zusammenlegen.'
  ),
}));

export const LAYOUT_TOKENS = [...SEMANTIC, ...SPACE_TOKENS, ...TEXT_TOKENS];
export const LAYOUT_TOKENS_BY_NAME = Object.fromEntries(LAYOUT_TOKENS.map((t) => [t.name, t]));
export const LAYOUT_DEFAULTS = Object.fromEntries(LAYOUT_TOKENS.map((t) => [t.name, t.default]));

// ── fluid helpers ────────────────────────────────────────────────────
// `clamp(Arem, Bvw + Crem, Drem)` — designers edit A (min) and D (max); the
// fluid middle part stays as shipped.
const FLUID =
  /^clamp\(\s*(\d+(?:\.\d+)?)rem\s*,\s*(\d+(?:\.\d+)?)vw\s*\+\s*(\d+(?:\.\d+)?)rem\s*,\s*(\d+(?:\.\d+)?)rem\s*\)$/;

export function parseFluid(value) {
  const m = FLUID.exec(String(value).trim());
  if (!m) return null;
  return { min: Number(m[1]), vw: Number(m[2]), base: Number(m[3]), max: Number(m[4]) };
}

export function formatFluid({ min, vw, base, max }) {
  return `clamp(${min}rem, ${vw}vw + ${base}rem, ${max}rem)`;
}

const round = (n) => Math.round(n * 10000) / 10000;

/**
 * Validates `raw` for `token` and returns the normalised string.
 * Throws an Error with a German message on invalid input.
 */
export function validateLayoutValue(token, raw) {
  if (!token) throw new Error('Unbekannter Regler.');
  const text = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
  if (!text) throw new Error('Bitte einen Wert eingeben.');

  if (token.type === 'length') {
    const m = /^(-?\d+(?:\.\d+)?)(px|rem)$/.exec(text);
    if (!m || m[2] !== token.unit) throw new Error(`Bitte eine Zahl in ${token.unit} angeben.`);
    const n = Number(m[1]);
    if (n < token.min || n > token.max) {
      throw new Error(`Erlaubt sind ${token.min} bis ${token.max} ${token.unit}.`);
    }
    return `${round(n)}${token.unit}`;
  }

  if (token.type === 'number') {
    if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error('Bitte eine Zahl angeben.');
    const n = Number(text);
    if (n < token.min || n > token.max)
      throw new Error(`Erlaubt sind ${token.min} bis ${token.max}.`);
    return String(round(n));
  }

  if (token.type === 'fluid') {
    const parts = parseFluid(text);
    if (!parts) throw new Error('Ungültiges Format.');
    const inRange = (n) => n >= token.min && n <= token.max;
    if (!inRange(parts.min) || !inRange(parts.max)) {
      throw new Error(`Erlaubt sind ${token.min} bis ${token.max} rem.`);
    }
    if (parts.min > parts.max)
      throw new Error('Das Minimum darf nicht größer als das Maximum sein.');
    return formatFluid({ ...parts, min: round(parts.min), max: round(parts.max) });
  }

  throw new Error('Unbekannter Reglertyp.');
}

/** Only known tokens with valid, non-default values survive. */
export function sanitizeLayoutOverrides(values) {
  const out = {};
  if (!values || typeof values !== 'object') return out;
  for (const token of LAYOUT_TOKENS) {
    const raw = values[token.name];
    if (typeof raw !== 'string') continue;
    try {
      const value = validateLayoutValue(token, raw);
      if (value !== token.default) out[token.name] = value;
    } catch {
      // Invalid stored value: ignore it, the stylesheet default applies.
    }
  }
  return out;
}

/** Human-readable current value, e.g. "24 px", "1.6", "2.5–4.75 rem". */
export function describeValue(token, value) {
  if (token.type === 'length') return value.replace(/(px|rem)$/, ' $1');
  if (token.type === 'fluid') {
    const p = parseFluid(value);
    return p ? `${p.min}–${p.max} rem` : value;
  }
  return value;
}
