import { useMemo, useState, useEffect } from 'react';
import Calendar from './Calendar';
import { SEED_CATEGORIES } from '../utils/categoryColors';
import './ThemeEditorSandbox.css';

// Theme Editor v2 — live preview surface.
//
// Renders the real `<Calendar>` widget inside a wrapper that re-skins
// itself with the editor's CSS variable values via inline `style`. CSS
// custom properties inherit down the DOM, so the calendar picks up
// every value painted on the wrapper — no global `:root` mutation,
// no `<style>` injection, no iframe.
//
// Why inline-style and not a scoped `<style>` tag?
//   - Zero DOM side effects (no head/body appendChild/removeChild).
//   - React's reconciler handles cleanup automatically on unmount.
//   - The wrapper `.theme-editor-sandbox` is more specific than `:root`
//     in the cascade, so the sidebar's own theme chrome (which still
//     reads from `:root`) stays untouched by editor drafts.
//
// Why demo events and not real Firestore events?
//   - Decouples the editor from live data so the preview is always
//     populated even when the database is empty.
//   - Lets the admin audition a theme against a known, varied set of
//     contribution types / categories / time-of-day combinations.
//   - Avoids leaking preview drafts into the public calendar via
//     accidental subscriptions.
//
// `values` is the editor's draft (`{ '--accent-primary': '#…', … }`).
// Any token not provided falls back to the bundled default so a half-
// painted editor never renders with undefined CSS variables.
function buildDemoEvents(currentMonth) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  // Spread events across the visible month plus a few days on either
  // side so navigating to neighbouring months still shows content.
  const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const clamp = (d) => Math.max(1, Math.min(daysInMonth, d));
  const day = (offset) => clamp(Math.min(daysInMonth, Math.max(1, 8 + offset)));

  const today = new Date();
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());

  const samples = [
    { title: 'Morgen-Yoga im Park', category: 'Yoga', contribution: 'free', days: [day(0)] },
    {
      title: 'Atemkreis – Breathwork Abend',
      category: 'Breathwork',
      contribution: 'fee',
      days: [day(2), day(16)],
    },
    { title: 'Still-Meditation', category: 'Meditation', contribution: 'donation', days: [day(4)] },
    { title: 'Tanz & Bewegung', category: 'Tanz', contribution: 'fee', days: [day(6), day(20)] },
    { title: 'Herzchakra Singkreis', category: 'Singen', contribution: 'donation', days: [day(8)] },
    {
      title: 'Soundhealing – Klangbad',
      category: 'Soundhealing',
      contribution: 'fee',
      days: [day(10)],
    },
    { title: 'Offener Frauentreff', category: 'Sonstiges', contribution: 'free', days: [day(12)] },
    { title: 'Vollmondritual', category: 'Meditation', contribution: 'donation', days: [day(14)] },
    {
      title: 'Workshop: Intuitives Malen',
      category: 'Sonstiges',
      contribution: 'fee',
      days: [day(18)],
    },
    { title: 'Sonnengruß am See', category: 'Yoga', contribution: 'free', days: [day(22)] },
  ];

  return samples.map((sample, index) => {
    const isoDay = iso(year, month, sample.days[0]);
    return {
      id: `demo-${index}`,
      title: sample.title,
      date: isoDay,
      endDate: '',
      time: '',
      endTime: '',
      place: 'Bregenz',
      bezirk: 'Bregenz',
      categories: [sample.category],
      contribution: sample.contribution,
      fee: sample.contribution === 'fee' ? '25' : null,
      recurrence: 'none',
      status: 'approved',
      slug: `demo-${index}`,
      createdBy: 'demo',
      // Tag with `isDemo` so tests can target demo events specifically.
      isDemo: true,
      isToday: isoDay === todayIso,
    };
  });
}

export default function ThemeEditorSandbox({ values, testIdPrefix = 'theme-editor-sandbox' }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const categoryColorByName = useMemo(() => {
    const map = new Map();
    for (const cat of SEED_CATEGORIES) map.set(cat.name, cat.color);
    return map;
  }, []);

  // Calendar expects an array of category-name strings (rendered into a
  // legend). The seed registry gives us `{id, name, color}` objects;
  // project that to names so the legend renders correctly.
  const categories = useMemo(() => SEED_CATEGORIES.map((c) => c.name), []);

  // Reset to the current month when the sandbox first mounts so demo
  // events always start near "today". Don't reset on subsequent renders
  // — the admin might have navigated to a neighbouring month on purpose.
  useEffect(() => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  const events = useMemo(() => buildDemoEvents(currentMonth), [currentMonth]);

  // Convert the values object into inline-style CSS custom properties.
  // React serializes numeric values without units; CSS variables are
  // strings so we coerce defensively.
  const wrapperStyle = {};
  for (const [name, value] of Object.entries(values || {})) {
    if (typeof value === 'string' && value.length > 0) {
      wrapperStyle[name] = value;
    }
  }

  return (
    <div
      className="theme-editor-sandbox"
      style={wrapperStyle}
      data-testid={testIdPrefix}
      aria-label="Live-Vorschau des Kalenders mit den aktuellen Theme-Werten"
    >
      <div className="theme-editor-sandbox-chrome" data-testid={`${testIdPrefix}-chrome`}>
        <span className="theme-editor-sandbox-chrome-dot" aria-hidden="true" />
        <span className="theme-editor-sandbox-chrome-label">Live-Vorschau · Demo-Events</span>
      </div>
      <div className="theme-editor-sandbox-frame" data-testid={`${testIdPrefix}-frame`}>
        <Calendar
          events={events}
          onEventClick={() => {}}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
          categoryColorByName={categoryColorByName}
          categories={categories}
        />
      </div>
      {/* Hidden marker so tests can verify the inline style was applied
          to the actual sandbox subtree (not just the chrome). */}
      <span
        className="theme-editor-sandbox-probe"
        data-testid={`${testIdPrefix}-probe`}
        aria-hidden="true"
      />
    </div>
  );
}

// Re-export for tests.
ThemeEditorSandbox.buildDemoEvents = buildDemoEvents;
