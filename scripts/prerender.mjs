import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer as createViteServer } from 'vite'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_PATH = path.resolve(__dirname, '../dist')
const BASE_URL = 'https://spirievents.at'

const firebaseConfig = {
  apiKey: 'AIzaSyCMvCOUD27daEjYO2TKE5CB32fuMXRt0RA',
  authDomain: 'spirieventsvbg.firebaseapp.com',
  projectId: 'spirieventsvbg',
  storageBucket: 'spirieventsvbg.firebasestorage.app',
  messagingSenderId: '54424804895',
  appId: '1:54424804895:web:e9caf19748530550a63f2a',
  measurementId: 'G-34TNY65VBC',
}

async function fetchEvents() {
  const app = initializeApp(firebaseConfig)
  const db = getFirestore(app)

  const querySnapshot = await getDocs(collection(db, 'events'))
  const events = querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }))

  return events.map(event => ({
    ...event,
    categories: event.categories && event.categories.length > 0 ? event.categories : ['Sonstiges'],
    bezirk: event.bezirk || ''
  }))
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

function generateEventJsonLd(event) {
  const location = {
    '@type': 'Place',
    name: event.place || event.bezirk,
    address: {
      '@type': 'PostalAddress',
      addressLocality: event.bezirk || 'Vorarlberg',
      addressRegion: 'Vorarlberg',
      addressCountry: 'AT'
    }
  }

  const offer = event.contribution === 'free' ? {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'EUR',
    availability: 'https://schema.org/InStock'
  } : event.fee ? {
    '@type': 'Offer',
    price: event.fee.toString(),
    priceCurrency: 'EUR',
    availability: 'https://schema.org/InStock'
  } : null

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: event.date,
    endDate: event.endDate || event.date,
    location,
    description: event.description || '',
    image: event.imageUrl || null,
    eventStatus: 'https://schema.org/EventScheduled',
    ...(offer && { offer })
  }
}

