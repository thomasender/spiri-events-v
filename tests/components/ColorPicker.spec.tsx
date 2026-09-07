import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ColorPicker from '../../src/components/ColorPicker';

describe('ColorPicker', () => {
  it('renders a native color input, a hex text input, and a preview swatch', () => {
    render(<ColorPicker value="#c48e6a" onChange={() => {}} />);

    expect(screen.getByTestId('color-picker-native')).toBeInTheDocument();
    expect(screen.getByTestId('color-picker-hex')).toBeInTheDocument();
    expect(screen.getByTestId('color-picker-preview')).toBeInTheDocument();
  });

  it('shows the current color in the hex text input', () => {
    render(<ColorPicker value="#c48e6a" onChange={() => {}} />);
    expect(screen.getByTestId('color-picker-hex')).toHaveValue('#c48e6a');
  });

  it('emits a new color when a valid hex is typed into the text input', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#c48e6a" onChange={onChange} />);
    const hex = screen.getByTestId('color-picker-hex');
    fireEvent.change(hex, { target: { value: '#5c6b3f' } });
    expect(onChange).toHaveBeenCalledWith('#5c6b3f');
  });

  it('marks the input invalid while the draft is mid-typed and reverts on blur', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#c48e6a" onChange={onChange} />);
    const hex = screen.getByTestId('color-picker-hex');

    fireEvent.change(hex, { target: { value: '#abc' } });
    expect(hex).toHaveAttribute('aria-invalid', 'true');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(hex);
    expect(hex).toHaveValue('#c48e6a');
    expect(hex).toHaveAttribute('aria-invalid', 'false');
  });

  it('emits a new color when the native picker changes', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#c48e6a" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('color-picker-native'), {
      target: { value: '#5c6b3f' },
    });
    expect(onChange).toHaveBeenCalledWith('#5c6b3f');
  });

  it('renders the preview swatch with the current value as background', () => {
    render(<ColorPicker value="#c48e6a" onChange={() => {}} />);
    const preview = screen.getByTestId('color-picker-preview');
    expect(preview.getAttribute('style')).toContain('background-color: #c48e6a');
  });
});
