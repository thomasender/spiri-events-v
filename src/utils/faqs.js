// FAQ entries (`faqs/{id}`): pure helpers for the public /faq page and the
// admin tab "FAQ". Kept free of Firebase imports so they are unit-testable.
//
// Doc shape: { question, answerHtml, topic, order, published, createdAt,
// updatedAt, createdBy }. Limits mirror firestore.rules (match /faqs/{id}).
import { stripHtml } from './sanitize.js';

export const FAQ_QUESTION_MAX = 200;
export const FAQ_TOPIC_MAX = 60;
// Stored HTML (tags included); the editor counts plain text against FAQ_ANSWER_TEXT_MAX.
export const FAQ_ANSWER_HTML_MAX = 10000;
export const FAQ_ANSWER_TEXT_MAX = 5000;
export const FAQ_DEFAULT_TOPIC = 'Allgemein';
export const FAQ_ORDER_STEP = 100;

// Intro of the public page (Trello card "FAQ").
export const FAQ_INTRO =
  'Transparenz, Offenheit und ehrliche Kommunikation gehören zu unseren zentralen Werten. ' +
  'Deshalb möchten wir einen Raum schaffen, in dem wichtige Fragen und Antworten für alle ' +
  'zugänglich sind, unabhängig davon, wer die Frage ursprünglich gestellt hat. Denn oft ' +
  'beschäftigen dieselben Fragen mehr Menschen, als man denkt.';

const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** URL-safe piece for anchors (`#frage-…`, `#thema-…`): lower case, umlauts spelled out. */
export function faqSlug(text, max = 80) {
  const slug = String(text ?? '')
    .toLowerCase()
    .replace(/[äöüß]/g, (ch) => UMLAUTS[ch])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return slug || 'eintrag';
}

/** Topic a FAQ is shown under; an empty topic counts as "Allgemein". */
export function faqTopicLabel(faq) {
  const topic = typeof faq?.topic === 'string' ? faq.topic.trim() : '';
  return topic || FAQ_DEFAULT_TOPIC;
}

function orderOf(faq) {
  return typeof faq?.order === 'number' && Number.isFinite(faq.order) ? faq.order : Infinity;
}

function compareFaqs(a, b) {
  const diff = orderOf(a) - orderOf(b);
  if (diff !== 0 && !Number.isNaN(diff)) return diff;
  return String(a.question ?? '').localeCompare(String(b.question ?? ''), 'de');
}

/**
 * Groups FAQs by topic. Topics come in the order of their smallest `order`,
 * entries inside a topic by `order` (ties: alphabetical). Every entry gets a
 * unique `anchor` (`frage-<slug>`), every topic a unique `anchor` (`thema-<slug>`).
 * Returns [{ topic, anchor, items: [{ ...faq, anchor }] }].
 */
export function groupFaqsByTopic(faqs) {
  const sorted = [...(faqs ?? [])].sort(compareFaqs);
  const groups = new Map();
  for (const faq of sorted) {
    const topic = faqTopicLabel(faq);
    if (!groups.has(topic)) groups.set(topic, { topic, items: [], minOrder: orderOf(faq) });
    groups.get(topic).items.push(faq);
  }
  // Insertion order already follows the smallest order of each topic, because
  // the entries were sorted first; the explicit sort only breaks ties by name.
  const list = [...groups.values()].sort((a, b) => {
    const diff = a.minOrder - b.minOrder;
    if (diff !== 0 && !Number.isNaN(diff)) return diff;
    return a.topic.localeCompare(b.topic, 'de');
  });

  const usedFaqAnchors = new Set();
  const usedTopicAnchors = new Set();
  const unique = (base, used) => {
    let anchor = base;
    for (let n = 2; used.has(anchor); n += 1) anchor = `${base}-${n}`;
    used.add(anchor);
    return anchor;
  };
  return list.map(({ topic, items }) => ({
    topic,
    anchor: unique(`thema-${faqSlug(topic)}`, usedTopicAnchors),
    items: items.map((faq) => ({
      ...faq,
      anchor: unique(`frage-${faqSlug(faq.question)}`, usedFaqAnchors),
    })),
  }));
}

