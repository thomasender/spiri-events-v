import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ChatTab from '../../src/components/ChatTab';

const state = vi.hoisted(() => ({
  reports: [] as Record<string, unknown>[],
  deleteMessage: vi.fn(async () => {}),
  resolveReport: vi.fn(async () => {}),
}));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDoc: async () => ({ exists: () => true, get: () => 'Kakao-Zeremonie' }),
}));
vi.mock('../../src/hooks/useChatAdmin', () => ({
  useChatAdmin: () => ({
    mode: 'admins',
    messengerMode: 'off',
    onlineStatusMode: 'off',
    onboardingMode: 'off',
    setOnlineStatusMode: vi.fn(),
    setOnboardingMode: vi.fn(),
    setMessengerMode: vi.fn(),
    setMode: vi.fn(),
    dmReports: [],
    loading: false,
    error: null,
    reports: state.reports,
    bans: [],
    resolveReport: state.resolveReport,
    resolveDmReport: vi.fn(),
    deleteMessage: state.deleteMessage,
    ban: vi.fn(async () => {}),
    unban: vi.fn(),
  }),
}));

const report = (overrides: Record<string, unknown> = {}) => ({
  id: 'm1_bob',
  messageId: 'm1',
  messageText: 'Hallo',
  messageAuthorUid: 'alice',
  messageAuthorName: 'Alice',
  createdAtMs: 1000,
  ...overrides,
});

const renderTab = () =>
  render(
    <MemoryRouter>
      <ChatTab />
    </MemoryRouter>
  );

beforeEach(() => {
  state.deleteMessage.mockClear();
  state.resolveReport.mockClear();
});

describe('ChatTab reports', () => {
  it('shows the Lagerfeuer for a report without eventId and deletes there', async () => {
    state.reports = [report()];
    renderTab();
    expect(screen.getByTestId('chat-report-room')).toHaveTextContent('Lagerfeuer');
    fireEvent.click(screen.getByRole('button', { name: 'Nachricht löschen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(state.deleteMessage).toHaveBeenCalledWith('m1', undefined));
    expect(state.resolveReport).toHaveBeenCalledWith('m1_bob');
  });

  it('shows the event with a link for an Event Chat report and deletes in that room', async () => {
    state.reports = [report({ eventId: 'ev1' })];
    renderTab();
    const room = screen.getByTestId('chat-report-room');
    expect(room).toHaveTextContent('Event Chat');
    await waitFor(() => expect(room).toHaveTextContent('Kakao-Zeremonie'));
    expect(room.querySelector('a')).toHaveAttribute('href', '/event/ev1#msg-m1');
    fireEvent.click(screen.getByRole('button', { name: 'Nachricht löschen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(state.deleteMessage).toHaveBeenCalledWith('m1', 'ev1'));
  });
});
