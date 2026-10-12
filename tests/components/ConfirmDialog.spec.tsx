import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmDialog from '../../src/components/ConfirmDialog';
import RecurringDeleteDialog from '../../src/components/RecurringDeleteDialog';

describe('ConfirmDialog with a required reason', () => {
  it('keeps confirm disabled until a non-blank reason is entered and passes it trimmed', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="In Papierkorb verschieben"
        message="..."
        confirmLabel="In Papierkorb"
        onConfirm={onConfirm}
        onCancel={() => {}}
        reasonRequired
      />
    );
    const confirm = screen.getByRole('button', { name: 'In Papierkorb' });
    expect(confirm).toBeDisabled();

    const field = screen.getByLabelText(/Grund für das Löschen/);
    fireEvent.change(field, { target: { value: '   ' } });
    expect(confirm).toBeDisabled();

    fireEvent.change(field, { target: { value: ' Kein Bezug ' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith('Kein Bezug');
  });

  it('shows no reason field by default', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        title="T"
        message="M"
        confirmLabel="OK"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    expect(screen.queryByLabelText(/Grund für das Löschen/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('starts with an empty reason each time it is reopened', () => {
    const props = {
      title: 'T',
      message: 'M',
      confirmLabel: 'OK',
      onConfirm: () => {},
      onCancel: () => {},
      reasonRequired: true,
    };
    const { rerender } = render(<ConfirmDialog isOpen {...props} />);
    fireEvent.change(screen.getByLabelText(/Grund für das Löschen/), {
      target: { value: 'Alt' },
    });
    rerender(<ConfirmDialog isOpen={false} {...props} />);
    rerender(<ConfirmDialog isOpen {...props} />);
    expect(screen.getByLabelText(/Grund für das Löschen/)).toHaveValue('');
  });
});

describe('RecurringDeleteDialog with a required reason', () => {
  it('only enables "Gesamte Serie löschen" once a reason is entered', () => {
    const onDeleteAll = vi.fn();
    render(
      <RecurringDeleteDialog
        isOpen
        eventTitle="Serie"
        occurrenceDate="2026-10-20"
        onDeleteThisOnly={() => {}}
        onDeleteThisAndFuture={() => {}}
        onDeleteAll={onDeleteAll}
        onCancel={() => {}}
        reasonRequired
      />
    );
    const deleteAll = screen.getByRole('button', { name: /Gesamte Serie löschen/ });
    expect(deleteAll).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Grund für das Löschen/), {
      target: { value: 'Abgesagt' },
    });
    fireEvent.click(deleteAll);
    expect(onDeleteAll).toHaveBeenCalledWith('Abgesagt');
  });
});
