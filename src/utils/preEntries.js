// Pre-entered events ("Events vorab eintragen", Trello 6afb1116, docs/pre-entries.md).
// Pure helpers for the admin tab, the wizard section and the preview page. The
// server (functions/src/preEntriesLogic.ts) checks everything again; KEEP the
// defaults and limits IN SYNC (tests/lib/preEntries.spec.ts compares them).

export const PRE_ENTRY_MODES = ['off', 'admins', 'all'];

export const PRE_ENTRY_DEFAULTS = Object.freeze({
  validDays: 14,
  reminderDays: 4,
  autoDeleteDays: 30,
});

export const PRE_ENTRY_LIMITS = Object.freeze({
  validDays: [1, 60],
  reminderDays: [1, 30],
  autoDeleteDays: [0, 365],
});

/** From this many days left on, the preview banner and the overview warn. */
export const EXPIRING_SOON_DAYS = 2;

export const DAY_MS = 24 * 60 * 60 * 1000;

export const PRE_ENTRY_PRIVACY_PATH = '/datenschutz#vorab-eintraege';

export const TEMPLATE_KEYS = ['initial', 'reminder', 'expiring', 'published'];

export const TEMPLATE_LABELS = {
  initial: 'Erstanfrage',
  reminder: 'Erinnerung',
  expiring: 'Link läuft bald ab',
  published: 'Bestätigung nach Veröffentlichung',
};

export const SUBJECT_MAX = 200;
export const TEMPLATE_TEXT_MAX = 5000;

// Built-in texts (Du-form like the site). The Super-Admin can override them in
// app_settings/preEntries.templates; an empty override falls back to these.
export const DEFAULT_TEMPLATES = Object.freeze({
  initial: {
    subject: 'Dein Event „{event_titel}“ im Tribe-Kalender',
    text:
      'Hallo {ansprechperson},\n\n' +
      'wir haben euer Event „{event_titel}“ am {event_datum} in {event_ort} entdeckt und finden es großartig! ' +
      'Wir haben es schon für unseren Kalender vorbereitet. Tribe ist ein gemeinnütziger Verein, der Menschen ' +
      'und Angebote rund um eine bewusste Lebensweise sichtbar macht – kostenlos.\n\n' +
      'Schau es dir hier an. Du kannst es so veröffentlichen, dir ein kostenloses Profil anlegen und alles ' +
      'selbst anpassen, oder uns sagen, dass du es nicht im Kalender haben möchtest:\n{vorschau_link}\n\n' +
      'Der Link ist bis {gueltig_bis} gültig (noch {tage_uebrig} Tage). Danach löschen wir den Entwurf ' +
      'und deine Kontaktdaten.\n\n' +
      'Wie wir mit deinen Daten umgehen: {datenschutz_link}\n\n' +
      'Liebe Grüße\n{moderator_name}',
  },
  reminder: {
    subject: 'Kurze Erinnerung: „{event_titel}“',
    text:
      'Hallo {ansprechperson},\n\n' +
      'ich wollte mich noch einmal kurz melden: Dein Event „{event_titel}“ am {event_datum} wartet in unserem ' +
      'Kalender auf dich. Mit einem Klick kannst du es veröffentlichen oder anpassen:\n{vorschau_link}\n\n' +
      'Der Link ist noch bis {gueltig_bis} gültig.\n\n' +
      'Liebe Grüße\n{moderator_name}',
  },
  expiring: {
    subject: 'Nur noch {tage_uebrig} Tage: „{event_titel}“',
    text:
      'Hallo {ansprechperson},\n\n' +
      'der Vorschau-Link für dein Event „{event_titel}“ läuft bald ab (noch {tage_uebrig} Tage, bis {gueltig_bis}). ' +
      'Danach löschen wir den Entwurf. Wenn du es im Kalender haben möchtest, schau gern noch kurz rein:\n' +
      '{vorschau_link}\n\n' +
      'Liebe Grüße\n{moderator_name}',
  },
  published: {
    subject: 'Dein Event ist online: „{event_titel}“',
    text:
      'Hallo {ansprechperson},\n\n' +
      'schön, dein Event „{event_titel}“ ist jetzt in unserem Kalender:\n{oeffentlicher_link}\n\n' +
      'Im Moment steht es noch unter „Dein Tribe“. Mit diesem Link legst du dir ein kostenloses Profil an ' +
      '(oder meldest dich an) und übernimmst das Event. Danach kannst du es jederzeit selbst bearbeiten:\n' +
      '{uebernahme_link}\n\n' +
      'Liebe Grüße\n{moderator_name}',
  },
});

