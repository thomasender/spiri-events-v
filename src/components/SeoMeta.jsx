import { Helmet } from 'react-helmet-async';
import {
  SITE_URL,
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE_URL,
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
  TWITTER_CARD,
  LOCALE,
  toAbsoluteUrl,
  buildPageUrl,
} from '../utils/seo';
import { getEventFallbackImage } from '../utils/eventFallbacks';
import { useRegionTexts } from '../hooks/useRegionTexts';

export function getEventOgImage(event) {
  if (event?.imageUrl) {
    return toAbsoluteUrl(event.imageUrl);
  }
  return toAbsoluteUrl(getEventFallbackImage(event));
}

function defaultTitle(value, siteName, exact) {
  if (exact && value) return value;
  if (value && value !== siteName) return `${value} | ${siteName}`;
  return siteName;
}

function buildDescription(value, fallback) {
  if (value) return value;
  return fallback;
}

export default function SeoMeta({
  title,
  description,
  path = '/',
  imagePath,
  imageUrl,
  type = 'website',
  noindex = false,
  event,
  exactTitle = false,
}) {
  // Site name and default description follow the region (unchanged for Vorarlberg).
  const texts = useRegionTexts();
  const resolvedImageUrl = imageUrl || (event ? getEventOgImage(event) : DEFAULT_OG_IMAGE_URL);
  const absoluteImageUrl = toAbsoluteUrl(resolvedImageUrl);
  const url = buildPageUrl(path);
  const finalTitle = defaultTitle(title, texts.siteName, exactTitle);
  const finalDescription = buildDescription(description, texts.defaultDescription);

  return (
    <Helmet>
      <title>{finalTitle}</title>
      <meta name="description" content={finalDescription} />
      <link rel="canonical" href={url} />
      <meta name="robots" content={noindex ? 'noindex, nofollow' : 'index, follow'} />

      <meta property="og:site_name" content={texts.siteName} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={finalTitle} />
      <meta property="og:description" content={finalDescription} />
      <meta property="og:url" content={url} />
      <meta property="og:locale" content={LOCALE} />
      <meta property="og:image" content={absoluteImageUrl} />
      <meta property="og:image:width" content={String(OG_IMAGE_WIDTH)} />
      <meta property="og:image:height" content={String(OG_IMAGE_HEIGHT)} />
      <meta property="og:image:alt" content={finalTitle} />

      <meta name="twitter:card" content={TWITTER_CARD} />
      <meta name="twitter:title" content={finalTitle} />
      <meta name="twitter:description" content={finalDescription} />
      <meta name="twitter:image" content={absoluteImageUrl} />
      <meta name="twitter:image:alt" content={finalTitle} />
    </Helmet>
  );
}

export { SITE_URL, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE_URL };
