// Browser origins allowed to call our HTTPS/callable functions (CORS).
// Production origins are always allowed. The staging site is allowed only when
// the functions run inside the staging project, so production never trusts it.
const PRODUCTION_ORIGINS = [
  'https://www.thetribe.at',
  'https://thetribe.at',
  'https://spirieventsvbg.web.app',
  'http://localhost:5180',
];

const STAGING_PROJECT_ID = 'tribe-vbg-staging';
const STAGING_ORIGINS = [
  `https://${STAGING_PROJECT_ID}.web.app`,
  `https://${STAGING_PROJECT_ID}.firebaseapp.com`,
];

export const ALLOWED_ORIGINS: string[] =
  process.env.GCLOUD_PROJECT === STAGING_PROJECT_ID
    ? [...PRODUCTION_ORIGINS, ...STAGING_ORIGINS]
    : PRODUCTION_ORIGINS;
