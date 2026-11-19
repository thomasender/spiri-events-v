import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ChatTab from '../../src/components/ChatTab';

const state = vi.hoisted(() => ({
  reports: [] as Record<string, unknown>[],
  deleteMessage: vi.fn(async () => {}),
  resolveReport: vi.fn(async () => {}),
  setEventRegistrationEnabled: vi.fn(async () => {}),
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
    eventRegistrationEnabled: false,
    setEventRegistrationEnabled: state.setEventRegistrationEnabled,
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

describe('ChatTab event registration switch', () => {
  it('is off by default and switches the feature on', async () => {
    state.setEventRegistrationEnabled.mockClear();
    state.reports = [];
    renderTab();
    const group = screen.getByRole('radiogroup', { name: 'Event-Anmeldung' });
    const [off, on] = Array.from(group.querySelectorAll('input')) as HTMLInputElement[];
    expect(off.checked).toBe(true);
    expect(on.checked).toBe(false);
    fireEvent.click(on);
    await waitFor(() => expect(state.setEventRegistrationEnabled).toHaveBeenCalledWith(true));
  });
});

describe('ChatTab reports', () => {
  it('shows the Lagerfeuer for a report without eventId and deletes there', async () => {
    state.reports = [report()];
    renderTab();
    expect(screen.getByTestId('chat-report-room')).toHaveTextContent('Lagerfeuer');
    fireEvent.click(screen.getByRole('button', { name: 'Nachricht löschen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() =>
      expect(state.deleteMessage).toHaveBeenCalledWith('m1', undefined, undefined)
    );
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
    await waitFor(() => expect(state.deleteMessage).toHaveBeenCalledWith('m1', 'ev1', undefined));
  });

  it("names a region's Lagerfeuer, links to it and deletes in that room", async () => {
    state.reports = [report({ roomId: 'tirol' })];
    renderTab();
    const room = screen.getByTestId('chat-report-room');
    expect(room).toHaveTextContent('Lagerfeuer Tirol');
    expect(room.querySelector('a')).toHaveAttribute('href', '/chat?raum=tirol#msg-m1');
    fireEvent.click(screen.getByRole('button', { name: 'Nachricht löschen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(state.deleteMessage).toHaveBeenCalledWith('m1', undefined, 'tirol'));
  });
});