function generateEventHtml(event) {
  const jsonLd = generateEventJsonLd(event)
  const isFree = event.contribution === 'free'
  const formattedDate = formatDate(event.date)
  const categories = event.categories ? event.categories.join(', ') : 'Sonstiges'

  const description = event.description
    ? event.description.substring(0, 160)
    : `${event.title} - ${categories} in ${event.bezirk || 'Vorarlberg'}`

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${event.title} | Spirituelle Events Vorarlberg</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${BASE_URL}/event/${event.id}" />

  <meta property="og:type" content="event" />
  <meta property="og:title" content="${event.title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${BASE_URL}/event/${event.id}" />
  <meta property="og:locale" content="de_AT" />
  ${event.imageUrl ? `<meta property="og:image" content="${event.imageUrl}" />` : ''}

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${event.title}" />
  <meta name="twitter:description" content="${description}" />

  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Nunito+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />

  <style>
    :root {
      --bg-primary: #FDFBF7;
      --bg-secondary: #F5F0E8;
      --bg-calendar: #FFFFFF;
      --accent-primary: #8B7355;
      --accent-lavender: #9B8AA6;
      --accent-sage: #7D9B8A;
      --text-primary: #3D3530;
      --text-secondary: #7A6F68;
      --border: #E8E0D5;
      --error: #C17A7A;
      --shadow-sm: 0 2px 8px rgba(61, 53, 48, 0.08);
      --shadow-md: 0 4px 16px rgba(61, 53, 48, 0.12);
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 20px;
    }

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
    a:hover { color: var(--accent-lavender); }

    .event-detail-page { max-width: 800px; margin: 0 auto; padding: 40px 24px; }

    .event-header { margin-bottom: 32px; }

    .event-image {
      width: 100%;
      max-height: 400px;
      object-fit: cover;
      border-radius: var(--radius-md);
      margin-bottom: 24px;
    }

    .event-title { font-size: 2.5rem; margin-bottom: 16px; color: var(--text-primary); }

    .event-meta-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }

    .category-chip {
      display: inline-flex;
      padding: 4px 12px;
      background-color: rgba(155, 138, 166, 0.15);
      color: var(--accent-lavender);
      border-radius: 16px;
      font-size: 0.8rem;
      font-weight: 500;
    }

    .event-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
      font-weight: 500;
    }

    .badge--free { background-color: rgba(125, 155, 138, 0.15); color: var(--accent-sage); }
    .badge--fee { background-color: rgba(139, 115, 85, 0.15); color: var(--accent-primary); }

    .event-details { background: var(--bg-calendar); border-radius: var(--radius-md); padding: 24px; margin-bottom: 24px; box-shadow: var(--shadow-sm); }

    .detail-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
    .detail-item:last-child { border-bottom: none; }

    .detail-icon { color: var(--accent-primary); flex-shrink: 0; margin-top: 2px; }

    .detail-label { display: block; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px; }
    .detail-value { font-size: 1rem; color: var(--text-primary); }

    .event-description { margin-bottom: 24px; }
    .event-description h3 { font-size: 1.3rem; margin-bottom: 12px; }
    .event-description p { color: var(--text-secondary); white-space: pre-wrap; }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: var(--radius-sm);
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.15s ease;
      background-color: var(--accent-primary);
      color: white;
    }

    .btn:hover { background-color: #7A6349; transform: translateY(-1px); box-shadow: var(--shadow-sm); color: white; }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 24px;
      font-size: 0.9rem;
    }

    .loading-spinner {
      display: flex; justify-content: center; align-items: center; padding: 48px;
    }
    .loading-spinner::after {
      content: ''; width: 32px; height: 32px;
      border: 3px solid var(--border);
      border-top-color: var(--accent-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="root">
    <div class="event-detail-page">
      <a href="/" class="back-link">← Zurück zum Kalender</a>

      <header class="event-header">
        ${event.imageUrl ? `<img src="${event.imageUrl}" alt="${event.title}" class="event-image" />` : ''}
        <h1 class="event-title">${event.title}</h1>
        <div class="event-meta-row">
          ${event.categories && event.categories.map(cat => `<span class="category-chip">${cat}</span>`).join('')}
          <span class="event-badge ${isFree ? 'badge--free' : 'badge--fee'}">
            ${isFree ? 'Kostenlos' : event.fee ? `${event.fee} €` : 'Gebühr'}
          </span>
        </div>
      </header>

      <div class="event-details">
        <div class="detail-item">
          <svg class="detail-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
          <div>
            <span class="detail-label">Datum</span>
            <span class="detail-value">${formattedDate}</span>
          </div>
        </div>

        ${event.time ? `
        <div class="detail-item">
          <svg class="detail-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <div>
            <span class="detail-label">Uhrzeit</span>
            <span class="detail-value">${event.time}</span>
          </div>
        </div>
        ` : ''}

        <div class="detail-item">
          <svg class="detail-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <div>
            <span class="detail-label">Bezirk</span>
            <span class="detail-value">${event.bezirk || 'Vorarlberg'}</span>
          </div>
        </div>

        <div class="detail-item">
          <svg class="detail-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <div>
            <span class="detail-label">Ort</span>
            <span class="detail-value">${event.place || 'Noch nicht angegeben'}</span>
          </div>
        </div>
      </div>

      ${event.description ? `
      <div class="event-description">
        <h3>Über das Event</h3>
        <p>${event.description}</p>
      </div>
      ` : ''}

      ${event.link ? `
      <a href="${event.link}" target="_blank" rel="noopener noreferrer" class="btn">
        <span>Mehr Infos & Tickets</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
      </a>
      ` : ''}
    </div>
  </div>
</body>
</html>`
}

function getJsBundlePath(assetsDir) {
  const files = fs.readdirSync(assetsDir)
  const jsFile = files.find(f => f.endsWith('.js') && !f.includes('map'))
  if (!jsFile) {
    throw new Error(`No JS bundle found in ${assetsDir}`)
  }
  return `/assets/${jsFile}`
}

function generateCalendarPageHtml(events, jsBundlePath) {
  const upcomingEvents = events.filter(e => e.date >= new Date().toISOString().split('T')[0])
    .slice(0, 20)

  const eventsList = upcomingEvents.length > 0
    ? upcomingEvents.map(event => `
        <li>
          <a href="/event/${event.id}">
            <strong>${event.title}</strong>
            <span>${formatDate(event.date)} - ${event.bezirk || 'Vorarlberg'}</span>
          </a>
        </li>
      `).join('')
    : '<li>Keine bevorstehenden Events</li>'

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Spirituelle Events Vorarlberg | Kalender</title>
  <meta name="description" content="Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${BASE_URL}/" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Spirituelle Events Vorarlberg" />
  <meta property="og:title" content="Spirituelle Events Vorarlberg" />
  <meta property="og:description" content="Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg" />
  <meta property="og:url" content="${BASE_URL}/" />
  <meta property="og:locale" content="de_AT" />

  <meta name="twitter:card" content="summary_large_image" />

  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Nunito+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />

  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Spirituelle Events Vorarlberg',
    description: 'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg',
    url: BASE_URL
  })}</script>

  <style>
    :root {
      --bg-primary: #FDFBF7;
      --bg-secondary: #F5F0E8;
      --bg-calendar: #FFFFFF;
      --accent-primary: #8B7355;
      --accent-lavender: #9B8AA6;
      --text-primary: #3D3530;
      --text-secondary: #7A6F68;
      --border: #E8E0D5;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Nunito Sans', -apple-system, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
    }

    h1, h2, h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; }
    a { color: var(--accent-primary); text-decoration: none; }
    a:hover { color: var(--accent-lavender); }

    .calendar-page { min-height: 100vh; display: flex; flex-direction: column; }

    .page-header {
      background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
      padding: 48px 24px;
      text-align: center;
    }

    .header-content h1 { font-size: 2.5rem; margin-bottom: 8px; }
    .header-content p { color: var(--text-secondary); font-size: 1.1rem; }

    .calendar-wrapper { max-width: 1000px; margin: 0 auto; padding: 40px 24px; flex: 1; }
    .page-title { font-size: 1.8rem; margin-bottom: 24px; text-align: center; }

    .events-list { list-style: none; display: grid; gap: 16px; }
    .events-list li { background: var(--bg-calendar); border-radius: 8px; padding: 16px; box-shadow: 0 2px 8px rgba(61,53,48,0.08); }
    .events-list a { display: flex; flex-direction: column; gap: 4px; }
    .events-list strong { font-size: 1.1rem; color: var(--text-primary); }
    .events-list span { font-size: 0.9rem; color: var(--text-secondary); }

    footer { background: var(--bg-secondary); padding: 24px; text-align: center; color: var(--text-secondary); font-size: 0.9rem; }
  </style>
</head>
<body>
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
      <p>© ${new Date().getFullYear()} Spirituelle Events Vorarlberg</p>
    </footer>
  </div>
  <script type="module" src="${jsBundlePath}"></script>
</body>
</html>`
}

function generateSitemap(events) {
  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/datenschutz', priority: '0.3', changefreq: 'monthly' },
    { url: '/impressum', priority: '0.3', changefreq: 'monthly' },
    { url: '/nutzungsbedingungen', priority: '0.3', changefreq: 'monthly' }
  ]

  const eventPages = events
    .filter(e => e.date >= new Date().toISOString().split('T')[0])
    .map(event => ({
      url: `/event/${event.id}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: new Date().toISOString().split('T')[0]
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

async function prerender() {
  console.log('Fetching events from Firestore...')
  const events = await fetchEvents()
  console.log(`Found ${events.length} events`)

  if (!fs.existsSync(DIST_PATH)) {
    console.error('dist folder not found. Run npm run build first.')
    process.exit(1)
  }

  console.log('Generating event pages...')
  const eventDir = path.join(DIST_PATH, 'event')
  if (!fs.existsSync(eventDir)) {
    fs.mkdirSync(eventDir, { recursive: true })
  }

  for (const event of events) {
    const eventHtml = generateEventHtml(event)
    const eventFilePath = path.join(eventDir, event.id, 'index.html')
    const eventDirPath = path.join(eventDir, event.id)

    if (!fs.existsSync(eventDirPath)) {
      fs.mkdirSync(eventDirPath, { recursive: true })
    }

    fs.writeFileSync(eventFilePath, eventHtml)
    console.log(`  Created /event/${event.id}/index.html`)
  }

  console.log('Generating calendar index page...')
  const assetsPath = path.join(DIST_PATH, 'assets')
  const jsBundlePath = getJsBundlePath(assetsPath)
  console.log(`  Found JS bundle: ${jsBundlePath}`)
  const calendarHtml = generateCalendarPageHtml(events, jsBundlePath)
  fs.writeFileSync(path.join(DIST_PATH, 'index.html'), calendarHtml)

  console.log('Generating sitemap.xml...')
  const sitemap = generateSitemap(events)
  fs.writeFileSync(path.join(DIST_PATH, 'sitemap.xml'), sitemap)

  console.log('Pre-rendering complete!')
  console.log(`  - ${events.length} event pages`)
  console.log('  - 1 calendar index page')
  console.log('  - sitemap.xml')
}

prerender().catch(console.error)
