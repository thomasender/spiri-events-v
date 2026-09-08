import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const DIST_PATH = path.resolve(ROOT_DIR, 'dist')

export const BASE_URL = 'https://events.thetribe.at'
export const DEFAULT_OG_IMAGE_URL = `${BASE_URL}/og-default.jpg`
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630
export const SITE_NAME = 'tribe Vorarlberg'
export const DEFAULT_DESCRIPTION =
  'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz'

export function toAbsoluteUrl(pathOrUrl, baseUrl = BASE_URL) {
  if (!pathOrUrl) return DEFAULT_OG_IMAGE_URL
  if (typeof pathOrUrl !== 'string') return DEFAULT_OG_IMAGE_URL
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  if (pathOrUrl.startsWith('//')) return `https:${pathOrUrl}`
  if (!pathOrUrl.startsWith('/')) return `${baseUrl}/${pathOrUrl}`
  return `${baseUrl}${pathOrUrl}`
}

export function getEventPath(event) {
  return event.slug || event.id
}

const CATEGORY_FALLBACKS = {
  Yoga: '/event-fallbacks/yoga.jpg',
  Breathwork: '/event-fallbacks/breathwork.jpg',
  Meditation: '/event-fallbacks/meditation.jpg',
  Tanz: '/event-fallbacks/tanz.jpg',
  Singen: '/event-fallbacks/singen.jpg',
  Soundhealing: '/event-fallbacks/soundhealing.jpeg',
  Sonstiges: '/event-fallbacks/sonstiges.jpg',
}
const DEFAULT_EVENT_FALLBACK = '/event-fallbacks/sonstiges.jpg'

// Hardcoded fallback for the theme snapshot. Mirrors `src/utils/themeDefaults.js`
// and is only used when `data-export/firestore-export/theme.json` is
// missing (e.g. before the first `prerender:refresh` run). Keep the keys
// aligned with the hook's `THEME_VARIABLES` list — both sources drive the
// same `:root` block.
export const THEME_FALLBACK = {
  '--bg-primary': '#f4f2f0',
  '--bg-secondary': '#eae7e2',
  '--bg-calendar': '#ffffff',
  '--heading-color': '#a6a487',
  '--accent-secondary': '#667c62',
  '--accent-primary': '#c48e6a',
  '--accent-primary-hover': '#9a5f38',
  '--accent-primary-strong': '#9a5f38',
  '--accent-soft': 'rgba(196, 142, 106, 0.14)',
  '--text-primary': '#161819',
  '--text-secondary': '#605e5e',
  '--text-light': '#938d87',
  '--border': '#e2dcd2',
  '--error': '#bf5b4e',
  '--error-hover': '#a94a3e',
  '--chip-bg': 'rgba(196, 142, 106, 0.14)',
  '--chip-text': '#9a5f38',
  '--free-bg': 'rgba(122, 138, 95, 0.16)',
  '--free-text': '#5c6b3f',
  '--fee-bg': 'rgba(196, 142, 106, 0.16)',
  '--fee-text': '#9a5f38',
  '--donation-bg': 'rgba(140, 120, 180, 0.16)',
  '--donation-text': '#6b568b',
  '--pending-bg': 'rgba(198, 160, 92, 0.18)',
  '--pending-text': '#8a6d2f',
  '--sound-healing': '#6b568b',
  '--category-teal': '#4a7572',
}

// Renders the `:root { ... }` CSS block that paints all admin-managed
// theme variables into the prerendered HTML so crawlers and OG previews
// see the same palette as the live app. Falls back to `THEME_FALLBACK`
// when a key is missing from the snapshot.
export function buildThemeRootBlock(theme) {
  const lines = []
  for (const [name, fallback] of Object.entries(THEME_FALLBACK)) {
    const value = (theme && typeof theme[name] === 'string') ? theme[name] : fallback
    lines.push(`      ${name}: ${value};`)
  }
  return `:root {\n${lines.join('\n')}\n    }`
}

