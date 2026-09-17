import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DateTimeInput from '../../src/components/DateTimeInput';

function renderDate(props: Record<string, unknown> = {}) {
  return render(
    <DateTimeInput kind="date" id="date" name="date" value="" onChange={() => {}} {...props} />
  );
}

function renderTime(props: Record<string, unknown> = {}) {
  return render(
    <DateTimeInput kind="time" id="time" name="time" value="" onChange={() => {}} {...props} />
  );
}

describe('DateTimeInput', () => {
  describe('placeholder', () => {
    it('shows the German date placeholder when empty', () => {
      renderDate();
      expect(screen.getByRole('button', { name: 'tt.mm.jjjj' })).toBeInTheDocument();
    });

    it('shows the time placeholder when empty', () => {
      renderTime();
      expect(screen.getByRole('button', { name: '--:--' })).toBeInTheDocument();
    });
  });

  describe('formatted display', () => {
    it('formats a YYYY-MM-DD value in de-AT for date', () => {
      renderDate({ value: '2026-09-17' });
      // toLocaleDateString('de-AT', {day:'2-digit',month:'2-digit',year:'numeric'}) → "17.09.2026"
      expect(screen.getByRole('button', { name: '17.09.2026' })).toBeInTheDocument();
    });

    it('formats a HH:MM value verbatim for time', () => {
      renderTime({ value: '14:30' });
      expect(screen.getByRole('button', { name: '14:30' })).toBeInTheDocument();
    });

    it('does not crash on a malformed date value', () => {
      renderDate({ value: 'not-a-date' });
      // Falls back to the raw value when it cannot be parsed.
      expect(screen.getByRole('button', { name: 'not-a-date' })).toBeInTheDocument();
    });
  });

  describe('click opens the native picker', () => {
    it('calls showPicker on the hidden input when supported', () => {
      const showPicker = vi.fn();
      // jsdom does not implement showPicker on HTMLInputElement — install it
      // on the prototype so any newly-created <input type="date"> picks it up.
      const original = (HTMLInputElement.prototype as unknown as { showPicker?: () => void })
        .showPicker;
      (HTMLInputElement.prototype as unknown as { showPicker?: () => void }).showPicker =
        showPicker;

      try {
        renderDate();
        fireEvent.click(screen.getByRole('button'));
        expect(showPicker).toHaveBeenCalledTimes(1);
      } finally {
        (HTMLInputElement.prototype as unknown as { showPicker?: () => void }).showPicker =
          original;
      }
    });

    it('falls back to focus() when showPicker is unavailable', () => {
      // Make sure showPicker really is missing in this run.
      const original = (HTMLInputElement.prototype as unknown as { showPicker?: () => void })
        .showPicker;
      delete (HTMLInputElement.prototype as unknown as { showPicker?: () => void }).showPicker;

      try {
        renderDate();
        const input = document.querySelector('input[type="date"]') as HTMLInputElement;
        const focusSpy = vi.spyOn(input, 'focus');

        fireEvent.click(screen.getByRole('button'));
        expect(focusSpy).toHaveBeenCalledTimes(1);
      } finally {
        if (original) {
          (HTMLInputElement.prototype as unknown as { showPicker?: () => void }).showPicker =
            original;
        }
      }
    });

    it('does nothing when disabled', () => {
      const showPicker = vi.fn();
      const original = (HTMLInputElement.prototype as unknown as { showPicker?: () => void })
        .showPicker;
      (HTMLInputElement.prototype as unknown as { showPicker?: () => void }).showPicker =
        showPicker;

      try {
        renderDate({ disabled: true });
        fireEvent.click(screen.getByRole('button'));
        expect(showPicker).not.toHaveBeenCalled();
      } finally {
        (HTMLInputElement.prototype as unknown as { showPicker?: () => void }).showPicker =
          original;
      }
    });
  });

  describe('value propagation', () => {
    it('forwards the value to the hidden native input', () => {
      renderDate({ value: '2026-09-17' });
      const input = document.querySelector('input[type="date"]') as HTMLInputElement;
      expect(input.value).toBe('2026-09-17');
    });

    it('calls onChange when the native input fires change', () => {
      const onChange = vi.fn();
      renderDate({ onChange });
      const input = document.querySelector('input[type="date"]') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '2026-12-31' } });
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('error styling', () => {
    it('marks the wrapper has-error when hasError is true', () => {
      const { container } = renderDate({ hasError: true });
      expect(container.querySelector('.dt-input.has-error')).not.toBeNull();
    });
  });

  describe('accessibility', () => {
    it('renders the button with aria-haspopup="dialog"', () => {
      renderDate();
      expect(screen.getByRole('button')).toHaveAttribute('aria-haspopup', 'dialog');
    });

    it('hides the native input from assistive tech', () => {
      renderDate();
      const input = document.querySelector('input[type="date"]') as HTMLInputElement;
      expect(input).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
