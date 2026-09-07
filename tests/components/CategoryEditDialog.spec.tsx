import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import CategoryEditDialog from '../../src/components/CategoryEditDialog';

function Wrapper({ initialName = '', initialColor = '#c48e6a', mode = 'create', nameExists }) {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(null);
  return (
    <>
      <CategoryEditDialog
        open={open}
        mode={mode}
        initialName={initialName}
        initialColor={initialColor}
        nameExists={nameExists}
        onSave={async (data) => {
          setSaved(data);
        }}
        onClose={() => setOpen(false)}
      />
      <span data-testid="saved">{saved ? JSON.stringify(saved) : ''}</span>
    </>
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('CategoryEditDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <CategoryEditDialog open={false} onSave={() => {}} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the right title for create vs edit mode', () => {
    const { rerender } = render(
      <CategoryEditDialog open mode="create" onSave={() => {}} onClose={() => {}} />
    );
    expect(screen.getByTestId('category-edit-dialog')).toHaveTextContent('Neue Kategorie');

    rerender(
      <CategoryEditDialog
        open
        mode="edit"
        initialName="Yoga"
        initialColor="#c48e6a"
        onSave={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('category-edit-dialog')).toHaveTextContent('Kategorie bearbeiten');
  });

  it('prefills the name and color when editing', () => {
    render(<Wrapper initialName="Yoga" initialColor="#c48e6a" mode="edit" />);
    expect(screen.getByTestId('category-edit-name')).toHaveValue('Yoga');
    expect(screen.getByTestId('color-picker-hex')).toHaveValue('#c48e6a');
  });

  it('disables Save until the name is valid and the color is a hex', () => {
    render(<Wrapper />);
    const save = screen.getByTestId('category-edit-save');
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByTestId('category-edit-name'), { target: { value: 'Pilates' } });
    expect(save).not.toBeDisabled();
  });

  it('rejects duplicate category names in create mode', () => {
    render(<Wrapper nameExists={(name) => name === 'Yoga'} initialName="Yoga" />);
    expect(screen.getByTestId('category-edit-duplicate-error')).toBeInTheDocument();
    expect(screen.getByTestId('category-edit-save')).toBeDisabled();
  });

  it('calls onSave with normalized name + chosen color and closes', async () => {
    const onSave = vi.fn();
    render(<CategoryEditDialog open mode="create" onSave={onSave} onClose={() => {}} />);

    fireEvent.change(screen.getByTestId('category-edit-name'), {
      target: { value: '  pilates  ' },
    });
    fireEvent.change(screen.getByTestId('color-picker-hex'), {
      target: { value: '#5c6b3f' },
    });
    fireEvent.click(screen.getByTestId('category-edit-save'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ name: 'Pilates', color: '#5c6b3f' });
    });
  });

  it('shows the error from onSave and keeps the dialog open', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Speichern kaputt'));
    render(<CategoryEditDialog open mode="create" onSave={onSave} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('category-edit-name'), { target: { value: 'Pilates' } });
    fireEvent.click(screen.getByTestId('category-edit-save'));

    await waitFor(() => {
      expect(screen.getByTestId('category-edit-error')).toHaveTextContent('Speichern kaputt');
    });
    expect(screen.getByTestId('category-edit-dialog')).toBeInTheDocument();
  });
});
