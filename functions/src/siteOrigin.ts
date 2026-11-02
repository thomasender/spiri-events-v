import { ALLOWED_ORIGINS } from './allowedOrigins';

// The site is served on several domains (thetribe.at, deintribe.at/.de/.ch).
// A user registers on one of them and keeps getting links to that same domain
// in every mail, so the browser session they already have on it stays valid.

/** Used for users without a stored domain (all accounts from before the domain change). */
export const DEFAULT_SITE_ORIGIN = 'https://www.thetribe.at';

/**
 * A browser origin we serve the site on, or the default. The value comes from
 * the client (request origin / user doc), so it is only trusted when it is one
 * of the origins that may call our functions anyway.
 */
export function resolveSiteOrigin(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_SITE_ORIGIN;
  const origin = value.trim().replace(/\/+$/, '');
  return ALLOWED_ORIGINS.includes(origin) ? origin : DEFAULT_SITE_ORIGIN;
}

/** The origin of the browser that called a callable function. */
export function requestSiteOrigin(request: {
  rawRequest?: { headers?: Record<string, unknown> };
}): string {
  const origin = request.rawRequest?.headers?.origin;
  return resolveSiteOrigin(Array.isArray(origin) ? origin[0] : origin);
}
