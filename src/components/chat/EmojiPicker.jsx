import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { loadEmojiIndex, searchEmojis } from '../../utils/emojiSearch';
import './EmojiPicker.css';

// Small curated set: no third-party emoji library (no extra bundle, no CDN
// request that would leak visitors' IPs). Any other emoji can still be typed
// with the device keyboard.
export const EMOJI_GROUPS = [
  {
    id: 'smileys',
    label: 'Smileys',
    icon: '😊',
    emojis: [
      '😀',
      '😃',
      '😄',
      '😁',
      '😆',
      '😅',
      '😂',
      '🤣',
      '🥲',
      '😊',
      '😇',
      '🙂',
      '🙃',
      '😉',
      '😌',
      '😍',
      '🥰',
      '😘',
      '😗',
      '😙',
      '😚',
      '😋',
      '😛',
      '😜',
      '🤪',
      '😝',
      '🤗',
      '🤭',
      '🤫',
      '🤔',
      '🤐',
      '😐',
      '😑',
      '😶',
      '😏',
      '😒',
      '🙄',
      '😬',
      '😮‍💨',
      '😔',
      '😪',
      '😴',
      '😷',
      '🤒',
      '🤕',
      '🥵',
      '🥶',
      '🥴',
      '😵',
      '🤯',
      '🤠',
      '🥳',
      '😎',
      '🤓',
      '🧐',
      '😕',
      '😟',
      '🙁',
      '😮',
      '😯',
      '😲',
      '😳',
      '🥺',
      '😦',
      '😧',
      '😨',
      '😰',
      '😥',
      '😢',
      '😭',
      '😱',
      '😖',
      '😣',
      '😞',
      '😓',
      '😩',
      '😫',
      '🥱',
      '😤',
      '😡',
      '😠',
      '🤬',
    ],
  },
  {
    id: 'hearts',
    label: 'Herzen & Gesten',
    icon: '❤️',
    emojis: [
      '❤️',
      '🧡',
      '💛',
      '💚',
      '💙',
      '💜',
      '🤎',
      '🖤',
      '🤍',
      '💖',
      '💗',
      '💓',
      '💞',
      '💕',
      '💝',
      '💘',
      '👍',
      '👎',
      '👏',
      '🙌',
      '🤝',
      '🙏',
      '💪',
      '👋',
      '🤚',
      '✋',
      '🖖',
      '👌',
      '🤌',
      '✌️',
      '🤞',
      '🤟',
      '🤘',
      '🤙',
      '👈',
      '👉',
      '👆',
      '👇',
      '☝️',
      '🫶',
      '🫂',
      '🫡',
    ],
  },
  {
    id: 'spirit',
    label: 'Spirituelles',
    icon: '🕉️',
    emojis: [
      '🕉️',
      '☮️',
      '☯️',
      '✨',
      '🌟',
      '⭐',
      '💫',
      '🌈',
      '🔮',
      '🪬',
      '🧿',
      '🪷',
      '🌸',
      '🌺',
      '🌼',
      '🌻',
      '🌹',
      '🪻',
      '🕊️',
      '🦋',
      '🧘',
      '🧘‍♀️',
      '🧘‍♂️',
      '🪔',
      '🕯️',
      '🔔',
      '🎵',
      '🎶',
      '🎼',
      '🥁',
      '🪘',
      '🪕',
      '🙏',
      '📿',
      '🌙',
      '🌕',
      '☀️',
      '🔥',
      '💧',
      '🌊',
      '🌍',
      '♾️',
      '☁️',
      '🌤️',
    ],
  },
  {
    id: 'nature',
    label: 'Natur & Tiere',
    icon: '🌿',
    emojis: [
      '🌿',
      '🍀',
      '🌱',
      '🌲',
      '🌳',
      '🌴',
      '🍃',
      '🍂',
      '🍁',
      '🌾',
      '🌵',
      '🍄',
      '⛰️',
      '🏔️',
      '🌅',
      '🌄',
      '🐶',
      '🐱',
      '🐭',
      '🐰',
      '🦊',
      '🐻',
      '🐼',
      '🐨',
      '🦁',
      '🐸',
      '🐵',
      '🐔',
      '🐧',
      '🐦',
      '🦉',
      '🦄',
      '🐝',
      '🐞',
      '🦋',
      '🐢',
      '🐬',
      '🐳',
      '🐘',
      '🦌',
    ],
  },
  {
    id: 'food',
    label: 'Essen & Trinken',
    icon: '🍵',
    emojis: [
      '🍵',
      '☕',
      '🫖',
      '🥛',
      '🍎',
      '🍏',
      '🍐',
      '🍊',
      '🍋',
      '🍌',
      '🍉',
      '🍇',
      '🍓',
      '🫐',
      '🍒',
      '🍑',
      '🥭',
      '🍍',
      '🥥',
      '🥝',
      '🥑',
      '🥕',
      '🌽',
      '🥦',
      '🍞',
      '🥐',
      '🧀',
      '🍯',
      '🥜',
      '🍫',
      '🍪',
      '🍰',
      '🎂',
      '🍲',
      '🥗',
      '🍜',
      '🍕',
      '🍷',
      '🥂',
      '🍻',
    ],
  },
  {
    id: 'misc',
    label: 'Sonstiges',
    icon: '🎉',
    emojis: [
      '🎉',
      '🎊',
      '🎁',
      '🎈',
      '🎶',
      '📅',
      '📍',
      '🚗',
      '🚲',
      '🚆',
      '✈️',
      '🏠',
      '🏡',
      '⛺',
      '🔥',
      '⚡',
      '☔',
      '❄️',
      '⛄',
      '🎨',
      '📚',
      '💡',
      '✅',
      '❌',
      '❓',
      '❗',
      '💯',
      '🙈',
      '🙉',
      '🙊',
      '💬',
      '💭',
      '👀',
      '🤷',
      '🤷‍♀️',
      '🤷‍♂️',
      '🙋',
      '🙋‍♀️',
      '🙋‍♂️',
      '🫠',
    ],
  },
];

