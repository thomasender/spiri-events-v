import { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAdminAnalytics } from '../hooks/useAdminAnalytics';
import { useRegion } from '../hooks/useRegion';
import './AnalyticsTab.css';

export const RANGES = [7, 30];

export const ACTION_LABELS = {
  select_content: 'Event geöffnet',
  favorite_add: 'Favorit gesetzt',
  share: 'Event geteilt',
  outbound_click: 'Externer Link geklickt',
  donate_click: 'Spenden-Klick',
  donate_complete: 'Spende abgeschlossen',
  sign_up: 'Registrierung',
  event_create_start: 'Event-Erstellung begonnen',
  event_create_submit: 'Event eingereicht',
  pwa_install_prompt: 'App-Installation angeboten',
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
  const [region, setRegion] = useState('');
  const { report, loading, error, reload } = useAdminAnalytics(days, region || null);
  const { regions, combinedViews } = useRegion();

  // Slug -> display name for active regions and combined views; slugs GA knows
  // but the register does not (e.g. a deactivated region) show as the slug.
  const regionNames = new Map([
    ...(combinedViews ?? []).map((v) => [v.slug, v.name ?? v.label]),
    ...regions.map((r) => [r.id, r.name]),
  ]);
  const regionRows = report?.regions ?? [];
  const showRegionSelect = regions.length >= 2 || regionRows.length > 1 || Boolean(region);
  const regionOptions = [...regionNames.keys()];
  if (region && !regionNames.has(region)) regionOptions.push(region);

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
        {showRegionSelect && (
          <select
            className="analytics-region-select"
            aria-label="Region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            data-testid="analytics-region-select"
          >
            <option value="">Alle Regionen</option>
            {regionOptions.map((slug) => (
              <option key={slug} value={slug}>
                {regionNames.get(slug) ?? slug}
              </option>
            ))}
          </select>
        )}
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

      {report?.regionDimension === 'unavailable' && (
        <p className="analytics-hint" role="status" data-testid="analytics-region-unavailable">
          Für die Auswertung pro Region muss in Google Analytics einmalig die benutzerdefinierte
          Dimension „region“ angelegt werden (Anleitung in AGENTS.md).
        </p>
      )}

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

          {regionRows.length > 0 && (
            <section className="analytics-card" data-testid="analytics-regions">
              <h2>Regionen im Vergleich</h2>
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th scope="col">Region</th>
                    <th scope="col">Besucher:innen</th>
                    <th scope="col">Seitenaufrufe</th>
                    <th scope="col">Besuche</th>
                  </tr>
                </thead>
                <tbody>
                  {regionRows.map((r) => (
                    <tr key={r.name} data-testid="analytics-region-row">
                      <th scope="row">{regionNames.get(r.name) ?? r.name}</th>
                      <td>{formatNumber(r.users)}</td>
                      <td>{formatNumber(r.pageViews)}</td>
                      <td>{formatNumber(r.sessions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

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
