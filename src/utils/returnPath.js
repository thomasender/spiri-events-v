// Where to send a visitor after they log in. Pages that need a login pass
// `state={{ from: '/event/…' }}` to /login; only same-site paths are honoured.
export function getReturnPath(state) {
  const from = state?.from;
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) {
    return from;
  }
  return '/';
}