export const PLACEHOLDERS = [
  { key: 'ansprechperson', label: 'Ansprechperson' },
  { key: 'veranstalter_name', label: 'Name des Veranstalters' },
  { key: 'organisation', label: 'Organisation' },
  { key: 'event_titel', label: 'Titel des Events' },
  { key: 'event_datum', label: 'Datum' },
  { key: 'event_uhrzeit', label: 'Uhrzeit' },
  { key: 'event_ort', label: 'Ort' },
  { key: 'event_kategorie', label: 'Kategorie' },
  { key: 'event_kurzbeschreibung', label: 'Kurzbeschreibung (ca. 150 Zeichen)' },
  { key: 'vorschau_link', label: 'Vorschau-Link' },
  { key: 'oeffentlicher_link', label: 'Öffentlicher Link' },
  { key: 'uebernahme_link', label: 'Übernahme-Link' },
  { key: 'gueltig_bis', label: 'Gültig bis' },
  { key: 'tage_uebrig', label: 'Tage übrig' },
  { key: 'moderator_name', label: 'Dein Name' },
  { key: 'datenschutz_link', label: 'Link zur Datenschutzerklärung' },
];

const PLACEHOLDER_KEYS = new Set(PLACEHOLDERS.map((p) => p.key));

function clampInt(value, [min, max], fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const n = Math.round(value);
  return n < min || n > max ? fallback : n;
}

function parseTemplate(raw, fallback) {
  const t = raw && typeof raw === 'object' ? raw : {};
  const subject = typeof t.subject === 'string' && t.subject.trim() ? t.subject : fallback.subject;
  const text = typeof t.text === 'string' && t.text.trim() ? t.text : fallback.text;
  return { subject, text };
}

/** app_settings/preEntries -> settings with defaults; a missing doc means off. */
export function parsePreEntrySettings(data) {
  const d = data && typeof data === 'object' ? data : {};
  const templatesRaw = d.templates && typeof d.templates === 'object' ? d.templates : {};
  return {
    mode: PRE_ENTRY_MODES.includes(d.mode) ? d.mode : 'off',
    validDays: clampInt(d.validDays, PRE_ENTRY_LIMITS.validDays, PRE_ENTRY_DEFAULTS.validDays),
    reminderDays: clampInt(
      d.reminderDays,
      PRE_ENTRY_LIMITS.reminderDays,
      PRE_ENTRY_DEFAULTS.reminderDays
    ),
    autoDeleteDays: clampInt(
      d.autoDeleteDays,
      PRE_ENTRY_LIMITS.autoDeleteDays,
      PRE_ENTRY_DEFAULTS.autoDeleteDays
    ),
    templates: Object.fromEntries(
      TEMPLATE_KEYS.map((key) => [key, parseTemplate(templatesRaw[key], DEFAULT_TEMPLATES[key])])
    ),
  };
}

/** Whether this staff member may use the feature under the flag. */
export function canUsePreEntries(mode, access) {
  if (!access?.isStaff) return false;
  if (mode === 'all') return true;
  if (mode === 'admins') return Boolean(access.isSuperAdmin);
  return false;
}

// ── Templates ────────────────────────────────────────────────────────────

/** Replaces known {placeholders}; unknown ones stay visible so a typo is noticed. */
export function fillTemplate(text, values) {
  return String(text ?? '').replace(/\{([a-z_]+)\}/g, (match, key) =>
    PLACEHOLDER_KEYS.has(key) && values?.[key] != null && values[key] !== ''
      ? String(values[key])
      : PLACEHOLDER_KEYS.has(key) && values && key in values
        ? ''
        : match
  );
}

