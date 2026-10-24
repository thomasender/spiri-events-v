import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { compressImage } from './imageUpload';

// Limits mirror functions/src/moderatorApplication.ts.
export const APPLICATION_NAME_MAX = 80;
export const APPLICATION_MESSAGE_MIN = 20;
export const APPLICATION_MESSAGE_MAX = 1500;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Field errors (German, shown under the fields) or {} when the form is fine. */
export function validateApplicationForm({ name, email, message }) {
  const errors = {};
  const n = (name ?? '').trim();
  if (n.length < 2) errors.name = 'Bitte gib deinen Namen an.';
  else if (n.length > APPLICATION_NAME_MAX) errors.name = 'Der Name ist zu lang.';
  if (!EMAIL_PATTERN.test((email ?? '').trim())) {
    errors.email = 'Bitte gib eine gültige E-Mail-Adresse an, damit wir dir antworten können.';
  }
  const m = (message ?? '').trim();
  if (m.length < APPLICATION_MESSAGE_MIN) {
    errors.message = `Erzähl uns bitte kurz von dir (mindestens ${APPLICATION_MESSAGE_MIN} Zeichen).`;
  } else if (m.length > APPLICATION_MESSAGE_MAX) {
    errors.message = `Bitte fasse dich kürzer (höchstens ${APPLICATION_MESSAGE_MAX} Zeichen).`;
  }
  return errors;
}

/** Base64 (without the data: prefix) of a Blob. */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Foto konnte nicht gelesen werden'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}

/**
 * Sends the application to the admins (callable `submitModeratorApplication`
 * -> mail to admin@thetribe.at). The photo is optional and shrunk in the browser
 * first.
 */
export async function sendModeratorApplication({ name, email, message, regionId, photo, website }) {
  const photoBase64 = photo ? await blobToBase64(await compressImage(photo)) : '';
  const result = await httpsCallable(
    functions,
    'submitModeratorApplication'
  )({
    name: name.trim(),
    email: email.trim(),
    message: message.trim(),
    regionId: regionId || '',
    photoBase64,
    website: website ?? '',
  });
  return result.data;
}
