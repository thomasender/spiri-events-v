import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CategoryColorPickerDialog from '../../src/components/CategoryColorPickerDialog';

describe('CategoryColorPickerDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <CategoryColorPickerDialog
        open={false}
        categoryLabel="Pilates"
        usedColors={new Set()}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a heading, the category name, and 8 swatches when open', () => {
    render(
      <CategoryColorPickerDialog
        open
        categoryLabel="Pilates"
        usedColors={new Set()}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('category-color-picker')).toBeInTheDocument();
    expect(screen.getByTestId('category-color-picker-name')).toHaveTextContent('Pilates');
    expect(screen.getByText(/Bitte wähle eine Farbe für die neue Kategorie/)).toBeInTheDocument();

    const swatches = screen
      .getByTestId('category-color-picker')
      .querySelectorAll('.category-color-picker-swatch');
    expect(swatches).toHaveLength(8);
  });

  it('disables swatches whose color is in usedColors', () => {
    render(
      <CategoryColorPickerDialog
        open
        categoryLabel="Pilates"
        usedColors={new Set(['#c48e6a'])}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const usedSwatch = document.querySelector('[data-color="#c48e6a"]');
    expect(usedSwatch).toBeDisabled();

    const freeSwatch = document.querySelector('[data-color="#4a7572"]');
    expect(freeSwatch).not.toBeDisabled();
  });

  it('calls onSelect with the picked color when an enabled swatch is clicked', () => {
    const onSelect = vi.fn();
    render(
      <CategoryColorPickerDialog
        open
        categoryLabel="Pilates"
        usedColors={new Set()}
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(document.querySelector('[data-color="#4a7572"]'));
    expect(onSelect).toHaveBeenCalledWith('#4a7572');
  });

  it('does NOT call onSelect when a disabled swatch is clicked', () => {
    const onSelect = vi.fn();
    render(
      <CategoryColorPickerDialog
        open
        categoryLabel="Pilates"
        usedColors={new Set(['#c48e6a'])}
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(document.querySelector('[data-color="#c48e6a"]'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onClose when the Abbrechen button is clicked', () => {
    const onClose = vi.fn();
    render(
      <CategoryColorPickerDialog
        open
        categoryLabel="Pilates"
        usedColors={new Set()}
        onSelect={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByTestId('category-color-picker-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