export default function EmojiPicker({ onPick, onClose }) {
  const [groupId, setGroupId] = useState(EMOJI_GROUPS[0].id);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(null);
  const [indexFailed, setIndexFailed] = useState(false);
  const searchRef = useRef(null);
  const group = EMOJI_GROUPS.find((g) => g.id === groupId) ?? EMOJI_GROUPS[0];
  const searching = query.trim() !== '';

  // The search index (all emoji with German names) loads on first open.
  useEffect(() => {
    let cancelled = false;
    loadEmojiIndex()
      .then((loaded) => !cancelled && setIndex(loaded))
      .catch(() => !cancelled && setIndexFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Focus the search on desktop only: on phones it would pop up the keyboard
  // and cover the emoji.
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) searchRef.current?.focus();
  }, []);

  const results = useMemo(
    () => (searching ? searchEmojis(index, query) : []),
    [index, query, searching]
  );

  return (
    <div
      className="emoji-picker"
      role="dialog"
      aria-label="Emoji auswählen"
      data-testid="emoji-picker"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose?.();
        }
      }}
    >
      <div className="emoji-picker-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Emoji suchen, z. B. Herz oder Feuer"
          aria-label="Emoji suchen"
          autoComplete="off"
          enterKeyHint="search"
          data-testid="emoji-search"
        />
      </div>
      {!searching && (
        <div className="emoji-picker-tabs" role="tablist">
          {EMOJI_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={g.id === group.id}
              aria-label={g.label}
              title={g.label}
              className={`emoji-picker-tab${g.id === group.id ? ' emoji-picker-tab--active' : ''}`}
              onClick={() => setGroupId(g.id)}
            >
              {g.icon}
            </button>
          ))}
        </div>
      )}
      <div className="emoji-picker-grid" role={searching ? 'region' : 'tabpanel'}>
        {searching && !index && !indexFailed && (
          <p className="emoji-picker-note">Suche wird geladen…</p>
        )}
        {searching && indexFailed && (
          <p className="emoji-picker-note">Die Suche ist gerade nicht verfügbar.</p>
        )}
        {searching && index && results.length === 0 && (
          <p className="emoji-picker-note" data-testid="emoji-no-results">
            Nichts gefunden.
          </p>
        )}
        {(searching
          ? results.map((r) => ({ emoji: r.emoji, label: r.label }))
          : group.emojis.map((emoji) => ({ emoji }))
        ).map(({ emoji, label }) => (
          <button
            key={emoji}
            type="button"
            className="emoji-picker-item"
            aria-label={label ? `${emoji} ${label}` : emoji}
            title={label}
            onClick={() => onPick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
