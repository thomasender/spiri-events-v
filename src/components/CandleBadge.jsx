import { CANDLE_ROOM_NAME, candleRoomHint } from '../utils/candleRoom';
import './chat/CandleRoom.css';
import './CandleBadge.css';

// Flickering candle on an event card: there are new messages in the event's
// Kerzenraum. Hovering explains what it means.
export default function CandleBadge() {
  const hint = candleRoomHint();
  return (
    <span
      className="candle-badge"
      data-tooltip={hint}
      role="img"
      aria-label={`Neue Nachrichten im ${CANDLE_ROOM_NAME}`}
      data-testid="candle-badge"
    >
      <span className="candle-flame candle-flame--lit" aria-hidden="true">
        🕯️
      </span>
    </span>
  );
}
