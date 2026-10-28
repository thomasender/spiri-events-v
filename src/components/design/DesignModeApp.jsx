import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  History,
  Palette,
  AlertTriangle,
  Paintbrush,
  Rocket,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useDesignPresence } from '../../hooks/useDesignPresence';
import { discardDraft, listChanges, setDesignMode, useLayoutState } from '../../lib/layoutStore';
import DesignOverlay from './DesignOverlay';
import DesignPanel from './DesignPanel';
import PublishDialog from './PublishDialog';
import HistoryDialog from './HistoryDialog';
import './DesignMode.css';

// The on-page editor for admins. Mounted lazily by DesignModeLauncher, so
// visitors never download any of it. While mounted, the draft (this browser
// only) is painted onto the page; nothing reaches visitors until the admin
// clicks "Veröffentlichen".
export default function DesignModeApp({ onExit }) {
  const { user } = useAuth();
  const layout = useLayoutState();
  const others = useDesignPresence(user);
  const changes = listChanges(layout);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // 'publish' | 'history' | null
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    setDesignMode(true);
    return () => setDesignMode(false);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const count = changes.length;

  return (
    <>
      <DesignOverlay />
      {panelOpen && <DesignPanel onClose={() => setPanelOpen(false)} />}

      <div className="dm-toolbar" data-design-ui role="toolbar" aria-label="Design-Modus">
        {others.length > 0 && (
          <div className="dm-presence-warning" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>
              {others.join(', ')} {others.length === 1 ? 'ist' : 'sind'} gerade auch im
              Design-Modus. Bitte abstimmen, damit sich eure Veröffentlichungen nicht überschreiben.
            </span>
          </div>
        )}
        <div className="dm-toolbar-title">
          <Paintbrush size={16} aria-hidden="true" />
          <strong>Design-Modus</strong>
        </div>

        <span className={`dm-status${count ? ' is-dirty' : ''}`} role="status">
          {toast ||
            (count
              ? `Entwurf: ${count} ${count === 1 ? 'Änderung' : 'Änderungen'} (nur für dich sichtbar)`
              : 'Mit der Maus über Elemente fahren und auf eine Markierung klicken')}
        </span>

        <div className="dm-toolbar-actions">
          <button
            type="button"
            className={`dm-btn${panelOpen ? ' is-active' : ''}`}
            onClick={() => setPanelOpen((v) => !v)}
            aria-pressed={panelOpen}
          >
            <SlidersHorizontal size={14} aria-hidden="true" /> Alle Regler
          </button>
          <button type="button" className="dm-btn" onClick={() => setDialog('history')}>
            <History size={14} aria-hidden="true" /> Verlauf
          </button>
          <Link
            to="/admin/theme-editor"
            className="dm-btn"
            title="Farben werden im Theme Editor geändert"
          >
            <Palette size={14} aria-hidden="true" /> Farben
          </Link>

          {confirmDiscard ? (
            <span className="dm-confirm">
              Entwurf verwerfen?
              <button
                type="button"
                className="dm-btn dm-btn--danger"
                onClick={() => {
                  discardDraft();
                  setConfirmDiscard(false);
                }}
              >
                Ja
              </button>
              <button type="button" className="dm-btn" onClick={() => setConfirmDiscard(false)}>
                Nein
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="dm-btn"
              disabled={!count}
              onClick={() => setConfirmDiscard(true)}
            >
              <Trash2 size={14} aria-hidden="true" /> Verwerfen
            </button>
          )}

          <button
            type="button"
            className="dm-btn dm-btn--primary"
            disabled={!count}
            onClick={() => setDialog('publish')}
          >
            <Rocket size={14} aria-hidden="true" /> Veröffentlichen
          </button>
          <button
            type="button"
            className="dm-btn"
            onClick={onExit}
            title="Ein ungespeicherter Entwurf bleibt in diesem Browser erhalten"
          >
            <X size={14} aria-hidden="true" /> Beenden
          </button>
        </div>
      </div>

      {dialog === 'publish' && (
        <PublishDialog
          user={user}
          onClose={() => setDialog(null)}
          onPublished={() => {
            setDialog(null);
            setToast('Veröffentlicht – die Änderungen sind jetzt live.');
          }}
        />
      )}
      {dialog === 'history' && (
        <HistoryDialog
          onClose={() => setDialog(null)}
          onRestored={() => {
            setDialog(null);
            setPanelOpen(true);
            setToast('Alter Stand als Entwurf geladen – prüfen und veröffentlichen.');
          }}
        />
      )}
    </>
  );
}
