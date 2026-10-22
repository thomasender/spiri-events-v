import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MessageComposer from '../../src/components/chat/MessageComposer';
import ChatMessage from '../../src/components/chat/ChatMessage';

const search = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/mentionSearch', () => ({ searchMentionableUsers: search }));

const anna = { uid: 'u1', displayName: 'Anna Maria', photoURL: null, username: 'anna' };
const annabel = { uid: 'u2', displayName: 'Annabel', photoURL: null, username: '' };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  search.mockReset();
  search.mockResolvedValue([anna, annabel]);
});
afterEach(() => vi.useRealTimers());

async function typeInto(text: string) {
  const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: text, selectionStart: text.length } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  return input;
}

describe('@mention suggestions in the composer', () => {
  it('suggests people after an @ and inserts the picked name with a trailing space', async () => {
    render(<MessageComposer onSend={vi.fn()} mentionsEnabled selfUid="me" />);
    const input = await typeInto('Hallo @an');
    expect(search).toHaveBeenCalledWith('an', { excludeUid: 'me' });
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['AAnna Maria@anna', 'AAnnabel']);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('Hallo @Annabel ');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('sends the picked people with the text, only while their name is still in it', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={onSend} mentionsEnabled selfUid="me" />);
    const input = await typeInto('@an');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('@Anna Maria ');
    await act(async () => {
      fireEvent.change(input, { target: { value: '@Anna Maria komm!' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-send'));
    });
    expect(onSend).toHaveBeenCalledWith('@Anna Maria komm!', { u1: 'Anna Maria' });
  });

  it('drops the mention when the name was deleted again', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={onSend} mentionsEnabled selfUid="me" />);
    const input = await typeInto('@an');
    fireEvent.keyDown(input, { key: 'Enter' });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Doch nicht' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-send'));
    });
    expect(onSend).toHaveBeenCalledWith('Doch nicht', {});
  });

  it('closes on Escape and stays out of the way for e-mail addresses', async () => {
    render(<MessageComposer onSend={vi.fn()} mentionsEnabled />);
    const input = await typeInto('@an');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();

    search.mockClear();
    await typeInto('mail anna@web.at');
    expect(search).not.toHaveBeenCalled();
  });

  it('does nothing without mentionsEnabled (private messenger)', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={onSend} />);
    const input = await typeInto('@an');
    expect(search).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-send'));
    });
    expect(onSend).toHaveBeenCalledWith('@an');
    expect(input.value).toBe('');
  });

  it('shows the error of a failed search as no list, not as a crash', async () => {
    search.mockRejectedValue(new Error('index missing'));
    render(<MessageComposer onSend={vi.fn()} mentionsEnabled />);
    await typeInto('@an');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('mentions in a message', () => {
  const message = {
    id: 'm1',
    text: 'Hi @Anna Maria, schau mal https://example.org',
    authorUid: 'other',
    authorName: 'Bob',
    authorPhotoURL: null,
    createdAt: Date.now(),
    pending: false,
    mentions: { u1: 'Anna Maria' },
    reactions: {},
  };

  it('highlights the listed names and marks the message for the mentioned person', () => {
    const { container } = render(
      <MemoryRouter>
        <ul>
          <ChatMessage message={message} own={false} me="u1" />
        </ul>
      </MemoryRouter>
    );
    expect(screen.getByTestId('chat-mention')).toHaveTextContent('@Anna Maria');
    expect(container.querySelector('.chat-mention--me')).not.toBeNull();
    expect(container.querySelector('.chat-message--mentions-me')).not.toBeNull();
    expect(container.querySelector('a[href^="https://example.org"]')).not.toBeNull();
  });

  it('leaves an @Name without an entry as plain text', () => {
    render(
      <MemoryRouter>
        <ul>
          <ChatMessage message={{ ...message, mentions: {} }} own={false} me="u1" />
        </ul>
      </MemoryRouter>
    );
    expect(screen.queryByTestId('chat-mention')).toBeNull();
  });
});
