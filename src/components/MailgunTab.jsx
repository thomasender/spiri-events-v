import { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAdminMailgunUsage } from '../hooks/useAdminMailgunUsage';
import { formatDay, formatNumber, RANGES } from './AnalyticsTab';
import './AnalyticsTab.css';
import './MailgunTab.css';

function Kpi({ label, value }) {
  return (
    <div className="analytics-kpi" data-testid="mailgun-kpi">
      <span className="analytics-kpi-value">{formatNumber(value)}</span>
      <span className="analytics-kpi-label">{label}</span>
    </div>
  );
}

function DailyChart({ daily }) {
  const max = Math.max(...daily.map((d) => d.sent), 1);
  return (
    <div
      className="analytics-daily"
      role="img"
      aria-label="Versendete E-Mails pro Tag"
      data-testid="mailgun-daily"
    >
      {daily.map((d) => (
        <div
          key={d.date}
          className="analytics-daily-col"
          title={`${formatDay(d.date)}: ${formatNumber(d.sent)} E-Mails`}
        >
          <span
            className="analytics-daily-bar"
            style={{ height: `${Math.max((d.sent / max) * 100, d.sent ? 3 : 0)}%` }}
          />
          <span className="analytics-daily-day">{formatDay(d.date)}</span>
        </div>
      ))}
    </div>
  );
}

/** "420 von 1.000" with a bar; without a known limit only the count is shown. */
function QuotaCard({ month }) {
  const { sent, limit, limitSource } = month;
  const percent = limit ? Math.min(Math.round((sent / limit) * 100), 100) : 0;
  const level = percent >= 90 ? 'danger' : percent >= 75 ? 'warn' : 'ok';
  return (
    <section className="analytics-card" data-testid="mailgun-quota">
      <h2>Kontingent diesen Monat</h2>
      {limit ? (
        <>
          <p className="mailgun-quota-figures">
            <strong>{formatNumber(sent)}</strong> von {formatNumber(limit)} E-Mails ({percent} %)
          </p>
          <div
            className="mailgun-quota-track"
            role="progressbar"
            aria-label="Verbrauchtes Kontingent"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span
              className={`mailgun-quota-fill mailgun-quota-fill--${level}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="analytics-empty">
            {limitSource === 'mailgun'
              ? 'Limit aus den Mailgun-Einstellungen.'
              : 'Limit des gebuchten Tarifs (in der Software hinterlegt).'}
          </p>
        </>
      ) : (
        <>
          <p className="mailgun-quota-figures">
            <strong>{formatNumber(sent)}</strong> E-Mails seit Monatsbeginn
          </p>
          <p className="analytics-empty">Das Tarif-Limit ist nicht hinterlegt.</p>
        </>
      )}
    </section>
  );
}

function errorMessage(error) {
  const message = error?.message;
  return typeof message === 'string' && message
    ? message.replace(/^[\w-]+\/[\w-]+:\s*/, '')
    : 'Die E-Mail-Statistik konnte nicht geladen werden.';
}

// Admin tab: how many e-mails Mailgun processed for us and how much of the
// monthly quota is used up.
export default function MailgunTab() {
  const [days, setDays] = useState(7);
  const { report, loading, error, reload } = useAdminMailgunUsage(days);

  return (
    <div className="analytics-tab" data-testid="mailgun-tab">
      <div className="analytics-toolbar">
        <div className="analytics-ranges" role="group" aria-label="Zeitraum">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={`analytics-range${days === r ? ' analytics-range--active' : ''}`}
              aria-pressed={days === r}
              onClick={() => setDays(r)}
              data-testid={`mailgun-range-${r}`}
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
          data-testid="mailgun-reload"
        >
          <RefreshCw size={16} aria-hidden="true" />
          <span>Aktualisieren</span>
        </button>
      </div>

      <p className="analytics-hint">
        Zahlen von Mailgun, dem Dienst, über den alle E-Mails der Plattform verschickt werden. Die
        Daten sind bis zu 10 Minuten alt.
      </p>

      {error && (
        <div className="analytics-error" role="alert" data-testid="mailgun-error">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{errorMessage(error)}</span>
        </div>
      )}

      {loading && !report && <p className="analytics-empty">Lade E-Mail-Statistik …</p>}

      {report && (
        <>
          <QuotaCard month={report.month} />

          <div className="analytics-kpis">
            <Kpi label="Verschickt" value={report.totals.sent} />
            <Kpi label="Zugestellt" value={report.totals.delivered} />
            <Kpi label="Fehlgeschlagen" value={report.totals.failed} />
          </div>

          <section className="analytics-card">
            <h2>E-Mails pro Tag</h2>
            <DailyChart daily={report.daily} />
          </section>
        </>
      )}
    </div>
  );
}
