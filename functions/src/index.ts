import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { appCheckOptions, logMissingAppCheck } from './appCheck';
import { logger } from 'firebase-functions';
import {
  MOLLIE_API_KEY,
  MIN_DONATION_AMOUNT,
  createMollieCustomer,
  isValidDonationAmount,
  resolveAppBaseUrl,
  startMolliePaymentCheckout,
  startMollieSubscriptionCheckout,
} from './mollie';
import { describeError, reportPaymentFailure } from './paymentAlerts';
import { sanitizeDonorComment } from './mollieWebhookLogic';
import {
  onEventStatusChanged,
  onEventCreated,
  onAdminMessageCreated,
  onFeedbackCreated,
} from './notifications';
import { enforceRateLimit, RATE_LIMIT_PRESETS } from './rateLimit';

const REGION = 'europe-west3';
const ALLOWED_ORIGINS = ['https://www.thetribe.at', 'https://thetribe.at'];

// Shown to the donor; the raw Mollie error goes to the logs and Verwaltung.
const DONATION_START_FAILED_MESSAGE =
  'Die Spende konnte gerade nicht gestartet werden. Bitte versuche es später erneut.';

interface CreateDonationRequest {
  amount: number;
  name?: string | null;
  displayOnConsent?: boolean;
  comment?: unknown;
}

// The public comment only travels with the consent to appear on the donor
// list. Cleaned and capped at 140 characters, which also keeps the Mollie
// metadata (about 1 kB per payment) well within its limit.
function donorCommentFor(data: CreateDonationRequest): string | null {
  return data.displayOnConsent === true ? sanitizeDonorComment(data.comment) : null;
}

function assertValidAmount(amount: unknown): asserts amount is number {
  if (!isValidDonationAmount(amount)) {
    throw new HttpsError(
      'invalid-argument',
      `amount must be a number of at least ${MIN_DONATION_AMOUNT.toFixed(2)} EUR`
    );
  }
}

function assertApiKey(value: string | undefined): asserts value is string {
  if (!value) {
    logger.error('MOLLIE_API_KEY secret is not configured');
    throw new HttpsError('internal', 'payment provider is not configured');
  }
}

export const createMollieSubscription = onCall(
  {
    region: REGION,
    secrets: [MOLLIE_API_KEY],
    cors: ALLOWED_ORIGINS,
    ...appCheckOptions(),
  },
  async (request) => {
    logMissingAppCheck('createMollieSubscription', request);
    enforceRateLimit(request, 'donation', RATE_LIMIT_PRESETS.donation);
    const data = (request.data ?? {}) as CreateDonationRequest;
    assertValidAmount(data.amount);

    const apiKey = MOLLIE_API_KEY.value();
    assertApiKey(apiKey);

    try {
      const customer = await createMollieCustomer(apiKey, {
        name: data.name ?? null,
        displayOnConsent: Boolean(data.displayOnConsent),
      });
      const checkout = await startMollieSubscriptionCheckout(apiKey, {
        customerId: customer.id,
        amount: data.amount,
        appBaseUrl: resolveAppBaseUrl(request),
        name: data.name ?? null,
        displayOnConsent: Boolean(data.displayOnConsent),
        comment: donorCommentFor(data),
      });
      return checkout;
    } catch (err) {
      logger.error('Mollie monthly donation start failed', { error: describeError(err) });
      await reportPaymentFailure({
        step: 'monatliche-spende-start',
        error: err,
        amount: data.amount,
        pageUrl: `${resolveAppBaseUrl(request)}/spenden`,
      });
      throw new HttpsError('unavailable', DONATION_START_FAILED_MESSAGE);
    }
  }
);

export const createMolliePayment = onCall(
  {
    region: REGION,
    secrets: [MOLLIE_API_KEY],
    cors: ALLOWED_ORIGINS,
    ...appCheckOptions(),
  },
  async (request) => {
    logMissingAppCheck('createMolliePayment', request);
    enforceRateLimit(request, 'donation', RATE_LIMIT_PRESETS.donation);
    const data = (request.data ?? {}) as CreateDonationRequest;
    assertValidAmount(data.amount);

    const apiKey = MOLLIE_API_KEY.value();
    assertApiKey(apiKey);

    try {
      const checkout = await startMolliePaymentCheckout(apiKey, {
        amount: data.amount,
        appBaseUrl: resolveAppBaseUrl(request),
        name: data.name ?? null,
        displayOnConsent: Boolean(data.displayOnConsent),
        comment: donorCommentFor(data),
      });
      return checkout;
    } catch (err) {
      logger.error('Mollie one-time payment creation failed', { error: describeError(err) });
      await reportPaymentFailure({
        step: 'einmalige-spende-start',
        error: err,
        amount: data.amount,
        pageUrl: `${resolveAppBaseUrl(request)}/spenden`,
      });
      throw new HttpsError('unavailable', DONATION_START_FAILED_MESSAGE);
    }
  }
);

export { mollieWebhook } from './mollieWebhook';
export { processMollieWebhook, handlePaidPayment } from './mollieWebhook';

export {
  onEventStatusChanged,
  onEventCreated,
  onAdminMessageCreated,
  onFeedbackCreated,
} from './notifications';
export { onEventWriteTriggerBuild } from './triggerBuild';
export { onEventCreatedEnsureUniqueSlug } from './eventSlugUniqueness';
export { scheduledBuildTrigger } from './scheduledBuildTrigger';
export { sendVerificationEmail } from './sendVerificationEmail';
export { sendPasswordResetEmailFn } from './sendPasswordResetEmail';
export { checkEmailAvailability } from './checkEmailAvailability';
export { adminListMembers, adminUpdateMember } from './adminMembers';
export { submitModeratorApplication } from './moderatorApplication';
export { adminSetRegionModerator, adminListRegionModerators } from './adminModerators';
export { adminSetRegionActive, adminListRegionActivation } from './adminRegions';
export { adminGetRegionMappingLocks, adminSaveRegionMapping } from './adminRegionMapping';
export { adminAnalyticsReport } from './adminAnalytics';
export { adminMailgunUsage } from './adminMailgun';
export { onEventApprovedPostToInstagram } from './instagramPostOnApproval';
export { onEventApprovedCount } from './approvedEventsCounter';
export { instagramWeeklyCarousel } from './instagramWeeklyCarousel';
export { instagramEventStories, instagramMorningStories } from './instagramStories';
export { calendarFeed } from './calendarFeed';
export {
  publicEvents,
  onEventWriteBumpEventsVersion,
  onListingWriteBumpEventsVersion,
  onRegionWriteBumpEventsVersion,
} from './publicEvents';
export { getCalendarFeedToken } from './calendarFeedToken';
export { refreshInstagramTokenJob } from './instagramTokenRefresh';
export { onInstagramRegionAccountEnabled } from './instagramRegionBackfill';
export {
  adminRetryInstagramPost,
  adminBackfillInstagramRegion,
  adminSkipInstagramPost,
  adminArchiveInstagramPost,
  adminPreviewWeeklyCarousels,
  adminPostWeeklyCarousels,
  adminPostDailyStory,
} from './instagramAdmin';
export { purgeExpiredEvents } from './purgeExpiredEvents';
export { onEventCancelledNotifyFavorites } from './eventCancellationNotify';
export { getEventFavoriteCount } from './eventFavoriteCount';
export { onEventUpdatedWriteRevision } from './eventRevisionTrigger';
export {
  purgeChatMessages,
  onChatReportCreated,
  onDmReportCreated,
  onLagerfeuerMention,
  onKerzenraumMention,
} from './chat';
