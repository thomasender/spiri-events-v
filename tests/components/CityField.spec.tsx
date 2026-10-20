import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CityField from '../../src/components/CityField';

function Harness() {
  const [state, setState] = useState({ city: '', bezirk: '' });
  return (
    <>
      <CityField {...state} onChange={setState} />
      <output data-testid="bezirk">{state.bezirk}</output>
      <output data-testid="city">{state.city}</output>
    </>
  );
}

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText(/^Ort/), { target: { value } });

describe('CityField', () => {
  it('sets the Bezirk automatically when a Gemeinde is typed', () => {
    render(<Harness />);
    type('Altach');
    expect(screen.getByTestId('bezirk')).toHaveTextContent('Feldkirch');
    expect(screen.getByTestId('city-bezirk-hint')).toHaveTextContent('Bezirk Feldkirch');
  });

  it('corrects the spelling on blur', () => {
    render(<Harness />);
    type('lustenau');
    fireEvent.blur(screen.getByLabelText(/^Ort/));
    expect(screen.getByTestId('city')).toHaveTextContent('Lustenau');
    expect(screen.getByTestId('bezirk')).toHaveTextContent('Dornbirn');
  });

  it('offers "outside Vorarlberg" for unknown names and stores Umgebung', () => {
    render(<Harness />);
    type('Ruggell');
    expect(screen.getByTestId('bezirk')).toHaveTextContent('');
    fireEvent.click(screen.getByTestId('city-outside-checkbox'));
    expect(screen.getByTestId('bezirk')).toHaveTextContent('Grenznahe');
  });

  it('drops the Bezirk again when the name no longer matches', () => {
    render(<Harness />);
    type('Altach');
    type('Altachx');
    expect(screen.getByTestId('bezirk')).toHaveTextContent('');
  });
});
