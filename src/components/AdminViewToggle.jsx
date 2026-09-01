import { LayoutGrid, List } from 'lucide-react';
import './AdminViewToggle.css';

export default function AdminViewToggle({ viewMode, onViewModeChange, testIdPrefix }) {
  const prefix = testIdPrefix ? `${testIdPrefix}-` : '';
  return (
    <div className="admin-view-toggle" role="group" aria-label="Ansicht wechseln">
      <button
        type="button"
        className={`admin-view-toggle-list ${viewMode === 'list' ? 'active' : ''}`}
        onClick={() => onViewModeChange('list')}
        aria-pressed={viewMode === 'list'}
        data-testid={`${prefix}view-toggle-list`}
      >
        <List size={16} />
        <span>Listenansicht</span>
      </button>
      <button
        type="button"
        className={viewMode === 'card' ? 'active' : ''}
        onClick={() => onViewModeChange('card')}
        aria-pressed={viewMode === 'card'}
        data-testid={`${prefix}view-toggle-card`}
      >
        <LayoutGrid size={16} />
        <span>Kartenansicht</span>
      </button>
    </div>
  );
}
