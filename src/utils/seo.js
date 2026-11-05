import { BRAND_NAME, DEFAULT_SITE_DESCRIPTION } from '../config/brand';

export const SITE_URL = 'https://www.thetribe.at';

// Neutral site name and description. Region-aware texts: src/utils/regionTexts.js.
export const SITE_NAME = BRAND_NAME;

export const DEFAULT_DESCRIPTION = DEFAULT_SITE_DESCRIPTION;

export const DEFAULT_OG_IMAGE_PATH = '/hero.jpeg';
export const OG_IMAGE_WIDTH = 1389;
export const OG_IMAGE_HEIGHT = 768;

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
  title = BRAND_NAME,
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
