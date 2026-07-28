export const findUniqueSlug = async (title, place, date) =>
  `${title.toLowerCase().replace(/\s+/g, '-')}-${place.toLowerCase().replace(/\s+/g, '-')}`;