export function getEventFallbackImage(event) {
  const category = event?.category
  return CATEGORY_FALLBACKS[category] || DEFAULT_EVENT_FALLBACK
}

export function getEventOgImage(event) {
  if (event?.imageUrl) {
    return toAbsoluteUrl(event.imageUrl)
  }
  return toAbsoluteUrl(getEventFallbackImage(event))
}

function escapeHtml(value) {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!match) return ''
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function generateEventJsonLd(event) {
  const location = {
    '@type': 'Place',
    name: event.place || event.bezirk,
    address: {
      '@type': 'PostalAddress',
      addressLocality: event.bezirk || 'Vorarlberg',
      addressRegion: 'Vorarlberg',
      addressCountry: 'AT',
    },
  }

  const offer = event.contribution === 'free'
    ? { '@type': 'Offer', price: '0', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' }
    : event.fee != null && event.fee !== ''
      ? { '@type': 'Offer', price: String(event.fee), priceCurrency: 'EUR', availability: 'https://schema.org/InStock' }
      : null

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: event.date,
    endDate: event.endDate || event.date,
    location,
    description: event.description || '',
    image: getEventOgImage(event),
    eventStatus: 'https://schema.org/EventScheduled',
    ...(offer && { offer }),
  }
}

export function buildEventDescription(event) {
  if (event.description) {
    const stripped = String(event.description).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    return stripped.substring(0, 160)
  }
  const category = event.category || 'Sonstiges'
  return `${event.title} - ${category} in ${event.bezirk || 'Vorarlberg'}`
}

