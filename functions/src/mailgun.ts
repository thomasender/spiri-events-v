import { defineSecret } from 'firebase-functions/params';

export const MAILGUN_API_KEY = defineSecret('MAILGUN_API_KEY');
export const MAILGUN_DOMAIN = defineSecret('MAILGUN_DOMAIN');
export const MAILGUN_FROM = defineSecret('MAILGUN_FROM');
export const MAILGUN_REPLY_TO = defineSecret('MAILGUN_REPLY_TO');
export const SUBMITTED_NOTIFICATION_INBOX = defineSecret('SUBMITTED_NOTIFICATION_INBOX');

export const MAILGUN_EU_BASE = 'https://api.eu.mailgun.net/v3';

export function readSubmittedInbox(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined
): string | null {
  const raw = env?.SUBMITTED_NOTIFICATION_INBOX;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed;
}

export interface MailgunSendInput {
  apiKey: string;
  domain: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /** Inline images, referenced in the HTML as `cid:<filename>` (sent as multipart). */
  inlineImages?: MailgunInlineImage[];
}

export interface MailgunInlineImage {
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface MailgunSendResult {
  id: string;
  message: string;
}

export class MailgunError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'MailgunError';
    this.status = status;
    this.body = body;
  }
}

function formBody(input: MailgunSendInput): URLSearchParams {
  const body = new URLSearchParams();
  body.set('from', input.from);
  body.set('to', input.to);
  body.set('subject', input.subject);
  body.set('text', input.text);
  body.set('html', input.html);
  const replyTo = input.replyTo?.trim();
  if (replyTo) {
    body.set('h:Reply-To', replyTo);
  }
  return body;
}

/** Multipart body, only used when the message carries inline images. */
function multipartBody(input: MailgunSendInput): FormData {
  const form = new FormData();
  for (const [key, value] of formBody(input).entries()) form.append(key, value);
  for (const image of input.inlineImages ?? []) {
    form.append(
      'inline',
      new Blob([new Uint8Array(image.data)], { type: image.contentType }),
      image.filename
    );
  }
  return form;
}

export async function sendMailgunMessage(
  apiBase: string,
  input: MailgunSendInput
): Promise<MailgunSendResult> {
  const url = `${apiBase.replace(/\/$/, '')}/${encodeURIComponent(input.domain)}/messages`;
  const hasImages = (input.inlineImages?.length ?? 0) > 0;
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`api:${input.apiKey}`).toString('base64')}`,
    Accept: 'application/json',
  };
  // Plain messages keep the old urlencoded body; multipart sets its own boundary.
  if (!hasImages) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: hasImages ? multipartBody(input) : formBody(input).toString(),
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const detail =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : response.statusText;
    throw new MailgunError(
      `Mailgun send failed (${response.status}): ${detail}`,
      response.status,
      data
    );
  }

  const id =
    data && typeof data === 'object' && 'id' in data && typeof data.id === 'string' ? data.id : '';
  const message =
    data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message
      : '';
  return { id, message };
}

export function isMailgunDryRun(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): boolean {
  const raw = env.MAILGUN_DRY_RUN;
  if (raw == null) return false;
  const normalized = String(raw).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}
