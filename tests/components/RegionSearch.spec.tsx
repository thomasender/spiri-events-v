import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RegionSearch from '../../src/components/RegionSearch';
import { STATIC_REGIONS } from '../../src/utils/regions';

function setup() {
  const onChoose = vi.fn();
  render(
    <RegionSearch
      regions={STATIC_REGIONS}
      activeSlugs={new Set(['vorarlberg'])}
      onChoose={onChoose}
    />
  );
  const input = screen.getByTestId('region-search-input') as HTMLInputElement;
  return { input, onChoose };
}

describe('RegionSearch', () => {
  it('suggests regions while typing and marks closed ones as "bald"', () => {
    const { input } = setup();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    fireEvent.change(input, { target: { value: 'tir' } });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('Tirol');
    expect(options[0]).toHaveTextContent('bald');
    expect(screen.getByRole('status')).toHaveTextContent(/Vorschl/);
  });

  it('Enter chooses the first suggestion', () => {
    const { input, onChoose } = setup();
    fireEvent.change(input, { target: { value: 'vorarl' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChoose).toHaveBeenCalledWith('vorarlberg');
    expect(input.value).toBe('');
  });

  it('arrow keys move the highlight via aria-activedescendant', () => {
    const { input, onChoose } = setup();
    fireEvent.change(input, { target: { value: 'baden' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const options = screen.getAllByRole('option');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[options.length - 1].id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it('clicking a suggestion chooses its region', () => {
    const { input, onChoose } = setup();
    fireEvent.change(input, { target: { value: 'münchen' } });
    fireEvent.click(screen.getAllByRole('option')[0]);
    expect(onChoose).toHaveBeenCalledWith('bayern');
  });

  it('Escape closes the suggestions first, then clears the field', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'tir' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input.value).toBe('tir');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
  });

  it('says so when nothing matches and does not choose on Enter', () => {
    const { input, onChoose } = setup();
    fireEvent.change(input, { target: { value: 'xqzvw' } });
    expect(screen.getByTestId('region-search-empty')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChoose).not.toHaveBeenCalled();
  });
});
