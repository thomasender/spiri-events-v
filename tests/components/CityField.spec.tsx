import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CityField from '../../src/components/CityField';

function Harness({ initial = { city: '', bezirk: '' } }) {
  const [state, setState] = useState(initial);
  return (
    <>
      <CityField {...state} onChange={setState} />
      <output data-testid="bezirk">{state.bezirk}</output>
      <output data-testid="city">{state.city}</output>
    </>
  );
}

const input = () => screen.getByLabelText(/^Ort/);
const type = (value: string) => {
  fireEvent.focus(input());
  fireEvent.change(input(), { target: { value } });
};
const pickFirst = () => fireEvent.keyDown(input(), { key: 'Enter', code: 'Enter' });

describe('CityField', () => {
  it('sets the Bezirk automatically when a Gemeinde is picked', () => {
    render(<Harness />);
    type('Altach');
    pickFirst();
    expect(screen.getByTestId('city')).toHaveTextContent('Altach');
    expect(screen.getByTestId('bezirk')).toHaveTextContent('Feldkirch');
    expect(screen.getByTestId('city-bezirk-hint')).toHaveTextContent('Bezirk Feldkirch');
  });

  it('finds a Gemeinde regardless of case', () => {
    render(<Harness />);
    type('lustenau');
    pickFirst();
    expect(screen.getByTestId('city')).toHaveTextContent('Lustenau');
    expect(screen.getByTestId('bezirk')).toHaveTextContent('Dornbirn');
  });

  it('offers a place outside Vorarlberg as new option and stores Umgebung', () => {
    render(<Harness />);
    type('Ruggell');
    expect(screen.getByText(/"Ruggell" \(außerhalb von Vorarlberg/)).toBeInTheDocument();
    pickFirst();
    expect(screen.getByTestId('city')).toHaveTextContent('Ruggell');
    expect(screen.getByTestId('bezirk')).toHaveTextContent('Grenznahe');
  });

  it('does not offer to create a name that is a Gemeinde', () => {
    render(<Harness />);
    type('Altach');
    expect(screen.queryByText(/außerhalb von Vorarlberg, Umgebung/)).not.toBeInTheDocument();
  });

  it('shows an existing city and can be cleared', () => {
    render(<Harness initial={{ city: 'Hard', bezirk: 'Bregenz' }} />);
    expect(document.querySelector('.kategorie__single-value')).toHaveTextContent('Hard');
    fireEvent.mouseDown(document.querySelector('.kategorie__clear-indicator') as Element);
    expect(screen.getByTestId('city')).toHaveTextContent('');
    expect(screen.getByTestId('bezirk')).toHaveTextContent('');
  });

  it('free variant: default placeholder, or the one handed in', () => {
    const { rerender } = render(<CityField free city="" bezirk="" onChange={() => {}} />);
    expect(input()).toHaveAttribute('placeholder', 'z.B. Lindau');
    rerender(<CityField free city="" bezirk="" onChange={() => {}} placeholder="z.B. Essen" />);
    expect(input()).toHaveAttribute('placeholder', 'z.B. Essen');
  });
});
