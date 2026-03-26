# Spirituelle Events Vorarlberg — SPEC.md

## 1. Concept & Vision

Eine elegante SPA für spirituelle Events in Vorarlberg. Die App fühlt sich an wie ein ruhiger, einladender Raum — warm, natürlich, zen-artig. Gäste blättern durch einen Monatskalender, sehen Events und öffnen Details in einem sanften Modal. Registrierte Nutzer können Events vollständig verwalten (CRUD). Alles in deutscher Sprache.

## 2. Design Language

### Aesthetic Direction
Inspiriert von Yoga-Retreats und spirituellen Oasen — warme Erdtöne, viel Weißraum, sanfte Schatten, fließende Formen. Nicht kitschig-esoterisch, sondern modern-minimalistisch mit spiritueller Wärme.

### Color Palette
```
--bg-primary:     #FDFBF7   (warm white — main background)
--bg-secondary:   #F5F0E8   (soft cream — card backgrounds)
--bg-calendar:    #FFFFFF   (pure white — calendar cells)
--accent-primary: #8B7355   (warm taupe — primary actions)
--accent-lavender:#9B8AA6   (soft lavender — secondary accent)
--accent-sage:    #7D9B8A   (sage green — success/free events)
--text-primary:   #3D3530   (warm dark brown)
--text-secondary: #7A6F68   (muted brown)
--text-light:     #A89F98   (light brown)
--border:         #E8E0D5   (soft border)
--modal-overlay:  rgba(61, 53, 48, 0.6)
--error:          #C17A7A   (muted red)
```

### Typography
- **Headings**: "Cormorant Garamond" (serif, elegant, spiritual feel) — Google Fonts
- **Body**: "Nunito Sans" (clean, rounded, friendly) — Google Fonts
- **Accents**: "Cormorant Garamond" italic for quotes/taglines

### Spatial System
- Base unit: 8px
- Generous padding (24–48px) for breathing room
- Border radius: 12px (cards), 8px (buttons), 20px (modal)

### Motion Philosophy
- Subtle fade + scale on modal open (200ms ease-out)
- Smooth month transitions (slide left/right, 300ms)
- Gentle hover lifts on calendar days (translateY -2px, 150ms)
- No jarring animations — everything should feel meditative

### Visual Assets
- Icons: Lucide React (minimal, clean)
- No external images — use CSS gradients and subtle patterns for atmosphere
- Decorative: subtle dot pattern on header, soft gradients

## 3. Layout & Structure

### Pages (SPA Routes)
1. **`/` — Kalender View** (Guest & Auth users)
   - Full-month calendar grid
   - Month/year header with prev/next navigation
   - Events shown as colored dots/chips on calendar days
   - Click day with events → modal

2. **`/login` — Login/Register**
   - Toggle between Login and Register
   - Email + Password via Firebase Auth

3. **`/admin` — Event Management** (Auth only)
   - List of user's events (table/card view)
   - Add new event button
   - Edit/Delete actions per event

4. **`/admin/new` & `/admin/edit/:id` — Event Form**
   - Full form for event CRUD

5. **`/datenschutz` — Datenschutzerklärung**
   - Privacy policy in German
   - Covers data controller, data collected, purpose, no third-party sharing, retention, user rights, security

6. **`/nutzungsbedingungen` — Nutzungsbedingungen**
   - Terms of service in German
   - Covers scope, registration, usage rules, content responsibility, availability, liability, data privacy

### Header
- Logo/Title: "Spirituelle Events Vorarlberg"
- Nav: Kalender | (Login/Logout or Admin)
- Sticky, minimal, with subtle bottom border

### Footer
- Copyright notice with year
- Legal links: Datenschutz | Nutzungsbedingungen
- Links to respective legal pages

### Calendar Grid
- 7-column grid (Mo–So)
- Day headers: Mo, Di, Mi, Do, Fr, Sa, So
- Each cell shows: date number + event chips
- Current day: highlighted with accent border
- Days outside current month: dimmed

