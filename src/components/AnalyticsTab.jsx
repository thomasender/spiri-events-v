import { useState } from 'react';
import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { useAdminAnalytics } from '../hooks/useAdminAnalytics';
import './AnalyticsTab.css';

export const RANGES = [7, 30];

export const ACTION_LABELS = {
  select_content: 'Event geöffnet',
  favorite_add: 'Favorit gesetzt',
  share: 'Event geteilt',
  outbound_click: 'Externer Link geklickt',
  organizer_link_click: '„Mehr Infos“ beim Event geklickt',
  calendar_add: 'Event in Kalender gespeichert',
  donate_click: 'Spenden-Klick',
  donate_complete: 'Spende abgeschlossen',
  sign_up: 'Registrierung',
  event_create_start: 'Event-Erstellung begonnen',
  event_create_submit: 'Event eingereicht',
  pwa_install: 'App installiert',
};

const CHANNEL_LABELS = {
  'Organic Social': 'Social Media (organisch)',
  'Organic Search': 'Suchmaschinen',
  Direct: 'Direkt',
  Referral: 'Andere Webseiten',
  Unassigned: 'Nicht zugeordnet',
  'Paid Search': 'Bezahlte Suche',
  Email: 'E-Mail',
};

const DEVICE_LABELS = { mobile: 'Handy', desktop: 'Computer', tablet: 'Tablet' };

const nf = new Intl.NumberFormat('de-DE');
export const formatNumber = (n) => nf.format(n ?? 0);

export function formatDay(iso) {
  const [, m, d] = String(iso).split('-');
  return `${Number(d)}.${Number(m)}.`;
}

function Kpi({ label, value }) {
  return (
    <div className="analytics-kpi" data-testid="analytics-kpi">
      <span className="analytics-kpi-value">{formatNumber(value)}</span>
      <span className="analytics-kpi-label">{label}</span>
    </div>
  );
}

