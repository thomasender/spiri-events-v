// Income/expense ledger (admin tab "Finanzen", collection `ledger`).
// Pure helpers, free of Firebase imports. `date` is a YYYY-MM-DD string and
// `amount` is always positive; `type` ('income' | 'expense') decides the sign.

export const LEDGER_TYPES = ['income', 'expense'];
export const DESCRIPTION_MAX = 200;
export const CATEGORY_MAX = 60;
export const NOTE_MAX = 500;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "12,50" / "1.234,50" / "12.5" -> 12.5, otherwise null. */
export function parseLedgerAmount(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.round(input * 100) / 100 : null;
  }
  let text = String(input ?? '')
    .trim()
    .replace(/\s|€/g, '');
  if (!text) return null;
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function isRealDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Validates form input; returns the fields to store. Throws a German message. */
export function validateLedgerFields(input) {
  if (!LEDGER_TYPES.includes(input.type)) {
    throw new Error('Bitte Einnahme oder Ausgabe wählen.');
  }
  const date = String(input.date ?? '');
  if (!isRealDate(date)) throw new Error('Bitte ein gültiges Datum wählen.');
  const amount = parseLedgerAmount(input.amount);
  if (amount === null || amount <= 0 || amount > 10_000_000) {
    throw new Error('Der Betrag muss größer als 0 sein, z. B. 12,50.');
  }
  const description = String(input.description ?? '').trim();
  if (!description) throw new Error('Bitte eine Beschreibung eingeben.');
  if (description.length > DESCRIPTION_MAX) {
    throw new Error(`Die Beschreibung darf höchstens ${DESCRIPTION_MAX} Zeichen lang sein.`);
  }
  const category = String(input.category ?? '').trim();
  if (category.length > CATEGORY_MAX) {
    throw new Error(`Die Kategorie darf höchstens ${CATEGORY_MAX} Zeichen lang sein.`);
  }
  const note = String(input.note ?? '').trim();
  if (note.length > NOTE_MAX) {
    throw new Error(`Die Notiz darf höchstens ${NOTE_MAX} Zeichen lang sein.`);
  }
  return {
    type: input.type,
    date,
    amount,
    description,
    category: category || null,
    note: note || null,
  };
}

/** Newest first; same day: newest created last-resort by id for a stable order. */
export function sortLedger(entries) {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
}

/** Years that have entries (newest first), always including `currentYear`. */
export function ledgerYears(entries, currentYear) {
  const years = new Set([String(currentYear)]);
  for (const e of entries) {
    if (typeof e.date === 'string' && DATE_PATTERN.test(e.date)) years.add(e.date.slice(0, 4));
  }
  return [...years].sort().reverse();
}

/** Entries of one year ('all' = no filter). */
export function entriesOfYear(entries, year) {
  if (year === 'all') return entries;
  return entries.filter((e) => typeof e.date === 'string' && e.date.startsWith(`${year}-`));
}

export function ledgerTotals(entries) {
  let income = 0;
  let expense = 0;
  for (const e of entries) {
    const cents = Math.round(Number(e.amount) * 100);
    if (!Number.isFinite(cents)) continue;
    if (e.type === 'income') income += cents;
    else if (e.type === 'expense') expense += cents;
  }
  return { income: income / 100, expense: expense / 100, balance: (income - expense) / 100 };
}

export function formatEuro(value) {
  return `${new Intl.NumberFormat('de-AT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}

/** "2026-10-29" -> "29.10.2026" */
export function formatLedgerDate(date) {
  if (!DATE_PATTERN.test(date ?? '')) return date ?? '';
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

function csvCell(value, { freeText = false } = {}) {
  const text = String(value ?? '');
  // Neutralise spreadsheet formulas typed into free-text fields.
  const safe = freeText && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// Byte order mark so German Excel opens the file as UTF-8.
const BOM = String.fromCharCode(0xfeff);

/** Semicolon CSV with comma decimals, opens correctly in German Excel. */
export function ledgerToCsv(entries) {
  const lines = [['Datum', 'Art', 'Betrag', 'Beschreibung', 'Kategorie', 'Notiz', 'Quelle']];
  for (const e of sortLedger(entries).reverse()) {
    const signed = e.type === 'expense' ? -e.amount : e.amount;
    lines.push([
      csvCell(formatLedgerDate(e.date)),
      csvCell(e.type === 'income' ? 'Einnahme' : 'Ausgabe'),
      csvCell(signed.toFixed(2).replace('.', ',')),
      csvCell(e.description, { freeText: true }),
      csvCell(e.category ?? '', { freeText: true }),
      csvCell(e.note ?? '', { freeText: true }),
      csvCell(e.source === 'mollie' ? 'Mollie' : 'manuell'),
    ]);
  }
  return `${BOM}${lines.map((r) => r.join(';')).join('\r\n')}`;
}
