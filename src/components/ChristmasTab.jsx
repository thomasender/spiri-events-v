import { useMemo, useState } from 'react';
import { Download, ExternalLink, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  saveChristmasContent,
  useChristmasPage,
  useChristmasRegistrations,
} from '../hooks/useChristmasPage';
import {
  CHRISTMAS_CAPACITY,
  CHRISTMAS_PATH,
  registrationsToCsv,
  summarizeRegistrations,
} from '../lib/christmasPage';
import './ChristmasTab.css';

// Admin tab "Weihnachtsfeier" (Super-Admins): link to the page (texts and flyer are edited
// right on the page), the publish switch and the registrations with the Mitbringliste.
export default function ChristmasTab() {
  const { user } = useAuth();
  const page = useChristmasPage();
  const regs = useChristmasRegistrations(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const summary = useMemo(() => summarizeRegistrations(regs.list), [regs.list]);

  const togglePublished = async () => {
    const next = !page.published;
    const ask = next
      ? 'Die Seite für alle freigeben? Wer den Link kennt, kann sie dann sehen und sich anmelden. Auf der Website wird weiterhin nichts verlinkt.'
      : 'Die Seite wieder nur für Admins sichtbar machen?';
    if (!window.confirm(ask)) return;
    setBusy(true);
    setError(null);
    try {
      await saveChristmasContent({ content: page.content, published: next, uid: user.uid });
    } catch (err) {
      console.warn('Weihnachtsfeier publish failed:', err?.code || err);
      setError('Das hat nicht geklappt. Bitte versuche es noch einmal.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Anmeldung von ${r.name} löschen?`)) return;
    try {
      await regs.remove(r.id);
    } catch (err) {
      console.warn('Registration delete failed:', err?.code || err);
      setError('Die Anmeldung konnte nicht gelöscht werden.');
    }
  };

  const download = () => {
    const blob = new Blob(['﻿' + registrationsToCsv(regs.list)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'weihnachtsfeier-anmeldungen.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="xmas-tab" data-testid="xmas-tab">
      <section className="xmas-tab-card">
        <div>
          <h2>Seite „Tribe-Weihnachtsfeier“</h2>
          <p>
            Texte, Ablauf und Flyer änderst du direkt auf der Seite: Öffne sie und klicke oben auf
            „Seite bearbeiten“.
          </p>
          <p className={`xmas-tab-state${page.published ? ' xmas-tab-state--live' : ''}`}>
            {page.published
              ? 'Freigegeben: erreichbar für alle mit dem Link (nirgends verlinkt).'
              : 'Noch nicht freigegeben: nur Admins sehen die Seite.'}
          </p>
        </div>
        <div className="xmas-tab-actions">
          <Link className="xmas-tab-btn" to={CHRISTMAS_PATH}>
            <ExternalLink size={16} aria-hidden="true" /> Seite öffnen
          </Link>
          <button type="button" className="xmas-tab-btn" onClick={togglePublished} disabled={busy}>
            {page.published ? (
              <>
                <EyeOff size={16} aria-hidden="true" /> Wieder verstecken
              </>
            ) : (
              <>
                <Eye size={16} aria-hidden="true" /> Für alle freigeben
              </>
            )}
          </button>
        </div>
      </section>
      {error && (
        <p className="xmas-tab-error" role="alert">
          {error}
        </p>
      )}

      <section className="xmas-tab-card xmas-tab-card--col">
        <div className="xmas-tab-stats">
          <div>
            <strong>{summary.registrations}</strong>
            <span>Anmeldungen</span>
          </div>
          <div>
            <strong>
              {summary.persons} / {CHRISTMAS_CAPACITY}
            </strong>
            <span>Personen</span>
          </div>
        </div>
        {summary.bring.length > 0 && (
          <p className="xmas-tab-bring">
            <strong>Mitbringliste:</strong>{' '}
            {summary.bring.map((b) => `${b.label} (${b.count})`).join(' · ')}
          </p>
        )}
        <div>
          <button
            type="button"
            className="xmas-tab-btn"
            onClick={download}
            disabled={regs.list.length === 0}
          >
            <Download size={16} aria-hidden="true" /> Als CSV herunterladen
          </button>
        </div>
      </section>

      {regs.loading ? (
        <div className="loading-spinner"></div>
      ) : regs.list.length === 0 ? (
        <p className="xmas-tab-empty">Noch keine Anmeldungen.</p>
      ) : (
        <ul className="xmas-tab-list">
          {regs.list.map((r) => (
            <li key={r.id}>
              <div className="xmas-tab-reg">
                <strong>{r.name}</strong>
                <span>
                  {r.persons} {r.persons === 1 ? 'Person' : 'Personen'} · {r.contact}
                </span>
                {r.bring?.length > 0 && <span>Bringt mit: {r.bring.join(', ')}</span>}
                {r.note && <span className="xmas-tab-note">„{r.note}“</span>}
              </div>
              <button
                type="button"
                className="xmas-tab-icon"
                aria-label={`Anmeldung von ${r.name} löschen`}
                onClick={() => remove(r)}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {regs.error && <p className="xmas-tab-error">{regs.error}</p>}
    </div>
  );
}