/** Placeholders in a template text that are not known (for the settings editor). */
export function unknownPlaceholders(text) {
  const found = String(text ?? '').match(/\{([a-z_]+)\}/g) ?? [];
  return [...new Set(found.map((m) => m.slice(1, -1)).filter((k) => !PLACEHOLDER_KEYS.has(k)))];
}

/** "2026-11-21" -> "21.11.2026" ('' for anything else). */
export function formatDateDe(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/** Epoch millis -> "21.11.2026" in Vienna. */
export function formatDayDe(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleDateString('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function daysLeft(expiresAtMs, now) {
  if (typeof expiresAtMs !== 'number') return 0;
  return Math.max(0, Math.ceil((expiresAtMs - now) / DAY_MS));
}

/**
 * Values for the placeholders of one entry. `links` = { preview, takeover,
 * public } (absolute URLs, '' when not issued), `origin` for the privacy link.
 */
export function buildTemplateValues({ row, links = {}, moderatorName = '', now, origin = '' }) {
  const contact = row?.contact ?? {};
  const event = row?.event ?? {};
  const place = event.isOnline ? 'online' : [event.place, event.city].filter(Boolean).join(', ');
  const person = contact.contactPerson || contact.name || contact.organization || '';
  return {
    ansprechperson: person,
    veranstalter_name: contact.name || '',
    organisation: contact.organization || '',
    event_titel: event.title || '',
    event_datum: formatDateDe(event.date),
    event_uhrzeit: event.time || '',
    event_ort: place,
    event_kategorie: event.category || '',
    event_kurzbeschreibung: event.excerpt || '',
    vorschau_link: links.preview || '',
    oeffentlicher_link: links.public || '',
    uebernahme_link: links.takeover || '',
    gueltig_bis: formatDayDe(row?.expiresAtMs),
    tage_uebrig: String(daysLeft(row?.expiresAtMs, now)),
    moderator_name: moderatorName,
    datenschutz_link: `${origin}${PRE_ENTRY_PRIVACY_PATH}`,
  };
}

/**
 * Click-to-Chat link https://wa.me/<number>?text=... A national number
 * ("0664 ...") is read as Austrian (+43). null when the number is too short.
 */
export function whatsappLink(phone, text) {
  let digits = String(phone ?? '').trim();
  const international = digits.startsWith('+') || digits.startsWith('00');
  digits = digits.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (!international && digits.startsWith('0')) digits = `43${digits.slice(1)}`;
  if (digits.length < 8 || digits.length > 15) return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${query}`;
}

// ── Status ───────────────────────────────────────────────────────────────

export const DISPLAY_STATUSES = [
  'draft',
  'contacted',
  'editing',
  'published',
  'claimed',
  'rejected',
  'expired',
];

export const STATUS_LABELS = {
  draft: 'Entwurf',
  contacted: 'Kontaktiert (wartet)',
  editing: 'In Bearbeitung',
  published: 'Veröffentlicht',
  claimed: 'Übernommen',
  rejected: 'Abgelehnt',
  expired: 'Abgelaufen',
};

/** Badge colour class per status (StatusBadge-like, see PreEntriesTab.css). */
export const STATUS_TONES = {
  draft: 'neutral',
  contacted: 'info',
  editing: 'warning',
  published: 'success',
  claimed: 'success',
  rejected: 'danger',
  expired: 'danger',
};

/**
 * Status shown in the overview. Taken over: "Übernommen" once the event is
 * live in the organizer's profile, "In Bearbeitung" while it is their draft /
 * waiting for review. Open entries past the link expiry are "Abgelaufen".
 */
export function derivePreEntryStatus(row, now) {
  if (!row) return 'draft';
  if (row.status === 'claimed') return row.event?.status === 'approved' ? 'claimed' : 'editing';
  if (row.status === 'published' || row.status === 'rejected') return row.status;
  if (typeof row.expiresAtMs === 'number' && row.expiresAtMs <= now) return 'expired';
  return row.status === 'contacted' ? 'contacted' : 'draft';
}

/** Contacted, no reaction for `reminderDays` since the last contact. */
export function isReminderDue(row, { reminderDays }, now) {
  if (derivePreEntryStatus(row, now) !== 'contacted') return false;
  const last = row.lastContactAtMs;
  if (typeof last !== 'number') return false;
  if (typeof row.lastReactionAtMs === 'number' && row.lastReactionAtMs >= last) return false;
  return now - last >= reminderDays * DAY_MS;
}

export function isExpiringSoon(row, now) {
  const status = derivePreEntryStatus(row, now);
  if (status !== 'draft' && status !== 'contacted') return false;
  return daysLeft(row.expiresAtMs, now) <= EXPIRING_SOON_DAYS;
}

/** Published under "Dein Tribe", not taken over yet. */
export function isStillWithSystem(row) {
  return row?.status === 'published' && row?.event?.ownedBySystem === true;
}

/** Which template the contact dialog opens with. */
export function suggestedTemplate(row, settings, now) {
  if (row?.status === 'published') return 'published';
  if (isExpiringSoon(row, now) && (row?.contactAttempts?.length ?? 0) > 0) return 'expiring';
  if ((row?.contactAttempts?.length ?? 0) === 0) return 'initial';
  return 'reminder';
}

/** Link kind a template needs: the takeover link after publishing, else the preview. */
export function linkKindForTemplate(templateKey) {
  return templateKey === 'published' ? 'takeover' : 'preview';
}

/** Event was changed by the organizer after the takeover (the "wurde bearbeitet" hint). */
export function wasEditedAfterClaim(row) {
  const claimed = row?.claimedAtMs;
  const updated = row?.event?.updatedAtMs;
  return typeof claimed === 'number' && typeof updated === 'number' && updated > claimed + 5000;
}

// ── Preview page banner ──────────────────────────────────────────────────

/**
 * Banner on /vorschau: "Diese Vorschau ist noch 5 Tage gültig (bis 21.11.).
 * Danach wird der Entwurf gelöscht." From EXPIRING_SOON_DAYS on it is urgent.
 */
export function previewBanner(expiresAtMs, now) {
  if (typeof expiresAtMs !== 'number') return null;
  const left = daysLeft(expiresAtMs, now);
  const until = new Date(expiresAtMs).toLocaleDateString('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit',
    month: '2-digit',
  });
  if (expiresAtMs <= now) {
    return { expired: true, urgent: true, daysLeft: 0, text: 'Diese Vorschau ist abgelaufen.' };
  }
  const span = left === 1 ? 'noch 1 Tag' : `noch ${left} Tage`;
  return {
    expired: false,
    urgent: left <= EXPIRING_SOON_DAYS,
    daysLeft: left,
    text: `Diese Vorschau ist ${span} gültig (bis ${until}). Danach wird der Entwurf gelöscht.`,
  };
}

// ── Overview filters ─────────────────────────────────────────────────────

export const EMPTY_FILTERS = Object.freeze({
  status: '',
  moderator: '',
  from: '',
  to: '',
  mine: false,
  stillWithSystem: false,
  reminderOnly: false,
  search: '',
});

function searchText(row) {
  const c = row.contact ?? {};
  return [row.event?.title, c.name, c.contactPerson, c.organization, c.email, c.phone, c.other]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Filters the overview. `from` / `to` (YYYY-MM-DD) apply to the day the entry
 * was created (Vienna), `moderator` to the uid of the person who entered it.
 */
export function filterRows(rows, filters, { uid, now, settings }) {
  const f = { ...EMPTY_FILTERS, ...(filters ?? {}) };
  const needle = f.search.trim().toLowerCase();
  return (rows ?? []).filter((row) => {
    if (f.status && derivePreEntryStatus(row, now) !== f.status) return false;
    if (f.moderator && row.createdBy !== f.moderator) return false;
    if (f.mine && row.createdBy !== uid) return false;
    if (f.stillWithSystem && !isStillWithSystem(row)) return false;
    if (f.reminderOnly && !isReminderDue(row, settings, now)) return false;
    const day = new Date(row.createdAtMs).toLocaleDateString('sv-SE', {
      timeZone: 'Europe/Vienna',
    });
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (needle && !searchText(row).includes(needle)) return false;
    return true;
  });
}

export const SORT_OPTIONS = {
  created: 'Neueste zuerst',
  eventDate: 'Event-Datum',
  expires: 'Link läuft ab',
  status: 'Status',
};

export function sortRows(rows, sortKey, now) {
  const list = [...(rows ?? [])];
  const byNumber = (get) => (a, b) => (get(a) ?? Infinity) - (get(b) ?? Infinity);
  switch (sortKey) {
    case 'eventDate':
      return list.sort((a, b) => String(a.event?.date || '9').localeCompare(b.event?.date || '9'));
    case 'expires':
      return list.sort(byNumber((r) => r.expiresAtMs));
    case 'status':
      return list.sort(
        (a, b) =>
          DISPLAY_STATUSES.indexOf(derivePreEntryStatus(a, now)) -
          DISPLAY_STATUSES.indexOf(derivePreEntryStatus(b, now))
      );
    default:
      return list.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  }
}

/** Distinct moderators of the list for the filter: [{ uid, name }]. */
export function moderatorOptions(rows) {
  const seen = new Map();
  for (const row of rows ?? []) {
    if (row.createdBy && !seen.has(row.createdBy)) {
      seen.set(row.createdBy, row.createdByName || row.createdBy);
    }
  }
  return [...seen.entries()]
    .map(([uid, name]) => ({ uid, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// ── Contact form (wizard) ────────────────────────────────────────────────

export const EMPTY_CONTACT = Object.freeze({
  name: '',
  contactPerson: '',
  organization: '',
  email: '',
  phone: '',
  other: '',
});

export const CONTACT_LIMITS = Object.freeze({
  name: 120,
  contactPerson: 120,
  organization: 120,
  email: 200,
  phone: 40,
  other: 300,
});
export const NOTE_MAX = 2000;
export const COMMENT_MAX = 1000;

/** Field errors of the "Veranstalter-Kontakt" section ({} = valid). */
export function validateContact(contact) {
  const c = { ...EMPTY_CONTACT, ...(contact ?? {}) };
  const errors = {};
  const email = c.email.trim();
  const phone = c.phone.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Bitte gib eine gültige E-Mail-Adresse ein';
  }
  if (phone && !/^\+?[0-9 ()/.-]{5,40}$/.test(phone)) {
    errors.phone = 'Bitte gib eine gültige Telefonnummer ein';
  }
  if (!email && !phone && !c.other.trim()) {
    errors.contact = 'Bitte gib mindestens einen Kontaktweg an (E-Mail, Telefon oder anderes)';
  }
  return errors;
}

// ── Errors ───────────────────────────────────────────────────────────────

/** Plain German message for a failed preEntryAdmin / preEntryOrganizer call. */
export function preEntryErrorMessage(err) {
  const code = String(err?.code || '').replace(/^functions\//, '');
  const message = String(err?.message || '');
  switch (code) {
    case 'failed-precondition':
      if (/switched off/i.test(message)) return 'Diese Funktion ist gerade ausgeschaltet.';
      if (/expired/i.test(message)) return 'Dieser Link ist abgelaufen.';
      if (/revoked/i.test(message)) return 'Dieser Link wurde zurückgezogen.';
      if (/e-mail address/i.test(message))
        return 'Für diese Veranstalter:in ist keine E-Mail-Adresse hinterlegt.';
      return 'Das geht in diesem Zustand leider nicht (mehr). Bitte lade die Seite neu.';
    case 'already-exists':
      return 'Dieses Event ist bereits vorab eingetragen.';
    case 'invalid-argument':
      if (/confirm/i.test(message))
        return 'Bitte bestätige, dass du das Event veröffentlichen darfst.';
      if (/contact/i.test(message)) return 'Bitte prüfe die Kontaktdaten.';
      return 'Bitte prüfe deine Eingaben.';
    case 'not-found':
      return 'Diesen Eintrag gibt es nicht mehr.';
    case 'permission-denied':
      return 'Dafür fehlt dir die Berechtigung.';
    case 'unauthenticated':
      return 'Bitte melde dich zuerst an.';
    case 'resource-exhausted':
      return 'Zu viele Versuche. Bitte warte ein paar Minuten.';
    case 'unavailable':
      return 'Die E-Mail konnte nicht verschickt werden. Bitte versuche es später erneut.';
    default:
      return 'Das hat leider nicht geklappt. Bitte versuche es erneut.';
  }
}