/** Horizontal bars; `items` are { label, value }. */
function BarList({ items, emptyText = 'Noch keine Daten.' }) {
  if (!items.length) return <p className="analytics-empty">{emptyText}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="analytics-bars">
      {items.map((item) => (
        <li key={item.label} className="analytics-bar-row">
          <span className="analytics-bar-label" title={item.label}>
            {item.label}
          </span>
          <span className="analytics-bar-track" aria-hidden="true">
            <span
              className="analytics-bar-fill"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </span>
          <span className="analytics-bar-value">{formatNumber(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function DailyChart({ daily }) {
  const max = Math.max(...daily.map((d) => d.pageViews), 1);
  return (
    <div
      className="analytics-daily"
      role="img"
      aria-label="Seitenaufrufe pro Tag"
      data-testid="analytics-daily"
    >
      {daily.map((d) => (
        <div
          key={d.date}
          className="analytics-daily-col"
          title={`${formatDay(d.date)}: ${formatNumber(d.pageViews)} Aufrufe, ${formatNumber(d.users)} Besucher`}
        >
          <span
            className="analytics-daily-bar"
            style={{ height: `${Math.max((d.pageViews / max) * 100, d.pageViews ? 3 : 0)}%` }}
          />
          <span className="analytics-daily-day">{formatDay(d.date)}</span>
        </div>
      ))}
    </div>
  );
}

/** 75 -> "1:15 Min", 42 -> "42 Sek". */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s} Sek`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} Min`;
}

export function formatPercent(part, total) {
  if (!total) return '0 %';
  return `${Math.round((part / total) * 100)} %`;
}

const toItems = (list, labels = {}) =>
  (list ?? []).map((x) => ({ label: labels[x.label] ?? x.label, value: x.count }));

function MiniStat({ label, value, note }) {
  return (
    <div className="analytics-mini" data-testid="analytics-mini">
      <span className="analytics-mini-value">{value}</span>
      <span className="analytics-mini-label">{label}</span>
      {note && <span className="analytics-mini-note">{note}</span>}
    </div>
  );
}

function TopEventDetails({ event, actionsSince }) {
  const since = `gezählt seit ${formatDay(actionsSince)}${String(actionsSince).slice(0, 4)}`;
  return (
    <div className="analytics-event-details">
      <div className="analytics-minis">
        <MiniStat
          label="Ø Verweildauer pro Person"
          value={formatDuration(event.avgEngagementSec)}
        />
        <MiniStat
          label="„Mehr Infos“-Klicks"
          value={formatNumber(event.organizerClicks)}
          note={`${formatPercent(event.organizerClicks, event.views)} der Aufrufe · ${since}`}
        />
        <MiniStat label="Als Favorit gemerkt" value={formatNumber(event.favorites)} />
        <MiniStat label="Geteilt" value={formatNumber(event.shares)} />
        <MiniStat
          label="In Kalender gespeichert"
          value={formatNumber(event.calendarAdds)}
          note={since}
        />
        <MiniStat
          label="Wiederkehrende Besucher:innen"
          value={formatNumber(event.returningUsers)}
          note={`${formatNumber(event.newUsers)} zum ersten Mal da`}
        />
      </div>
      <div className="analytics-event-grid">
        <section>
          <h3>Woher kommen die Besucher?</h3>
          <BarList items={toItems(event.sources)} />
        </section>
        <section>
          <h3>Von welcher Seite kamen sie?</h3>
          <BarList items={toItems(event.referrers)} />
        </section>
        <section>
          <h3>Aus welchen Orten?</h3>
          <BarList items={toItems(event.cities)} />
        </section>
        <section>
          <h3>Geräte</h3>
          <BarList items={toItems(event.devices, DEVICE_LABELS)} />
        </section>
      </div>
      <a
        className="analytics-event-link"
        href={`/event/${encodeURIComponent(event.slug)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>Event-Seite öffnen</span>
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </div>
  );
}

function TopEvents({ topEvents }) {
  if (!topEvents) {
    return (
      <p className="analytics-empty" data-testid="analytics-top-events-error">
        Die Event-Statistik konnte gerade nicht geladen werden. Bitte später nochmal versuchen.
      </p>
    );
  }
  if (!topEvents.events?.length) {
    return (
      <p className="analytics-empty">
        Noch keine Daten zu Event-Seiten in den letzten {topEvents.rangeDays} Tagen.
      </p>
    );
  }
  return (
    <ol className="analytics-top-events" data-testid="analytics-top-events">
      {topEvents.events.map((event, i) => (
        <li key={event.slug}>
          <details className="analytics-event" data-testid="analytics-top-event">
            <summary>
              <span className="analytics-event-rank">{i + 1}.</span>
              <span className="analytics-event-title" title={event.title}>
                {event.title}
              </span>
              <span className="analytics-event-meta">
                {formatNumber(event.views)} Aufrufe · {formatNumber(event.users)} Personen
              </span>
            </summary>
            <TopEventDetails event={event} actionsSince={topEvents.actionsSince} />
          </details>
        </li>
      ))}
    </ol>
  );
}

function errorMessage(error) {
  const message = error?.message;
  return typeof message === 'string' && message
    ? message.replace(/^[\w-]+\/[\w-]+:\s*/, '')
    : 'Die Statistik konnte nicht geladen werden.';
}

// Admin tab: the most useful visitor numbers from Google Analytics. Only
// visitors who accepted the cookie banner are counted, so every number is a
// lower bound — the hint below says so.
export default function AnalyticsTab() {
  const [days, setDays] = useState(7);
  const { report, loading, error, reload } = useAdminAnalytics(days);

  const channelItems = (report?.channels ?? []).map((c) => ({
    label: CHANNEL_LABELS[c.name] ?? c.name,
    value: c.sessions,
  }));
  const deviceItems = (report?.devices ?? []).map((d) => ({
    label: DEVICE_LABELS[d.name] ?? d.name,
    value: d.users,
  }));
  const pageItems = (report?.pages ?? []).map((p) => ({ label: p.title, value: p.views }));
  const actionItems = (report?.actions ?? []).map((a) => ({
    label: ACTION_LABELS[a.event] ?? a.event,
    value: a.count,
  }));

  return (
    <div className="analytics-tab" data-testid="analytics-tab">
      <div className="analytics-toolbar">
        <div className="analytics-ranges" role="group" aria-label="Zeitraum">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={`analytics-range${days === r ? ' analytics-range--active' : ''}`}
              aria-pressed={days === r}
              onClick={() => setDays(r)}
              data-testid={`analytics-range-${r}`}
            >
              Letzte {r} Tage
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={reload}
          disabled={loading}
          data-testid="analytics-reload"
        >
          <RefreshCw size={16} aria-hidden="true" />
          <span>Aktualisieren</span>
        </button>
      </div>

      <p className="analytics-hint">
        Es werden nur Besucher:innen gezählt, die dem Statistik-Hinweis zugestimmt haben. Die echten
        Zahlen sind daher höher (typisch das Doppelte). Admins und angemeldete Veranstalter:innen
        zählen nicht mit. Die Daten sind bis zu 10 Minuten alt.
      </p>

      {error && (
        <div className="analytics-error" role="alert" data-testid="analytics-error">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{errorMessage(error)}</span>
        </div>
      )}

      {loading && !report && <p className="analytics-empty">Lade Statistik …</p>}

      {report && (
        <>
          <div className="analytics-kpis">
            <Kpi label="Besucher:innen" value={report.totals.users} />
            <Kpi label="Davon neu" value={report.totals.newUsers} />
            <Kpi label="Besuche" value={report.totals.sessions} />
            <Kpi label="Seitenaufrufe" value={report.totals.pageViews} />
          </div>

          <section className="analytics-card">
            <h2>Seitenaufrufe pro Tag</h2>
            <DailyChart daily={report.daily} />
          </section>

          <section className="analytics-card" data-testid="analytics-top-events-card">
            <h2>Top 10 Events (letzte {report.topEvents?.rangeDays ?? 14} Tage)</h2>
            <p className="analytics-hint">
              Die meistbesuchten Event-Seiten. Auf ein Event klicken für Details. Dieser Block zeigt
              immer die letzten 14 Tage, unabhängig vom gewählten Zeitraum oben.
            </p>
            <TopEvents topEvents={report.topEvents} />
          </section>

          <div className="analytics-grid">
            <section className="analytics-card">
              <h2>Beliebteste Seiten und Events</h2>
              <BarList items={pageItems} />
            </section>
            <section className="analytics-card">
              <h2>Aktionen</h2>
              <BarList items={actionItems} />
            </section>
            <section className="analytics-card">
              <h2>Woher kommen die Besucher?</h2>
              <BarList items={channelItems} />
            </section>
            <section className="analytics-card">
              <h2>Geräte</h2>
              <BarList items={deviceItems} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