export function generateEventHtml(event, theme = THEME_FALLBACK) {
  const jsonLd = generateEventJsonLd(event)
  const isFree = event.contribution === 'free'
  const formattedDate = formatDate(event.date)
  const category = event.category || 'Sonstiges'
  const description = buildEventDescription(event)
  const ogImage = getEventOgImage(event)
  const eventPath = getEventPath(event)
  const eventUrl = `${BASE_URL}/event/${eventPath}`
  const themeRoot = buildThemeRootBlock(theme)

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(event.title)} | ${escapeHtml(SITE_NAME)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${escapeHtml(eventUrl)}" />

  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
  <meta property="og:type" content="event" />
  <meta property="og:title" content="${escapeHtml(event.title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(eventUrl)}" />
  <meta property="og:locale" content="de_AT" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />
  <meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />
  <meta property="og:image:alt" content="${escapeHtml(event.title)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(event.title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />
  <meta name="twitter:image:alt" content="${escapeHtml(event.title)}" />

  <script type="application/ld+json">${escapeJson(jsonLd)}</script>

  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Nunito+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />

  <style>
    ${themeRoot}
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Nunito Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      min-height: 100vh;
    }
    h1, h2, h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; line-height: 1.3; }
    a { color: var(--accent-primary); text-decoration: none; transition: color 0.15s ease; }
    a:hover { color: var(--accent-primary-hover); }
    .event-detail-page { max-width: 800px; margin: 0 auto; padding: 40px 24px; }
    .event-header { margin-bottom: 32px; }
    .event-image { width: 100%; max-height: 400px; object-fit: cover; border-radius: var(--radius-md); margin-bottom: 24px; }
    .event-title { font-size: 2.5rem; margin-bottom: 16px; color: var(--text-primary); }
    .event-meta-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
    .category-chip { display: inline-flex; padding: 4px 12px; background-color: var(--chip-bg); color: var(--chip-text); border-radius: 16px; font-size: 0.8rem; font-weight: 500; }
    .event-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 500; }
    .badge--free { background-color: var(--free-bg); color: var(--free-text); }
    .badge--fee { background-color: var(--fee-bg); color: var(--fee-text); }
    .event-details { background: var(--bg-calendar); border-radius: var(--radius-md); padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(22, 24, 25, 0.06); }
    .detail-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
    .detail-item:last-child { border-bottom: none; }
    .detail-icon { color: var(--accent-primary); flex-shrink: 0; margin-top: 2px; }
    .detail-label { display: block; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px; }
    .detail-value { font-size: 1rem; color: var(--text-primary); }
    .event-description { margin-bottom: 24px; }
    .event-description h3 { font-size: 1.3rem; margin-bottom: 12px; }
    .event-description p { color: var(--text-secondary); white-space: pre-wrap; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 24px; border-radius: var(--radius-sm); font-size: 0.95rem; font-weight: 500; transition: all 0.15s ease; background-color: var(--accent-primary); color: white; }
    .btn:hover { background-color: var(--accent-primary-hover); transform: translateY(-1px); box-shadow: 0 2px 8px rgba(22, 24, 25, 0.06); color: white; }
    .back-link { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 24px; font-size: 0.9rem; }
    .loading-spinner { display: flex; justify-content: center; align-items: center; padding: 48px; }
    .loading-spinner::after { content: ''; width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="root">
    <div class="event-detail-page">
      <a href="/" class="back-link">← Zurück zum Kalender</a>

      <header class="event-header">
        <img src="${escapeHtml(event.imageUrl || getEventFallbackImage(event))}" alt="${escapeHtml(event.title)}" class="event-image" />
        <h1 class="event-title">${escapeHtml(event.title)}</h1>
        <div class="event-meta-row">
          <span class="category-chip">${escapeHtml(category)}</span>
          <span class="event-badge ${isFree ? 'badge--free' : 'badge--fee'}">
            ${isFree ? 'Kostenlos' : event.fee != null && event.fee !== '' ? `${escapeHtml(event.fee)} €` : 'Gebühr'}
          </span>
        </div>
      </header>

      <div class="event-details">
        <div class="detail-item">
          <svg class="detail-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
          <div>
            <span class="detail-label">Datum</span>
            <span class="detail-value">${escapeHtml(formattedDate)}</span>
          </div>
        </div>

        ${event.time ? `
        <div class="detail-item">
          <svg class="detail-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <div>
            <span class="detail-label">Uhrzeit</span>
            <span class="detail-value">${escapeHtml(event.time)}</span>
          </div>
        </div>
        ` : ''}

        <div class="detail-item">
          <svg class="detail-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <div>
            <span class="detail-label">Bezirk</span>
            <span class="detail-value">${escapeHtml(event.bezirk || 'Vorarlberg')}</span>
          </div>
        </div>

        <div class="detail-item">
          <svg class="detail-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <div>
            <span class="detail-label">Ort</span>
            <span class="detail-value">${escapeHtml(event.place || 'Noch nicht angegeben')}</span>
          </div>
        </div>
      </div>

      ${event.description ? `
      <div class="event-description">
        <h3>Über das Event</h3>
        <p>${escapeHtml(event.description)}</p>
      </div>
      ` : ''}

      ${event.link ? `
      <a href="${escapeHtml(event.link)}" target="_blank" rel="noopener noreferrer" class="btn">
        <span>Mehr Infos & Tickets</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
      </a>
      ` : ''}
    </div>
  </div>
</body>
</html>`
}

export function generateCalendarPageHtml(events, jsBundlePath, cssBundlePath, theme = THEME_FALLBACK) {
  const today = new Date().toISOString().split('T')[0]
  const upcomingEvents = events
    .filter(e => e.date && e.date >= today)
    .slice(0, 20)

  const eventsList = upcomingEvents.length > 0
    ? upcomingEvents.map(event => {
        const eventPath = getEventPath(event)
        return `
        <li>
          <a href="/event/${escapeHtml(eventPath)}">
            <strong>${escapeHtml(event.title)}</strong>
            <span>${escapeHtml(formatDate(event.date))} - ${escapeHtml(event.bezirk || 'Vorarlberg')}</span>
          </a>
        </li>`
      }).join('')
    : '<li>Keine bevorstehenden Events</li>'
  const themeRoot = buildThemeRootBlock(theme)

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(SITE_NAME)} | Kalender</title>
  <meta name="description" content="${escapeHtml(DEFAULT_DESCRIPTION)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${BASE_URL}/" />

  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(SITE_NAME)}" />
  <meta property="og:description" content="${escapeHtml(DEFAULT_DESCRIPTION)}" />
  <meta property="og:url" content="${BASE_URL}/" />
  <meta property="og:locale" content="de_AT" />
  <meta property="og:image" content="${escapeHtml(DEFAULT_OG_IMAGE_URL)}" />
  <meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />
  <meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />
  <meta property="og:image:alt" content="${escapeHtml(SITE_NAME)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(SITE_NAME)}" />
  <meta name="twitter:description" content="${escapeHtml(DEFAULT_DESCRIPTION)}" />
  <meta name="twitter:image" content="${escapeHtml(DEFAULT_OG_IMAGE_URL)}" />
  <meta name="twitter:image:alt" content="${escapeHtml(SITE_NAME)}" />

  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Nunito+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${escapeHtml(cssBundlePath)}" />

  <script type="application/ld+json">${escapeJson({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    url: BASE_URL,
  })}</script>

  <style>
    ${themeRoot}
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Nunito Sans', -apple-system, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
    }
    h1, h2, h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; }
    a { color: var(--accent-primary); text-decoration: none; }
    a:hover { color: var(--accent-primary-hover); }
    .calendar-page { min-height: 100vh; display: flex; flex-direction: column; }
    .page-header { background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-primary) 100%); padding: 48px 24px; text-align: center; }
    .header-content h1 { font-size: 2.5rem; margin-bottom: 8px; }
    .header-content p { color: var(--text-secondary); font-size: 1.1rem; }
    .calendar-wrapper { max-width: 1000px; margin: 0 auto; padding: 40px 24px; flex: 1; }
    .page-title { font-size: 1.8rem; margin-bottom: 24px; text-align: center; }
    .events-list { list-style: none; display: grid; gap: 16px; }
    .events-list li { background: var(--bg-calendar); border-radius: 8px; padding: 16px; box-shadow: 0 2px 8px rgba(22, 24, 25, 0.06); }
    .events-list a { display: flex; flex-direction: column; gap: 4px; }
    .events-list strong { font-size: 1.1rem; color: var(--text-primary); }
    .events-list span { font-size: 0.9rem; color: var(--text-secondary); }
    footer { background: var(--bg-secondary); padding: 24px; text-align: center; color: var(--text-secondary); font-size: 0.9rem; }
  </style>
</head>
<body>
  <div id="root">
    <div class="calendar-page">
      <header class="page-header">
        <div class="header-content">
          <h1>Spirituelle Events Vorarlberg</h1>
          <p>Entdecke Workshops, Meditationen und Retreats in deiner Nähe</p>
        </div>
      </header>

      <div class="calendar-wrapper">
        <h2 class="page-title">Bevorstehende Events</h2>
        <ul class="events-list">
          ${eventsList}
        </ul>
      </div>

      <footer>
        <p>© ${new Date().getFullYear()} ${escapeHtml(SITE_NAME)}</p>
      </footer>
    </div>
  </div>
  <script type="module" src="${escapeHtml(jsBundlePath)}"></script>
</body>
</html>`
}

