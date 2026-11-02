import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlaceSearch from '../../src/components/PlaceSearch';

function withHost(hostname: string, language = 'de-AT') {
  vi.spyOn(window, 'location', 'get').mockReturnValue({ hostname } as Location);
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(language);
}

const show = (props = {}) =>
  render(<PlaceSearch index={null} regionEntries={[]} onChoose={() => {}} {...props} />);

describe('PlaceSearch placeholder', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the Vorarlberg text on thetribe.at', () => {
    withHost('thetribe.at');
    show();
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'placeholder',
      'z. B. Wien, Graz oder Dornbirn'
    );
  });

  it('shows Swiss examples on .ch and German ones on .com with de-DE', () => {
    withHost('thetribe.ch');
    const first = show();
    expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', 'z. B. Zürich, Bern, Genf');
    first.unmount();
    withHost('thetribe.com', 'de-DE');
    show();
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'placeholder',
      'z. B. München, Berlin, Niedersachsen'
    );
  });

  it('an explicit placeholder prop still wins', () => {
    withHost('thetribe.de');
    show({ placeholder: 'Ort' });
    expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', 'Ort');
  });
});
