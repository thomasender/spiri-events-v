function readHeader(headers, name) {
  if (!headers) return undefined;
  const value = headers[name] ?? headers[name?.toLowerCase?.()];
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'string') return value;
  return undefined;
}

export function resolveAppBaseUrl(req) {
  if (!req || !req.rawRequest) return 'https://localhost';
  const headers = req.rawRequest.headers;

  const origin = readHeader(headers, 'origin');
  if (origin) return origin;

  const referer = readHeader(headers, 'referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // fall through
    }
  }

  const host = req.rawRequest.host ?? 'localhost';
  const protocol = req.rawRequest.protocol ?? 'https';
  return `${protocol}://${host}`;
}
