const STATUS_PRIORITY = { approved: 0, pending: 1, draft: 2 };

/**
 * Several events can share one slug (e.g. an abandoned draft and the
 * submission created from it). Pick the one that is actually "the" event:
 * approved before pending before draft, newest first within a status.
 * @template {{ data: () => Record<string, any> }} T
 * @param {T[]} docs
 * @returns {T | null}
 */
export function pickEventDoc(docs) {
  if (!docs?.length) return null;
  const rank = (d) => STATUS_PRIORITY[d.data().status] ?? 3;
  const created = (d) => d.data().createdAt?.toMillis?.() ?? 0;
  return [...docs].sort((a, b) => rank(a) - rank(b) || created(b) - created(a))[0];
}
