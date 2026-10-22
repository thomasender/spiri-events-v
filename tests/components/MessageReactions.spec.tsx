import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MessageReactions from '../../src/components/chat/MessageReactions';
import {
  REACTION_EMOJIS,
  nextReaction,
  sanitizeReactions,
  summarizeReactions,
} from '../../src/utils/reactions';

function setup(props: Record<string, unknown> = {}) {
  const onReact = vi.fn(async () => {});
  const onError = vi.fn();
  const utils = render(
    <MessageReactions
      reactions={{}}
      me="me"
      canReact
      onReact={onReact}
      onError={onError}
      text="Hallo"
      {...props}
    >
      <div>Hallo</div>
    </MessageReactions>
  );
  const bubble = screen.getByTestId('reactable-bubble');
  return { ...utils, onReact, onError, bubble };
}

describe('reaction helpers', () => {
  it('has the five fixed emoji', () => {
    expect(REACTION_EMOJIS).toEqual(['👍', '❤️', '😂', '😮', '🙏']);
  });

  it('same emoji removes, another replaces', () => {
    expect(nextReaction(null, '❤️')).toBe('❤️');
    expect(nextReaction('❤️', '❤️')).toBeNull();
    expect(nextReaction('❤️', '😂')).toBe('😂');
  });

  it('counts per emoji in fixed order, marks my own, drops unknown values', () => {
    const reactions = sanitizeReactions({ a: '🙏', b: '👍', me: '🙏', x: '💩', y: 3 });
    expect(reactions).toEqual({ a: '🙏', b: '👍', me: '🙏' });
    expect(summarizeReactions(reactions, 'me')).toEqual([
      { emoji: '👍', count: 1, mine: false },
      { emoji: '🙏', count: 2, mine: true },
    ]);
    expect(sanitizeReactions(null)).toEqual({});
  });
});

