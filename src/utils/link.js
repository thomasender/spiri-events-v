export function normalizeLink(link) {
  const trimmed = (link || '').trim();
  if (!trimmed) return '';
  const withProtocol = trimmed.match(/^https?:\/\//i) ? trimmed : 'https://' + trimmed;
  return withProtocol.replace(/^http:\/\//i, 'https://');
}
