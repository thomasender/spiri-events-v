import { describe, expect, it } from 'vitest';
import {
  FAQ_DEFAULT_TOPIC,
  faqSlug,
  faqTopicSuggestions,
  filterFaqs,
  groupFaqsByTopic,
  moveFaqInTopic,
  moveFaqTopic,
  nextFaqOrder,
  validateFaqInput,
} from '../../src/utils/faqs';

const FAQS = [
  { id: 'e2', question: 'Kostet das Eintragen etwas?', topic: 'Events', order: 300 },
  { id: 'p1', question: 'Warum heißt die Plattform „dein tribe“?', topic: 'Plattform', order: 0 },
  { id: 'e1', question: 'Wer darf Events eintragen?', topic: 'Events', order: 100 },
  { id: 'g1', question: 'Gibt es eine App?', topic: '', order: 200 },
  { id: 'p2', question: 'Wer steht hinter dem tribe?', topic: 'Plattform', order: 400 },
];

describe('groupFaqsByTopic', () => {
  it('orders topics by their smallest order and entries inside by order', () => {
    const groups = groupFaqsByTopic(FAQS);
    expect(groups.map((g) => g.topic)).toEqual(['Plattform', 'Events', FAQ_DEFAULT_TOPIC]);
    expect(groups[0].items.map((f) => f.id)).toEqual(['p1', 'p2']);
    expect(groups[1].items.map((f) => f.id)).toEqual(['e1', 'e2']);
  });

  it('gives every topic and question a unique anchor', () => {
    const groups = groupFaqsByTopic([
      { id: 'a', question: 'Gibt es eine App?', topic: 'Über uns', order: 0 },
      { id: 'b', question: 'Gibt es eine App?', topic: 'Über uns', order: 1 },
    ]);
    expect(groups[0].anchor).toBe('thema-ueber-uns');
    expect(groups[0].items.map((f) => f.anchor)).toEqual([
      'frage-gibt-es-eine-app',
      'frage-gibt-es-eine-app-2',
    ]);
  });

  it('puts entries without a number last', () => {
    const groups = groupFaqsByTopic([
      { id: 'x', question: 'Ohne', topic: 'A' },
      { id: 'y', question: 'Mit', topic: 'B', order: 5 },
    ]);
    expect(groups.map((g) => g.topic)).toEqual(['B', 'A']);
  });
});

describe('faqSlug', () => {
  it('spells out umlauts and drops punctuation', () => {
    expect(faqSlug('Warum heißt die Plattform „dein tribe“?')).toBe(
      'warum-heisst-die-plattform-dein-tribe'
    );
    expect(faqSlug('???')).toBe('eintrag');
  });
});

describe('filterFaqs', () => {
  const items = [
    { id: '1', question: 'Wer darf Events eintragen?', answerHtml: '<p>Alle mit Konto.</p>' },
    {
      id: '2',
      question: 'Gibt es eine App?',
      answerHtml: '<p>Ja, über <strong>Teilen</strong>.</p>',
    },
  ];

  it('matches question and answer text, case-insensitive, every word', () => {
    expect(filterFaqs(items, 'events').map((f) => f.id)).toEqual(['1']);
    expect(filterFaqs(items, 'TEILEN').map((f) => f.id)).toEqual(['2']);
    expect(filterFaqs(items, 'app teilen').map((f) => f.id)).toEqual(['2']);
    expect(filterFaqs(items, 'app konto')).toEqual([]);
    expect(filterFaqs(items, '  ')).toHaveLength(2);
  });

  it('does not match inside HTML tags', () => {
    expect(filterFaqs(items, 'strong')).toEqual([]);
  });
});

describe('ordering helpers', () => {
  const groups = groupFaqsByTopic(FAQS);

  it('nextFaqOrder goes after the largest order', () => {
    expect(nextFaqOrder([])).toBe(0);
    expect(nextFaqOrder(FAQS)).toBe(500);
  });

  it('moves a question inside its topic only', () => {
    expect(moveFaqInTopic(groups, 'p2', 'up')).toEqual(['p2', 'p1', 'e1', 'e2', 'g1']);
    expect(moveFaqInTopic(groups, 'p1', 'up')).toBeNull();
    expect(moveFaqInTopic(groups, 'e2', 'down')).toBeNull();
  });

  it('moves a whole topic', () => {
    expect(moveFaqTopic(groups, 'Events', 'up')).toEqual(['e1', 'e2', 'p1', 'p2', 'g1']);
    expect(moveFaqTopic(groups, FAQ_DEFAULT_TOPIC, 'down')).toBeNull();
  });

  it('suggests the topics in use, sorted, without blanks', () => {
    expect(faqTopicSuggestions(FAQS)).toEqual(['Events', 'Plattform']);
  });
});

describe('validateFaqInput', () => {
  const ok = { question: ' Frage? ', answerHtml: '<p>Antwort</p>', topic: ' Thema ', published: 1 };

  it('trims and normalises', () => {
    expect(validateFaqInput(ok)).toEqual({
      question: 'Frage?',
      answerHtml: '<p>Antwort</p>',
      topic: 'Thema',
      published: true,
    });
  });

  it('rejects missing or too long fields', () => {
    expect(() => validateFaqInput({ ...ok, question: '  ' })).toThrow(/Frage/);
    expect(() => validateFaqInput({ ...ok, question: 'x'.repeat(201) })).toThrow(/200/);
    expect(() => validateFaqInput({ ...ok, answerHtml: '<p></p>' })).toThrow(/Antwort/);
    expect(() => validateFaqInput({ ...ok, topic: 'x'.repeat(61) })).toThrow(/60/);
    expect(() =>
      validateFaqInput({ ...ok, answerHtml: `<p>${'<strong>a</strong>'.repeat(700)}</p>` })
    ).toThrow(/zu lang/);
  });
});