describe('MessageReactions', () => {
  it('double-tap / double-click reacts with a heart, a single tap does nothing', () => {
    const { bubble, onReact } = setup();
    fireEvent.click(bubble, { clientX: 10, clientY: 10 });
    expect(onReact).not.toHaveBeenCalled();
    fireEvent.click(bubble, { clientX: 12, clientY: 11 });
    expect(onReact).toHaveBeenCalledWith('❤️');
  });

  it('double-tap on my own heart removes it', () => {
    const { bubble, onReact } = setup({ reactions: { me: '❤️' } });
    fireEvent.click(bubble);
    fireEvent.click(bubble);
    expect(onReact).toHaveBeenCalledWith(null);
  });

  it('two taps far apart in time are not a double-tap', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    const { bubble, onReact } = setup();
    fireEvent.click(bubble);
    now.mockReturnValue(2_000);
    fireEvent.click(bubble);
    expect(onReact).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it('taps on a link inside the bubble do not react', () => {
    const onReact = vi.fn(async () => {});
    render(
      <MessageReactions reactions={{}} me="me" canReact onReact={onReact}>
        <a href="https://example.org">Link</a>
      </MessageReactions>
    );
    const link = screen.getByText('Link');
    fireEvent.click(link);
    fireEvent.click(link);
    expect(onReact).not.toHaveBeenCalled();
  });

  it('shows pills with counts and my own highlighted; tapping mine removes it', () => {
    const { onReact } = setup({ reactions: { a: '👍', b: '👍', me: '😂' } });
    const thumbs = screen.getByRole('button', { name: /Daumen hoch, 2 Reaktionen/ });
    const laugh = screen.getByRole('button', { name: /Lachen, 1 Reaktion, deine Reaktion/ });
    expect(thumbs).toHaveAttribute('aria-pressed', 'false');
    expect(laugh).toHaveAttribute('aria-pressed', 'true');
    expect(thumbs).toHaveTextContent('2');
    fireEvent.click(laugh);
    expect(onReact).toHaveBeenCalledWith(null);
  });

  it('tapping someone else’s pill replaces my reaction with that emoji', () => {
    const { onReact } = setup({ reactions: { a: '👍', me: '😂' } });
    fireEvent.click(screen.getByRole('button', { name: /Daumen hoch, 1 Reaktion/ }));
    expect(onReact).toHaveBeenCalledWith('👍');
  });

  it('the smiley button opens the bar with five emoji; choosing one reacts and closes', async () => {
    const { onReact } = setup({ reactions: { me: '❤️' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mit Emoji reagieren' }));
    const bar = screen.getByRole('toolbar', { name: 'Reaktion wählen' });
    expect(bar.querySelectorAll('.reaction-option:not(.reaction-option--copy)')).toHaveLength(5);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Mit Daumen hoch reagieren' })).toHaveFocus()
    );
    expect(screen.getByRole('button', { name: 'Herz entfernen' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mit Staunen reagieren' }));
    expect(onReact).toHaveBeenCalledWith('😮');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('Escape closes the bar and returns focus to the smiley button', () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Mit Emoji reagieren' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('toolbar'), { key: 'Escape' });
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('long-press on touch opens the bar, and the click after it is not a tap', () => {
    vi.useFakeTimers();
    try {
      const { bubble, onReact } = setup();
      fireEvent.touchStart(bubble, { touches: [{ clientX: 5, clientY: 5 }] });
      act(() => vi.advanceTimersByTime(500));
      fireEvent.touchEnd(bubble);
      expect(screen.getByRole('toolbar', { name: 'Reaktion wählen' })).toBeInTheDocument();
      fireEvent.click(bubble);
      fireEvent.click(bubble);
      // Only the second click counts as a first tap: no double-tap yet.
      expect(onReact).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a moving finger (scrolling) is no long-press', () => {
    vi.useFakeTimers();
    try {
      const { bubble } = setup();
      fireEvent.touchStart(bubble, { touches: [{ clientX: 5, clientY: 5 }] });
      fireEvent.touchMove(bubble, { touches: [{ clientX: 5, clientY: 60 }] });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('without permission: pills are shown but disabled, no smiley, double-tap does nothing', () => {
    const { bubble, onReact } = setup({ canReact: false, reactions: { a: '🙏' } });
    expect(screen.queryByRole('button', { name: 'Mit Emoji reagieren' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Danke, 1 Reaktion/ })).toBeDisabled();
    fireEvent.click(bubble);
    fireEvent.click(bubble);
    expect(onReact).not.toHaveBeenCalled();
  });

  it('shows my reaction at once while the write is on its way, and nothing is disabled', () => {
    const onReact = vi.fn(() => new Promise<void>(() => {}));
    const { bubble } = setup({ onReact, reactions: { a: '👍' } });
    fireEvent.click(bubble);
    fireEvent.click(bubble);
    expect(onReact).toHaveBeenCalledWith('❤️');
    const heart = screen.getByRole('button', { name: /Herz, 1 Reaktion, deine Reaktion/ });
    expect(heart).toHaveAttribute('aria-pressed', 'true');
    expect(heart).toBeEnabled();
    expect(screen.getByRole('button', { name: /Daumen hoch, 1 Reaktion/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Mit Emoji reagieren' })).toBeEnabled();
    // Still reactable: switching to the thumb shows at once as well.
    fireEvent.click(screen.getByRole('button', { name: /Daumen hoch, 1 Reaktion/ }));
    expect(
      screen.getByRole('button', { name: /Daumen hoch, 2 Reaktionen, deine Reaktion/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Herz/ })).not.toBeInTheDocument();
  });

  it('one write at a time per message: taps meanwhile are coalesced, the latest wins', async () => {
    let release: () => void = () => {};
    const onReact = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockResolvedValue(undefined);
    const { bubble } = setup({ onReact });
    fireEvent.click(bubble);
    fireEvent.click(bubble); // ❤️, in flight
    fireEvent.click(screen.getByRole('button', { name: 'Mit Emoji reagieren' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mit Lachen reagieren' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mit Emoji reagieren' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mit Danke reagieren' }));
    expect(onReact).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Danke, 1 Reaktion, deine Reaktion/ })).toBeVisible();
    await act(async () => release());
    await waitFor(() => expect(onReact).toHaveBeenCalledTimes(2));
    expect(onReact).toHaveBeenLastCalledWith('🙏');
  });

  it('rolls my reaction back and reports it when the write is rejected', async () => {
    let reject: (e: Error) => void = () => {};
    const onReact = vi.fn(() => new Promise<void>((_, r) => (reject = r)));
    const { bubble, onError } = setup({ onReact, reactions: { a: '😂' } });
    fireEvent.click(bubble);
    fireEvent.click(bubble);
    expect(screen.getByRole('button', { name: /Herz, 1 Reaktion, deine Reaktion/ })).toBeVisible();
    await act(async () => reject(Object.assign(new Error('nope'), { code: 'permission-denied' })));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Herz/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lachen, 1 Reaktion/ })).toBeEnabled();
  });
});
