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

type State = { city: string; bezirk: string; regionId?: string | null };

// Like the event forms: the Ort's region (if any) is the region the event is saved in.
function Harness({ initial = { city: '', bezirk: '' } as State }) {
  const [state, setState] = useState<State>(initial);
  return (
    <>
      <CityField
        city={state.city}
        bezirk={state.bezirk}
        regions={STATIC_REGIONS}
        placeRegionId={state.regionId || 'vorarlberg'}
        homeRegionId="vorarlberg"
        onChange={setState}
      />
      <output data-testid="bezirk">{state.bezirk}</output>
      <output data-testid="city">{state.city}</output>
      <output data-testid="region">{state.regionId ?? ''}</output>
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
    expect(screen.getByTestId('region')).toHaveTextContent('vorarlberg');
    expect(screen.getByTestId('city-bezirk-hint')).toHaveTextContent('Bezirk Feldkirch');
    expect(screen.queryByTestId('city-region-hint')).not.toBeInTheDocument();
  });

  it('finds a Gemeinde regardless of case', () => {
    render(<Harness />);
    type('lustenau');
    pickFirst();
    expect(screen.getByTestId('city')).toHaveTextContent('Lustenau');
    expect(screen.getByTestId('bezirk')).toHaveTextContent('Dornbirn');
  });

  it('takes over a place in no list (Liechtenstein) as typed, without Bezirk or "Umgebung"', () => {
    render(<Harness />);
    type('Ruggell');
    expect(screen.getByText('"Ruggell" übernehmen')).toBeInTheDocument();
    expect(screen.queryByText(/Umgebung/)).not.toBeInTheDocument();
    pickFirst();
    expect(screen.getByTestId('city')).toHaveTextContent('Ruggell');
    expect(screen.getByTestId('bezirk')).toHaveTextContent('');
    expect(screen.getByTestId('region')).toHaveTextContent('');
    expect(screen.queryByText(/Umgebung/)).not.toBeInTheDocument();
  });

  it('offers places of other regions; picking one sets its Landkreis and region and hints at it', async () => {
    render(<Harness />);
    type('Lind');
    const option = await screen.findByRole('option', { name: /Lindau \(Bodensee\)/ });
    fireEvent.click(option);
    expect(screen.getByTestId('city')).toHaveTextContent('Lindau (Bodensee)');
    expect(screen.getByTestId('bezirk')).toHaveTextContent('Lindau (Bodensee)');
    expect(screen.getByTestId('region')).toHaveTextContent('bayern');
    expect(screen.getByTestId('city-district-hint')).toHaveTextContent(
      'Landkreis Lindau (Bodensee)'
    );
    expect(screen.getByTestId('city-region-hint')).toHaveTextContent(
      'Dieser Ort gehört zur Region Bayern, die noch nicht freigeschaltet ist. Dein Event erscheint dort ab der Freischaltung.'
    );
  });

  it('does not offer to take over a name that is a Gemeinde', () => {
    render(<Harness />);
    type('Altach');
    expect(screen.queryByText('"Altach" übernehmen')).not.toBeInTheDocument();
  });

  it('keeps the legacy "Grenznahe" of an old event and shows it as "Umgebung"', () => {
    render(<Harness initial={{ city: 'Lindau', bezirk: 'Grenznahe' }} />);
    expect(screen.getByTestId('city-district-hint')).toHaveTextContent('Umgebung');
    expect(screen.getByTestId('bezirk')).toHaveTextContent('Grenznahe');
    expect(screen.queryByTestId('city-region-hint')).not.toBeInTheDocument();
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

    function FreeHarness({ initial = { city: '', bezirk: '' } as State }) {
      const [state, setState] = useState<State>(initial);
      return (
        <>
          <CityField
            free
            region={bayern}
            regions={STATIC_REGIONS}
            placeRegionId={state.regionId || ''}
            homeRegionId="bayern"
            city={state.city}
            bezirk={state.bezirk}
            onChange={setState}
          />
          <output data-testid="bezirk">{state.bezirk}</output>
          <output data-testid="city">{state.city}</output>
          <output data-testid="region">{state.regionId ?? ''}</output>
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

    it('a picked suggestion decides even for a shared name; typing it leaves it empty', async () => {
      render(<FreeHarness />);
      await typeFree('Neustadt');
      const options = await screen.findAllByTestId('city-place-option');
      expect(options).toHaveLength(2);
      fireEvent.blur(input());
      expect(screen.getByTestId('bezirk')).toHaveTextContent('');
      fireEvent.focus(input());
      fireEvent.click((await screen.findAllByTestId('city-place-option'))[0]);
      expect(screen.getByTestId('city')).toHaveTextContent('Neustadt');
      expect(screen.getByTestId('bezirk')).toHaveTextContent('Neustadt a.d.Aisch-Bad Windsheim');
    });

    it('suggests places of other regions too and moves the event there', async () => {
      render(<FreeHarness />);
      await typeFree('Inns');
      fireEvent.click(await screen.findByText('Innsbruck'));
      expect(screen.getByTestId('bezirk')).toHaveTextContent('Innsbruck');
      expect(screen.getByTestId('region')).toHaveTextContent('tirol');
      expect(screen.getByTestId('city-district-hint')).toHaveTextContent('Bezirk Innsbruck');
      expect(screen.getByTestId('city-region-hint')).toHaveTextContent(/Region Tirol/);
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
      expect(screen.getByTestId('region')).toHaveTextContent('bayern');
    });

    it('does not overwrite a Landkreis the person chose on blur', async () => {
      render(<FreeHarness initial={{ city: 'Sonthofen', bezirk: 'Lindau (Bodensee)' }} />);
      await typeFree('Sonthofen');
      fireEvent.blur(input());
      expect(screen.getByTestId('bezirk')).toHaveTextContent('Lindau (Bodensee)');
    });

    it('does not load the place list for the plain field or before two letters are typed', () => {
      loadPlaceIndex.mockClear();
      const { rerender } = render(<CityField free city="" bezirk="" onChange={() => {}} />);
      fireEvent.change(input(), { target: { value: 'Lindau' } });
      rerender(<CityField city="" bezirk="" onChange={() => {}} />);
      type('A');
      expect(loadPlaceIndex).not.toHaveBeenCalled();
    });
  });
});
