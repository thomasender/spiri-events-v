import { Link } from 'react-router-dom';
import { formatDuration, formatLogTime, timeToMillis } from '../utils/moderationLog';

/**
 * Block "In Klärung" of the Protokoll tab: pending events with at least one
 * staff message, longest in Klärung first. Rows come ready-made from
 * ModerationLogTab ({ id, title, regionName, moderatorName, sinceMs,
 * createdAt, updatedAt }). Pending events have no public page, so the title is
 * text and "Bearbeiten" leads to the editor.
 */
export default function ModerationClarificationTable({ rows, now, multiRegion }) {
  return (
    <section className="modlog-clarification" data-testid="modlog-clarification">
      <h3 className="modlog-clarification-title">In Klärung ({rows.length})</h3>
      {rows.length === 0 ? (
        <p className="modlog-empty" data-testid="modlog-clarification-empty">
          Keine Events in Klärung
        </p>
      ) : (
        <div className="modlog-table-wrap">
          <table className="modlog-table">
            <thead>
              <tr>
                <th>Event</th>
                {multiRegion && <th>Region</th>}
                <th>Moderator:in</th>
                <th>In Klärung seit</th>
                <th>Eingereicht</th>
                <th>Zuletzt bearbeitet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-testid="modlog-clarification-row">
                  <td className="modlog-event">
                    <span className="modlog-event-title">{row.title || 'Ohne Titel'}</span>
                    <Link className="modlog-detail modlog-edit-link" to={`/admin/edit/${row.id}`}>
                      Bearbeiten
                    </Link>
                  </td>
                  {multiRegion && <td>{row.regionName}</td>}
                  <td>{row.moderatorName || 'Unbekannt'}</td>
                  <td className="modlog-time" title={formatLogTime(row.sinceMs)}>
                    {formatDuration(row.sinceMs, now)}
                  </td>
                  <td className="modlog-time">{formatLogTime(timeToMillis(row.createdAt))}</td>
                  <td className="modlog-time">{formatLogTime(timeToMillis(row.updatedAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
