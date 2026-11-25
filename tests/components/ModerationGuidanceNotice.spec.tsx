import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ModerationGuidanceNotice from '../../src/components/ModerationGuidanceNotice';
import { FAQ_EVENT_GUIDE_QUESTION } from '../../src/utils/faqs';

const callableFn = vi.fn();
let messengerOpen = true;
let faqList: { id: string; question: string; answerHtml: string }[] = [];

vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'mod1' } }) }));
vi.mock('../../src/hooks/useChatSettings', () => ({
  useMessengerAccess: () => ({ available: messengerOpen }),
}));
vi.mock('../../src/hooks/useFaqs', () => ({
  useFaqs: () => ({ faqs: faqList }),
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
    faqList = [
      { id: 'a', question: 'Andere Frage', answerHtml: '<p>nix</p>' },
      { id: 'g', question: FAQ_EVENT_GUIDE_QUESTION, answerHtml: '<p>Das passt zu uns</p>' },
    ];
    callableFn.mockReset();
  });

  it('opens the guidelines FAQ article as a popup', () => {
    renderNotice();
    expect(screen.queryByTestId('moderation-guidance-dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('moderation-guidance-open'));
    expect(screen.getByTestId('moderation-guidance-dialog')).toHaveTextContent('Das passt zu uns');
  });

  it('shows the internal grey-area rules below the article in the popup', () => {
    renderNotice();
    fireEvent.click(screen.getByTestId('moderation-guidance-open'));
    const internal = screen.getByTestId('moderation-guidance-internal');
    expect(internal).toHaveTextContent('Sonderregeln für Grauzonen (nur intern für Moderatoren)');
    expect(internal).toHaveTextContent('Heilversprechen: Sind erlaubt.');
    expect(internal).toHaveTextContent('Nacktheit');
    expect(internal.querySelectorAll('li')).toHaveLength(11);
  });

  it('shows the internal rules even when the FAQ article is missing', () => {
    faqList = [];
    renderNotice();
    fireEvent.click(screen.getByTestId('moderation-guidance-open'));
    expect(screen.getByTestId('moderation-guidance-dialog')).toHaveTextContent(
      'Die Leitlinien konnten gerade nicht geladen werden.'
    );
    expect(screen.getByTestId('moderation-guidance-internal')).toHaveTextContent('Heilversprechen');
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
