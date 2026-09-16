import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import ScrollToTop from '../../src/components/ScrollToTop';

function NavigationHarness() {
  const navigate = useNavigate();
  return (
    <div>
      <button type="button" onClick={() => navigate('/about')}>
        go-about
      </button>
      <button type="button" onClick={() => navigate('/event/foo#event-messages')}>
        go-event-hash
      </button>
    </div>
  );
}

function renderAt(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<NavigationHarness />} />
        <Route path="/about" element={<div>about</div>} />
        <Route path="/event/foo" element={<div id="event-messages">event</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ScrollToTop', () => {
  let scrollSpy;

  beforeEach(() => {
    scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    scrollSpy.mockRestore();
  });

  it('scrolls to the top on initial mount', () => {
    renderAt('/');
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  it('scrolls to the top when the pathname changes', () => {
    const { getByText } = renderAt('/');
    scrollSpy.mockClear();
    act(() => {
      getByText('go-about').click();
    });
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  it('does not scroll to the top when only a hash changes on the same pathname', () => {
    const { getByText } = renderAt('/');
    scrollSpy.mockClear();
    act(() => {
      getByText('go-event-hash').click();
    });
    expect(scrollSpy).not.toHaveBeenCalled();
  });
});
