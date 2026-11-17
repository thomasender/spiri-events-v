// A new event document id, made on the client (same shape as Firestore's
// auto ids: 20 characters of [A-Za-z0-9]). The forms need the id before the
// event is written, so the Titelbild can be uploaded to events/{id}/ first and
// the event is never saved without it (Trello 7iDvAj4U).
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function newEventId() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  // 62 does not divide 256; the tiny bias does not matter for an id.
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