export function generateSitemap(events) {
  const today = new Date().toISOString().split('T')[0]
  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/datenschutz', priority: '0.3', changefreq: 'monthly' },
    { url: '/impressum', priority: '0.3', changefreq: 'monthly' },
    { url: '/nutzungsbedingungen', priority: '0.3', changefreq: 'monthly' },
  ]

  const eventPages = events
    .filter(e => e.date && e.date >= today)
    .map(event => ({
      url: `/event/${getEventPath(event)}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: today,
    }))

  const allPages = [...staticPages, ...eventPages]

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(page => `  <url>
    <loc>${BASE_URL}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
    ${page.lastmod ? `<lastmod>${page.lastmod}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`
}

export function unfirestore(value) {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(unfirestore)
  if (value instanceof Date) return value.toISOString()
  const keys = Object.keys(value)
  const firestoreTypeKeys = keys.filter(k =>
    [
      'stringValue',
      'integerValue',
      'doubleValue',
      'booleanValue',
      'timestampValue',
      'geoPointValue',
      'arrayValue',
      'mapValue',
      'referenceValue',
      'bytesValue',
      'nullValue',
    ].includes(k)
  )
  if (firestoreTypeKeys.length === 1) {
    const key = firestoreTypeKeys[0]
    if (key === 'nullValue') return null
    if (key === 'stringValue') return value[key]
    if (key === 'integerValue') return Number(value[key])
    if (key === 'doubleValue') return Number(value[key])
    if (key === 'booleanValue') return value[key] === 'true' || value[key] === true
    if (key === 'timestampValue') return value[key]
    if (key === 'arrayValue') return unfirestore(value[key]?.values || [])
    if (key === 'mapValue') return unfirestore(value[key]?.fields || {})
    if (key === 'geoPointValue') return value[key]
    if (key === 'referenceValue') return value[key]
    if (key === 'bytesValue') return value[key]
  }
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (k === 'id') {
      out.id = v
    } else {
      out[k] = unfirestore(v)
    }
  }
  return out
}

export function normalizeEvent(event) {
  const category =
    event.category ||
    (Array.isArray(event.categories) && event.categories.length > 0
      ? event.categories[0]
      : 'Sonstiges')
  return {
    ...event,
    category,
    bezirk: event.bezirk || '',
  }
}

export function loadEventsFromExport(exportPath) {
  const eventsFile = path.join(exportPath, 'events.json')
  if (!fs.existsSync(eventsFile)) {
    return { events: [], source: null, error: `No events.json at ${eventsFile}` }
  }
  const raw = JSON.parse(fs.readFileSync(eventsFile, 'utf8'))
  if (!Array.isArray(raw)) {
    return { events: [], source: null, error: `events.json is not an array` }
  }
  const events = raw.map(unfirestore).map(normalizeEvent)
  return { events, source: eventsFile, error: null }
}

// Loads the `app_settings/theme` doc snapshot written by
// `scripts/refresh-prerender-data.mjs`. The on-disk format is the same
// Firestore emulator export shape used for `events.json` (a single doc
// keyed `app_settings/theme`), so `unfirestore()` flattens it into a
// plain `{ '--bg-primary': '#...', ... }` map. Missing or invalid files
// fall back to `THEME_FALLBACK` so a build never fails just because the
// theme doc hasn't been refreshed yet.
export function loadThemeFromExport(exportPath) {
  const themeFile = path.join(exportPath, 'theme.json')
  if (!fs.existsSync(themeFile)) {
    return { theme: { ...THEME_FALLBACK }, source: null, error: `No theme.json at ${themeFile}` }
  }
  try {
    const raw = JSON.parse(fs.readFileSync(themeFile, 'utf8'))
    // Single-doc export shape: { id: 'theme', fields: { '--bg-primary': { stringValue: '#...' }, ... } }
    // or just { '--bg-primary': '#...', ... } if hand-edited.
    const fields =
      raw && typeof raw === 'object' && raw.fields && typeof raw.fields === 'object'
        ? raw.fields
        : raw
    const resolved = { ...THEME_FALLBACK }
    for (const [name, value] of Object.entries(fields || {})) {
      if (!Object.prototype.hasOwnProperty.call(THEME_FALLBACK, name)) continue
      const unwrapped = typeof value === 'string' ? value : unfirestore(value)
      if (typeof unwrapped === 'string') {
        resolved[name] = unwrapped
      }
    }
    return { theme: resolved, source: themeFile, error: null }
  } catch (err) {
    return { theme: { ...THEME_FALLBACK }, source: themeFile, error: `Failed to read theme.json: ${err.message}` }
  }
}

export async function loadEventsFromFirestore(firebaseConfig) {
  const { initializeApp } = await import('firebase/app')
  const { getFirestore, collection, getDocs } = await import('firebase/firestore')
  const app = initializeApp(firebaseConfig)
  const db = getFirestore(app)
  const snapshot = await getDocs(collection(db, 'events'))
  const events = snapshot.docs.map(doc => normalizeEvent({ id: doc.id, ...doc.data() }))
  return { events, source: 'firestore', error: null }
}

export async function loadEventsFromFirestoreRest({
  projectId,
  apiKey,
  baseUrl = 'https://firestore.googleapis.com',
} = {}) {
  if (!projectId || !apiKey) {
    return { events: [], source: null, error: 'Missing projectId or apiKey for Firestore REST fetch.' }
  }
  const url = `${baseUrl}/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/events?pageSize=1000&key=${encodeURIComponent(apiKey)}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      return {
        events: [],
        source: null,
        error: `Firestore REST request failed: ${res.status} ${res.statusText}`,
      }
    }
    const payload = await res.json()
    const docs = Array.isArray(payload?.documents) ? payload.documents : []
    const events = docs.map(doc => {
      const id = doc.name?.split('/').pop()
      const fields = unfirestore(doc.fields || {})
      return normalizeEvent({ id, ...fields })
    })
    return { events, source: `firestore-rest:${projectId}`, error: null }
  } catch (err) {
    return { events: [], source: null, error: `Firestore REST fetch threw: ${err.message}` }
  }
}

function pickBundlePath(assetsDir, ext) {
  const files = fs.readdirSync(assetsDir)
  const candidates = files.filter(f => f.endsWith(`.${ext}`) && !f.includes('map'))
  if (candidates.length === 0) {
    throw new Error(`No ${ext.toUpperCase()} bundle found in ${assetsDir}`)
  }
  const entry = candidates.find(f => /^index-/.test(f))
  const chosen = entry || candidates[0]
  if (!entry && candidates.length > 1) {
    console.warn(
      `No index-* ${ext.toUpperCase()} entry found in ${assetsDir}; falling back to ${chosen}. ` +
        `Picked this one because fs.readdirSync order is not guaranteed — verify it is the real app entry.`
    )
  }
  return `/assets/${chosen}`
}

function findJsBundlePath(assetsDir) {
  return pickBundlePath(assetsDir, 'js')
}

function findCssBundlePath(assetsDir) {
  return pickBundlePath(assetsDir, 'css')
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCMvCOUD27daEjYO2TKE5CB32fuMXRt0RA',
  authDomain: 'spirieventsvbg.firebaseapp.com',
  projectId: 'spirieventsvbg',
  storageBucket: 'spirieventsvbg.firebasestorage.app',
  messagingSenderId: '54424804895',
  appId: '1:54424804895:web:e9caf19748530550a63f2a',
  measurementId: 'G-34TNY65VBC',
}

export async function prerender({
  rootDir = ROOT_DIR,
  distPath = DIST_PATH,
  exportPath = path.join(rootDir, 'data-export', 'firestore-export'),
  firebaseConfig = DEFAULT_FIREBASE_CONFIG,
  skipFirestore = false,
  skipRest = false,
} = {}) {
  if (!fs.existsSync(distPath)) {
    throw new Error(`dist folder not found at ${distPath}. Run \`npm run build\` (vite build) first.`)
  }

  let events = []
  let source = null

  // Theme snapshot: load whatever's in data-export/theme.json so the
  // prerendered HTML paints the same palette admins see in the Theme tab.
  // Falls back to bundled defaults if the file is missing or stale.
  const themeResult = loadThemeFromExport(exportPath)
  const theme = themeResult.theme
  if (themeResult.error) {
    console.warn(`Theme snapshot not used: ${themeResult.error}`)
  } else {
    console.log(`Loaded theme from ${themeResult.source}`)
  }

  const exportResult = loadEventsFromExport(exportPath)
  if (exportResult.events.length > 0) {
    events = exportResult.events
    source = exportResult.source
    console.log(`Loaded ${events.length} events from export: ${source}`)
  } else {
    if (exportResult.error) {
      console.warn(`data-export not usable: ${exportResult.error}`)
    }

    if (!skipRest) {
      console.log('Falling back to Firestore REST API...')
      try {
        const restResult = await loadEventsFromFirestoreRest({
          projectId: firebaseConfig.projectId,
          apiKey: firebaseConfig.apiKey,
        })
        if (restResult.events.length > 0) {
          events = restResult.events
          source = restResult.source
          console.log(`Loaded ${events.length} events from Firestore REST.`)
        } else if (restResult.error) {
          console.warn(`Firestore REST fetch failed: ${restResult.error}`)
        }
      } catch (err) {
        console.warn(`Firestore REST fetch threw: ${err.message}`)
      }
    }

    if (events.length === 0 && !skipFirestore) {
      console.log('Falling back to live Firestore SDK...')
      try {
        const fsResult = await loadEventsFromFirestore(firebaseConfig)
        events = fsResult.events
        source = fsResult.source
        console.log(`Loaded ${events.length} events from live Firestore.`)
      } catch (err) {
        console.error(`Live Firestore read failed: ${err.message}`)
        if (err.stack) console.error(err.stack)
      }
    }

    if (events.length === 0) {
      console.warn('No events loaded from any source — prerendering without event pages.')
    }
  }

  const writtenFiles = []
  const skippedEvents = []
  const seenPaths = new Set()

  for (const event of events) {
    const eventPath = getEventPath(event)
    if (!eventPath) {
      skippedEvents.push({ id: event.id, title: event.title, reason: 'no slug and no id' })
      continue
    }
    if (seenPaths.has(eventPath)) {
      skippedEvents.push({ id: event.id, title: event.title, reason: `duplicate path ${eventPath}` })
      continue
    }
    seenPaths.add(eventPath)

    const eventDir = path.join(distPath, 'event', eventPath)
    ensureDir(eventDir)
    const html = generateEventHtml(event, theme)
    const filePath = path.join(eventDir, 'index.html')
    fs.writeFileSync(filePath, html)
    writtenFiles.push({ path: `/event/${eventPath}/index.html`, slug: eventPath, title: event.title })
  }

  console.log(`Prerendered ${writtenFiles.length} event pages.`)
  if (skippedEvents.length > 0) {
    console.warn(`Skipped ${skippedEvents.length} events:`)
    for (const skipped of skippedEvents) {
      console.warn(`  - ${skipped.title || skipped.id} (${skipped.reason})`)
    }
  }

  const assetsPath = path.join(distPath, 'assets')
  if (fs.existsSync(assetsPath)) {
    const jsBundlePath = findJsBundlePath(assetsPath)
    const cssBundlePath = findCssBundlePath(assetsPath)
    const calendarHtml = generateCalendarPageHtml(events, jsBundlePath, cssBundlePath, theme)
    fs.writeFileSync(path.join(distPath, 'index.html'), calendarHtml)
    writtenFiles.push({ path: '/index.html', slug: null, title: SITE_NAME })
    console.log(`Prerendered calendar index page with ${events.length} events.`)
  } else {
    console.warn(`No assets/ directory in dist; skipping calendar prerender.`)
  }

  const sitemap = generateSitemap(events)
  fs.writeFileSync(path.join(distPath, 'sitemap.xml'), sitemap)
  writtenFiles.push({ path: '/sitemap.xml', slug: null, title: 'sitemap' })
  console.log(`Generated sitemap.xml with ${events.length} event URLs.`)

  const manifest = {
    generatedAt: new Date().toISOString(),
    source,
    eventCount: events.length,
    prerenderedPages: writtenFiles.length,
    pages: writtenFiles,
    skippedEvents,
  }
  fs.writeFileSync(
    path.join(distPath, 'prerender-manifest.json'),
    JSON.stringify(manifest, null, 2)
  )
  console.log(`Wrote dist/prerender-manifest.json`)

  return {
    writtenFiles,
    skippedEvents,
    source,
    manifest,
    manifestPath: path.join(distPath, 'prerender-manifest.json'),
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  prerender().catch(err => {
    console.error('prerender failed:', err.message)
    if (err.stack) console.error(err.stack)
    process.exitCode = 1
  })
}