/** Case-insensitive search over question and answer text; every word has to match. */
export function filterFaqs(faqs, query) {
  const words = String(query ?? '')
    .toLocaleLowerCase('de')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return faqs ?? [];
  return (faqs ?? []).filter((faq) => {
    const haystack =
      `${faq.question ?? ''} ${stripHtml(faq.answerHtml ?? '')} ${faq.topic ?? ''}`.toLocaleLowerCase(
        'de'
      );
    return words.every((word) => haystack.includes(word));
  });
}

/** Topics already in use, for the suggestions of the topic field. */
export function faqTopicSuggestions(faqs) {
  const topics = new Set();
  for (const faq of faqs ?? []) {
    const topic = typeof faq.topic === 'string' ? faq.topic.trim() : '';
    if (topic) topics.add(topic);
  }
  return [...topics].sort((a, b) => a.localeCompare(b, 'de'));
}

/** `order` for a new entry: after every existing one. */
export function nextFaqOrder(faqs) {
  let max = -1;
  for (const faq of faqs ?? []) {
    if (typeof faq.order === 'number' && Number.isFinite(faq.order) && faq.order > max) {
      max = faq.order;
    }
  }
  return max < 0 ? 0 : Math.floor(max) + FAQ_ORDER_STEP;
}

/** Flat id list of grouped FAQs, in display order. */
export function faqIdsInOrder(groups) {
  return groups.flatMap((group) => group.items.map((faq) => faq.id));
}

/**
 * New flat id order after moving one entry up/down inside its topic, or null
 * when it is already at that end.
 */
export function moveFaqInTopic(groups, id, direction) {
  const next = groups.map((group) => ({ ...group, items: [...group.items] }));
  for (const group of next) {
    const idx = group.items.findIndex((faq) => faq.id === id);
    if (idx === -1) continue;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= group.items.length) return null;
    [group.items[idx], group.items[target]] = [group.items[target], group.items[idx]];
    return faqIdsInOrder(next);
  }
  return null;
}

/** New flat id order after moving a whole topic up/down, or null at the end. */
export function moveFaqTopic(groups, topic, direction) {
  const idx = groups.findIndex((group) => group.topic === topic);
  if (idx === -1) return null;
  const target = direction === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= groups.length) return null;
  const next = [...groups];
  [next[idx], next[target]] = [next[target], next[idx]];
  return faqIdsInOrder(next);
}

/**
 * Checks and normalises the editable fields. Returns { question, answerHtml,
 * topic, published } or throws an Error with a German message.
 */
export function validateFaqInput(input) {
  const question = String(input?.question ?? '').trim();
  if (!question) throw new Error('Bitte gib eine Frage ein.');
  if (question.length > FAQ_QUESTION_MAX) {
    throw new Error(`Die Frage darf höchstens ${FAQ_QUESTION_MAX} Zeichen lang sein.`);
  }
  const answerHtml = String(input?.answerHtml ?? '').trim();
  if (!stripHtml(answerHtml).trim()) throw new Error('Bitte gib eine Antwort ein.');
  if (stripHtml(answerHtml).length > FAQ_ANSWER_TEXT_MAX) {
    throw new Error(`Die Antwort darf höchstens ${FAQ_ANSWER_TEXT_MAX} Zeichen lang sein.`);
  }
  if (answerHtml.length > FAQ_ANSWER_HTML_MAX) {
    throw new Error('Die Antwort ist zu lang (zu viele Formatierungen oder Bilder). Bitte kürzen.');
  }
  const topic = String(input?.topic ?? '').trim();
  if (topic.length > FAQ_TOPIC_MAX) {
    throw new Error(`Das Thema darf höchstens ${FAQ_TOPIC_MAX} Zeichen lang sein.`);
  }
  return { question, answerHtml, topic, published: Boolean(input?.published) };
}
