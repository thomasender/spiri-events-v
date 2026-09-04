export const SITE_URL = 'https://events.thetribe.at';
export const SITE_NAME = 'tribe Vorarlberg';

export const DEFAULT_DESCRIPTION =
  'Entdecke spirituelle Workshops, Meditationen, Yoga, Tanz, Singen und mehr in Vorarlberg - Bregenz, Dornbirn, Feldkirch, Bludenz';

export const DEFAULT_OG_IMAGE_PATH = '/og-default.jpg';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

export const DEFAULT_OG_IMAGE_URL = `${SITE_URL}${DEFAULT_OG_IMAGE_PATH}`;

export const TWITTER_CARD = 'summary_large_image';

export const LOCALE = 'de_AT';

export function getSiteUrl() {
  return SITE_URL;
}

export function toAbsoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return DEFAULT_OG_IMAGE_URL;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith('//')) return `https:${pathOrUrl}`;
  if (!pathOrUrl.startsWith('/')) return `${SITE_URL}/${pathOrUrl}`;
  return `${SITE_URL}${pathOrUrl}`;
}

export function buildPageUrl(pathname = '/') {
  if (!pathname) return SITE_URL;
  if (/^https?:\/\//i.test(pathname)) return pathname;
  if (!pathname.startsWith('/')) return `${SITE_URL}/${pathname}`;
  return `${SITE_URL}${pathname}`;
}

export function getDefaultOgTags({
  title = SITE_NAME,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  imagePath = DEFAULT_OG_IMAGE_PATH,
  type = 'website',
  includeImage = true,
} = {}) {
  const imageUrl = toAbsoluteUrl(imagePath);
  return {
    title,
    description,
    url: buildPageUrl(path),
    imageUrl,
    type,
    includeImage,
  };
}
