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

  it('does not take typed text over: no matching place gives the German error, nothing is picked', async () => {
    render(<Harness />);
    type('Ruggell');
    expect(screen.queryByText(/übernehmen/)).not.toBeInTheDocument();
    expect(screen.getByText('Keinen Ort gefunden')).toBeInTheDocument();
    fireEvent.blur(input());
    expect(await screen.findByText('Bitte wähle einen Ort aus der Liste.')).toBeInTheDocument();
    expect(screen.getByTestId('city')).toHaveTextContent('');
    expect(screen.getByTestId('region')).toHaveTextContent('');
  });

  it('leaving the field with typed text takes the top suggestion (picked: true)', async () => {
    render(<Harness />);
    type('Dornb');
    fireEvent.blur(input());
    await waitFor(() => expect(screen.getByTestId('city')).toHaveTextContent('Dornbirn'));
    expect(screen.getByTestId('bezirk')).toHaveTextContent('Dornbirn');
    expect(screen.getByTestId('region')).toHaveTextContent('vorarlberg');
  });

  it('offers places of other regions; picking one sets its Bezirk and region and hints at it', async () => {
    render(<Harness />);
    type('Rorsch');
    const option = await screen.findByRole('option', { name: /Rorschach \(Bodensee\)/ });
    fireEvent.click(option);
    expect(screen.getByTestId('city')).toHaveTextContent('Rorschach (Bodensee)');
    expect(screen.getByTestId('bezirk')).toHaveTextContent('Rorschach');
    expect(screen.getByTestId('region')).toHaveTextContent('st-gallen');
    expect(screen.getByTestId('city-district-hint')).toHaveTextContent('Bezirk Rorschach');
    expect(screen.getByTestId('city-region-hint')).toHaveTextContent(
      'Dieser Ort gehört zur Region St. Gallen, die noch nicht freigeschaltet ist. Dein Event erscheint dort ab der Freischaltung.'
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
    const stGallen = STATIC_REGIONS.find((r) => r.id === 'st-gallen');

    function FreeHarness({ initial = { city: '', bezirk: '' } as State }) {
      const [state, setState] = useState<State>(initial);
      return (
        <>
          <CityField
            free
            region={stGallen}
            regions={STATIC_REGIONS}
            placeRegionId={state.regionId || ''}
            homeRegionId="st-gallen"
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

    it('sets city and Bezirk when a suggestion is picked, and shows a hint', async () => {
      render(<FreeHarness />);
      await typeFree('Rorsch');
      const option = await screen.findByText('Rorschach (Bodensee)');
      fireEvent.click(option);
      expect(screen.getByTestId('city')).toHaveTextContent('Rorschach (Bodensee)');
      expect(screen.getByTestId('bezirk')).toHaveTextContent('Rorschach');
      expect(screen.getByTestId('city-district-hint')).toHaveTextContent('Bezirk Rorschach');
    });

    it('a picked suggestion decides for a shared name; leaving the field takes the top one', async () => {
      render(<FreeHarness />);
      await typeFree('Buchs');
      const options = await screen.findAllByTestId('city-place-option');
      expect(options).toHaveLength(2);
      // Both Buchs are told apart by their district.
      expect(options[0]).toHaveTextContent('Werdenberg');
      expect(options[1]).toHaveTextContent('Aarau');
      fireEvent.click(options[1]);
      expect(screen.getByTestId('bezirk')).toHaveTextContent('Aarau');
      expect(screen.getByTestId('city')).toHaveTextContent('Buchs');
    });

    it('Enter takes the top suggestion even after the list was closed', async () => {
      render(<FreeHarness />);
      await typeFree('Buchs');
      await screen.findAllByTestId('city-place-option');
      fireEvent.keyDown(input(), { key: 'Escape', code: 'Escape' });
      fireEvent.keyDown(input(), { key: 'Enter', code: 'Enter' });
      expect(screen.getByTestId('bezirk')).toHaveTextContent('Werdenberg');
    });

    it('suggests places of other regions too and moves the event there', async () => {
      render(<FreeHarness />);
      await typeFree('Inns');
      fireEvent.click(await screen.findByText('Innsbruck'));
      expect(screen.getByTestId('bezirk')).toHaveTextContent('Innsbruck (Stadt)');
      expect(screen.getByTestId('region')).toHaveTextContent('tirol');
      expect(screen.getByTestId('city-district-hint')).toHaveTextContent(
        'Bezirk Innsbruck (Stadt)'
      );
      expect(screen.getByTestId('city-region-hint')).toHaveTextContent(/Region Tirol/);
    });

    it('leaving the field: top suggestion wins; no match keeps the text and shows the error', async () => {
      render(<FreeHarness />);
      await typeFree('Gibtsnicht');
      fireEvent.blur(input());
      expect(await screen.findByText('Bitte wähle einen Ort aus der Liste.')).toBeInTheDocument();
      expect(screen.getByTestId('bezirk')).toHaveTextContent('');

      fireEvent.change(input(), { target: { value: 'Altstätten' } });
      fireEvent.blur(input());
      await waitFor(() => expect(screen.getByTestId('bezirk')).toHaveTextContent('Rheintal'));
      expect(screen.getByTestId('region')).toHaveTextContent('st-gallen');
      expect(screen.queryByText('Bitte wähle einen Ort aus der Liste.')).not.toBeInTheDocument();
    });

    it('a stored old Ort in no list is shown and left alone on blur until it is edited', async () => {
      render(<FreeHarness initial={{ city: 'Altstätten', bezirk: 'Rorschach' }} />);
      expect(input()).toHaveValue('Altstätten');
      fireEvent.focus(input());
      fireEvent.blur(input());
      expect(screen.getByTestId('bezirk')).toHaveTextContent('Rorschach');
      expect(screen.queryByText('Bitte wähle einen Ort aus der Liste.')).not.toBeInTheDocument();
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
