import { useState, useCallback } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { deleteImageByUrl, uploadFeedbackScreenshot } from '../lib/imageUpload';

export const MAX_FEEDBACK_DESCRIPTION_LENGTH = 1000;
export const MAX_FEEDBACK_NAME_LENGTH = 80;
export const MAX_FEEDBACK_EMAIL_LENGTH = 120;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateFeedback({ description, name, email }) {
  const errors = {};
  const trimmedDescription = (description || '').trim();
  if (!trimmedDescription) {
    errors.description = 'Bitte beschreibe dein Anliegen.';
  } else if (trimmedDescription.length > MAX_FEEDBACK_DESCRIPTION_LENGTH) {
    errors.description = `Bitte maximal ${MAX_FEEDBACK_DESCRIPTION_LENGTH} Zeichen.`;
  }

  const trimmedName = (name || '').trim();
  if (trimmedName.length > MAX_FEEDBACK_NAME_LENGTH) {
    errors.name = `Name darf maximal ${MAX_FEEDBACK_NAME_LENGTH} Zeichen lang sein.`;
  }

  const trimmedEmail = (email || '').trim();
  if (trimmedEmail) {
    if (trimmedEmail.length > MAX_FEEDBACK_EMAIL_LENGTH) {
      errors.email = `E-Mail darf maximal ${MAX_FEEDBACK_EMAIL_LENGTH} Zeichen lang sein.`;
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      errors.email = 'Bitte gib eine gültige E-Mail-Adresse an.';
    }
  }

  return errors;
}

function generateFeedbackId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `fb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useFeedback() {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const reset = useCallback(() => {
    setError('');
    setWarning('');
    setUploadProgress(0);
  }, []);

  const submitFeedback = useCallback(
    async ({ description, name, email, screenshot, pageUrl, pageTitle }) => {
      setError('');
      setWarning('');
      setUploadProgress(0);

      const trimmedDescription = (description || '').trim();
      const trimmedName = (name || '').trim();
      const trimmedEmail = (email || '').trim();

      const errors = validateFeedback({
        description: trimmedDescription,
        name: trimmedName,
        email: trimmedEmail,
      });
      if (Object.keys(errors).length > 0) {
        setError(Object.values(errors)[0]);
        throw new Error(Object.values(errors)[0]);
      }

      const feedbackId = generateFeedbackId();
      let screenshotUrl = null;
      let screenshotFailed = false;

      setSubmitting(true);
      try {
        if (screenshot) {
          try {
            screenshotUrl = await uploadFeedbackScreenshot(screenshot, feedbackId, {
              onProgress: setUploadProgress,
            });
          } catch (uploadErr) {
            console.warn('Feedback screenshot upload failed:', uploadErr);
            screenshotFailed = true;
            setWarning(
              'Dein Feedback wurde gesendet, aber der Screenshot konnte nicht hochgeladen werden.'
            );
          }
        }

        await setDoc(doc(db, 'feedback', feedbackId), {
          description: trimmedDescription,
          name: trimmedName || null,
          email: trimmedEmail || null,
          pageUrl: (pageUrl || '').slice(0, 500) || null,
          pageTitle: (pageTitle || '').slice(0, 200) || null,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
          userId: user?.uid || null,
          screenshotUrl,
          screenshotFailed,
          status: 'new',
          createdAt: serverTimestamp(),
        });

        return { id: feedbackId };
      } catch (err) {
        console.error('Feedback submission failed:', err);
        if (screenshotUrl) {
          await deleteImageByUrl(screenshotUrl).catch(() => {});
        }
        setError('Feedback konnte nicht gesendet werden. Bitte versuche es erneut.');
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [user]
  );

  return {
    submitting,
    uploadProgress,
    error,
    warning,
    submitFeedback,
    reset,
  };
}
