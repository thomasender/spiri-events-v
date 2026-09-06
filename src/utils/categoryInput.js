export const MAX_CATEGORY_LENGTH = 40;
export const MIN_CATEGORY_LENGTH = 2;

export function normalizeCategoryInput(raw) {
  return (raw ?? '')
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

export function isValidCategoryInput(raw) {
  const n = normalizeCategoryInput(raw);
  return n.length >= MIN_CATEGORY_LENGTH && n.length <= MAX_CATEGORY_LENGTH;
}
