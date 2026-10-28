import { AlertTriangle, X } from 'lucide-react';
import { ADVANCED_GROUPS, LAYOUT_TOKENS_BY_NAME, describeValue } from '../../utils/layoutTokens';
import { describeSides } from '../../utils/designOverlayModel';
import { getEffectiveValue, useLayoutState } from '../../lib/layoutStore';
import TokenControl, { ResetButtons } from './TokenControl';

const WIDTH = 320;

// Small editor next to the clicked chip: slider, number field, reset buttons
// and — so nobody changes something big by accident — how many places in the
// stylesheets use the token.
export default function TokenPopover({ chip, usage, kindLabel, onClose }) {
  const layout = useLayoutState();
  const token = LAYOUT_TOKENS_BY_NAME[chip.token];
  if (!token) return null;

  const current = getEffectiveValue(token.name);
  const published = layout.published[token.name] ?? token.default;
  const advanced = ADVANCED_GROUPS.has(token.group);
  const sides = chip.sides.length ? describeSides(chip.sides) : null;

  const left =
    chip.x + 24 + WIDTH > window.innerWidth ? Math.max(8, chip.x - WIDTH - 24) : chip.x + 24;
  const top = Math.min(Math.max(8, chip.y - 40), Math.max(8, window.innerHeight - 380));

  return (
    <div
      className="dm-popover"
      data-design-ui
      role="dialog"
      aria-label={`${token.label} anpassen`}
      style={{ left, top, width: WIDTH }}
    >
      <header className="dm-popover-head">
        <div>
          <h2 className="dm-popover-title">{token.label}</h2>
          <p className="dm-popover-sub">
            {kindLabel}
            {sides ? ` · ${sides}` : ''}
          </p>
        </div>
        <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="Schließen">
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <code className="dm-code">{token.name}</code>

      <TokenControl token={token} value={current} />

      <dl className="dm-facts">
        <div>
          <dt>Aktuell</dt>
          <dd>{describeValue(token, current)}</dd>
        </div>
        <div>
          <dt>Veröffentlicht</dt>
          <dd>{describeValue(token, published)}</dd>
        </div>
        <div>
          <dt>Standard</dt>
          <dd>{describeValue(token, token.default)}</dd>
        </div>
      </dl>

      <ResetButtons token={token} published={published} current={current} />

      <p className="dm-usage">
        Wird in <strong>{usage}</strong> {usage === 1 ? 'CSS-Regel' : 'CSS-Regeln'} verwendet und
        gilt dort für alle gleichartigen Elemente.
      </p>
      {advanced && (
        <p className="dm-warning">
          <AlertTriangle size={14} aria-hidden="true" /> Skalenwert: verändert jede Stelle, die
          genau diese Stufe nutzt. Für einzelne Bereiche lieber einen spezifischen Regler nehmen.
        </p>
      )}
      <p className="dm-hint">{token.description}</p>
    </div>
  );
}
