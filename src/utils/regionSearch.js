// Text folding shared by the place search (utils/placeSearch.js) and the build script of the
// place list. Pure and free of Firebase and React.

/**
 * Case, accent and umlaut insensitive form used on both sides of the match:
 * "Zürich", "Zuerich" and "zurich" all become "zurich"; "ß" becomes "ss".
 */
export function foldSearchText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ae|oe|ue/g, (m) => m[0])
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
