import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ModerationGuidanceNotice from '../../src/components/ModerationGuidanceNotice';
import { FAQ_EVENT_GUIDE_QUESTION } from '../../src/utils/faqs';

const callableFn = vi.fn();
let messengerOpen = true;

vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'mod1' } }) }));
vi.mock('../../src/hooks/useChatSettings', () => ({
  useMessengerAccess: () => ({ available: messengerOpen }),
}));
vi.mock('../../src/hooks/useFaqs', () => ({
  useFaqs: () => ({
    faqs: [
      { id: 'a', question: 'Andere Frage', answerHtml: '<p>nix</p>' },
      { id: 'g', question: FAQ_EVENT_GUIDE_QUESTION, answerHtml: '<p>Das passt zu uns</p>' },
    ],
  }),
}));
vi.mock('../../src/lib/firebase', () => ({ callable: () => callableFn }));

function renderNotice() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<ModerationGuidanceNotice />} />
        <Route path="/postfach/:uid" element={<div data-testid="postfach" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ModerationGuidanceNotice', () => {
  beforeEach(() => {
    messengerOpen = true;
    callableFn.mockReset();
  });

  it('opens the guidelines FAQ article as a popup', () => {
    renderNotice();
    expect(screen.queryByTestId('moderation-guidance-dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('moderation-guidance-open'));
    expect(screen.getByTestId('moderation-guidance-dialog')).toHaveTextContent('Das passt zu uns');
  });

  it('can be closed', () => {
    renderNotice();
    fireEvent.click(screen.getByTestId('moderation-guidance-close'));
    expect(screen.queryByTestId('moderation-guidance')).toBeNull();
  });

  it('"frage um Hilfe" opens a conversation with a super admin other than myself', async () => {
    callableFn.mockResolvedValue({ data: { uids: ['mod1', 'sa1'] } });
    renderNotice();
    fireEvent.click(screen.getByTestId('moderation-guidance-help'));
    await waitFor(() => expect(screen.getByTestId('postfach')).toBeInTheDocument());
  });

  it('has no help button while the Postfach is closed', () => {
    messengerOpen = false;
    renderNotice();
    expect(screen.queryByTestId('moderation-guidance-help')).toBeNull();
  });
});
