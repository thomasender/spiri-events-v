import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAdminFunFacts } from '../hooks/useAdminFunFacts';
import {
  MONTH_LABELS,
  WEEKDAY_LABELS,
  formatCount,
  formatDateTime,
  formatDay,
  formatShare,
  formatSpan,
  funFactsErrorMessage,
  peakIndex,
} from '../utils/funFacts';
import './FunFactsTab.css';

const WEEKDAY_NAMES = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
];
const MONTH_NAMES = [
  'Jänner',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

function Tile({ value, label, note, testId }) {
  return (
    <div className="funfacts-tile" data-testid={testId}>
      <span className="funfacts-tile-value">{value}</span>
      <span className="funfacts-tile-label">{label}</span>
      {note && <span className="funfacts-tile-note">{note}</span>}
    </div>
  );
}

function Bars({ labels, values, testId }) {
  const max = Math.max(1, ...(values ?? []));
  return (
    <ul className="funfacts-bars" data-testid={testId}>
      {labels.map((label, i) => (
        <li key={label} className="funfacts-bar-row">
          <span className="funfacts-bar-label">{label}</span>
          <span className="funfacts-bar-track">
            <span
              className="funfacts-bar"
              style={{ '--bar-width': `${((values?.[i] ?? 0) / max) * 100}%` }}
            />
          </span>
          <span className="funfacts-bar-value">{formatCount(values?.[i] ?? 0)}</span>
        </li>
      ))}
    </ul>
  );
}

function RankList({ rows, empty, testId }) {
  if (!rows?.length) return <p className="funfacts-empty">{empty}</p>;
  return (
    <ol className="funfacts-rank" data-testid={testId}>
      {rows.map((row, i) => (
        <li key={`${row.label}-${i}`}>
          <span className="funfacts-rank-name">{row.label}</span>
          <span className="funfacts-rank-value">{row.value}</span>
        </li>
      ))}
    </ol>
  );
}

// Super-Admin tab: playful numbers over the moderation log (since the log
// exists, not since the app started; the data note says so).
export default function FunFactsTab() {
  const { facts, loading, error, refresh } = useAdminFunFacts();
  const ev = facts?.events;
  const time = facts?.approvalTime;
  const reviewedApprovals = ev ? ev.approvedRightAway + ev.neededReview : 0;
  const weekdayPeak = peakIndex(facts?.weekdays);
  const monthPeak = peakIndex(facts?.months);

  return (
    <div className="funfacts-tab" data-testid="funfacts-tab">
      <div className="funfacts-toolbar">
        <p className="funfacts-stand" data-testid="funfacts-computed-at">
          {facts?.computedAt ? `Stand: ${formatDateTime(facts.computedAt)}` : ' '}
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={refresh}
          disabled={loading}
          data-testid="funfacts-refresh"
        >
          <RefreshCw size={16} aria-hidden="true" />
          <span>Aktualisieren</span>
        </button>
      </div>

      {error && (
        <div className="funfacts-error" role="alert" data-testid="funfacts-error">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{funFactsErrorMessage(error)}</span>
        </div>
      )}

      {loading && !facts && <p className="funfacts-empty">Zähle nach …</p>}

      {facts && (
        <>
          <div className="funfacts-since" data-testid="funfacts-since">
            <strong>
              {facts.since
                ? `Gezählt seit ${formatDay(facts.since)}`
                : 'Noch keine Einträge im Protokoll'}
            </strong>
            <span>
              Die Zahlen stammen aus dem Moderationsprotokoll, nicht aus der Zeit seit dem Start der
              App: Abgelaufene Events werden nach einiger Zeit gelöscht, ihre Geschichte ist damit
              weg.{' '}
              {facts.totalEntries > 0 &&
                `${formatCount(facts.backfillEntries)} von ${formatCount(facts.totalEntries)} Einträgen (${formatShare(facts.backfillEntries, facts.totalEntries)}) wurden nachträglich aus der Änderungshistorie der Events rekonstruiert; dort fehlen manche Details.`}
            </span>
          </div>

          <section className="funfacts-section">
            <h2>Events</h2>
            <div className="funfacts-tiles">
              <Tile
                testId="funfacts-submitted"
                value={formatCount(ev.submitted)}
                label="Events eingereicht"
              />
              <Tile
                testId="funfacts-direct"
                value={formatCount(ev.directPublished)}
                label="direkt vom Team veröffentlicht"
              />
              <Tile
                testId="funfacts-published"
                value={formatCount(ev.published)}
                label="Events veröffentlicht"
              />
              <Tile testId="funfacts-rejected" value={formatCount(ev.rejected)} label="abgelehnt" />
              <Tile
                testId="funfacts-cancelled"
                value={formatCount(ev.cancelled)}
                label="abgesagt"
              />
              <Tile
                testId="funfacts-unpublished"
                value={formatCount(ev.unpublished)}
                label="offline genommen"
              />
            </div>
          </section>

          <section className="funfacts-section">
            <h2>Wie lief das Review?</h2>
            <div className="funfacts-tiles">
              <Tile
                testId="funfacts-right-away"
                value={formatCount(ev.approvedRightAway)}
                label="sofort freigegeben"
                note={formatShare(ev.approvedRightAway, reviewedApprovals)}
              />
              <Tile
                testId="funfacts-review"
                value={formatCount(ev.neededReview)}
                label="brauchten mindestens eine Runde"
                note={formatShare(ev.neededReview, reviewedApprovals)}
              />
              <Tile
                testId="funfacts-review-more"
                value={formatCount(ev.neededMoreThanOneReview)}
                label="brauchten mehr als eine Runde"
                note={formatShare(ev.neededMoreThanOneReview, reviewedApprovals)}
              />
            </div>
            <p className="funfacts-hint" data-testid="funfacts-review-hint">
              Eine Runde heißt: zurück zur Überarbeitung, vom Team bearbeitet oder eine Rückfrage
              gestellt, bevor das Event freigegeben wurde.{' '}
              {facts.clarificationsSince
                ? `Rückfragen zählen erst seit ${formatDay(facts.clarificationsSince)} mit, ältere Events wirken daher etwas „glatter“, als sie waren.`
                : 'Rückfragen werden erst ab jetzt mitgezählt, ältere Events wirken daher etwas „glatter“, als sie waren.'}
            </p>
          </section>

          <section className="funfacts-section">
            <h2>Vom Einreichen bis zur Freigabe</h2>
            {time.count > 0 ? (
              <div className="funfacts-tiles">
                <Tile
                  testId="funfacts-median"
                  value={formatSpan(time.medianMs)}
                  label="typische Wartezeit (Median)"
                />
                <Tile
                  testId="funfacts-average"
                  value={formatSpan(time.averageMs)}
                  label="im Durchschnitt"
                />
                <Tile
                  testId="funfacts-fastest"
                  value={formatSpan(time.fastest?.ms)}
                  label="am schnellsten"
                  note={time.fastest?.title}
                />
                <Tile
                  testId="funfacts-slowest"
                  value={formatSpan(time.slowest?.ms)}
                  label="am längsten"
                  note={time.slowest?.title}
                />
              </div>
            ) : (
              <p className="funfacts-empty">Noch keine Freigabe mit bekanntem Einreichzeitpunkt.</p>
            )}
            <p className="funfacts-hint">
              Gemessen über {formatCount(time.count)} Events, vom ersten Einreichen bis zur ersten
              Freigabe.
            </p>
          </section>

          <div className="funfacts-grid">
            <section className="funfacts-card">
              <h2>Freigabe-Champions</h2>
              <RankList
                testId="funfacts-champions"
                empty="Noch keine Freigaben im Protokoll."
                rows={(facts.champions ?? []).map((c) => ({
                  label: c.name,
                  value: `${formatCount(c.approvals)} Freigaben`,
                }))}
              />
            </section>
            <section className="funfacts-card">
              <h2>Aktivste Veranstalter:innen</h2>
              <p className="funfacts-hint">
                {formatCount(facts.organizers?.distinct)} verschiedene Veranstalter:innen
              </p>
              <RankList
                testId="funfacts-organizers"
                empty="Noch keine Events im Protokoll."
                rows={(facts.organizers?.top ?? []).map((o) => ({
                  label: o.name || 'Anonym',
                  value: `${formatCount(o.events)} Events`,
                }))}
              />
            </section>
          </div>

          <div className="funfacts-grid">
            <section className="funfacts-card">
              <h2>Wochentag der Termine</h2>
              {weekdayPeak >= 0 && (
                <p className="funfacts-hint">Beliebtester Tag: {WEEKDAY_NAMES[weekdayPeak]}</p>
              )}
              <Bars testId="funfacts-weekdays" labels={WEEKDAY_LABELS} values={facts.weekdays} />
            </section>
            <section className="funfacts-card">
              <h2>Monat der Termine</h2>
              {monthPeak >= 0 && (
                <p className="funfacts-hint">Stärkster Monat: {MONTH_NAMES[monthPeak]}</p>
              )}
              <Bars testId="funfacts-months" labels={MONTH_LABELS} values={facts.months} />
            </section>
          </div>

          <section className="funfacts-section">
            <h2>Community</h2>
            <div className="funfacts-tiles">
              <Tile
                testId="funfacts-users"
                value={formatCount(facts.users)}
                label="Nutzer:innen gesamt"
              />
              <Tile
                testId="funfacts-favorites"
                value={formatCount(facts.favorites)}
                label="Favoriten gesetzt"
              />
            </div>
            <p className="funfacts-hint">
              Diese beiden Zahlen sind der Stand von heute, unabhängig vom Protokoll.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