## 4. Features & Interactions

### Calendar
- **View**: Shows full month at a time
- **Navigation**: Left/Right arrows to flip months (slide animation)
- **Today button**: Jump back to current month
- **Event indicator**: Colored dot or small chip on days with events
- **Click event chip**: Opens event detail modal

### Event Detail Modal
- **Fields shown**: Title, Datum & Zeit, Ort, Beitrag (Free/Gebühr), Beschreibung, Link
- **Actions**: Close (X button or click overlay)
- **Animation**: Fade in + scale from 0.95 to 1

### Authentication
- Firebase Email/Password Auth
- **Login page**: Email, Password, "Anmelden" button, "Noch kein Konto? Registrieren"
- **Register page**: Email, Password, "Passwort bestätigen", "Registrieren"
- **Logout**: Header nav button
- Protected routes redirect to /login

### Event CRUD (Admin only)
- **Create**: Form with all fields, validation, save to Firestore
- **Read**: List of user's events with edit/delete buttons
- **Update**: Same form pre-filled, update in Firestore
- **Delete**: Confirmation dialog, remove from Firestore

### Event Fields (Firestore Schema)
```typescript
interface Event {
  id: string;
  title: string;
  date: string;        // ISO date string (YYYY-MM-DD)
  time: string;        // HH:MM format
  place: string;       // Address
  contribution: 'free' | 'fee';
  fee?: number;        // Optional, in EUR
  description: string;
  link?: string;       // Ticket/info URL
  createdBy: string;   // Firebase UID
  createdAt: Timestamp;
}
```

### Edge Cases
- No events in month: show subtle empty state "Keine Events in diesem Monat"
- Past events: show but visually dimmed
- Long titles in calendar: truncate with ellipsis
- Invalid form: inline validation messages

## 5. Component Inventory

### `<Header />`
- Logo text left, nav right
- Login/Logout or Admin link based on auth state
- Sticky, backdrop-blur on scroll

### `<Footer />`
- Copyright text with app name
- Links to Datenschutz and Nutzungsbedingungen pages
- Minimal styling matching the overall design

### `<Calendar />`
- Month/year display with arrows
- 6-week grid (42 cells)
- Day cells with event indicators
- States: current month, other month (dimmed), today (accent border), has-events

### `<EventChip />`
- Small colored chip on calendar day
- Title truncated to 15 chars
- Color: sage for free, taupe for fee events

### `<EventModal />`
- Overlay + centered card
- All event details
- Close button (X) top-right
- Link button if URL present

### `<AuthForm />`
- Email input, Password input, Submit button
- Toggle between login/register
- Error message display
- Loading state on submit

### `<EventForm />`
- All event fields with labels
- Contribution toggle (Free / Gebühr)
- Fee input shown only when "Gebühr" selected
- Submit with loading state
- Validation errors inline

### `<EventList />`
- Card grid of user's events
- Each card: title, date, edit/delete buttons
- Empty state when no events

## 6. Technical Approach

### Stack
- **Vite** + **React 18** (SPA)
- **React Router v6** (client-side routing)
- **Firebase v10** (Auth + Firestore)
- **CSS Modules** or plain CSS with variables (no Tailwind)
- **Lucide React** (icons)

### Project Structure
```
src/
  components/
    Header/
    Calendar/
    EventModal/
    AuthForm/
    EventForm/
    EventList/
  pages/
    CalendarPage.jsx
    LoginPage.jsx
    AdminPage.jsx
    EventFormPage.jsx
    LegalPage.jsx
  lib/
    firebase.js        # Firebase init + exports
  hooks/
    useAuth.js
    useEvents.js
  App.jsx
  main.jsx
  index.css           # Global styles + CSS variables
```

### Firebase Setup (User will provide credentials)
- Auth: Email/Password provider enabled
- Firestore: Collection `events`
- Security: Users can only read all events, but only write/update/delete their own

### Routing Guards
- `/admin/*` requires authentication (redirect to /login)
- Public routes: `/`, `/login`
