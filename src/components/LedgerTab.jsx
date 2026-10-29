import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Download, Wallet, AlertTriangle } from 'lucide-react';
import { useLedger } from '../hooks/useLedger';
import LedgerEditDialog from './LedgerEditDialog';
import ConfirmDialog from './ConfirmDialog';
import {
  entriesOfYear,
  formatEuro,
  formatLedgerDate,
  ledgerToCsv,
  ledgerTotals,
  ledgerYears,
  sortLedger,
} from '../utils/ledger';
import './LedgerTab.css';

function downloadCsv(entries, year) {
  const blob = new Blob([ledgerToCsv(entries)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `einnahmen-ausgaben-${year}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// Admin tab "Finanzen": simple income/expense statement. Super-Admins only.
// Mollie donations arrive on their own (mollieWebhook); every entry, manual or
// automatic, can be edited or deleted.
export default function LedgerTab() {
  const { entries, loading, error, isAdmin, addEntry, updateEntry, deleteEntry } = useLedger();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [dialog, setDialog] = useState(null); // { mode, entry }
  const [pendingDelete, setPendingDelete] = useState(null);
  const [actionError, setActionError] = useState(null);

  const years = useMemo(() => ledgerYears(entries, currentYear), [entries, currentYear]);
  const visible = useMemo(() => sortLedger(entriesOfYear(entries, year)), [entries, year]);
  const totals = useMemo(() => ledgerTotals(visible), [visible]);
  const categories = useMemo(
    () => [...new Set(entries.map((e) => e.category).filter(Boolean))].sort(),
    [entries]
  );

  if (!isAdmin) return null;

  async function handleSave(draft) {
    if (dialog.mode === 'create') await addEntry(draft);
    else await updateEntry(dialog.entry.id, draft);
    setDialog(null);
  }

  async function handleDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    setActionError(null);
    try {
      await deleteEntry(target.id);
    } catch (err) {
      setActionError(err?.message ?? 'Löschen fehlgeschlagen.');
    }
  }

  return (
    <div className="ledger-tab" data-testid="ledger-tab">
      <div className="ledger-tab-toolbar">
        <label className="ledger-tab-year">
          <span>Jahr</span>
          <select value={year} onChange={(e) => setYear(e.target.value)} data-testid="ledger-year">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
            <option value="all">Alle</option>
          </select>
        </label>
        <div className="ledger-tab-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => downloadCsv(visible, year)}
            disabled={visible.length === 0}
            data-testid="ledger-export"
          >
            <Download size={16} aria-hidden="true" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setDialog({ mode: 'create', entry: null })}
            data-testid="ledger-add"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Neue Buchung</span>
          </button>
        </div>
      </div>

      <div className="ledger-tab-summary" data-testid="ledger-summary">
        <div className="ledger-tab-card">
          <span className="ledger-tab-card-label">Einnahmen</span>
          <strong className="ledger-tab-income" data-testid="ledger-total-income">
            {formatEuro(totals.income)}
          </strong>
        </div>
        <div className="ledger-tab-card">
          <span className="ledger-tab-card-label">Ausgaben</span>
          <strong className="ledger-tab-expense" data-testid="ledger-total-expense">
            {formatEuro(totals.expense)}
          </strong>
        </div>
        <div className="ledger-tab-card">
          <span className="ledger-tab-card-label">Saldo</span>
          <strong
            className={totals.balance < 0 ? 'ledger-tab-expense' : 'ledger-tab-income'}
            data-testid="ledger-total-balance"
          >
            {formatEuro(totals.balance)}
          </strong>
        </div>
      </div>

      {(error || actionError) && (
        <div className="ledger-tab-error" role="alert" data-testid="ledger-error">
          <AlertTriangle size={16} aria-hidden="true" /> {actionError ?? error}
        </div>
      )}

      {loading ? (
        <div className="loading-spinner"></div>
      ) : visible.length === 0 ? (
        <div className="ledger-tab-empty" data-testid="ledger-empty">
          <Wallet size={28} aria-hidden="true" />
          <h2>Noch keine Buchungen</h2>
          <p>Spenden über Mollie erscheinen hier automatisch. Spesen trägst du selbst ein.</p>
        </div>
      ) : (
        <ul className="ledger-tab-list">
          {visible.map((entry) => (
            <li key={entry.id} className="ledger-row" data-testid={`ledger-row-${entry.id}`}>
              <div className="ledger-row-info">
                <span className="ledger-row-title">{entry.description}</span>
                <span className="ledger-row-meta">
                  {formatLedgerDate(entry.date)}
                  {entry.category ? ` · ${entry.category}` : ''}
                  {entry.source === 'mollie' ? ' · Mollie' : ''}
                </span>
              </div>
              <span
                className={`ledger-row-amount ${entry.type === 'income' ? 'ledger-tab-income' : 'ledger-tab-expense'}`}
              >
                {entry.type === 'income' ? '+' : '−'}
                {formatEuro(entry.amount)}
              </span>
              <div className="ledger-row-buttons">
                <button
                  type="button"
                  className="ledger-row-action"
                  onClick={() => setDialog({ mode: 'edit', entry })}
                  aria-label={`${entry.description} bearbeiten`}
                  data-testid={`ledger-edit-${entry.id}`}
                >
                  <Pencil size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="ledger-row-action"
                  onClick={() => setPendingDelete(entry)}
                  aria-label={`${entry.description} löschen`}
                  data-testid={`ledger-delete-${entry.id}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <LedgerEditDialog
        open={Boolean(dialog)}
        mode={dialog?.mode}
        entry={dialog?.entry}
        categories={categories}
        onSave={handleSave}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title="Buchung löschen?"
        confirmLabel="Löschen"
        danger
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      >
        <p>
          „{pendingDelete?.description}“ ({pendingDelete ? formatEuro(pendingDelete.amount) : ''})
          wird endgültig gelöscht.
        </p>
      </ConfirmDialog>
    </div>
  );
}
