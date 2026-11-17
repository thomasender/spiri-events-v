// Where to send a visitor after they log in. Pages that need a login pass
// `state={{ from: '/event/…' }}` to /login; only same-site paths are honoured.
export function getReturnPath(state) {
  const from = state?.from;
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) {
    return from;
  }
  return '/';
}

// Pages the e-mail confirmation link may lead to afterwards (`next` on
// /auth-action). Same list as AFTER_VERIFY_PATHS in
// functions/src/sendVerificationEmail.ts; anything else falls back to '/', so
// the link cannot send anybody to a foreign site.
export const AFTER_VERIFY_PATHS = ['/admin/new'];

export function afterVerifyPath(next) {
  return typeof next === 'string' && AFTER_VERIFY_PATHS.includes(next) ? next : '/';
}
