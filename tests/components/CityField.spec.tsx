import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const loadPlaceIndex = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/placeData', async () => {
  const search = await import('../../src/utils/placeSearch');
  const { RAW_INDEX } = await import('../fixtures/smallPlaceIndex');
  loadPlaceIndex.mockImplementation(() => Promise.resolve(search.preparePlaceIndex(RAW_INDEX)));
  return { loadPlaceIndex };
});

import CityField from '../../src/components/CityField';
import { STATIC_REGIONS } from '../../src/utils/regions';

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

  describe('free variant with a region', () => {
    const bayern = STATIC_REGIONS.find((r) => r.id === 'bayern');

    function FreeHarness({ initial = { city: '', bezirk: '' } }) {
      const [state, setState] = useState(initial);
      return (
        <>
          <CityField
            free
            region={bayern}
            subdivisionLabel="Landkreis"
            {...state}
            onChange={setState}
          />
          <output data-testid="bezirk">{state.bezirk}</output>
          <output data-testid="city">{state.city}</output>
        </>
      );
    }
    const typeFree = async (value: string) => {
      fireEvent.focus(input());
      fireEvent.change(input(), { target: { value } });
      await waitFor(() => expect(loadPlaceIndex).toHaveBeenCalled());
    };

    it('sets city and Landkreis when a suggestion is picked, and shows a hint', async () => {
      render(<FreeHarness />);
      await typeFree('Lind');
      const option = await screen.findByText('Lindau (Bodensee)');
      fireEvent.click(option);
      expect(screen.getByTestId('city')).toHaveTextContent('Lindau (Bodensee)');
      expect(screen.getByTestId('bezirk')).toHaveTextContent('Lindau (Bodensee)');
      expect(screen.getByTestId('city-district-hint')).toHaveTextContent(
        'Landkreis Lindau (Bodensee)'
      );
    });

    it('leaves the Landkreis empty for an ambiguous name', async () => {
      render(<FreeHarness />);
      await typeFree('Neustadt');
      const options = await screen.findAllByTestId('city-place-option');
      expect(options).toHaveLength(2);
      fireEvent.click(options[0]);
      expect(screen.getByTestId('city')).toHaveTextContent('Neustadt');
      expect(screen.getByTestId('bezirk')).toHaveTextContent('');
      expect(screen.queryByTestId('city-district-hint')).not.toBeInTheDocument();
    });

    it('keeps free text for an unknown place and fills an empty Landkreis on blur only when unique', async () => {
      render(<FreeHarness />);
      await typeFree('Gibtsnicht');
      fireEvent.blur(input());
      expect(screen.getByTestId('city')).toHaveTextContent('Gibtsnicht');
      expect(screen.getByTestId('bezirk')).toHaveTextContent('');

      fireEvent.change(input(), { target: { value: 'Sonthofen' } });
      fireEvent.blur(input());
      expect(screen.getByTestId('bezirk')).toHaveTextContent('Oberallgäu');
    });

    it('does not overwrite a Landkreis the person chose on blur', async () => {
      render(<FreeHarness initial={{ city: 'Sonthofen', bezirk: 'Lindau (Bodensee)' }} />);
      await typeFree('Sonthofen');
      fireEvent.blur(input());
      expect(screen.getByTestId('bezirk')).toHaveTextContent('Lindau (Bodensee)');
    });

    it('does not load the place list without a region or in the Gemeinde variant', () => {
      loadPlaceIndex.mockClear();
      const { rerender } = render(<CityField free city="" bezirk="" onChange={() => {}} />);
      fireEvent.change(input(), { target: { value: 'Lindau' } });
      rerender(<CityField city="" bezirk="" onChange={() => {}} />);
      type('Altach');
      expect(loadPlaceIndex).not.toHaveBeenCalled();
    });
  });
});
